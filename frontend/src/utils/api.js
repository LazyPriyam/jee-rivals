const API_BASE = "";

export function isRememberMeEnabled() {
  try {
    return localStorage.getItem("jee_remember_me") !== "false";
  } catch (_) {
    return true;
  }
}

export function setRememberMePreference(enabled) {
  try {
    localStorage.setItem("jee_remember_me", enabled ? "true" : "false");
    const activeToken = sessionStorage.getItem("jee_rivals_token") || localStorage.getItem("jee_rivals_token");
    if (enabled && activeToken) {
      localStorage.setItem("jee_rivals_token", activeToken);
    } else if (!enabled) {
      localStorage.removeItem("jee_rivals_token");
    }
  } catch (_) {}
}

export function getToken() {
  try {
    // 1. Tab-scoped session token
    const sessionToken = sessionStorage.getItem("jee_rivals_token");
    if (sessionToken) return sessionToken;

    // 2. Persistent localStorage token (guarantees staying logged in across tabs/refreshes)
    const localToken = localStorage.getItem("jee_rivals_token");
    if (localToken) return localToken;

    return "";
  } catch (_) {
    return "";
  }
}

export function setToken(token, rememberMe = true) {
  try {
    if (token) {
      sessionStorage.setItem("jee_rivals_token", token);
      if (rememberMe) {
        localStorage.setItem("jee_rivals_token", token);
        localStorage.setItem("jee_remember_me", "true");
      } else {
        localStorage.removeItem("jee_rivals_token");
        localStorage.setItem("jee_remember_me", "false");
      }
    } else {
      sessionStorage.removeItem("jee_rivals_token");
      localStorage.removeItem("jee_rivals_token");
      sessionStorage.removeItem("jee_rivals_user");
      localStorage.removeItem("jee_rivals_user");
    }
  } catch (_) {}
}

export function getCachedUser() {
  try {
    const sessionUser = sessionStorage.getItem("jee_rivals_user");
    if (sessionUser) return JSON.parse(sessionUser);
    const localUser = localStorage.getItem("jee_rivals_user");
    return localUser ? JSON.parse(localUser) : null;
  } catch (_) {
    return null;
  }
}

export function setCachedUser(user) {
  try {
    if (user) {
      sessionStorage.setItem("jee_rivals_user", JSON.stringify(user));
      if (isRememberMeEnabled()) {
        localStorage.setItem("jee_rivals_user", JSON.stringify(user));
      } else {
        localStorage.removeItem("jee_rivals_user");
      }
    } else {
      sessionStorage.removeItem("jee_rivals_user");
      localStorage.removeItem("jee_rivals_user");
    }
  } catch (_) {}
}

export function getSavedAccounts() {
  try {
    const raw = localStorage.getItem("jee_saved_accounts");
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

export function recordSavedAccount(user, token = null, pin = null) {
  if (!user || !user.username) return;
  try {
    const activeToken = token || getToken();
    const list = getSavedAccounts();
    const existing = list.find((a) => a.username?.toLowerCase() === user.username?.toLowerCase());
    const preservedToken = activeToken || existing?.token || "";
    const preservedPin = pin || existing?.pin || "";
    const filtered = list.filter(
      (a) => a.username?.toLowerCase() !== user.username?.toLowerCase()
    );
    filtered.unshift({
      id: user.id,
      username: user.username,
      avatar_id: user.avatar_id || "flame",
      overall_elo: Math.round(user.overall_elo || 1200),
      current_division: user.current_division || "BRONZE",
      title: user.title || "JEE Aspirant",
      token: preservedToken,
      pin: preservedPin,
      lastActive: new Date().toISOString()
    });
    localStorage.setItem("jee_saved_accounts", JSON.stringify(filtered.slice(0, 10)));
    localStorage.setItem("jee_saved_username", user.username);
  } catch (_) {}
}

export function removeSavedAccount(username) {
  if (!username) return;
  try {
    const list = getSavedAccounts();
    const filtered = list.filter(
      (a) => a.username?.toLowerCase() !== username?.toLowerCase()
    );
    localStorage.setItem("jee_saved_accounts", JSON.stringify(filtered));
  } catch (_) {}
}

export async function switchSavedAccount(username) {
  const list = getSavedAccounts();
  const acc = list.find((a) => a.username?.toLowerCase() === username?.toLowerCase());
  if (!acc) {
    throw new Error(`Profile '${username}' not found on this device.`);
  }

  // 1. Try saved token first
  if (acc.token) {
    try {
      setToken(acc.token, true);
      const me = await api.auth.getMe();
      setCachedUser(me);
      recordSavedAccount(me, acc.token, acc.pin);
      return me;
    } catch (_) {
      // Session expired, attempt auto-heal via saved PIN
    }
  }

  // 2. Try saved PIN if token expired or container restarted
  if (acc.pin) {
    const resp = await api.auth.login(acc.username, acc.pin);
    setToken(resp.token, true);
    setCachedUser(resp.user);
    recordSavedAccount(resp.user, resp.token, acc.pin);
    return resp.user;
  }

  throw new Error(`Session expired for ${username}. Please enter your PIN to sign in.`);
}

async function request(path, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!res.ok) {
    let errorDetail = "An unexpected error occurred";
    try {
      const data = await res.json();
      errorDetail = data.detail || errorDetail;
    } catch (_) {
      errorDetail = res.statusText || errorDetail;
    }
    const err = new Error(errorDetail);
    err.status = res.status;
    throw err;
  }

  return res.json();
}

export const api = {
  auth: {
    login: (username, pin) =>
      request("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, pin }),
      }),
    register: (username, pin, avatar_id = "default") =>
      request("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ username, pin, avatar_id }),
      }),
    getMe: () => request("/api/auth/me"),
    updateProfile: (data) =>
      request("/api/auth/profile", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    updateLearntChapters: (chapters) =>
      request("/api/auth/learnt-chapters", {
        method: "PUT",
        body: JSON.stringify({ chapters }),
      }),
    changeUsername: (new_username) =>
      request("/api/auth/change-username", {
        method: "POST",
        body: JSON.stringify({ new_username }),
      }),
    changePin: (current_pin, new_pin) =>
      request("/api/auth/change-pin", {
        method: "POST",
        body: JSON.stringify({ current_pin, new_pin }),
      }),
    updateChatSettings: (chat_settings) =>
      request("/api/auth/chat-settings", {
        method: "POST",
        body: JSON.stringify({ chat_settings }),
      }),
    resetData: () =>
      request("/api/auth/reset-data", {
        method: "POST",
      }),
    deleteAccount: (pin, confirmation = "DELETE") =>
      request("/api/auth/delete-account", {
        method: "POST",
        body: JSON.stringify({ pin, confirmation }),
      }),
  },
  questions: {
    getChapters: () => request("/api/questions/chapters"),
    getMasterSyllabus: () => request("/api/questions/syllabus/master"),
    getDaily: () => request("/api/questions/daily"),
    getRandom: (params = {}) => {
      const q = new URLSearchParams(params).toString();
      return request(`/api/questions/random?${q}`);
    },
    getSolution: (id) => request(`/api/questions/${id}/solution`),
    report: (id, data) =>
      request(`/api/questions/${id}/report`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    getReports: (status = null) => {
      const q = status ? `?status=${encodeURIComponent(status)}` : "";
      return request(`/api/questions/reports/all${q}`);
    },
    getQuarantined: () => request("/api/questions/quarantined/all"),
    quarantine: (id) =>
      request(`/api/questions/${id}/quarantine`, {
        method: "POST",
      }),
    dismissReport: (id) =>
      request(`/api/questions/${id}/dismiss`, {
        method: "POST",
      }),
    restore: (id) =>
      request(`/api/questions/${id}/restore`, {
        method: "POST",
      }),
  },
  rooms: {
    getOpen: () => request("/api/rooms/public/open"),
    create: (data) =>
      request("/api/rooms/create", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    join: (code, passcode = null) =>
      request("/api/rooms/join", {
        method: "POST",
        body: JSON.stringify({ code, passcode }),
      }),
    get: (code) => request(`/api/rooms/${code}`),
    leave: (code) =>
      request(`/api/rooms/${code}/leave`, {
        method: "POST",
      }),
    transferHost: (code, new_host_id) =>
      request(`/api/rooms/${code}/transfer_host`, {
        method: "POST",
        body: JSON.stringify({ new_host_id }),
      }),
    claimHost: (code) =>
      request(`/api/rooms/${code}/claim_host`, {
        method: "POST",
      }),
    removePlayer: (code, user_id) =>
      request(`/api/rooms/${code}/remove_player`, {
        method: "POST",
        body: JSON.stringify({ user_id }),
      }),
    start: (code) =>
      request(`/api/rooms/${code}/start`, {
        method: "POST",
      }),
    submit: (code, data) =>
      request(`/api/rooms/${code}/submit`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    submitBulk: (code, answers, total_time_seconds) =>
      request(`/api/rooms/${code}/submit_bulk`, {
        method: "POST",
        body: JSON.stringify({ answers, total_time_seconds }),
      }),
    results: (code) => request(`/api/rooms/${code}/results`),
    getMyHistory: () => request("/api/rooms/my/history"),
    getActive: () => request("/api/rooms/user/active"),
    forfeit: (code) =>
      request(`/api/rooms/${code}/forfeit`, {
        method: "POST",
      }),
  },
  leaderboards: {
    getWeekly: (limit = 50) => request(`/api/leaderboards/weekly?limit=${limit}`),
    getElo: (subject = "overall", limit = 50) =>
      request(`/api/leaderboards/elo?subject=${subject}&limit=${limit}`),
    getDivisionDetails: () => request("/api/leaderboards/division/me"),
    getProfile: (username) =>
      request(`/api/leaderboards/profile/${encodeURIComponent(username)}`),
    updateProfile: (data) =>
      request("/api/leaderboards/profile/me", {
        method: "PUT",
        body: JSON.stringify(data),
      }),
  },
  friends: {
    getAll: () => request('/api/friends'),
    getLeaderboard: (sortBy = 'elo') => request(`/api/friends/leaderboard?sort_by=${sortBy}`),
    add: (username) =>
      request('/api/friends/request', {
        method: 'POST',
        body: JSON.stringify({ username }),
      }),
    remove: (friendId) =>
      request(`/api/friends/${friendId}`, {
        method: 'DELETE',
      }),
    getRequests: () => request('/api/friends/requests'),
    respondRequest: (senderId, accept) =>
      request(`/api/friends/requests/${senderId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ accept }),
      }),
    cancelRequest: (targetId) =>
      request(`/api/friends/requests/${targetId}/cancel`, {
        method: 'DELETE',
      }),
    getNotifications: () => request('/api/friends/notifications'),
    search: (query) => request(`/api/friends/search?q=${encodeURIComponent(query)}`),
    challenge: (friendId, options = {}) =>
      request(`/api/friends/${friendId}/challenge`, {
        method: 'POST',
        body: JSON.stringify(options),
      }),
    getChallenges: () => request('/api/friends/challenges'),
    respondChallenge: (challengeId, accept) =>
      request(`/api/friends/challenges/${challengeId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ accept }),
      }),
    markNotificationRead: (id) =>
      request(`/api/friends/notifications/${id}/read`, {
        method: 'POST',
      }),
    markAllNotificationsRead: () =>
      request('/api/friends/notifications/read-all', {
        method: 'POST',
      }),
    getConversations: () => request('/api/friends/conversations'),
    getChatHistory: (friendId) => request(`/api/friends/chat/${friendId}`),
    sendMessage: (friendId, message, metadata = null) =>
      request(`/api/friends/chat/${friendId}`, {
        method: 'POST',
        body: JSON.stringify({ message, message_type: 'TEXT', metadata }),
      }),
    sendChatChallenge: (friendId, options = {}) =>
      request(`/api/friends/chat/${friendId}/challenge`, {
        method: 'POST',
        body: JSON.stringify(options),
      }),
    respondChatChallenge: (challengeId, accept) =>
      request(`/api/friends/chat/challenge/${challengeId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ accept }),
      }),
  },
  tournaments: {
    getAll: (status = null) => request(`/api/tournaments${status ? `?status_filter=${status}` : ''}`),
    get: (id) => request(`/api/tournaments/${id}`),
    create: (data) =>
      request('/api/tournaments', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    join: (id, passcode = null) =>
      request(`/api/tournaments/${id}/join`, {
        method: 'POST',
        body: JSON.stringify({ passcode }),
      }),
    leave: (id) =>
      request(`/api/tournaments/${id}/leave`, {
        method: 'POST',
      }),
    start: (id) =>
      request(`/api/tournaments/${id}/start`, {
        method: 'POST',
      }),
    simulateMatch: (tournamentId, matchId, winnerPlayerNum = 1) =>
      request(`/api/tournaments/${tournamentId}/matches/${matchId}/simulate?winner_player_num=${winnerPlayerNum}`, {
        method: 'POST',
      }),
  },
  adaptive: {
    start: (data) =>
      request('/api/adaptive/start', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    submit: (sessionId, data) =>
      request(`/api/adaptive/${sessionId}/submit`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    finish: (sessionId) =>
      request(`/api/adaptive/${sessionId}/finish`, {
        method: 'POST',
      }),
    getStats: () => request('/api/adaptive/stats'),
    getSession: (sessionId) => request(`/api/adaptive/${sessionId}`),
  },
  updates: {
    getAll: () => request('/api/updates'),
    getLatest: () => request('/api/updates/latest'),
    markRead: (id) =>
      request(`/api/updates/${id}/read`, {
        method: 'POST',
      }),
    markAllRead: () =>
      request('/api/updates/mark-all-read', {
        method: 'POST',
      }),
    publish: (data) =>
      request('/api/updates/publish', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  mastery: {
    getChapters: () => request('/api/mastery/chapters'),
    getRadar: () => request('/api/mastery/radar'),
    getGraveyard: () => request('/api/mastery/graveyard'),
    toggleBookmark: (questionId, notes = '') =>
      request('/api/mastery/bookmark', {
        method: 'POST',
        body: JSON.stringify({ question_id: questionId, notes }),
      }),
    removeFromGraveyard: (questionId) =>
      request(`/api/mastery/graveyard/${questionId}`, {
        method: 'DELETE',
      }),
    reDuel: (questionIds = null, count = 5) =>
      request('/api/mastery/re-duel', {
        method: 'POST',
        body: JSON.stringify({ question_ids: questionIds, count }),
      }),
  },
  streaks: {
    getMe: () => request('/api/streaks/me'),
    checkIn: () => request('/api/streaks/check-in', { method: 'POST' }),
    buyFreeze: () => request('/api/streaks/buy-freeze', { method: 'POST' }),
  },
};

