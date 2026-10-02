import hashlib
import time
import jwt
from typing import Optional
from fastapi import HTTPException, Security, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from backend.app.config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES
from backend.app.database import get_user_by_id, get_user_by_username

security = HTTPBearer(auto_error=False)

def hash_pin(pin: str) -> str:
    """Hashes 4-6 digit PIN with internal salt."""
    salt = "jee_rivals_secure_salt_2026"
    return hashlib.sha256(f"{salt}_{pin.strip()}".encode("utf-8")).hexdigest()

def verify_pin(plain_pin: str, hashed_pin: str) -> bool:
    return hash_pin(plain_pin) == hashed_pin

def create_access_token(user_id: str, username: str) -> str:
    payload = {
        "sub": user_id,
        "username": username,
        "exp": int(time.time()) + (ACCESS_TOKEN_EXPIRE_MINUTES * 60)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except Exception:
        return None

def get_current_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in with your username and PIN."
        )
    payload = decode_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired session token."
        )
    user = get_user_by_id(payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found."
        )
    return user

def get_optional_user(credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)) -> Optional[dict]:
    if not credentials or not credentials.credentials:
        return None
    payload = decode_token(credentials.credentials)
    if not payload or "sub" not in payload:
        return None
    return get_user_by_id(payload["sub"])
