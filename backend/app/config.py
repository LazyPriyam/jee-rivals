import os
from pathlib import Path

# Paths
BACKEND_DIR = Path(__file__).resolve().parent.parent
STORAGE_DIR = BACKEND_DIR / "storage"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)

STATIC_DIR = BACKEND_DIR / "static"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

DIAGRAMS_DIR = STATIC_DIR / "diagrams"
DIAGRAMS_DIR.mkdir(parents=True, exist_ok=True)

DB_PATH = STORAGE_DIR / "rivals.db"

# Server & Security Settings
PORT = int(os.environ.get("PORT", 8000))
HOST = os.environ.get("HOST", "0.0.0.0")
SECRET_KEY = os.environ.get("SECRET_KEY", "jee_rivals_super_secret_jwt_key_2026")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 365  # 1 year session for remember me persistence

# Admin Token for Local-to-Cloud Sync
ADMIN_SYNC_TOKEN = os.environ.get("ADMIN_SYNC_TOKEN", "rivals_sync_admin_key_jee2026")

# Turso Cloud SQLite Configuration (Persistent Cloud Database)
TURSO_DATABASE_URL = os.environ.get("TURSO_DATABASE_URL", "").strip()
TURSO_AUTH_TOKEN = os.environ.get("TURSO_AUTH_TOKEN", "").strip()
