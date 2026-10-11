import React, { useState, useEffect } from 'react';
import {
  Flame,
  Swords,
  BookOpen,
  Sliders,
  Trophy,
  Activity,
  User,
  UserPlus,
  LogOut,
  Volume2,
  VolumeX,
  Menu,
  X,
  Bell,
  Award,
  Brain,
  ChevronLeft,
  ChevronRight,
  Compass,
  Clock,
  ShieldAlert,
  Settings,
  Crosshair
} from 'lucide-react';
import { sound } from '../utils/sound';
import { api } from '../utils/api';
import NotificationPanel from './NotificationPanel';
import UpdateToast from './UpdateToast';
import WhatsNewModal from './WhatsNewModal';
import StreakModal from './StreakModal';

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
  GRANDMASTER: 'bg-red-950/80 text-red-300 border-red-500/50',
  MASTER: 'bg-purple-950/80 text-purple-300 border-purple-500/50',
  DIAMOND: 'bg-blue-950/80 text-blue-300 border-blue-400/50',
  PLATINUM: 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50',
  GOLD: 'bg-amber-950/80 text-amber-300 border-amber-500/50',
  SILVER: 'bg-slate-800 text-slate-300 border-slate-600/50',
  BRONZE: 'bg-orange-950/80 text-orange-400 border-orange-700/50',
};

export default function Navbar({
  user,
  activeTab,
  setActiveTab,
  onOpenAuth,
  onLogout,
  onAcceptDuel,
  hasActiveRoom = false,
  onUpdateUser,
  onOpenChat,
}) {
  const [isMuted, setIsMuted] = useState(sound.isMuted());
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toastUpdate, setToastUpdate] = useState(null);
  const [selectedUpdateModal, setSelectedUpdateModal] = useState(null);
  const [streakModalOpen, setStreakModalOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('jee_sidebar_collapsed') === 'true';
    } catch (_) {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('jee_sidebar_collapsed', isCollapsed ? 'true' : 'false');
    } catch (_) {}
  }, [isCollapsed]);

  const divStyle = (user && DIVISION_COLORS[getDivisionBaseTier(user.current_division)]) || DIVISION_COLORS.BRONZE;

  const navItems = [
    { id: 'arena', label: 'Arena & Duels', icon: Swords },
    { id: 'adaptive', label: 'Adaptive AI', icon: Brain },
    { id: 'mastery', label: 'Chapter Mastery', icon: Crosshair },
    { id: 'skills', label: 'Skill Tree', icon: Compass },
    { id: 'mocks', label: 'NTA Mocks', icon: BookOpen },
    { id: 'history', label: 'Test History', icon: Clock },
    { id: 'generator', label: 'Custom Blueprint', icon: Sliders },
    { id: 'tournaments', label: 'Tournaments', icon: Award },
    { id: 'invite', label: 'Invite Friends', icon: UserPlus },
    { id: 'leaderboards', label: 'Leaderboard', icon: Trophy },
    { id: 'profile', label: 'My Radar', icon: Activity },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];



  const handleTabClick = (tabId) => {
    sound.click();
    setActiveTab(tabId);
    setMobileMenuOpen(false);
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

  return (
    <>
      {/* ======================================================== */}
      {/* DESKTOP SIDEBAR (Chess.com Style - Left Docked) */}
      {/* ======================================================== */}
      <aside
        className={`hidden lg:flex flex-col justify-between shrink-0 h-screen sticky top-0 z-40 bg-[#161a24] border-r border-orange-500/15 transition-all duration-300 ease-in-out select-none shadow-2xl ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Top: Logo & Brand */}
        <div className="p-4 border-b border-white/5 flex items-center justify-between">
          <div
            onClick={() => handleTabClick('arena')}
            className={`flex items-center cursor-pointer group overflow-hidden ${
              isCollapsed ? 'justify-center w-full' : 'gap-3'
            }`}
          >
            <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 text-white shadow-lg shadow-orange-950/60 group-hover:scale-105 transition glow-orange-subtle shrink-0">
              <Flame className="w-6 h-6 fill-current" />
            </div>
            {!isCollapsed && (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 font-black text-xl tracking-tight text-white">
                  <span>JEE</span>
                  <span className="text-orange-500">RIVALS</span>
                </div>
                <p className="text-[10px] uppercase font-bold tracking-widest text-slate-400 truncate">
                  PvP JEE Prep
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Middle: Navigation Items List */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-1.5 scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full py-2.5 rounded-xl text-xs font-bold flex items-center transition cursor-pointer relative group ${
                  isCollapsed ? 'justify-center px-0' : 'px-3.5 gap-3'
                } ${
                  isActive
                    ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md shadow-orange-950/50 glow-orange-subtle'
                    : 'text-slate-300 hover:text-white hover:bg-white/5'
                }`}
              >
                <Icon
                  className={`w-5 h-5 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-white' : 'text-orange-400'
                  }`}
                />
                {!isCollapsed && <span className="truncate text-sm font-semibold">{item.label}</span>}
                {item.id === 'arena' && hasActiveRoom && (
                  isCollapsed ? (
                    <span className="absolute top-2 right-2 flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
                    </span>
                  ) : (
                    <span className="ml-auto text-[10px] font-black uppercase tracking-wider bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full border border-orange-500/30 animate-pulse">
                      Live
                    </span>
                  )
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom: Profile Dossier & Control Dock */}
        <div className="p-3 border-t border-white/10 bg-[#12151e]/90 space-y-2">
          {user ? (
            <div
              onClick={() => handleTabClick('profile')}
              className={`p-2 rounded-xl bg-[#202636] border border-orange-500/25 hover:border-orange-500/60 cursor-pointer transition flex items-center group ${
                isCollapsed ? 'flex-col gap-1 justify-center' : 'gap-2.5'
              }`}
              title={isCollapsed ? `${user.username} (${Math.round(user.overall_elo)} Elo • 🔥 ${user.current_streak || 0} Streak)` : undefined}
            >
              <div className="w-8 h-8 rounded-lg bg-orange-950/90 border border-orange-500/40 flex items-center justify-center text-base shrink-0 group-hover:scale-105 transition overflow-hidden">
                {user.avatar_image_url ? (
                  <img src={user.avatar_image_url} alt={user.username} className="w-full h-full object-cover rounded-lg" />
                ) : (
                  renderAvatarEmoji(user.avatar_id)
                )}
              </div>
              {isCollapsed && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    sound.click();
                    setStreakModalOpen(true);
                  }}
                  title={`Daily Study Streak: ${user.current_streak || 0} Days`}
                  className={`flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold border transition cursor-pointer ${
                    user.is_streak_active_today
                      ? 'bg-orange-500/25 text-orange-400 border-orange-500/40'
                      : 'bg-amber-500/15 text-amber-300 border-amber-500/30 animate-pulse'
                  }`}
                >
                  <Flame className="w-2.5 h-2.5 fill-current" />
                  <span>{user.current_streak || 0}</span>
                </button>
              )}
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="text-xs font-bold text-white truncate max-w-[90px]">{user.username}</span>
                      <span className={`text-[8px] font-extrabold px-1 py-0.2 rounded border ${divStyle}`}>
                        {user.current_division}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onOpenAuth) onOpenAuth();
                      }}
                      title="Switch / Change Account"
                      className="text-[9px] text-orange-300 hover:text-white px-1.5 py-0.5 rounded bg-orange-950/80 hover:bg-orange-600/50 border border-orange-500/30 transition cursor-pointer font-bold shrink-0"
                    >
                      Switch
                    </button>
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                    <div>
                      <span className="text-orange-400 font-bold">{Math.round(user.overall_elo)}</span> Elo •{' '}
                      <span className="text-amber-400 font-bold">{user.weekly_rp}</span> RP
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        sound.click();
                        setStreakModalOpen(true);
                      }}
                      title="Daily Study Streak & Milestones"
                      className={`flex items-center gap-1 px-1.5 py-0.2 rounded-full border transition cursor-pointer font-bold shrink-0 ${
                        user.is_streak_active_today
                          ? 'bg-orange-500/20 text-orange-400 border-orange-500/40 hover:bg-orange-500/30'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse hover:bg-amber-500/20'
                      }`}
                    >
                      <Flame className="w-2.5 h-2.5 fill-current" />
                      <span>{user.current_streak || 0}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={onOpenAuth}
              title="Sign In / Register"
              className={`w-full py-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-white font-bold text-xs rounded-xl transition shadow-lg shadow-orange-950/40 flex items-center justify-center gap-2 cursor-pointer glow-orange-subtle ${
                isCollapsed ? 'px-0' : 'px-3'
              }`}
            >
              <User className="w-4 h-4 shrink-0" />
              {!isCollapsed && <span>Sign In / Play</span>}
            </button>
          )}

          {/* Controls Bar: Notifications, Mute, Logout, Collapse Toggle */}
          <div className={`flex items-center ${isCollapsed ? 'flex-col gap-2' : 'justify-between pt-1'}`}>
            {/* Notifications Bell */}
            {user && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(!notificationsOpen)}
                  title="Notifications & Messages"
                  className="p-2 text-slate-400 hover:text-orange-400 rounded-xl hover:bg-white/5 border border-white/10 transition cursor-pointer relative"
                >
                  <Bell className="w-4 h-4" />
                  {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 px-1.5 py-0.2 bg-red-500 text-white font-mono font-black text-[9px] rounded-full animate-pulse shadow-md">
                      {unreadCount}
                    </span>
                  )}
                </button>
              </div>
            )}

            {/* Quick Settings Gear button */}
            {user && (
              <button
                onClick={() => handleTabClick('settings')}
                title="Settings"
                className={`p-2 rounded-xl transition cursor-pointer ${
                  activeTab === 'settings'
                    ? 'text-orange-400 bg-orange-500/15 border border-orange-500/40'
                    : 'text-slate-400 hover:text-orange-400 hover:bg-white/5 border border-white/10'
                }`}
              >
                <Settings className="w-4 h-4" />
              </button>
            )}

            {/* Audio sound toggle */}
            <button
              onClick={() => {
                sound.toggleMute();
                setIsMuted(sound.isMuted());
              }}
              title={isMuted ? "Unmute Sound" : "Mute Sound"}
              className="p-2 text-slate-400 hover:text-orange-400 rounded-xl hover:bg-white/5 border border-white/10 transition cursor-pointer"
            >
              {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-orange-400" />}
            </button>

            {/* Logout button */}
            {user && (
              <button
                onClick={onLogout}
                title="Log out"
                className="p-2 text-slate-400 hover:text-red-400 rounded-xl hover:bg-red-950/40 border border-white/10 hover:border-red-800/40 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            )}

            {/* Sidebar Collapse / Expand Toggle (Signature Chess.com feature) */}
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              title={isCollapsed ? "Expand Sidebar" : "Collapse Sidebar"}
              className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 border border-white/10 transition cursor-pointer"
            >
              {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </aside>

      {/* ======================================================== */}
      {/* MOBILE HEADER BAR (< lg screens) */}
      {/* ======================================================== */}
      <header className="lg:hidden sticky top-0 z-40 w-full h-14 bg-[#181d28]/95 backdrop-blur-md border-b border-orange-500/20 px-4 flex items-center justify-between">
        {/* Brand on Mobile Header */}
        <div
          onClick={() => handleTabClick('arena')}
          className="flex items-center gap-2.5 cursor-pointer"
        >
          <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 text-white shadow-md">
            <Flame className="w-4 h-4 fill-current" />
          </div>
          <div className="font-black text-lg tracking-tight text-white">
            <span>JEE</span>
            <span className="text-orange-500">RIVALS</span>
          </div>
        </div>

        {/* Right side controls on mobile header */}
        <div className="flex items-center gap-2">
          {/* Streak Flame Badge on mobile */}
          {user && (
            <button
              type="button"
              onClick={() => {
                sound.click();
                setStreakModalOpen(true);
              }}
              className={`px-2 py-1 rounded-lg text-xs font-bold border transition flex items-center gap-1 cursor-pointer ${
                user.is_streak_active_today
                  ? 'bg-orange-500/20 text-orange-400 border-orange-500/40'
                  : 'bg-amber-500/10 text-amber-300 border-amber-500/30 animate-pulse'
              }`}
              title={`Daily Study Streak: ${user.current_streak || 0} Days`}
            >
              <Flame className="w-3.5 h-3.5 fill-current" />
              <span>{user.current_streak || 0}</span>
            </button>
          )}

          {/* Notifications bell on mobile */}
          {user && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="p-1.5 text-slate-400 hover:text-orange-400 rounded-lg border border-white/10 relative cursor-pointer"
                title="Notifications & Messages"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1 py-0.2 bg-red-500 text-white font-mono font-black text-[8px] rounded-full">
                    {unreadCount}
                  </span>
                )}
              </button>
            </div>
          )}

          {/* User Avatar Chip or Sign In on mobile header */}
          {user ? (
            <button
              onClick={() => handleTabClick('profile')}
              className="w-8 h-8 rounded-lg bg-[#202636] border border-orange-500/30 flex items-center justify-center text-sm overflow-hidden"
              title={user.username}
            >
              {user.avatar_image_url ? (
                <img src={user.avatar_image_url} alt={user.username} className="w-full h-full object-cover" />
              ) : (
                <span>{renderAvatarEmoji(user.avatar_id)}</span>
              )}
            </button>
          ) : (
            <button
              onClick={onOpenAuth}
              className="px-2.5 py-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold text-xs rounded-lg shadow"
            >
              Sign In
            </button>
          )}

          {/* Mobile Menu Hamburger */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="p-1.5 text-slate-300 hover:text-white rounded-lg bg-[#202636] border border-white/10"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ======================================================== */}
      {/* MOBILE SLIDE-OVER DRAWER OVERLAY (< lg screens) */}
      {/* ======================================================== */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          {/* Backdrop Blur */}
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Slide-out Sidebar Drawer */}
          <div className="relative w-72 max-w-[85vw] bg-[#161a24] border-r border-orange-500/30 h-full flex flex-col justify-between p-4 shadow-2xl z-50 animate-in slide-in-from-left duration-200">
            {/* Drawer Header */}
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-white/10 mb-4">
                <div
                  onClick={() => handleTabClick('arena')}
                  className="flex items-center gap-2.5 cursor-pointer"
                >
                  <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 via-orange-600 to-amber-500 text-white shadow-md">
                    <Flame className="w-5 h-5 fill-current" />
                  </div>
                  <div>
                    <div className="font-black text-lg tracking-tight text-white">
                      <span>JEE</span>
                      <span className="text-orange-500">RIVALS</span>
                    </div>
                    <p className="text-[9px] uppercase font-bold tracking-widest text-slate-400">
                      PvP JEE Prep
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/5 border border-white/10"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mobile Drawer Nav Links */}
              <nav className="space-y-1 overflow-y-auto max-h-[calc(100vh-220px)]">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleTabClick(item.id)}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-3 transition ${
                        isActive
                          ? 'bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-md shadow-orange-950/40 font-black'
                          : 'text-slate-300 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-orange-400'}`} />
                      <span className="text-sm font-semibold">{item.label}</span>
                      {item.id === 'arena' && hasActiveRoom && (
                        <span className="ml-auto text-[10px] font-black uppercase tracking-wider bg-orange-500/20 text-orange-300 px-2 py-0.5 rounded-full border border-orange-500/30 animate-pulse">
                          Live
                        </span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Mobile Drawer Footer Controls */}
            <div className="pt-4 border-t border-white/10 space-y-3">
              {user && (
                <div
                  onClick={() => handleTabClick('profile')}
                  className="p-2.5 rounded-xl bg-[#202636] border border-orange-500/30 flex items-center gap-2.5 cursor-pointer"
                >
                  <div className="w-8 h-8 rounded-lg bg-orange-950/90 border border-orange-500/40 flex items-center justify-center text-sm overflow-hidden shrink-0">
                    {user.avatar_image_url ? (
                      <img src={user.avatar_image_url} alt={user.username} className="w-full h-full object-cover" />
                    ) : (
                      renderAvatarEmoji(user.avatar_id)
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-white truncate">{user.username}</span>
                      <span className={`text-[8px] font-extrabold px-1 py-0.2 rounded border ${divStyle}`}>
                        {user.current_division}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">
                      <span className="text-orange-400 font-bold">{Math.round(user.overall_elo)}</span> Elo •{' '}
                      <span className="text-amber-400 font-bold">{user.weekly_rp}</span> RP
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    sound.toggleMute();
                    setIsMuted(sound.isMuted());
                  }}
                  className="px-3 py-1.5 text-xs text-slate-300 rounded-lg hover:bg-white/5 border border-white/10 flex items-center gap-1.5"
                >
                  {isMuted ? <VolumeX className="w-3.5 h-3.5 text-slate-500" /> : <Volume2 className="w-3.5 h-3.5 text-orange-400" />}
                  <span>{isMuted ? 'Muted' : 'Sound On'}</span>
                </button>

                {user && (
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      onLogout();
                    }}
                    className="px-3 py-1.5 text-xs text-red-400 rounded-lg hover:bg-red-950/30 border border-red-500/30 flex items-center gap-1.5"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Log Out</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Real-time Floating Update Toast */}
      <UpdateToast
        update={toastUpdate}
        onDismiss={() => setToastUpdate(null)}
        onViewDetails={(upd) => setSelectedUpdateModal(upd)}
      />

      {/* What's New Full Modal */}
      <WhatsNewModal
        update={selectedUpdateModal}
        isOpen={Boolean(selectedUpdateModal)}
        onClose={() => setSelectedUpdateModal(null)}
        onMarkRead={async (id) => {
          try {
            await api.updates.markRead(id);
          } catch (_) {}
        }}
      />

      {/* Daily Study Streak Modal */}
      <StreakModal
        isOpen={streakModalOpen}
        onClose={() => setStreakModalOpen(false)}
        user={user}
        onUpdateUser={onUpdateUser}
      />

      {/* Single Unified Notification & Friends Chat Popover */}
      {user && (
        <NotificationPanel
          isOpen={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          user={user}
          placement={isCollapsed ? 'sidebar' : 'dropdown'}
          onAcceptDuel={(roomCode) => {
            setNotificationsOpen(false);
            if (onAcceptDuel) onAcceptDuel(roomCode);
          }}
          onCountUpdate={(cnt) => setUnreadCount(cnt)}
          onOpenUpdateModal={(upd) => setSelectedUpdateModal(upd)}
          onToastUpdate={(upd) => setToastUpdate(upd)}
          onOpenChat={(friend) => {
            setNotificationsOpen(false);
            if (onOpenChat) onOpenChat(friend);
          }}
        />
      )}
    </>
  );
}
