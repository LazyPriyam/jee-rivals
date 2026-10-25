"""
Daily Assignments Router for JEE Rivals.
Exclusively rolled out for LazyPriyam.
Quarantined and invisible: returns 404 Not Found for any other user.
"""

import logging
from typing import Optional, Dict, Any
from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, status, Query

from backend.app.auth import get_current_user
from backend.app.database import get_connection
from backend.app.tools.assignment_engine import (
    generate_daily_assignment,
    get_active_or_latest_assignment,
    get_assignment_by_id,
    submit_question_reflection,
    complete_assignment,
    get_assignment_history,
    get_assignment_insights,
)

logger = logging.getLogger("jee_rivals.assignments")

router = APIRouter(
    prefix="/api/assignments",
    tags=["assignments"]
)


def verify_lazypriyam(user: dict = Depends(get_current_user)) -> dict:
    """
    Stealth Gate: Strictly restricts access to LazyPriyam.
    Returns 404 Not Found for any other user so no one can infer the endpoint exists.
    """
    username = str(user.get("username") or "").strip().lower()
    if username != "lazypriyam":
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Not Found"
        )
    return user


class GenerateAssignmentRequest(BaseModel):
    batch_type: Optional[str] = "DAILY"  # 'DAILY' or 'WEEKEND'
    force_new: Optional[bool] = False
    learnt_chapters: Optional[list] = None


class ReflectionSubmissionRequest(BaseModel):
    reflection_tag: Optional[str] = None  # 'BREAKTHROUGH', 'DEEP_DERIVATION', 'HINT_CONSULTED', 'CONCEPT_TRAP'
    self_rating: Optional[str] = None     # 'CLEAN', 'PARTIAL', 'SOLUTION_NEEDED'
    user_answer: Optional[str] = None
    scratchpad_notes: Optional[str] = ""
    time_spent_seconds: Optional[int] = 0


@router.get("/active")
def get_active_assignment_route(user: dict = Depends(verify_lazypriyam)):
    """Fetches the active in-progress assignment or latest assignment for LazyPriyam."""
    conn = get_connection()
    try:
        data = get_active_or_latest_assignment(conn, user["id"])
        if not data:
            return {"success": True, "assignment": None}
        return data
    finally:
        conn.close()


@router.post("/generate")
def generate_assignment_route(
    req: GenerateAssignmentRequest,
    user: dict = Depends(verify_lazypriyam)
):
    """Generates a new Daily Elite Capsule or Weekend Titan Sheet from learnt chapters."""
    conn = get_connection()
    try:
        result = generate_daily_assignment(
            conn=conn,
            user=user,
            batch_type=req.batch_type or "DAILY",
            force_new=bool(req.force_new),
            learnt_chapters_override=req.learnt_chapters
        )
        return result
    finally:
        conn.close()


@router.get("/history")
def get_history_route(
    limit: int = Query(20, ge=1, le=100),
    user: dict = Depends(verify_lazypriyam)
):
    """Retrieves assignment completion history."""
    conn = get_connection()
    try:
        history = get_assignment_history(conn, user["id"], limit=limit)
        return {"success": True, "history": history}
    finally:
        conn.close()


@router.get("/insights")
def get_insights_route(user: dict = Depends(verify_lazypriyam)):
    """Computes cognitive struggle analytics and flags vulnerable trap chapters."""
    conn = get_connection()
    try:
        insights = get_assignment_insights(conn, user["id"])
        return {"success": True, "insights": insights}
    finally:
        conn.close()


@router.get("/{assignment_id}")
def get_assignment_route(
    assignment_id: str,
    user: dict = Depends(verify_lazypriyam)
):
    """Retrieves a specific assignment by ID."""
    conn = get_connection()
    try:
        data = get_assignment_by_id(conn, user["id"], assignment_id)
        if not data:
            raise HTTPException(status_code=404, detail="Assignment not found")
        return data
    finally:
        conn.close()


@router.post("/{assignment_id}/reflect/{question_id}")
def submit_reflection_route(
    assignment_id: str,
    question_id: str,
    req: ReflectionSubmissionRequest,
    user: dict = Depends(verify_lazypriyam)
):
    """Submits or updates cognitive scratchpad notes, 4-tag struggle reflection, and self-evaluation."""
    conn = get_connection()
    try:
        res = submit_question_reflection(
            conn=conn,
            user_id=user["id"],
            assignment_id=assignment_id,
            question_id=question_id,
            payload=req.model_dump()
        )
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error", "Failed to submit reflection"))
        return res
    finally:
        conn.close()


@router.post("/{assignment_id}/complete")
def complete_assignment_route(
    assignment_id: str,
    user: dict = Depends(verify_lazypriyam)
):
    """Marks assignment as completed and returns summary struggle statistics."""
    conn = get_connection()
    try:
        res = complete_assignment(conn, user["id"], assignment_id)
        if not res.get("success"):
            raise HTTPException(status_code=400, detail=res.get("error", "Failed to complete assignment"))
        return res
    finally:
        conn.close()
