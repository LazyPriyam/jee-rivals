import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import {
  Bell,
  BellOff,
  Swords,
  UserPlus,
  Check,
  CheckCheck,
  X,
  RefreshCw,
  Clock,
  Sparkles,
  Shield,
  Zap,
  BookOpen,
  Layers,
  ArrowRight
} from 'lucide-react';

const DIVISION_COLORS = {
  GRANDMASTER: 'text-red-400 bg-red-950/80 border-red-500/50',
  MASTER: 'text-purple-300 bg-purple-950/80 border-purple-500/50',
  DIAMOND: 'text-blue-300 bg-blue-950/80 border-blue-400/50',
  PLATINUM: 'text-emerald-300 bg-emerald-950/80 border-emerald-500/50',
  GOLD: 'text-amber-300 bg-amber-950/80 border-amber-500/50',
  SILVER: 'text-slate-300 bg-slate-800 border-slate-600/50',
  BRONZE: 'text-orange-400 bg-orange-950/80 border-orange-700/50',
};

export default function NotificationPanel({
  isOpen,
  onClose,
  user,
  onAcceptDuel,
  onCountUpdate,
  onOpenUpdateModal,
  onToastUpdate,
  placement = 'dropdown'
}) {
  const [data, setData] = useState({ friend_requests: [], challenges: [], moderation_updates: [], system_updates: [], total_count: 0 });
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const [seenToastIds, setSeenToastIds] = useState(() => {
    try {
      const raw = localStorage.getItem('jee_seen_toast_ids');
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (_) {
      return new Set();
    }
  });

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 4000);
    return () => clearInterval(interval);
  }, [user, isOpen]);

  const fetchNotifications = async () => {
    try {
      const res = await api.friends.getNotifications();
      setData(res || { friend_requests: [], challenges: [], moderation_updates: [], system_updates: [], total_count: 0 });
      if (onCountUpdate) {
        onCountUpdate(res?.total_count || 0);
      }

      // Check if there is an unread system update that hasn't toasted yet
      if (res?.system_updates && res.system_updates.length > 0 && onToastUpdate) {
        const unreadUpdates = res.system_updates.filter((u) => !u.is_read);
        if (unreadUpdates.length > 0) {
          const latest = unreadUpdates[0];
          if (latest && !seenToastIds.has(latest.id)) {
            setSeenToastIds((prev) => {
              const next = new Set(prev).add(latest.id);
              try {
                localStorage.setItem('jee_seen_toast_ids', JSON.stringify(Array.from(next)));
              } catch (_) {}
              return next;
            });
            onToastUpdate(latest);
          }
        }
      }
    } catch (_) {}
  };

  const handleRespondFriendRequest = async (senderId, accept) => {
    sound.click();
    setProcessingId(senderId);
    try {
      await api.friends.respondRequest(senderId, accept);
      await fetchNotifications();
    } catch (err) {
      alert(err.message || 'Error updating friend request.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRespondChallenge = async (challenge, accept) => {
    sound.click();
    setProcessingId(challenge.id);
    try {
      const res = await api.friends.respondChallenge(challenge.id, accept);
      if (accept && res.room_code) {
        if (onAcceptDuel) {
          onAcceptDuel(res.room_code);
        }
        onClose();
      } else {
        await fetchNotifications();
      }
    } catch (err) {
      alert(err.message || 'Error processing challenge invitation.');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismissNotification = async (notifId) => {
    sound.click();
    setProcessingId(notifId);
    try {
      await api.friends.markNotificationRead(notifId);
      await fetchNotifications();
    } catch (_) {
    } finally {
      setProcessingId(null);
    }
  };

  const handleDismissSystemUpdate = async (updateId) => {
    sound.click();
    setProcessingId(updateId);
    try {
      await api.updates.markRead(updateId);
      await fetchNotifications();
    } catch (_) {
    } finally {
      setProcessingId(null);
    }
  };

  const handleMarkAllRead = async () => {
    sound.click();
    setLoading(true);
    try {
      await api.friends.markAllNotificationsRead();
      await fetchNotifications();
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const totalCount = data.total_count || 0;
  const hasAnyContent =
    (data.system_updates?.length > 0) ||
    (data.moderation_updates?.length > 0) ||
    (data.challenges?.length > 0) ||
    (data.friend_requests?.length > 0);

  return (
    <>
      {/* Click-outside Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs"
        onClick={onClose}
      />

      {/* Floating Notification Popover Panel */}
      <div
        className={`z-50 bg-[#1c2230] border border-orange-500/40 rounded-3xl shadow-2xl overflow-hidden glow-orange-subtle animate-in fade-in zoom-in-95 duration-150 ${
          placement === 'sidebar'
            ? 'fixed left-4 right-4 sm:left-24 lg:left-68 bottom-6 w-96 max-w-[calc(100vw-2rem)]'
            : 'fixed top-16 right-4 sm:right-6 z-50 w-96 max-w-[calc(100vw-2rem)]'
        }`}
      >
        {/* Panel Header */}
        <div className="p-4 bg-[#262e40] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-orange-500/20 border border-orange-500/40 text-orange-400 flex items-center justify-center">
              <Bell className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-black text-sm text-white">Notifications</h3>
              <p className="text-[10px] text-slate-400 font-mono">
                {totalCount > 0 ? `${totalCount} Pending Alert${totalCount === 1 ? '' : 's'}` : 'All caught up'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {totalCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                disabled={loading}
                title="Mark all as read"
                className="px-2 py-1 text-[11px] font-bold text-slate-300 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer flex items-center gap-1 border border-white/5"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">Clear All</span>
              </button>
            )}
            <button
              onClick={fetchNotifications}
              title="Refresh notifications"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClose}
              title="Close panel"
              className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Panel Content Body */}
        <div className="max-h-[75vh] overflow-y-auto p-4 space-y-4">
          {!hasAnyContent ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-slate-500 flex items-center justify-center mx-auto mb-2">
                <BellOff className="w-6 h-6" />
              </div>
              <p className="text-xs font-bold text-slate-300">No notifications yet!</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                System updates and notifications will appear right here.
              </p>
            </div>
          ) : (
            <>
              {totalCount === 0 && (
                <div className="py-2.5 px-3 bg-emerald-950/30 border border-emerald-500/25 rounded-2xl flex items-center gap-2 text-xs text-emerald-300">
                  <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>You're all caught up! Recent updates are shown below.</span>
                </div>
              )}

              {/* System & Content Updates Section */}
              {data.system_updates?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>System & Content Updates ({data.system_updates.length})</span>
                  </div>

                  <div className="space-y-2">
                    {data.system_updates.map((u) => {
                      const category = (u.category || 'PLATFORM').toUpperCase();
                      const isSyl = category === 'SYLLABUS';
                      const isQB = category === 'QUESTION_BANK';
                      const isUnread = !u.is_read;

                      return (
                        <div
                          key={u.id}
                          className={`p-3 rounded-2xl shadow-md relative group transition border ${
                            isUnread
                              ? 'bg-[#151d2e] border-amber-500/50 shadow-amber-950/20'
                              : 'bg-[#131620] border-white/5 opacity-85 hover:opacity-100'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                              <div className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                                isUnread ? 'bg-amber-500/20 border-amber-500/40 text-amber-400' : 'bg-white/5 border-white/10 text-slate-400'
                              }`}>
                                {isSyl ? <Layers className="w-3.5 h-3.5" /> : isQB ? <BookOpen className="w-3.5 h-3.5" /> : <Zap className="w-3.5 h-3.5" />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-bold text-xs text-white line-clamp-1">
                                    {u.title}
                                  </span>
                                  {isUnread && (
                                    <span className="text-[8px] font-black uppercase px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-300 border border-amber-500/40 font-mono animate-pulse">
                                      NEW
                                    </span>
                                  )}
                                  {u.version && (
                                    <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-white/10 text-amber-300 font-bold">
                                      {u.version}
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-slate-300 mt-1 leading-relaxed line-clamp-2">
                                  {u.summary}
                                </p>
                                <div className="flex items-center gap-3 mt-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (onOpenUpdateModal) onOpenUpdateModal(u);
                                    }}
                                    className="text-[10px] font-bold text-orange-400 hover:text-orange-300 flex items-center gap-1 cursor-pointer"
                                  >
                                    <span>Read Changelog</span>
                                    <ArrowRight className="w-2.5 h-2.5" />
                                  </button>
                                  <span className="text-[9px] text-slate-500 font-mono">
                                    {u.created_at ? new Date(u.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Recent'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {isUnread && (
                              <button
                                type="button"
                                disabled={processingId === u.id}
                                onClick={() => handleDismissSystemUpdate(u.id)}
                                className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0"
                                title="Mark update as read"
                              >
                                <Check className="w-3.5 h-3.5 text-amber-400" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Moderation & Elo Compensation Section */}
              {data.moderation_updates?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                    <Shield className="w-3.5 h-3.5" />
                    <span>Moderation Updates ({data.moderation_updates.length})</span>
                  </div>

                  <div className="space-y-2">
                    {data.moderation_updates.map((m) => (
                      <div
                        key={m.id}
                        className="p-3 bg-emerald-950/30 border border-emerald-500/40 rounded-2xl shadow-md relative group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-start gap-2.5">
                            <div className="w-7 h-7 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold">
                              ✨
                            </div>
                            <div>
                              <span className="font-bold text-xs text-white block">
                                {m.title}
                              </span>
                              <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                                {m.message}
                              </p>
                              <span className="text-[9px] text-emerald-400/80 font-mono mt-1.5 block">
                                System Verified & Credited
                              </span>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={processingId === m.id}
                            onClick={() => handleDismissNotification(m.id)}
                            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0"
                            title="Dismiss notification"
                          >
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Direct Duel Challenges Section */}
              {data.challenges?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-bold text-orange-400 uppercase tracking-wider">
                    <Swords className="w-3.5 h-3.5" />
                    <span>Duel Challenges ({data.challenges.length})</span>
                  </div>

                  <div className="space-y-2">
                    {data.challenges.map((c) => (
                      <div
                        key={c.id}
                        className="p-3 bg-[#191f2d] border border-orange-500/40 rounded-2xl shadow-md"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-xl bg-orange-950/80 border border-orange-500/40 flex items-center justify-center text-sm shrink-0">
                              ⚔️
                            </div>
                            <div>
                              <span className="font-bold text-xs text-white block">
                                {c.sender_username}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                Rating: {Math.round(c.sender_elo || 1200)} Elo • #{c.room_code}
                              </span>
                            </div>
                          </div>
                          <span className="px-1.5 py-0.5 bg-orange-950 border border-orange-500/30 text-orange-400 text-[9px] font-mono font-bold rounded">
                            DUEL
                          </span>
                        </div>

                        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                          <button
                            type="button"
                            disabled={processingId === c.id}
                            onClick={() => handleRespondChallenge(c, true)}
                            className="flex-1 py-1.5 px-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                          >
                            <Swords className="w-3 h-3" />
                            <span>Accept Duel</span>
                          </button>
                          <button
                            type="button"
                            disabled={processingId === c.id}
                            onClick={() => handleRespondChallenge(c, false)}
                            className="py-1.5 px-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-white/10 transition cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Friend Requests Section */}
              {data.friend_requests?.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Friend Requests ({data.friend_requests.length})</span>
                  </div>

                  <div className="space-y-2">
                    {data.friend_requests.map((r) => {
                      const divStyle = DIVISION_COLORS[r.sender_division] || DIVISION_COLORS.BRONZE;

                      return (
                        <div
                          key={r.sender_id}
                          className="p-3 bg-[#191f2d] border border-white/10 hover:border-emerald-500/40 rounded-2xl shadow-md transition"
                        >
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2.5">
                              <div className="w-8 h-8 rounded-xl bg-[#262e40] border border-white/10 flex items-center justify-center text-sm shrink-0">
                                {r.sender_avatar === 'atom' && '⚛️'}
                                {r.sender_avatar === 'zap' && '⚡'}
                                {r.sender_avatar === 'rocket' && '🚀'}
                                {r.sender_avatar === 'flame' && '🔥'}
                                {r.sender_avatar === 'shield' && '🛡️'}
                                {r.sender_avatar === 'target' && '🎯'}
                                {r.sender_avatar === 'compass' && '🧭'}
                                {r.sender_avatar === 'brain' && '🧠'}
                                {!['atom','zap','rocket','flame','shield','target','compass','brain'].includes(r.sender_avatar) && '🔥'}
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <span className="font-bold text-xs text-white">
                                    {r.sender_username}
                                  </span>
                                  <span className={`text-[9px] font-extrabold px-1.5 py-0.2 rounded border ${divStyle}`}>
                                    {r.sender_division}
                                  </span>
                                </div>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {Math.round(r.sender_elo || 1200)} Elo • {r.sender_title}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
                            <button
                              type="button"
                              disabled={processingId === r.sender_id}
                              onClick={() => handleRespondFriendRequest(r.sender_id, true)}
                              className="flex-1 py-1.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center justify-center gap-1 disabled:opacity-50"
                            >
                              <Check className="w-3.5 h-3.5" />
                              <span>Accept</span>
                            </button>
                            <button
                              type="button"
                              disabled={processingId === r.sender_id}
                              onClick={() => handleRespondFriendRequest(r.sender_id, false)}
                              className="py-1.5 px-3 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-white/10 transition cursor-pointer"
                            >
                              Decline
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </>
  );
}
