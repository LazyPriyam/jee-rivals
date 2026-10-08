import React, { useState, useEffect, useRef } from 'react';
import { api } from '../utils/api';
import { sound } from '../utils/sound';
import {
  Trophy,
  Award,
  Gift,
  Crown,
  Swords,
  Users,
  Flame,
  Clock,
  Sparkles,
  CheckCircle2,
  Lock,
  Plus,
  Play,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  AlertCircle,
  Shield,
  Zap,
  Check,
  X,
  Target,
  ExternalLink,
  Search,
  RefreshCw
} from 'lucide-react';

export default function TournamentsView({ user, onJoinRoomCode, onOpenAuth, onViewProfile }) {
  const [tournaments, setTournaments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('ALL'); // ALL, IN_PROGRESS, REGISTRATION, COMPLETED
  const [selectedTournament, setSelectedTournament] = useState(null);
  const [tournamentLoading, setTournamentLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [passcodeModalOpen, setPasscodeModalOpen] = useState(false);
  const [passcodeTargetId, setPasscodeTargetId] = useState(null);
  const [enteredPasscode, setEnteredPasscode] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');

  // Form state for organizing a tournament
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFormat, setFormFormat] = useState('KNOCKOUT');
  const [formBracketSize, setFormBracketSize] = useState(8);
  const [formSeriesCycles, setFormSeriesCycles] = useState(3); // For 3-player leagues: K cycles -> 3*K matches
  const [formTargetExam, setFormTargetExam] = useState('MIXED');
  const [formSubject, setFormSubject] = useState('Full Syllabus');
  const [formRewardType, setFormRewardType] = useState('REAL_LIFE'); // REAL_LIFE, IN_GAME, HYBRID
  const [formRealLifeReward, setFormRealLifeReward] = useState('');
  const [formClaimInstructions, setFormClaimInstructions] = useState('');
  const [formRpPool, setFormRpPool] = useState(1000);
  const [formQuestionCount, setFormQuestionCount] = useState(5);
  const [formTimePerQuestion, setFormTimePerQuestion] = useState(60);
  const [formPasscode, setFormPasscode] = useState('');
  const [creating, setCreating] = useState(false);

  const selectedTournamentRef = useRef(selectedTournament);
  useEffect(() => {
    selectedTournamentRef.current = selectedTournament;
  }, [selectedTournament]);

  useEffect(() => {
    fetchTournaments();
    const interval = setInterval(fetchTournaments, 5000);
    return () => clearInterval(interval);
  }, [filter]);

  const fetchTournaments = () => {
    const statusParam = filter === 'ALL' ? null : filter;
    api.tournaments.getAll(statusParam)
      .then((data) => {
        setTournaments(data || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    if (selectedTournamentRef.current?.id) {
      api.tournaments.get(selectedTournamentRef.current.id)
        .then((updated) => {
          setSelectedTournament((prev) => {
            if (!prev || prev.id !== updated.id) return prev;
            return updated;
          });
        })
        .catch(() => {});
    }
  };

  const handleOpenTournament = async (tId) => {
    sound.click();
    setTournamentLoading(true);
    setActionError('');
    setActionSuccess('');
    try {
      const data = await api.tournaments.get(tId);
      setSelectedTournament(data);
    } catch (err) {
      setActionError(err.message || 'Failed to load tournament details.');
    } finally {
      setTournamentLoading(false);
    }
  };

  const handleJoinTournament = async (tId, passcode = null) => {
    if (!user) {
      onOpenAuth();
      return;
    }
    sound.click();
    setActionError('');
    try {
      const updated = await api.tournaments.join(tId, passcode);
      setSelectedTournament(updated);
      fetchTournaments();
      setActionSuccess('Successfully registered for tournament!');
      setPasscodeModalOpen(false);
      setEnteredPasscode('');
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes('passcode')) {
        setPasscodeTargetId(tId);
        setPasscodeModalOpen(true);
      } else {
        setActionError(err.message || 'Failed to join tournament.');
      }
    }
  };

  const handleLeaveTournament = async (tId) => {
    sound.click();
    setActionError('');
    try {
      const updated = await api.tournaments.leave(tId);
      setSelectedTournament(updated);
      fetchTournaments();
      setActionSuccess('Withdrew registration from tournament.');
    } catch (err) {
      setActionError(err.message || 'Failed to leave tournament.');
    }
  };

  const handleStartTournament = async (tId) => {
    sound.click();
    setActionError('');
    try {
      const updated = await api.tournaments.start(tId);
      setSelectedTournament(updated);
      fetchTournaments();
      setActionSuccess('Tournament officially commenced! Round 1 matchups are live.');
    } catch (err) {
      setActionError(err.message || 'Failed to start tournament.');
    }
  };

  const handleEnterMatch = async (roomCode) => {
    sound.click();
    if (!roomCode) return;
    try {
      const room = await api.rooms.get(roomCode);
      onJoinRoomCode(room);
    } catch (err) {
      setActionError(err.message || 'Failed to enter match arena.');
    }
  };

  const handleSimulateMatch = async (tId, mId, winnerNum) => {
    sound.click();
    setActionError('');
    try {
      const updated = await api.tournaments.simulateMatch(tId, mId, winnerNum);
      setSelectedTournament(updated);
      fetchTournaments();
    } catch (err) {
      setActionError(err.message || 'Failed to resolve match.');
    }
  };

  const handleCreateTournament = async (e) => {
    e.preventDefault();
    if (!user) {
      onOpenAuth();
      return;
    }
    if (!formTitle.trim()) {
      setActionError('Tournament title is required.');
      return;
    }
    sound.click();
    setCreating(true);
    setActionError('');
    try {
      const created = await api.tournaments.create({
        title: formTitle,
        description: formDescription,
        format: formFormat,
        bracket_size: parseInt(formBracketSize, 10),
        series_cycles: parseInt(formBracketSize, 10) === 3 ? parseInt(formSeriesCycles, 10) : 1,
        target_exam: formTargetExam,
        subject: formSubject,
        reward_type: formRewardType,
        real_life_reward: formRealLifeReward,
        claim_instructions: formClaimInstructions,
        rp_pool: parseInt(formRpPool, 10),
        question_count: parseInt(formQuestionCount, 10),
        time_per_question: parseInt(formTimePerQuestion, 10),
        passcode: formPasscode.trim() || null,
      });
      setCreateModalOpen(false);
      setSelectedTournament(created);
      fetchTournaments();
      // Reset form
      setFormTitle('');
      setFormDescription('');
      setFormRealLifeReward('');
      setFormClaimInstructions('');
      setFormPasscode('');
      setActionSuccess('Tournament created! Registration is now live.');
    } catch (err) {
      setActionError(err.message || 'Failed to create tournament.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 page-transition space-y-8">
      {/* Page Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold uppercase tracking-wider mb-2">
            <Trophy className="w-3.5 h-3.5 text-amber-400" />
            <span>Competitive Championship Circuits</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight flex items-center gap-3">
            <span>JEE Championship Tournaments</span>
            <span className="text-sm px-2.5 py-0.5 rounded-lg bg-orange-500/20 text-orange-400 font-mono font-bold border border-orange-500/30">
              PvP Brackets
            </span>
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-2xl">
            Multi-stage elimination brackets and arena grand prix. Compete in 1-on-1 knockout duels for in-game medals, RP rating pools, and real-life custom rewards!
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={fetchTournaments}
            className="p-3 bg-[#262c3c] hover:bg-[#2e364a] border border-white/10 rounded-2xl text-slate-300 hover:text-white transition cursor-pointer"
            title="Refresh list"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              if (!user) {
                onOpenAuth();
                return;
              }
              sound.click();
              setCreateModalOpen(true);
            }}
            className="px-5 py-3.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 hover:from-orange-400 hover:to-amber-400 text-white font-extrabold text-sm rounded-2xl transition shadow-lg shadow-orange-950/50 flex items-center gap-2 cursor-pointer glow-orange"
          >
            <Plus className="w-4 h-4 stroke-[3]" />
            <span>ORGANIZE TOURNAMENT</span>
          </button>
        </div>
      </div>

      {/* Status Messages */}
      {actionError && (
        <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center gap-3">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-200 text-xs flex items-center gap-3">
          <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Main View: Tournament Browser OR Bracket View */}
      {!selectedTournament ? (
        <div className="space-y-6">
          {/* Filter Bar */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {[
              { id: 'ALL', label: 'All Tournaments' },
              { id: 'REGISTRATION', label: '🟢 Open Registration' },
              { id: 'IN_PROGRESS', label: '⚡ Live in Progress' },
              { id: 'COMPLETED', label: '🏆 Hall of Champions' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  sound.click();
                  setFilter(tab.id);
                }}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap border ${
                  filter === tab.id
                    ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-950/40'
                    : 'bg-[#262c3c] text-slate-400 border-white/10 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tournament Cards List */}
          {loading ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              <div className="w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              Loading tournament circuits...
            </div>
          ) : tournaments.length === 0 ? (
            <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-12 text-center max-w-lg mx-auto">
              <Trophy className="w-12 h-12 text-amber-500/40 mx-auto mb-4" />
              <h3 className="text-base font-bold text-white mb-1">No Active Tournaments Found</h3>
              <p className="text-xs text-slate-400 mb-6">
                Be the first organizer to launch a tournament for your coaching batch, friends, or the entire JEE Rivals community!
              </p>
              <button
                type="button"
                onClick={() => {
                  if (!user) {
                    onOpenAuth();
                    return;
                  }
                  setCreateModalOpen(true);
                }}
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black text-xs rounded-xl shadow-lg shadow-orange-950/40 glow-orange"
              >
                ORGANIZE FIRST TOURNAMENT
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {tournaments.map((t) => {
                const isReg = t.status === 'REGISTRATION';
                const isLive = t.status === 'IN_PROGRESS';
                const isDone = t.status === 'COMPLETED';

                return (
                  <div
                    key={t.id}
                    onClick={() => handleOpenTournament(t.id)}
                    className={`bg-[#262c3c] border rounded-3xl p-6 transition flex flex-col justify-between cursor-pointer hover:scale-[1.01] shadow-xl group ${
                      isLive
                        ? 'border-orange-500/60 bg-gradient-to-b from-[#2a3042] to-[#202534] glow-orange-subtle'
                        : isDone
                        ? 'border-amber-500/30 bg-[#222838]'
                        : 'border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div>
                      {/* Top Badges */}
                      <div className="flex items-center justify-between gap-2 mb-3">
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black font-mono uppercase tracking-wider flex items-center gap-1.5 ${
                            isLive
                              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 animate-pulse'
                              : isReg
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${isLive ? 'bg-orange-400' : isReg ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                          {isLive ? `Live: Round ${t.current_round}` : isReg ? 'Registration Open' : 'Tournament Ended'}
                        </span>

                        <span className="text-[10px] font-mono font-bold text-slate-400">
                          {t.participant_count} / {t.bracket_size} Slots
                        </span>
                      </div>

                      {/* Title & Organizer */}
                      <h3 className="text-lg font-black text-white group-hover:text-orange-400 transition leading-snug">
                        {t.title}
                      </h3>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Organized by <span className="text-orange-400 font-bold">@{t.organizer_name}</span>
                      </p>

                      {/* Specs Tags */}
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        <span className="px-2 py-0.5 bg-[#1e2433] text-slate-300 rounded-md text-[10px] font-bold border border-white/5">
                          {t.target_exam === 'MAIN' ? 'JEE Main' : t.target_exam === 'ADVANCED' ? 'JEE Advanced' : 'Main & Advanced'}
                        </span>
                        <span className="px-2 py-0.5 bg-[#1e2433] text-slate-300 rounded-md text-[10px] font-bold border border-white/5">
                          {t.subject}
                        </span>
                        <span className="px-2 py-0.5 bg-[#1e2433] text-slate-300 rounded-md text-[10px] font-bold border border-white/5 font-mono">
                          {t.bracket_size === 3 ? '3 Players (Stepladder)' : `${t.bracket_size} Players (1v1)`}
                        </span>
                      </div>

                      {/* REWARD SECTION (USER REQUEST: Real life custom text or in game) */}
                      <div className="mt-4 p-3.5 rounded-2xl bg-[#1e2433] border border-white/10 space-y-2">
                        {t.real_life_reward ? (
                          <div className="flex items-start gap-2 text-amber-300">
                            <Gift className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                            <div>
                              <span className="text-[10px] font-mono uppercase font-black tracking-wider text-amber-400 block">
                                REAL LIFE REWARD
                              </span>
                              <span className="text-xs font-black text-amber-200 leading-tight block">
                                {t.real_life_reward}
                              </span>
                            </div>
                          </div>
                        ) : null}

                        <div className="flex items-center gap-2 text-slate-300 pt-1 border-t border-white/5 text-[11px] font-mono">
                          <Trophy className="w-3.5 h-3.5 text-orange-400" />
                          <span>Prize Pool: <strong className="text-white font-bold">{t.rp_pool} RP</strong> + Medals</span>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Action Footer */}
                    <div className="mt-5 pt-3 border-t border-white/10 flex items-center justify-between text-xs font-bold text-orange-400 group-hover:translate-x-1 transition-transform">
                      <span>{isReg ? 'View Bracket & Join' : isLive ? 'Enter Live Circuit' : 'View Champion Podium'}</span>
                      <ChevronRight className="w-4 h-4" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Detailed View for Selected Tournament */
        <div className="space-y-6">
          {/* Back button */}
          <button
            type="button"
            onClick={() => {
              sound.click();
              setSelectedTournament(null);
              fetchTournaments();
            }}
            className="px-4 py-2 rounded-xl bg-[#262c3c] hover:bg-[#2e364a] border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer flex items-center gap-2"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to All Tournaments</span>
          </button>

          {/* Tournament Overview Card */}
          <div className="bg-[#262c3c] border border-orange-500/40 rounded-3xl p-6 sm:p-8 shadow-xl glow-orange-subtle">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-white/10">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <span
                    className={`px-3 py-1 rounded-full text-[10px] font-black font-mono uppercase tracking-wider ${
                      selectedTournament.status === 'IN_PROGRESS'
                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 animate-pulse'
                        : selectedTournament.status === 'REGISTRATION'
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                    }`}
                  >
                    {selectedTournament.status === 'IN_PROGRESS'
                      ? `Round ${selectedTournament.current_round} of ${selectedTournament.total_rounds}`
                      : selectedTournament.status === 'REGISTRATION'
                      ? 'Registration Stage'
                      : 'Tournament Completed'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    Target: {selectedTournament.target_exam} • {selectedTournament.subject}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">{selectedTournament.title}</h2>
                <p className="text-xs text-slate-400 mt-1">
                  Organized by <strong className="text-orange-400">@{selectedTournament.organizer_name}</strong>
                  {selectedTournament.description && ` — ${selectedTournament.description}`}
                </p>
              </div>

              {/* Tournament CTA Buttons */}
              <div className="flex items-center gap-3 flex-wrap">
                {selectedTournament.status === 'REGISTRATION' && (
                  <>
                    {!selectedTournament.is_registered ? (
                      <button
                        type="button"
                        onClick={() => handleJoinTournament(selectedTournament.id)}
                        className="px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-sm rounded-2xl shadow-lg transition cursor-pointer"
                      >
                        REGISTER NOW ({selectedTournament.participant_count}/{selectedTournament.bracket_size})
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="px-4 py-2.5 bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold font-mono">
                          ✓ You are Registered
                        </span>
                        {!selectedTournament.is_organizer && (
                          <button
                            type="button"
                            onClick={() => handleLeaveTournament(selectedTournament.id)}
                            className="px-3 py-2 border border-red-500/40 hover:bg-red-950/40 text-red-300 rounded-xl text-xs font-bold transition cursor-pointer"
                          >
                            Withdraw
                          </button>
                        )}
                      </div>
                    )}

                    {selectedTournament.is_organizer && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartTournament(selectedTournament.id)}
                          className="px-6 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm rounded-2xl shadow-xl transition cursor-pointer glow-orange"
                        >
                          LAUNCH TOURNAMENT
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            {/* PRIZES & REWARDS BANNER (REAL LIFE CUSTOM TEXT) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
              {selectedTournament.real_life_reward && (
                <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-950/40 to-orange-950/40 border border-amber-500/40 flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 shrink-0">
                    <Gift className="w-5 h-5" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-black uppercase text-amber-400 tracking-wider block">
                      REAL LIFE TOURNAMENT PRIZE
                    </span>
                    <span className="text-sm font-black text-white block mt-0.5">
                      {selectedTournament.real_life_reward}
                    </span>
                    {selectedTournament.claim_instructions && (
                      <span className="text-[11px] text-slate-300 mt-1 block leading-relaxed font-mono">
                        Claim Info: {selectedTournament.claim_instructions}
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-[#1e2433] border border-white/10 flex items-start gap-3">
                <div className="p-2.5 rounded-xl bg-orange-500/20 border border-orange-500/40 text-orange-400 shrink-0">
                  <Trophy className="w-5 h-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-black uppercase text-orange-400 tracking-wider block">
                    IN-GAME RATING REWARDS
                  </span>
                  <div className="text-xs font-bold text-white mt-0.5 space-y-0.5">
                    <div>🥇 1st Place: {Math.round(selectedTournament.rp_pool * 0.7)} RP + Gold Medal + Champion Title</div>
                    <div>🥈 2nd Place: {Math.round(selectedTournament.rp_pool * 0.3)} RP + Silver Medal</div>
                  </div>
                </div>
              </div>
            </div>

            {/* ACTIVE USER MATCH ALERT CALL-TO-ACTION */}
            {selectedTournament.user_active_match && (
              <div className="mt-6 p-5 rounded-2xl bg-gradient-to-r from-orange-600 via-amber-600 to-orange-600 text-white shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-pulse">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-white/20 rounded-xl">
                    <Swords className="w-6 h-6 fill-current" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono uppercase font-black tracking-wider block text-orange-100">
                      YOUR ROUND {selectedTournament.current_round} MATCH IS READY!
                    </span>
                    <h3 className="text-base font-black">
                      {selectedTournament.user_active_match.player1_name} vs {selectedTournament.user_active_match.player2_name}
                    </h3>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleEnterMatch(selectedTournament.user_active_match.room_code)}
                  className="px-6 py-3 bg-white text-orange-600 font-black text-sm rounded-xl hover:bg-slate-100 transition shadow-lg cursor-pointer whitespace-nowrap"
                >
                  ENTER 1-ON-1 DUEL ARENA ⚡
                </button>
              </div>
            )}
          </div>

          {/* CHAMPION PODIUM CEREMONY (IF COMPLETED) */}
          {selectedTournament.status === 'COMPLETED' && selectedTournament.winner && (
            <div className="bg-gradient-to-b from-amber-950/40 to-[#262c3c] border border-amber-500/50 rounded-3xl p-8 text-center shadow-2xl glow-amber">
              <Crown className="w-12 h-12 text-amber-400 mx-auto mb-2 animate-bounce" />
              <span className="text-xs font-mono font-black text-amber-400 uppercase tracking-widest block">
                TOURNAMENT CHAMPION CROWNED
              </span>
              <h2 className="text-3xl font-black text-white mt-1">
                @{selectedTournament.winner.username}
              </h2>
              <p className="text-xs text-amber-200 mt-1 font-mono">
                {selectedTournament.winner.title} • {selectedTournament.winner.overall_elo} ELO
              </p>

              {selectedTournament.real_life_reward && (
                <div className="mt-6 max-w-md mx-auto p-4 rounded-2xl bg-black/40 border border-amber-500/40 text-left">
                  <span className="text-[10px] font-mono text-amber-400 uppercase font-black block">
                    🎁 REAL LIFE PRIZE CLAIM
                  </span>
                  <span className="text-sm font-bold text-white block mt-0.5">
                    {selectedTournament.real_life_reward}
                  </span>
                  {selectedTournament.claim_instructions && (
                    <span className="text-xs text-slate-300 mt-2 block font-mono">
                      Organizer Instructions: {selectedTournament.claim_instructions}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* VISUAL CONNECTED TOURNAMENT BRACKET TREE */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <Swords className="w-5 h-5 text-orange-400" />
                  <span>Championship Bracket Progress Tree</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Live interactive diagram showing round progression, top-seed byes, and duel advancements to the championship apex.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="px-3 py-1 rounded-full bg-[#1e2433] text-orange-400 border border-orange-500/30 text-xs font-mono font-bold">
                  {selectedTournament.bracket_size === 3
                    ? '3-Player Stepladder Gauntlet'
                    : `${selectedTournament.bracket_size}-Player Single Elimination`}
                </span>
                <span className="px-3 py-1 rounded-full bg-[#1e2433] text-slate-300 border border-white/10 text-xs font-mono">
                  {selectedTournament.status === 'IN_PROGRESS'
                    ? `Round ${selectedTournament.current_round} / ${selectedTournament.total_rounds}`
                    : selectedTournament.status === 'COMPLETED'
                    ? 'Champion Crowned'
                    : 'Registration Stage'}
                </span>
              </div>
            </div>

            {/* TREE DIAGRAM CANVAS */}
            <div className="overflow-x-auto pb-4 pt-2 scrollbar-thin">
              <div className="min-w-fit flex items-center justify-start gap-4 p-5 rounded-3xl bg-[#171b26]/90 border border-white/5 relative">
                
                {/* 1. THREE-PLAYER MULTI-SERIES ROUND-ROBIN LEAGUE */}
                {selectedTournament.bracket_size === 3 ? (
                  <div className="w-full space-y-6 py-2">
                    {/* LEAGUE POINTS TABLE & STANDINGS */}
                    <div className="bg-[#1b212f] border border-orange-500/30 rounded-3xl p-5 shadow-2xl">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-4 border-b border-white/10">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-black uppercase tracking-wider text-orange-400 font-mono flex items-center gap-1.5">
                              <Trophy className="w-4 h-4 text-orange-400" />
                              3-Player League Points Table
                            </span>
                            <span className="px-2 py-0.5 rounded-full bg-orange-500/20 text-orange-300 font-mono text-[10px] font-bold border border-orange-500/30">
                              {selectedTournament.series_cycles || 1} Cycles • {(selectedTournament.series_cycles || 1) * 3} Total Duels
                            </span>
                          </div>
                          <p className="text-slate-400 text-xs mt-1">
                            Scoring Matrix: <strong>Win = 3 Pts</strong> • <strong>Draw = 1 Pt</strong> • <strong>Loss = 0 Pts</strong> • <strong>Accuracy Bonus (&gt;80%) = +1 Pt</strong>
                          </p>
                        </div>
                        {selectedTournament.is_tied && (
                          <div className="px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold font-mono flex items-center gap-2 animate-pulse">
                            <Sparkles className="w-4 h-4 text-amber-400" />
                            <span>Tie Detected • Shootout Required</span>
                          </div>
                        )}
                      </div>

                      {/* Standings Table */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs font-mono">
                          <thead>
                            <tr className="border-b border-white/10 text-slate-400 text-[11px] uppercase tracking-wider">
                              <th className="py-2.5 px-3 font-bold">Rank</th>
                              <th className="py-2.5 px-3 font-bold">Aspirant Callsign</th>
                              <th className="py-2.5 px-2 text-center font-bold">P</th>
                              <th className="py-2.5 px-2 text-center font-bold text-emerald-400">W</th>
                              <th className="py-2.5 px-2 text-center font-bold text-slate-300">D</th>
                              <th className="py-2.5 px-2 text-center font-bold text-red-400">L</th>
                              <th className="py-2.5 px-3 text-right font-bold">Marks (+/-)</th>
                              <th className="py-2.5 px-3 text-right font-bold">Net Diff (Δ)</th>
                              <th className="py-2.5 px-2 text-center font-bold text-amber-400">Bonus</th>
                              <th className="py-2.5 px-4 text-right font-black text-orange-400 text-sm">Points</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {(selectedTournament.standings || []).map((row, idx) => {
                              const isCurrentUser = user && user.id === row.user_id;
                              const rankMedal =
                                row.rank === 1
                                  ? '🥇'
                                  : row.rank === 2
                                  ? '🥈'
                                  : row.rank === 3
                                  ? '🥉'
                                  : `#${row.rank}`;
                              return (
                                <tr
                                  key={row.user_id}
                                  className={`transition ${
                                    isCurrentUser
                                      ? 'bg-orange-500/10 font-bold'
                                      : idx === 0
                                      ? 'bg-amber-500/5'
                                      : 'hover:bg-white/5'
                                  }`}
                                >
                                  <td className="py-3 px-3 font-black text-sm">
                                    <span className="flex items-center gap-1.5">
                                      <span>{rankMedal}</span>
                                      <span className="text-slate-400 text-xs">#{row.rank}</span>
                                    </span>
                                  </td>
                                  <td className="py-3 px-3">
                                    <div className="flex items-center gap-2">
                                      <span className="text-base">{row.avatar_id === 'flame' ? '🔥' : row.avatar_id === 'atom' ? '⚛️' : '⚡'}</span>
                                      <div>
                                        <span className="text-white font-bold block truncate max-w-[160px]">
                                          {row.username} {isCurrentUser && <span className="text-orange-400 text-[10px]">(You)</span>}
                                        </span>
                                        <span className="text-[10px] text-slate-400 block font-normal">
                                          {row.overall_elo} Elo • {row.title}
                                        </span>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-2 text-center text-slate-300 font-bold">{row.played}</td>
                                  <td className="py-3 px-2 text-center text-emerald-400 font-black">{row.won}</td>
                                  <td className="py-3 px-2 text-center text-slate-400">{row.drawn}</td>
                                  <td className="py-3 px-2 text-center text-red-400">{row.lost}</td>
                                  <td className="py-3 px-3 text-right text-slate-300">
                                    {Math.round(row.marks_for)} / {Math.round(row.marks_against)}
                                  </td>
                                  <td className={`py-3 px-3 text-right font-black ${
                                    row.diff > 0 ? 'text-emerald-400' : row.diff < 0 ? 'text-red-400' : 'text-slate-400'
                                  }`}>
                                    {row.diff > 0 ? `+${row.diff}` : row.diff}
                                  </td>
                                  <td className="py-3 px-2 text-center text-amber-400 font-bold">
                                    {row.bonus_points > 0 ? `+${row.bonus_points}` : '0'}
                                  </td>
                                  <td className="py-3 px-4 text-right font-black text-orange-400 text-base">
                                    {row.points}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* SUDDEN-DEATH BLITZ SHOOTOUT BANNER (IF ACTIVE) */}
                    {(() => {
                      const tbMatch = (selectedTournament.matches || []).find((m) => m.is_tiebreaker === 1);
                      if (!tbMatch) return null;
                      const isReady = tbMatch.status === 'READY';
                      const isLive = tbMatch.status === 'IN_PROGRESS';
                      const isFinished = tbMatch.status === 'COMPLETED';
                      const canPlay = (isReady || isLive) && user && (user.id === tbMatch.player1_id || user.id === tbMatch.player2_id);

                      return (
                        <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500/20 via-[#272118] to-orange-500/20 border-2 border-amber-500/60 shadow-2xl glow-amber animate-in fade-in">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded-2xl bg-amber-500/30 text-amber-300 border border-amber-500/50 flex items-center justify-center font-black text-xl shrink-0">
                                ⚡
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono font-black text-amber-400 uppercase tracking-wider">
                                    SUDDEN-DEATH TIEBREAKER SHOOTOUT
                                  </span>
                                  <span className="px-2 py-0.5 rounded-full bg-amber-500/30 text-amber-200 text-[10px] font-bold font-mono">
                                    3-Question Rapid Blitz
                                  </span>
                                </div>
                                <h3 className="text-base font-black text-white mt-0.5">
                                  {tbMatch.player1_name || 'Contender #1'} vs {tbMatch.player2_name || 'Contender #2'}
                                </h3>
                                <p className="text-xs text-amber-200/80 mt-0.5">
                                  Identical league points and differential! The victor of this rapid shootout claims the Tournament Championship Gold.
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              {isFinished && tbMatch.winner_name && (
                                <div className="px-3 py-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold font-mono">
                                  🏆 Shootout Winner: {tbMatch.winner_name}
                                </div>
                              )}
                              {canPlay && (
                                <button
                                  type="button"
                                  onClick={() => handleEnterMatch(tbMatch.room_code)}
                                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-black text-xs transition cursor-pointer flex items-center gap-2 shadow-lg shadow-amber-950/50 hover:brightness-110"
                                >
                                  <Play className="w-4 h-4 fill-current" />
                                  <span>ENTER BLITZ SHOOTOUT ⚡</span>
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* MULTI-SERIES MATCH SCHEDULE MATRIX */}
                    <div>
                      <div className="flex items-center justify-between mb-3 px-1">
                        <span className="text-xs font-black text-white uppercase tracking-wider font-mono flex items-center gap-1.5">
                          <Swords className="w-3.5 h-3.5 text-orange-400" />
                          Series Clash Schedule (Round-Robin Duels)
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          Current Cycle: {selectedTournament.current_round} of {selectedTournament.total_rounds}
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                        {(selectedTournament.matches || [])
                          .filter((m) => m.is_tiebreaker !== 1)
                          .map((m, mIdx) => {
                            const isFinished = m.status === 'COMPLETED';
                            const isReady = m.status === 'READY';
                            const isLive = m.status === 'IN_PROGRESS';
                            const p1Won = m.winner_id && m.winner_id === m.player1_id;
                            const p2Won = m.winner_id && m.winner_id === m.player2_id;
                            const isDraw = isFinished && !m.winner_id;
                            const canPlay = (isReady || isLive) && user && (user.id === m.player1_id || user.id === m.player2_id);

                            return (
                              <div
                                key={m.id || mIdx}
                                className={`rounded-2xl border transition p-3.5 ${
                                  isFinished
                                    ? 'bg-[#1e2433] border-white/10'
                                    : isReady || isLive
                                    ? 'bg-gradient-to-b from-[#242b3b] to-[#1a1f2b] border-orange-500/60 shadow-lg glow-orange-subtle ring-1 ring-orange-500/40'
                                    : 'bg-[#161a24]/90 border-white/5 opacity-70'
                                }`}
                              >
                                <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-[10px] font-mono">
                                  <span className="font-bold text-slate-300">
                                    Cycle {m.cycle_index || m.round_number} • Duel #{(m.match_index % 3) + 1}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                                      isFinished
                                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                        : isLive
                                        ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 animate-pulse'
                                        : isReady
                                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                        : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {isFinished ? (isDraw ? 'Drawn' : 'Completed') : isLive ? 'Live Duel' : isReady ? 'Ready' : 'Pending'}
                                  </span>
                                </div>

                                {/* Player 1 */}
                                <div className={`flex items-center justify-between p-2 rounded-xl text-xs mb-1.5 ${
                                  p1Won ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 font-bold' : 'bg-[#151922] text-slate-300'
                                }`}>
                                  <span className="truncate max-w-[130px]">{m.player1_name || 'Player 1'}</span>
                                  <span className="font-mono font-black">{m.player1_score || 0} pts</span>
                                </div>

                                {/* Player 2 */}
                                <div className={`flex items-center justify-between p-2 rounded-xl text-xs ${
                                  p2Won ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30 font-bold' : 'bg-[#151922] text-slate-300'
                                }`}>
                                  <span className="truncate max-w-[130px]">{m.player2_name || 'Player 2'}</span>
                                  <span className="font-mono font-black">{m.player2_score || 0} pts</span>
                                </div>

                                {/* Action Buttons */}
                                {canPlay && (
                                  <button
                                    type="button"
                                    onClick={() => handleEnterMatch(m.room_code)}
                                    className="w-full mt-2.5 py-2 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-black rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md shadow-orange-950/40"
                                  >
                                    <Play className="w-3.5 h-3.5 fill-current" />
                                    <span>PLAY DUEL NOW ⚔️</span>
                                  </button>
                                )}

                                {selectedTournament.is_organizer && !isFinished && isReady && (
                                  <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                                    <span>Organizer Action:</span>
                                    <div className="flex gap-1">
                                      <button
                                        type="button"
                                        onClick={() => handleSimulateMatch(selectedTournament.id, m.id, 1)}
                                        className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-white"
                                      >
                                        P1 Win
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSimulateMatch(selectedTournament.id, m.id, 2)}
                                        className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-white"
                                      >
                                        P2 Win
                                      </button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* 2. BINARY KNOCKOUT ELIMINATION TREE (4, 8, 16 PLAYERS) */
                  <div className="flex items-center gap-0 py-4">
                    {selectedTournament.rounds && selectedTournament.rounds.length > 0 ? (
                      selectedTournament.rounds.map((rnd, rIdx) => {
                        const roundLabel =
                          rnd.round_number === selectedTournament.total_rounds
                            ? '🏆 Grand Finals'
                            : rnd.round_number === selectedTournament.total_rounds - 1
                            ? '⚡ Semifinals'
                            : `Round ${rnd.round_number} (Quarterfinals)`;
                        const isLastRound = rnd.round_number === selectedTournament.total_rounds;

                        return (
                          <React.Fragment key={rnd.round_number}>
                            {/* ROUND COLUMN */}
                            <div className="flex flex-col justify-around gap-6 w-72 sm:w-80 shrink-0">
                              <div className="text-center pb-2 border-b border-white/10">
                                <span className="text-xs font-black text-white uppercase tracking-wider font-mono block">
                                  {roundLabel}
                                </span>
                                <span className="text-[10px] text-slate-400 font-mono">
                                  {rnd.matches.length} {rnd.matches.length === 1 ? 'Duel' : 'Duels'}
                                </span>
                              </div>

                              <div className="space-y-4">
                                {rnd.matches.map((m) => {
                                  const p1Won = m.winner_id && m.winner_id === m.player1_id;
                                  const p2Won = m.winner_id && m.winner_id === m.player2_id;
                                  const isFinished = m.status === 'COMPLETED';
                                  const isReady = m.status === 'READY';
                                  const isLive = m.status === 'IN_PROGRESS';
                                  const canPlay = (isReady || isLive) && user && (user.id === m.player1_id || user.id === m.player2_id);

                                  return (
                                    <div
                                      key={m.id}
                                      className={`rounded-2xl border p-4 transition ${
                                        isFinished
                                          ? 'bg-[#1e2433] border-emerald-500/30'
                                          : isReady || isLive
                                          ? 'bg-gradient-to-b from-[#252c3e] to-[#1c212e] border-orange-500/60 shadow-xl glow-orange-subtle ring-1 ring-orange-500/30'
                                          : 'bg-[#181c26]/90 border-white/5 opacity-75'
                                      }`}
                                    >
                                      {/* Match Header */}
                                      <div className="flex items-center justify-between pb-2 mb-2 border-b border-white/10 text-[10px] font-mono">
                                        <span className="font-black text-slate-300 uppercase tracking-wider flex items-center gap-1">
                                          <Swords className="w-3 h-3 text-orange-400" />
                                          <span>Match {m.match_index + 1}</span>
                                        </span>
                                        <span
                                          className={`px-2 py-0.5 rounded-full font-bold flex items-center gap-1 ${
                                            isFinished
                                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                              : isLive
                                              ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40 animate-pulse'
                                              : isReady
                                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                              : 'bg-slate-800 text-slate-400'
                                          }`}
                                        >
                                          <span className={`w-1.5 h-1.5 rounded-full ${
                                            isFinished ? 'bg-emerald-400' : isLive ? 'bg-orange-400' : isReady ? 'bg-blue-400' : 'bg-slate-500'
                                          }`} />
                                          {isFinished ? 'Completed' : isLive ? 'Live Duel' : isReady ? 'Ready' : 'Pending'}
                                        </span>
                                      </div>

                                      {/* Player 1 */}
                                      <div className={`flex items-center justify-between p-2 rounded-xl ${
                                        p1Won ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-black' : 'text-slate-300'
                                      }`}>
                                        <div className="flex items-center gap-2 truncate">
                                          <div className={`w-6 h-6 rounded-md flex items-center justify-center font-black text-[10px] ${
                                            p1Won ? 'bg-amber-500 text-black' : 'bg-white/10 text-slate-400'
                                          }`}>
                                            P1
                                          </div>
                                          <span className="truncate text-xs font-bold flex items-center gap-1">
                                            {p1Won && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                                            {m.player1_name || 'TBD Contender'}
                                          </span>
                                        </div>
                                        <span className="font-mono text-xs font-black">
                                          {isFinished ? `${m.player1_score ?? 0} pts` : '-'}
                                        </span>
                                      </div>

                                      <div className="relative my-1 text-center">
                                        <span className="px-2 py-0.5 rounded-full bg-[#181c26] text-[9px] font-mono font-bold text-slate-500 border border-white/5">
                                          VS
                                        </span>
                                      </div>

                                      {/* Player 2 */}
                                      <div className={`flex items-center justify-between p-2 rounded-xl ${
                                        p2Won ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40 font-black' : 'text-slate-300'
                                      }`}>
                                        <div className="flex items-center gap-2 truncate">
                                          <div className={`w-6 h-6 rounded-md flex items-center justify-center font-black text-[10px] ${
                                            p2Won ? 'bg-amber-500 text-black' : 'bg-white/10 text-slate-400'
                                          }`}>
                                            P2
                                          </div>
                                          <span className="truncate text-xs font-bold flex items-center gap-1">
                                            {p2Won && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                                            {m.player2_name || (m.status === 'READY' ? 'TBD Contender' : 'Awaiting Winner')}
                                          </span>
                                        </div>
                                        <span className="font-mono text-xs font-black">
                                          {isFinished ? `${m.player2_score ?? 0} pts` : '-'}
                                        </span>
                                      </div>

                                      {/* Match action buttons */}
                                      {canPlay && (
                                        <button
                                          type="button"
                                          onClick={() => handleEnterMatch(m.room_code)}
                                          className="w-full mt-2.5 py-2.5 bg-gradient-to-r from-orange-500 via-amber-500 to-orange-500 text-white font-black rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-lg shadow-orange-950/40 glow-orange"
                                        >
                                          <Play className="w-3.5 h-3.5 fill-current" />
                                          <span>ENTER MATCH ARENA ⚡</span>
                                        </button>
                                      )}

                                      {selectedTournament.is_organizer && !isFinished && isReady && (
                                        <div className="mt-2 pt-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-400">
                                          <span>Organizer Advance:</span>
                                          <div className="flex gap-1">
                                            <button
                                              type="button"
                                              onClick={() => handleSimulateMatch(selectedTournament.id, m.id, 1)}
                                              className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-white"
                                            >
                                              P1 Win
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() => handleSimulateMatch(selectedTournament.id, m.id, 2)}
                                              className="px-2 py-0.5 bg-slate-700 hover:bg-slate-600 rounded text-white"
                                            >
                                              P2 Win
                                            </button>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>

                            {/* BRACKET CONNECTOR STEMS BETWEEN ROUNDS */}
                            {!isLastRound && (
                              <div className="w-12 sm:w-16 flex items-center justify-center shrink-0">
                                <svg className="w-full h-24 overflow-visible" viewBox="0 0 50 100" preserveAspectRatio="none">
                                  <path d="M 0,25 H 25 V 50 H 50" fill="none" stroke="#475569" strokeWidth="2" />
                                  <path d="M 0,75 H 25 V 50 H 50" fill="none" stroke="#475569" strokeWidth="2" />
                                </svg>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })
                    ) : (
                      /* Preview tree when in registration stage */
                      <div className="p-8 text-center text-slate-400 text-xs w-full">
                        Bracket matchups will generate automatically when the tournament organizer launches the tournament!
                      </div>
                    )}

                    {/* CONNECTOR FROM FINALS TO PODIUM */}
                    <div className="w-12 sm:w-16 h-12 flex items-center justify-center shrink-0">
                      <svg className="w-full h-8 overflow-visible" viewBox="0 0 60 20" preserveAspectRatio="none">
                        <path
                          d="M 0,10 H 60"
                          fill="none"
                          stroke={selectedTournament.status === 'COMPLETED' ? '#f59e0b' : '#475569'}
                          strokeWidth="3"
                        />
                      </svg>
                    </div>

                    {/* PODIUM CEREMONY */}
                    <div className="shrink-0 w-72 sm:w-80 rounded-3xl border p-6 text-center flex flex-col justify-center items-center bg-gradient-to-b from-amber-500/20 via-[#262c3c] to-[#1c2230] border-amber-500/50 shadow-2xl">
                      <div className="p-3.5 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-300 mb-3">
                        <Crown className={`w-8 h-8 ${selectedTournament.status === 'COMPLETED' ? 'animate-bounce text-amber-300' : 'text-amber-500/70'}`} />
                      </div>
                      <span className="text-[11px] font-mono font-black text-amber-400 uppercase tracking-widest block">
                        {selectedTournament.status === 'COMPLETED' ? '🏆 TOURNAMENT CHAMPION' : 'CHAMPION APEX'}
                      </span>
                      {selectedTournament.status === 'COMPLETED' && selectedTournament.winner ? (
                        <div className="mt-2 space-y-1 w-full">
                          <h4 className="text-xl font-black text-white truncate">
                            @{selectedTournament.winner.username}
                          </h4>
                          <span className="text-xs text-amber-300 font-mono block">
                            {selectedTournament.winner.title || 'Champion'} • {selectedTournament.winner.overall_elo} ELO
                          </span>
                          <div className="mt-3 px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-xs font-bold text-amber-200 font-mono">
                            +{Math.round((selectedTournament.rp_pool || 500) * 0.7)} RP Awarded!
                          </div>
                        </div>
                      ) : (
                        <div className="mt-2 text-xs text-slate-400 space-y-1">
                          <span className="text-white font-bold block">Awaiting Grand Finals</span>
                          <span className="text-[11px] font-mono block text-amber-400">
                            Prize: {selectedTournament.rp_pool} RP + Medals
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* PARTICIPANTS ROSTER TABLE */}
          <div className="bg-[#262c3c] border border-white/10 rounded-3xl p-6 shadow-xl">
            <h3 className="text-base font-black text-white mb-4 flex items-center gap-2">
              <Users className="w-4 h-4 text-orange-400" />
              <span>Registered Contenders ({selectedTournament.participants?.length || 0})</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {selectedTournament.participants?.map((p) => (
                <div
                  key={p.user_id}
                  className="p-3 rounded-2xl bg-[#1e2433] border border-white/5 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-xl bg-orange-950/80 border border-orange-500/40 flex items-center justify-center font-bold text-xs text-orange-400">
                    #{p.seed}
                  </div>
                  <div className="truncate">
                    <span className="font-bold text-xs text-white block truncate">{p.username}</span>
                    <span className="text-[10px] text-slate-400 font-mono block">{p.overall_elo || 1200} ELO</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ORGANIZE TOURNAMENT MODAL */}
      {createModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#262c3c] border border-orange-500/40 rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl glow-orange-subtle my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-6">
              <div>
                <h2 className="text-xl font-black text-white flex items-center gap-2">
                  <Trophy className="w-5 h-5 text-amber-400" />
                  <span>Organize Tournament Circuit</span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Set custom real-life prizes, bracket size, syllabus, and invite peers to duel.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateModalOpen(false)}
                className="p-2 text-slate-400 hover:text-white rounded-xl bg-white/5"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateTournament} className="space-y-5">
              {/* Tournament Title */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Tournament Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kota Sunday Mechanics Championship 2026"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full px-4 py-3 bg-[#1e2433] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Tournament Description */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Description & Coaching / Batch Info</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Open to all Allen / Resonance / FIITJEE batch students. Knockout elimination format."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full px-4 py-3 bg-[#1e2433] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Bracket Size & Format */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">Bracket Size (Tournament Format)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {[
                      { sz: 3, label: '3 Players', sub: 'Stepladder' },
                      { sz: 4, label: '4 Players', sub: 'Semifinals' },
                      { sz: 8, label: '8 Players', sub: 'Quarterfinals' },
                      { sz: 16, label: '16 Players', sub: 'Full Circuit' },
                    ].map((item) => (
                      <button
                        key={item.sz}
                        type="button"
                        onClick={() => setFormBracketSize(item.sz)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition cursor-pointer border text-center ${
                          formBracketSize === item.sz
                            ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-950/40'
                            : 'bg-[#1e2433] text-slate-400 border-white/10 hover:text-white'
                        }`}
                      >
                        <div className="font-mono font-black">{item.label}</div>
                        <div className="text-[10px] opacity-75 font-normal">{item.sub}</div>
                      </button>
                    ))}
                  </div>
                  {formBracketSize === 3 && (
                    <div className="mt-3 p-3.5 rounded-2xl bg-gradient-to-r from-orange-500/15 via-[#232a3b] to-[#1c2230] border border-orange-500/30 text-xs text-orange-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                          <Swords className="w-4 h-4 text-orange-400" /> Multi-Series Cycles (K)
                        </span>
                        <span className="font-mono text-orange-300 font-black bg-orange-950/80 px-2.5 py-1 rounded-lg border border-orange-500/40 text-xs shadow-inner">
                          {formSeriesCycles} Cycles = {formSeriesCycles * 3} Total Duels
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 leading-relaxed">
                        Every aspirant clashes against each other in structured cycles. Standings tracked via Isolated Points Table (Win: 3, Draw: 1, Loss: 0, Bonus: +1). Sudden-death blitz shootout resolves ties!
                      </p>
                      <div className="flex items-center gap-3 pt-1">
                        <span className="text-[11px] text-slate-400 font-mono font-bold">1 Cycle (3 Duels)</span>
                        <input
                          type="range"
                          min="1"
                          max="9"
                          step="1"
                          value={formSeriesCycles}
                          onChange={(e) => setFormSeriesCycles(parseInt(e.target.value, 10))}
                          className="flex-1 accent-orange-500 cursor-pointer h-2 bg-slate-700 rounded-lg"
                        />
                        <span className="text-[11px] text-slate-400 font-mono font-bold">9 Cycles (27 Duels)</span>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1.5">Target Examination</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'MAIN', label: 'JEE Main' },
                      { id: 'ADVANCED', label: 'Advanced' },
                      { id: 'MIXED', label: 'Mixed' }
                    ].map((ex) => (
                      <button
                        key={ex.id}
                        type="button"
                        onClick={() => setFormTargetExam(ex.id)}
                        className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                          formTargetExam === ex.id
                            ? 'bg-orange-500 text-white border-orange-500'
                            : 'bg-[#1e2433] text-slate-400 border-white/10 hover:text-white'
                        }`}
                      >
                        {ex.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Subject Selection */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">Syllabus / Subject Focus</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Full Syllabus', 'Physics', 'Chemistry', 'Mathematics'].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormSubject(s)}
                      className={`py-2 rounded-xl text-xs font-bold transition cursor-pointer border ${
                        formSubject === s
                          ? 'bg-orange-500 text-white border-orange-500'
                          : 'bg-[#1e2433] text-slate-400 border-white/10 hover:text-white'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* REWARD TYPE SELECTOR (USER REQUEST: Real life custom text or in game) */}
              <div className="p-4 rounded-2xl bg-[#1e2433] border border-amber-500/30 space-y-4">
                <div>
                  <label className="text-xs font-black text-amber-300 block mb-1.5 uppercase font-mono">
                    Reward Configuration
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: 'REAL_LIFE', label: '🎁 Real Life Prize' },
                      { id: 'IN_GAME', label: '🏆 In-Game RP' },
                      { id: 'HYBRID', label: '⚡ Hybrid (Both)' }
                    ].map((rw) => (
                      <button
                        key={rw.id}
                        type="button"
                        onClick={() => setFormRewardType(rw.id)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold transition cursor-pointer border truncate ${
                          formRewardType === rw.id
                            ? 'bg-amber-500 text-black border-amber-500 font-black'
                            : 'bg-[#262c3c] text-slate-300 border-white/10 hover:text-white'
                        }`}
                      >
                        {rw.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Text Field for Real Life Reward */}
                {(formRewardType === 'REAL_LIFE' || formRewardType === 'HYBRID') && (
                  <div className="space-y-3 pt-2 border-t border-white/10">
                    <div>
                      <label className="text-xs font-bold text-amber-200 block mb-1">
                        Real-Life Prize Description (Custom Text Field)
                      </label>
                      <input
                        type="text"
                        required={formRewardType === 'REAL_LIFE' || formRewardType === 'HYBRID'}
                        placeholder="e.g. ₹500 Amazon Gift Voucher / HC Verma Book / Treat at Coaching Canteen"
                        value={formRealLifeReward}
                        onChange={(e) => setFormRealLifeReward(e.target.value)}
                        className="w-full px-4 py-2.5 bg-[#262c3c] border border-amber-500/40 rounded-xl text-xs text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-300 block mb-1">
                        Winner Claim Instructions (Contact Info)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. Winner please DM @username on Telegram / WhatsApp with your room code screenshot"
                        value={formClaimInstructions}
                        onChange={(e) => setFormClaimInstructions(e.target.value)}
                        className="w-full px-4 py-2.5 bg-[#262c3c] border border-white/10 rounded-xl text-xs text-white focus:outline-none focus:border-orange-500"
                      />
                    </div>
                  </div>
                )}

                {/* In-Game RP Pool */}
                {(formRewardType === 'IN_GAME' || formRewardType === 'HYBRID') && (
                  <div className="pt-2 border-t border-white/10">
                    <label className="text-xs font-bold text-slate-300 block mb-1">
                      In-Game RP Prize Pool (Awarded 70% to Winner, 30% to Runner-up)
                    </label>
                    <div className="grid grid-cols-4 gap-2">
                      {[500, 1000, 2500, 5000].map((rp) => (
                        <button
                          key={rp}
                          type="button"
                          onClick={() => setFormRpPool(rp)}
                          className={`py-1.5 rounded-xl text-xs font-mono font-bold border transition cursor-pointer ${
                            formRpPool === rp
                              ? 'bg-orange-500 text-white border-orange-500'
                              : 'bg-[#262c3c] text-slate-400 border-white/10'
                          }`}
                        >
                          {rp} RP
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Match Timing & Questions */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Questions / Duel</label>
                  <select
                    value={formQuestionCount}
                    onChange={(e) => setFormQuestionCount(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1e2433] border border-white/10 rounded-xl text-xs text-white"
                  >
                    <option value={3}>3 Questions (Blitz)</option>
                    <option value={5}>5 Questions (Standard)</option>
                    <option value={8}>8 Questions (Medium)</option>
                    <option value={10}>10 Questions (Deep)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-300 block mb-1">Time / Question</label>
                  <select
                    value={formTimePerQuestion}
                    onChange={(e) => setFormTimePerQuestion(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1e2433] border border-white/10 rounded-xl text-xs text-white"
                  >
                    <option value={45}>45 Seconds</option>
                    <option value={60}>60 Seconds</option>
                    <option value={90}>90 Seconds</option>
                    <option value={120}>120 Seconds</option>
                  </select>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setCreateModalOpen(false)}
                  className="px-5 py-3 rounded-xl border border-white/10 text-xs font-bold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-8 py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-sm rounded-2xl shadow-xl transition cursor-pointer glow-orange disabled:opacity-50"
                >
                  {creating ? 'Creating...' : 'CREATE & OPEN REGISTRATION'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Passcode Prompt Modal */}
      {passcodeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#262c3c] border border-orange-500/40 rounded-3xl p-6 max-w-sm w-full shadow-2xl">
            <h3 className="text-base font-black text-white mb-2 flex items-center gap-2">
              <Lock className="w-4 h-4 text-orange-400" />
              <span>Enter Tournament Passcode</span>
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              This tournament is private. Enter the passcode set by the organizer to register.
            </p>
            <input
              type="password"
              placeholder="Passcode"
              value={enteredPasscode}
              onChange={(e) => setEnteredPasscode(e.target.value)}
              className="w-full px-4 py-2.5 bg-[#1e2433] border border-white/20 rounded-xl text-xs text-white font-mono mb-4 focus:outline-none focus:border-orange-500"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasscodeModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleJoinTournament(passcodeTargetId, enteredPasscode)}
                className="px-5 py-2 bg-orange-500 text-white font-bold text-xs rounded-xl shadow cursor-pointer"
              >
                Join
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
