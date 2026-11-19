import React, { useState, useEffect, useMemo } from 'react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import { formatIST, formatISTDate } from '../utils/dateUtils';
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
  Hourglass
} from 'lucide-react';

export default function TestsView({ user, onStartTest, onSelectTest, onOpenAuth }) {
  const [catalog, setCatalog] = useState({ all: [], upcoming: [], active: [], pending: [], completed: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('ALL'); // 'ALL', 'ACTIVE', 'UPCOMING', 'PENDING', 'COMPLETED'
  const [searchQuery, setSearchQuery] = useState('');

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
  const [createForm, setCreateForm] = useState({
    title: '',
    description: '',
    exam_type: 'MAIN',
    difficulty: 'BALANCED',
    duration_minutes: 60,
    total_questions: 25,
    subjects: ['Physics', 'Chemistry', 'Mathematics'],
    scheduled_start_time: '',
    deadline_time: '',
    assigned_user_ids: ['*'], // '*' means all
  });

  // Calculate default dates for create form
  useEffect(() => {
    const now = new Date();
    // Start tomorrow at 09:00 AM local
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    tomorrow.setHours(9, 0, 0, 0);

    // Deadline 48 hours after start
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
  }, [user?.id]);

  const openLeaderboard = async (testId) => {
    setLeaderboardModalTestId(testId);
    setLoadingLeaderboard(true);
    setLbActiveTier('OFFICIAL');
    try {
      sound.play('click');
      const data = await api.scheduledTests.getLeaderboard(testId);
      setLeaderboardData(data);
    } catch (err) {
      alert('Could not load leaderboard: ' + err.message);
      setLeaderboardModalTestId(null);
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const openCreateModal = async () => {
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }
    sound.play('click');
    setShowCreateModal(true);
    setLoadingAspirants(true);
    try {
      const list = await api.scheduledTests.getAspirants();
      setAspirantsList(list || []);
    } catch (err) {
      console.warn('Failed to load aspirants roster:', err);
    } finally {
      setLoadingAspirants(false);
    }
  };

  const handleStartTest = async (test) => {
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }
    sound.play('confirm');
    try {
      const res = await api.scheduledTests.start(test.id);
      if (res && res.room_code && onStartTest) {
        onStartTest(res.room_code);
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
    setCreating(true);
    try {
      const payload = {
        ...createForm,
        scheduled_start_time: new Date(createForm.scheduled_start_time).toISOString(),
        deadline_time: new Date(createForm.deadline_time).toISOString(),
      };
      await api.scheduledTests.create(payload);
      sound.play('levelUp');
      setShowCreateModal(false);
      fetchCatalog();
    } catch (err) {
      alert('Error creating test: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  // Filtered tests based on tab and search
  const displayedTests = useMemo(() => {
    let list = catalog.all;
    if (activeTab === 'ACTIVE') list = catalog.active;
    else if (activeTab === 'UPCOMING') list = catalog.upcoming;
    else if (activeTab === 'PENDING') list = catalog.pending;
    else if (activeTab === 'COMPLETED') list = catalog.completed;

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
            className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-indigo-600/30 hover:scale-105 active:scale-95 transition"
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
            { id: 'ALL', label: `All (${catalog.all.length})` },
            { id: 'ACTIVE', label: `⚡ Active Now (${catalog.active.length})` },
            { id: 'UPCOMING', label: `⏳ Upcoming (${catalog.upcoming.length})` },
            {
              id: 'PENDING',
              label: `⚠️ Pending (${catalog.pending.length})`,
              badge: catalog.pending.length > 0,
            },
            { id: 'COMPLETED', label: `✅ Completed (${catalog.completed.length})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                sound.play('click');
                setActiveTab(tab.id);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition flex items-center gap-1.5 ${
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

            return (
              <div
                key={test.id}
                className="bg-slate-900/90 rounded-2xl border border-slate-800 hover:border-slate-700 p-5 shadow-xl transition-all duration-200 flex flex-col justify-between relative overflow-hidden group hover:shadow-2xl"
              >
                {/* Status Indicator Bar */}
                <div
                  className={`absolute top-0 left-0 right-0 h-1 ${
                    isCompleted
                      ? 'bg-emerald-500'
                      : isUpcoming
                      ? 'bg-indigo-500'
                      : isActiveWindow
                      ? 'bg-blue-500 animate-pulse'
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
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                        {test.difficulty}
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
                    <p className="text-xs text-slate-400 line-clamp-2 mb-3">{test.description}</p>
                  )}

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
                  <button
                    onClick={() => openLeaderboard(test.id)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition flex items-center gap-1.5"
                  >
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    Standings ({test.participants_count})
                  </button>

                  <div>
                    {isCompleted ? (
                      <button
                        onClick={() => {
                          if (onSelectTest) onSelectTest(test.room_code);
                        }}
                        className="px-4 py-1.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/40 text-xs font-bold transition flex items-center gap-1.5 shadow-md"
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
                        className="px-4 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-md shadow-amber-600/20"
                      >
                        <Hourglass className="w-3.5 h-3.5" />
                        Start Late Attempt
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartTest(test)}
                        className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 hover:scale-105 active:scale-95"
                      >
                        <ArrowRight className="w-3.5 h-3.5" />
                        Start Exam Now
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* TWO-TIER LEADERBOARD MODAL */}
      {leaderboardModalTestId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
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
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Sub-tier Switcher Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/60 p-1">
              <button
                onClick={() => setLbActiveTier('OFFICIAL')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 ${
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
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-2 ${
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
        </div>
      )}

      {/* CREATE SCHEDULED TEST MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
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
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
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
                    onChange={(e) => setCreateForm({ ...createForm, exam_type: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="MAIN">JEE Main</option>
                    <option value="ADVANCED">JEE Advanced</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Difficulty</label>
                  <select
                    value={createForm.difficulty}
                    onChange={(e) => setCreateForm({ ...createForm, difficulty: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-2.5 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="BALANCED">Balanced</option>
                    <option value="EASY">Easy</option>
                    <option value="HARD">Hard</option>
                    <option value="TITAN">Titan</option>
                  </select>
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
                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-bold"
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
                  className="w-full py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-black text-xs flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/30 transition disabled:opacity-50"
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
        </div>
      )}
    </div>
  );
}
