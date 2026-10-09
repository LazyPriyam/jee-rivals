/**
 * Multi-User Client Storage Guardian & Version Manager for JEE Rivals.
 * Guarantees that any updates, account switches, or multi-user browser sharing
 * NEVER ruin, overwrite, or cross-contaminate another candidate's progress.
 */

const STORAGE_VERSION = 2;
const VERSION_KEY = "jee_storage_version";

/**
 * Initializes the client storage guardian.
 * Purges obsolete un-namespaced legacy keys that could leak across user accounts.
 */
export function initStorageGuardian() {
  try {
    const currentVer = parseInt(localStorage.getItem(VERSION_KEY) || "1", 10);
    if (currentVer < STORAGE_VERSION) {
      // Clean up legacy un-namespaced keys from previous versions
      const legacyKeys = [
        "jee_active_test_room",
        "jee_active_adaptive_session",
        "jee_user_learnt_chapters",
        "jee_seen_toast_ids"
      ];
      legacyKeys.forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch (_) {}
      });

      // Remove un-namespaced mock progress keys (e.g. jee_mock_test_progress_ABC12)
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith("jee_mock_test_progress_") && !k.includes("_usr_")) {
          try {
            localStorage.removeItem(k);
          } catch (_) {}
        }
      }

      localStorage.setItem(VERSION_KEY, String(STORAGE_VERSION));
    }
  } catch (_) {}
}

/**
 * Normalizes user ID token for safe key namespacing.
 */
function normalizeUserId(userId) {
  if (!userId) return "guest";
  return String(userId).replace(/[^a-zA-Z0-9_-]/g, "_");
}

// ============================================================================
// STRICTLY ISOLATED ACTIVE ROOMS PER USER
// ============================================================================

export function getActiveTestRoom(userId) {
  if (!userId) return null;
  try {
    return localStorage.getItem(`jee_active_test_room_${normalizeUserId(userId)}`) || null;
  } catch (_) {
    return null;
  }
}

export function setActiveTestRoom(userId, roomCode) {
  if (!userId || !roomCode) return;
  try {
    localStorage.setItem(`jee_active_test_room_${normalizeUserId(userId)}`, roomCode.toUpperCase());
  } catch (_) {}
}

export function clearActiveTestRoom(userId) {
  try {
    if (userId) {
      localStorage.removeItem(`jee_active_test_room_${normalizeUserId(userId)}`);
    }
    // Also ensure legacy un-namespaced key is wiped
    localStorage.removeItem("jee_active_test_room");
  } catch (_) {}
}

// ============================================================================
// STRICTLY ISOLATED MOCK TEST DRAFT PROGRESS PER USER & ROOM
// ============================================================================

export function getMockTestDraftProgress(userId, roomCode) {
  if (!roomCode) return null;
  const uid = normalizeUserId(userId);
  try {
    const raw = localStorage.getItem(`jee_mock_test_progress_usr_${uid}_${roomCode.toUpperCase()}`);
    if (raw) return JSON.parse(raw);
  } catch (_) {}
  return null;
}

export function setMockTestDraftProgress(userId, roomCode, data) {
  if (!roomCode || !data) return;
  const uid = normalizeUserId(userId);
  try {
    localStorage.setItem(
      `jee_mock_test_progress_usr_${uid}_${roomCode.toUpperCase()}`,
      JSON.stringify(data)
    );
  } catch (_) {}
}

export function clearMockTestDraftProgress(userId, roomCode) {
  if (!roomCode) return;
  const uid = normalizeUserId(userId);
  try {
    localStorage.removeItem(`jee_mock_test_progress_usr_${uid}_${roomCode.toUpperCase()}`);
    // Clear legacy keys for safety
    localStorage.removeItem(`jee_mock_test_progress_${roomCode}`);
  } catch (_) {}
}

// ============================================================================
// STRICTLY ISOLATED REPORTED QUESTIONS PER USER & ROOM
// ============================================================================

export function getReportedQuestions(userId, roomCode) {
  if (!roomCode) return new Set();
  const uid = normalizeUserId(userId);
  try {
    const raw = localStorage.getItem(`jee_reported_in_test_usr_${uid}_${roomCode.toUpperCase()}`);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch (_) {
    return new Set();
  }
}

export function addReportedQuestion(userId, roomCode, questionId) {
  if (!roomCode || !questionId) return;
  const uid = normalizeUserId(userId);
  try {
    const key = `jee_reported_in_test_usr_${uid}_${roomCode.toUpperCase()}`;
    const raw = localStorage.getItem(key);
    const set = raw ? new Set(JSON.parse(raw)) : new Set();
    set.add(questionId);
    localStorage.setItem(key, JSON.stringify(Array.from(set)));
  } catch (_) {}
}
