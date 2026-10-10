import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../utils/api';
import SphereGridSkillTree from './SphereGridSkillTree';
import GrowthTriadRadar from './GrowthTriadRadar';
import { formatIST, formatISTDate, formatISTTime, formatLastOnline } from '../utils/dateUtils';
import {
  User, Trophy, Shield, Activity, Target, Zap, Clock, CheckCircle2,
  XCircle, ArrowLeft, RefreshCw, Flame, Edit3, BookOpen, Award,
  Swords, TrendingUp, Sparkles, Calendar, GraduationCap, Pin, PinOff,
  ChevronRight, Lock, Check, Layers, BarChart2, Star, Send,
  Share2, Eye, FileText, Search
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

const DIVISION_RINGS = {
  GRANDMASTER: 'ring-4 ring-red-500/90 shadow-[0_0_25px_rgba(239,68,68,0.7)] animate-pulse',
  MASTER: 'ring-4 ring-purple-500/90 shadow-[0_0_22px_rgba(168,85,247,0.7)]',
  DIAMOND: 'ring-4 ring-blue-400/90 shadow-[0_0_20px_rgba(96,165,250,0.7)]',
  PLATINUM: 'ring-4 ring-emerald-400/90 shadow-[0_0_18px_rgba(52,211,153,0.6)]',
  GOLD: 'ring-4 ring-amber-400/90 shadow-[0_0_18px_rgba(251,191,36,0.6)]',
  SILVER: 'ring-4 ring-slate-400/80 shadow-[0_0_14px_rgba(148,163,184,0.5)]',
  BRONZE: 'ring-4 ring-orange-600/80 shadow-[0_0_14px_rgba(234,88,12,0.5)]',
};

const BANNER_THEMES = {
  orange_cyber: {
    id: 'orange_cyber',
    label: 'Cyberpunk Orange',
    bannerClasses: 'bg-gradient-to-r from-orange-950/90 via-[#141724] to-amber-950/90 border-orange-500/40 shadow-[0_0_40px_rgba(249,115,22,0.15)]',
    accentText: 'text-orange-400',
    accentBg: 'bg-orange-500',
    accentBorder: 'border-orange-500/50',
    badgeBg: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    glowColor: 'rgba(249,115,22,0.12)',
    swatch: 'from-orange-500 to-amber-600',
  },
  quantum_neon: {
    id: 'quantum_neon',
    label: 'Quantum Neon',
    bannerClasses: 'bg-gradient-to-r from-cyan-950/90 via-[#0f172a] to-blue-950/90 border-cyan-500/40 shadow-[0_0_40px_rgba(6,182,212,0.15)]',
    accentText: 'text-cyan-400',
    accentBg: 'bg-cyan-500',
    accentBorder: 'border-cyan-500/50',
    badgeBg: 'bg-cyan-500/15 text-cyan-400 border-cyan-500/30',
    glowColor: 'rgba(6,182,212,0.12)',
    swatch: 'from-cyan-400 to-blue-600',
  },
  galaxy_navy: {
    id: 'galaxy_navy',
    label: 'Galaxy Navy',
    bannerClasses: 'bg-gradient-to-r from-indigo-950/90 via-[#18112e] to-purple-950/90 border-purple-500/40 shadow-[0_0_40px_rgba(168,85,247,0.15)]',
    accentText: 'text-purple-400',
    accentBg: 'bg-purple-500',
    accentBorder: 'border-purple-500/50',
    badgeBg: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
    glowColor: 'rgba(168,85,247,0.12)',
    swatch: 'from-purple-500 to-indigo-600',
  },
  golden_aureolin: {
    id: 'golden_aureolin',
    label: 'Golden Aureolin',
    bannerClasses: 'bg-gradient-to-r from-amber-950/90 via-[#1f1a10] to-yellow-950/90 border-yellow-500/40 shadow-[0_0_40px_rgba(234,179,8,0.15)]',
    accentText: 'text-yellow-400',
    accentBg: 'bg-yellow-500',
    accentBorder: 'border-yellow-500/50',
    badgeBg: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
    glowColor: 'rgba(234,179,8,0.12)',
    swatch: 'from-yellow-400 to-amber-600',
  },
};

const ELO_MILESTONES = [
  { rank: 'Silver Challenger', elo: 1350, icon: '🥈', air: 'AIR 15,000 - 35,000' },
  { rank: 'Gold Contender', elo: 1500, icon: '🥇', air: 'AIR 5,000 - 15,000' },
  { rank: 'Platinum Prodigy', elo: 1650, icon: '💎', air: 'AIR 1,500 - 5,000' },
  { rank: 'Diamond Maestro', elo: 1800, icon: '💠', air: 'AIR 250 - 1,500' },
  { rank: 'Master Titan', elo: 1950, icon: '👑', air: 'AIR 50 - 250' },
  { rank: 'Grandmaster Apex', elo: 2100, icon: '🔥', air: 'AIR 1 - 50' },
];

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

const COLLEGE_PRESETS = [
  'IIT Bombay (Computer Science)',
  'IIT Delhi (Mathematics & Computing)',
  'IIT Madras (Electrical Engineering)',
  'IIT Kanpur (Aerospace Engineering)',
  'IIT Kharagpur (Computer Science)',
  'BITS Pilani (Computer Science)',
  'NIT Trichy (Computer Science)',
];

const EXAM_PRESETS = [
  'JEE Main Jan 2026',
  'JEE Main Apr 2026',
  'JEE Advanced 2026',
  'JEE Main Jan 2027',
];

const TITLE_PRESETS = [
  'JEE Aspirant',
  'Kota Star Batch',
  'Calculus Prodigy',
  'Mechanics Maestro',
  'Organic Alchemist',
  'Olympiad Medalist',
  'Speed Demon',
  '100 Percentiler',
];

export default function ProfileView({
  username,
  currentUser,
  onBack,
  onNavigateTab,
  onUpdateUser,
  onStartPreset,
  onSelectTest,
  onViewProfile,
  isActive
}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState('overview'); // 'overview', 'skills', 'trophies', 'tests', 'matches'
  const [selectedSubject, setSelectedSubject] = useState('All');
  const [selectedAchFilter, setSelectedAchFilter] = useState('ALL');
  const [inspectorInput, setInspectorInput] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    target_college: '',
    target_exam_date: '',
    bio: '',
    banner_theme: 'orange_cyber',
    avatar_id: 'default',
    title: 'JEE Aspirant',
  });
  const [saving, setSaving] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);

  const targetUsername = username || currentUser?.username;
  const isOwnProfile = !username || (currentUser && username.toLowerCase() === currentUser.username.toLowerCase());

  const fetchProfile = () => {
    if (targetUsername) {
      setLoading(true);
      api.leaderboards.getProfile(targetUsername)
        .then((res) => {
          setData(res);
          setLoading(false);
          if (res?.profile) {
            setEditForm({
              target_college: res.profile.target_college || 'IIT Bombay (Computer Science)',
              target_exam_date: res.profile.target_exam_date || 'JEE Main Jan 2026',
              bio: res.profile.bio || 'Aiming for Top 500 AIR. PvP Aspirant.',
              banner_theme: res.profile.banner_theme || 'orange_cyber',
              avatar_id: res.profile.avatar_id || 'flame',
              title: res.profile.title || 'JEE Aspirant',
            });
          }
        })
        .catch((err) => {
          console.error('Failed to load profile:', err);
          setLoading(false);
        });
    }
  };

  useEffect(() => {
    if (isActive !== false) {
      fetchProfile();
    }
  }, [targetUsername, isActive, currentUser?.overall_elo, currentUser?.total_solved]);

  useEffect(() => {
    const handleUserUpdated = () => {
      fetchProfile();
    };
    window.addEventListener('jee_user_updated', handleUserUpdated);
    return () => window.removeEventListener('jee_user_updated', handleUserUpdated);
  }, [targetUsername]);

  if (loading || !data) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-24 text-center">
        <RefreshCw className="w-10 h-10 animate-spin text-orange-400 mx-auto mb-4" />
        <p className="text-base text-slate-300 font-mono tracking-wide">Retrieving Aspirant Dossier & Skill Matrix...</p>
      </div>
    );
  }

  const p = data.profile;
  const theme = BANNER_THEMES[p.banner_theme] || BANNER_THEMES.orange_cyber;
  const divStyle = DIVISION_COLORS[p.current_division] || DIVISION_COLORS.BRONZE;
  const ringStyle = DIVISION_RINGS[p.current_division] || DIVISION_RINGS.BRONZE;
  const presence = formatLastOnline(p.last_active, p.is_online);

  // Next Milestone Logic
  const currentElo = Math.round(p.overall_elo || 1200);
  const nextMilestone = ELO_MILESTONES.find((m) => m.elo > currentElo) || ELO_MILESTONES[ELO_MILESTONES.length - 1];
  const prevMilestoneElo = currentElo > 1200
    ? (ELO_MILESTONES.slice().reverse().find((m) => m.elo <= currentElo)?.elo || 1200)
    : 1100;
  const milestoneRange = Math.max(50, nextMilestone.elo - prevMilestoneElo);
  const milestoneProgress = Math.min(100, Math.max(5, Math.round(((currentElo - prevMilestoneElo) / milestoneRange) * 100)));
  const eloDeltaNeeded = Math.max(0, nextMilestone.elo - currentElo);

  // Pinned Badges calculation
  const pinnedIds = p.pinned_badges || [];
  const pinnedBadges = (data.achievements || []).filter((ach) => pinnedIds.includes(ach.id));

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await api.leaderboards.updateProfile(editForm);
      setData((prev) => ({ ...prev, profile: updated }));
      if (onUpdateUser) {
        onUpdateUser(updated);
      }
      setEditModalOpen(false);
    } catch (err) {
      alert(err.message || 'Failed to update profile passport.');
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePinBadge = async (badgeId) => {
    if (!isOwnProfile) return;
    let newPinned = [...(p.pinned_badges || [])];
    if (newPinned.includes(badgeId)) {
      newPinned = newPinned.filter((id) => id !== badgeId);
    } else {
      if (newPinned.length >= 3) {
        alert('You can pin up to 3 badges on your Passport banner. Please unpin one first.');
        return;
      }
      newPinned.push(badgeId);
    }

    try {
      const updated = await api.leaderboards.updateProfile({ pinned_badges: newPinned });
      setData((prev) => ({ ...prev, profile: updated }));
      if (onUpdateUser) onUpdateUser(updated);
    } catch (err) {
      console.error('Failed to update pinned badges:', err);
    }
  };

  // SVG AIR Trajectory Calculation
  const historyPoints = data.rank_history || [];
  const svgWidth = 620;
  const svgHeight = 220;
  const paddingX = 45;
  const paddingY = 35;

  const eloValues = historyPoints.map((h) => h.overall_elo);
  const minElo = Math.max(900, Math.min(...eloValues, 1200) - 60);
  const maxElo = Math.max(2200, Math.max(...eloValues, 1500) + 60);

  const coords = historyPoints.map((pt, idx) => {
    const x = paddingX + (idx / Math.max(1, historyPoints.length - 1)) * (svgWidth - 2 * paddingX);
    const y = svgHeight - paddingY - ((pt.overall_elo - minElo) / (maxElo - minElo)) * (svgHeight - 2 * paddingY);
    return { ...pt, x, y };
  });

  const pathD = coords.length > 0
    ? `M ${coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' L ')}`
    : '';

  const areaD = coords.length > 0
    ? `${pathD} L ${coords[coords.length - 1].x.toFixed(1)},${svgHeight - paddingY} L ${coords[0].x.toFixed(1)},${svgHeight - paddingY} Z`
    : '';

  // Skill Tree filter
  const skillTree = data.skill_tree?.tree || {};
  const subjectsToDisplay = selectedSubject === 'All'
    ? Object.keys(skillTree)
    : [selectedSubject];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 page-transition pb-24">
      {/* Public Dossier Inspector Bar & Browser Search Control */}
      <div className="mb-6 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 bg-[#1a1f2e] border border-orange-500/30 p-4 rounded-2xl shadow-lg">
        <div className="flex items-center gap-3">
          {onBack ? (
            <button
              onClick={onBack}
              className="inline-flex items-center gap-2 text-xs font-bold text-white hover:text-orange-400 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 px-3.5 py-2 rounded-xl transition cursor-pointer shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5 text-orange-400" />
              <span>{isOwnProfile ? 'Back' : 'Back to My Profile'}</span>
            </button>
          ) : null}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-black uppercase font-mono text-orange-400 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                <span>{isOwnProfile ? 'Your Aspirant Dossier' : `Inspecting Candidate: @${p.username}`}</span>
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              {isOwnProfile
                ? 'Your verified examination dossier, skill radar, test histories, and trophies.'
                : `Viewing public statistics, examination papers, skill tree, and battle logs for ${p.username}.`}
            </p>
          </div>
        </div>

        {/* Browser Inspector & Quick Share Tool */}
        <div className="flex items-center gap-2 self-end md:self-auto w-full md:w-auto">
          {/* In-Browser Profile Search Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (inspectorInput.trim() && onViewProfile) {
                onViewProfile(inspectorInput.trim());
                setInspectorInput('');
              }
            }}
            className="relative flex-1 md:w-56"
          >
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={inspectorInput}
              onChange={(e) => setInspectorInput(e.target.value)}
              placeholder="Search candidate username..."
              className="w-full pl-8 pr-14 py-1.5 bg-[#121622] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 font-mono"
            />
            <button
              type="submit"
              disabled={!inspectorInput.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-30 text-[10px] font-bold text-white transition cursor-pointer"
            >
              Inspect
            </button>
          </form>

          {/* Copy Profile Link Button */}
          <button
            onClick={() => {
              try {
                const url = `${window.location.origin}${window.location.pathname}?profile=${encodeURIComponent(p.username)}`;
                navigator.clipboard.writeText(url);
                setCopiedLink(true);
                setTimeout(() => setCopiedLink(false), 2500);
              } catch (_) {}
            }}
            title="Copy shareable browser link to this profile"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-bold text-slate-300 hover:text-white transition cursor-pointer shrink-0"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copied!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-orange-400" />
                <span>Share URL</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* =========================================================================
          HERO ASPIRANT PASSPORT BANNER (THEMEABLE & CUSTOMIZABLE)
          ========================================================================= */}
      <div className={`relative rounded-3xl p-6 sm:p-8 border mb-8 overflow-hidden transition-all duration-300 ${theme.bannerClasses}`}>
        {/* Ambient background glow accents */}
        <div
          className="absolute -top-20 -right-20 w-96 h-96 rounded-full blur-3xl pointer-events-none -z-10"
          style={{ background: theme.glowColor }}
        />
        <div
          className="absolute -bottom-20 -left-20 w-96 h-96 rounded-full blur-3xl pointer-events-none -z-10"
          style={{ background: theme.glowColor }}
        />

        <div className="flex flex-col lg:flex-row items-center lg:items-start gap-6 sm:gap-8 justify-between">
          {/* Left Block: Avatar + Name + Identity Details */}
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 flex-1 text-center sm:text-left">
            {/* Avatar with Division Aura Ring */}
            <div className="relative group shrink-0">
              <div className={`w-24 h-24 rounded-3xl bg-[#121622] flex items-center justify-center text-5xl shadow-2xl transition-transform group-hover:scale-105 ${ringStyle}`}>
                {AVATAR_MAP[p.avatar_id] || '🔥'}
              </div>
              {/* Online/Offline presence dot */}
              <span 
                className={`absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-[#121622] ${presence.isOnline ? 'bg-emerald-400 ring-2 ring-emerald-500/50 animate-pulse' : 'bg-slate-500'}`}
                title={presence.detail}
              />
              <div className={`absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shadow-md whitespace-nowrap ${divStyle}`}>
                {p.current_division}
              </div>
            </div>

            {/* Profile Credentials */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 mb-1.5">
                <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight truncate">
                  {p.username}
                </h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-white/10 text-slate-200 border border-white/15">
                  {p.title || 'JEE Aspirant'}
                </span>

                {/* Real-time Presence & Last Online IST Badge */}
                <div 
                  className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-mono font-bold ${
                    presence.isOnline
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm shadow-emerald-500/20'
                      : 'bg-black/40 text-slate-300 border-white/15'
                  }`}
                  title={presence.detail}
                >
                  <span className={`w-2 h-2 rounded-full ${presence.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                  <span>{presence.badgeText}</span>
                </div>

                {isOwnProfile && (
                  <button
                    onClick={() => setEditModalOpen(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-slate-200 border border-white/20 transition cursor-pointer ml-1"
                    title="Customize Aspirant Passport"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-orange-400" />
                    <span>Edit Passport</span>
                  </button>
                )}
              </div>

              {/* Target College & Target Exam Pills */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mt-2">
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/40 border border-white/10 text-xs font-semibold text-slate-200">
                  <GraduationCap className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="truncate max-w-[240px]">{p.target_college || 'IIT Bombay (Computer Science)'}</span>
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-black/40 border border-white/10 text-xs font-semibold text-slate-200">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                  <span>{p.target_exam_date || 'JEE Main Jan 2026'}</span>
                </div>
              </div>

              {/* Bio / Aspirant Motto */}
              <p className="text-xs sm:text-sm text-slate-300 mt-3 font-medium max-w-xl italic">
                "{p.bio || 'Aiming for Top 500 AIR. PvP Aspirant.'}"
              </p>

              {/* Featured Pinned Badges Shelf */}
              <div className="mt-4 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                  <Pin className="w-3 h-3 text-amber-400" />
                  <span>Showcase:</span>
                </span>
                {pinnedBadges.length > 0 ? (
                  pinnedBadges.map((badge) => (
                    <div
                      key={badge.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-black/50 border border-amber-500/30 text-xs text-amber-300 shadow-sm"
                      title={badge.description}
                    >
                      <span className="text-sm">{badge.icon}</span>
                      <span className="font-bold">{badge.title}</span>
                    </div>
                  ))
                ) : (
                  <span className="text-xs text-slate-400 italic">No badges pinned yet</span>
                )}

                {isOwnProfile && (
                  <button
                    onClick={() => setActiveSubTab('trophies')}
                    className="text-[11px] text-orange-400 hover:text-orange-300 underline font-semibold ml-1 cursor-pointer"
                  >
                    Manage Badges
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Block: Predicted AIR & Medals Shelf */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-center lg:items-end gap-3.5 shrink-0 w-full sm:w-auto">
            {/* Predicted AIR Pill & Data-Driven NTA Metrics */}
            <div className="w-full sm:w-auto bg-[#131722]/90 border border-orange-500/30 rounded-2xl p-4 shadow-xl text-center sm:text-right max-w-md">
              <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1 flex items-center justify-center sm:justify-end gap-1">
                <Target className="w-3.5 h-3.5 text-orange-400" />
                <span>Predicted All India Rank (AIR)</span>
              </span>
              <div className="flex items-center justify-center sm:justify-end gap-2 flex-wrap">
                <span className="text-base sm:text-lg font-black text-orange-400 font-mono tracking-tight block leading-snug">
                  {p.predicted_air_formatted || (p.predicted_air ? `AIR ${p.predicted_air.toLocaleString()}` : (p.predicted_air_bracket || 'Foundation Aspirant'))}
                </span>
                {p.predicted_percentile && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-950/90 text-emerald-300 border border-emerald-500/40">
                    {p.predicted_percentile}%ile
                  </span>
                )}
                {p.predicted_jee_main_marks && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-cyan-950/90 text-cyan-300 border border-cyan-500/40">
                    {p.predicted_jee_main_marks}/300 M
                  </span>
                )}
              </div>

              {p.predicted_air_range && (
                <span className="text-[11px] font-mono text-slate-400 block mt-1">
                  Confidence Band: <strong className="text-slate-200">{p.predicted_air_range}</strong>
                </span>
              )}

              {/* Syllabus Breadth Mini Progress Bar */}
              <div className="mt-3 pt-2.5 border-t border-white/10 text-left">
                <div className="flex justify-between items-center text-[10px] text-slate-300 font-mono mb-1">
                  <span className="text-slate-400 flex items-center gap-1">
                    <BookOpen className="w-3 h-3 text-cyan-400" />
                    <span>Syllabus Breadth:</span>
                  </span>
                  <span className="font-bold text-white">
                    {p.active_chapters_count || 0}/{p.total_syllabus_chapters || 92} Chapters ({p.syllabus_coverage_percent || 0}%)
                  </span>
                </div>
                <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400 transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(3, p.syllabus_coverage_percent || 0))}%` }}
                  />
                </div>
              </div>

              {p.air_gate_reason && (
                <div className="mt-2.5 text-[10.5px] text-amber-300/90 text-left bg-amber-500/10 border border-amber-500/25 px-2.5 py-1.5 rounded-xl leading-relaxed flex items-start gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                  <span><strong>Roadmap Gate:</strong> {p.air_gate_reason}</span>
                </div>
              )}
            </div>

            {/* Medals & Streak Trophy Rack */}
            <div className="flex items-center justify-center gap-3 sm:gap-4 bg-black/40 px-4 py-2.5 rounded-2xl border border-white/10 w-full sm:w-auto">
              <div className="text-center px-1">
                <span className="text-base block">🥇</span>
                <span className="text-xs font-mono font-bold text-white">{p.gold_medals || 0}</span>
                <span className="text-[9px] text-slate-400 uppercase block">Gold</span>
              </div>
              <div className="text-center px-1 border-l border-white/10">
                <span className="text-base block">🥈</span>
                <span className="text-xs font-mono font-bold text-white">{p.silver_medals || 0}</span>
                <span className="text-[9px] text-slate-400 uppercase block">Silver</span>
              </div>
              <div className="text-center px-1 border-l border-white/10">
                <span className="text-base block">🥉</span>
                <span className="text-xs font-mono font-bold text-white">{p.bronze_medals || 0}</span>
                <span className="text-[9px] text-slate-400 uppercase block">Bronze</span>
              </div>
              <div className="text-center px-1 border-l border-white/10">
                <span className="text-base block">🔥</span>
                <span className="text-xs font-mono font-bold text-orange-400">{p.current_streak || 0}d</span>
                <span className="text-[9px] text-slate-400 uppercase block">Streak</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          DOSSIER 5-TAB NAVIGATION BAR
          ========================================================================= */}
      <div className="flex items-center gap-2 border-b border-white/10 mb-8 overflow-x-auto pb-1 scrollbar-none">
        <button
          onClick={() => setActiveSubTab('overview')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition whitespace-nowrap cursor-pointer ${
            activeSubTab === 'overview'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>Overview & Passport</span>
        </button>

        <button
          onClick={() => setActiveSubTab('skills')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition whitespace-nowrap cursor-pointer ${
            activeSubTab === 'skills'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Syllabus Skill Tree</span>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-black/40 border border-white/20">
            {data.skill_tree?.total_mastered || 0}/{data.skill_tree?.total_chapters || p.total_syllabus_chapters || 92}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('trophies')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition whitespace-nowrap cursor-pointer ${
            activeSubTab === 'trophies'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Trophies & Badges</span>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-black/40 border border-white/20">
            {(data.achievements || []).filter((a) => a.is_unlocked).length}/{(data.achievements || []).length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('tests')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition whitespace-nowrap cursor-pointer ${
            activeSubTab === 'tests'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Mock Tests & Papers</span>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-black/40 border border-white/20">
            {(data.test_history || []).length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('matches')}
          className={`flex items-center gap-2 px-5 py-3 rounded-2xl text-sm font-bold transition whitespace-nowrap cursor-pointer ${
            activeSubTab === 'matches'
              ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20'
              : 'text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Swords className="w-4 h-4" />
          <span>Battle Log & History</span>
          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-black/40 border border-white/20">
            {(data.match_history || []).length}
          </span>
        </button>
      </div>

      {/* =========================================================================
          TAB 1: OVERVIEW & PASSPORT (AIR TRAJECTORY & RADARS)
          ========================================================================= */}
      {activeSubTab === 'overview' && (
        <div className="space-y-8 animate-fadeIn">
          {/* Aspirant Growth Triad Matrix */}
          <GrowthTriadRadar
            growthTriad={p.growth_triad || data.user?.growth_triad}
            user={p}
            compact={false}
            onNavigateTab={onNavigateTab}
          />

          {/* Quad Metric Stats Grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-[#161a24] border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-xl -z-10" />
              <span className="text-[11px] uppercase font-bold text-slate-400 block mb-1">Overall Elo Rating</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-orange-400">{Math.round(p.overall_elo)}</span>
                <span className="text-xs font-semibold text-slate-400 font-mono">pts</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-2 block">
                Peak: <strong className="text-slate-200">{Math.max(Math.round(p.overall_elo), 1200)}</strong>
              </span>
            </div>

            <div className="bg-[#161a24] border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl -z-10" />
              <span className="text-[11px] uppercase font-bold text-slate-400 block mb-1">Questions Solved</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-white">{p.total_solved || 0}</span>
                <span className="text-xs font-semibold text-slate-400">total</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-2 block">
                Correct: <strong className="text-emerald-400">{p.total_correct || 0}</strong>
              </span>
            </div>

            <div className="bg-[#161a24] border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl -z-10" />
              <span className="text-[11px] uppercase font-bold text-slate-400 block mb-1">Combat Accuracy</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-emerald-400">{p.accuracy_percentage || 0}%</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-2 block">
                Speed: Top <strong className="text-cyan-400">{p.speed_percentile || 50}%</strong> percentile
              </span>
            </div>

            <div className="bg-[#161a24] border border-white/10 rounded-2xl p-5 shadow-lg relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-xl -z-10" />
              <span className="text-[11px] uppercase font-bold text-slate-400 block mb-1">Weekly Rank Points</span>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black font-mono text-amber-400">{p.weekly_rp || 0}</span>
                <span className="text-xs font-semibold text-slate-400 font-mono">RP</span>
              </div>
              <span className="text-[11px] text-slate-400 mt-2 block">
                Resets every Monday 05:29 AM IST (Weekly Reset)
              </span>
            </div>
          </div>

          {/* Next Milestone & Interactive AIR Trajectory Section */}
          <div className="bg-[#161a24] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-orange-400" />
                  <span>Predicted AIR Trajectory & Progression</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Historical competitive rating curve mapped against predicted All India Rank percentiles.
                </p>
              </div>

              {/* Milestone Progress Chip */}
              <div className="bg-[#10141f] border border-white/10 px-4 py-2.5 rounded-2xl flex items-center gap-3">
                <span className="text-2xl">{nextMilestone.icon}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-400">Next Milestone:</span>
                    <span className="text-xs font-bold text-white">{nextMilestone.rank}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs font-mono font-bold text-orange-400">
                      {eloDeltaNeeded > 0 ? `+${eloDeltaNeeded} Elo needed` : 'Milestone Achieved!'}
                    </span>
                    <span className="text-[10px] text-slate-400">({nextMilestone.air})</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Milestone Progress Bar */}
            <div className="mb-6">
              <div className="flex justify-between text-xs text-slate-400 mb-1.5 font-mono">
                <span>Current: {currentElo} Elo</span>
                <span>Target: {nextMilestone.elo} Elo ({nextMilestone.rank})</span>
              </div>
              <div className="w-full h-3 rounded-full bg-slate-800 overflow-hidden p-0.5 border border-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-orange-500 via-amber-400 to-emerald-400 transition-all duration-700 shadow-sm"
                  style={{ width: `${milestoneProgress}%` }}
                />
              </div>
            </div>

            {/* Interactive SVG Chart */}
            <div className="relative bg-[#10141f] rounded-2xl p-4 border border-white/5 overflow-hidden">
              <div className="w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                  className="w-full h-48 sm:h-56 select-none"
                >
                  <defs>
                    <linearGradient id="airGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#f97316" stopOpacity="0.35" />
                      <stop offset="100%" stopColor="#f97316" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal Grid lines */}
                  {[0.2, 0.4, 0.6, 0.8].map((ratio, i) => {
                    const y = paddingY + ratio * (svgHeight - 2 * paddingY);
                    return (
                      <line
                        key={i}
                        x1={paddingX}
                        y1={y}
                        x2={svgWidth - paddingX}
                        y2={y}
                        stroke="rgba(255,255,255,0.06)"
                        strokeDasharray="4 4"
                      />
                    );
                  })}

                  {/* Gradient Area */}
                  {areaD && (
                    <path d={areaD} fill="url(#airGrad)" />
                  )}

                  {/* Main Trajectory Line */}
                  {pathD && (
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#f97316"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Data Points */}
                  {coords.map((pt, i) => (
                    <g key={i}>
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="6"
                        className="fill-orange-400 stroke-[#10141f] stroke-2 hover:r-8 cursor-pointer transition-all"
                        onMouseEnter={() => setHoveredPoint(pt)}
                        onClick={() => setHoveredPoint(pt)}
                      />
                      <circle
                        cx={pt.x}
                        cy={pt.y}
                        r="10"
                        className="fill-orange-500/20 opacity-0 hover:opacity-100 transition-opacity pointer-events-none"
                      />
                    </g>
                  ))}
                </svg>
              </div>

              {/* Tooltip for Hovered Node */}
              {hoveredPoint && (
                <div className="mt-3 p-3 rounded-xl bg-[#161a24] border border-orange-500/40 flex items-center justify-between text-xs animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-orange-400 animate-ping" />
                    <span className="text-slate-400">Date: <strong className="text-white">{formatIST(hoveredPoint.created_at)}</strong></span>
                  </div>
                  <div>
                    <span className="text-slate-400">Rating: </span>
                    <span className="font-bold font-mono text-orange-400">{Math.round(hoveredPoint.overall_elo)} Elo</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Predicted Rank: </span>
                    <span className="font-bold text-white">{hoveredPoint.predicted_air_bracket}</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* =========================================================================
              DATA-DRIVEN ALL INDIA RANK (AIR) DIAGNOSTIC & COLLEGE ADMISSIONS
              ========================================================================= */}
          <div className="bg-[#161a24] border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-xl glow-orange-subtle space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-500/15 border border-orange-500/30 text-orange-400 text-[10px] font-black uppercase tracking-wider mb-2">
                  <Target className="w-3.5 h-3.5" />
                  <span>NTA & IIT Benchmark Engine (14 Lakh Candidate Pool)</span>
                </div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
                  <span>National All India Rank Forecast</span>
                  <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-500/40 text-emerald-400">
                    {p.air_confidence_label || 'Calibrating'} ({p.air_confidence_score || 25}% Confidence)
                  </span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Empirical percentile transfer curve calibrated with negative marking penalties (+4 / -1), syllabus breadth across {p.total_syllabus_chapters || 92} chapters, and PCM balance.
                </p>
              </div>

              <div className="text-left md:text-right">
                <span className="text-[11px] uppercase font-bold text-slate-400 block mb-0.5">Estimated Primary Rank</span>
                <span className="text-2xl sm:text-3xl font-black font-mono text-orange-400 tracking-tight block">
                  {p.predicted_air_formatted || (p.predicted_air ? `AIR ${p.predicted_air.toLocaleString()}` : (p.predicted_air_bracket || 'AIR Calculating...'))}
                </span>
                <span className="text-xs font-mono text-slate-300">
                  {p.predicted_air_range || 'Provisional Baseline'}
                </span>
              </div>
            </div>

            {/* Tri-Metric Calibration Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Card 1: National Percentile */}
              <div className="bg-[#111520] border border-white/10 rounded-2xl p-4.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase font-bold text-slate-400">Predicted Percentile</span>
                    <Sparkles className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="text-2xl sm:text-3xl font-black font-mono text-emerald-400">
                    {p.predicted_percentile ? `${p.predicted_percentile}%` : '50.0%'}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    Top {p.predicted_percentile ? (100 - p.predicted_percentile).toFixed(2) : '50.0'}% Nationwide
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-slate-400">
                  Tier: <strong className="text-slate-200">{p.tier_name || p.air_meta?.tier_name || 'Foundation'}</strong>
                </div>
              </div>

              {/* Card 2: Projected JEE Main Marks */}
              <div className="bg-[#111520] border border-white/10 rounded-2xl p-4.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase font-bold text-slate-400">Projected Score</span>
                    <Award className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl sm:text-3xl font-black font-mono text-cyan-400">
                      {p.predicted_jee_main_marks || 0}
                    </span>
                    <span className="text-xs font-bold text-slate-400 font-mono">/ 300</span>
                  </div>
                  {/* Score Progress Bar */}
                  <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden mt-2">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-blue-400"
                      style={{ width: `${Math.min(100, Math.round(((p.predicted_jee_main_marks || 0) / 300) * 100))}%` }}
                    />
                  </div>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-slate-400 flex items-center justify-between">
                  <span>Gen Cutoff: ~92</span>
                  <span className={(p.predicted_jee_main_marks || 0) >= 92 ? 'text-emerald-400 font-bold' : 'text-amber-400 font-bold'}>
                    {(p.predicted_jee_main_marks || 0) >= 92 ? 'Cleared (+ ' + ((p.predicted_jee_main_marks || 0) - 92) + ')' : 'Lagging (- ' + (92 - (p.predicted_jee_main_marks || 0)) + ')'}
                  </span>
                </div>
              </div>

              {/* Card 3: PCM Tri-Axial Balance */}
              <div className="bg-[#111520] border border-white/10 rounded-2xl p-4.5 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] uppercase font-bold text-slate-400">PCM Symmetry Index</span>
                    <Activity className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="text-base sm:text-lg font-black text-purple-300 line-clamp-1">
                    {p.air_meta?.balance_status || 'Balanced Trifecta'}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 font-mono">
                    Rating Variance: <strong className="text-slate-200">±{p.air_meta?.pcm_std_dev || 0} Elo</strong>
                  </p>
                </div>
                <div className="mt-4 pt-3 border-t border-white/5 text-[10px] text-slate-400">
                  {p.air_meta?.coverage_label || 'Syllabus evaluation active'}
                </div>
              </div>
            </div>

            {/* Subject-by-Subject AIR & Score Breakdown */}
            {p.subject_air_breakdown && (
              <div className="bg-[#111520] border border-white/10 rounded-2xl p-5">
                <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                  <BarChart2 className="w-3.5 h-3.5 text-orange-400" />
                  <span>Subject Performance vs National Shifts</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {['physics', 'chemistry', 'mathematics'].map((subjKey) => {
                    const subjData = p.subject_air_breakdown[subjKey];
                    if (!subjData) return null;
                    const isPhys = subjKey === 'physics';
                    const isChem = subjKey === 'chemistry';
                    const title = isPhys ? 'Physics' : (isChem ? 'Chemistry' : 'Mathematics');
                    const emoji = isPhys ? '⚛️' : (isChem ? '🧪' : '📐');
                    const color = isPhys ? 'text-blue-400' : (isChem ? 'text-emerald-400' : 'text-purple-400');
                    const statusColor = subjData.status === 'Dominant'
                      ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                      : subjData.status === 'Lagging'
                      ? 'bg-red-950/80 text-red-400 border-red-500/40'
                      : 'bg-slate-800 text-slate-300 border-white/10';

                    return (
                      <div key={subjKey} className="bg-[#171b26] p-3.5 rounded-xl border border-white/5 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="text-sm">{emoji}</span>
                            <span className={`text-xs font-black ${color}`}>{title}</span>
                          </div>
                          <div className="text-xs font-mono font-bold text-white">
                            {subjData.percentile}%ile • {subjData.projected_marks}/100 M
                          </div>
                        </div>
                        <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${statusColor}`}>
                          {subjData.status}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Premier College Admissibility Predictor Matrix */}
            {p.college_admissibility && p.college_admissibility.length > 0 && (
              <div className="bg-[#111520] border border-white/10 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3.5">
                  <h4 className="text-xs uppercase font-extrabold tracking-wider text-slate-400 flex items-center gap-1.5">
                    <GraduationCap className="w-4 h-4 text-amber-400" />
                    <span>Admissions Predictor Matrix (Based on Projected Rank)</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">JoSAA / CSAB Standards</span>
                </div>

                <div className="space-y-2">
                  {p.college_admissibility.map((c, idx) => {
                    const isSafe = c.status === 'Safe';
                    const isTarget = c.status === 'Target';
                    const isReach = c.status === 'Reach';
                    const statusBadge = isSafe
                      ? 'bg-emerald-950/90 text-emerald-400 border-emerald-500/50'
                      : isTarget
                      ? 'bg-amber-950/90 text-amber-300 border-amber-500/50'
                      : isReach
                      ? 'bg-blue-950/90 text-blue-300 border-blue-500/50'
                      : 'bg-slate-800/80 text-slate-400 border-white/10';

                    return (
                      <div
                        key={idx}
                        className="bg-[#171b26] p-3 rounded-xl border border-white/5 flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-white truncate">{c.college}</span>
                            <span className="text-[9px] font-mono text-slate-400 bg-black/40 px-1.5 py-0.2 rounded border border-white/5">
                              {c.category}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400 truncate mt-0.5">
                            {c.branch} • Cutoff ~AIR {c.cutoff_rank.toLocaleString()}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[9px] font-extrabold uppercase px-2 py-0.5 rounded border ${statusBadge}`}>
                            {c.status} ({c.chance})
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Diagnostic Bottlenecks & Roadmap Gates */}
            {p.air_bottlenecks && p.air_bottlenecks.length > 0 && (
              <div className="bg-amber-500/5 border border-amber-500/25 rounded-2xl p-4.5 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Strategic Rank Diagnosis & Actionable Levers:</span>
                </div>
                <div className="space-y-1.5 text-[11px] text-slate-300">
                  {p.air_bottlenecks.map((b, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="text-amber-400 shrink-0 font-bold">•</span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Subject-Wise Elo Triad */}
          <div className="bg-[#161a24] border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <Flame className="w-5 h-5 text-orange-400" />
              <span>Subject-Wise Elo Strengths</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              {/* Physics */}
              <div className="bg-[#10141f] border border-blue-500/20 rounded-2xl p-5 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>⚛️</span> Physics
                  </span>
                  <span className="text-xl font-black font-mono text-white">{Math.round(p.physics_elo || 1200)}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full bg-blue-500"
                    style={{ width: `${Math.min(100, Math.round(((p.physics_elo || 1200) / 2000) * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Target 1500+</span>
                  <span className="font-mono text-blue-400">
                    {Math.round(p.physics_elo) >= 1500 ? 'Master' : `${1500 - Math.round(p.physics_elo)} to Master`}
                  </span>
                </div>
              </div>

              {/* Chemistry */}
              <div className="bg-[#10141f] border border-emerald-500/20 rounded-2xl p-5 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🧪</span> Chemistry
                  </span>
                  <span className="text-xl font-black font-mono text-white">{Math.round(p.chemistry_elo || 1200)}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.min(100, Math.round(((p.chemistry_elo || 1200) / 2000) * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Target 1500+</span>
                  <span className="font-mono text-emerald-400">
                    {Math.round(p.chemistry_elo) >= 1500 ? 'Master' : `${1500 - Math.round(p.chemistry_elo)} to Master`}
                  </span>
                </div>
              </div>

              {/* Mathematics */}
              <div className="bg-[#10141f] border border-amber-500/20 rounded-2xl p-5 shadow-md">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>📐</span> Mathematics
                  </span>
                  <span className="text-xl font-black font-mono text-white">{Math.round(p.math_elo || 1200)}</span>
                </div>
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden mb-3">
                  <div
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${Math.min(100, Math.round(((p.math_elo || 1200) / 2000) * 100))}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400">
                  <span>Target 1500+</span>
                  <span className="font-mono text-amber-400">
                    {Math.round(p.math_elo) >= 1500 ? 'Master' : `${1500 - Math.round(p.math_elo)} to Master`}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Two-Factor JEE Readiness & Anti-Farming Matrix Card */}
          <div className="bg-[#161a24] border border-cyan-500/30 rounded-3xl p-6 sm:p-8 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none -z-10" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-cyan-400" />
                  <span>Two-Factor JEE All India Rank (AIR) Readiness Matrix</span>
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  True JEE All India Rank projection evaluates both your problem-solving accuracy (Combat Elo) and your syllabus breadth across all {p.total_syllabus_chapters || 92} chapters.
                </p>
              </div>

              <div className="bg-[#10141f] border border-cyan-500/30 px-3.5 py-1.5 rounded-xl text-xs font-mono text-cyan-300">
                Anti-Farming Shield Active
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6">
              {/* Factor 1: Combat Problem-Solving Skill */}
              <div className="bg-[#10141f] border border-white/10 rounded-2xl p-5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Factor 1: Combat Skill (Elo)
                </span>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-2xl font-black font-mono text-orange-400">
                    {Math.round(p.overall_elo)} Elo
                  </span>
                  <span className="text-xs font-bold text-slate-400">{p.current_division}</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Reflects your speed and accuracy in questions attempted. Current speed: Top <strong className="text-cyan-400">{p.speed_percentile || 50}%</strong> percentile.
                </p>
              </div>

              {/* Factor 2: Syllabus Breadth */}
              <div className="bg-[#10141f] border border-white/10 rounded-2xl p-5">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                  Factor 2: Syllabus Breadth
                </span>
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-2xl font-black font-mono text-cyan-400">
                    {p.syllabus_coverage_percent || 0}%
                  </span>
                  <span className="text-xs font-bold text-slate-400 font-mono">
                    ({p.active_chapters_count || 0}/{p.total_syllabus_chapters || 92} ch)
                  </span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  JEE evaluates all {p.total_syllabus_chapters || 92} chapters across Physics, Chemistry, and Math. Mastering a single chapter cannot bypass total syllabus requirements.
                </p>
              </div>

              {/* Factor 3: Next Rank Gate */}
              <div className="bg-[#10141f] border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1">
                    Roadmap Milestone Gate
                  </span>
                  <span className="text-sm font-bold text-white block mb-2 leading-snug">
                    {p.predicted_air_bracket}
                  </span>
                  <p className="text-xs text-amber-300/90 leading-relaxed">
                    {p.air_gate_reason || "Continue expanding your syllabus breadth to unlock higher rank brackets."}
                  </p>
                </div>
              </div>
            </div>

            {/* Anti-Farming Mechanics Notice */}
            <div className="bg-[#10141f]/80 border border-white/5 rounded-2xl p-4 text-xs text-slate-400 flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-orange-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                <strong className="text-slate-200">Anti-Farming & Diminishing Chapter Returns: </strong>
                To guarantee true All India Rank authenticity, practicing the same chapter repeatedly yields diminishing returns on Overall Elo.
                Single-chapter practice primarily builds your <em>Chapter Mastery</em> & <em>Subject Elo</em>, while Multi-Chapter & Full Syllabus battles grant 100% full Overall Elo delta.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 2: SYLLABUS SKILL TREE (SPHERE GRID / PATH OF EXILE CONSTELLATION)
          ========================================================================= */}
      {activeSubTab === 'skills' && (
        <div className="space-y-6 animate-fadeIn">
          <SphereGridSkillTree
            skillTreeData={data.skill_tree?.tree || {}}
            totalMastered={data.skill_tree?.total_mastered || 0}
            totalChapters={data.skill_tree?.total_chapters || p.total_syllabus_chapters || 92}
            masteryPercentage={data.skill_tree?.mastery_percentage || 0}
            onNavigateTab={onNavigateTab}
            onStartPreset={onStartPreset}
            currentUser={currentUser}
            profileUser={p}
            isOwnProfile={isOwnProfile}
          />
        </div>
      )}

      {/* =========================================================================
          TAB 3: TROPHY CASE & ACHIEVEMENTS (PINNABLE BADGES)
          ========================================================================= */}
      {activeSubTab === 'trophies' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header & Category Filters */}
          <div className="bg-[#161a24] border border-white/10 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Award className="w-5 h-5 text-orange-400" />
                <span>Trophy Cabinet & Milestones</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Unlock achievements through competitive ladder climbs, chapter masteries, and arena combat streaks.
              </p>
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              {['ALL', 'TRIAD', 'ELO', 'SUBJECT', 'COMBAT', 'VOLUME'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedAchFilter(cat)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                    selectedAchFilter === cat
                      ? 'bg-orange-500 text-white shadow-md'
                      : 'bg-[#10141f] text-slate-400 hover:text-white border border-white/10'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Achievements Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {(data.achievements || [])
              .filter((ach) => selectedAchFilter === 'ALL' || ach.category === selectedAchFilter)
              .map((ach) => {
                const isPinned = pinnedIds.includes(ach.id);
                return (
                  <div
                    key={ach.id}
                    className={`rounded-2xl p-5 border transition-all flex flex-col justify-between ${
                      ach.is_unlocked
                        ? 'bg-[#161a24] border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.06)]'
                        : 'bg-[#12151f] border-white/5 opacity-70'
                    }`}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl bg-[#10141f] border border-white/10 flex items-center justify-center text-2xl shadow-inner shrink-0">
                          {ach.icon}
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border ${
                            ach.is_unlocked
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}>
                            {ach.is_unlocked ? 'Unlocked' : 'In Progress'}
                          </span>

                          {/* Pin / Unpin Button for Profile Owner */}
                          {isOwnProfile && ach.is_unlocked && (
                            <button
                              onClick={() => handleTogglePinBadge(ach.id)}
                              className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-lg border transition cursor-pointer ${
                                isPinned
                                  ? 'bg-amber-500 text-black border-amber-400'
                                  : 'bg-white/5 hover:bg-white/10 text-slate-300 border-white/15'
                              }`}
                              title={isPinned ? 'Unpin from passport banner' : 'Pin to passport banner'}
                            >
                              {isPinned ? <PinOff className="w-2.5 h-2.5" /> : <Pin className="w-2.5 h-2.5" />}
                              <span>{isPinned ? 'Pinned' : 'Pin'}</span>
                            </button>
                          )}
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-white mb-1">{ach.title}</h4>
                      <p className="text-xs text-slate-400 mb-4">{ach.description}</p>
                    </div>

                    {/* Progress Bar */}
                    <div>
                      <div className="flex justify-between text-[11px] font-mono text-slate-400 mb-1">
                        <span>{ach.current} / {ach.target}</span>
                        <span className={ach.is_unlocked ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                          {ach.progress_percent}%
                        </span>
                      </div>
                      <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            ach.is_unlocked
                              ? 'bg-gradient-to-r from-amber-400 to-yellow-500'
                              : 'bg-slate-600'
                          }`}
                          style={{ width: `${Math.min(100, ach.progress_percent)}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: MOCK EXAMINATION PAPERS & TEST ARCHIVES (SCORECARDS)
          ========================================================================= */}
      {activeSubTab === 'tests' && (
        <div className="space-y-6 animate-fadeIn">
          {/* Header Banner */}
          <div className="bg-[#161a24] border border-white/10 rounded-3xl p-6 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-5 h-5 text-orange-400" />
                <span>{isOwnProfile ? 'Your Completed Mock Examination Papers' : `${p.username}'s Mock Papers & Test History`}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-1">
                Full chronological archive of timed JEE NTA papers, custom blueprint tests, and diagnostic scorecards.
              </p>
            </div>

            {/* Quick Metrics */}
            <div className="flex items-center gap-3">
              <div className="bg-[#11141d] border border-white/10 px-4 py-2.5 rounded-2xl text-center">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Total Papers</span>
                <span className="text-base font-black font-mono text-orange-400">{(data.test_history || []).length}</span>
              </div>
              <div className="bg-[#11141d] border border-white/10 px-4 py-2.5 rounded-2xl text-center">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Avg Accuracy</span>
                <span className="text-base font-black font-mono text-emerald-400">
                  {((data.test_history || []).length > 0
                    ? Math.round((data.test_history || []).reduce((acc, t) => acc + (t.accuracy || 0), 0) / (data.test_history || []).length)
                    : 0)}%
                </span>
              </div>
            </div>
          </div>

          {/* Tests List */}
          {(data.test_history || []).length > 0 ? (
            <div className="space-y-3.5">
              {(data.test_history || []).map((t, idx) => {
                const marksPct = t.marks_percentage || 0;
                const scoreColor = marksPct >= 60 ? 'text-emerald-400' : marksPct >= 35 ? 'text-amber-400' : 'text-orange-400';
                const formattedDate = formatIST(t.completed_at || t.created_at);

                return (
                  <div
                    key={t.room_id || t.code || idx}
                    className="bg-[#161a24] border border-white/10 rounded-2xl p-5 hover:border-white/20 transition-all shadow-md flex flex-col md:flex-row items-stretch md:items-center justify-between gap-5"
                  >
                    {/* Left: Test Details & Badges */}
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-lg bg-orange-500/15 text-orange-400 border border-orange-500/30">
                          {t.target_exam === 'MAIN' ? 'JEE Main (NTA)' : t.target_exam === 'ADVANCED' ? 'JEE Advanced' : t.target_exam || 'JEE Main'}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-white/5 text-slate-300 border border-white/10">
                          {t.mode === 'MOCK_TEST' ? 'Full Mock Exam' : 'Custom Blueprint'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-500 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          <span>{formattedDate}</span>
                        </span>
                      </div>

                      <h4 className="text-sm sm:text-base font-bold text-white truncate">
                        {t.preset_name || `Test Paper #${t.code}`}
                      </h4>

                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400 font-mono">
                        <span>{t.total_questions} Questions</span>
                        <span>•</span>
                        <span>{t.duration_minutes || 180} Mins</span>
                        <span>•</span>
                        <span className="text-emerald-400 font-bold">{t.correct_count} Correct</span>
                        <span className="text-red-400 font-bold">{t.incorrect_count} Incorrect</span>
                        <span className="text-slate-400">{t.unattempted_count} Skipped</span>
                      </div>
                    </div>

                    {/* Middle: Marks & Accuracy Metrics */}
                    <div className="flex items-center gap-5 border-t md:border-t-0 md:border-l border-white/10 pt-3 md:pt-0 md:pl-5 shrink-0">
                      <div className="text-center md:text-right">
                        <span className="text-[10px] font-mono uppercase text-slate-400 block">Marks Scored</span>
                        <span className={`text-lg font-black font-mono ${scoreColor}`}>
                          {t.marks} <span className="text-xs text-slate-500">/ {t.max_marks}</span>
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          ({marksPct}%)
                        </span>
                      </div>

                      <div className="text-center md:text-right">
                        <span className="text-[10px] font-mono uppercase text-slate-400 block">Accuracy</span>
                        <span className="text-lg font-black font-mono text-white">
                          {t.accuracy}%
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block">
                          {t.total_attempted} attempted
                        </span>
                      </div>
                    </div>

                    {/* Right: Review Paper CTA */}
                    <div className="shrink-0 flex items-center justify-end">
                      <button
                        onClick={() => {
                          if (onSelectTest) {
                            onSelectTest(t.code, p.username);
                          } else if (onNavigateTab) {
                            onNavigateTab('history');
                          }
                        }}
                        className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-md shadow-orange-500/20 transition cursor-pointer flex items-center justify-center gap-1.5"
                      >
                        <span>Review Paper & Analysis</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#161a24] border border-white/10 rounded-3xl p-12 text-center">
              <FileText className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h4 className="text-base font-bold text-white mb-1">
                {isOwnProfile ? 'No Mock Examination Papers Recorded Yet' : `No Completed Tests Found for @${p.username}`}
              </h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
                {isOwnProfile
                  ? 'Attempt an official NTA Mock Test or create a custom Blueprint paper to start building your test history.'
                  : `${p.username} has not completed any full mock examination papers yet.`}
              </p>
              {isOwnProfile && (
                <button
                  onClick={() => {
                    if (onNavigateTab) onNavigateTab('mocks');
                  }}
                  className="px-5 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-lg shadow-orange-500/20 transition cursor-pointer"
                >
                  Enter Mock Examination Center
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 5: BATTLE LOG & MATCH HISTORY (CHESS.COM STYLE)
          ========================================================================= */}
      {activeSubTab === 'matches' && (
        <div className="space-y-4 animate-fadeIn">
          <div className="bg-[#161a24] border border-white/10 rounded-3xl p-6 shadow-xl mb-6">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <Swords className="w-5 h-5 text-orange-400" />
              <span>Competitive Duel History & Battle Log</span>
            </h3>
            <p className="text-xs text-slate-400 mt-1">
              Live record of recent 1v1 Speed Duels and Arena showdowns.
            </p>
          </div>

          {(data.match_history || []).length > 0 ? (
            <div className="space-y-3">
              {data.match_history.map((m, idx) => {
                const isWin = m.result === 'WIN';
                const isLoss = m.result === 'LOSS';
                const pillClass = isWin
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                  : isLoss
                  ? 'bg-red-500/20 text-red-400 border-red-500/40'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/40';

                return (
                  <div
                    key={idx}
                    className="bg-[#161a24] border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 hover:border-white/20 transition-all shadow-md"
                  >
                    {/* Left: Result Pill & Date */}
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <span className={`text-xs font-black uppercase px-3 py-1 rounded-xl border font-mono ${pillClass}`}>
                        {m.result}
                      </span>
                      <div className="font-mono text-xs">
                        <span className={`font-black ${isWin ? 'text-emerald-400' : isLoss ? 'text-red-400' : 'text-amber-400'}`}>
                          {m.elo_delta} Elo
                        </span>
                        <span className="text-slate-400 block text-[10px]">{formatIST(m.date || m.created_at)}</span>
                      </div>
                    </div>

                    {/* Middle: Opponent Card & Score Showdown */}
                    <div className="flex items-center justify-center gap-4 flex-1 w-full sm:w-auto">
                      <div className="text-center sm:text-right">
                        <span className="text-[10px] uppercase font-bold text-slate-400 block">
                          {isOwnProfile ? 'Your Score' : `${p.username}'s Score`}
                        </span>
                        <span className="text-base font-black font-mono text-white">{m.my_score} pts</span>
                      </div>

                      <span className="text-xs font-black text-slate-400">VS</span>

                      {/* Opponent Identity */}
                      <button
                        type="button"
                        onClick={() => {
                          if (m.opponent?.username && onViewProfile && m.opponent?.username !== 'Practice Arena Bot') {
                            onViewProfile(m.opponent.username);
                          }
                        }}
                        className="flex items-center gap-2.5 text-left hover:opacity-80 transition cursor-pointer group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-[#10141f] border border-white/15 flex items-center justify-center text-lg shrink-0 group-hover:border-orange-500/50">
                          {AVATAR_MAP[m.opponent?.avatar_id] || '🤖'}
                        </div>
                        <div className="text-left">
                          <span className="text-xs font-bold text-white block truncate max-w-[140px] group-hover:text-orange-400">
                            {m.opponent?.username || 'Opponent'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono block">
                            {Math.round(m.opponent?.elo || 1200)} Elo • {m.opponent?.score || 0} pts
                          </span>
                        </div>
                      </button>
                    </div>

                    {/* Right: Target Exam Badge & Quick Action */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                      <span className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-black/40 border border-white/10 text-slate-300">
                        {m.target_exam}
                      </span>
                      <button
                        onClick={() => {
                          if (onNavigateTab) onNavigateTab('arena');
                        }}
                        className="text-xs font-bold px-3 py-1.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white transition cursor-pointer shadow-md shadow-orange-500/20"
                      >
                        Play Arena
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-[#161a24] border border-white/10 rounded-3xl p-12 text-center">
              <Swords className="w-12 h-12 text-slate-400 mx-auto mb-3" />
              <h4 className="text-base font-bold text-white mb-1">No Arena Matches Recorded Yet</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mb-5">
                Join or host a 1v1 Speed Duel or Knockout Tournament to begin building your competitive battle log.
              </p>
              <button
                onClick={() => {
                  if (onNavigateTab) onNavigateTab('arena');
                }}
                className="px-5 py-2.5 rounded-2xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs shadow-lg shadow-orange-500/20 transition cursor-pointer"
              >
                Enter Arena
              </button>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          EDIT PASSPORT CUSTOMIZATION MODAL (IDENTITY SUITE)
          ========================================================================= */}
      {editModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#141724] border border-white/15 rounded-3xl p-6 sm:p-8 max-w-lg w-full max-h-[90vh] overflow-y-auto shadow-2xl relative">
            <h3 className="text-xl font-black text-white mb-1 flex items-center gap-2">
              <Edit3 className="w-5 h-5 text-orange-400" />
              <span>Customize Aspirant Passport</span>
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Personalize your dream target college, examination date, banner aesthetics, and avatar.
            </p>

            <form onSubmit={handleSaveProfile} className="space-y-5">
              {/* Target College */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-orange-400" />
                  <span>Target Dream College</span>
                </label>
                <input
                  type="text"
                  value={editForm.target_college}
                  onChange={(e) => setEditForm({ ...editForm, target_college: e.target.value })}
                  placeholder="e.g. IIT Bombay (Computer Science)"
                  className="w-full bg-[#1c2130] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-orange-500 transition mb-2"
                  maxLength={60}
                />
                <div className="flex flex-wrap gap-1.5">
                  {COLLEGE_PRESETS.slice(0, 4).map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, target_college: col })}
                      className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 border border-white/10 transition cursor-pointer"
                    >
                      {col.split('(')[0].trim()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target Exam Date */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Target Exam Milestone</span>
                </label>
                <input
                  type="text"
                  value={editForm.target_exam_date}
                  onChange={(e) => setEditForm({ ...editForm, target_exam_date: e.target.value })}
                  placeholder="e.g. JEE Main Jan 2026"
                  className="w-full bg-[#1c2130] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-orange-500 transition mb-2"
                  maxLength={40}
                />
                <div className="flex flex-wrap gap-1.5">
                  {EXAM_PRESETS.map((ex) => (
                    <button
                      key={ex}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, target_exam_date: ex })}
                      className="text-[10px] px-2 py-0.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 border border-white/10 transition cursor-pointer"
                    >
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* Bio / Aspirant Motto */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Aspirant Motto / Bio (Max 120 chars)
                </label>
                <textarea
                  value={editForm.bio}
                  onChange={(e) => setEditForm({ ...editForm, bio: e.target.value })}
                  rows={2}
                  maxLength={120}
                  className="w-full bg-[#1c2130] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-orange-500 transition resize-none"
                  placeholder="Your personal drive or motto..."
                />
              </div>

              {/* Banner Theme Selector */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">
                  Passport Banner Theme
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  {Object.values(BANNER_THEMES).map((th) => (
                    <button
                      key={th.id}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, banner_theme: th.id })}
                      className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition cursor-pointer text-left ${
                        editForm.banner_theme === th.id
                          ? 'border-white bg-white/10 shadow-md'
                          : 'border-white/10 bg-[#1c2130] hover:bg-white/5'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full bg-gradient-to-br ${th.swatch} shrink-0`} />
                      <span className="text-xs font-bold text-white truncate">{th.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Avatar Selector */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-2">
                  Aspirant Crest Avatar
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(AVATAR_MAP).map(([avKey, avIcon]) => (
                    <button
                      key={avKey}
                      type="button"
                      onClick={() => setEditForm({ ...editForm, avatar_id: avKey })}
                      className={`h-11 rounded-xl flex items-center justify-center text-xl transition cursor-pointer border ${
                        editForm.avatar_id === avKey
                          ? 'bg-orange-500/20 border-orange-500 ring-2 ring-orange-500/50'
                          : 'bg-[#1c2130] border-white/10 hover:bg-white/5'
                      }`}
                    >
                      {avIcon}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title Selector */}
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Honorary Title
                </label>
                <select
                  value={editForm.title}
                  onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                  className="w-full bg-[#1c2130] border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-orange-500 transition"
                >
                  {TITLE_PRESETS.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditModalOpen(false)}
                  className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 py-2.5 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold transition cursor-pointer shadow-lg shadow-orange-500/20 disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  {saving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Passport Changes</span>
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
