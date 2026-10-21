// Pure helpers shared by the kiosk, the staff page and the tests.

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function minutes(hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm || '');
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

// Local weekday and minute-of-day for a moment in the restaurant's time zone.
export function localTime(now, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return { day: parts.weekday.slice(0, 3).toLowerCase(), minute: Number(parts.hour) * 60 + Number(parts.minute) };
}

function hoursFor(day, hours) {
  const entry = hours.days?.[day] ?? hours.default;
  return entry === 'closed' || !entry ? null : entry;
}

// Supports closing after midnight, e.g. 17:00–02:00.
export function isOpen(now, hours, timeZone) {
  const { day, minute } = localTime(now, timeZone);
  const today = hoursFor(day, hours);
  if (today) {
    const open = minutes(today.open);
    const close = minutes(today.close);
    if (open !== null && close !== null) {
      if (close > open ? minute >= open && minute < close : minute >= open) return true;
    }
  }
  const yesterday = hoursFor(DAYS[(DAYS.indexOf(day) + 6) % 7], hours);
  if (yesterday) {
    const open = minutes(yesterday.open);
    const close = minutes(yesterday.close);
    if (open !== null && close !== null && close <= open && minute < close) return true;
  }
  return false;
}

export function formatClock(hhmm) {
  const total = minutes(hhmm);
  if (total === null) return '';
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, '0')} ${suffix}` : `${h12} ${suffix}`;
}

export function hoursLabel(hours) {
  const d = hours.default;
  return d && d !== 'closed' ? `${formatClock(d.open)} – ${formatClock(d.close)}` : '';
}

// Accepts a video, playlist, or embed URL and returns a muted-safe autoplay embed URL.
export function youtubeEmbed(url) {
  if (!url) return '';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return '';
  }
  const host = parsed.hostname.replace(/^www\.|^m\./, '');
  const list = parsed.searchParams.get('list');
  let video = '';
  if (host === 'youtu.be') video = parsed.pathname.slice(1);
  else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (parsed.pathname === '/watch') video = parsed.searchParams.get('v') || '';
    else {
      const m = /^\/(?:embed|live|shorts)\/([\w-]+)/.exec(parsed.pathname);
      if (m && m[1] !== 'videoseries') video = m[1];
    }
  } else return '';
  const params = new URLSearchParams({ autoplay: '1', mute: '0', controls: '0', rel: '0', playsinline: '1', loop: '1' });
  if (list) {
    params.set('list', list);
    return `https://www.youtube.com/embed/${video || 'videoseries'}?${params}`;
  }
  if (!/^[\w-]{6,}$/.test(video)) return '';
  params.set('playlist', video); // required for a single video to loop
  return `https://www.youtube.com/embed/${video}?${params}`;
}

export function smsLink(number, body) {
  const digits = String(number || '').replace(/[^\d+]/g, '');
  if (digits.replace(/\D/g, '').length < 10) return '';
  return `sms:${digits}${body ? `?&body=${encodeURIComponent(body)}` : ''}`;
}

export function callId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Draws a pre-rendered QR matrix (see scripts/build-qr.mjs) as an SVG.
export function qrSvg({ size, hex }) {
  const margin = 2;
  const full = size + margin * 2;
  let path = '';
  for (let i = 0; i < size * size; i++) {
    if ((parseInt(hex[i >> 2], 16) >> (3 - (i & 3))) & 1) path += `M${(i % size) + margin},${Math.floor(i / size) + margin}h1v1h-1z`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${full} ${full}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
