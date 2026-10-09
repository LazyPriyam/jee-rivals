import React from 'react';
import { createPortal } from 'react-dom';
import { X, Trophy, Shield, Zap, Target, Flame, ArrowUpRight, Award, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react';

const TIERS_DATA = [
  {
    id: 'BRONZE',
    name: 'Bronze',
    subdivisions: 'III, II, I',
    icon: '🥉',
    color: 'text-orange-400 bg-orange-950/80 border-orange-700/50',
    minRp: '0 RP',
    minElo: 'Foundation',
    minAcc: 'Any',
    multiplier: '1.0x',
    air: 'AIR 75,000+',
    description: 'Foundation rank for new aspirants building basic speed and conceptual grounding.'
  },
  {
    id: 'SILVER',
    name: 'Silver',
    subdivisions: 'III, II, I',
    icon: '🥈',
    color: 'text-slate-300 bg-slate-800 border-slate-600/50',
    minRp: '150 RP',
    minElo: '1250 Elo',
    minAcc: '40%',
    multiplier: '1.05x (+5%)',
    air: 'AIR 35,000 - 75,000',
    description: 'Consistent practice tier. Aspirants reliably clearing JEE Main foundation cutoffs.'
  },
  {
    id: 'GOLD',
    name: 'Gold',
    subdivisions: 'III, II, I',
    icon: '🥇',
    color: 'text-amber-300 bg-amber-950/80 border-amber-500/50',
    minRp: '360 RP',
    minElo: '1400 Elo',
    minAcc: '50%',
    multiplier: '1.10x (+10%)',
    air: 'AIR 15,000 - 35,000',
    description: 'NIT contender benchmark. Demonstrated problem-solving proficiency across multiple chapters.'
  },
  {
    id: 'PLATINUM',
    name: 'Platinum',
    subdivisions: 'III, II, I',
    icon: '💎',
    color: 'text-emerald-300 bg-emerald-950/80 border-emerald-500/50',
    minRp: '660 RP',
    minElo: '1550 Elo',
    minAcc: '55%',
    multiplier: '1.15x (+15%)',
    air: 'AIR 5,000 - 15,000',
    description: 'Top NITs / BITS Pilani / IIT border. High-accuracy speed under strict exam timing.'
  },
  {
    id: 'DIAMOND',
    name: 'Diamond',
    subdivisions: 'III, II, I',
    icon: '💠',
    color: 'text-cyan-300 bg-cyan-950/80 border-cyan-400/50',
    minRp: '1050 RP',
    minElo: '1700 Elo',
    minAcc: '60%',
    multiplier: '1.20x (+20%)',
    air: 'AIR 1,500 - 5,000',
    description: 'Core IIT seat trajectory. Solves complex multi-concept JEE Advanced problems with poise.'
  },
  {
    id: 'MASTER',
    name: 'Master',
    subdivisions: 'II, I',
    icon: '👑',
    color: 'text-purple-300 bg-purple-950/80 border-purple-500/50',
    minRp: '1500 RP',
    minElo: '1850 Elo',
    minAcc: '65%',
    multiplier: '1.25x (+25%)',
    air: 'AIR 250 - 1,500',
    description: 'Top IIT discipline qualification. Elite speed, high chapter mastery, and deep conceptual insight.'
  },
  {
    id: 'GRANDMASTER',
    name: 'Grandmaster Apex',
    subdivisions: 'Apex Only',
    icon: '🔥',
    color: 'text-red-400 bg-red-950/80 border-red-500/50 ring-2 ring-red-500/60 animate-pulse',
    minRp: '2000 RP',
    minElo: '2000 Elo',
    minAcc: '70%',
    multiplier: '1.35x (+35%)',
    air: 'AIR 1 - 250 (Top Tier)',
    description: 'The pinnacle of JEE Rivals. Reserved strictly for Top 3 weekly aspirants with 2000+ Elo and elite accuracy.'
  }
];

export default function DivisionGuideModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#181d2c] border border-orange-500/40 rounded-3xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#242b3d] to-[#1a202e] border-b border-white/10 p-5 sm:p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center text-orange-400">
              <Trophy className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <span>The Dual-Gate Division System</span>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 uppercase tracking-wider font-mono">
                  Weekly League
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Scientific progression blending active weekly practice with genuine academic merit.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-xs sm:text-sm">
          {/* Key Principle Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="bg-[#202738] border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-orange-400 font-bold text-xs uppercase">
                <Zap className="w-4 h-4" />
                <span>1. Weekly RP Gate</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                Earn <strong>Rival Points (RP)</strong> through Speed Duels, Mock Tests, and Adaptive Practice. Proves your dedicated weekly study volume.
              </p>
            </div>

            <div className="bg-[#202738] border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs uppercase">
                <Shield className="w-4 h-4" />
                <span>2. Elo Merit Gate</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                You cannot grind mindless easy questions to reach top tiers. Higher divisions require proving high <strong>Overall Elo</strong> against tough rivals.
              </p>
            </div>

            <div className="bg-[#202738] border border-white/10 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase">
                <Target className="w-4 h-4" />
                <span>3. Accuracy Cutoff</span>
              </div>
              <p className="text-slate-300 text-xs leading-relaxed">
                Negative marking matters. Ranks demand minimum accuracy percentages to promote precision and eradicate blind guessing.
              </p>
            </div>
          </div>

          {/* Zones Explanation */}
          <div className="bg-[#121622] border border-white/10 rounded-2xl p-4 space-y-3">
            <h3 className="font-extrabold text-white text-sm flex items-center gap-2">
              <Flame className="w-4 h-4 text-orange-400" />
              <span>Weekly Promotion & Relegation Zones (Resets Sunday 23:59 UTC)</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300">
                <strong className="block font-black mb-1">🟢 Promotion Zone (Top 20%)</strong>
                Finishing in the top 20% while satisfying the next tier's Elo gate promotes you to the next division at Sunday midnight.
              </div>
              <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-600/30 text-slate-300">
                <strong className="block font-black mb-1">⚪ Safe Zone (Middle 60%)</strong>
                Maintains your current division standing with stability while you prepare for your next promotion push.
              </div>
              <div className="p-3 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-300">
                <strong className="block font-black mb-1">🔴 Relegation Threat (Bottom 20%)</strong>
                Falling into the inactive bottom tier drops you down one division at season reset to keep divisions competitive.
              </div>
            </div>
          </div>

          {/* Division Tier Table */}
          <div>
            <h3 className="font-extrabold text-white text-sm mb-3">The 7 Divisional League Tiers</h3>
            <div className="overflow-x-auto rounded-2xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-[#1e2536] border-b border-white/10 text-slate-400 font-mono uppercase text-[10px]">
                    <th className="p-3">Tier</th>
                    <th className="p-3">Subdivisions</th>
                    <th className="p-3">Min Weekly RP</th>
                    <th className="p-3">Elo Gate</th>
                    <th className="p-3">Min Accuracy</th>
                    <th className="p-3">RP Multiplier</th>
                    <th className="p-3">Predicted AIR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 bg-[#171c29]">
                  {TIERS_DATA.map((t) => (
                    <tr key={t.id} className="hover:bg-white/5 transition">
                      <td className="p-3 font-bold">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-black border ${t.color}`}>
                          <span>{t.icon}</span>
                          <span>{t.name}</span>
                        </span>
                      </td>
                      <td className="p-3 font-mono text-slate-300">{t.subdivisions}</td>
                      <td className="p-3 font-mono font-bold text-amber-400">{t.minRp}</td>
                      <td className="p-3 font-mono font-bold text-orange-400">{t.minElo}</td>
                      <td className="p-3 font-mono text-emerald-400 font-bold">{t.minAcc}</td>
                      <td className="p-3 font-mono font-extrabold text-cyan-300">{t.multiplier}</td>
                      <td className="p-3 font-mono font-bold text-slate-200">{t.air}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Why Not Grandmaster Immediately Note */}
          <div className="p-4 rounded-2xl bg-orange-950/40 border border-orange-500/30 text-slate-300 text-xs space-y-1.5">
            <h4 className="font-bold text-orange-400 flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              <span>Authentic Apex Prestige</span>
            </h4>
            <p className="leading-relaxed">
              Unlike generic apps where any 1st-place player is immediately given the Grandmaster crown, in JEE Rivals, <strong>Grandmaster Apex</strong> is strictly gated. You must reach <strong>2,000+ Weekly RP</strong>, <strong>2,000+ Elo</strong>, <strong>$\ge 70\%$ Accuracy</strong>, and hold a <strong>Top 3 Leaderboard Rank</strong>. Every badge you wear reflects genuine competitive competence.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-[#151a27] border-t border-white/10 p-4 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-xl shadow cursor-pointer"
          >
            Understood, Back to Arena
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
