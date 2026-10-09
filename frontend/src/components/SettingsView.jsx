import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  User,
  Lock,
  Shield,
  MessageSquare,
  Volume2,
  VolumeX,
  Eye,
  EyeOff,
  Save,
  Check,
  RefreshCw,
  AlertTriangle,
  LogOut,
  Sparkles,
  Sliders,
  CheckCircle2,
  Compass,
  Award,
  Zap,
  Target,
  GraduationCap,
  Calendar,
  Flame,
  Radio,
  X,
  ArrowRight,
  Trash2
} from 'lucide-react';
import {
  api,
  setToken,
  setCachedUser,
  recordSavedAccount,
  switchSavedAccount,
  isRememberMeEnabled,
  setRememberMePreference,
  getSavedAccounts,
  removeSavedAccount
} from '../utils/api';
import { sound } from '../utils/sound';

const AVATAR_OPTIONS = [
  { id: 'atom', label: 'Atom Core', emoji: '⚛️', desc: 'Physics Dynamo' },
  { id: 'zap', label: 'Volt Surge', emoji: '⚡', desc: 'Speed Specialist' },
  { id: 'rocket', label: 'Cosmic Jet', emoji: '🚀', desc: 'Fast Climber' },
  { id: 'flame', label: 'Inferno', emoji: '🔥', desc: 'Streak Striker' },
  { id: 'shield', label: 'Aegis', emoji: '🛡️', desc: 'Defensive Fort' },
  { id: 'target', label: 'Bullseye', emoji: '🎯', desc: 'High Accuracy' },
  { id: 'compass', label: 'Wayfinder', emoji: '🧭', desc: 'Tactical Mind' },
  { id: 'brain', label: 'Cortex', emoji: '🧠', desc: 'Theory Master' },
  { id: 'crown', label: 'Sovereign', emoji: '👑', desc: 'Apex Ranker' },
  { id: 'swords', label: 'Dual Blades', emoji: '⚔️', desc: 'Duel Duelist' },
];

const TITLE_OPTIONS = [
  'JEE Aspirant',
  'Kota Star Batch',
  'Calculus Prodigy',
  'Mechanics Maestro',
  'Organic Alchemist',
  'Olympiad Medalist',
  'Speed Demon',
  '100 Percentiler',
  'Rank 1 Contender',
  'Problem Buster',
];

const COLLEGE_OPTIONS = [
  'IIT Bombay (Computer Science)',
  'IIT Delhi (Mathematics & Computing)',
  'IIT Madras (Electrical Engineering)',
  'IIT Kanpur (Aerospace Engineering)',
  'IIT Kharagpur (Computer Science)',
  'IIT Roorkee (Data Science)',
  'IIT Guwahati (Computer Science)',
  'BITS Pilani (Computer Science)',
  'NIT Trichy (Computer Science)',
  'IIIT Hyderabad (Computer Science)',
];

const BANNER_THEMES = [
  { id: 'orange_cyber', label: 'Cyberpunk Orange', swatch: 'from-orange-500 to-amber-500', border: 'border-orange-500' },
  { id: 'quantum_neon', label: 'Quantum Neon', swatch: 'from-cyan-400 to-blue-600', border: 'border-cyan-500' },
  { id: 'galaxy_navy', label: 'Galaxy Navy', swatch: 'from-purple-500 to-indigo-600', border: 'border-purple-500' },
  { id: 'golden_aureolin', label: 'Golden Aureolin', swatch: 'from-yellow-400 to-amber-600', border: 'border-yellow-500' },
];

const DEFAULT_PRESETS = [
  'Well played!',
  'Good luck, have fun!',
  'Calculations were off!',
  'GG WP!',
  'Need to revise this chapter!',
];

export default function SettingsView({
  user,
  onUpdateUser,
  onLogout,
  onNavigateTab,
  isActive
}) {
  const [activeSection, setActiveSection] = useState('account'); // 'account' or 'chat'
  
  // Feedback states
  const [accountSuccess, setAccountSuccess] = useState('');
  const [accountError, setAccountError] = useState('');
  const [chatSuccess, setChatSuccess] = useState('');
  const [chatError, setChatError] = useState('');
  const [savingAccount, setSavingAccount] = useState(false);
  const [savingChat, setSavingChat] = useState(false);

  // --- ACCOUNT FORM STATES ---
  const [username, setUsername] = useState(user?.username || '');
  const [avatarId, setAvatarId] = useState(user?.avatar_id || 'atom');
  const [title, setTitle] = useState(user?.title || 'JEE Aspirant');
  const [targetExam, setTargetExam] = useState(user?.target_exam || 'MIXED');
  const [targetCollege, setTargetCollege] = useState(user?.target_college || 'IIT Bombay (Computer Science)');
  const [targetExamDate, setTargetExamDate] = useState(user?.target_exam_date || 'JEE Main Jan 2026');
  const [bio, setBio] = useState(user?.bio || '');
  const [bannerTheme, setBannerTheme] = useState(user?.banner_theme || 'orange_cyber');

  // Security PIN states
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showCurrentPin, setShowCurrentPin] = useState(false);
  const [showNewPin, setShowNewPin] = useState(false);
  const [changingPin, setChangingPin] = useState(false);
  const [pinSuccess, setPinSuccess] = useState('');
  const [pinError, setPinError] = useState('');

  // Callsign update state
  const [changingUsername, setChangingUsername] = useState(false);
  const [usernameSuccess, setUsernameSuccess] = useState('');
  const [usernameError, setUsernameError] = useState('');

  // Danger zone reset modal
  const [resetModalOpen, setResetModalOpen] = useState(false);
  const [resettingData, setResettingData] = useState(false);

  // Danger zone delete account modal
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletePin, setDeletePin] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteError, setDeleteError] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);

  // Remember Me & Saved Accounts State
  const [rememberMeActive, setRememberMeActive] = useState(() => isRememberMeEnabled());
  const [savedDeviceAccounts, setSavedDeviceAccounts] = useState(() => getSavedAccounts());

  const handleToggleRememberMe = (enabled) => {
    sound.click();
    setRememberMeActive(enabled);
    setRememberMePreference(enabled);
  };

  const handleRemoveDeviceAccount = (username) => {
    sound.click();
    removeSavedAccount(username);
    setSavedDeviceAccounts(getSavedAccounts());
  };

  // --- CHAT FORM STATES ---
  const currentChat = user?.chat_settings || {};
  const [quickChatEnabled, setQuickChatEnabled] = useState(
    currentChat.quick_chat_enabled !== false
  );
  const [chatSoundFx, setChatSoundFx] = useState(
    currentChat.sound_effects !== false
  );
  const [chatVolume, setChatVolume] = useState(
    typeof currentChat.chat_volume === 'number' ? currentChat.chat_volume : 80
  );
  const [challengePrivacy, setChallengePrivacy] = useState(
    currentChat.challenge_privacy || 'EVERYONE'
  );
  const [presenceStatus, setPresenceStatus] = useState(
    currentChat.presence_status || 'ONLINE'
  );
  const [profanityFilter, setProfanityFilter] = useState(
    currentChat.profanity_filter !== false
  );
  const [lobbyChatEnabled, setLobbyChatEnabled] = useState(
    currentChat.lobby_chat_enabled !== false
  );
  const [chatPresets, setChatPresets] = useState(() => {
    if (Array.isArray(currentChat.presets) && currentChat.presets.length > 0) {
      return currentChat.presets.slice(0, 5);
    }
    return [...DEFAULT_PRESETS];
  });

  // Keep state synced with user prop
  useEffect(() => {
    if (user) {
      setUsername(user.username || '');
      setAvatarId(user.avatar_id || 'atom');
      setTitle(user.title || 'JEE Aspirant');
      setTargetExam(user.target_exam || 'MIXED');
      setTargetCollege(user.target_college || 'IIT Bombay (Computer Science)');
      setTargetExamDate(user.target_exam_date || 'JEE Main Jan 2026');
      setBio(user.bio || '');
      setBannerTheme(user.banner_theme || 'orange_cyber');

      const cs = user.chat_settings || {};
      setQuickChatEnabled(cs.quick_chat_enabled !== false);
      setChatSoundFx(cs.sound_effects !== false);
      setChatVolume(typeof cs.chat_volume === 'number' ? cs.chat_volume : 80);
      setChallengePrivacy(cs.challenge_privacy || 'EVERYONE');
      setPresenceStatus(cs.presence_status || 'ONLINE');
      setProfanityFilter(cs.profanity_filter !== false);
      setLobbyChatEnabled(cs.lobby_chat_enabled !== false);
      if (Array.isArray(cs.presets) && cs.presets.length > 0) {
        setChatPresets(cs.presets.slice(0, 5));
      }
    }
  }, [user]);

  // Handle Callsign change
  const handleChangeUsername = async (e) => {
    e.preventDefault();
    setUsernameError('');
    setUsernameSuccess('');

    const trimmed = username.trim();
    if (trimmed === user?.username) {
      setUsernameError('No change detected. Enter a new callsign.');
      return;
    }
    if (trimmed.length < 3 || trimmed.length > 20) {
      setUsernameError('Callsign must be 3-20 characters.');
      return;
    }
    if (!/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
      setUsernameError('Callsign can only contain letters, numbers, _, -');
      return;
    }

    setChangingUsername(true);
    try {
      sound.click();
      const res = await api.auth.changeUsername(trimmed);
      if (res.token) {
        setToken(res.token, rememberMeActive);
      }
      if (res.user) {
        setCachedUser(res.user);
        recordSavedAccount(res.user, res.token);
        try {
          localStorage.setItem('jee_saved_username', trimmed);
        } catch (_) {}
        setSavedDeviceAccounts(getSavedAccounts());
        if (onUpdateUser) onUpdateUser(res.user);
      }
      setUsernameSuccess(`Callsign successfully updated to ${trimmed}!`);
      setTimeout(() => setUsernameSuccess(''), 4000);
    } catch (err) {
      setUsernameError(err.message || 'Failed to change callsign.');
    } finally {
      setChangingUsername(false);
    }
  };

  // Handle PIN change
  const handleChangePin = async (e) => {
    e.preventDefault();
    setPinError('');
    setPinSuccess('');

    if (!currentPin) {
      setPinError('Please enter your current PIN.');
      return;
    }
    if (newPin.length < 4 || newPin.length > 32) {
      setPinError('New PIN must be 4 to 32 characters.');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('New PIN and confirmation do not match.');
      return;
    }

    setChangingPin(true);
    try {
      sound.click();
      const res = await api.auth.changePin(currentPin, newPin);
      if (res?.token) {
        setToken(res.token, rememberMeActive);
      }
      if (res?.user) {
        setCachedUser(res.user);
        recordSavedAccount(res.user, res.token, newPin);
        setSavedDeviceAccounts(getSavedAccounts());
        if (onUpdateUser) onUpdateUser(res.user);
      }
      setPinSuccess('Security PIN updated successfully.');
      setCurrentPin('');
      setNewPin('');
      setConfirmPin('');
      setTimeout(() => setPinSuccess(''), 4000);
    } catch (err) {
      setPinError(err.message || 'Failed to update PIN.');
    } finally {
      setChangingPin(false);
    }
  };

  // Handle Account Profile Save
  const handleSaveAccountProfile = async () => {
    setAccountError('');
    setAccountSuccess('');
    setSavingAccount(true);

    try {
      sound.click();
      const payload = {
        avatar_id: avatarId,
        title,
        target_exam: targetExam,
        target_college: targetCollege,
        target_exam_date: targetExamDate,
        bio,
        banner_theme: bannerTheme,
      };

      const updated = await api.auth.updateProfile(payload);
      setCachedUser(updated);
      recordSavedAccount(updated);
      setSavedDeviceAccounts(getSavedAccounts());
      if (onUpdateUser) {
        onUpdateUser(updated);
      }
      setAccountSuccess('Account profile saved successfully!');
      setTimeout(() => setAccountSuccess(''), 3000);
    } catch (err) {
      setAccountError(err.message || 'Failed to save account profile.');
    } finally {
      setSavingAccount(false);
    }
  };

  // Handle Chat Settings Save
  const handleSaveChatSettings = async () => {
    setChatError('');
    setChatSuccess('');
    setSavingChat(true);

    try {
      sound.click();
      const chatPayload = {
        quick_chat_enabled: quickChatEnabled,
        sound_effects: chatSoundFx,
        chat_volume: chatVolume,
        challenge_privacy: challengePrivacy,
        presence_status: presenceStatus,
        profanity_filter: profanityFilter,
        lobby_chat_enabled: lobbyChatEnabled,
        presets: chatPresets.map((p) => p.trim()).filter(Boolean),
      };

      const updated = await api.auth.updateChatSettings(chatPayload);
      if (onUpdateUser) {
        onUpdateUser(updated);
      }
      setChatSuccess('Chat & Duel preferences saved successfully!');
      setTimeout(() => setChatSuccess(''), 3000);
    } catch (err) {
      setChatError(err.message || 'Failed to save chat settings.');
    } finally {
      setSavingChat(false);
    }
  };

  // Handle Preset Slot Change
  const handlePresetChange = (index, value) => {
    const next = [...chatPresets];
    next[index] = value;
    setChatPresets(next);
  };

  // Reset Presets to defaults
  const handleResetPresets = () => {
    sound.click();
    setChatPresets([...DEFAULT_PRESETS]);
  };

  // Handle Reset Practice Data (Danger Zone)
  const handleConfirmResetData = async () => {
    setResettingData(true);
    try {
      sound.click();
      const res = await api.auth.resetData();
      if (res.user && onUpdateUser) {
        onUpdateUser(res.user);
      }
      setResetModalOpen(false);
      setAccountSuccess('Practice data reset to zero successfully.');
      setTimeout(() => setAccountSuccess(''), 4000);
    } catch (err) {
      setAccountError(err.message || 'Failed to reset practice data.');
      setResetModalOpen(false);
    } finally {
      setResettingData(false);
    }
  };

  // Handle Permanent Account Deletion (Danger Zone)
  const handleConfirmDeleteAccount = async (e) => {
    e?.preventDefault();
    if (!deletePin.trim()) {
      setDeleteError('Please enter your security PIN to confirm deletion.');
      return;
    }
    if (deleteConfirmation.trim().toUpperCase() !== 'DELETE') {
      setDeleteError('Please type DELETE to confirm permanent account purge.');
      return;
    }

    setDeletingAccount(true);
    setDeleteError('');
    try {
      sound.click();
      await api.auth.deleteAccount(deletePin.trim(), deleteConfirmation.trim());
      sound.correct();
      if (user?.username) {
        removeSavedAccount(user.username);
      }
      setToken('', false);
      setDeleteModalOpen(false);
      if (onLogout) {
        onLogout();
      } else {
        window.location.reload();
      }
    } catch (err) {
      setDeleteError(err.message || 'Failed to delete account. Please verify your PIN.');
    } finally {
      setDeletingAccount(false);
    }
  };

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <Shield className="w-16 h-16 text-slate-600 mb-4 animate-pulse" />
        <h2 className="text-xl font-bold text-slate-300">Sign In Required</h2>
        <p className="text-sm text-slate-500 mt-2 max-w-sm">
          Please authenticate your aspirant account to view and modify your profile, security, and chat settings.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-orange-500/10 border border-orange-500/30 rounded-xl text-orange-400">
              <Sliders className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-white tracking-wide flex items-center gap-2">
                SETTINGS CONSOLE
                <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                  v2.4
                </span>
              </h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Customize your combat identity, security PIN, match privacy, and duel communication.
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher Pills */}
        <div className="flex items-center gap-1.5 p-1 bg-[#121622] rounded-xl border border-white/10 shrink-0">
          <button
            type="button"
            onClick={() => {
              sound.click();
              setActiveSection('account');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSection === 'account'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <User className="w-3.5 h-3.5" />
            <span>Account & Identity</span>
          </button>

          <button
            type="button"
            onClick={() => {
              sound.click();
              setActiveSection('chat');
            }}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
              activeSection === 'chat'
                ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md shadow-orange-950/40'
                : 'text-slate-400 hover:text-white hover:bg-white/5'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Chat & Duel Comms</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. ACCOUNT & IDENTITY SECTION */}
      {/* ========================================================================= */}
      {activeSection === 'account' && (
        <div className="space-y-6">
          {/* Notification Alerts */}
          {accountSuccess && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{accountSuccess}</span>
            </div>
          )}
          {accountError && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center gap-2 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{accountError}</span>
            </div>
          )}

          {/* Card 1: Callsign & Combat Identity Overview */}
          <div className="bg-[#121622] border border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-orange-500/5 rounded-full blur-3xl pointer-events-none" />

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-white/5">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/20 border border-orange-500/40 flex items-center justify-center text-3xl shadow-lg">
                  {AVATAR_OPTIONS.find((a) => a.id === avatarId)?.emoji || '⚛️'}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-black text-white">{user.username}</span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-orange-500/20 text-orange-400 border border-orange-500/30">
                      {user.current_division}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {title} • <span className="text-orange-400 font-mono font-bold">{Math.round(user.overall_elo)} Elo</span> •{' '}
                    <span className="text-amber-400 font-mono font-bold">{user.weekly_rp} RP</span>
                  </p>
                </div>
              </div>

              <div className="text-right sm:border-l sm:border-white/10 sm:pl-6 text-xs text-slate-500 font-mono">
                <div>Aspirant ID:</div>
                <div className="text-slate-300 text-[11px] truncate max-w-[180px]">{user.id}</div>
              </div>
            </div>

            {/* Callsign Editor Form */}
            <form onSubmit={handleChangeUsername} className="pt-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1 space-y-1.5">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-orange-400" />
                    Change Callsign (Username)
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Enter new username"
                    maxLength={20}
                    className="w-full px-3.5 py-2.5 bg-[#0a0d14] border border-white/15 focus:border-orange-500 rounded-xl text-white text-xs font-mono tracking-wide placeholder-slate-600 focus:outline-none transition"
                  />
                </div>
                <button
                  type="submit"
                  disabled={changingUsername || username.trim() === user.username}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                    username.trim() === user.username
                      ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                      : 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-950/40 glow-orange-subtle'
                  }`}
                >
                  {changingUsername ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  <span>Update Callsign</span>
                </button>
              </div>

              {usernameSuccess && (
                <p className="text-xs text-emerald-400 flex items-center gap-1.5 animate-fadeIn">
                  <Check className="w-3.5 h-3.5" /> {usernameSuccess}
                </p>
              )}
              {usernameError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5 animate-fadeIn">
                  <AlertTriangle className="w-3.5 h-3.5" /> {usernameError}
                </p>
              )}
              <p className="text-[11px] text-slate-500">
                Note: Changing your callsign updates your public identity across leaderboards, match histories, and speed duels.
              </p>
            </form>
          </div>

          {/* Card 2: Combat Avatar Gallery */}
          <div className="bg-[#121622] border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-orange-400" />
                Combat Avatar Sigil
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Choose the emblem displayed alongside your name in arenas and matchmaking rooms.
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2">
              {AVATAR_OPTIONS.map((item) => {
                const isSelected = avatarId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      sound.click();
                      setAvatarId(item.id);
                    }}
                    className={`p-3 rounded-xl border text-center transition flex flex-col items-center gap-1.5 cursor-pointer relative ${
                      isSelected
                        ? 'bg-orange-500/15 border-orange-500 ring-2 ring-orange-500/40 text-white shadow-lg shadow-orange-950/40'
                        : 'bg-[#0e121c] border-white/5 hover:border-white/20 text-slate-400 hover:text-white'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-400 ring-2 ring-orange-500/50" />
                    )}
                    <span className="text-2xl">{item.emoji}</span>
                    <span className="text-xs font-bold truncate max-w-full">{item.label}</span>
                    <span className="text-[10px] text-slate-500 truncate max-w-full">{item.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Card 3: Aspirant Title & Goal Alignment */}
          <div className="bg-[#121622] border border-white/10 rounded-2xl p-6 shadow-xl space-y-5">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Title & Academic Focus
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Define your aspirant title, target exam syllabus, and target engineering institution.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {/* Title Selector */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-400" />
                  Combat Title / Flair
                </label>
                <select
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0a0d14] border border-white/15 focus:border-orange-500 rounded-xl text-white text-xs font-semibold focus:outline-none transition cursor-pointer"
                >
                  {TITLE_OPTIONS.map((t) => (
                    <option key={t} value={t} className="bg-[#121622] text-white">
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Exam Focus */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Target className="w-3.5 h-3.5 text-orange-400" />
                  Primary Syllabus Focus
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'MAIN', label: 'JEE Main' },
                    { id: 'ADVANCED', label: 'JEE Adv' },
                    { id: 'MIXED', label: 'Mixed / Dual' },
                  ].map((ex) => (
                    <button
                      key={ex.id}
                      type="button"
                      onClick={() => {
                        sound.click();
                        setTargetExam(ex.id);
                      }}
                      className={`py-2 rounded-xl text-xs font-bold border transition text-center cursor-pointer ${
                        targetExam === ex.id
                          ? 'bg-orange-500/20 border-orange-500 text-orange-300'
                          : 'bg-[#0a0d14] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      {ex.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Target College */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-blue-400" />
                  Target Engineering College
                </label>
                <input
                  type="text"
                  list="college-list"
                  value={targetCollege}
                  onChange={(e) => setTargetCollege(e.target.value)}
                  placeholder="e.g. IIT Bombay (Computer Science)"
                  className="w-full px-3.5 py-2.5 bg-[#0a0d14] border border-white/15 focus:border-orange-500 rounded-xl text-white text-xs focus:outline-none transition"
                />
                <datalist id="college-list">
                  {COLLEGE_OPTIONS.map((col) => (
                    <option key={col} value={col} />
                  ))}
                </datalist>
              </div>

              {/* Target Exam Date */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" />
                  Target Exam Session
                </label>
                <select
                  value={targetExamDate}
                  onChange={(e) => setTargetExamDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#0a0d14] border border-white/15 focus:border-orange-500 rounded-xl text-white text-xs font-semibold focus:outline-none transition cursor-pointer"
                >
                  <option value="JEE Main Jan 2026">JEE Main Jan 2026</option>
                  <option value="JEE Main Apr 2026">JEE Main Apr 2026</option>
                  <option value="JEE Advanced 2026">JEE Advanced 2026</option>
                  <option value="JEE Main Jan 2027">JEE Main Jan 2027</option>
                  <option value="JEE Advanced 2027">JEE Advanced 2027</option>
                </select>
              </div>
            </div>

            {/* Bio / Aspirant Motto */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5 text-orange-400" />
                Aspirant Motto / Bio
              </label>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                maxLength={140}
                rows={2}
                placeholder="Share your battle motto or goals..."
                className="w-full px-3.5 py-2.5 bg-[#0a0d14] border border-white/15 focus:border-orange-500 rounded-xl text-white text-xs focus:outline-none transition resize-none"
              />
              <div className="text-[11px] text-slate-500 text-right">
                {bio.length}/140 characters
              </div>
            </div>

            {/* Banner Theme Selection */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-slate-300">
                Profile Banner Glow Style
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {BANNER_THEMES.map((theme) => {
                  const isSel = bannerTheme === theme.id;
                  return (
                    <button
                      key={theme.id}
                      type="button"
                      onClick={() => {
                        sound.click();
                        setBannerTheme(theme.id);
                      }}
                      className={`p-2.5 rounded-xl border text-left flex items-center gap-2.5 transition cursor-pointer ${
                        isSel
                          ? 'bg-[#181d2c] border-white/40 ring-1 ring-white/30 text-white'
                          : 'bg-[#0a0d14] border-white/5 text-slate-400 hover:text-white'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded-full bg-gradient-to-r ${theme.swatch} shrink-0`} />
                      <span className="text-xs font-bold truncate">{theme.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Save Account Profile Button */}
            <div className="pt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveAccountProfile}
                disabled={savingAccount}
                className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-orange-950/40 flex items-center gap-2 cursor-pointer glow-orange-subtle"
              >
                {savingAccount ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Profile Preferences</span>
              </button>
            </div>
          </div>

          {/* Card 4: Security PIN Change */}
          <div className="bg-[#121622] border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Lock className="w-4 h-4 text-orange-400" />
                Account Security PIN
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Change your 4-digit numeric login PIN code. Keep this confidential.
              </p>
            </div>

            <form onSubmit={handleChangePin} className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Current PIN */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Current PIN / Passcode</label>
                  <div className="relative">
                    <input
                      type={showCurrentPin ? 'text' : 'password'}
                      value={currentPin}
                      onChange={(e) => setCurrentPin(e.target.value)}
                      placeholder="••••"
                      maxLength={32}
                      className="w-full px-3.5 py-2.5 bg-[#0a0d14] border border-white/15 focus:border-orange-500 rounded-xl text-white text-xs font-mono tracking-widest placeholder-slate-600 focus:outline-none transition pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPin(!showCurrentPin)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {showCurrentPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* New PIN */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">New PIN (4-32 chars)</label>
                  <div className="relative">
                    <input
                      type={showNewPin ? 'text' : 'password'}
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value)}
                      placeholder="••••"
                      maxLength={32}
                      className="w-full px-3.5 py-2.5 bg-[#0a0d14] border border-white/15 focus:border-orange-500 rounded-xl text-white text-xs font-mono tracking-widest placeholder-slate-600 focus:outline-none transition pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPin(!showNewPin)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 cursor-pointer"
                    >
                      {showNewPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>

                {/* Confirm New PIN */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">Confirm New PIN</label>
                  <input
                    type="password"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value)}
                    placeholder="••••"
                    maxLength={32}
                    className="w-full px-3.5 py-2.5 bg-[#0a0d14] border border-white/15 focus:border-orange-500 rounded-xl text-white text-xs font-mono tracking-widest placeholder-slate-600 focus:outline-none transition"
                  />
                </div>
              </div>

              {pinSuccess && (
                <p className="text-xs text-emerald-400 flex items-center gap-1.5 animate-fadeIn">
                  <Check className="w-3.5 h-3.5" /> {pinSuccess}
                </p>
              )}
              {pinError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5 animate-fadeIn">
                  <AlertTriangle className="w-3.5 h-3.5" /> {pinError}
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={changingPin || !currentPin || !newPin}
                  className={`px-5 py-2.5 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer ${
                    !currentPin || !newPin
                      ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                      : 'bg-orange-500 hover:bg-orange-400 text-white shadow-lg shadow-orange-950/40'
                  }`}
                >
                  {changingPin ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Lock className="w-3.5 h-3.5" />}
                  <span>Update Security PIN</span>
                </button>
              </div>
            </form>
          </div>

          {/* Card 4.5: Device Persistence & Remember Me */}
          <div className="bg-[#202636] border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <Shield className="w-4 h-4 text-orange-400" />
                  Device Persistence & Remember Me
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Control whether this browser remembers your session across reboots and cold starts.
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleToggleRememberMe(!rememberMeActive)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 border ${
                  rememberMeActive
                    ? 'bg-orange-950/60 border-orange-500/50 text-orange-300 ring-1 ring-orange-500/30'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {rememberMeActive ? <CheckCircle2 className="w-4 h-4 text-orange-400" /> : <Lock className="w-4 h-4" />}
                <span>{rememberMeActive ? 'Remember Me: ON' : 'Remember Me: OFF'}</span>
              </button>
            </div>

            <div className="p-3.5 rounded-xl bg-[#171c28] border border-white/5 flex items-center justify-between text-xs">
              <span className="text-slate-300">
                {rememberMeActive
                  ? '✓ Account credentials and combat token remain securely saved on this device indefinitely.'
                  : '⚠️ Session only mode. You will need your PIN to sign back in after closing your browser.'}
              </span>
            </div>

            {savedDeviceAccounts.length > 0 && (
              <div className="pt-2 border-t border-white/10">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                  Saved Aspirant Profiles on this device ({savedDeviceAccounts.length})
                </div>
                <div className="flex flex-wrap gap-2">
                  {savedDeviceAccounts.map((acc) => {
                    const isCurrent = acc.username?.toLowerCase() === user.username?.toLowerCase();
                    return (
                      <div
                        key={acc.username}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition ${
                          isCurrent
                            ? 'bg-orange-950/60 border-orange-500/50 text-orange-200'
                            : 'bg-[#262c3c] border-white/10 text-slate-300'
                        }`}
                      >
                        <span className="font-bold">{acc.username}</span>
                        <span className="text-[10px] text-orange-400 font-mono">({acc.overall_elo} Elo)</span>
                        {!isCurrent && (acc.token || acc.pin) && (
                          <button
                            type="button"
                            onClick={async () => {
                              try {
                                sound.click();
                                const switched = await switchSavedAccount(acc.username);
                                if (onUpdateUser) onUpdateUser(switched);
                                setAccountSuccess(`Switched to ${acc.username}!`);
                                setTimeout(() => setAccountSuccess(''), 3000);
                              } catch (err) {
                                setAccountError(err.message || 'Failed to switch profile.');
                              }
                            }}
                            className="px-2 py-0.5 rounded bg-orange-600/30 hover:bg-orange-600 text-[10px] text-orange-300 hover:text-white font-bold transition cursor-pointer flex items-center gap-1"
                          >
                            <span>Switch</span>
                            <ArrowRight className="w-2.5 h-2.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveDeviceAccount(acc.username)}
                          title="Forget profile from this device"
                          className="text-slate-500 hover:text-red-400 transition cursor-pointer p-0.5 ml-1"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Card 5: Danger Zone & Session Logout */}
          <div className="bg-red-950/15 border border-red-500/30 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-sm font-black text-red-400 uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                Danger Zone & Session Control
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Actions here impact your active session or reset recorded practice drill metrics.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
              <div>
                <div className="text-xs font-bold text-white">Reset Practice Statistics</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Wipes your practice drill attempt logs and accuracy stats. Your account, credentials, and friends remain intact.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetModalOpen(true)}
                className="px-4 py-2 bg-red-950/60 hover:bg-red-900/60 border border-red-500/50 hover:border-red-400 text-red-300 font-bold text-xs rounded-xl transition cursor-pointer shrink-0"
              >
                Reset Drill Stats
              </button>
            </div>

            <div className="border-t border-red-500/20 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-white">End Current Session</div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Log out of this browser device. You will need your PIN to sign back in.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  onLogout();
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-300 font-bold text-xs rounded-xl transition flex items-center gap-2 cursor-pointer shrink-0"
              >
                <LogOut className="w-3.5 h-3.5 text-red-400" />
                <span>Sign Out</span>
              </button>
            </div>

            <div className="border-t border-red-500/20 pt-4 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <div className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Aspirant Account</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  Permanently deletes your account callsign, rating Elo, bookmarks, friendships, and leaderboard rankings. Irreversible.
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  sound.click();
                  setDeletePin('');
                  setDeleteConfirmation('');
                  setDeleteError('');
                  setDeleteModalOpen(true);
                }}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-black text-xs rounded-xl transition cursor-pointer shrink-0 shadow-lg shadow-red-950/60"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. CHAT & DUEL COMMS SECTION */}
      {/* ========================================================================= */}
      {activeSection === 'chat' && (
        <div className="space-y-6">
          {/* Feedback alerts */}
          {chatSuccess && (
            <div className="p-3.5 bg-emerald-500/10 border border-emerald-500/40 rounded-xl text-emerald-300 text-xs flex items-center gap-2 animate-fadeIn">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{chatSuccess}</span>
            </div>
          )}
          {chatError && (
            <div className="p-3.5 bg-red-500/10 border border-red-500/40 rounded-xl text-red-300 text-xs flex items-center gap-2 animate-fadeIn">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{chatError}</span>
            </div>
          )}

          {/* Card 1: Speed Duel Quick Chat & Presets */}
          <div className="bg-[#121622] border border-white/10 rounded-2xl p-6 shadow-xl space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
              <div>
                <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-orange-400" />
                  Speed Duel Quick Chat
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Send rapid tactical phrases during live 1v1 battles with one tap.
                </p>
              </div>

              {/* Master Toggle */}
              <label className="flex items-center gap-3 cursor-pointer select-none">
                <span className="text-xs font-bold text-slate-300">Enable Quick Chat</span>
                <div
                  onClick={() => {
                    sound.click();
                    setQuickChatEnabled(!quickChatEnabled);
                  }}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                    quickChatEnabled ? 'bg-orange-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition ${
                      quickChatEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </label>
            </div>

            {/* Quick Chat Presets Slots */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  Customized Quick Chat Slots (5 Presets)
                </label>
                <button
                  type="button"
                  onClick={handleResetPresets}
                  className="text-[11px] text-orange-400 hover:text-orange-300 underline cursor-pointer"
                >
                  Reset to Defaults
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2.5">
                {chatPresets.map((preset, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-lg bg-[#0a0d14] border border-white/10 text-orange-400 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      #{idx + 1}
                    </span>
                    <input
                      type="text"
                      value={preset}
                      onChange={(e) => handlePresetChange(idx, e.target.value)}
                      placeholder={`Custom preset phrase #${idx + 1}`}
                      maxLength={40}
                      disabled={!quickChatEnabled}
                      className="flex-1 px-3.5 py-2 bg-[#0a0d14] border border-white/15 focus:border-orange-500 rounded-xl text-white text-xs focus:outline-none transition disabled:opacity-50"
                    />
                  </div>
                ))}
              </div>

              {/* Live Preview Bubble */}
              <div className="pt-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  In-Duel Bubble Preview
                </div>
                <div className="p-3 bg-[#0a0d14] rounded-xl border border-white/10 flex flex-wrap gap-2">
                  {chatPresets.map((preset, idx) => (
                    <span
                      key={idx}
                      className="px-2.5 py-1 bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-lg text-xs font-medium"
                    >
                      💬 {preset || `Preset #${idx + 1}`}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Audio & Sound Effects */}
          <div className="bg-[#121622] border border-white/10 rounded-2xl p-6 shadow-xl space-y-4">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-cyan-400" />
                Audio & Emote Sound Effects
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Configure auditory chimes on incoming quick chats, match challenges, and opponent emotes.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 pt-2">
              {/* Sound FX Toggle */}
              <div className="p-4 bg-[#0a0d14] border border-white/10 rounded-xl flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="text-xs font-bold text-white flex items-center gap-1.5">
                    {chatSoundFx ? <Volume2 className="w-3.5 h-3.5 text-cyan-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-500" />}
                    <span>Chat Sound FX</span>
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Play soft chime when opponent pings quick chat.
                  </div>
                </div>
                <div
                  onClick={() => {
                    sound.click();
                    setChatSoundFx(!chatSoundFx);
                  }}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer shrink-0 ${
                    chatSoundFx ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition ${
                      chatSoundFx ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>

              {/* Volume Slider */}
              <div className="p-4 bg-[#0a0d14] border border-white/10 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">Comms Volume</span>
                  <span className="text-xs font-mono font-bold text-cyan-400">{chatVolume}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={chatVolume}
                  onChange={(e) => setChatVolume(Number(e.target.value))}
                  onMouseUp={() => sound.click()}
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Card 3: Challenge Privacy & Online Presence */}
          <div className="bg-[#121622] border border-white/10 rounded-2xl p-6 shadow-xl space-y-5">
            <div>
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <Shield className="w-4 h-4 text-emerald-400" />
                Duel Privacy & Online Presence
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Control who can challenge you to instant Speed Duels and set your focus presence.
              </p>
            </div>

            {/* Direct Challenge Privacy */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                1v1 Duel Challenge Reception
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    id: 'EVERYONE',
                    label: 'Everyone',
                    icon: '🌐',
                    desc: 'Any rival in the arena can send duel invitations.',
                  },
                  {
                    id: 'FRIENDS_ONLY',
                    label: 'Friends Only',
                    icon: '👥',
                    desc: 'Only accepted study squad members can challenge you.',
                  },
                  {
                    id: 'NONE',
                    label: 'Disabled',
                    icon: '🚫',
                    desc: 'Block all incoming 1v1 challenges (Solo Focus).',
                  },
                ].map((item) => {
                  const isSel = challengePrivacy === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        sound.click();
                        setChallengePrivacy(item.id);
                      }}
                      className={`p-3.5 rounded-xl border text-left transition cursor-pointer relative ${
                        isSel
                          ? 'bg-emerald-500/15 border-emerald-500 ring-1 ring-emerald-500/40 text-white'
                          : 'bg-[#0a0d14] border-white/10 hover:border-white/20 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-xs font-bold text-white">{item.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                        {item.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Presence Status */}
            <div className="space-y-2 pt-1">
              <label className="text-xs font-bold text-slate-300">
                Online Presence Status
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {[
                  {
                    id: 'ONLINE',
                    label: 'Online & Active',
                    color: 'bg-emerald-500',
                    desc: 'Shown as active to friends and rivals.',
                  },
                  {
                    id: 'DND',
                    label: 'Deep Study (DND)',
                    color: 'bg-amber-500',
                    desc: 'Shown as studying; challenge popups silenced.',
                  },
                  {
                    id: 'INVISIBLE',
                    label: 'Invisible',
                    color: 'bg-slate-500',
                    desc: 'Appear offline while playing drills.',
                  },
                ].map((item) => {
                  const isSel = presenceStatus === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        sound.click();
                        setPresenceStatus(item.id);
                      }}
                      className={`p-3.5 rounded-xl border text-left transition cursor-pointer ${
                        isSel
                          ? 'bg-slate-800/80 border-white/30 text-white'
                          : 'bg-[#0a0d14] border-white/10 text-slate-400 hover:text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${item.color}`} />
                        <span className="text-xs font-bold text-white">{item.label}</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {item.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lobby Chat & Moderation Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <div className="p-3.5 bg-[#0a0d14] border border-white/10 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Room Lobby Chat</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Show public lobby messaging in rooms.</div>
                </div>
                <div
                  onClick={() => {
                    sound.click();
                    setLobbyChatEnabled(!lobbyChatEnabled);
                  }}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer shrink-0 ${
                    lobbyChatEnabled ? 'bg-orange-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition ${
                      lobbyChatEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>

              <div className="p-3.5 bg-[#0a0d14] border border-white/10 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-white">Profanity Filter</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Auto-censor offensive language.</div>
                </div>
                <div
                  onClick={() => {
                    sound.click();
                    setProfanityFilter(!profanityFilter);
                  }}
                  className={`w-11 h-6 flex items-center rounded-full p-1 transition cursor-pointer shrink-0 ${
                    profanityFilter ? 'bg-orange-500' : 'bg-slate-700'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform transition ${
                      profanityFilter ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Save Chat Settings Button */}
            <div className="pt-3 flex justify-end">
              <button
                type="button"
                onClick={handleSaveChatSettings}
                disabled={savingChat}
                className="px-6 py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-orange-950/40 flex items-center gap-2 cursor-pointer glow-orange-subtle"
              >
                {savingChat ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Save Chat Preferences</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Danger Zone Reset Confirmation Modal */}
      {resetModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#121622] border border-red-500/50 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-lg font-black text-white">Reset Drill Statistics?</h3>
              <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                This will delete your activity logs, adaptive sprint history, and reset your total questions solved to 0.
                Your account, PIN, and friends list will NOT be deleted.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setResetModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmResetData}
                disabled={resettingData}
                className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer shadow-lg shadow-red-950/50"
              >
                {resettingData ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                <span>Confirm Reset</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Danger Zone Delete Account Modal */}
      {deleteModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[9999] bg-black/85 backdrop-blur-sm flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#141824] border border-red-500/60 rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-4 animate-scaleUp">
            <div className="flex items-center justify-between">
              <div className="w-12 h-12 rounded-2xl bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-400">
                <Trash2 className="w-6 h-6" />
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="text-lg font-black text-white">Permanently Delete Account?</h3>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                This will irreversibly purge your callsign <strong className="text-white font-mono">{user.username}</strong>, all Elo ratings, study streaks, question bookmarks, friendships, and tournament records.
              </p>
            </div>

            <div className="bg-red-950/40 border border-red-500/30 rounded-xl p-3 text-[11px] text-red-300">
              <strong>Warning:</strong> This action cannot be undone. Once deleted, your callsign will be released and your rank history cannot be recovered.
            </div>

            {deleteError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{deleteError}</span>
              </div>
            )}

            <form onSubmit={handleConfirmDeleteAccount} className="space-y-3 pt-1">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Enter Your Security PIN
                </label>
                <input
                  type="password"
                  required
                  value={deletePin}
                  onChange={(e) => setDeletePin(e.target.value)}
                  placeholder="Security PIN"
                  className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-red-500 transition font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  Type <span className="text-red-400 font-mono font-black">DELETE</span> to confirm
                </label>
                <input
                  type="text"
                  required
                  value={deleteConfirmation}
                  onChange={(e) => setDeleteConfirmation(e.target.value)}
                  placeholder="DELETE"
                  className="w-full px-3.5 py-2.5 bg-black/40 border border-white/10 rounded-xl text-white placeholder-slate-500 text-xs focus:outline-none focus:border-red-500 transition font-mono"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => setDeleteModalOpen(false)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={deletingAccount || deleteConfirmation.trim().toUpperCase() !== 'DELETE'}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white text-xs font-black rounded-xl transition flex items-center gap-2 cursor-pointer shadow-lg shadow-red-950/60 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {deletingAccount ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  <span>Confirm Account Purge</span>
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
