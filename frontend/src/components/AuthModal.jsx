import React, { useState } from 'react';
import { api, setToken } from '../utils/api';
import { Flame, Shield, Rocket, Target, Compass, Brain, Sparkles, AlertCircle } from 'lucide-react';

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

export default function AuthModal({ isOpen, onClose, onSuccess }) {
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState('flame');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!username.trim()) {
      setError('Please choose a nickname.');
      return;
    }
    if (pin.length < 4) {
      setError('PIN must be at least 4 digits.');
      return;
    }

    setLoading(true);
    try {
      let resp;
      if (isRegister) {
        resp = await api.auth.register(username.trim(), pin.trim(), selectedAvatar);
      } else {
        resp = await api.auth.login(username.trim(), pin.trim());
      }
      setToken(resp.token);
      onSuccess(resp.user);
      onClose();
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-md bg-[#242a3a] border border-orange-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl glow-orange-subtle animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-950/80 border border-orange-500/40 text-orange-400 mb-3 shadow-lg shadow-orange-950/50">
            <Flame className="w-7 h-7 fill-current" />
          </div>
          <h2 className="text-2xl font-black text-white tracking-tight">
            {isRegister ? 'Create Challenger Profile' : 'Enter JEE Rivals Arena'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Zero friction PIN sign-in. Permanent stats, rankings & Elo tracking.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-950/60 border border-red-500/40 rounded-xl flex items-center gap-2.5 text-red-300 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Aspirant Nickname
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
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Secret 4-Digit PIN
            </label>
            <input
              type="password"
              required
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              maxLength={8}
              className="w-full px-4 py-2.5 bg-[#1e2433] border border-white/10 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 font-mono tracking-widest text-base transition"
            />
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

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-extrabold text-sm rounded-xl transition shadow-lg shadow-orange-950/50 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2 glow-orange-subtle"
          >
            {loading ? (
              <span className="animate-pulse">Authorizing...</span>
            ) : (
              <span>{isRegister ? 'Join Battle Arena' : 'Enter Arena'}</span>
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
}
