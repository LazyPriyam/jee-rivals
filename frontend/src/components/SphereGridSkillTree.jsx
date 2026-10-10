import React, { useState, useEffect, useMemo } from 'react';
import {
  Layers,
  CheckCircle2,
  Circle,
  Target,
  Swords,
  BookOpen,
  Sparkles,
  Zap,
  RotateCcw,
  CheckCheck,
  Check
} from 'lucide-react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';

// ── Authoritative Canonical JEE Master Syllabus (92 Chapters from CLI Engine) ──
const DEFAULT_SYLLABUS = {
  Physics: [
    {
      unit: 'Mechanics',
      chapters: [
        'Mathematical Tools',
        'Units and Dimensions',
        'Kinematics 1D & 2D',
        'Rectilinear Motion',
        'Projectile Motion',
        'Relative Motion',
        "Newton's Laws of Motion & Friction",
        'Work, Energy and Power',
        'Circular Motion',
        'Center of Mass and Collisions',
        'Rotational Dynamics',
        'Gravitation',
        'Fluid Mechanics',
        'Elasticity and Viscosity',
      ],
    },
    {
      unit: 'Thermal Physics',
      chapters: [
        'Thermal Properties of Matter & Calorimetry',
        'Kinetic Theory of Gases & Thermodynamics',
        'Heat Transfer',
      ],
    },
    {
      unit: 'Oscillations & Waves',
      chapters: [
        'Simple Harmonic Motion',
        'Waves and Sound',
        'Wave Optics',
      ],
    },
    {
      unit: 'Electrodynamics',
      chapters: [
        'Electrostatics',
        'Current Electricity',
        'Magnetic Effects of Current',
        'Classical Magnetism',
        'Electromagnetic Induction',
        'Alternating Current',
        'Electromagnetic Waves',
      ],
    },
    {
      unit: 'Optics & Modern Physics',
      chapters: [
        'Geometrical Optics',
        'Optical Instruments',
        'Dual Nature of Radiation and Matter',
        'Atomic Physics',
        'Nuclear Physics',
        'Semiconductor Electronics',
        'Principles of Communication',
      ],
    },
  ],
  Chemistry: [
    {
      unit: 'Physical Chemistry',
      chapters: [
        'Some Basic Concepts of Chemistry (Mole Concept)',
        'Structure of Atom',
        'States of Matter',
        'Chemical Thermodynamics & Thermochemistry',
        'Chemical Equilibrium',
        'Ionic Equilibrium',
        'Redox Reactions',
        'Solid State',
        'Solutions and Colligative Properties',
        'Electrochemistry',
        'Chemical Kinetics',
        'Surface Chemistry',
      ],
    },
    {
      unit: 'Inorganic Chemistry',
      chapters: [
        'Classification of Elements & Periodicity',
        'Chemical Bonding and Molecular Structure',
        'Hydrogen and s-Block Elements',
        'p-Block Elements (Group 13 & 14)',
        'p-Block Elements (Group 15 to 18)',
        'd and f-Block Elements',
        'Coordination Compounds',
        'Metallurgy and Extraction of Metals',
        'Qualitative Inorganic Analysis (Salt Analysis)',
      ],
    },
    {
      unit: 'Organic Chemistry',
      chapters: [
        'General Organic Chemistry & IUPAC Nomenclature',
        'Isomerism',
        'Hydrocarbons (Alkanes, Alkenes, Alkynes)',
        'Aromatic Compounds (Benzene)',
        'Haloalkanes and Haloarenes',
        'Alcohols, Phenols and Ethers',
        'Aldehydes, Ketones and Carboxylic Acids',
        'Amines and Nitrogen Containing Compounds',
        'Biomolecules',
        'Polymers',
        'Chemistry in Everyday Life',
        'Practical Organic Chemistry',
      ],
    },
  ],
  Mathematics: [
    {
      unit: 'Algebra',
      chapters: [
        'Sets, Relations and Functions',
        'Complex Numbers and Quadratic Equations',
        'Matrices and Determinants',
        'Permutations and Combinations',
        'Mathematical Induction & Binomial Theorem',
        'Sequences and Series',
        'Probability',
        'Statistics',
        'Mathematical Reasoning',
      ],
    },
    {
      unit: 'Trigonometry',
      chapters: [
        'Trigonometric Ratios and Identities',
        'Trigonometric Equations',
        'Inverse Trigonometric Functions',
        'Properties of Triangles & Heights and Distances',
      ],
    },
    {
      unit: 'Coordinate Geometry',
      chapters: [
        'Straight Lines and Pair of Straight Lines',
        'Circles',
        'Parabola',
        'Ellipse',
        'Hyperbola',
      ],
    },
    {
      unit: 'Calculus',
      chapters: [
        'Limits, Continuity and Differentiability',
        'Differentiation and Applications of Derivatives',
        'Indefinite Integration',
        'Definite Integration and Area Under Curves',
        'Differential Equations',
      ],
    },
    {
      unit: 'Vectors & 3D Geometry',
      chapters: [
        'Vector Algebra',
        'Three Dimensional Geometry',
      ],
    },
  ],
};

const TIER_COLORS = {
  Locked: '#64748b',
  Novice: '#b45309',
  Proficient: '#0284c7',
  Master: '#f59e0b',
  Apex: '#c084fc',
};

const TIER_NAMES = {
  Locked: 'Unattempted',
  Novice: 'Initiate',
  Proficient: 'Proficient',
  Master: 'Mastered',
  Apex: 'Apex Tier',
};

export default function SphereGridSkillTree({
  skillTreeData = {},
  totalMastered = 0,
  totalChapters = 92,
  masteryPercentage = 0,
  onNavigateTab,
  onStartPreset,
  currentUser = null,
  profileUser = null,
  isOwnProfile = true,
}) {
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [savingLearnt, setSavingLearnt] = useState(false);
  const [masterSyllabus, setMasterSyllabus] = useState(null);

  // Fetch canonical master syllabus with live question counts on mount
  useEffect(() => {
    api.questions.getMasterSyllabus()
      .then((data) => {
        if (data && Object.keys(data).length > 0) {
          setMasterSyllabus(data);
        }
      })
      .catch(() => {});
  }, []);

  // Learnt / Active Chapters state
  const effectiveUser = isOwnProfile ? currentUser : (profileUser || currentUser);
  const storageLearntKey = isOwnProfile && currentUser?.id ? `jee_user_learnt_chapters_${currentUser.id}` : null;
  const [learntChapters, setLearntChapters] = useState(() => {
    try {
      if (effectiveUser?.learnt_chapters && Array.isArray(effectiveUser.learnt_chapters) && effectiveUser.learnt_chapters.length > 0) {
        return new Set(effectiveUser.learnt_chapters);
      }
      if (storageLearntKey) {
        const raw = localStorage.getItem(storageLearntKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return new Set(parsed);
        }
      }
    } catch (_) {}
    return new Set();
  });

  // Sync with effectiveUser when loaded
  useEffect(() => {
    if (effectiveUser?.learnt_chapters && Array.isArray(effectiveUser.learnt_chapters)) {
      setLearntChapters(new Set(effectiveUser.learnt_chapters));
      if (storageLearntKey) {
        try {
          localStorage.setItem(storageLearntKey, JSON.stringify(effectiveUser.learnt_chapters));
        } catch (_) {}
      }
    } else if (!effectiveUser) {
      setLearntChapters(new Set());
    }
  }, [effectiveUser?.id, storageLearntKey, JSON.stringify(effectiveUser?.learnt_chapters || [])]);

  // Persist learnt chapters to backend and localStorage
  const saveLearntChapters = async (newSet) => {
    if (!isOwnProfile) return;
    const arr = Array.from(newSet);
    if (storageLearntKey) {
      try {
        localStorage.setItem(storageLearntKey, JSON.stringify(arr));
      } catch (_) {}
    }

    if (currentUser) {
      setSavingLearnt(true);
      try {
        await api.auth.updateLearntChapters(arr);
        window.dispatchEvent(new CustomEvent('jee_user_updated', {
          detail: { ...currentUser, learnt_chapters: arr }
        }));
      } catch (_) {}
      finally {
        setSavingLearnt(false);
      }
    }
  };

  const toggleLearnt = (chapName) => {
    sound.click();
    setLearntChapters((prev) => {
      const next = new Set(prev);
      if (next.has(chapName)) {
        next.delete(chapName);
      } else {
        next.add(chapName);
      }
      saveLearntChapters(next);
      return next;
    });
  };

  // Select all chapters in a unit
  const toggleUnitAll = (chapters, shouldSelect) => {
    sound.click();
    setLearntChapters((prev) => {
      const next = new Set(prev);
      chapters.forEach((c) => {
        const cName = typeof c === 'string' ? c : c.name;
        if (shouldSelect) next.add(cName);
        else next.delete(cName);
      });
      saveLearntChapters(next);
      return next;
    });
  };

  // Select all chapters
  const handleSelectAll = () => {
    sound.click();
    const all = new Set();
    const source = masterSyllabus || DEFAULT_SYLLABUS;
    Object.values(source).forEach((units) => {
      units.forEach((u) => {
        u.chapters.forEach((c) => {
          const cName = typeof c === 'string' ? c : c.name;
          all.add(cName);
        });
      });
    });
    setLearntChapters(all);
    saveLearntChapters(all);
  };

  // Clear all
  const handleClearAll = () => {
    sound.click();
    const empty = new Set();
    setLearntChapters(empty);
    saveLearntChapters(empty);
  };

  // Merge backend RPG stats with Canonical 92-Chapter Syllabus
  const normalizedSyllabus = useMemo(() => {
    const raw = (skillTreeData?.tree && Object.keys(skillTreeData.tree).length > 0)
      ? skillTreeData.tree
      : ((skillTreeData && Object.keys(skillTreeData).length > 0) ? skillTreeData : {});
    const syllabusSource = masterSyllabus || DEFAULT_SYLLABUS;
    const finalTree = {};

    ['Physics', 'Chemistry', 'Mathematics'].forEach((subj) => {
      const defaultUnits = syllabusSource[subj] || [];
      const userUnits = raw[subj] || [];

      finalTree[subj] = defaultUnits.map((dUnit) => {
        const uMatch = userUnits.find(
          (u) => u.unit?.toLowerCase() === dUnit.unit?.toLowerCase()
        );

        const mappedChapters = dUnit.chapters.map((chapItem) => {
          const chapName = typeof chapItem === 'string' ? chapItem : chapItem.name;
          const liveQCount = typeof chapItem === 'object' ? (chapItem.question_count || 0) : 0;
          let cData = null;
          if (uMatch?.chapters) {
            cData = uMatch.chapters.find((c) => {
              const str = typeof c === 'string' ? c : (c?.name || c?.chapter || '');
              return String(str).toLowerCase() === String(chapName).toLowerCase();
            });
          }
          return {
            name: chapName,
            subject: subj,
            unit: dUnit.unit,
            question_count: cData?.question_count || liveQCount || 0,
            tier: cData?.tier || 'Locked',
            tier_level: cData?.tier_level || 0,
            badge: cData?.badge || 'Unattempted',
            attempts: cData?.attempts || 0,
            correct: cData?.correct || 0,
            accuracy: cData?.accuracy || 0,
            avg_time: cData?.avg_time || 0,
            elo: cData?.elo || 1200,
          };
        });

        return {
          unit: dUnit.unit,
          chapters: mappedChapters,
        };
      });
    });

    return finalTree;
  }, [skillTreeData, masterSyllabus]);

  const subjectsToDisplay = selectedSubject === 'All'
    ? ['Physics', 'Chemistry', 'Mathematics']
    : [selectedSubject];

  const totalChaptersCount = useMemo(() => {
    let count = 0;
    Object.values(normalizedSyllabus).forEach((units) => {
      units.forEach((u) => {
        count += u.chapters?.length || 0;
      });
    });
    return count || 92;
  }, [normalizedSyllabus]);

  const learntCount = learntChapters.size;

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* ── Top Header Control Center ────────────────────────────────────── */}
      <div className="bg-[#161a24] border border-white/10 rounded-3xl p-6 shadow-xl space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 font-mono">
                Syllabus Mastery & Active Scope
              </span>
              <span className="text-xs text-slate-400 font-mono">2026 JEE Master Chapters</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2 mt-1">
              <Sparkles className="w-5 h-5 text-orange-400" />
              <span>Syllabus Skill Tree & Learnt Chapters</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Mark the chapters you have studied below. When practicing, adaptive testing will pluck questions <strong className="text-emerald-400">only from your marked learnt chapters</strong> so you never face topics you haven't covered yet.
            </p>
          </div>

          {/* Subject Filter Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {['All', 'Physics', 'Chemistry', 'Mathematics'].map((s) => (
              <button
                key={s}
                onClick={() => {
                  sound.click();
                  setSelectedSubject(s);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  selectedSubject === s
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'bg-[#10141f] text-slate-400 hover:text-white border border-white/10'
                }`}
              >
                {s === 'Physics' && '⚛️'}
                {s === 'Chemistry' && '🧪'}
                {s === 'Mathematics' && '📐'}
                <span>{s === 'All' ? 'Full Syllabus' : s}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Learnt Scope Action Banner */}
        <div className="bg-[#10141f] border border-emerald-500/30 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <CheckCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-300">Active Syllabus in Adaptive Circuit:</span>
                <span className="text-sm font-black text-emerald-400 font-mono">
                  {learntCount} / {totalChaptersCount} Chapters
                </span>
                <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300">
                  {Math.round((learntCount / (totalChaptersCount || 1)) * 100)}%
                </span>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                {learntCount === 0
                  ? 'No chapters marked yet. Mark your learnt chapters below to focus your practice!'
                  : `${learntCount} chapters active. Adaptive tests will pluck questions exclusively from these.`}
              </p>
            </div>
          </div>

          {/* Quick Selection Batch Controls */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleSelectAll}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              title={`Mark all ${totalChaptersCount} chapters as learnt`}
            >
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Select All ({totalChaptersCount})</span>
            </button>
            <button
              onClick={handleClearAll}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-red-300 border border-white/10 text-xs font-semibold transition cursor-pointer flex items-center gap-1.5"
              title="Reset learnt chapters selection"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-400" />
              <span>Reset</span>
            </button>
            <button
              onClick={() => {
                if (onNavigateTab) onNavigateTab('adaptive');
              }}
              className="px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs transition cursor-pointer shadow-md glow-orange flex items-center gap-1.5"
            >
              <Target className="w-3.5 h-3.5" />
              <span>Practice Learnt ({learntCount})</span>
            </button>
          </div>
        </div>

        {/* Overall Syllabus Mastery Bar & Tier Legend */}
        <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-300 font-semibold">Total Chapters Mastered:</span>
            <span className="text-sm font-black text-orange-400 font-mono">
              {totalMastered} / {totalChapters} Chapters
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-400 font-mono font-bold">
              {masteryPercentage}%
            </span>
          </div>

          {/* Tier Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-600" /> Locked (0%)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-700" /> Initiate
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Proficient
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Mastered (80%+)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-400" /> Apex (90%+)
            </span>
          </div>
        </div>
      </div>

      {/* ── Render Units & Chapters List ──────────────────────────────────── */}
      {subjectsToDisplay.map((subjKey) => {
        const units = normalizedSyllabus[subjKey] || [];
        const subjTotalChaps = units.reduce((acc, u) => acc + (u.chapters?.length || 0), 0);
        const subjLearntChaps = units.reduce(
          (acc, u) => acc + u.chapters.filter((c) => learntChapters.has(c.name)).length,
          0
        );

        return (
          <div key={subjKey} className="space-y-4">
            {/* Subject Section Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="text-2xl">
                  {subjKey === 'Physics' && '⚛️'}
                  {subjKey === 'Chemistry' && '🧪'}
                  {subjKey === 'Mathematics' && '📐'}
                </span>
                <h4 className="text-lg font-black text-white tracking-wide">{subjKey} Constellation</h4>
                <span className="text-xs text-slate-400 font-mono">
                  ({subjLearntChaps}/{subjTotalChaps} Learnt)
                </span>
              </div>
            </div>

            {/* Units */}
            {units.map((unitObj, uIdx) => {
              const allInUnitLearnt = unitObj.chapters.every((c) => learntChapters.has(c.name));

              return (
                <div key={uIdx} className="bg-[#161a24] border border-white/10 rounded-2xl p-5 shadow-lg space-y-4">
                  {/* Unit Header with Quick Unit Select Button */}
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                      <Layers className="w-3.5 h-3.5 text-orange-400" />
                      <span>Unit: {unitObj.unit}</span>
                      <span className="text-[10px] text-slate-400 font-mono lowercase">
                        ({unitObj.chapters.length} chapters)
                      </span>
                    </span>

                    {isOwnProfile && (
                      <button
                        onClick={() => toggleUnitAll(unitObj.chapters, !allInUnitLearnt)}
                        className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-lg transition cursor-pointer border ${
                          allInUnitLearnt
                            ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                            : 'bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border-white/10'
                        }`}
                      >
                        {allInUnitLearnt ? '✓ All Marked Learnt' : '+ Mark Unit as Learnt'}
                      </button>
                    )}
                  </div>

                  {/* Chapter Cards Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                    {unitObj.chapters.map((chap, cIdx) => {
                      const isLearnt = learntChapters.has(chap.name);
                      const tierColor = TIER_COLORS[chap.tier] || '#64748b';
                      const tierName = TIER_NAMES[chap.tier] || 'Unattempted';

                      return (
                        <div
                          key={cIdx}
                          className={`rounded-xl p-4 flex flex-col justify-between transition-all border ${
                            isLearnt
                              ? 'bg-[#121824] border-emerald-500/40 shadow-sm shadow-emerald-950/20'
                              : 'bg-[#10141f] border-white/10 opacity-80 hover:opacity-100'
                          }`}
                        >
                          <div>
                            {/* Title & Mastery Tier Badge */}
                            <div className="flex items-start justify-between gap-2 mb-2">
                              <div className="flex-1 min-w-0">
                                <h5 className="text-xs font-bold text-white line-clamp-2 leading-snug">
                                  {chap.name}
                                </h5>
                                <div className="flex items-center gap-1.5 mt-1">
                                  <span className={`text-[10px] font-mono font-semibold flex items-center gap-1.5 ${
                                    chap.question_count > 0 ? 'text-amber-400/90' : 'text-slate-500'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${chap.question_count > 0 ? 'bg-amber-400 animate-pulse' : 'bg-slate-600'}`} />
                                    {chap.question_count > 0 ? `${chap.question_count} Qs in Bank` : '0 Qs in Bank'}
                                  </span>
                                </div>
                              </div>
                              <span
                                className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full shrink-0 shadow-sm font-mono"
                                style={{
                                  backgroundColor: `${tierColor}20`,
                                  color: tierColor,
                                  border: `1px solid ${tierColor}40`,
                                }}
                              >
                                {chap.tier_level >= 3 ? '👑 ' : ''}{tierName}
                              </span>
                            </div>

                            {/* Combat Statistics Matrix */}
                            <div className="grid grid-cols-3 gap-1 py-2 text-[10px] text-slate-400 border-t border-b border-white/5 my-2.5">
                              <div>
                                <span className="block text-[9px] text-slate-500 uppercase font-mono">Solved</span>
                                <span className="font-bold text-slate-200 font-mono">
                                  {chap.correct}/{chap.attempts}
                                </span>
                              </div>
                              <div>
                                <span className="block text-[9px] text-slate-500 uppercase font-mono">Accuracy</span>
                                <span className="font-bold text-emerald-400 font-mono">
                                  {chap.accuracy}%
                                </span>
                              </div>
                              <div>
                                <span className="block text-[9px] text-slate-500 uppercase font-mono">Rating</span>
                                <span className="font-bold text-cyan-400 font-mono">
                                  {chap.elo || 1200}
                                </span>
                              </div>
                            </div>

                            {/* Learnt / Active Toggle Button */}
                            {isOwnProfile ? (
                              <button
                                type="button"
                                onClick={() => toggleLearnt(chap.name)}
                                className={`w-full py-2 px-3 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer border ${
                                  isLearnt
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 hover:bg-emerald-500/30'
                                    : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10 hover:text-white'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  {isLearnt ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-slate-500 shrink-0" />
                                  )}
                                  <span>{isLearnt ? 'Learnt & Active in Practice' : 'Mark as Learnt'}</span>
                                </div>
                                <span className="text-[10px] font-mono uppercase font-black">
                                  {isLearnt ? 'ACTIVE' : '+ ADD'}
                                </span>
                              </button>
                            ) : (
                              <div
                                className={`w-full py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-between border ${
                                  isLearnt
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                                    : 'bg-white/5 text-slate-500 border-white/10'
                                }`}
                              >
                                <div className="flex items-center gap-1.5">
                                  {isLearnt ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                                  ) : (
                                    <Circle className="w-4 h-4 text-slate-600 shrink-0" />
                                  )}
                                  <span>{isLearnt ? 'Learnt by Aspirant' : 'Not Marked Learnt'}</span>
                                </div>
                                <span className="text-[10px] font-mono uppercase font-black">
                                  {isLearnt ? 'ACTIVE' : 'INACTIVE'}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Direct Actions: Drill / Duel */}
                          <div className="flex items-center gap-2 pt-3 border-t border-white/5 mt-3">
                            <button
                              onClick={() => {
                                if (onNavigateTab) onNavigateTab('adaptive');
                              }}
                              className="flex-1 text-[11px] font-semibold py-1.5 px-2 rounded-lg bg-white/5 hover:bg-orange-500 hover:text-white text-slate-300 border border-white/10 transition cursor-pointer flex items-center justify-center gap-1"
                              title="Practice this chapter in adaptive mode"
                            >
                              <Target className="w-3 h-3" />
                              <span>Drill</span>
                            </button>
                            <button
                              onClick={() => {
                                if (onStartPreset) {
                                  onStartPreset(subjKey, chap.name);
                                } else if (onNavigateTab) {
                                  onNavigateTab('arena');
                                }
                              }}
                              className="flex-1 text-[11px] font-semibold py-1.5 px-2 rounded-lg bg-orange-500/15 hover:bg-orange-500 hover:text-white text-orange-400 border border-orange-500/30 transition cursor-pointer flex items-center justify-center gap-1"
                              title="Start a 1v1 duel restricted to this chapter"
                            >
                              <Swords className="w-3 h-3" />
                              <span>Duel</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
