/**
 * Universal Date & Timezone Utilities
 * Dynamically adapts to any user/cashier location worldwide using IANA timezones.
 */

/**
 * Returns the client device's active IANA timezone (e.g. 'America/New_York', 'Asia/Karachi', 'Europe/London')
 */
export const getUserTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
};

/**
 * Returns the client device's active locale (e.g. 'en-PK', 'en-US')
 */
export const getUserLocale = () => {
  try {
    return navigator.language || 'en-US';
  } catch {
    return 'en-US';
  }
};

/**
 * Parse an order object into a reliable UTC JavaScript Date instance.
 * Prefers date_created_gmt to ensure absolute universal accuracy.
 *
 * @param {Object|string|number|Date} input - Order object or date string/timestamp
 * @returns {Date|null} Valid Date object or null
 */
export const parseOrderDate = (input) => {
  if (!input) return null;

  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input;
  }

  // If passing an order object
  if (typeof input === 'object') {
    // 1. Prefer date_created_gmt (Universal UTC timestamp)
    if (input.date_created_gmt && typeof input.date_created_gmt === 'string') {
      const gmtStr =
        input.date_created_gmt.endsWith('Z') || input.date_created_gmt.includes('+')
          ? input.date_created_gmt
          : `${input.date_created_gmt}Z`;
      const date = new Date(gmtStr);
      if (!Number.isNaN(date.getTime())) return date;
    }

    // 2. Fallback to date_created or date
    const dateStr = input.date_created || input.date;
    if (dateStr) {
      const date = new Date(dateStr);
      if (!Number.isNaN(date.getTime())) return date;
    }

    return null;
  }

  // If passing a string or timestamp directly
  if (typeof input === 'string') {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof input === 'number') {
    const date = new Date(input);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  return null;
};

/**
 * Formats a Date object into a YYYY-MM-DD string in a specific timezone.
 *
 * @param {Date} date
 * @param {string} timeZone
 * @returns {string} e.g. "2026-08-26"
 */
export const getCalendarDateKey = (date, timeZone = getUserTimeZone()) => {
  if (!date || Number.isNaN(date.getTime())) return '';
  try {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    return formatter.format(date);
  } catch {
    // Fallback if timezone is invalid
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
};

/**
 * Determines whether an order was created strictly "Today" in the specified (or detected) timezone.
 * Uses exact calendar day boundary (00:00:00 to 23:59:59 in the active timezone).
 *
 * @param {Object|string|Date} order - Order object or date
 * @param {string} [timeZone] - Optional IANA timezone string
 * @returns {boolean}
 */
export const isOrderFromToday = (order, timeZone = getUserTimeZone()) => {
  const orderDate = parseOrderDate(order);
  if (!orderDate) return false;

  const orderKey = getCalendarDateKey(orderDate, timeZone);
  const todayKey = getCalendarDateKey(new Date(), timeZone);

  return orderKey === todayKey && orderKey !== '';
};

/**
 * Localized date formatter
 */
export const formatOrderDate = (input, options = {}) => {
  const date = parseOrderDate(input);
  if (!date) return '—';

  const {
    locale = getUserLocale(),
    timeZone = getUserTimeZone(),
    weekday = 'short',
    year = 'numeric',
    month = 'short',
    day = 'numeric',
  } = options;

  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      weekday,
      year,
      month,
      day,
    }).format(date);
  } catch {
    return date.toLocaleDateString();
  }
};

/**
 * Localized time formatter (e.g. "02:30 PM")
 */
export const formatOrderTime = (input, options = {}) => {
  const date = parseOrderDate(input);
  if (!date) return '—';

  const {
    locale = getUserLocale(),
    timeZone = getUserTimeZone(),
    hour = '2-digit',
    minute = '2-digit',
    hour12 = true,
  } = options;

  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      hour,
      minute,
      hour12,
    }).format(date);
  } catch {
    return date.toLocaleTimeString();
  }
};

/**
 * Localized full datetime formatter
 */
export const formatOrderDateTime = (input, options = {}) => {
  const date = parseOrderDate(input);
  if (!date) return '—';

  const {
    locale = getUserLocale(),
    timeZone = getUserTimeZone(),
    dateStyle = 'medium',
    timeStyle = 'short',
  } = options;

  try {
    return new Intl.DateTimeFormat(locale, {
      timeZone,
      dateStyle,
      timeStyle,
    }).format(date);
  } catch {
    return `${formatOrderDate(date)} ${formatOrderTime(date)}`;
  }
};

/**
 * Formats a date into a human-readable relative time string
 * (e.g. "Just now", "5m ago", "2h ago", "Yesterday", "3d ago")
 */
export const formatTimeAgo = (input) => {
  const date = parseOrderDate(input);
  if (!date) return '—';

  const diffMs = Date.now() - date.getTime();
  if (diffMs < 0) return 'Just now';

  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return 'Just now';

  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 30) return `${diffDays}d ago`;

  const diffMonths = Math.floor(diffDays / 30);
  if (diffMonths < 12) return `${diffMonths}mo ago`;

  return `${Math.floor(diffMonths / 12)}y ago`;
};
