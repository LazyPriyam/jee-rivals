import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import { formatISTDateTimeShort } from '../utils/dateUtils';
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
  ArrowRight,
  MessageSquare,
  MessageCircle,
  ChevronDown,
  ChevronUp
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
  onOpenChat,
  placement = 'dropdown'
}) {
  const [activeTab, setActiveTab] = useState('alerts'); // 'alerts' | 'messages'
  const [data, setData] = useState({
    friend_requests: [],
    challenges: [],
    moderation_updates: [],
    system_updates: [],
    unread_messages_count: 0,
    total_count: 0
  });
  const [conversations, setConversations] = useState([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showReadUpdates, setShowReadUpdates] = useState(false);
  const [processingId, setProcessingId] = useState(null);
  const storageToastKey = user?.id ? `jee_seen_toast_ids_${user.id}` : null;
  const [seenToastIds, setSeenToastIds] = useState(() => {
    try {
      const raw = storageToastKey ? localStorage.getItem(storageToastKey) : null;
      return raw ? new Set(JSON.parse(raw)) : new Set();
    } catch (_) {
      return new Set();
    }
  });

  useEffect(() => {
    if (storageToastKey) {
      try {
        const raw = localStorage.getItem(storageToastKey);
        setSeenToastIds(raw ? new Set(JSON.parse(raw)) : new Set());
      } catch (_) {
        setSeenToastIds(new Set());
      }
    } else {
      setSeenToastIds(new Set());
    }
  }, [user?.id, storageToastKey]);

  useEffect(() => {
    if (user) {
      fetchNotifications();
      const pollRate = isOpen ? 8000 : 25000;
      const interval = setInterval(fetchNotifications, pollRate);
      return () => clearInterval(interval);
    }
  }, [user?.id, isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'messages' && user) {
      fetchConversations();
    }
  }, [isOpen, activeTab, user]);

  const fetchNotifications = async () => {
    try {
      const res = await api.friends.getNotifications();
      setData(res || {
        friend_requests: [],
        challenges: [],
        moderation_updates: [],
        system_updates: [],
        unread_messages_count: 0,
        total_count: 0
      });
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
                if (storageToastKey) {
                  localStorage.setItem(storageToastKey, JSON.stringify(Array.from(next)));
                }
              } catch (_) {}
              return next;
            });
            onToastUpdate(latest);
          }
        }
      }
    } catch (_) {}
  };

  const fetchConversations = async () => {
    try {
      setLoadingConversations(true);
      const convs = await api.friends.getConversations();
      setConversations(convs || []);
    } catch (_) {
    } finally {
      setLoadingConversations(false);
    }
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
      const scope = activeTab === 'messages' ? 'messages' : 'alerts';
      await api.friends.markAllNotificationsRead(scope);
      await fetchNotifications();
      if (activeTab === 'messages') {
        await fetchConversations();
      }
    } catch (_) {
    } finally {
      setLoading(false);
    }
  };

  const renderAvatarEmoji = (avatarId) => {
    switch (avatarId) {
      case 'atom': return '⚛️';
      case 'zap': return '⚡';
      case 'rocket': return '🚀';
      case 'flame': return '🔥';
      case 'shield': return '🛡️';
      case 'target': return '🎯';
      case 'compass': return '🧭';
      case 'brain': return '🧠';
      default: return '🔥';
    }
  };

  const formatMessageTime = (isoString) => {
    return formatISTDateTimeShort(isoString, '');
  };

  const renderSystemUpdateCard = (u, isUnread) => {
    const category = (u.category || 'PLATFORM').toUpperCase();
    const isSyl = category === 'SYLLABUS';
    const isQB = category === 'QUESTION_BANK';

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
            <div
              className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                isUnread
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-400'
                  : 'bg-white/5 border-white/10 text-slate-400'
              }`}
            >
              {isSyl ? (
                <Layers className="w-3.5 h-3.5" />
              ) : isQB ? (
                <BookOpen className="w-3.5 h-3.5" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
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
                  {formatISTDateTimeShort(u.created_at, 'Recent')}
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
  };

  if (!isOpen) return null;

  const totalCount = data.total_count || 0;
  const unreadMessagesCount = data.unread_messages_count || 0;
  const unreadSystemUpdates = (data.system_updates || []).filter((u) => !u.is_read);
  const readSystemUpdates = (data.system_updates || []).filter((u) => u.is_read);

  const alertsCount =
    (data.friend_requests?.length || 0) +
    (data.challenges?.length || 0) +
    (data.unread_alerts_count !== undefined
      ? data.unread_alerts_count
      : (data.moderation_updates?.length || 0)) +
    unreadSystemUpdates.length;

  const hasAnyAlerts =
    (data.friend_requests?.length > 0) ||
    (data.challenges?.length > 0) ||
    (data.moderation_updates?.length > 0) ||
    (unreadSystemUpdates.length > 0) ||
    (readSystemUpdates.length > 0);

  const canClear = activeTab === 'alerts' ? alertsCount > 0 : unreadMessagesCount > 0;

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
              <h3 className="font-black text-sm text-white">Inbox & Alerts</h3>
              <p className="text-[10px] text-slate-400 font-mono">
                {totalCount > 0 ? `${totalCount} Pending Notification${totalCount === 1 ? '' : 's'}` : 'All caught up'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {canClear && (
              <button
                onClick={handleMarkAllRead}
                disabled={loading}
                title={activeTab === 'messages' ? 'Mark unread chats as read' : 'Clear all alerts & release notes'}
                className="px-2 py-1 text-[11px] font-bold text-slate-300 hover:text-white rounded-lg hover:bg-white/5 transition cursor-pointer flex items-center gap-1 border border-white/5"
              >
                <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">
                  {activeTab === 'messages' ? 'Clear Chats' : 'Clear Alerts'}
                </span>
              </button>
            )}
            <button
              onClick={() => {
                fetchNotifications();
                if (activeTab === 'messages') fetchConversations();
              }}
              title="Refresh"
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

        {/* Tab Switcher: Alerts vs Messages (Chess.com Style) */}
        <div className="flex border-b border-white/10 bg-[#202738] p-1.5 gap-1.5">
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'alerts'
                ? 'bg-orange-500 text-white font-black shadow-md shadow-orange-950/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Alerts</span>
            {alertsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-red-500 text-white font-mono font-black animate-pulse">
                {alertsCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('messages');
              fetchConversations();
            }}
            className={`flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'messages'
                ? 'bg-orange-500 text-white font-black shadow-md shadow-orange-950/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Messages</span>
            {unreadMessagesCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[9px] bg-red-500 text-white font-mono font-black animate-pulse">
                {unreadMessagesCount}
              </span>
            )}
          </button>
        </div>

        {/* Panel Content Body */}
        <div className="max-h-[68vh] overflow-y-auto p-4 space-y-4">
          {/* TAB 1: ALERTS */}
          {activeTab === 'alerts' && (
            <>
              {!hasAnyAlerts ? (
                <div className="py-10 text-center">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-slate-500 flex items-center justify-center mx-auto mb-2">
                    <BellOff className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-bold text-slate-300">No alerts yet!</p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Friend requests and direct duels will appear here.
                  </p>
                </div>
              ) : (
                <>
                  {alertsCount === 0 && (
                    <div className="py-2.5 px-3 bg-emerald-950/30 border border-emerald-500/25 rounded-2xl flex items-center gap-2 text-xs text-emerald-300">
                      <CheckCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                      <span>You're all caught up on alerts!</span>
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
                                  <div className="w-8 h-8 rounded-xl bg-[#262e40] border border-white/10 flex items-center justify-center text-sm shrink-0 overflow-hidden">
                                    {r.sender_avatar_url ? (
                                      <img src={r.sender_avatar_url} alt={r.sender_username} className="w-full h-full object-cover rounded-xl" />
                                    ) : (
                                      renderAvatarEmoji(r.sender_avatar)
                                    )}
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

                  {/* Platform Alerts & Rewards Section */}
                  {data.moderation_updates?.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Platform Alerts & Rewards ({data.moderation_updates.length})</span>
                      </div>

                      <div className="space-y-2">
                        {data.moderation_updates.map((m) => {
                          let detailsObj = null;
                          if (m.details) {
                            if (typeof m.details === 'string') {
                              try { detailsObj = JSON.parse(m.details); } catch (_) {}
                            } else if (typeof m.details === 'object') {
                              detailsObj = m.details;
                            }
                          }

                          const isProvisional = m.type === 'PROVISIONAL_ELO_RESTORED' || m.type === 'QUESTION_PROVISIONAL_CREDIT';
                          const isReportResolved = m.type === 'REPORT_RESOLVED' || m.type === 'REPORT_ACCEPTED';
                          const isDismissed = m.type === 'REPORT_DISMISSED';
                          const isSeasonPodium = m.type === 'SEASON_PODIUM';
                          const isSeasonPromotion = m.type === 'SEASON_PROMOTION';
                          const isSeasonRelegation = m.type === 'SEASON_RELEGATION';
                          const isSeasonWrap = m.type === 'SEASON_WRAP';
                          const isStreak = m.type === 'STREAK_MILESTONE' || m.type === 'STREAK_SHIELD_USED';
                          const isDailyGoal = m.type === 'DAILY_GOAL_COMPLETED';
                          const isRoomScore = m.type === 'ROOM_SCORE_ADJUSTED';

                          let cardClass = 'bg-emerald-950/30 border-emerald-500/40';
                          let iconClass = 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300';
                          let badgeText = 'System Verified & Credited';
                          let badgeColor = 'text-emerald-400/80';
                          let iconEmoji = '✨';

                          if (isDismissed) {
                            cardClass = 'bg-rose-950/25 border-rose-500/35';
                            iconClass = 'bg-rose-500/20 border-rose-500/40 text-rose-300';
                            badgeText = 'Report Dismissed • Credit Reverted';
                            badgeColor = 'text-rose-400/90 font-bold';
                            iconEmoji = '⚖️';
                          } else if (isSeasonPodium) {
                            cardClass = 'bg-amber-950/40 border-amber-500/50 shadow-amber-500/10';
                            iconClass = 'bg-amber-500/25 border-amber-500/50 text-amber-300';
                            badgeText = 'Season Podium Medal Winner';
                            badgeColor = 'text-amber-400 font-bold';
                            iconEmoji = '🏆';
                          } else if (isSeasonPromotion) {
                            cardClass = 'bg-emerald-950/40 border-emerald-500/50 shadow-emerald-500/10';
                            iconClass = 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300';
                            badgeText = 'Weekly Promotion Zone';
                            badgeColor = 'text-emerald-400 font-bold';
                            iconEmoji = '🟢';
                          } else if (isSeasonRelegation) {
                            cardClass = 'bg-rose-950/25 border-rose-500/35';
                            iconClass = 'bg-rose-500/20 border-rose-500/40 text-rose-300';
                            badgeText = 'Division Relegation';
                            badgeColor = 'text-rose-400/90 font-bold';
                            iconEmoji = '🔻';
                          } else if (isSeasonWrap) {
                            cardClass = 'bg-blue-950/30 border-blue-500/40';
                            iconClass = 'bg-blue-500/20 border-blue-500/40 text-blue-300';
                            badgeText = 'Weekly Season Concluded';
                            badgeColor = 'text-blue-400/90 font-bold';
                            iconEmoji = '📅';
                          } else if (isReportResolved) {
                            cardClass = 'bg-emerald-950/40 border-emerald-500/50 shadow-emerald-500/10';
                            iconClass = 'bg-emerald-500/25 border-emerald-500/50 text-emerald-300';
                            badgeText = 'Report Verified • Score & Elo Upgraded';
                            badgeColor = 'text-emerald-400 font-bold';
                            iconEmoji = '🏆';
                          } else if (isProvisional) {
                            cardClass = 'bg-amber-950/30 border-amber-500/40';
                            iconClass = 'bg-amber-500/20 border-amber-500/40 text-amber-300';
                            badgeText = 'Provisional Safeguard • Review Pending';
                            badgeColor = 'text-amber-400/90 font-bold';
                            iconEmoji = '🛡️';
                          } else if (isStreak) {
                            cardClass = 'bg-orange-950/30 border-orange-500/40';
                            iconClass = 'bg-orange-500/20 border-orange-500/40 text-orange-300';
                            badgeText = m.type === 'STREAK_SHIELD_USED' ? 'Streak Protected by Shield' : 'Streak Milestone Achieved';
                            badgeColor = 'text-orange-400 font-bold';
                            iconEmoji = '🔥';
                          } else if (isDailyGoal) {
                            cardClass = 'bg-indigo-950/30 border-indigo-500/40';
                            iconClass = 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300';
                            badgeText = 'Daily Goal Conquered';
                            badgeColor = 'text-indigo-400 font-bold';
                            iconEmoji = '🎯';
                          } else if (isRoomScore) {
                            cardClass = 'bg-purple-950/30 border-purple-500/40';
                            iconClass = 'bg-purple-500/20 border-purple-500/40 text-purple-300';
                            badgeText = 'Duel Score Re-Graded';
                            badgeColor = 'text-purple-400 font-bold';
                            iconEmoji = '⚔️';
                          }

                          return (
                            <div
                              key={m.id}
                              className={`p-3 border rounded-2xl shadow-md relative group ${cardClass}`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5 flex-1 min-w-0">
                                  <div className={`w-7 h-7 rounded-xl border flex items-center justify-center text-xs shrink-0 mt-0.5 font-bold ${iconClass}`}>
                                    {iconEmoji}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <span className="font-bold text-xs text-white block">
                                      {m.title}
                                    </span>
                                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                                      {m.message}
                                    </p>

                                    {/* Rewards & Adjustments chips */}
                                    {detailsObj && (
                                      <div className="flex items-center gap-1.5 flex-wrap mt-2">
                                        {detailsObj.new_key && (
                                          <span className="px-1.5 py-0.5 rounded bg-blue-500/20 border border-blue-500/30 text-blue-300 text-[10px] font-mono font-bold">
                                            Key: {detailsObj.new_key}
                                          </span>
                                        )}
                                        {detailsObj.earned_elo !== undefined && (
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
                                            +{detailsObj.earned_elo} Elo
                                          </span>
                                        )}
                                        {detailsObj.refund_elo !== undefined && (
                                          <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-mono font-bold">
                                            +{detailsObj.refund_elo} Elo
                                          </span>
                                        )}
                                        {detailsObj.bonus_rp !== undefined && (
                                          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/30 text-amber-300 text-[10px] font-mono font-bold">
                                            +{detailsObj.bonus_rp} RP
                                          </span>
                                        )}
                                        {detailsObj.reverted_elo !== undefined && (
                                          <span className="px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/30 text-rose-300 text-[10px] font-mono font-bold">
                                            -{detailsObj.reverted_elo} Elo
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    <div className="flex items-center justify-between gap-2 mt-2 pt-1 border-t border-white/5">
                                      <span className={`text-[9px] font-mono block font-bold ${badgeColor}`}>
                                        {badgeText}
                                      </span>
                                      {m.created_at && (
                                        <span className="text-[9px] text-slate-500 font-mono">
                                          {formatISTDateTimeShort(m.created_at, 'Recent')}
                                        </span>
                                      )}
                                    </div>
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
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Release Notes & System Updates Section (Unread) */}
                  {unreadSystemUpdates.length > 0 && (
                    <div>
                      <div className="flex items-center gap-1.5 mb-2.5 text-[11px] font-bold text-amber-400 uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>System & Content Updates ({unreadSystemUpdates.length})</span>
                      </div>
                      <div className="space-y-2">
                        {unreadSystemUpdates.map((u) => renderSystemUpdateCard(u, true))}
                      </div>
                    </div>
                  )}

                  {/* Earlier Release Notes (Collapsible when caught up) */}
                  {readSystemUpdates.length > 0 && (
                    <div className="pt-2 border-t border-white/10">
                      <button
                        type="button"
                        onClick={() => setShowReadUpdates((prev) => !prev)}
                        className="w-full py-2 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-slate-200 text-xs font-semibold flex items-center justify-between transition cursor-pointer border border-white/5"
                      >
                        <span className="flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 text-slate-400" />
                          <span>{showReadUpdates ? 'Hide Earlier Release Notes' : `View Earlier Release Notes (${readSystemUpdates.length})`}</span>
                        </span>
                        {showReadUpdates ? (
                          <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                        )}
                      </button>

                      {showReadUpdates && (
                        <div className="space-y-2 mt-2.5">
                          {readSystemUpdates.map((u) => renderSystemUpdateCard(u, false))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* TAB 2: MESSAGES (Chess.com Friends Direct Chat Feed) */}
          {activeTab === 'messages' && (
            <div>
              {loadingConversations ? (
                <div className="py-12 text-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-orange-400 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 font-mono">Loading conversations...</p>
                </div>
              ) : conversations.length === 0 ? (
                <div className="py-10 text-center px-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 text-slate-500 flex items-center justify-center mx-auto mb-3">
                    <MessageCircle className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-xs text-slate-200 mb-1">No Friend Conversations Yet</h4>
                  <p className="text-[11px] text-slate-400 mb-4">
                    Send a message or 1v1 duel challenge to any member of your study squad!
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {conversations.map((conv) => {
                    const divStyle = DIVISION_COLORS[conv.friend_division] || DIVISION_COLORS.BRONZE;
                    const hasUnread = conv.unread_count > 0;

                    return (
                      <div
                        key={conv.friend_id}
                        onClick={() => {
                          if (onOpenChat) {
                            onOpenChat({
                              id: conv.friend_id,
                              username: conv.friend_username,
                              avatar_id: conv.friend_avatar,
                              overall_elo: conv.friend_elo,
                              current_division: conv.friend_division,
                              is_online: conv.is_online,
                              last_active: conv.last_active
                            });
                          }
                          onClose();
                        }}
                        className={`p-3 rounded-2xl border transition cursor-pointer flex items-center justify-between gap-3 group ${
                          hasUnread
                            ? 'bg-[#1a2336] border-orange-500/60 shadow-md shadow-orange-950/30'
                            : 'bg-[#151a26] border-white/5 hover:border-orange-500/30 hover:bg-[#1a2030]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          {/* Avatar with live online dot */}
                          <div className="relative shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-orange-950/80 border border-orange-500/40 flex items-center justify-center text-lg shadow-inner">
                              {renderAvatarEmoji(conv.friend_avatar)}
                            </div>
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#1c2230] ${
                                conv.is_online ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                              }`}
                              title={conv.is_online ? 'Online' : 'Offline'}
                            />
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-1 mb-0.5">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="font-bold text-xs text-white truncate max-w-[120px] group-hover:text-orange-400 transition">
                                  {conv.friend_username}
                                </span>
                                <span className={`text-[8px] font-extrabold uppercase px-1 py-0.2 rounded border ${divStyle}`}>
                                  {conv.friend_division}
                                </span>
                              </div>
                              <span className="text-[9px] text-slate-500 font-mono shrink-0">
                                {formatMessageTime(conv.latest_message_time)}
                              </span>
                            </div>

                            <p className="text-[11px] text-slate-300 truncate leading-tight flex items-center gap-1">
                              {conv.latest_message_type === 'CHALLENGE' ? (
                                <span className="text-orange-400 font-bold flex items-center gap-1">
                                  <Swords className="w-3 h-3" />
                                  <span>1-on-1 Duel Challenge</span>
                                </span>
                              ) : (
                                <span>
                                  {conv.latest_is_mine && <span className="text-slate-400">You: </span>}
                                  {conv.latest_message}
                                </span>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Unread badge or chevron */}
                        <div className="shrink-0 flex items-center">
                          {hasUnread ? (
                            <span className="px-1.5 py-0.5 bg-red-500 text-white font-mono font-black text-[9px] rounded-full animate-pulse shadow">
                              {conv.unread_count}
                            </span>
                          ) : (
                            <ArrowRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-orange-400 transition transform group-hover:translate-x-0.5" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
