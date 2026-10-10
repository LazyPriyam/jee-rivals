import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import MathRenderer from './MathRenderer';
import OnDemandDerivationBox from './OnDemandDerivationBox';
import { sound } from '../utils/sound';
import {
  ArrowLeft,
  Trophy,
  CheckCircle2,
  XCircle,
  Clock,
  Target,
  BookOpen,
  Award,
  AlertTriangle,
  Lightbulb,
  Layers,
  ChevronDown,
  ChevronUp,
  Filter,
  Check,
  X,
  RefreshCw,
  BarChart2,
  FileText,
  Flag,
  Printer,
  Zap,
  TrendingDown,
  ShieldAlert,
  Brain,
  Compass,
  Crosshair,
  ArrowRight,
  Flame,
  HelpCircle
} from 'lucide-react';
import ReportQuestionModal from './ReportQuestionModal';

export default function TestAnalysisView({ roomCode, user, inspectUsername, onBack, onStartPreset, onJoinRoomCode }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters for questions review
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'CORRECT', 'INCORRECT', 'UNATTEMPTED'
  const [subjectFilter, setSubjectFilter] = useState('ALL'); // 'ALL', 'Physics', 'Chemistry', 'Mathematics'
  const [expandedSolutions, setExpandedSolutions] = useState({}); // qId -> bool
  const [reportTarget, setReportTarget] = useState(null); // { id, text }
  const [launchingDrill, setLaunchingDrill] = useState(false);

  useEffect(() => {
    if (!roomCode) return;
    setLoading(true);
    api.rooms.results(roomCode)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load test analysis.');
        setLoading(false);
      });
  }, [roomCode]);

  const toggleSolution = (qId) => {
    sound.click();
    setExpandedSolutions((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  const expandAll = () => {
    sound.click();
    const all = {};
    (data?.questions || []).forEach((item) => {
      all[item.question.id] = true;
    });
    setExpandedSolutions(all);
  };

  const collapseAll = () => {
    sound.click();
    setExpandedSolutions({});
  };

  const handlePrint = () => {
    sound.click();
    window.print();
  };

  const handleLaunchRemedial = async (subject, chapter) => {
    if (!user) return;
    setLaunchingDrill(true);
    try {
      sound.duel();
      const room = await api.rooms.create({
        mode: 'SPEED_DUEL',
        preset_name: `Remedial Sprint: ${chapter}`,
        subjects: [subject],
        chapters: [chapter],
        difficulty_tier: 'MIXED',
        question_count: 5,
        time_per_question: 90
      });
      if (room && onJoinRoomCode) {
        onJoinRoomCode(room);
      }
    } catch (err) {
      alert(err.message || 'Failed to launch remedial drill.');
    } finally {
      setLaunchingDrill(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center font-mono">
        <div className="inline-block animate-spin text-orange-500 mb-4">
          <RefreshCw className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-white">Synthesizing Examination Dossier...</h2>
        <p className="text-xs text-slate-400 mt-1">Calibrating AIR bracket, velocity matrix, and negative marking penalty audit...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-red-400 font-bold mb-4">{error || 'Analysis record unavailable.'}</p>
        <button
          onClick={onBack}
          className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm cursor-pointer"
        >
          Return to Test History
        </button>
      </div>
    );
  }

  // Find calling user's participant record or inspected candidate
  const myParticipant = inspectUsername
    ? ((data.participants || []).find((p) => (p.username || '').toLowerCase() === inspectUsername.toLowerCase()) || (data.participants || []).find((p) => p.user_id === user?.id) || (data.participants || [])[0] || {})
    : ((data.participants || []).find((p) => p.user_id === user?.id) || (data.participants || [])[0] || {});
  const userAnswers = myParticipant.answers || {};

  const questionsList = data.questions || [];
  const totalQuestions = questionsList.length;

  // Breakdown statistics & Archetypes
  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;

  // Time economics
  let totalTimeSpent = 0;
  let timeOnCorrect = 0;
  let timeOnIncorrect = 0;
  let timeOnSkipped = 0;

  // Difficulty matrices
  const diffStats = {
    EASY: { total: 0, correct: 0, incorrect: 0, skipped: 0 },
    MEDIUM: { total: 0, correct: 0, incorrect: 0, skipped: 0 },
    HARD: { total: 0, correct: 0, incorrect: 0, skipped: 0 }
  };

  // Low hanging fruits (Easy questions missed or skipped)
  const lowHangingFruit = [];

  // Cognitive Error Archetypes count
  const archetypeCounts = {
    CONCEPTUAL_GAP: 0,
    CALCULATION_TRAP: 0,
    TIME_RUSH: 0,
    SYNTHESIS_BREAKDOWN: 0
  };

  // Chapter error frequency for prescription
  const chapterErrorMap = {};

  const subjectStats = {
    Physics: { correct: 0, incorrect: 0, unattempted: 0, marks: 0, total: 0 },
    Chemistry: { correct: 0, incorrect: 0, unattempted: 0, marks: 0, total: 0 },
    Mathematics: { correct: 0, incorrect: 0, unattempted: 0, marks: 0, total: 0 },
  };

  const processedQuestions = questionsList.map((item, index) => {
    const q = item.question;
    const sol = item.solution;
    const userSubmission = userAnswers[q.id];

    let userSelected = null;
    let isCorrect = false;
    let isAttempted = false;
    let markDelta = 0.0;
    let timeSpent = 60;

    if (userSubmission) {
      if (typeof userSubmission === 'object') {
        userSelected = userSubmission.selected;
        isCorrect = Boolean(userSubmission.correct);
        markDelta = userSubmission.delta_marks !== undefined ? userSubmission.delta_marks : (isCorrect ? 4.0 : -1.0);
        isAttempted = userSelected !== 'NONE' && userSelected !== 'SKIPPED' && userSelected !== '' && userSelected !== null;
        timeSpent = userSubmission.time_spent_seconds || 60;
      } else {
        userSelected = userSubmission;
        isAttempted = userSelected !== 'NONE' && userSelected !== 'SKIPPED';
        isCorrect = String(userSelected).trim().toUpperCase() === String(sol.correct_answer).trim().toUpperCase();
        markDelta = isCorrect ? 4.0 : (isAttempted ? -1.0 : 0.0);
      }
    }

    totalTimeSpent += timeSpent;

    if (!isAttempted) {
      unattemptedCount++;
      timeOnSkipped += timeSpent;
    } else if (isCorrect) {
      correctCount++;
      timeOnCorrect += timeSpent;
    } else {
      incorrectCount++;
      timeOnIncorrect += timeSpent;

      // Cognitive Archetype attribution
      const qType = (q.question_type || 'SINGLE_CHOICE').toUpperCase();
      let arch = 'CONCEPTUAL_GAP';
      if (timeSpent < 18) {
        arch = 'TIME_RUSH';
      } else if (qType === 'NUMERICAL' || qType === 'INTEGER') {
        arch = 'CALCULATION_TRAP';
      } else if (qType === 'COMPREHENSION' || qType === 'MATRIX_MATCH' || qType === 'MULTIPLE_CHOICE') {
        arch = 'SYNTHESIS_BREAKDOWN';
      }
      archetypeCounts[arch] = (archetypeCounts[arch] || 0) + 1;

      // Chapter error tracking
      const chName = q.chapter || 'General';
      if (!chapterErrorMap[chName]) {
        chapterErrorMap[chName] = { chapter: chName, subject: q.subject || 'Physics', errors: 0 };
      }
      chapterErrorMap[chName].errors += 1;
    }

    // Difficulty tracking
    const rawDiff = (q.difficulty_tier || 'MEDIUM').toUpperCase();
    const dTier = rawDiff === 'EASY' ? 'EASY' : (rawDiff === 'HARD' ? 'HARD' : 'MEDIUM');
    diffStats[dTier].total++;
    if (!isAttempted) {
      diffStats[dTier].skipped++;
      if (dTier === 'EASY') lowHangingFruit.push({ index: index + 1, q, reason: 'Skipped an Easy Question (+4 missed)' });
    } else if (isCorrect) {
      diffStats[dTier].correct++;
    } else {
      diffStats[dTier].incorrect++;
      if (dTier === 'EASY') lowHangingFruit.push({ index: index + 1, q, reason: 'Failed an Easy Question (-1 penalty incurred)' });
    }

    // Update subject stats
    const subj = q.subject || 'Physics';
    if (subjectStats[subj]) {
      subjectStats[subj].total++;
      if (!isAttempted) subjectStats[subj].unattempted++;
      else if (isCorrect) {
        subjectStats[subj].correct++;
        subjectStats[subj].marks += 4.0;
      } else {
        subjectStats[subj].incorrect++;
        subjectStats[subj].marks -= 1.0;
      }
    }

    return {
      index: index + 1,
      q,
      sol,
      userSelected,
      isCorrect,
      isAttempted,
      markDelta,
      timeSpent
    };
  });

  const attemptedCount = correctCount + incorrectCount;
  const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
  const totalMarks = myParticipant.marks !== undefined ? myParticipant.marks : (correctCount * 4 - incorrectCount * 1);
  const maxPossibleMarks = totalQuestions * 4;

  // Section 2: Time Economics
  const avgTimePerCorrect = correctCount > 0 ? Math.round(timeOnCorrect / correctCount) : 0;
  const avgTimePerIncorrect = incorrectCount > 0 ? Math.round(timeOnIncorrect / incorrectCount) : 0;
  const wastedMinutes = (timeOnIncorrect / 60).toFixed(1);

  // Section 4: Negative Marking
  const penaltyMarks = incorrectCount * 1.0;
  const cleanSheetPotential = totalMarks + penaltyMarks;

  // Section 6: Prescriptions (Top 3 chapters with most errors)
  const topPrescriptionChapters = Object.values(chapterErrorMap)
    .sort((a, b) => b.errors - a.errors)
    .slice(0, 3);

  // Filter questions for display
  const filteredQuestions = processedQuestions.filter((item) => {
    if (statusFilter === 'CORRECT' && (!item.isAttempted || !item.isCorrect)) return false;
    if (statusFilter === 'INCORRECT' && (!item.isAttempted || item.isCorrect)) return false;
    if (statusFilter === 'UNATTEMPTED' && item.isAttempted) return false;
    if (subjectFilter !== 'ALL' && item.q.subject !== subjectFilter) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-transition space-y-8 print:p-0 print:space-y-4">
      {/* Top Header & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 print:hidden">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Test History</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-white/10 shadow transition cursor-pointer flex items-center gap-2"
          >
            <Printer className="w-3.5 h-3.5 text-orange-400" />
            <span>Export Dossier (PDF / Print)</span>
          </button>
          <span className="px-3 py-1 rounded-xl bg-orange-500/20 text-orange-400 font-mono text-xs font-bold border border-orange-500/30">
            {data.mode}
          </span>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 1: EXECUTIVE SCORECARD & AIR CALIBRATION BRACKET */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-br from-[#1b2234] via-[#151a26] to-[#0e121c] border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl glow-orange-subtle print:border-black print:bg-white print:text-black">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10 print:border-black">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-[10px] px-3 py-1 rounded-full bg-orange-950 border border-orange-500/40 text-orange-400 font-mono font-bold uppercase tracking-wider print:border-black print:text-black">
                Diagnostic Examination Dossier
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight print:text-black">
              {data.preset_name || 'NTA Full Mock Examination'}
            </h1>
            <p className="text-slate-400 text-xs mt-1 font-mono print:text-slate-600">
              Exam Paper Ref #{data.room_code} • NTA Scheme (+4.0 Correct / -1.0 Negative Marking)
            </p>
          </div>

          {/* Primary Marks Scoreboard */}
          <div className="flex items-center gap-5 bg-[#0f1420] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl print:bg-white print:border-black">
            <div className="text-center sm:text-left pr-4 border-r border-white/10 print:border-black">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                Total Score
              </span>
              <div className="text-3xl sm:text-4xl font-black text-orange-400 font-mono print:text-black">
                {totalMarks}{' '}
                <span className="text-sm font-semibold text-slate-500 font-sans">
                  / {maxPossibleMarks}
                </span>
              </div>
            </div>

            <div className="text-center sm:text-left pr-4 border-r border-white/10 print:border-black">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                Accuracy
              </span>
              <div className="text-3xl sm:text-4xl font-black text-emerald-400 font-mono print:text-black">
                {accuracy}%
              </div>
            </div>

            <div className="text-center sm:text-left">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                Projected AIR
              </span>
              <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono print:text-black">
                {user?.predicted_air_bracket || 'AIR < 15,000'}
              </div>
            </div>
          </div>
        </div>

        {/* 4-Stat Metric Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-6 font-mono">
          <div className="bg-[#121724] border border-white/10 rounded-2xl p-4 print:border-black print:bg-white">
            <span className="text-xs text-slate-400 block mb-1">Attempted</span>
            <span className="text-xl font-bold text-white print:text-black">
              {attemptedCount} <span className="text-xs text-slate-400">/ {totalQuestions}</span>
            </span>
          </div>
          <div className="bg-[#121724] border border-emerald-500/30 rounded-2xl p-4 print:border-black print:bg-white">
            <span className="text-xs text-emerald-400 block mb-1 print:text-black">Correct (+4)</span>
            <span className="text-xl font-bold text-emerald-300 print:text-black">
              {correctCount} <span className="text-xs text-slate-400">questions</span>
            </span>
          </div>
          <div className="bg-[#121724] border border-red-500/30 rounded-2xl p-4 print:border-black print:bg-white">
            <span className="text-xs text-red-400 block mb-1 print:text-black">Incorrect (-1)</span>
            <span className="text-xl font-bold text-red-300 print:text-black">
              {incorrectCount} <span className="text-xs text-slate-400">questions</span>
            </span>
          </div>
          <div className="bg-[#121724] border border-white/10 rounded-2xl p-4 print:border-black print:bg-white">
            <span className="text-xs text-slate-400 block mb-1">Skipped (0)</span>
            <span className="text-xl font-bold text-slate-300 print:text-black">
              {unattemptedCount} <span className="text-xs text-slate-400">questions</span>
            </span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 2: TIME ECONOMICS & VELOCITY MATRIX */}
      {/* ========================================================================= */}
      <div className="bg-[#121622] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl space-y-4 print:border-black print:bg-white">
        <div className="flex items-center justify-between pb-3 border-b border-white/5 print:border-black">
          <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2 print:text-black">
            <Clock className="w-4 h-4 text-orange-400" />
            Section 2: Time Economics & Velocity Matrix
          </h2>
          <span className="text-xs font-mono text-slate-400">
            Total Pacing: {Math.round(totalTimeSpent / 60)} min
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-[#171d2b] border border-emerald-500/20 print:border-black print:bg-white">
            <span className="text-xs font-bold text-slate-400 block mb-1">Avg Time on Correct Qs</span>
            <div className="text-2xl font-black text-emerald-400 font-mono print:text-black">
              {avgTimePerCorrect}s
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Optimal execution window</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#171d2b] border border-red-500/20 print:border-black print:bg-white">
            <span className="text-xs font-bold text-slate-400 block mb-1">Wasted Time (on Wrong Qs)</span>
            <div className="text-2xl font-black text-red-400 font-mono print:text-black">
              {wastedMinutes} min
            </div>
            <span className="text-[11px] text-red-300/80 mt-1 block">Burned on negative marking penalties</span>
          </div>

          <div className="p-4 rounded-2xl bg-[#171d2b] border border-white/10 print:border-black print:bg-white">
            <span className="text-xs font-bold text-slate-400 block mb-1">Velocity per Net Mark</span>
            <div className="text-2xl font-black text-orange-400 font-mono print:text-black">
              {totalMarks > 0 ? Math.round(totalTimeSpent / totalMarks) : 'N/A'}s
            </div>
            <span className="text-[11px] text-slate-500 mt-1 block">Seconds invested per earned mark</span>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 3: DIFFICULTY QUADRANT & LOW-HANGING FRUIT AUDIT */}
      {/* ========================================================================= */}
      <div className="bg-[#121622] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl space-y-4 print:border-black print:bg-white">
        <div className="flex items-center justify-between pb-3 border-b border-white/5 print:border-black">
          <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2 print:text-black">
            <Layers className="w-4 h-4 text-blue-400" />
            Section 3: Difficulty Quadrant & Low-Hanging Fruit Audit
          </h2>
          <span className="text-xs font-mono text-slate-400">Tier Distribution</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {['EASY', 'MEDIUM', 'HARD'].map((tier) => {
            const st = diffStats[tier];
            const tierAcc = st.total > 0 ? Math.round((st.correct / st.total) * 100) : 0;
            return (
              <div key={tier} className="p-4 rounded-2xl bg-[#171d2b] border border-white/10 print:border-black print:bg-white">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-white print:text-black">{tier} TIER</span>
                  <span className="text-xs font-mono text-slate-400">{st.total} Qs</span>
                </div>
                <div className="text-2xl font-black text-white font-mono mb-2 print:text-black">
                  {tierAcc}% <span className="text-xs text-slate-400 font-normal">Accuracy</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono flex justify-between">
                  <span>✓ {st.correct}</span>
                  <span className="text-red-400">✗ {st.incorrect}</span>
                  <span>— {st.skipped}</span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Low Hanging Fruit Warning */}
        {lowHangingFruit.length > 0 && (
          <div className="p-4 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs space-y-2 print:border-black print:text-black">
            <div className="font-extrabold flex items-center gap-2 text-amber-300 print:text-black">
              <Lightbulb className="w-4 h-4" />
              <span>Low-Hanging Fruit Alert ({lowHangingFruit.length} Easy Questions Missed)</span>
            </div>
            <p className="text-slate-300">
              You lost marks on questions rated <strong>Easy</strong>. Securing these foundation questions is the highest-leverage route to immediate rank jumps:
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {lowHangingFruit.map((lhf) => (
                <span
                  key={lhf.index}
                  className="px-2.5 py-1 rounded-lg bg-black/40 border border-amber-500/30 text-amber-300 font-mono text-[11px]"
                >
                  Q{lhf.index} ({lhf.q.chapter}): {lhf.reason}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* SECTION 4: NEGATIVE MARKING PENALTY AUDIT */}
      {/* ========================================================================= */}
      <div className="bg-[#121622] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl space-y-4 print:border-black print:bg-white">
        <div className="flex items-center justify-between pb-3 border-b border-white/5 print:border-black">
          <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2 print:text-black">
            <TrendingDown className="w-4 h-4 text-red-400" />
            Section 4: Negative Marking Penalty Audit
          </h2>
          <span className="text-xs font-mono text-red-400">-{penaltyMarks} Marks Lost</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl bg-red-950/20 border border-red-500/30 print:border-black print:bg-white">
            <span className="text-xs font-bold text-slate-300 block mb-1">Direct Penalty Marks Bleed</span>
            <div className="text-3xl font-black text-red-400 font-mono print:text-black">
              -{penaltyMarks} Marks
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              Incurred across {incorrectCount} incorrect attempts. Every wrong guess burns 1 mark.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 print:border-black print:bg-white">
            <span className="text-xs font-bold text-slate-300 block mb-1">Clean-Sheet Potential Score</span>
            <div className="text-3xl font-black text-emerald-400 font-mono print:text-black">
              {cleanSheetPotential} Marks
            </div>
            <p className="text-[11px] text-slate-400 mt-2">
              If doubtful questions were strategically skipped instead of guessed, your score would be <strong>+{penaltyMarks} marks higher</strong>.
            </p>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 5: COGNITIVE FAILURE ARCHETYPE DIAGNOSTICS */}
      {/* ========================================================================= */}
      <div className="bg-[#121622] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl space-y-4 print:border-black print:bg-white">
        <div className="flex items-center justify-between pb-3 border-b border-white/5 print:border-black">
          <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2 print:text-black">
            <Brain className="w-4 h-4 text-purple-400" />
            Section 5: Cognitive Failure Archetype Distribution
          </h2>
          <span className="text-xs font-mono text-slate-400">Automatic Diagnostic Engine</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { id: 'CONCEPTUAL_GAP', label: 'Conceptual Gap', icon: '🧠', count: archetypeCounts.CONCEPTUAL_GAP, desc: 'Misunderstood core physics/chem law' },
            { id: 'CALCULATION_TRAP', label: 'Calculation Trap', icon: '🧮', count: archetypeCounts.CALCULATION_TRAP, desc: 'Arithmetic, unit or algebra slip' },
            { id: 'TIME_RUSH', label: 'Time Rush', icon: '⚡', count: archetypeCounts.TIME_RUSH, desc: 'Premature guess in < 18 seconds' },
            { id: 'SYNTHESIS_BREAKDOWN', label: 'Synthesis Failure', icon: '🧩', count: archetypeCounts.SYNTHESIS_BREAKDOWN, desc: 'Struggled on multi-step linkages' },
          ].map((arch) => (
            <div key={arch.id} className="p-4 rounded-2xl bg-[#171d2b] border border-white/10 print:border-black print:bg-white">
              <div className="text-2xl mb-1">{arch.icon}</div>
              <div className="text-xs font-bold text-white print:text-black">{arch.label}</div>
              <div className="text-xl font-black font-mono text-orange-400 my-1 print:text-black">
                {arch.count} <span className="text-[10px] text-slate-500 font-normal">failures</span>
              </div>
              <div className="text-[10px] text-slate-400 leading-tight">{arch.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* SECTION 6: ACTIONABLE REVISION PRESCRIPTION */}
      {/* ========================================================================= */}
      <div className="bg-[#121622] border border-orange-500/30 rounded-3xl p-6 sm:p-7 shadow-xl space-y-4 print:border-black print:bg-white">
        <div className="flex items-center justify-between pb-3 border-b border-white/5 print:border-black">
          <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2 print:text-black">
            <Compass className="w-4 h-4 text-orange-400" />
            Section 6: Actionable Revision Prescription
          </h2>
          <span className="text-xs font-mono text-orange-400">Targeted Remedy</span>
        </div>

        {topPrescriptionChapters.length > 0 ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-300">
              Based on your mistake frequency in this test paper, immediate focused drills are prescribed on:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {topPrescriptionChapters.map((pres, idx) => (
                <div
                  key={pres.chapter}
                  className="p-4 rounded-2xl bg-[#171d2b] border border-white/10 flex flex-col justify-between print:border-black print:bg-white"
                >
                  <div>
                    <span className="text-[10px] font-mono font-bold text-orange-400">PRIORITY #{idx + 1}</span>
                    <h3 className="text-sm font-bold text-white mt-1 line-clamp-1 print:text-black">{pres.chapter}</h3>
                    <p className="text-xs text-slate-400 font-mono mt-0.5">{pres.errors} mistakes recorded</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleLaunchRemedial(pres.subject, pres.chapter)}
                    disabled={launchingDrill}
                    className="mt-4 px-3 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5 print:hidden"
                  >
                    <span>Remediate Chapter</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-500/30 text-emerald-300 text-xs">
            Clean performance! No repetitive chapter failure clusters detected in this session.
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* DETAILED QUESTION PAPER REVIEW */}
      {/* ========================================================================= */}
      <div className="space-y-6 print:hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-orange-400" />
              <span>Step-by-Step Question Paper Review</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Review correct keys, candidate choices, derivations, and common pitfalls.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition cursor-pointer"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition cursor-pointer"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {[
            { id: 'ALL', label: `All (${processedQuestions.length})` },
            { id: 'CORRECT', label: `Correct (${correctCount})` },
            { id: 'INCORRECT', label: `Incorrect (${incorrectCount})` },
            { id: 'UNATTEMPTED', label: `Skipped (${unattemptedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                sound.click();
                setStatusFilter(tab.id);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer font-mono ${
                statusFilter === tab.id
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'bg-[#10141f] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}

          <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />
          {['ALL', 'Physics', 'Chemistry', 'Mathematics'].map((s) => (
            <button
              key={s}
              onClick={() => {
                sound.click();
                setSubjectFilter(s);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                subjectFilter === s
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-[#10141f] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Question Cards */}
        <div className="space-y-5">
          {filteredQuestions.map((item) => {
            const q = item.q;
            const sol = item.sol;
            const isExpanded = Boolean(expandedSolutions[q.id]);

            return (
              <div
                key={q.id}
                className={`bg-[#161a24] border rounded-3xl p-6 sm:p-7 shadow-xl transition ${
                  item.isAttempted
                    ? item.isCorrect
                      ? 'border-emerald-500/40 hover:border-emerald-500/60'
                      : 'border-red-500/40 hover:border-red-500/60'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-1 bg-orange-950/80 border border-orange-500/40 text-orange-400 rounded-lg text-xs font-bold font-mono">
                      Question {item.index}
                    </span>
                    <span className="text-xs font-mono text-slate-400">
                      {q.subject} • {q.chapter}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 font-mono">
                      {q.question_type}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs font-bold font-mono px-2.5 py-1 rounded-lg ${
                        item.isAttempted
                          ? item.isCorrect
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                            : 'bg-red-950 text-red-300 border border-red-500/40'
                          : 'bg-slate-800 text-slate-300'
                      }`}
                    >
                      {item.isAttempted
                        ? item.isCorrect
                          ? '+4.0 Marks'
                          : '-1.0 Marks'
                        : 'Skipped'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReportTarget({ id: q.id, text: q.text })}
                      title="Report defect"
                      className="p-1 text-slate-500 hover:text-red-400"
                    >
                      <Flag className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Comprehension / Paragraph Box */}
                {q.passage_text && (
                  <div className="mb-4 rounded-xl bg-blue-950/30 border border-blue-500/30 overflow-hidden shadow-sm">
                    <div className="bg-blue-900/30 border-b border-blue-500/20 px-3 py-1.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-blue-200">
                        <BookOpen className="w-3.5 h-3.5 text-blue-400" />
                        <span>{q.passage_title || 'Comprehension Passage Context'}</span>
                      </div>
                      {q.subquestion_index && q.subquestion_total && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold border border-blue-400/30">
                          Sub-question {q.subquestion_index} of {q.subquestion_total}
                        </span>
                      )}
                    </div>
                    <div className="p-3.5 text-xs sm:text-sm leading-relaxed text-slate-300 max-h-56 overflow-y-auto">
                      <MathRenderer text={q.passage_text} />
                    </div>
                  </div>
                )}

                {/* Text */}
                <div className="text-sm text-slate-200 leading-relaxed overflow-x-auto mb-4">
                  <MathRenderer text={q.text} />
                </div>

                {/* Diagram */}
                {q.has_diagram && q.diagram_urls && (
                  <div className="p-2 bg-[#0e121c] rounded-xl border border-white/5 inline-block mb-4">
                    <img
                      src={q.diagram_urls}
                      alt="Question Diagram"
                      className="max-h-52 rounded-lg object-contain"
                    />
                  </div>
                )}

                {/* Options */}
                {Array.isArray(q.options) && q.options.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-4">
                    {q.options.map((opt) => {
                      const isCorrectOpt = String(opt.key).toUpperCase() === String(sol.correct_answer).toUpperCase();
                      const isSelectedByUser = String(opt.key).toUpperCase() === String(item.userSelected).toUpperCase();

                      let optClass = 'bg-[#181d28] border-white/5 text-slate-300';
                      if (isCorrectOpt) {
                        optClass = 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200 font-bold';
                      } else if (isSelectedByUser && !item.isCorrect) {
                        optClass = 'bg-red-950/60 border-red-500/60 text-red-200 line-through';
                      }

                      return (
                        <div key={opt.key} className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${optClass}`}>
                          <span className="font-mono font-bold shrink-0">{opt.key}.</span>
                          <div className="min-w-0">
                            <MathRenderer text={opt.text} />
                          </div>
                          {isSelectedByUser && (
                            <span className="ml-auto text-[9px] px-1.5 py-0.2 rounded bg-black/40 font-mono shrink-0">
                              Your Answer
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Numerical */}
                {(!q.options || q.options.length === 0) && (
                  <div className="bg-[#10141f] border border-white/10 rounded-xl p-3 mb-4 flex items-center justify-between text-xs font-mono">
                    <div>
                      <span className="text-slate-400">Your Answer: </span>
                      <span className={`font-bold ${item.isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                        {item.userSelected || 'Unattempted'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Official Key: </span>
                      <span className="font-bold text-emerald-400">{sol.correct_answer}</span>
                    </div>
                  </div>
                )}

                {/* On-Demand Derivation & Key */}
                <div className="mt-3">
                  <OnDemandDerivationBox
                    questionId={q.id}
                    officialKey={sol.correct_answer}
                    initialSolution={sol}
                    onReportClick={() => setReportTarget({ id: q.id, text: q.text })}
                    compact={true}
                    defaultExpanded={isExpanded}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ReportQuestionModal
        isOpen={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        questionId={reportTarget?.id}
        questionText={reportTarget?.text}
      />
    </div>
  );
}
