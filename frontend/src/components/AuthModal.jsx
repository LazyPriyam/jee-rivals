import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  setToken,
  setCachedUser,
  recordSavedAccount,
  getSavedAccounts,
  removeSavedAccount,
  isRememberMeEnabled,
  setRememberMePreference
} from '../utils/api';
import {
  Flame,
  Shield,
  Rocket,
  Target,
  Compass,
  Brain,
  Sparkles,
  AlertCircle,
  Eye,
  EyeOff,
  Check,
  X,
  User,
  Trash2,
  Lock,
  ArrowRight
} from 'lucide-react';

const AVATARS = [
  { id: 'atom', label: 'Quantum', icon: '⚛️' },
  { id: 'zap', label: 'Proton', icon: '⚡' },
  { id: 'rocket', label: 'Orbit', icon: '🚀' },
  { id: 'flame', label: 'Plasma', icon: '🔥' },
  { id: 'shield', label: 'Titan', icon: '🛡️' },
  { id: 'target', label: 'Laser', icon: '🎯' },
  { id: 'compass', label: 'Vector', icon: '🧭' },
  { id: 'brain', label: 'Cortex', icon: '🧠' },
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
  default: '⚡',
};

export default function AuthModal({ isOpen, onClose, onSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState(() => {
    try {
      return localStorage.getItem('jee_saved_username') || '';
    } catch (_) {
      return '';
    }
  });
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [selectedAvatar, setSelectedAvatar] = useState('flame');
  const [rememberMe, setRememberMe] = useState(() => isRememberMeEnabled());
  const [savedAccounts, setSavedAccounts] = useState(() => getSavedAccounts());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Refresh saved accounts list whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setSavedAccounts(getSavedAccounts());
      const rememberedUser = localStorage.getItem('jee_saved_username');
      if (rememberedUser && !username) {
        setUsername(rememberedUser);
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectSavedAccount = (acc) => {
    setUsername(acc.username);
    if (acc.avatar_id) {
      setSelectedAvatar(acc.avatar_id);
    }
    setIsRegister(false);
    setError('');
  };

  const handleQuickEnterSavedAccount = async (acc) => {
    if (!acc) return;
    setLoading(true);
    setError('');
    try {
      // 1. Try with active session token first
      if (acc.token) {
        setToken(acc.token, true);
        try {
          const me = await api.auth.getMe();
          setCachedUser(me);
          recordSavedAccount(me, acc.token, acc.pin);
          onSuccess(me);
          if (onClose) onClose();
          return;
        } catch (_) {
          // Token expired, fall through to PIN auto-refresh
        }
      }

      // 2. Try with saved PIN if token failed or was missing
      if (acc.pin) {
        const resp = await api.auth.login(acc.username, acc.pin);
        setToken(resp.token, true);
        setCachedUser(resp.user);
        recordSavedAccount(resp.user, resp.token, acc.pin);
        onSuccess(resp.user);
        if (onClose) onClose();
        return;
      }
    } catch (err) {
      setError(err.message || 'Auto sign-in failed. Please enter your PIN manually.');
    } finally {
      setLoading(false);
    }

    handleSelectSavedAccount(acc);
  };

  const handleRemoveSavedAccount = (e, accUsername) => {
    e.stopPropagation();
    removeSavedAccount(accUsername);
    const updated = getSavedAccounts();
    setSavedAccounts(updated);
    if (username.toLowerCase() === accUsername.toLowerCase()) {
      setUsername(updated[0]?.username || '');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanUser = username.trim();
    const cleanPin = pin.trim();

    if (!cleanUser) {
      setError('Please choose a nickname.');
      return;
    }
    if (cleanPin.length < 4) {
      setError('PIN must be at least 4 characters.');
      return;
    }

    setLoading(true);
    try {
      let resp;
      if (isRegister) {
        resp = await api.auth.register(cleanUser, cleanPin, selectedAvatar);
      } else {
        resp = await api.auth.login(cleanUser, cleanPin);
      }

      // Persist token based on Remember Me choice
      setToken(resp.token, rememberMe);
      setRememberMePreference(rememberMe);

      // Cache user profile for immediate offline & refresh restore
      setCachedUser(resp.user);

      // Save account to persistent device list with active token and PIN
      recordSavedAccount(resp.user, resp.token, rememberMe ? cleanPin : null);
      try {
        localStorage.setItem('jee_saved_username', cleanUser);
      } catch (_) {}

      onSuccess(resp.user);
      if (onClose) onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify your callsign and PIN.');
    } finally {
      setLoading(false);
    }
  };

  const content = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget && onClose) {
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-md bg-[#242a3a] border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl glow-orange-subtle animate-in zoom-in-95 duration-200">
        {/* Modal Close Button */}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition cursor-pointer"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-950/80 border border-orange-500/40 text-orange-400 mb-3 shadow-lg shadow-orange-950/50">
            <Flame className="w-7 h-7 fill-current" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {isRegister ? 'Create Challenger Profile' : 'Enter JEE Rivals Arena'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Zero friction sign-in. Permanent stats, rankings & Elo tracking.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-500/40 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {/* Saved Accounts Quick Selector */}
        {savedAccounts.length > 0 && !isRegister && (
          <div className="mb-5 p-3 rounded-2xl bg-[#1b212f] border border-white/10 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-orange-400" /> Saved Profiles on this Device
              </span>
              <span className="text-[10px] text-slate-500 font-mono">1-Click Sign-in</span>
            </div>
            <div className="space-y-1.5">
              {savedAccounts.map((acc) => {
                const isSelected = username.toLowerCase() === acc.username.toLowerCase();
                const hasToken = Boolean(acc.token || acc.pin);
                return (
                  <div
                    key={acc.username}
                    onClick={() => handleQuickEnterSavedAccount(acc)}
                    className={`flex items-center justify-between p-2.5 rounded-xl border transition cursor-pointer select-none group ${
                      isSelected
                        ? 'bg-orange-950/60 border-orange-500/60 text-orange-200 ring-1 ring-orange-500/40'
                        : 'bg-[#22293b] border-white/10 text-slate-300 hover:border-orange-500/40 hover:bg-[#252d42]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-xl shrink-0">{AVATAR_MAP[acc.avatar_id] || '⚡'}</span>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                          <span>{acc.username}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                            {acc.current_division || 'BRONZE'}
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {acc.overall_elo || 1200} Elo
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleQuickEnterSavedAccount(acc);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-orange-500 hover:bg-orange-400 text-white font-bold text-[11px] shadow transition cursor-pointer flex items-center gap-1"
                      >
                        <span>{hasToken ? 'Enter' : 'Select'}</span>
                        <ArrowRight className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleRemoveSavedAccount(e, acc.username)}
                        title="Forget this account on this device"
                        className="p-1 text-slate-500 hover:text-red-400 rounded transition cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Aspirant Nickname / Callsign
            </label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. Ramanujan_26"
              maxLength={20}
              className="w-full px-4 py-2.5 bg-[#1e2433] border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 transition text-sm font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Security PIN / Passcode
              </label>
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="text-[11px] text-slate-400 hover:text-slate-200 flex items-center gap-1 transition cursor-pointer"
              >
                {showPin ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                <span>{showPin ? 'Hide PIN' : 'Show PIN'}</span>
              </button>
            </div>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                required
                value={pin}
                onChange={(e) => setPin(e.target.value.slice(0, 32))}
                placeholder="4 to 32 digits or characters"
                maxLength={32}
                className="w-full px-4 py-2.5 bg-[#1e2433] border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono text-sm transition pr-10"
              />
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none">
                <Lock className="w-4 h-4 opacity-50" />
              </div>
            </div>
            <span className="text-[10px] text-slate-500 mt-1 block">
              Used to access your stats, ratings and rank from any browser.
            </span>
          </div>

          {isRegister && (
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Combat Avatar
              </label>
              <div className="grid grid-cols-4 gap-2">
                {AVATARS.map((av) => (
                  <button
                    key={av.id}
                    type="button"
                    onClick={() => setSelectedAvatar(av.id)}
                    className={`p-2.5 rounded-xl border flex flex-col items-center gap-1 transition cursor-pointer ${
                      selectedAvatar === av.id
                        ? 'border-orange-500 bg-orange-950/60 shadow-md ring-1 ring-orange-500'
                        : 'border-white/10 bg-[#1e2433] hover:border-white/20'
                    }`}
                  >
                    <span className="text-xl">{av.icon}</span>
                    <span className="text-[10px] text-slate-300 font-bold">{av.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Remember Me Toggle */}
          <div className="flex items-center justify-between pt-1 pb-1 px-1">
            <label className="flex items-center gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-slate-600 bg-[#1e2433] text-orange-500 focus:ring-orange-500 focus:ring-offset-0 transition cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-300 hover:text-white transition">
                Remember Me
              </span>
            </label>
            <span className="text-[10px] text-slate-400 font-mono">
              {rememberMe ? '✓ Saved on this device' : 'Session only'}
            </span>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-extrabold text-sm rounded-xl transition shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-3 glow-orange-subtle"
          >
            {loading ? (
              <span className="animate-pulse">Authorizing...</span>
            ) : (
              <span className="flex items-center gap-2">
                {isRegister ? 'Join Battle Arena' : 'Enter Arena'}
                <ArrowRight className="w-4 h-4" />
              </span>
            )}
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-white/10 text-center">
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError('');
            }}
            className="text-xs text-orange-400 hover:text-orange-300 font-bold transition cursor-pointer"
          >
            {isRegister
              ? 'Already registered? Log in with your PIN'
              : 'New aspirant? Create quick profile in 3 seconds'}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(content, document.body) : content;
}
