import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';
import { Trophy, Shield, Clock, Flame, Crown, RefreshCw, Zap, Users, UserPlus } from 'lucide-react';

const DIVISION_COLORS = {
  GRANDMASTER: 'text-red-400 bg-red-950/80 border-red-500/50',
  MASTER: 'text-purple-300 bg-purple-950/80 border-purple-500/50',
  DIAMOND: 'text-blue-300 bg-blue-950/80 border-blue-400/50',
  PLATINUM: 'text-emerald-300 bg-emerald-950/80 border-emerald-500/50',
  GOLD: 'text-amber-300 bg-amber-950/80 border-amber-500/50',
  SILVER: 'text-slate-300 bg-slate-800 border-slate-600/50',
  BRONZE: 'text-orange-400 bg-orange-950/80 border-orange-700/50',
};

export default function LeaderboardsView({ user, onViewProfile, onNavigateTab }) {
  const [activeTab, setActiveTab] = useState('weekly'); // 'weekly', 'elo', 'friends'
  const [weeklyData, setWeeklyData] = useState(null);
  const [eloData, setEloData] = useState(null);
  const [eloSubject, setEloSubject] = useState('overall');
  const [friendsData, setFriendsData] = useState([]);
  const [friendsSort, setFriendsSort] = useState('elo'); // 'elo', 'rp', 'solved'
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [activeTab, eloSubject, friendsSort]);

  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'weekly') {
        const data = await api.leaderboards.getWeekly(50);
        setWeeklyData(data);
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
                      const divStyle = DIVISION_COLORS[u.current_division] || DIVISION_COLORS.BRONZE;

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
                            <div className="flex items-center gap-2">
                              <span className={`font-bold ${isMe ? 'text-orange-400' : 'text-white'}`}>
                                {u.username}
                              </span>
                              {isMe && (
                                <span className="text-[10px] px-1.5 py-0.5 bg-orange-950 border border-orange-500/40 text-orange-400 rounded font-bold font-mono">
                                  YOU
                                </span>
                              )}
                              {u.is_online && (
                                <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" title="Online" />
                              )}
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
          {/* Reset Countdown Card */}
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
                  Sunday 23:59 UTC Weekly Promotion & Reset
                </h4>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Active Aspirants:</span>
              <span className="px-2.5 py-1 bg-[#1e2433] border border-white/10 rounded-lg font-mono text-orange-400 text-xs font-bold">
                {weeklyData?.total_active_aspirants || 0}
              </span>
            </div>
          </div>

          {/* Leaderboard Table */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 text-xs text-slate-500 uppercase font-mono">
                    <th className="pb-3 pl-2">Rank</th>
                    <th className="pb-3">Aspirant</th>
                    <th className="pb-3">Division</th>
                    <th className="pb-3 text-right">Weekly RP</th>
                    <th className="pb-3 text-right">Overall Elo</th>
                    <th className="pb-3 text-center">Medals</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {weeklyData?.leaderboard?.map((u) => {
                    const isMe = user && u.user_id === user.id;
                    const divStyle = DIVISION_COLORS[u.division] || DIVISION_COLORS.BRONZE;

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
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{u.username}</span>
                            {isMe && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-orange-950 border border-orange-500/40 text-orange-400 rounded font-bold">
                                YOU
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5">
                          <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${divStyle}`}>
                            {u.division}
                          </span>
                        </td>
                        <td className="py-3.5 text-right font-mono font-black text-orange-400">
                          {u.weekly_rp} RP
                        </td>
                        <td className="py-3.5 text-right font-mono text-slate-300">
                          {Math.round(u.overall_elo)}
                        </td>
                        <td className="py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5 text-xs font-mono">
                            {u.medals.gold > 0 && <span title="Gold Medals">🥇{u.medals.gold}</span>}
                            {u.medals.silver > 0 && <span title="Silver Medals">🥈{u.medals.silver}</span>}
                            {u.medals.bronze > 0 && <span title="Bronze Medals">🥉{u.medals.bronze}</span>}
                            {u.medals.gold === 0 && u.medals.silver === 0 && u.medals.bronze === 0 && (
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
                    const isMe = user && u.user_id === user.id;

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
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white">{u.username}</span>
                            {isMe && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-orange-950 border border-orange-500/40 text-orange-400 rounded font-bold">
                                YOU
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 text-right font-mono font-black text-orange-400 text-base">
                          {Math.round(u.rating)}
                        </td>
                        <td className="py-3.5 text-right font-mono text-slate-300">
                          {Math.round(u.ratings.physics)}
                        </td>
                        <td className="py-3.5 text-right font-mono text-slate-300">
                          {Math.round(u.ratings.chemistry)}
                        </td>
                        <td className="py-3.5 text-right font-mono text-slate-300">
                          {Math.round(u.ratings.math)}
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
    </div>
  );
}
