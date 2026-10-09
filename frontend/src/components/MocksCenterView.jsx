import React, { useState } from 'react';
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
  Check
} from 'lucide-react';

export default function MocksCenterView({ user, onRoomCreated, onOpenAuth }) {
  const [targetExam, setTargetExam] = useState('MAIN'); // 'MAIN' or 'ADVANCED'
  const [selectedSubjects, setSelectedSubjects] = useState(['Physics', 'Chemistry', 'Mathematics']);
  const [questionCount, setQuestionCount] = useState(25);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [questionTypeFilter, setQuestionTypeFilter] = useState('ALL');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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

  const handleLaunchMock = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }

    sound.click();
    setError('');
    setLoading(true);

    try {
      const examName = targetExam === 'MAIN' ? 'JEE (Main)' : 'JEE (Advanced)';
      const scopeLabel = selectedSubjects.length === 3 ? 'Full PCM' : selectedSubjects.join(' & ');
      const title = `${examName} ${scopeLabel} Official Mock`;

      const room = await api.rooms.create({
        mode: 'MOCK_TEST',
        preset_name: title,
        subjects: selectedSubjects,
        chapters: null,
        difficulty_tier: targetExam === 'ADVANCED' ? 'HARD' : 'MIXED',
        target_exam: targetExam,
        question_type_filter: questionTypeFilter,
        question_count: questionCount,
        time_per_question: 90,
        total_duration_minutes: durationMinutes,
        timing_type: 'SYNCHRONIZED',
        is_public: false,
        speed_bonus_enabled: false,
        negative_marking: -1.0,
        base_correct_score: 100.0,
      });

      // Automatically launch exam and retrieve active started room
      const startedRoom = await api.rooms.start(room.code);
      onRoomCreated(startedRoom || { ...room, status: 'IN_PROGRESS' });
    } catch (err) {
      setError(err.message || 'Failed to initialize examination paper.');
    } finally {
      setLoading(false);
    }
  };

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
            Questions are dynamically pulled and strictly ordered by Physics, Chemistry, and Mathematics with official color-coded palette navigation.
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
          {/* 1. Target Exam Pattern */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
              1. Target Exam Standard
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setTargetExam('MAIN');
                }}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
                  targetExam === 'MAIN'
                    ? 'border-orange-500 bg-orange-950/30 text-white shadow-lg shadow-orange-950/40'
                    : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                }`}
              >
                <div>
                  <h4 className="font-bold text-sm text-white">JEE (Main) Standard</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Speed, formula recall & balanced difficulty</p>
                </div>
                {targetExam === 'MAIN' && (
                  <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white shrink-0">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setTargetExam('ADVANCED');
                }}
                className={`p-4 rounded-2xl border text-left transition cursor-pointer flex items-center justify-between ${
                  targetExam === 'ADVANCED'
                    ? 'border-orange-500 bg-orange-950/30 text-white shadow-lg shadow-orange-950/40'
                    : 'border-white/10 bg-[#1e2433] text-slate-400 hover:border-white/20'
                }`}
              >
                <div>
                  <h4 className="font-bold text-sm text-white">JEE (Advanced) Benchmark</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Deep conceptual rigor & multi-concept synthesis</p>
                </div>
                {targetExam === 'ADVANCED' && (
                  <span className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center text-white shrink-0">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* 2. Subject Inclusion */}
          <div>
            <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5">
              2. Subjects Included in Examination
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: 'Physics', color: 'border-cyan-500/40' },
                { name: 'Chemistry', color: 'border-emerald-500/40' },
                { name: 'Mathematics', color: 'border-amber-500/40' }
              ].map(({ name, color }) => {
                const isSelected = selectedSubjects.includes(name);
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
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      {isSelected ? '✓ Included' : '+ Excluded'}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Paper Size & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                3. Total Question Items
              </label>
              <div className="grid grid-cols-4 gap-2">
                {[15, 25, 30, 75].map((cnt) => (
                  <button
                    key={cnt}
                    type="button"
                    onClick={() => {
                      sound.click();
                      setQuestionCount(cnt);
                      if (cnt === 75) setDurationMinutes(180);
                      else if (cnt === 30) setDurationMinutes(60);
                      else if (cnt === 25) setDurationMinutes(60);
                      else setDurationMinutes(30);
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
              <div className="grid grid-cols-4 gap-2">
                {[30, 60, 90, 180].map((mins) => (
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
                  {targetExam === 'MAIN' ? 'JEE Main' : 'JEE Advanced'} • {selectedSubjects.join(' + ')}
                </span>
              </div>
              <div className="font-mono text-orange-400">
                {questionCount} Questions across {durationMinutes} Minutes (+4 / -1 Marking)
              </div>
            </div>

            <button
              onClick={handleLaunchMock}
              disabled={loading}
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm rounded-2xl transition shadow-xl shadow-orange-950/50 flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-50 glow-orange-subtle"
            >
              {loading ? (
                <span className="animate-pulse">Synthesizing Examination Paper...</span>
              ) : (
                <>
                  <span>START OFFICIAL NTA MOCK</span>
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Official Instructions Quick Reference */}
      <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <FileText className="w-4 h-4 text-orange-400" />
          <span>Official NTA CBT Candidate Instructions</span>
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300 leading-relaxed">
          <div className="p-4 bg-[#1e2433] rounded-2xl border border-white/5">
            <span className="font-bold text-orange-400 block mb-1">1. Question Palette Colors</span>
            Green indicates answered, Red indicates unattempted visited, Violet indicates marked for review, and Grey indicates not visited.
          </div>
          <div className="p-4 bg-[#1e2433] rounded-2xl border border-white/5">
            <span className="font-bold text-orange-400 block mb-1">2. Blind Exam Marking</span>
            Scores and delta points are strictly withheld until you lock in your final submission, simulating authentic JEE testing conditions.
          </div>
          <div className="p-4 bg-[#1e2433] rounded-2xl border border-white/5">
            <span className="font-bold text-orange-400 block mb-1">3. Section Navigation</span>
            Switch freely between Physics, Chemistry, and Mathematics tabs using the top navigation bar at any point in the examination.
          </div>
        </div>
      </div>
    </div>
  );
}
