import os
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.app.config import DIAGRAMS_DIR, BACKEND_DIR, STATIC_DIR
from backend.app.database import init_db
from backend.app.auth import decode_token, get_user_by_id
from backend.app.websockets.room_hub import room_hub

import asyncio
from backend.app.routes.auth import router as auth_router
from backend.app.routes.questions import router as questions_router
from backend.app.routes.rooms import router as rooms_router, clean_abandoned_rooms
from backend.app.routes.leaderboards import router as leaderboards_router
from backend.app.routes.sync import router as sync_router
from backend.app.routes.friends import router as friends_router
from backend.app.routes.tournaments import router as tournaments_router
from backend.app.routes.adaptive import router as adaptive_router
from backend.app.routes.updates import router as updates_router
from backend.app.routes.mastery import router as mastery_router

# Initialize Database
init_db()

app = FastAPI(
    title="JEE Rivals API",
    description="High-octane competitive multiplayer arena for JEE aspirants",
    version="1.0.0"
)

# Startup background cleaner for abandoned rooms
@app.on_event("startup")
async def start_periodic_room_cleanup():
    asyncio.create_task(run_abandoned_room_cleaner())

async def run_abandoned_room_cleaner():
    while True:
        try:
            clean_abandoned_rooms()
        except Exception:
            pass
        await asyncio.sleep(45)

# CORS Middleware (permits local dev, mobile access, and cloud deploys)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount Diagrams Static Directory
app.mount("/diagrams", StaticFiles(directory=str(DIAGRAMS_DIR)), name="diagrams")

# Register API Routers
app.include_router(auth_router)
app.include_router(questions_router)
app.include_router(rooms_router)
app.include_router(friends_router)
app.include_router(tournaments_router)
app.include_router(adaptive_router)
app.include_router(leaderboards_router)
app.include_router(sync_router)
app.include_router(updates_router)
app.include_router(mastery_router)


# WebSocket Endpoint for Live Rooms
@app.websocket("/ws/rooms/{code}")
async def websocket_room_endpoint(websocket: WebSocket, code: str, token: str = Query(None)):
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    payload = decode_token(token)
    if not payload or "sub" not in payload:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    user = get_user_by_id(payload["sub"])
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    room_code = code.upper()
    await room_hub.connect(room_code, user["id"], websocket)

    try:
        while True:
            # Keep-alive or client-side events
            data = await websocket.receive_text()
            # If client sends a ping, reply with pong
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        room_hub.disconnect(room_code, user["id"])
    except Exception:
        room_hub.disconnect(room_code, user["id"])


# Frontend Distribution Static Mount (Single-Service Cloud Deployment)
FRONTEND_DIST = BACKEND_DIR.parent / "frontend" / "dist"

if FRONTEND_DIST.exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")
else:
    @app.get("/")
    def root():
        return {
            "app": "JEE Rivals API",
            "status": "Online",
            "message": "Backend active. Frontend dist will be served here once built."
        }
