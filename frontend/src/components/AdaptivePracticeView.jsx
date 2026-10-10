import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import MathRenderer from './MathRenderer';
import OnDemandDerivationBox from './OnDemandDerivationBox';
import {
  Brain,
  Zap,
  Target,
  Flame,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BookOpen,
  ArrowRight,
  RotateCcw,
  Trophy,
  Activity,
  Sliders,
  ChevronRight,
  Sparkles,
  HelpCircle,
  RefreshCw,
  LogOut,
  Play,
  Check,
  X,
  Swords,
  Award,
  Flag,
  Search,
  Layers,
  Filter
} from 'lucide-react';
import ReportQuestionModal from './ReportQuestionModal';

const TIER_COLORS = {
  FOUNDATION_DIAGNOSTIC: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  JEE_MAIN_STANDARD: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
  JEE_ADVANCED_HARD: 'bg-orange-500/20 text-orange-300 border-orange-500/40',
  OLYMPIAD_APEX: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
};

const TIER_LABELS = {
  FOUNDATION_DIAGNOSTIC: '🟢 Foundation Drill',
  JEE_MAIN_STANDARD: '🟡 JEE Main Tier',
  JEE_ADVANCED_HARD: '🟠 JEE Advanced Tier',
  OLYMPIAD_APEX: '🔴 Olympiad Apex',
};

export default function AdaptivePracticeView({ user, onOpenAuth, onNavigateTab, isActive = true, onUpdateUser }) {
  // Session lifecycle
  const [session, setSession] = useState(null);
  const [question, setQuestion] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [selectedAnswer, setSelectedAnswer] = useState('');
  const [timeSpentSeconds, setTimeSpentSeconds] = useState(0);
  const [summary, setSummary] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  // Loading & stats
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [userStats, setUserStats] = useState(null);
  const [chaptersGrouped, setChaptersGrouped] = useState({});
  const [actionError, setActionError] = useState('');

  // Configuration form
  const [mode, setMode] = useState('TARGET_SPRINT'); // TARGET_SPRINT or ENDLESS
  const [targetQuestions, setTargetQuestions] = useState(15);
  const [subject, setSubject] = useState('Full Syllabus');
  const [selectedChapters, setSelectedChapters] = useState([]);
  const [chapterSearch, setChapterSearch] = useState('');
  const [targetExam, setTargetExam] = useState('MIXED');

  // Learnt Chapters Scope
  const storageLearntKey = user?.id ? `jee_user_learnt_chapters_${user.id}` : null;
  const storageSessionKey = user?.id ? `jee_active_adaptive_session_${user.id}` : null;

  const [learntChapters, setLearntChapters] = useState(() => {
    try {
      if (user?.learnt_chapters && Array.isArray(user.learnt_chapters) && user.learnt_chapters.length > 0) {
        return user.learnt_chapters;
      }
      if (storageLearntKey) {
        const raw = localStorage.getItem(storageLearntKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch (_) {}
    return [];
  });

  const [syllabusScope, setSyllabusScope] = useState(() => {
    try {
      if (storageLearntKey) {
        const raw = localStorage.getItem(storageLearntKey);
        const parsed = raw ? JSON.parse(raw) : [];
        if (parsed.length > 0) return 'LEARNT_ONLY';
      }
    } catch (_) {}
    return 'FULL_SYLLABUS';
  });

  useEffect(() => {
    if (user?.learnt_chapters && Array.isArray(user.learnt_chapters)) {
      setLearntChapters(user.learnt_chapters);
      if (user.learnt_chapters.length > 0) {
        setSyllabusScope('LEARNT_ONLY');
      }
      if (storageLearntKey) {
        try {
          localStorage.setItem(storageLearntKey, JSON.stringify(user.learnt_chapters));
        } catch (_) {}
      }
    } else if (!user) {
      setLearntChapters([]);
    }
  }, [user?.id, storageLearntKey, JSON.stringify(user?.learnt_chapters || [])]);

  const [exitModalOpen, setExitModalOpen] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(false);
  const timerRef = useRef(null);

  // Authoritative server-side active session check on mount and account change
  useEffect(() => {
    // If logged out, immediately purge in-memory session states
    if (!user?.id) {
      setSession(null);
      setQuestion(null);
      setSubmitted(false);
      setResult(null);
      setSelectedAnswer('');
      setTimeSpentSeconds(0);
      setSummary(null);
      setActionError('');
      return;
    }

    let isMounted = true;
    setSessionLoading(true);

    api.adaptive
      .getActive()
      .then((res) => {
        if (!isMounted) return;
        if (res?.active && res?.session && res?.question) {
          setSession(res.session);
          setQuestion(res.question);
          setActionError('');

          // Restore draft answer or time spent from user-scoped localStorage if matching this session
          if (storageSessionKey) {
            try {
              const raw = localStorage.getItem(storageSessionKey);
              if (raw) {
                const saved = JSON.parse(raw);
                if (saved?.session?.session_id === res.session.session_id && saved?.userId === user.id) {
                  setSubmitted(saved.submitted || false);
                  setResult(saved.result || null);
                  setSelectedAnswer(saved.selectedAnswer || '');
                  setTimeSpentSeconds(saved.timeSpentSeconds || 0);
                }
              }
            } catch (_) {}
          }
        } else {
          // Server says no active practice session for this user
          setSession(null);
          setQuestion(null);
          setSubmitted(false);
          setResult(null);
          setSelectedAnswer('');
          setTimeSpentSeconds(0);
          if (storageSessionKey) {
            try { localStorage.removeItem(storageSessionKey); } catch (_) {}
          }
          try { localStorage.removeItem('jee_active_adaptive_session'); } catch (_) {}
        }
      })
      .catch((err) => {
        if (!isMounted) return;
        if (err?.status === 401 || err?.status === 403) {
          setSession(null);
          setQuestion(null);
        }
      })
      .finally(() => {
        if (isMounted) setSessionLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [user?.id, storageSessionKey]);

  // Persist active adaptive session to user-scoped localStorage
  useEffect(() => {
    if (!storageSessionKey || !user?.id) return;
    if (session && !summary) {
      try {
        localStorage.setItem(storageSessionKey, JSON.stringify({
          userId: user.id,
          session,
          question,
          submitted,
          result,
          selectedAnswer,
          timeSpentSeconds,
        }));
      } catch (_) {}
    } else if (summary || !session) {
      try {
        localStorage.removeItem(storageSessionKey);
      } catch (_) {}
      try {
        localStorage.removeItem('jee_active_adaptive_session');
      } catch (_) {}
    }
  }, [storageSessionKey, user?.id, session, question, submitted, result, selectedAnswer, timeSpentSeconds, summary]);

  // Back button and Refresh protection
  useEffect(() => {
    if (!session || summary) return;

    const onBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = 'Your adaptive practice circuit is in progress. Are you sure you want to refresh or exit?';
      return e.returnValue;
    };
    window.addEventListener('beforeunload', onBeforeUnload);

    window.history.pushState({ inAdaptive: true }, '', window.location.href);
    const onPopState = () => {
      window.history.pushState({ inAdaptive: true }, '', window.location.href);
      setExitModalOpen(true);
    };
    window.addEventListener('popstate', onPopState);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      window.removeEventListener('popstate', onPopState);
    };
  }, [Boolean(session), Boolean(summary)]);

  useEffect(() => {
    if (isActive) {
      fetchAdaptiveStats();
      fetchChapters();
    }
  }, [user?.id, isActive]);

  useEffect(() => {
    const handleUserUpdated = () => {
      fetchAdaptiveStats();
    };
    window.addEventListener('jee_user_updated', handleUserUpdated);
    return () => {
      window.removeEventListener('jee_user_updated', handleUserUpdated);
      clearInterval(timerRef.current);
    };
  }, []);

  // Reset timer strictly when question changes
  useEffect(() => {
    if (question?.id) {
      setTimeSpentSeconds(0);
    }
  }, [question?.id]);

  // Timer per question (pauses when tab is inactive, resumes when returned)
  useEffect(() => {
    if (session && !submitted && !summary && isActive) {
      clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setTimeSpentSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [question?.id, submitted, Boolean(session), Boolean(summary), isActive]);

  const fetchAdaptiveStats = () => {
    api.adaptive
      .getStats()
      .then((data) => setUserStats(data))
      .catch(() => {});
  };

  const fetchChapters = () => {
    api.questions
      .getChapters()
      .then((data) => setChaptersGrouped(data || {}))
      .catch(() => {});
  };

  const handleStartSession = async () => {
    if (!user) {
      onOpenAuth();
      return;
    }
    sound.click();
    setLoading(true);
    setActionError('');
    try {
      const isLearntOnly = syllabusScope === 'LEARNT_ONLY' && learntChapters.length > 0 && selectedChapters.length === 0;
      const resp = await api.adaptive.start({
        mode,
        target_questions: mode === 'TARGET_SPRINT' ? parseInt(targetQuestions, 10) : null,
        subject,
        chapter: selectedChapters.length === 1 ? selectedChapters[0] : null,
        chapters: selectedChapters.length > 0 ? selectedChapters : null,
        target_exam: targetExam,
        allowed_chapters: selectedChapters.length > 0 ? selectedChapters : (isLearntOnly ? learntChapters : null),
        only_learnt: isLearntOnly,
      });

      setSession(resp);
      setQuestion(resp.first_question);
      setSubmitted(false);
      setResult(null);
      setSelectedAnswer('');
      setSummary(null);
    } catch (err) {
      setActionError(err.message || 'Failed to initialize adaptive session.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!selectedAnswer.trim()) {
      setActionError('Please select or enter an answer before submitting.');
      return;
    }
    sound.click();
    setSubmitting(true);
    setActionError('');
    try {
      const resp = await api.adaptive.submit(session.session_id, {
        question_id: question.id,
        submitted_answer: selectedAnswer.trim(),
        time_spent_seconds: timeSpentSeconds,
      });

      setSubmitted(true);
      setResult(resp);

      // Play sound
      if (resp.is_correct) {
        sound.correct();
      } else {
        sound.wrong();
      }

      // Update session ratings in state
      setSession((prev) => ({
        ...prev,
        current_elo: resp.session_elo_after,
        streak: resp.current_streak,
        total_attempted: resp.total_attempted,
        total_correct: resp.total_correct,
      }));

      // Dynamically sync updated user profile across all views & Navbar without refresh
      api.auth.getMe().then((freshUser) => {
        if (onUpdateUser) onUpdateUser(freshUser);
        window.dispatchEvent(new CustomEvent('jee_user_updated', { detail: freshUser }));
      }).catch(() => {});
    } catch (err) {
      handleSessionError(err, 'Failed to submit answer.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSessionError = (err, defaultMsg) => {
    const msg = err?.message || defaultMsg;
    if (
      err?.status === 404 ||
      err?.status === 400 ||
      msg.toLowerCase().includes('not found') ||
      msg.toLowerCase().includes('already completed')
    ) {
      // The session no longer exists on the server or belongs to another user
      setSession(null);
      setQuestion(null);
      setResult(null);
      setSubmitted(false);
      setSelectedAnswer('');
      if (storageSessionKey) {
        try { localStorage.removeItem(storageSessionKey); } catch (_) {}
      }
      try { localStorage.removeItem('jee_active_adaptive_session'); } catch (_) {}
      setActionError('The active practice session was concluded or belongs to another account. You can configure and start a fresh session below.');
    } else {
      setActionError(msg);
    }
  };

  const handleCancelSession = async () => {
    if (!session?.session_id) return;
    if (!window.confirm('Are you sure you want to abandon this practice circuit?')) return;
    sound.click();
    setLoading(true);
    try {
      await api.adaptive.cancel(session.session_id);
    } catch (_) {}
    setSession(null);
    setQuestion(null);
    setResult(null);
    setSubmitted(false);
    setSelectedAnswer('');
    if (storageSessionKey) {
      try { localStorage.removeItem(storageSessionKey); } catch (_) {}
    }
    try { localStorage.removeItem('jee_active_adaptive_session'); } catch (_) {}
    setLoading(false);
  };

  const handleSkipQuestion = async () => {
    if (!session?.session_id) return;
    setLoading(true);
    setActionError('');
    try {
      const res = await api.adaptive.skip(session.session_id);
      if (res?.next_question) {
        setQuestion(res.next_question);
        setSubmitted(false);
        setResult(null);
        setSelectedAnswer('');
        setTimeSpentSeconds(0);
      }
    } catch (err) {
      handleSessionError(err, 'Failed to replace question.');
    } finally {
      setLoading(false);
    }
  };

  const handleNextQuestion = () => {
    sound.click();
    if (result?.is_session_finished) {
      handleFinishSession();
      return;
    }
    if (result?.next_question) {
      setQuestion(result.next_question);
      setSubmitted(false);
      setResult(null);
      setSelectedAnswer('');
    }
  };

  const handleFinishSession = async () => {
    sound.click();
    setLoading(true);
    setActionError('');
    try {
      const summaryReport = await api.adaptive.finish(session.session_id);
      setSummary(summaryReport);
      setSession(null);
      setQuestion(null);
      setSubmitted(false);
      setResult(null);
      fetchAdaptiveStats();

      // Dynamically sync updated user profile across all views & Navbar without refresh
      api.auth.getMe().then((freshUser) => {
        if (onUpdateUser) onUpdateUser(freshUser);
        window.dispatchEvent(new CustomEvent('jee_user_updated', { detail: freshUser }));
      }).catch(() => {});
    } catch (err) {
      handleSessionError(err, 'Failed to conclude session.');
    } finally {
      setLoading(false);
    }
  };

  const formatSeconds = (sec) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Helper list of chapters for chosen subject
  const currentChapterList = subject === 'Full Syllabus'
    ? Object.values(chaptersGrouped).flat()
    : chaptersGrouped[subject] || [];

  const filteredChapterList = currentChapterList.filter((c) =>
    (c.chapter || '').toLowerCase().includes(chapterSearch.toLowerCase().trim())
  );

  const toggleChapter = (chapterName) => {
    sound.click();
    setSelectedChapters((prev) =>
      prev.includes(chapterName)
        ? prev.filter((c) => c !== chapterName)
        : [...prev, chapterName]
    );
  };

  const handleSelectAllFiltered = () => {
    sound.click();
    const names = filteredChapterList.map((c) => c.chapter);
    setSelectedChapters((prev) => Array.from(new Set([...prev, ...names])));
  };

  const handleClearSelectedChapters = () => {
    sound.click();
    setSelectedChapters([]);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 page-transition space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/40 text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">
            <Brain className="w-3.5 h-3.5 text-orange-400" />
            <span>Item Response Theory (IRT) Engine</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-center gap-3">
            <span>Adaptive AI Question Practice</span>
            <span className="text-xs px-2.5 py-0.5 rounded-lg bg-orange-500/20 text-orange-400 font-mono font-bold border border-orange-500/30">
              Personalized Ladder
            </span>
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Real-time difficulty ladder dynamically tunes after every answer. Diagnoses weak concepts, resurfaces revenge problems from past tests, and ramps you to JEE Advanced mastery.
          </p>
        </div>

        {/* Global Stats Counter Pill */}
        {userStats && (
          <div className="flex items-center gap-3 bg-[#262c3c] border border-white/10 p-3 rounded-2xl">
            <div className="text-right">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Current Practice Elo</span>
              <span className="text-xl font-black font-mono text-orange-400 block leading-tight">
                {Math.round(userStats.overall_elo)} ELO
              </span>
            </div>
            <div className="w-10 h-10 rounded-xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
              <Zap className="w-5 h-5 fill-current" />
            </div>
          </div>
        )}
      </div>

      {actionError && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{actionError}</span>
        </div>
      )}

      {/* VIEW 1: LAUNCH & CONFIGURATION SCREEN */}
      {!session && !summary && (
        <div className="space-y-8">
          {/* Personalized Weak-Spot Diagnostic Radar Cards */}
          {userStats && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {[
                { title: 'Physics Elo', val: userStats.physics_elo, weak: userStats.weak_chapters?.Physics || [], color: 'text-blue-400', border: 'border-blue-500/30' },
                { title: 'Chemistry Elo', val: userStats.chemistry_elo, weak: userStats.weak_chapters?.Chemistry || [], color: 'text-emerald-400', border: 'border-emerald-500/30' },
                { title: 'Mathematics Elo', val: userStats.math_elo, weak: userStats.weak_chapters?.Mathematics || [], color: 'text-amber-400', border: 'border-amber-500/30' },
              ].map((sub) => (
                <div key={sub.title} className={`bg-[#262c3c] border ${sub.border} rounded-3xl p-5 shadow-lg space-y-3`}>
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-black uppercase font-mono ${sub.color}`}>{sub.title}</span>
                    <span className="text-lg font-black font-mono text-white">{Math.round(sub.val)} ELO</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 font-mono uppercase block mb-1">
                      Detected Weak Focus Areas ({sub.weak.length})
                    </span>
                    {sub.weak.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {sub.weak.slice(0, 3).map((w) => (
                          <span key={w} className="px-2 py-0.5 bg-red-950/40 border border-red-500/30 text-red-300 rounded text-[10px] truncate max-w-[150px]">
                            🎯 {w}
                          </span>
                        ))}
                        {sub.weak.length > 3 && (
                          <span className="text-[10px] text-slate-400 font-mono">+{sub.weak.length - 3} more</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-emerald-400 font-mono">✓ High proficiency balance</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Session Setup Card */}
          <div className="bg-[#262c3c] border border-orange-500/40 rounded-3xl p-6 sm:p-8 shadow-2xl glow-orange-subtle space-y-6 max-w-4xl mx-auto">
            <div className="border-b border-white/10 pb-4">
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Sliders className="w-5 h-5 text-orange-400" />
                <span>Configure Adaptive Practice Session</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose practice duration and syllabus focus. Difficulty adapts automatically based on your responses.
              </p>
            </div>

            {/* Mode Selector */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-2 font-mono uppercase">
                1. Select Session Style
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setMode('TARGET_SPRINT');
                  }}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                    mode === 'TARGET_SPRINT'
                      ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-orange-500 text-white shadow-lg glow-orange-subtle'
                      : 'bg-[#1e2433] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-sm text-white flex items-center gap-2">
                      <Target className="w-4 h-4 text-orange-400" />
                      <span>Target Sprint</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold">
                      Diagnostic Drill
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Set a fixed goal (10, 15, or 20 questions). Concludes with a full diagnostic mastery report and concept breakdown.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setMode('ENDLESS');
                  }}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                    mode === 'ENDLESS'
                      ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-orange-500 text-white shadow-lg glow-orange-subtle'
                      : 'bg-[#1e2433] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-sm text-white flex items-center gap-2">
                      <Zap className="w-4 h-4 text-amber-400" />
                      <span>Endless Mastery Flow</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                      Zen Mode
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Unconstrained continuous problem solving. Difficulty continuously climbs as you streak. Stop whenever you choose.
                  </p>
                </button>
              </div>
            </div>

            {/* Target Questions (if Sprint) */}
            {mode === 'TARGET_SPRINT' && (
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2 font-mono uppercase">
                  Target Sprint Length
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[10, 15, 20, 30].map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => setTargetQuestions(num)}
                      className={`py-2 rounded-xl text-xs font-bold font-mono transition cursor-pointer border ${
                        targetQuestions === num
                          ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                          : 'bg-[#1e2433] text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {num} Questions
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Question Bank Scope: Learnt Only vs Full Syllabus */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-bold text-slate-300 font-mono uppercase">
                  2. Question Bank Scope
                </label>
                <span className="text-[11px] font-mono text-emerald-400 font-bold">
                  {learntChapters.length} Chapters Marked as Learnt
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-2">
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setSyllabusScope('LEARNT_ONLY');
                  }}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                    syllabusScope === 'LEARNT_ONLY'
                      ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border-emerald-500 text-white shadow-lg'
                      : 'bg-[#1e2433] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-emerald-300 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>My Learnt Chapters Only</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">
                      {learntChapters.length > 0 ? `${learntChapters.length} Active` : '0 Marked'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    {learntChapters.length > 0
                      ? `Plucks questions strictly from your ${learntChapters.length} marked chapters in the Skill Tree.`
                      : 'No chapters marked yet in your Skill Tree. Adaptive tests will rotate all chapters until you mark your studied topics.'}
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setSyllabusScope('FULL_SYLLABUS');
                  }}
                  className={`p-4 rounded-2xl border text-left transition cursor-pointer ${
                    syllabusScope === 'FULL_SYLLABUS'
                      ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-orange-500 text-white shadow-lg'
                      : 'bg-[#1e2433] border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm text-orange-300 flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-orange-400" />
                      <span>Complete JEE Syllabus</span>
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/20 text-orange-300 font-bold">
                      All 92 Chapters
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    Challenges you across all official syllabus chapters, regardless of preparation status.
                  </p>
                </button>
              </div>
            </div>

            {/* Syllabus Scope */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-2 font-mono uppercase">
                3. Subject Focus
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {['Full Syllabus', 'Physics', 'Chemistry', 'Mathematics'].map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => {
                      setSubject(s);
                      setSelectedChapters([]);
                    }}
                    className={`py-2.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                      subject === s
                        ? 'bg-orange-500 text-white border-orange-500 shadow-md'
                        : 'bg-[#1e2433] text-slate-400 border-white/10 hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Multi-Chapter Selection Panel */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 font-mono uppercase flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-orange-400" />
                  <span>
                    4. Chapter Selection ({selectedChapters.length > 0
                      ? `${selectedChapters.length} Manually Selected`
                      : (syllabusScope === 'LEARNT_ONLY' && learntChapters.length > 0
                          ? `All ${learntChapters.length} Learnt Chapters Active`
                          : 'Full Syllabus')})
                  </span>
                </label>
                <div className="flex items-center gap-2">
                  {learntChapters.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        sound.click();
                        const matching = currentChapterList
                          .filter((c) => learntChapters.includes(c.chapter))
                          .map((c) => c.chapter);
                        setSelectedChapters(matching);
                      }}
                      className="text-[11px] font-mono text-emerald-400 hover:text-emerald-300 transition cursor-pointer font-bold"
                      title="Select all marked learnt chapters in this subject"
                    >
                      Select Learnt ({currentChapterList.filter((c) => learntChapters.includes(c.chapter)).length})
                    </button>
                  )}
                  {selectedChapters.length > 0 && (
                    <button
                      type="button"
                      onClick={handleClearSelectedChapters}
                      className="text-[11px] font-mono text-red-400 hover:text-red-300 transition cursor-pointer font-bold"
                    >
                      Clear Selection
                    </button>
                  )}
                  {filteredChapterList.length > 0 && (
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="text-[11px] font-mono text-orange-400 hover:text-orange-300 transition cursor-pointer font-bold"
                    >
                      Select All Shown ({filteredChapterList.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Search filter input */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={chapterSearch}
                  onChange={(e) => setChapterSearch(e.target.value)}
                  placeholder="Filter chapters by name (e.g. Thermodynamics, Calculus, Rotational)..."
                  className="w-full pl-9 pr-8 py-2 bg-[#1e2433] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono"
                />
                {chapterSearch && (
                  <button
                    type="button"
                    onClick={() => setChapterSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white p-1"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Selected Chapter Chips */}
              {selectedChapters.length > 0 && (
                <div className="flex flex-wrap gap-1.5 p-2 bg-[#191e2b] border border-orange-500/30 rounded-xl max-h-24 overflow-y-auto">
                  {selectedChapters.map((ch) => (
                    <span
                      key={ch}
                      className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-orange-500/20 border border-orange-500/40 text-orange-300 rounded-lg text-[11px] font-mono font-medium"
                    >
                      <span className="truncate max-w-[200px]">{ch}</span>
                      <button
                        type="button"
                        onClick={() => toggleChapter(ch)}
                        className="hover:text-white transition cursor-pointer ml-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Scrollable Checkbox Grid */}
              <div className="max-h-52 overflow-y-auto pr-1 rounded-xl border border-white/10 bg-[#191e2b] p-2 space-y-1">
                {filteredChapterList.length === 0 ? (
                  <div className="text-center py-6 text-xs text-slate-500 font-mono">
                    No chapters match "{chapterSearch}"
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {filteredChapterList.map((c) => {
                      const isChecked = selectedChapters.includes(c.chapter);
                      return (
                        <button
                          key={c.chapter}
                          type="button"
                          onClick={() => toggleChapter(c.chapter)}
                          className={`flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition cursor-pointer border ${
                            isChecked
                              ? 'bg-orange-500/20 border-orange-500/60 text-white font-medium shadow-sm'
                              : 'bg-[#1e2433]/70 border-white/5 text-slate-400 hover:bg-[#1e2433] hover:text-slate-200'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0 mr-2">
                            <div
                              className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition ${
                                isChecked
                                  ? 'bg-orange-500 border-orange-500 text-white'
                                  : 'border-slate-600 bg-black/20'
                              }`}
                            >
                              {isChecked && <Check className="w-3 h-3 stroke-[3]" />}
                            </div>
                            <span className="truncate">{c.chapter}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-500 shrink-0">
                            {c.count} Qs
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <p className="text-[11px] font-mono">
                {selectedChapters.length > 0 ? (
                  <span className="text-orange-300">
                    🎯 <strong>Manual filter active:</strong> Practice will rotate strictly across your {selectedChapters.length} selected chapters.
                  </span>
                ) : syllabusScope === 'LEARNT_ONLY' ? (
                  learntChapters.length > 0 ? (
                    <span className="text-emerald-300">
                      ⭐ <strong>Learnt Scope active:</strong> No specific chapter selected below — practice will rotate exclusively across your {learntChapters.length} marked learnt chapters.
                    </span>
                  ) : (
                    <span className="text-amber-300">
                      ⚠️ <strong>0 chapters marked in Skill Tree:</strong> Because no learnt chapters are marked, full syllabus rotation will be used until you mark your studied topics.
                    </span>
                  )
                ) : (
                  <span className="text-slate-300">
                    🌐 <strong>Full Syllabus active:</strong> No specific chapter selected — all {subject === 'Full Syllabus' ? 'JEE' : subject} chapters will rotate dynamically with AI weak-topic prioritization.
                  </span>
                )}
              </p>
            </div>

            {/* Target Exam Tier */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-2 font-mono uppercase">
                5. Target Exam Standard
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  {
                    id: 'MIXED',
                    title: 'Adaptive Mix',
                    badge: 'Main & Advanced',
                    desc: 'Dynamically scales across all question formats and difficulty tiers.'
                  },
                  {
                    id: 'MAIN',
                    title: 'JEE Main (NTA Format)',
                    badge: 'Single Choice & Numericals',
                    desc: 'Strict NTA paper format. Excludes multi-correct, matrix, or comprehension.'
                  },
                  {
                    id: 'ADVANCED',
                    title: 'JEE Advanced High-Tier',
                    badge: 'Multi-Correct & Matrix',
                    desc: 'Reserved for multi-correct, matrix match, comprehension & advanced NVQs.'
                  }
                ].map((tier) => (
                  <button
                    key={tier.id}
                    type="button"
                    onClick={() => setTargetExam(tier.id)}
                    className={`p-3 rounded-xl text-left transition cursor-pointer border ${
                      targetExam === tier.id
                        ? 'bg-amber-500/20 text-white border-amber-500 shadow-md ring-1 ring-amber-500'
                        : 'bg-[#1e2433] text-slate-400 border-white/10 hover:text-white'
                    }`}
                  >
                    <div className="font-bold text-xs text-white mb-0.5">{tier.title}</div>
                    <div className="text-[10px] text-amber-400 font-mono font-bold mb-1">{tier.badge}</div>
                    <div className="text-[10px] text-slate-400 leading-snug">{tier.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Launch CTA */}
            <div className="pt-4 border-t border-white/10 space-y-2">
              <div className="text-center text-xs text-slate-400 font-mono">
                Active Circuit Scope:{' '}
                <strong className="text-white">
                  {selectedChapters.length > 0
                    ? `${selectedChapters.length} Selected Chapters`
                    : (syllabusScope === 'LEARNT_ONLY' && learntChapters.length > 0
                        ? `${learntChapters.length} Learnt Chapters (${subject})`
                        : `Complete Syllabus (${subject})`)}
                </strong>
                {' '}• Standard: <strong className="text-amber-400">{targetExam}</strong>
              </div>
              <button
                type="button"
                onClick={handleStartSession}
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm rounded-2xl shadow-xl transition cursor-pointer glow-orange flex items-center justify-center gap-2"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>START ADAPTIVE PRACTICE CIRCUIT ⚡</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: ACTIVE ADAPTIVE SOLVING HUD & QUESTION */}
      {session && question && !summary && (
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Top HUD Status Bar */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-4 sm:p-5 shadow-xl flex flex-wrap items-center justify-between gap-4">
            {/* Left: Mode & Scope */}
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono font-black uppercase text-orange-400 bg-orange-500/20 px-2.5 py-0.5 rounded-full border border-orange-500/30">
                  {session.mode === 'TARGET_SPRINT'
                    ? `Sprint: Question ${session.current_index} of ${session.target_questions}`
                    : `Endless Flow: Question ${session.current_index}`}
                </span>
                <span className="text-xs text-slate-300 font-bold">
                  {question.subject} • {question.chapter}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-mono">
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${TIER_COLORS[question.tier_label] || TIER_COLORS.JEE_MAIN_STANDARD}`}>
                  {TIER_LABELS[question.tier_label] || '🟡 JEE Main Tier'}
                </span>
                <span className="text-slate-400">Question Elo: <strong className="text-white">{question.elo_rating}</strong></span>
              </div>
            </div>

            {/* Center: Live Session Elo & Streak */}
            <div className="flex items-center gap-4">
              <div className="text-center px-3 py-1 rounded-2xl bg-[#1e2433] border border-white/10">
                <span className="text-[9px] font-mono uppercase text-slate-400 block">Session Elo</span>
                <span className="text-lg font-black font-mono text-orange-400 block leading-tight">
                  {Math.round(session.current_elo)}
                </span>
              </div>

              {session.streak > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold font-mono animate-pulse">
                  <Flame className="w-4 h-4 text-orange-500 fill-current" />
                  <span>{session.streak} Streak {session.streak >= 3 && '🔥 Flow State'}</span>
                </div>
              )}
            </div>

            {/* Right: Timer & Finish CTA */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-300 bg-[#1e2433] px-3 py-1.5 rounded-xl border border-white/10">
                <Clock className="w-3.5 h-3.5 text-orange-400" />
                <span>{formatSeconds(timeSpentSeconds)}</span>
              </div>

              <button
                type="button"
                onClick={handleFinishSession}
                className="px-3 py-1.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white text-xs font-mono transition cursor-pointer flex items-center gap-1"
                title="Conclude Session & View Performance Report"
              >
                <Award className="w-3.5 h-3.5 text-amber-400" />
                <span>Finish</span>
              </button>

              <button
                type="button"
                onClick={handleCancelSession}
                className="px-3 py-1.5 rounded-xl border border-red-500/20 hover:bg-red-500/10 text-red-400 text-xs font-mono transition cursor-pointer flex items-center gap-1"
                title="Abandon Circuit"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Exit</span>
              </button>
            </div>
          </div>

          {/* Special Remediation / Revenge Alerts */}
          {question.is_remediation && !submitted && (
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-center gap-3">
              <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <strong className="text-white block font-bold font-mono">Concept Remediation Triggered:</strong>
                Serving a calibrated foundational diagnostic on <strong>{question.chapter}</strong> to reinforce core principles following your previous error.
              </div>
            </div>
          )}

          {question.is_revenge && !submitted && (
            <div className="p-3.5 rounded-2xl bg-purple-950/40 border border-purple-500/40 text-purple-200 text-xs flex items-center gap-3">
              <Swords className="w-4 h-4 text-purple-400 shrink-0" />
              <div>
                <strong className="text-white block font-bold font-mono">Revenge Problem Detected:</strong>
                You previously missed this question in a test or duel. Solve it correctly now to avenge lost marks and boost your chapter rating!
              </div>
            </div>
          )}

          {/* Question Card */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 text-xs text-slate-400 font-mono">
              <div className="flex items-center gap-3">
                <span>Format: <strong className="text-white">{question.question_type}</strong></span>
                <span>•</span>
                <span>Target: <strong className="text-orange-400">{question.target_exam || 'JEE Main/Adv'}</strong></span>
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setReportModalOpen(true);
                }}
                className="text-[11px] text-slate-400 hover:text-amber-400 font-bold flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-amber-950/40 border border-white/10 hover:border-amber-500/40 transition cursor-pointer"
                title="Report Defective Question"
              >
                <Flag className="w-3.5 h-3.5 text-amber-500" />
                <span>Report Issue</span>
              </button>
            </div>

            {/* Comprehension / Paragraph Box */}
            {question.passage_text && (
              <div className="mb-6 rounded-2xl bg-[#1a2133] border-2 border-blue-500/40 shadow-lg overflow-hidden">
                <div className="bg-gradient-to-r from-blue-950/80 via-[#1f293d] to-[#1a2133] border-b border-blue-500/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-xs font-black uppercase tracking-wider text-blue-200">
                      {question.passage_title || 'Comprehension Passage'}
                    </span>
                  </div>
                  {question.subquestion_index && question.subquestion_total && (
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold border border-blue-400/30">
                      Question {question.subquestion_index} of {question.subquestion_total} based on this passage
                    </span>
                  )}
                </div>
                <div className="p-4 sm:p-5 text-sm sm:text-base leading-relaxed text-slate-200 font-normal max-h-72 overflow-y-auto border-b border-white/5 bg-[#141a29]/80">
                  <MathRenderer content={question.passage_text} />
                </div>
                <div className="px-4 py-1.5 bg-blue-950/40 text-[11px] text-blue-300 font-medium flex items-center justify-between">
                  <span>Read the passage carefully and answer the question below:</span>
                  <span className="font-mono text-[10px] text-blue-400 uppercase">JEE Advanced Format</span>
                </div>
              </div>
            )}

            {/* Question Text */}
            <div className="text-sm sm:text-base text-slate-100 font-medium leading-relaxed">
              <MathRenderer content={question.text} />
            </div>

            {/* Diagrams if any */}
            {question.has_diagram && question.diagram_urls && question.diagram_urls.length > 0 && (
              <div className="p-4 rounded-2xl bg-[#1e2433] border border-white/10 flex flex-wrap justify-center gap-4">
                {question.diagram_urls.map((url, i) => (
                  <img
                    key={i}
                    src={url}
                    alt={`Question Diagram ${i + 1}`}
                    className="max-h-64 rounded-xl object-contain border border-white/10"
                  />
                ))}
              </div>
            )}

            {/* Interactive Options / Answer Input */}
            {!submitted ? (
              <div className="pt-4 border-t border-white/10 space-y-4">
                {/* Single Choice or Multi Choice */}
                {question.options && question.options.length > 0 ? (
                  <div>
                    {(() => {
                      const isMulti = ['MULTIPLE_CHOICE', 'MULTI_CORRECT', 'MULTIPLE'].includes((question.question_type || '').toUpperCase());
                      const selectedKeys = selectedAnswer
                        ? selectedAnswer.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
                        : [];

                      const handleOptionClick = (key) => {
                        sound.click();
                        if (isMulti) {
                          const kUpper = key.toUpperCase();
                          let updated;
                          if (selectedKeys.includes(kUpper)) {
                            updated = selectedKeys.filter((k) => k !== kUpper);
                          } else {
                            updated = [...selectedKeys, kUpper].sort();
                          }
                          setSelectedAnswer(updated.join(', '));
                        } else {
                          setSelectedAnswer(key);
                        }
                      };

                      return (
                        <>
                          {isMulti && (
                            <div className="mb-3 px-3.5 py-2 rounded-xl bg-purple-950/50 border border-purple-500/40 text-xs text-purple-200 font-bold flex items-center justify-between">
                              <span>Multiple Correct Options: Tap each correct option to toggle.</span>
                              <span className="font-mono text-amber-300">Selected: {selectedAnswer || 'None'}</span>
                            </div>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {question.options.map((opt) => {
                              const isSel = isMulti
                                ? selectedKeys.includes(opt.key.toUpperCase())
                                : selectedAnswer.toUpperCase() === opt.key.toUpperCase();
                              return (
                                <button
                                  key={opt.key}
                                  type="button"
                                  onClick={() => handleOptionClick(opt.key)}
                                  className={`p-4 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
                                    isSel
                                      ? 'bg-orange-500/20 border-orange-500 text-white shadow-lg glow-orange-subtle'
                                      : 'bg-[#1e2433] border-white/10 text-slate-300 hover:bg-[#252c3c] hover:text-white'
                                  }`}
                                >
                                  <div
                                    className={`w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 ${
                                      isSel ? 'bg-orange-500 text-white' : 'bg-white/10 text-slate-400'
                                    }`}
                                  >
                                    {opt.key}
                                  </div>
                                  <div className="text-xs sm:text-sm font-medium leading-relaxed pt-0.5">
                                    <MathRenderer content={opt.text} />
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                ) : (
                  /* Numerical or Text Answer Input */
                  <div className="max-w-md space-y-2">
                    <label className="text-xs font-bold text-slate-300 block font-mono">
                      {question.question_type === 'MATRIX_MATCH'
                        ? 'Enter Matrix Match Answer (e.g. A-P, B-Q or option key):'
                        : ['NUMERICAL', 'INTEGER'].includes((question.question_type || '').toUpperCase())
                        ? 'Enter Numerical Value (Integer or Decimal):'
                        : 'Enter Your Answer:'}
                    </label>
                    <input
                      type="text"
                      placeholder={
                        question.question_type === 'MATRIX_MATCH'
                          ? 'e.g. A-p, B-q or option letter'
                          : ['NUMERICAL', 'INTEGER'].includes((question.question_type || '').toUpperCase())
                          ? 'e.g. 4.5 or 12'
                          : 'Enter your answer...'
                      }
                      value={selectedAnswer}
                      onChange={(e) => setSelectedAnswer(e.target.value)}
                      className="w-full px-4 py-3 bg-[#1e2433] border border-white/20 rounded-xl text-white font-mono text-sm focus:outline-none focus:border-orange-500"
                    />
                  </div>
                )}

                {/* Submit CTA */}
                <div className="flex items-center justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={handleSubmitAnswer}
                    disabled={submitting || !selectedAnswer.trim()}
                    className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm rounded-2xl shadow-xl transition cursor-pointer glow-orange disabled:opacity-50"
                  >
                    {submitting ? 'Evaluating Answer...' : 'SUBMIT ANSWER ➔'}
                  </button>
                </div>
              </div>
            ) : (
              /* REVEAL MODE: INSTANT INTERACTIVE FEEDBACK & DEEP-DIVE */
              <div className="pt-6 border-t border-white/10 space-y-6">
                {/* Correctness Banner */}
                <div
                  className={`p-5 rounded-3xl border flex items-center justify-between gap-4 ${
                    result?.is_correct
                      ? 'bg-emerald-950/40 border-emerald-500/50 text-emerald-200'
                      : 'bg-red-950/40 border-red-500/50 text-red-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-2xl flex items-center justify-center ${
                        result?.is_correct ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {result?.is_correct ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                    </div>
                    <div>
                      <h3 className="text-base font-black">
                        {result?.is_correct ? 'Correct Answer! Outstanding Solve.' : 'Incorrect Answer'}
                      </h3>
                      <p className="text-xs opacity-90 font-mono">
                        Correct Option: <strong className="underline">{result?.correct_answer}</strong> (You chose: {selectedAnswer})
                      </p>
                    </div>
                  </div>

                  <div className="text-right font-mono">
                    <span className="text-[10px] uppercase block opacity-80">Rating Shift</span>
                    <span
                      className={`text-lg font-black ${
                        result?.elo_delta >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }`}
                    >
                      {result?.elo_delta >= 0 ? `+${result?.elo_delta}` : result?.elo_delta} ELO
                    </span>
                  </div>
                </div>

                {/* On-Demand Verified Derivation & Answer Key */}
                <div className="pt-1">
                  <OnDemandDerivationBox
                    questionId={question?.id}
                    officialKey={result?.correct_answer || question?.correct_answer}
                    initialSolution={result}
                    onReportClick={() => {
                      sound.click();
                      setReportModalOpen(true);
                    }}
                  />
                </div>

                {/* Next Question CTA */}
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    onClick={handleFinishSession}
                    className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-slate-400 hover:text-white text-xs font-mono transition"
                  >
                    Finish Session & View Report
                  </button>

                  <button
                    type="button"
                    onClick={handleNextQuestion}
                    className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm rounded-2xl shadow-xl transition cursor-pointer glow-orange flex items-center gap-2"
                  >
                    <span>{result?.is_session_finished ? 'VIEW FINAL MASTERY REPORT 🏆' : 'NEXT ADAPTIVE CHALLENGE ➔'}</span>
                    <ArrowRight className="w-4 h-4 stroke-[3]" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* VIEW 3: POST-SESSION MASTERY REPORT DASHBOARD */}
      {summary && (
        <div className="space-y-8 max-w-4xl mx-auto">
          {/* Ceremony Header */}
          <div className="bg-gradient-to-b from-orange-500/20 via-[#262c3c] to-[#1c2230] border border-orange-500/40 rounded-3xl p-8 text-center shadow-2xl glow-orange-subtle space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400 mx-auto shadow-lg">
              <Trophy className="w-8 h-8 fill-current" />
            </div>
            <div>
              <span className="text-[10px] font-mono font-black text-orange-400 uppercase tracking-widest block">
                ADAPTIVE PRACTICE CONCLUDED
              </span>
              <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
                Diagnostic Mastery Report
              </h2>
              <p className="text-xs text-slate-400 mt-1 font-mono">
                Syllabus: {summary.subject} • Mode: {summary.mode}
              </p>
            </div>

            {/* Stat Cards Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4">
              <div className="p-4 rounded-2xl bg-[#1e2433] border border-white/10">
                <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1">Accuracy</span>
                <span className="text-2xl font-black font-mono text-emerald-400">
                  {summary.accuracy_percentage}%
                </span>
                <span className="text-[10px] text-slate-500 block font-mono">
                  {summary.total_correct}/{summary.total_attempted} Solved
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-[#1e2433] border border-white/10">
                <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1">Net Elo Shift</span>
                <span
                  className={`text-2xl font-black font-mono ${
                    summary.net_elo_delta >= 0 ? 'text-orange-400' : 'text-red-400'
                  }`}
                >
                  {summary.net_elo_delta >= 0 ? `+${summary.net_elo_delta}` : summary.net_elo_delta}
                </span>
                <span className="text-[10px] text-slate-500 block font-mono">
                  {summary.initial_elo} ➔ {summary.final_elo}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-[#1e2433] border border-white/10">
                <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1">Peak Streak</span>
                <span className="text-2xl font-black font-mono text-amber-400">
                  {summary.best_streak} Qs
                </span>
                <span className="text-[10px] text-slate-500 block font-mono">Flow State</span>
              </div>

              <div className="p-4 rounded-2xl bg-[#1e2433] border border-white/10">
                <span className="text-[10px] font-mono text-slate-400 uppercase block mb-1">Avg Time / Q</span>
                <span className="text-2xl font-black font-mono text-blue-400">
                  {formatSeconds(Math.round(summary.average_time_seconds))}
                </span>
                <span className="text-[10px] text-slate-500 block font-mono">Pacing Rate</span>
              </div>
            </div>
          </div>

          {/* Diagnostic Breakdown: Strengths vs Weak Spots */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Strengths */}
            <div className="p-6 rounded-3xl bg-[#262c3c] border border-emerald-500/30 space-y-3">
              <span className="text-xs font-black uppercase text-emerald-400 font-mono block flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4" />
                <span>Concept Strengths Mastered ({summary.strengths?.length || 0})</span>
              </span>
              {summary.strengths && summary.strengths.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {summary.strengths.map((str) => (
                    <span key={str} className="px-3 py-1 bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 rounded-xl text-xs font-mono font-bold">
                      ✓ {str}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-400">Continue practicing to solidify high-accuracy chapters.</p>
              )}
            </div>

            {/* Weak Spots */}
            <div className="p-6 rounded-3xl bg-[#262c3c] border border-red-500/30 space-y-3">
              <span className="text-xs font-black uppercase text-red-400 font-mono block flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                <span>Remediation Target Chapters ({summary.weak_spots?.length || 0})</span>
              </span>
              {summary.weak_spots && summary.weak_spots.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {summary.weak_spots.map((wk) => (
                    <span key={wk} className="px-3 py-1 bg-red-950/40 border border-red-500/30 text-red-300 rounded-xl text-xs font-mono font-bold">
                      🎯 {wk}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-emerald-400 font-mono">No severe conceptual traps encountered this session!</p>
              )}
            </div>
          </div>

          {/* Question Review Drawer */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 space-y-4">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-orange-400" />
              <span>Question History & Analysis ({summary.history?.length || 0})</span>
            </h3>

            <div className="space-y-3">
              {summary.history?.map((h, i) => (
                <div
                  key={i}
                  className={`p-4 rounded-2xl border text-xs space-y-2 ${
                    h.is_correct ? 'bg-[#1e2433] border-emerald-500/30' : 'bg-[#1e2433] border-red-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono">
                    <span className="font-bold text-slate-300">
                      Q{i + 1} • {h.chapter} ({h.question_elo} ELO)
                    </span>
                    <span className={h.is_correct ? 'text-emerald-400 font-black' : 'text-red-400 font-black'}>
                      {h.is_correct ? '✓ Correct' : '✗ Missed'} ({h.elo_delta >= 0 ? `+${h.elo_delta}` : h.elo_delta} ELO)
                    </span>
                  </div>
                  <div className="text-slate-200">
                    <MathRenderer content={h.text} />
                  </div>
                  <div className="flex items-center gap-4 text-[11px] font-mono text-slate-400 pt-1 border-t border-white/5">
                    <span>Your Answer: <strong className="text-white">{h.submitted_answer}</strong></span>
                    <span>Correct Answer: <strong className="text-emerald-400">{h.correct_answer}</strong></span>
                    <span>Time: <strong className="text-white">{formatSeconds(h.time_spent_seconds)}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Action Footer */}
          <div className="flex items-center justify-center gap-4 pt-2">
            <button
              type="button"
              onClick={() => {
                sound.click();
                setSummary(null);
              }}
              className="px-6 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-2xl shadow-xl transition cursor-pointer glow-orange flex items-center gap-2"
            >
              <RotateCcw className="w-4 h-4" />
              <span>START NEW ADAPTIVE SESSION</span>
            </button>
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal */}
      {exitModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#1b202e] rounded-2xl shadow-2xl max-w-md w-full border border-white/10 overflow-hidden text-slate-200">
            <div className="bg-[#161a26] text-white p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm">Adaptive Sprint In Progress</h3>
              </div>
              <button
                onClick={() => setExitModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 text-xs space-y-4">
              <p className="text-slate-300 leading-relaxed">
                You pressed the browser back button. Leaving now will interrupt your active adaptive sprint.
                Your current streak and solved metrics are preserved.
              </p>

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-amber-300 text-xs">
                <strong>Notice:</strong> You can stay in the sprint to continue climbing your chapter Elo, or conclude now to generate your diagnostic performance report.
              </div>

              <div className="flex items-center justify-end gap-2 sm:gap-3 pt-2 flex-wrap">
                <button
                  onClick={() => setExitModalOpen(false)}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow cursor-pointer transition"
                >
                  Stay in Circuit
                </button>
                <button
                  onClick={() => {
                    setExitModalOpen(false);
                    handleFinishSession();
                  }}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-white/10 hover:bg-amber-600 hover:text-white text-slate-300 font-bold text-xs cursor-pointer transition"
                >
                  Conclude & Report
                </button>
                <button
                  onClick={() => {
                    setExitModalOpen(false);
                    handleCancelSession();
                  }}
                  className="px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-red-500/20 hover:bg-red-500 hover:text-white text-red-300 font-bold text-xs cursor-pointer transition border border-red-500/30"
                >
                  Abandon Circuit
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Report Question Modal */}
      <ReportQuestionModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        questionId={question?.id}
        questionText={question?.text}
        mode="adaptive"
        canSkip={true}
        onSkip={handleSkipQuestion}
      />
    </div>
  );
}
