import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import {
  Sliders,
  Clock,
  BookOpen,
  AlertCircle,
  Sparkles,
  Shield,
  Lock,
  Globe,
  Check,
  Search,
  Flame,
  Target,
  Zap,
  ArrowRight,
  ArrowLeft,
  Users,
  CheckCircle2,
  Layers,
  ChevronRight,
  RotateCcw,
  HelpCircle,
  Hash,
  Play,
  Swords
} from 'lucide-react';

export default function CustomGeneratorView({ user, onRoomCreated, onOpenAuth }) {
  // Wizard Navigation
  const [currentStep, setCurrentStep] = useState(1); // 1: Format & Types, 2: Chapters, 3: Questions & Time, 4: Room & Partners

  // Step 1: Format & Question Types
  const [mode, setMode] = useState('MOCK_TEST'); // 'MOCK_TEST' (Authentic CBT exam) or 'SPEED_DUEL' (PvP combat)
  const [targetExam, setTargetExam] = useState('MAIN'); // 'MAIN', 'ADVANCED', 'MIXED'
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState([
    'SINGLE_CHOICE',
    'NUMERICAL',
    'MULTIPLE_CHOICE',
    'MATRIX_MATCH',
    'COMPREHENSION'
  ]); // Multi-selection array
  const [difficulty, setDifficulty] = useState('MIXED'); // 'EASY', 'MEDIUM', 'HARD', 'MIXED'

  // Step 2: Syllabus & Chapter Multi-Selection
  const [chaptersMap, setChaptersMap] = useState({});
  const [selectedSubjects, setSelectedSubjects] = useState(['Physics', 'Chemistry', 'Mathematics']);
  const [activeSubjectTab, setActiveSubjectTab] = useState('Physics');
  const [selectedChapters, setSelectedChapters] = useState([]);
  const [chapterSearch, setChapterSearch] = useState('');

  // Step 3: Question Count & Timers
  const [questionCount, setQuestionCount] = useState(10);
  const [timePerQuestion, setTimePerQuestion] = useState(60); // for Speed Duel (seconds)
  const totalDurationMinutes = Math.round((questionCount * timePerQuestion) / 60) || 15;
  const [speedBonusEnabled, setSpeedBonusEnabled] = useState(true);
  const [negativePenalty, setNegativePenalty] = useState(-25);

  // Step 4: Room Setup & Partners
  const [roomTitle, setRoomTitle] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [passcode, setPasscode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Fetch chapters with unit metadata
  useEffect(() => {
    api.questions.getChapters()
      .then((data) => {
        setChaptersMap(data || {});
      })
      .catch(() => {});
  }, []);

  // Set default room title based on selected settings
  useEffect(() => {
    const examLabel = targetExam === 'MAIN' ? 'JEE Main' : targetExam === 'ADVANCED' ? 'JEE Advanced' : 'JEE';
    const modeLabel = 'Speed Duel';
    let topicLabel = 'Full Syllabus';
    if (selectedChapters.length === 1) {
      topicLabel = selectedChapters[0];
    } else if (selectedChapters.length > 1) {
      topicLabel = `${selectedChapters.length} Chapters Special`;
    } else if (selectedSubjects.length === 1) {
      topicLabel = `${selectedSubjects[0]} Blitz`;
    }
    setRoomTitle(`${examLabel} ${topicLabel} ${modeLabel}`);
  }, [targetExam, selectedChapters, selectedSubjects]);

  // Compute total available questions in currently selected chapters/subjects
  const availableChaptersAll = Object.entries(chaptersMap || {})
    .flatMap(([subj, list]) => (Array.isArray(list) ? list : []).map((item) => ({ ...item, subject: subj })));

  const matchingQuestionsCount = availableChaptersAll
    .filter((ch) => {
      if (selectedChapters.length > 0) {
        return selectedChapters.includes(ch.chapter);
      }
      return selectedSubjects.includes(ch.subject);
    })
    .reduce((sum, ch) => sum + (ch.count || 0), 0);

  // Chapters in the currently active subject tab
  const activeSubjectChapters = (Array.isArray(chaptersMap?.[activeSubjectTab]) ? chaptersMap[activeSubjectTab] : [])
    .filter((ch) => {
      if (!chapterSearch) return true;
      const q = chapterSearch.toLowerCase();
      return (ch.chapter || '').toLowerCase().includes(q) || (ch.unit && ch.unit.toLowerCase().includes(q));
    });

  // Group chapters in active subject by Unit
  const unitsInActiveSubject = activeSubjectChapters.reduce((acc, ch) => {
    const unitName = ch.unit || 'General Syllabus';
    if (!acc[unitName]) acc[unitName] = [];
    acc[unitName].push(ch);
    return acc;
  }, {});

  // Toggles
  const toggleChapter = (chapterName) => {
    sound.click();
    if (selectedChapters.includes(chapterName)) {
      setSelectedChapters(selectedChapters.filter((c) => c !== chapterName));
    } else {
      setSelectedChapters([...selectedChapters, chapterName]);
    }
  };

  const handleSelectAllInUnit = (chaptersInUnit) => {
    sound.click();
    const names = chaptersInUnit.map((c) => c.chapter);
    const allSelected = names.every((n) => selectedChapters.includes(n));
    if (allSelected) {
      setSelectedChapters(selectedChapters.filter((c) => !names.includes(c)));
    } else {
      const merged = Array.from(new Set([...selectedChapters, ...names]));
      setSelectedChapters(merged);
    }
  };

  const handleSelectAllInSubject = (subj) => {
    sound.click();
    const list = Array.isArray(chaptersMap?.[subj]) ? chaptersMap[subj] : [];
    const names = list.map((c) => c.chapter);
    const allSelected = names.length > 0 && names.every((n) => selectedChapters.includes(n));
    if (allSelected) {
      setSelectedChapters(selectedChapters.filter((c) => !names.includes(c)));
    } else {
      const merged = Array.from(new Set([...selectedChapters, ...names]));
      setSelectedChapters(merged);
    }
  };

  const handleQuickPreset = (presetKey) => {
    sound.click();
    if (presetKey === 'FULL_SYLLABUS') {
      setSelectedSubjects(['Physics', 'Chemistry', 'Mathematics']);
      setSelectedChapters([]);
    } else if (presetKey === 'MECHANICS') {
      setSelectedSubjects(['Physics']);
      setActiveSubjectTab('Physics');
      const phys = chaptersMap['Physics'] || [];
      const mech = phys.filter((c) => (c.unit || '').toLowerCase().includes('mech') || c.chapter.toLowerCase().includes('kinematics') || c.chapter.toLowerCase().includes('laws of motion')).map((c) => c.chapter);
      setSelectedChapters(mech.length > 0 ? mech : phys.map((c) => c.chapter));
    } else if (presetKey === 'CHEM_CORE') {
      setSelectedSubjects(['Chemistry']);
      setActiveSubjectTab('Chemistry');
      const chem = chaptersMap['Chemistry'] || [];
      setSelectedChapters(chem.slice(0, 4).map((c) => c.chapter));
    } else if (presetKey === 'MATH_ALGEBRA') {
      setSelectedSubjects(['Mathematics']);
      setActiveSubjectTab('Mathematics');
      const math = chaptersMap['Mathematics'] || [];
      setSelectedChapters(math.map((c) => c.chapter));
    } else if (presetKey === 'CLEAR') {
      setSelectedChapters([]);
    }
  };

  // Step Validation & Navigation
  const goToNextStep = () => {
    sound.click();
    setError('');
    if (currentStep === 1) {
      setCurrentStep(2);
    } else if (currentStep === 2) {
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    }
  };

  const goToPrevStep = () => {
    sound.click();
    setError('');
    setCurrentStep((prev) => Math.max(1, prev - 1));
  };

  // Submission / Room Creation
  const handleCreateRoom = async (startInstantly = false) => {
    if (!user) {
      onOpenAuth();
      return;
    }

    sound.click();
    setError('');
    setLoading(true);

    try {
      const isMock = mode === 'MOCK_TEST';
      const room = await api.rooms.create({
        mode,
        preset_name: roomTitle.trim() || (isMock ? 'Custom Blueprint Mock Test' : 'Custom Battle Blueprint'),
        subjects: selectedSubjects,
        chapters: selectedChapters.length > 0 ? selectedChapters : null,
        difficulty_tier: difficulty,
        target_exam: targetExam,
        question_type_filter: selectedQuestionTypes.length === 1 ? selectedQuestionTypes[0] : (selectedQuestionTypes.length === 5 ? 'ALL' : 'MIXED'),
        question_types: selectedQuestionTypes,
        question_count: parseInt(questionCount, 10),
        time_per_question: isMock ? 90 : parseInt(timePerQuestion, 10),
        total_duration_minutes: parseInt(totalDurationMinutes, 10),
        timing_type: 'SYNCHRONIZED',
        is_public: isMock ? false : isPublic,
        passcode: passcode.trim() || null,
        negative_marking: isMock ? -1.0 : parseFloat(negativePenalty),
        base_correct_score: isMock ? 100.0 : 100.0,
        speed_bonus_enabled: isMock ? false : speedBonusEnabled,
      });

      if ((isMock || startInstantly) && room?.code) {
        // Start immediately for official CBT Mock tests
        try {
          const startedRoom = await api.rooms.start(room.code);
          onRoomCreated(startedRoom);
          return;
        } catch (_) {}
      }

      onRoomCreated(room);
    } catch (err) {
      setError(err.message || 'Failed to initialize custom battle room.');
    } finally {
      setLoading(false);
    }
  };

  // Steps definition for wizard progress bar
  const STEPS = [
    { id: 1, title: 'Types & Format', subtitle: 'Exam, types, battle style', icon: Target },
    { id: 2, title: 'Chapter Selector', subtitle: 'Subjects, units & topics', icon: BookOpen },
    { id: 3, title: 'Questions & Time', subtitle: 'Item count & timers', icon: Clock },
    { id: 4, title: 'Room & Partners', subtitle: 'Launch & invite friends', icon: Users },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 page-transition">
      {/* Page Header */}
      <div className="mb-6 border-b border-white/10 pb-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-950/80 border border-orange-500/40 text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Sliders className="w-3.5 h-3.5" />
              <span>Marks-Style Interactive Wizard</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Test Generation Studio
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Configure question types, hand-pick chapters across PCM, calibrate timers, and duel in real time.
            </p>
          </div>

          {/* Quick Syllabus Presets */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => handleQuickPreset('FULL_SYLLABUS')}
              className="px-3 py-1.5 rounded-xl bg-[#293144] hover:bg-orange-500/20 border border-white/10 hover:border-orange-500/40 text-xs text-slate-300 hover:text-orange-300 font-bold transition cursor-pointer"
            >
              ⚡ Full Syllabus
            </button>
            <button
              type="button"
              onClick={() => handleQuickPreset('MECHANICS')}
              className="px-3 py-1.5 rounded-xl bg-[#293144] hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-500/40 text-xs text-slate-300 hover:text-cyan-300 font-bold transition cursor-pointer"
            >
              🎯 Mechanics
            </button>
            <button
              type="button"
              onClick={() => handleQuickPreset('CHEM_CORE')}
              className="px-3 py-1.5 rounded-xl bg-[#293144] hover:bg-emerald-500/20 border border-white/10 hover:border-emerald-500/40 text-xs text-slate-300 hover:text-emerald-300 font-bold transition cursor-pointer"
            >
              🧪 Chemistry
            </button>
            <button
              type="button"
              onClick={() => handleQuickPreset('MATH_ALGEBRA')}
              className="px-3 py-1.5 rounded-xl bg-[#293144] hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/40 text-xs text-slate-300 hover:text-amber-300 font-bold transition cursor-pointer"
            >
              📐 Maths
            </button>
          </div>
        </div>

        {/* Wizard Progress Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-6">
          {STEPS.map((s) => {
            const Icon = s.icon;
            const isCompleted = currentStep > s.id;
            const isActive = currentStep === s.id;

            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  sound.click();
                  setCurrentStep(s.id);
                }}
                className={`p-3 rounded-2xl border text-left transition flex items-center gap-3 cursor-pointer ${
                  isActive
                    ? 'bg-orange-950/30 border-orange-500 shadow-md shadow-orange-950/40'
                    : isCompleted
                    ? 'bg-[#262c3c] border-emerald-500/40 hover:border-emerald-500/60'
                    : 'bg-[#1e2433] border-white/10 hover:border-white/20 opacity-70'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs ${
                    isActive
                      ? 'bg-orange-500 text-white shadow-md'
                      : isCompleted
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {isCompleted ? <Check className="w-4 h-4 stroke-[3]" /> : s.id}
                </div>
                <div className="overflow-hidden">
                  <div className={`text-xs font-black truncate ${isActive ? 'text-white' : isCompleted ? 'text-emerald-300' : 'text-slate-400'}`}>
                    {s.title}
                  </div>
                  <div className="text-[10px] text-slate-500 truncate hidden sm:block">
                    {s.subtitle}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center gap-3 animate-shake">
          <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 1: TEST FORMAT & QUESTION TYPES                                      */}
      {/* ========================================================================= */}
      {currentStep === 1 && (
        <div className="space-y-6 page-transition">
          {/* Environment Format Selection */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
            <div className="mb-5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-950 border border-orange-500/30 text-orange-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                <Layers className="w-3 h-3" />
                <span>Test Environment</span>
              </div>
              <h2 className="text-lg font-black text-white flex items-center gap-2">
                Choose Examination Format
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Select whether this blueprint is treated as an official NTA Mock Test or a live Multiplayer Speed Duel.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Option 1: Official CBT Mock Test */}
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setMode('MOCK_TEST');
                }}
                className={`p-5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  mode === 'MOCK_TEST'
                    ? 'border-orange-500 bg-orange-950/30 text-white shadow-lg shadow-orange-950/50 glow-orange-subtle'
                    : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2.5 py-1 rounded-lg bg-blue-500/20 text-blue-400 text-[10px] font-black font-mono">
                      RECOMMENDED
                    </span>
                    {mode === 'MOCK_TEST' && (
                      <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-sm text-white flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-orange-400" />
                    <span>Official CBT Mock Examination</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Authentic National Testing Agency environment with question palette, subject sections, timer, +4/-1 marking, and full post-test analytical report.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10 text-[11px] font-bold text-emerald-400 font-mono">
                  Saves to Test History & Generates Full Analysis
                </div>
              </button>

              {/* Option 2: Multiplayer Speed Duel */}
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setMode('SPEED_DUEL');
                }}
                className={`p-5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                  mode === 'SPEED_DUEL'
                    ? 'border-orange-500 bg-orange-950/30 text-white shadow-lg shadow-orange-950/50 glow-orange-subtle'
                    : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2.5 py-1 rounded-lg bg-purple-500/20 text-purple-400 text-[10px] font-black font-mono">
                      LIVE COMBAT
                    </span>
                    {mode === 'SPEED_DUEL' && (
                      <span className="w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center text-white">
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      </span>
                    )}
                  </div>
                  <h3 className="font-black text-sm text-white flex items-center gap-2">
                    <Swords className="w-4 h-4 text-purple-400" />
                    <span>Multiplayer Speed Duel Arena</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    Fast-paced 1v1 PvP combat with live leaderboard, live contenders, speed multipliers, and Elo rating progression.
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/10 text-[11px] font-bold text-purple-400 font-mono">
                  Real-time PvP Arena
                </div>
              </button>
            </div>
          </div>

          {/* Question Type Multi-Selection */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-950 border border-orange-500/30 text-orange-400 text-[10px] font-bold uppercase tracking-wider mb-1.5">
                  <Hash className="w-3 h-3" />
                  <span>Multi-Type Filter</span>
                </div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  Select Question Types (Multi-Select)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Choose one or multiple question structures to combine in this test session.
                </p>
              </div>

              {/* Quick Type Presets */}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setSelectedQuestionTypes(['SINGLE_CHOICE', 'NUMERICAL', 'MULTIPLE_CHOICE', 'MATRIX_MATCH', 'COMPREHENSION']);
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    selectedQuestionTypes.length === 5
                      ? 'bg-orange-500 text-white border-orange-400 shadow-sm'
                      : 'bg-[#1e2433] text-slate-300 border-white/10 hover:border-white/20'
                  }`}
                >
                  All Types ({selectedQuestionTypes.length}/5)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setSelectedQuestionTypes(['SINGLE_CHOICE']);
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    selectedQuestionTypes.length === 1 && selectedQuestionTypes[0] === 'SINGLE_CHOICE'
                      ? 'bg-orange-500 text-white border-orange-400'
                      : 'bg-[#1e2433] text-slate-300 border-white/10 hover:border-white/20'
                  }`}
                >
                  MCQ Only
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setSelectedQuestionTypes(['SINGLE_CHOICE', 'NUMERICAL']);
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    selectedQuestionTypes.length === 2 && selectedQuestionTypes.includes('SINGLE_CHOICE') && selectedQuestionTypes.includes('NUMERICAL')
                      ? 'bg-cyan-500 text-black border-cyan-400 font-black'
                      : 'bg-[#1e2433] text-slate-300 border-white/10 hover:border-white/20'
                  }`}
                >
                  MCQ + NVQ
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setSelectedQuestionTypes(['SINGLE_CHOICE', 'NUMERICAL', 'MULTIPLE_CHOICE', 'MATRIX_MATCH']);
                  }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
                    selectedQuestionTypes.length === 4
                      ? 'bg-purple-600 text-white border-purple-400'
                      : 'bg-[#1e2433] text-slate-300 border-white/10 hover:border-white/20'
                  }`}
                >
                  JEE Advanced Mix
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[
                {
                  id: 'SINGLE_CHOICE',
                  label: 'Single Choice (MCQ)',
                  tag: 'MCQ',
                  tagColor: 'bg-orange-500/20 text-orange-400',
                  desc: 'Standard 4-option questions with 1 correct option. Ideal for rapid recall, speed drilling, and standard Section A.',
                  footer: '+4 / -1 Marking'
                },
                {
                  id: 'NUMERICAL',
                  label: 'Numerical Value (NVQ)',
                  tag: 'NUMERICAL',
                  tagColor: 'bg-cyan-500/20 text-cyan-400',
                  desc: 'Integer or decimal fill-in-the-blank questions (no options provided). Tests absolute algebraic accuracy.',
                  footer: 'Zero Guesswork'
                },
                {
                  id: 'MULTIPLE_CHOICE',
                  label: 'Multiple Choice (Advanced)',
                  tag: 'MULTI-CORRECT',
                  tagColor: 'bg-purple-500/20 text-purple-400',
                  desc: 'One or more options may be correct. The hallmark test pattern of JEE Advanced requiring rigorous multi-case evaluation.',
                  footer: 'Advanced Benchmark'
                },
                {
                  id: 'MATRIX_MATCH',
                  label: 'Matrix / Column Match',
                  tag: 'MATRIX MATCH',
                  tagColor: 'bg-blue-500/20 text-blue-400',
                  desc: 'Match concepts between Column I and Column II (P, Q, R, S). Comprehensive evaluation of linked scientific theories.',
                  footer: 'List-I to List-II'
                },
                {
                  id: 'COMPREHENSION',
                  label: 'Paragraph / Passage',
                  tag: 'COMPREHENSION',
                  tagColor: 'bg-amber-500/20 text-amber-400',
                  desc: 'Linked multi-step questions based on experimental or theoretical case study paragraphs. Tests deep analytical reading.',
                  footer: 'Contextual Reasoning'
                }
              ].map((qt) => {
                const isSelected = selectedQuestionTypes.includes(qt.id);
                return (
                  <button
                    key={qt.id}
                    type="button"
                    onClick={() => {
                      sound.click();
                      if (isSelected) {
                        if (selectedQuestionTypes.length > 1) {
                          setSelectedQuestionTypes(selectedQuestionTypes.filter(t => t !== qt.id));
                        }
                      } else {
                        setSelectedQuestionTypes([...selectedQuestionTypes, qt.id]);
                      }
                    }}
                    className={`p-5 rounded-2xl border text-left transition cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'border-orange-500 bg-orange-950/30 text-white shadow-lg shadow-orange-950/50 glow-orange-subtle'
                        : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className={`px-2.5 py-1 rounded-lg text-[10px] font-black font-mono ${qt.tagColor}`}>
                          {qt.tag}
                        </span>
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center transition ${
                          isSelected
                            ? 'bg-orange-500 text-white shadow-md'
                            : 'border border-slate-600 bg-slate-800/60 text-transparent'
                        }`}>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                        </span>
                      </div>
                      <h3 className="font-black text-sm text-white">{qt.label}</h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {qt.desc}
                      </p>
                    </div>
                    <div className="mt-4 pt-3 border-t border-white/10 text-[11px] font-bold text-slate-300 font-mono flex items-center justify-between">
                      <span>{qt.footer}</span>
                      <span className={`text-[10px] font-black uppercase ${isSelected ? 'text-orange-400' : 'text-slate-500'}`}>
                        {isSelected ? 'INCLUDED ✓' : 'TAP TO ADD'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Target Exam & Difficulty Calibration */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  <Flame className="w-4 h-4 text-orange-400" />
                  <span>Target Examination & Difficulty Tier</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Calibrate problem rigor according to official JEE Main or Advanced standards for your Speed Duel.
                </p>
              </div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[11px] font-bold font-mono self-start sm:self-auto">
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Speed Duel Arena</span>
              </div>
            </div>

            {/* Exam and Difficulty Selectors */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-4 border-t border-white/10">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">Target Examination</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'MAIN', label: 'JEE Main' },
                    { id: 'ADVANCED', label: 'JEE Advanced' },
                    { id: 'MIXED', label: 'Mixed' }
                  ].map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => {
                        sound.click();
                        setTargetExam(ex.id);
                      }}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        targetExam === ex.id
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-[#1e2433] text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">Difficulty Tier</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { id: 'MIXED', label: 'Mixed' },
                    { id: 'EASY', label: 'Easy' },
                    { id: 'MEDIUM', label: 'Medium' },
                    { id: 'HARD', label: 'Hard' }
                  ].map((df) => (
                    <button
                      key={df.id}
                      type="button"
                      onClick={() => {
                        sound.click();
                        setDifficulty(df.id);
                      }}
                      className={`py-2 px-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        difficulty === df.id
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-[#1e2433] text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {df.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Step 1 Footer Action */}
          <div className="flex items-center justify-end gap-4">
            <button
              type="button"
              onClick={goToNextStep}
              className="px-6 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm rounded-2xl transition shadow-xl shadow-orange-950/50 flex items-center gap-2 cursor-pointer glow-orange"
            >
              <span>Next: Select Chapters</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 2: NEATLY ARRANGED CHAPTER SELECTOR (MARKS APP STYLE)               */}
      {/* ========================================================================= */}
      {currentStep === 2 && (
        <div className="space-y-6 page-transition">
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
            {/* Header with Search and Selection Clear */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h2 className="text-lg font-black text-white flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-orange-400" />
                  <span>Neat Chapter & Unit Selector</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Hand-pick any combination of chapters or units. Questions will be drawn exclusively from your selections.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap self-start sm:self-auto">
                {user?.learnt_chapters && user.learnt_chapters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.click();
                      setSelectedChapters(Array.from(new Set([...user.learnt_chapters])));
                    }}
                    className="px-3 py-1.5 rounded-xl bg-cyan-950/60 border border-cyan-500/40 text-cyan-400 text-xs font-bold hover:bg-cyan-900/60 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Select All Learnt Chapters ({user.learnt_chapters.length})</span>
                  </button>
                )}

                {selectedChapters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      sound.click();
                      setSelectedChapters([]);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-orange-950/60 border border-orange-500/40 text-orange-400 text-xs font-bold hover:bg-orange-900/60 transition cursor-pointer flex items-center gap-1.5"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Clear All ({selectedChapters.length} Selected)</span>
                  </button>
                )}
              </div>
            </div>

            {/* Subject Navigation Tabs (Physics, Chemistry, Maths) */}
            <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-6 overflow-x-auto">
              {[
                { name: 'Physics', icon: '⚛️', color: 'cyan', count: chaptersMap['Physics']?.length || 0 },
                { name: 'Chemistry', icon: '🧪', color: 'emerald', count: chaptersMap['Chemistry']?.length || 0 },
                { name: 'Mathematics', icon: '📐', color: 'orange', count: chaptersMap['Mathematics']?.length || 0 },
              ].map((subj) => {
                const isActive = activeSubjectTab === subj.name;
                const subjChapters = (chaptersMap[subj.name] || []).map((c) => c.chapter);
                const selectedInSubj = subjChapters.filter((c) => selectedChapters.includes(c)).length;

                return (
                  <button
                    key={subj.name}
                    type="button"
                    onClick={() => {
                      sound.click();
                      setActiveSubjectTab(subj.name);
                    }}
                    className={`px-4 py-2.5 rounded-2xl font-bold text-xs transition cursor-pointer flex items-center gap-2.5 border shrink-0 ${
                      isActive
                        ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-950/40'
                        : 'bg-[#1e2433] text-slate-300 border-white/10 hover:border-white/30'
                    }`}
                  >
                    <span>{subj.icon}</span>
                    <span>{subj.name}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                      isActive ? 'bg-orange-950 text-white' : 'bg-slate-800 text-slate-400'
                    }`}>
                      {selectedInSubj > 0 ? `${selectedInSubj}/${subj.count}` : `${subj.count} Ch`}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Chapter Search Bar and Subject Select-All Action */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                <input
                  type="text"
                  placeholder={`Search in ${activeSubjectTab} (e.g. Kinematics, Equilibrium, Sequences)...`}
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 bg-[#1e2433] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500"
                />
              </div>

              <button
                type="button"
                onClick={() => handleSelectAllInSubject(activeSubjectTab)}
                className="px-4 py-2.5 bg-[#1e2433] hover:bg-[#293144] border border-white/10 hover:border-orange-500/40 text-xs font-bold text-slate-300 hover:text-white rounded-xl transition cursor-pointer shrink-0"
              >
                Select All {activeSubjectTab}
              </button>
            </div>

            {/* Categorized Units & Chapters Grid (Marks App Layout) */}
            <div className="space-y-6 max-h-[460px] overflow-y-auto pr-1">
              {Object.keys(unitsInActiveSubject).length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500 font-mono">
                  No chapters found matching "{chapterSearch}".
                </div>
              ) : (
                Object.entries(unitsInActiveSubject).map(([unitName, chList]) => {
                  const allUnitSelected = chList.every((c) => selectedChapters.includes(c.chapter));

                  return (
                    <div key={unitName} className="bg-[#1e2433] border border-white/10 rounded-2xl p-4">
                      {/* Unit Header */}
                      <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-400"></span>
                          <span className="text-xs font-black text-white uppercase tracking-wider">{unitName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({chList.length} Chapters)</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectAllInUnit(chList)}
                          className="text-[11px] text-orange-400 hover:underline font-bold cursor-pointer"
                        >
                          {allUnitSelected ? 'Deselect Unit' : 'Select All in Unit'}
                        </button>
                      </div>

                      {/* Chapters Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {chList.map((ch) => {
                          const isSelected = selectedChapters.includes(ch.chapter);

                          return (
                            <button
                              key={ch.chapter}
                              type="button"
                              onClick={() => toggleChapter(ch.chapter)}
                              className={`p-3 rounded-xl border text-left transition cursor-pointer flex items-center justify-between gap-3 ${
                                isSelected
                                  ? 'bg-orange-500/15 border-orange-500/70 text-white shadow-sm'
                                  : 'bg-[#262c3c] border-white/5 text-slate-300 hover:border-white/20'
                              }`}
                            >
                              <div className="flex items-center gap-3 overflow-hidden">
                                <div
                                  className={`w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition ${
                                    isSelected
                                      ? 'bg-orange-500 border-orange-500 text-white'
                                      : 'border-white/20 bg-slate-800'
                                  }`}
                                >
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>
                                <span className="text-xs font-bold truncate leading-tight">{ch.chapter}</span>
                              </div>
                              <span className="px-2 py-0.5 rounded-full bg-[#1e2433] border border-white/10 text-[10px] font-mono text-slate-400 shrink-0">
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

            {/* Floating Selection Summary Drawer */}
            <div className="mt-6 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1e2433] p-4 rounded-2xl">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>
                    {selectedChapters.length === 0
                      ? 'All Chapters in selected subjects will be shuffled'
                      : `${selectedChapters.length} Chapter(s) Selected`}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                  Estimated pool size: {matchingQuestionsCount} authentic questions available
                </div>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={goToPrevStep}
                  className="px-4 py-2.5 rounded-xl border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={goToNextStep}
                  className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-black rounded-xl transition shadow-md shadow-orange-950/40 flex items-center gap-1.5 cursor-pointer glow-orange"
                >
                  <span>Next: Questions & Timers</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 3: QUESTIONS, TIMERS & SCORING (MARKS APP STYLE)                     */}
      {/* ========================================================================= */}
      {currentStep === 3 && (
        <div className="space-y-6 page-transition">
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
            <h2 className="text-lg font-black text-white flex items-center gap-2 mb-1">
              <Clock className="w-5 h-5 text-orange-400" />
              <span>Questions & Timing Calibration</span>
            </h2>
            <p className="text-xs text-slate-400 mb-6">
              Configure question volume, test duration, and pacing to match your training target.
            </p>

            {/* Number of Questions Section */}
            <div className="mb-8 p-5 rounded-2xl bg-[#1e2433] border border-white/10">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Hash className="w-4 h-4 text-orange-400" />
                  <span>Number of Questions</span>
                </label>
                <span className="px-3 py-1 bg-orange-500/20 border border-orange-500/40 text-orange-400 rounded-xl font-mono text-sm font-black">
                  {questionCount} Questions
                </span>
              </div>

              {/* Quick Pills */}
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-4">
                {[5, 10, 15, 20, 25, 30].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => {
                      sound.click();
                      setQuestionCount(num);
                    }}
                    className={`py-2 rounded-xl text-xs font-bold font-mono transition cursor-pointer border ${
                      questionCount === num
                        ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                        : 'bg-[#262c3c] text-slate-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {num} Qs
                  </button>
                ))}
              </div>

              {/* Slider for precision */}
              <input
                type="range"
                min="3"
                max="35"
                value={questionCount}
                onChange={(e) => setQuestionCount(parseInt(e.target.value, 10))}
                className="w-full accent-orange-500 cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>3 (Sprint)</span>
                <span>15 (Standard)</span>
                <span>35 (Marathon)</span>
              </div>
            </div>

            {/* Timer Calibration Section */}
            <div className="mb-8 p-5 rounded-2xl bg-[#1e2433] border border-white/10">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-2">
                    <Zap className="w-4 h-4 text-orange-400" />
                    <span>Timer Per Question</span>
                  </label>
                  <span className="px-3 py-1 bg-orange-500/20 border border-orange-500/40 text-orange-400 rounded-xl font-mono text-sm font-black">
                    {timePerQuestion}s / Item
                  </span>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
                  {[30, 45, 60, 90, 120, 180].map((sec) => (
                    <button
                      key={sec}
                      type="button"
                      onClick={() => {
                        sound.click();
                        setTimePerQuestion(sec);
                      }}
                      className={`py-2 rounded-xl text-xs font-bold font-mono transition cursor-pointer border ${
                        timePerQuestion === sec
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                          : 'bg-[#262c3c] text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {sec}s
                    </button>
                  ))}
                </div>
                <div className="text-[11px] text-slate-400 font-mono">
                  Estimated Match Runtime: ~{Math.round((questionCount * timePerQuestion) / 60)} minutes total.
                </div>
              </div>
            </div>

            {/* Scoring & Speed Bonus */}
            <div className="p-5 rounded-2xl bg-[#1e2433] border border-white/10 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="text-xs font-black text-white block mb-1">Standard JEE Scoring</span>
                <p className="text-xs text-slate-400 leading-relaxed">
                  +4 Marks for correct solution, -1 Mark for incorrect attempt. 0 for unattempted.
                </p>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-[#262c3c] border border-white/10">
                <div>
                  <span className="text-xs font-bold text-white block">Speed Score Multiplier</span>
                  <span className="text-[10px] text-slate-400">Award up to +50 bonus points for quick answers</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSpeedBonusEnabled(!speedBonusEnabled)}
                  className={`w-12 h-6 rounded-full transition cursor-pointer relative ${
                    speedBonusEnabled ? 'bg-orange-500' : 'bg-slate-700'
                  }`}
                >
                  <span
                    className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${
                      speedBonusEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* Navigation Actions */}
            <div className="flex items-center justify-between gap-4 mt-8 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={goToPrevStep}
                className="px-5 py-3 rounded-xl border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Chapters</span>
              </button>
              <button
                type="button"
                onClick={goToNextStep}
                className="px-6 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-black rounded-xl transition shadow-md shadow-orange-950/40 flex items-center gap-1.5 cursor-pointer glow-orange"
              >
                <span>Next: Room & Partners</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* STEP 4: ROOM SETUP & ADD PARTNERS (LAUNCH & CHALLENGE)                     */}
      {/* ========================================================================= */}
      {currentStep === 4 && (
        <div className="space-y-6 page-transition">
          {/* Blueprint Summary Review Ticket */}
          <div className="bg-[#262c3c] border border-orange-500/40 rounded-3xl p-6 sm:p-8 shadow-xl glow-orange-subtle">
            <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/10">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-orange-950 border border-orange-500/40 text-orange-400 text-[10px] font-bold uppercase tracking-wider mb-1">
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                  <span>Configured Blueprint</span>
                </div>
                <h2 className="text-xl font-black text-white">{roomTitle}</h2>
              </div>
              <div className="text-right font-mono">
                <span className="text-xs text-slate-400 block">Total Items</span>
                <span className="text-lg font-black text-orange-400">{questionCount} Qs</span>
              </div>
            </div>

            {/* Key Specs Matrix */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 font-mono text-xs">
              <div className="p-3 rounded-xl bg-[#1e2433] border border-white/10">
                <span className="text-slate-500 block text-[10px]">FORMAT</span>
                <span className="font-bold text-white">
                  {mode === 'MOCK_TEST' ? '📖 NTA CBT Mock' : '⚡ Speed Duel'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#1e2433] border border-white/10">
                <span className="text-slate-500 block text-[10px]">EXAM TARGET</span>
                <span className="font-bold text-white">
                  {targetExam === 'MAIN' ? 'JEE Main' : targetExam === 'ADVANCED' ? 'JEE Advanced' : 'Mixed'}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#1e2433] border border-white/10">
                <span className="text-slate-500 block text-[10px]">QUESTION TYPE</span>
                <span className="font-bold text-white truncate block">
                  {selectedQuestionTypes.length === 5
                    ? 'All Types (5)'
                    : selectedQuestionTypes.length === 1
                    ? selectedQuestionTypes[0].replace('_', ' ')
                    : `${selectedQuestionTypes.length} Types`}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-[#1e2433] border border-white/10">
                <span className="text-slate-500 block text-[10px]">TIMING</span>
                <span className="font-bold text-white">
                  {mode === 'MOCK_TEST' ? `${totalDurationMinutes}m Exam` : `${timePerQuestion}s / Q`}
                </span>
              </div>
            </div>

            {/* Chapter Selection Tag Cloud */}
            <div className="mb-6 p-4 rounded-2xl bg-[#1e2433] border border-white/10">
              <span className="text-[10px] font-mono text-slate-500 uppercase block mb-2">TARGET SYLLABUS ({selectedChapters.length > 0 ? `${selectedChapters.length} Chapters` : 'All Chapters'}):</span>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {selectedChapters.length === 0 ? (
                  <span className="text-xs text-orange-300 font-bold">Full Syllabus across {selectedSubjects.join(', ')}</span>
                ) : (
                  selectedChapters.map((c) => (
                    <span key={c} className="px-2.5 py-1 rounded-lg bg-[#262c3c] border border-white/10 text-[11px] text-slate-300">
                      {c}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Room Settings (Title & Privacy) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">Room / Battle Title</label>
                <input
                  type="text"
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  placeholder="Enter a custom title for this test..."
                  className="w-full px-4 py-2.5 bg-[#1e2433] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">Room Privacy & Passcode</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsPublic(true)}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      isPublic ? 'bg-orange-500 text-white' : 'bg-[#1e2433] text-slate-400 border border-white/10'
                    }`}
                  >
                    <Globe className="w-3.5 h-3.5" />
                    <span>Public</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPublic(false)}
                    className={`px-3.5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                      !isPublic ? 'bg-orange-500 text-white' : 'bg-[#1e2433] text-slate-400 border border-white/10'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Private</span>
                  </button>
                  {!isPublic && (
                    <input
                      type="password"
                      placeholder="Passcode"
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      maxLength={10}
                      className="flex-1 px-3 py-2 bg-[#1e2433] border border-white/20 rounded-xl text-xs text-white font-mono"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Launch & Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-white/10">
              <button
                type="button"
                onClick={goToPrevStep}
                className="px-5 py-3.5 rounded-2xl border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-1.5 w-full sm:w-auto justify-center"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Timers</span>
              </button>

              <div className="flex flex-col sm:flex-row items-center gap-3 w-full sm:w-auto">
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleCreateRoom(true)}
                  className="px-6 py-4 bg-[#1e2433] hover:bg-[#293144] border border-white/20 text-white font-extrabold text-sm rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto disabled:opacity-50"
                >
                  <Play className="w-4 h-4 text-emerald-400 fill-current" />
                  <span>Start Solo Test</span>
                </button>

                <button
                  type="button"
                  disabled={loading}
                  onClick={() => handleCreateRoom(false)}
                  className="px-8 py-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm rounded-2xl transition shadow-xl shadow-orange-950/50 flex items-center justify-center gap-3 cursor-pointer w-full sm:w-auto disabled:opacity-50 glow-orange"
                >
                  {loading ? (
                    <span className="animate-pulse">Creating Room...</span>
                  ) : (
                    <>
                      <Users className="w-5 h-5" />
                      <span>CREATE ROOM & INVITE PARTNERS</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
