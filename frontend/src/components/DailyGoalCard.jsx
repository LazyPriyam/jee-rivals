import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Target, CheckCircle2, X, Sliders, Sparkles, Award } from 'lucide-react';
import { api, setCachedUser } from '../utils/api';
import { sound } from '../utils/sound';

// Custom sleek silhouette SVGs matching the runner progression theme
const CrouchRunnerIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* Head */}
    <circle cx="8" cy="6" r="2.2" />
    {/* Crouching / ready body & limbs */}
    <path d="M7 9.5c.8 0 1.8.5 2.2 1.3l1.3 2.4 2.8-.8c.5-.1 1.1.2 1.2.7.1.5-.2 1.1-.7 1.2l-3.5 1c-.4.1-.9-.1-1.2-.5l-1.4-2.3-.9 3.2 2.6 3.1c.4.5.3 1.2-.2 1.6-.5.4-1.2.3-1.6-.2l-3.2-3.8c-.3-.4-.4-.9-.3-1.4l1.2-4.4-1.2.5c-.5.2-1.1 0-1.3-.5-.2-.5 0-1.1.5-1.3l2.8-1.5z" />
    {/* Ground support / hand */}
    <path d="M3 21h7c.6 0 1-.4 1-1s-.4-1-1-1H3c-.6 0-1 .4-1 1s.4 1 1 1z" />
  </svg>
);

const WalkingRunnerIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <circle cx="12" cy="4" r="2.2" />
    <path d="M13.5 8.5c-.3-.3-.8-.5-1.3-.5-.6 0-1.1.3-1.4.7l-2.3 3.1c-.3.4-.2 1 .2 1.3.4.3 1 .2 1.3-.2l1.7-2.3v3.9l-2.4 4.5c-.3.5-.1 1.1.4 1.4.5.3 1.1.1 1.4-.4l2.6-4.9c.2-.3.3-.7.3-1.1v-4.5l1.6 2.3c.3.4.9.5 1.3.2.4-.3.5-.9.2-1.3l-2.6-3.8z" />
    <path d="M9.5 13.5l-2.1 2.2c-.4.4-.4 1 0 1.4.4.4 1 .4 1.4 0l2.3-2.4-1.6-1.2z" />
  </svg>
);

const RunningRunnerIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    <circle cx="14" cy="4" r="2.2" />
    <path d="M16.5 8.2c-.4-.4-1-.6-1.6-.5l-3.2.7-1.7-1.7c-.4-.4-1.1-.4-1.5 0-.4.4-.4 1.1 0 1.5l2.2 2.2c.3.3.7.5 1.1.4l2.4-.5-1.6 3.1-3.6 1.1c-.5.2-.8.7-.7 1.2.2.5.7.8 1.2.7l4.1-1.3c.4-.1.7-.4.9-.8l1.4-2.8 1.8 1.4v3.8c0 .6.4 1 1 1s1-.4 1-1v-4.5c0-.4-.2-.8-.5-1l-2.5-2z" />
    <path d="M9.2 16.2l-2.7 3.5c-.4.5-.3 1.1.2 1.5.5.4 1.1.3 1.5-.2l3-3.8c.2-.3.3-.7.2-1.1l-.6-1.7-1.6 1.8z" />
  </svg>
);

const SprintingRunnerIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* Speed dash lines behind */}
    <path d="M1 9h3c.6 0 1-.4 1-1s-.4-1-1-1H1c-.6 0-1 .4-1 1s.4 1 1 1z" opacity="0.6" />
    <path d="M0 13h5c.6 0 1-.4 1-1s-.4-1-1-1H0c-.6 0-1 .4-1 1s.4 1 1 1z" opacity="0.8" />
    <path d="M2 17h3c.6 0 1-.4 1-1s-.4-1-1-1H2c-.6 0-1 .4-1 1s.4 1 1 1z" opacity="0.6" />
    {/* Head leaning forward */}
    <circle cx="16" cy="5" r="2.2" />
    {/* Sprinting body with heavy forward tilt */}
    <path d="M18.8 9.5c-.4-.4-1-.6-1.6-.5l-3.8.8-2.2-2.1c-.4-.4-1.1-.4-1.5 0-.4.4-.4 1.1 0 1.5l2.7 2.6c.3.3.7.5 1.1.4l2.6-.6-2.1 3.8-4.5 1.2c-.5.1-.9.7-.7 1.2.1.5.7.9 1.2.7l5.1-1.4c.4-.1.8-.4 1-.8l1.7-3.2 2.2 1.6v3.3c0 .6.4 1 1 1s1-.4 1-1v-4.1c0-.4-.2-.8-.5-1.1l-2.9-2.2z" />
    {/* Extended trailing leg */}
    <path d="M10.5 16.8l-3.6 4.2c-.4.4-.3 1.1.2 1.5.4.4 1.1.3 1.5-.2l4-4.7c.3-.3.4-.8.2-1.2l-.7-1.8-1.6 2.2z" />
  </svg>
);

const FinishFlagIcon = ({ className = 'w-4 h-4' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
    {/* Flag pole */}
    <path d="M4 3c-.6 0-1 .4-1 1v16c0 .6.4 1 1 1s1-.4 1-1v-6h14c.7 0 1.2-.7.9-1.3l-2.2-4.7 2.2-4.7c.3-.6-.2-1.3-.9-1.3H4zm2 2h4v3H6V5zm6 0h4v3h-4V5zm-6 5h4v3H6v-3zm6 0h4v3h-4v-3z" />
  </svg>
);

const PRESET_GOALS = [
  { count: 20, label: 'Casual' },
  { count: 40, label: 'Focused' },
  { count: 60, label: 'Kota Grind' },
  { count: 80, label: 'Intense' },
  { count: 100, label: 'Apex Titan' },
];

export default function DailyGoalCard({ user, onUpdateUser, onNavigateTab }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [targetGoal, setTargetGoal] = useState(user?.daily_question_goal || 60);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');

  const currentGoal = user?.daily_question_goal || 60;
  const solvedToday = user?.daily_goal_solved || 0;
  const percent = Math.min(100, Math.round((solvedToday / currentGoal) * 100));
  const isGoalReached = solvedToday >= currentGoal;

  // 5 Stages: 0%, 25%, 50%, 75%, 100%
  const stages = [
    {
      id: 'ready',
      label: 'Start (0%)',
      sub: `${Math.round(currentGoal * 0)} Qs`,
      minPct: 0,
      Icon: CrouchRunnerIcon,
      activeColor: 'text-orange-400 border-orange-500/50 bg-[#222a3a]',
    },
    {
      id: 'walk',
      label: 'Pacing (25%)',
      sub: `${Math.round(currentGoal * 0.25)} Qs`,
      minPct: 25,
      Icon: WalkingRunnerIcon,
      activeColor: 'text-amber-400 border-amber-500/50 bg-[#222a3a]',
    },
    {
      id: 'run',
      label: 'Momentum (50%)',
      sub: `${Math.round(currentGoal * 0.50)} Qs`,
      minPct: 50,
      Icon: RunningRunnerIcon,
      activeColor: 'text-amber-300 border-amber-400/50 bg-[#222a3a]',
    },
    {
      id: 'sprint',
      label: 'Sprinting (75%)',
      sub: `${Math.round(currentGoal * 0.75)} Qs`,
      minPct: 75,
      Icon: SprintingRunnerIcon,
      activeColor: 'text-orange-400 border-orange-500/50 bg-[#222a3a]',
    },
    {
      id: 'finish',
      label: 'Goal Smashed (100%)',
      sub: `${currentGoal} Qs`,
      minPct: 100,
      Icon: FinishFlagIcon,
      activeColor: 'text-emerald-400 border-emerald-500/50 bg-emerald-950/60 shadow-emerald-500/30',
    },
  ];

  const handleOpenModal = () => {
    sound.click();
    setTargetGoal(currentGoal);
    setFeedback('');
    setModalOpen(true);
  };

  const handleSaveGoal = async () => {
    setSaving(true);
    setFeedback('');
    try {
      sound.click();
      const updated = await api.auth.updateDailyGoal(targetGoal);
      setCachedUser(updated);
      if (onUpdateUser) onUpdateUser(updated);
      setFeedback('Goal updated!');
      setTimeout(() => {
        setModalOpen(false);
        setFeedback('');
      }, 700);
    } catch (err) {
      setFeedback(err.message || 'Failed to update goal');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      {/* Sleek Daily Goal Card matching user uploaded reference */}
      <div className="bg-[#161c28]/95 border border-slate-700/60 hover:border-slate-600/80 rounded-2xl px-5 py-4 mb-8 shadow-xl transition-all duration-300 relative overflow-hidden group">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-5">
          {/* Left Title & Status */}
          <div
            onClick={handleOpenModal}
            className="flex items-center gap-2 cursor-pointer select-none group/title shrink-0"
            title="Click to adjust your Daily Question Goal"
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm sm:text-base font-bold text-slate-100 group-hover/title:text-white transition">
                Your Daily Goal
              </span>
              <span className="text-sm sm:text-base font-semibold font-mono text-slate-400 group-hover/title:text-orange-400 transition">
                ({solvedToday}/{currentGoal} Qs)
              </span>
            </div>

            <div className="w-5 h-5 rounded-full bg-slate-800/80 group-hover/title:bg-orange-500/20 text-slate-400 group-hover/title:text-orange-400 border border-slate-700/60 group-hover/title:border-orange-500/40 flex items-center justify-center transition ml-0.5">
              <ChevronRight className="w-3.5 h-3.5 group-hover/title:translate-x-0.5 transition" />
            </div>

            {isGoalReached && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center gap-1 animate-pulse">
                <CheckCircle2 className="w-3 h-3" />
                <span>Goal Smashed! 🎉</span>
              </span>
            )}
          </div>

          {/* Right Runner Milestones Track */}
          <div className="w-full sm:w-[480px] md:w-[540px] relative flex items-center justify-between py-2 px-3">
            {/* Background connecting track line */}
            <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-1 bg-slate-800/90 rounded-full -z-0" />

            {/* Filled progress track line */}
            <div
              className="absolute left-6 top-1/2 -translate-y-1/2 h-1 bg-gradient-to-r from-orange-500 via-amber-500 to-emerald-400 rounded-full transition-all duration-700 -z-0"
              style={{
                width: `calc(${percent}% * (100% - 48px) / 100)`,
              }}
            />

            {/* 5 Milestone Checkpoint Circles */}
            {stages.map((stage) => {
              const isAchieved = percent >= stage.minPct;
              const isCurrent =
                isAchieved &&
                (stage.minPct === 100 || percent < (stages[stages.indexOf(stage) + 1]?.minPct || 101));

              return (
                <div
                  key={stage.id}
                  onClick={handleOpenModal}
                  className="flex flex-col items-center relative z-10 cursor-pointer group/node"
                  title={`${stage.label} • ${stage.sub}`}
                >
                  <div
                    className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center transition-all duration-500 border ${
                      isAchieved
                        ? `${stage.activeColor} shadow-md scale-105`
                        : 'bg-[#141822] border-slate-700/60 text-slate-500 opacity-60 group-hover/node:opacity-85'
                    } ${isCurrent && !isGoalReached ? 'ring-2 ring-orange-500/40 ring-offset-2 ring-offset-[#161c28]' : ''}`}
                  >
                    <stage.Icon className="w-4 h-4 sm:w-5 sm:h-5 transition group-hover/node:scale-110" />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Goal Adjustment Modal */}
      {modalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => {
            sound.click();
            setModalOpen(false);
          }}
        >
          <div
            className="bg-[#161c28] border border-orange-500/40 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => {
                sound.click();
                setModalOpen(false);
              }}
              className="absolute top-5 right-5 text-slate-400 hover:text-white p-1 rounded-xl bg-slate-800/60 hover:bg-slate-800 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-2xl bg-orange-500/20 text-orange-400 border border-orange-500/40">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-white">Daily Question Goal</h3>
                <p className="text-xs text-slate-400">Configure your daily problem-solving benchmark</p>
              </div>
            </div>

            {/* Presets Grid */}
            <div className="space-y-2 mb-5">
              <label className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Quick Grind Presets
              </label>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {PRESET_GOALS.map((preset) => (
                  <button
                    key={preset.count}
                    type="button"
                    onClick={() => {
                      sound.click();
                      setTargetGoal(preset.count);
                    }}
                    className={`p-2.5 rounded-xl border text-center transition cursor-pointer flex flex-col items-center gap-0.5 ${
                      targetGoal === preset.count
                        ? 'bg-orange-500/25 border-orange-500 text-orange-300 shadow-lg shadow-orange-950/40 font-bold'
                        : 'bg-[#10141e] border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs font-black font-mono text-white">{preset.count}</span>
                    <span className="text-[10px] text-orange-400/90 font-medium">{preset.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Range Slider & Manual Number Input */}
            <div className="bg-[#10141e] border border-white/10 rounded-2xl p-4 mb-6 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300">Target Problems</span>
                <div className="flex items-center gap-1.5 font-mono">
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={targetGoal}
                    onChange={(e) => {
                      const val = Math.max(5, Math.min(300, Number(e.target.value) || 5));
                      setTargetGoal(val);
                    }}
                    className="w-16 px-2 py-1 bg-[#161c28] border border-orange-500/40 rounded-lg text-white font-bold text-sm text-center focus:outline-none focus:border-orange-500"
                  />
                  <span className="text-xs text-slate-400">Qs / day</span>
                </div>
              </div>

              <input
                type="range"
                min={10}
                max={150}
                step={5}
                value={targetGoal}
                onChange={(e) => setTargetGoal(Number(e.target.value))}
                className="w-full accent-orange-500 cursor-pointer h-2 bg-slate-800 rounded-lg"
              />

              <div className="flex justify-between text-[10px] font-mono text-slate-500">
                <span>10 Qs (Warmup)</span>
                <span>60 Qs (Standard)</span>
                <span>150 Qs (Titan)</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleSaveGoal}
                disabled={saving}
                className="flex-1 py-3 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-black text-xs rounded-xl shadow-lg transition flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 fill-current" />
                <span>{saving ? 'Saving...' : 'Apply Daily Goal'}</span>
              </button>

              {onNavigateTab && (
                <button
                  type="button"
                  onClick={() => {
                    sound.click();
                    setModalOpen(false);
                    onNavigateTab('settings');
                  }}
                  className="py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs rounded-xl border border-white/10 transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Sliders className="w-3.5 h-3.5" />
                  <span>Settings</span>
                </button>
              )}
            </div>

            {feedback && (
              <p className="text-center text-xs mt-3 text-emerald-400 font-bold flex items-center justify-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{feedback}</span>
              </p>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
