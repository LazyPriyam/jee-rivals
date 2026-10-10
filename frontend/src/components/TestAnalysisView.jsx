import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import MathRenderer from './MathRenderer';
import OnDemandDerivationBox from './OnDemandDerivationBox';
import { sound } from '../utils/sound';
import {
  ArrowLeft,
  ArrowRight,
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
  TrendingUp,
  ShieldAlert,
  Brain,
  Compass,
  Crosshair,
  Flame,
  HelpCircle,
  Activity,
  ChevronLeft,
  Calendar,
  Sparkles
} from 'lucide-react';
import ReportQuestionModal from './ReportQuestionModal';

export default function TestAnalysisView({
  roomCode,
  user,
  inspectUsername,
  onBack,
  onStartPreset,
  onJoinRoomCode
}) {
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // 8-Page Dossier Navigation: 1 through 8
  const [currentPage, setCurrentPage] = useState(1);

  // Filters for Question-by-Question Audits (Pages 6, 7, 8)
  const [auditFilter, setAuditFilter] = useState('ALL'); // 'ALL', 'CORRECT', 'INCORRECT', 'UNATTEMPTED'
  const [expandedSolutions, setExpandedSolutions] = useState({});
  const [reportTarget, setReportTarget] = useState(null);
  const [launchingDrill, setLaunchingDrill] = useState(false);

  // Filters for Chapter Matrix (Page 5)
  const [chapterSubjFilter, setChapterSubjFilter] = useState('ALL');
  const [chapterSortBy, setChapterSortBy] = useState('MARKS_LOST');

  useEffect(() => {
    if (!roomCode) return;
    setLoading(true);

    Promise.all([
      api.rooms.results(roomCode),
      api.rooms.getMyHistory().catch(() => [])
    ])
      .then(([resData, histData]) => {
        setData(resData);
        setHistory(Array.isArray(histData) ? histData : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load test analysis.');
        setLoading(false);
      });
  }, [roomCode]);

  // Keyboard navigation for pages
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' && currentPage < 8) {
        sound.click();
        setCurrentPage((p) => p + 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } else if (e.key === 'ArrowLeft' && currentPage > 1) {
        sound.click();
        setCurrentPage((p) => p - 1);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPage]);

  const toggleSolution = (qId) => {
    sound.click();
    setExpandedSolutions((prev) => ({
      ...prev,
      [qId]: !prev[qId]
    }));
  };

  const expandAllSubject = (subjQuestions) => {
    sound.click();
    const all = { ...expandedSolutions };
    subjQuestions.forEach((item) => {
      all[item.q.id] = true;
    });
    setExpandedSolutions(all);
  };

  const collapseAllSubject = (subjQuestions) => {
    sound.click();
    const all = { ...expandedSolutions };
    subjQuestions.forEach((item) => {
      delete all[item.q.id];
    });
    setExpandedSolutions(all);
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
        <h2 className="text-xl font-bold text-white">Synthesizing 8-Page Examination Dossier...</h2>
        <p className="text-xs text-slate-400 mt-1">
          Computing time economics, timeline pacing blocks, cognitive archetypes, and chapter impact...
        </p>
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

  // Identify participant
  const myParticipant = inspectUsername
    ? (data.participants || []).find((p) => (p.username || '').toLowerCase() === inspectUsername.toLowerCase()) ||
      (data.participants || []).find((p) => p.user_id === user?.id) ||
      (data.participants || [])[0] ||
      {}
    : (data.participants || []).find((p) => p.user_id === user?.id) || (data.participants || [])[0] || {};

  const userAnswers = myParticipant.answers || {};
  const questionsList = data.questions || [];
  const totalQuestions = questionsList.length;

  // Process all questions into uniform diagnostic structure
  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;
  let totalTimeSpent = 0;
  let timeOnCorrect = 0;
  let timeOnIncorrect = 0;
  let timeOnSkipped = 0;

  const subjectStats = {
    Physics: { correct: 0, incorrect: 0, unattempted: 0, marks: 0, timeSpent: 0, total: 0 },
    Chemistry: { correct: 0, incorrect: 0, unattempted: 0, marks: 0, timeSpent: 0, total: 0 },
    Mathematics: { correct: 0, incorrect: 0, unattempted: 0, marks: 0, timeSpent: 0, total: 0 }
  };

  const diffStats = {
    EASY: { total: 0, attempted: 0, correct: 0, incorrect: 0, skipped: 0, timeSpent: 0 },
    MEDIUM: { total: 0, attempted: 0, correct: 0, incorrect: 0, skipped: 0, timeSpent: 0 },
    HARD: { total: 0, attempted: 0, correct: 0, incorrect: 0, skipped: 0, timeSpent: 0 }
  };

  const chapterMap = {};
  const stalledQuestions = []; // > 210s
  const easyBlunders = []; // Easy incorrect or skipped
  const hardTimeSinks = []; // Hard > 180s and wrong/skipped
  const slowSolves = []; // Correct but > 200s
  const quickGuesses = []; // Wrong in < 25s

  const processedQuestions = questionsList.map((item, index) => {
    const q = item.question;
    const sol = item.solution;
    const userSubmission = userAnswers[q.id];

    let userSelected = null;
    let isCorrect = false;
    let isAttempted = false;
    let markDelta = 0.0;
    let timeSpent = 60; // fallback seconds

    if (userSubmission) {
      if (typeof userSubmission === 'object') {
        userSelected = userSubmission.selected;
        isCorrect = Boolean(userSubmission.correct);
        markDelta = userSubmission.delta_marks !== undefined ? userSubmission.delta_marks : (isCorrect ? 4.0 : -1.0);
        isAttempted = userSelected !== 'NONE' && userSelected !== 'SKIPPED' && userSelected !== '' && userSelected !== null;
        timeSpent = userSubmission.time_spent || userSubmission.time_spent_seconds || 60;
      } else {
        userSelected = userSubmission;
        isAttempted = userSelected !== 'NONE' && userSelected !== 'SKIPPED' && userSelected !== '';
        isCorrect = String(userSelected).trim().toUpperCase() === String(sol.correct_answer).trim().toUpperCase();
        markDelta = isCorrect ? 4.0 : (isAttempted ? -1.0 : 0.0);
        timeSpent = 60;
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
    }

    // Subject breakdown
    const subj = q.subject || 'Physics';
    if (subjectStats[subj]) {
      subjectStats[subj].total++;
      subjectStats[subj].timeSpent += timeSpent;
      if (!isAttempted) subjectStats[subj].unattempted++;
      else if (isCorrect) {
        subjectStats[subj].correct++;
        subjectStats[subj].marks += 4.0;
      } else {
        subjectStats[subj].incorrect++;
        subjectStats[subj].marks -= 1.0;
      }
    }

    // Difficulty breakdown
    const rawDiff = (q.difficulty_tier || 'MEDIUM').toUpperCase();
    const dTier = rawDiff === 'EASY' ? 'EASY' : (rawDiff === 'HARD' ? 'HARD' : 'MEDIUM');
    diffStats[dTier].total++;
    diffStats[dTier].timeSpent += timeSpent;

    if (isAttempted) {
      diffStats[dTier].attempted++;
      if (isCorrect) diffStats[dTier].correct++;
      else diffStats[dTier].incorrect++;
    } else {
      diffStats[dTier].skipped++;
    }

    // Diagnostics categorization
    const qData = {
      index: index + 1,
      q,
      sol,
      userSelected,
      isCorrect,
      isAttempted,
      markDelta,
      timeSpent,
      dTier,
      subj
    };

    if (timeSpent >= 210) {
      stalledQuestions.push(qData);
    }
    if (dTier === 'EASY' && (!isAttempted || !isCorrect)) {
      easyBlunders.push(qData);
    }
    if (dTier === 'HARD' && timeSpent >= 180 && !isCorrect) {
      hardTimeSinks.push(qData);
    }
    if (isCorrect && timeSpent >= 200) {
      slowSolves.push(qData);
    }
    if (!isCorrect && isAttempted && timeSpent <= 25) {
      quickGuesses.push(qData);
    }

    // Chapter-wise aggregation
    const chName = q.chapter || 'General';
    if (!chapterMap[chName]) {
      chapterMap[chName] = {
        chapter: chName,
        subject: subj,
        total: 0,
        attempted: 0,
        correct: 0,
        incorrect: 0,
        unattempted: 0,
        marks: 0.0,
        timeSpent: 0
      };
    }
    chapterMap[chName].total++;
    chapterMap[chName].timeSpent += timeSpent;
    if (isAttempted) {
      chapterMap[chName].attempted++;
      if (isCorrect) {
        chapterMap[chName].correct++;
        chapterMap[chName].marks += 4.0;
      } else {
        chapterMap[chName].incorrect++;
        chapterMap[chName].marks -= 1.0;
      }
    } else {
      chapterMap[chName].unattempted++;
    }

    return qData;
  });

  const attemptedCount = correctCount + incorrectCount;
  const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
  const attemptRate = totalQuestions > 0 ? Math.round((attemptedCount / totalQuestions) * 100) : 0;
  const totalMarks = myParticipant.marks !== undefined ? myParticipant.marks : (correctCount * 4 - incorrectCount * 1);
  const maxPossibleMarks = totalQuestions * 4;
  const scorePercent = maxPossibleMarks > 0 ? Math.round((totalMarks / maxPossibleMarks) * 100) : 0;

  // Negative marking impact (5-mark swing!)
  const directPenalty = incorrectCount * 1.0;
  const lostPotential = incorrectCount * 4.0;
  const totalNegativeSwing = directPenalty + lostPotential;

  // Previous test comparison
  const previousTest = history.find(
    (t) => (t.code || t.room_code) !== roomCode && (t.status === 'COMPLETED' || t.is_finished)
  );
  let prevComparison = null;
  if (previousTest) {
    const prevMarks = previousTest.marks !== undefined ? previousTest.marks : (previousTest.score || 0);
    const prevTotal = (previousTest.total_questions || 75) * 4;
    const prevAcc = previousTest.accuracy || 0;
    prevComparison = {
      deltaMarks: Math.round(totalMarks - prevMarks),
      deltaAccuracy: Math.round(accuracy - prevAcc),
      prevMarks,
      prevTotal,
      prevAcc,
      prevCode: previousTest.code || previousTest.room_code
    };
  }

  // Time & Efficiency calculations
  const totalTimeMinutes = Math.max(1, Math.round(totalTimeSpent / 60));
  const avgTimePerAttempt = attemptedCount > 0 ? Math.round(totalTimeSpent / attemptedCount) : 0;
  const avgTimePerCorrect = correctCount > 0 ? Math.round(timeOnCorrect / correctCount) : 0;
  const avgTimePerIncorrect = incorrectCount > 0 ? Math.round(timeOnIncorrect / incorrectCount) : 0;

  // Marks per minute per subject
  const marksPerMinute = {
    Physics: subjectStats.Physics.timeSpent > 0 ? (subjectStats.Physics.marks / (subjectStats.Physics.timeSpent / 60)).toFixed(2) : '0.00',
    Chemistry: subjectStats.Chemistry.timeSpent > 0 ? (subjectStats.Chemistry.marks / (subjectStats.Chemistry.timeSpent / 60)).toFixed(2) : '0.00',
    Mathematics: subjectStats.Mathematics.timeSpent > 0 ? (subjectStats.Mathematics.marks / (subjectStats.Mathematics.timeSpent / 60)).toFixed(2) : '0.00'
  };

  // Identify the "Time Trap" subject
  const sortedByYield = Object.entries(subjectStats)
    .filter(([_, s]) => s.timeSpent > 0)
    .sort((a, b) => {
      const yieldA = a[1].marks / Math.max(1, a[1].timeSpent);
      const yieldB = b[1].marks / Math.max(1, b[1].timeSpent);
      return yieldA - yieldB; // lowest yield first
    });
  const timeTrapSubject = sortedByYield.length > 0 ? sortedByYield[0][0] : null;

  // Chapter lists: Fortress vs High-Yield Fixes
  const chaptersList = Object.values(chapterMap);
  const fortressChapters = chaptersList.filter((c) => c.attempted >= 2 && (c.correct / c.attempted) >= 0.75);
  const highYieldFixes = chaptersList
    .map((c) => {
      const lost = c.incorrect * 5.0 + c.unattempted * 4.0;
      return { ...c, potentialMarksLost: lost };
    })
    .filter((c) => c.potentialMarksLost > 0)
    .sort((a, b) => b.potentialMarksLost - a.potentialMarksLost)
    .slice(0, 6);

  // Enriched chapters with individual accuracy, speed, and pacing diagnostics
  const enrichedChapters = chaptersList.map((c) => {
    const acc = c.attempted > 0 ? Math.round((c.correct / c.attempted) * 100) : 0;
    const avgT = c.attempted > 0 ? Math.round(c.timeSpent / c.attempted) : Math.round(c.timeSpent / Math.max(1, c.total));
    const idealT = c.subject === 'Chemistry' ? 70 : c.subject === 'Physics' ? 120 : 170;
    let speedRating = 'OPTIMAL';
    if (avgT < idealT * 0.8) speedRating = 'FAST';
    else if (avgT > idealT * 1.25) speedRating = 'SLOW';
    const marksLost = c.incorrect * 5.0 + c.unattempted * 4.0;
    return {
      ...c,
      accuracy: acc,
      avgTime: avgT,
      idealTime: idealT,
      speedRating,
      marksLost
    };
  });

  const filteredAndSortedChapters = enrichedChapters
    .filter((c) => chapterSubjFilter === 'ALL' || c.subject === chapterSubjFilter)
    .sort((a, b) => {
      if (chapterSortBy === 'MARKS_LOST') return b.marksLost - a.marksLost;
      if (chapterSortBy === 'ACCURACY_ASC') {
        const accA = a.attempted > 0 ? a.accuracy : 999;
        const accB = b.attempted > 0 ? b.accuracy : 999;
        return accA - accB;
      }
      if (chapterSortBy === 'ACCURACY_DESC') return b.accuracy - a.accuracy;
      if (chapterSortBy === 'SPEED_SLOW') return b.avgTime - a.avgTime;
      if (chapterSortBy === 'SPEED_FAST') return a.avgTime - b.avgTime;
      return 0;
    });

  // Timeline intervals (6 blocks of 30 min, or proportional)
  const intervalCount = 6;
  const questionsPerInterval = Math.ceil(totalQuestions / intervalCount);
  const timelineIntervals = Array.from({ length: intervalCount }).map((_, idx) => {
    const startQ = idx * questionsPerInterval;
    const endQ = Math.min(totalQuestions, (idx + 1) * questionsPerInterval);
    const slice = processedQuestions.slice(startQ, endQ);
    const intervalAtt = slice.filter((q) => q.isAttempted).length;
    const intervalCorr = slice.filter((q) => q.isCorrect).length;
    const intervalIncorr = slice.filter((q) => q.isAttempted && !q.isCorrect).length;
    const intervalAcc = intervalAtt > 0 ? Math.round((intervalCorr / intervalAtt) * 100) : 0;
    const intervalMarks = intervalCorr * 4 - intervalIncorr * 1;
    return {
      block: idx + 1,
      label: `${idx * 30}-${(idx + 1) * 30}m`,
      questions: slice.length,
      attempted: intervalAtt,
      correct: intervalCorr,
      incorrect: intervalIncorr,
      accuracy: intervalAcc,
      marks: intervalMarks
    };
  });

  // Fatigue factor: Compare Block 1-3 vs Block 4-6
  const firstHalfSlice = processedQuestions.slice(0, Math.floor(totalQuestions / 2));
  const secondHalfSlice = processedQuestions.slice(Math.floor(totalQuestions / 2));
  const firstHalfAtt = firstHalfSlice.filter((q) => q.isAttempted).length;
  const firstHalfCorr = firstHalfSlice.filter((q) => q.isCorrect).length;
  const firstHalfAcc = firstHalfAtt > 0 ? Math.round((firstHalfCorr / firstHalfAtt) * 100) : 0;

  const secondHalfAtt = secondHalfSlice.filter((q) => q.isAttempted).length;
  const secondHalfCorr = secondHalfSlice.filter((q) => q.isCorrect).length;
  const secondHalfAcc = secondHalfAtt > 0 ? Math.round((secondHalfCorr / secondHalfAtt) * 100) : 0;
  const fatigueDrop = firstHalfAcc - secondHalfAcc;

  // Pages Definition
  const PAGES = [
    { num: 1, title: 'Performance Overview', subtitle: 'The Big Picture' },
    { num: 2, title: 'Time & Efficiency', subtitle: 'Where the 3 Hours Went' },
    { num: 3, title: 'Timeline & Strategy', subtitle: 'How Performance Changed' },
    { num: 4, title: 'Difficulty & Quality', subtitle: 'Were the Right Qs Attempted?' },
    { num: 5, title: 'Chapter Performance', subtitle: 'Strengths & High-Yield Fixes' },
    { num: 6, title: 'Physics Q-by-Q', subtitle: 'Question-by-Question Audit' },
    { num: 7, title: 'Chemistry Q-by-Q', subtitle: 'Question-by-Question Audit' },
    { num: 8, title: 'Maths Q-by-Q', subtitle: 'Question-by-Question Audit' }
  ];

  const handleNextPage = () => {
    if (currentPage < 8) {
      sound.click();
      setCurrentPage((p) => p + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) {
      sound.click();
      setCurrentPage((p) => p - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-transition space-y-8 print:p-0 print:space-y-4">
      {/* Top Header & Quick Actions */}
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
            <span>Export 8-Page Dossier (PDF)</span>
          </button>
          <span className="px-3 py-1 rounded-xl bg-orange-500/20 text-orange-400 font-mono text-xs font-bold border border-orange-500/30">
            {data.mode}
          </span>
        </div>
      </div>

      {/* 8-PAGE NAVIGATION TABS BAR */}
      <div className="bg-[#121622] border border-white/10 rounded-3xl p-3 shadow-xl print:hidden">
        <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
          {PAGES.map((page) => {
            const isActive = currentPage === page.num;
            return (
              <button
                key={page.num}
                onClick={() => {
                  sound.click();
                  setCurrentPage(page.num);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`px-3.5 py-2.5 rounded-2xl text-xs font-bold transition flex items-center gap-2 shrink-0 cursor-pointer ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg glow-orange-subtle'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                }`}
              >
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center font-mono text-[10px] font-black ${
                    isActive ? 'bg-black/30 text-white' : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {page.num}
                </span>
                <span className="whitespace-nowrap">{page.title}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* PAGE 1: PERFORMANCE OVERVIEW (THE BIG PICTURE) */}
      {/* ========================================================================= */}
      {currentPage === 1 && (
        <div className="space-y-6 animate-fadeIn">
          {/* Executive Scorecard Banner */}
          <div className="bg-gradient-to-br from-[#1b2234] via-[#151a26] to-[#0e121c] border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl glow-orange-subtle print:border-black print:bg-white print:text-black">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10 print:border-black">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-[10px] px-3 py-1 rounded-full bg-orange-950 border border-orange-500/40 text-orange-400 font-mono font-bold uppercase tracking-wider print:border-black print:text-black">
                    Page 1 of 8 • Performance Overview
                  </span>
                </div>
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight print:text-black">
                  {data.preset_name || 'NTA Full Mock Examination'}
                </h1>
                <p className="text-slate-400 text-xs mt-1 font-mono print:text-slate-600">
                  Paper Ref #{data.room_code} • NTA JEE Scheme (+4.0 Correct / -1.0 Negative Marking)
                </p>
              </div>

              {/* Primary Scoreboards */}
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
                  <span className="text-[10px] font-mono text-amber-300 block mt-0.5">
                    {scorePercent}% marks
                  </span>
                </div>

                <div className="text-center sm:text-left pr-4 border-r border-white/10 print:border-black">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                    Accuracy
                  </span>
                  <div className="text-3xl sm:text-4xl font-black text-emerald-400 font-mono print:text-black">
                    {accuracy}%
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 block mt-0.5">
                    Attempt: {attemptRate}%
                  </span>
                </div>

                <div className="text-center sm:text-left">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                    Projected AIR
                  </span>
                  <div className="text-xl sm:text-2xl font-black text-amber-400 font-mono print:text-black">
                    {user?.predicted_air_bracket || 'AIR < 15,000'}
                  </div>
                  <span className="text-[10px] font-mono text-cyan-400 block mt-0.5">
                    Top {100 - (user?.speed_percentile || 50)}% Speed
                  </span>
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
                <span className="text-xs text-slate-400 block mb-1">Unattempted (0)</span>
                <span className="text-xl font-bold text-slate-300 print:text-black">
                  {unattemptedCount} <span className="text-xs text-slate-400">questions</span>
                </span>
              </div>
            </div>
          </div>

          {/* Subject-Wise Score Comparison */}
          <div className="bg-[#121622] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl space-y-5 print:border-black print:bg-white">
            <div className="flex items-center justify-between pb-3 border-b border-white/5 print:border-black">
              <h2 className="text-base font-black text-white uppercase tracking-wider flex items-center gap-2 print:text-black">
                <BarChart2 className="w-4 h-4 text-orange-400" />
                Subject-by-Subject Score Comparison
              </h2>
              <span className="text-xs font-mono text-slate-400">Physics • Chemistry • Mathematics</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {['Physics', 'Chemistry', 'Mathematics'].map((sName) => {
                const s = subjectStats[sName] || { marks: 0, correct: 0, incorrect: 0, total: 25 };
                const sAtt = s.correct + s.incorrect;
                const sAcc = sAtt > 0 ? Math.round((s.correct / sAtt) * 100) : 0;
                const color = sName === 'Physics' ? 'text-blue-400' : sName === 'Chemistry' ? 'text-emerald-400' : 'text-purple-400';
                const borderColor = sName === 'Physics' ? 'border-blue-500/30' : sName === 'Chemistry' ? 'border-emerald-500/30' : 'border-purple-500/30';
                return (
                  <div key={sName} className={`p-5 rounded-2xl bg-[#171d2b] border ${borderColor} space-y-3`}>
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-black uppercase tracking-wider ${color}`}>
                        {sName}
                      </span>
                      <span className="text-lg font-black font-mono text-white">
                        {s.marks} <span className="text-xs text-slate-400">/ {s.total * 4}</span>
                      </span>
                    </div>

                    {/* Score Bar */}
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className={`h-full ${sName === 'Physics' ? 'bg-blue-500' : sName === 'Chemistry' ? 'bg-emerald-500' : 'bg-purple-500'}`}
                        style={{ width: `${Math.max(0, Math.min(100, (s.marks / (s.total * 4)) * 100))}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>Att: <strong>{sAtt}</strong>/{s.total}</span>
                      <span>Corr: <strong className="text-emerald-400">{s.correct}</strong></span>
                      <span>Acc: <strong className="text-white">{sAcc}%</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Negative Marking Toll (The True Cost of Wrong Guesses) */}
          <div className="p-6 rounded-3xl bg-gradient-to-r from-red-950/40 via-[#18131d] to-[#121622] border border-red-500/30 shadow-xl space-y-3">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <h3 className="text-sm font-black uppercase tracking-wider text-white">
                The 5-Mark Swing: Negative Marking Toll
              </h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              In JEE, an incorrect answer doesn't merely cost <span className="font-mono text-red-400">-1 mark</span>; it wipes out the <span className="font-mono text-emerald-400">+4 marks</span> you would have banked with a correct solve. That is a <span className="font-mono text-amber-400 font-bold">5-mark swing</span> per mistake.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 font-mono">
              <div className="p-3.5 rounded-xl bg-black/40 border border-red-500/20 text-center">
                <span className="text-[10px] uppercase text-slate-400 block">Direct Penalty</span>
                <span className="text-xl font-bold text-red-400">-{directPenalty} marks</span>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-amber-500/20 text-center">
                <span className="text-[10px] uppercase text-slate-400 block">Lost Solve Potential</span>
                <span className="text-xl font-bold text-amber-400">+{lostPotential} marks</span>
              </div>
              <div className="p-3.5 rounded-xl bg-black/40 border border-orange-500/20 text-center">
                <span className="text-[10px] uppercase text-slate-400 block">Total Swing Toll</span>
                <span className="text-xl font-black text-orange-400">-{totalNegativeSwing} marks</span>
              </div>
            </div>
          </div>

          {/* Previous Tests Comparison */}
          {prevComparison && (
            <div className="p-6 rounded-3xl bg-[#121622] border border-white/10 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-cyan-400" />
                  <h3 className="text-sm font-black uppercase tracking-wider text-white">
                    Comparison with Previous Test (#{prevComparison.prevCode})
                  </h3>
                </div>
                <span className="text-xs font-mono text-slate-400">
                  Past: {prevComparison.prevMarks}/{prevComparison.prevTotal} ({prevComparison.prevAcc}% Acc)
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1 font-mono">
                <div className="p-3.5 rounded-xl bg-[#171d2b] border border-white/5 text-center">
                  <span className="text-[10px] uppercase text-slate-400 block">Score Delta</span>
                  <span
                    className={`text-xl font-black ${
                      prevComparison.deltaMarks >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {prevComparison.deltaMarks >= 0 ? `+${prevComparison.deltaMarks}` : prevComparison.deltaMarks} marks
                  </span>
                </div>
                <div className="p-3.5 rounded-xl bg-[#171d2b] border border-white/5 text-center">
                  <span className="text-[10px] uppercase text-slate-400 block">Accuracy Delta</span>
                  <span
                    className={`text-xl font-black ${
                      prevComparison.deltaAccuracy >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}
                  >
                    {prevComparison.deltaAccuracy >= 0 ? `+${prevComparison.deltaAccuracy}%` : `${prevComparison.deltaAccuracy}%`}
                  </span>
                </div>
                <div className="col-span-2 sm:col-span-1 p-3.5 rounded-xl bg-[#171d2b] border border-white/5 text-center flex flex-col justify-center">
                  <span className="text-[10px] uppercase text-slate-400 block">Trajectory Status</span>
                  <span className="text-xs font-bold text-amber-300 mt-1">
                    {prevComparison.deltaMarks > 0 ? 'Ascending Trajectory' : 'Stable Diagnostic'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 2: TIME AND EFFICIENCY (WHERE THE THREE HOURS WENT) */}
      {/* ========================================================================= */}
      {currentPage === 2 && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-[#121622] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-cyan-950 border border-cyan-500/40 text-cyan-400 font-mono font-bold uppercase tracking-wider">
                  Page 2 of 8 • Time Economics
                </span>
                <h2 className="text-xl font-black text-white mt-1">Where the Examination Hours Went</h2>
              </div>
              <span className="text-xs font-mono text-slate-400">Total Pacing: ~{totalTimeMinutes} min</span>
            </div>

            {/* Time Split by Subject */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {['Physics', 'Chemistry', 'Mathematics'].map((sName) => {
                const sTime = subjectStats[sName]?.timeSpent || 0;
                const sMin = Math.round(sTime / 60);
                const sPct = totalTimeSpent > 0 ? Math.round((sTime / totalTimeSpent) * 100) : 33;
                const idealMin = sName === 'Chemistry' ? 40 : sName === 'Physics' ? 55 : 85;
                return (
                  <div key={sName} className="p-4 rounded-2xl bg-[#171d2b] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-white">{sName} Time</span>
                      <span className="text-lg font-black font-mono text-cyan-400">{sMin}m</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-cyan-500" style={{ width: `${sPct}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>{sPct}% of total test</span>
                      <span>Target: ~{idealMin}m</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pacing Economics Matrix */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
              <div className="p-4 rounded-2xl bg-[#171d2b] border border-emerald-500/30">
                <span className="text-xs text-slate-400 block mb-1">Avg Time on Correct Qs</span>
                <span className="text-2xl font-black text-emerald-400">{avgTimePerCorrect}s</span>
                <span className="text-[10px] text-slate-500 block mt-1">Decisive solving window</span>
              </div>
              <div className="p-4 rounded-2xl bg-[#171d2b] border border-red-500/30">
                <span className="text-xs text-slate-400 block mb-1">Wasted Time (on Wrong Qs)</span>
                <span className="text-2xl font-black text-red-400">{Math.round(timeOnIncorrect / 60)} min</span>
                <span className="text-[10px] text-slate-500 block mt-1">{avgTimePerIncorrect}s per mistake</span>
              </div>
              <div className="p-4 rounded-2xl bg-[#171d2b] border border-white/10">
                <span className="text-xs text-slate-400 block mb-1">Avg Time per Attempt</span>
                <span className="text-2xl font-black text-white">{avgTimePerAttempt}s</span>
                <span className="text-[10px] text-slate-500 block mt-1">Across all attempted problems</span>
              </div>
            </div>

            {/* Marks Earned Per Minute (Yield Analysis) */}
            <div className="p-5 rounded-2xl bg-[#141824] border border-amber-500/30 space-y-3">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  Yield Analysis: Marks Earned Per Minute
                </h3>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center font-mono">
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-[10px] uppercase text-slate-400 block">Physics</span>
                  <span className="text-lg font-bold text-white">{marksPerMinute.Physics}</span>
                  <span className="text-[9px] text-slate-500 block">pts / min</span>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-[10px] uppercase text-slate-400 block">Chemistry</span>
                  <span className="text-lg font-bold text-emerald-400">{marksPerMinute.Chemistry}</span>
                  <span className="text-[9px] text-slate-500 block">pts / min</span>
                </div>
                <div className="p-3 rounded-xl bg-black/40 border border-white/5">
                  <span className="text-[10px] uppercase text-slate-400 block">Mathematics</span>
                  <span className="text-lg font-bold text-purple-400">{marksPerMinute.Mathematics}</span>
                  <span className="text-[9px] text-slate-500 block">pts / min</span>
                </div>
              </div>
            </div>

            {/* Time Trap Subject Identification */}
            {timeTrapSubject && (
              <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-500/40 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-black uppercase text-amber-300">
                    Time Trap Warning: {timeTrapSubject}
                  </h4>
                  <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
                    {timeTrapSubject} had your lowest yield ({marksPerMinute[timeTrapSubject]} marks/min) relative to the time invested ({Math.round(subjectStats[timeTrapSubject].timeSpent / 60)} minutes). In your next mock test, enforce a strict cap on this subject and redirect leftover minutes toward Chemistry speed-solves.
                  </p>
                </div>
              </div>
            )}

            {/* Stalled Questions Table */}
            {stalledQuestions.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Questions Taking Disproportionately Long (&gt;3.5 Minutes)
                </h4>
                <div className="space-y-2">
                  {stalledQuestions.slice(0, 5).map((qData) => (
                    <div
                      key={qData.index}
                      className="p-3 rounded-xl bg-[#171d2b] border border-white/5 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono font-bold text-white">Q{qData.index}</span>
                        <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-mono text-slate-300">
                          {qData.subj}
                        </span>
                        <span className="text-slate-300 truncate max-w-xs">{qData.q.chapter}</span>
                      </div>
                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-red-400 font-bold">{Math.round(qData.timeSpent)}s</span>
                        <span
                          className={`font-bold ${
                            qData.isCorrect ? 'text-emerald-400' : qData.isAttempted ? 'text-red-400' : 'text-slate-500'
                          }`}
                        >
                          {qData.isCorrect ? '+4 pts' : qData.isAttempted ? '-1 pt' : 'Skipped'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 3: EXAM TIMELINE AND STRATEGY */}
      {/* ========================================================================= */}
      {currentPage === 3 && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-[#121622] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-purple-950 border border-purple-500/40 text-purple-300 font-mono font-bold uppercase tracking-wider">
                  Page 3 of 8 • Strategy & Fatigue
                </span>
                <h2 className="text-xl font-black text-white mt-1">Timeline Progression & Fatigue Audit</h2>
              </div>
              <span className="text-xs font-mono text-slate-400">Pacing in 30-Minute Windows</span>
            </div>

            {/* 30-Minute Blocks Chart */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Pacing & Accuracy Across 30-Minute Blocks
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
                {timelineIntervals.map((block) => (
                  <div key={block.block} className="p-4 rounded-2xl bg-[#171d2b] border border-white/10 space-y-2 text-center">
                    <span className="text-[10px] font-mono font-bold uppercase text-slate-400 block">
                      {block.label}
                    </span>
                    <div className="text-xl font-black font-mono text-white">
                      {block.marks} <span className="text-xs text-slate-500 font-sans">pts</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-purple-500" style={{ width: `${block.accuracy}%` }} />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-1">
                      <span>Att: {block.attempted}</span>
                      <span className="text-emerald-400 font-bold">{block.accuracy}%</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Fatigue Audit: 1st Half vs 2nd Half */}
            <div className="p-5 rounded-2xl bg-[#171d2b] border border-white/10 space-y-4">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-purple-400" />
                <h3 className="text-xs font-black uppercase tracking-wider text-white">
                  Cognitive Fatigue & Late-Test Rush Diagnosis
                </h3>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono">
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-center">
                  <span className="text-[10px] uppercase text-slate-400 block">First 90 Minutes (Fresh)</span>
                  <span className="text-2xl font-black text-emerald-400">{firstHalfAcc}%</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">{firstHalfCorr}/{firstHalfAtt} correct</span>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-center">
                  <span className="text-[10px] uppercase text-slate-400 block">Final 90 Minutes (Fatigue)</span>
                  <span className="text-2xl font-black text-amber-400">{secondHalfAcc}%</span>
                  <span className="text-[10px] text-slate-500 block mt-0.5">{secondHalfCorr}/{secondHalfAtt} correct</span>
                </div>
                <div className="p-4 rounded-xl bg-black/40 border border-white/5 text-center flex flex-col justify-center">
                  <span className="text-[10px] uppercase text-slate-400 block">Fatigue Shift</span>
                  <span className={`text-xl font-black ${fatigueDrop > 15 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {fatigueDrop > 0 ? `-${fatigueDrop}% Accuracy` : '+Stable'}
                  </span>
                </div>
              </div>
              {fatigueDrop > 15 ? (
                <p className="text-xs text-red-300 leading-relaxed">
                  Severe late-test accuracy drop detected (-{fatigueDrop}%). This indicates panic rushing or cognitive depletion in the final hour. In JEE, save high-confidence Inorganic or formula-based problems for the final 30 minutes to maintain steady conversion.
                </p>
              ) : (
                <p className="text-xs text-emerald-300 leading-relaxed">
                  Excellent pacing stamina. Your accuracy remained stable throughout the duration without late-test panic rushing.
                </p>
              )}
            </div>

            {/* Subject Order Strategy Advice */}
            <div className="p-5 rounded-2xl bg-gradient-to-r from-cyan-950/30 to-[#171d2b] border border-cyan-500/30 space-y-2">
              <span className="text-[10px] font-mono font-bold uppercase text-cyan-400 block">
                Recommended JEE Exam Order
              </span>
              <h4 className="text-xs font-black text-white">
                Standard Optimal Sequence: Chemistry (40m) &rarr; Physics (55m) &rarr; Mathematics (85m)
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                Starting with Chemistry builds an early buffer of 60-70 marks in under 45 minutes, creating immense psychological momentum and leaving ample calculation time for multi-step Mathematics questions.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 4: DIFFICULTY AND ATTEMPT QUALITY */}
      {/* ========================================================================= */}
      {currentPage === 4 && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-[#121622] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-amber-950 border border-amber-500/40 text-amber-400 font-mono font-bold uppercase tracking-wider">
                  Page 4 of 8 • Triage Quality
                </span>
                <h2 className="text-xl font-black text-white mt-1">Were the Right Questions Attempted?</h2>
              </div>
              <span className="text-xs font-mono text-slate-400">Easy • Medium • Hard Calibration</span>
            </div>

            {/* 3-Tier Difficulty Matrix */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {['EASY', 'MEDIUM', 'HARD'].map((tier) => {
                const d = diffStats[tier];
                const acc = d.attempted > 0 ? Math.round((d.correct / d.attempted) * 100) : 0;
                const avgT = d.attempted > 0 ? Math.round(d.timeSpent / d.attempted) : 0;
                return (
                  <div key={tier} className="p-5 rounded-2xl bg-[#171d2b] border border-white/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black uppercase text-white">{tier} Questions</span>
                      <span className="text-xs font-mono text-slate-400">{d.attempted}/{d.total} attempted</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl font-black font-mono text-emerald-400">{acc}%</span>
                      <span className="text-xs text-slate-400 font-mono">accuracy</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                      <span>Correct: <strong className="text-white">{d.correct}</strong></span>
                      <span>Avg Pace: <strong className="text-white">{avgT}s</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unforgivable Blunders: Easy Questions Missed */}
            {easyBlunders.length > 0 && (
              <div className="p-5 rounded-2xl bg-red-950/20 border border-red-500/30 space-y-3">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-400" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-red-300">
                    Unforgivable Blunders: {easyBlunders.length} Easy Questions Missed or Skipped
                  </h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  In competitive exams, easy questions are free marks that you cannot afford to drop. Every missed easy problem represents a loss of at least 4 to 5 marks against the national candidate pool.
                </p>
                <div className="space-y-2">
                  {easyBlunders.slice(0, 5).map((qData) => (
                    <div
                      key={qData.index}
                      className="p-3 rounded-xl bg-black/40 border border-red-500/20 flex items-center justify-between text-xs font-mono"
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">Q{qData.index}</span>
                        <span className="text-slate-400 truncate max-w-xs">{qData.q.chapter}</span>
                      </div>
                      <span className="text-red-400 font-bold">
                        {qData.isAttempted ? '-1 Negative Penalty' : 'Skipped (+4 Lost)'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Hard Question Time Sinks */}
            {hardTimeSinks.length > 0 && (
              <div className="p-5 rounded-2xl bg-amber-950/20 border border-amber-500/30 space-y-2">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-amber-300">
                    Difficult Question Time Sinks ({hardTimeSinks.length} detected)
                  </h4>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  You spent more than 3 minutes on these difficult questions without scoring marks. Practice the <strong className="text-white">"20-Second Triage Rule"</strong>: if a difficult question's roadmap isn't clear in 20 seconds, flag and move forward.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* PAGE 5: CHAPTER-WISE PERFORMANCE */}
      {/* ========================================================================= */}
      {currentPage === 5 && (
        <div className="space-y-6 animate-fadeIn">
          <div className="bg-[#121622] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <div>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400 font-mono font-bold uppercase tracking-wider">
                  Page 5 of 8 • Chapter Audit
                </span>
                <h2 className="text-xl font-black text-white mt-1">Which Chapters are Strong and Weak?</h2>
              </div>
              <span className="text-xs font-mono text-slate-400">{chaptersList.length} Chapters Tested</span>
            </div>

            {/* Fortress Chapters Banner */}
            {fortressChapters.length > 0 && (
              <div className="p-5 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <h4 className="text-xs font-black uppercase tracking-wider text-emerald-300">
                    Bankable Fortress Chapters (&ge;75% Conversion)
                  </h4>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {fortressChapters.map((c) => (
                    <span
                      key={c.chapter}
                      className="px-3 py-1 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold"
                    >
                      {c.chapter} (+{c.marks} pts)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* High-Yield Fixes Ranked by Marks Lost */}
            <div className="space-y-3">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400">
                Weak Chapters Ranked by Impact on Next Test
              </h4>
              <div className="space-y-3">
                {highYieldFixes.map((c) => (
                  <div
                    key={c.chapter}
                    className="p-4 rounded-2xl bg-[#171d2b] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-white/10 text-slate-300">
                          {c.subject}
                        </span>
                        <h5 className="text-sm font-black text-white">{c.chapter}</h5>
                      </div>
                      <div className="flex items-center gap-3 text-xs font-mono text-slate-400 mt-1">
                        <span>Att: {c.attempted}/{c.total}</span>
                        <span>Correct: <strong className="text-emerald-400">{c.correct}</strong></span>
                        <span>Incorrect: <strong className="text-red-400">{c.incorrect}</strong></span>
                        <span>Time: ~{Math.round(c.timeSpent / 60)}m</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right font-mono">
                        <span className="text-xs text-red-400 font-bold block">
                          -{c.potentialMarksLost} pts lost
                        </span>
                        <span className="text-[10px] text-slate-500">Recovery potential</span>
                      </div>
                      <button
                        onClick={() => handleLaunchRemedial(c.subject, c.chapter)}
                        disabled={launchingDrill}
                        className="px-3.5 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs transition cursor-pointer flex items-center gap-1.5"
                      >
                        <Flame className="w-3.5 h-3.5" />
                        <span>Practice Drill</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Complete Chapter-Wise Accuracy & Speed Master Matrix */}
            <div className="space-y-4 pt-5 border-t border-white/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-400" />
                    <span>Complete Chapter-Wise Accuracy & Speed Matrix</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Individual accuracy rate, solving speed, and pacing deviations for all {chaptersList.length} tested chapters.
                  </p>
                </div>

                {/* Filter and Sort Controls */}
                <div className="flex items-center gap-2 flex-wrap">
                  {/* Subject Filter Pills */}
                  <div className="flex items-center gap-1 bg-[#0f121a] p-1 rounded-xl border border-white/5">
                    {['ALL', 'Physics', 'Chemistry', 'Mathematics'].map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          sound.click();
                          setChapterSubjFilter(s);
                        }}
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer ${
                          chapterSubjFilter === s
                            ? 'bg-orange-500 text-white shadow'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {s === 'ALL' ? 'All' : s.slice(0, 4)}
                      </button>
                    ))}
                  </div>

                  {/* Sort Dropdown */}
                  <select
                    value={chapterSortBy}
                    onChange={(e) => setChapterSortBy(e.target.value)}
                    className="px-2.5 py-1.5 bg-[#0f121a] border border-white/10 rounded-xl text-white text-xs font-mono font-bold focus:outline-none transition cursor-pointer"
                  >
                    <option value="MARKS_LOST">Sort: Most Marks Lost</option>
                    <option value="ACCURACY_ASC">Sort: Lowest Accuracy (Blunders)</option>
                    <option value="ACCURACY_DESC">Sort: Highest Accuracy</option>
                    <option value="SPEED_SLOW">Sort: Slowest Pace (Time Traps)</option>
                    <option value="SPEED_FAST">Sort: Fastest Pace</option>
                  </select>
                </div>
              </div>

              {/* Chapter Matrix Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredAndSortedChapters.map((c) => {
                  const hasAtt = c.attempted > 0;
                  const accColor =
                    c.accuracy >= 80 ? 'text-emerald-400' :
                    c.accuracy >= 60 ? 'text-blue-400' :
                    c.accuracy >= 40 ? 'text-amber-400' :
                    hasAtt ? 'text-red-400' : 'text-slate-500';
                  const accBg =
                    c.accuracy >= 80 ? 'bg-emerald-500' :
                    c.accuracy >= 60 ? 'bg-blue-500' :
                    c.accuracy >= 40 ? 'bg-amber-500' : 'bg-red-500';

                  return (
                    <div
                      key={c.chapter}
                      className="p-4 rounded-2xl bg-[#171d2b] border border-white/10 hover:border-white/20 transition space-y-3"
                    >
                      {/* Top Header */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                              c.subject === 'Physics'
                                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                                : c.subject === 'Chemistry'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-purple-500/15 text-purple-400 border border-purple-500/30'
                            }`}
                          >
                            {c.subject}
                          </span>
                          <h5 className="text-xs font-black text-white truncate max-w-[200px]" title={c.chapter}>
                            {c.chapter}
                          </h5>
                        </div>
                        <span className="text-xs font-mono font-bold text-white">
                          {c.marks >= 0 ? `+${c.marks}` : c.marks} pts
                        </span>
                      </div>

                      {/* Dual Metric: Accuracy & Speed */}
                      <div className="grid grid-cols-2 gap-2.5 font-mono">
                        {/* Accuracy Block */}
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 uppercase flex items-center gap-1">
                              <Target className="w-2.5 h-2.5 text-amber-400" />
                              <span>Accuracy</span>
                            </span>
                            <span className={`font-black ${accColor}`}>
                              {hasAtt ? `${c.accuracy}%` : 'Skipped'}
                            </span>
                          </div>
                          <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                            <div className={`h-full ${accBg}`} style={{ width: `${c.accuracy}%` }} />
                          </div>
                          <div className="flex items-center justify-between text-[9px] text-slate-500">
                            <span>Corr: {c.correct}</span>
                            <span>Wrong: {c.incorrect}</span>
                          </div>
                        </div>

                        {/* Speed Block */}
                        <div className="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1.5 text-right">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-400 uppercase flex items-center gap-1">
                              <Clock className="w-2.5 h-2.5 text-cyan-400" />
                              <span>Speed</span>
                            </span>
                            <span
                              className={`font-black ${
                                c.speedRating === 'FAST'
                                  ? 'text-cyan-400'
                                  : c.speedRating === 'OPTIMAL'
                                  ? 'text-emerald-400'
                                  : 'text-amber-400'
                              }`}
                            >
                              ~{c.avgTime}s/q
                            </span>
                          </div>
                          <div className="flex items-center justify-end gap-1">
                            <span
                              className={`text-[8px] font-bold px-1.5 py-0.2 rounded border ${
                                c.speedRating === 'FAST'
                                  ? 'bg-cyan-950/60 text-cyan-300 border-cyan-500/30'
                                  : c.speedRating === 'OPTIMAL'
                                  ? 'bg-emerald-950/60 text-emerald-300 border-emerald-500/30'
                                  : 'bg-amber-950/60 text-amber-300 border-amber-500/30'
                              }`}
                            >
                              {c.speedRating === 'FAST'
                                ? '⚡ Fast'
                                : c.speedRating === 'OPTIMAL'
                                ? '🎯 Calibrated'
                                : '⏱️ Sluggish'}
                            </span>
                          </div>
                          <div className="text-[9px] text-slate-500">
                            Target: {c.idealTime}s
                          </div>
                        </div>
                      </div>

                      {/* Footer Actions */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] font-mono text-red-400">
                          {c.marksLost > 0 ? `-${c.marksLost} pts swing` : 'Zero lost'}
                        </span>
                        <button
                          onClick={() => handleLaunchRemedial(c.subject, c.chapter)}
                          disabled={launchingDrill}
                          className="px-2.5 py-1 rounded-lg bg-orange-500/15 hover:bg-orange-500 text-orange-400 hover:text-white font-bold text-[10px] transition cursor-pointer flex items-center gap-1 border border-orange-500/30"
                        >
                          <Flame className="w-2.5 h-2.5" />
                          <span>Practice</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ========================================================================= */}
      {/* PAGES 6, 7, 8: QUESTION-BY-QUESTION AUDITS */}
      {/* ========================================================================= */}
      {(currentPage === 6 || currentPage === 7 || currentPage === 8) && (() => {
        const targetSubject = currentPage === 6 ? 'Physics' : currentPage === 7 ? 'Chemistry' : 'Mathematics';
        const subjQuestions = processedQuestions.filter((q) => q.subj === targetSubject);

        // Filter by user selection
        const displayQuestions = subjQuestions.filter((item) => {
          if (auditFilter === 'CORRECT' && (!item.isAttempted || !item.isCorrect)) return false;
          if (auditFilter === 'INCORRECT' && (!item.isAttempted || item.isCorrect)) return false;
          if (auditFilter === 'UNATTEMPTED' && item.isAttempted) return false;
          return true;
        });

        const sStats = subjectStats[targetSubject] || { marks: 0, total: 25, correct: 0, incorrect: 0, timeSpent: 0 };
        const sAtt = sStats.correct + sStats.incorrect;
        const sAcc = sAtt > 0 ? Math.round((sStats.correct / sAtt) * 100) : 0;

        return (
          <div className="space-y-6 animate-fadeIn">
            {/* Subject Header Banner */}
            <div className="bg-[#121622] border border-white/10 rounded-3xl p-6 sm:p-7 shadow-xl space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
                <div>
                  <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-orange-950 border border-orange-500/40 text-orange-400 font-mono font-bold uppercase tracking-wider">
                    Page {currentPage} of 8 • {targetSubject} Audit
                  </span>
                  <h2 className="text-2xl font-black text-white mt-1">
                    {targetSubject} Question-by-Question Diagnosis
                  </h2>
                </div>

                {/* Score Summary */}
                <div className="flex items-center gap-4 bg-[#171d2b] border border-white/10 rounded-2xl p-4 font-mono text-center">
                  <div className="pr-3 border-r border-white/10">
                    <span className="text-[10px] text-slate-400 uppercase block">Score</span>
                    <span className="text-xl font-black text-white">{sStats.marks} pts</span>
                  </div>
                  <div className="pr-3 border-r border-white/10">
                    <span className="text-[10px] text-slate-400 uppercase block">Accuracy</span>
                    <span className="text-xl font-black text-emerald-400">{sAcc}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase block">Time</span>
                    <span className="text-xl font-black text-cyan-400">~{Math.round(sStats.timeSpent / 60)}m</span>
                  </div>
                </div>
              </div>

              {/* Filter Pills & Expand All */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {[
                    { id: 'ALL', label: `All (${subjQuestions.length})` },
                    { id: 'CORRECT', label: `Correct (${sStats.correct})` },
                    { id: 'INCORRECT', label: `Incorrect (${sStats.incorrect})` },
                    { id: 'UNATTEMPTED', label: `Skipped (${sStats.unattempted})` }
                  ].map((f) => (
                    <button
                      key={f.id}
                      onClick={() => {
                        sound.click();
                        setAuditFilter(f.id);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                        auditFilter === f.id
                          ? 'bg-orange-500 text-white shadow'
                          : 'bg-[#171d2b] text-slate-400 hover:text-white border border-white/5'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => expandAllSubject(subjQuestions)}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition cursor-pointer"
                  >
                    Expand All Solutions
                  </button>
                  <button
                    onClick={() => collapseAllSubject(subjQuestions)}
                    className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs transition cursor-pointer"
                  >
                    Collapse All
                  </button>
                </div>
              </div>
            </div>

            {/* Questions List */}
            <div className="space-y-4">
              {displayQuestions.map((item) => {
                const q = item.q;
                const sol = item.sol;
                const isExpanded = Boolean(expandedSolutions[q.id]);

                return (
                  <div
                    key={q.id}
                    className={`p-5 rounded-3xl border transition shadow-lg ${
                      item.isCorrect
                        ? 'bg-[#131924] border-emerald-500/30'
                        : item.isAttempted
                        ? 'bg-[#19141f] border-red-500/30'
                        : 'bg-[#121622] border-white/10'
                    }`}
                  >
                    {/* Question Header Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-white/5">
                      <div className="flex items-center gap-2 font-mono">
                        <span className="text-sm font-black text-white">Q{item.index}</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-white/10 text-[10px] font-bold text-slate-300">
                          {q.chapter}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/40 text-slate-400">
                          {item.dTier}
                        </span>
                      </div>

                      <div className="flex items-center gap-3 font-mono">
                        <span className="text-xs text-slate-400 flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{Math.round(item.timeSpent)}s</span>
                        </span>
                        <span
                          className={`text-xs font-black px-2.5 py-0.5 rounded-full ${
                            item.isCorrect
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : item.isAttempted
                              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                              : 'bg-slate-800 text-slate-400 border border-white/10'
                          }`}
                        >
                          {item.isCorrect ? '+4.0 MARKS' : item.isAttempted ? '-1.0 PENALTY' : '0.0 SKIPPED'}
                        </span>
                      </div>
                    </div>

                    {/* Question Statement */}
                    <div className="py-4 text-sm text-slate-200 leading-relaxed font-sans">
                      <MathRenderer content={q.text} />
                    </div>

                    {/* Diagrams if present */}
                    {q.diagram_urls && (
                      <div className="my-3 p-2 bg-black/30 rounded-xl max-w-sm">
                        <img src={q.diagram_urls} alt="Question diagram" className="rounded-lg max-h-56 mx-auto" />
                      </div>
                    )}

                    {/* User Answer vs Correct Answer */}
                    <div className="p-3.5 rounded-2xl bg-black/40 border border-white/5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <span className="text-[10px] uppercase text-slate-500 block">Your Response</span>
                        <span
                          className={`font-black ${
                            item.isCorrect ? 'text-emerald-400' : item.isAttempted ? 'text-red-400' : 'text-slate-500'
                          }`}
                        >
                          {item.isAttempted ? String(item.userSelected) : 'UNATTEMPTED'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase text-slate-500 block">Correct Answer</span>
                        <span className="font-black text-emerald-400">{String(sol.correct_answer)}</span>
                      </div>
                    </div>

                    {/* Solution Toggle & Report Button */}
                    <div className="mt-4 flex items-center justify-between pt-2">
                      <button
                        onClick={() => toggleSolution(q.id)}
                        className="text-xs font-bold text-orange-400 hover:text-orange-300 transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>{isExpanded ? 'Hide Detailed Solution' : 'View Detailed Solution & Derivation'}</span>
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>

                      <button
                        onClick={() => setReportTarget({ id: q.id, text: q.text })}
                        className="text-xs font-mono text-slate-500 hover:text-slate-400 transition flex items-center gap-1 cursor-pointer"
                      >
                        <Flag className="w-3 h-3" />
                        <span>Report</span>
                      </button>
                    </div>

                    {/* Solution Panel */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t border-white/10 space-y-4 animate-fadeIn">
                        {sol.solution_text && (
                          <div className="p-4 rounded-2xl bg-[#171d2b] border border-white/5 space-y-2">
                            <span className="text-[10px] font-mono font-bold uppercase text-orange-400 block">
                              Official Step-by-Step Solution
                            </span>
                            <div className="text-xs text-slate-300 leading-relaxed font-sans">
                              <MathRenderer content={sol.solution_text} />
                            </div>
                          </div>
                        )}

                        {/* On-Demand Derivation */}
                        <OnDemandDerivationBox question={q} user={user} />

                        {/* Common Pitfall */}
                        {sol.common_pitfall && (
                          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 flex items-start gap-2.5">
                            <Lightbulb className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div className="text-xs text-amber-200">
                              <strong className="block mb-0.5 font-bold uppercase tracking-wider text-[10px]">
                                Common JEE Trap & Pitfall
                              </strong>
                              {sol.common_pitfall}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* BOTTOM PAGINATION CONTROLS */}
      <div className="flex items-center justify-between pt-6 border-t border-white/10 print:hidden">
        <button
          onClick={handlePrevPage}
          disabled={currentPage <= 1}
          className="px-5 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 disabled:pointer-events-none text-white font-bold text-xs transition cursor-pointer flex items-center gap-2"
        >
          <ChevronLeft className="w-4 h-4" />
          <span>Previous Page</span>
        </button>

        <span className="text-xs font-mono text-slate-400">
          Page <strong className="text-white">{currentPage}</strong> of 8 • {PAGES[currentPage - 1]?.title}
        </span>

        <button
          onClick={handleNextPage}
          disabled={currentPage >= 8}
          className="px-5 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 disabled:opacity-30 disabled:pointer-events-none text-white font-bold text-xs transition cursor-pointer flex items-center gap-2 shadow-lg"
        >
          <span>Next Page</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Report Question Modal */}
      {reportTarget && (
        <ReportQuestionModal
          question={reportTarget}
          user={user}
          onClose={() => setReportTarget(null)}
        />
      )}
    </div>
  );
}
