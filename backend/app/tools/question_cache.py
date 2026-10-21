import threading
import time
import json
import logging
from typing import Optional, Dict, List, Any

logger = logging.getLogger("jee_rivals.question_cache")

_QUESTIONS_MAP: Dict[str, dict] = {}
_QUESTIONS_LIST: Optional[List[dict]] = None
_LAST_LOADED_TIME: float = 0.0
_IS_REFRESHING: bool = False
_IS_WARMED_UP: bool = False
_CACHE_LOCK = threading.RLock()
_CACHE_TTL = 3600  # 1 hour TTL before background soft refresh


def _load_questions_sync(cursor=None) -> List[dict]:
    """Helper that executes the database query and populates the cache."""
    global _QUESTIONS_MAP, _QUESTIONS_LIST, _LAST_LOADED_TIME, _IS_REFRESHING, _IS_WARMED_UP
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
            _QUESTIONS_MAP.update(q_map)
            _QUESTIONS_LIST = q_list
            _LAST_LOADED_TIME = now
            _IS_REFRESHING = False
            _IS_WARMED_UP = True

        logger.info(f"[QUESTION_CACHE] Hot RAM cache loaded with {len(q_list)} verified questions.")
        return q_list
    except Exception as e:
        logger.error(f"[QUESTION_CACHE] Error populating questions cache: {e}")
        with _CACHE_LOCK:
            _IS_REFRESHING = False
        if _QUESTIONS_LIST is not None:
            return _QUESTIONS_LIST
        return list(_QUESTIONS_MAP.values())
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
    global _QUESTIONS_LIST, _IS_WARMED_UP
    if _IS_WARMED_UP and _QUESTIONS_LIST is not None:
        return
    logger.info("[QUESTION_CACHE] Warming up verified question bank in background...")
    _load_questions_sync()


def get_questions_cached_batch(question_ids: List[str], cursor=None) -> Dict[str, dict]:
    """
    High-performance batch retrieval of questions by ID.
    1. Checks RAM hot cache (_QUESTIONS_MAP) for all requested IDs in 0ms.
    2. Any cache misses are fetched from the database in a SINGLE batch SQL query:
       SELECT * FROM questions WHERE id IN (?, ?, ...)
    3. Fetched rows are immediately stored into _QUESTIONS_MAP.
    4. Eliminates the N sequential network round-trips over Turso Cloud.
    """
    if not question_ids:
        return {}

    clean_ids = [str(qid).strip() for qid in question_ids if qid and str(qid).strip()]
    if not clean_ids:
        return {}

    result: Dict[str, dict] = {}
    missing_ids: List[str] = []

    with _CACHE_LOCK:
        for qid in clean_ids:
            if qid in _QUESTIONS_MAP:
                result[qid] = _QUESTIONS_MAP[qid]
            else:
                missing_ids.append(qid)

    if not missing_ids:
        return result

    # Fetch missing questions in chunks of 150 to stay safely under SQLite parameter limits
    should_close = False
    c = cursor
    if c is None:
        from backend.app.database import get_connection
        conn = get_connection()
        c = conn.cursor()
        should_close = True

    try:
        chunk_size = 150
        for i in range(0, len(missing_ids), chunk_size):
            chunk = missing_ids[i:i + chunk_size]
            placeholders = ",".join(["?"] * len(chunk))
            c.execute(f"SELECT * FROM questions WHERE id IN ({placeholders})", chunk)
            rows = c.fetchall()
            with _CACHE_LOCK:
                for r in rows:
                    d = dict(r)
                    qid_str = str(d["id"])
                    _QUESTIONS_MAP[qid_str] = d
                    result[qid_str] = d
                    if _QUESTIONS_LIST is not None and not any(str(x.get("id")) == qid_str for x in _QUESTIONS_LIST):
                        _QUESTIONS_LIST.append(d)
    except Exception as e:
        logger.error(f"[QUESTION_CACHE] Error batch fetching {len(missing_ids)} questions: {e}")
    finally:
        if should_close:
            try:
                conn.close()
            except Exception:
                pass

    return result


def get_question_cached(question_id: str, cursor=None) -> Optional[dict]:
    """
    Instant 0ms lookup of a question by ID from memory.
    If full cache is still loading on startup, fetches via fast batch loader and caches immediately.
    """
    if not question_id:
        return None
    qid_str = str(question_id).strip()

    with _CACHE_LOCK:
        if qid_str in _QUESTIONS_MAP:
            return _QUESTIONS_MAP[qid_str]

    # Batch fetch the single ID and cache it in RAM
    batch = get_questions_cached_batch([qid_str], cursor=cursor)
    return batch.get(qid_str)


def update_cached_question_elo(question_id: str, new_elo: float):
    """Reflects question Elo changes in RAM immediately."""
    global _QUESTIONS_MAP
    qid_str = str(question_id)
    with _CACHE_LOCK:
        if qid_str in _QUESTIONS_MAP:
            _QUESTIONS_MAP[qid_str]["elo_rating"] = float(new_elo)


def invalidate_question_cache():
    """Forces cache refresh on next request (e.g. after jee sync or question ingest)."""
    global _QUESTIONS_MAP, _QUESTIONS_LIST, _LAST_LOADED_TIME, _IS_WARMED_UP
    with _CACHE_LOCK:
        _QUESTIONS_MAP.clear()
        _QUESTIONS_LIST = None
        _LAST_LOADED_TIME = 0.0
        _IS_WARMED_UP = False
    logger.info("[QUESTION_CACHE] Cache invalidated.")
