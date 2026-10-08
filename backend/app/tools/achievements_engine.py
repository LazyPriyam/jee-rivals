"""
Achievements & Trophy Engine for JEE Rivals.
Evaluates user milestones across Elo thresholds, subject masteries, duel streaks, and total solved count.
"""

from typing import Dict, List, Any

ACHIEVEMENTS_REGISTRY = [
    # --- ELO LADDER MILESTONES ---
    {
        "id": "elo_bronze",
        "title": "Bronze Initiate",
        "description": "Cross 1200 Overall Elo rating in the competitive arena.",
        "category": "ELO",
        "icon": "🥉",
        "target": 1200,
        "check": lambda u, s: u.get("overall_elo", 0) >= 1200,
        "progress": lambda u, s: min(u.get("overall_elo", 0), 1200),
    },
    {
        "id": "elo_silver",
        "title": "Silver Challenger",
        "description": "Ascend to 1350 Overall Elo rating.",
        "category": "ELO",
        "icon": "🥈",
        "target": 1350,
        "check": lambda u, s: u.get("overall_elo", 0) >= 1350,
        "progress": lambda u, s: min(u.get("overall_elo", 0), 1350),
    },
    {
        "id": "elo_gold",
        "title": "Gold Contender",
        "description": "Reach 1500 Overall Elo — Entering the upper ranks of aspirants.",
        "category": "ELO",
        "icon": "🥇",
        "target": 1500,
        "check": lambda u, s: u.get("overall_elo", 0) >= 1500,
        "progress": lambda u, s: min(u.get("overall_elo", 0), 1500),
    },
    {
        "id": "elo_platinum",
        "title": "Platinum Prodigy",
        "description": "Break into 1650 Overall Elo — Top percentile speed & accuracy.",
        "category": "ELO",
        "icon": "💎",
        "target": 1650,
        "check": lambda u, s: u.get("overall_elo", 0) >= 1650,
        "progress": lambda u, s: min(u.get("overall_elo", 0), 1650),
    },
    {
        "id": "elo_diamond",
        "title": "Diamond Maestro",
        "description": "Attain 1800 Overall Elo rating.",
        "category": "ELO",
        "icon": "💠",
        "target": 1800,
        "check": lambda u, s: u.get("overall_elo", 0) >= 1800,
        "progress": lambda u, s: min(u.get("overall_elo", 0), 1800),
    },
    {
        "id": "elo_master",
        "title": "Master Titan",
        "description": "Reach 1950 Overall Elo — Predicted Top 500 All India Rank.",
        "category": "ELO",
        "icon": "👑",
        "target": 1950,
        "check": lambda u, s: u.get("overall_elo", 0) >= 1950,
        "progress": lambda u, s: min(u.get("overall_elo", 0), 1950),
    },
    {
        "id": "elo_grandmaster",
        "title": "Grandmaster Apex",
        "description": "Cross 2100 Overall Elo — Elite AIR < 100 benchmark.",
        "category": "ELO",
        "icon": "🔥",
        "target": 2100,
        "check": lambda u, s: u.get("overall_elo", 0) >= 2100,
        "progress": lambda u, s: min(u.get("overall_elo", 0), 2100),
    },

    # --- SUBJECT MASTERY MILESTONES ---
    {
        "id": "physics_dynamo",
        "title": "Newtonian Dynamo",
        "description": "Achieve 1500+ Elo rating in Physics.",
        "category": "SUBJECT",
        "icon": "⚛️",
        "target": 1500,
        "check": lambda u, s: u.get("physics_elo", 0) >= 1500,
        "progress": lambda u, s: min(u.get("physics_elo", 0), 1500),
    },
    {
        "id": "chem_wizard",
        "title": "Alchemical Wizard",
        "description": "Achieve 1500+ Elo rating in Chemistry.",
        "category": "SUBJECT",
        "icon": "🧪",
        "target": 1500,
        "check": lambda u, s: u.get("chemistry_elo", 0) >= 1500,
        "progress": lambda u, s: min(u.get("chemistry_elo", 0), 1500),
    },
    {
        "id": "math_demon",
        "title": "Ramanujan's Disciple",
        "description": "Achieve 1500+ Elo rating in Mathematics.",
        "category": "SUBJECT",
        "icon": "📐",
        "target": 1500,
        "check": lambda u, s: u.get("math_elo", 0) >= 1500,
        "progress": lambda u, s: min(u.get("math_elo", 0), 1500),
    },

    # --- COMBAT & VOLUME MILESTONES ---
    {
        "id": "first_blood",
        "title": "First Blood",
        "description": "Win your first 1v1 Speed Duel or Tournament match.",
        "category": "COMBAT",
        "icon": "⚔️",
        "target": 1,
        "check": lambda u, s: s.get("duel_wins", 0) >= 1 or u.get("gold_medals", 0) >= 1,
        "progress": lambda u, s: 1 if (s.get("duel_wins", 0) >= 1 or u.get("gold_medals", 0) >= 1) else 0,
    },
    {
        "id": "streak_3",
        "title": "Triple Threat",
        "description": "Achieve a streak of 3 consecutive correct questions in live battle.",
        "category": "COMBAT",
        "icon": "⚡",
        "target": 3,
        "check": lambda u, s: s.get("best_streak", 0) >= 3,
        "progress": lambda u, s: min(s.get("best_streak", 0), 3),
    },
    {
        "id": "streak_5",
        "title": "Unstoppable",
        "description": "Achieve a streak of 5 consecutive correct answers without a mistake.",
        "category": "COMBAT",
        "icon": "🌟",
        "target": 5,
        "check": lambda u, s: s.get("best_streak", 0) >= 5,
        "progress": lambda u, s: min(s.get("best_streak", 0), 5),
    },
    {
        "id": "century_solver",
        "title": "Century Club",
        "description": "Solve 100 questions correctly across all arena circuits.",
        "category": "VOLUME",
        "icon": "🎯",
        "target": 100,
        "check": lambda u, s: u.get("total_correct", 0) >= 100,
        "progress": lambda u, s: min(u.get("total_correct", 0), 100),
    },
    {
        "id": "grand_scholar",
        "title": "Grand Scholar",
        "description": "Solve 500 questions correctly in JEE Rivals.",
        "category": "VOLUME",
        "icon": "📚",
        "target": 500,
        "check": lambda u, s: u.get("total_correct", 0) >= 500,
        "progress": lambda u, s: min(u.get("total_correct", 0), 500),
    },
    {
        "id": "tournament_champion",
        "title": "Tournament Champion",
        "description": "Win a gold medal in an official or custom tournament circuit.",
        "category": "COMBAT",
        "icon": "🏆",
        "target": 1,
        "check": lambda u, s: u.get("gold_medals", 0) >= 1,
        "progress": lambda u, s: min(u.get("gold_medals", 0), 1),
    },
    # --- DAILY STUDY STREAK ACHIEVEMENTS ---
    {
        "id": "daily_streak_3",
        "title": "Spark of Fire",
        "description": "Maintain a 3-day continuous daily study and duel streak.",
        "category": "STREAK",
        "icon": "🔥",
        "target": 3,
        "check": lambda u, s: max(u.get("current_streak", 0), u.get("longest_streak", 0)) >= 3,
        "progress": lambda u, s: min(max(u.get("current_streak", 0), u.get("longest_streak", 0)), 3),
    },
    {
        "id": "daily_streak_7",
        "title": "Week of Fire",
        "description": "Maintain a 7-day unbroken daily study and practice streak.",
        "category": "STREAK",
        "icon": "⚡",
        "target": 7,
        "check": lambda u, s: max(u.get("current_streak", 0), u.get("longest_streak", 0)) >= 7,
        "progress": lambda u, s: min(max(u.get("current_streak", 0), u.get("longest_streak", 0)), 7),
    },
    {
        "id": "daily_streak_14",
        "title": "Two-Week Grinder",
        "description": "Maintain a 14-day continuous daily study streak.",
        "category": "STREAK",
        "icon": "🌋",
        "target": 14,
        "check": lambda u, s: max(u.get("current_streak", 0), u.get("longest_streak", 0)) >= 14,
        "progress": lambda u, s: min(max(u.get("current_streak", 0), u.get("longest_streak", 0)), 14),
    },
    {
        "id": "daily_streak_30",
        "title": "Unbroken Titan",
        "description": "Attain a monumental 30-day continuous study and duel streak.",
        "category": "STREAK",
        "icon": "👑",
        "target": 30,
        "check": lambda u, s: max(u.get("current_streak", 0), u.get("longest_streak", 0)) >= 30,
        "progress": lambda u, s: min(max(u.get("current_streak", 0), u.get("longest_streak", 0)), 30),
    }
]


def evaluate_user_achievements(user: dict, extra_stats: dict = None) -> List[Dict[str, Any]]:
    """Evaluates all achievements against user profile stats."""
    stats = extra_stats or {}
    results = []
    for ach in ACHIEVEMENTS_REGISTRY:
        unlocked = ach["check"](user, stats)
        cur_prog = ach["progress"](user, stats)
        pct = round(min(100.0, (cur_prog / ach["target"]) * 100), 1) if ach["target"] > 0 else 100.0
        results.append({
            "id": ach["id"],
            "title": ach["title"],
            "description": ach["description"],
            "category": ach["category"],
            "icon": ach["icon"],
            "target": ach["target"],
            "current": cur_prog,
            "progress_percent": pct,
            "is_unlocked": bool(unlocked)
        })
    return results
