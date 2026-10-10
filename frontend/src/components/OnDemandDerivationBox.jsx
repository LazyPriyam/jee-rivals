import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Zap,
  RefreshCw,
  AlertTriangle,
  Flag,
  BookOpen,
  CheckCircle2,
  Loader2,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import MathRenderer from './MathRenderer';
import { api } from '../utils/api';
import sound from '../utils/sound';

export default function OnDemandDerivationBox({
  questionId,
  officialKey,
  initialSolution = null,
  onReportClick,
  compact = false,
  defaultExpanded = true
}) {
  const [derivation, setDerivation] = useState(() => {
    if (!initialSolution) return null;
    if (typeof initialSolution === 'string' && initialSolution.trim()) {
      return { solution_text: initialSolution };
    }
    if (typeof initialSolution === 'object' && initialSolution.solution_text) {
      return initialSolution;
    }
    return null;
  });

  const [isDeriving, setIsDeriving] = useState(false);
  const [error, setError] = useState('');
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  // Sync if initialSolution changes (e.g. question navigated)
  useEffect(() => {
    if (!initialSolution) {
      setDerivation(null);
    } else if (typeof initialSolution === 'string' && initialSolution.trim()) {
      setDerivation({ solution_text: initialSolution });
    } else if (typeof initialSolution === 'object' && initialSolution.solution_text) {
      setDerivation(initialSolution);
    } else {
      setDerivation(null);
    }
    setError('');
  }, [questionId, initialSolution]);

  const handleDerive = async (force = false) => {
    if (!questionId) return;
    try {
      sound.click();
    } catch (_) {}
    setIsDeriving(true);
    setError('');

    try {
      const res = await api.questions.deriveSolution(questionId, force);
      if (res && res.solution_text) {
        setDerivation(res);
        setIsExpanded(true);
      } else {
        setError('Derivation completed but no steps were returned. Please try re-deriving.');
      }
    } catch (err) {
      console.error('Failed to derive solution:', err);
      setError('Derivation service is momentarily busy. Please try again in a few seconds.');
    } finally {
      setIsDeriving(false);
    }
  };

  const hasSolution = Boolean(derivation?.solution_text && derivation.solution_text.trim());

  return (
    <div className={`rounded-2xl border transition-all ${
      hasSolution
        ? 'bg-[#181d2a] border-cyan-500/25 shadow-lg shadow-cyan-950/20'
        : 'bg-[#141824] border-white/10'
    } ${compact ? 'p-3.5' : 'p-4 sm:p-5'}`}>

      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-2 border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 font-mono text-xs font-bold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Official Key: <strong className="text-white ml-0.5">{officialKey || 'Verified'}</strong></span>
          </div>

          {hasSolution && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[11px] font-mono text-cyan-400 bg-cyan-950/50 px-2 py-0.5 rounded border border-cyan-500/30">
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>Grounded Proof</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {onReportClick && (
            <button
              type="button"
              onClick={() => {
                try { sound.click(); } catch (_) {}
                onReportClick();
              }}
              className="text-[11px] text-amber-400 hover:text-amber-300 font-bold flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-950/40 border border-amber-500/30 transition cursor-pointer"
              title="Flag or Report Answer Key Discrepancy"
            >
              <Flag className="w-3 h-3 text-amber-400" />
              <span>Report Key</span>
            </button>
          )}

          {hasSolution && (
            <button
              type="button"
              disabled={isDeriving}
              onClick={() => handleDerive(true)}
              className="text-[11px] text-slate-300 hover:text-white font-mono flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition cursor-pointer disabled:opacity-50"
              title="Generate a fresh on-demand step-by-step derivation"
            >
              <RefreshCw className={`w-3 h-3 text-cyan-400 ${isDeriving ? 'animate-spin' : ''}`} />
              <span>{isDeriving ? 'Deriving...' : 'Re-derive'}</span>
            </button>
          )}

          {hasSolution && (
            <button
              type="button"
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer"
              title={isExpanded ? 'Collapse Derivation' : 'Expand Derivation'}
            >
              {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Main Body */}
      {hasSolution ? (
        isExpanded && (
          <div className="mt-3.5 space-y-3.5 animate-fadeIn">
            {/* Step-by-Step Derivation */}
            <div className="text-xs sm:text-sm text-slate-200 leading-relaxed overflow-x-auto">
              <MathRenderer content={derivation.solution_text} />
            </div>

            {/* Key Formulas if available */}
            {Array.isArray(derivation.key_formulas) && derivation.key_formulas.length > 0 && (
              <div className="pt-2 border-t border-white/5">
                <span className="text-[10px] uppercase font-mono font-bold text-cyan-400 tracking-wider block mb-1.5">
                  Governing Formulas:
                </span>
                <div className="flex flex-wrap gap-2">
                  {derivation.key_formulas.map((f, i) => (
                    <div
                      key={i}
                      className="px-2.5 py-1 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-cyan-200 text-xs font-mono"
                    >
                      <MathRenderer content={f} />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Common Pitfall Trap */}
            {derivation.common_pitfall && (
              <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  <strong className="text-amber-300 font-bold block mb-0.5">Common Aspirant Trap:</strong>
                  <span>{derivation.common_pitfall}</span>
                </div>
              </div>
            )}
          </div>
        )
      ) : (
        /* On-Demand Derivation CTA */
        <div className="mt-3 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20">
          <div className="space-y-0.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 font-mono">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>On-Demand Step-by-Step Derivation</span>
            </div>
            <p className="text-[11px] text-slate-400">
              Need to see how this answer was reached? Request a step-by-step mathematical proof anchored strictly to the verified answer key.
            </p>
            {error && (
              <p className="text-[11px] text-rose-400 font-medium pt-1">
                {error}
              </p>
            )}
          </div>

          <button
            type="button"
            disabled={isDeriving}
            onClick={() => handleDerive(false)}
            className="shrink-0 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isDeriving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deriving Proof...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5 text-cyan-200" />
                <span>⚡ Request Derivation</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
