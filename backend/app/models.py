from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class UserRegisterRequest(BaseModel):
    username: str = Field(..., min_length=2, max_length=20)
    pin: str = Field(..., min_length=4, max_length=32)
    avatar_id: Optional[str] = "default"

class UserLoginRequest(BaseModel):
    username: str
    pin: str

class UserProfile(BaseModel):
    id: str
    username: str
    avatar_id: str
    title: str
    overall_elo: float
    physics_elo: float
    chemistry_elo: float
    math_elo: float
    current_division: str
    weekly_rp: int
    total_solved: int
    total_correct: int
    gold_medals: int
    silver_medals: int
    bronze_medals: int
    accuracy_percentage: float
    predicted_air_bracket: str
    speed_percentile: int
    predicted_air: Optional[int] = None
    predicted_air_formatted: Optional[str] = None
    predicted_air_range: Optional[str] = None
    predicted_percentile: Optional[float] = None
    predicted_jee_main_marks: Optional[int] = None
    air_confidence_score: Optional[int] = None
    air_confidence_label: Optional[str] = None
    college_admissibility: Optional[List[Dict[str, Any]]] = None
    subject_air_breakdown: Optional[Dict[str, Any]] = None
    air_bottlenecks: Optional[List[str]] = None
    air_meta: Optional[Dict[str, Any]] = None
    chapter_stats: Dict[str, Any] = {}
    target_college: Optional[str] = "IIT Bombay (Computer Science)"
    target_exam_date: Optional[str] = "JEE Main Jan 2026"
    bio: Optional[str] = "Aiming for Top 500 AIR. PvP Aspirant."
    banner_theme: Optional[str] = "orange_cyber"
    pinned_badges: Optional[List[str]] = ["elo_bronze", "first_blood"]
    syllabus_coverage_percent: Optional[float] = 0.0
    active_chapters_count: Optional[int] = 0
    total_syllabus_chapters: Optional[int] = 59
    air_gate_reason: Optional[str] = None
    learnt_chapters: Optional[List[str]] = []
    target_exam: Optional[str] = "MIXED"
    chat_settings: Optional[Dict[str, Any]] = {}
    division_meta: Optional[Dict[str, Any]] = None
    current_streak: Optional[int] = 0
    longest_streak: Optional[int] = 0
    last_active_date: Optional[str] = None
    streak_freezes: Optional[int] = 1
    is_streak_active_today: Optional[bool] = False
    streak_meta: Optional[Dict[str, Any]] = None

class ProfileUpdateRequest(BaseModel):
    target_college: Optional[str] = None
    target_exam_date: Optional[str] = None
    target_exam: Optional[str] = None
    bio: Optional[str] = None
    banner_theme: Optional[str] = None
    pinned_badges: Optional[List[str]] = None
    title: Optional[str] = None
    avatar_id: Optional[str] = None
    learnt_chapters: Optional[List[str]] = None
    chat_settings: Optional[Dict[str, Any]] = None

class ChangeUsernameRequest(BaseModel):
    new_username: str = Field(..., min_length=3, max_length=20)

class ChangePinRequest(BaseModel):
    current_pin: str
    new_pin: str = Field(..., min_length=4, max_length=32)

class ChatSettingsUpdateRequest(BaseModel):
    chat_settings: Dict[str, Any]

class AuthResponse(BaseModel):
    token: str
    user: UserProfile

class QuestionOptionModel(BaseModel):
    key: str
    text: str

class QuestionOut(BaseModel):
    id: str
    subject: str
    unit: str
    chapter: str
    question_type: str
    text: str
    options: List[QuestionOptionModel]
    has_diagram: bool
    diagram_urls: List[str]
    difficulty_tier: str
    elo_rating: int

class QuestionSolutionOut(BaseModel):
    id: str
    correct_answer: Any
    solution_text: Optional[str] = None
    key_formulas: List[str] = []
    common_pitfall: Optional[str] = None

class ScoringRules(BaseModel):
    base_correct: float = 100.0
    negative_penalty: float = -25.0
    speed_bonus_enabled: bool = True

class QuestionReportRequest(BaseModel):
    reason: str
    notes: Optional[str] = ""

class RoomCreateRequest(BaseModel):
    mode: str = "SPEED_DUEL"  # "SPEED_DUEL" or "MOCK_TEST"
    preset_name: Optional[str] = None
    subject: Optional[str] = None
    subjects: Optional[List[str]] = None
    chapter: Optional[str] = None
    chapters: Optional[List[str]] = None
    difficulty_tier: Optional[str] = "MIXED"
    target_exam: Optional[str] = "MIXED"  # "MAIN", "ADVANCED", "MIXED"
    question_type_filter: Optional[str] = "ALL"  # "ALL", "MCQ", "NUMERICAL"
    question_types: Optional[List[str]] = None  # Multiple types: ["SINGLE_CHOICE", "NUMERICAL", "MATRIX_MATCH"]
    question_count: int = 5
    time_per_question: int = 90
    total_duration_minutes: int = 60
    timing_type: str = "SYNCHRONIZED"  # "SYNCHRONIZED" or "SELF_PACED"
    is_public: bool = True
    passcode: Optional[str] = None
    base_correct_score: float = 100.0
    negative_marking: float = -25.0
    speed_bonus_enabled: bool = True
    question_ids: Optional[List[str]] = None

class RemovePlayerRequest(BaseModel):
    user_id: str

class RoomJoinRequest(BaseModel):
    code: str
    passcode: Optional[str] = None

class AnswerSubmissionRequest(BaseModel):
    question_id: str
    selected_option: str
    time_spent_seconds: int

class ParticipantScore(BaseModel):
    user_id: str
    username: str
    avatar_id: str
    title: str
    score: int
    marks: float
    current_question_index: int
    is_finished: bool
    rank: int = 1
    question_started_at: Optional[str] = None

class RoomState(BaseModel):
    id: str
    code: str
    host_id: str
    mode: str
    preset_name: Optional[str] = None
    subject: Optional[str] = None
    subjects: List[str] = []
    chapter: Optional[str] = None
    chapters: List[str] = []
    difficulty_tier: Optional[str] = "MIXED"
    target_exam: Optional[str] = "MIXED"
    question_type_filter: Optional[str] = "ALL"
    total_questions: int
    time_per_question: int
    total_duration_minutes: int
    timing_type: str
    is_public: bool = True
    has_passcode: bool = False
    speed_bonus_enabled: bool = True
    negative_marking: float = -25.0
    base_correct_score: float = 100.0
    status: str
    participants: List[ParticipantScore]
    current_question: Optional[QuestionOut] = None
    all_questions: Optional[List[QuestionOut]] = None
    time_remaining_seconds: Optional[int] = None
    started_at: Optional[str] = None
    server_time: Optional[str] = None
    tournament_id: Optional[str] = None
    tournament_match_id: Optional[str] = None

class TournamentCreateRequest(BaseModel):
    title: str
    description: Optional[str] = ""
    format: str = "KNOCKOUT"  # "KNOCKOUT" (1v1 bracket) or "GROUP_ARENA"
    target_exam: str = "MIXED"  # "MAIN", "ADVANCED", "MIXED"
    subject: str = "Full Syllabus"  # "Physics", "Chemistry", "Mathematics", "Full Syllabus"
    bracket_size: int = 8  # 3, 4, 8, 16
    reward_type: str = "REAL_LIFE"  # "REAL_LIFE", "IN_GAME", "HYBRID"
    rp_pool: int = 500
    real_life_reward: Optional[str] = ""  # Custom text field for real life rewards
    claim_instructions: Optional[str] = ""
    passcode: Optional[str] = None
    question_count: int = 5
    time_per_question: int = 60
    series_cycles: int = 1  # For 3-player round-robin leagues: K cycles -> 3*K total matches
