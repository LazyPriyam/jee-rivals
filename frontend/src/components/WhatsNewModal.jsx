import React from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Sparkles,
  CheckCircle2,
  Calendar,
  User,
  Shield,
  BookOpen,
  Zap,
  Layers,
  ArrowRight
} from 'lucide-react';
import { sound } from '../utils/sound';

const CATEGORY_META = {
  PLATFORM: {
    label: 'Platform Update',
    color: 'text-cyan-400 bg-cyan-950/60 border-cyan-500/40',
    icon: Zap,
  },
  SYLLABUS: {
    label: 'Syllabus & Curriculum',
    color: 'text-amber-400 bg-amber-950/60 border-amber-500/40',
    icon: Layers,
  },
  QUESTION_BANK: {
    label: 'Question Bank Update',
    color: 'text-orange-400 bg-orange-950/60 border-orange-500/40',
    icon: BookOpen,
  },
  MODERATION: {
    label: 'Moderation & Fair-Play',
    color: 'text-emerald-400 bg-emerald-950/60 border-emerald-500/40',
    icon: Shield,
  },
  ANNOUNCEMENT: {
    label: 'Official Announcement',
    color: 'text-purple-400 bg-purple-950/60 border-purple-500/40',
    icon: Sparkles,
  },
};

export default function WhatsNewModal({ update, isOpen, onClose, onMarkRead }) {
  if (!isOpen || !update) return null;

  const catMeta = CATEGORY_META[update.category?.toUpperCase()] || CATEGORY_META.PLATFORM;
  const CatIcon = catMeta.icon;

  const handleClose = () => {
    sound.click();
    if (onMarkRead && update.id) {
      onMarkRead(update.id);
    }
    onClose();
  };

  const formattedDate = update.created_at
    ? new Date(update.created_at).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : 'Recent';

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#181d28] border border-orange-500/40 rounded-3xl shadow-2xl overflow-hidden glow-orange-subtle flex flex-col max-h-[90vh]">
        {/* Modal Top Header */}
        <div className="relative p-6 bg-gradient-to-b from-[#222938] to-[#181d28] border-b border-white/10">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider font-mono border flex items-center gap-1.5 ${catMeta.color}`}>
                <CatIcon className="w-3 h-3" />
                <span>{catMeta.label}</span>
              </span>
              {update.version && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-white/10 text-slate-300 border border-white/10">
                  {update.version}
                </span>
              )}
            </div>
            <button
              onClick={handleClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <h3 className="text-xl font-black text-white leading-tight">
            {update.title}
          </h3>

          <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 font-mono">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              {formattedDate}
            </span>
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-500" />
              {update.author || 'System'}
            </span>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-200">
          {/* Summary Callout */}
          <div className="p-4 rounded-2xl bg-white/5 border border-white/10 leading-relaxed text-sm text-slate-300">
            {update.summary}
          </div>

          {/* Extended Details if present */}
          {update.details && (
            <p className="text-xs text-slate-400 leading-relaxed">
              {update.details}
            </p>
          )}

          {/* Highlights Checklist */}
          {Array.isArray(update.highlights) && update.highlights.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 font-mono">
                Key Highlights & Enhancements
              </h4>
              <div className="space-y-2">
                {update.highlights.map((hl, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2.5 p-2.5 rounded-xl bg-[#121620] border border-white/5 text-xs text-slate-200"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                    <span>{hl}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-[#141822] border-t border-white/10 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            JEE Rivals Release Network
          </span>
          <button
            type="button"
            onClick={handleClose}
            className="py-2 px-5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-xl shadow-lg shadow-orange-950/50 transition cursor-pointer flex items-center gap-1.5"
          >
            <span>Got it, thanks!</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
