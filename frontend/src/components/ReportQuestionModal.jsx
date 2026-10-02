import React, { useState } from 'react';
import { Flag, X, AlertTriangle, CheckCircle, Send, Loader2 } from 'lucide-react';
import { api } from '../utils/api';
import sound from '../utils/sound';

const REPORT_REASONS = [
  { id: 'WRONG_ANSWER', label: 'Wrong Answer Key / Solution', desc: 'The recorded correct answer or solution explanation is wrong.' },
  { id: 'BROKEN_FORMATTING', label: 'Broken KaTeX / LaTeX Formatting', desc: 'Formulas, equations, or special symbols are unrendered or corrupted.' },
  { id: 'MISSING_DIAGRAM', label: 'Missing Diagram / Table / Figure', desc: 'The question mentions a figure, graph, or matrix table that is not displayed.' },
  { id: 'AMBIGUOUS_QUESTION', label: 'Ambiguous or Incomplete Statement', desc: 'Text has cut-off sentences, missing variables, or unclear question intent.' },
  { id: 'OTHER', label: 'Other Issue', desc: 'Any other problem not listed above.' }
];

export default function ReportQuestionModal({ isOpen, onClose, questionId, questionText }) {
  const [selectedReason, setSelectedReason] = useState('WRONG_ANSWER');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!questionId) return;

    sound.click();
    setSubmitting(true);
    setError('');

    try {
      await api.questions.report(questionId, {
        reason: selectedReason,
        notes: notes.trim()
      });
      setSubmitted(true);
      setTimeout(() => {
        setSubmitted(false);
        setNotes('');
        setSelectedReason('WRONG_ANSWER');
        onClose();
      }, 1600);
    } catch (err) {
      setError(err.message || 'Failed to submit report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#1c2230] border border-amber-500/30 rounded-3xl p-6 sm:p-7 shadow-2xl glow-orange-subtle max-h-[92vh] overflow-y-auto">
        {/* Close Button */}
        <button
          type="button"
          onClick={() => {
            sound.click();
            onClose();
          }}
          className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {submitted ? (
          <div className="py-8 text-center flex flex-col items-center justify-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center animate-bounce">
              <CheckCircle className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-black text-white">Report Logged</h3>
            <p className="text-sm text-slate-400 max-w-xs leading-relaxed">
              Thank you for keeping the question bank accurate! Your report has been dispatched to the human moderation hub.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Header */}
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-400 text-xs font-bold uppercase tracking-wider mb-2">
                <Flag className="w-3.5 h-3.5" />
                <span>Flag Defective Question</span>
              </div>
              <h2 className="text-xl font-black text-white tracking-tight">
                Report Issue for Human Review
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                Question ID: <span className="font-mono text-amber-400 font-bold">{questionId}</span>
              </p>
            </div>

            {/* Snippet preview if available */}
            {questionText && (
              <div className="p-3 bg-[#141824] border border-white/5 rounded-2xl text-xs text-slate-400 line-clamp-2 italic">
                "{questionText.replace(/<[^>]*>/g, '').slice(0, 150)}..."
              </div>
            )}

            {/* Error banner */}
            {error && (
              <div className="p-3 bg-red-950/60 border border-red-500/40 rounded-xl text-xs text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {/* Reasons List */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300 block">
                Select Reason for Report
              </label>
              {REPORT_REASONS.map((r) => {
                const isSelected = selectedReason === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => {
                      sound.click();
                      setSelectedReason(r.id);
                    }}
                    className={`w-full p-3 rounded-2xl border text-left transition cursor-pointer flex items-start gap-3 ${
                      isSelected
                        ? 'bg-amber-950/40 border-amber-500/80 text-white shadow-md'
                        : 'bg-[#22293b] border-white/5 text-slate-400 hover:border-white/20'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full mt-0.5 border flex items-center justify-center shrink-0 ${
                        isSelected
                          ? 'border-amber-400 bg-amber-500'
                          : 'border-slate-500'
                      }`}
                    >
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div>
                      <div className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                        {r.label}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                        {r.desc}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Notes Textarea */}
            <div>
              <label className="text-xs font-bold text-slate-300 block mb-1.5">
                Additional Notes or Corrections (Optional)
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. Option B should be 4 m/s instead of 2 m/s, or Figure 2 is cut off..."
                rows={3}
                className="w-full px-3.5 py-2.5 bg-[#141824] border border-white/10 rounded-2xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 transition resize-none"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  onClose();
                }}
                className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/5 text-xs text-slate-400 font-bold transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-xs font-black rounded-xl transition shadow-lg shadow-orange-950/50 flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    <span>Send Report to Hub</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
