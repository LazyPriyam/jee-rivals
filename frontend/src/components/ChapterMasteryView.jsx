import React, { useState, useEffect } from 'react';
import {
  Skull,
  Crosshair,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Award,
  Sparkles,
  BookOpen,
  CheckCircle2,
  Bookmark,
  BookmarkCheck,
  RefreshCw,
  Search,
  Filter,
  Flame,
  Swords,
  ChevronDown,
  ChevronUp,
  FileText,
  Lightbulb,
  Trash2,
  ArrowRight,
  ShieldAlert,
  Zap,
  Target,
  Clock
} from 'lucide-react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import MathRenderer from './MathRenderer';
import OnDemandDerivationBox from './OnDemandDerivationBox';

const TIER_COLORS = {
  MASTERED: {
    bg: 'bg-emerald-950/50',
    border: 'border-emerald-500/40',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    label: 'Mastered (1800+)'
  },
  PROFICIENT: {
    bg: 'bg-blue-950/50',
    border: 'border-blue-500/40',
    text: 'text-blue-400',
    badge: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    label: 'Proficient (1500-1799)'
  },
  EMERGING: {
    bg: 'bg-amber-950/50',
    border: 'border-amber-500/40',
    text: 'text-amber-400',
    badge: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    label: 'Emerging (1300-1499)'
  },
  CRITICAL: {
    bg: 'bg-red-950/50',
    border: 'border-red-500/40',
    text: 'text-red-400',
    badge: 'bg-red-500/20 text-red-300 border-red-500/40',
    label: 'Critical (<1300)'
  }
};

const RISK_BADGES = {
  CRITICAL: 'bg-red-950/80 text-red-300 border-red-500/50 ring-1 ring-red-500/30',
  HIGH: 'bg-amber-950/80 text-amber-300 border-amber-500/50',
  MODERATE: 'bg-blue-950/80 text-blue-300 border-blue-500/50',
  LOW: 'bg-slate-800 text-slate-300 border-slate-700'
};

export default function ChapterMasteryView({
  user,
  onOpenAuth,
  onNavigateTab,
  onStartPreset,
  onJoinRoomCode,
  onUpdateUser,
  isActive
}) {
  const [activeTab, setActiveTab] = useState('chapters'); // 'chapters', 'radar', 'graveyard'

  // Data states
  const [chaptersData, setChaptersData] = useState(null);
  const [radarData, setRadarData] = useState(null);
  const [graveyardData, setGraveyardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Filters for Chapters Tab
  const [subjectFilter, setSubjectFilter] = useState('ALL');
  const [tierFilter, setTierFilter] = useState('ALL');
  const [weightageFilter, setWeightageFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('DEFAULT'); // 'DEFAULT', 'ACCURACY_ASC', 'ACCURACY_DESC', 'SPEED_SLOW', 'SPEED_FAST'

  // Graveyard state
  const [graveyardFilter, setGraveyardFilter] = useState('ALL'); // 'ALL' or 'BOOKMARKED'
  const [expandedSolutions, setExpandedSolutions] = useState({});
  const [editingNotesId, setEditingNotesId] = useState(null);
  const [tempNotes, setTempNotes] = useState('');
  const [launchingRevenge, setLaunchingRevenge] = useState(false);

  const fetchData = async () => {
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const [chaps, rad, grave] = await Promise.all([
        api.mastery.getChapters(),
        api.mastery.getRadar(),
        api.mastery.getGraveyard()
      ]);
      setChaptersData(chaps);
      setRadarData(rad);
      setGraveyardData(grave);
    } catch (err) {
      setError(err.message || 'Failed to load mastery telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && isActive) {
      fetchData();
    }
  }, [user?.id, user?.total_solved, user?.overall_elo, isActive]);

  // Global dynamic synchronization listener
  useEffect(() => {
    const handleDynamicSync = () => {
      if (user && isActive) {
        fetchData();
      }
    };
    window.addEventListener('jee_user_updated', handleDynamicSync);
    return () => window.removeEventListener('jee_user_updated', handleDynamicSync);
  }, [user?.id, isActive]);

  const handleToggleBookmark = async (qId, currentNotes = '') => {
    try {
      sound.click();
      await api.mastery.toggleBookmark(qId, currentNotes);
      const updatedGrave = await api.mastery.getGraveyard();
      setGraveyardData(updatedGrave);
    } catch (_) {}
  };

  const handleSaveNotes = async (qId) => {
    try {
      sound.click();
      await api.mastery.toggleBookmark(qId, tempNotes);
      setEditingNotesId(null);
      const updatedGrave = await api.mastery.getGraveyard();
      setGraveyardData(updatedGrave);
    } catch (_) {}
  };

  const handleRemoveFromGraveyard = async (qId) => {
    try {
      sound.click();
      await api.mastery.removeFromGraveyard(qId);
      const updatedGrave = await api.mastery.getGraveyard();
      setGraveyardData(updatedGrave);
    } catch (_) {}
  };

  const handleLaunchRevengeDuel = async (questionIds = null) => {
    if (!user) {
      if (onOpenAuth) onOpenAuth();
      return;
    }
    setLaunchingRevenge(true);
    try {
      sound.duel();
      const res = await api.mastery.reDuel(questionIds, 5);
      if (res?.room && onJoinRoomCode) {
        onJoinRoomCode(res.room);
      }
    } catch (err) {
      alert(err.message || 'Failed to initialize revenge duel.');
    } finally {
      setLaunchingRevenge(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center max-w-md mx-auto">
        <Crosshair className="w-16 h-16 text-slate-600 mb-4 animate-pulse" />
        <h2 className="text-xl font-bold text-slate-200">Aspirant Telemetry Locked</h2>
        <p className="text-sm text-slate-400 mt-2 mb-6">
          Sign in to analyze your canonical chapter mastery matrix, discover high-yield failure traps, and redeem questions from your personal Graveyard.
        </p>
        <button
          onClick={onOpenAuth}
          className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-extrabold text-sm rounded-xl shadow-lg transition cursor-pointer hover:from-orange-400 hover:to-amber-400"
        >
          Sign In to Access Mastery
        </button>
      </div>
    );
  }

  // Canonical total chapters count from backend
  const totalChaptersCount = chaptersData?.total_chapters || chaptersData?.chapters?.length || 92;

  // Filter chapters list
  const filteredChapters = (chaptersData?.chapters || []).filter((ch) => {
    if (subjectFilter !== 'ALL' && ch.subject.toUpperCase() !== subjectFilter) return false;
    if (tierFilter !== 'ALL' && ch.mastery_tier !== tierFilter) return false;
    if (weightageFilter !== 'ALL' && ch.weightage !== weightageFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      if (!ch.chapter.toLowerCase().includes(q) && !ch.unit.toLowerCase().includes(q)) {
        return false;
      }
    }
    return true;
  });

  const displayedChapters = [...filteredChapters].sort((a, b) => {
    if (sortBy === 'ACCURACY_ASC') {
      const accA = a.attempts > 0 ? a.accuracy : 999;
      const accB = b.attempts > 0 ? b.accuracy : 999;
      return accA - accB;
    }
    if (sortBy === 'ACCURACY_DESC') {
      return (b.accuracy || 0) - (a.accuracy || 0);
    }
    if (sortBy === 'SPEED_SLOW') {
      return (b.avg_time_seconds || 0) - (a.avg_time_seconds || 0);
    }
    if (sortBy === 'SPEED_FAST') {
      const tA = a.avg_time_seconds || 9999;
      const tB = b.avg_time_seconds || 9999;
      return tA - tB;
    }
    return 0;
  });

  // Filter graveyard questions
  const filteredGraveyard = (graveyardData?.questions || []).filter((item) => {
    if (graveyardFilter === 'BOOKMARKED' && !item.is_bookmarked) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-6 animate-fadeIn">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-orange-500/10 border border-orange-500/30 rounded-xl text-orange-400">
              <Crosshair className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
                CHAPTER MASTERY & GRAVEYARD
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  {totalChaptersCount} Chapters
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Deep per-chapter Elo tracking, high-yield risk radar, and failed question redemption arena.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-[#121622] rounded-xl border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => {
              sound.click();
              setActiveTab('chapters');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'chapters'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>{totalChaptersCount}-Chapter Matrix</span>
            {chaptersData && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/40 font-mono">
                {chaptersData.tier_summary?.MASTERED || 0}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              sound.click();
              setActiveTab('radar');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'radar'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-amber-300" />
            <span>Weak-Spots Radar</span>
            {radarData?.critical_count > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-500 text-white font-mono font-bold animate-pulse">
                {radarData.critical_count}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              sound.click();
              setActiveTab('graveyard');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeTab === 'graveyard'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Skull className="w-3.5 h-3.5 text-red-400" />
            <span>The Graveyard</span>
            {graveyardData?.total_count > 0 && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-red-950 text-red-300 border border-red-500/40 font-mono">
                {graveyardData.total_count}
              </span>
            )}
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 text-slate-400 gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-orange-400" />
          <span className="text-xs font-mono">Synthesizing chapter telemetry & error archives...</span>
        </div>
      )}

      {error && !loading && (
        <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchData}
            className="px-3 py-1 bg-red-500/30 hover:bg-red-500/40 text-white rounded-lg font-bold cursor-pointer transition text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: CHAPTER MATRIX & HEATMAP */}
      {/* ========================================================================= */}
      {activeTab === 'chapters' && !loading && chaptersData && (
        <div className="space-y-6">
          {/* Summary Quadrant Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-[#121622] border border-emerald-500/30 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Mastered (1800+)</div>
                <div className="text-2xl font-black text-white mt-1">
                  {chaptersData.tier_summary?.MASTERED || 0}
                  <span className="text-xs text-slate-500 font-normal"> / {totalChaptersCount}</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Award className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-[#121622] border border-blue-500/30 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Proficient (1500-1799)</div>
                <div className="text-2xl font-black text-white mt-1">
                  {chaptersData.tier_summary?.PROFICIENT || 0}
                  <span className="text-xs text-slate-500 font-normal"> / {totalChaptersCount}</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-[#121622] border border-amber-500/30 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-amber-400 uppercase tracking-wider">Emerging (1300-1499)</div>
                <div className="text-2xl font-black text-white mt-1">
                  {chaptersData.tier_summary?.EMERGING || 0}
                  <span className="text-xs text-slate-500 font-normal"> / {totalChaptersCount}</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            <div className="bg-[#121622] border border-red-500/30 rounded-2xl p-4 shadow-lg flex items-center justify-between">
              <div>
                <div className="text-[10px] font-bold text-red-400 uppercase tracking-wider">Critical (&lt;1300)</div>
                <div className="text-2xl font-black text-white mt-1">
                  {chaptersData.tier_summary?.CRITICAL || 0}
                  <span className="text-xs text-slate-500 font-normal"> / {totalChaptersCount}</span>
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
                <AlertTriangle className="w-5 h-5" />
              </div>
            </div>
          </div>

          {/* Filters Bar */}
          <div className="bg-[#121622] border border-white/10 rounded-2xl p-4 shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Subject Filters */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
              {[
                { id: 'ALL', label: 'All Subjects' },
                { id: 'PHYSICS', label: 'Physics ⚛️' },
                { id: 'CHEMISTRY', label: 'Chemistry 🧪' },
                { id: 'MATHEMATICS', label: 'Math 📐' }
              ].map((sub) => (
                <button
                  key={sub.id}
                  type="button"
                  onClick={() => {
                    sound.click();
                    setSubjectFilter(sub.id);
                  }}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                    subjectFilter === sub.id
                      ? 'bg-orange-500 text-white shadow'
                      : 'bg-[#1b212f] text-slate-400 hover:text-white hover:bg-white/5 border border-white/5'
                  }`}
                >
                  {sub.label}
                </button>
              ))}
            </div>

            {/* Search and Dropdowns */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative flex-1 sm:w-48">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter chapter..."
                  className="w-full pl-8 pr-3 py-1.5 bg-[#0a0d14] border border-white/15 focus:border-orange-500 rounded-xl text-white text-xs placeholder-slate-600 focus:outline-none transition"
                />
              </div>

              <select
                value={tierFilter}
                onChange={(e) => setTierFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-[#0a0d14] border border-white/15 rounded-xl text-white text-xs font-semibold focus:outline-none transition cursor-pointer"
              >
                <option value="ALL">All Quadrants</option>
                <option value="MASTERED">Mastered</option>
                <option value="PROFICIENT">Proficient</option>
                <option value="EMERGING">Emerging</option>
                <option value="CRITICAL">Critical</option>
              </select>

              <select
                value={weightageFilter}
                onChange={(e) => setWeightageFilter(e.target.value)}
                className="px-2.5 py-1.5 bg-[#0a0d14] border border-white/15 rounded-xl text-white text-xs font-semibold focus:outline-none transition cursor-pointer"
              >
                <option value="ALL">All Weightages</option>
                <option value="HIGH">High Yield 🔥</option>
                <option value="MEDIUM">Medium Yield</option>
                <option value="LOW">Low Yield</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="px-2.5 py-1.5 bg-[#0a0d14] border border-white/15 rounded-xl text-white text-xs font-semibold focus:outline-none transition cursor-pointer"
              >
                <option value="DEFAULT">Sort: Default Syllabus</option>
                <option value="ACCURACY_ASC">Accuracy: Lowest First (Fix Traps)</option>
                <option value="ACCURACY_DESC">Accuracy: Highest First</option>
                <option value="SPEED_SLOW">Speed: Slowest First (Time Traps)</option>
                <option value="SPEED_FAST">Speed: Fastest First</option>
              </select>
            </div>
          </div>

          {/* Chapters Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {displayedChapters.map((ch) => {
              const tierConf = TIER_COLORS[ch.mastery_tier] || TIER_COLORS.CRITICAL;
              const hasAttempts = ch.attempts > 0;
              return (
                <div
                  key={`${ch.subject}-${ch.chapter}`}
                  className="bg-[#121622] border border-white/10 hover:border-orange-500/40 rounded-2xl p-4 shadow-lg transition flex flex-col justify-between group"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        {ch.subject} • {ch.unit}
                      </span>
                      {ch.weightage === 'HIGH' && (
                        <span className="px-1.5 py-0.2 rounded bg-orange-950/80 border border-orange-500/40 text-orange-400 font-bold text-[9px] flex items-center gap-1">
                          <Flame className="w-2.5 h-2.5 fill-current" /> High Yield
                        </span>
                      )}
                    </div>

                    <h3 className="text-sm font-black text-white group-hover:text-orange-300 transition line-clamp-1">
                      {ch.chapter}
                    </h3>

                    {/* Elo & Attempts */}
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-white/5">
                      <div>
                        <div className="text-[10px] text-slate-500 uppercase font-mono">Chapter Elo</div>
                        <div className="text-base font-black font-mono text-white flex items-center gap-1.5">
                          <span>{ch.elo}</span>
                          <span className={`text-[8px] font-sans font-bold px-1.5 py-0.2 rounded border ${tierConf.badge}`}>
                            {ch.mastery_tier}
                          </span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 font-mono">
                          {hasAttempts ? `${ch.attempts} attempted` : '0 attempts'}
                        </span>
                      </div>
                    </div>

                    {/* Chapter-Wise Accuracy & Speed Matrix */}
                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-white/5 font-mono">
                      <div className="bg-[#0e121a] p-2 rounded-xl border border-white/5">
                        <div className="text-[9px] text-slate-400 uppercase flex items-center gap-1 mb-0.5">
                          <Target className="w-2.5 h-2.5 text-amber-400" />
                          <span>Accuracy</span>
                        </div>
                        <div className={`text-xs font-black ${
                          ch.accuracy >= 75 ? 'text-emerald-400' : ch.accuracy >= 50 ? 'text-blue-400' : hasAttempts ? 'text-red-400' : 'text-slate-500'
                        }`}>
                          {hasAttempts ? `${ch.accuracy}%` : 'Untested'}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          {hasAttempts ? `${ch.correct}/${ch.attempts} correct` : 'No data'}
                        </div>
                      </div>

                      <div className="bg-[#0e121a] p-2 rounded-xl border border-white/5 text-right">
                        <div className="text-[9px] text-slate-400 uppercase flex items-center justify-end gap-1 mb-0.5">
                          <Clock className="w-2.5 h-2.5 text-cyan-400" />
                          <span>Speed / Pace</span>
                        </div>
                        <div className="text-xs font-black">
                          {ch.avg_time_seconds ? (
                            <span className={
                              ch.speed_rating === 'FAST' ? 'text-cyan-400' :
                              ch.speed_rating === 'OPTIMAL' ? 'text-emerald-400' :
                              'text-amber-400'
                            }>
                              ~{ch.avg_time_seconds}s/q
                            </span>
                          ) : (
                            <span className="text-slate-500">Untested</span>
                          )}
                        </div>
                        <div className="text-[9px] text-slate-500">
                          {ch.ideal_time_seconds ? `Target: ${ch.ideal_time_seconds}s` : ''}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full h-1.5 bg-slate-800 rounded-full mt-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          ch.elo >= 1800
                            ? 'bg-emerald-500'
                            : ch.elo >= 1500
                            ? 'bg-blue-500'
                            : ch.elo >= 1300
                            ? 'bg-amber-500'
                            : 'bg-red-500'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(5, (ch.elo / 2400) * 100))}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[10px] text-slate-500 font-mono">
                      {ch.questions_available > 0 ? `${ch.questions_available} questions` : 'Core Theory'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        sound.click();
                        if (onStartPreset) {
                          onStartPreset(ch.subject, ch.chapter);
                        } else if (onNavigateTab) {
                          onNavigateTab('arena');
                        }
                      }}
                      className="px-3 py-1 rounded-xl bg-orange-500/10 hover:bg-orange-500 border border-orange-500/30 hover:border-transparent text-orange-400 hover:text-white font-bold text-[11px] transition cursor-pointer flex items-center gap-1"
                    >
                      <span>Drill Chapter</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {filteredChapters.length === 0 && (
            <div className="p-8 text-center text-slate-400 bg-[#121622] rounded-2xl border border-white/10">
              No chapters match your selected filters. Try resetting the search or tier selector.
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: WEAK-SPOTS RISK RADAR */}
      {/* ========================================================================= */}
      {activeTab === 'radar' && !loading && radarData && (
        <div className="space-y-6">
          {/* Risk Formula Explanation Card */}
          <div className="p-4 bg-gradient-to-r from-red-950/40 via-[#181d28] to-orange-950/40 border border-red-500/30 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-red-500/20 text-red-400 border border-red-500/30 shrink-0">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white">Automated JEE Negative-Marking Radar</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Flags high-yield core chapters with sub-1500 Elo. Targeted remediation drills prevent severe mark hemorrhage on actual exam day.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs text-slate-400 font-mono">Critical Weak Spots:</span>
              <span className="px-2 py-0.5 rounded-full bg-red-500 text-white font-bold font-mono text-xs">
                {radarData.critical_count}
              </span>
            </div>
          </div>

          {/* Weak spots list */}
          <div className="space-y-3">
            {(radarData.top_weak_spots || []).map((spot, idx) => {
              const riskBadgeClass = RISK_BADGES[spot.risk_level] || RISK_BADGES.LOW;
              return (
                <div
                  key={`${spot.subject}-${spot.chapter}`}
                  className="bg-[#121622] border border-white/10 hover:border-red-500/40 rounded-2xl p-5 shadow-lg transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-mono font-bold text-slate-500">#{idx + 1}</span>
                      <span className="text-sm font-black text-white">{spot.chapter}</span>
                      <span className="text-[10px] text-slate-400 font-mono">({spot.subject} • {spot.unit})</span>
                      <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-full border ${riskBadgeClass}`}>
                        {spot.risk_level} RISK ({spot.risk_score}/100)
                      </span>
                      {spot.weightage === 'HIGH' && (
                        <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-orange-950 text-orange-400 border border-orange-500/30 flex items-center gap-1">
                          <Flame className="w-2.5 h-2.5 fill-current" /> High Yield Core
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-300">
                      {spot.diagnosis}
                    </p>

                    <div className="flex items-center gap-4 text-xs font-mono text-slate-400 pt-1">
                      <span>Elo: <strong className="text-white">{spot.elo}</strong></span>
                      <span>Accuracy: <strong className="text-white">{spot.attempts > 0 ? `${spot.accuracy}%` : 'No attempts'}</strong></span>
                      <span>Attempts: <strong className="text-white">{spot.attempts}</strong></span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 md:border-l md:border-white/5 md:pl-5">
                    <button
                      type="button"
                      onClick={() => {
                        sound.click();
                        if (onStartPreset) {
                          onStartPreset(spot.subject, spot.chapter);
                        } else if (onNavigateTab) {
                          onNavigateTab('arena');
                        }
                      }}
                      className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-extrabold text-xs shadow-lg transition cursor-pointer flex items-center justify-center gap-2"
                    >
                      <Target className="w-3.5 h-3.5" />
                      <span>{spot.recommended_action}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: THE GRAVEYARD & FAILED QUESTION BOOKMARKS */}
      {/* ========================================================================= */}
      {activeTab === 'graveyard' && !loading && (
        <div className="space-y-6">
          {/* Graveyard Revenge Duel Banner */}
          <div className="bg-gradient-to-r from-red-950/60 via-[#181d28] to-purple-950/60 border border-red-500/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-red-950/80 border border-red-500/50 flex items-center justify-center text-red-400 shadow-lg shrink-0">
                  <Skull className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-white flex items-center gap-2">
                    THE ERROR GRAVEYARD
                    <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-red-950 text-red-300 border border-red-500/40">
                      {graveyardData?.total_count || 0} Questions
                    </span>
                  </h2>
                  <p className="text-xs text-slate-300 mt-1 max-w-xl">
                    Every failed attempt is cataloged here. Directly challenge the exact problems that previously defeated you to forge authentic mastery.
                  </p>
                </div>
              </div>

              {graveyardData?.total_count > 0 && (
                <button
                  type="button"
                  onClick={() => handleLaunchRevengeDuel(null)}
                  disabled={launchingRevenge}
                  className="px-5 py-3 rounded-xl bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-extrabold text-xs shadow-xl shadow-red-950/50 flex items-center justify-center gap-2 cursor-pointer transition shrink-0"
                >
                  {launchingRevenge ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Swords className="w-4 h-4" />}
                  <span>Launch 5-Question Revenge Duel</span>
                </button>
              )}
            </div>

            {/* Filter Toggle */}
            <div className="mt-5 pt-4 border-t border-white/10 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setGraveyardFilter('ALL')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                    graveyardFilter === 'ALL'
                      ? 'bg-red-500 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  All Failed ({graveyardData?.total_count || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setGraveyardFilter('BOOKMARKED')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
                    graveyardFilter === 'BOOKMARKED'
                      ? 'bg-amber-500 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <Bookmark className="w-3 h-3" />
                  <span>Bookmarked ({graveyardData?.bookmarked_count || 0})</span>
                </button>
              </div>
              <span className="text-[11px] text-slate-400 font-mono">
                Clicking Re-Duel launches an isolated arena duel with that problem.
              </span>
            </div>
          </div>

          {/* Question Cards List */}
          {filteredGraveyard.length > 0 ? (
            <div className="space-y-4">
              {filteredGraveyard.map((item) => {
                const q = item.question;
                const isSolOpen = Boolean(expandedSolutions[q.id]);
                const isEditingNotes = editingNotesId === q.id;

                return (
                  <div
                    key={q.id}
                    className="bg-[#121622] border border-white/10 hover:border-red-500/30 rounded-2xl p-5 shadow-lg transition space-y-4"
                  >
                    {/* Top Bar: Subject, Chapter, Fail Count, Actions */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-white/5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-white">{q.subject}</span>
                        <span className="text-xs text-slate-400 font-mono">• {q.chapter}</span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {q.question_type}
                        </span>
                        {item.failure_count > 0 && (
                          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-red-950/80 text-red-300 border border-red-500/40 flex items-center gap-1">
                            <Skull className="w-2.5 h-2.5" /> Failed {item.failure_count}x
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {/* Bookmark Button */}
                        <button
                          type="button"
                          onClick={() => handleToggleBookmark(q.id, item.bookmark_notes)}
                          title={item.is_bookmarked ? "Remove Bookmark" : "Bookmark Question"}
                          className={`p-1.5 rounded-lg border transition cursor-pointer flex items-center gap-1 text-xs ${
                            item.is_bookmarked
                              ? 'bg-amber-950/60 border-amber-500/50 text-amber-300'
                              : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                          }`}
                        >
                          <Bookmark className="w-3.5 h-3.5 fill-current" />
                          <span className="hidden sm:inline">{item.is_bookmarked ? 'Saved' : 'Save'}</span>
                        </button>

                        {/* Re-Duel Single Question Button */}
                        <button
                          type="button"
                          onClick={() => handleLaunchRevengeDuel([q.id])}
                          title="Re-Duel this exact question"
                          className="px-3 py-1.5 rounded-lg bg-orange-600/30 hover:bg-orange-600 border border-orange-500/40 text-orange-200 hover:text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5"
                        >
                          <Swords className="w-3 h-3" />
                          <span>Re-Duel</span>
                        </button>

                        {/* Redeem/Dismiss Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveFromGraveyard(q.id)}
                          title="I have mastered this. Remove from graveyard."
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-red-950 border border-slate-700 hover:border-red-500/40 text-slate-400 hover:text-red-300 transition cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Question Body */}
                    <div className="text-sm text-slate-200 leading-relaxed overflow-x-auto">
                      <MathRenderer text={q.text} />
                    </div>

                    {/* Diagram Display */}
                    {q.has_diagram && q.diagram_urls && (
                      <div className="p-2 bg-[#0e121c] rounded-xl border border-white/5 inline-block">
                        <img
                          src={q.diagram_urls}
                          alt="Question Diagram"
                          className="max-h-52 rounded-lg object-contain"
                        />
                      </div>
                    )}

                    {/* Options (if present) */}
                    {Array.isArray(q.options) && q.options.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {q.options.map((opt) => (
                          <div
                            key={opt.key}
                            className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                              isSolOpen && String(opt.key).toUpperCase() === String(q.correct_answer).toUpperCase()
                                ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-200 font-bold'
                                : 'bg-[#181d28] border-white/5 text-slate-300'
                            }`}
                          >
                            <span className="font-mono font-bold shrink-0">{opt.key}.</span>
                            <div className="min-w-0">
                              <MathRenderer text={opt.text} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Custom Notes Section */}
                    {item.is_bookmarked && (
                      <div className="p-3 rounded-xl bg-[#171c26] border border-amber-500/20 text-xs space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-amber-300 flex items-center gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5" /> Personal Revision Note:
                          </span>
                          {!isEditingNotes && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingNotesId(q.id);
                                setTempNotes(item.bookmark_notes || '');
                              }}
                              className="text-[10px] text-amber-400 hover:text-white underline cursor-pointer"
                            >
                              Edit Note
                            </button>
                          )}
                        </div>

                        {isEditingNotes ? (
                          <div className="space-y-2">
                            <textarea
                              value={tempNotes}
                              onChange={(e) => setTempNotes(e.target.value)}
                              placeholder="e.g. Forgot factor of 1/2 in kinetic energy term..."
                              className="w-full px-3 py-2 bg-[#0a0d14] border border-white/15 rounded-lg text-white text-xs focus:outline-none"
                              rows={2}
                            />
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setEditingNotesId(null)}
                                className="px-2.5 py-1 rounded bg-slate-800 text-slate-400 text-xs"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSaveNotes(q.id)}
                                className="px-3 py-1 rounded bg-amber-500 text-white font-bold text-xs"
                              >
                                Save Note
                              </button>
                            </div>
                          </div>
                        ) : (
                          <p className="text-slate-300 italic">
                            {item.bookmark_notes || 'No note added yet. Click Edit Note to record your learning takeaway.'}
                          </p>
                        )}
                      </div>
                    )}

                    {/* On-Demand Derivation & Key */}
                    <div className="pt-2">
                      <OnDemandDerivationBox
                        questionId={q.id}
                        officialKey={q.correct_answer}
                        initialSolution={item}
                        compact={true}
                        defaultExpanded={false}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 bg-[#121622] rounded-2xl border border-white/10">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <h3 className="text-base font-bold text-white">Your Graveyard is Currently Clean!</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">
                No active failed or bookmarked questions found. As you engage in speed duels and mock exams, any missed problems will automatically arrive here for targeted redemption.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
