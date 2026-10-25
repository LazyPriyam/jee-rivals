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
  Loader2,
  Trash2,
  LogOut,
  LayoutDashboard,
  Play
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
  const [viewMode, setViewMode] = useState('ACTIVE'); // 'ACTIVE' or 'DASHBOARD'
  const [showInsights, setShowInsights] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [insightsData, setInsightsData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [globalStats, setGlobalStats] = useState(null);
  const [historyFilter, setHistoryFilter] = useState('ALL'); // 'ALL', 'IN_PROGRESS', 'COMPLETED', 'ARCHIVED'
  const [actionLoadingId, setActionLoadingId] = useState(null);
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

  // Parse learnt chapters list and count (synced with localStorage & jee_user_updated)
  const [liveLearntChapters, setLiveLearntChapters] = useState(() => {
    try {
      if (user?.learnt_chapters) {
        const parsed = typeof user.learnt_chapters === 'string'
          ? JSON.parse(user.learnt_chapters)
          : user.learnt_chapters;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
      if (user?.id) {
        const raw = localStorage.getItem(`jee_user_learnt_chapters_${user.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch (_) {}
    return [];
  });

  useEffect(() => {
    const handleUserUpdate = (e) => {
      const updatedUser = e?.detail;
      if (updatedUser?.learnt_chapters) {
        const parsed = typeof updatedUser.learnt_chapters === 'string'
          ? JSON.parse(updatedUser.learnt_chapters)
          : updatedUser.learnt_chapters;
        if (Array.isArray(parsed)) setLiveLearntChapters(parsed);
      }
    };
    window.addEventListener('jee_user_updated', handleUserUpdate);
    return () => window.removeEventListener('jee_user_updated', handleUserUpdate);
  }, []);

  useEffect(() => {
    try {
      if (user?.learnt_chapters) {
        const parsed = typeof user.learnt_chapters === 'string'
          ? JSON.parse(user.learnt_chapters)
          : user.learnt_chapters;
        if (Array.isArray(parsed) && parsed.length > 0) {
          setLiveLearntChapters(parsed);
          return;
        }
      }
      if (user?.id) {
        const raw = localStorage.getItem(`jee_user_learnt_chapters_${user.id}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            setLiveLearntChapters(parsed);
            return;
          }
        }
      }
    } catch (_) {}
  }, [user]);

  const learntCount = liveLearntChapters.length;

  // Load history & global statistics
  const loadHistory = useCallback(async () => {
    try {
      const res = await api.assignments.getHistory(100);
      if (res && res.history) {
        setHistoryData(res.history);
        if (res.stats) setGlobalStats(res.stats);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, []);

  // Load Active Assignment on mount
  const loadActiveAssignment = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.assignments.getActive();
      if (res && res.assignment && Array.isArray(res.assignment.questions) && res.assignment.questions.length > 0) {
        setAssignment(res.assignment);
        setBatchType(res.assignment.batch_type || 'DAILY');
      } else {
        setAssignment(null);
        setViewMode('DASHBOARD');
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
      loadHistory();
    }
  }, [isActive, loadActiveAssignment, loadHistory]);

  // Generate new assignment
  const handleGenerate = async (targetBatchType, forceNew = false) => {
    try {
      setLoading(true);
      sound.click();
      const res = await api.assignments.generate(targetBatchType, forceNew, liveLearntChapters);
      if (res && res.assignment && Array.isArray(res.assignment.questions) && res.assignment.questions.length > 0) {
        setAssignment(res.assignment);
        setBatchType(res.assignment.batch_type || targetBatchType);
        setCurrentIndex(0);
        setViewMode('ACTIVE');
        sound.start();
        loadHistory();
      } else if (res && (res.code === 'NO_LEARNT_CHAPTERS' || res.code === 'NO_QUESTIONS_FOUND')) {
        alert(res.message);
      } else if (res && res.error) {
        alert(res.error);
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
        await loadActiveAssignment();
        await loadHistory();
      }
    } catch (err) {
      console.error('Failed to complete assignment:', err);
    }
  };

  // Leave active batch (archive without deleting)
  const handleLeaveBatch = async (asgnId) => {
    const idToLeave = asgnId || assignment?.id;
    if (!idToLeave) return;
    if (!window.confirm("Leave this batch? Your progress will remain saved in your archives and you can resume anytime or start a fresh batch.")) {
      return;
    }
    try {
      setActionLoadingId(idToLeave);
      sound.click();
      await api.assignments.leave(idToLeave);
      await loadActiveAssignment();
      await loadHistory();
      setViewMode('DASHBOARD');
    } catch (err) {
      console.error('Failed to leave batch:', err);
      alert('Failed to leave batch: ' + (err.message || 'Server error'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Delete assignment permanently
  const handleDeleteAssignment = async (asgnId, title = 'this assignment') => {
    if (!window.confirm(`Permanently delete "${title}"? This cannot be undone.`)) {
      return;
    }
    try {
      setActionLoadingId(asgnId);
      sound.click();
      await api.assignments.delete(asgnId);
      if (assignment?.id === asgnId) {
        setAssignment(null);
        setViewMode('DASHBOARD');
      }
      await loadHistory();
      await loadActiveAssignment();
    } catch (err) {
      console.error('Failed to delete assignment:', err);
      alert('Failed to delete assignment: ' + (err.message || 'Server error'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Reset assignment reflections to re-solve from scratch
  const handleResetAssignment = async (asgnId, title = 'this assignment') => {
    if (!window.confirm(`Reset "${title}"? This will clear all logged reflections and answers so you can re-solve from question 1.`)) {
      return;
    }
    try {
      setActionLoadingId(asgnId);
      sound.click();
      await api.assignments.reset(asgnId);
      if (assignment?.id === asgnId) {
        const res = await api.assignments.getById(asgnId);
        if (res && res.assignment) {
          setAssignment(res.assignment);
          setCurrentIndex(0);
        }
      }
      await loadHistory();
    } catch (err) {
      console.error('Failed to reset assignment:', err);
      alert('Failed to reset assignment: ' + (err.message || 'Server error'));
    } finally {
      setActionLoadingId(null);
    }
  };

  // Open assignment into active problem desk
  const handleOpenAssignment = async (asgnId) => {
    try {
      setLoading(true);
      sound.click();
      const res = await api.assignments.getById(asgnId);
      if (res && res.assignment) {
        setAssignment(res.assignment);
        setBatchType(res.assignment.batch_type || 'DAILY');
        setCurrentIndex(0);
        setViewMode('ACTIVE');
      }
    } catch (err) {
      console.error('Failed to open assignment:', err);
      alert('Failed to open assignment: ' + (err.message || 'Server error'));
    } finally {
      setLoading(false);
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

  // MANAGEMENT DASHBOARD VIEW (rendered when viewMode === 'DASHBOARD' or when no assignment is loaded)
  if (viewMode === 'DASHBOARD' || !assignment || !assignment.questions || assignment.questions.length === 0) {
    const hasActiveAssignment = Boolean(assignment && assignment.questions && assignment.questions.length > 0);
    const inProgCount = historyData.filter(h => h.status === 'IN_PROGRESS').length;
    const compCount = historyData.filter(h => h.status === 'COMPLETED').length;
    const archCount = historyData.filter(h => h.status === 'ARCHIVED').length;

    const filteredHistory = historyData.filter(item => {
      if (historyFilter === 'IN_PROGRESS') return item.status === 'IN_PROGRESS';
      if (historyFilter === 'COMPLETED') return item.status === 'COMPLETED';
      if (historyFilter === 'ARCHIVED') return item.status === 'ARCHIVED';
      return true;
    });

    return (
      <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 page-transition">
        {/* Hero Management Header */}
        <div className="p-6 md:p-8 rounded-3xl bg-[#141824] border border-white/10 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-orange-500/10 via-amber-500/5 to-transparent blur-3xl pointer-events-none" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 relative z-10">
            <div className="space-y-2 max-w-xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-xs font-black tracking-wide uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Aspirant Command Desk • LazyPriyam Exclusive</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                Daily Assignments Manager
              </h1>
              <p className="text-xs md:text-sm text-slate-400 leading-relaxed">
                Manage, review, resume, and audit every assignment. Sampling balanced problems across your <span className="text-orange-400 font-bold">{learntCount} learnt chapters</span>.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
              {hasActiveAssignment && (
                <button
                  onClick={() => {
                    sound.click();
                    setViewMode('ACTIVE');
                  }}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-black text-xs hover:brightness-110 active:scale-95 transition cursor-pointer shadow-lg shadow-emerald-500/20 flex items-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Resume Current Batch</span>
                </button>
              )}
              <button
                onClick={handleOpenInsights}
                className="px-3.5 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-bold transition flex items-center gap-2 cursor-pointer"
              >
                <BarChart3 className="w-4 h-4 text-orange-400" />
                <span>Struggle Insights</span>
              </button>
              <button
                onClick={() => handleGenerate('DAILY', true)}
                className="px-3.5 py-2.5 rounded-xl bg-orange-500/15 hover:bg-orange-500/25 border border-orange-500/30 text-orange-400 text-xs font-black transition flex items-center gap-2 cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                <span>+ Daily Capsule</span>
              </button>
              <button
                onClick={() => handleGenerate('WEEKEND', true)}
                className="px-3.5 py-2.5 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-400 text-xs font-black transition flex items-center gap-2 cursor-pointer"
              >
                <Shield className="w-4 h-4" />
                <span>+ Weekend Titan</span>
              </button>
            </div>
          </div>

          {/* Global Analytics Overview Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6 pt-6 border-t border-white/5">
            <div className="p-3.5 rounded-2xl bg-[#0e121a]/80 border border-white/5 text-center">
              <div className="text-xl md:text-2xl font-black text-white">
                {globalStats?.total_assignments ?? historyData.length}
              </div>
              <div className="text-[11px] font-bold text-slate-400 mt-0.5">Total Sheets</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0e121a]/80 border border-white/5 text-center">
              <div className="text-xl md:text-2xl font-black text-emerald-400">
                {globalStats?.completed_assignments ?? compCount}
              </div>
              <div className="text-[11px] font-bold text-slate-400 mt-0.5">Conquered</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0e121a]/80 border border-white/5 text-center">
              <div className="text-xl md:text-2xl font-black text-blue-400">
                {globalStats?.total_problems_reflected ?? 0}
              </div>
              <div className="text-[11px] font-bold text-slate-400 mt-0.5">Problems Reflected</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0e121a]/80 border border-white/5 text-center">
              <div className="text-xl md:text-2xl font-black text-purple-400">
                {globalStats?.overall_breakthrough_rate ? `${globalStats.overall_breakthrough_rate}%` : '0%'}
              </div>
              <div className="text-[11px] font-bold text-slate-400 mt-0.5">Breakthrough Rate</div>
            </div>
            <div className="p-3.5 rounded-2xl bg-[#0e121a]/80 border border-white/5 text-center col-span-2 sm:col-span-1">
              <div className="text-xl md:text-2xl font-black text-amber-400">
                {formatTime(globalStats?.total_time_seconds || 0)}
              </div>
              <div className="text-[11px] font-bold text-slate-400 mt-0.5">Deep Work Time</div>
            </div>
          </div>
        </div>

        {/* Quick Batch Starters Banner */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div
            onClick={() => handleGenerate('DAILY')}
            className="p-5 rounded-2xl bg-[#141824] border border-orange-500/20 hover:border-orange-500 transition cursor-pointer group hover:scale-[1.01] shadow-lg shadow-black/40 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-500/15 text-orange-400 flex items-center justify-center shrink-0">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-black text-white group-hover:text-orange-400 transition">
                  Daily Elite Capsule
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  3 to 5 balanced problems (Physics, Chemistry, Math). 30-45m workout.
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-orange-400 group-hover:translate-x-1 transition shrink-0 ml-2" />
          </div>

          <div
            onClick={() => handleGenerate('WEEKEND')}
            className="p-5 rounded-2xl bg-[#141824] border border-blue-500/20 hover:border-blue-500 transition cursor-pointer group hover:scale-[1.01] shadow-lg shadow-black/40 flex items-center justify-between"
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/15 text-blue-400 flex items-center justify-center shrink-0">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <div className="text-sm font-black text-white group-hover:text-blue-400 transition">
                  Weekend Titan Sheet
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  10 to 12 deep multi-concept olympiad derivations spanning all learnt chapters.
                </div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-blue-400 group-hover:translate-x-1 transition shrink-0 ml-2" />
          </div>
        </div>

        {/* Filter Strip */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-white/5 pb-4">
          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-white/5 border border-white/10 text-xs">
            <button
              onClick={() => setHistoryFilter('ALL')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                historyFilter === 'ALL' ? 'bg-orange-500 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({historyData.length})
            </button>
            <button
              onClick={() => setHistoryFilter('IN_PROGRESS')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                historyFilter === 'IN_PROGRESS' ? 'bg-amber-500 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              In Progress ({inProgCount})
            </button>
            <button
              onClick={() => setHistoryFilter('COMPLETED')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                historyFilter === 'COMPLETED' ? 'bg-emerald-500 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Completed ({compCount})
            </button>
            <button
              onClick={() => setHistoryFilter('ARCHIVED')}
              className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                historyFilter === 'ARCHIVED' ? 'bg-slate-300 text-black shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Archived ({archCount})
            </button>
          </div>

          <div className="text-xs text-slate-500">
            Showing {filteredHistory.length} assignment{filteredHistory.length === 1 ? '' : 's'}
          </div>
        </div>

        {/* Assignments Cards Grid */}
        {filteredHistory.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredHistory.map((item) => {
              const isCurrentActive = assignment?.id === item.id;
              const percent = Math.round((item.completed_questions / Math.max(1, item.total_questions)) * 100);
              const m = item.metrics || {};
              const isLoadingThis = actionLoadingId === item.id;

              return (
                <div
                  key={item.id}
                  className={`p-5 rounded-2xl bg-[#141824] border transition flex flex-col justify-between shadow-xl space-y-4 ${
                    isCurrentActive
                      ? 'border-orange-500/70 ring-1 ring-orange-500/40 shadow-orange-950/20'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Top Bar of Card */}
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          item.batch_type === 'WEEKEND' ? 'bg-blue-500/15 text-blue-400' : 'bg-orange-500/15 text-orange-400'
                        }`}>
                          {item.batch_type === 'WEEKEND' ? <Shield className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          {item.assignment_date}
                        </span>
                      </div>

                      {/* Status Badges */}
                      <div>
                        {item.status === 'COMPLETED' ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            <span>COMPLETED</span>
                          </span>
                        ) : item.status === 'IN_PROGRESS' ? (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                            <span>IN PROGRESS</span>
                          </span>
                        ) : (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/40">
                            ARCHIVED
                          </span>
                        )}
                      </div>
                    </div>

                    <h3 className="text-base font-black text-white tracking-tight">
                      {item.title}
                    </h3>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 text-[11px]">Completion Progress</span>
                      <span className="font-mono font-bold text-slate-200">
                        {item.completed_questions}/{item.total_questions} Reflected ({percent}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden border border-white/5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          item.status === 'COMPLETED'
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                            : 'bg-gradient-to-r from-orange-500 to-amber-400'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>

                  {/* Struggle Breakdown Chips */}
                  <div className="grid grid-cols-4 gap-1.5 text-center py-1">
                    <div className="p-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                      <div className="text-xs font-mono font-black">{m.breakthroughs || 0}</div>
                      <div className="text-[9px] uppercase font-bold text-emerald-400/70">Breakth.</div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300">
                      <div className="text-xs font-mono font-black">{m.derivations || 0}</div>
                      <div className="text-[9px] uppercase font-bold text-blue-400/70">Deriv.</div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300">
                      <div className="text-xs font-mono font-black">{m.hints || 0}</div>
                      <div className="text-[9px] uppercase font-bold text-amber-400/70">Hints</div>
                    </div>
                    <div className="p-1.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300">
                      <div className="text-xs font-mono font-black">{m.traps || 0}</div>
                      <div className="text-[9px] uppercase font-bold text-rose-400/70">Traps</div>
                    </div>
                  </div>

                  {/* Action Buttons Bar */}
                  <div className="flex items-center gap-2 pt-2 border-t border-white/5">
                    <button
                      onClick={() => handleOpenAssignment(item.id)}
                      disabled={isLoadingThis}
                      className="flex-1 py-2 rounded-xl bg-orange-500 hover:bg-orange-400 text-black font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-orange-950/20"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{item.status === 'COMPLETED' ? 'Review Solutions' : 'Open Problem Desk'}</span>
                    </button>

                    {item.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => handleLeaveBatch(item.id)}
                        disabled={isLoadingThis}
                        title="Leave batch (save and archive without deleting)"
                        className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-amber-400 border border-white/10 text-xs font-bold transition cursor-pointer flex items-center justify-center"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={() => handleResetAssignment(item.id, item.title)}
                      disabled={isLoadingThis}
                      title="Reset reflections to solve from question 1"
                      className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 text-xs font-bold transition cursor-pointer flex items-center justify-center"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => handleDeleteAssignment(item.id, item.title)}
                      disabled={isLoadingThis}
                      title="Delete assignment permanently"
                      className="p-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition cursor-pointer flex items-center justify-center"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-12 text-center rounded-3xl bg-[#141824] border border-white/5 space-y-3">
            <BookMarked className="w-10 h-10 text-slate-500 mx-auto" />
            <h3 className="text-base font-bold text-white">No assignments found</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              {historyFilter === 'ALL'
                ? 'Launch your first Daily Elite Capsule or Weekend Titan Sheet above to populate your dashboard.'
                : `No assignments currently in ${historyFilter.toLowerCase().replace('_', ' ')} status.`}
            </p>
          </div>
        )}
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
        <div className="flex items-center gap-2 w-full md:w-auto justify-end flex-wrap">
          <button
            onClick={() => {
              sound.click();
              loadHistory();
              setViewMode('DASHBOARD');
            }}
            title="Management Dashboard"
            className="px-3 py-2 rounded-xl bg-blue-500/15 hover:bg-blue-500/25 border border-blue-500/30 text-blue-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer shadow-lg shadow-blue-950/30"
          >
            <LayoutDashboard className="w-4 h-4 text-blue-400" />
            <span>Dashboard</span>
          </button>
          {assignment.status === 'IN_PROGRESS' && (
            <button
              onClick={() => handleLeaveBatch(assignment.id)}
              disabled={actionLoadingId === assignment.id}
              title="Leave / Archive Batch"
              className="px-3 py-2 rounded-xl bg-[#1d2333] hover:bg-[#252c40] border border-white/10 text-amber-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-amber-400" />
              <span>Leave Batch</span>
            </button>
          )}
          <button
            onClick={handleOpenInsights}
            title="Struggle Analytics"
            className="px-3 py-2 rounded-xl bg-[#1d2333] hover:bg-[#252c40] border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <BarChart3 className="w-4 h-4 text-orange-400" />
            <span className="hidden sm:inline">Insights</span>
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
                      const isMulti = ['MULTIPLE_CHOICE', 'MULTI_CHOICE'].includes(currentQ.question_type);
                      const selectedKeys = selectedAnswer
                        ? selectedAnswer.split(',').map((s) => s.trim().toUpperCase())
                        : [];

                      return (
                        <div className="space-y-2">
                          {isMulti && (
                            <div className="text-[11px] text-purple-300 font-bold flex items-center justify-between px-2">
                              <span>Multiple Choice: Select all correct options</span>
                              <span className="font-mono text-amber-300">Selected: {selectedAnswer || 'None'}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {opts.map((opt, i) => {
                              const optKey = (opt && typeof opt === 'object' && opt.key)
                                ? String(opt.key).trim().toUpperCase()
                                : String.fromCharCode(65 + i);

                              const optText = typeof opt === 'string'
                                ? opt
                                : (opt?.text ?? opt?.value ?? opt?.label ?? opt?.formula ?? '');

                              const isSelected = isMulti
                                ? selectedKeys.includes(optKey)
                                : selectedAnswer?.trim().toUpperCase() === optKey;

                              const handleToggle = () => {
                                sound.click();
                                if (isMulti) {
                                  let next = new Set(selectedKeys);
                                  if (next.has(optKey)) next.delete(optKey);
                                  else next.add(optKey);
                                  const joined = Array.from(next).sort().join(', ');
                                  setSelectedAnswer(joined);
                                } else {
                                  setSelectedAnswer(optKey);
                                }
                              };

                              return (
                                <button
                                  key={optKey || i}
                                  onClick={handleToggle}
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
                                    <MathRenderer text={optText} />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
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
        <div
          onClick={() => setShowCompletionModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-6 overflow-y-auto cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-lg w-full bg-[#141824] border border-orange-500/40 rounded-3xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 cursor-default my-auto"
          >
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

            <div className="flex flex-col gap-2 pt-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCompletionModal(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs transition cursor-pointer"
                >
                  Review Sheet
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
              <button
                onClick={() => {
                  setShowCompletionModal(false);
                  loadHistory();
                  setViewMode('DASHBOARD');
                }}
                className="w-full py-2.5 rounded-xl bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 text-blue-300 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-2"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Go to Assignments Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STRUGGLE INSIGHTS DRAWER */}
      {showInsights && (
        <div
          onClick={() => setShowInsights(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-6 overflow-y-auto cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-2xl w-full bg-[#141824] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto cursor-default my-auto"
          >
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
        <div
          onClick={() => setShowHistory(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-4 pt-12 sm:pt-6 overflow-y-auto cursor-pointer"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-w-xl w-full bg-[#141824] border border-white/10 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto cursor-default my-auto"
          >
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
