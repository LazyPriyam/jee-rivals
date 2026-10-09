import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { api, getToken } from '../utils/api';
import MathRenderer from './MathRenderer';
import { sound } from '../utils/sound';
import { Timer, Zap, Trophy, CheckCircle2, XCircle, ArrowRight, Image as ImageIcon, Flame, Flag, BookOpen } from 'lucide-react';

const LANE_THEMES = [
  {
    dot: 'bg-gradient-to-tr from-cyan-400 to-blue-500 ring-2 ring-cyan-300 ring-offset-2 ring-offset-[#131722] shadow-[0_0_12px_rgba(34,211,238,0.9)]',
    trail: 'bg-gradient-to-r from-cyan-500/20 via-cyan-500/50 to-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.6)]',
    core: 'bg-cyan-100',
  },
  {
    dot: 'bg-gradient-to-tr from-emerald-400 to-teal-500 ring-2 ring-emerald-300 ring-offset-2 ring-offset-[#131722] shadow-[0_0_12px_rgba(52,211,153,0.9)]',
    trail: 'bg-gradient-to-r from-emerald-500/20 via-emerald-500/50 to-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]',
    core: 'bg-emerald-100',
  },
  {
    dot: 'bg-gradient-to-tr from-purple-400 to-indigo-500 ring-2 ring-purple-300 ring-offset-2 ring-offset-[#131722] shadow-[0_0_12px_rgba(192,132,252,0.9)]',
    trail: 'bg-gradient-to-r from-purple-500/20 via-purple-500/50 to-purple-400 shadow-[0_0_8px_rgba(192,132,252,0.6)]',
    core: 'bg-purple-100',
  },
  {
    dot: 'bg-gradient-to-tr from-amber-400 to-yellow-500 ring-2 ring-amber-300 ring-offset-2 ring-offset-[#131722] shadow-[0_0_12px_rgba(251,191,36,0.9)]',
    trail: 'bg-gradient-to-r from-amber-500/20 via-amber-500/50 to-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.6)]',
    core: 'bg-amber-100',
  },
  {
    dot: 'bg-gradient-to-tr from-rose-400 to-pink-500 ring-2 ring-rose-300 ring-offset-2 ring-offset-[#131722] shadow-[0_0_12px_rgba(251,113,133,0.9)]',
    trail: 'bg-gradient-to-r from-rose-500/20 via-rose-500/50 to-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.6)]',
    core: 'bg-rose-100',
  },
];

const ME_THEME = {
  dot: 'bg-gradient-to-tr from-orange-500 to-amber-400 ring-2 ring-white ring-offset-2 ring-offset-[#131722] shadow-[0_0_14px_rgba(249,115,22,1)] scale-110',
  trail: 'bg-gradient-to-r from-orange-500/20 via-orange-500/50 to-orange-400 shadow-[0_0_8px_rgba(249,115,22,0.7)]',
  core: 'bg-white',
};

export default function SpeedDuelView({
  room,
  user,
  onPlayerFinished,
  onMatchComplete,
  onExitToDashboard,
  onForfeit
}) {
  const [roomState, setRoomState] = useState(room);
  const [currentQ, setCurrentQ] = useState(room.current_question || null);
  const [selectedOption, setSelectedOption] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [startTime, setStartTime] = useState(Date.now());
  const [feedback, setFeedback] = useState(null);
  const [diagramZoom, setDiagramZoom] = useState(false);
  const [forfeitConfirmOpen, setForfeitConfirmOpen] = useState(false);

  // Compute wall-clock deadline for current question
  const getInitialDeadline = () => {
    if (room.time_remaining_seconds != null) {
      return Date.now() + room.time_remaining_seconds * 1000;
    }
    return Date.now() + (room.time_per_question || 90) * 1000;
  };

  const deadlineRef = useRef(getInitialDeadline());
  const [timeRemaining, setTimeRemaining] = useState(() => {
    return Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
  });

  const timerRef = useRef(null);
  const wsRef = useRef(null);
  const submittingRef = useRef(false);

  // Setup WebSocket for live score surges
  useEffect(() => {
    const token = getToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/rooms/${room.code}?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'SCORE_SURGE' || msg.event === 'PLAYER_PROGRESS') {
            api.rooms.get(room.code).then((updated) => {
              setRoomState((prev) => ({ ...prev, participants: updated.participants }));
            }).catch(() => {});
          } else if (msg.event === 'MATCH_COMPLETED') {
            onMatchComplete();
          }
        } catch (_) {}
      };
    } catch (_) {}

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, [room.code]);

  // Polling fallback to keep participants, server deadline, and match completion synced
  useEffect(() => {
    let active = true;
    const pollInterval = setInterval(() => {
      api.rooms.get(room.code).then((updated) => {
        if (!active || !updated) return;
        setRoomState((prev) => ({ ...prev, participants: updated.participants }));

        // Recalibrate deadline if server clock differs by > 2s
        if (updated.time_remaining_seconds != null && !submittingRef.current && !feedback) {
          const serverRem = updated.time_remaining_seconds;
          const currentLocalRem = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
          if (Math.abs(serverRem - currentLocalRem) > 2) {
            deadlineRef.current = Date.now() + serverRem * 1000;
            setTimeRemaining(serverRem);
          }
        }

        if (updated.status === 'COMPLETED') {
          onMatchComplete();
        } else if (updated.participants?.find((p) => p.user_id === user?.id)?.is_finished) {
          onPlayerFinished();
        }
      }).catch(() => {});
    }, 2500);

    return () => {
      active = false;
      clearInterval(pollInterval);
    };
  }, [room.code, user?.id]);

  // Sync current question when roomState changes or initially
  useEffect(() => {
    if (!currentQ) {
      api.rooms.get(room.code).then((data) => {
        setRoomState(data);
        if (data.current_question) {
          setCurrentQ(data.current_question);
          const perQ = data.time_remaining_seconds != null ? data.time_remaining_seconds : (data.time_per_question || 90);
          deadlineRef.current = Date.now() + perQ * 1000;
          setTimeRemaining(perQ);
          setStartTime(Date.now());
          setSelectedOption('');
        } else if (data.status === 'COMPLETED') {
          onMatchComplete();
        } else if (data.participants?.find((p) => String(p.user_id) === String(user?.id) || p.username === user?.username)?.is_finished) {
          onPlayerFinished();
        }
      }).catch(() => {});
    }
  }, [currentQ]);

  // Wall-Clock Countdown Timer with Tab-Switch Proof Synchronization
  useEffect(() => {
    clearInterval(timerRef.current);
    if (!currentQ || submitting || feedback) return;

    const tick = () => {
      const rem = Math.max(0, Math.ceil((deadlineRef.current - Date.now()) / 1000));
      setTimeRemaining(rem);
      if (rem <= 5 && rem > 0) {
        sound.tick();
      }
      if (rem <= 0) {
        clearInterval(timerRef.current);
        handleAutoTimeout();
      }
    };

    tick();
    timerRef.current = setInterval(tick, 1000);

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
      clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleFocus);
    };
  }, [currentQ?.id, submitting, feedback]);

  const handleAutoTimeout = () => {
    if (!currentQ || submittingRef.current) return;
    const choice = selectedOption || 'TIMEOUT';
    doSubmit(choice);
  };

  const doSubmit = async (option) => {
    if (!currentQ || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    clearInterval(timerRef.current); // Stop timer immediately during feedback

    const chosen = option || selectedOption || 'TIMEOUT';
    const timeSpent = Math.max(1, Math.round((Date.now() - startTime) / 1000));

    try {
      const res = await api.rooms.submit(room.code, {
        question_id: currentQ.id,
        selected_option: chosen,
        time_spent_seconds: timeSpent,
      });

      if (res.is_correct) {
        sound.correct();
      } else {
        sound.wrong();
      }

      setFeedback({
        isCorrect: res.is_correct,
        deltaScore: res.delta_score,
      });

      setTimeout(async () => {
        setFeedback(null);
        submittingRef.current = false;
        setSubmitting(false);

        if (res.match_completed) {
          onMatchComplete();
        } else if (res.is_finished) {
          onPlayerFinished();
        } else {
          // Advance directly to next_question from server response
          const perQ = roomState.time_per_question || 90;
          deadlineRef.current = Date.now() + perQ * 1000;
          setTimeRemaining(perQ);

          if (res.next_question) {
            setCurrentQ(res.next_question);
          } else {
            const nextState = await api.rooms.get(room.code);
            setRoomState(nextState);
            setCurrentQ(nextState.current_question);
            if (nextState.time_remaining_seconds != null) {
              deadlineRef.current = Date.now() + nextState.time_remaining_seconds * 1000;
              setTimeRemaining(nextState.time_remaining_seconds);
            }
          }
          setStartTime(Date.now());
          setSelectedOption('');
        }
      }, 1200);
    } catch (err) {
      submittingRef.current = false;
      setSubmitting(false);
      console.error(err);
    }
  };

  // Canonical keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (submitting || !currentQ) return;
      if (!currentQ.options || currentQ.options.length === 0) return;

      const isMulti = currentQ?.type === 'MULTIPLE_CHOICE' || currentQ?.type === 'MULTI_CORRECT';

      const toggleMulti = (targetKey) => {
        sound.click();
        const arr = selectedOption ? selectedOption.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [];
        const next = arr.includes(targetKey) ? arr.filter(x => x !== targetKey) : [...arr, targetKey];
        setSelectedOption(next.sort().join(', '));
      };

      if (optKeys.includes(key)) {
        if (isMulti) {
          toggleMulti(key);
        } else {
          sound.click();
          setSelectedOption(currentQ.options.find((o) => String(o.key).toUpperCase() === key).key);
        }
      } else if (key === '1' && optKeys.length > 0) {
        if (isMulti) toggleMulti(currentQ.options[0].key);
        else { sound.click(); setSelectedOption(currentQ.options[0].key); }
      } else if (key === '2' && optKeys.length > 1) {
        if (isMulti) toggleMulti(currentQ.options[1].key);
        else { sound.click(); setSelectedOption(currentQ.options[1].key); }
      } else if (key === '3' && optKeys.length > 2) {
        if (isMulti) toggleMulti(currentQ.options[2].key);
        else { sound.click(); setSelectedOption(currentQ.options[2].key); }
      } else if (key === '4' && optKeys.length > 3) {
        if (isMulti) toggleMulti(currentQ.options[3].key);
        else { sound.click(); setSelectedOption(currentQ.options[3].key); }
      } else if (e.key === 'Enter' && selectedOption) {
        doSubmit(selectedOption);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedOption, submitting, currentQ]);

  const myParticipant = roomState.participants?.find((p) => String(p.user_id) === String(user?.id) || p.username === user?.username);
  const currentIdx = (myParticipant?.current_question_index || 0) + 1;
  const totalQuestions = roomState.total_questions || 5;

  const timerFraction = timeRemaining / (roomState.time_per_question || 90);
  const timerColor =
    timerFraction > 0.5
      ? 'from-orange-500 to-amber-500'
      : timerFraction > 0.25
      ? 'from-amber-500 to-yellow-500'
      : 'from-red-500 to-rose-600 animate-pulse';

  const isNumerical = !currentQ?.options || currentQ?.options.length === 0 || ['NUMERICAL', 'INTEGER', 'SUBJECTIVE'].includes(currentQ?.question_type);

  // Target Score for the duel progress bar
  const targetScore = Math.max(100, totalQuestions * 100);
  const sortedParticipants = [...(roomState.participants || [])].sort((a, b) => b.score - a.score);
  const leader = sortedParticipants[0];
  const secondLeader = sortedParticipants[1];
  const leadMargin = leader && secondLeader ? leader.score - secondLeader.score : 0;

  if (!currentQ) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <div className="inline-block animate-spin text-orange-500 mb-4">
          <Zap className="w-10 h-10" />
        </div>
        <h2 className="text-2xl font-bold text-white">Loading Question Duel...</h2>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 page-transition">
      {/* 1. Multi-Lane Duel Progress Race Track */}
      <div className="bg-[#101524] border border-orange-500/30 rounded-3xl p-4 sm:p-5 mb-6 shadow-2xl glow-orange-subtle">
        {/* Track Header */}
        <div className="flex items-center justify-between mb-3 text-xs">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500 fill-orange-500 animate-pulse" />
            <span className="font-black text-white uppercase tracking-wider">
              Live Duel Race Lanes
            </span>
            {leader && sortedParticipants.length > 1 && (
              <span className="hidden sm:inline-block text-[11px] font-semibold text-orange-400 bg-orange-950/60 px-2.5 py-0.5 rounded-full border border-orange-500/30">
                {leadMargin > 0 ? `👑 ${leader.username} leads (+${leadMargin} pts)` : '⚡ Tied for 1st place!'}
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 font-mono font-bold text-slate-300">
            <span className="text-slate-500 text-[10px] uppercase">Goal:</span>
            <span className="text-orange-400 bg-[#1e2433] px-2.5 py-0.5 rounded-lg border border-white/10">
              {targetScore} PTS 🏁
            </span>
          </div>
        </div>

        {/* Separate Horizontal Lanes Container */}
        <div className="space-y-2">
          {roomState.participants?.map((p, idx) => {
            const isMe = p.user_id === user.id;
            const progress = Math.min(94, Math.max(0, (p.score / targetScore) * 100));
            const laneTheme = isMe ? ME_THEME : LANE_THEMES[idx % LANE_THEMES.length];
            const isRank1 = leader && leader.user_id === p.user_id && leader.score > 0;

            return (
              <div
                key={p.user_id}
                className={`flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 rounded-2xl transition ${
                  isMe
                    ? 'bg-orange-500/10 border border-orange-500/40 shadow-sm'
                    : 'bg-[#151926]/80 border border-white/5'
                }`}
              >
                {/* Lane Label: Driver Info */}
                <div className="w-24 sm:w-36 shrink-0 flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-[#1e2433] border border-white/10 flex items-center justify-center text-xs shrink-0 relative shadow-inner">
                    {p.avatar_id === 'atom' ? '⚛️' : p.avatar_id === 'rocket' ? '🚀' : p.avatar_id === 'brain' ? '🧠' : '🔥'}
                    {isRank1 && (
                      <span className="absolute -top-1.5 -right-1.5 text-[10px]" title="Race Leader">👑</span>
                    )}
                  </div>
                  <div className="overflow-hidden leading-tight flex-1">
                    <span className={`text-xs truncate block ${isMe ? 'text-orange-400 font-black' : 'text-slate-200 font-bold'}`}>
                      {isMe ? 'You' : p.username}
                    </span>
                    <span className="text-[10px] text-slate-400 font-mono flex items-center gap-1">
                      <span className={isMe ? 'text-orange-400 font-bold' : 'text-slate-300'}>{p.score} pts</span>
                      {p.is_finished && <span className="text-[9px] text-emerald-400 font-bold font-mono">✓ DONE</span>}
                    </span>
                  </div>
                </div>

                {/* The Individual Race Lane with Dot */}
                <div className="relative flex-1 h-7 sm:h-8 bg-[#101420] border border-white/10 rounded-xl overflow-visible px-2 flex items-center shadow-inner">
                  {/* Subtle Center Runway Dashed Guide */}
                  <div className="absolute left-2 right-6 h-[1px] border-b border-dashed border-white/10 z-0"></div>

                  {/* Distance Markers (25%, 50%, 75%) */}
                  <div className="absolute left-[25%] top-1.5 bottom-1.5 w-px bg-white/10 z-0"></div>
                  <div className="absolute left-[50%] top-1.5 bottom-1.5 w-px bg-white/10 z-0"></div>
                  <div className="absolute left-[75%] top-1.5 bottom-1.5 w-px bg-white/10 z-0"></div>

                  {/* Finish Line Checkered Marker */}
                  <div className="absolute right-2 top-0 bottom-0 flex items-center text-slate-500 font-mono text-[10px] select-none z-0">
                    🏁
                  </div>

                  {/* Illuminated Progress Trail leading to the dot */}
                  <div
                    style={{ width: `${progress}%` }}
                    className={`h-1.5 rounded-full transition-all duration-700 ease-out z-0 ${laneTheme.trail}`}
                  />

                  {/* THE RACER DOT */}
                  <div
                    style={{ left: `calc(${progress}% + 8px)` }}
                    className="absolute -translate-x-1/2 flex items-center justify-center z-10 transition-all duration-700 ease-out group cursor-pointer"
                  >
                    {/* Glowing Circular Bead Dot */}
                    <div
                      className={`w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center transition-transform duration-200 group-hover:scale-125 ${laneTheme.dot}`}
                    >
                      <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${laneTheme.core} animate-pulse`} />
                    </div>

                    {/* Floating Micro Score Tag above dot */}
                    <div
                      className={`absolute -top-5 px-1.5 py-0.2 rounded text-[8px] sm:text-[9px] font-mono font-black shadow-md transition-opacity pointer-events-none opacity-80 group-hover:opacity-100 whitespace-nowrap ${
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

        {/* Track Milestones Footer */}
        <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono mt-3 px-1 sm:pl-40">
          <span>0 PTS (START)</span>
          <span className="hidden sm:inline">25% ({Math.round(targetScore * 0.25)} PTS)</span>
          <span>50% ({Math.round(targetScore * 0.5)} PTS)</span>
          <span className="hidden sm:inline">75% ({Math.round(targetScore * 0.75)} PTS)</span>
          <span className="text-orange-400 font-bold">100% ({targetScore} PTS) 🏁</span>
        </div>
      </div>

      {/* 2. Duel Question Card */}
      <div className="relative bg-[#262c3c] border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl">
        {/* Dynamic Timer Bar */}
        <div className="absolute top-0 left-0 right-0 h-2 bg-slate-900 rounded-t-3xl overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${timerColor} transition-all duration-1000 ease-linear`}
            style={{ width: `${Math.max(0, timerFraction * 100)}%` }}
          />
        </div>

        {/* Card Header */}
        <div className="flex items-center justify-between mb-6 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 bg-orange-950/80 border border-orange-500/40 text-orange-400 rounded-lg text-xs font-bold font-mono">
              Q {currentIdx} / {totalQuestions}
            </span>
            <span className="px-2.5 py-1 bg-white/5 border border-white/10 text-white rounded-lg text-xs font-semibold">
              {currentQ.subject}
            </span>
            <span className="px-2.5 py-1 bg-white/5 border border-white/10 text-slate-400 rounded-lg text-xs">
              {currentQ.chapter}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2 text-sm font-mono font-bold text-slate-200 bg-[#1e2433] px-3.5 py-1.5 rounded-xl border border-white/10">
              <Timer className="w-4 h-4 text-orange-400" />
              <span className={timeRemaining <= 15 ? 'text-red-400 font-black animate-pulse' : 'text-white'}>
                {timeRemaining}s
              </span>
            </div>

            {onExitToDashboard && (
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  onExitToDashboard();
                }}
                className="px-3 py-1.5 bg-[#1e2433] hover:bg-[#293247] text-slate-300 hover:text-white text-xs font-bold rounded-xl border border-white/10 transition cursor-pointer"
                title="Pause screen and return to Dashboard (Match remains active)"
              >
                Dashboard
              </button>
            )}

            {onForfeit && (
              <button
                type="button"
                onClick={() => setForfeitConfirmOpen(true)}
                className="px-2.5 py-1.5 bg-[#1e2433] hover:bg-rose-950/40 text-slate-400 hover:text-rose-400 text-xs font-bold rounded-xl border border-white/10 hover:border-rose-500/30 transition cursor-pointer"
                title="Forfeit Match"
              >
                Forfeit
              </button>
            )}
          </div>
        </div>

        {/* Comprehension / Paragraph Box */}
        {currentQ.passage_text && (
          <div className="mb-6 rounded-2xl bg-[#1a2133] border-2 border-blue-500/40 shadow-lg overflow-hidden">
            <div className="bg-gradient-to-r from-blue-950/80 via-[#1f293d] to-[#1a2133] border-b border-blue-500/30 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-xs font-black uppercase tracking-wider text-blue-200">
                  {currentQ.passage_title || 'Comprehension Passage'}
                </span>
              </div>
              {currentQ.subquestion_index && currentQ.subquestion_total && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-bold border border-blue-400/30">
                  Question {currentQ.subquestion_index} of {currentQ.subquestion_total} based on this passage
                </span>
              )}
            </div>
            <div className="p-4 sm:p-5 text-sm sm:text-base leading-relaxed text-slate-200 font-normal max-h-72 overflow-y-auto border-b border-white/5 bg-[#141a29]/80">
              <MathRenderer content={currentQ.passage_text} />
            </div>
            <div className="px-4 py-1.5 bg-blue-950/40 text-[11px] text-blue-300 font-medium flex items-center justify-between">
              <span>Read the passage carefully and answer the question below:</span>
              <span className="font-mono text-[10px] text-blue-400 uppercase">JEE Advanced Format</span>
            </div>
          </div>
        )}

        {/* Question Text */}
        <div className="text-base sm:text-lg text-slate-100 mb-6 font-medium leading-relaxed">
          <MathRenderer content={currentQ.text} />
        </div>

        {/* Question Diagram */}
        {currentQ.has_diagram && currentQ.diagram_urls && currentQ.diagram_urls.length > 0 && (
          <div className="mb-6 bg-[#1e2433] border border-white/10 rounded-2xl p-3 flex flex-col items-center">
            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-2 self-start font-medium">
              <ImageIcon className="w-3.5 h-3.5 text-orange-400" />
              <span>Problem Diagram Crop (Click to toggle zoom)</span>
            </div>
            <img
              src={currentQ.diagram_urls[0]}
              alt="Problem Diagram"
              onClick={() => setDiagramZoom(!diagramZoom)}
              className={`max-h-64 object-contain rounded-lg border border-slate-700/50 bg-white p-2 cursor-pointer transition ${
                diagramZoom ? 'scale-125 z-20 shadow-2xl' : 'hover:opacity-95'
              }`}
            />
          </div>
        )}

        {/* Options Grid or Numerical Input */}
        {isNumerical ? (
          <div className="mb-6 p-4 bg-[#1e2433] rounded-2xl border border-white/10">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Numerical Value Response
            </label>
            <input
              type="text"
              inputMode="decimal"
              placeholder="Enter numerical answer..."
              value={selectedOption}
              onChange={(e) => setSelectedOption(e.target.value)}
              className="w-full px-4 py-3 bg-[#293144] border border-white/20 rounded-xl font-mono text-lg font-bold text-orange-300 focus:outline-none focus:border-orange-500"
            />
          </div>
        ) : (
          <div className="space-y-2 mb-6">
            {(currentQ?.type === 'MULTIPLE_CHOICE' || currentQ?.type === 'MULTI_CORRECT') && (
              <div className="text-[11px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-lg inline-flex items-center gap-1.5 mb-1">
                <span>Multiple Correct: Select all applicable options</span>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3">
              {currentQ.options?.map((opt) => {
                const isMulti = currentQ?.type === 'MULTIPLE_CHOICE' || currentQ?.type === 'MULTI_CORRECT';
                const isSelected = isMulti
                  ? (selectedOption ? selectedOption.split(',').map(s => s.trim().toUpperCase()).includes(String(opt.key).toUpperCase()) : false)
                  : selectedOption === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    disabled={submitting}
                    onClick={() => {
                      if (isMulti) {
                        const arr = selectedOption ? selectedOption.split(',').map(s => s.trim().toUpperCase()).filter(Boolean) : [];
                        const targetKey = String(opt.key).toUpperCase();
                        const next = arr.includes(targetKey) ? arr.filter(x => x !== targetKey) : [...arr, targetKey];
                        sound.click();
                        setSelectedOption(next.sort().join(', '));
                      } else {
                        sound.click();
                        setSelectedOption(opt.key);
                      }
                    }}
                    className={`flex items-start gap-3 p-4 rounded-2xl border text-left transition cursor-pointer ${
                      isSelected
                        ? 'border-orange-500 bg-orange-950/40 text-white shadow-lg shadow-orange-950/60 ring-1 ring-orange-500'
                        : 'border-white/10 bg-[#1e2433] text-slate-200 hover:border-white/30 hover:bg-[#293144]'
                    }`}
                  >
                    <span
                      className={`w-7 h-7 shrink-0 rounded-xl flex items-center justify-center font-mono font-bold text-xs transition ${
                        isSelected
                          ? 'bg-orange-500 text-white'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {opt.key}
                    </span>
                    <div className="text-sm pt-0.5 flex-1">
                      <MathRenderer content={opt.text} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Instant Feedback Splash Overlay */}
        {feedback && (
          <div className="absolute inset-0 z-30 bg-black/75 backdrop-blur-sm rounded-3xl flex items-center justify-center animate-in fade-in duration-150">
            <div className="text-center p-6 rounded-2xl bg-[#262c3c] border border-white/20 shadow-2xl">
              {feedback.isCorrect ? (
                <>
                  <CheckCircle2 className="w-16 h-16 text-emerald-400 mx-auto mb-2 animate-bounce" />
                  <h3 className="text-2xl font-black text-emerald-400">CORRECT!</h3>
                  <p className="text-lg font-mono font-extrabold text-amber-400 mt-1">
                    +{feedback.deltaScore} Points
                  </p>
                </>
              ) : (
                <>
                  <XCircle className="w-16 h-16 text-rose-500 mx-auto mb-2" />
                  <h3 className="text-2xl font-black text-rose-500">INCORRECT</h3>
                  <p className="text-lg font-mono font-extrabold text-rose-400 mt-1">
                    {feedback.deltaScore} Points
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Submit Action Bar */}
        <div className="flex items-center justify-between pt-2 border-t border-white/10">
          <div className="text-xs text-slate-400 hidden sm:block">
            Press <span className="text-orange-400 font-mono">1-4</span> or <span className="text-orange-400 font-mono">A-D</span> to select, <span className="text-orange-400 font-mono">Enter</span> to submit
          </div>

          <button
            type="button"
            disabled={!selectedOption || submitting}
            onClick={() => doSubmit(selectedOption)}
            className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black rounded-xl transition shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ml-auto glow-orange-subtle"
          >
            {submitting ? (
              <span className="animate-pulse">Locking in...</span>
            ) : (
              <>
                <span>Lock In Answer</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>

      {/* Forfeit Confirmation Modal */}
      {forfeitConfirmOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#1b2232] border border-rose-500/40 rounded-3xl max-w-md w-full p-6 text-slate-100 shadow-2xl space-y-4">
            <h3 className="text-base font-black text-rose-400">Forfeit Speed Duel?</h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
              Are you sure you want to forfeit? Your match will conclude immediately and you will receive zero points for remaining questions.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setForfeitConfirmOpen(false)}
                className="px-4 py-2 bg-[#293247] hover:bg-[#343e57] text-slate-200 font-bold text-xs rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  sound.click();
                  setForfeitConfirmOpen(false);
                  if (onForfeit) {
                    await onForfeit(room.code);
                  }
                }}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition cursor-pointer"
              >
                Confirm Forfeit
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
