import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import { formatIST } from '../utils/dateUtils';
import { ConfirmDialog } from './Dialog';
import {
  Clock,
  BookOpen,
  Trophy,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowRight,
  RefreshCw,
  Search,
  Filter,
  BarChart2,
  FileText,
  Sliders,
  Swords,
  ChevronRight,
  Trash2,
  TrendingUp,
  TrendingDown,
  Activity,
  AlertCircle,
  Zap,
  Target
} from 'lucide-react';

export default function TestHistoryView({ user, inspectUsername, onSelectTest, onResumeTest, onNavigateTab, onOpenAuth, onClearInspect, isActive = true }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMode, setSelectedMode] = useState('ALL'); // 'ALL', 'MOCK_TEST', 'SPEED_DUEL', 'GROUP'
  const [searchQuery, setSearchQuery] = useState('');

  // Performance Analytics Graph States
  const [graphMetric, setGraphMetric] = useState('marks_percentage'); // 'marks_percentage', 'marks', 'accuracy', 'attempt_rate'
  const [graphExamFilter, setGraphExamFilter] = useState('ALL'); // 'ALL', 'MAIN', 'ADVANCED'
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Deletion States
  const [deleteConfirmModal, setDeleteConfirmModal] = useState(null);
  const [deletingCode, setDeletingCode] = useState(null);

  const targetUsername = inspectUsername || user?.username;
  const isOwnHistory = !inspectUsername || (user && inspectUsername.toLowerCase() === user.username.toLowerCase());

  const fetchHistory = () => {
    if (!targetUsername && !user) {
      setLoading(false);
      return;
    }
    const cacheKey = `jee_cached_history_${targetUsername || 'me'}`;
    try {
      const cached = sessionStorage.getItem(cacheKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setHistory(parsed);
          setLoading(false);
        }
      }
    } catch (_) {}

    if (!history || history.length === 0) {
      setLoading(true);
    }
    setError('');
    const req = inspectUsername && !isOwnHistory
      ? api.rooms.getUserHistory(inspectUsername)
      : api.rooms.getMyHistory();

    req
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        setHistory(list);
        setLoading(false);
        try {
          sessionStorage.setItem(cacheKey, JSON.stringify(list));
        } catch (_) {}
        // Pre-warm the analysis cache for the latest completed test
        if (list.length > 0 && list[0].code) {
          api.rooms.results(list[0].code).catch(() => {});
        }
      })
      .catch((err) => {
        if (!history || history.length === 0) {
          setError(err.message || 'Failed to retrieve test archives.');
        }
        setLoading(false);
      });
  };

  useEffect(() => {
    if (isActive !== false) {
      fetchHistory();
    }
  }, [user?.id, inspectUsername, isActive]);

  useEffect(() => {
    const handleUserUpdated = () => {
      if (isActive !== false) {
        fetchHistory();
      }
    };
    window.addEventListener('jee_user_updated', handleUserUpdated);
    return () => window.removeEventListener('jee_user_updated', handleUserUpdated);
  }, [inspectUsername, isActive]);

  if (!user) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="w-16 h-16 rounded-3xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center mx-auto mb-4 text-orange-400">
          <Clock className="w-8 h-8" />
        </div>
        <h2 className="text-2xl font-black text-white mb-2">Aspirant Dossier Protected</h2>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
          Sign in or create your candidate profile to access your past examination papers, diagnostic scorecards, and step-by-step solutions.
        </p>
        <button
          onClick={onOpenAuth}
          className="px-6 py-3 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm shadow-xl shadow-orange-950/50 cursor-pointer transition"
        >
          Access Candidate Portal
        </button>
      </div>
    );
  }

  // Aggregate Metrics (Accurate computations based on real attempts, excluding deleted tests)
  const completedTests = history.filter((h) => (h.status === 'COMPLETED' || h.is_finished) && h.status !== 'DELETED');
  const totalTests = completedTests.length;
  const bestMarks = completedTests.length > 0 ? Math.max(...completedTests.map((h) => Number(h.marks) || 0)) : 0;
  const bestScaledMarks = completedTests.length > 0
    ? Math.max(...completedTests.map((h) => {
        if (h.scaled_marks_300 !== undefined) return Number(h.scaled_marks_300);
        const maxM = h.max_marks || (h.total_questions * 4) || 300;
        return maxM > 0 ? Math.round(((Number(h.marks) || 0) / maxM) * 300 * 10) / 10 : 0;
      }))
    : 0;
  const totalAttempted = completedTests.reduce((acc, h) => acc + (h.total_attempted || 0), 0);
  const testsWithAttempts = completedTests.filter((h) => (h.total_attempted || 0) > 0);
  const avgAccuracy =
    testsWithAttempts.length > 0
      ? Math.round(
          testsWithAttempts.reduce((acc, h) => acc + (h.accuracy || 0), 0) / testsWithAttempts.length
        )
      : 0;

  // Filter history items (exclude deleted tests)
  const filteredHistory = history.filter((item) => {
    if (item.status === 'DELETED') return false;
    if (selectedMode === 'MOCK_TEST' && item.mode !== 'MOCK_TEST') return false;
    if (selectedMode === 'SPEED_DUEL' && item.mode !== 'SPEED_DUEL') return false;
    if (selectedMode === 'GROUP' && !item.is_group && (item.participant_count || 1) <= 1) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (item.preset_name || '').toLowerCase().includes(q);
      const matchSubj = (item.subject || '').toLowerCase().includes(q);
      const matchCode = (item.code || '').toLowerCase().includes(q);
      if (!matchTitle && !matchSubj && !matchCode) return false;
    }
    return true;
  });

  const handleDeleteTest = async (testItem) => {
    if (!testItem?.code) return;
    setDeletingCode(testItem.code);
    try {
      sound.click();
      await api.rooms.delete(testItem.code);
      setHistory((prev) => prev.filter((h) => h.code !== testItem.code && h.room_id !== testItem.room_id));
      const targetUser = inspectUsername || user?.username || 'me';
      const cacheKeys = [
        `jee_cached_history_${targetUser}`,
        'jee_cached_history_me',
        ...(user?.username ? [`jee_cached_history_${user.username}`] : [])
      ];
      try {
        for (const key of cacheKeys) {
          const stored = sessionStorage.getItem(key);
          if (stored) {
            const list = JSON.parse(stored).filter((h) => h.code !== testItem.code && h.room_id !== testItem.room_id);
            sessionStorage.setItem(key, JSON.stringify(list));
          }
        }
        sessionStorage.removeItem(`jee_cached_results_${testItem.code.toUpperCase()}`);
      } catch (_) {}
      window.dispatchEvent(new CustomEvent('jee_user_updated', { detail: user }));
      setDeleteConfirmModal(null);
    } catch (err) {
      alert(err.message || 'Failed to remove test from records.');
    } finally {
      setDeletingCode(null);
    }
  };

  // Performance Analytics Data Prep (Chronological: oldest to newest, up to 15 recent tests)
  const chartFiltered = completedTests.filter((item) => {
    if (graphExamFilter === 'MAIN') {
      const exam = (item.target_exam || '').toUpperCase();
      const preset = (item.preset_name || '').toLowerCase();
      return exam.includes('MAIN') || (!exam.includes('ADV') && !preset.includes('advanced'));
    }
    if (graphExamFilter === 'ADVANCED') {
      const exam = (item.target_exam || '').toUpperCase();
      const preset = (item.preset_name || '').toLowerCase();
      return exam.includes('ADV') || preset.includes('advanced');
    }
    return true;
  });

  const chronologicalTests = [...chartFiltered]
    .sort((a, b) => new Date(a.completed_at || a.created_at || 0) - new Date(b.completed_at || b.created_at || 0))
    .slice(-15);

  // Extract metric values
  const graphPoints = chronologicalTests.map((t, idx) => {
    let val = 0;
    let label = '';
    const maxM = t.max_marks || (t.total_questions * 4) || 300;
    const mVal = Number(t.marks || 0);

    if (graphMetric === 'marks_percentage') {
      val = t.marks_percentage !== undefined ? t.marks_percentage : Math.max(0, Math.round((mVal / maxM) * 100));
      label = `${val}%`;
    } else if (graphMetric === 'marks') {
      // Scale any test to standard 300 marks for equitable comparison across part-syllabus / full-mock papers
      val = t.scaled_marks_300 !== undefined
        ? Number(t.scaled_marks_300)
        : (maxM > 0 ? Math.round(((mVal / maxM) * 300) * 10) / 10 : 0);
      label = `${val >= 0 ? '+' : ''}${val} / 300`;
    } else if (graphMetric === 'accuracy') {
      val = t.accuracy || 0;
      label = `${val}% Acc`;
    } else if (graphMetric === 'attempt_rate') {
      val = t.total_questions > 0 ? Math.round(((t.total_attempted || 0) / t.total_questions) * 100) : 0;
      label = `${val}% Att`;
    }

    return {
      test: t,
      idx,
      val,
      label
    };
  });

  // Calculate Trend & Benchmarks
  const firstPoint = graphPoints[0]?.val ?? 0;
  const lastPoint = graphPoints[graphPoints.length - 1]?.val ?? 0;
  const trendDelta = graphPoints.length >= 2 ? Math.round((lastPoint - firstPoint) * 10) / 10 : 0;
  const avgGraphVal = graphPoints.length > 0 ? Math.round((graphPoints.reduce((acc, p) => acc + p.val, 0) / graphPoints.length) * 10) / 10 : 0;
  const peakGraphVal = graphPoints.length > 0 ? Math.max(...graphPoints.map((p) => p.val)) : 0;

  // Chart layout geometry
  const svgW = 760;
  const svgH = 220;
  const padL = 50;
  const padR = 30;
  const padT = 30;
  const padB = 40;
  const plotW = svgW - padL - padR;
  const plotH = svgH - padT - padB;

  let minPlotVal = 0;
  let maxPlotVal = 100;

  if (graphMetric === 'marks') {
    const rawVals = graphPoints.map((p) => p.val);
    const minM = rawVals.length > 0 ? Math.min(0, Math.min(...rawVals)) : 0;
    const maxM = rawVals.length > 0 ? Math.max(300, Math.max(...rawVals)) : 300;
    minPlotVal = Math.floor(minM / 10) * 10;
    maxPlotVal = Math.ceil(maxM / 10) * 10;
  } else {
    minPlotVal = 0;
    maxPlotVal = 100;
  }
  const valRange = Math.max(1, maxPlotVal - minPlotVal);

  const coords = graphPoints.map((p, idx) => {
    const x = graphPoints.length === 1 ? padL + plotW / 2 : padL + (idx / (graphPoints.length - 1)) * plotW;
    const normH = Math.max(0, Math.min(1, (p.val - minPlotVal) / valRange));
    const y = padT + (1 - normH) * plotH;
    return { ...p, x, y };
  });

  const polylineStr = coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const polygonStr = coords.length > 0
    ? `${polylineStr} ${coords[coords.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} ${coords[0].x.toFixed(1)},${(padT + plotH).toFixed(1)}`
    : '';

  const avgY = padT + (1 - Math.max(0, Math.min(1, (avgGraphVal - minPlotVal) / valRange))) * plotH;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-transition space-y-8">
      {/* Page Header Banner */}
      <div className="bg-gradient-to-r from-[#172033] via-[#1f283c] to-[#172033] border border-orange-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl glow-orange-subtle">
        {!isOwnHistory && (
          <div className="bg-[#1a1f2e] border border-orange-500/30 p-4 rounded-2xl flex items-center justify-between mb-2">
            <span className="text-xs font-mono font-bold text-orange-400">
              Viewing examination archives of candidate: @{inspectUsername}
            </span>
            {onClearInspect && (
              <button
                onClick={onClearInspect}
                className="text-xs font-bold px-3 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg transition cursor-pointer"
              >
                Back to My Test History
              </button>
            )}
          </div>
        )}

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-950/80 border border-orange-500/40 text-orange-400 text-xs font-bold uppercase tracking-wider mb-2 font-mono">
              <Clock className="w-3.5 h-3.5" />
              <span>Diagnostic Archive Vault</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
              Test Papers & Examination History
            </h1>
            <p className="text-slate-300 text-sm sm:text-base mt-2 max-w-2xl leading-relaxed">
              Every authentic NTA mock, custom blueprint paper, and speed duel battle you take is permanently preserved with comprehensive question-by-question derivations.
            </p>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={() => onNavigateTab && onNavigateTab('mocks')}
              className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs transition shadow-lg shadow-orange-950/40 cursor-pointer flex items-center gap-1.5"
            >
              <BookOpen className="w-4 h-4" />
              <span>Launch NTA Mock</span>
            </button>
            <button
              onClick={() => onNavigateTab && onNavigateTab('generator')}
              className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition border border-white/10 cursor-pointer flex items-center gap-1.5"
            >
              <Sliders className="w-4 h-4" />
              <span>Custom Blueprint</span>
            </button>
          </div>
        </div>

        {/* 4-Stat Header Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-8 pt-8 border-t border-white/10 font-mono">
          <div className="bg-[#10141f] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Total Tests Taken</span>
            <span className="text-2xl font-black text-white">{totalTests}</span>
          </div>
          <div className="bg-[#10141f] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Peak Score (Scaled /300)</span>
            <span className="text-2xl font-black text-orange-400">
              {bestScaledMarks >= 0 ? '+' : ''}{bestScaledMarks.toFixed(1)}
              <span className="text-xs text-slate-500 font-normal ml-1">/ 300</span>
            </span>
          </div>
          <div className="bg-[#10141f] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Total Attempted</span>
            <span className="text-2xl font-black text-sky-400">{totalAttempted} Qs</span>
          </div>
          <div className="bg-[#10141f] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Mean Accuracy</span>
            <span className="text-2xl font-black text-emerald-400">{avgAccuracy}%</span>
          </div>
        </div>
      </div>

      {/* Performance Analytics Progression Card */}
      {completedTests.length > 0 && (
        <div className="bg-[#161a24] border border-orange-500/25 rounded-3xl p-6 sm:p-7 shadow-xl glow-orange-subtle space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] font-black uppercase tracking-wider mb-2 font-mono">
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Candidate Performance Analytics</span>
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>Chronological Examination Trajectory</span>
                {trendDelta !== 0 && (
                  <span className={`text-xs font-mono font-bold px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                    trendDelta > 0
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                      : 'bg-rose-950/80 text-rose-400 border-rose-500/40'
                  }`}>
                    {trendDelta > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {trendDelta > 0 ? `+${trendDelta}` : `${trendDelta}`} {graphMetric === 'marks' ? 'M (/300)' : '%'} Trajectory
                  </span>
                )}
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Visualizing score trajectory, accuracy consistency, and pacing progression across your completed papers.
              </p>
            </div>

            {/* Controls: Metric Selector & Exam Filter */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Metric Selector Pills */}
              <div className="flex items-center bg-[#0e111a] p-1 rounded-xl border border-white/10 font-mono text-[11px]">
                {[
                  { id: 'marks_percentage', label: 'Marks %' },
                  { id: 'marks', label: 'Score (/300)' },
                  { id: 'accuracy', label: 'Accuracy %' },
                  { id: 'attempt_rate', label: 'Attempted %' }
                ].map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      sound.click();
                      setGraphMetric(m.id);
                    }}
                    className={`px-3 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      graphMetric === m.id
                        ? 'bg-orange-500 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>

              {/* Exam Filter */}
              <div className="flex items-center bg-[#0e111a] p-1 rounded-xl border border-white/10 font-mono text-[11px]">
                {[
                  { id: 'ALL', label: 'All' },
                  { id: 'MAIN', label: 'JEE Main' },
                  { id: 'ADVANCED', label: 'Advanced' }
                ].map((e) => (
                  <button
                    key={e.id}
                    onClick={() => {
                      sound.click();
                      setGraphExamFilter(e.id);
                    }}
                    className={`px-2.5 py-1.5 rounded-lg font-bold transition cursor-pointer ${
                      graphExamFilter === e.id
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* KPI Strip above Chart */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
            <div className="bg-[#10141f] border border-white/5 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block mb-0.5">Average Performance</span>
              <span className="text-base font-black text-white">
                {avgGraphVal}{graphMetric === 'marks' ? ' / 300' : '%'}
              </span>
            </div>
            <div className="bg-[#10141f] border border-white/5 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block mb-0.5">Peak Session</span>
              <span className="text-base font-black text-orange-400">
                {peakGraphVal}{graphMetric === 'marks' ? ' / 300' : '%'}
              </span>
            </div>
            <div className="bg-[#10141f] border border-white/5 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block mb-0.5">Latest Session</span>
              <span className="text-base font-black text-sky-400">
                {lastPoint}{graphMetric === 'marks' ? ' / 300' : '%'}
              </span>
            </div>
            <div className="bg-[#10141f] border border-white/5 rounded-xl p-3">
              <span className="text-[10px] text-slate-400 block mb-0.5">Tracked In Chart</span>
              <span className="text-base font-black text-purple-400">
                {graphPoints.length} Test{graphPoints.length !== 1 ? 's' : ''}
              </span>
            </div>
          </div>

          {/* Responsive SVG Chart */}
          {graphPoints.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400 font-mono">
              No tests match the current exam track filter.
            </div>
          ) : graphPoints.length === 1 ? (
            <div className="bg-[#0e111a] border border-white/10 rounded-2xl p-8 text-center font-mono">
              <Target className="w-8 h-8 text-orange-400 mx-auto mb-2" />
              <p className="text-sm font-bold text-white mb-1">
                Single Baseline Recorded: {graphPoints[0].test.preset_name} ({graphPoints[0].label})
              </p>
              <p className="text-xs text-slate-400">
                Complete at least one more test paper to render continuous trend interpolation curves.
              </p>
            </div>
          ) : (
            <div className="relative bg-[#0e111a] border border-white/10 rounded-2xl p-4 overflow-hidden">
              <svg
                viewBox={`0 0 ${svgW} ${svgH}`}
                className="w-full h-auto max-h-[250px] overflow-visible"
              >
                <defs>
                  <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity="0.4" />
                    <stop offset="80%" stopColor="#f97316" stopOpacity="0.05" />
                    <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
                  </linearGradient>
                  <filter id="glowCircle" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                {/* Horizontal Gridlines */}
                {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
                  const yVal = padT + (1 - pct) * plotH;
                  const labelVal = Math.round(minPlotVal + pct * valRange);
                  return (
                    <g key={pct}>
                      <line
                        x1={padL}
                        y1={yVal}
                        x2={padL + plotW}
                        y2={yVal}
                        stroke="rgba(255,255,255,0.06)"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={padL - 8}
                        y={yVal + 3}
                        textAnchor="end"
                        className="text-[9px] fill-slate-500 font-mono"
                      >
                        {labelVal}{graphMetric === 'marks' ? ' M' : '%'}
                      </text>
                    </g>
                  );
                })}

                {/* Average Benchmark Dashed Line */}
                {avgGraphVal > minPlotVal && (
                  <g>
                    <line
                      x1={padL}
                      y1={avgY}
                      x2={padL + plotW}
                      y2={avgY}
                      stroke="#38bdf8"
                      strokeWidth="1.2"
                      strokeDasharray="4 4"
                      opacity="0.6"
                    />
                    <text
                      x={padL + plotW - 4}
                      y={avgY - 4}
                      textAnchor="end"
                      className="text-[9px] fill-sky-400 font-mono font-bold"
                    >
                      Avg: {avgGraphVal}{graphMetric === 'marks' ? ' M (/300)' : '%'}
                    </text>
                  </g>
                )}

                {/* Filled Gradient Area */}
                {polygonStr && (
                  <polygon
                    points={polygonStr}
                    fill="url(#chartGradient)"
                  />
                )}

                {/* Smooth Glowing Path */}
                {polylineStr && (
                  <polyline
                    points={polylineStr}
                    fill="none"
                    stroke="#f97316"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                )}

                {/* Interactive Points */}
                {coords.map((c, i) => {
                  const isHovered = hoveredPoint?.test?.code === c.test.code;
                  return (
                    <g
                      key={c.test.code || i}
                      className="cursor-pointer"
                      onClick={() => onSelectTest(c.test.code, targetUsername)}
                      onMouseEnter={() => setHoveredPoint(c)}
                      onMouseLeave={() => setHoveredPoint(null)}
                    >
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r={isHovered ? 6 : 4}
                        fill={isHovered ? '#fff' : '#f97316'}
                        stroke="#0e111a"
                        strokeWidth="2"
                        className="transition-all duration-200"
                        filter={isHovered ? 'url(#glowCircle)' : undefined}
                      />
                      <text
                        x={c.x}
                        y={padT + plotH + 18}
                        textAnchor="middle"
                        className={`text-[9px] font-mono transition-colors ${
                          isHovered ? 'fill-orange-400 font-bold' : 'fill-slate-500'
                        }`}
                      >
                        #{c.test.code}
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Hover Tooltip Overlay */}
              {hoveredPoint && (
                <div
                  className="absolute pointer-events-none z-20 bg-[#161a24] border border-orange-500/50 shadow-2xl rounded-xl p-3 text-xs font-mono"
                  style={{
                    left: `${Math.min(75, Math.max(5, (hoveredPoint.x / svgW) * 100))}%`,
                    top: '12px'
                  }}
                >
                  <div className="font-sans font-bold text-white text-xs truncate max-w-[200px]">
                    {hoveredPoint.test.preset_name}
                  </div>
                  <div className="text-[10px] text-slate-400 mt-0.5">
                    Room #{hoveredPoint.test.code} • {formatIST(hoveredPoint.test.completed_at || hoveredPoint.test.created_at, { fallback: 'Recent' })}
                  </div>
                  <div className="flex items-center gap-3 mt-2 pt-2 border-t border-white/10 text-[11px]">
                    <div>
                      <span className="text-slate-400 text-[10px] block">Metric Value</span>
                      <strong className="text-orange-400">{hoveredPoint.label}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Raw Marks</span>
                      <strong className="text-white">
                        {hoveredPoint.test.marks}/{hoveredPoint.test.max_marks || (hoveredPoint.test.total_questions * 4) || 300}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] block">Accuracy</span>
                      <strong className={hoveredPoint.test.accuracy >= 70 ? 'text-emerald-400' : 'text-amber-400'}>
                        {hoveredPoint.test.accuracy}%
                      </strong>
                    </div>
                  </div>
                  <div className="text-[9px] text-orange-400 mt-1.5 flex items-center gap-1 font-bold">
                    <span>Click node to view full analysis</span>
                    <ArrowRight className="w-2.5 h-2.5" />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Filters & Search Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Mode filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'ALL', label: 'All Examinations' },
            { id: 'MOCK_TEST', label: 'NTA CBT Mocks' },
            { id: 'SPEED_DUEL', label: 'Speed Duels' },
            { id: 'GROUP', label: 'Group Battles & Mocks' },
          ].map((m) => (
            <button
              key={m.id}
              onClick={() => {
                sound.click();
                setSelectedMode(m.id);
              }}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                selectedMode === m.id
                  ? 'bg-orange-500 text-white shadow-md font-black'
                  : 'bg-[#161a24] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search test papers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#161a24] border border-white/10 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 transition font-sans"
          />
        </div>
      </div>

      {/* Test List Cards */}
      {loading ? (
        <div className="py-20 text-center font-mono">
          <div className="inline-block animate-spin text-orange-500 mb-3">
            <RefreshCw className="w-8 h-8" />
          </div>
          <p className="text-slate-400 text-sm">Opening Examination Archives...</p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="bg-[#161a24] border border-white/10 rounded-3xl p-12 text-center">
          <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-3 text-slate-400">
            <FileText className="w-7 h-7" />
          </div>
          <h3 className="text-lg font-bold text-white mb-1">No Test Papers Found</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto mb-6">
            You haven't completed any tests matching your filter yet. Launch an official NTA Mock or build a custom test blueprint to begin tracking.
          </p>
          <button
            onClick={() => onNavigateTab && onNavigateTab('mocks')}
            className="px-5 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-lg transition cursor-pointer"
          >
            Take First Practice Examination
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredHistory.map((item) => {
            const isMock = item.mode === 'MOCK_TEST';
            const isGroup = item.is_group || (item.participant_count || 1) > 1;
            const isInProgress = item.status === 'IN_PROGRESS' && !item.is_finished;
            const dateStr = item.completed_at || item.created_at;
            const formattedDate = formatIST(dateStr, { fallback: 'Recent Session' });

            const maxMarks = item.max_marks || (item.total_questions * 4);
            const marksVal = Number(item.marks || 0);

            return (
              <div
                key={item.code}
                className="bg-[#161a24] border border-white/10 hover:border-orange-500/40 rounded-3xl p-5 sm:p-6 shadow-xl transition flex flex-col md:flex-row md:items-center justify-between gap-5 group"
              >
                {/* Left: Test Info */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2 font-mono">
                    <span
                      className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                        isMock
                          ? 'bg-blue-500/20 text-blue-400 border-blue-500/40'
                          : 'bg-purple-500/20 text-purple-400 border-purple-500/40'
                      }`}
                    >
                      {isMock ? 'NTA Mock Examination' : 'Speed Duel Combat'}
                    </span>

                    {isGroup && (
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        👥 Group Battle ({item.participant_count} Aspirants)
                      </span>
                    )}

                    {isInProgress ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-500/40">
                        ⏳ In Progress
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
                        ✓ Completed
                      </span>
                    )}

                    <span className="text-xs text-slate-400">• {formattedDate}</span>
                    <span className="text-xs text-slate-400">• Room #{item.code}</span>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-white group-hover:text-orange-300 transition leading-snug">
                    {item.preset_name}
                  </h3>

                  {/* Accurate breakdown indicators */}
                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
                    <span>
                      Attempted:{' '}
                      <strong className="text-slate-200">
                        {item.total_attempted} / {item.total_questions}
                      </strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-emerald-400 font-bold">✓ {item.correct_count}</span>
                      <span>•</span>
                      <span className="text-rose-400 font-bold">✗ {item.incorrect_count !== undefined ? item.incorrect_count : Math.max(0, item.total_attempted - item.correct_count)}</span>
                      <span>•</span>
                      <span className="text-slate-500">⊘ {item.unattempted_count !== undefined ? item.unattempted_count : Math.max(0, item.total_questions - item.total_attempted)} Skipped</span>
                    </span>
                    <span>
                      Duration:{' '}
                      <strong className="text-slate-200">
                        {item.duration_minutes || 60} min
                      </strong>
                    </span>
                    <span>
                      Exam:{' '}
                      <strong className="text-slate-200">{item.target_exam || 'JEE'}</strong>
                    </span>
                  </div>
                </div>

                {/* Right: Scores & Action Button */}
                <div className="flex items-center justify-between md:justify-end gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-white/5">
                  <div className="text-left md:text-right font-mono">
                    {isMock ? (
                      <>
                        <div className="text-2xl font-black text-orange-400">
                          {marksVal >= 0 ? '+' : ''}{marksVal.toFixed(1)} / {maxMarks}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Score:{' '}
                          <span className="text-slate-200 font-bold">
                            {item.marks_percentage !== undefined ? `${item.marks_percentage}%` : `${Math.round((marksVal / maxMarks) * 100)}%`}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="text-2xl font-black text-orange-400">
                          {item.score} pts
                        </div>
                        <div className="text-[11px] text-slate-400">
                          Marks:{' '}
                          <span className="text-slate-200 font-bold">
                            {marksVal >= 0 ? '+' : ''}{marksVal.toFixed(1)}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="text-xs text-slate-400 mt-0.5">
                      Accuracy:{' '}
                      <span className={`font-bold ${item.accuracy >= 75 ? 'text-emerald-400' : item.accuracy >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                        {item.accuracy || 0}%
                      </span>
                    </div>
                  </div>

                  {isInProgress ? (
                    <button
                      onClick={() => {
                        sound.click();
                        if (onResumeTest) onResumeTest(item.code);
                        else onSelectTest(item.code);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs transition shadow-lg shadow-amber-950/40 cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <span>Resume Exam</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  ) : (
                    <button
                      onMouseEnter={() => api.rooms.results(item.code).catch(() => {})}
                      onClick={() => {
                        sound.click();
                        onSelectTest(item.code, targetUsername);
                      }}
                      className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs transition shadow-lg shadow-orange-950/40 cursor-pointer flex items-center gap-1.5 shrink-0"
                    >
                      <span>Full Analysis</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  )}

                  {isOwnHistory && (
                    <button
                      type="button"
                      title="Permanently Delete Test Paper"
                      onClick={() => setDeleteConfirmModal(item)}
                      className="p-2.5 rounded-xl bg-slate-800/80 hover:bg-rose-950/80 text-slate-400 hover:text-rose-400 border border-white/10 hover:border-rose-500/40 transition cursor-pointer flex items-center justify-center shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Unified Test Deletion Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(deleteConfirmModal)}
        onClose={() => !deletingCode && setDeleteConfirmModal(null)}
        onConfirm={() => handleDeleteTest(deleteConfirmModal)}
        title="Delete Test Paper?"
        subtitle={deleteConfirmModal ? `Room #${deleteConfirmModal.code}` : ''}
        description={
          deleteConfirmModal ? (
            <>
              Are you sure you want to permanently delete{' '}
              <strong className="text-white">"{deleteConfirmModal.preset_name}"</strong>?
              This will remove all score records, attempted answers, and calibration data from your profile. This action cannot be undone.
            </>
          ) : null
        }
        confirmText="Permanently Delete"
        cancelText="Cancel"
        variant="danger"
        isLoading={Boolean(deletingCode)}
        loadingText="Deleting..."
      />
    </div>
  );
}
