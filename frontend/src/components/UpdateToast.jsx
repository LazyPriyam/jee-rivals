import React, { useEffect, useState } from 'react';
import {
  Bell,
  Sparkles,
  X,
  ArrowRight,
  Shield,
  Layers,
  BookOpen,
  Zap
} from 'lucide-react';
import { sound } from '../utils/sound';

const CATEGORY_ICONS = {
  PLATFORM: Zap,
  SYLLABUS: Layers,
  QUESTION_BANK: BookOpen,
  MODERATION: Shield,
  ANNOUNCEMENT: Sparkles,
};

export default function UpdateToast({ update, onDismiss, onViewDetails }) {
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (update) {
      setVisible(true);
      setProgress(100);
      try {
        sound.notif();
      } catch (_) {}

      // Auto dismiss after 8 seconds
      const startTime = Date.now();
      const duration = 8000;
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
        setProgress(remaining);
        if (elapsed >= duration) {
          clearInterval(interval);
          handleClose();
        }
      }, 50);

      return () => clearInterval(interval);
    }
  }, [update?.id]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => {
      if (onDismiss) onDismiss();
    }, 200);
  };

  const handleView = () => {
    sound.click();
    handleClose();
    if (onViewDetails) {
      onViewDetails(update);
    }
  };

  if (!update || !visible) return null;

  const category = (update.category || 'PLATFORM').toUpperCase();
  const IconComponent = CATEGORY_ICONS[category] || Sparkles;

  return (
    <div className="fixed top-5 right-5 z-50 max-w-sm w-[calc(100vw-2.5rem)] animate-in slide-in-from-top-4 fade-in duration-300">
      <div className="relative bg-[#191f2d]/95 backdrop-blur-md border border-orange-500/40 rounded-2xl shadow-2xl overflow-hidden glow-orange-subtle text-white p-4">
        {/* Progress bar line at top */}
        <div
          className="absolute top-0 left-0 h-1 bg-gradient-to-r from-orange-500 to-amber-400 transition-all duration-75"
          style={{ width: `${progress}%` }}
        />

        <div className="flex items-start gap-3">
          {/* Glowing Icon Badge */}
          <div className="w-9 h-9 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center shrink-0 mt-0.5">
            <IconComponent className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            {/* Tagline & Close */}
            <div className="flex items-center justify-between gap-1 mb-1">
              <span className="text-[10px] font-mono font-black uppercase tracking-wider text-orange-400 flex items-center gap-1">
                <span>⚡ UPDATE DETECTED</span>
                {update.version && <span className="text-slate-400">• {update.version}</span>}
              </span>
              <button
                type="button"
                onClick={handleClose}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
                title="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Title */}
            <h4 className="text-xs font-black text-white leading-snug line-clamp-2">
              {update.title}
            </h4>

            {/* Snippet */}
            <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">
              {update.summary}
            </p>

            {/* Action Bar */}
            <div className="flex items-center gap-2 mt-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={handleView}
                className="py-1 px-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-[11px] rounded-lg shadow transition cursor-pointer flex items-center gap-1"
              >
                <span>Read Details</span>
                <ArrowRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={handleClose}
                className="py-1 px-2.5 text-slate-400 hover:text-white text-[11px] rounded-lg hover:bg-white/5 transition cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
