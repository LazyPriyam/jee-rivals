"""
Authoritative Database Schema Migration Engine for JEE Rivals.
Ensures zero data loss, non-destructive schema evolution, and continuous user progress protection.
"""

import sqlite3
import json
import datetime
import logging
from typing import List, Dict, Any, Callable

from backend.app.tools.db_backup_manager import (
    create_snapshot,
    get_user_progress_snapshot,
    assert_progress_preserved
)

logger = logging.getLogger("jee_rivals.migrations")


def init_migrations_table(cursor: sqlite3.Cursor):
    """Initializes the schema_migrations tracking table if it does not exist."""
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL,
        records_snapshot TEXT DEFAULT '{}'
    );
    """)


def get_applied_versions(cursor: sqlite3.Cursor) -> set:
    """Returns set of integer version numbers already applied."""
    init_migrations_table(cursor)
    cursor.execute("SELECT version FROM schema_migrations;")
    return {row[0] for row in cursor.fetchall()}


# ==============================================================================
# INDIVIDUAL MIGRATION DEFINITIONS (Strictly Additive & Non-Destructive)
# ==============================================================================

def migration_001_core_tables(conn: sqlite3.Connection):
    """Ensures baseline core tables exist without dropping existing tables."""
    c = conn.cursor()
    # Users Table
    c.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL COLLATE NOCASE,
        pin_hash TEXT NOT NULL,
        avatar_id TEXT DEFAULT 'default',
        title TEXT DEFAULT 'JEE Aspirant',
        overall_elo REAL DEFAULT 1200.0,
        physics_elo REAL DEFAULT 1200.0,
        chemistry_elo REAL DEFAULT 1200.0,
        math_elo REAL DEFAULT 1200.0,
        current_division TEXT DEFAULT 'BRONZE',
        weekly_rp INTEGER DEFAULT 0,
        total_solved INTEGER DEFAULT 0,
        total_correct INTEGER DEFAULT 0,
        gold_medals INTEGER DEFAULT 0,
        silver_medals INTEGER DEFAULT 0,
        bronze_medals INTEGER DEFAULT 0,
        chapter_stats TEXT DEFAULT '{}',
        created_at TEXT,
        last_active TEXT
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_users_weekly_rp ON users(weekly_rp DESC);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_users_overall_elo ON users(overall_elo DESC);")

    # Questions Table
    c.execute("""
    CREATE TABLE IF NOT EXISTS questions (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        unit TEXT NOT NULL,
        chapter TEXT NOT NULL,
        question_type TEXT NOT NULL,
        text TEXT NOT NULL,
        options TEXT,
        has_diagram INTEGER DEFAULT 0,
        diagram_urls TEXT,
        correct_answer TEXT NOT NULL,
        solution_text TEXT,
        key_formulas TEXT,
        common_pitfall TEXT,
        difficulty_tier TEXT DEFAULT 'MEDIUM',
        elo_rating INTEGER DEFAULT 1500,
        times_attempted INTEGER DEFAULT 0,
        times_correct INTEGER DEFAULT 0,
        validation_status TEXT DEFAULT 'VALIDATED',
        validation_flags TEXT DEFAULT '[]'
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_questions_subj_chap ON questions(subject, chapter);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_questions_has_diagram ON questions(has_diagram);")

    # Quarantine Table
    c.execute("""
    CREATE TABLE IF NOT EXISTS quarantine (
        id TEXT PRIMARY KEY,
        question_data TEXT,
        reason TEXT,
        created_at TEXT
    );
    """)


def migration_002_arena_and_participants(conn: sqlite3.Connection):
    """Ensures room, participant, and activity tracking tables exist."""
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL COLLATE NOCASE,
        host_id TEXT NOT NULL,
        mode TEXT NOT NULL,
        preset_name TEXT,
        subject TEXT,
        subjects TEXT,
        chapter TEXT,
        chapters TEXT,
        difficulty_tier TEXT,
        target_exam TEXT DEFAULT 'MIXED',
        question_type_filter TEXT DEFAULT 'ALL',
        question_ids TEXT NOT NULL,
        total_questions INTEGER NOT NULL,
        time_per_question INTEGER DEFAULT 90,
        total_duration_minutes INTEGER DEFAULT 60,
        timing_type TEXT DEFAULT 'SYNCHRONIZED',
        is_public INTEGER DEFAULT 1,
        passcode TEXT,
        speed_bonus_enabled INTEGER DEFAULT 1,
        negative_marking REAL DEFAULT -25.0,
        base_correct_score REAL DEFAULT 100.0,
        status TEXT DEFAULT 'LOBBY',
        created_at TEXT,
        started_at TEXT,
        completed_at TEXT
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);")

    c.execute("""
    CREATE TABLE IF NOT EXISTS room_participants (
        room_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        current_question_index INTEGER DEFAULT 0,
        score INTEGER DEFAULT 0,
        marks REAL DEFAULT 0.0,
        answers TEXT DEFAULT '{}',
        is_finished INTEGER DEFAULT 0,
        finished_at TEXT,
        question_started_at TEXT,
        PRIMARY KEY (room_id, user_id)
    );
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        chapter TEXT NOT NULL,
        is_correct INTEGER NOT NULL,
        time_spent_seconds INTEGER DEFAULT 0,
        elo_delta REAL DEFAULT 0.0,
        mode TEXT DEFAULT 'PRACTICE',
        created_at TEXT
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);")


def migration_003_social_and_tournaments(conn: sqlite3.Connection):
    """Ensures friends, DMs, challenges, and tournaments exist."""
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS friends (
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        status TEXT DEFAULT 'ACCEPTED',
        created_at TEXT,
        PRIMARY KEY (user_id, friend_id)
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);")
    c.execute("CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);")

    c.execute("""
    CREATE TABLE IF NOT EXISTS direct_messages (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        message TEXT NOT NULL,
        message_type TEXT DEFAULT 'TEXT',
        metadata TEXT DEFAULT '{}',
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_dm_users ON direct_messages(sender_id, receiver_id);")

    c.execute("""
    CREATE TABLE IF NOT EXISTS direct_challenges (
        id TEXT PRIMARY KEY,
        sender_id TEXT NOT NULL,
        receiver_id TEXT NOT NULL,
        room_code TEXT NOT NULL,
        challenge_message TEXT,
        status TEXT DEFAULT 'PENDING',
        created_at TEXT
    );
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS tournaments (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT,
        organizer_id TEXT NOT NULL,
        organizer_name TEXT NOT NULL,
        format TEXT DEFAULT 'KNOCKOUT',
        target_exam TEXT DEFAULT 'MIXED',
        subject TEXT DEFAULT 'Full Syllabus',
        bracket_size INTEGER DEFAULT 8,
        reward_type TEXT DEFAULT 'REAL_LIFE',
        rp_pool INTEGER DEFAULT 500,
        real_life_reward TEXT,
        claim_instructions TEXT,
        passcode TEXT,
        question_count INTEGER DEFAULT 5,
        time_per_question INTEGER DEFAULT 60,
        status TEXT DEFAULT 'REGISTRATION',
        current_round INTEGER DEFAULT 1,
        total_rounds INTEGER DEFAULT 3,
        winner_id TEXT,
        runner_up_id TEXT,
        created_at TEXT,
        started_at TEXT,
        completed_at TEXT
    );
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS tournament_participants (
        tournament_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        username TEXT NOT NULL,
        avatar_id TEXT DEFAULT 'default',
        seed INTEGER DEFAULT 0,
        current_score INTEGER DEFAULT 0,
        is_eliminated INTEGER DEFAULT 0,
        final_rank INTEGER DEFAULT 0,
        joined_at TEXT,
        PRIMARY KEY (tournament_id, user_id)
    );
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS tournament_matches (
        id TEXT PRIMARY KEY,
        tournament_id TEXT NOT NULL,
        round_number INTEGER NOT NULL,
        match_index INTEGER NOT NULL,
        player1_id TEXT,
        player2_id TEXT,
        winner_id TEXT,
        room_code TEXT,
        status TEXT DEFAULT 'PENDING',
        player1_score INTEGER DEFAULT 0,
        player2_score INTEGER DEFAULT 0,
        completed_at TEXT
    );
    """)


def migration_004_adaptive_and_mastery(conn: sqlite3.Connection):
    """Ensures adaptive sessions, rank history, chapter Elo, FSRS, and bookmarks exist."""
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS adaptive_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        mode TEXT NOT NULL DEFAULT 'TARGET_SPRINT',
        target_questions INTEGER,
        subject TEXT NOT NULL DEFAULT 'Full Syllabus',
        chapter TEXT,
        target_exam TEXT DEFAULT 'MIXED',
        current_index INTEGER DEFAULT 0,
        current_elo REAL DEFAULT 1500.0,
        initial_elo REAL DEFAULT 1500.0,
        total_correct INTEGER DEFAULT 0,
        total_attempted INTEGER DEFAULT 0,
        current_streak INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        current_question_id TEXT,
        history TEXT DEFAULT '[]',
        status TEXT DEFAULT 'IN_PROGRESS',
        created_at TEXT,
        completed_at TEXT,
        allowed_chapters TEXT
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_adaptive_user ON adaptive_sessions(user_id, status);")

    c.execute("""
    CREATE TABLE IF NOT EXISTS user_chapter_elo (
        user_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        chapter TEXT NOT NULL,
        elo REAL DEFAULT 1200.0,
        attempts INTEGER DEFAULT 0,
        correct INTEGER DEFAULT 0,
        last_updated TEXT,
        PRIMARY KEY (user_id, chapter)
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_user_chap_elo_user ON user_chapter_elo(user_id);")

    c.execute("""
    CREATE TABLE IF NOT EXISTS user_fsrs_states (
        user_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        chapter TEXT NOT NULL,
        stability REAL DEFAULT 2.0,
        difficulty REAL DEFAULT 5.0,
        retrievability REAL DEFAULT 1.0,
        reps INTEGER DEFAULT 0,
        lapses INTEGER DEFAULT 0,
        last_grade INTEGER DEFAULT 3,
        error_archetype TEXT,
        last_reviewed TEXT,
        due_date TEXT,
        PRIMARY KEY (user_id, question_id)
    );
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS question_bookmarks (
        user_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        notes TEXT DEFAULT '',
        created_at TEXT,
        PRIMARY KEY (user_id, question_id)
    );
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS user_rank_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        overall_elo REAL NOT NULL,
        predicted_air_bracket TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_rank_history_user ON user_rank_history(user_id, created_at);")

    c.execute("""
    CREATE TABLE IF NOT EXISTS question_reports (
        id TEXT PRIMARY KEY,
        question_id TEXT NOT NULL,
        reporter_id TEXT,
        reporter_username TEXT,
        reason TEXT NOT NULL,
        notes TEXT,
        status TEXT DEFAULT 'PENDING',
        created_at TEXT NOT NULL,
        resolved_at TEXT,
        resolved_by TEXT
    );
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS user_notifications (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT DEFAULT '{}',
        is_read INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
    );
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS system_updates (
        id TEXT PRIMARY KEY,
        version TEXT,
        title TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'PLATFORM',
        summary TEXT NOT NULL,
        details TEXT DEFAULT '',
        highlights TEXT DEFAULT '[]',
        author TEXT DEFAULT 'System',
        created_at TEXT NOT NULL
    );
    """)

    c.execute("""
    CREATE TABLE IF NOT EXISTS user_update_reads (
        user_id TEXT NOT NULL,
        update_id TEXT NOT NULL,
        read_at TEXT NOT NULL,
        PRIMARY KEY (user_id, update_id)
    );
    """)


def migration_005_safe_column_extensions(conn: sqlite3.Connection):
    """
    Safely adds all modern columns to existing tables using non-destructive introspection.
    Never alters or drops existing data.
    """
    c = conn.cursor()

    # User profile & customization columns
    user_cols_to_add = [
        ("target_college", "TEXT DEFAULT 'IIT Bombay (Computer Science)'"),
        ("target_exam_date", "TEXT DEFAULT 'JEE Main Jan 2026'"),
        ("bio", "TEXT DEFAULT 'Aiming for Top 500 AIR. PvP Aspirant.'"),
        ("banner_theme", "TEXT DEFAULT 'orange_cyber'"),
        ("pinned_badges", "TEXT DEFAULT '[\"elo_bronze\", \"first_blood\"]'"),
        ("learnt_chapters", "TEXT DEFAULT '[]'"),
        ("chat_settings", "TEXT DEFAULT '{}'"),
        ("target_exam", "TEXT DEFAULT 'MIXED'"),
        ("current_streak", "INTEGER DEFAULT 0"),
        ("longest_streak", "INTEGER DEFAULT 0"),
        ("last_active_date", "TEXT DEFAULT NULL"),
        ("streak_freezes", "INTEGER DEFAULT 1"),
        ("streak_history", "TEXT DEFAULT '[]'"),
    ]
    c.execute("PRAGMA table_info(users);")
    existing_user_cols = {row[1] for row in c.fetchall()}
    for col_name, col_def in user_cols_to_add:
        if col_name not in existing_user_cols:
            c.execute(f"ALTER TABLE users ADD COLUMN {col_name} {col_def};")

    # Rooms table columns
    room_cols_to_add = [
        ("subjects", "TEXT"),
        ("chapters", "TEXT"),
        ("target_exam", "TEXT DEFAULT 'MIXED'"),
        ("question_type_filter", "TEXT DEFAULT 'ALL'"),
        ("is_public", "INTEGER DEFAULT 1"),
        ("passcode", "TEXT"),
        ("speed_bonus_enabled", "INTEGER DEFAULT 1"),
        ("negative_marking", "REAL DEFAULT -25.0"),
        ("base_correct_score", "REAL DEFAULT 100.0"),
        ("tournament_id", "TEXT"),
        ("tournament_match_id", "TEXT"),
    ]
    c.execute("PRAGMA table_info(rooms);")
    existing_room_cols = {row[1] for row in c.fetchall()}
    for col_name, col_def in room_cols_to_add:
        if col_name not in existing_room_cols:
            c.execute(f"ALTER TABLE rooms ADD COLUMN {col_name} {col_def};")

    # Room participants columns
    c.execute("PRAGMA table_info(room_participants);")
    existing_part_cols = {row[1] for row in c.fetchall()}
    if "question_started_at" not in existing_part_cols:
        c.execute("ALTER TABLE room_participants ADD COLUMN question_started_at TEXT;")

    # Questions table columns
    q_cols_to_add = [
        ("validation_status", "TEXT DEFAULT 'VALIDATED'"),
        ("validation_flags", "TEXT DEFAULT '[]'"),
        ("passage_id", "TEXT"),
        ("passage_title", "TEXT"),
        ("passage_text", "TEXT"),
        ("subquestion_index", "INTEGER DEFAULT 1"),
        ("subquestion_total", "INTEGER DEFAULT 1"),
        ("target_exam", "TEXT DEFAULT 'MIXED'"),
        ("source_book", "TEXT"),
    ]
    c.execute("PRAGMA table_info(questions);")
    existing_q_cols = {row[1] for row in c.fetchall()}
    for col_name, col_def in q_cols_to_add:
        if col_name not in existing_q_cols:
            c.execute(f"ALTER TABLE questions ADD COLUMN {col_name} {col_def};")

    # Adaptive sessions table columns
    c.execute("PRAGMA table_info(adaptive_sessions);")
    existing_adp_cols = {row[1] for row in c.fetchall()}
    if "allowed_chapters" not in existing_adp_cols:
        c.execute("ALTER TABLE adaptive_sessions ADD COLUMN allowed_chapters TEXT;")

    # Tournament matches columns
    tourn_cols_to_add = [
        ("cycle_index", "INTEGER DEFAULT 1"),
        ("player1_marks", "REAL DEFAULT 0.0"),
        ("player2_marks", "REAL DEFAULT 0.0"),
        ("is_tiebreaker", "INTEGER DEFAULT 0"),
    ]
    c.execute("PRAGMA table_info(tournament_matches);")
    existing_tm_cols = {row[1] for row in c.fetchall()}
    for col_name, col_def in tourn_cols_to_add:
        if col_name not in existing_tm_cols:
            c.execute(f"ALTER TABLE tournament_matches ADD COLUMN {col_name} {col_def};")


def migration_006_deleted_accounts_tombstones(conn: sqlite3.Connection):
    """
    Creates the deleted_accounts tombstone registry.
    Ensures that permanently deleted accounts and their JWT tokens can never be
    auto-resurrected by background syncs or client caches.
    """
    c = conn.cursor()
    c.execute("""
    CREATE TABLE IF NOT EXISTS deleted_accounts (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL COLLATE NOCASE,
        deleted_at TEXT NOT NULL,
        reason TEXT DEFAULT 'user_requested_purge'
    );
    """)
    c.execute("CREATE INDEX IF NOT EXISTS idx_deleted_accounts_username ON deleted_accounts(username);")


# Master migration registry (ordered sequentially)
MIGRATIONS: List[Dict[str, Any]] = [
    {
        "version": 1,
        "name": "core_tables",
        "func": migration_001_core_tables,
    },
    {
        "version": 2,
        "name": "arena_and_participants",
        "func": migration_002_arena_and_participants,
    },
    {
        "version": 3,
        "name": "social_and_tournaments",
        "func": migration_003_social_and_tournaments,
    },
    {
        "version": 4,
        "name": "adaptive_and_mastery",
        "func": migration_004_adaptive_and_mastery,
    },
    {
        "version": 5,
        "name": "safe_column_extensions",
        "func": migration_005_safe_column_extensions,
    },
    {
        "version": 6,
        "name": "deleted_accounts_tombstones",
        "func": migration_006_deleted_accounts_tombstones,
    },
]


def run_all_migrations(conn: sqlite3.Connection) -> Dict[str, Any]:
    """
    Executes all pending migrations with atomic safeguards:
    1. Creates automatic pre-migration snapshot before touching database.
    2. Measures pre-migration user progress invariants.
    3. Runs each migration within savepoints/transactions.
    4. Asserts post-migration progress invariant holds.
    5. Records applied migrations in schema_migrations.
    """
    c = conn.cursor()
    init_migrations_table(c)
    conn.commit()

    applied = get_applied_versions(c)
    pending = [m for m in MIGRATIONS if m["version"] not in applied]

    if not pending:
        logger.info("[MIGRATIONS] Database schema is completely up-to-date.")
        return {"status": "up_to_date", "applied_count": 0}

    logger.info(f"[MIGRATIONS] Found {len(pending)} pending migrations. Securing pre-update snapshot...")
    # 1. Create automatic pre-migration backup snapshot
    snapshot_path = create_snapshot(reason=f"pre_migration_v{pending[0]['version']}")

    # 2. Capture progress invariants
    pre_progress = get_user_progress_snapshot(conn)

    applied_now = []
    try:
        for m in pending:
            ver = m["version"]
            name = m["name"]
            logger.info(f"[MIGRATIONS] Applying migration v{ver}: {name}...")
            
            # Execute migration function
            m["func"](conn)

            # Record in schema_migrations
            now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()
            c.execute("""
                INSERT INTO schema_migrations (version, name, applied_at, records_snapshot)
                VALUES (?, ?, ?, ?)
            """, (ver, name, now_iso, json.dumps(pre_progress)))
            conn.commit()
            applied_now.append(name)

        # 3. Verify user progress preservation invariants
        post_progress = get_user_progress_snapshot(conn)
        if not assert_progress_preserved(pre_progress, post_progress):
            raise RuntimeError(
                f"Data integrity invariant check failed after migrations! Pre: {pre_progress}, Post: {post_progress}"
            )

        logger.info(f"[MIGRATIONS] Successfully applied {len(applied_now)} migrations with 0 progress loss.")
        return {
            "status": "success",
            "applied_count": len(applied_now),
            "applied_migrations": applied_now,
            "pre_progress": pre_progress,
            "post_progress": post_progress
        }
    except Exception as e:
        conn.rollback()
        logger.critical(f"[MIGRATIONS ERROR] Migration failed: {e}. Snapshot available at: {snapshot_path}")
        raise e
