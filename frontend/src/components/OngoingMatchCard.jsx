import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Play, Swords, BookOpen, Clock, AlertTriangle, X, ShieldAlert, Users, Trophy, Flame, ArrowRight } from 'lucide-react';
import { sound } from '../utils/sound';

export default function OngoingMatchCard({
  match,
  currentUser,
  onResume,
  onForfeit,
  loading = false
}) {
  const [forfeitModalOpen, setForfeitModalOpen] = useState(false);
  const [forfeiting, setForfeiting] = useState(false);

  // Determine wall-clock deadline
  const getDeadline = () => {
    if (!match) return Date.now();
    const isMock = match.mode === 'MOCK_TEST';
    if (isMock) {
      if (match.time_remaining_seconds != null && Number.isFinite(match.time_remaining_seconds)) {
        return Date.now() + Math.max(0, match.time_remaining_seconds) * 1000;
      }
      if (match.started_at) {
        try {
          const raw = String(match.started_at);
          const utcStr = raw.endsWith('Z') || raw.includes('+') ? raw : `${raw}Z`;
          const startedEpoch = new Date(utcStr).getTime();
          const totalSec = (match.total_duration_minutes || 60) * 60;
          return startedEpoch + totalSec * 1000;
        } catch (_) {}
      }
      return Date.now() + (match.total_duration_minutes || 60) * 60 * 1000;
    } else {
      // Speed Duel
      if (match.time_remaining_seconds != null) {
        return Date.now() + match.time_remaining_seconds * 1000;
      }
      return Date.now() + (match.time_per_question || 90) * 1000;
    }
  };

  const deadlineRef = useRef(getDeadline());
  const [secondsLeft, setSecondsLeft] = useState(() => {
    return Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
  });

  // Keep deadline updated if match object changes from server
  useEffect(() => {
    if (match) {
      const newDeadline = getDeadline();
      deadlineRef.current = newDeadline;
      setSecondsLeft(Math.max(0, Math.ceil((newDeadline - Date.now()) / 1000)));
    }
  }, [match?.code, match?.started_at, match?.time_remaining_seconds]);

  // Live ticking countdown and visibilitychange listener
  useEffect(() => {
    if (!match) return;

    const tick = () => {
      const rem = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setSecondsLeft(rem);
    };

    tick();
    const timer = setInterval(tick, 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        tick();
      }
    };
    const handleFocus = () => {
      tick();
    };

    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [match?.code]);

  if (!match) return null;

  const isMock = match.mode === 'MOCK_TEST';
  const myParticipant = match.participants?.find((p) => p.user_id === currentUser?.id);
  const otherParticipants = match.participants?.filter((p) => p.user_id !== currentUser?.id) || [];

  // Format time display
  const formatTime = (totalSeconds) => {
    if (totalSeconds <= 0) return '00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}h ${mins < 10 ? '0' : ''}${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
    }
    return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const handleConfirmForfeit = async () => {
    setForfeiting(true);
    try {
      sound.click();
      if (onForfeit) {
        await onForfeit(match.code);
      }
    } finally {
      setForfeiting(false);
      setForfeitModalOpen(false);
    }
  };

  const subjectText = Array.isArray(match.subjects)
    ? match.subjects.join(', ')
    : match.subject || 'All Subjects';

  const chapterText = Array.isArray(match.chapters)
    ? match.chapters.join(', ')
    : match.chapters || (isMock ? 'Full NTA Syllabus' : 'General Mixed');

  return (
    <>
      <div className="relative mb-8 bg-gradient-to-r from-[#171d2b] via-[#1c2438] to-[#151a27] border-2 border-orange-500/70 rounded-3xl p-5 sm:p-6 shadow-2xl glow-orange overflow-hidden animate-in fade-in duration-300">
        {/* Subtle decorative glowing background accents */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
        <div className="absolute bottom-0 left-1/3 w-60 h-60 bg-amber-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          {/* Left Column: Ongoing Match Meta */}
          <div className="space-y-3 flex-1 min-w-0">
            {/* Top Badges Strip */}
            <div className="flex flex-wrap items-center gap-2.5">
              {/* Radar Pulsing Live Indicator */}
              <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-orange-950/90 border border-orange-500/50 shadow-inner">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
                </span>
                <span className="text-orange-300 text-[11px] font-black uppercase tracking-wider">
                  Ongoing Match
                </span>
              </div>

              {/* Mode Badge */}
              {isMock ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-[11px] font-bold">
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>NTA Mock CBT</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/80 border border-amber-500/40 text-amber-300 text-[11px] font-bold">
                  <Swords className="w-3.5 h-3.5" />
                  <span>Speed Duel</span>
                </div>
              )}

              {/* Room Code */}
              <div className="px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-slate-300 font-mono text-[11px] font-bold">
                #{match.code}
              </div>

              {match.preset_name && (
                <div className="px-2.5 py-1 rounded-full bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[11px] font-bold truncate max-w-[200px]">
                  {match.preset_name}
                </div>
              )}
            </div>

            {/* Title & Subject Info */}
            <div>
              <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                <span>{isMock ? 'Active JEE Mock Examination' : 'Head-to-Head Speed Duel'}</span>
              </h2>
              <p className="text-slate-300 text-xs sm:text-sm font-medium mt-0.5 line-clamp-1">
                <span className="text-orange-400 font-semibold">{subjectText}</span>
                <span className="mx-2 text-slate-500">•</span>
                <span className="text-slate-400">{chapterText}</span>
              </p>
            </div>

            {/* Participants Strip */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mr-1">
                Players:
              </span>
              {match.participants?.map((p) => {
                const isMe = p.user_id === currentUser?.id;
                return (
                  <div
                    key={p.user_id}
                    className={`flex items-center gap-2 px-2.5 py-1 rounded-xl text-xs font-medium border transition ${
                      isMe
                        ? 'bg-orange-500/15 border-orange-500/50 text-white font-bold'
                        : 'bg-white/5 border-white/10 text-slate-300'
                    }`}
                  >
                    <span className="text-sm">
                      {p.avatar_id === 'atom' ? '⚛️' : p.avatar_id === 'rocket' ? '🚀' : p.avatar_id === 'brain' ? '🧠' : '🔥'}
                    </span>
                    <span>{isMe ? 'You' : p.username}</span>
                    <span className="font-mono text-[11px] px-1.5 py-0.2 rounded bg-black/30 text-orange-300 font-bold">
                      {isMock ? `${p.marks || 0}m` : `${p.score || 0} pts`}
                    </span>
                    {p.is_finished && (
                      <span className="text-[10px] text-emerald-400 font-bold font-mono">✓</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Live Clock & Action Buttons */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-4 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-white/10">
            {/* Live Synchronized Ticking Clock */}
            <div className="flex items-center gap-3 bg-[#0e131d] border border-orange-500/40 rounded-2xl px-4 py-2.5 shadow-inner">
              <div className="w-8 h-8 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-400">
                <Clock className="w-4 h-4 animate-spin-slow" />
              </div>
              <div className="text-right">
                <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block font-bold">
                  {isMock ? 'Time Remaining' : 'Question Time'}
                </span>
                <span
                  className={`font-mono font-black text-lg sm:text-xl tracking-wider block ${
                    secondsLeft <= 60
                      ? 'text-red-400 animate-pulse'
                      : secondsLeft <= 300
                      ? 'text-amber-400'
                      : 'text-orange-400'
                  }`}
                >
                  {formatTime(secondsLeft)}
                </span>
              </div>
            </div>

            {/* Action Buttons: Resume & Forfeit */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                onClick={() => setForfeitModalOpen(true)}
                className="px-3.5 py-3 rounded-2xl bg-[#242b3b] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 border border-white/10 hover:border-rose-500/40 font-bold text-xs transition cursor-pointer flex items-center justify-center gap-1.5"
                title="Forfeit / Abandon Match"
              >
                <span>Forfeit</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  sound.click();
                  if (onResume) onResume(match);
                }}
                disabled={loading}
                className="flex-1 sm:flex-initial px-6 py-3 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm rounded-2xl transition shadow-xl shadow-orange-950/60 flex items-center justify-center gap-2 cursor-pointer glow-orange active:scale-95"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Resume Battle</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Forfeit Confirmation Modal */}
      {forfeitModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1b2232] border border-rose-500/40 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5 text-rose-400 font-black text-base">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                <span>Forfeit Active Match?</span>
              </div>
              <button
                onClick={() => setForfeitModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed">
              Are you sure you want to surrender room <strong className="text-white font-mono">#{match.code}</strong>?
              Your progress will be marked as resigned, and remaining questions will be scored as unattempted.
            </p>

            <div className="bg-rose-950/40 border border-rose-500/30 rounded-2xl p-3 text-xs text-rose-300">
              <strong>Notice:</strong> This action cannot be reversed once confirmed.
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setForfeitModalOpen(false)}
                className="px-4 py-2.5 bg-[#293247] hover:bg-[#343e57] text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Nevermind, Stay in Match
              </button>
              <button
                type="button"
                disabled={forfeiting}
                onClick={handleConfirmForfeit}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition cursor-pointer disabled:opacity-50"
              >
                {forfeiting ? 'Forfeiting...' : 'Yes, Forfeit Match'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
