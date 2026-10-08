import React, { useState, useEffect } from 'react';
import { X, Flame, Shield, Zap, Trophy, Sparkles, CheckCircle2, AlertCircle, RefreshCw, Plus } from 'lucide-react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';

export default function StreakModal({ isOpen, onClose, user, onUpdateUser }) {
  const [streakData, setStreakData] = useState(user?.streak_meta || null);
  const [loading, setLoading] = useState(false);
  const [buyingFreeze, setBuyingFreeze] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchStreak();
    }
  }, [isOpen]);

  const fetchStreak = async () => {
    setLoading(true);
    try {
      const data = await api.streaks.getMe();
      setStreakData(data);
    } catch (err) {
      console.error('Failed to load streak details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBuyFreeze = async () => {
    sound.click();
    setBuyingFreeze(true);
    setMessage(null);
    try {
      const res = await api.streaks.buyFreeze();
      sound.correct();
      setMessage({ type: 'success', text: res.message });
      setStreakData((prev) => ({
        ...prev,
        streak_freezes: res.streak_freezes,
        can_buy_freeze: res.streak_freezes < (prev?.max_freezes || 3) && res.weekly_rp >= (prev?.freeze_cost_rp || 100),
      }));
      if (onUpdateUser && user) {
        onUpdateUser({
          ...user,
          weekly_rp: res.weekly_rp,
          streak_freezes: res.streak_freezes,
        });
      }
    } catch (err) {
      setMessage({ type: 'error', text: err.message || 'Failed to purchase Freeze Shield.' });
    } finally {
      setBuyingFreeze(false);
    }
  };

  if (!isOpen) return null;

  const currentStreak = streakData?.current_streak ?? user?.current_streak ?? 0;
  const longestStreak = streakData?.longest_streak ?? user?.longest_streak ?? 0;
  const isActiveToday = streakData?.is_active_today ?? user?.is_streak_active_today ?? false;
  const freezes = streakData?.streak_freezes ?? user?.streak_freezes ?? 1;
  const maxFreezes = streakData?.max_freezes || 3;
  const multiplierPct = streakData?.streak_multiplier_pct ?? Math.min(20, currentStreak * 2);
  const nextMilestone = streakData?.next_milestone;
  const calendar = streakData?.weekly_calendar || [];
  const milestones = streakData?.all_milestones || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#181d2c] border border-orange-500/40 rounded-3xl max-w-xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#281e18] via-[#221c2a] to-[#1a202e] border-b border-orange-500/30 p-5 sm:p-6 flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-950/50 glow-orange">
              <Flame className="w-7 h-7 fill-current animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                <span>Daily Study Streak</span>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-orange-500/20 text-orange-400 border border-orange-500/30 uppercase tracking-wider font-mono font-bold">
                  Momentum
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Practice daily in Arena Duels, Mocks, or Adaptive Practice to stoke the flame.
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

        {/* Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 text-xs sm:text-sm">
          {/* Main Streak Counter Card */}
          <div className="bg-gradient-to-br from-[#202738] to-[#181e2b] border border-white/10 rounded-2xl p-5 text-center relative overflow-hidden shadow-xl">
            <div className="flex items-center justify-center gap-3 mb-2">
              <Flame className={`w-10 h-10 ${isActiveToday ? 'text-orange-500 fill-orange-500 animate-bounce' : 'text-slate-500'}`} />
              <div className="text-4xl sm:text-5xl font-black font-mono text-white tracking-tight">
                {currentStreak}{' '}
                <span className="text-base sm:text-lg font-bold text-slate-400 uppercase tracking-wider font-sans">
                  {currentStreak === 1 ? 'Day' : 'Days'}
                </span>
              </div>
            </div>

            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold mb-3">
              {isActiveToday ? (
                <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Streak Active for Today! You're Protected.</span>
                </span>
              ) : (
                <span className="bg-amber-500/20 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 animate-pulse">
                  <AlertCircle className="w-4 h-4 text-amber-400" />
                  <span>Solve 1 question today to extend your streak!</span>
                </span>
              )}
            </div>

            <div className="flex items-center justify-center gap-6 text-xs text-slate-400 pt-2 border-t border-white/5">
              <div>
                <span>All-Time Record: </span>
                <strong className="text-amber-400 font-mono font-bold">{longestStreak} Days</strong>
              </div>
              <div className="w-px h-3 bg-white/10" />
              <div>
                <span>Passive Bonus: </span>
                <strong className="text-orange-400 font-mono font-bold">+{multiplierPct}% Bonus RP</strong>
              </div>
            </div>
          </div>

          {/* Rolling 7-Day Calendar Dots */}
          <div className="bg-[#1b2131] border border-white/10 rounded-2xl p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                Past 7 Days History
              </span>
              <span className="text-xs text-slate-400 font-mono">
                {calendar.filter((c) => c.is_active).length} of 7 Active
              </span>
            </div>

            <div className="grid grid-cols-7 gap-2">
              {calendar.map((day, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col items-center justify-center p-2 rounded-xl border transition ${
                    day.is_active
                      ? 'bg-orange-500/15 border-orange-500/50 text-orange-400'
                      : day.is_today
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
                      : 'bg-[#151924] border-white/5 text-slate-500'
                  }`}
                >
                  <span className="text-[10px] font-bold uppercase">{day.day_name}</span>
                  <div className="my-1">
                    {day.is_active ? (
                      <Flame className="w-5 h-5 fill-current text-orange-400" />
                    ) : day.is_today ? (
                      <div className="w-5 h-5 rounded-full border-2 border-dashed border-amber-400 flex items-center justify-center text-[10px] font-bold">
                        ?
                      </div>
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-slate-700" />
                    )}
                  </div>
                  <span className="text-[10px] font-mono">{day.day_num}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Freeze Shield Protection Card */}
          <div className="bg-gradient-to-r from-[#172033] to-[#1a1e2a] border border-cyan-500/30 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 flex items-center justify-center shrink-0">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-extrabold text-white">Streak Freeze Shields</h4>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-mono font-bold">
                    {freezes} / {maxFreezes}
                  </span>
                </div>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Automatically activates if you miss a day, preserving your streak from resetting.
                </p>
              </div>
            </div>

            <button
              onClick={handleBuyFreeze}
              disabled={buyingFreeze || freezes >= maxFreezes || (user?.weekly_rp || 0) < 100}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0 ${
                freezes >= maxFreezes
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : (user?.weekly_rp || 0) < 100
                  ? 'bg-slate-800 text-slate-400 border border-slate-700 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-md'
              }`}
              title={freezes >= maxFreezes ? 'Max shields held' : 'Cost: 100 RP'}
            >
              {buyingFreeze ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Buy Shield (100 RP)</span>
                </>
              )}
            </button>
          </div>

          {message && (
            <div
              className={`p-3 rounded-xl text-xs font-semibold border ${
                message.type === 'success'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/40'
                  : 'bg-rose-950/80 text-rose-300 border-rose-500/40'
              }`}
            >
              {message.text}
            </div>
          )}

          {/* Streak Milestones Roadmap */}
          <div className="space-y-3">
            <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-400 flex items-center gap-1.5">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span>Streak Milestone Rewards</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {milestones.map((m) => {
                const reached = currentStreak >= m.days;
                return (
                  <div
                    key={m.days}
                    className={`p-3.5 rounded-2xl border transition flex items-center justify-between gap-3 ${
                      reached
                        ? 'bg-orange-500/10 border-orange-500/40 text-white shadow-sm'
                        : 'bg-[#1b202e] border-white/5 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="text-2xl">{m.icon}</div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-white">{m.days} Days: {m.title}</span>
                          {reached && (
                            <span className="text-[10px] text-emerald-400 font-bold">✓ Unlocked</span>
                          )}
                        </div>
                        <div className="text-[11px] text-amber-300 font-mono mt-0.5">
                          +{m.bonus_rp} RP {m.bonus_freezes > 0 && `• +${m.bonus_freezes} Shield`}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-[#141824] border-t border-white/10 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            Current streak grants <strong className="text-orange-400">+{multiplierPct}% Bonus RP</strong> on all wins.
          </span>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-xs rounded-xl transition cursor-pointer"
          >
            Keep Grinding
          </button>
        </div>
      </div>
    </div>
  );
}
