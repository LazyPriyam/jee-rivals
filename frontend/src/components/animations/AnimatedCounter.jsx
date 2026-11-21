import React, { useState, useEffect, useRef } from 'react';

/**
 * AnimatedCounter
 * High-performance, GPU-friendly rolling odometer counter using requestAnimationFrame.
 * Features customizable easing (easeOutQuart), decimal precision, comma separation,
 * and animated glow pulse on value change.
 */
export default function AnimatedCounter({
  value = 0,
  duration = 850,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  formatComma = false,
}) {
  const targetNum = Number(value) || 0;
  const [displayValue, setDisplayValue] = useState(targetNum);
  const [isUpdating, setIsUpdating] = useState(false);
  const prevValueRef = useRef(targetNum);
  const rafRef = useRef(null);

  useEffect(() => {
    const startVal = prevValueRef.current;
    const endVal = targetNum;

    if (startVal === endVal) {
      setDisplayValue(endVal);
      return;
    }

    setIsUpdating(true);
    const startTime = performance.now();

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // easeOutQuart: very fast acceleration, ultra-smooth deceleration into target
      const eased = 1 - Math.pow(1 - progress, 4);
      const current = startVal + (endVal - startVal) * eased;

      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endVal);
        prevValueRef.current = endVal;
        setIsUpdating(false);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [targetNum, duration]);

  // Format string with decimals and comma grouping
  let formatted = decimals > 0 ? displayValue.toFixed(decimals) : Math.round(displayValue).toString();
  if (formatComma) {
    const parts = formatted.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    formatted = parts.join('.');
  }

  return (
    <span
      className={`inline-flex items-center tabular-nums transition-colors duration-200 ${
        isUpdating ? 'text-orange-400 drop-shadow-[0_0_8px_rgba(249,115,22,0.4)]' : ''
      } ${className}`}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}
