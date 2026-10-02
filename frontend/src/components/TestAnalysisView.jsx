import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import MathRenderer from './MathRenderer';
import { sound } from '../utils/sound';
import {
  ArrowLeft,
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
  Flag
} from 'lucide-react';
import ReportQuestionModal from './ReportQuestionModal';

export default function TestAnalysisView({ roomCode, user, onBack }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters for questions review
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL', 'CORRECT', 'INCORRECT', 'UNATTEMPTED'
  const [subjectFilter, setSubjectFilter] = useState('ALL'); // 'ALL', 'Physics', 'Chemistry', 'Mathematics'
  const [expandedSolutions, setExpandedSolutions] = useState({}); // qId -> bool
  const [reportTarget, setReportTarget] = useState(null); // { id, text }

  useEffect(() => {
    if (!roomCode) return;
    setLoading(true);
    api.rooms.results(roomCode)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || 'Failed to load test analysis.');
        setLoading(false);
      });
  }, [roomCode]);

  const toggleSolution = (qId) => {
    sound.click();
    setExpandedSolutions((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  const expandAll = () => {
    sound.click();
    const all = {};
    (data?.questions || []).forEach((item) => {
      all[item.question.id] = true;
    });
    setExpandedSolutions(all);
  };

  const collapseAll = () => {
    sound.click();
    setExpandedSolutions({});
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center font-mono">
        <div className="inline-block animate-spin text-orange-500 mb-4">
          <RefreshCw className="w-10 h-10" />
        </div>
        <h2 className="text-xl font-bold text-white">Synthesizing Examination Analytics...</h2>
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

  // Find calling user's participant record (or default to first if single-player mock)
  const myParticipant = (data.participants || []).find((p) => p.user_id === user?.id) || (data.participants || [])[0] || {};
  const userAnswers = myParticipant.answers || {};

  const questionsList = data.questions || [];
  const totalQuestions = questionsList.length;

  // Compute breakdown statistics
  let correctCount = 0;
  let incorrectCount = 0;
  let unattemptedCount = 0;

  const subjectStats = {
    Physics: { correct: 0, incorrect: 0, unattempted: 0, marks: 0, total: 0 },
    Chemistry: { correct: 0, incorrect: 0, unattempted: 0, marks: 0, total: 0 },
    Mathematics: { correct: 0, incorrect: 0, unattempted: 0, marks: 0, total: 0 },
  };

  const processedQuestions = questionsList.map((item, index) => {
    const q = item.question;
    const sol = item.solution;
    const userSubmission = userAnswers[q.id];

    let userSelected = null;
    let isCorrect = false;
    let isAttempted = false;
    let markDelta = 0.0;

    if (userSubmission) {
      if (typeof userSubmission === 'object') {
        userSelected = userSubmission.selected;
        isCorrect = Boolean(userSubmission.correct);
        markDelta = userSubmission.delta_marks !== undefined ? userSubmission.delta_marks : (isCorrect ? 4.0 : -1.0);
        isAttempted = userSelected !== 'NONE' && userSelected !== 'SKIPPED' && userSelected !== '' && userSelected !== null;
      } else {
        userSelected = userSubmission;
        isAttempted = userSelected !== 'NONE' && userSelected !== 'SKIPPED';
        isCorrect = String(userSelected).trim().toUpperCase() === String(sol.correct_answer).trim().toUpperCase();
        markDelta = isCorrect ? 4.0 : (isAttempted ? -1.0 : 0.0);
      }
    }

    if (!isAttempted) {
      unattemptedCount++;
    } else if (isCorrect) {
      correctCount++;
    } else {
      incorrectCount++;
    }

    // Update subject stats
    const subj = q.subject || 'Physics';
    if (subjectStats[subj]) {
      subjectStats[subj].total++;
      if (!isAttempted) subjectStats[subj].unattempted++;
      else if (isCorrect) {
        subjectStats[subj].correct++;
        subjectStats[subj].marks += 4.0;
      } else {
        subjectStats[subj].incorrect++;
        subjectStats[subj].marks -= 1.0;
      }
    }

    return {
      index: index + 1,
      q,
      sol,
      userSelected,
      isCorrect,
      isAttempted,
      markDelta,
    };
  });

  const attemptedCount = correctCount + incorrectCount;
  const accuracy = attemptedCount > 0 ? Math.round((correctCount / attemptedCount) * 100) : 0;
  const totalMarks = myParticipant.marks !== undefined ? myParticipant.marks : (correctCount * 4 - incorrectCount * 1);
  const maxPossibleMarks = totalQuestions * 4;

  // Filter questions for display
  const filteredQuestions = processedQuestions.filter((item) => {
    if (statusFilter === 'CORRECT' && (!item.isAttempted || !item.isCorrect)) return false;
    if (statusFilter === 'INCORRECT' && (!item.isAttempted || item.isCorrect)) return false;
    if (statusFilter === 'UNATTEMPTED' && item.isAttempted) return false;

    if (subjectFilter !== 'ALL' && item.q.subject !== subjectFilter) return false;
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-transition space-y-8">
      {/* Top Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm font-bold text-slate-300 hover:text-white transition cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Test History</span>
        </button>

        <div className="flex items-center gap-2 font-mono text-xs text-slate-400">
          <span className="px-2.5 py-1 rounded-lg bg-white/5 border border-white/10">
            Room #{data.room_code}
          </span>
          <span className="px-2.5 py-1 rounded-lg bg-orange-500/20 text-orange-400 font-bold border border-orange-500/30">
            {data.mode}
          </span>
        </div>
      </div>

      {/* Hero Scorecard */}
      <div className="bg-gradient-to-r from-[#172033] via-[#1f283c] to-[#172033] border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl glow-orange-subtle">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs px-3 py-1 rounded-full bg-orange-950 border border-orange-500/40 text-orange-400 font-mono font-bold uppercase tracking-wider">
                Comprehensive Diagnostic Report
              </span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
              {data.preset_name || 'Examination Test Paper'}
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1.5 font-mono">
              Evaluated with National Testing Agency (+4.0 Correct, -1.0 Negative Marking)
            </p>
          </div>

          {/* Primary Marks Dial */}
          <div className="flex flex-wrap items-center gap-4 bg-[#10141f] border border-white/10 rounded-2xl p-4 sm:p-5 shadow-xl">
            <div className="text-center sm:text-left pr-4 border-r border-white/10">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                Total Marks
              </span>
              <div className="text-3xl sm:text-4xl font-black text-orange-400 font-mono">
                {totalMarks}{' '}
                <span className="text-sm font-semibold text-slate-400 font-sans">
                  / {maxPossibleMarks}
                </span>
              </div>
            </div>

            <div className="text-center sm:text-left pl-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block font-mono">
                Accuracy
              </span>
              <div className="text-3xl sm:text-4xl font-black text-emerald-400 font-mono">
                {accuracy}%
              </div>
            </div>
          </div>
        </div>

        {/* 4-Stat Metric Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 mt-6 pt-6 border-t border-white/10 font-mono">
          <div className="bg-[#121724] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Attempted</span>
            <span className="text-xl font-bold text-white">
              {attemptedCount} <span className="text-xs text-slate-400">/ {totalQuestions}</span>
            </span>
          </div>
          <div className="bg-[#121724] border border-emerald-500/30 rounded-2xl p-4">
            <span className="text-xs text-emerald-400 block mb-1">Correct (+4)</span>
            <span className="text-xl font-bold text-emerald-300">
              {correctCount} <span className="text-xs text-emerald-400/80">questions</span>
            </span>
          </div>
          <div className="bg-[#121724] border border-red-500/30 rounded-2xl p-4">
            <span className="text-xs text-red-400 block mb-1">Incorrect (-1)</span>
            <span className="text-xl font-bold text-red-300">
              {incorrectCount} <span className="text-xs text-red-400/80">questions</span>
            </span>
          </div>
          <div className="bg-[#121724] border border-white/10 rounded-2xl p-4">
            <span className="text-xs text-slate-400 block mb-1">Unattempted</span>
            <span className="text-xl font-bold text-slate-300">
              {unattemptedCount} <span className="text-xs text-slate-400">questions</span>
            </span>
          </div>
        </div>
      </div>

      {/* Subject Performance Breakdown */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <BarChart2 className="w-5 h-5 text-orange-400" />
          <span>Subject Performance Matrix</span>
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { name: 'Physics', icon: '⚛️', color: 'cyan', stats: subjectStats.Physics },
            { name: 'Chemistry', icon: '🧪', color: 'emerald', stats: subjectStats.Chemistry },
            { name: 'Mathematics', icon: '📐', color: 'purple', stats: subjectStats.Mathematics },
          ].map((subj) => {
            const s = subj.stats;
            const subjAtt = s.correct + s.incorrect;
            const subjAcc = subjAtt > 0 ? Math.round((s.correct / subjAtt) * 100) : 0;
            return (
              <div
                key={subj.name}
                className="bg-[#161a24] border border-white/10 rounded-2xl p-5 shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-extrabold text-white flex items-center gap-2">
                      <span>{subj.icon}</span>
                      <span>{subj.name}</span>
                    </span>
                    <span className="text-xs px-2.5 py-0.5 rounded-full bg-white/10 font-mono font-bold text-slate-200">
                      {s.total} Qs
                    </span>
                  </div>

                  <div className="text-2xl font-black text-white font-mono mb-3">
                    {s.marks}{' '}
                    <span className="text-xs font-semibold text-slate-400 font-sans">
                      Marks
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs font-mono text-slate-300 border-t border-white/5 pt-3">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Accuracy:</span>
                      <span className="font-bold text-emerald-400">{subjAcc}%</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Correct:</span>
                      <span className="font-bold text-emerald-400">{s.correct}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Incorrect:</span>
                      <span className="font-bold text-red-400">{s.incorrect}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Skipped:</span>
                      <span className="font-bold text-slate-400">{s.unattempted}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Question Paper Review */}
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-orange-400" />
              <span>Step-by-Step Question Paper Review</span>
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Detailed derivations with formulas, official key comparison, and common pitfalls.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={expandAll}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition cursor-pointer"
            >
              Expand All
            </button>
            <button
              onClick={collapseAll}
              className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition cursor-pointer"
            >
              Collapse All
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Status Filters */}
          {[
            { id: 'ALL', label: `All (${processedQuestions.length})` },
            { id: 'CORRECT', label: `Correct (${correctCount})` },
            { id: 'INCORRECT', label: `Incorrect (${incorrectCount})` },
            { id: 'UNATTEMPTED', label: `Skipped (${unattemptedCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                sound.click();
                setStatusFilter(tab.id);
              }}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer font-mono ${
                statusFilter === tab.id
                  ? 'bg-orange-500 text-white shadow-md'
                  : 'bg-[#10141f] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* Subject Pills */}
          <div className="h-4 w-px bg-white/10 mx-1 hidden sm:block" />
          {['ALL', 'Physics', 'Chemistry', 'Mathematics'].map((s) => (
            <button
              key={s}
              onClick={() => {
                sound.click();
                setSubjectFilter(s);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                subjectFilter === s
                  ? 'bg-white/20 text-white border border-white/30'
                  : 'bg-[#10141f] text-slate-400 hover:text-white border border-white/10'
              }`}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Filtered Question Cards */}
        <div className="space-y-5">
          {filteredQuestions.length === 0 ? (
            <div className="bg-[#161a24] border border-white/10 rounded-2xl p-8 text-center text-slate-400 font-mono">
              No questions found matching your filter selection.
            </div>
          ) : (
            filteredQuestions.map((item) => {
              const q = item.q;
              const sol = item.sol;
              const isExpanded = Boolean(expandedSolutions[q.id]);

              return (
                <div
                  key={q.id}
                  className={`bg-[#161a24] border rounded-3xl p-6 sm:p-7 shadow-xl transition ${
                    item.isAttempted
                      ? item.isCorrect
                        ? 'border-emerald-500/40 hover:border-emerald-500/60'
                        : 'border-red-500/40 hover:border-red-500/60'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  {/* Question Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-white/10">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-orange-950/80 border border-orange-500/40 text-orange-400 rounded-lg text-xs font-bold font-mono">
                        Question {item.index}
                      </span>
                      <span className="text-xs font-semibold text-slate-300">
                        {q.subject} • {q.chapter}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 font-mono">
                      {/* Mark Tag */}
                      <span
                        className={`text-xs px-2.5 py-0.5 rounded-full font-bold ${
                          item.isAttempted
                            ? item.isCorrect
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-slate-700/50 text-slate-400 border border-slate-600'
                        }`}
                      >
                        {item.isAttempted
                          ? item.isCorrect
                            ? '+4.0 Marks'
                            : '-1.0 Negative'
                          : '0.0 Unattempted'}
                      </span>

                      {/* Report Question Button */}
                      <button
                        type="button"
                        onClick={() => {
                          sound.click();
                          setReportTarget({ id: q.id, text: q.text });
                        }}
                        className="text-xs font-sans text-slate-400 hover:text-amber-400 font-bold flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/5 hover:bg-amber-950/40 border border-white/10 hover:border-amber-500/40 transition cursor-pointer"
                        title="Report Defective Question"
                      >
                        <Flag className="w-3 h-3 text-amber-500" />
                        <span>Report</span>
                      </button>
                    </div>
                  </div>

                  {/* Question Text */}
                  <div className="text-sm sm:text-base text-slate-100 mb-4 leading-relaxed">
                    <MathRenderer content={q.text} />
                  </div>

                  {/* Diagram */}
                  {q.has_diagram && q.diagram_urls && q.diagram_urls.length > 0 && (
                    <div className="mb-4 bg-[#0e121a] border border-white/10 rounded-2xl p-4 inline-block">
                      <img
                        src={q.diagram_urls[0]}
                        alt="Question Diagram"
                        className="max-h-72 object-contain rounded-xl"
                      />
                    </div>
                  )}

                  {/* Options Grid (for MCQ) */}
                  {q.options && q.options.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-5">
                      {q.options.map((opt) => {
                        const isCorrectOpt = String(opt.key).trim().toUpperCase() === String(sol.correct_answer).trim().toUpperCase();
                        const isUserSelected = String(opt.key).trim().toUpperCase() === String(item.userSelected).trim().toUpperCase();

                        let optBorder = 'border-white/10 bg-[#10141f]';
                        let optBadge = null;

                        if (isCorrectOpt) {
                          optBorder = 'border-emerald-500/80 bg-emerald-950/30 text-emerald-200';
                          optBadge = (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-500 text-slate-950 font-mono">
                              Correct Key
                            </span>
                          );
                        } else if (isUserSelected && !item.isCorrect) {
                          optBorder = 'border-red-500/80 bg-red-950/30 text-red-200';
                          optBadge = (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500 text-white font-mono">
                              Your Selection
                            </span>
                          );
                        }

                        return (
                          <div
                            key={opt.key}
                            className={`border rounded-xl p-3 flex items-start justify-between gap-3 ${optBorder}`}
                          >
                            <div className="flex items-start gap-2.5">
                              <span className="w-5 h-5 rounded-full bg-white/10 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                                {opt.key}
                              </span>
                              <div className="text-xs sm:text-sm font-medium">
                                <MathRenderer content={opt.text} />
                              </div>
                            </div>
                            {optBadge}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Numerical Answer review */}
                  {(!q.options || q.options.length === 0) && (
                    <div className="bg-[#10141f] border border-white/10 rounded-xl p-3 mb-5 flex items-center justify-between text-xs font-mono">
                      <div>
                        <span className="text-slate-400">Your Answer: </span>
                        <span className={`font-bold ${item.isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                          {item.userSelected || 'Unattempted'}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400">Official Key: </span>
                        <span className="font-bold text-emerald-400">{sol.correct_answer}</span>
                      </div>
                    </div>
                  )}

                  {/* Toggle Solution Accordion */}
                  <button
                    onClick={() => toggleSolution(q.id)}
                    className="w-full py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white text-xs font-bold transition flex items-center justify-between border border-white/10 cursor-pointer"
                  >
                    <span className="flex items-center gap-1.5">
                      <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                      <span>{isExpanded ? 'Hide Derivation & Solution' : 'View Step-by-Step Derivation'}</span>
                    </span>
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>

                  {/* Solution Body */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-white/10 space-y-4 animate-fadeIn">
                      <div className="bg-[#10141f] border border-white/10 rounded-2xl p-5">
                        <span className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block font-mono mb-2">
                          Step-by-Step Mathematical Derivation
                        </span>
                        <div className="text-xs sm:text-sm text-slate-200 leading-relaxed font-sans">
                          <MathRenderer content={sol.solution_text || 'Detailed derivation not available.'} />
                        </div>
                      </div>

                      {/* Key Formulas */}
                      {sol.key_formulas && sol.key_formulas.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs text-slate-400 font-mono">Key Identities:</span>
                          {sol.key_formulas.map((kf, i) => (
                            <span
                              key={i}
                              className="text-xs font-mono px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/30 text-orange-300"
                            >
                              <MathRenderer content={kf} />
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Common Pitfall */}
                      {sol.common_pitfall && (
                        <div className="bg-amber-950/30 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-200">
                          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                          <div>
                            <strong className="font-bold text-amber-300 block mb-0.5">
                              Frequent Exam Pitfall
                            </strong>
                            <span>{sol.common_pitfall}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Report Question Modal */}
      <ReportQuestionModal
        isOpen={Boolean(reportTarget)}
        onClose={() => setReportTarget(null)}
        questionId={reportTarget?.id}
        questionText={reportTarget?.text}
      />
    </div>
  );
}
