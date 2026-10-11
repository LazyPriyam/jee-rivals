import threading
import time
import json
import logging
from typing import Optional, Dict, List, Any

logger = logging.getLogger("jee_rivals.question_cache")

_QUESTIONS_MAP: Optional[Dict[str, dict]] = None
_QUESTIONS_LIST: Optional[List[dict]] = None
_LAST_LOADED_TIME: float = 0.0
_CACHE_LOCK = threading.Lock()
_CACHE_TTL = 3600  # 1 hour TTL before soft refresh, or refreshed on demand


def get_all_questions_cached(cursor=None) -> List[dict]:
    """
    Returns all valid unquarantined questions from thread-safe in-memory cache.
    Loads once on startup or when cache expires, avoiding remote database network round-trips.
    """
    global _QUESTIONS_MAP, _QUESTIONS_LIST, _LAST_LOADED_TIME
    now = time.time()

    if _QUESTIONS_LIST is not None and (now - _LAST_LOADED_TIME) < _CACHE_TTL:
        return _QUESTIONS_LIST

    with _CACHE_LOCK:
        if _QUESTIONS_LIST is not None and (now - _LAST_LOADED_TIME) < _CACHE_TTL:
            return _QUESTIONS_LIST

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

            _QUESTIONS_MAP = q_map
            _QUESTIONS_LIST = q_list
            _LAST_LOADED_TIME = now
            logger.info(f"[QUESTION_CACHE] Loaded {len(q_list)} verified questions into hot in-memory cache.")
            return _QUESTIONS_LIST
        except Exception as e:
            logger.error(f"[QUESTION_CACHE] Error populating questions cache: {e}")
            if _QUESTIONS_LIST is not None:
                return _QUESTIONS_LIST
            return []
        finally:
            if should_close:
                try:
                    conn.close()
                except Exception:
                    pass


def get_question_cached(question_id: str, cursor=None) -> Optional[dict]:
    """Instant 0ms lookup of a question by ID from memory."""
    if not question_id:
        return None
    global _QUESTIONS_MAP
    if _QUESTIONS_MAP is None:
        get_all_questions_cached(cursor)
    if _QUESTIONS_MAP and str(question_id) in _QUESTIONS_MAP:
        return _QUESTIONS_MAP[str(question_id)]
    
    # Fallback to direct DB query if somehow not in bulk cache
    if cursor is not None:
        try:
            cursor.execute("SELECT * FROM questions WHERE id = ?", (question_id,))
            row = cursor.fetchone()
            if row:
                d = dict(row)
                if _QUESTIONS_MAP is not None:
                    _QUESTIONS_MAP[str(question_id)] = d
                return d
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
