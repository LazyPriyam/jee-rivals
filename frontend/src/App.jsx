import React, { useState, useEffect } from 'react';
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
import ErrorBoundary from './components/ErrorBoundary';
import {
  api,
  getToken,
  setToken,
  getCachedUser,
  setCachedUser,
  recordSavedAccount,
  getSavedAccounts
} from './utils/api';

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
  const [skillTreePayload, setSkillTreePayload] = useState(null);

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
        try {
          localStorage.removeItem('jee_active_test_room');
        } catch (_) {}
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

  // Handle direct join link from URL query parameters (e.g. ?join=ABC12)
  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const joinCode = params.get('join') || params.get('room');
    if (joinCode) {
      api.rooms.join(joinCode.trim().toUpperCase())
        .then((room) => {
          handleEnterRoom(room);
          window.history.replaceState({}, document.title, window.location.pathname);
        })
        .catch(() => {});
    }
  }, [user]);

  const [visitedTabs, setVisitedTabs] = useState({ arena: true });

  const switchTab = (tab) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => (prev[tab] ? prev : { ...prev, [tab]: true }));
  };

  const handleLogout = () => {
    setToken(null);
    setCachedUser(null);
    setUser(null);
    setCurrentRoom(null);
    setRoomViewMode(null);
    setActiveTab('arena');
    setVisitedTabs({ arena: true });
    setAuthModalOpen(true);
  };

  const handleRoomCreated = (room) => {
    setCurrentRoom(room);
    setActiveTab('arena');
    if (room?.status === 'IN_PROGRESS') {
      try {
        localStorage.setItem('jee_active_test_room', room.code);
      } catch (_) {}
      setRoomViewMode('battle');
    } else {
      setRoomViewMode('lobby');
    }
  };

  const handleJoinRoomCode = (room) => {
    setCurrentRoom(room);
    setActiveTab('arena');
    if (room.status === 'IN_PROGRESS') {
      const myPart = room.participants?.find((p) => p.user_id === user?.id);
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
    try {
      localStorage.setItem('jee_active_test_room', room.code);
    } catch (_) {}
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
    try {
      localStorage.removeItem('jee_active_test_room');
    } catch (_) {}
    refreshUser();
  };

  const refreshUser = () => {
    api.auth.getMe().then((u) => setUser(u)).catch(() => {});
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
                onMatchComplete={() => {
                  setRoomViewMode('results');
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
                totalChapters={skillTreePayload?.total_chapters || 59}
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
              onViewProfile={(uname) => {
                setInspectProfileUser(uname);
                switchTab('profile');
              }}
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
                onBack={() => setInspectTestCode(null)}
              />
            ) : (
              <TestHistoryView
                user={user}
                onSelectTest={(code) => setInspectTestCode(code)}
                onNavigateTab={switchTab}
                onOpenAuth={() => setAuthModalOpen(true)}
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
              onViewProfile={(uname) => {
                setInspectProfileUser(uname);
                switchTab('profile');
              }}
              isActive={activeTab === 'invite'}
            />
          </div>
        )}

        {/* Tab 7: Leaderboards & Hall of Fame */}
        {visitedTabs.leaderboards && (
          <div className={activeTab === 'leaderboards' ? 'block' : 'hidden'}>
            <LeaderboardsView
              user={user}
              onNavigateTab={switchTab}
              onViewProfile={(uname) => {
                setInspectProfileUser(uname);
                switchTab('profile');
              }}
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
              onBack={inspectProfileUser ? () => setInspectProfileUser(null) : null}
              onNavigateTab={switchTab}
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
    </div>
  );
}
