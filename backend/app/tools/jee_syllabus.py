"""
Authoritative Canonical JEE (Main & Advanced) Syllabus Master Structure.
Contains exact canonical chapters matching jee/models/syllabus.py and the questions database.
Provides helper functions to calculate 5-tier RPG chapter masteries and skill tree progression.
"""

from typing import Dict, List, Any, Optional, Tuple, Set
import re

# Authoritative 2026 Canonical JEE Syllabus (89 Chapters organized across Units & Subjects)
JEE_SYLLABUS = {
    "Physics": [
        {
            "unit": "Mechanics",
            "chapters": [
                "Mathematical Tools",
                "Units and Dimensions",
                "Kinematics",
                "Newton's Laws of Motion & Friction",
                "Work, Energy and Power",
                "Circular Motion",
                "Center of Mass and Collisions",
                "Rotational Dynamics",
                "Gravitation",
                "Fluid Mechanics",
                "Elasticity and Viscosity"
            ]
        },
        {
            "unit": "Thermal Physics",
            "chapters": [
                "Thermal Properties of Matter & Calorimetry",
                "Kinetic Theory of Gases & Thermodynamics",
                "Heat Transfer"
            ]
        },
        {
            "unit": "Oscillations & Waves",
            "chapters": [
                "Simple Harmonic Motion",
                "Waves and Sound",
                "Wave Optics"
            ]
        },
        {
            "unit": "Electrodynamics",
            "chapters": [
                "Electrostatics",
                "Current Electricity",
                "Magnetic Effects of Current",
                "Classical Magnetism",
                "Electromagnetic Induction",
                "Alternating Current",
                "Electromagnetic Waves"
            ]
        },
        {
            "unit": "Optics & Modern Physics",
            "chapters": [
                "Geometrical Optics",
                "Optical Instruments",
                "Dual Nature of Radiation and Matter",
                "Atomic Physics",
                "Nuclear Physics",
                "Semiconductor Electronics",
                "Principles of Communication"
            ]
        }
    ],
    "Chemistry": [
        {
            "unit": "Physical Chemistry",
            "chapters": [
                "Some Basic Concepts of Chemistry (Mole Concept)",
                "Structure of Atom",
                "States of Matter",
                "Chemical Thermodynamics & Thermochemistry",
                "Chemical Equilibrium",
                "Ionic Equilibrium",
                "Redox Reactions",
                "Solid State",
                "Solutions and Colligative Properties",
                "Electrochemistry",
                "Chemical Kinetics",
                "Surface Chemistry"
            ]
        },
        {
            "unit": "Inorganic Chemistry",
            "chapters": [
                "Classification of Elements & Periodicity",
                "Chemical Bonding and Molecular Structure",
                "Hydrogen and s-Block Elements",
                "p-Block Elements (Group 13 & 14)",
                "p-Block Elements (Group 15 to 18)",
                "d and f-Block Elements",
                "Coordination Compounds",
                "Metallurgy and Extraction of Metals",
                "Qualitative Inorganic Analysis (Salt Analysis)"
            ]
        },
        {
            "unit": "Organic Chemistry",
            "chapters": [
                "General Organic Chemistry & IUPAC Nomenclature",
                "Isomerism",
                "Hydrocarbons (Alkanes, Alkenes, Alkynes)",
                "Aromatic Compounds (Benzene)",
                "Haloalkanes and Haloarenes",
                "Alcohols, Phenols and Ethers",
                "Aldehydes, Ketones and Carboxylic Acids",
                "Amines and Nitrogen Containing Compounds",
                "Biomolecules",
                "Polymers",
                "Chemistry in Everyday Life",
                "Practical Organic Chemistry"
            ]
        }
    ],
    "Mathematics": [
        {
            "unit": "Algebra",
            "chapters": [
                "Sets, Relations and Functions",
                "Complex Numbers and Quadratic Equations",
                "Matrices and Determinants",
                "Permutations and Combinations",
                "Mathematical Induction & Binomial Theorem",
                "Sequences and Series",
                "Probability",
                "Statistics",
                "Mathematical Reasoning"
            ]
        },
        {
            "unit": "Trigonometry",
            "chapters": [
                "Trigonometric Ratios and Identities",
                "Trigonometric Equations",
                "Inverse Trigonometric Functions",
                "Properties of Triangles & Heights and Distances"
            ]
        },
        {
            "unit": "Coordinate Geometry",
            "chapters": [
                "Straight Lines and Pair of Straight Lines",
                "Circles",
                "Parabola",
                "Ellipse",
                "Hyperbola"
            ]
        },
        {
            "unit": "Calculus",
            "chapters": [
                "Limits, Continuity and Differentiability",
                "Differentiation and Applications of Derivatives",
                "Indefinite Integration",
                "Definite Integration and Area Under Curves",
                "Differential Equations"
            ]
        },
        {
            "unit": "Vectors & 3D Geometry",
            "chapters": [
                "Vector Algebra",
                "Three Dimensional Geometry"
            ]
        }
    ]
}

# Flat list of all 89 canonical chapters
ALL_CANONICAL_CHAPTERS = [
    ch
    for subj in JEE_SYLLABUS.values()
    for unit in subj
    for ch in unit["chapters"]
]

# Mapping from abbreviations/legacy names to true Canonical Question Bank chapters
CHAPTER_NORMALIZER = {
    # Physics
    "kinematics": "Kinematics",
    "kinematics 1d & 2d": "Kinematics",
    "kinematics 1d": "Kinematics",
    "kinematics 2d": "Kinematics",
    "rectilinear motion": "Kinematics",
    "rectilinear": "Kinematics",
    "motion in a straight line": "Kinematics",
    "projectile motion": "Kinematics",
    "projectile": "Kinematics",
    "motion in a plane": "Kinematics",
    "relative motion": "Kinematics",
    "relative": "Kinematics",
    "laws of motion": "Newton's Laws of Motion & Friction",
    "newtons laws of motion": "Newton's Laws of Motion & Friction",
    "newton's laws of motion & friction": "Newton's Laws of Motion & Friction",
    "nlm": "Newton's Laws of Motion & Friction",
    "rotational motion": "Rotational Dynamics",
    "rotational dynamics": "Rotational Dynamics",
    "rotation": "Rotational Dynamics",
    "com": "Center of Mass and Collisions",
    "center of mass": "Center of Mass and Collisions",
    "center of mass and collisions": "Center of Mass and Collisions",
    "units and measurements": "Units and Dimensions",
    "units and dimensions": "Units and Dimensions",
    "work power energy": "Work, Energy and Power",
    "work energy and power": "Work, Energy and Power",
    "work, energy and power": "Work, Energy and Power",
    "wep": "Work, Energy and Power",
    "gravitation": "Gravitation",
    "fluids": "Fluid Mechanics",
    "fluid mechanics": "Fluid Mechanics",
    "elasticity": "Elasticity and Viscosity",
    "thermal physics": "Kinetic Theory of Gases & Thermodynamics",
    "thermodynamics (physics)": "Kinetic Theory of Gases & Thermodynamics",
    "ktg": "Kinetic Theory of Gases & Thermodynamics",
    "simple harmonic motion": "Simple Harmonic Motion",
    "shm": "Simple Harmonic Motion",
    "oscillations": "Simple Harmonic Motion",
    "waves": "Waves and Sound",
    "wave optics": "Wave Optics",
    "ray optics": "Geometrical Optics",
    "geometrical optics": "Geometrical Optics",
    "optics": "Geometrical Optics",
    "electrostatics": "Electrostatics",
    "current electricity": "Current Electricity",
    "magnetism": "Magnetic Effects of Current",
    "magnetic effects of current": "Magnetic Effects of Current",
    "emi": "Electromagnetic Induction",
    "electromagnetic induction": "Electromagnetic Induction",
    "ac": "Alternating Current",
    "alternating current": "Alternating Current",
    "em waves": "Electromagnetic Waves",
    "electromagnetic waves": "Electromagnetic Waves",
    "modern physics": "Dual Nature of Radiation and Matter",
    "dual nature of matter and radiation": "Dual Nature of Radiation and Matter",
    "dual nature of radiation and matter": "Dual Nature of Radiation and Matter",
    "atoms": "Atomic Physics",
    "atomic physics": "Atomic Physics",
    "nuclei": "Nuclear Physics",
    "nuclear physics": "Nuclear Physics",
    "semiconductors": "Semiconductor Electronics",
    "semiconductor electronics": "Semiconductor Electronics",

    # Chemistry
    "mole concept": "Some Basic Concepts of Chemistry (Mole Concept)",
    "some basic concepts in chemistry (mole concept)": "Some Basic Concepts of Chemistry (Mole Concept)",
    "some basic concepts of chemistry (mole concept)": "Some Basic Concepts of Chemistry (Mole Concept)",
    "some basic concepts in chemistry": "Some Basic Concepts of Chemistry (Mole Concept)",
    "structure of atom": "Structure of Atom",
    "atomic structure": "Structure of Atom",
    "states of matter": "States of Matter",
    "states of matter (gases, liquids & solids)": "States of Matter",
    "chemical thermodynamics": "Chemical Thermodynamics & Thermochemistry",
    "chemical thermodynamics & thermochemistry": "Chemical Thermodynamics & Thermochemistry",
    "thermodynamics": "Chemical Thermodynamics & Thermochemistry",
    "chemical equilibrium": "Chemical Equilibrium",
    "ionic equilibrium": "Ionic Equilibrium",
    "chemical and ionic equilibrium": "Chemical Equilibrium",
    "redox": "Redox Reactions",
    "redox reactions": "Redox Reactions",
    "solid state": "Solid State",
    "solutions": "Solutions and Colligative Properties",
    "solutions and colligative properties": "Solutions and Colligative Properties",
    "electrochemistry": "Electrochemistry",
    "chemical kinetics": "Chemical Kinetics",
    "surface chemistry": "Surface Chemistry",
    "periodicity": "Classification of Elements & Periodicity",
    "classification of elements & periodicity": "Classification of Elements & Periodicity",
    "chemical bonding": "Chemical Bonding and Molecular Structure",
    "chemical bonding and molecular structure": "Chemical Bonding and Molecular Structure",
    "hydrogen and s-block elements": "Hydrogen and s-Block Elements",
    "s-block": "Hydrogen and s-Block Elements",
    "p-block": "p-Block Elements (Group 13 & 14)",
    "p-block elements": "p-Block Elements (Group 13 & 14)",
    "d- and f-block elements": "d and f-Block Elements",
    "d and f-block elements": "d and f-Block Elements",
    "coordination compounds": "Coordination Compounds",
    "metallurgy": "Metallurgy and Extraction of Metals",
    "metallurgy and extraction of metals": "Metallurgy and Extraction of Metals",
    "salt analysis": "Qualitative Inorganic Analysis (Salt Analysis)",
    "general organic chemistry": "General Organic Chemistry & IUPAC Nomenclature",
    "goc": "General Organic Chemistry & IUPAC Nomenclature",
    "isomerism": "Isomerism",
    "hydrocarbons": "Hydrocarbons (Alkanes, Alkenes, Alkynes)",
    "haloalkanes and haloarenes": "Haloalkanes and Haloarenes",
    "alcohols, phenols and ethers": "Alcohols, Phenols and Ethers",
    "aldehydes, ketones and carboxylic acids": "Aldehydes, Ketones and Carboxylic Acids",
    "amines": "Amines and Nitrogen Containing Compounds",
    "biomolecules": "Biomolecules",
    "polymers": "Polymers",

    # Mathematics
    "fundamental of mathematics": "Sets, Relations and Functions",
    "fundamentals of mathematics": "Sets, Relations and Functions",
    "sets, relations and functions": "Sets, Relations and Functions",
    "sets and relations": "Sets, Relations and Functions",
    "complex numbers": "Complex Numbers and Quadratic Equations",
    "quadratic equations": "Complex Numbers and Quadratic Equations",
    "complex numbers and quadratic equations": "Complex Numbers and Quadratic Equations",
    "matrices and determinants": "Matrices and Determinants",
    "matrices": "Matrices and Determinants",
    "determinants": "Matrices and Determinants",
    "permutations and combinations": "Permutations and Combinations",
    "pnc": "Permutations and Combinations",
    "binomial theorem": "Mathematical Induction & Binomial Theorem",
    "mathematical induction & binomial theorem": "Mathematical Induction & Binomial Theorem",
    "sequences and series": "Sequences and Series",
    "progression": "Sequences and Series",
    "probability": "Probability",
    "statistics": "Statistics",
    "trigonometry": "Trigonometric Ratios and Identities",
    "trigonometric ratios and identities": "Trigonometric Ratios and Identities",
    "trigonometric equations": "Trigonometric Equations",
    "itf": "Inverse Trigonometric Functions",
    "inverse trigonometric functions": "Inverse Trigonometric Functions",
    "trigonometry & inverse trigonometric functions": "Inverse Trigonometric Functions",
    "straight lines": "Straight Lines and Pair of Straight Lines",
    "circles": "Circles",
    "parabola": "Parabola",
    "ellipse": "Ellipse",
    "hyperbola": "Hyperbola",
    "conic sections": "Parabola",
    "limits": "Limits, Continuity and Differentiability",
    "limit, continuity and differentiability": "Limits, Continuity and Differentiability",
    "differentiation": "Differentiation and Applications of Derivatives",
    "aod": "Differentiation and Applications of Derivatives",
    "indefinite integration": "Indefinite Integration",
    "definite integration": "Definite Integration and Area Under Curves",
    "integral calculus": "Indefinite Integration",
    "differential equations": "Differential Equations",
    "vectors": "Vector Algebra",
    "vector algebra": "Vector Algebra",
    "3d geometry": "Three Dimensional Geometry",
    "three dimensional geometry": "Three Dimensional Geometry"
}

# Umbrella terms expansion: expands an umbrella category into all matching canonical chapters
UMBRELLA_CHAPTER_EXPANSION = {
    "kinematics": ["Kinematics"],
    "kinematics 1d & 2d": ["Kinematics"],
    "rectilinear motion": ["Kinematics"],
    "projectile motion": ["Kinematics"],
    "relative motion": ["Kinematics"],
    "laws of motion": ["Newton's Laws of Motion & Friction", "Circular Motion"],
    "rotational motion": ["Rotational Dynamics", "Center of Mass and Collisions"],
    "units and measurements": ["Units and Dimensions", "Mathematical Tools"],
    "thermal physics": ["Thermal Properties of Matter & Calorimetry", "Kinetic Theory of Gases & Thermodynamics", "Heat Transfer"],
    "oscillations and waves": ["Simple Harmonic Motion", "Waves and Sound", "Wave Optics"],
    "optics": ["Geometrical Optics", "Optical Instruments", "Wave Optics"],
    "modern physics": ["Dual Nature of Radiation and Matter", "Atomic Physics", "Nuclear Physics", "Semiconductor Electronics"],
    "chemical thermodynamics": ["Chemical Thermodynamics & Thermochemistry"],
    "chemical and ionic equilibrium": ["Chemical Equilibrium", "Ionic Equilibrium"],
    "redox reactions and electrochemistry": ["Redox Reactions", "Electrochemistry"],
    "p-block elements": ["p-Block Elements (Group 13 & 14)", "p-Block Elements (Group 15 to 18)"],
    "d- and f-block elements": ["d and f-Block Elements"],
    "isolation of metals (metallurgy)": ["Metallurgy and Extraction of Metals"],
    "general organic chemistry & isomerism": ["General Organic Chemistry & IUPAC Nomenclature", "Isomerism"],
    "hydrocarbons": ["Hydrocarbons (Alkanes, Alkenes, Alkynes)", "Aromatic Compounds (Benzene)"],
    "integral calculus": ["Indefinite Integration", "Definite Integration and Area Under Curves"],
    "coordinate geometry (lines, circles & conics)": ["Straight Lines and Pair of Straight Lines", "Circles", "Parabola", "Ellipse", "Hyperbola"],
    "trigonometry & inverse trigonometric functions": ["Inverse Trigonometric Functions", "Trigonometric Equations", "Trigonometric Ratios and Identities"],
    "trigonometry": ["Inverse Trigonometric Functions", "Trigonometric Equations", "Trigonometric Ratios and Identities"],
    "statistics and probability": ["Statistics", "Probability"],
    "binomial theorem": ["Mathematical Induction & Binomial Theorem"]
}


def normalize_chapter_name(raw_name: str) -> str:
    """
    Normalize raw chapter name to authoritative canonical syllabus chapter name.
    Preserves exact canonical names if already canonical.
    """
    if not raw_name:
        return ""
    clean = raw_name.strip()
    clean_lower = clean.lower()

    # Exact canonical check
    for canon in ALL_CANONICAL_CHAPTERS:
        if canon.lower() == clean_lower:
            return canon

    # Alias check
    if clean_lower in CHAPTER_NORMALIZER:
        return CHAPTER_NORMALIZER[clean_lower]

    # Partial word boundary check
    for alias, canon in CHAPTER_NORMALIZER.items():
        if alias in clean_lower or clean_lower in alias:
            return canon

    return clean


def expand_allowed_chapters(chapters: List[str]) -> List[str]:
    """
    Expands a list of chapter names (which may include legacy or umbrella names)
    into all corresponding canonical database chapters.
    """
    expanded = set()
    for ch in chapters:
        if not ch:
            continue
        c_clean = ch.strip()
        c_lower = c_clean.lower()

        # Check umbrella expansion
        if c_lower in UMBRELLA_CHAPTER_EXPANSION:
            for sub_ch in UMBRELLA_CHAPTER_EXPANSION[c_lower]:
                expanded.add(sub_ch)
            continue

        # Normalization
        norm = normalize_chapter_name(c_clean)
        if norm:
            expanded.add(norm)
        else:
            expanded.add(c_clean)

    return sorted(list(expanded))


def calculate_mastery_tier(total_attempts: int, correct: int, avg_time: float = 0.0) -> Dict[str, Any]:
    """5-Tier RPG Mastery calibrated to genuine question attempts and accuracy."""
    acc = round((correct / total_attempts) * 100, 1) if total_attempts > 0 else 0.0

    if total_attempts == 0:
        tier_level = 0
        tier_name = "Locked"
        tier_label = "Unattempted"
        badge_color = "slate"
        tier = "UNTESTED"
    elif total_attempts >= 25 and acc >= 85.0:
        tier_level = 4
        tier_name = "Apex"
        tier_label = "Grandmaster Apex"
        badge_color = "orange"
        tier = "MASTERED"
    elif total_attempts >= 8 and acc >= 70.0:
        tier_level = 3
        tier_name = "Mastered"
        tier_label = "Mastered"
        badge_color = "amber"
        tier = "MASTERED"
    elif (total_attempts >= 5 and acc >= 50.0) or (total_attempts >= 8 and acc >= 50.0):
        tier_level = 2
        tier_name = "Proficient"
        tier_label = "Proficient"
        badge_color = "emerald"
        tier = "PROFICIENT"
    elif (total_attempts >= 3 and acc < 40.0) or (total_attempts >= 5 and acc < 45.0):
        tier_level = 1
        tier_name = "Critical"
        tier_label = "Critical Trap"
        badge_color = "rose"
        tier = "CRITICAL"
    else:
        tier_level = 1
        tier_name = "Practicing"
        tier_label = "Practicing"
        badge_color = "blue"
        tier = "PRACTICING"

    return {
        "tier": tier,
        "mastery_tier": tier,
        "tier_level": tier_level,
        "tier_name": tier_name,
        "tier_label": tier_label,
        "badge_color": badge_color,
        "attempts": total_attempts,
        "correct": correct,
        "accuracy": acc,
        "avg_time": round(avg_time, 1)
    }


def build_user_skill_tree(
    activity_rows: List[Dict[str, Any]],
    chapter_question_counts: Optional[Dict[str, int]] = None,
    unified_metrics: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Build structured skill tree with computed mastery for Physics, Chemistry, and Mathematics,
    incorporating live question counts available in the question bank.
    When unified_metrics is provided, synchronizes 100% with the authoritative chapter engine.
    """
    unified_map = {}
    if unified_metrics and "chapters" in unified_metrics:
        for ch in unified_metrics["chapters"]:
            unified_map[ch["chapter"].lower()] = ch

    stats_map = {}
    for row in activity_rows:
        subj = row.get("subject", "")
        raw_chap = row.get("chapter", "")
        chap = normalize_chapter_name(raw_chap)
        if not chap:
            continue

        key = f"{subj}::{chap}"
        if key not in stats_map:
            stats_map[key] = {"attempts": 0, "correct": 0, "total_time": 0.0}

        stats_map[key]["attempts"] += 1
        if row.get("is_correct"):
            stats_map[key]["correct"] += 1
        stats_map[key]["total_time"] += float(row.get("time_spent_seconds") or 0.0)

    result_tree = {}
    total_mastered = 0
    total_proficient = 0
    total_chapters = 0

    for subject, units in JEE_SYLLABUS.items():
        result_tree[subject] = []
        for u in units:
            unit_obj = {
                "unit": u["unit"],
                "chapters": []
            }
            for chap_name in u["chapters"]:
                total_chapters += 1
                norm_chap = normalize_chapter_name(chap_name)
                u_item = unified_map.get(norm_chap.lower()) or unified_map.get(chap_name.lower())

                if u_item:
                    attempts = u_item["attempts"]
                    correct = u_item["correct"]
                    avg_time = u_item.get("avg_time_seconds") or 0.0
                    mastery_tier = u_item.get("mastery_tier") or "UNTESTED"
                    elo = u_item.get("elo") or 1200.0
                    acc = round((correct / attempts * 100), 1) if attempts > 0 else 0.0

                    if mastery_tier == "MASTERED":
                        tier_level = 4 if (attempts >= 25 and acc >= 85.0) else 3
                        tier_name = "Apex" if tier_level == 4 else "Mastered"
                        tier_label = "Grandmaster Apex" if tier_level == 4 else "Mastered"
                        badge_color = "orange" if tier_level == 4 else "amber"
                    elif mastery_tier == "PROFICIENT":
                        tier_level = 2
                        tier_name = "Proficient"
                        tier_label = "Proficient"
                        badge_color = "emerald"
                    elif mastery_tier == "CRITICAL":
                        tier_level = 1
                        tier_name = "Critical"
                        tier_label = "Critical Trap"
                        badge_color = "rose"
                    elif mastery_tier == "PRACTICING":
                        tier_level = 1
                        tier_name = "Practicing"
                        tier_label = "Practicing"
                        badge_color = "blue"
                    else:
                        tier_level = 0
                        tier_name = "Locked"
                        tier_label = "Unattempted"
                        badge_color = "slate"

                    mastery = {
                        "tier": mastery_tier,
                        "mastery_tier": mastery_tier,
                        "tier_level": tier_level,
                        "tier_name": tier_name,
                        "tier_label": tier_label,
                        "badge_color": badge_color,
                        "attempts": attempts,
                        "correct": correct,
                        "accuracy": acc,
                        "avg_time": round(avg_time, 1),
                        "elo": elo
                    }
                else:
                    key = f"{subject}::{chap_name}"
                    stat = stats_map.get(key, {"attempts": 0, "correct": 0, "total_time": 0.0})
                    avg_time = (stat["total_time"] / stat["attempts"]) if stat["attempts"] > 0 else 0.0
                    mastery = calculate_mastery_tier(stat["attempts"], stat["correct"], avg_time)
                    mastery["elo"] = 1200.0

                if mastery.get("tier_level", 0) >= 3 or mastery.get("mastery_tier") == "MASTERED":
                    total_mastered += 1
                elif mastery.get("tier_level", 0) == 2 or mastery.get("mastery_tier") == "PROFICIENT":
                    total_proficient += 1

                q_count = (chapter_question_counts or {}).get(chap_name, 0)

                unit_obj["chapters"].append({
                    "name": chap_name,
                    "subject": subject,
                    "unit": u["unit"],
                    "question_count": q_count,
                    **mastery
                })

            result_tree[subject].append(unit_obj)

    if unified_metrics:
        total_chapters = unified_metrics.get("total_chapters", total_chapters)
        total_mastered = unified_metrics.get("mastered_count", 0)
        total_proficient = unified_metrics.get("proficient_count", 0)
        mastery_percentage = round((total_mastered / total_chapters) * 100, 1) if total_chapters > 0 else 0.0
    else:
        mastery_percentage = round((total_mastered / total_chapters) * 100, 1) if total_chapters > 0 else 0.0

    return {
        "tree": result_tree,
        "total_chapters": total_chapters,
        "total_mastered": total_mastered,
        "total_proficient": total_proficient,
        "total_proficient_or_mastered": total_mastered + total_proficient,
        "mastery_percentage": mastery_percentage
    }


# Authoritative JEE (Main & Advanced) Chapter Weightage Map (89 Canonical Chapters)
DEFAULT_CHAPTER_WEIGHTAGE: Dict[str, float] = {
    # --- Physics (31 Chapters) ---
    "Mathematical Tools": 1.0,
    "Units and Dimensions": 2.0,
    "Kinematics": 4.0,
    "Kinematics 1D & 2D": 4.0,
    "Rectilinear Motion": 4.0,
    "Projectile Motion": 4.0,
    "Relative Motion": 4.0,
    "Newton's Laws of Motion & Friction": 4.0,
    "Work, Energy and Power": 3.0,
    "Circular Motion": 2.0,
    "Center of Mass and Collisions": 3.0,
    "Rotational Dynamics": 5.0,
    "Gravitation": 3.0,
    "Fluid Mechanics": 3.0,
    "Elasticity and Viscosity": 2.0,
    "Thermal Properties of Matter & Calorimetry": 2.0,
    "Kinetic Theory of Gases & Thermodynamics": 4.0,
    "Heat Transfer": 2.0,
    "Simple Harmonic Motion": 3.0,
    "Waves and Sound": 3.0,
    "Wave Optics": 3.0,
    "Electrostatics": 4.0,
    "Current Electricity": 5.0,
    "Magnetic Effects of Current": 4.0,
    "Classical Magnetism": 2.0,
    "Electromagnetic Induction": 4.0,
    "Alternating Current": 3.0,
    "Electromagnetic Waves": 1.0,
    "Geometrical Optics": 4.0,
    "Optical Instruments": 1.0,
    "Dual Nature of Radiation and Matter": 4.0,
    "Atomic Physics": 4.0,
    "Nuclear Physics": 3.0,
    "Semiconductor Electronics": 3.0,
    "Principles of Communication": 1.0,

    # --- Chemistry (33 Chapters) ---
    "Some Basic Concepts of Chemistry (Mole Concept)": 3.0,
    "Structure of Atom": 3.0,
    "States of Matter": 2.0,
    "Chemical Thermodynamics & Thermochemistry": 5.0,
    "Chemical Equilibrium": 3.0,
    "Ionic Equilibrium": 4.0,
    "Redox Reactions": 2.0,
    "Solid State": 2.0,
    "Solutions and Colligative Properties": 4.0,
    "Electrochemistry": 5.0,
    "Chemical Kinetics": 4.0,
    "Surface Chemistry": 2.0,
    "Classification of Elements & Periodicity": 3.0,
    "Chemical Bonding and Molecular Structure": 5.0,
    "Hydrogen and s-Block Elements": 2.0,
    "p-Block Elements (Group 13 & 14)": 2.0,
    "p-Block Elements (Group 15 to 18)": 4.0,
    "d and f-Block Elements": 4.0,
    "Coordination Compounds": 5.0,
    "Metallurgy and Extraction of Metals": 2.0,
    "Qualitative Inorganic Analysis (Salt Analysis)": 2.0,
    "General Organic Chemistry & IUPAC Nomenclature": 5.0,
    "Isomerism": 3.0,
    "Hydrocarbons (Alkanes, Alkenes, Alkynes)": 4.0,
    "Aromatic Compounds (Benzene)": 4.0,
    "Haloalkanes and Haloarenes": 3.0,
    "Alcohols, Phenols and Ethers": 4.0,
    "Aldehydes, Ketones and Carboxylic Acids": 5.0,
    "Amines and Nitrogen Containing Compounds": 3.0,
    "Biomolecules": 3.0,
    "Polymers": 1.0,
    "Chemistry in Everyday Life": 1.0,
    "Practical Organic Chemistry": 2.0,

    # --- Mathematics (25 Chapters) ---
    "Sets, Relations and Functions": 3.0,
    "Complex Numbers and Quadratic Equations": 4.0,
    "Matrices and Determinants": 5.0,
    "Permutations and Combinations": 3.0,
    "Mathematical Induction & Binomial Theorem": 3.0,
    "Sequences and Series": 4.0,
    "Probability": 4.0,
    "Statistics": 2.0,
    "Mathematical Reasoning": 1.0,
    "Trigonometric Ratios and Identities": 2.0,
    "Trigonometric Equations": 2.0,
    "Inverse Trigonometric Functions": 2.0,
    "Properties of Triangles & Heights and Distances": 1.0,
    "Straight Lines and Pair of Straight Lines": 3.0,
    "Circles": 4.0,
    "Parabola": 3.0,
    "Ellipse": 3.0,
    "Hyperbola": 3.0,
    "Limits, Continuity and Differentiability": 4.0,
    "Differentiation and Applications of Derivatives": 5.0,
    "Indefinite Integration": 2.0,
    "Definite Integration and Area Under Curves": 5.0,
    "Differential Equations": 4.0,
    "Vector Algebra": 5.0,
    "Three Dimensional Geometry": 5.0,
}

# Build fast chapter -> subject lookup map
_CHAPTER_TO_SUBJECT: Dict[str, str] = {}
for _subj_name, _unit_list in JEE_SYLLABUS.items():
    for _u_obj in _unit_list:
        for _ch_name in _u_obj["chapters"]:
            _CHAPTER_TO_SUBJECT[_ch_name.lower()] = _subj_name


def get_chapter_weightage(chapter: Optional[str]) -> float:
    """Returns canonical JEE exam weightage (1.0 to 5.0) for a given chapter."""
    if not chapter:
        return 2.0
    norm = normalize_chapter_name(chapter)
    if norm in DEFAULT_CHAPTER_WEIGHTAGE:
        return DEFAULT_CHAPTER_WEIGHTAGE[norm]
    for k, v in DEFAULT_CHAPTER_WEIGHTAGE.items():
        if k.lower() == norm.lower():
            return v
    return 2.0


def get_chapter_subject(chapter: Optional[str]) -> Optional[str]:
    """Returns canonical subject ('Physics', 'Chemistry', 'Mathematics') for a chapter."""
    if not chapter:
        return None
    norm = normalize_chapter_name(chapter)
    return _CHAPTER_TO_SUBJECT.get(norm.lower())


def distribute_counts(total: int, keys: List[str]) -> Dict[str, int]:
    """Distributes total count equally among keys (e.g. 75 across 3 subjects -> 25, 25, 25)."""
    if not keys:
        return {}
    base = total // len(keys)
    rem = total % len(keys)
    return {k: base + (1 if idx < rem else 0) for idx, k in enumerate(keys)}


def distribute_weighted_counts(total: int, chapter_weights: Dict[str, float]) -> Dict[str, int]:
    """
    Allocates `total` questions across chapters strictly proportional to their JEE weightage.
    - Uses exact proportional ideals: ideal_i = total * (w_i / total_w).
    - Assigns integer floor(ideal_i) to each chapter first.
    - Distributes remaining slots via weighted randomized largest-remainder sampling so that
      high-weight chapters (w=4, 5) are guaranteed representation while lower-weight chapters
      (w=1, 2, 3) are sampled with probability strictly proportional to their weightage.
    """
    import random
    if not chapter_weights:
        return {}
    if total <= 0:
        return {k: 0 for k in chapter_weights}

    valid_weights = {k: max(0.1, float(w)) for k, w in chapter_weights.items()}
    total_w = sum(valid_weights.values())
    if total_w <= 0:
        return distribute_counts(total, list(chapter_weights.keys()))

    ideals = {k: total * (w / total_w) for k, w in valid_weights.items()}
    floors = {k: int(ideals[k]) for k in valid_weights}
    rem_alloc = total - sum(floors.values())

    if rem_alloc > 0:
        # Weighted sampling without replacement based on fractional remainders
        # (with small tie-breaking jitter so equal-weight chapters rotate fairly across mocks)
        candidates = list(valid_weights.keys())
        scored = sorted(
            candidates,
            key=lambda k: (ideals[k] - floors[k]) + random.uniform(0.0, 0.12 * (valid_weights[k] / 5.0)),
            reverse=True
        )
        for i in range(min(rem_alloc, len(scored))):
            floors[scored[i]] += 1

    return floors


# =========================================================================
# AUTHORITATIVE UNIFIED CHAPTER PROGRESSION & PROFICIENCY ENGINE
# =========================================================================

HIGH_YIELD_CHAPTERS_SET = {
    # Physics
    "Rotational Dynamics", "Work, Energy and Power", "Newton's Laws of Motion & Friction",
    "Electrostatics", "Current Electricity", "Magnetic Effects of Current",
    "Electromagnetic Induction", "Geometrical Optics", "Wave Optics",
    "Dual Nature of Radiation and Matter", "Atomic Physics", "Nuclear Physics",
    "Kinetic Theory of Gases & Thermodynamics", "Simple Harmonic Motion", "Gravitation",
    # Chemistry
    "Chemical Bonding and Molecular Structure", "Coordination Compounds",
    "Chemical Thermodynamics & Thermochemistry", "Solutions and Colligative Properties",
    "Chemical Kinetics", "General Organic Chemistry & IUPAC Nomenclature",
    "Aldehydes, Ketones and Carboxylic Acids", "Hydrocarbons (Alkanes, Alkenes, Alkynes)",
    "Some Basic Concepts of Chemistry (Mole Concept)", "Electrochemistry",
    "d and f-Block Elements", "p-Block Elements (Group 13 & 14)",
    # Mathematics
    "Definite Integration and Area Under Curves", "Indefinite Integration",
    "Limits, Continuity and Differentiability", "Differentiation and Applications of Derivatives",
    "Vector Algebra", "Three Dimensional Geometry",
    "Matrices and Determinants", "Complex Numbers and Quadratic Equations",
    "Straight Lines and Pair of Straight Lines", "Circles", "Parabola", "Ellipse",
    "Probability", "Sequences and Series", "Mathematical Induction & Binomial Theorem"
}

MEDIUM_YIELD_CHAPTERS_SET = {
    # Physics
    "Kinematics", "Kinematics 1D & 2D", "Fluid Mechanics", "Center of Mass and Collisions",
    "Alternating Current", "Semiconductor Electronics", "Heat Transfer",
    "Units and Dimensions", "Elasticity and Viscosity", "Electromagnetic Waves",
    # Chemistry
    "Structure of Atom", "Chemical Equilibrium", "Ionic Equilibrium",
    "Haloalkanes and Haloarenes", "Alcohols, Phenols and Ethers",
    "Amines and Nitrogen Containing Compounds", "Biomolecules",
    "Classification of Elements & Periodicity", "Redox Reactions",
    # Mathematics
    "Permutations and Combinations", "Hyperbola", "Differential Equations",
    "Sets, Relations and Functions", "Inverse Trigonometric Functions",
    "Statistics", "Trigonometric Equations"
}

_UNIFIED_CHAPTER_CACHE: Dict[Tuple[str, Any], Tuple[float, Dict[str, Any]]] = {}

def invalidate_unified_chapter_cache(user_id: Optional[str] = None):
    """Clears cached unified chapter metrics for a specific user or all users."""
    global _UNIFIED_CHAPTER_CACHE
    if user_id:
        uid = str(user_id)
        for k in list(_UNIFIED_CHAPTER_CACHE.keys()):
            if k[0] == uid:
                _UNIFIED_CHAPTER_CACHE.pop(k, None)
    else:
        _UNIFIED_CHAPTER_CACHE.clear()

def get_unified_chapter_metrics(
    cursor=None,
    user_id: Optional[str] = None,
    user_dict: Optional[dict] = None
) -> Dict[str, Any]:
    """
    Authoritative single-point-of-truth calculation for chapter metrics across all 89 canonical chapters.
    Eliminates discrepancies between profile, mastery, growth triad, and practice modules.

    Evaluates chapters strictly from questions solved, accuracy, and Elo:
      - MASTERED: >= 8 solved, >= 70% accuracy and Elo >= 1550 (or >= 12 solved and >= 70% accuracy)
      - PROFICIENT: >= 5 solved and >= 60% accuracy (or >= 8 solved and >= 50% accuracy)
      - PRACTICING: Active practice (1 to 4 solved, or developing accuracy)
      - CRITICAL: >= 3 solved with < 40% accuracy
      - UNTESTED: 0 solved
    """
    import json
    import time
    from backend.app.database import get_connection

    if not user_id:
        total_canonical = len(ALL_CANONICAL_CHAPTERS)
        by_subj_default = {
            "Physics": {"total": 31, "tested": 0, "mastered": 0, "proficient": 0, "practicing": 0, "critical": 0, "untested": 31, "coverage_percent": 0.0},
            "Chemistry": {"total": 33, "tested": 0, "mastered": 0, "proficient": 0, "practicing": 0, "critical": 0, "untested": 33, "coverage_percent": 0.0},
            "Mathematics": {"total": 25, "tested": 0, "mastered": 0, "proficient": 0, "practicing": 0, "critical": 0, "untested": 25, "coverage_percent": 0.0}
        }
        return {
            "total_chapters": total_canonical,
            "tested_chapters_count": 0,
            "mastered_count": 0,
            "proficient_count": 0,
            "practicing_count": 0,
            "critical_count": 0,
            "untested_count": total_canonical,
            "coverage_ratio": 0.0,
            "coverage_percent": 0.0,
            "active_chapters": [],
            "proficient_or_mastered_chapters": [],
            "tier_summary": {"MASTERED": 0, "PROFICIENT": 0, "PRACTICING": 0, "EMERGING": 0, "CRITICAL": 0, "UNTESTED": total_canonical},
            "by_subject": by_subj_default,
            "chapters": []
        }

    uid_str = str(user_id)
    now_t = time.time()
    state_sig = (
        user_dict.get("total_solved") if user_dict else None,
        user_dict.get("overall_elo") if user_dict else None
    )
    cache_key = (uid_str, state_sig)
    cached = _UNIFIED_CHAPTER_CACHE.get(cache_key)
    if cached and (now_t - cached[0] < 60.0):
        return cached[1]

    conn = None
    close_conn = False
    if cursor is None:
        conn = get_connection()
        c = conn.cursor()
        close_conn = True
    else:
        c = cursor

    try:
        # 1. Fetch user_chapter_elo records
        c.execute("""
            SELECT chapter, subject, elo, attempts, correct, last_updated
            FROM user_chapter_elo
            WHERE user_id = ?
        """, (user_id,))
        elo_rows = [dict(r) for r in c.fetchall()]

        # 2. Fetch activity_log aggregated metrics
        c.execute("""
            SELECT chapter, subject,
                   COUNT(*) as att,
                   SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) as corr,
                   AVG(CASE WHEN time_spent_seconds > 0 THEN time_spent_seconds ELSE NULL END) as avg_time
            FROM activity_log
            WHERE user_id = ? AND chapter IS NOT NULL AND TRIM(chapter) != ''
            GROUP BY chapter
        """, (user_id,))
        act_rows = [dict(r) for r in c.fetchall()]

        # 3. Legacy chapter_stats from user_dict or DB
        raw_cstats = None
        if user_dict is not None and "chapter_stats" in user_dict:
            raw_cstats = user_dict.get("chapter_stats")
        else:
            c.execute("SELECT chapter_stats FROM users WHERE id = ?", (user_id,))
            u_row = c.fetchone()
            if u_row:
                raw_cstats = u_row["chapter_stats"]

        legacy_map = {}
        if raw_cstats:
            try:
                parsed_cstats = json.loads(raw_cstats) if isinstance(raw_cstats, str) else raw_cstats
                if isinstance(parsed_cstats, dict):
                    legacy_map = parsed_cstats
            except Exception:
                pass

    finally:
        if close_conn and conn:
            try:
                conn.close()
            except Exception:
                pass

    # Normalize and merge data sources
    elo_map: Dict[str, dict] = {}
    for r in elo_rows:
        norm = normalize_chapter_name(r.get("chapter") or "")
        if norm:
            elo_map[norm] = r

    act_map: Dict[str, dict] = {}
    for r in act_rows:
        norm = normalize_chapter_name(r.get("chapter") or "")
        if norm:
            act_map[norm] = r

    IDEAL_PACE_MAP = {
        "Chemistry": 70,
        "Physics": 120,
        "Mathematics": 170
    }

    chapters_out = []
    tier_summary = {
        "MASTERED": 0,
        "PROFICIENT": 0,
        "PRACTICING": 0,
        "EMERGING": 0,
        "CRITICAL": 0,
        "UNTESTED": 0
    }
    by_subject = {
        "Physics": {"total": 0, "tested": 0, "mastered": 0, "proficient": 0, "practicing": 0, "critical": 0, "untested": 0, "coverage_percent": 0.0},
        "Chemistry": {"total": 0, "tested": 0, "mastered": 0, "proficient": 0, "practicing": 0, "critical": 0, "untested": 0, "coverage_percent": 0.0},
        "Mathematics": {"total": 0, "tested": 0, "mastered": 0, "proficient": 0, "practicing": 0, "critical": 0, "untested": 0, "coverage_percent": 0.0}
    }

    active_chapters_list = []
    proficient_or_mastered = []

    for subject, units in JEE_SYLLABUS.items():
        for unit_item in units:
            unit_name = unit_item["unit"]
            for ch in unit_item["chapters"]:
                norm_ch = normalize_chapter_name(ch)

                rec_elo = elo_map.get(norm_ch) or elo_map.get(ch)
                rec_act = act_map.get(norm_ch) or act_map.get(ch)
                rec_leg = legacy_map.get(norm_ch) or legacy_map.get(ch)

                # Consolidate attempts and correct count across sources
                att_elo = int(rec_elo.get("attempts") or 0) if rec_elo else 0
                att_act = int(rec_act.get("att") or 0) if rec_act else 0
                att_leg = int(rec_leg.get("attempts") or 0) if isinstance(rec_leg, dict) else (int(rec_leg) if isinstance(rec_leg, (int, float)) else 0)
                attempts = max(att_elo, att_act, att_leg)

                corr_elo = int(rec_elo.get("correct") or 0) if rec_elo else 0
                corr_act = int(rec_act.get("corr") or 0) if rec_act else 0
                corr_leg = int(rec_leg.get("correct") or 0) if isinstance(rec_leg, dict) else 0
                correct = max(corr_elo, corr_act, corr_leg)

                if attempts > 0 and correct > attempts:
                    correct = attempts

                acc = round((correct / attempts * 100.0), 1) if attempts > 0 else 0.0

                if rec_elo and rec_elo.get("elo"):
                    elo_val = float(rec_elo["elo"])
                elif rec_leg and isinstance(rec_leg, dict) and rec_leg.get("elo"):
                    elo_val = float(rec_leg["elo"])
                else:
                    elo_val = 1200.0

                last_upd = (rec_elo.get("last_updated") if rec_elo else None)

                # Determine Proficiency Tier strictly from questions solved & performance
                # Genuine mastery requires proven volume, high accuracy, and calibrated Elo
                if attempts == 0:
                    tier = "UNTESTED"
                elif (attempts >= 8 and acc >= 70.0 and elo_val >= 1550.0) or (attempts >= 12 and acc >= 70.0):
                    tier = "MASTERED"
                elif (attempts >= 5 and acc >= 60.0) or (attempts >= 8 and acc >= 50.0) or (attempts >= 5 and acc >= 50.0 and elo_val >= 1450.0):
                    tier = "PROFICIENT"
                elif (attempts >= 3 and acc < 40.0) or (attempts >= 5 and acc < 45.0) or (attempts >= 3 and acc < 50.0 and elo_val < 1300.0):
                    tier = "CRITICAL"
                else:
                    tier = "PRACTICING"

                tier_summary[tier] += 1
                if tier == "PRACTICING":
                    tier_summary["EMERGING"] += 1

                # Subject-wise tracking
                subj_group = by_subject.get(subject)
                if subj_group:
                    subj_group["total"] += 1
                    if attempts > 0:
                        subj_group["tested"] += 1
                    if tier == "MASTERED": subj_group["mastered"] += 1
                    elif tier == "PROFICIENT": subj_group["proficient"] += 1
                    elif tier == "PRACTICING": subj_group["practicing"] += 1
                    elif tier == "CRITICAL": subj_group["critical"] += 1
                    elif tier == "UNTESTED": subj_group["untested"] += 1

                if attempts > 0:
                    active_chapters_list.append(norm_ch)

                if tier in ("MASTERED", "PROFICIENT"):
                    proficient_or_mastered.append(norm_ch)

                # Speed rating
                ideal_t = IDEAL_PACE_MAP.get(subject, 110)
                avg_t = round(float(rec_act["avg_time"])) if rec_act and rec_act.get("avg_time") else None
                if avg_t:
                    if avg_t < ideal_t * 0.8: sp_rating = "FAST"
                    elif avg_t <= ideal_t * 1.25: sp_rating = "OPTIMAL"
                    else: sp_rating = "SLOW"
                else:
                    sp_rating = "UNTESTED"

                yield_str = "HIGH" if norm_ch in HIGH_YIELD_CHAPTERS_SET else ("MEDIUM" if norm_ch in MEDIUM_YIELD_CHAPTERS_SET else "LOW")
                weight_val = get_chapter_weightage(norm_ch)

                chapters_out.append({
                    "subject": subject,
                    "unit": unit_name,
                    "chapter": norm_ch,
                    "elo": round(elo_val, 1),
                    "attempts": attempts,
                    "correct": correct,
                    "accuracy": acc,
                    "avg_time_seconds": avg_t,
                    "ideal_time_seconds": ideal_t,
                    "speed_rating": sp_rating,
                    "weightage": yield_str,
                    "weightage_score": weight_val,
                    "mastery_tier": tier,
                    "last_updated": last_upd
                })

    tot_canonical = len(chapters_out)
    tested_cnt = len(active_chapters_list)
    cov_ratio = (tested_cnt / tot_canonical) if tot_canonical > 0 else 0.0
    cov_pct = round(cov_ratio * 100.0, 1)

    for s_info in by_subject.values():
        s_tot = s_info["total"]
        s_tst = s_info["tested"]
        s_info["coverage_percent"] = round((s_tst / s_tot * 100.0), 1) if s_tot > 0 else 0.0

    res = {
        "total_chapters": tot_canonical,
        "tested_chapters_count": tested_cnt,
        "mastered_count": tier_summary["MASTERED"],
        "proficient_count": tier_summary["PROFICIENT"],
        "practicing_count": tier_summary["PRACTICING"],
        "critical_count": tier_summary["CRITICAL"],
        "untested_count": tier_summary["UNTESTED"],
        "coverage_ratio": round(cov_ratio, 3),
        "coverage_percent": cov_pct,
        "active_chapters": active_chapters_list,
        "proficient_or_mastered_chapters": proficient_or_mastered,
        "tier_summary": tier_summary,
        "by_subject": by_subject,
        "chapters": chapters_out
    }

    _UNIFIED_CHAPTER_CACHE[cache_key] = (now_t, res)
    return res


