"""
Authoritative Canonical JEE (Main & Advanced) Syllabus Master Structure.
Contains exact canonical chapters matching jee/models/syllabus.py and the questions database.
Provides helper functions to calculate 5-tier RPG chapter masteries and skill tree progression.
"""

from typing import Dict, List, Any, Optional
import re

# Authoritative 2026 Canonical JEE Syllabus (92 Chapters organized across Units & Subjects)
JEE_SYLLABUS = {
    "Physics": [
        {
            "unit": "Mechanics",
            "chapters": [
                "Mathematical Tools",
                "Units and Dimensions",
                "Kinematics 1D & 2D",
                "Rectilinear Motion",
                "Projectile Motion",
                "Relative Motion",
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

# Flat list of all 92 canonical chapters
ALL_CANONICAL_CHAPTERS = [
    ch
    for subj in JEE_SYLLABUS.values()
    for unit in subj
    for ch in unit["chapters"]
]

# Mapping from abbreviations/legacy names to true Canonical Question Bank chapters
CHAPTER_NORMALIZER = {
    # Physics
    "kinematics": "Kinematics 1D & 2D",
    "kinematics 1d & 2d": "Kinematics 1D & 2D",
    "kinematics 1d": "Kinematics 1D & 2D",
    "kinematics 2d": "Kinematics 1D & 2D",
    "motion in a straight line": "Rectilinear Motion",
    "motion in a plane": "Projectile Motion",
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
    "kinematics": ["Kinematics 1D & 2D", "Rectilinear Motion", "Projectile Motion", "Relative Motion"],
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
    """5-Tier RPG Mastery."""
    acc = round((correct / total_attempts) * 100, 1) if total_attempts > 0 else 0.0

    if total_attempts == 0:
        tier_level = 0
        tier_name = "Locked"
        tier_label = "Unattempted"
        badge_color = "slate"
    elif correct >= 50 and acc >= 85.0:
        tier_level = 4
        tier_name = "Apex"
        tier_label = "Grandmaster Apex"
        badge_color = "orange"
    elif correct >= 30 and acc >= 80.0:
        tier_level = 3
        tier_name = "Mastered"
        tier_label = "Mastered"
        badge_color = "amber"
    elif correct >= 15 and acc >= 65.0:
        tier_level = 2
        tier_name = "Proficient"
        tier_label = "Proficient"
        badge_color = "emerald"
    elif correct >= 5 and acc >= 40.0:
        tier_level = 1
        tier_name = "Novice"
        tier_label = "Novice"
        badge_color = "blue"
    else:
        tier_level = 1
        tier_name = "Initiate"
        tier_label = "Initiate"
        badge_color = "slate"

    return {
        "tier_level": tier_level,
        "tier_name": tier_name,
        "tier_label": tier_label,
        "badge_color": badge_color,
        "attempts": total_attempts,
        "correct": correct,
        "accuracy": acc,
        "avg_time": round(avg_time, 1)
    }


def build_user_skill_tree(activity_rows: List[Dict[str, Any]], chapter_question_counts: Optional[Dict[str, int]] = None) -> Dict[str, Any]:
    """
    Build structured skill tree with computed mastery for Physics, Chemistry, and Mathematics,
    incorporating live question counts available in the question bank.
    """
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
                key = f"{subject}::{chap_name}"
                stat = stats_map.get(key, {"attempts": 0, "correct": 0, "total_time": 0.0})
                avg_time = (stat["total_time"] / stat["attempts"]) if stat["attempts"] > 0 else 0.0
                mastery = calculate_mastery_tier(stat["attempts"], stat["correct"], avg_time)
                if mastery["tier_level"] >= 3:
                    total_mastered += 1

                q_count = (chapter_question_counts or {}).get(chap_name, 0)

                unit_obj["chapters"].append({
                    "name": chap_name,
                    "subject": subject,
                    "unit": u["unit"],
                    "question_count": q_count,
                    **mastery
                })

            result_tree[subject].append(unit_obj)

    return {
        "tree": result_tree,
        "total_chapters": total_chapters,
        "total_mastered": total_mastered,
        "mastery_percentage": round((total_mastered / total_chapters) * 100, 1) if total_chapters > 0 else 0.0
    }


# Authoritative JEE (Main & Advanced) Chapter Weightage Map (92 Canonical Chapters)
DEFAULT_CHAPTER_WEIGHTAGE: Dict[str, float] = {
    # --- Physics (34 Chapters) ---
    "Mathematical Tools": 1.0,
    "Units and Dimensions": 2.0,
    "Kinematics 1D & 2D": 3.0,
    "Rectilinear Motion": 2.0,
    "Projectile Motion": 2.0,
    "Relative Motion": 2.0,
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

