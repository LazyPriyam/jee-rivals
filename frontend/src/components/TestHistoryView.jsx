import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
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
  ChevronRight
} from 'lucide-react';

export default function TestHistoryView({ user, onSelectTest, onNavigateTab, onOpenAuth }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedMode, setSelectedMode] = useState('ALL'); // 'ALL', 'MOCK_TEST', 'SPEED_DUEL'
  const [searchQuery, setSearchQuery] = useState('');

  const fetchHistory = () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    api.rooms.getMyHistory()
      .then((data) => {
        setHistory(data || []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to retrieve test archives.');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchHistory();
  }, [user?.id]);

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

  // Aggregate Metrics
  const totalTests = history.length;
  const bestMarks = history.length > 0 ? Math.max(...history.map((h) => h.marks || 0)) : 0;
  const totalAttempted = history.reduce((acc, h) => acc + (h.total_attempted || 0), 0);
  const avgAccuracy =
    history.length > 0
      ? Math.round(
          history.reduce((acc, h) => acc + (h.accuracy || 0), 0) / history.length
        )
      : 0;

  // Filter history items
  const filteredHistory = history.filter((item) => {
    if (selectedMode !== 'ALL' && item.mode !== selectedMode) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = (item.preset_name || '').toLowerCase().includes(q);
      const matchSubj = (item.subject || '').toLowerCase().includes(q);
      const matchCode = (item.code || '').toLowerCase().includes(q);
      if (!matchTitle && !matchSubj && !matchCode) return false;
    }
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-transition space-y-8">
      {/* Page Header Banner */}
      <div className="bg-gradient-to-r from-[#172033] via-[#1f283c] to-[#172033] border border-orange-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl glow-orange-subtle">
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
            <span className="text-xs text-slate-400 block mb-1">Peak Marks Record</span>
            <span className="text-2xl font-black text-orange-400">
              +{bestMarks.toFixed(1)}
            </span>
          </div>
          <div className="bg-[#10141f] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Total Questions</span>
            <span className="text-2xl font-black text-sky-400">{totalAttempted}</span>
          </div>
          <div className="bg-[#10141f] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Mean Accuracy</span>
            <span className="text-2xl font-black text-emerald-400">{avgAccuracy}%</span>
          </div>
        </div>
      </div>

      {/* Filters & Search Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Mode filter pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {[
            { id: 'ALL', label: 'All Examinations' },
            { id: 'MOCK_TEST', label: 'NTA CBT Mocks' },
            { id: 'SPEED_DUEL', label: 'Speed Duels' },
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
            const dateStr = item.completed_at || item.created_at;
            const formattedDate = dateStr
              ? new Date(dateStr).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Recent Session';

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
                    <span className="text-xs text-slate-400">• {formattedDate}</span>
                    <span className="text-xs text-slate-400">• Room #{item.code}</span>
                  </div>

                  <h3 className="text-base sm:text-lg font-black text-white group-hover:text-orange-300 transition leading-snug">
                    {item.preset_name}
                  </h3>

                  <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400">
                    <span>
                      Questions:{' '}
                      <strong className="text-slate-200">
                        {item.total_attempted} / {item.total_questions}
                      </strong>
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
                    <div className="text-2xl font-black text-orange-400">
                      {item.marks !== undefined ? `+${Number(item.marks).toFixed(1)}` : `${item.score} pts`}
                    </div>
                    <div className="text-xs text-slate-400">
                      Accuracy:{' '}
                      <span className="font-bold text-emerald-400">
                        {item.accuracy || 0}%
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      sound.click();
                      onSelectTest(item.code);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs transition shadow-lg shadow-orange-950/40 cursor-pointer flex items-center gap-1.5 shrink-0"
                  >
                    <span>Full Analysis</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
