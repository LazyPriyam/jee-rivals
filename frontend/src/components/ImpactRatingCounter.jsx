import React, { useState, useEffect, useRef } from 'react';
import { sound } from '../utils/sound';
import { TrendingUp, TrendingDown, Minus, Zap, Sparkles } from 'lucide-react';

/**
 * ImpactRatingCounter
 * Displays rating change with a high-impact synchronized flying delta animation:
 * 1. Initial rating prominently displayed.
 * 2. Rating delta badge pops in immediately beside it.
 * 3. Delta badge swiftly flies toward and merges into the main rating.
 * 4. Main rating number counts up (or down) in sync with the flight.
 * 5. At impact moment: quick scale punch (1.22x), micro-shake, and radial flash.
 * 6. After impact: springs through an overshoot curve to resting state.
 * 7. Delta fades out as it merges, followed by a settled net change confirmation.
 */
export default function ImpactRatingCounter({
  label = 'Overall Rating',
  badgeText = 'National Ladder',
  icon: Icon = Zap,
  initialRating = 1200,
  targetRating = 1208,
  delta = 8,
  accent = 'orange', // 'orange' | 'cyan' | 'emerald' | 'purple'
  delay = 0,
}) {
  const [displayRating, setDisplayRating] = useState(Math.round(initialRating));
  const [phase, setPhase] = useState('entering'); // 'entering' | 'pop_in' | 'flying' | 'impact' | 'spring' | 'settled'
  const [flyProgress, setFlyProgress] = useState(0); // 0.0 to 1.0

  const rafRef = useRef(null);
  const timeoutRefs = useRef([]);

  const isPositive = Number(delta) > 0;
  const isNegative = Number(delta) < 0;
  const isZero = Number(delta) === 0;

  const numDelta = Number(delta) || 0;
  const formattedDelta = isPositive
    ? `+${numDelta % 1 === 0 ? numDelta : numDelta.toFixed(1)}`
    : `${numDelta % 1 === 0 ? numDelta : numDelta.toFixed(1)}`;

  // Choreographed animation lifecycle
  useEffect(() => {
    timeoutRefs.current.forEach(clearTimeout);
    timeoutRefs.current = [];
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const startVal = Math.round(initialRating);
    const endVal = Math.round(targetRating);

    setDisplayRating(startVal);
    setPhase('entering');
    setFlyProgress(0);

    const schedule = (fn, ms) => {
      const id = setTimeout(fn, ms);
      timeoutRefs.current.push(id);
      return id;
    };

    // Stage 1: Delta badge pops in beside the initial rating
    schedule(() => {
      setPhase('pop_in');
    }, delay + 50);

    // Stage 2: Swift flight towards number & synchronized count-up
    schedule(() => {
      setPhase('flying');

      const duration = 440; // ms for flight and synchronized count
      const startTime = performance.now();
      let lastAudioTick = 0;

      const animateFrame = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(1, elapsed / duration);
        setFlyProgress(progress);

        // easeOutQuad for natural deceleration toward impact
        const eased = 1 - (1 - progress) * (1 - progress);
        const curr = Math.round(startVal + (endVal - startVal) * eased);
        setDisplayRating(curr);

        // Subtle audio micro-tick during count-up
        if (now - lastAudioTick > 80 && progress < 0.9) {
          try {
            sound.tick();
          } catch (_) {}
          lastAudioTick = now;
        }

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animateFrame);
        } else {
          // Stage 3: IMPACT MOMENT!
          setDisplayRating(endVal);
          setPhase('impact');

          // Impact sound cue
          try {
            if (isPositive) {
              sound.playTone(660, 0.12, 'triangle');
              sound.playTone(880, 0.18, 'sine', 0.04);
            } else if (isNegative) {
              sound.playTone(200, 0.20, 'sawtooth');
            } else {
              sound.tick();
            }
          } catch (_) {}

          // Stage 4: Spring overshoot
          schedule(() => {
            setPhase('spring');

            // Stage 5: Settle cleanly to resting state
            schedule(() => {
              setPhase('settled');
            }, 320);
          }, 180);
        }
      };

      rafRef.current = requestAnimationFrame(animateFrame);
    }, delay + 380);

    return () => {
      timeoutRefs.current.forEach(clearTimeout);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [initialRating, targetRating, delta, delay]);

  // Delta badge flight styling
  // Translates leftwards towards the main rating number and scales down
  const flyTranslation = flyProgress * 48; // px toward rating number
  const flyScale = 1 - flyProgress * 0.25;
  const flyOpacity =
    phase === 'flying'
      ? flyProgress < 0.2
        ? 1
        : Math.max(0, 1 - (flyProgress - 0.2) / 0.8)
      : phase === 'pop_in'
      ? 1
      : 0;

  // Rating number transform state
  let ratingTransformStyle = {};
  let ratingAnimationClass = '';

  if (phase === 'impact') {
    ratingAnimationClass = 'animate-impact-shake';
    ratingTransformStyle = {
      transform: 'scale(1.22)',
    };
  } else if (phase === 'spring') {
    ratingTransformStyle = {
      transform: 'scale(1.05)',
      transition: 'transform 0.32s cubic-bezier(0.34, 1.56, 0.64, 1)',
    };
  } else if (phase === 'settled') {
    ratingTransformStyle = {
      transform: 'scale(1.0)',
      transition: 'transform 0.25s ease-out',
    };
  }

  // Accent theme colors
  const accentTheme = {
    orange: {
      border: 'border-orange-500/30',
      badgeBg: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
      glow: 'glow-orange-subtle',
      iconBox: 'bg-orange-500/20 text-orange-400 border-orange-500/40',
    },
    cyan: {
      border: 'border-cyan-500/30',
      badgeBg: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      glow: 'glow-cyan',
      iconBox: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/40',
    },
    emerald: {
      border: 'border-emerald-500/30',
      badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      glow: 'glow-emerald',
      iconBox: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
    },
    purple: {
      border: 'border-purple-500/30',
      badgeBg: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      glow: 'glow-amber',
      iconBox: 'bg-purple-500/20 text-purple-400 border-purple-500/40',
    },
  }[accent] || {
    border: 'border-white/10',
    badgeBg: 'bg-white/10 text-slate-300 border-white/20',
    glow: '',
    iconBox: 'bg-white/10 text-slate-300 border-white/20',
  };

  // Delta color styling
  const deltaBadgeClass = isPositive
    ? 'bg-gradient-to-r from-emerald-500/30 to-teal-500/30 text-emerald-300 border-emerald-400/60 shadow-lg shadow-emerald-500/20'
    : isNegative
    ? 'bg-gradient-to-r from-rose-500/30 to-red-500/30 text-rose-300 border-rose-400/60 shadow-lg shadow-rose-500/20'
    : 'bg-slate-700/40 text-slate-300 border-slate-600/40';

  const flashColor = isPositive
    ? 'from-emerald-400/70 via-emerald-500/30 to-transparent'
    : isNegative
    ? 'from-rose-500/70 via-red-500/30 to-transparent'
    : 'from-amber-400/60 via-amber-500/20 to-transparent';

  return (
    <div
      className={`relative overflow-hidden rounded-3xl bg-[#1c2230]/90 border ${accentTheme.border} p-5 sm:p-6 shadow-2xl backdrop-blur-md transition-all duration-300`}
    >
      {/* Background ambient gradient pulse */}
      <div className="absolute -top-12 -right-12 w-36 h-36 rounded-full bg-white/5 blur-2xl pointer-events-none" />

      {/* Header Row */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${accentTheme.iconBox}`}>
            <Icon className="w-4 h-4 fill-current" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-black uppercase tracking-wider text-slate-400 block leading-tight">
              {label}
            </span>
            <span className="text-xs font-bold text-white block truncate max-w-[200px] sm:max-w-[260px]">
              {badgeText}
            </span>
          </div>
        </div>

        {/* Status Pill */}
        <div className="shrink-0 font-mono text-[10px] uppercase font-bold">
          {isPositive ? (
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              <span>Skill Surge</span>
            </span>
          ) : isNegative ? (
            <span className="px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
              <TrendingDown className="w-3 h-3" />
              <span>Calibrated</span>
            </span>
          ) : (
            <span className="px-2.5 py-0.5 rounded-full bg-slate-700/40 text-slate-400 border border-slate-600/30">
              Steady
            </span>
          )}
        </div>
      </div>

      {/* Main Rating Stage with Flying Delta & Impact Flash */}
      <div className="relative py-2 flex items-center min-h-[72px]">
        {/* Impact Radial Flash Bloom */}
        {phase === 'impact' && (
          <div
            className={`absolute left-4 top-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-gradient-to-r ${flashColor} pointer-events-none animate-impact-flash z-0`}
          />
        )}

        {/* Main Rating Number Display */}
        <div className="relative z-10 flex items-center gap-3">
          <span
            style={ratingTransformStyle}
            className={`text-3xl sm:text-4xl font-black font-mono tracking-tight text-white inline-block origin-left ${ratingAnimationClass} ${
              phase === 'impact'
                ? isPositive
                  ? 'text-emerald-300 drop-shadow-[0_0_16px_rgba(52,211,153,0.9)]'
                  : 'text-rose-300 drop-shadow-[0_0_16px_rgba(244,63,94,0.9)]'
                : ''
            }`}
          >
            {displayRating}
          </span>

          <span className="text-xs font-mono font-bold text-slate-400 uppercase tracking-widest pt-1">
            ELO
          </span>

          {/* Flying Rating Delta Badge */}
          {(phase === 'pop_in' || phase === 'flying') && (
            <div
              style={{
                transform: `translateX(-${flyTranslation}px) scale(${flyScale})`,
                opacity: flyOpacity,
                transition: phase === 'flying' ? 'none' : undefined,
              }}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs sm:text-sm font-mono font-black border uppercase tracking-wider ${deltaBadgeClass} ${
                phase === 'pop_in' ? 'animate-rating-pop' : ''
              }`}
            >
              {isPositive && <Sparkles className="w-3.5 h-3.5 text-emerald-300 animate-pulse" />}
              <span>{formattedDelta}</span>
            </div>
          )}

          {/* Settled Net Change Badge */}
          {phase === 'settled' && (
            <div
              className={`animate-rating-pop inline-flex items-center gap-1 px-2.5 py-0.5 rounded-xl text-xs font-mono font-black border uppercase tracking-wider ${deltaBadgeClass}`}
            >
              {isPositive ? (
                <TrendingUp className="w-3 h-3 text-emerald-300" />
              ) : isNegative ? (
                <TrendingDown className="w-3 h-3 text-rose-300" />
              ) : (
                <Minus className="w-3 h-3 text-slate-400" />
              )}
              <span>{formattedDelta}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress Footer Subtitle */}
      <div className="pt-2 border-t border-white/5 flex items-center justify-between text-[11px] font-mono text-slate-400">
        <span className="flex items-center gap-1.5">
          <span>Starting:</span>
          <strong className="text-slate-200">{Math.round(initialRating)}</strong>
          <span>➔</span>
          <span>Target:</span>
          <strong className={isPositive ? 'text-emerald-400' : isNegative ? 'text-rose-400' : 'text-slate-200'}>
            {Math.round(targetRating)}
          </strong>
        </span>

        <span className="text-[10px] text-slate-500 uppercase tracking-wider">
          {phase === 'settled' ? '✓ Rating Synced' : 'Syncing...'}
        </span>
      </div>
    </div>
  );
}
