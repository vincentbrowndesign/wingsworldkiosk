import { qrSvg, isOpen, hoursLabel, formatClock, youtubeEmbed, callId as newCallId } from './logic.mjs';
import { openChannel, getMedia, createPeer, stopStream, postJson } from './call.mjs';

const $ = (id) => document.getElementById(id);
const app = $('app');
const state = { mode: 'setup', config: null, session: null, channel: null, call: null, slide: 0, timers: {} };

function readKey() {
  const fromUrl = new URLSearchParams(location.search).get('key');
  try {
    if (fromUrl) localStorage.setItem('kioskKey', fromUrl);
    return fromUrl || localStorage.getItem('kioskKey') || '';
  } catch {
    return fromUrl || '';
  }
}

function show(mode) {
  state.mode = mode;
  app.dataset.mode = mode;
  clearTimeout(state.timers.idle);
  if (mode === 'confirm' || mode === 'missed') {
    state.timers.idle = setTimeout(goHome, state.config.idleResetSeconds * 1000);
  }
}

function event(type, extra = {}) {
  if (!state.session) return;
  postJson('/api/event', { key: state.key, type, callId: state.call?.id, ...extra }).catch(() => {});
}

// ---------- Home: slideshow when open, YouTube when closed ----------

// Two-colour shout: "Order|Online!" -> orange line, green line.
function shout(text) {
  const [first, ...rest] = String(text).split('|');
  return `<span class="o">${first}</span>${rest.length ? ` <span class="g">${rest.join(' ')}</span>` : ''}`;
}

function renderBrand() {
  const { brand } = state.config;
  document.querySelectorAll('[data-brand-logo]').forEach((el) => {
    el.innerHTML = brand.logo ? `<img src="${brand.logo}" alt="${brand.name}">` : `<span class="wordmark">${brand.name}</span>`;
  });
  document.querySelectorAll('[data-brand-name]').forEach((el) => (el.textContent = brand.name));
  const words = (state.config.marquee || 'Scan for the menu!').toUpperCase();
  document.querySelectorAll('[data-marquee]').forEach((el) => (el.innerHTML = `<span>${words}</span>`.repeat(8)));
  const hours = hoursLabel(state.config.hours);
  document.querySelectorAll('[data-hours-today]').forEach((el) => (el.textContent = `Open ${hours}`));
  const menu = qrSvg(state.qr.menu);
  document.querySelectorAll('[data-menu-qr]').forEach((el) => (el.innerHTML = menu));
  $('closed-message').textContent = state.config.closed.message;
  $('closed-hours').textContent = `Open daily ${hours}`;
}

function renderSlides() {
  // Slides about calling only show once calls are working.
  $('slides').innerHTML = state.config.slides
    .filter((s) => !s.needsCalls || state.session)
    .map(
      (s, i) => `<article class="slide${i === 0 ? ' active' : ''}${s.image ? ' has-image' : ''}"${s.image ? ` style="background-image:url('${s.image}')"` : ''}>
        <h1 class="shout">${shout(s.headline)}</h1><p class="lead">${s.body}</p></article>`,
    )
    .join('');
}

function nextSlide() {
  const slides = $('slides').children;
  if (!slides.length) return;
  slides[state.slide].classList.remove('active');
  state.slide = (state.slide + 1) % slides.length;
  slides[state.slide].classList.add('active');
}

function setPlayer(on) {
  const player = $('player');
  const src = youtubeEmbed(state.config.closed.youtube);
  if (on && !player.firstChild) {
    const opens = state.config.hours.default?.open;
    player.innerHTML = src
      ? `<iframe src="${src}" allow="autoplay; encrypted-media" title="Wings World TV"></iframe>`
      : `<div class="closed-art"><h1 class="shout">${shout("We're|closed!")}</h1><p class="lead">See you at ${formatClock(opens)}</p></div>`;
  } else if (!on) player.innerHTML = '';
}

function goHome() {
  const open = isOpen(new Date(), state.config.hours, state.config.timeZone);
  setPlayer(!open);
  $('talk').hidden = !state.session;
  show(open ? 'idle' : 'closed');
}

// Re-check opening hours every 30 s; never interrupt a call.
function tick() {
  if (['idle', 'closed'].includes(state.mode)) {
    const open = isOpen(new Date(), state.config.hours, state.config.timeZone);
    if ((state.mode === 'idle') !== open) goHome();
  }
}

// ---------- Calling ----------

function onMessage(msg) {
  const call = state.call;
  if (!call || msg.callId !== call.id) return;
  if (msg.type === 'claim' && !call.claimedBy) {
    call.claimedBy = msg.device;
    call.answeredBy = msg.name || 'Wings World';
    clearInterval(state.timers.ring);
    clearTimeout(state.timers.ringTimeout);
    state.channel.send({ type: 'claimed', callId: call.id, device: msg.device, name: call.answeredBy });
    $('ring-status').textContent = `${call.answeredBy} is joining…`;
    connect().catch((error) => endCall('failed', error.message));
  } else if (msg.type === 'answer' && msg.device === call.claimedBy) {
    call.peer.accept(msg.sdp).catch((error) => endCall('failed', error.message));
  } else if (msg.type === 'hangup' && msg.device === call.claimedBy) {
    endCall('ended');
  }
}

async function connect() {
  const call = state.call;
  call.peer = createPeer({
    iceServers: state.session.iceServers,
    localStream: call.stream,
    onRemoteStream: (stream) => {
      $('remote').srcObject = stream;
    },
    onState: (s) => {
      if (s === 'connected' && state.mode !== 'incall') {
        $('self').srcObject = call.stream;
        $('incall-name').textContent = call.answeredBy;
        call.connectedAt = Date.now();
        event('connected', { name: call.answeredBy });
        show('incall');
      } else if (s === 'failed') endCall('failed', 'connection failed');
    },
  });
  const sdp = await call.peer.offer();
  if (state.call !== call) return;
  state.channel.send({ type: 'offer', callId: call.id, device: call.claimedBy, sdp });
  state.timers.connect = setTimeout(() => {
    if (state.mode !== 'incall') endCall('failed', 'no connection after answer');
  }, 25000);
}

async function startCall() {
  const call = { id: newCallId(), startedAt: Date.now() };
  state.call = call;
  $('ring-status').textContent = 'Someone will be right with you.';
  show('ringing');
  try {
    call.stream = await getMedia();
  } catch {
    // Still ring with audio-only if the camera is unavailable.
    call.stream = await getMedia({ video: false }).catch(() => new MediaStream());
  }
  if (state.call !== call) return stopStream(call.stream);
  $('preview').srcObject = call.stream;
  const ring = () => state.channel.send({ type: 'ring', callId: call.id, at: Date.now() });
  ring();
  state.timers.ring = setInterval(ring, 2500);
  state.timers.ringTimeout = setTimeout(() => endCall('missed'), state.config.ringSeconds * 1000);
  event('ring');
  postJson('/api/ring', { key: state.key, callId: call.id }).catch((error) => {
    console.warn('Push notification failed', error);
    event('push-failed', { detail: error.message });
  });
}

function endCall(reason, detail = '') {
  const call = state.call;
  if (!call) return;
  state.call = null;
  ['ring', 'ringTimeout', 'connect'].forEach((t) => {
    clearInterval(state.timers[t]);
    clearTimeout(state.timers[t]);
  });
  state.channel?.send({ type: reason === 'ended' ? 'hangup' : 'cancel', callId: call.id, reason, device: 'kiosk' });
  call.peer?.close();
  stopStream(call.stream);
  ['preview', 'remote', 'self'].forEach((id) => ($(id).srcObject = null));
  const seconds = call.connectedAt ? Math.round((Date.now() - call.connectedAt) / 1000) : 0;
  event(reason === 'ended' && !call.connectedAt ? 'cancelled' : reason, { seconds, detail });

  if (reason === 'missed' || (reason === 'failed' && !call.connectedAt)) {
    const link = state.qr.text;
    $('sms-qr').innerHTML = qrSvg(link || state.qr.menu);
    $('missed-text').textContent = link
      ? "Scan to text us and we'll get right back to you."
      : 'Scan to visit our website.';
    $('sms-qr').nextElementSibling.textContent = link ? 'Scan to text us' : 'Scan for website';
    return show('missed');
  }
  if (reason === 'cancelled') return goHome();
  $('ended-title').innerHTML = shout(reason === 'failed' ? 'The call|dropped' : 'Thanks|for calling!');
  $('ended-text').textContent = reason === 'failed' ? 'Tap to try again any time.' : 'Enjoy your wings.';
  show('ended');
  state.timers.idle = setTimeout(goHome, 6000);
}

// ---------- Startup ----------

async function keepAwake() {
  try {
    state.wakeLock = await navigator.wakeLock?.request('screen');
  } catch {
    /* Android "Stay awake" setting is the fallback; see docs/SETUP-TABLET.md */
  }
}

async function init() {
  [state.config, state.qr] = await Promise.all(
    ['/config.json', '/qr.json'].map((path) => fetch(path, { cache: 'no-store' }).then((r) => r.json())),
  );
  state.key = readKey();
  renderBrand();
  try {
    if (!state.key) throw new Error('not set up yet');
    state.session = await fetch(`/api/session?role=kiosk&key=${encodeURIComponent(state.key)}`).then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'not set up yet');
      return data;
    });
    state.channel = await openChannel(state.session, onMessage);
    $('setup-status').textContent = 'Video calls are ready.';
  } catch (error) {
    state.session = null;
    $('setup-status').textContent = `Ready. Video calls: ${error.message}.`;
  }
  renderSlides();
  $('start').disabled = false;
}

$('start').addEventListener('click', async () => {
  await document.documentElement.requestFullscreen?.().catch(() => {});
  await keepAwake();
  setInterval(nextSlide, state.config.slideSeconds * 1000);
  setInterval(tick, 30000);
  goHome();
});
$('talk').addEventListener('click', () => show('confirm'));
$('slides').addEventListener('click', () => state.session && show('confirm'));
$('call').addEventListener('click', startCall);
$('cancel').addEventListener('click', () => endCall('cancelled'));
$('hangup').addEventListener('click', () => endCall('ended'));
$('ended').addEventListener('click', goHome);
document.querySelectorAll('[data-home]').forEach((b) => b.addEventListener('click', goHome));
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.mode !== 'setup') keepAwake();
});

init();
