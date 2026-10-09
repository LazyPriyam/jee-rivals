import React, { useState, useEffect, useMemo } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RotateCcw,
  Search,
  Filter,
  Flag,
  FileText,
  Clock,
  User,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Edit3,
  Loader2,
  Sparkles,
  RefreshCw,
  Image as ImageIcon
} from 'lucide-react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import MathRenderer from './MathRenderer';

const REASON_LABELS = {
  WRONG_ANSWER: { label: 'Wrong Answer Key / Solution', color: 'bg-red-500/20 text-red-300 border-red-500/40' },
  BROKEN_FORMATTING: { label: 'Broken KaTeX / LaTeX Formatting', color: 'bg-purple-500/20 text-purple-300 border-purple-500/40' },
  MISSING_DIAGRAM: { label: 'Missing Diagram / Figure', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
  AMBIGUOUS_QUESTION: { label: 'Ambiguous Statement', color: 'bg-blue-500/20 text-blue-300 border-blue-400/40' },
  OTHER: { label: 'Other Defect', color: 'bg-slate-500/20 text-slate-300 border-slate-500/40' }
};

const STATUS_BADGES = {
  PENDING: { label: 'Pending Review', color: 'bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse' },
  QUARANTINED: { label: 'Quarantined (Purged)', color: 'bg-red-500/20 text-red-400 border-red-500/40' },
  DISMISSED: { label: 'Dismissed (Valid)', color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  FIXED: { label: 'Key Corrected', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40' },
  RESTORED: { label: 'Restored to Active', color: 'bg-blue-500/20 text-blue-300 border-blue-500/40' }
};

export default function QuestionReportsView({ user, onOpenAuth, onNavigateTab, isActive }) {
  const [reports, setReports] = useState([]);
  const [summary, setSummary] = useState({ total: 0, pending: 0, quarantined: 0, dismissed: 0, fixed: 0 });
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('PENDING'); // PENDING, ALL, QUARANTINED, DISMISSED, MY_REPORTS
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedSolutions, setExpandedSolutions] = useState({});
  const [actionLoadingId, setActionLoadingId] = useState(null);
  const [bannerMessage, setBannerMessage] = useState(null);

  // Edit / Fix Key Modal State
  const [editingReport, setEditingReport] = useState(null);
  const [editKey, setEditKey] = useState('');
  const [editSolution, setEditSolution] = useState('');
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const fetchReports = async () => {
    setLoading(true);
    try {
      const filterStatus = activeTab === 'MY_REPORTS' || activeTab === 'ALL' ? null : activeTab;
      const reporterId = activeTab === 'MY_REPORTS' ? user?.id : null;
      
      const [data, sum] = await Promise.all([
        api.questions.getReports({
          status: filterStatus,
          reporter_id: reporterId,
          limit: 150
        }),
        api.questions.getReportSummary().catch(() => ({ total: 0, pending: 0, quarantined: 0, dismissed: 0, fixed: 0 }))
      ]);

      setReports(Array.isArray(data) ? data : []);
      if (sum) setSummary(sum);
    } catch (err) {
      console.error('Failed to fetch question reports:', err);
      setReports([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isActive) {
      fetchReports();
    }
  }, [isActive, activeTab, user?.id]);

  const toggleSolution = (id) => {
    sound.click();
    setExpandedSolutions((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleQuarantine = async (report) => {
    if (!window.confirm(`Are you sure you want to quarantine question ${report.question_id}? It will be immediately purged from all tests, and bonus marks/Elo will be refunded to affected students.`)) {
      return;
    }
    sound.click();
    setActionLoadingId(report.report_id);
    try {
      const res = await api.questions.quarantine(report.question_id);
      sound.success?.();
      setBannerMessage({
        type: 'success',
        text: res.message || `Question ${report.question_id} quarantined and compensated!`
      });
      fetchReports();
    } catch (err) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to quarantine question.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleDismiss = async (report) => {
    sound.click();
    setActionLoadingId(report.report_id);
    try {
      const res = await api.questions.dismissReport(report.question_id);
      sound.success?.();
      setBannerMessage({
        type: 'success',
        text: res.message || `Report for question ${report.question_id} marked as valid & dismissed.`
      });
      fetchReports();
    } catch (err) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to dismiss report.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRestore = async (report) => {
    sound.click();
    setActionLoadingId(report.report_id);
    try {
      const res = await api.questions.restore(report.question_id);
      sound.success?.();
      setBannerMessage({
        type: 'success',
        text: res.message || `Question ${report.question_id} restored to active test pools.`
      });
      fetchReports();
    } catch (err) {
      setBannerMessage({ type: 'error', text: err.message || 'Failed to restore question.' });
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleOpenEditModal = (report) => {
    sound.click();
    setEditingReport(report);
    setEditKey(report.correct_answer || '');
    setEditSolution(report.solution_text || '');
  };

  const handleSubmitKeyFix = async (e) => {
    e.preventDefault();
    if (!editingReport) return;
    sound.click();
    setSubmittingEdit(true);
    try {
      const res = await api.questions.fixKey(editingReport.question_id, {
        correct_answer: editKey.trim().toUpperCase(),
        solution_text: editSolution.trim()
      });
      sound.success?.();
      setBannerMessage({
        type: 'success',
        text: res.message || `Key updated! Scores and Elo reconciled for all affected students.`
      });
      setEditingReport(null);
      fetchReports();
    } catch (err) {
      alert(err.message || 'Failed to fix question answer key.');
    } finally {
      setSubmittingEdit(false);
    }
  };

  const filteredReports = useMemo(() => {
    if (!searchQuery.trim()) return reports;
    const q = searchQuery.toLowerCase().trim();
    return reports.filter((r) => {
      const qid = (r.question_id || '').toLowerCase();
      const rep = (r.reporter_username || '').toLowerCase();
      const subj = (r.subject || '').toLowerCase();
      const chap = (r.chapter || '').toLowerCase();
      const text = (r.question_text || '').toLowerCase();
      const notes = (r.notes || '').toLowerCase();
      return (
        qid.includes(q) ||
        rep.includes(q) ||
        subj.includes(q) ||
        chap.includes(q) ||
        text.includes(q) ||
        notes.includes(q)
      );
    });
  }, [reports, searchQuery]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-transition space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#1c2230] via-[#22293b] to-[#1a1f2c] border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold uppercase tracking-wider mb-3">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Aspirant Feedback & Quality Assurance</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              Question Defect Reports Hub
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-2xl leading-relaxed">
              Review flagged items reported by candidates during tests. Inspect KaTeX formulas, verify answer keys,
              quarantine defects with automatic student Elo compensation, and keep the JEE question bank authentic.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                sound.click();
                fetchReports();
              }}
              disabled={loading}
              className="px-4 py-2.5 bg-[#2a3449] hover:bg-[#34405a] text-slate-200 hover:text-white rounded-xl border border-white/10 text-xs font-bold flex items-center gap-2 transition cursor-pointer shadow"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Global Stats Matrix */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mt-6 pt-6 border-t border-white/10">
          <div className="bg-[#141824]/60 border border-white/5 rounded-2xl p-3.5 text-center">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">Total Reports</span>
            <span className="text-xl font-mono font-black text-white mt-1 block">{summary.total}</span>
          </div>
          <div className="bg-[#141824]/60 border border-amber-500/30 rounded-2xl p-3.5 text-center">
            <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">Pending Review</span>
            <span className="text-xl font-mono font-black text-amber-300 mt-1 block">{summary.pending}</span>
          </div>
          <div className="bg-[#141824]/60 border border-red-500/20 rounded-2xl p-3.5 text-center">
            <span className="text-[11px] font-bold text-red-400 uppercase tracking-wider block">Quarantined</span>
            <span className="text-xl font-mono font-black text-red-300 mt-1 block">{summary.quarantined}</span>
          </div>
          <div className="bg-[#141824]/60 border border-cyan-500/20 rounded-2xl p-3.5 text-center">
            <span className="text-[11px] font-bold text-cyan-400 uppercase tracking-wider block">Fixed Keys</span>
            <span className="text-xl font-mono font-black text-cyan-300 mt-1 block">{summary.fixed}</span>
          </div>
          <div className="bg-[#141824]/60 border border-emerald-500/20 rounded-2xl p-3.5 text-center col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider block">Dismissed Valid</span>
            <span className="text-xl font-mono font-black text-emerald-300 mt-1 block">{summary.dismissed}</span>
          </div>
        </div>
      </div>

      {/* Banner Feedback Toast */}
      {bannerMessage && (
        <div
          className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-sm font-medium ${
            bannerMessage.type === 'error'
              ? 'bg-red-950/80 border-red-500/40 text-red-200'
              : 'bg-emerald-950/80 border-emerald-500/40 text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {bannerMessage.type === 'error' ? (
              <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
            ) : (
              <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
            )}
            <span>{bannerMessage.text}</span>
          </div>
          <button
            onClick={() => setBannerMessage(null)}
            className="text-white/60 hover:text-white p-1 rounded-lg transition"
          >
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Tabs and Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-1.5 p-1 bg-[#191f2c] border border-white/10 rounded-2xl overflow-x-auto">
          {[
            { id: 'PENDING', label: `Pending (${summary.pending || 0})` },
            { id: 'ALL', label: `All (${summary.total || 0})` },
            { id: 'QUARANTINED', label: `Quarantined (${summary.quarantined || 0})` },
            { id: 'DISMISSED', label: `Dismissed (${summary.dismissed || 0})` },
            ...(user ? [{ id: 'MY_REPORTS', label: 'My Submissions' }] : [])
          ].map((tab) => {
            const isActiveTab = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  sound.click();
                  setActiveTab(tab.id);
                }}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                  isActiveTab
                    ? 'bg-amber-500 text-black shadow-lg shadow-amber-500/20 font-black'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, subject, chapter, or notes..."
            className="w-full bg-[#1c2230] border border-white/10 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500/80 transition"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Main Reports List */}
      {loading ? (
        <div className="py-24 text-center flex flex-col items-center justify-center space-y-3">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
          <span className="text-sm font-bold text-slate-400">Loading flagged question reports...</span>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-[#1c2230] border border-white/10 rounded-3xl p-12 text-center flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-3xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
            <CheckCircle className="w-8 h-8" />
          </div>
          <div>
            <h3 className="text-lg font-black text-white">No Question Reports Found</h3>
            <p className="text-xs text-slate-400 max-w-sm mt-1">
              {activeTab === 'PENDING'
                ? 'All question reports have been reviewed and resolved. The question bank is verified!'
                : activeTab === 'MY_REPORTS'
                ? "You haven't reported any questions yet. When you encounter a defect during a test, use the Flag button."
                : 'No reports match your current filter and search criteria.'}
            </p>
          </div>
          {activeTab !== 'PENDING' && (
            <button
              onClick={() => {
                sound.click();
                setActiveTab('PENDING');
                setSearchQuery('');
              }}
              className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition"
            >
              Reset to Pending Reports
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {filteredReports.map((report) => {
            const reasonMeta = REASON_LABELS[report.reason] || REASON_LABELS.OTHER;
            const statusMeta = STATUS_BADGES[report.report_status] || STATUS_BADGES.PENDING;
            const isSolExpanded = expandedSolutions[report.report_id];
            const isActionBusy = actionLoadingId === report.report_id;

            return (
              <div
                key={report.report_id}
                className="bg-[#1c2230] border border-white/10 hover:border-amber-500/30 rounded-3xl p-6 sm:p-7 shadow-xl transition space-y-5 relative"
              >
                {/* Header Row */}
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 pb-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${statusMeta.color}`}>
                        {statusMeta.label}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${reasonMeta.color}`}>
                        {reasonMeta.label}
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#252c3c] text-slate-300 text-[11px] font-mono font-bold">
                        {report.subject} • {report.chapter}
                      </span>
                    </div>

                    <div className="text-xs text-slate-400 flex flex-wrap items-center gap-3 pt-1">
                      <span>
                        Question ID: <strong className="font-mono text-amber-400 font-semibold">{report.question_id}</strong>
                      </span>
                      <span>•</span>
                      <span>
                        Report ID: <span className="font-mono text-slate-300">{report.report_id}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{report.reported_at ? new Date(report.reported_at).toLocaleString() : 'Recent'}</span>
                      </span>
                    </div>
                  </div>

                  {/* Reporter Username Tag */}
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#141824] border border-white/5 text-xs text-slate-300">
                    <User className="w-3.5 h-3.5 text-amber-400" />
                    <span>Reported by: <strong className="text-white">{report.reporter_username || 'Guest'}</strong></span>
                  </div>
                </div>

                {/* Reporter's Notes */}
                {report.notes && (
                  <div className="p-3.5 rounded-2xl bg-amber-950/20 border border-amber-500/20 text-xs text-amber-200/90 flex items-start gap-2.5">
                    <Flag className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <strong className="text-amber-300 font-bold block mb-0.5">Student Notes / Feedback:</strong>
                      <p className="leading-relaxed italic">"{report.notes}"</p>
                    </div>
                  </div>
                )}

                {/* Question Statement Preview */}
                <div className="space-y-3">
                  <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-slate-400" />
                    <span>Question Statement</span>
                  </div>

                  <div className="bg-[#141824] border border-white/5 rounded-2xl p-4 text-sm text-slate-200 leading-relaxed overflow-x-auto">
                    <MathRenderer content={report.question_text} />
                  </div>
                </div>

                {/* Diagram Preview (if present) */}
                {report.diagram_urls && report.diagram_urls.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      <ImageIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>Attached Question Diagram</span>
                    </span>
                    <div className="flex flex-wrap gap-3">
                      {report.diagram_urls.map((url, idx) => (
                        <div key={idx} className="bg-white/5 border border-white/10 rounded-2xl p-2 max-w-sm">
                          <img
                            src={url}
                            alt={`Diagram ${idx + 1}`}
                            className="max-h-64 object-contain rounded-xl mx-auto"
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Options Grid (if MCQ) */}
                {Array.isArray(report.options) && report.options.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">
                      Options & Answer Key
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {report.options.map((opt, oIdx) => {
                        const optKey = opt.key || String.fromCharCode(65 + oIdx);
                        const isCorrectKey =
                          String(report.correct_answer || '').toUpperCase() === String(optKey).toUpperCase();
                        return (
                          <div
                            key={oIdx}
                            className={`p-3 rounded-2xl border flex items-start gap-3 text-xs ${
                              isCorrectKey
                                ? 'bg-emerald-950/40 border-emerald-500/60 text-emerald-200'
                                : 'bg-[#141824] border-white/5 text-slate-300'
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-lg font-black font-mono flex items-center justify-center shrink-0 ${
                                isCorrectKey
                                  ? 'bg-emerald-500 text-black'
                                  : 'bg-white/10 text-slate-300'
                              }`}
                            >
                              {optKey}
                            </span>
                            <div className="flex-1 min-w-0 pt-0.5 overflow-x-auto">
                              <MathRenderer content={opt.text} />
                            </div>
                            {isCorrectKey && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold text-[10px] shrink-0">
                                Recorded Key
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Answer Key Display for Numerical/Other */}
                {(!report.options || report.options.length === 0) && (
                  <div className="flex items-center gap-3 p-3 bg-[#141824] border border-white/5 rounded-2xl text-xs">
                    <span className="text-slate-400 font-bold">Recorded Answer Key:</span>
                    <span className="font-mono font-black text-amber-400 bg-amber-500/10 px-3 py-1 rounded-lg border border-amber-500/30">
                      {report.correct_answer || 'N/A'}
                    </span>
                  </div>
                )}

                {/* Solution Accordion */}
                {report.solution_text && (
                  <div className="border border-white/5 rounded-2xl bg-[#151a26] overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleSolution(report.report_id)}
                      className="w-full px-4 py-3 text-left text-xs font-bold text-slate-300 hover:text-white flex items-center justify-between cursor-pointer"
                    >
                      <span className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Official Solution & Explanation</span>
                      </span>
                      {isSolExpanded ? (
                        <ChevronUp className="w-4 h-4 text-slate-400" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </button>
                    {isSolExpanded && (
                      <div className="px-4 pb-4 pt-1 text-xs text-slate-300 border-t border-white/5 overflow-x-auto leading-relaxed">
                        <MathRenderer content={report.solution_text} />
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
                  <div className="text-[11px] text-slate-400 flex items-center gap-2">
                    {report.resolved_at && (
                      <span>
                        Resolved by <strong className="text-slate-300">{report.resolved_by || 'Admin'}</strong> on{' '}
                        {new Date(report.resolved_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {/* Fix Key Button */}
                    <button
                      type="button"
                      onClick={() => handleOpenEditModal(report)}
                      disabled={isActionBusy}
                      className="px-3.5 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit & Fix Key</span>
                    </button>

                    {/* Quarantine Button */}
                    {report.report_status !== 'QUARANTINED' && (
                      <button
                        type="button"
                        onClick={() => handleQuarantine(report)}
                        disabled={isActionBusy}
                        className="px-3.5 py-2 rounded-xl bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        {isActionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                        <span>Quarantine Defect</span>
                      </button>
                    )}

                    {/* Restore Button (if quarantined) */}
                    {report.report_status === 'QUARANTINED' && (
                      <button
                        type="button"
                        onClick={() => handleRestore(report)}
                        disabled={isActionBusy}
                        className="px-3.5 py-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        {isActionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5" />}
                        <span>Restore Question</span>
                      </button>
                    )}

                    {/* Dismiss Button */}
                    {report.report_status === 'PENDING' && (
                      <button
                        type="button"
                        onClick={() => handleDismiss(report)}
                        disabled={isActionBusy}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      >
                        {isActionBusy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle className="w-3.5 h-3.5" />}
                        <span>Dismiss (Mark Valid)</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit / Fix Key Modal */}
      {editingReport && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
          <div className="bg-[#1c2230] border border-cyan-500/40 rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-5">
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-bold uppercase tracking-wider mb-2">
                <Edit3 className="w-3.5 h-3.5" />
                <span>Reconcile Answer Key</span>
              </div>
              <h3 className="text-xl font-black text-white">Correct Question Answer Key</h3>
              <p className="text-xs text-slate-400 mt-1">
                Question ID: <span className="font-mono text-cyan-400 font-bold">{editingReport.question_id}</span>
              </p>
            </div>

            <form onSubmit={handleSubmitKeyFix} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Verified Correct Answer (e.g. A, B, C, D or numerical value)
                </label>
                <input
                  type="text"
                  required
                  value={editKey}
                  onChange={(e) => setEditKey(e.target.value)}
                  placeholder="e.g. A or 42 or 3.14"
                  className="w-full bg-[#141824] border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Solution Text / Explanation (Markdown & KaTeX supported)
                </label>
                <textarea
                  rows={4}
                  value={editSolution}
                  onChange={(e) => setEditSolution(e.target.value)}
                  placeholder="Provide updated step-by-step derivation..."
                  className="w-full bg-[#141824] border border-white/10 rounded-xl px-4 py-2.5 text-white text-xs focus:outline-none focus:border-cyan-500 transition font-mono"
                />
              </div>

              <div className="p-3 bg-cyan-950/30 border border-cyan-500/20 rounded-xl text-[11px] text-cyan-200/90 leading-relaxed">
                Saving will update the answer key and automatically award bonus marks & positive Elo delta
                to all students who selected this revised answer!
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingReport(null)}
                  disabled={submittingEdit}
                  className="px-4 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingEdit || !editKey.trim()}
                  className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black transition flex items-center gap-1.5 shadow-lg shadow-cyan-500/20"
                >
                  {submittingEdit && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save & Reconcile</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
