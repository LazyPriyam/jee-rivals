import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import { formatLastOnline } from '../utils/dateUtils';
import {
  Users,
  UserPlus,
  UserCheck,
  UserX,
  Swords,
  Trophy,
  Zap,
  Share2,
  Copy,
  Check,
  Search,
  Award,
  Shield,
  Flame,
  Clock,
  ArrowRight,
  Lock,
  RefreshCw,
  AlertCircle,
  MessageCircle,
  Send,
  Globe,
  Sparkles,
  Bell,
  ChevronRight
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

export default function InviteFriendsView({
  user,
  onJoinRoomCode,
  onRoomCreated,
  onOpenAuth,
  onViewProfile,
  onOpenChat,
  isActive
}) {
  // Navigation Tabs: 'squad', 'leaderboard', 'requests', 'search', 'lobbies'
  const [activeTab, setActiveTab] = useState('squad');

  // Friends & Challenges State
  const [friends, setFriends] = useState([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [challenges, setChallenges] = useState([]);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [challengingFriendId, setChallengingFriendId] = useState(null);
  const [processingRequestId, setProcessingRequestId] = useState(null);

  // Friends Leaderboard State
  const [squadLeaderboard, setSquadLeaderboard] = useState([]);
  const [leaderboardSort, setLeaderboardSort] = useState('elo'); // 'elo', 'rp', 'solved'
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);

  // Search / Add Friend State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [directUsername, setDirectUsername] = useState('');
  const [addMessage, setAddMessage] = useState({ text: '', type: '' });

  // Link & Code Sharing State
  const [copiedLink, setCopiedLink] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [passcode, setPasscode] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [openRooms, setOpenRooms] = useState([]);

  const inviteUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?ref=${user?.username || 'rivals'}`
    : 'https://jeerivals.app';

  // Fetch initial data & polling
  useEffect(() => {
    if (user?.id && isActive !== false) {
      fetchFriends();
      fetchChallenges();
      fetchIncomingRequests();
      const interval = setInterval(() => {
        fetchChallenges();
        fetchIncomingRequests();
        fetchFriendsSilently();
      }, 15000);
      return () => clearInterval(interval);
    } else if (!user?.id) {
      setLoadingFriends(false);
    }
  }, [user?.id, isActive]);

  // Fetch squad leaderboard whenever tab or sort changes
  useEffect(() => {
    if (user?.id && isActive !== false && activeTab === 'leaderboard') {
      fetchSquadLeaderboard();
    }
  }, [user?.id, isActive, activeTab, leaderboardSort]);

  // Fetch open lobbies when on lobbies tab
  useEffect(() => {
    if (isActive !== false && activeTab === 'lobbies') {
      fetchOpenRooms();
      const interval = setInterval(fetchOpenRooms, 15000);
      return () => clearInterval(interval);
    }
  }, [isActive, activeTab]);

  const fetchFriends = async () => {
    try {
      if (!friends || friends.length === 0) {
        setLoadingFriends(true);
      }
      const data = await api.friends.getAll();
      setFriends(data || []);
    } catch (_) {
    } finally {
      setLoadingFriends(false);
    }
  };

  const fetchFriendsSilently = async () => {
    try {
      const data = await api.friends.getAll();
      setFriends(data || []);
    } catch (_) {}
  };

  const fetchChallenges = async () => {
    try {
      const data = await api.friends.getChallenges();
      setChallenges(data || []);
    } catch (_) {}
  };

  const fetchIncomingRequests = async () => {
    try {
      const data = await api.friends.getRequests();
      setIncomingRequests(data || []);
    } catch (_) {}
  };

  const fetchSquadLeaderboard = async () => {
    try {
      setLoadingLeaderboard(true);
      const data = await api.friends.getLeaderboard(leaderboardSort);
      setSquadLeaderboard(data || []);
    } catch (_) {
    } finally {
      setLoadingLeaderboard(false);
    }
  };

  const fetchOpenRooms = async () => {
    try {
      const data = await api.rooms.getOpen();
      setOpenRooms(data || []);
    } catch (_) {}
  };

  // Search Aspirants
  const handleSearch = async (val) => {
    setSearchQuery(val);
    if (!val || val.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await api.friends.search(val.trim());
      setSearchResults(results || []);
    } catch (_) {
    } finally {
      setIsSearching(false);
    }
  };

  // Send friend request
  const handleAddFriend = async (targetUsername) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    sound.click();
    setAddMessage({ text: '', type: '' });
    try {
      const res = await api.friends.add(targetUsername);
      setAddMessage({ text: res.message || `Friend request sent to ${targetUsername}!`, type: 'success' });
      fetchFriends();
      fetchIncomingRequests();
      if (searchQuery) handleSearch(searchQuery);
      setDirectUsername('');
      setTimeout(() => setAddMessage({ text: '', type: '' }), 5000);
    } catch (err) {
      setAddMessage({ text: err.message || 'Could not send friend request.', type: 'error' });
    }
  };

  // Respond to incoming friend request
  const handleRespondFriendRequest = async (senderId, accept) => {
    sound.click();
    setProcessingRequestId(senderId);
    try {
      await api.friends.respondRequest(senderId, accept);
      await fetchIncomingRequests();
      await fetchFriends();
      if (searchQuery) handleSearch(searchQuery);
    } catch (err) {
      alert(err.message || 'Error updating friend request.');
    } finally {
      setProcessingRequestId(null);
    }
  };

  // Cancel outgoing friend request
  const handleCancelRequest = async (targetId) => {
    sound.click();
    try {
      await api.friends.cancelRequest(targetId);
      if (searchQuery) handleSearch(searchQuery);
    } catch (err) {
      alert(err.message || 'Error cancelling request.');
    }
  };

  // Remove friend from squad
  const handleRemoveFriend = async (friendId, username) => {
    if (!window.confirm(`Are you sure you want to remove ${username} from your study squad?`)) return;
    sound.click();
    try {
      await api.friends.remove(friendId);
      fetchFriends();
      if (activeTab === 'leaderboard') fetchSquadLeaderboard();
      if (searchQuery) handleSearch(searchQuery);
    } catch (err) {
      alert(err.message || 'Failed to remove friend.');
    }
  };

  // 1-on-1 Challenge: Create room & challenge friend
  const handleDirectChallenge = async (friend) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    sound.click();
    setChallengingFriendId(friend.id);
    try {
      const res = await api.friends.challenge(friend.id, {
        preset_name: `${user.username} vs ${friend.username}`,
        mode: 'SPEED_DUEL',
        question_count: 5,
        time_per_question: 60,
        subjects: ['Physics', 'Chemistry', 'Mathematics'],
      });

      if (res && res.room) {
        onRoomCreated(res.room);
      }
    } catch (err) {
      alert(err.message || 'Failed to issue duel challenge.');
    } finally {
      setChallengingFriendId(null);
    }
  };

  // Respond to Challenge
  const handleRespondChallenge = async (challenge, accept) => {
    sound.click();
    try {
      const res = await api.friends.respondChallenge(challenge.id, accept);
      if (accept && res.room_code) {
        const room = await api.rooms.join(res.room_code);
        onJoinRoomCode(room);
      } else {
        fetchChallenges();
      }
    } catch (err) {
      alert(err.message || 'Error processing challenge invitation.');
      fetchChallenges();
    }
  };

  // Join Room by Code
  const handleJoinByCode = async (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    sound.click();
    setJoinError('');
    const code = joinCode.trim().toUpperCase();
    if (!code) return;

    setJoining(true);
    try {
      const room = await api.rooms.join(code, passcode.trim() || null);
      onJoinRoomCode(room);
    } catch (err) {
      setJoinError(err.message || 'Battle room not found or match finished.');
    } finally {
      setJoining(false);
    }
  };

  const handleCopyLink = () => {
    sound.click();
    navigator.clipboard.writeText(inviteUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleShareWhatsApp = () => {
    sound.click();
    const text = encodeURIComponent(
      `🔥 Challenge me on JEE Rivals! Real-time PvP JEE speed duels, live racer tracks & authentic NTA mocks:\n${inviteUrl}`
    );
    window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
  };

  const handleShareTelegram = () => {
    sound.click();
    const text = encodeURIComponent(
      `🔥 Challenge me on JEE Rivals! Real-time PvP JEE speed duels:\n${inviteUrl}`
    );
    window.open(`https://t.me/share/url?url=${encodeURIComponent(inviteUrl)}&text=${text}`, '_blank');
  };

  const onlineFriendsCount = friends.filter((f) => f.is_online).length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 page-transition">
      {/* Incoming Duel Notifications (Chess.com Style) */}
      {challenges.length > 0 && (
        <div className="mb-6 space-y-3">
          {challenges.map((c) => (
            <div
              key={c.id}
              className="bg-gradient-to-r from-orange-950/90 via-[#2f221b] to-[#1e2330] border-2 border-orange-500 rounded-2xl p-4 sm:p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-orange-500/20 border border-orange-500/50 flex items-center justify-center text-2xl shadow-inner shrink-0">
                  ⚔️
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs uppercase font-extrabold tracking-wider px-2 py-0.5 rounded-full bg-orange-500 text-white font-mono">
                      DIRECT DUEL CHALLENGE
                    </span>
                    <span className="text-xs text-orange-400 font-bold font-mono">
                      Room #{c.room_code}
                    </span>
                  </div>
                  <h3 className="text-base font-black text-white mt-0.5">
                    <span className="text-orange-400">{c.sender_username}</span> challenged you to a 1-on-1 Speed Duel!
                  </h3>
                  <p className="text-xs text-slate-300">
                    Challenger Rating: <span className="font-mono font-bold text-white">{Math.round(c.sender_elo || 1200)} Elo</span>
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => handleRespondChallenge(c, true)}
                  className="flex-1 sm:flex-initial px-5 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-xl shadow-lg shadow-orange-950/50 transition cursor-pointer flex items-center justify-center gap-2"
                >
                  <Swords className="w-4 h-4" />
                  <span>ACCEPT DUEL</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRespondChallenge(c, false)}
                  className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold text-xs rounded-xl border border-white/10 transition cursor-pointer"
                >
                  Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-[#2b3345] via-[#242b3b] to-[#1e2330] border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl mb-8 glow-orange-subtle">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-orange-950/80 border border-orange-500/40 text-orange-400 text-xs font-bold uppercase tracking-wider mb-2">
              <Users className="w-3.5 h-3.5" />
              <span>Chess.com Style Peer Arena</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
              Study Squad & Friends
            </h1>
            <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-xl">
              Connect with your coaching peers via friend requests, compare ranks on the friends leaderboard, and initiate instant 1-on-1 head-to-head duels.
            </p>
          </div>

          {/* Quick Counter Chips */}
          <div className="flex items-center gap-3">
            <div className="bg-[#1e2433] border border-white/10 px-4 py-3 rounded-2xl text-center min-w-[95px]">
              <span className="block text-xl font-black text-white font-mono">
                {friends.length}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Squad Buddies
              </span>
            </div>
            <div className="bg-[#1e2433] border border-emerald-500/30 px-4 py-3 rounded-2xl text-center min-w-[95px]">
              <span className="block text-xl font-black text-emerald-400 font-mono flex items-center justify-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping inline-block" />
                {onlineFriendsCount}
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                Online Now
              </span>
            </div>
          </div>
        </div>

        {/* Tab Navigation Bar */}
        <div className="mt-6 pt-5 border-t border-white/10 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              sound.click();
              setActiveTab('squad');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'squad'
                ? 'bg-orange-500 text-white font-black shadow-lg shadow-orange-950/50'
                : 'bg-[#1e2433] text-slate-300 hover:text-white border border-white/5'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>My Study Squad ({friends.length})</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.click();
              setActiveTab('leaderboard');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'leaderboard'
                ? 'bg-orange-500 text-white font-black shadow-lg shadow-orange-950/50'
                : 'bg-[#1e2433] text-slate-300 hover:text-white border border-white/5'
            }`}
          >
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Squad Leaderboard</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.click();
              setActiveTab('requests');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 relative ${
              activeTab === 'requests'
                ? 'bg-orange-500 text-white font-black shadow-lg shadow-orange-950/50'
                : 'bg-[#1e2433] text-slate-300 hover:text-white border border-white/5'
            }`}
          >
            <Bell className="w-3.5 h-3.5" />
            <span>Requests ({incomingRequests.length})</span>
            {incomingRequests.length > 0 && (
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            )}
          </button>

          <button
            type="button"
            onClick={() => {
              sound.click();
              setActiveTab('search');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'search'
                ? 'bg-orange-500 text-white font-black shadow-lg shadow-orange-950/50'
                : 'bg-[#1e2433] text-slate-300 hover:text-white border border-white/5'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Find & Add Aspirants</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.click();
              setActiveTab('lobbies');
            }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-2 ${
              activeTab === 'lobbies'
                ? 'bg-orange-500 text-white font-black shadow-lg shadow-orange-950/50'
                : 'bg-[#1e2433] text-slate-300 hover:text-white border border-white/5'
            }`}
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Invite Link & Room Code</span>
          </button>
        </div>
      </div>

      {/* TAB 1: MY STUDY SQUAD (FRIENDS LIST) */}
      {activeTab === 'squad' && (
        <div>
          {loadingFriends ? (
            <div className="py-20 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-orange-400 mx-auto mb-3" />
              <p className="text-sm text-slate-400 font-mono">Loading squad mates...</p>
            </div>
          ) : friends.length === 0 ? (
            <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-10 text-center shadow-xl">
              <div className="w-16 h-16 rounded-3xl bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8" />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">No Study Buddies Added Yet</h3>
              <p className="text-sm text-slate-400 max-w-md mx-auto mb-6">
                Add your coaching batchmates or friends by username to send friend requests, track scores, and duel head-to-head!
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('search')}
                className="px-6 py-3 bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs rounded-xl shadow-lg shadow-orange-950/50 transition cursor-pointer inline-flex items-center gap-2"
              >
                <UserPlus className="w-4 h-4" />
                <span>Search & Add Aspirants</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {friends.map((friend) => {
                const divStyle = DIVISION_COLORS[friend.current_division] || DIVISION_COLORS.BRONZE;
                const isChallenging = challengingFriendId === friend.id;
                const presence = formatLastOnline(friend.last_active, friend.is_online);

                return (
                  <div
                    key={friend.id}
                    className="bg-[#262c3c] border border-white/10 hover:border-orange-500/40 rounded-2xl p-5 shadow-xl transition flex flex-col justify-between group"
                  >
                    <div>
                      {/* Top Bar: Avatar + Username + Online Status + Remove Button */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="relative">
                            <div className="w-12 h-12 rounded-2xl bg-[#1e2433] border border-white/10 flex items-center justify-center text-2xl shadow-inner overflow-hidden">
                              {friend.avatar_image_url ? (
                                <img src={friend.avatar_image_url} alt={friend.username} className="w-full h-full object-cover rounded-2xl" />
                              ) : (
                                <>
                                  {friend.avatar_id === 'atom' && '⚛️'}
                                  {friend.avatar_id === 'zap' && '⚡'}
                                  {friend.avatar_id === 'rocket' && '🚀'}
                                  {friend.avatar_id === 'flame' && '🔥'}
                                  {friend.avatar_id === 'shield' && '🛡️'}
                                  {friend.avatar_id === 'target' && '🎯'}
                                  {friend.avatar_id === 'compass' && '🧭'}
                                  {friend.avatar_id === 'brain' && '🧠'}
                                  {!['atom', 'zap', 'rocket', 'flame', 'shield', 'target', 'compass', 'brain'].includes(friend.avatar_id) && '🔥'}
                                </>
                              )}
                            </div>
                            {/* Online / Offline status indicator dot */}
                            <span
                              className={`absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2 border-[#262c3c] ${
                                presence.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                              }`}
                              title={presence.detail || presence.badgeText}
                            />
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="font-black text-base text-white group-hover:text-orange-400 transition">
                                {friend.username}
                              </h4>
                              <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono ${
                                presence.isOnline
                                  ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-400'
                                  : presence.statusColor === 'amber'
                                  ? 'bg-amber-950/80 border border-amber-500/40 text-amber-400'
                                  : 'bg-slate-800 text-slate-400'
                              }`}>
                                {presence.badgeText}
                              </span>
                            </div>
                            <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase mt-1 border ${divStyle}`}>
                              {friend.current_division}
                            </span>
                          </div>
                        </div>

                        {/* Explicit Remove Friend Button */}
                        <button
                          type="button"
                          onClick={() => handleRemoveFriend(friend.id, friend.username)}
                          title="Remove Friend from Study Squad"
                          className="px-2.5 py-1 text-slate-400 hover:text-red-400 hover:bg-red-950/40 rounded-xl transition cursor-pointer flex items-center gap-1.5 border border-white/5 text-[11px] font-bold"
                        >
                          <UserX className="w-3.5 h-3.5" />
                          <span>Remove</span>
                        </button>
                      </div>

                      {/* Stat Tiles */}
                      <div className="grid grid-cols-3 gap-2 bg-[#1e2433] p-3 rounded-xl border border-white/5 mb-4">
                        <div className="text-center">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Elo Rating</span>
                          <span className="text-sm font-black text-orange-400 font-mono">
                            {Math.round(friend.overall_elo)}
                          </span>
                        </div>
                        <div className="text-center border-x border-white/10">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Weekly RP</span>
                          <span className="text-sm font-black text-amber-400 font-mono">
                            {friend.weekly_rp}
                          </span>
                        </div>
                        <div className="text-center">
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Accuracy</span>
                          <span className="text-sm font-black text-emerald-400 font-mono">
                            {friend.accuracy_percentage}%
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Actions: Chat + Challenge Duel */}
                    <div className="pt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          sound.click();
                          if (onOpenChat) onOpenChat(friend);
                        }}
                        className="py-2.5 px-3.5 bg-[#1b2130] hover:bg-orange-500/20 text-slate-200 hover:text-orange-400 font-bold text-xs rounded-xl border border-white/10 hover:border-orange-500/40 transition cursor-pointer flex items-center justify-center gap-1.5"
                        title={`Direct Chat with ${friend.username}`}
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-orange-400" />
                        <span>Chat</span>
                      </button>

                      <button
                        type="button"
                        disabled={isChallenging}
                        onClick={() => handleDirectChallenge(friend)}
                        className="flex-1 py-2.5 px-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-xl shadow-lg shadow-orange-950/40 transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        {isChallenging ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Setting up...</span>
                          </>
                        ) : (
                          <>
                            <Swords className="w-4 h-4" />
                            <span>⚔️ Challenge</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: SQUAD LEADERBOARD (FRIENDS-ONLY CHESS.COM STYLE SCOREBOARD) */}
      {activeTab === 'leaderboard' && (
        <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Trophy className="w-5 h-5 text-amber-400" />
                <span>Study Squad Scoreboard</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Ranks, ratings, and questions solved exclusively among you and your accepted squad friends.
              </p>
            </div>

            {/* Sorter Selector */}
            <div className="flex items-center gap-1 bg-[#1e2433] p-1 rounded-xl border border-white/10 self-start">
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setLeaderboardSort('elo');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  leaderboardSort === 'elo'
                    ? 'bg-orange-500 text-white font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Overall Elo
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setLeaderboardSort('rp');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  leaderboardSort === 'rp'
                    ? 'bg-orange-500 text-white font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Weekly RP
              </button>
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setLeaderboardSort('solved');
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  leaderboardSort === 'solved'
                    ? 'bg-orange-500 text-white font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Questions Solved
              </button>
            </div>
          </div>

          {loadingLeaderboard ? (
            <div className="py-16 text-center">
              <RefreshCw className="w-8 h-8 animate-spin text-orange-400 mx-auto mb-3" />
              <p className="text-sm text-slate-400 font-mono">Compiling squad ranks...</p>
            </div>
          ) : squadLeaderboard.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-sm">
              Add friends to generate your squad leaderboard!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-slate-400 uppercase font-mono">
                    <th className="pb-3 pl-2">Rank</th>
                    <th className="pb-3">Squad Aspirant</th>
                    <th className="pb-3">Division</th>
                    <th className="pb-3 text-right">Rating Elo</th>
                    <th className="pb-3 text-right">Weekly RP</th>
                    <th className="pb-3 text-right">Solved</th>
                    <th className="pb-3 text-right">Accuracy</th>
                    <th className="pb-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {squadLeaderboard.map((member) => {
                    const isYou = member.is_you;
                    const divStyle = DIVISION_COLORS[member.current_division] || DIVISION_COLORS.BRONZE;
                    const memberPresence = formatLastOnline(member.last_active, member.is_online);

                    return (
                      <tr
                        key={member.id}
                        className={`transition ${
                          isYou
                            ? 'bg-orange-500/10 border-l-4 border-orange-500 font-semibold'
                            : 'hover:bg-white/5'
                        }`}
                      >
                        {/* Rank */}
                        <td className="py-3.5 pl-2 font-mono">
                          {member.rank === 1 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-amber-500/20 text-amber-300 font-black text-sm border border-amber-500/50">
                              🥇
                            </span>
                          ) : member.rank === 2 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-400/20 text-slate-300 font-black text-sm border border-slate-400/50">
                              🥈
                            </span>
                          ) : member.rank === 3 ? (
                            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-orange-700/20 text-orange-400 font-black text-sm border border-orange-700/50">
                              🥉
                            </span>
                          ) : (
                            <span className="text-slate-400 font-bold pl-2">
                              #{member.rank}
                            </span>
                          )}
                        </td>

                        {/* Aspirant Details */}
                        <td className="py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="relative">
                              <div className="w-8 h-8 rounded-xl bg-[#1e2433] border border-white/10 flex items-center justify-center text-base overflow-hidden">
                                {member.avatar_image_url ? (
                                  <img src={member.avatar_image_url} alt={member.username} className="w-full h-full object-cover rounded-xl" />
                                ) : (
                                  <>
                                    {member.avatar_id === 'atom' && '⚛️'}
                                    {member.avatar_id === 'zap' && '⚡'}
                                    {member.avatar_id === 'rocket' && '🚀'}
                                    {member.avatar_id === 'flame' && '🔥'}
                                    {member.avatar_id === 'shield' && '🛡️'}
                                    {member.avatar_id === 'target' && '🎯'}
                                    {member.avatar_id === 'compass' && '🧭'}
                                    {member.avatar_id === 'brain' && '🧠'}
                                    {!['atom', 'zap', 'rocket', 'flame', 'shield', 'target', 'compass', 'brain'].includes(member.avatar_id) && '🔥'}
                                  </>
                                )}
                              </div>
                              <span
                                className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-[#262c3c] ${
                                  memberPresence.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'
                                }`}
                                title={memberPresence.detail || memberPresence.badgeText}
                              />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className={`font-bold ${isYou ? 'text-orange-400 font-black' : 'text-white'}`}>
                                  {member.username}
                                </span>
                                {isYou && (
                                  <span className="px-1.5 py-0.5 rounded text-[9px] font-black bg-orange-500 text-white font-mono">
                                    YOU
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 text-[10px]">
                                <span className="text-slate-400">{member.title}</span>
                                <span className="text-slate-600">•</span>
                                <span className={`font-mono ${
                                  memberPresence.isOnline
                                    ? 'text-emerald-400 font-semibold'
                                    : memberPresence.statusColor === 'amber'
                                    ? 'text-amber-400'
                                    : 'text-slate-500'
                                }`}>
                                  {memberPresence.badgeText}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Division */}
                        <td className="py-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${divStyle}`}>
                            {member.current_division}
                          </span>
                        </td>

                        {/* Elo */}
                        <td className="py-3.5 text-right font-mono font-black text-orange-400">
                          {Math.round(member.overall_elo)}
                        </td>

                        {/* RP */}
                        <td className="py-3.5 text-right font-mono font-bold text-amber-400">
                          {member.weekly_rp}
                        </td>

                        {/* Solved */}
                        <td className="py-3.5 text-right font-mono text-slate-300">
                          {member.total_solved}
                        </td>

                        {/* Accuracy */}
                        <td className="py-3.5 text-right font-mono text-emerald-400 font-bold">
                          {member.accuracy_percentage}%
                        </td>

                        {/* Action: Challenge */}
                        <td className="py-3.5 text-center">
                          {!isYou ? (
                            <button
                              type="button"
                              onClick={() => handleDirectChallenge(member)}
                              className="px-3 py-1 bg-orange-500/20 hover:bg-orange-500 hover:text-white text-orange-400 border border-orange-500/40 font-bold text-xs rounded-lg transition cursor-pointer flex items-center gap-1 mx-auto"
                            >
                              <Swords className="w-3 h-3" />
                              <span>Duel</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 font-mono">-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PENDING FRIEND REQUESTS */}
      {activeTab === 'requests' && (
        <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-black text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-orange-400" />
                <span>Pending Friend Requests</span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Review and respond to study squad invitations from peers.
              </p>
            </div>
            <button
              onClick={fetchIncomingRequests}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 border border-white/10 transition cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {incomingRequests.length === 0 ? (
            <div className="py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-white/5 border border-white/10 text-slate-500 flex items-center justify-center mx-auto mb-3">
                <UserCheck className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">No Pending Requests</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                When other JEE aspirants send you a friend request, they will appear here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {incomingRequests.map((req) => {
                const divStyle = DIVISION_COLORS[req.sender_division] || DIVISION_COLORS.BRONZE;
                const isProcessing = processingRequestId === req.sender_id;

                return (
                  <div
                    key={req.sender_id}
                    className="p-4 bg-[#1e2433] border border-white/10 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-2xl bg-[#262c3c] border border-white/10 flex items-center justify-center text-2xl shrink-0">
                        {req.sender_avatar === 'atom' && '⚛️'}
                        {req.sender_avatar === 'zap' && '⚡'}
                        {req.sender_avatar === 'rocket' && '🚀'}
                        {req.sender_avatar === 'flame' && '🔥'}
                        {req.sender_avatar === 'shield' && '🛡️'}
                        {req.sender_avatar === 'target' && '🎯'}
                        {req.sender_avatar === 'compass' && '🧭'}
                        {req.sender_avatar === 'brain' && '🧠'}
                        {!['atom','zap','rocket','flame','shield','target','compass','brain'].includes(req.sender_avatar) && '🔥'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-bold text-sm text-white">{req.sender_username}</h4>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${divStyle}`}>
                            {req.sender_division}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          {Math.round(req.sender_elo || 1200)} Elo Rating • {req.sender_title}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleRespondFriendRequest(req.sender_id, true)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Accept Request</span>
                      </button>
                      <button
                        type="button"
                        disabled={isProcessing}
                        onClick={() => handleRespondFriendRequest(req.sender_id, false)}
                        className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white font-bold text-xs rounded-xl border border-white/10 transition cursor-pointer"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: FIND & ADD ASPIRANTS */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Direct Add by Username */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
            <h2 className="text-lg font-black text-white flex items-center gap-2 mb-2">
              <UserPlus className="w-5 h-5 text-orange-400" />
              <span>Send Friend Request by Username</span>
            </h2>
            <p className="text-xs text-slate-400 mb-5">
              Enter their exact JEE Rivals username to send them a study squad invitation.
            </p>

            {addMessage.text && (
              <div
                className={`mb-4 p-3 rounded-xl text-xs flex items-center gap-2 ${
                  addMessage.type === 'success'
                    ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-200'
                    : 'bg-red-950/60 border border-red-500/40 text-red-200'
                }`}
              >
                {addMessage.type === 'success' ? (
                  <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>{addMessage.text}</span>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (directUsername.trim()) handleAddFriend(directUsername.trim());
              }}
              className="flex gap-3"
            >
              <input
                type="text"
                value={directUsername}
                onChange={(e) => setDirectUsername(e.target.value)}
                placeholder="Enter friend's username..."
                className="flex-1 px-4 py-3 bg-[#1e2433] border border-white/10 focus:border-orange-500 rounded-xl text-sm text-white placeholder-slate-500 outline-none"
              />
              <button
                type="submit"
                disabled={!directUsername.trim()}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-xl shadow-lg shadow-orange-950/40 transition cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <UserPlus className="w-4 h-4" />
                <span>Send Request</span>
              </button>
            </form>
          </div>

          {/* Live Search Aspirants */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
            <h2 className="text-lg font-black text-white flex items-center gap-2 mb-2">
              <Search className="w-5 h-5 text-orange-400" />
              <span>Search Aspirant Directory</span>
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Type at least 2 letters to search all registered JEE Rivals players.
            </p>

            <div className="relative mb-5">
              <Search className="w-4 h-4 text-slate-400 absolute left-4 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search by username..."
                className="w-full pl-11 pr-4 py-3 bg-[#1e2433] border border-white/10 focus:border-orange-500 rounded-xl text-sm text-white placeholder-slate-500 outline-none"
              />
              {isSearching && (
                <RefreshCw className="w-4 h-4 text-orange-400 animate-spin absolute right-4 top-3.5" />
              )}
            </div>

            {/* Search Results List */}
            {searchResults.length > 0 ? (
              <div className="space-y-2.5">
                {searchResults.map((aspirant) => {
                  const divStyle = DIVISION_COLORS[aspirant.current_division] || DIVISION_COLORS.BRONZE;

                  return (
                    <div
                      key={aspirant.id}
                      className="p-3.5 bg-[#1e2433] border border-white/10 rounded-2xl flex items-center justify-between gap-3 hover:border-orange-500/30 transition"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[#262c3c] border border-white/10 flex items-center justify-center text-lg overflow-hidden shrink-0">
                          {aspirant.avatar_image_url ? (
                            <img src={aspirant.avatar_image_url} alt={aspirant.username} className="w-full h-full object-cover rounded-xl" />
                          ) : (
                            <>
                              {aspirant.avatar_id === 'atom' && '⚛️'}
                              {aspirant.avatar_id === 'zap' && '⚡'}
                              {aspirant.avatar_id === 'rocket' && '🚀'}
                              {aspirant.avatar_id === 'flame' && '🔥'}
                              {aspirant.avatar_id === 'shield' && '🛡️'}
                              {aspirant.avatar_id === 'target' && '🎯'}
                              {aspirant.avatar_id === 'compass' && '🧭'}
                              {aspirant.avatar_id === 'brain' && '🧠'}
                              {!['atom', 'zap', 'rocket', 'flame', 'shield', 'target', 'compass', 'brain'].includes(aspirant.avatar_id) && '🔥'}
                            </>
                          )}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-white">
                              {aspirant.username}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold border ${divStyle}`}>
                              {aspirant.current_division}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 font-mono">
                            {Math.round(aspirant.overall_elo)} Elo Rating • {aspirant.title}
                          </p>
                        </div>
                      </div>

                      <div>
                        {aspirant.is_friend ? (
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1.5 rounded-xl bg-emerald-950/80 border border-emerald-500/40 text-emerald-400 text-xs font-bold flex items-center gap-1.5 font-mono">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                              <span>In Squad</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRemoveFriend(aspirant.id, aspirant.username)}
                              className="px-2 py-1 text-slate-400 hover:text-red-400 text-xs font-bold rounded transition"
                              title="Remove Friend"
                            >
                              Remove
                            </button>
                          </div>
                        ) : aspirant.request_sent ? (
                          <div className="flex items-center gap-2">
                            <span className="px-3 py-1.5 rounded-xl bg-amber-950/60 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1.5 font-mono">
                              <Clock className="w-3.5 h-3.5" />
                              <span>Request Sent</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCancelRequest(aspirant.id)}
                              className="px-2.5 py-1 text-slate-400 hover:text-red-400 text-xs font-bold rounded transition"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : aspirant.request_received ? (
                          <button
                            type="button"
                            onClick={() => handleRespondFriendRequest(aspirant.id, true)}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center gap-1.5"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Accept Request</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleAddFriend(aspirant.username)}
                            className="px-4 py-2 bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs rounded-xl shadow transition cursor-pointer flex items-center gap-1.5"
                          >
                            <UserPlus className="w-3.5 h-3.5" />
                            <span>Send Request</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : searchQuery.length >= 2 && !isSearching ? (
              <p className="text-center py-6 text-xs text-slate-400">
                No aspirants found matching "{searchQuery}".
              </p>
            ) : null}
          </div>
        </div>
      )}

      {/* TAB 5: INVITE LINK, PASSCODE & ROOM CODE */}
      {activeTab === 'lobbies' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Share Invite Link */}
            <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                    <Share2 className="w-4 h-4" />
                  </div>
                  <h2 className="text-lg font-black text-white">Share Direct Invite Link</h2>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-5">
                  Send this link to friends on WhatsApp or Telegram. Anyone who opens the link will land directly on JEE Rivals with you as their study buddy.
                </p>

                <div className="p-3 bg-[#1e2433] rounded-2xl border border-white/10 flex items-center justify-between gap-3 mb-4">
                  <span className="font-mono text-xs text-orange-300 truncate select-all">
                    {inviteUrl}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyLink}
                    className="px-3 py-1.5 bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs rounded-xl transition flex items-center gap-1.5 shrink-0 cursor-pointer shadow-md"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  type="button"
                  onClick={handleShareWhatsApp}
                  className="py-3 px-4 bg-[#25D366] hover:bg-[#20ba5a] text-slate-950 font-black text-xs rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-emerald-950/30"
                >
                  <MessageCircle className="w-4 h-4 fill-current" />
                  <span>WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={handleShareTelegram}
                  className="py-3 px-4 bg-[#0088cc] hover:bg-[#0077b5] text-white font-black text-xs rounded-2xl transition flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-950/30"
                >
                  <Send className="w-4 h-4" />
                  <span>Telegram</span>
                </button>
              </div>
            </div>

            {/* Join Room by Code */}
            <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-8 h-8 rounded-xl bg-orange-500/20 text-orange-400 flex items-center justify-center">
                    <Swords className="w-4 h-4" />
                  </div>
                  <h2 className="text-lg font-black text-white">Join Friend's Room Code</h2>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed mb-4">
                  Have a 5-letter battle code shared by a friend? Enter the code below to join their lobby.
                </p>

                {joinError && (
                  <div className="mb-4 p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-200 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                    <span>{joinError}</span>
                  </div>
                )}

                <form onSubmit={handleJoinByCode} className="space-y-3">
                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      5-Letter Room Code
                    </label>
                    <input
                      type="text"
                      maxLength={5}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="e.g. RLBQX"
                      className="w-full px-4 py-3 bg-[#1e2433] border border-white/10 focus:border-orange-500 rounded-xl font-mono text-center text-lg font-black tracking-widest text-orange-400 uppercase outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                      Passcode (Optional)
                    </label>
                    <input
                      type="text"
                      maxLength={10}
                      value={passcode}
                      onChange={(e) => setPasscode(e.target.value)}
                      placeholder="Leave empty if public"
                      className="w-full px-4 py-2 bg-[#1e2433] border border-white/10 focus:border-orange-500 rounded-xl text-xs text-center text-slate-200 outline-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={joining || joinCode.trim().length < 3}
                    className="w-full mt-2 py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-xl transition cursor-pointer shadow-lg shadow-orange-950/40 flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {joining ? (
                      <span>Connecting...</span>
                    ) : (
                      <>
                        <span>ENTER ROOM</span>
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Live Open Public Lobbies */}
          {openRooms.length > 0 && (
            <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-black text-white flex items-center gap-2">
                  <Globe className="w-4 h-4 text-orange-400" />
                  <span>Public Battle Lobbies Currently Waiting</span>
                </h2>
                <span className="text-xs text-slate-400 font-mono">{openRooms.length} Active</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {openRooms.map((r) => (
                  <div
                    key={r.code}
                    className="bg-[#1e2433] border border-white/10 hover:border-orange-500/40 rounded-2xl p-4 transition shadow-md flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-mono font-black text-orange-400 text-sm">
                          #{r.code}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded bg-[#262c3c] text-slate-400 font-mono">
                          Host: {r.host_username}
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-white mb-1">
                        {r.preset_name || 'Multiplayer Duel'}
                      </h4>
                      <p className="text-[11px] text-slate-400">
                        {r.subjects.join(', ')} • {r.total_questions} Qs
                      </p>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 flex items-center gap-1 font-mono">
                        <Users className="w-3 h-3 text-orange-400" />
                        <span>{r.participant_count} Joined</span>
                      </span>
                      <button
                        onClick={async () => {
                          sound.click();
                          try {
                            const room = await api.rooms.join(r.code);
                            onJoinRoomCode(room);
                          } catch (err) {
                            setJoinError(err.message || 'Failed to join room');
                          }
                        }}
                        className="px-3.5 py-1.5 bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-md"
                      >
                        Join
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
