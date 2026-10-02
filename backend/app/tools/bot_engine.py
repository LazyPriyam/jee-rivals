import random
import math
import json
from typing import Dict, Any, Tuple, Optional

# Dynamic Persona profiles with subject bonuses, format-specific thinking speeds,
# realistic strategic skips, and in-match reaction dialogue.
BOT_PROFILES = {
    "bot_olympiad": {
        "base_elo": 2260,
        "specialties": {"Physics": 150, "Mathematics": 150, "Chemistry": 80},
        "type_speed": {"SINGLE_CHOICE": 8, "NUMERICAL": 17, "MULTIPLE_CHOICE": 23, "MATRIX_MATCH": 27, "COMPREHENSION": 28},
        "skip_tendency": 0.04,
        "reactions_correct": [
            "Calculated with Olympiad rigor.",
            "Standard lemma application. Beautiful problem.",
            "Clean dimensional analysis eliminated the distractors.",
            "Solved in flow state."
        ],
        "reactions_wrong": [
            "Subtle boundary condition overlooked under time crunch.",
            "Tricky parity constraint. Respect the question setter."
        ],
    },
    "bot_star_batch": {
        "base_elo": 2050,
        "specialties": {"Mathematics": 120, "Physics": 110, "Chemistry": 140},
        "type_speed": {"SINGLE_CHOICE": 9, "NUMERICAL": 19, "MULTIPLE_CHOICE": 26, "MATRIX_MATCH": 29, "COMPREHENSION": 31},
        "skip_tendency": 0.07,
        "reactions_correct": [
            "Kota shortcut technique worked like a charm.",
            "Classic Allen top batch drill problem.",
            "Identified the dominant term instantly.",
            "Eliminated options B and D on inspection."
        ],
        "reactions_wrong": [
            "Tricky trap option on the negative marking.",
            "Misread the exponent under pressure."
        ],
    },
    "bot_air1": {
        "base_elo": 1850,
        "specialties": {"Physics": 100, "Mathematics": 100, "Chemistry": 100},
        "type_speed": {"SINGLE_CHOICE": 10, "NUMERICAL": 21, "MULTIPLE_CHOICE": 28, "MATRIX_MATCH": 32, "COMPREHENSION": 33},
        "skip_tendency": 0.06,
        "reactions_correct": [
            "Consistency is key for AIR 1.",
            "Eliminated options in 5s flat.",
            "Straightforward application of core concepts.",
            "Locked in the answer."
        ],
        "reactions_wrong": [
            "Tricky sign convention on that one.",
            "Caught by the distractor option. Good question."
        ],
    },
    "bot_ramanujan": {
        "base_elo": 1740,
        "specialties": {"Mathematics": 250, "Physics": 40, "Chemistry": -60},
        "type_speed": {"SINGLE_CHOICE": 11, "NUMERICAL": 15, "MULTIPLE_CHOICE": 25, "MATRIX_MATCH": 30, "COMPREHENSION": 36},
        "skip_tendency": 0.05,
        "reactions_correct": [
            "Beautiful algebraic symmetry in this equation.",
            "Standard substitution gives the integral immediately.",
            "Pure elegance in the summation."
        ],
        "reactions_wrong": [
            "Chemistry mechanisms aren't as symmetric as numbers...",
            "Over-complicated the algebra."
        ],
    },
    "bot_kota": {
        "base_elo": 1680,
        "specialties": {"Chemistry": 180, "Physics": 50, "Mathematics": 30},
        "type_speed": {"SINGLE_CHOICE": 11, "NUMERICAL": 23, "MULTIPLE_CHOICE": 30, "MATRIX_MATCH": 33, "COMPREHENSION": 35},
        "skip_tendency": 0.10,
        "reactions_correct": [
            "Direct NCERT factoid. Instant lock.",
            "Reagent order was textbook Kota sheet.",
            "Speed bonus secured."
        ],
        "reactions_wrong": [
            "Inorganic exception caught me off-guard.",
            "Calculation blunder on the final step."
        ],
    },
    "bot_mechanics": {
        "base_elo": 1560,
        "specialties": {"Physics": 220, "Mathematics": 50, "Chemistry": -70},
        "type_speed": {"SINGLE_CHOICE": 10, "NUMERICAL": 19, "MULTIPLE_CHOICE": 27, "MATRIX_MATCH": 31, "COMPREHENSION": 33},
        "skip_tendency": 0.08,
        "reactions_correct": [
            "Conservation of angular momentum simplifies this instantly.",
            "Clean free-body diagram.",
            "Classic Irodov mechanics scenario."
        ],
        "reactions_wrong": [
            "Non-inertial frame pseudo-force was tricky.",
            "Friction direction was inverted."
        ],
    },
}

DEFAULT_PROFILE = {
    "base_elo": 1500,
    "specialties": {},
    "type_speed": {"SINGLE_CHOICE": 12, "NUMERICAL": 24, "MULTIPLE_CHOICE": 30, "MATRIX_MATCH": 35, "COMPREHENSION": 35},
    "skip_tendency": 0.08,
    "reactions_correct": ["Solved!", "Got the right answer.", "Moving forward."],
    "reactions_wrong": ["Missed this one.", "Tricky problem."],
}


def simulate_dynamic_bot_action(
    bot_persona: dict,
    question: dict,
    time_limit_seconds: int,
    streak: int = 0
) -> Dict[str, Any]:
    """
    Simulates a highly dynamic, authentic human-like bot move:
    1. Dynamic Elo Win Probability: Calculates true chance based on Bot Elo vs Question Elo.
    2. Subject Expertise: Modifies Elo based on bot's field of mastery (Physics / Chemistry / Math).
    3. Realistic Time: Scales with question format (Numerical takes longer than Single Choice).
    4. Momentum / Tilt: Winning streaks boost speed (flow state); mistakes make them more cautious.
    5. Plausible Traps & Skips: Selects realistic distractors or strategic skips on high-risk items.
    6. In-character reaction line.
    """
    bot_id = bot_persona.get("id", "bot_air1")
    # Clean bot_id in case of fill suffixes like bot_air1_fill_2
    clean_id = bot_id.split("_fill_")[0]
    profile = BOT_PROFILES.get(clean_id, DEFAULT_PROFILE)

    # 1. Subject & Question Tier Elo Calibration
    bot_elo = float(bot_persona.get("overall_elo", profile["base_elo"]))
    subject = question.get("subject", "Physics")
    subject_bonus = profile["specialties"].get(subject, 0)
    effective_bot_elo = bot_elo + subject_bonus

    question_elo = float(question.get("elo_rating", 1500))
    q_type = (question.get("question_type") or "SINGLE_CHOICE").upper()

    # 2. Mathematical Win Probability (Elo vs Elo Logistic Function)
    elo_diff = (effective_bot_elo - question_elo) / 400.0
    elo_diff = max(-4.0, min(4.0, elo_diff))
    win_probability = 1.0 / (1.0 + (10.0 ** (-elo_diff)))

    # Apply minor streak momentum adjustment (-5% if tilted after multiple wrong, +4% if in flow state)
    if streak >= 2:
        win_probability = min(0.98, win_probability + 0.04)
    elif streak <= -2:
        win_probability = max(0.10, win_probability - 0.05)

    # 3. Dynamic Human-like Thinking Time
    base_format_time = profile["type_speed"].get(q_type, 15)

    # Difficulty time scaling: Hard questions take longer, easy questions are recalled faster
    diff_multiplier = 0.8 if question_elo < 1400 else (1.3 if question_elo > 1850 else 1.0)

    # Momentum speed modifier: flow state speeds up, tilt slows down
    streak_time_mod = 0.88 if streak >= 2 else (1.15 if streak < 0 else 1.0)

    # Gaussian-like jitter around mean time
    mean_time = base_format_time * diff_multiplier * streak_time_mod
    jitter = random.gauss(0, max(2.0, mean_time * 0.18))
    simulated_seconds = int(max(4, min(time_limit_seconds - 3, mean_time + jitter)))

    # 4. Determine Outcome: Correct, Strategic Skip, or Trap Distractor
    rand_val = random.random()
    is_correct = rand_val < win_probability

    correct_answer = str(question.get("correct_answer", "")).strip()

    # Parse options if available to select realistic distractors
    options_raw = question.get("options") or "[]"
    try:
        options_list = json.loads(options_raw) if isinstance(options_raw, str) else options_raw
    except Exception:
        options_list = []

    if is_correct:
        selected_option = correct_answer
        reaction = random.choice(profile["reactions_correct"])
        new_streak = max(1, streak + 1)
    else:
        new_streak = min(-1, streak - 1)
        # Check for strategic skip on negative marking tests by high-elo bots
        if effective_bot_elo > 1800 and question_elo > 2000 and random.random() < profile["skip_tendency"]:
            selected_option = "SKIPPED"
            reaction = "Identified high-penalty trap. Strategically skipped."
        else:
            # Pick a plausible wrong option distractor rather than a dummy string
            wrong_choices = []
            if isinstance(options_list, list) and len(options_list) > 1:
                wrong_choices = [
                    opt.get("key", opt.get("id", str(idx)))
                    for idx, opt in enumerate(options_list)
                    if str(opt.get("key", opt.get("id", ""))).strip().upper() != correct_answer.upper()
                ]

            if wrong_choices:
                selected_option = random.choice(wrong_choices)
            elif correct_answer.upper() in ("A", "B", "C", "D"):
                other_opts = [o for o in ("A", "B", "C", "D") if o != correct_answer.upper()]
                selected_option = random.choice(other_opts)
            else:
                selected_option = "WRONG"

            reaction = random.choice(profile["reactions_wrong"])

    return {
        "is_correct": is_correct,
        "selected_option": selected_option,
        "time_spent_seconds": simulated_seconds,
        "reaction_comment": reaction,
        "new_streak": new_streak,
        "effective_elo": int(effective_bot_elo),
        "win_probability": round(win_probability, 2),
    }
