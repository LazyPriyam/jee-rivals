import React, { useState, useEffect } from 'react';
import { api, getToken } from '../utils/api';
import { Trophy, Clock, CheckCircle2, RefreshCw, Zap, Flame } from 'lucide-react';

const LANE_THEMES = [
  {
    dot: 'bg-gradient-to-tr from-cyan-400 to-blue-500 ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#131722] shadow-[0_0_12px_rgba(34,211,238,0.9)]',
    trail: 'bg-gradient-to-r from-cyan-500/20 via-cyan-500/50 to-cyan-400',
    core: 'bg-cyan-100',
  },
  {
    dot: 'bg-gradient-to-tr from-emerald-400 to-teal-500 ring-2 ring-emerald-300 ring-offset-2 ring-offset-[#131722] shadow-[0_0_12px_rgba(52,211,153,0.9)]',
    trail: 'bg-gradient-to-r from-emerald-500/20 via-emerald-500/50 to-emerald-400',
    core: 'bg-emerald-100',
  },
  {
    dot: 'bg-gradient-to-tr from-purple-400 to-indigo-500 ring-2 ring-purple-300 ring-offset-2 ring-offset-[#131722] shadow-[0_0_12px_rgba(192,132,252,0.9)]',
    trail: 'bg-gradient-to-r from-purple-500/20 via-purple-500/50 to-purple-400',
    core: 'bg-purple-100',
  },
  {
    dot: 'bg-gradient-to-tr from-amber-400 to-yellow-500 ring-2 ring-amber-300 ring-offset-2 ring-offset-[#131722] shadow-[0_0_12px_rgba(251,191,36,0.9)]',
    trail: 'bg-gradient-to-r from-amber-500/20 via-amber-500/50 to-amber-400',
    core: 'bg-amber-100',
  },
  {
    dot: 'bg-gradient-to-tr from-rose-400 to-pink-500 ring-2 ring-rose-300 ring-offset-2 ring-offset-[#131722] shadow-[0_0_12px_rgba(251,113,133,0.9)]',
    trail: 'bg-gradient-to-r from-rose-500/20 via-rose-500/50 to-rose-400',
    core: 'bg-rose-100',
  },
];

const ME_THEME = {
  dot: 'bg-gradient-to-tr from-orange-500 to-amber-400 ring-2 ring-white ring-offset-2 ring-offset-[#131722] shadow-[0_0_14px_rgba(249,115,22,1)] scale-110',
  trail: 'bg-gradient-to-r from-orange-500/20 via-orange-500/50 to-orange-400',
  core: 'bg-white',
};

export default function WaitingRoomView({ room, user, onMatchCompleted, onEarlyResults }) {
  const [participants, setParticipants] = useState(room.participants || []);
  const [isCompleted, setIsCompleted] = useState(false);

  const targetScore = Math.max(100, (room.total_questions || 5) * 100);

  useEffect(() => {
    let active = true;

    // WebSocket listener for match completion
    const token = getToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/rooms/${room.code}?token=${token}`;

    let ws = null;
    try {
      ws = new WebSocket(wsUrl);
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'MATCH_COMPLETED') {
            setIsCompleted(true);
            setTimeout(() => onMatchCompleted(), 1000);
          } else if (msg.event === 'SCORE_SURGE' || msg.event === 'PLAYER_PROGRESS') {
            refresh();
          }
        } catch (_) {}
      };
    } catch (_) {}

    const refresh = async () => {
      try {
        const state = await api.rooms.get(room.code);
        if (active) {
          setParticipants(state.participants || []);
          if (state.status === 'COMPLETED' || (state.participants && state.participants.length > 0 && state.participants.every((p) => p.is_finished))) {
            setIsCompleted(true);
            setTimeout(() => onMatchCompleted(), 1000);
          }
        }
      } catch (_) {}
    };

    const interval = setInterval(refresh, 2500);

    return () => {
      active = false;
      clearInterval(interval);
      if (ws) ws.close();
    };
  }, [room.code]);

  const finishedCount = participants.filter((p) => p.is_finished).length;
  const totalCount = participants.length;

  return (
    <div className="max-w-4xl mx-auto px-4 py-12 text-center page-transition">
      <div className="bg-[#262c3c] border border-orange-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl glow-orange-subtle">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-950/80 border border-orange-500/40 text-orange-400 mb-4 animate-pulse">
          <CheckCircle2 className="w-8 h-8 text-emerald-400" />
        </div>

        <h1 className="text-3xl font-black text-white">
          {room.mode === 'MOCK_TEST' ? 'NTA Examination Paper Submitted!' : 'Questions Completed!'}
        </h1>
        <p className="text-slate-400 text-sm mt-2 max-w-md mx-auto">
          {room.mode === 'MOCK_TEST'
            ? 'Your answers have been securely recorded. Waiting for peer aspirants to finish their examination papers...'
            : 'You have finished all questions. Watching live race lanes as challengers lock in their final answers...'}
        </p>

        {/* Live Race Lanes / Candidate Progress */}
        <div className="my-8 bg-[#101524] border border-white/10 rounded-2xl p-4 sm:p-5 text-left shadow-inner">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Flame className="w-4 h-4 text-orange-400 fill-orange-400" />
              <span>{room.mode === 'MOCK_TEST' ? 'Live Candidate Progression' : 'Live Race Track Lanes'}</span>
            </span>
            <span className="font-mono text-orange-400 font-bold text-[11px]">
              {finishedCount} / {totalCount} Finished 🏁
            </span>
          </div>

          <div className="space-y-2">
            {participants.map((p, idx) => {
              const isMe = p.user_id === user?.id;
              const progress = Math.min(94, Math.max(0, (p.score / targetScore) * 100));
              const laneTheme = isMe ? ME_THEME : LANE_THEMES[idx % LANE_THEMES.length];

              return (
                <div
                  key={p.user_id}
                  className={`flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-xl transition ${
                    isMe
                      ? 'bg-orange-500/10 border border-orange-500/40'
                      : 'bg-[#151926]/80 border border-white/5'
                  }`}
                >
                  {/* Driver Name & Status */}
                  <div className="w-28 sm:w-36 shrink-0 flex items-center gap-2">
                    <div className="w-6 h-6 rounded-lg bg-[#1e2433] border border-white/10 flex items-center justify-center text-xs shrink-0 overflow-hidden">
                      {p.avatar_image_url ? (
                        <img src={p.avatar_image_url} alt={p.username} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        p.avatar_id === 'atom' ? '⚛️' : p.avatar_id === 'rocket' ? '🚀' : p.avatar_id === 'brain' ? '🧠' : '🔥'
                      )}
                    </div>
                    <div className="overflow-hidden leading-tight flex-1">
                      <span className={`text-xs truncate block ${isMe ? 'text-orange-400 font-black' : 'text-slate-200 font-bold'}`}>
                        {isMe ? 'You' : p.username}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {room.mode === 'MOCK_TEST'
                          ? (p.is_finished ? 'Submitted • 🏁' : 'Solving... ⏳')
                          : `${p.score} pts ${p.is_finished ? '• 🏁 Done' : '• ⏳ Solving'}`}
                      </span>
                    </div>
                  </div>

                  {/* Individual Lane with Dot */}
                  <div className="relative flex-1 h-7 bg-[#101420] border border-white/10 rounded-xl overflow-visible px-2 flex items-center shadow-inner">
                    <div className="absolute left-2 right-6 h-[1px] border-b border-dashed border-white/10 z-0"></div>
                    <div className="absolute right-2 top-0 bottom-0 flex items-center text-slate-500 font-mono text-[10px] select-none z-0">
                      🏁
                    </div>

                    <div
                      style={{ width: `${progress}%` }}
                      className={`h-1.5 rounded-full transition-all duration-700 ease-out z-0 ${laneTheme.trail}`}
                    />

                    {/* RACER DOT */}
                    <div
                      style={{ left: `calc(${progress}% + 8px)` }}
                      className="absolute -translate-x-1/2 flex items-center justify-center z-10 transition-all duration-700 ease-out"
                    >
                      <div
                        className={`w-5 h-5 rounded-full flex items-center justify-center ${laneTheme.dot}`}
                      >
                        <div className={`w-1.5 h-1.5 rounded-full ${laneTheme.core} animate-pulse`} />
                      </div>

                      <div
                        className={`absolute -top-5 px-1 py-0.2 rounded text-[8px] font-mono font-bold whitespace-nowrap ${
                          isMe
                            ? 'bg-orange-500 text-white'
                            : 'bg-[#262c3c] border border-white/20 text-slate-300'
                        }`}
                      >
                        {p.score}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Early Exit Option */}
        <button
          onClick={onEarlyResults}
          className="text-xs text-slate-400 hover:text-orange-400 transition underline underline-offset-4 cursor-pointer"
        >
          View early partial results without waiting
        </button>
      </div>
    </div>
  );
}
