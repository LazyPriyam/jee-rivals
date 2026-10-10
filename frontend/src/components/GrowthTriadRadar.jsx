import React, { useState } from 'react';
import {
  Compass,
  Zap,
  Target,
  Sparkles,
  Trophy,
  Award,
  ChevronRight,
  Info,
  CheckCircle2,
  Clock,
  BookOpen,
  Flame,
  ArrowRight
} from 'lucide-react';
import { sound } from '../utils/sound';

export default function GrowthTriadRadar({ growthTriad, user, compact = false, onNavigateTab }) {
  const [activePillar, setActivePillar] = useState('ALL'); // 'ALL', 'KNOWLEDGE', 'SPEED', 'ACCURACY'
  const [showAchievements, setShowAchievements] = useState(false);

  // Fallback defaults if growthTriad is still loading or newly registered
  const triad = growthTriad || {
    chapter_knowledge: 15.0,
    speed: 60.0,
    accuracy: 65.0,
    composite: 46.7,
    active_chapters: 14,
    total_chapters: 92,
    breadth_percent: 15.2,
    mastered_chapters: 2,
    avg_pacing_seconds: 105,
    rolling_accuracy_percent: 65.0,
    negative_mark_drain: 0.0,
    directive: 'Begin your journey across the 92 chapters to build a rock-solid foundation.',
    triad_achievements: []
  };

  const kScore = Math.max(8, Math.min(100, triad.chapter_knowledge || 10));
  const sScore = Math.max(8, Math.min(100, triad.speed || 50));
  const aScore = Math.max(8, Math.min(100, triad.accuracy || 50));
  const compositeScore = triad.composite || Math.round((kScore + sScore + aScore) / 3);

  // SVG Geometry: Center (130, 120), Max Radius = 85
  const cx = 130;
  const cy = 115;
  const rMax = 82;

  // Angles in radians:
  // Top (Knowledge): -90 deg (-pi/2)
  // Bottom Left (Speed): 150 deg (5pi/6)
  // Bottom Right (Accuracy): 30 deg (pi/6)
  const angleK = -Math.PI / 2;
  const angleS = (5 * Math.PI) / 6;
  const angleA = Math.PI / 6;

  // Vertex points on full triangle (100% boundary)
  const pk100 = { x: cx + rMax * Math.cos(angleK), y: cy + rMax * Math.sin(angleK) };
  const ps100 = { x: cx + rMax * Math.cos(angleS), y: cy + rMax * Math.sin(angleS) };
  const pa100 = { x: cx + rMax * Math.cos(angleA), y: cy + rMax * Math.sin(angleA) };

  // Helper for concentric grid triangles
  const getGridPoints = (fraction) => {
    const r = rMax * fraction;
    const pk = { x: cx + r * Math.cos(angleK), y: cy + r * Math.sin(angleK) };
    const ps = { x: cx + r * Math.cos(angleS), y: cy + r * Math.sin(angleS) };
    const pa = { x: cx + r * Math.cos(angleA), y: cy + r * Math.sin(angleA) };
    return `${pk.x},${pk.y} ${ps.x},${ps.y} ${pa.x},${pa.y}`;
  };

  // User's actual plotted triangle coordinates
  const rK = rMax * (kScore / 100);
  const rS = rMax * (sScore / 100);
  const rA = rMax * (aScore / 100);

  const userPk = { x: cx + rK * Math.cos(angleK), y: cy + rK * Math.sin(angleK) };
  const userPs = { x: cx + rS * Math.cos(angleS), y: cy + rS * Math.sin(angleS) };
  const userPa = { x: cx + rA * Math.cos(angleA), y: cy + rA * Math.sin(angleA) };
  const userPoints = `${userPk.x},${userPk.y} ${userPs.x},${userPs.y} ${userPa.x},${userPa.y}`;

  const achievements = triad.triad_achievements || [];
  const unlockedCount = achievements.filter((a) => a.is_unlocked).length;

  return (
    <div className={`bg-gradient-to-br from-[#181d2a] via-[#131620] to-[#0c0e15] border border-white/10 rounded-3xl p-5 sm:p-7 shadow-2xl relative overflow-hidden transition ${compact ? '' : 'my-2'}`}>
      {/* Background ambient subtle glow */}
      <div className="absolute -top-16 -right-16 w-56 h-56 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[10px] font-mono font-black uppercase text-orange-400 bg-orange-500/15 px-2.5 py-0.5 rounded-full border border-orange-500/30 flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-orange-400" />
              <span>Aspirant Growth Triad</span>
            </span>
            <span className="text-xs text-slate-400 font-mono hidden sm:inline">
              Authoritative Progress Matrix
            </span>
          </div>
          <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            <span>Chapter Knowledge • Speed • Accuracy</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            The 3 non-negotiable pillars that govern real percentile in JEE Main & Advanced.
          </p>
        </div>

        {/* Composite Badge */}
        <div className="flex items-center gap-3 shrink-0">
          <div className="bg-[#0f121a] border border-white/10 px-4 py-2.5 rounded-2xl text-center sm:text-right shadow-inner">
            <span className="text-[10px] font-mono uppercase text-slate-400 block">Triad Index</span>
            <div className="flex items-baseline gap-1.5 justify-center sm:justify-end">
              <span className="text-2xl font-black font-mono text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-amber-300 to-yellow-400">
                {compositeScore}
              </span>
              <span className="text-[11px] font-bold text-slate-500">/ 100</span>
            </div>
          </div>
        </div>
      </div>

      {/* Body: Radar Geometry & Pillar Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center mt-5">
        {/* Left: Interactive 3-Axis Radar (SVG) */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl bg-[#0e111a]/60 border border-white/5 relative">
          <svg
            viewBox="0 0 260 230"
            className="w-full max-w-[270px] h-auto drop-shadow-[0_0_15px_rgba(249,115,22,0.15)] select-none"
          >
            <defs>
              <linearGradient id="triadGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
                <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.45" />
              </linearGradient>
              <linearGradient id="gridStroke" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" stopOpacity="0.15" />
                <stop offset="100%" stopColor="#ffffff" stopOpacity="0.05" />
              </linearGradient>
            </defs>

            {/* Concentric Grid Guides (25%, 50%, 75%, 100%) */}
            <polygon points={getGridPoints(0.25)} fill="none" stroke="url(#gridStroke)" strokeWidth="1" strokeDasharray="3 3" />
            <polygon points={getGridPoints(0.50)} fill="none" stroke="url(#gridStroke)" strokeWidth="1" strokeDasharray="3 3" />
            <polygon points={getGridPoints(0.75)} fill="none" stroke="url(#gridStroke)" strokeWidth="1" strokeDasharray="3 3" />
            <polygon points={getGridPoints(1.00)} fill="#151a26/30" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" />

            {/* 3 Radiating Axis Spines */}
            <line x1={cx} y1={cy} x2={pk100.x} y2={pk100.y} stroke="rgba(16, 185, 129, 0.4)" strokeWidth="1.5" />
            <line x1={cx} y1={cy} x2={ps100.x} y2={ps100.y} stroke="rgba(6, 182, 212, 0.4)" strokeWidth="1.5" />
            <line x1={cx} y1={cy} x2={pa100.x} y2={pa100.y} stroke="rgba(245, 158, 11, 0.4)" strokeWidth="1.5" />

            {/* User Plotted Growth Area */}
            <polygon
              points={userPoints}
              fill="url(#triadGradient)"
              stroke="#f97316"
              strokeWidth="2.5"
              className="transition-all duration-700 ease-out"
            />

            {/* Center Anchor */}
            <circle cx={cx} cy={cy} r="3" fill="#94a3b8" opacity="0.6" />

            {/* Vertex Nodes with Glow */}
            {/* Knowledge Vertex */}
            <circle cx={userPk.x} cy={userPk.y} r="5" fill="#10b981" className="shadow" />
            <circle cx={userPk.x} cy={userPk.y} r="8" fill="none" stroke="#10b981" strokeWidth="1.5" opacity="0.7" className="animate-ping" />

            {/* Speed Vertex */}
            <circle cx={userPs.x} cy={userPs.y} r="5" fill="#06b6d4" className="shadow" />
            <circle cx={userPs.x} cy={userPs.y} r="8" fill="none" stroke="#06b6d4" strokeWidth="1.5" opacity="0.7" />

            {/* Accuracy Vertex */}
            <circle cx={userPa.x} cy={userPa.y} r="5" fill="#f59e0b" className="shadow" />
            <circle cx={userPa.x} cy={userPa.y} r="8" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.7" />

            {/* Vertex Labels */}
            {/* Top: Chapter Knowledge */}
            <text x={pk100.x} y={pk100.y - 12} textAnchor="middle" fill="#10b981" fontSize="10" fontWeight="900" fontFamily="monospace">
              KNOWLEDGE {Math.round(kScore)}
            </text>

            {/* Bottom Left: Speed */}
            <text x={ps100.x - 10} y={ps100.y + 16} textAnchor="middle" fill="#06b6d4" fontSize="10" fontWeight="900" fontFamily="monospace">
              SPEED {Math.round(sScore)}
            </text>

            {/* Bottom Right: Accuracy */}
            <text x={pa100.x + 10} y={pa100.y + 16} textAnchor="middle" fill="#f59e0b" fontSize="10" fontWeight="900" fontFamily="monospace">
              ACCURACY {Math.round(aScore)}
            </text>
          </svg>

          {/* Quick Pillar Filter Buttons */}
          <div className="flex items-center gap-1.5 mt-2">
            {[
              { id: 'ALL', label: 'All 3' },
              { id: 'KNOWLEDGE', label: 'Knowledge' },
              { id: 'SPEED', label: 'Speed' },
              { id: 'ACCURACY', label: 'Accuracy' }
            ].map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  sound.click();
                  setActivePillar(p.id);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold font-mono transition cursor-pointer ${
                  activePillar === p.id
                    ? 'bg-white/15 text-white border border-white/25 shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right: Detailed 3-Pillar Diagnostics Cards */}
        <div className="lg:col-span-7 space-y-3">
          {/* Pillar 1: Chapter Knowledge */}
          {(activePillar === 'ALL' || activePillar === 'KNOWLEDGE') && (
            <div
              onClick={() => {
                if (onNavigateTab) {
                  sound.click();
                  onNavigateTab('mastery');
                }
              }}
              className={`p-3.5 sm:p-4 rounded-2xl bg-[#141824] border border-emerald-500/30 hover:border-emerald-500/60 transition ${
                onNavigateTab ? 'cursor-pointer hover:bg-[#161e2a] group' : ''
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-white tracking-wider flex items-center gap-1.5">
                      <span>Chapter Knowledge</span>
                      {onNavigateTab && (
                        <ArrowRight className="w-3.5 h-3.5 text-emerald-400 opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                      )}
                    </h4>
                    <span className="text-[10px] text-slate-400">
                      Syllabus Breadth & Depth {onNavigateTab ? '• View 92-Chapter Matrix →' : ''}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black font-mono text-emerald-400">
                    {Math.round(kScore)}
                  </span>
                  <span className="text-[10px] text-slate-500"> / 100</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-500"
                  style={{ width: `${kScore}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>
                  Active: <strong className="text-white">{triad.active_chapters || 0}</strong> / {triad.total_chapters || 92} chapters ({triad.breadth_percent || 0}%)
                </span>
                <span>
                  Mastered: <strong className="text-emerald-400">{triad.mastered_chapters || 0}</strong> chapters
                </span>
              </div>
            </div>
          )}

          {/* Pillar 2: Speed */}
          {(activePillar === 'ALL' || activePillar === 'SPEED') && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-[#141824] border border-cyan-500/30 hover:border-cyan-500/50 transition">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400">
                    <Zap className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-white tracking-wider">
                      Execution Speed & Pacing
                    </h4>
                    <span className="text-[10px] text-slate-400">Seconds / Question vs Target</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black font-mono text-cyan-400">
                    {Math.round(sScore)}
                  </span>
                  <span className="text-[10px] text-slate-500"> / 100</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-400 transition-all duration-500"
                  style={{ width: `${sScore}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>
                  Avg Pace: <strong className="text-white">~{triad.avg_pacing_seconds || 95}s</strong> / question
                </span>
                <span className="text-slate-400">
                  Target: Chem 70s • Phys 120s • Math 170s
                </span>
              </div>
            </div>
          )}

          {/* Pillar 3: Combat Accuracy */}
          {(activePillar === 'ALL' || activePillar === 'ACCURACY') && (
            <div className="p-3.5 sm:p-4 rounded-2xl bg-[#141824] border border-amber-500/30 hover:border-amber-500/50 transition">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
                    <Target className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-black uppercase text-white tracking-wider">
                      Combat Accuracy
                    </h4>
                    <span className="text-[10px] text-slate-400">Net Marks Efficiency (+4 / -1 Scheme)</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-lg font-black font-mono text-amber-400">
                    {Math.round(aScore)}%
                  </span>
                  <span className="text-[10px] text-slate-500"> / 100</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-orange-400 transition-all duration-500"
                  style={{ width: `${aScore}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
                <span>
                  Raw Accuracy: <strong className="text-white">{triad.rolling_accuracy_percent || 0}%</strong>
                </span>
                <span>
                  Negative Marking Drain: <strong className="text-rose-400">-{triad.negative_mark_drain || 0} marks</strong>
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Actionable Coaching Directive */}
      <div className="mt-5 p-4 rounded-2xl bg-[#10141f] border border-orange-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-orange-500/20 text-orange-400 shrink-0">
            <Flame className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase text-orange-400 block">
              Personalized Coaching Directive
            </span>
            <p className="text-xs text-slate-200 mt-0.5 leading-relaxed font-medium">
              {triad.directive}
            </p>
          </div>
        </div>

        {onNavigateTab && (
          <button
            onClick={() => {
              sound.click();
              onNavigateTab('adaptive');
            }}
            className="px-4 py-2 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shrink-0 flex items-center gap-1.5 transition cursor-pointer shadow-md"
          >
            <span>Target Weak Pillar</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Unlockable Triad Achievements Showcase */}
      <div className="mt-5 pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-bold text-white">Triad Milestone Achievements</span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white/10 text-amber-300 font-bold">
            {unlockedCount} / {achievements.length} Unlocked
          </span>
        </div>

        <button
          onClick={() => {
            sound.click();
            setShowAchievements(!showAchievements);
          }}
          className="text-xs font-bold text-orange-400 hover:text-orange-300 transition flex items-center gap-1 cursor-pointer self-start sm:self-auto"
        >
          <span>{showAchievements ? 'Hide Triad Trophies' : 'View Unlockable Trophies'}</span>
          <ChevronRight className={`w-3.5 h-3.5 transition-transform ${showAchievements ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Expanded Achievements Tray */}
      {showAchievements && (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-2 animate-fadeIn">
          {achievements.map((ach) => (
            <div
              key={ach.id}
              className={`p-3.5 rounded-2xl border transition ${
                ach.is_unlocked
                  ? 'bg-amber-950/20 border-amber-500/40 text-amber-200 shadow-md'
                  : 'bg-[#10141f] border-white/5 text-slate-400 opacity-75'
              }`}
            >
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xl">{ach.icon}</span>
                {ach.is_unlocked ? (
                  <span className="text-[9px] font-mono font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <CheckCircle2 className="w-2.5 h-2.5" />
                    <span>UNLOCKED</span>
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-slate-500">
                    {Math.round(ach.progress_percent)}%
                  </span>
                )}
              </div>
              <h5 className="text-xs font-bold text-white">{ach.title}</h5>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug line-clamp-2">
                {ach.description}
              </p>
              {!ach.is_unlocked && (
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-2">
                  <div
                    className="h-full bg-orange-500 transition-all duration-300"
                    style={{ width: `${ach.progress_percent}%` }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
