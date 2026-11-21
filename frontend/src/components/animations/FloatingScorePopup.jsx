import React, { useEffect, useState } from 'react';

/**
 * FloatingScorePopup
 * Renders gaming-style floating delta indicators (+4 Marks, -1, Streak x2!)
 * that punch into scale, drift upwards, and smoothly fade out.
 */
export default function FloatingScorePopup({
  text = '+4',
  type = 'positive', // 'positive' | 'negative' | 'streak' | 'info'
  onComplete,
  className = '',
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onComplete) onComplete();
    }, 1100);
    return () => clearTimeout(timer);
  }, [onComplete]);

  if (!visible) return null;

  const styleMap = {
    positive: 'text-emerald-400 bg-emerald-950/80 border-emerald-500/50 shadow-emerald-950/80',
    negative: 'text-rose-400 bg-rose-950/80 border-rose-500/50 shadow-rose-950/80',
    streak: 'text-amber-300 bg-amber-950/80 border-amber-500/50 shadow-amber-950/80',
    info: 'text-cyan-300 bg-cyan-950/80 border-cyan-500/50 shadow-cyan-950/80',
  };

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black font-mono border shadow-lg pointer-events-none animate-float-score-up select-none ${
        styleMap[type] || styleMap.positive
      } ${className}`}
    >
      {text}
    </div>
  );
}
