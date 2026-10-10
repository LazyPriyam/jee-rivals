"""
division_engine.py - Advanced Dual-Gate Division & Weekly League Engine for JEE Rivals.

Features:
1. Dual-Gate Tier Evaluation:
   - Volume Gate: Weekly RP (Rival Points) earned from practice, duels, and mocks.
   - Merit Gate: Permanent Elo rating across JEE subjects.
   - Precision Gate: Weekly accuracy threshold.
   - Competitive Gate: Relative leaderboard percentile.
2. Sub-Tier Micro-Progression (e.g. Bronze III -> II -> I).
3. Cutoff & Zones:
   - PROMOTION ZONE (Top 20% of cohort)
   - SAFE ZONE (Middle 60%)
   - RELEGATION ZONE (Bottom 20% or zero activity)
4. Authentic JEE AIR (All India Rank) Trajectory mapping.
5. Division Prestige Multipliers & Cosmetic Auras.
"""

from typing import Dict, Any, Optional, Tuple

DIVISION_TIERS_CONFIG = [
    {
        "id": "BRONZE",
        "name": "Bronze",
        "icon": "🥉",
        "min_elo": 0,
        "min_acc": 0.0,
        "air_bracket": "AIR 75,000+",
        "multiplier": 1.0,
        "color": "orange",
        "subdivisions": [
            {"sub": "III", "min_rp": 0, "name": "Bronze III"},
            {"sub": "II", "min_rp": 50, "name": "Bronze II"},
            {"sub": "I", "min_rp": 100, "name": "Bronze I"},
        ],
        "next_tier_rp": 150,
        "next_tier_id": "SILVER"
    },
    {
        "id": "SILVER",
        "name": "Silver",
        "icon": "🥈",
        "min_elo": 1250,
        "min_acc": 40.0,
        "air_bracket": "AIR 35,000 - 75,000",
        "multiplier": 1.05,
        "color": "slate",
        "subdivisions": [
            {"sub": "III", "min_rp": 150, "name": "Silver III"},
            {"sub": "II", "min_rp": 220, "name": "Silver II"},
            {"sub": "I", "min_rp": 290, "name": "Silver I"},
        ],
        "next_tier_rp": 360,
        "next_tier_id": "GOLD"
    },
    {
        "id": "GOLD",
        "name": "Gold",
        "icon": "🥇",
        "min_elo": 1400,
        "min_acc": 50.0,
        "air_bracket": "AIR 15,000 - 35,000",
        "multiplier": 1.10,
        "color": "amber",
        "subdivisions": [
            {"sub": "III", "min_rp": 360, "name": "Gold III"},
            {"sub": "II", "min_rp": 460, "name": "Gold II"},
            {"sub": "I", "min_rp": 560, "name": "Gold I"},
        ],
        "next_tier_rp": 660,
        "next_tier_id": "PLATINUM"
    },
    {
        "id": "PLATINUM",
        "name": "Platinum",
        "icon": "💎",
        "min_elo": 1550,
        "min_acc": 55.0,
        "air_bracket": "AIR 5,000 - 15,000",
        "multiplier": 1.15,
        "color": "emerald",
        "subdivisions": [
            {"sub": "III", "min_rp": 660, "name": "Platinum III"},
            {"sub": "II", "min_rp": 780, "name": "Platinum II"},
            {"sub": "I", "min_rp": 900, "name": "Platinum I"},
        ],
        "next_tier_rp": 1050,
        "next_tier_id": "DIAMOND"
    },
    {
        "id": "DIAMOND",
        "name": "Diamond",
        "icon": "💠",
        "min_elo": 1700,
        "min_acc": 60.0,
        "air_bracket": "AIR 1,500 - 5,000",
        "multiplier": 1.20,
        "color": "cyan",
        "subdivisions": [
            {"sub": "III", "min_rp": 1050, "name": "Diamond III"},
            {"sub": "II", "min_rp": 1200, "name": "Diamond II"},
            {"sub": "I", "min_rp": 1350, "name": "Diamond I"},
        ],
        "next_tier_rp": 1500,
        "next_tier_id": "MASTER"
    },
    {
        "id": "MASTER",
        "name": "Master",
        "icon": "👑",
        "min_elo": 1850,
        "min_acc": 65.0,
        "air_bracket": "AIR 250 - 1,500",
        "multiplier": 1.25,
        "color": "purple",
        "subdivisions": [
            {"sub": "II", "min_rp": 1500, "name": "Master II"},
            {"sub": "I", "min_rp": 1750, "name": "Master I"},
        ],
        "next_tier_rp": 2000,
        "next_tier_id": "GRANDMASTER"
    },
    {
        "id": "GRANDMASTER",
        "name": "Grandmaster Apex",
        "icon": "🔥",
        "min_elo": 2000,
        "min_acc": 70.0,
        "air_bracket": "AIR 1 - 250",
        "multiplier": 1.35,
        "color": "red",
        "subdivisions": [
            {"sub": "APEX", "min_rp": 2000, "name": "Grandmaster Apex"}
        ],
        "next_tier_rp": None,
        "next_tier_id": None
    }
]


def evaluate_user_division(
    weekly_rp: int,
    overall_elo: float,
    total_solved: int = 0,
    total_correct: int = 0,
    rank: int = 1,
    total_users: int = 1,
    physics_elo: float = 1200.0,
    chemistry_elo: float = 1200.0,
    math_elo: float = 1200.0
) -> Dict[str, Any]:
    """
    Evaluates user division using the Dual-Gate Academic mechanism with JEE PCM Parity.
    Guarantees that an aspirant cannot reach high divisions (Platinum, Diamond, Master, Grandmaster)
    by farming a single subject while leaving other subjects unstudied.
    """
    accuracy = round((total_correct / total_solved * 100), 1) if total_solved > 0 else 0.0
    elo = round(overall_elo, 1)

    p_e = float(physics_elo or 1200.0)
    c_e = float(chemistry_elo or 1200.0)
    m_e = float(math_elo or 1200.0)
    min_pcm = min(p_e, c_e, m_e)
    if min_pcm == p_e:
        min_subj_name = "Physics"
    elif min_pcm == c_e:
        min_subj_name = "Chemistry"
    else:
        min_subj_name = "Mathematics"

    TIER_MIN_PCM = {
        "GRANDMASTER": 1600.0,
        "MASTER": 1450.0,
        "DIAMOND": 1350.0,
        "PLATINUM": 1250.0
    }

    # 1. Determine maximum tier the user qualifies for by Elo, Accuracy, and Subject Parity
    # (Merit Gate: must have knowledge and skill across PCM)
    qualified_tier_cfg = DIVISION_TIERS_CONFIG[0]
    for cfg in DIVISION_TIERS_CONFIG:
        req_pcm = TIER_MIN_PCM.get(cfg["id"], 0.0)
        pcm_qualified = min_pcm >= req_pcm

        # Grandmaster additionally requires Top 3 on the leaderboard and at least 3 solved questions
        if cfg["id"] == "GRANDMASTER":
            if elo >= cfg["min_elo"] and accuracy >= cfg["min_acc"] and weekly_rp >= 2000 and rank <= 3 and total_solved >= 3 and pcm_qualified:
                qualified_tier_cfg = cfg
            break
        elif cfg["id"] == "MASTER":
            if elo >= cfg["min_elo"] and accuracy >= cfg["min_acc"] and weekly_rp >= 1500 and pcm_qualified:
                qualified_tier_cfg = cfg
            else:
                break
        else:
            if elo >= cfg["min_elo"] and accuracy >= cfg["min_acc"] and weekly_rp >= cfg["subdivisions"][0]["min_rp"] and pcm_qualified:
                qualified_tier_cfg = cfg
            else:
                # If they fail Elo, RP, or PCM gate of this tier, they cannot ascend higher
                break

    # 2. Determine Sub-Tier within qualified_tier_cfg
    subdivisions = qualified_tier_cfg["subdivisions"]
    active_sub = subdivisions[0]
    next_sub = subdivisions[1] if len(subdivisions) > 1 else None

    for i, s in enumerate(subdivisions):
        if weekly_rp >= s["min_rp"]:
            active_sub = s
            next_sub = subdivisions[i + 1] if i + 1 < len(subdivisions) else None

    # 3. Calculate Sub-Tier Progress Percentage
    sub_min_rp = active_sub["min_rp"]
    if next_sub:
        sub_target_rp = next_sub["min_rp"]
        next_target_name = next_sub["name"]
    elif qualified_tier_cfg["next_tier_rp"]:
        sub_target_rp = qualified_tier_cfg["next_tier_rp"]
        next_target_name = f"{qualified_tier_cfg['next_tier_id'].title()} III"
    else:
        sub_target_rp = sub_min_rp + 500  # Grandmaster ceiling
        next_target_name = "Grandmaster Apex"

    span = max(1, sub_target_rp - sub_min_rp)
    earned_in_span = max(0, weekly_rp - sub_min_rp)
    progress_percent = min(100, int((earned_in_span / span) * 100))

    # 4. Weekly League Cohort Zone (Promotion, Safe, Relegation)
    # Based on relative leaderboard percentile among active aspirants
    percentile = (rank / max(1, total_users)) * 100

    if qualified_tier_cfg["id"] == "GRANDMASTER":
        zone = "APEX"
        zone_label = "Grandmaster Apex Crown"
        zone_color = "red"
    elif percentile <= 20.0 or (progress_percent >= 90 and elo >= (qualified_tier_cfg.get("min_elo", 0) + 50)):
        zone = "PROMOTION"
        zone_label = "🟢 Promotion Zone (Top 20%)"
        zone_color = "emerald"
    elif percentile >= 80.0 and weekly_rp < 50:
        zone = "RELEGATION"
        zone_label = "🔴 Relegation Threat (Bottom 20%)"
        zone_color = "rose"
    else:
        zone = "SAFE"
        zone_label = "⚪ Safe League Standing"
        zone_color = "slate"

    # Next Tier Requirements for UI Guidance
    next_tier_req = None
    if qualified_tier_cfg["next_tier_id"]:
        next_cfg = next((c for c in DIVISION_TIERS_CONFIG if c["id"] == qualified_tier_cfg["next_tier_id"]), None)
        if next_cfg:
            target_pcm = TIER_MIN_PCM.get(next_cfg["id"], 0.0)
            pcm_gap = max(0.0, round(target_pcm - min_pcm, 1))
            next_tier_req = {
                "tier_id": next_cfg["id"],
                "tier_name": next_cfg["name"],
                "rp_needed": max(0, (next_cfg["subdivisions"][0]["min_rp"] - weekly_rp)),
                "elo_needed": max(0, int(next_cfg["min_elo"] - elo)),
                "acc_needed": max(0.0, round(next_cfg["min_acc"] - accuracy, 1)),
                "target_rp": next_cfg["subdivisions"][0]["min_rp"],
                "target_elo": next_cfg["min_elo"],
                "target_acc": next_cfg["min_acc"],
                "target_min_pcm": target_pcm,
                "lagging_subject": min_subj_name if pcm_gap > 0 else None,
                "pcm_gap_needed": pcm_gap
            }

    can_trial = (
        progress_percent >= 100
        and next_tier_req is not None
        and next_tier_req["elo_needed"] == 0
        and next_tier_req.get("pcm_gap_needed", 0.0) == 0.0
    )

    return {
        "tier_id": qualified_tier_cfg["id"],
        "tier_name": qualified_tier_cfg["name"],
        "subdivision": active_sub["sub"],
        "full_name": f"{qualified_tier_cfg['name']} {active_sub['sub']}" if active_sub["sub"] != "APEX" else "Grandmaster Apex",
        "display_name": f"{qualified_tier_cfg['id']}_{active_sub['sub']}" if active_sub["sub"] != "APEX" else "GRANDMASTER",
        "icon": qualified_tier_cfg["icon"],
        "color": qualified_tier_cfg["color"],
        "air_bracket": qualified_tier_cfg["air_bracket"],
        "multiplier": qualified_tier_cfg["multiplier"],
        "current_rp": weekly_rp,
        "tier_min_rp": sub_min_rp,
        "tier_target_rp": sub_target_rp,
        "progress_percent": progress_percent,
        "next_full_name": next_target_name,
        "needed_rp": max(0, sub_target_rp - weekly_rp),
        "needed_elo": next_tier_req["elo_needed"] if next_tier_req else 0,
        "needed_acc": next_tier_req["acc_needed"] if next_tier_req else 0.0,
        "min_acc": next_tier_req["target_acc"] if next_tier_req else 0.0,
        "min_elo": next_tier_req["target_elo"] if next_tier_req else 0,
        "zone": zone,
        "zone_label": zone_label,
        "zone_color": zone_color,
        "elo": elo,
        "accuracy": accuracy,
        "next_tier": next_tier_req,
        "can_attempt_trial": can_trial
    }
