import React, { useState, useEffect, useCallback } from 'react';
import Navbar from './components/Navbar';
import DashboardView from './components/DashboardView';
import MocksCenterView from './components/MocksCenterView';
import CustomGeneratorView from './components/CustomGeneratorView';
import InviteFriendsView from './components/InviteFriendsView';
import RoomLobbyView from './components/RoomLobbyView';
import SpeedDuelView from './components/SpeedDuelView';
import MockTestView from './components/MockTestView';
import WaitingRoomView from './components/WaitingRoomView';
import ResultsView from './components/ResultsView';
import LeaderboardsView from './components/LeaderboardsView';
import ProfileView from './components/ProfileView';
import TournamentsView from './components/TournamentsView';
import AdaptivePracticeView from './components/AdaptivePracticeView';
import ChapterMasteryView from './components/ChapterMasteryView';
import SphereGridSkillTree from './components/SphereGridSkillTree';
import TestHistoryView from './components/TestHistoryView';
import TestAnalysisView from './components/TestAnalysisView';
import SettingsView from './components/SettingsView';
import AuthModal from './components/AuthModal';
import RoomModal from './components/RoomModal';
import FriendChatDrawer from './components/FriendChatDrawer';
import ErrorBoundary from './components/ErrorBoundary';
import {
  api,
  getToken,
  setToken,
  getCachedUser,
  setCachedUser,
  recordSavedAccount,
  getSavedAccounts,
  purgeUserSessionArtifacts
} from './utils/api';
import { setActiveTestRoom, clearActiveTestRoom } from './utils/storageGuardian';

export default function App() {
  const [user, setUser] = useState(() => {
    const t = getToken();
    return t ? getCachedUser() : null;
  });
  const [activeTab, setActiveTab] = useState('arena');
  const [currentRoom, setCurrentRoom] = useState(null);
  const [activeMatch, setActiveMatch] = useState(null);
  const [roomViewMode, setRoomViewMode] = useState(null); // null, 'lobby', 'battle', 'waiting', 'results'
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [createRoomModalOpen, setCreateRoomModalOpen] = useState(false);
  const [inspectProfileUser, setInspectProfileUser] = useState(null);
  const [inspectTestCode, setInspectTestCode] = useState(null);
  const [inspectTestUser, setInspectTestUser] = useState(null);
  const [skillTreePayload, setSkillTreePayload] = useState(null);
  const [activeChatFriend, setActiveChatFriend] = useState(null);
  const [chatDrawerOpen, setChatDrawerOpen] = useState(false);

  const handleOpenChat = (friend) => {
    setActiveChatFriend(friend);
    setChatDrawerOpen(true);
  };

  const fetchActiveMatch = async () => {
    if (!getToken()) return null;
    try {
      const res = await api.rooms.getActive();
      if (res?.active_room) {
        setActiveMatch(res.active_room);
        setCurrentRoom(res.active_room);
        return res.active_room;
      } else {
        setActiveMatch(null);
        clearActiveTestRoom(user?.id);
      }
    } catch (_) {}
    return null;
  };

  // On page reload or refresh: move user out from the test screen to Dashboard.
  // We keep currentRoom populated from the API so that the Dashboard displays
  // the ongoing match status card (Chess.com style) with a "Resume Match" button.
  useEffect(() => {
    fetchActiveMatch();
    // Notice: We intentionally do NOT call setRoomViewMode('battle')!
    // roomViewMode remains null so the user lands cleanly on the Dashboard.
  }, [user?.id]);

  // Fetch skill tree data for standalone Skill Tree tab
  useEffect(() => {
    if (user) {
      api.auth.updateProfile({})
        .then((res) => {
          if (res?.skill_tree) {
            setSkillTreePayload(res.skill_tree);
          }
        })
        .catch(() => {});
    }
  }, [user?.id, activeTab]);

  // Check existing session with bulletproof auto-healing persistence
  useEffect(() => {
    const token = getToken();

    const tryAutoHealWithSavedAccount = async () => {
      const savedAccounts = getSavedAccounts();
      const lastUser = localStorage.getItem('jee_saved_username') || getCachedUser()?.username;
      const savedAcc = savedAccounts.find(
        (a) => a.username?.toLowerCase() === lastUser?.toLowerCase()
      ) || savedAccounts[0];

      if (savedAcc?.pin) {
        try {
          const resp = await api.auth.login(savedAcc.username, savedAcc.pin);
          setToken(resp.token, true);
          setUser(resp.user);
          setCachedUser(resp.user);
          recordSavedAccount(resp.user, resp.token, savedAcc.pin);
          return true;
        } catch (_) {}
      }
      return false;
    };

    if (token) {
      api.auth.getMe()
        .then((u) => {
          setUser(u);
          setCachedUser(u);
          recordSavedAccount(u);
        })
        .catch(async (err) => {
          // If server explicitly returned 401/403, attempt auto-heal before discarding
          if (err?.status === 401 || err?.status === 403) {
            const healed = await tryAutoHealWithSavedAccount();
            if (!healed) {
              setToken(null);
              setUser(null);
              setCachedUser(null);
              setAuthModalOpen(true);
            }
          } else {
            console.warn('[Session] Backend booting up or unreachable; maintaining local session.');
          }
        });
    } else {
      tryAutoHealWithSavedAccount().then((healed) => {
        if (!healed) {
          setAuthModalOpen(true);
        }
      });
    }
  }, []);

  const refreshUser = useCallback(() => {
    if (!getToken()) return;
    api.auth.getMe()
      .then((u) => {
        setUser(u);
        setCachedUser(u);
        recordSavedAccount(u);
      })
      .catch(() => {});
  }, []);

  // Global reactive state sync across tabs, windows, and visibility changes
  useEffect(() => {
    const handleUserUpdated = (e) => {
      if (e?.detail) {
        setUser(e.detail);
        setCachedUser(e.detail);
        recordSavedAccount(e.detail);
      } else {
        refreshUser();
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshUser();
      }
    };

    window.addEventListener('jee_user_updated', handleUserUpdated);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('jee_user_updated', handleUserUpdated);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refreshUser]);

  // Handle direct link & browser deep link from URL query parameters (e.g. ?profile=username, ?test=CODE, ?join=ABC12, ?tab=...)
  useEffect(() => {
    const syncFromUrl = () => {
      const params = new URLSearchParams(window.location.search);
      const profileParam = params.get('profile') || params.get('user');
      const testParam = params.get('test') || params.get('exam');
      const joinCode = params.get('join') || params.get('room');
      const tabParam = params.get('tab');

      if (profileParam) {
        setInspectProfileUser(profileParam.trim());
        switchTab('profile', false);
      }
      if (testParam) {
        setInspectTestCode(testParam.trim().toUpperCase());
        const candidate = params.get('candidate') || params.get('test_user');
        if (candidate) setInspectTestUser(candidate.trim());
        switchTab('history', false);
      } else if (tabParam && ['arena', 'adaptive', 'mastery', 'skills', 'tournaments', 'mocks', 'history', 'generator', 'invite', 'leaderboards', 'profile', 'settings'].includes(tabParam)) {
        switchTab(tabParam, false);
      }

      if (joinCode && user) {
        api.rooms.join(joinCode.trim().toUpperCase())
          .then((room) => {
            handleEnterRoom(room);
          })
          .catch(() => {});
      }
    };

    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [Boolean(user)]);

  const [visitedTabs, setVisitedTabs] = useState({ arena: true });

  const switchTab = (tab, updateUrl = true) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
    refreshUser();
    if (updateUrl) {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('tab', tab);
        if (tab !== 'profile') {
          url.searchParams.delete('profile');
          url.searchParams.delete('user');
        }
        if (tab !== 'history') {
          url.searchParams.delete('test');
          url.searchParams.delete('exam');
          url.searchParams.delete('candidate');
        }
        window.history.pushState({}, '', url.toString());
      } catch (_) {}
    }
  };

  const handleViewProfile = (uname) => {
    if (!uname) return;
    const cleanUname = uname.trim();
    setInspectProfileUser(cleanUname);
    switchTab('profile', false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'profile');
      url.searchParams.set('profile', cleanUname);
      window.history.pushState({}, '', url.toString());
    } catch (_) {}
  };

  const handleBackFromProfile = () => {
    setInspectProfileUser(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('profile');
      url.searchParams.delete('user');
      window.history.pushState({}, '', url.toString());
    } catch (_) {}
  };

  const handleSelectTest = (code, candidateUsername = null) => {
    if (!code) return;
    const cleanCode = code.trim().toUpperCase();
    setInspectTestCode(cleanCode);
    setInspectTestUser(candidateUsername ? candidateUsername.trim() : null);
    switchTab('history', false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', 'history');
      url.searchParams.set('test', cleanCode);
      if (candidateUsername) url.searchParams.set('candidate', candidateUsername.trim());
      window.history.pushState({}, '', url.toString());
    } catch (_) {}
  };

  const handleBackFromTestAnalysis = () => {
    setInspectTestCode(null);
    setInspectTestUser(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('test');
      url.searchParams.delete('exam');
      url.searchParams.delete('candidate');
      window.history.pushState({}, '', url.toString());
    } catch (_) {}
  };

  const handleLogout = () => {
    purgeUserSessionArtifacts();
    setToken(null);
    setCachedUser(null);
    setUser(null);
    setCurrentRoom(null);
    setRoomViewMode(null);
    setActiveMatch(null);
    setActiveTab('arena');
    setVisitedTabs({ arena: true });
    setAuthModalOpen(true);
  };

  const handleRoomCreated = (room) => {
    setCurrentRoom(room);
    setActiveTab('arena');
    if (room?.status === 'IN_PROGRESS') {
      setActiveTestRoom(user?.id, room.code);
      setRoomViewMode('battle');
    } else {
      setRoomViewMode('lobby');
    }
  };

  const handleJoinRoomCode = async (roomOrCode) => {
    let room = roomOrCode;
    if (typeof roomOrCode === 'string') {
      const cleanCode = roomOrCode.trim().toUpperCase();
      try {
        room = await api.rooms.join(cleanCode);
      } catch (joinErr) {
        try {
          room = await api.rooms.get(cleanCode);
        } catch (err) {
          alert(joinErr.message || err.message || 'Failed to locate arena room.');
          return;
        }
      }
    } else if (roomOrCode && roomOrCode.room) {
      room = roomOrCode.room;
    }
    if (!room) return;

    setCurrentRoom(room);
    setActiveTab('arena');
    if (room.status === 'IN_PROGRESS') {
      setActiveMatch(room);
      setActiveTestRoom(user?.id, room.code);
      const myPart = room.participants?.find((p) => String(p.user_id) === String(user?.id) || p.username === user?.username);
      if (myPart?.is_finished) {
        setRoomViewMode('waiting');
      } else {
        setRoomViewMode('battle');
      }
    } else if (room.status === 'COMPLETED') {
      setRoomViewMode('results');
    } else {
      setRoomViewMode('lobby');
    }
  };

  const handleStartPreset = async (subject, chapter) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    try {
      const room = await api.rooms.create({
        mode: 'SPEED_DUEL',
        subjects: [subject],
        chapters: [chapter],
        difficulty_tier: 'MIXED',
        question_count: 5,
        time_per_question: 90,
      });
      setCurrentRoom(room);
      setRoomViewMode('lobby');
    } catch (err) {
      alert(err.message || 'Failed to initialize match preset.');
    }
  };

  const handleResumeMatch = (room) => {
    setCurrentRoom(room);
    setActiveMatch(room);
    setActiveTestRoom(user?.id, room.code);
    const myPart = room.participants?.find((p) => p.user_id === user?.id);
    if (myPart?.is_finished) {
      setRoomViewMode('waiting');
    } else {
      setRoomViewMode('battle');
    }
    setActiveTab('arena');
  };

  const handleForfeitMatch = async (code) => {
    try {
      await api.rooms.forfeit(code);
    } catch (_) {}
    setActiveMatch(null);
    setCurrentRoom(null);
    setRoomViewMode(null);
    clearActiveTestRoom(user?.id);
    refreshUser();
  };

  return (
    <div className="min-h-screen bg-[#1e222d] text-slate-100 flex flex-col lg:flex-row font-sans">
      {/* Hide navbar during authentic NTA mock test to ensure authentic exam immersion */}
      {!(roomViewMode === 'battle' && currentRoom?.mode === 'MOCK_TEST') && (
        <Navbar
          user={user}
          activeTab={activeTab}
          setActiveTab={(tab) => {
            switchTab(tab);
            if (tab === 'profile') {
              setInspectProfileUser(null);
            }
          }}
          hasActiveRoom={Boolean(currentRoom && roomViewMode)}
          onOpenAuth={() => setAuthModalOpen(true)}
          onLogout={handleLogout}
          onAcceptDuel={async (code) => {
            try {
              const room = await api.rooms.get(code);
              handleJoinRoomCode(room);
            } catch (_) {}
          }}
          onUpdateUser={setUser}
          onOpenChat={handleOpenChat}
        />
      )}

      {/* Right Column: Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen overflow-x-hidden">
        {/* Active Match Banner when inspecting other tabs while a match or room is active */}
        {roomViewMode && currentRoom && activeTab !== 'arena' && (
          <div className="bg-gradient-to-r from-orange-600 via-amber-600 to-orange-500 text-white px-4 py-2.5 shadow-lg flex items-center justify-between sticky top-14 lg:top-0 z-30">
            <div className="flex items-center gap-2.5 text-xs sm:text-sm font-bold">
              <span className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
              <span>
                Active match in progress: <strong className="font-extrabold">{currentRoom.preset_name || currentRoom.code}</strong>{' '}
                <span className="text-orange-200 uppercase font-mono text-[11px]">({roomViewMode})</span>
              </span>
            </div>
            <button
              onClick={() => setActiveTab('arena')}
              className="px-3.5 py-1.5 bg-white text-orange-600 hover:bg-orange-50 text-xs font-black rounded-lg shadow transition cursor-pointer flex items-center gap-1.5"
            >
              <span>Return to Match</span>
              <span>→</span>
            </button>
          </div>
        )}

        <main className="flex-1 pb-16">
          {/* Tab 1: Arena & Duels (or Active Room View) */}
          <div className={activeTab === 'arena' ? 'block' : 'hidden'}>
          {roomViewMode === 'lobby' && currentRoom ? (
            <RoomLobbyView
              room={currentRoom}
              user={user}
              onViewProfile={handleViewProfile}
              onStartMatch={(latestRoom) => {
                if (latestRoom) setCurrentRoom(latestRoom);
                setRoomViewMode('battle');
              }}
              onLeaveRoom={() => {
                setCurrentRoom(null);
                setRoomViewMode(null);
              }}
            />
          ) : roomViewMode === 'battle' && currentRoom ? (
            currentRoom.mode === 'MOCK_TEST' ? (
              <MockTestView
                room={currentRoom}
                user={user}
                onMatchComplete={async () => {
                  try {
                    const latest = await api.rooms.get(currentRoom.code);
                    const isSolo = !latest.participants || latest.participants.length <= 1;
                    const allFinished = latest.status === 'COMPLETED' || (latest.participants && latest.participants.every((p) => p.is_finished));
                    if (isSolo || allFinished) {
                      setRoomViewMode('results');
                    } else {
                      setRoomViewMode('waiting');
                    }
                  } catch (_) {
                    setRoomViewMode('results');
                  }
                  refreshUser();
                }}
                onExitToDashboard={() => {
                  setRoomViewMode(null);
                  setActiveTab('arena');
                  fetchActiveMatch();
                }}
              />
            ) : (
              <SpeedDuelView
                room={currentRoom}
                user={user}
                onPlayerFinished={() => setRoomViewMode('waiting')}
                onMatchComplete={() => {
                  setRoomViewMode('results');
                  refreshUser();
                }}
                onExitToDashboard={() => {
                  setRoomViewMode(null);
                  setActiveTab('arena');
                  fetchActiveMatch();
                }}
                onForfeit={handleForfeitMatch}
              />
            )
          ) : roomViewMode === 'waiting' && currentRoom ? (
            <WaitingRoomView
              room={currentRoom}
              user={user}
              onMatchCompleted={() => {
                setRoomViewMode('results');
                refreshUser();
              }}
              onEarlyResults={() => {
                setRoomViewMode('results');
                refreshUser();
              }}
            />
          ) : roomViewMode === 'results' && currentRoom ? (
            <ResultsView
              roomCode={currentRoom.code}
              user={user}
              onViewProfile={handleViewProfile}
              onReturnArena={() => {
                setCurrentRoom(null);
                setRoomViewMode(null);
                setActiveTab('arena');
                refreshUser();
              }}
            />
          ) : (
            <DashboardView
              user={user}
              onNavigateTab={switchTab}
              onOpenCreateRoom={() => switchTab('generator')}
              onJoinRoomCode={handleJoinRoomCode}
              onStartPreset={handleStartPreset}
              activeMatch={activeMatch}
              onResumeMatch={handleResumeMatch}
              onForfeitMatch={handleForfeitMatch}
              onUpdateUser={setUser}
            />
          )}
        </div>

        {/* Tab 2: Adaptive AI Practice Circuit */}
        {visitedTabs.adaptive && (
          <div className={activeTab === 'adaptive' ? 'block' : 'hidden'}>
            <AdaptivePracticeView
              user={user}
              onOpenAuth={() => setAuthModalOpen(true)}
              onNavigateTab={switchTab}
              isActive={activeTab === 'adaptive'}
              onUpdateUser={setUser}
            />
          </div>
        )}

        {/* Tab: Chapter Mastery & Error Log Graveyard */}
        {visitedTabs.mastery && (
          <div className={activeTab === 'mastery' ? 'block' : 'hidden'}>
            <ChapterMasteryView
              user={user}
              onOpenAuth={() => setAuthModalOpen(true)}
              onNavigateTab={switchTab}
              onStartPreset={handleStartPreset}
              onJoinRoomCode={handleJoinRoomCode}
              isActive={activeTab === 'mastery'}
              onUpdateUser={setUser}
            />
          </div>
        )}

        {/* Tab: Celestial Skill Tree Constellation (Sphere Grid / PoE style) */}
        {visitedTabs.skills && (
          <div className={activeTab === 'skills' ? 'block' : 'hidden'}>
            <div className="max-w-6xl mx-auto px-4 py-8 page-transition">
              <SphereGridSkillTree
                skillTreeData={skillTreePayload?.tree || {}}
                totalMastered={skillTreePayload?.total_mastered || 0}
                totalChapters={skillTreePayload?.total_chapters || 92}
                masteryPercentage={skillTreePayload?.mastery_percentage || 0}
                onNavigateTab={switchTab}
                onStartPreset={handleStartPreset}
                currentUser={user}
              />
            </div>
          </div>
        )}

        {/* Tab 3: Championship Circuits & 1v1 Brackets */}
        {visitedTabs.tournaments && (
          <div className={activeTab === 'tournaments' ? 'block' : 'hidden'}>
            <TournamentsView
              user={user}
              onJoinRoomCode={handleJoinRoomCode}
              onOpenAuth={() => setAuthModalOpen(true)}
              onViewProfile={handleViewProfile}
              isActive={activeTab === 'tournaments'}
            />
          </div>
        )}

        {/* Tab 4: NTA Mock Examination Center */}
        {visitedTabs.mocks && (
          <div className={activeTab === 'mocks' ? 'block' : 'hidden'}>
            <MocksCenterView
              user={user}
              onRoomCreated={handleRoomCreated}
              onJoinRoomCode={handleJoinRoomCode}
              onOpenAuth={() => setAuthModalOpen(true)}
              isActive={activeTab === 'mocks'}
            />
          </div>
        )}

        {/* Tab: Diagnostic Test Archives & History */}
        {visitedTabs.history && (
          <div className={activeTab === 'history' ? 'block' : 'hidden'}>
            {inspectTestCode ? (
              <TestAnalysisView
                roomCode={inspectTestCode}
                user={user}
                inspectUsername={inspectTestUser}
                onBack={handleBackFromTestAnalysis}
              />
            ) : (
              <TestHistoryView
                user={user}
                inspectUsername={inspectTestUser}
                onSelectTest={handleSelectTest}
                onResumeTest={handleJoinRoomCode}
                onNavigateTab={switchTab}
                onOpenAuth={() => setAuthModalOpen(true)}
                onClearInspect={() => setInspectTestUser(null)}
                isActive={activeTab === 'history'}
              />
            )}
          </div>
        )}

        {/* Tab 5: Custom Test Blueprint Studio */}
        {visitedTabs.generator && (
          <div className={activeTab === 'generator' ? 'block' : 'hidden'}>
            <ErrorBoundary onNavigateArena={() => switchTab('arena')}>
              <CustomGeneratorView
                user={user}
                onRoomCreated={handleRoomCreated}
                onOpenAuth={() => setAuthModalOpen(true)}
                isActive={activeTab === 'generator'}
              />
            </ErrorBoundary>
          </div>
        )}

        {/* Tab 6: Dedicated Friend Invites & Squads Hub */}
        {visitedTabs.invite && (
          <div className={activeTab === 'invite' ? 'block' : 'hidden'}>
            <InviteFriendsView
              user={user}
              onJoinRoomCode={handleJoinRoomCode}
              onRoomCreated={handleRoomCreated}
              onOpenAuth={() => setAuthModalOpen(true)}
              onViewProfile={handleViewProfile}
              isActive={activeTab === 'invite'}
              onOpenChat={handleOpenChat}
            />
          </div>
        )}

        {/* Tab 7: Leaderboards & Hall of Fame */}
        {visitedTabs.leaderboards && (
          <div className={activeTab === 'leaderboards' ? 'block' : 'hidden'}>
            <LeaderboardsView
              user={user}
              onNavigateTab={switchTab}
              onViewProfile={handleViewProfile}
              isActive={activeTab === 'leaderboards'}
            />
          </div>
        )}

        {/* Tab 8: Aspirant Profile & Radar */}
        {visitedTabs.profile && (
          <div className={activeTab === 'profile' ? 'block' : 'hidden'}>
            <ProfileView
              username={inspectProfileUser}
              currentUser={user}
              onBack={inspectProfileUser ? handleBackFromProfile : null}
              onNavigateTab={switchTab}
              onViewProfile={handleViewProfile}
              onSelectTest={handleSelectTest}
              onUpdateUser={(u) => {
                setUser(u);
                setCachedUser(u);
                recordSavedAccount(u);
              }}
              onStartPreset={handleStartPreset}
              isActive={activeTab === 'profile'}
            />
          </div>
        )}

        {/* Tab 9: Settings Console (Account & Chat) */}
        {visitedTabs.settings && (
          <div className={activeTab === 'settings' ? 'block' : 'hidden'}>
            <SettingsView
              user={user}
              onUpdateUser={(u) => {
                setUser(u);
                setCachedUser(u);
                recordSavedAccount(u);
              }}
              onLogout={handleLogout}
              onNavigateTab={switchTab}
              isActive={activeTab === 'settings'}
            />
          </div>
        )}
      </main>
      </div>

      {/* Global Modals */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => {
          if (user) setAuthModalOpen(false);
        }}
        onSuccess={(loggedUser) => {
          setUser(loggedUser);
          setCachedUser(loggedUser);
          recordSavedAccount(loggedUser);
          setAuthModalOpen(false);
        }}
      />

      <RoomModal
        isOpen={createRoomModalOpen}
        onClose={() => setCreateRoomModalOpen(false)}
        onRoomCreated={handleRoomCreated}
      />

      {/* Global Friends Direct Chat & Duel Drawer (Chess.com Style) */}
      <FriendChatDrawer
        isOpen={chatDrawerOpen}
        onClose={() => setChatDrawerOpen(false)}
        activeFriend={activeChatFriend}
        currentUser={user}
        onAcceptDuel={async (code) => {
          setChatDrawerOpen(false);
          try {
            const room = await api.rooms.get(code);
            handleJoinRoomCode(room);
          } catch (err) {
            alert(err.message || 'Error joining battle room.');
          }
        }}
        onViewProfile={(friend) => {
          setChatDrawerOpen(false);
          handleViewProfile(friend.username);
        }}
      />
    </div>
  );
}
