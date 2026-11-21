import React, { useRef, useState } from 'react';

/**
 * HoloSheen
 * Adds a holographic metallic foil sheen & light sweep reflection to cards and badges.
 * Supports continuous ambient sweep, or interactive mouse-tilt reflection highlights.
 */
export default function HoloSheen({
  children,
  className = '',
  rounded = 'rounded-2xl',
  continuous = false,
  interactive = true,
  intensity = 'normal', // 'subtle' | 'normal' | 'vibrant'
  disabled = false,
  onClick,
}) {
  const containerRef = useRef(null);
  const [mousePos, setMousePos] = useState({ x: 50, y: 50, active: false });

  if (disabled) {
    return (
      <div className={`${rounded} ${className}`} onClick={onClick}>
        {children}
      </div>
    );
  }

  const handleMouseMove = (e) => {
    if (!interactive || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    setMousePos({ x, y, active: true });
  };

  const handleMouseLeave = () => {
    setMousePos((prev) => ({ ...prev, active: false }));
  };

  const opacityClass =
    intensity === 'subtle'
      ? 'opacity-20'
      : intensity === 'vibrant'
      ? 'opacity-65'
      : 'opacity-40';

  return (
    <div
      ref={containerRef}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`relative ${rounded} overflow-hidden group ${className}`}
    >
      {/* Underlying content */}
      <div className="relative z-10 w-full h-full">{children}</div>

      {/* Ambient continuous diagonal sheen sweep */}
      {continuous && (
        <div
          className={`absolute inset-0 pointer-events-none z-20 ${opacityClass} animate-holo-sweep`}
          style={{
            background:
              'linear-gradient(115deg, transparent 25%, rgba(255,255,255,0.04) 40%, rgba(255,255,255,0.35) 50%, rgba(255,255,255,0.04) 60%, transparent 75%)',
            backgroundSize: '200% 200%',
          }}
        />
      )}

      {/* Interactive cursor-following spotlight sheen */}
      {interactive && mousePos.active && (
        <div
          className="absolute inset-0 pointer-events-none z-20 transition-opacity duration-300"
          style={{
            background: `radial-gradient(circle 180px at ${mousePos.x}% ${mousePos.y}%, rgba(255,255,255,0.12), transparent 70%)`,
          }}
        />
      )}

      {/* Prismatic border edge highlight */}
      <div className="absolute inset-0 pointer-events-none z-20 rounded-[inherit] border border-white/10 group-hover:border-white/20 transition-colors" />
    </div>
  );
}
