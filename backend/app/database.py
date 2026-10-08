import sqlite3
import json
import datetime
from typing import Optional, List, Dict, Any
from pathlib import Path
from backend.app.config import DB_PATH

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    cursor = conn.cursor()

    # Users Table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_weekly_rp ON users(weekly_rp DESC);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_users_overall_elo ON users(overall_elo DESC);")

    # Questions Table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_questions_subj_chap ON questions(subject, chapter);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_questions_has_diagram ON questions(has_diagram);")

    # Migration check for existing databases
    cursor.execute("PRAGMA table_info(questions);")
    q_cols = [r["name"] for r in cursor.fetchall()]
    if "validation_status" not in q_cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN validation_status TEXT DEFAULT 'VALIDATED';")
    if "validation_flags" not in q_cols:
        cursor.execute("ALTER TABLE questions ADD COLUMN validation_flags TEXT DEFAULT '[]';")

    cursor.execute("CREATE INDEX IF NOT EXISTS idx_questions_val_status ON questions(validation_status);")

    # Quarantine Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS quarantine (
        id TEXT PRIMARY KEY,
        question_data TEXT,
        reason TEXT,
        created_at TEXT
    );
    """)

    # Rooms Table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rooms_code ON rooms(code);")

    # Safe column migrations for rooms
    room_columns_to_add = [
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
    cursor.execute("PRAGMA table_info(rooms);")
    existing_room_cols = {row[1] for row in cursor.fetchall()}
    for col_name, col_def in room_columns_to_add:
        if col_name not in existing_room_cols:
            try:
                cursor.execute(f"ALTER TABLE rooms ADD COLUMN {col_name} {col_def};")
            except Exception:
                pass

    # Safe column migrations for questions
    cursor.execute("PRAGMA table_info(questions);")
    existing_q_cols = {row[1] for row in cursor.fetchall()}
    if "target_exam" not in existing_q_cols:
        try:
            cursor.execute("ALTER TABLE questions ADD COLUMN target_exam TEXT DEFAULT 'MIXED';")
        except Exception:
            pass

    # Room Participants Table
    cursor.execute("""
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

    # Safe column migrations for room_participants
    cursor.execute("PRAGMA table_info(room_participants);")
    existing_part_cols = {row[1] for row in cursor.fetchall()}
    if "question_started_at" not in existing_part_cols:
        try:
            cursor.execute("ALTER TABLE room_participants ADD COLUMN question_started_at TEXT;")
        except Exception:
            pass

    # Attempt / Activity Log for Radars & History
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_log(user_id);")

    # Friends Table (Chess.com style)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS friends (
        user_id TEXT NOT NULL,
        friend_id TEXT NOT NULL,
        status TEXT DEFAULT 'ACCEPTED',
        created_at TEXT,
        PRIMARY KEY (user_id, friend_id)
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_friends_user ON friends(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_friends_friend ON friends(friend_id);")

    # Direct Challenges Table (Chess.com style 1-on-1 challenges)
    cursor.execute("""
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

    # Direct Messages & Chat Table (Chess.com style integrated friends messages)
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dm_users ON direct_messages(sender_id, receiver_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dm_receiver_read ON direct_messages(receiver_id, is_read);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_dm_created ON direct_messages(created_at DESC);")

    # Tournaments Table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_tournaments_status ON tournaments(status);")

    # Tournament Participants Table
    cursor.execute("""
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

    # Tournament Matches (1v1 Knockout or Group Match Nodes)
    cursor.execute("""
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
    # Adaptive Practice Sessions Table
    cursor.execute("""
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
        completed_at TEXT
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_adaptive_user ON adaptive_sessions(user_id, status);")

    # User Rank History Table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_rank_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        overall_elo REAL NOT NULL,
        predicted_air_bracket TEXT NOT NULL,
        created_at TEXT NOT NULL
    );
    """)
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_rank_history_user ON user_rank_history(user_id, created_at);")

    # Question Defect Reports & Human Moderation Table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reports_question ON question_reports(question_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_reports_status ON question_reports(status);")

    # In-App User Notifications Table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_notif_user ON user_notifications(user_id, is_read);")

    # System & Content Updates Table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_system_updates_created ON system_updates(created_at DESC);")

    # User System Update Reads Tracker
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS user_update_reads (
        user_id TEXT NOT NULL,
        update_id TEXT NOT NULL,
        read_at TEXT NOT NULL,
        PRIMARY KEY (user_id, update_id)
    );
    """)

    try:
        from backend.app.tools.system_updates_engine import seed_default_updates_if_needed
        seed_default_updates_if_needed(cursor)
    except Exception:
        pass

    # Safe migration for user profile customization columns
    for col, default_val in [
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
    ]:
        try:
            cursor.execute(f"ALTER TABLE users ADD COLUMN {col} {default_val};")
        except Exception:
            pass

    # Tournament 3-Player League & Points System Migrations
    for col, default_val in [
        ("series_cycles", "INTEGER DEFAULT 1"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE tournaments ADD COLUMN {col} {default_val};")
        except Exception:
            pass

    for col, default_val in [
        ("cycle_index", "INTEGER DEFAULT 1"),
        ("player1_marks", "REAL DEFAULT 0.0"),
        ("player2_marks", "REAL DEFAULT 0.0"),
        ("is_tiebreaker", "INTEGER DEFAULT 0"),
    ]:
        try:
            cursor.execute(f"ALTER TABLE tournament_matches ADD COLUMN {col} {default_val};")
        except Exception:
            pass

    # Question metadata migrations (source_book for Olympiad/Pathfinder tracking)
    try:
        cursor.execute("ALTER TABLE questions ADD COLUMN source_book TEXT;")
    except Exception:
        pass

    # User 59-Chapter Independent Elo Ratings Table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_chap_elo_user ON user_chapter_elo(user_id);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_user_chap_elo_chap ON user_chapter_elo(chapter);")

    # Implicit Hybrid Cognitive FSRS States Table
    cursor.execute("""
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
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fsrs_user_due ON user_fsrs_states(user_id, due_date);")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_fsrs_user_chap ON user_fsrs_states(user_id, chapter);")

    # Question Bookmarks Table (for Error Log Graveyard)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS question_bookmarks (
        user_id TEXT NOT NULL,
        question_id TEXT NOT NULL,
        notes TEXT DEFAULT '',
        created_at TEXT,
        PRIMARY KEY (user_id, question_id)
    );
    """)

    conn.commit()
    conn.close()


def get_user_by_username(username: str) -> Optional[dict]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE LOWER(username) = LOWER(?)", (username.strip(),))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None


def get_user_by_id(user_id: str) -> Optional[dict]:
    conn = get_connection()
    c = conn.cursor()
    c.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = c.fetchone()
    conn.close()
    return dict(row) if row else None
