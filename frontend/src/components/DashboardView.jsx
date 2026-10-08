import React, { useState, useEffect } from 'react';
import { Swords, Zap, Trophy, Shield, Play, ArrowRight, Sparkles, BookOpen, Clock, AlertCircle, Users, Globe, Lock, Flame, Sliders, UserPlus, Brain, CheckCircle2 } from 'lucide-react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import OngoingMatchCard from './OngoingMatchCard';
import DivisionGuideModal from './DivisionGuideModal';
import StreakModal from './StreakModal';

export default function DashboardView({
  user,
  onNavigateTab,
  onOpenCreateRoom,
  onJoinRoomCode,
  onStartDailyDrill,
  onStartPreset,
  activeMatch,
  onResumeMatch,
  onForfeitMatch,
  onUpdateUser,
}) {
  const [joinCode, setJoinCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [openRooms, setOpenRooms] = useState([]);
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [currentActiveMatch, setCurrentActiveMatch] = useState(activeMatch || null);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [streakModalOpen, setStreakModalOpen] = useState(false);

  // Sync prop changes into state
  useEffect(() => {
    if (activeMatch !== undefined) {
      setCurrentActiveMatch(activeMatch);
    }
  }, [activeMatch]);

  // Periodic poll for active matches (Chess.com style real-time match recovery)
  useEffect(() => {
    let isMounted = true;
    const fetchActive = async () => {
      if (!user) return;
      try {
        const res = await api.rooms.getActive();
        if (isMounted) {
          if (res?.active_room) {
            setCurrentActiveMatch(res.active_room);
          } else {
            setCurrentActiveMatch(null);
          }
        }
      } catch (_) {}
    };

    fetchActive();
    const activeInterval = setInterval(fetchActive, 4000);
    return () => {
      isMounted = false;
      clearInterval(activeInterval);
    };
  }, [user?.id]);

  useEffect(() => {
    fetchOpenRooms();
    const interval = setInterval(fetchOpenRooms, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchOpenRooms = async () => {
    try {
      const data = await api.rooms.getOpen();
      setOpenRooms(data || []);
    } catch (_) {} finally {
      setLoadingRooms(false);
    }
  };

  const handleForfeit = async (code) => {
    try {
      await api.rooms.forfeit(code);
      setCurrentActiveMatch(null);
      try {
        localStorage.removeItem('jee_active_test_room');
      } catch (_) {}
      if (onForfeitMatch) onForfeitMatch(code);
    } catch (err) {
      console.error('Error forfeiting match:', err);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    sound.click();
    setJoinError('');
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    setJoining(true);
    try {
      const room = await api.rooms.join(code, passcode.trim() || null);
      onJoinRoomCode(room);
    } catch (err) {
      setJoinError(err.message || 'Room not found or match finished.');
    } finally {
      setJoining(false);
    }
  };

  const handleJoinOpen = async (code) => {
    sound.click();
    setJoinError('');
    try {
      const room = await api.rooms.join(code);
      onJoinRoomCode(room);
    } catch (err) {
      setJoinError(err.message || 'Failed to join open room.');
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-transition">
      {/* 0. Chess.com-Style Ongoing Match Card */}
      {currentActiveMatch && (
        <OngoingMatchCard
          match={currentActiveMatch}
          currentUser={user}
          onResume={() => {
            if (onResumeMatch) onResumeMatch(currentActiveMatch);
          }}
          onForfeit={handleForfeit}
        />
      )}
      {/* Hero Battle Section - Captivating Orange & White on Soft Slate Grey */}
      <div className="relative bg-gradient-to-br from-[#2b3345] via-[#242b3b] to-[#1e2330] border border-orange-500/30 rounded-3xl p-6 sm:p-12 shadow-2xl glow-orange-subtle overflow-hidden mb-10">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl -z-10"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-amber-500/10 rounded-full blur-3xl -z-10"></div>

        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-950/80 border border-orange-500/40 text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">
            <Flame className="w-3.5 h-3.5" />
            <span>Competitive Multiplayer JEE Arena</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-tight">
            Duel in Real Time.{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-orange-400 via-orange-500 to-amber-400">
              Conquer JEE.
            </span>
          </h1>

          <p className="text-slate-300 text-sm sm:text-base mt-3 leading-relaxed">
            Head-to-head speed duels with live score tracks, segregated NTA Mock simulations, and chapter-calibrated custom test blueprints. Full KaTeX math rendering, authentic marking, and permanent Elo prestige.
          </p>

          {/* Quick Actions */}
          <div className="mt-8 flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
            <button
              onClick={() => {
                sound.click();
                if (onNavigateTab) onNavigateTab('generator');
                else onOpenCreateRoom();
              }}
              className="px-6 py-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black rounded-2xl transition shadow-xl shadow-orange-950/50 flex items-center justify-center gap-2 cursor-pointer glow-orange-subtle"
            >
              <Sliders className="w-5 h-5 fill-current" />
              <span>Custom Blueprint Studio</span>
            </button>

            <button
              onClick={() => {
                sound.click();
                if (onNavigateTab) onNavigateTab('mocks');
              }}
              className="px-5 py-4 bg-[#293144] hover:bg-[#313a52] text-white font-bold rounded-2xl border border-white/10 hover:border-orange-500/40 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <BookOpen className="w-5 h-5 text-orange-400" />
              <span>NTA Mocks</span>
            </button>

            <button
              onClick={() => {
                sound.click();
                if (onNavigateTab) onNavigateTab('invite');
              }}
              className="px-5 py-4 bg-[#293144] hover:bg-[#313a52] text-white font-bold rounded-2xl border border-white/10 hover:border-orange-500/40 transition flex items-center justify-center gap-2 cursor-pointer"
            >
              <UserPlus className="w-5 h-5 text-orange-400" />
              <span>Invite Friends</span>
            </button>

            {/* Join Room Form */}
            <form onSubmit={handleJoin} className="flex flex-col sm:flex-row items-center gap-2">
              <input
                type="text"
                placeholder="ROOM CODE"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full sm:w-36 px-4 py-3.5 bg-[#1e2433] border border-white/15 rounded-2xl text-white placeholder-slate-500 font-mono font-bold tracking-widest text-center focus:outline-none focus:border-orange-500 uppercase text-sm"
              />
              <button
                type="submit"
                disabled={joining || !joinCode.trim()}
                className="w-full sm:auto px-5 py-3.5 bg-white text-slate-950 hover:bg-slate-200 font-extrabold rounded-2xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 text-sm shadow-md"
              >
                <span>Join</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </div>

          {joinError && (
            <p className="text-rose-400 text-xs mt-3 flex items-center gap-1.5 font-medium">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{joinError}</span>
            </p>
          )}
        </div>
      </div>

      {/* Adaptive Practice AI Banner */}
      <div
        onClick={() => {
          sound.click();
          if (onNavigateTab) onNavigateTab('adaptive');
        }}
        className="bg-gradient-to-r from-orange-600/30 via-[#262c3c] to-amber-600/30 border border-orange-500/50 hover:border-orange-400 rounded-3xl p-6 sm:p-7 shadow-xl mb-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 cursor-pointer group transition hover:scale-[1.01] glow-orange-subtle"
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center shrink-0 shadow-lg group-hover:scale-105 transition">
            <Brain className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-mono font-black uppercase text-orange-400 bg-orange-500/20 px-2.5 py-0.5 rounded-full border border-orange-500/40">
                Personalized AI Tutor
              </span>
              <span className="text-xs text-amber-300 font-bold font-mono">
                Dynamic Difficulty Ladder
              </span>
            </div>
            <h3 className="text-lg sm:text-xl font-black text-white group-hover:text-orange-400 transition">
              Adaptive Question Practice Circuit
            </h3>
            <p className="text-xs text-slate-300 mt-0.5 max-w-xl leading-relaxed">
              Trained on Item Response Theory to dynamically calibrate difficulty after every single answer, diagnose conceptual traps, and avenge past missed problems.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="px-6 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center gap-2 shrink-0 group-hover:from-orange-400 group-hover:to-amber-400 whitespace-nowrap glow-orange"
        >
          <span>LAUNCH ADAPTIVE PRACTICE</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* Prestige Stats Banner */}
      {user && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-[#262c3c] border border-white/10 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-orange-950/80 text-orange-400 border border-orange-500/30">
              <Flame className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Overall Elo</span>
              <h4 className="text-xl font-black font-mono text-orange-400">
                {Math.round(user.overall_elo)}
              </h4>
            </div>
          </div>

          <div
            onClick={() => {
              sound.click();
              setGuideModalOpen(true);
            }}
            className="bg-[#262c3c] border border-amber-500/30 hover:border-amber-400/60 rounded-2xl p-4 flex flex-col justify-between gap-2 cursor-pointer transition hover:scale-[1.02] group shadow-lg"
            title="Click to view Division System & Advancement Rules"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2.5 rounded-xl bg-amber-950/80 text-amber-400 border border-amber-500/30 text-lg group-hover:scale-110 transition flex items-center justify-center">
                  {user.division_meta?.icon || '🏆'}
                </div>
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 flex items-center gap-1">
                    <span>Division League</span>
                    <ArrowRight className="w-2.5 h-2.5 text-amber-400 group-hover:translate-x-0.5 transition" />
                  </span>
                  <h4 className="text-base sm:text-lg font-black text-amber-300 truncate max-w-[140px]">
                    {user.division_meta?.full_name || user.current_division}
                  </h4>
                </div>
              </div>
              {user.division_meta?.zone && (
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full border ${
                  user.division_meta.zone === 'promotion'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : user.division_meta.zone === 'relegation'
                    ? 'bg-rose-500/20 text-rose-400 border-rose-500/30'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}>
                  {user.division_meta.zone === 'promotion' ? '▲ Promo' : user.division_meta.zone === 'relegation' ? '▼ Demote' : 'Safe'}
                </span>
              )}
            </div>

            {/* Sub-tier Progress Bar */}
            {user.division_meta?.next_full_name && (
              <div className="w-full mt-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 mb-1">
                  <span className="truncate">Next: {user.division_meta.next_full_name}</span>
                  <span className="font-mono text-orange-400 font-bold">{Math.round(user.division_meta.progress_percent || 0)}%</span>
                </div>
                <div className="w-full bg-[#151923] h-1.5 rounded-full overflow-hidden border border-white/5">
                  <div
                    className="bg-gradient-to-r from-orange-500 to-amber-400 h-full rounded-full transition-all duration-300"
                    style={{ width: `${Math.min(100, Math.max(0, user.division_meta.progress_percent || 0))}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="bg-[#262c3c] border border-white/10 rounded-2xl p-4 flex items-center gap-3">
            <div className="p-3 rounded-xl bg-emerald-950/80 text-emerald-400 border border-emerald-500/30">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-slate-400">Accuracy</span>
              <h4 className="text-xl font-black font-mono text-emerald-300">
                {user.accuracy_percentage}%
              </h4>
            </div>
          </div>

          <div
            onClick={() => {
              if (onNavigateTab) {
                sound.click();
                onNavigateTab('profile');
              }
            }}
            className="bg-[#262c3c] border border-blue-500/20 hover:border-blue-400/50 rounded-2xl p-4 flex items-center gap-3 cursor-pointer transition hover:scale-[1.02] group shadow-lg"
            title="Click to view full AIR Diagnostic & JoSAA College Predictor in Profile"
          >
            <div className="p-3 rounded-xl bg-blue-950/80 text-blue-400 border border-blue-500/30 group-hover:scale-105 transition shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-1 mb-0.5">
                <span className="text-[10px] uppercase font-bold text-slate-400 truncate flex items-center gap-1">
                  <span>AIR Forecast</span>
                  <ArrowRight className="w-2.5 h-2.5 text-blue-400 group-hover:translate-x-0.5 transition" />
                </span>
                {user.predicted_percentile !== undefined && (
                  <span className="text-[9px] font-mono font-bold text-cyan-400 bg-cyan-950/60 px-1.5 py-0.2 rounded border border-cyan-500/30">
                    {user.predicted_percentile}%ile
                  </span>
                )}
              </div>
              <h4 className="text-sm sm:text-base font-black font-mono text-blue-300 truncate">
                {user.predicted_air_formatted || (user.predicted_air ? `AIR ${Number(user.predicted_air).toLocaleString()}` : user.predicted_air_bracket?.split('(')[0] || 'Calibrating...')}
              </h4>
              {user.predicted_jee_main_marks !== undefined && (
                <div className="text-[10px] text-slate-400 truncate mt-0.5">
                  Est. Marks: <span className="font-mono text-slate-200 font-bold">{user.predicted_jee_main_marks}</span><span className="text-slate-500">/300</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Daily Study & Arena Streak Banner */}
      {user && (
        <div
          onClick={() => {
            sound.click();
            setStreakModalOpen(true);
          }}
          className="bg-gradient-to-r from-orange-950/40 via-[#221c2c] to-[#1a2133] border border-orange-500/30 hover:border-orange-500/60 rounded-3xl p-5 sm:p-6 mb-10 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-5 cursor-pointer transition hover:scale-[1.01] group glow-orange-subtle"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white shadow-lg shadow-orange-950/50 group-hover:scale-105 transition shrink-0 glow-orange">
              <Flame className="w-8 h-8 fill-current animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono font-black uppercase text-orange-400 bg-orange-500/20 px-2.5 py-0.5 rounded-full border border-orange-500/30">
                  Daily Momentum
                </span>
                {user.is_streak_active_today ? (
                  <span className="text-xs text-emerald-400 font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Streak Active Today</span>
                  </span>
                ) : (
                  <span className="text-xs text-amber-300 font-bold flex items-center gap-1 animate-pulse">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Solve 1 question today to keep your streak!</span>
                  </span>
                )}
              </div>
              <h3 className="text-lg sm:text-xl font-black text-white group-hover:text-orange-400 transition flex items-center gap-2">
                <span>{user.current_streak || 0} Day Streak</span>
                <span className="text-xs font-normal text-slate-400 font-mono">
                  (Record: {user.longest_streak || 0}d)
                </span>
              </h3>
              <p className="text-xs text-slate-300 mt-0.5">
                Granting <strong className="text-orange-400">+{Math.min(20, (user.current_streak || 0) * 2)}% Bonus RP</strong> on all duels & tests. {user.streak_freezes !== undefined ? `🛡️ ${user.streak_freezes} Freeze Shield available.` : ''}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-stretch md:self-auto justify-end">
            <button
              type="button"
              className="px-4 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-xs rounded-xl shadow-md transition flex items-center gap-2 group-hover:from-orange-400 group-hover:to-amber-400 shrink-0"
            >
              <span>View Streak Milestones</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Active Public Matches Discovery */}
      {openRooms.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-white flex items-center gap-2">
              <Globe className="w-4 h-4 text-orange-400" />
              <span>Live Battles Waiting for Challengers</span>
            </h2>
            <span className="text-xs text-slate-400 font-mono">{openRooms.length} Active Lobbies</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {openRooms.map((r) => (
              <div
                key={r.code}
                className="bg-[#262c3c] border border-white/10 hover:border-orange-500/40 rounded-2xl p-4 transition shadow-lg flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono font-black text-orange-400 text-sm">
                      #{r.code}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded bg-[#1e2433] text-slate-400 font-mono">
                      Host: {r.host_username}
                    </span>
                  </div>
                  <h4 className="text-xs font-bold text-white mb-1">
                    {r.preset_name || `${r.mode === 'SPEED_DUEL' ? '⚡ Speed Duel' : '📝 Mock Test'}`}
                  </h4>
                  <p className="text-[11px] text-slate-400">
                    {r.subjects.join(', ')} • {r.total_questions} Qs ({r.time_per_question}s)
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                  <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                    <Users className="w-3 h-3 text-orange-400" />
                    <span>{r.participant_count} Joined</span>
                  </span>
                  <button
                    onClick={() => handleJoinOpen(r.code)}
                    className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-md shadow-orange-950/40"
                  >
                    Join Battle
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preset Combat Modes Grid */}
      <div className="mb-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-white flex items-center gap-2">
            <Play className="w-4 h-4 text-orange-400 fill-current" />
            <span>Instant Combat Presets</span>
          </h2>
          <span className="text-xs text-slate-400">Ready to launch in 1-click</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Preset 1: Mechanics Blitz */}
          <div
            onClick={() => {
              sound.click();
              onStartPreset('Physics', 'Kinematics 1D & 2D');
            }}
            className="group bg-[#262c3c] border border-white/10 hover:border-orange-500/50 rounded-2xl p-5 transition cursor-pointer hover:shadow-xl hover:shadow-orange-950/40 relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-0.5 rounded-lg bg-orange-950/80 border border-orange-500/40 text-orange-300 font-mono text-[10px] font-bold">
                PHYSICS BLITZ
              </span>
              <span className="text-xs text-slate-400 font-mono">5 Qs • 90s</span>
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-orange-400 transition">
              Mechanics & Kinematics Duel
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Vectors, trajectory equations, relative velocities, and projectile calculations.
            </p>
          </div>

          {/* Preset 2: Chemistry Organic */}
          <div
            onClick={() => {
              sound.click();
              onStartPreset('Chemistry', 'Chemical Bonding and Molecular Structure');
            }}
            className="group bg-[#262c3c] border border-white/10 hover:border-amber-500/50 rounded-2xl p-5 transition cursor-pointer hover:shadow-xl hover:shadow-amber-950/40 relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-0.5 rounded-lg bg-amber-950/80 border border-amber-500/40 text-amber-300 font-mono text-[10px] font-bold">
                CHEMISTRY CLASH
              </span>
              <span className="text-xs text-slate-400 font-mono">5 Qs • 60s</span>
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-amber-300 transition">
              Chemical Bonding & Equilibrium
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Hybridization, dipole moments, molecular orbital theory, and Le Chatelier's principle.
            </p>
          </div>

          {/* Preset 3: Mathematics Series */}
          <div
            onClick={() => {
              sound.click();
              onStartPreset('Mathematics', 'Sequences and Series');
            }}
            className="group bg-[#262c3c] border border-white/10 hover:border-orange-500/50 rounded-2xl p-5 transition cursor-pointer hover:shadow-xl hover:shadow-orange-950/40 relative overflow-hidden"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="px-2.5 py-0.5 rounded-lg bg-orange-950/80 border border-orange-500/40 text-orange-300 font-mono text-[10px] font-bold">
                MATH SHOWDOWN
              </span>
              <span className="text-xs text-slate-400 font-mono">5 Qs • 120s</span>
            </div>
            <h3 className="text-base font-bold text-white group-hover:text-orange-400 transition">
              Sequences, Series & Progression
            </h3>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              Arithmetic-Geometric progressions, telescoping summations, and convergence proofs.
            </p>
          </div>
        </div>
      </div>

      {/* Division System Guide & Tiers Modal */}
      <DivisionGuideModal
        isOpen={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
      />

      {/* Daily Study Streak Modal */}
      <StreakModal
        isOpen={streakModalOpen}
        onClose={() => setStreakModalOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
      />
    </div>
  );
}
