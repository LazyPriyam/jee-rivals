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
    const d = new Date(dateOrIso);
    return isNaN(d.getTime()) ? null : d;
  }

  let str = String(dateOrIso).trim();
  if (!str) return null;

  // If ISO string without timezone indicator, treat as UTC
  if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) {
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
    const datePart = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(d);

    const timePart = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);

    if (options.dateOnly) return datePart;
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
  return formatIST(dateOrIso, { timeOnly: true, fallback });
}

/**
 * Formats a concise date & time for compact banners/cards:
 * e.g. "09 Oct, 11:08 PM IST"
 */
export function formatISTDateTimeShort(dateOrIso, fallback = "Recently") {
  const d = parseDate(dateOrIso);
  if (!d) return fallback;

  try {
    const dayMonth = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      day: "2-digit",
      month: "short",
    }).format(d);

    const timePart = new Intl.DateTimeFormat("en-IN", {
      timeZone: IST_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(d);

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

  // Active very recently (< 3 mins)
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

  // Active today (< 24 hours)
  if (diffHour < 24) {
    return {
      isOnline: false,
      badgeText: `Last seen today at ${exactTimeIST}`,
      statusColor: "slate",
      detail: `Last seen today at ${exactTimeIST}`,
      short: `${diffHour}h ago`,
    };
  }

  // Active yesterday (< 48 hours)
  if (diffHour < 48) {
    return {
      isOnline: false,
      badgeText: `Last seen yesterday at ${exactTimeIST}`,
      statusColor: "slate",
      detail: `Last seen yesterday at ${exactTimeIST}`,
      short: "Yesterday",
    };
  }

  // Older than 2 days
  return {
    isOnline: false,
    badgeText: `Last seen ${exactDateIST}, ${exactTimeIST}`,
    statusColor: "slate",
    detail: `Last seen on ${exactDateIST} at ${exactTimeIST}`,
    short: exactDateIST,
  };
}
