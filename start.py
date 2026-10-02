import os
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

# Add project root to path
ROOT_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT_DIR))

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    host = os.environ.get("HOST", "0.0.0.0")

    print("\n" + "="*60)
    print("  [JEE RIVALS] COMPETITIVE MULTIPLAYER ARENA")
    print("="*60)
    print(f"  * Local Arena:     http://localhost:{port}")
    print(f"  * Network Arena:   http://0.0.0.0:{port}")
    print(f"  * API Docs:        http://localhost:{port}/docs")
    print("="*60 + "\n")

    uvicorn.run("backend.app.main:app", host=host, port=port, reload=False)
