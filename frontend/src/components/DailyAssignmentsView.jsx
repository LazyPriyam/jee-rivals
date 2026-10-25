import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Sparkles,
  Zap,
  Clock,
  BookOpen,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  RotateCcw,
  BarChart3,
  Calendar,
  Layers,
  ChevronLeft,
  ChevronRight,
  Flame,
  Shield,
  BookMarked,
  FileText,
  Save,
  Check,
  TrendingUp,
  AlertTriangle,
  Compass,
  X,
  Target,
  Trophy,
  Loader2
} from 'lucide-react';

import MathRenderer from './MathRenderer';
import { api } from '../utils/api';
import sound from '../utils/sound';

const REFLECTION_TAGS = [
  {
    id: 'BREAKTHROUGH',
    label: 'Clean Breakthrough',
    sublabel: '<10 min • Clear Insight',
    icon: Zap,
    color: 'emerald',
    borderColor: 'border-emerald-500/50 hover:border-emerald-400',
    activeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-400 shadow-lg shadow-emerald-950/40',
    badge: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
  },
  {
    id: 'DEEP_DERIVATION',
    label: 'Deep Derivation',
    sublabel: '15-25 min • Heavy Algebra',
    icon: Flame,
    color: 'blue',
    borderColor: 'border-blue-500/50 hover:border-blue-400',
    activeBg: 'bg-blue-500/20 text-blue-300 border-blue-400 shadow-lg shadow-blue-950/40',
    badge: 'bg-blue-500/10 text-blue-400 border border-blue-500/30'
  },
  {
    id: 'HINT_CONSULTED',
    label: 'Hint Consulted',
    sublabel: 'Looked up formula / book',
    icon: HelpCircle,
    color: 'amber',
    borderColor: 'border-amber-500/50 hover:border-amber-400',
    activeBg: 'bg-amber-500/20 text-amber-300 border-amber-400 shadow-lg shadow-amber-950/40',
    badge: 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
  },
  {
    id: 'CONCEPT_TRAP',
    label: 'Concept Trap',
    sublabel: 'Misconception / Trapped',
    icon: AlertTriangle,
    color: 'rose',
    borderColor: 'border-rose-500/50 hover:border-rose-400',
    activeBg: 'bg-rose-500/20 text-rose-300 border-rose-400 shadow-lg shadow-rose-950/40',
    badge: 'bg-rose-500/10 text-rose-400 border border-rose-500/30'
  }
];

const SELF_RATINGS = [
  { id: 'CLEAN', label: 'Solved Cleanly', desc: 'No solution lookup needed', icon: CheckCircle2, color: 'emerald' },
  { id: 'PARTIAL', label: 'Partially Solved', desc: 'Got core math, needed check', icon: AlertCircle, color: 'amber' },
  { id: 'SOLUTION_NEEDED', label: 'Needed Solution', desc: 'Required complete book answer', icon: HelpCircle, color: 'rose' }
];

export default function DailyAssignmentsView({ user, isActive, onNavigateSkills }) {
  const [loading, setLoading] = useState(true);
  const [assignment, setAssignment] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [batchType, setBatchType] = useState('DAILY'); // 'DAILY' or 'WEEKEND'
  const [showInsights, setShowInsights] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [insightsData, setInsightsData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [scratchpad, setScratchpad] = useState('');
  const [scratchpadStatus, setScratchpadStatus] = useState('saved'); // 'saving', 'saved', 'unsaved'
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [verifiedAnswer, setVerifiedAnswer] = useState(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionStats, setCompletionStats] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const saveTimerRef = useRef(null);
  const questionTimerRef = useRef(null);

  // Parse learnt chapters count
  const learntCount = React.useMemo(() => {
    if (!user || !user.learnt_chapters) return 0;
    try {
      const parsed = typeof user.learnt_chapters === 'string'
        ? JSON.parse(user.learnt_chapters)
        : user.learnt_chapters;
      return Array.isArray(parsed) ? parsed.length : 0;
    } catch (_) {
      return 0;
    }
  }, [user]);

  // Load Active Assignment on mount
  const loadActiveAssignment = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.assignments.getActive();
      if (res && res.assignment) {
        setAssignment(res.assignment);
        setBatchType(res.assignment.batch_type || 'DAILY');
      } else {
        setAssignment(null);
      }
    } catch (err) {
      console.error('Failed to load active assignment:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      loadActiveAssignment();
    }
  }, [isActive, loadActiveAssignment]);

  // Generate new assignment
  const handleGenerate = async (targetBatchType, forceNew = false) => {
    try {
      setLoading(true);
      sound.click();
      const res = await api.assignments.generate(targetBatchType, forceNew);
      if (res && res.assignment) {
        setAssignment(res.assignment);
        setBatchType(res.assignment.batch_type || targetBatchType);
        setCurrentIndex(0);
        sound.start();
      } else if (res && res.code === 'NO_LEARNT_CHAPTERS') {
        alert(res.message);
      }
    } catch (err) {
      console.error('Failed to generate assignment:', err);
      alert('Failed to generate assignment: ' + (err.message || 'Server error'));
    } finally {
      setLoading(false);
    }
  };

  // Current Question
  const currentQ = assignment?.questions?.[currentIndex] || null;

  // Sync scratchpad and answer state when changing question
  useEffect(() => {
    if (currentQ) {
      const ref = currentQ.reflection || {};
      setScratchpad(ref.scratchpad_notes || '');
      setSelectedAnswer(ref.user_answer || '');
      setElapsedSeconds(ref.time_spent_seconds || 0);
      setScratchpadStatus('saved');
      setVerifiedAnswer(ref.is_correct !== null && ref.is_correct !== undefined ? ref.is_correct : null);
    }
  }, [currentQ?.id]);

  // Timer per question
  useEffect(() => {
    if (!currentQ || assignment?.status === 'COMPLETED') return;
    questionTimerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(questionTimerRef.current);
  }, [currentQ?.id, assignment?.status]);

  // Auto-save scratchpad notes with 1.2s debounce
  const handleScratchpadChange = (text) => {
    setScratchpad(text);
    setScratchpadStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    saveTimerRef.current = setTimeout(async () => {
      if (!assignment || !currentQ) return;
      try {
        setScratchpadStatus('saving');
        await api.assignments.submitReflection(assignment.id, currentQ.id, {
          reflection_tag: currentQ.reflection?.reflection_tag || null,
          self_rating: currentQ.reflection?.self_rating || null,
          user_answer: selectedAnswer || currentQ.reflection?.user_answer || null,
          scratchpad_notes: text,
          time_spent_seconds: elapsedSeconds
        });
        setScratchpadStatus('saved');
        // Update local state
        setAssignment((prev) => {
          if (!prev) return prev;
          const nextQs = [...prev.questions];
          nextQs[currentIndex] = {
            ...nextQs[currentIndex],
            reflection: {
              ...(nextQs[currentIndex].reflection || {}),
              scratchpad_notes: text,
              time_spent_seconds: elapsedSeconds
            }
          };
          return { ...prev, questions: nextQs };
        });
      } catch (err) {
        console.error('Auto-save scratchpad failed:', err);
        setScratchpadStatus('unsaved');
      }
    }, 1200);
  };

  // Submit Struggle Reflection Tag
  const handleSelectTag = async (tagId) => {
    if (!assignment || !currentQ || isSubmitting) return;
    try {
      setIsSubmitting(true);
      sound.click();
      const currentRef = currentQ.reflection || {};
      const res = await api.assignments.submitReflection(assignment.id, currentQ.id, {
        reflection_tag: tagId,
        self_rating: currentRef.self_rating || null,
        user_answer: selectedAnswer || currentRef.user_answer || null,
        scratchpad_notes: scratchpad,
        time_spent_seconds: elapsedSeconds
      });

      if (res && res.success) {
        if (tagId === 'BREAKTHROUGH') sound.correct();
        else sound.click();

        setAssignment((prev) => {
          if (!prev) return prev;
          const nextQs = [...prev.questions];
          nextQs[currentIndex] = {
            ...nextQs[currentIndex],
            correct_answer: res.correct_answer || nextQs[currentIndex].correct_answer,
            solution_text: res.solution_text || nextQs[currentIndex].solution_text,
            reflection: res.reflection
          };
          return {
            ...prev,
            completed_questions: res.completed_questions,
            questions: nextQs
          };
        });

        // Check if all reflected
        if (res.completed_questions >= assignment.total_questions) {
          triggerCompleteModal();
        }
      }
    } catch (err) {
      console.error('Failed to log reflection:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit Self-Evaluation for Subjective Problem
  const handleSelectSelfRating = async (ratingId) => {
    if (!assignment || !currentQ || isSubmitting) return;
    try {
      setIsSubmitting(true);
      sound.click();
      const currentRef = currentQ.reflection || {};
      const res = await api.assignments.submitReflection(assignment.id, currentQ.id, {
        reflection_tag: currentRef.reflection_tag || null,
        self_rating: ratingId,
        user_answer: null,
        scratchpad_notes: scratchpad,
        time_spent_seconds: elapsedSeconds
      });

      if (res && res.success) {
        if (ratingId === 'CLEAN') sound.correct();
        setAssignment((prev) => {
          if (!prev) return prev;
          const nextQs = [...prev.questions];
          nextQs[currentIndex] = {
            ...nextQs[currentIndex],
            solution_text: res.solution_text || nextQs[currentIndex].solution_text,
            reflection: res.reflection
          };
          return {
            ...prev,
            completed_questions: res.completed_questions,
            questions: nextQs
          };
        });
      }
    } catch (err) {
      console.error('Failed to submit self evaluation:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Verify Objective Answer
  const handleVerifyObjective = async () => {
    if (!assignment || !currentQ || !selectedAnswer || isSubmitting) return;
    try {
      setIsSubmitting(true);
      sound.click();
      const currentRef = currentQ.reflection || {};
      const res = await api.assignments.submitReflection(assignment.id, currentQ.id, {
        reflection_tag: currentRef.reflection_tag || null,
        self_rating: null,
        user_answer: selectedAnswer,
        scratchpad_notes: scratchpad,
        time_spent_seconds: elapsedSeconds
      });

      if (res && res.success) {
        const isCorr = res.reflection?.is_correct === 1;
        setVerifiedAnswer(isCorr ? 1 : 0);
        if (isCorr) sound.correct();
        else sound.wrong();

        setAssignment((prev) => {
          if (!prev) return prev;
          const nextQs = [...prev.questions];
          nextQs[currentIndex] = {
            ...nextQs[currentIndex],
            correct_answer: res.correct_answer,
            solution_text: res.solution_text,
            reflection: res.reflection
          };
          return {
            ...prev,
            completed_questions: res.completed_questions,
            questions: nextQs
          };
        });
      }
    } catch (err) {
      console.error('Failed to verify answer:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Complete entire assignment
  const triggerCompleteModal = async () => {
    if (!assignment) return;
    try {
      const res = await api.assignments.complete(assignment.id);
      if (res && res.success) {
        setCompletionStats(res.stats);
        setShowCompletionModal(true);
        sound.victory();
        // Reload active assignment state
        loadActiveAssignment();
      }
    } catch (err) {
      console.error('Failed to complete assignment:', err);
    }
  };

  // Open Insights Drawer
  const handleOpenInsights = async () => {
    try {
      sound.click();
      setShowInsights(true);
      const res = await api.assignments.getInsights();
      if (res && res.insights) {
        setInsightsData(res.insights);
      }
    } catch (err) {
      console.error('Failed to fetch insights:', err);
    }
  };

  // Open History Drawer
  const handleOpenHistory = async () => {
    try {
      sound.click();
      setShowHistory(true);
      const res = await api.assignments.getHistory(30);
      if (res && res.history) {
        setHistoryData(res.history);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  // Format seconds to mm:ss
  const formatTime = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Helper for pill styling in navigator
  const getPillStatusClass = (q, idx) => {
    const isCurrent = idx === currentIndex;
    const tag = q.reflection?.reflection_tag;
    const isReflected = Boolean(tag || q.reflection?.self_rating);

    let base = 'transition-all duration-200 cursor-pointer text-xs font-black relative ';
    if (isCurrent) {
      base += 'ring-2 ring-orange-500 scale-105 z-10 shadow-lg shadow-orange-950/50 ';
    }

    if (tag === 'BREAKTHROUGH') {
      return base + 'bg-emerald-500/25 border border-emerald-400 text-emerald-300';
    }
    if (tag === 'DEEP_DERIVATION') {
      return base + 'bg-blue-500/25 border border-blue-400 text-blue-300';
    }
    if (tag === 'HINT_CONSULTED') {
      return base + 'bg-amber-500/25 border border-amber-400 text-amber-300';
    }
    if (tag === 'CONCEPT_TRAP') {
      return base + 'bg-rose-500/25 border border-rose-400 text-rose-300';
    }
    if (isReflected) {
      return base + 'bg-purple-500/25 border border-purple-400 text-purple-300';
    }
    return base + 'bg-[#181d2a] border border-white/10 text-slate-400 hover:border-white/30';
  };

  // Empty state: No learnt chapters
  if (learntCount === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center page-transition">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 mb-6 shadow-xl shadow-orange-950/40">
          <Sparkles className="w-10 h-10" />
        </div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-3">
          Daily Assignments Engine
        </h1>
        <p className="text-slate-400 max-w-lg mx-auto text-sm leading-relaxed mb-8">
          Daily Assignments samples problems <span className="text-orange-400 font-bold">strictly from chapters you have already mastered</span>, preventing early exposure to untouched theory while sharpening your problem-solving velocity.
        </p>
        <div className="p-6 rounded-2xl bg-[#141824] border border-white/10 max-w-md mx-auto mb-8 text-left">
          <div className="flex items-center gap-3 text-orange-400 font-bold text-sm mb-2">
            <Compass className="w-5 h-5" />
            <span>0 Chapters Marked as Learnt</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Head to the Skill Tree, click on the chapters whose video lectures or coaching classes you have completed, and click <span className="text-white font-semibold">"Mark Chapter as Learnt"</span>.
          </p>
        </div>
        <button
          onClick={onNavigateSkills}
          className="px-6 py-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-black font-black text-sm hover:brightness-110 active:scale-95 transition cursor-pointer shadow-lg shadow-orange-500/25 inline-flex items-center gap-2"
        >
          <Compass className="w-4 h-4" />
          <span>Open Skill Tree to Mark Chapters</span>
        </button>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-4 text-center">
        <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
        <p className="text-sm font-bold text-slate-300">Calibrating Daily Elite Assignment...</p>
        <p className="text-xs text-slate-500">Sampling balanced problems from your {learntCount} learnt chapters</p>
      </div>
    );
  }

  // Empty state: No active assignment yet
  if (!assignment) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-12 text-center page-transition">
        <div className="w-20 h-20 mx-auto rounded-3xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 mb-6 shadow-xl shadow-orange-950/40">
          <BookMarked className="w-10 h-10" />
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-black tracking-wide uppercase mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Personal Coaching Assignment Desk</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-3">
          Daily Elite Problem Capsule
        </h1>
        <p className="text-slate-400 max-w-xl mx-auto text-sm leading-relaxed mb-8">
          Challenge your conceptual instincts every single day. Pure balanced mix of high-caliber subjective derivations (Irodov, Pathfinder, Krotov) and verified JEE Advanced problems across your <span className="text-orange-400 font-bold">{learntCount} learnt chapters</span>.
        </p>

        {/* Batch Selection Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto mb-8">
          {/* Daily Capsule */}
          <div
            onClick={() => handleGenerate('DAILY')}
            className="p-6 rounded-2xl bg-[#141824] border border-orange-500/30 hover:border-orange-500 transition cursor-pointer group text-left hover:scale-[1.02] shadow-lg shadow-black/40"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center">
                <Zap className="w-5 h-5" />
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/30">
                Recommended Today
              </span>
            </div>
            <h3 className="text-lg font-black text-white group-hover:text-orange-400 transition mb-1">
              Daily Elite Capsule
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              3 to 5 problems. 1 Physics, 1 Chemistry, 1 Math. Ideal 30-45 minute morning workout to cement retention.
            </p>
            <div className="flex items-center gap-2 text-orange-400 font-bold text-xs">
              <span>Start Daily Batch</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
            </div>
          </div>

          {/* Weekend Titan */}
          <div
            onClick={() => handleGenerate('WEEKEND')}
            className="p-6 rounded-2xl bg-[#141824] border border-blue-500/30 hover:border-blue-500 transition cursor-pointer group text-left hover:scale-[1.02] shadow-lg shadow-black/40"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <span className="text-xs font-black px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/30">
                Weekend Deep Dive
              </span>
            </div>
            <h3 className="text-lg font-black text-white group-hover:text-blue-400 transition mb-1">
              Weekend Titan Sheet
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed mb-4">
              10 to 12 deep problems spanning all learnt chapters. Multi-concept olympiad derivations and tough matrix matches.
            </p>
            <div className="flex items-center gap-2 text-blue-400 font-bold text-xs">
              <span>Start Weekend Sheet</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition" />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs font-bold text-slate-400">
          <button
            onClick={handleOpenInsights}
            className="hover:text-white transition flex items-center gap-1.5 cursor-pointer"
          >
            <BarChart3 className="w-4 h-4 text-orange-400" />
            <span>Struggle Insights</span>
          </button>
          <span>•</span>
          <button
            onClick={handleOpenHistory}
            className="hover:text-white transition flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-blue-400" />
            <span>Past Archives</span>
          </button>
        </div>
      </div>
    );
  }

  // Active Assignment View
  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-6 page-transition">
      {/* Top Header Bar */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 p-4 rounded-2xl bg-[#141824] border border-white/10 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-orange-400 border border-orange-500/30 flex items-center justify-center font-black">
            {batchType === 'WEEKEND' ? <Shield className="w-5 h-5 text-blue-400" /> : <Zap className="w-5 h-5 text-orange-400" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-black text-white tracking-tight">
                {assignment.title}
              </h1>
              {assignment.status === 'COMPLETED' && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  COMPLETED
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
              <span>{assignment.assignment_date}</span>
              <span>•</span>
              <span className="text-orange-400 font-semibold">{learntCount} Learnt Chapters</span>
              <span>•</span>
              <span>
                {assignment.completed_questions} of {assignment.total_questions} Reflected
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <button
            onClick={handleOpenInsights}
            title="Struggle Analytics"
            className="px-3 py-2 rounded-xl bg-[#1d2333] hover:bg-[#252c40] border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <BarChart3 className="w-4 h-4 text-orange-400" />
            <span className="hidden sm:inline">Insights</span>
          </button>
          <button
            onClick={handleOpenHistory}
            title="Archives"
            className="px-3 py-2 rounded-xl bg-[#1d2333] hover:bg-[#252c40] border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <Calendar className="w-4 h-4 text-blue-400" />
            <span className="hidden sm:inline">Archives</span>
          </button>
          <button
            onClick={() => {
              if (window.confirm('Generate a brand new sheet? Current progress on this sheet will be archived.')) {
                handleGenerate(batchType, true);
              }
            }}
            className="px-3 py-2 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-400 text-xs font-black transition flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>New Batch</span>
          </button>
        </div>
      </div>

      {/* Question Selector Pill Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
        {assignment.questions.map((q, idx) => (
          <button
            key={q.id || idx}
            onClick={() => {
              sound.click();
              setCurrentIndex(idx);
            }}
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${getPillStatusClass(q, idx)}`}
          >
            {idx + 1}
          </button>
        ))}
      </div>

      {/* Main Working Problem Desk */}
      {currentQ && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Problem Statement & Interaction (7 cols) */}
          <div className="lg:col-span-7 space-y-4">
            <div className="p-6 rounded-2xl bg-[#141824] border border-white/10 shadow-xl space-y-5">
              {/* Question Header & Meta */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`text-xs font-black px-2.5 py-1 rounded-lg ${
                    currentQ.subject === 'Physics'
                      ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                      : currentQ.subject === 'Chemistry'
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}>
                    {currentQ.subject}
                  </span>
                  <span className="text-xs font-bold text-slate-300 px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                    {currentQ.chapter}
                  </span>
                  <span className="text-[11px] font-mono text-slate-400 px-2 py-0.5 rounded-md bg-white/5 border border-white/10">
                    {currentQ.question_type}
                  </span>
                </div>

                {/* Per-Question Stopwatch */}
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 border border-white/10 text-xs font-mono font-bold text-orange-400">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{formatTime(elapsedSeconds)}</span>
                </div>
              </div>

              {/* TRACK B: Elite Subjective Book Citation Pill */}
              {currentQ.is_subjective && (
                <div className="p-3 rounded-xl bg-gradient-to-r from-amber-500/15 via-orange-500/10 to-transparent border border-amber-500/30 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <div className="font-black text-amber-300">
                      📖 {currentQ.source_book || 'Advanced Coaching Subjective Archive'}
                    </div>
                    <div className="text-amber-200/70 text-[11px] mt-0.5">
                      {currentQ.source_page && `Page ${currentQ.source_page}`}
                      {currentQ.source_qnum && ` • Problem #${currentQ.source_qnum}`}
                      {currentQ.source_section && ` • ${currentQ.source_section}`}
                      {!currentQ.source_page && !currentQ.source_qnum && 'Look up in physical volume or PDF for official derivation'}
                    </div>
                  </div>
                </div>
              )}

              {/* Problem Text with KaTeX */}
              <div className="text-slate-100 text-sm md:text-base leading-relaxed overflow-x-auto">
                <MathRenderer text={currentQ.text} />
              </div>

              {/* Diagrams if any */}
              {Boolean(currentQ.has_diagram || currentQ.diagram_urls) && (() => {
                let urls = [];
                try {
                  urls = typeof currentQ.diagram_urls === 'string' ? JSON.parse(currentQ.diagram_urls) : (currentQ.diagram_urls || []);
                } catch (_) {
                  urls = currentQ.diagram_urls ? [currentQ.diagram_urls] : [];
                }
                if (!Array.isArray(urls)) urls = urls ? [urls] : [];
                if (urls.length === 0) return null;
                return (
                  <div className="py-2 flex flex-wrap gap-3">
                    {urls.map((url, i) => (
                      <img
                        key={i}
                        src={url.startsWith('/') ? url : `/diagrams/${url}`}
                        alt={`Diagram ${i + 1}`}
                        className="max-h-64 rounded-xl object-contain border border-white/10 bg-black/40 p-2"
                      />
                    ))}
                  </div>
                );
              })()}

              {/* TRACK A: Objective Interaction (MCQ / Numerical) */}
              {!currentQ.is_subjective && (
                <div className="pt-4 border-t border-white/5 space-y-3">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Your Solution Key
                  </div>

                  {/* MCQ Options */}
                  {currentQ.options && (() => {
                    let opts = [];
                    try {
                      opts = typeof currentQ.options === 'string' ? JSON.parse(currentQ.options) : currentQ.options;
                    } catch (_) {
                      opts = [];
                    }
                    if (Array.isArray(opts) && opts.length > 0) {
                      return (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {opts.map((opt, i) => {
                            const optKey = String.fromCharCode(65 + i);
                            const isSelected = selectedAnswer === optKey;
                            return (
                              <button
                                key={i}
                                onClick={() => {
                                  sound.click();
                                  setSelectedAnswer(optKey);
                                }}
                                className={`p-3 rounded-xl border text-left text-xs font-medium transition cursor-pointer flex items-center gap-2.5 ${
                                  isSelected
                                    ? 'bg-orange-500/20 border-orange-500 text-white font-bold'
                                    : 'bg-[#181d2a] border-white/10 text-slate-300 hover:border-white/20'
                                }`}
                              >
                                <span className={`w-6 h-6 rounded-lg flex items-center justify-center font-black text-xs shrink-0 ${
                                  isSelected ? 'bg-orange-500 text-black' : 'bg-white/5 text-slate-400'
                                }`}>
                                  {optKey}
                                </span>
                                <div className="overflow-x-auto flex-1">
                                  <MathRenderer text={typeof opt === 'string' ? opt : JSON.stringify(opt)} />
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Numerical Input */}
                  {['NUMERICAL', 'INTEGER'].includes(currentQ.question_type) && (
                    <div className="flex items-center gap-3">
                      <input
                        type="text"
                        value={selectedAnswer}
                        onChange={(e) => setSelectedAnswer(e.target.value)}
                        placeholder="Enter numerical value..."
                        className="px-4 py-2.5 rounded-xl bg-[#181d2a] border border-white/10 text-white font-mono text-sm focus:outline-none focus:border-orange-500 w-48"
                      />
                    </div>
                  )}

                  {/* Check / Verify Button for Objective */}
                  <div className="flex items-center gap-3 pt-2">
                    <button
                      onClick={handleVerifyObjective}
                      disabled={!selectedAnswer || isSubmitting}
                      className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-40 text-black font-black text-xs transition cursor-pointer flex items-center gap-2"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Verify Answer</span>
                    </button>
                    {verifiedAnswer !== null && (
                      <span className={`text-xs font-bold ${verifiedAnswer === 1 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {verifiedAnswer === 1 ? '✓ Correct Answer' : '✗ Incorrect (Reflect on trap)'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* TRACK B: Subjective Self-Evaluation Buttons */}
              {currentQ.is_subjective && (
                <div className="pt-4 border-t border-white/5 space-y-3">
                  <div className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Self-Evaluation (Subjective Problem)</span>
                    {currentQ.reflection?.self_rating && (
                      <span className="text-orange-400 font-bold capitalize">
                        Rating: {currentQ.reflection.self_rating.toLowerCase().replace('_', ' ')}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    {SELF_RATINGS.map((sr) => {
                      const Icon = sr.icon;
                      const isActive = currentQ.reflection?.self_rating === sr.id;
                      return (
                        <button
                          key={sr.id}
                          onClick={() => handleSelectSelfRating(sr.id)}
                          className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                            isActive
                              ? `bg-${sr.color}-500/20 border-${sr.color}-400 text-white font-bold ring-1 ring-${sr.color}-400`
                              : 'bg-[#181d2a] border-white/10 text-slate-300 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className={`w-4 h-4 text-${sr.color}-400`} />
                            <span className="text-xs font-black">{sr.label}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-snug">{sr.desc}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Solution Text (if revealed) */}
              {currentQ.solution_text && (
                <div className="p-4 rounded-xl bg-[#181d2a] border border-white/10 space-y-2 mt-4">
                  <div className="text-xs font-black text-orange-400 uppercase tracking-wider flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Official Solution & Derivation</span>
                  </div>
                  <div className="text-xs text-slate-200 leading-relaxed overflow-x-auto">
                    <MathRenderer text={currentQ.solution_text} />
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Nav: Prev / Next / Complete */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  sound.click();
                  setCurrentIndex((prev) => Math.max(0, prev - 1));
                }}
                disabled={currentIndex === 0}
                className="px-4 py-2 rounded-xl bg-[#141824] border border-white/10 hover:border-white/20 disabled:opacity-40 text-xs font-bold text-slate-300 transition cursor-pointer flex items-center gap-1.5"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Previous Problem</span>
              </button>

              {currentIndex < assignment.questions.length - 1 ? (
                <button
                  onClick={() => {
                    sound.click();
                    setCurrentIndex((prev) => Math.min(assignment.questions.length - 1, prev + 1));
                  }}
                  className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-orange-500/20"
                >
                  <span>Next Problem</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={triggerCompleteModal}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:brightness-110 text-black font-black text-xs transition cursor-pointer flex items-center gap-1.5 shadow-lg shadow-emerald-500/25"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Complete Batch</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Scratchpad & 4-Tag Struggle Reflection (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* 4-TAG COGNITIVE STRUGGLE REFLECTION */}
            <div className="p-5 rounded-2xl bg-[#141824] border border-white/10 shadow-xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-white tracking-tight flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-orange-400" />
                    <span>How did this problem feel?</span>
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tagging trains the engine to map your cognitive breakthroughs & traps
                  </p>
                </div>
              </div>

              {/* Reflection Tag Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {REFLECTION_TAGS.map((tag) => {
                  const Icon = tag.icon;
                  const isSelected = currentQ.reflection?.reflection_tag === tag.id;
                  return (
                    <button
                      key={tag.id}
                      onClick={() => handleSelectTag(tag.id)}
                      className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                        isSelected
                          ? tag.activeBg
                          : `bg-[#181d2a] border-white/10 text-slate-300 ${tag.borderColor}`
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 text-${tag.color}-400`} />
                        <span className="text-xs font-black">{tag.label}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 font-medium">{tag.sublabel}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* COGNITIVE SCRATCHPAD */}
            <div className="p-5 rounded-2xl bg-[#141824] border border-white/10 shadow-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-orange-400" />
                  <h3 className="text-sm font-black text-white">Cognitive Scratchpad</h3>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-mono text-slate-400">
                  {scratchpadStatus === 'saving' && (
                    <span className="text-amber-400 flex items-center gap-1">
                      <Save className="w-3 h-3 animate-pulse" /> Saving...
                    </span>
                  )}
                  {scratchpadStatus === 'saved' && (
                    <span className="text-emerald-400 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Auto-saved
                    </span>
                  )}
                  {scratchpadStatus === 'unsaved' && (
                    <span className="text-slate-500">Unsaved changes</span>
                  )}
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-snug">
                Jot down intermediate formulas, momentum balance, or notes. Supports LaTeX with $$...$$.
              </p>

              <textarea
                value={scratchpad}
                onChange={(e) => handleScratchpadChange(e.target.value)}
                placeholder="Example: Conservation of Angular Momentum about Point P:&#10;L_i = m*v*R&#10;L_f = (I_cm + m*R^2) * \omega&#10;Equating gives \omega = ..."
                rows={9}
                className="w-full p-3.5 rounded-xl bg-[#0e121a] border border-white/10 text-slate-200 font-mono text-xs focus:outline-none focus:border-orange-500 resize-none leading-relaxed"
              />
            </div>
          </div>
        </div>
      )}

      {/* COMPLETION MODAL */}
      {showCompletionModal && completionStats && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-lg w-full bg-[#141824] border border-orange-500/40 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95">
            <div className="text-center space-y-2">
              <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Trophy className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-white">Daily Batch Conquered!</h2>
              <p className="text-xs text-slate-400">
                You've completed reflection across all {completionStats.total_questions} assignment problems.
              </p>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-center">
                <div className="text-2xl font-black text-emerald-400">
                  {completionStats.breakthrough_rate}%
                </div>
                <div className="text-[11px] font-bold text-slate-400 mt-0.5">
                  Breakthrough Rate
                </div>
              </div>
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 text-center">
                <div className="text-2xl font-black text-blue-400">
                  {formatTime(completionStats.total_time_seconds)}
                </div>
                <div className="text-[11px] font-bold text-slate-400 mt-0.5">
                  Total Active Time
                </div>
              </div>
            </div>

            {/* Tag Breakdown */}
            <div className="space-y-1.5 p-3 rounded-xl bg-white/5 border border-white/10 text-xs">
              <div className="font-bold text-slate-300 mb-2">Cognitive Breakdown:</div>
              <div className="flex items-center justify-between text-emerald-300">
                <span>⚡ Clean Breakthroughs:</span>
                <span className="font-mono font-bold">{completionStats.tag_counts?.BREAKTHROUGH || 0}</span>
              </div>
              <div className="flex items-center justify-between text-blue-300">
                <span>⏳ Deep Derivations:</span>
                <span className="font-mono font-bold">{completionStats.tag_counts?.DEEP_DERIVATION || 0}</span>
              </div>
              <div className="flex items-center justify-between text-amber-300">
                <span>🔍 Hints Consulted:</span>
                <span className="font-mono font-bold">{completionStats.tag_counts?.HINT_CONSULTED || 0}</span>
              </div>
              <div className="flex items-center justify-between text-rose-300">
                <span>🛑 Concept Traps:</span>
                <span className="font-mono font-bold">{completionStats.tag_counts?.CONCEPT_TRAP || 0}</span>
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => setShowCompletionModal(false)}
                className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition cursor-pointer"
              >
                Review Problems
              </button>
              <button
                onClick={() => {
                  setShowCompletionModal(false);
                  handleGenerate(batchType, true);
                }}
                className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs transition cursor-pointer"
              >
                Start Next Batch
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STRUGGLE INSIGHTS DRAWER */}
      {showInsights && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-[#141824] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center">
                  <BarChart3 className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Cognitive Struggle Radar</h2>
                  <p className="text-xs text-slate-400">AI analysis of your breakthroughs and friction points</p>
                </div>
              </div>
              <button
                onClick={() => setShowInsights(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {insightsData ? (
              <div className="space-y-6">
                {/* Stats Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                    <div className="text-2xl font-black text-emerald-400">
                      {insightsData.breakthrough_rate}%
                    </div>
                    <div className="text-[11px] font-bold text-slate-400 mt-1">Breakthrough Rate</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                    <div className="text-2xl font-black text-blue-400">
                      {insightsData.average_derivation_seconds > 0 ? `${Math.round(insightsData.average_derivation_seconds / 60)}m` : '—'}
                    </div>
                    <div className="text-[11px] font-bold text-slate-400 mt-1">Avg Derivation Time</div>
                  </div>
                  <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-center">
                    <div className="text-2xl font-black text-white">
                      {insightsData.total_reflected}
                    </div>
                    <div className="text-[11px] font-bold text-slate-400 mt-1">Total Reflected</div>
                  </div>
                </div>

                {/* Vulnerability Radar / Friction Chapters */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                      <span>Friction Radar (Chapters with Traps or Hints)</span>
                    </h4>
                  </div>
                  {insightsData.vulnerable_chapters?.length > 0 ? (
                    <div className="space-y-2">
                      {insightsData.vulnerable_chapters.map((chap, i) => (
                        <div
                          key={i}
                          className="p-3 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-white">{chap.chapter}</span>
                            <span className="text-[11px] text-slate-400 ml-2">({chap.subject})</span>
                          </div>
                          <div className="flex items-center gap-2">
                            {chap.traps > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30 text-[10px] font-bold">
                                {chap.traps} Traps
                              </span>
                            )}
                            {chap.hints > 0 && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                                {chap.hints} Hints
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 italic p-3 rounded-xl bg-white/5 border border-white/10">
                      No concept traps recorded yet! Keep logging your daily batches.
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8">
                <Loader2 className="w-8 h-8 text-orange-400 animate-spin mx-auto mb-2" />
                <p className="text-xs text-slate-400">Loading struggle insights...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ARCHIVE HISTORY DRAWER */}
      {showHistory && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="max-w-xl w-full bg-[#141824] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-400 flex items-center justify-center">
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white">Past Assignment Archives</h2>
                  <p className="text-xs text-slate-400">Review previous sheets and progress</p>
                </div>
              </div>
              <button
                onClick={() => setShowHistory(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {historyData.map((item) => (
                <div
                  key={item.id}
                  onClick={async () => {
                    const res = await api.assignments.getById(item.id);
                    if (res && res.assignment) {
                      setAssignment(res.assignment);
                      setBatchType(res.assignment.batch_type || 'DAILY');
                      setCurrentIndex(0);
                      setShowHistory(false);
                    }
                  }}
                  className="p-3.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-bold text-white">{item.title}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      {item.assignment_date} • {item.completed_questions}/{item.total_questions} Reflected
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                    item.status === 'COMPLETED'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                  }`}>
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
