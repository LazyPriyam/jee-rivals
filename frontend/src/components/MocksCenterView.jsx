import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import {
  BookOpen,
  Clock,
  ShieldCheck,
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  FileText,
  Award,
  Layers,
  Sparkles,
  Sliders,
  Check,
  Users,
  Globe,
  Lock,
  Search,
  X,
  Filter,
  CheckSquare,
  Square,
  Bookmark
} from 'lucide-react';

const CANONICAL_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics'];

export default function MocksCenterView({ user, onRoomCreated, onJoinRoomCode, onOpenAuth }) {
  const [mockMode, setMockMode] = useState('SOLO'); // 'SOLO' or 'GROUP'
  const [targetExam, setTargetExam] = useState('MAIN'); // 'MAIN' or 'ADVANCED'
  const [selectedSubjects, setSelectedSubjects] = useState(['Physics', 'Chemistry', 'Mathematics']);
  const [syllabusScope, setSyllabusScope] = useState('FULL'); // 'FULL' or 'CUSTOM'
  const [chaptersMap, setChaptersMap] = useState({});
  const [selectedChapters, setSelectedChapters] = useState([]);
  const [activeSubjectTab, setActiveSubjectTab] = useState('Physics');
  const [chapterSearch, setChapterSearch] = useState('');
  const [loadingChapters, setLoadingChapters] = useState(false);

  const [questionCount, setQuestionCount] = useState(30);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [questionTypeFilter, setQuestionTypeFilter] = useState('ALL');
  const [isPublic, setIsPublic] = useState(true);
  const [passcode, setPasscode] = useState('');
  const [groupJoinCode, setGroupJoinCode] = useState('');
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load chapter metadata on mount
  useEffect(() => {
    setLoadingChapters(true);
    api.questions.getChapters()
      .then((data) => {
        setChaptersMap(data || {});
      })
      .catch(() => {})
      .finally(() => setLoadingChapters(false));
  }, []);

  const toggleSubject = (subj) => {
    sound.click();
    setSelectedSubjects((prev) => {
      if (prev.includes(subj)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter((s) => s !== subj);
      }
      return [...prev, subj];
    });
  };

  const toggleChapter = (chapterName) => {
    sound.click();
    setSelectedChapters((prev) => {
      if (prev.includes(chapterName)) {
        return prev.filter((c) => c !== chapterName);
      }
      return [...prev, chapterName];
    });
  };

  const handleSelectAllInSubject = (subjName) => {
    sound.click();
    const chList = (chaptersMap[subjName] || []).map((c) => c.chapter);
    setSelectedChapters((prev) => {
      const allSelected = chList.every((c) => prev.includes(c));
      if (allSelected) {
        return prev.filter((c) => !chList.includes(c));
      }
      const toAdd = chList.filter((c) => !prev.includes(c));
      return [...prev, ...toAdd];
    });
  };

  const handleClearAllInSubject = (subjName) => {
    sound.click();
    const chList = (chaptersMap[subjName] || []).map((c) => c.chapter);
    setSelectedChapters((prev) => prev.filter((c) => !chList.includes(c)));
  };

  const handleSelectAllInUnit = (unitChapters) => {
    sound.click();
    const chNames = unitChapters.map((c) => c.chapter);
    setSelectedChapters((prev) => {
      const allSelected = chNames.every((c) => prev.includes(c));
      if (allSelected) {
        return prev.filter((c) => !chNames.includes(c));
      }
      const toAdd = chNames.filter((c) => !prev.includes(c));
      return [...prev, ...toAdd];
    });
  };

  const handleClearAllChapters = () => {
    sound.click();
    setSelectedChapters([]);
  };

  // Group chapters in active subject by unit, applying search filter
  const unitsInActiveSubject = useMemo(() => {
    const list = chaptersMap[activeSubjectTab] || [];
    const query = chapterSearch.trim().toLowerCase();
    const filtered = query
      ? list.filter((c) => c.chapter.toLowerCase().includes(query) || (c.unit || '').toLowerCase().includes(query))
      : list;
    const groups = {};
    for (const item of filtered) {
      const unit = item.unit || 'General';
      if (!groups[unit]) groups[unit] = [];
      groups[unit].push(item);
    }
    return groups;
  }, [chaptersMap, activeSubjectTab, chapterSearch]);

  // Derive subjects that currently have selected chapters
  const activeCustomSubjects = useMemo(() => {
    if (selectedChapters.length === 0) return selectedSubjects;
    const found = new Set();
    for (const ch of selectedChapters) {
      for (const [subj, list] of Object.entries(chaptersMap)) {
        if (Array.isArray(list) && list.some((it) => it.chapter === ch)) {
          found.add(subj);
          break;
        }
      }
    }
    return CANONICAL_SUBJECTS.filter((s) => found.has(s));
  }, [selectedChapters, chaptersMap, selectedSubjects]);

  // Total questions in selected chapters pool
  const totalAvailableInSelected = useMemo(() => {
    let total = 0;
    for (const ch of selectedChapters) {
      for (const list of Object.values(chaptersMap)) {
        if (Array.isArray(list)) {
          const it = list.find((item) => item.chapter === ch);
          if (it) {
            total += it.count || 0;
            break;
          }
        }
      }
    }
    return total;
  }, [selectedChapters, chaptersMap]);

  const handleDirectJoin = async (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    const code = groupJoinCode.trim().toUpperCase();
    if (!code) return;
    sound.click();
    setJoiningGroup(true);
    setError('');
    try {
      if (onJoinRoomCode) {
        await onJoinRoomCode(code);
      }
    } catch (err) {
      setError(err.message || 'Failed to enter group mock arena.');
    } finally {
      setJoiningGroup(false);
    }
  };

  const handleLaunchMock = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }

    if (syllabusScope === 'CUSTOM' && selectedChapters.length === 0) {
      setError('Please select at least one chapter for your custom syllabus mock test.');
      return;
    }

    sound.click();
    setError('');
    setLoading(true);

    try {
      const examName = targetExam === 'MAIN' ? 'JEE (Main)' : 'JEE (Advanced)';
      const isCustom = syllabusScope === 'CUSTOM' && selectedChapters.length > 0;
      const effectiveSubjects = isCustom
        ? (activeCustomSubjects.length > 0 ? activeCustomSubjects : selectedSubjects)
        : selectedSubjects;

      let scopeLabel = '';
      if (isCustom) {
        if (selectedChapters.length === 1) {
          scopeLabel = `${selectedChapters[0]} Chapter Mock`;
        } else {
          scopeLabel = `Part Syllabus (${selectedChapters.length} Ch) Mock`;
        }
      } else {
        scopeLabel = selectedSubjects.length === 3 ? 'Full PCM' : selectedSubjects.join(' & ');
      }

      const title = mockMode === 'GROUP'
        ? `${examName} ${scopeLabel} Group Arena`
        : `${examName} ${scopeLabel} Official Mock`;

      const room = await api.rooms.create({
        mode: 'MOCK_TEST',
        preset_name: title,
        subjects: effectiveSubjects,
        chapters: isCustom ? selectedChapters : null,
        difficulty_tier: targetExam === 'ADVANCED' ? 'HARD' : 'MIXED',
        target_exam: targetExam,
        question_type_filter: questionTypeFilter,
        question_count: questionCount,
        time_per_question: 90,
        total_duration_minutes: durationMinutes,
        timing_type: 'SYNCHRONIZED',
        is_public: mockMode === 'GROUP' ? isPublic : false,
        passcode: mockMode === 'GROUP' ? (passcode.trim() || null) : null,
        speed_bonus_enabled: false,
        negative_marking: -1.0,
        base_correct_score: 100.0,
      });

      if (mockMode === 'GROUP') {
        // Group mock: open lobby so peers can join with room code before host begins!
        onRoomCreated(room);
      } else {
        // Solo simulation: automatically launch examination immediately
        const startedRoom = await api.rooms.start(room.code);
        onRoomCreated(startedRoom || { ...room, status: 'IN_PROGRESS' });
      }
    } catch (err) {
      setError(err.message || 'Failed to initialize examination paper.');
    } finally {
      setLoading(false);
    }
  };

  const isCustomMode = syllabusScope === 'CUSTOM';

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 page-transition">
      {/* Page Title & Guidelines Banner */}
      <div className="bg-gradient-to-r from-[#2b3345] via-[#242b3b] to-[#1e2330] border border-orange-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl mb-8 glow-orange-subtle">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-950/80 border border-orange-500/40 text-orange-400 text-xs font-bold uppercase tracking-wider mb-3">
            <BookOpen className="w-3.5 h-3.5" />
            <span>National Testing Agency (NTA) Simulation Hall</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Authentic NTA Mock Examination
          </h1>

          <p className="text-slate-300 text-sm sm:text-base mt-3 leading-relaxed">
            Practice in the exact Computer Based Test (CBT) environment used by the National Testing Agency.
            Configure full syllabus papers or customize specific chapters with official Section A (+4/-1) and Section B marking.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-4 text-xs font-medium text-slate-400">
            <div className="flex items-center gap-1.5 text-emerald-400">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Full NTA Question Palette</span>
            </div>
            <div className="flex items-center gap-1.5 text-orange-400">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Strictly Blind Scoring Atmosphere</span>
            </div>
            <div className="flex items-center gap-1.5 text-blue-400">
              <Award className="w-4 h-4 shrink-0" />
              <span>Full Post-Exam Derivation & Keys</span>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Quick Join Peer Group Mock Card */}
      <div className="bg-[#1e2433] border border-orange-500/30 rounded-3xl p-5 sm:p-6 mb-8 shadow-xl flex flex-col md:flex-row items-center justify-between gap-5 glow-orange-subtle">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <span>Join a Common Group Mock Arena</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-mono font-bold">
                SAME QUESTIONS
              </span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Have a 5-character Room Code from a friend or study squad? Enter it below to compete on the identical question paper.
            </p>
          </div>
        </div>

        <form onSubmit={handleDirectJoin} className="flex items-center gap-2 w-full md:w-auto shrink-0">
          <input
            type="text"
            placeholder="CODE (e.g. AB12CD)"
            value={groupJoinCode}
            onChange={(e) => setGroupJoinCode(e.target.value.toUpperCase())}
            maxLength={6}
            className="px-4 py-2.5 rounded-xl bg-[#141824] border border-white/10 text-white font-mono uppercase text-sm tracking-widest placeholder-slate-500 focus:outline-none focus:border-orange-500 w-full md:w-44 transition font-bold"
          />
          <button
            type="submit"
            disabled={joiningGroup || !groupJoinCode.trim()}
            className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold text-xs shrink-0 transition cursor-pointer shadow-lg shadow-orange-950/40 flex items-center gap-1.5"
          >
            <span>{joiningGroup ? 'Entering...' : 'Join Arena'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Dynamic NTA Mock Generator Card */}
      <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl mb-8">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
          <div>
            <h2 className="text-xl font-black text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-orange-400" />
              <span>Configure Your Official Mock Paper</span>
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Select your exam scope, target duration, and question distribution.
            </p>
          </div>
        </div>

        <div className="space-y-6">
          {/* 0. Exam Mode: Solo vs Group Arena */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
              0. Session Format
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setMockMode('SOLO');
                }}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
                  mockMode === 'SOLO'
                    ? 'border-orange-500 bg-orange-950/30 text-white shadow-lg shadow-orange-950/40'
                    : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-orange-400" />
                    <h4 className="font-bold text-sm text-white">Solo CBT Simulation</h4>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Authentic exam hall atmosphere. Begins immediately upon launch.
                  </p>
                </div>
                {mockMode === 'SOLO' && (
                  <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white shrink-0 ml-2">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setMockMode('GROUP');
                }}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
                  mockMode === 'GROUP'
                    ? 'border-orange-500 bg-orange-950/30 text-white shadow-lg shadow-orange-950/40'
                    : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-amber-400" />
                    <h4 className="font-bold text-sm text-white">Host Group Mock Arena</h4>
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Multiplayer room lobby. Friends join via code; all get the <strong>same questions</strong>.
                  </p>
                </div>
                {mockMode === 'GROUP' && (
                  <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white shrink-0 ml-2">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Group Options (Privacy & Passcode) if Group Mode */}
          {mockMode === 'GROUP' && (
            <div className="p-4 bg-[#1e2433] border border-orange-500/20 rounded-2xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200">Room Security & Visibility</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      sound.click();
                      setIsPublic(true);
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isPublic ? 'bg-orange-500 text-white' : 'bg-[#151924] text-slate-400'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Public Lobby</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      sound.click();
                      setIsPublic(false);
                    }}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      !isPublic ? 'bg-orange-500 text-white' : 'bg-[#151924] text-slate-400'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Private Squad</span>
                  </button>
                </div>
              </div>

              {!isPublic && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">
                    Optional Passcode for Friends
                  </label>
                  <input
                    type="text"
                    placeholder="Leave blank for open invite code"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    className="w-full px-3.5 py-2 bg-[#141824] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono"
                  />
                </div>
              )}
            </div>
          )}

          {/* 1. Target Exam Pattern */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
              1. Target Exam Standard & Paper Format
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setTargetExam('MAIN');
                  if (![10, 15, 25, 30, 45, 75].includes(questionCount)) {
                    setQuestionCount(30);
                    setDurationMinutes(60);
                  }
                }}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
                  targetExam === 'MAIN'
                    ? 'border-orange-500 bg-orange-950/30 text-white shadow-lg shadow-orange-950/40'
                    : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                }`}
              >
                <div>
                  <h4 className="font-bold text-sm text-white">JEE (Main) Official Format</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Section A (80% Single Choice MCQ) + Section B (20% Numerical Value) per subject
                  </p>
                </div>
                {targetExam === 'MAIN' && (
                  <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white shrink-0 ml-2">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setTargetExam('ADVANCED');
                  if (![12, 18, 24, 36, 54, 72].includes(questionCount)) {
                    setQuestionCount(36);
                    setDurationMinutes(120);
                  }
                }}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
                  targetExam === 'ADVANCED'
                    ? 'border-orange-500 bg-orange-950/30 text-white shadow-lg shadow-orange-950/40'
                    : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                }`}
              >
                <div>
                  <h4 className="font-bold text-sm text-white">JEE (Advanced) Official Format</h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Multi-Correct, Numerical Value, Comprehension Passages & Matrix Match per subject
                  </p>
                </div>
                {targetExam === 'ADVANCED' && (
                  <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white shrink-0 ml-2">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* 2. Syllabus Mode & Chapter Selection */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                2. Syllabus Coverage & Chapter Selection
              </label>
              
              {/* Syllabus Mode Toggle */}
              <div className="flex items-center gap-1.5 p-1 bg-[#141824] rounded-xl border border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setSyllabusScope('FULL');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    !isCustomMode
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Full Syllabus</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setSyllabusScope('CUSTOM');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                    isCustomMode
                      ? 'bg-orange-500 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Custom Chapters (Part Syllabus)</span>
                  {selectedChapters.length > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-orange-950 text-white text-[10px] font-mono font-bold">
                      {selectedChapters.length}
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* FULL SYLLABUS: Subject Cards */}
            {!isCustomMode ? (
              <div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { name: 'Physics', color: 'border-cyan-500/40' },
                    { name: 'Chemistry', color: 'border-emerald-500/40' },
                    { name: 'Mathematics', color: 'border-amber-500/40' }
                  ].map(({ name }) => {
                    const isSelected = selectedSubjects.includes(name);
                    const activeIdx = selectedSubjects.indexOf(name);
                    const nSubj = Math.max(1, selectedSubjects.length);
                    const baseShare = Math.floor(questionCount / nSubj);
                    const remShare = questionCount % nSubj;
                    const subjCount = isSelected ? baseShare + (activeIdx < remShare ? 1 : 0) : 0;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => toggleSubject(name)}
                        className={`p-4 rounded-2xl border text-center transition cursor-pointer ${
                          isSelected
                            ? 'border-orange-500 bg-orange-950/40 text-white shadow-md'
                            : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                        }`}
                      >
                        <span className="font-black text-sm block">{name}</span>
                        <span className="text-[10px] text-slate-300 mt-0.5 block font-mono">
                          {isSelected ? `✓ ${subjCount} Qs (Weighted)` : '+ Excluded'}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-2 text-[11px] font-mono text-orange-400 text-right">
                  Chapter-Weighted Syllabus Allocation across active subjects
                </div>
              </div>
            ) : (
              /* CUSTOM CHAPTERS: Interactive Chapter Selector */
              <div className="bg-[#1e2433] border border-orange-500/30 rounded-2xl p-4 sm:p-5 shadow-inner">
                {/* Subject Tabs */}
                <div className="flex items-center gap-2 border-b border-white/10 pb-3 mb-4 overflow-x-auto">
                  {CANONICAL_SUBJECTS.map((subj) => {
                    const isActive = activeSubjectTab === subj;
                    const chList = chaptersMap[subj] || [];
                    const selCount = chList.filter((c) => selectedChapters.includes(c.chapter)).length;
                    return (
                      <button
                        key={subj}
                        type="button"
                        onClick={() => {
                          sound.click();
                          setActiveSubjectTab(subj);
                        }}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer border ${
                          isActive
                            ? 'bg-orange-500 text-white border-orange-400 shadow-md'
                            : 'bg-[#151924] text-slate-300 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <span>{subj}</span>
                        <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                          isActive ? 'bg-orange-950 text-white' : 'bg-slate-800 text-slate-400'
                        }`}>
                          {selCount > 0 ? `${selCount}/${chList.length}` : `${chList.length} Ch`}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Search Bar & Quick Action Controls */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 mb-4">
                  <div className="relative flex-1">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      placeholder={`Search ${activeSubjectTab} chapters (e.g. Kinematics, Equilibrium, Matrices)...`}
                      value={chapterSearch}
                      onChange={(e) => setChapterSearch(e.target.value)}
                      className="w-full pl-9 pr-8 py-2 bg-[#151924] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                    />
                    {chapterSearch && (
                      <button
                        type="button"
                        onClick={() => setChapterSearch('')}
                        className="absolute right-2.5 top-2 text-slate-400 hover:text-white"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleSelectAllInSubject(activeSubjectTab)}
                      className="px-3 py-1.5 bg-[#151924] hover:bg-[#202738] border border-white/10 hover:border-orange-500/40 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition cursor-pointer"
                    >
                      Select All {activeSubjectTab}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearAllInSubject(activeSubjectTab)}
                      className="px-3 py-1.5 bg-[#151924] hover:bg-[#202738] border border-white/10 hover:border-red-500/40 text-xs font-bold text-slate-400 hover:text-red-300 rounded-xl transition cursor-pointer"
                    >
                      Clear {activeSubjectTab}
                    </button>
                  </div>
                </div>

                {/* Categorized Units & Chapters Grid */}
                <div className="space-y-4 max-h-[340px] overflow-y-auto pr-1">
                  {Object.keys(unitsInActiveSubject).length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-400 font-mono">
                      No chapters matching "{chapterSearch}" in {activeSubjectTab}.
                    </div>
                  ) : (
                    Object.entries(unitsInActiveSubject).map(([unitName, chList]) => {
                      const allUnitSelected = chList.every((c) => selectedChapters.includes(c.chapter));
                      return (
                        <div key={unitName} className="bg-[#141824] border border-white/5 rounded-xl p-3">
                          {/* Unit Header */}
                          <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/5">
                            <div className="flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-orange-400"></span>
                              <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">{unitName}</span>
                              <span className="text-[10px] text-slate-400 font-mono">({chList.length})</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleSelectAllInUnit(chList)}
                              className="text-[10px] text-orange-400 hover:underline font-bold cursor-pointer"
                            >
                              {allUnitSelected ? 'Deselect Unit' : 'Select Unit'}
                            </button>
                          </div>

                          {/* Chapters Grid */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {chList.map((ch) => {
                              const isSelected = selectedChapters.includes(ch.chapter);
                              return (
                                <button
                                  key={ch.chapter}
                                  type="button"
                                  onClick={() => toggleChapter(ch.chapter)}
                                  className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-2 ${
                                    isSelected
                                      ? 'border-orange-500 bg-orange-950/40 text-white shadow-sm'
                                      : 'border-white/5 bg-[#1a2030] text-slate-300 hover:border-white/20'
                                  }`}
                                >
                                  <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0">
                                    <div className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                                      isSelected
                                        ? 'bg-orange-500 border-orange-500 text-white'
                                        : 'border-white/20 bg-slate-800'
                                    }`}>
                                      {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                    </div>
                                    <span className="text-xs font-medium truncate">{ch.chapter}</span>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-black/20 shrink-0">
                                    {ch.count} Qs
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Selected Chapters Summary Pill Bar */}
                <div className="mt-4 pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="text-xs font-bold text-white">
                      {selectedChapters.length === 0
                        ? 'No chapters selected yet (click above to add)'
                        : `${selectedChapters.length} Chapter${selectedChapters.length > 1 ? 's' : ''} Selected across ${activeCustomSubjects.join(', ')}`}
                    </span>
                    {selectedChapters.length > 0 && (
                      <span className="text-[11px] font-mono text-orange-400">
                        ({totalAvailableInSelected} Qs available in bank)
                      </span>
                    )}
                  </div>

                  {selectedChapters.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearAllChapters}
                      className="text-xs text-red-400 hover:text-red-300 font-bold transition cursor-pointer self-start sm:self-auto"
                    >
                      Clear All ({selectedChapters.length})
                    </button>
                  )}
                </div>

                {/* Selected Tag Cloud */}
                {selectedChapters.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
                    {selectedChapters.map((chName) => (
                      <span
                        key={chName}
                        className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-orange-950/60 border border-orange-500/40 text-orange-300 text-[11px] font-medium"
                      >
                        <span className="truncate max-w-[200px]">{chName}</span>
                        <button
                          type="button"
                          onClick={() => toggleChapter(chName)}
                          className="hover:text-white"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 3. Paper Size & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                3. Total Question Items ({targetExam === 'MAIN' ? 'JEE Main Scale' : 'JEE Advanced Scale'})
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {(targetExam === 'MAIN'
                  ? (isCustomMode ? [10, 15, 25, 30, 45, 75] : [15, 30, 45, 75])
                  : (isCustomMode ? [12, 18, 24, 36, 54, 72] : [18, 36, 54, 72])
                ).map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => {
                      sound.click();
                      setQuestionCount(cnt);
                      if (cnt >= 54) setDurationMinutes(180);
                      else if (cnt >= 36) setDurationMinutes(90);
                      else if (cnt >= 25) setDurationMinutes(60);
                      else if (cnt >= 15) setDurationMinutes(30);
                      else setDurationMinutes(20);
                    }}
                    className={`py-2.5 rounded-xl border text-center font-mono font-bold text-xs transition cursor-pointer ${
                      questionCount === cnt
                        ? 'border-orange-500 bg-orange-500 text-white shadow-md'
                        : 'border-white/10 bg-[#1e2433] text-slate-300 hover:border-white/20'
                    }`}
                  >
                    {cnt} Qs
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                4. Exam Duration
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[20, 30, 60, 90, 120, 180].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => {
                      sound.click();
                      setDurationMinutes(mins);
                    }}
                    className={`py-2.5 rounded-xl border text-center font-mono font-bold text-xs transition cursor-pointer ${
                      durationMinutes === mins
                        ? 'border-orange-500 bg-orange-500 text-white shadow-md'
                        : 'border-white/10 bg-[#1e2433] text-slate-300 hover:border-white/20'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Review Summary Ticket & Launch */}
          <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-300 space-y-1">
              <div>
                <span className="text-slate-500">Selected Blueprint: </span>
                <span className="font-bold text-white">
                  {targetExam === 'MAIN' ? 'JEE Main Format' : 'JEE Advanced Format'} •{' '}
                  {isCustomMode
                    ? (selectedChapters.length > 0
                        ? `${selectedChapters.length} Selected Chapter${selectedChapters.length > 1 ? 's' : ''} (${activeCustomSubjects.join(', ')})`
                        : 'No Chapters Selected')
                    : selectedSubjects.join(' + ')}
                </span>
                {mockMode === 'GROUP' && (
                  <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Group Arena Lobby
                  </span>
                )}
              </div>
              <div className="font-mono text-orange-400">
                {questionCount} Questions across {durationMinutes} Minutes
                {isCustomMode && selectedChapters.length > 0 && (
                  <span className="text-slate-400 font-sans text-[11px] ml-2">
                    (~{Math.round(questionCount / selectedChapters.length)} Qs/chapter)
                  </span>
                )}
              </div>
              <div className="text-[11px] text-emerald-400/90 font-medium">
                {targetExam === 'MAIN'
                  ? '✓ JEE Main Pattern: Section A (80% Single Choice) + Section B (20% Numerical) per subject.'
                  : '✓ JEE Advanced Pattern: Multi-Correct, Numerical, Comprehension Passages & Matrix Match per subject.'}
              </div>
              {mockMode === 'GROUP' ? (
                <div className="text-[11px] text-slate-400">
                  ⚡ Lobby will open so peers can join via Code. All candidates receive the <strong>exact same question paper</strong>.
                </div>
              ) : (
                <div className="text-[11px] text-slate-400">
                  ⏱ Solo examination begins immediately in full-screen Computer-Based Test mode.
                </div>
              )}
            </div>

            <button
              onClick={handleLaunchMock}
              disabled={loading || (isCustomMode && selectedChapters.length === 0)}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm rounded-2xl transition shadow-xl shadow-orange-950/50 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 glow-orange-subtle"
            >
              {loading ? (
                <span className="animate-pulse">Synthesizing Examination Paper...</span>
              ) : mockMode === 'GROUP' ? (
                <>
                  <Users className="w-5 h-5" />
                  <span>HOST GROUP MOCK ARENA</span>
                </>
              ) : (
                <>
                  <span>START OFFICIAL NTA MOCK</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
