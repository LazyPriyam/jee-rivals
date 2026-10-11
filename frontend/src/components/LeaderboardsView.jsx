import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Trophy, Shield, Clock, Flame, Crown, RefreshCw, Zap, Users, UserPlus, HelpCircle, Sparkles, ArrowUpRight } from 'lucide-react';
import DivisionGuideModal from './DivisionGuideModal';
import { formatLastOnline } from '../utils/dateUtils';

export const getDivisionBaseTier = (div) => {
  if (!div) return 'BRONZE';
  const u = String(div).toUpperCase();
  if (u.includes('GRANDMASTER')) return 'GRANDMASTER';
  if (u.includes('MASTER')) return 'MASTER';
  if (u.includes('DIAMOND')) return 'DIAMOND';
  if (u.includes('PLATINUM')) return 'PLATINUM';
  if (u.includes('GOLD')) return 'GOLD';
  if (u.includes('SILVER')) return 'SILVER';
  return 'BRONZE';
};

const DIVISION_COLORS = {
  GRANDMASTER: 'text-red-400 bg-red-950/80 border-red-500/50',
  MASTER: 'text-purple-300 bg-purple-950/80 border-purple-500/50',
  DIAMOND: 'text-blue-300 bg-blue-950/80 border-blue-400/50',
  PLATINUM: 'text-emerald-300 bg-emerald-950/80 border-emerald-500/50',
  GOLD: 'text-amber-300 bg-amber-950/80 border-amber-500/50',
  SILVER: 'text-slate-300 bg-slate-800 border-slate-600/50',
  BRONZE: 'text-orange-400 bg-orange-950/80 border-orange-700/50',
};

const AVATAR_MAP = {
  atom: '⚛️',
  zap: '⚡',
  rocket: '🚀',
  flame: '🔥',
  shield: '🛡️',
  target: '🎯',
  compass: '🧭',
  brain: '🧠',
  crown: '👑',
  swords: '⚔️',
};

export default function LeaderboardsView({ user, onViewProfile, onNavigateTab, isActive = true }) {
  const [activeTab, setActiveTab] = useState('weekly'); // 'weekly', 'elo', 'friends'
  const [weeklyData, setWeeklyData] = useState(null);
  const [eloData, setEloData] = useState(null);
  const [eloSubject, setEloSubject] = useState('overall');
  const [friendsData, setFriendsData] = useState([]);
  const [friendsSort, setFriendsSort] = useState('elo'); // 'elo', 'rp', 'solved'
  const [loading, setLoading] = useState(true);
  const [guideModalOpen, setGuideModalOpen] = useState(false);
  const [myDivisionData, setMyDivisionData] = useState(null);

  useEffect(() => {
    if (isActive !== false) {
      fetchData();
    }
  }, [activeTab, eloSubject, friendsSort, isActive, user?.overall_elo, user?.rp]);

  useEffect(() => {
    const handleUserUpdated = () => {
      fetchData();
    };
    window.addEventListener('jee_user_updated', handleUserUpdated);
    return () => window.removeEventListener('jee_user_updated', handleUserUpdated);
  }, [activeTab, eloSubject, friendsSort]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'weekly') {
        const [data, myDiv] = await Promise.all([
          api.leaderboards.getWeekly(50),
          user ? api.leaderboards.getDivisionDetails().catch(() => null) : Promise.resolve(null),
        ]);
        setWeeklyData(data);
        setMyDivisionData(myDiv);
      } else if (activeTab === 'elo') {
        const data = await api.leaderboards.getElo(eloSubject, 50);
        setEloData(data);
      } else if (activeTab === 'friends') {
        if (user) {
          const data = await api.friends.getLeaderboard(friendsSort);
          setFriendsData(data || []);
        } else {
          setFriendsData([]);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 page-transition">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <Trophy className="w-8 h-8 text-amber-400" />
            <span>Leaderboards & Hall of Fame</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1">
            Academic prestige across weekly leagues, permanent Elo ladders, and friends.
          </p>
        </div>

        {/* Tab Toggle */}
        <div className="flex items-center gap-1 bg-[#101524] border border-white/10 p-1 rounded-2xl self-start">
          <button
            onClick={() => setActiveTab('weekly')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'weekly'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-950/50 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Flame className="w-3.5 h-3.5" />
            <span>Weekly League</span>
          </button>
          <button
            onClick={() => setActiveTab('elo')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'elo'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-950/50 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Global Elo</span>
          </button>
          <button
            onClick={() => setActiveTab('friends')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'friends'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-950/50 font-black'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Users className="w-3.5 h-3.5 text-amber-300" />
            <span>Friends Only</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-orange-400 mx-auto mb-3" />
          <p className="text-sm text-slate-400 font-mono">Loading rankings...</p>
        </div>
      ) : activeTab === 'friends' ? (
        /* Friends Only Leaderboard (Chess.com Style) */
        <div>
          <div className="bg-[#101524] border border-orange-500/30 rounded-2xl p-4 sm:p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-950/80 border border-orange-500/40 text-orange-400">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                  Study Squad Scoreboard
                </span>
                <h4 className="text-sm font-extrabold text-white">
                  Exclusive Rankings for You & Your Friends
                </h4>
              </div>
            </div>

            {/* Sorter Pills */}
            <div className="flex items-center gap-1 bg-[#1e2433] p-1 rounded-xl border border-white/10">
              <button
                type="button"
                onClick={() => setFriendsSort('elo')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  friendsSort === 'elo'
                    ? 'bg-orange-500 text-white font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Overall Elo
              </button>
              <button
                type="button"
                onClick={() => setFriendsSort('rp')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  friendsSort === 'rp'
                    ? 'bg-orange-500 text-white font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Weekly RP
              </button>
              <button
                type="button"
                onClick={() => setFriendsSort('solved')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                  friendsSort === 'solved'
                    ? 'bg-orange-500 text-white font-black'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Solved
              </button>
            </div>
          </div>

          {!user ? (
            <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-10 text-center shadow-xl">
              <p className="text-sm text-slate-400 mb-3">Please sign in to view your friends leaderboard.</p>
            </div>
          ) : friendsData.length === 0 ? (
            <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-10 text-center shadow-xl">
              <div className="w-14 h-14 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-orange-400 flex items-center justify-center mx-auto mb-3">
                <UserPlus className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">No Study Buddies Found</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                Add friends using the "Invite Friends" tab to track their ranks and compete!
              </p>
              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => onNavigateTab('invite')}
                  className="px-5 py-2.5 bg-orange-500 hover:bg-orange-400 text-white font-bold text-xs rounded-xl shadow cursor-pointer"
                >
                  Go to Invite Friends Hub
                </button>
              )}
            </div>
          ) : (
            <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-white/10 text-xs text-slate-500 uppercase font-mono">
                      <th className="pb-3 pl-2">Rank</th>
                      <th className="pb-3">Squad Aspirant</th>
                      <th className="pb-3">Division</th>
                      <th className="pb-3 text-right">Overall Elo</th>
                      <th className="pb-3 text-right">Weekly RP</th>
                      <th className="pb-3 text-right">Total Solved</th>
                      <th className="pb-3 text-right">Accuracy</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {friendsData.map((u) => {
                      const isMe = u.is_you;
                      const divStyle = DIVISION_COLORS[getDivisionBaseTier(u.current_division)] || DIVISION_COLORS.BRONZE;

                      return (
                        <tr
                          key={u.id}
                          onClick={() => onViewProfile && onViewProfile(u.username)}
                          className={`cursor-pointer transition ${
                            isMe ? 'bg-orange-950/30 font-semibold border-l-4 border-orange-500' : 'hover:bg-white/5'
                          }`}
                        >
                          <td className="py-3.5 pl-2 font-mono font-bold">
                            {u.rank === 1 ? '🥇 #1' : u.rank === 2 ? '🥈 #2' : u.rank === 3 ? '🥉 #3' : `#${u.rank}`}
                          </td>
                          <td className="py-3.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-6 h-6 rounded-lg bg-[#181d2a] border border-white/10 flex items-center justify-center text-xs overflow-hidden shrink-0">
                                {u.avatar_image_url ? (
                                  <img src={u.avatar_image_url} alt={u.username} className="w-full h-full object-cover" />
                                ) : (
                                  <span>{AVATAR_MAP[u.avatar_id] || '🔥'}</span>
                                )}
                              </div>
                              <span className={`font-bold ${isMe ? 'text-orange-400' : 'text-white'}`}>
                                {u.username}
                              </span>
                              {isMe && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-orange-950 border border-orange-500/40 text-orange-400 rounded font-bold font-mono">
                                  YOU
                                </span>
                              )}
                              {(() => {
                                const presence = formatLastOnline(u.last_active, u.is_online);
                                return (
                                  <span
                                    className={`w-2 h-2 rounded-full inline-block ${
                                      presence.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                                    }`}
                                    title={presence.detail || presence.badgeText}
                                  />
                                );
                              })()}
                            </div>
                          </td>
                          <td className="py-3.5">
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${divStyle}`}>
                              {u.current_division}
                            </span>
                          </td>
                          <td className="py-3.5 text-right font-mono font-black text-orange-400">
                            {Math.round(u.overall_elo)}
                          </td>
                          <td className="py-3.5 text-right font-mono font-bold text-amber-400">
                            {u.weekly_rp} RP
                          </td>
                          <td className="py-3.5 text-right font-mono text-slate-300">
                            {u.total_solved}
                          </td>
                          <td className="py-3.5 text-right font-mono text-emerald-400 font-bold">
                            {u.accuracy_percentage}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ) : activeTab === 'weekly' ? (
        /* Weekly League Division View */
        <div>
          {/* Reset Countdown & Division Guide Bar */}
          <div className="bg-[#101524] border border-orange-500/30 rounded-2xl p-4 sm:p-5 mb-6 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-orange-950/80 border border-orange-500/40 text-orange-400">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <span className="text-xs uppercase font-bold tracking-wider text-slate-400">
                  Current Division Season
                </span>
                <h4 className="text-sm font-extrabold text-white">
                  Every Monday 05:29 AM IST (Weekly Promotion & Reset)
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Active Aspirants:</span>
                <span className="px-2.5 py-1 bg-[#1e2433] border border-white/10 rounded-lg font-mono text-orange-400 text-xs font-bold">
                  {weeklyData?.total_active_aspirants || 0}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setGuideModalOpen(true)}
                className="px-3.5 py-1.5 bg-gradient-to-r from-orange-500/20 to-amber-500/20 hover:from-orange-500/30 hover:to-amber-500/30 border border-orange-500/40 text-orange-300 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-sm"
              >
                <HelpCircle className="w-4 h-4 text-orange-400" />
                <span>Rules & Tier Guide</span>
              </button>
            </div>
          </div>

          {/* User's Personal League Advancement Status Card */}
          {user && myDivisionData?.division && (
            <div className="bg-gradient-to-br from-[#1b2131] via-[#161a27] to-[#121622] border border-orange-500/30 rounded-3xl p-5 sm:p-6 mb-6 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 w-80 h-80 bg-orange-500/5 rounded-full blur-3xl -z-10 pointer-events-none"></div>

              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                {/* Left: Division Badge & Zone */}
                <div className="space-y-3 min-w-[240px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400">
                      Your Standing in League
                    </span>
                    {myDivisionData.division.zone === 'promotion' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        <span>Promotion Zone</span>
                      </span>
                    )}
                    {myDivisionData.division.zone === 'relegation' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                        Demotion Risk
                      </span>
                    )}
                    {myDivisionData.division.zone === 'safe' && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                        Safe Zone
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-3xl sm:text-4xl">
                      {myDivisionData.division.icon}
                    </div>
                    <div>
                      <h3 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2">
                        <span>{myDivisionData.division.full_name}</span>
                      </h3>
                      <p className="text-xs text-slate-400 font-mono">
                        Weekly Rank: <strong className="text-orange-400">#{myDivisionData.rank}</strong> of {myDivisionData.total_aspirants} aspirants
                      </p>
                    </div>
                  </div>

                  {/* Multiplier & Trajectory Perks */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-[11px] px-2.5 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20 text-orange-300 font-bold flex items-center gap-1">
                      <Zap className="w-3 h-3 text-orange-400" />
                      <span>{myDivisionData.division.multiplier}x RP Multiplier</span>
                    </span>
                    <span className="text-[11px] px-2.5 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 font-medium">
                      🎯 {myDivisionData.division.air_bracket}
                    </span>
                  </div>
                </div>

                {/* Right: Sub-tier Progression Bar & Dual-Gate Reqs */}
                <div className="flex-1 max-w-xl bg-[#202738]/80 border border-white/5 rounded-2xl p-4 sm:p-5 space-y-3">
                  {(() => {
                    const div = myDivisionData.division || {};
                    const nextTargetName = div.next_full_name || (div.next_tier ? `${div.next_tier.tier_name} III` : 'Next Tier');
                    const progressPercent = Math.min(100, Math.max(0, Math.round(div.progress_percent ?? 0)));
                    const neededRp = div.needed_rp ?? (div.next_tier?.rp_needed ?? Math.max(0, (div.tier_target_rp || 0) - (div.current_rp || 0)));
                    const neededElo = div.needed_elo ?? (div.next_tier?.elo_needed ?? 0);
                    const minAcc = div.min_acc ?? (div.next_tier?.target_acc ?? 0);
                    const neededAcc = div.needed_acc ?? (div.next_tier?.acc_needed ?? 0);

                    return (
                      <>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-300">
                            Progression toward <strong className="text-amber-300">{nextTargetName}</strong>
                          </span>
                          <span className="font-mono font-bold text-orange-400">
                            {progressPercent}%
                          </span>
                        </div>

                        {/* Progress Bar */}
                        <div className="w-full bg-[#151923] h-2.5 rounded-full overflow-hidden border border-white/10 p-[1px]">
                          <div
                            className="bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400 h-full rounded-full transition-all duration-500 shadow-sm"
                            style={{ width: `${progressPercent}%` }}
                          />
                        </div>

                        {/* Dual Gate Badges */}
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 text-[11px]">
                          <div className="bg-[#181d2a] p-2 rounded-xl border border-white/5 flex flex-col">
                            <span className="text-slate-400 text-[10px] uppercase font-bold">1. Weekly RP Gate</span>
                            <span className={`font-mono font-bold mt-0.5 ${neededRp <= 0 ? 'text-emerald-400' : 'text-amber-400'}`}>
                              {neededRp <= 0 ? '✓ RP Target Met' : `+${neededRp} RP needed`}
                            </span>
                          </div>

                          <div className="bg-[#181d2a] p-2 rounded-xl border border-white/5 flex flex-col">
                            <span className="text-slate-400 text-[10px] uppercase font-bold">2. Overall Elo Gate</span>
                            <span className={`font-mono font-bold mt-0.5 ${neededElo <= 0 ? 'text-emerald-400' : 'text-blue-400'}`}>
                              {neededElo <= 0 ? '✓ Elo Target Met' : `+${neededElo} Elo needed`}
                            </span>
                          </div>

                          <div className="bg-[#181d2a] p-2 rounded-xl border border-white/5 flex flex-col">
                            <span className="text-slate-400 text-[10px] uppercase font-bold">3. Min Accuracy Gate</span>
                            <span className={`font-mono font-bold mt-0.5 ${neededAcc <= 0 ? 'text-emerald-400' : 'text-purple-400'}`}>
                              {neededAcc <= 0 ? '✓ Accuracy Met' : `${minAcc}% min required`}
                            </span>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Leaderboard Table */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-slate-500 uppercase font-mono">
                    <th className="pb-3 pl-2">Rank</th>
                    <th className="pb-3">Aspirant</th>
                    <th className="pb-3">Division & Zone</th>
                    <th className="pb-3 text-right">Weekly RP</th>
                    <th className="pb-3 text-right">Overall Elo</th>
                    <th className="pb-3 text-right">Accuracy</th>
                    <th className="pb-3 text-center">Medals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {weeklyData?.leaderboard?.map((u) => {
                    const isMe = user && (String(u.user_id) === String(user.id) || u.username === user.username);
                    const baseTier = getDivisionBaseTier(u.division_id || u.division);
                    const divStyle = DIVISION_COLORS[baseTier] || DIVISION_COLORS.BRONZE;

                    return (
                      <tr
                        key={u.user_id}
                        onClick={() => onViewProfile && onViewProfile(u.username)}
                        className={`cursor-pointer transition ${
                          isMe ? 'bg-orange-950/30 font-semibold' : 'hover:bg-white/5'
                        }`}
                      >
                        <td className="py-3.5 pl-2 font-mono font-bold">
                          {u.rank === 1 && <span className="text-amber-400">🥇 #1</span>}
                          {u.rank === 2 && <span className="text-slate-300">🥈 #2</span>}
                          {u.rank === 3 && <span className="text-amber-600">🥉 #3</span>}
                          {u.rank > 3 && <span className="text-slate-400">#{u.rank}</span>}
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-lg bg-[#181d2a] border border-white/10 flex items-center justify-center text-xs overflow-hidden shrink-0">
                              {u.avatar_image_url ? (
                                <img src={u.avatar_image_url} alt={u.username} className="w-full h-full object-cover" />
                              ) : (
                                <span>{AVATAR_MAP[u.avatar_id] || '🔥'}</span>
                              )}
                            </div>
                            <span className="font-bold text-white">{u.username}</span>
                            {u.streak > 0 && (
                              <span
                                className="text-[10px] px-1.5 py-0.2 bg-orange-500/15 border border-orange-500/30 text-orange-400 rounded-full font-bold flex items-center gap-0.5"
                                title={`${u.streak} Day Study Streak`}
                              >
                                <Flame className="w-2.5 h-2.5 fill-current" />
                                <span>{u.streak}</span>
                              </span>
                            )}
                            {isMe && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-orange-950 border border-orange-500/40 text-orange-400 rounded font-bold">
                                YOU
                              </span>
                            )}
                            {(() => {
                              const presence = formatLastOnline(u.last_active, u.is_online);
                              return (
                                <span
                                  className={`w-2 h-2 rounded-full inline-block ${
                                    presence.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                                  }`}
                                  title={presence.detail || presence.badgeText}
                                />
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${divStyle}`}>
                              {u.division_icon ? `${u.division_icon} ` : ''}{u.division}
                            </span>
                            {u.division_zone === 'promotion' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-bold uppercase tracking-wider">
                                ▲ Promo
                              </span>
                            )}
                            {u.division_zone === 'relegation' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30 font-bold uppercase tracking-wider">
                                ▼ Risk
                              </span>
                            )}
                            {u.division_zone === 'safe' && (
                              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                                Safe
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 text-right font-mono font-black text-orange-400">
                          {u.weekly_rp} RP
                        </td>
                        <td className="py-3.5 text-right font-mono text-slate-300">
                          {Math.round(u.overall_elo)}
                        </td>
                        <td className="py-3.5 text-right font-mono text-emerald-400 font-bold">
                          {u.accuracy !== undefined ? `${u.accuracy}%` : '-'}
                        </td>
                        <td className="py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5 text-xs font-mono">
                            {u.medals?.gold > 0 && <span title="Gold Medals">🥇{u.medals.gold}</span>}
                            {u.medals?.silver > 0 && <span title="Silver Medals">🥈{u.medals.silver}</span>}
                            {u.medals?.bronze > 0 && <span title="Bronze Medals">🥉{u.medals.bronze}</span>}
                            {(!u.medals || (u.medals.gold === 0 && u.medals.silver === 0 && u.medals.bronze === 0)) && (
                              <span className="text-slate-600">-</span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Global Elo Ladders View */
        <div>
          {/* Subject Selector Bar */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            {[
              { id: 'overall', label: 'Overall Elo' },
              { id: 'physics', label: 'Physics' },
              { id: 'chemistry', label: 'Chemistry' },
              { id: 'math', label: 'Mathematics' },
            ].map((sub) => (
              <button
                key={sub.id}
                onClick={() => setEloSubject(sub.id)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
                  eloSubject === sub.id
                    ? 'bg-orange-500 text-white font-black shadow-md shadow-orange-950/40'
                    : 'bg-[#262c3c] border border-white/10 text-slate-400 hover:text-white'
                }`}
              >
                {sub.label}
              </button>
            ))}
          </div>

          {/* Elo Ladder Table */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-slate-500 uppercase font-mono">
                    <th className="pb-3 pl-2">Rank</th>
                    <th className="pb-3">Aspirant</th>
                    <th className="pb-3 text-right">Rating</th>
                    <th className="pb-3 text-right">Physics</th>
                    <th className="pb-3 text-right">Chemistry</th>
                    <th className="pb-3 text-right">Math</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {eloData?.ladder?.map((u) => {
                    const isMe = user && (String(u.user_id) === String(user.id) || u.username === user.username);

                    return (
                      <tr
                        key={u.user_id}
                        onClick={() => onViewProfile && onViewProfile(u.username)}
                        className={`cursor-pointer transition ${
                          isMe ? 'bg-orange-950/30 font-semibold' : 'hover:bg-white/5'
                        }`}
                      >
                        <td className="py-3.5 pl-2 font-mono font-bold">
                          {u.rank === 1 && <span className="text-amber-400">🥇 #1</span>}
                          {u.rank === 2 && <span className="text-slate-300">🥈 #2</span>}
                          {u.rank === 3 && <span className="text-amber-600">🥉 #3</span>}
                          {u.rank > 3 && <span className="text-slate-400">#{u.rank}</span>}
                        </td>
                        <td className="py-3.5">
                          <div className="flex items-center gap-2.5">
                            <div className="w-6 h-6 rounded-lg bg-[#181d2a] border border-white/10 flex items-center justify-center text-xs overflow-hidden shrink-0">
                              {u.avatar_image_url ? (
                                <img src={u.avatar_image_url} alt={u.username} className="w-full h-full object-cover" />
                              ) : (
                                <span>{AVATAR_MAP[u.avatar_id] || '🔥'}</span>
                              )}
                            </div>
                            <span className="font-bold text-white">{u.username}</span>
                            {isMe && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-orange-950 border border-orange-500/40 text-orange-400 rounded font-bold">
                                YOU
                              </span>
                            )}
                            {(() => {
                              const presence = formatLastOnline(u.last_active, u.is_online);
                              return (
                                <span
                                  className={`w-2 h-2 rounded-full inline-block ${
                                    presence.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                                  }`}
                                  title={presence.detail || presence.badgeText}
                                />
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-3.5 text-right font-mono font-black text-orange-400 text-base">
                          {Math.round(u.rating ?? 1200)}
                        </td>
                        <td className="py-3.5 text-right font-mono text-slate-300">
                          {Math.round(u.ratings?.physics ?? 1200)}
                        </td>
                        <td className="py-3.5 text-right font-mono text-slate-300">
                          {Math.round(u.ratings?.chemistry ?? 1200)}
                        </td>
                        <td className="py-3.5 text-right font-mono text-slate-300">
                          {Math.round(u.ratings?.math ?? 1200)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Division System Guide & Tiers Modal */}
      <DivisionGuideModal
        isOpen={guideModalOpen}
        onClose={() => setGuideModalOpen(false)}
      />
    </div>
  );
}
