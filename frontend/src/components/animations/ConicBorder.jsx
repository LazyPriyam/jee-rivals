import React from 'react';

/**
 * ConicBorder
 * Wraps content with a GPU-accelerated rotating neon conic-gradient border.
 * Perfect for live matches, active tournaments, VIP ranks, and high-impact CTAs.
 */
const COLOR_GRADIENTS = {
  orange: 'from-orange-500 via-amber-400 to-orange-600',
  cyan: 'from-cyan-400 via-blue-500 to-indigo-500',
  emerald: 'from-emerald-400 via-teal-500 to-green-500',
  purple: 'from-fuchsia-500 via-purple-500 to-indigo-600',
  multi: 'from-orange-500 via-pink-500 to-cyan-400',
};

const COLOR_GLOWS = {
  orange: 'shadow-[0_0_25px_-5px_rgba(249,115,22,0.35)]',
  cyan: 'shadow-[0_0_25px_-5px_rgba(6,182,212,0.35)]',
  emerald: 'shadow-[0_0_25px_-5px_rgba(16,185,129,0.35)]',
  purple: 'shadow-[0_0_25px_-5px_rgba(168,85,247,0.35)]',
  multi: 'shadow-[0_0_25px_-5px_rgba(244,63,94,0.35)]',
};

export default function ConicBorder({
  children,
  color = 'orange',
  speed = '4s',
  thickness = '2px',
  rounded = 'rounded-2xl',
  className = '',
  innerClassName = 'bg-[#181d28]',
  active = true,
  onClick,
}) {
  if (!active) {
    return (
      <div className={`border border-white/10 ${rounded} ${className}`} onClick={onClick}>
        {children}
      </div>
    );
  }

  const glowClass = COLOR_GLOWS[color] || COLOR_GLOWS.orange;

  return (
    <div
      onClick={onClick}
      className={`relative p-[${thickness}] ${rounded} overflow-hidden ${glowClass} transition-shadow duration-300 ${className}`}
      style={{ padding: thickness }}
    >
      {/* 360-degree rotating conic gradient ribbon */}
      <div
        className="absolute -inset-[150%] animate-spin-slow pointer-events-none opacity-90"
        style={{
          animationDuration: speed,
          background:
            color === 'cyan'
              ? 'conic-gradient(from 0deg, transparent 0deg, #06b6d4 90deg, #3b82f6 180deg, #6366f1 270deg, transparent 360deg)'
              : color === 'emerald'
              ? 'conic-gradient(from 0deg, transparent 0deg, #10b981 90deg, #14b8a6 180deg, #22c55e 270deg, transparent 360deg)'
              : color === 'purple'
              ? 'conic-gradient(from 0deg, transparent 0deg, #a855f7 90deg, #ec4899 180deg, #6366f1 270deg, transparent 360deg)'
              : color === 'multi'
              ? 'conic-gradient(from 0deg, #f97316 0deg, #ec4899 90deg, #06b6d4 180deg, #eab308 270deg, #f97316 360deg)'
              : 'conic-gradient(from 0deg, transparent 0deg, #f97316 90deg, #fbbf24 180deg, #ea580c 270deg, transparent 360deg)',
        }}
      />

      {/* Inner surface */}
      <div className={`relative h-full w-full ${rounded} ${innerClassName} z-10 overflow-hidden`}>
        {children}
      </div>
    </div>
  );
}
