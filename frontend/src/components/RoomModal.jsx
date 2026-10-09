import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import { Swords, Clock, BookOpen, AlertCircle, Sparkles, X, Shield, Lock, Globe, Check, Search } from 'lucide-react';

export default function RoomModal({ isOpen, onClose, onRoomCreated }) {
  // Mode & Presets
  const [mode, setMode] = useState('SPEED_DUEL');
  const [presetName, setPresetName] = useState(null);

  // Subject & Chapter Selection
  const [selectedSubjects, setSelectedSubjects] = useState(['Physics', 'Chemistry', 'Mathematics']);
  const [selectedChapters, setSelectedChapters] = useState([]);
  const [chapterSearch, setChapterSearch] = useState('');
  const [chaptersMap, setChaptersMap] = useState({});

  // Question Filters
  const [difficulty, setDifficulty] = useState('MIXED');
  const [targetExam, setTargetExam] = useState('MIXED');
  const [questionTypeFilter, setQuestionTypeFilter] = useState('ALL');
  const [questionCount, setQuestionCount] = useState(5);

  // Timing & Pace
  const [timingType, setTimingType] = useState('SYNCHRONIZED');
  const [timePerQuestion, setTimePerQuestion] = useState(90);
  const [totalDurationMinutes, setTotalDurationMinutes] = useState(60);

  // Scoring Rules
  const [negativePenalty, setNegativePenalty] = useState(-25);
  const [speedBonusEnabled, setSpeedBonusEnabled] = useState(true);

  // Privacy & Access
  const [isPublic, setIsPublic] = useState(true);
  const [passcode, setPasscode] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      api.questions.getChapters()
        .then((data) => setChaptersMap(data || {}))
        .catch(() => {});
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // Compute available chapters matching chosen subjects
  const availableChapters = Object.entries(chaptersMap)
    .filter(([subj]) => selectedSubjects.includes(subj))
    .flatMap(([subj, list]) => list.map((item) => ({ ...item, subject: subj })))
    .filter((ch) => ch.chapter.toLowerCase().includes(chapterSearch.toLowerCase()));

  const toggleSubject = (subj) => {
    sound.click();
    if (selectedSubjects.includes(subj)) {
      if (selectedSubjects.length > 1) {
        setSelectedSubjects(selectedSubjects.filter((s) => s !== subj));
      }
    } else {
      setSelectedSubjects([...selectedSubjects, subj]);
    }
  };

  const toggleChapter = (chap) => {
    sound.click();
    if (selectedChapters.includes(chap)) {
      setSelectedChapters(selectedChapters.filter((c) => c !== chap));
    } else {
      setSelectedChapters([...selectedChapters, chap]);
    }
  };

  const applyPreset = (presetKey) => {
    sound.click();
    if (presetKey === 'MAIN_MOCK') {
      setMode('MOCK_TEST');
      setPresetName('JEE Main Full Mock');
      setSelectedSubjects(['Physics', 'Chemistry', 'Mathematics']);
      setSelectedChapters([]);
      setDifficulty('MEDIUM');
      setQuestionCount(25);
      setTotalDurationMinutes(60);
      setNegativePenalty(-1);
      setSpeedBonusEnabled(false);
    } else if (presetKey === 'PHYSICS_BLITZ') {
      setMode('SPEED_DUEL');
      setPresetName('Physics Mechanics Sprint');
      setSelectedSubjects(['Physics']);
      setSelectedChapters(['Kinematics 1D & 2D', 'Mathematical Tools']);
      setDifficulty('MIXED');
      setQuestionCount(10);
      setTimePerQuestion(60);
      setNegativePenalty(-25);
      setSpeedBonusEnabled(true);
    } else if (presetKey === 'CHEM_CLASH') {
      setMode('SPEED_DUEL');
      setPresetName('Chemistry Bonding Duel');
      setSelectedSubjects(['Chemistry']);
      setSelectedChapters(['Chemical Bonding and Molecular Structure', 'Chemical Equilibrium']);
      setDifficulty('MIXED');
      setQuestionCount(10);
      setTimePerQuestion(60);
      setNegativePenalty(-25);
      setSpeedBonusEnabled(true);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    sound.click();
    setError('');
    setLoading(true);

    try {
      const room = await api.rooms.create({
        mode,
        preset_name: presetName,
        subjects: selectedSubjects,
        chapters: selectedChapters.length > 0 ? selectedChapters : null,
        difficulty_tier: difficulty,
        target_exam: targetExam,
        question_type_filter: questionTypeFilter,
        question_count: parseInt(questionCount, 10),
        time_per_question: parseInt(timePerQuestion, 10),
        total_duration_minutes: parseInt(totalDurationMinutes, 10),
        timing_type: timingType,
        is_public: isPublic,
        passcode: passcode.trim() || null,
        negative_marking: parseFloat(negativePenalty),
        speed_bonus_enabled: speedBonusEnabled,
      });
      onRoomCreated(room);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create battle room.');
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#242a3a] border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl glow-orange-subtle animate-in fade-in duration-200 my-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-slate-400 hover:text-white cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-orange-950 border border-orange-500/40 text-orange-400 mb-2">
            <Swords className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-black text-white">Full Room Customization</h2>
          <p className="text-xs text-slate-400 mt-1">
            Build your exact battle rules: multi-chapter syllabus, scoring formulas, timing, and security.
          </p>
        </div>

        {/* Quick Presets Bar */}
        <div className="mb-6 flex flex-wrap items-center gap-2 justify-center">
          <span className="text-[11px] font-bold uppercase text-slate-500">Presets:</span>
          <button
            type="button"
            onClick={() => applyPreset('MAIN_MOCK')}
            className="px-3 py-1 rounded-xl bg-[#1e2433] hover:bg-[#293144] border border-white/10 text-xs font-semibold text-slate-300 transition cursor-pointer"
          >
            📝 25-Q JEE Mock
          </button>
          <button
            type="button"
            onClick={() => applyPreset('PHYSICS_BLITZ')}
            className="px-3 py-1 rounded-xl bg-[#1e2433] hover:bg-[#293144] border border-white/10 text-xs font-semibold text-slate-300 transition cursor-pointer"
          >
            ⚡ Physics Blitz
          </button>
          <button
            type="button"
            onClick={() => applyPreset('CHEM_CLASH')}
            className="px-3 py-1 rounded-xl bg-[#1e2433] hover:bg-[#293144] border border-white/10 text-xs font-semibold text-slate-300 transition cursor-pointer"
          >
            🧪 Chemistry Clash
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-500/40 rounded-xl flex items-center gap-2 text-red-300 text-sm">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 1. Mode Select */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Combat Engine
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  setMode('SPEED_DUEL');
                  setNegativePenalty(-25);
                  setSpeedBonusEnabled(true);
                }}
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                  mode === 'SPEED_DUEL'
                    ? 'border-orange-500 bg-orange-950/60 text-white shadow-md shadow-orange-950/40 ring-1 ring-orange-500'
                    : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="font-bold text-sm text-orange-400 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4" />
                  <span>Speed Duel</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Live scoreboard & surges. Speed bonus + rapid response.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  setMode('MOCK_TEST');
                  setNegativePenalty(-1);
                  setSpeedBonusEnabled(false);
                }}
                className={`p-3.5 rounded-2xl border text-left transition cursor-pointer ${
                  mode === 'MOCK_TEST'
                    ? 'border-amber-400 bg-amber-950/60 text-white shadow-md shadow-amber-950 ring-1 ring-amber-400'
                    : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                }`}
              >
                <div className="font-bold text-sm text-amber-300 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4" />
                  <span>Mock Showdown</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Question Palette, review tags, blind scores until submission.
                </p>
              </button>
            </div>
          </div>

          {/* 2. Subjects Filter */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
              Subjects (Multi-Select)
            </label>
            <div className="grid grid-cols-3 gap-2">
              {['Physics', 'Chemistry', 'Mathematics'].map((s) => {
                const active = selectedSubjects.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSubject(s)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                      active
                        ? 'border-orange-500 bg-orange-950/70 text-orange-200'
                        : 'border-white/10 bg-[#1e2433] text-slate-500 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    {active && <Check className="w-3.5 h-3.5 text-orange-400" />}
                    <span>{s}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Multi-Chapter Syllabus Filter */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Chapters Filter ({selectedChapters.length ? `${selectedChapters.length} Selected` : 'All Available'})
              </label>
              {selectedChapters.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSelectedChapters([])}
                  className="text-[11px] text-orange-400 hover:underline cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>

            {/* Chapter Search Box */}
            <div className="relative mb-2">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
              <input
                type="text"
                placeholder="Search chapters (e.g. Kinematics, Equilibrium)..."
                value={chapterSearch}
                onChange={(e) => setChapterSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-[#1e2433] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-400"
              />
            </div>

            {/* Chapters Chips Grid */}
            <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1 bg-[#1e2433] rounded-xl border border-white/10">
              {availableChapters.length === 0 ? (
                <span className="text-[11px] text-slate-500 p-2">No chapters matching search.</span>
              ) : (
                availableChapters.map((ch, idx) => {
                  const isChecked = selectedChapters.includes(ch.chapter);
                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => toggleChapter(ch.chapter)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border transition cursor-pointer flex items-center gap-1 ${
                        isChecked
                          ? 'border-orange-500 bg-orange-950/80 text-orange-200'
                          : 'border-white/10 bg-[#293144] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {isChecked && <Check className="w-3 h-3 text-orange-400" />}
                      <span>{ch.chapter}</span>
                      <span className="text-[9px] text-slate-500 font-mono">({ch.count})</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* 4. Questions, Difficulty & Exam Filters */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Question Count
              </label>
              <select
                value={questionCount}
                onChange={(e) => setQuestionCount(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e2433] border border-white/10 rounded-xl text-white text-xs focus:border-orange-500"
              >
                <option value={3}>3 Items (Blitz)</option>
                <option value={5}>5 Items (Standard)</option>
                <option value={10}>10 Items (Drill)</option>
                <option value={15}>15 Items (Intense)</option>
                <option value={20}>20 Items (Mock)</option>
                <option value={25}>25 Items (25-Q Single Subj)</option>
                <option value={30}>30 Items (30-Q Arena)</option>
                <option value={75}>75 Items (Official Full PCM Mock)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Difficulty Tier
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e2433] border border-white/10 rounded-xl text-white text-xs focus:border-orange-500"
              >
                <option value="MIXED">Mixed (Balanced)</option>
                <option value="EASY">Easy (Foundation)</option>
                <option value="MEDIUM">Medium (JEE Main)</option>
                <option value="HARD">Hard (Advanced)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Target Exam
              </label>
              <select
                value={targetExam}
                onChange={(e) => setTargetExam(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e2433] border border-white/10 rounded-xl text-white text-xs focus:border-orange-500"
              >
                <option value="MIXED">Mixed / All</option>
                <option value="MAIN">JEE Main</option>
                <option value="ADVANCED">JEE Advanced</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Question Format
              </label>
              <select
                value={questionTypeFilter}
                onChange={(e) => setQuestionTypeFilter(e.target.value)}
                className="w-full px-3 py-2 bg-[#1e2433] border border-white/10 rounded-xl text-white text-xs focus:border-orange-500"
              >
                <option value="ALL">All Types</option>
                <option value="MCQ">Single Choice MCQ</option>
                <option value="NUMERICAL">Numerical Value</option>
              </select>
            </div>
          </div>

          {/* 5. Timing & Pace */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-[#1e2433] p-3.5 rounded-2xl border border-white/10">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Match Timing Mode
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTimingType('SYNCHRONIZED')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    timingType === 'SYNCHRONIZED'
                      ? 'border-orange-500 bg-orange-950/60 text-orange-200'
                      : 'border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  Synchronized Round
                </button>
                <button
                  type="button"
                  onClick={() => setTimingType('SELF_PACED')}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-semibold border transition cursor-pointer ${
                    timingType === 'SELF_PACED'
                      ? 'border-orange-500 bg-orange-950/60 text-orange-200'
                      : 'border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  Self-Paced Exam
                </button>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1">
                <span>{mode === 'SPEED_DUEL' ? 'Timer Per Question' : 'Exam Total Time'}</span>
                <span className="text-orange-400 font-mono">
                  {mode === 'SPEED_DUEL' ? `${timePerQuestion}s` : `${totalDurationMinutes} min`}
                </span>
              </div>
              {mode === 'SPEED_DUEL' ? (
                <input
                  type="range"
                  min={30}
                  max={180}
                  step={15}
                  value={timePerQuestion}
                  onChange={(e) => setTimePerQuestion(e.target.value)}
                  className="w-full accent-orange-500 cursor-pointer"
                />
              ) : (
                <input
                  type="range"
                  min={15}
                  max={180}
                  step={15}
                  value={totalDurationMinutes}
                  onChange={(e) => setTotalDurationMinutes(e.target.value)}
                  className="w-full accent-amber-400 cursor-pointer"
                />
              )}
            </div>
          </div>

          {/* 6. Custom Scoring Scheme */}
          <div className="grid grid-cols-2 gap-3 bg-[#1e2433] p-3.5 rounded-2xl border border-white/10">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Negative Penalty
              </label>
              <select
                value={negativePenalty}
                onChange={(e) => setNegativePenalty(e.target.value)}
                className="w-full px-3 py-1.5 bg-[#293144] border border-white/10 rounded-xl text-white text-xs focus:border-orange-500"
              >
                <option value={-25}>-25 Points (Standard Duel)</option>
                <option value={-1}>-1 Mark (Official NTA)</option>
                <option value={-50}>-50 Points (Hardcore)</option>
                <option value={0}>0 Points (No Negative Penalty)</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                Rapid Speed Bonus
              </label>
              <button
                type="button"
                onClick={() => setSpeedBonusEnabled(!speedBonusEnabled)}
                className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
                  speedBonusEnabled
                    ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-300'
                    : 'border-white/10 bg-[#293144] text-slate-500'
                }`}
              >
                {speedBonusEnabled ? 'Enabled (+0 to +50 pts)' : 'Disabled (Flat Points)'}
              </button>
            </div>
          </div>

          {/* 7. Privacy & Security */}
          <div className="flex items-center justify-between bg-[#1e2433] p-3.5 rounded-2xl border border-white/10">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsPublic(!isPublic)}
                className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  isPublic
                    ? 'border-orange-500/50 bg-orange-950/40 text-orange-300'
                    : 'border-amber-400/50 bg-amber-950/40 text-amber-300'
                }`}
              >
                {isPublic ? <Globe className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                <span>{isPublic ? 'Public Match' : 'Private Match'}</span>
              </button>
              <span className="text-[10px] text-slate-400">
                {isPublic ? 'Listed in Open Battles browser' : 'Join via 5-letter code only'}
              </span>
            </div>

            {!isPublic && (
              <input
                type="text"
                placeholder="Passcode (Optional)"
                maxLength={8}
                value={passcode}
                onChange={(e) => setPasscode(e.target.value)}
                className="w-36 px-3 py-1.5 bg-[#293144] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 font-mono focus:border-orange-500 text-center"
              />
            )}
          </div>

          {/* Launch Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black rounded-2xl transition shadow-xl shadow-orange-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 text-base glow-orange-subtle"
          >
            {loading ? (
              <span className="animate-pulse">Forging Custom Arena...</span>
            ) : (
              <>
                <Swords className="w-5 h-5 fill-current" />
                <span>Create & Open Arena Lobby</span>
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
