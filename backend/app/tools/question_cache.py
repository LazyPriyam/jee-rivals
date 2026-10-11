import threading
import time
import json
import logging
from typing import Optional, Dict, List, Any

logger = logging.getLogger("jee_rivals.question_cache")

_QUESTIONS_MAP: Optional[Dict[str, dict]] = None
_QUESTIONS_LIST: Optional[List[dict]] = None
_LAST_LOADED_TIME: float = 0.0
_IS_REFRESHING: bool = False
_CACHE_LOCK = threading.RLock()
_CACHE_TTL = 3600  # 1 hour TTL before background soft refresh


def _load_questions_sync(cursor=None) -> List[dict]:
    """Helper that executes the database query and populates the cache."""
    global _QUESTIONS_MAP, _QUESTIONS_LIST, _LAST_LOADED_TIME, _IS_REFRESHING
    now = time.time()
    should_close = False
    c = cursor
    if c is None:
        from backend.app.database import get_connection
        conn = get_connection()
        c = conn.cursor()
        should_close = True

    try:
        c.execute("""
            SELECT * FROM questions
            WHERE (validation_status IS NULL OR validation_status NOT IN ('QUARANTINED', 'SUPERSEDED_BY_SUBQUESTIONS'))
              AND text IS NOT NULL AND text != ''
        """)
        raw_rows = c.fetchall()
        q_map = {}
        q_list = []
        for r in raw_rows:
            d = dict(r)
            q_id = str(d["id"])
            q_map[q_id] = d
            q_list.append(d)

        with _CACHE_LOCK:
            _QUESTIONS_MAP = q_map
            _QUESTIONS_LIST = q_list
            _LAST_LOADED_TIME = now
            _IS_REFRESHING = False

        logger.info(f"[QUESTION_CACHE] Hot RAM cache loaded with {len(q_list)} verified questions.")
        return q_list
    except Exception as e:
        logger.error(f"[QUESTION_CACHE] Error populating questions cache: {e}")
        with _CACHE_LOCK:
            _IS_REFRESHING = False
        if _QUESTIONS_LIST is not None:
            return _QUESTIONS_LIST
        return []
    finally:
        if should_close:
            try:
                conn.close()
            except Exception:
                pass


def get_all_questions_cached(cursor=None) -> List[dict]:
    """
    Returns all valid unquarantined questions from thread-safe in-memory cache.
    Uses Stale-While-Revalidate: if cache is populated, returns immediately in 0ms
    and refreshes asynchronously in the background when TTL expires.
    """
    global _QUESTIONS_MAP, _QUESTIONS_LIST, _LAST_LOADED_TIME, _IS_REFRESHING
    now = time.time()

    # Fast path: cache is fresh
    if _QUESTIONS_LIST is not None and (now - _LAST_LOADED_TIME) < _CACHE_TTL:
        return _QUESTIONS_LIST

    # Stale-While-Revalidate: return stale list immediately and refresh in background
    if _QUESTIONS_LIST is not None:
        with _CACHE_LOCK:
            if not _IS_REFRESHING:
                _IS_REFRESHING = True
                threading.Thread(target=_load_questions_sync, daemon=True, name="QuestionCacheRefresher").start()
        return _QUESTIONS_LIST

    # Cold start: must load synchronously for the very first caller
    with _CACHE_LOCK:
        if _QUESTIONS_LIST is not None:
            return _QUESTIONS_LIST
        return _load_questions_sync(cursor)


def warmup_question_cache():
    """Proactively warms up the question cache in a background worker on server startup."""
    global _QUESTIONS_LIST
    if _QUESTIONS_LIST is not None:
        return
    logger.info("[QUESTION_CACHE] Warming up verified question bank in background...")
    _load_questions_sync()


def get_question_cached(question_id: str, cursor=None) -> Optional[dict]:
    """
    Instant 0ms lookup of a question by ID from memory.
    If full cache is still loading on startup, fetches ONLY the single row
    rather than blocking on the entire 6,600+ questions table.
    """
    if not question_id:
        return None
    global _QUESTIONS_MAP
    qid_str = str(question_id)

    if _QUESTIONS_MAP and qid_str in _QUESTIONS_MAP:
        return _QUESTIONS_MAP[qid_str]

    # If full bank is not in RAM yet, schedule warmup in background and do a fast single-row query
    if _QUESTIONS_MAP is None:
        threading.Thread(target=get_all_questions_cached, daemon=True, name="QuestionCacheWarmup").start()

    # Fallback to direct single-question DB query without blocking on full bank
    should_close = False
    c = cursor
    if c is None:
        from backend.app.database import get_connection
        conn = get_connection()
        c = conn.cursor()
        should_close = True

    try:
        c.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
        row = c.fetchone()
        if row:
            d = dict(row)
            if _QUESTIONS_MAP is not None:
                _QUESTIONS_MAP[qid_str] = d
            return d
    except Exception as e:
        logger.error(f"[QUESTION_CACHE] Error fetching single question {question_id}: {e}")
    finally:
        if should_close:
            try:
                conn.close()
            except Exception:
                pass

    return None


def update_cached_question_elo(question_id: str, new_elo: float):
    """Reflects question Elo changes in RAM immediately."""
    global _QUESTIONS_MAP
    if _QUESTIONS_MAP and str(question_id) in _QUESTIONS_MAP:
        _QUESTIONS_MAP[str(question_id)]["elo_rating"] = float(new_elo)


def invalidate_question_cache():
    """Forces cache refresh on next request (e.g. after jee sync or question ingest)."""
    global _QUESTIONS_MAP, _QUESTIONS_LIST, _LAST_LOADED_TIME
    with _CACHE_LOCK:
        _QUESTIONS_MAP = None
        _QUESTIONS_LIST = None
        _LAST_LOADED_TIME = 0.0
    logger.info("[QUESTION_CACHE] Cache invalidated.")
