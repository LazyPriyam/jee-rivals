import asyncio
import json
from typing import Dict, Set, Any, Optional
from fastapi import WebSocket

class RoomConnectionHub:
    def __init__(self):
        # room_code -> dict of user_id -> WebSocket
        self.active_rooms: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, room_code: str, user_id: str, websocket: WebSocket):
        await websocket.accept()
        code = room_code.upper()
        if code not in self.active_rooms:
            self.active_rooms[code] = {}
        self.active_rooms[code][user_id] = websocket

    def disconnect(self, room_code: str, user_id: str):
        code = room_code.upper()
        if code in self.active_rooms and user_id in self.active_rooms[code]:
            del self.active_rooms[code][user_id]
            if not self.active_rooms[code]:
                del self.active_rooms[code]

    async def broadcast_to_room(self, room_code: str, event_type: str, data: Any):
        code = room_code.upper()
        if code not in self.active_rooms:
            return

        message = json.dumps({"event": event_type, "data": data})
        stale_users = []
        for uid, ws in self.active_rooms[code].items():
            try:
                await ws.send_text(message)
            except Exception:
                stale_users.append(uid)

        for uid in stale_users:
            self.disconnect(code, uid)

    async def broadcast_to_all(self, event_type: str, data: Any):
        """Broadcasts an event to all connected users across all rooms."""
        message = json.dumps({"event": event_type, "data": data})
        for code, users in list(self.active_rooms.items()):
            for uid, ws in list(users.items()):
                try:
                    await ws.send_text(message)
                except Exception:
                    pass

    def is_user_online(self, user_id: str, last_active_str: Optional[str] = None) -> bool:
        """Determines if a candidate is currently active via active websocket or recent heartbeat."""
        if not user_id:
            return False
        # 1. Check live WebSocket session
        for room_users in self.active_rooms.values():
            if user_id in room_users:
                return True
        # 2. Check recent last_active timestamp within 180 seconds (3 mins)
        if last_active_str:
            try:
                import datetime
                clean_str = str(last_active_str).replace("Z", "+00:00")
                last_dt = datetime.datetime.fromisoformat(clean_str)
                if last_dt.tzinfo is None:
                    last_dt = last_dt.replace(tzinfo=datetime.timezone.utc)
                now_dt = datetime.datetime.now(datetime.timezone.utc)
                return (now_dt - last_dt).total_seconds() < 180
            except Exception:
                pass
        return False

room_hub = RoomConnectionHub()
