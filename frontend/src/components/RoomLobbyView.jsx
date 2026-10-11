import React, { useState, useEffect, useRef } from 'react';
import { api, getToken } from '../utils/api';
import { Copy, Check, Users, Swords, Play, ArrowLeft, Crown, Sparkles, BookOpen, AlertCircle, Flame, Link2, Share2, Trash2, UserX } from 'lucide-react';

export default function RoomLobbyView({ room, user, onStartMatch, onLeaveRoom, onViewProfile }) {
  const [currentRoom, setCurrentRoom] = useState(room);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [participants, setParticipants] = useState(room.participants || []);
  const [starting, setStarting] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState('');
  const wsRef = useRef(null);

  // Dynamic host status based on latest room state
  const isHost = Boolean(user && currentRoom && (currentRoom.host_id === user.id || Boolean(currentRoom.tournament_id)));

  // Fetch latest room state
  const refreshRoom = async () => {
    try {
      const state = await api.rooms.get(currentRoom.code);
      setCurrentRoom(state);
      setParticipants(state.participants || []);
      if (state.status === 'IN_PROGRESS') {
        onStartMatch(state);
      }
    } catch (_) {}
  };

  // Poll room updates & WebSocket connectivity
  useEffect(() => {
    let active = true;

    // 1. Establish WebSocket for instant push
    const token = getToken();
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/rooms/${currentRoom.code}?token=${token}`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (
            msg.event === 'PLAYER_JOINED' ||
            msg.event === 'PLAYER_LEFT' ||
            msg.event === 'HOST_CHANGED'
          ) {
            refreshRoom();
          } else if (msg.event === 'PLAYER_KICKED') {
            if (msg.data?.user_id === user?.id) {
              alert('You have been removed from the battle room by the host.');
              onLeaveRoom();
            } else {
              refreshRoom();
            }
          } else if (msg.event === 'MATCH_STARTED') {
            api.rooms.get(currentRoom.code).then((startedState) => {
              onStartMatch(startedState || currentRoom);
            }).catch(() => {
              onStartMatch(currentRoom);
            });
          }
        } catch (_) {}
      };
    } catch (_) {}

    // 2. Fetch room immediately on mount and poll every 1.5s
    const pollInterval = setInterval(() => {
      if (active) refreshRoom();
    }, 1500);

    refreshRoom(); // Fetch immediately on load

    // 3. Tab close / unload cleanup beacon
    const handleBeforeUnload = () => {
      const curToken = getToken();
      if (curToken && currentRoom?.code) {
        try {
          fetch(`/api/rooms/${currentRoom.code}/leave`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${curToken}`,
            },
            keepalive: true,
          });
        } catch (_) {}
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      active = false;
      clearInterval(pollInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [currentRoom.code]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(currentRoom.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLink = () => {
    const link = `${window.location.origin}/?join=${currentRoom.code}`;
    navigator.clipboard.writeText(link);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleRemovePlayer = async (targetUserId, targetUsername) => {
    if (!window.confirm(`Remove ${targetUsername} from the room lobby?`)) return;
    try {
      const state = await api.rooms.removePlayer(currentRoom.code, targetUserId);
      setCurrentRoom(state);
      setParticipants(state.participants || []);
    } catch (err) {
      setError(err.message || 'Failed to remove player.');
    }
  };

  const handleLeave = async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await api.rooms.leave(currentRoom.code);
    } catch (_) {}
    onLeaveRoom();
  };

  const handleStart = async () => {
    setStarting(true);
    setError('');
    try {
      const started = await api.rooms.start(currentRoom.code);
      onStartMatch(started);
    } catch (err) {
      setError(err.message || 'Failed to start match.');
      setStarting(false);
      // Auto-refresh in case host privileges changed
      refreshRoom();
    }
  };

  const handleTransferHost = async (targetUserId) => {
    try {
      await api.rooms.transferHost(currentRoom.code, targetUserId);
      await refreshRoom();
    } catch (err) {
      setError(err.message || 'Failed to transfer host privileges.');
    }
  };

  const handleClaimHost = async () => {
    try {
      await api.rooms.claimHost(currentRoom.code);
      await refreshRoom();
    } catch (err) {
      setError(err.message || 'Could not claim host.');
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 page-transition">
      {/* Top action */}
      <button
        onClick={handleLeave}
        disabled={leaving}
        className="mb-6 flex items-center gap-2 text-sm text-slate-400 hover:text-white transition cursor-pointer disabled:opacity-50"
      >
        <ArrowLeft className="w-4 h-4" />
        <span>{leaving ? 'Leaving Room...' : 'Return to Arena'}</span>
      </button>

      {/* Main Lobby Card */}
      <div className="bg-[#262c3c] border border-orange-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl glow-orange-subtle text-center">
        {/* Mode & Details */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-orange-950/80 border border-orange-500/40 text-orange-400 text-xs font-bold uppercase tracking-wider mb-4">
          {currentRoom.mode === 'SPEED_DUEL' ? (
            <>
              <Sparkles className="w-3.5 h-3.5" />
              <span>Speed Duel • +100/Speed Bonus</span>
            </>
          ) : (
            <>
              <BookOpen className="w-3.5 h-3.5" />
              <span>Common NTA Mock • Shared Question Paper</span>
            </>
          )}
        </div>

        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
          {currentRoom.mode === 'MOCK_TEST' ? 'Common NTA Mock Arena' : 'Battle Lobby Ready'}
        </h1>
        <p className="text-slate-400 text-sm mt-1 max-w-lg mx-auto">
          {currentRoom.mode === 'MOCK_TEST'
            ? 'All participants in this lobby will receive the exact same synchronized question paper and compete under official NTA CBT conditions.'
            : 'Share room code or invite link with friends to duel together in real-time.'}
        </p>

        {/* Room Code Badge */}
        <div className="my-8 flex flex-col items-center justify-center gap-4">
          <div className="px-8 py-4 bg-[#1e2433] border-2 border-orange-500 rounded-2xl flex items-center gap-4 shadow-xl shadow-orange-950/50">
            <span className="font-mono text-4xl sm:text-5xl font-black tracking-widest text-orange-400">
              {currentRoom.code}
            </span>
          </div>

          {/* Action buttons for partner invitation */}
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={handleCopyCode}
              className="px-5 py-3 bg-white hover:bg-slate-200 text-slate-950 font-extrabold rounded-2xl transition flex items-center gap-2 cursor-pointer shadow-md text-xs sm:text-sm"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span className="text-emerald-700 font-bold">Code Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copy Code</span>
                </>
              )}
            </button>

            <button
              onClick={handleCopyLink}
              className="px-5 py-3 bg-[#1e2433] hover:bg-[#293144] border border-white/20 text-white font-extrabold rounded-2xl transition flex items-center gap-2 cursor-pointer shadow-md text-xs sm:text-sm"
            >
              {copiedLink ? (
                <>
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Link Copied!</span>
                </>
              ) : (
                <>
                  <Link2 className="w-4 h-4 text-orange-400" />
                  <span>Copy Invite Link</span>
                </>
              )}
            </button>

            <a
              href={`https://api.whatsapp.com/send?text=${encodeURIComponent(`Join my JEE Rivals Battle! Room Code: ${currentRoom.code} | Link: ${window.location.origin}/?join=${currentRoom.code}`)}`}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-2xl transition flex items-center gap-2 text-xs sm:text-sm shadow-md"
            >
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </a>
          </div>
        </div>

        {/* Match Specs Bar */}
        <div className="grid grid-cols-3 gap-2 sm:gap-4 max-w-lg mx-auto mb-8 bg-[#1e2433] p-3.5 rounded-2xl border border-white/10 text-xs">
          <div>
            <span className="text-slate-500 block">Questions</span>
            <span className="font-bold text-slate-200">{currentRoom.total_questions} Items</span>
          </div>
          <div>
            <span className="text-slate-500 block">Timer</span>
            <span className="font-bold text-slate-200">
              {currentRoom.mode === 'MOCK_TEST'
                ? `${currentRoom.total_duration_minutes || 60}m Total`
                : `${currentRoom.time_per_question}s / Q`}
            </span>
          </div>
          <div>
            <span className="text-slate-500 block">Syllabus</span>
            <span className="font-bold text-orange-400 truncate block">
              {currentRoom.subject || 'All Subjects'}
            </span>
          </div>
        </div>

        {/* Participants Grid */}
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2 text-sm font-bold text-slate-300 mb-4">
            <Users className="w-4 h-4 text-orange-400" />
            <span>Challengers Joined ({participants.length})</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-w-2xl mx-auto">
            {participants.map((p) => {
              const pIsHost = p.user_id === currentRoom.host_id;
              const isMe = user && p.user_id === user.id;

              return (
                <div
                  key={p.user_id}
                  className={`flex items-center justify-between p-3 rounded-2xl bg-[#1e2433] border ${
                    pIsHost
                      ? 'border-amber-500/60 shadow-sm shadow-amber-950/40'
                      : 'border-white/10'
                  } hover:border-orange-500/40 transition text-left`}
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-orange-950/80 border border-orange-500/40 flex items-center justify-center text-base shrink-0 overflow-hidden">
                      {p.avatar_image_url ? (
                        <img src={p.avatar_image_url} alt={p.username} className="w-full h-full object-cover rounded-lg" />
                      ) : (
                        <>
                          {p.avatar_id === 'atom' && '⚛️'}
                          {p.avatar_id === 'zap' && '⚡'}
                          {p.avatar_id === 'rocket' && '🚀'}
                          {p.avatar_id === 'flame' && '🔥'}
                          {p.avatar_id === 'shield' && '🛡️'}
                          {p.avatar_id === 'target' && '🎯'}
                          {p.avatar_id === 'compass' && '🧭'}
                          {p.avatar_id === 'brain' && '🧠'}
                          {!['atom','zap','rocket','flame','shield','target','compass','brain'].includes(p.avatar_id) && '🔥'}
                        </>
                      )}
                    </div>
                    <div className="overflow-hidden">
                      <div className="flex items-center gap-1.5 font-bold text-xs text-white">
                        <span
                          onClick={() => onViewProfile && onViewProfile(p.username)}
                          className="truncate hover:text-orange-400 hover:underline cursor-pointer"
                        >
                          {p.username}
                        </span>
                        {pIsHost && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded bg-amber-950/90 border border-amber-500/50 text-[10px] text-amber-300 font-mono shrink-0">
                            <Crown className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                            <span>Host</span>
                          </span>
                        )}
                        {isMe && <span className="text-[10px] text-orange-400 font-mono shrink-0">(You)</span>}
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {p.overall_elo ? `Elo: ${p.overall_elo} • Ready` : 'Ready'}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* If current user is host, allow transferring crown to another human player */}
                    {isHost && !pIsHost && (
                      <button
                        onClick={() => handleTransferHost(p.user_id)}
                        title="Pass Host Leadership"
                        className="px-2 py-1 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 hover:text-amber-200 border border-amber-500/30 rounded-lg text-[10px] font-semibold transition cursor-pointer flex items-center gap-1"
                      >
                        <Crown className="w-3 h-3" />
                        <span>Pass Host</span>
                      </button>
                    )}
                    {/* If current user is host and participant is not self, allow kick/remove */}
                    {isHost && !pIsHost && (
                      <button
                        onClick={() => handleRemovePlayer(p.user_id, p.username)}
                        title="Kick Player from Lobby"
                        className="p-1.5 hover:text-red-400 hover:bg-red-950/50 text-slate-400 rounded-lg transition cursor-pointer"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {error && (
          <div className="max-w-md mx-auto mb-6 p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Action Button */}
        {isHost ? (
          <button
            onClick={handleStart}
            disabled={starting}
            className="px-8 py-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-lg rounded-2xl transition shadow-xl shadow-orange-950/50 flex items-center justify-center gap-3 mx-auto cursor-pointer disabled:opacity-50 glow-orange"
          >
            {starting ? (
              <span className="animate-pulse">Launching Arena...</span>
            ) : (
              <>
                <Play className="w-6 h-6 fill-current" />
                <span>{currentRoom.mode === 'MOCK_TEST' ? 'START GROUP MOCK TEST' : 'START BATTLE'}</span>
              </>
            )}
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-center gap-2 text-slate-400 text-sm animate-pulse">
              <span className="w-2.5 h-2.5 rounded-full bg-orange-400"></span>
              <span>Waiting for room host to initiate the match...</span>
            </div>
            {/* Self-healing option if host disconnected */}
            <div>
              <button
                onClick={handleClaimHost}
                className="text-xs text-slate-500 hover:text-amber-400 transition underline underline-offset-2 cursor-pointer"
              >
                Host inactive or absent? Click to Claim Host privileges 👑
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
