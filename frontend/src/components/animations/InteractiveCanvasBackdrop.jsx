import React, { useEffect, useRef } from 'react';

/**
 * InteractiveCanvasBackdrop
 * Ultra-lightweight (35-node) constellation & radiant star particle backdrop.
 * Highly optimized: uses zero-allocation requestAnimationFrame loops, pauses
 * when offscreen (IntersectionObserver) or backgrounded (visibilitychange).
 */
export default function InteractiveCanvasBackdrop({
  particleCount = 36,
  connectionDistance = 110,
  speedMultiplier = 0.5,
  particleColor = 'rgba(249, 115, 22, 0.45)', // Orange accent
  lineColor = 'rgba(251, 146, 60, 0.12)',
  glowColor = 'rgba(251, 191, 36, 0.25)',
  className = '',
}) {
  const canvasRef = useRef(null);
  const animFrameIdRef = useRef(null);
  const isVisibleRef = useRef(true);
  const mouseRef = useRef({ x: -1000, y: -1000, radius: 120 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Check for reduced motion preference
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    if (prefersReducedMotion) return;

    const ctx = canvas.getContext('2d', { alpha: true });
    let width = (canvas.width = canvas.parentElement?.clientWidth || window.innerWidth);
    let height = (canvas.height = canvas.parentElement?.clientHeight || window.innerHeight);

    // Particle nodes definition
    const particles = [];
    for (let i = 0; i < particleCount; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5 * speedMultiplier,
        vy: (Math.random() - 0.5) * 0.5 * speedMultiplier,
        radius: Math.random() * 1.8 + 1.2,
        pulseSpeed: Math.random() * 0.02 + 0.01,
        pulseVal: Math.random() * Math.PI,
      });
    }

    const handleResize = () => {
      if (!canvas || !canvas.parentElement) return;
      width = canvas.width = canvas.parentElement.clientWidth;
      height = canvas.height = canvas.parentElement.clientHeight;
    };

    window.addEventListener('resize', handleResize);

    const handleMouseMove = (e) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current.x = e.clientX - rect.left;
      mouseRef.current.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouseRef.current.x = -1000;
      mouseRef.current.y = -1000;
    };

    const parent = canvas.parentElement;
    if (parent) {
      parent.addEventListener('mousemove', handleMouseMove, { passive: true });
      parent.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    }

    // Pause when offscreen
    const observer = new IntersectionObserver(
      ([entry]) => {
        isVisibleRef.current = entry.isIntersecting;
      },
      { threshold: 0.1 }
    );
    observer.observe(canvas);

    const handleVisibilityChange = () => {
      isVisibleRef.current = !document.hidden;
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Render loop
    const render = () => {
      if (!isVisibleRef.current) {
        animFrameIdRef.current = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      const mr = mouseRef.current.radius;
      const connDistSq = connectionDistance * connectionDistance;

      // Update and draw particles
      for (let i = 0; i < particleCount; i++) {
        const p = particles[i];

        // Move
        p.x += p.vx;
        p.y += p.vy;

        // Wrap around boundaries
        if (p.x < 0) p.x = width;
        else if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        else if (p.y > height) p.y = 0;

        // Mouse repulsion / proximity drift
        const dxm = p.x - mx;
        const dym = p.y - my;
        const distMouseSq = dxm * dxm + dym * dym;
        if (distMouseSq < mr * mr && distMouseSq > 0) {
          const distMouse = Math.sqrt(distMouseSq);
          const force = (mr - distMouse) / mr;
          p.x += (dxm / distMouse) * force * 1.5;
          p.y += (dym / distMouse) * force * 1.5;
        }

        // Pulse size
        p.pulseVal += p.pulseSpeed;
        const currentRadius = p.radius + Math.sin(p.pulseVal) * 0.4;

        // Draw particle dot
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, currentRadius), 0, Math.PI * 2);
        ctx.fillStyle = particleColor;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 6;
        ctx.fill();

        // Connect nearby nodes
        for (let j = i + 1; j < particleCount; j++) {
          const p2 = particles[j];
          const dx = p.x - p2.x;
          const dy = p.y - p2.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < connDistSq) {
            const alpha = 1 - Math.sqrt(distSq) / connectionDistance;
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = lineColor.replace('0.12', (alpha * 0.16).toFixed(3));
            ctx.lineWidth = 0.8;
            ctx.shadowBlur = 0;
            ctx.stroke();
          }
        }
      }

      animFrameIdRef.current = requestAnimationFrame(render);
    };

    animFrameIdRef.current = requestAnimationFrame(render);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      window.removeEventListener('resize', handleResize);
      if (parent) {
        parent.removeEventListener('mousemove', handleMouseMove);
        parent.removeEventListener('mouseleave', handleMouseLeave);
      }
      observer.disconnect();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [particleCount, connectionDistance, speedMultiplier, particleColor, lineColor, glowColor]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 pointer-events-none z-0 ${className}`}
      style={{ width: '100%', height: '100%' }}
    />
  );
}
