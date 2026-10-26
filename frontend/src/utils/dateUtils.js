/**
 * Universal Indian Standard Time (IST, UTC+5:30 / Asia/Kolkata) Engine for JEE Rivals.
 * Enforces authentic IST formatting for all timestamps, examination records,
 * candidate presence badges, and battle logs across the application.
 */

const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Safely parses any date string, timestamp number, or Date instance into a Date object.
 * Correctly treats UTC ISO strings and SQL timestamps as UTC.
 */
export function parseDate(dateOrIso) {
  if (!dateOrIso) return null;
  if (dateOrIso instanceof Date) return isNaN(dateOrIso.getTime()) ? null : dateOrIso;

  if (typeof dateOrIso === "number") {
    const ts = dateOrIso < 1e11 ? dateOrIso * 1000 : dateOrIso;
    const d = new Date(ts);
    return isNaN(d.getTime()) ? null : d;
  }

  let str = String(dateOrIso).trim();
  if (!str) return null;

  // Check if string contains timezone indicator (Z, +HH:MM, -HH:MM, or GMT/UTC)
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2}|GMT|UTC)$/i.test(str);

  // If ISO-like date string without timezone indicator, treat as UTC
  if (!hasTimezone && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(str)) {
    str = str.replace(" ", "T") + "Z";
  }

  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats a date into full IST timestamp:
 * e.g. "09 Oct 2026, 11:08 PM IST"
 */
export function formatIST(dateOrIso, options = {}) {
  const d = parseDate(dateOrIso);
  if (!d) return options.fallback || "Recently";

  try {
    const isDateOnlyInput = typeof dateOrIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateOrIso.trim());
    if (isDateOnlyInput || options.dateOnly) {
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: IST_TIMEZONE,
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(d);
    }

    const datePart = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);

    let timePart = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);

    timePart = timePart.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());

    if (options.timeOnly) return `${timePart} IST`;

    return `${datePart}, ${timePart} IST`;
  } catch (_) {
    return String(dateOrIso).slice(0, 16);
  }
}

/**
 * Formats a date into IST Date format:
 * e.g. "09 Oct 2026"
 */
export function formatISTDate(dateOrIso, fallback = "N/A") {
  return formatIST(dateOrIso, { dateOnly: true, fallback });
}

/**
 * Formats a time into IST Time format:
 * e.g. "11:08 PM IST"
 */
export function formatISTTime(dateOrIso, fallback = "N/A") {
  const d = parseDate(dateOrIso);
  if (!d) return fallback;
  try {
    let timePart = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);
    timePart = timePart.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());
    return `${timePart} IST`;
  } catch (_) {
    return fallback;
  }
}

/**
 * Formats a concise date & time for compact banners/cards:
 * e.g. "09 Oct, 11:08 PM IST"
 */
export function formatISTDateTimeShort(dateOrIso, fallback = "Recently") {
  const d = parseDate(dateOrIso);
  if (!d) return fallback;

  try {
    const isDateOnlyInput = typeof dateOrIso === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateOrIso.trim());
    if (isDateOnlyInput) {
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: IST_TIMEZONE,
        day: "2-digit",
        month: "short",
      }).format(d);
    }

    const dayMonth = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      day: "2-digit",
      month: "short",
    }).format(d);

    let timePart = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);

    timePart = timePart.replace(/\b(am|pm)\b/i, (m) => m.toUpperCase());

    return `${dayMonth}, ${timePart} IST`;
  } catch (_) {
    return fallback;
  }
}

/**
 * Comprehensive candidate presence and last online status generator.
 * Returns structured metadata with online status, badge text, and detailed IST timestamp.
 */
export function formatLastOnline(lastActiveIso, isOnline = false) {
  if (isOnline) {
    return {
      isOnline: true,
      badgeText: "Active Now",
      statusColor: "emerald",
      detail: "Active now in arena",
      short: "Online",
    };
  }

  const d = parseDate(lastActiveIso);
  if (!d) {
    return {
      isOnline: false,
      badgeText: "Offline",
      statusColor: "slate",
      detail: "Last online status unavailable",
      short: "Offline",
    };
  }

  const now = new Date();
  const diffSec = Math.max(0, Math.round((now.getTime() - d.getTime()) / 1000));
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  const exactTimeIST = formatISTTime(d);
  const exactDateIST = formatISTDate(d);

  // Active very recently (< 3 mins or slight negative clock skew)
  if (diffMin < 3) {
    return {
      isOnline: true,
      badgeText: "Active just now",
      statusColor: "emerald",
      detail: "Active just now",
      short: "Just now",
    };
  }

  // Active within the hour (< 60 mins)
  if (diffMin < 60) {
    return {
      isOnline: false,
      badgeText: `Active ${diffMin}m ago`,
      statusColor: "amber",
      detail: `Last active ${diffMin} mins ago (${exactTimeIST})`,
      short: `${diffMin}m ago`,
    };
  }

  // Accurate calendar date comparison in Asia/Kolkata timezone
  const nowDateIST = new Intl.DateTimeFormat("en-CA", { timeZone: IST_TIMEZONE }).format(now);
  const targetDateIST = new Intl.DateTimeFormat("en-CA", { timeZone: IST_TIMEZONE }).format(d);

  // Active today in IST calendar
  if (nowDateIST === targetDateIST) {
    return {
      isOnline: false,
      badgeText: `Last seen today at ${exactTimeIST}`,
      statusColor: "slate",
      detail: `Last seen today at ${exactTimeIST}`,
      short: `${Math.max(1, diffHour)}h ago`,
    };
  }

  // Calculate calendar day difference in IST
  const nowDateObj = new Date(nowDateIST + "T00:00:00Z");
  const targetDateObj = new Date(targetDateIST + "T00:00:00Z");
  const dayDiff = Math.round((nowDateObj.getTime() - targetDateObj.getTime()) / (86400 * 1000));

  // Active yesterday in IST calendar
  if (dayDiff === 1) {
    return {
      isOnline: false,
      badgeText: `Last seen yesterday at ${exactTimeIST}`,
      statusColor: "slate",
      detail: `Last seen yesterday at ${exactTimeIST}`,
      short: "Yesterday",
    };
  }

  // Active within the past 7 days
  if (dayDiff <= 7) {
    return {
      isOnline: false,
      badgeText: `Last seen ${dayDiff}d ago (${exactDateIST})`,
      statusColor: "slate",
      detail: `Last seen on ${exactDateIST} at ${exactTimeIST}`,
      short: `${dayDiff}d ago`,
    };
  }

  // Older than 7 days
  return {
    isOnline: false,
    badgeText: `Last seen ${exactDateIST}, ${exactTimeIST}`,
    statusColor: "slate",
    detail: `Last seen on ${exactDateIST} at ${exactTimeIST}`,
    short: exactDateIST,
  };
}

/**
 * Returns a human-friendly countdown to a target ISO timestamp (e.g. season reset):
 * e.g. "6d 16h left" or "4h 30m left"
 */
export function formatTimeRemaining(targetIso) {
  const d = parseDate(targetIso);
  if (!d) return null;
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  if (diffMs <= 0) return "Resetting soon...";

  const diffSec = Math.floor(diffMs / 1000);
  const days = Math.floor(diffSec / 86400);
  const hours = Math.floor((diffSec % 86400) / 3600);
  const mins = Math.floor((diffSec % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h left`;
  }
  if (hours > 0) {
    return `${hours}h ${mins}m left`;
  }
  return `${Math.max(1, mins)}m left`;
}
