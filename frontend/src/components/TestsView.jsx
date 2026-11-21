import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import { formatIST, formatISTDate } from '../utils/dateUtils';
import ConicBorder from './animations/ConicBorder';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Trophy,
  Users,
  Sparkles,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  Plus,
  X,
  Check,
  Shield,
  Award,
  Lock,
  ChevronRight,
  Filter,
  Flame,
  Search,
  ExternalLink,
  Hourglass,
  BookOpen,
  Trash2
} from 'lucide-react';

const CANONICAL_SUBJECTS = ['Physics', 'Chemistry', 'Mathematics'];

export default function TestsView({ user, onStartTest, onSelectTest, onOpenAuth }) {
  const [catalog, setCatalog] = useState({ all: [], upcoming: [], active: [], pending: [], completed: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL', 'ACTIVE', 'UPCOMING', 'PENDING', 'COMPLETED'
  const [searchQuery, setSearchQuery] = useState('');

  // Unschedule / Delete Confirmation Modal State
  const [deleteConfirmTest, setDeleteConfirmTest] = useState(null);
  const [deletingTestId, setDeletingTestId] = useState(null);

  // Two-Tier Leaderboard Modal State
  const [leaderboardModalTestId, setLeaderboardModalTestId] = useState(null);
  const [leaderboardData, setLeaderboardData] = useState(null);
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [lbActiveTier, setLbActiveTier] = useState('OFFICIAL'); // 'OFFICIAL' or 'LATE'

  // Admin Create Scheduled Test Modal State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [aspirantsList, setAspirantsList] = useState([]);
  const [loadingAspirants, setLoadingAspirants] = useState(false);
  const [creating, setCreating] = useState(false);

  // Syllabus & Chapter Selector State
  const [syllabusScope, setSyllabusScope] = useState('FULL'); // 'FULL' or 'CUSTOM'
  const [selectedSubjects, setSelectedSubjects] = useState(['Physics', 'Chemistry', 'Mathematics']);
  const [chaptersMap, setChaptersMap] = useState({});
  const [selectedChapters, setSelectedChapters] = useState([]);
  const [activeSubjectTab, setActiveSubjectTab] = useState('Physics');
  const [chapterSearch, setChapterSearch] = useState('');
  const [loadingChapters, setLoadingChapters] = useState(false);

  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    exam_type: 'MAIN',
    difficulty: 'STRICT',
    duration_minutes: 60,
    total_questions: 25,
    subjects: ['Physics', 'Chemistry', 'Mathematics'],
    chapters: [],
    scheduled_start_time: '',
    deadline_time: '',
    assigned_user_ids: ['*'], // '*' means all
  });

  // Calculate default dates for create form
  useEffect(() => {
    const now = new Date();
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(9, 0, 0, 0);

    const deadline = new Date(tomorrow.getTime() + 48 * 60 * 60 * 1000);
    deadline.setHours(23, 59, 0, 0);

    const toLocalISO = (d) => {
      const pad = (n) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };

    setCreateForm((prev) => ({
      ...prev,
      scheduled_start_time: toLocalISO(tomorrow),
      deadline_time: toLocalISO(deadline),
    }));
  }, []);

  const fetchCatalog = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.scheduledTests.getCatalog();
      setCatalog(data || { all: [], upcoming: [], active: [], pending: [], completed: [] });
    } catch (err) {
      setError(err.message || 'Failed to retrieve scheduled tests.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalog();
    const handleRefresh = () => fetchCatalog();
    window.addEventListener('jee_user_updated', handleRefresh);
    window.addEventListener('jee_test_deleted', handleRefresh);
    return () => {
      window.removeEventListener('jee_user_updated', handleRefresh);
      window.removeEventListener('jee_test_deleted', handleRefresh);
    };
  }, [user?.id]);

  const handleDeleteOrUnscheduleTest = async (test) => {
    if (!test?.id) return;
    setDeletingTestId(test.id);
    try {
      sound?.click?.();
      await api.scheduledTests.delete(test.id);
      // Remove from catalog immediately
      setCatalog((prev) => {
        const filterFn = (t) => t.id !== test.id && t.room_code !== test.room_code;
        return {
          all: (prev.all || []).filter(filterFn),
          upcoming: (prev.upcoming || []).filter(filterFn),
          active: (prev.active || []).filter(filterFn),
          pending: (prev.pending || []).filter(filterFn),
          completed: (prev.completed || []).filter(filterFn),
        };
      });
      // Invalidate test history cache in sessionStorage and dispatch event
      const targetUser = user?.username || 'me';
      const cacheKeys = [
        `jee_cached_history_${targetUser}`,
        'jee_cached_history_me',
        ...(user?.username ? [`jee_cached_history_${user.username}`] : [])
      ];
      try {
        for (const key of cacheKeys) {
          const stored = sessionStorage.getItem(key);
          if (stored) {
            const list = JSON.parse(stored).filter((h) => h.code !== test.room_code && h.room_id !== test.room_id);
            sessionStorage.setItem(key, JSON.stringify(list));
          }
        }
        if (test.room_code) {
          sessionStorage.removeItem(`jee_cached_results_${test.room_code.toUpperCase()}`);
        }
      } catch (_) {}
      window.dispatchEvent(new CustomEvent('jee_user_updated', { detail: user }));
      window.dispatchEvent(new CustomEvent('jee_test_deleted', { detail: { code: test.room_code, room_id: test.room_id } }));
      setDeleteConfirmTest(null);
    } catch (err) {
      alert(err.message || 'Failed to remove test.');
    } finally {
      setDeletingTestId(null);
    }
  };

  const openLeaderboard = (testId) => {
    try { sound?.click?.(); } catch (_) {}
    setLeaderboardModalTestId(testId);
    setLoadingLeaderboard(true);
    setLbActiveTier('OFFICIAL');
    api.scheduledTests.getLeaderboard(testId)
      .then((data) => setLeaderboardData(data))
      .catch((err) => {
        alert('Could not load leaderboard: ' + err.message);
        setLeaderboardModalTestId(null);
      })
      .finally(() => setLoadingLeaderboard(false));
  };

  const openCreateModal = () => {
    try { sound?.click?.(); } catch (_) {}
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      else alert('Please sign in or register an aspirant nickname to create scheduled exams.');
      return;
    }
    setShowCreateModal(true);
    setLoadingAspirants(true);
    api.scheduledTests.getAspirants()
      .then((list) => setAspirantsList(list || []))
      .catch((err) => console.warn('Failed to load aspirants roster:', err))
      .finally(() => setLoadingAspirants(false));

    if (Object.keys(chaptersMap).length === 0) {
      setLoadingChapters(true);
      api.questions.getChapters()
        .then((data) => setChaptersMap(data || {}))
        .catch((err) => console.warn('Failed to load chapters map:', err))
        .finally(() => setLoadingChapters(false));
    }
  };

  const toggleSubject = (subj) => {
    try { sound?.click?.(); } catch (_) {}
    setSelectedSubjects((prev) => {
      if (prev.includes(subj)) {
        if (prev.length === 1) return prev;
        return prev.filter((s) => s !== subj);
      }
      return [...prev, subj];
    });
  };

  const toggleChapter = (chapterName) => {
    try { sound?.click?.(); } catch (_) {}
    setSelectedChapters((prev) => {
      if (prev.includes(chapterName)) {
        return prev.filter((c) => c !== chapterName);
      }
      return [...prev, chapterName];
    });
  };

  const handleSelectAllInSubject = (subjName) => {
    try { sound?.click?.(); } catch (_) {}
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
    try { sound?.click?.(); } catch (_) {}
    const chList = (chaptersMap[subjName] || []).map((c) => c.chapter);
    setSelectedChapters((prev) => prev.filter((c) => !chList.includes(c)));
  };

  const handleSelectAllInUnit = (unitChapters) => {
    try { sound?.click?.(); } catch (_) {}
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
    try { sound?.click?.(); } catch (_) {}
    setSelectedChapters([]);
  };

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

  const activeCustomSubjects = useMemo(() => {
    if (selectedChapters.length === 0) return selectedSubjects;
    const found = new Set();
    for (const ch of selectedChapters) {
      for (const subj of CANONICAL_SUBJECTS) {
        if ((chaptersMap[subj] || []).some((item) => item.chapter === ch)) {
          found.add(subj);
          break;
        }
      }
    }
    return found.size > 0 ? Array.from(found) : selectedSubjects;
  }, [selectedChapters, chaptersMap, selectedSubjects]);

  const totalAvailableInSelected = useMemo(() => {
    let tot = 0;
    for (const ch of selectedChapters) {
      for (const subj of CANONICAL_SUBJECTS) {
        const match = (chaptersMap[subj] || []).find((c) => c.chapter === ch);
        if (match) {
          tot += match.count || 0;
          break;
        }
      }
    }
    return tot;
  }, [selectedChapters, chaptersMap]);

  const handleStartTest = async (test) => {
    try { sound?.click?.(); } catch (_) {}
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      else alert('Please sign in to attempt this test.');
      return;
    }
    try {
      const res = await api.scheduledTests.start(test.id);
      if (res && onStartTest) {
        onStartTest(res.room || res.room_code);
      }
    } catch (err) {
      alert(err.message || 'Failed to start scheduled test.');
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.title.trim()) {
      alert('Please enter a test title.');
      return;
    }
    if (syllabusScope === 'CUSTOM' && selectedChapters.length === 0) {
      alert('Please select at least one chapter for custom syllabus or switch to Full Syllabus.');
      return;
    }
    setCreating(true);
    try {
      const effSubjects = syllabusScope === 'CUSTOM'
        ? (activeCustomSubjects.length > 0 ? activeCustomSubjects : selectedSubjects)
        : selectedSubjects;
      const effChapters = syllabusScope === 'CUSTOM' ? selectedChapters : [];

      const payload = {
        ...createForm,
        subjects: effSubjects,
        chapters: effChapters,
        scheduled_start_time: new Date(createForm.scheduled_start_time).toISOString(),
        deadline_time: new Date(createForm.deadline_time).toISOString(),
      };
      await api.scheduledTests.create(payload);
      try { sound?.play?.('correct') || sound?.click?.(); } catch (_) {}
      setShowCreateModal(false);
      setSelectedChapters([]);
      setSyllabusScope('FULL');
      fetchCatalog();
      alert('Scheduled test successfully generated and assigned!');
    } catch (err) {
      alert('Error creating test: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  // Filtered tests based on tab and search
  const displayedTests = useMemo(() => {
    let list = catalog.all || [];
    if (activeTab === 'ACTIVE') list = catalog.active || [];
    else if (activeTab === 'UPCOMING') list = catalog.upcoming || [];
    else if (activeTab === 'PENDING') list = catalog.pending || [];
    else if (activeTab === 'COMPLETED') list = catalog.completed || [];

    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase().trim();
    return list.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description && t.description.toLowerCase().includes(q)) ||
        t.exam_type.toLowerCase().includes(q)
    );
  }, [catalog, activeTab, searchQuery]);

  // Format countdown string for upcoming test
  const getCountdownString = (isoStart) => {
    const diff = new Date(isoStart).getTime() - Date.now();
    if (diff <= 0) return 'Unlocking now';
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const days = Math.floor(hours / 24);
    if (days > 0) {
      return `${days}d ${hours % 24}h remaining`;
    }
    return `${hours}h ${mins}m remaining`;
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      {/* Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 p-6 rounded-2xl border border-indigo-500/30 shadow-2xl relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div>
          <div className="flex items-center gap-2.5 mb-2">
            <span className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <FileText className="w-6 h-6" />
            </span>
            <h1 className="text-2xl md:text-3xl font-black text-white tracking-tight flex items-center gap-2">
              Scheduled Tests & Contests
              <span className="text-xs uppercase px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-bold">
                CBT Arena
              </span>
            </h1>
          </div>
          <p className="text-sm text-slate-400 max-w-xl">
            Pre-generated mock examinations with synchronized cohorts, strict primary deadlines, and All-India Two-Tier Standings.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchCatalog}
            disabled={loading}
            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 hover:border-slate-600 transition flex items-center gap-2 text-xs font-bold"
            title="Refresh Tests"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          <button
            onClick={openCreateModal}
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 hover:scale-105 active:scale-95 transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Create Scheduled Test
          </button>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900/90 border border-slate-800 rounded-xl overflow-x-auto max-w-full">
          {[
            { id: 'ALL', label: `All (${catalog.all?.length || 0})` },
            { id: 'ACTIVE', label: `⚡ Active Now (${catalog.active?.length || 0})` },
            { id: 'UPCOMING', label: `⏳ Upcoming (${catalog.upcoming?.length || 0})` },
            {
              id: 'PENDING',
              label: `⚠️ Pending (${catalog.pending?.length || 0})`,
              badge: (catalog.pending?.length || 0) > 0,
            },
            { id: 'COMPLETED', label: `✅ Completed (${catalog.completed?.length || 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                try { sound?.click?.(); } catch (_) {}
                setActiveTab(tab.id);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 cursor-pointer btn-tactile ${
                activeTab === tab.id
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {tab.label}
              {tab.badge && (
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping inline-block" />
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search test name..."
            className="w-full bg-slate-900/80 border border-slate-800 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
          />
        </div>
      </div>

      {/* Tests Catalog Grid */}
      {loading ? (
        <div className="text-center py-20 text-slate-500 space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-400" />
          <p className="text-sm font-semibold">Loading examination schedule...</p>
        </div>
      ) : displayedTests.length === 0 ? (
        <div className="text-center py-20 bg-slate-900/40 rounded-2xl border border-slate-800/80 p-8 space-y-3">
          <FileText className="w-12 h-12 text-slate-600 mx-auto" />
          <h3 className="text-base font-bold text-slate-300">No examinations found in this category</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {activeTab === 'PENDING'
              ? 'You have cleared all pending tests assigned to your account!'
              : activeTab === 'UPCOMING'
              ? 'No upcoming scheduled examinations right now. Check back soon or create one!'
              : 'Try switching filters or search terms above.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {displayedTests.map((test) => {
            const isCompleted = test.is_completed;
            const isUpcoming = test.is_upcoming;
            const isLateAttempt = test.is_past_deadline && !isCompleted;
            const isActiveWindow = test.is_active_window && !isCompleted;
            const isCreator = user && String(test.created_by_user_id) === String(user.id);

            return (
              <ConicBorder
                key={test.id}
                active={isActiveWindow}
                color="cyan"
                speed="5s"
                rounded="rounded-2xl"
                className="card-hover-lift h-full"
                innerClassName="bg-slate-900/90 rounded-2xl border border-slate-800 hover:border-slate-700 p-5 shadow-xl transition-all duration-200 flex flex-col justify-between relative overflow-hidden group h-full"
              >
                {/* Status Indicator Bar */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1.5 ${
                    isCompleted
                      ? 'bg-emerald-500'
                      : isUpcoming
                      ? 'bg-indigo-500'
                      : isActiveWindow
                      ? 'bg-cyan-400 animate-pulse'
                      : 'bg-amber-500'
                  }`}
                />

                <div>
                  {/* Top Badges */}
                  <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider ${
                          test.exam_type === 'ADVANCED'
                            ? 'bg-purple-950/80 text-purple-300 border border-purple-800/60'
                            : 'bg-blue-950/80 text-blue-300 border border-blue-800/60'
                        }`}
                      >
                        JEE {test.exam_type}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 flex items-center gap-1">
                        <Shield className="w-2.5 h-2.5 text-indigo-400" />
                        {test.exam_type === 'ADVANCED' ? 'Strict IIT Standard' : 'Strict NTA Standard'}
                      </span>
                      {test.is_assigned && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-950/80 text-emerald-300 border border-emerald-800/60 flex items-center gap-1">
                          🎯 Assigned to You
                        </span>
                      )}
                    </div>

                    {/* Status Pill */}
                    <div>
                      {isCompleted ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Done ({test.user_attempt?.marks}/{test.total_marks} Marks)
                        </span>
                      ) : isUpcoming ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getCountdownString(test.scheduled_start_time)}
                        </span>
                      ) : isActiveWindow ? (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-500/20 text-blue-300 border border-blue-500/40 flex items-center gap-1 animate-pulse">
                          ⚡ Live Now
                        </span>
                      ) : (
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          Late Window
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & Description */}
                  <h3 className="text-base font-black text-white group-hover:text-indigo-300 transition-colors line-clamp-1 mb-1">
                    {test.title}
                  </h3>
                  {test.description && (
                    <p className="text-xs text-slate-400 line-clamp-2 mb-2">{test.description}</p>
                  )}

                  {/* Syllabus / Chapters Scope Badge */}
                  <div className="mb-2.5">
                    {test.chapters && test.chapters.length > 0 ? (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-purple-950/70 border border-purple-500/40 text-purple-300 text-[10px] font-medium max-w-full">
                        <Filter className="w-3 h-3 text-purple-400 shrink-0" />
                        <span className="font-bold shrink-0">{test.chapters.length} Ch Custom:</span>
                        <span className="truncate text-slate-300">
                          {test.chapters.slice(0, 2).join(', ')}{test.chapters.length > 2 ? ` +${test.chapters.length - 2} more` : ''}
                        </span>
                      </div>
                    ) : (
                      <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-400 text-[10px] font-medium">
                        <BookOpen className="w-3 h-3 text-indigo-400 shrink-0" />
                        <span>Full Syllabus ({(test.subjects || []).join(' + ')})</span>
                      </div>
                    )}
                  </div>

                  {/* Meta Strip */}
                  <div className="grid grid-cols-4 gap-2 bg-slate-950/60 rounded-xl p-2.5 border border-slate-800/80 text-center my-3">
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Duration</div>
                      <div className="text-xs font-black text-slate-200">{test.duration_minutes}m</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Questions</div>
                      <div className="text-xs font-black text-slate-200">{test.total_questions}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Marks</div>
                      <div className="text-xs font-black text-slate-200">{test.total_marks}</div>
                    </div>
                    <div>
                      <div className="text-[10px] text-slate-500 uppercase font-bold">Cohort</div>
                      <div className="text-xs font-black text-slate-200">{test.participants_count}</div>
                    </div>
                  </div>

                  {/* Schedule Details */}
                  <div className="text-[11px] text-slate-400 space-y-1 my-3 bg-slate-900/60 p-2.5 rounded-xl border border-slate-800/50">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" /> Available From:
                      </span>
                      <span className="font-semibold text-slate-300">
                        {formatIST(test.scheduled_start_time)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500 flex items-center gap-1">
                        <Clock className="w-3 h-3" /> Deadline:
                      </span>
                      <span className="font-semibold text-slate-300">
                        {formatIST(test.deadline_time)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openLeaderboard(test.id)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trophy className="w-3.5 h-3.5 text-amber-400" />
                      Standings ({test.participants_count})
                    </button>

                    {/* Unschedule (Creator before release) or Delete / Remove (Account) */}
                    {isCreator && isUpcoming ? (
                      <button
                        onClick={() => setDeleteConfirmTest(test)}
                        title="Unschedule and permanently cancel this test before it releases"
                        className="px-2.5 py-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 hover:text-rose-200 border border-rose-500/30 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                        <span className="hidden sm:inline">Unschedule</span>
                      </button>
                    ) : (isCreator || isCompleted) ? (
                      <button
                        onClick={() => setDeleteConfirmTest(test)}
                        title="Remove this test from your account records"
                        className="p-1.5 rounded-xl bg-slate-800/60 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-700/60 hover:border-rose-500/30 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    ) : null}
                  </div>

                  <div>
                    {isCompleted ? (
                      <button
                        onClick={() => {
                          if (onSelectTest) onSelectTest(test.room_code);
                        }}
                        className="px-4 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-xs font-bold transition flex items-center gap-1.5 shadow-md cursor-pointer"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        Solutions & Review
                      </button>
                    ) : isUpcoming ? (
                      <button
                        disabled
                        className="px-4 py-1.5 rounded-xl bg-slate-800/60 text-slate-500 text-xs font-bold cursor-not-allowed flex items-center gap-1.5"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        Locked
                      </button>
                    ) : isLateAttempt ? (
                      <button
                        onClick={() => handleStartTest(test)}
                        className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-amber-600/20 cursor-pointer"
                      >
                        <Hourglass className="w-3.5 h-3.5" />
                        Start Late Attempt
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartTest(test)}
                        className="px-4 py-1.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 btn-tactile hover:scale-105 cursor-pointer glow-emerald"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Start Exam Now
                      </button>
                    )}
                  </div>
                </div>
              </ConicBorder>
            );
          })}
        </div>
      )}

      {/* TWO-TIER LEADERBOARD MODAL (PORTAL TO DOCUMENT.BODY) */}
      {leaderboardModalTestId && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  {leaderboardData?.test?.title || 'Contest Standings'}
                </h3>
                <div className="text-xs text-slate-400 mt-0.5">
                  Deadline: {leaderboardData?.test?.deadline_time ? formatIST(leaderboardData.test.deadline_time) : 'N/A'}
                </div>
              </div>
              <button
                onClick={() => setLeaderboardModalTestId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tier Switcher Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/60 p-1">
              <button
                onClick={() => setLbActiveTier('OFFICIAL')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                  lbActiveTier === 'OFFICIAL'
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Award className="w-4 h-4 text-amber-400" />
                🏆 Official Standings ({leaderboardData?.total_official || 0})
              </button>
              <button
                onClick={() => setLbActiveTier('LATE')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 cursor-pointer ${
                  lbActiveTier === 'LATE'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Hourglass className="w-4 h-4 text-amber-300" />
                ⏱️ Late Attempts ({leaderboardData?.total_late || 0})
              </button>
            </div>

            {/* Standings List */}
            <div className="p-5 overflow-y-auto flex-1 space-y-2">
              {loadingLeaderboard ? (
                <div className="text-center py-12 text-slate-500">
                  <RefreshCw className="w-6 h-6 animate-spin mx-auto text-indigo-400 mb-2" />
                  Loading standings table...
                </div>
              ) : lbActiveTier === 'OFFICIAL' ? (
                leaderboardData?.official_standings?.length === 0 ? (
                  <div className="text-center py-12 text-slate-500 text-xs">
                    No official on-time submissions recorded yet.
                  </div>
                ) : (
                  leaderboardData?.official_standings?.map((st) => (
                    <div
                      key={st.user_id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 hover:border-slate-600 transition"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black ${
                            st.rank === 1
                              ? 'bg-amber-500 text-black'
                              : st.rank === 2
                              ? 'bg-slate-300 text-black'
                              : st.rank === 3
                              ? 'bg-amber-700 text-white'
                              : 'bg-slate-700 text-slate-300'
                          }`}
                        >
                          {st.rank}
                        </span>
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-1.5">
                            {st.username}
                            {st.username === user?.username && (
                              <span className="text-[10px] px-1.5 py-0.2 rounded bg-indigo-500/20 text-indigo-300 font-bold">
                                You
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {st.current_division} · {st.accuracy}% Accuracy ({st.correct_count}/{st.attempted_count})
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-black text-emerald-400">
                          {st.marks} Marks
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {formatIST(st.finished_at)}
                        </div>
                      </div>
                    </div>
                  ))
                )
              ) : leaderboardData?.late_standings?.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  No post-deadline late attempts recorded.
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="p-3 bg-amber-950/40 border border-amber-800/60 rounded-xl text-xs text-amber-300">
                    ℹ️ These attempts were submitted after the official deadline. They are recorded for practice and self-evaluation.
                  </div>
                  {leaderboardData?.late_standings?.map((st) => (
                    <div
                      key={st.user_id}
                      className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/40 hover:border-slate-600 transition"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-7 h-7 rounded-lg bg-amber-950/80 text-amber-400 border border-amber-800/60 flex items-center justify-center text-xs font-black">
                          {st.rank}
                        </span>
                        <div>
                          <div className="text-sm font-bold text-white flex items-center gap-1.5">
                            {st.username}
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold uppercase">
                              Late
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {st.accuracy}% Accuracy · {st.correct_count}/{st.attempted_count} Correct
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-sm font-black text-amber-400">
                          {st.marks} Marks
                        </div>
                        <div className="text-[10px] text-slate-500">
                          {formatIST(st.finished_at)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* UNSCHEDULE & DELETE CONFIRMATION MODAL */}
      {deleteConfirmTest && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="w-12 h-12 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center">
              <h3 className="text-lg font-black text-white mb-1">
                {user && String(deleteConfirmTest.created_by_user_id) === String(user.id) && deleteConfirmTest.is_upcoming
                  ? 'Unschedule & Cancel Test?'
                  : 'Remove Test from Account?'}
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                {user && String(deleteConfirmTest.created_by_user_id) === String(user.id) && deleteConfirmTest.is_upcoming
                  ? `Are you sure you want to unschedule "${deleteConfirmTest.title}" before it releases? This will cancel the test and remove it for all aspirants.`
                  : `Are you sure you want to remove "${deleteConfirmTest.title}"? It will be removed from your Tests catalog and Test History for this account.`}
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
              <button
                type="button"
                disabled={Boolean(deletingTestId)}
                onClick={() => setDeleteConfirmTest(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-300 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(deletingTestId)}
                onClick={() => handleDeleteOrUnscheduleTest(deleteConfirmTest)}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-xs font-black text-white transition flex items-center gap-1.5 shadow-lg shadow-rose-600/30 cursor-pointer disabled:opacity-50"
              >
                {deletingTestId ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
                <span>
                  {user && String(deleteConfirmTest.created_by_user_id) === String(user.id) && deleteConfirmTest.is_upcoming
                    ? 'Unschedule & Delete'
                    : 'Remove Test'}
                </span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* CREATE SCHEDULED TEST MODAL (PORTAL TO DOCUMENT.BODY) */}
      {showCreateModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Plus className="w-5 h-5 text-indigo-400" />
                  Create Scheduled Examination
                </h3>
                <p className="text-xs text-slate-400">Pre-generate paper and assign to target cohort</p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleCreateSubmit} className="p-5 overflow-y-auto flex-1 space-y-4">
              {/* Title & Description */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">
                  Examination Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createForm.title}
                  onChange={(e) => setCreateForm({ ...createForm, title: e.target.value })}
                  placeholder="e.g. All India Minor Test 01 - Mechanics & Calculus"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">Description / Notes</label>
                <textarea
                  value={createForm.description}
                  onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                  placeholder="e.g. Focus on Rotational Motion, Functions, and Thermodynamics"
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition"
                />
              </div>

              {/* Format, Difficulty, Duration, Questions */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Format</label>
                  <select
                    value={createForm.exam_type}
                    onChange={(e) => setCreateForm({ ...createForm, exam_type: e.target.value, difficulty: 'STRICT' })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="MAIN">JEE Main</option>
                    <option value="ADVANCED">JEE Advanced</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Standard Calibration</label>
                  <div className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-indigo-300 font-bold flex items-center gap-1.5 select-none" title="Strict NTA/IIT examination difficulty calibration">
                    <Shield className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                    <span className="truncate">
                      {createForm.exam_type === 'ADVANCED' ? 'Strict IIT Standard' : 'Strict NTA Standard'}
                    </span>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Duration</label>
                  <select
                    value={createForm.duration_minutes}
                    onChange={(e) => setCreateForm({ ...createForm, duration_minutes: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value={30}>30 mins</option>
                    <option value={60}>60 mins</option>
                    <option value={90}>90 mins</option>
                    <option value={180}>180 mins</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Questions</label>
                  <select
                    value={createForm.total_questions}
                    onChange={(e) => setCreateForm({ ...createForm, total_questions: parseInt(e.target.value) })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value={15}>15 Questions</option>
                    <option value={25}>25 Questions</option>
                    <option value={30}>30 Questions</option>
                    <option value={75}>75 Questions</option>
                  </select>
                </div>
              </div>

              {/* Syllabus Scope & Custom Chapters Section */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="text-xs font-bold text-white flex items-center gap-1.5">
                      <BookOpen className="w-4 h-4 text-indigo-400" /> Syllabus Scope & Target Chapters
                    </label>
                    <p className="text-[10px] text-slate-400">
                      Choose full syllabus or cherry-pick custom chapters for part-syllabus minor tests
                    </p>
                  </div>
                  <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded-lg border border-slate-800 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => {
                        try { sound?.click?.(); } catch (_) {}
                        setSyllabusScope('FULL');
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        syllabusScope === 'FULL'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Layers className="w-3 h-3" /> Full Syllabus
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        try { sound?.click?.(); } catch (_) {}
                        setSyllabusScope('CUSTOM');
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer flex items-center gap-1 ${
                        syllabusScope === 'CUSTOM'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      <Filter className="w-3 h-3" /> Custom Chapters {selectedChapters.length > 0 && `(${selectedChapters.length})`}
                    </button>
                  </div>
                </div>

                {syllabusScope === 'FULL' ? (
                  /* Full Syllabus: Subject Toggles */
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-slate-400 font-medium">Included Subjects:</div>
                    <div className="grid grid-cols-3 gap-2">
                      {CANONICAL_SUBJECTS.map((name) => {
                        const isSelected = selectedSubjects.includes(name);
                        return (
                          <button
                            key={name}
                            type="button"
                            onClick={() => toggleSubject(name)}
                            className={`p-2.5 rounded-xl border text-center transition cursor-pointer ${
                              isSelected
                                ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-sm'
                                : 'border-slate-800 bg-slate-900/60 text-slate-500 hover:border-slate-700'
                            }`}
                          >
                            <span className="font-black text-xs block">{name}</span>
                            <span className="text-[9px] text-slate-400 mt-0.5 block font-mono">
                              {isSelected ? '✓ Included' : '+ Excluded'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* Custom Chapters: Subject Tabs, Search & Chapter Checkboxes */
                  <div className="space-y-3 pt-1">
                    {/* Subject Tabs */}
                    <div className="flex items-center gap-1.5 border-b border-slate-800 pb-2 overflow-x-auto">
                      {CANONICAL_SUBJECTS.map((subj) => {
                        const isActive = activeSubjectTab === subj;
                        const chList = chaptersMap[subj] || [];
                        const selCount = chList.filter((c) => selectedChapters.includes(c.chapter)).length;
                        return (
                          <button
                            key={subj}
                            type="button"
                            onClick={() => {
                              try { sound?.click?.(); } catch (_) {}
                              setActiveSubjectTab(subj);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 shrink-0 cursor-pointer border ${
                              isActive
                                ? 'bg-indigo-600 text-white border-indigo-500 shadow-sm'
                                : 'bg-slate-900 text-slate-300 border-slate-800 hover:border-slate-700'
                            }`}
                          >
                            <span>{subj}</span>
                            <span className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                              isActive ? 'bg-indigo-950 text-indigo-200' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {selCount > 0 ? `${selCount}/${chList.length}` : `${chList.length}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Search & Bulk Select Controls */}
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
                      <div className="relative flex-1">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2" />
                        <input
                          type="text"
                          placeholder={`Search ${activeSubjectTab} chapters (e.g. Kinematics, Equilibrium)...`}
                          value={chapterSearch}
                          onChange={(e) => setChapterSearch(e.target.value)}
                          className="w-full pl-8 pr-7 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                        />
                        {chapterSearch && (
                          <button
                            type="button"
                            onClick={() => setChapterSearch('')}
                            className="absolute right-2 top-1.5 text-slate-400 hover:text-white"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleSelectAllInSubject(activeSubjectTab)}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-bold text-slate-300 hover:text-white rounded-lg transition cursor-pointer"
                        >
                          Select All {activeSubjectTab}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClearAllInSubject(activeSubjectTab)}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-bold text-slate-400 hover:text-red-300 rounded-lg transition cursor-pointer"
                        >
                          Clear
                        </button>
                      </div>
                    </div>

                    {/* Categorized Chapters Grid */}
                    <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                      {loadingChapters ? (
                        <div className="py-6 text-center text-xs text-slate-500">Loading syllabus chapters...</div>
                      ) : Object.keys(unitsInActiveSubject).length === 0 ? (
                        <div className="py-6 text-center text-xs text-slate-500 font-mono">
                          No chapters matching "{chapterSearch}" in {activeSubjectTab}.
                        </div>
                      ) : (
                        Object.entries(unitsInActiveSubject).map(([unitName, chList]) => {
                          const allUnitSelected = chList.every((c) => selectedChapters.includes(c.chapter));
                          return (
                            <div key={unitName} className="bg-slate-900/70 border border-slate-800/80 rounded-xl p-2.5">
                              {/* Unit Header */}
                              <div className="flex items-center justify-between pb-1.5 mb-1.5 border-b border-slate-800/60">
                                <div className="flex items-center gap-1.5">
                                  <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                                  <span className="text-[11px] font-bold text-slate-200 uppercase tracking-wider">{unitName}</span>
                                  <span className="text-[10px] text-slate-500 font-mono">({chList.length})</span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleSelectAllInUnit(chList)}
                                  className="text-[10px] text-indigo-400 hover:underline font-bold cursor-pointer"
                                >
                                  {allUnitSelected ? 'Deselect Unit' : 'Select Unit'}
                                </button>
                              </div>

                              {/* Chapters Grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                                {chList.map((ch) => {
                                  const isSelected = selectedChapters.includes(ch.chapter);
                                  return (
                                    <button
                                      key={ch.chapter}
                                      type="button"
                                      onClick={() => toggleChapter(ch.chapter)}
                                      className={`p-2 rounded-lg border text-left transition cursor-pointer flex items-center justify-between gap-1.5 ${
                                        isSelected
                                          ? 'border-indigo-500 bg-indigo-950/40 text-white shadow-sm'
                                          : 'border-slate-800/60 bg-slate-950/60 text-slate-300 hover:border-slate-700'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5 overflow-hidden flex-1 min-w-0">
                                        <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 transition ${
                                          isSelected
                                            ? 'bg-indigo-600 border-indigo-600 text-white'
                                            : 'border-slate-700 bg-slate-900'
                                        }`}>
                                          {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                                        </div>
                                        <span className="text-[11px] font-medium truncate">{ch.chapter}</span>
                                      </div>
                                      <span className="text-[9px] font-mono text-slate-500 px-1 py-0.2 rounded bg-black/30 shrink-0">
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
                    <div className="pt-2 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span className="font-bold text-white text-[11px]">
                          {selectedChapters.length === 0
                            ? 'No chapters selected yet (click above to add)'
                            : `${selectedChapters.length} Chapter${selectedChapters.length > 1 ? 's' : ''} Selected (${activeCustomSubjects.join(', ')})`}
                        </span>
                        {selectedChapters.length > 0 && totalAvailableInSelected > 0 && (
                          <span className="text-[10px] font-mono text-indigo-400">
                            • {totalAvailableInSelected} Qs in bank
                          </span>
                        )}
                      </div>

                      {selectedChapters.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearAllChapters}
                          className="text-[11px] text-red-400 hover:text-red-300 font-bold transition cursor-pointer self-start sm:self-auto"
                        >
                          Clear All ({selectedChapters.length})
                        </button>
                      )}
                    </div>

                    {/* Selected Tag Cloud */}
                    {selectedChapters.length > 0 && (
                      <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pt-1">
                        {selectedChapters.map((chName) => (
                          <span
                            key={chName}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-950/60 border border-indigo-500/40 text-indigo-300 text-[10px] font-medium"
                          >
                            <span className="truncate max-w-[160px]">{chName}</span>
                            <button
                              type="button"
                              onClick={() => toggleChapter(chName)}
                              className="hover:text-white"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Scheduled Start & Deadline */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/60 p-3 rounded-xl border border-slate-800/80">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Start Date & Time
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={createForm.scheduled_start_time}
                    onChange={(e) => setCreateForm({ ...createForm, scheduled_start_time: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <div className="text-[10px] text-slate-500 mt-1">Test will unlock for students at this time</div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" /> Primary Deadline
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={createForm.deadline_time}
                    onChange={(e) => setCreateForm({ ...createForm, deadline_time: e.target.value })}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  />
                  <div className="text-[10px] text-slate-500 mt-1">Submissions after this are marked Late</div>
                </div>
              </div>

              {/* Target Students Picker */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-400" /> Target Aspirants Assignment
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      if (createForm.assigned_user_ids.includes('*')) {
                        setCreateForm({ ...createForm, assigned_user_ids: [] });
                      } else {
                        setCreateForm({ ...createForm, assigned_user_ids: ['*'] });
                      }
                    }}
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold cursor-pointer"
                  >
                    {createForm.assigned_user_ids.includes('*') ? 'Unselect All (Custom)' : 'Select All Registered'}
                  </button>
                </div>

                {createForm.assigned_user_ids.includes('*') ? (
                  <div className="p-3 bg-indigo-950/30 border border-indigo-800/40 rounded-xl text-xs text-indigo-300 flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    Open to all registered aspirants across all divisions.
                  </div>
                ) : (
                  <div className="max-h-36 overflow-y-auto bg-slate-950 border border-slate-800 rounded-xl p-2 space-y-1.5">
                    {loadingAspirants ? (
                      <div className="text-xs text-slate-500 text-center py-4">Loading aspirants list...</div>
                    ) : aspirantsList.length === 0 ? (
                      <div className="text-xs text-slate-500 text-center py-4">No aspirants found.</div>
                    ) : (
                      aspirantsList.map((asp) => {
                        const isSelected = createForm.assigned_user_ids.includes(asp.id);
                        return (
                          <div
                            key={asp.id}
                            onClick={() => {
                              const curr = createForm.assigned_user_ids.filter((id) => id !== '*');
                              if (isSelected) {
                                setCreateForm({ ...createForm, assigned_user_ids: curr.filter((id) => id !== asp.id) });
                              } else {
                                setCreateForm({ ...createForm, assigned_user_ids: [...curr, asp.id] });
                              }
                            }}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-xs transition ${
                              isSelected
                                ? 'bg-indigo-600/20 border border-indigo-500/40 text-white'
                                : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span className="font-bold">{asp.username}</span>
                            <span className="text-[10px] text-slate-500">Elo {Math.round(asp.overall_elo || 1500)}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>

              {/* Submit CTA */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={creating}
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 cursor-pointer"
                >
                  {creating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Sampling Questions & Scheduling...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Generate Paper & Schedule Contest
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
