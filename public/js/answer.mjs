import { openChannel, getMedia, createPeer, stopStream, postJson } from './call.mjs';

const $ = (id) => document.getElementById(id);
const app = $('app');
const state = { staff: null, session: null, channel: null, ring: null, call: null, done: new Set(), timers: {} };

const isIos = /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

function view(name) {
  app.dataset.view = name;
}

function status(text, ok = false) {
  $('status').textContent = text;
  $('status-dot').className = ok ? 'ok' : '';
}

function notice(title, text) {
  if (state.ring) state.done.add(state.ring.callId);
  $('notice-title').textContent = title;
  $('notice-text').textContent = text;
  view('notice');
}

function loadStaff() {
  try {
    return JSON.parse(localStorage.getItem('staff') || 'null');
  } catch {
    return null;
  }
}

function base64ToBytes(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function fetchSession(code) {
  const r = await fetch(`/api/session?role=staff&code=${encodeURIComponent(code)}`);
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || 'Could not sign in');
  return data;
}

// ---------- Signaling ----------

function onMessage(msg) {
  const ring = state.ring;
  if (msg.type === 'ring') {
    // Ignore rings for calls this phone already declined or saw end.
    if (state.call || state.done.has(msg.callId)) return;
    state.ring = { callId: msg.callId, seenAt: Date.now() };
    if (app.dataset.view !== 'incoming') view('incoming');
    return;
  }
  if (!ring || msg.callId !== ring.callId) return;
  const mine = state.call && state.call.callId === msg.callId;
  if (msg.type === 'claimed') {
    if (msg.device === state.staff.device) {
      if (state.call) state.call.confirmed = true;
    } else if (!mine) {
      notice('Answered', `${msg.name || 'Someone else'} picked up the kiosk call.`);
      state.ring = null;
    } else {
      endLocal();
      notice('Answered', `${msg.name || 'Someone else'} picked up first.`);
    }
  } else if (msg.type === 'offer' && mine && msg.device === state.staff.device) {
    state.call.peer
      .answer(msg.sdp)
      .then((sdp) => state.channel.send({ type: 'answer', callId: msg.callId, device: state.staff.device, sdp }))
      .catch((error) => failed(error.message));
  } else if (msg.type === 'cancel' || msg.type === 'hangup') {
    const wasLive = mine;
    endLocal();
    if (wasLive) notice('Call ended', 'The customer ended the call.');
    else notice('Missed call', msg.reason === 'missed' ? 'Nobody picked up in time. The kiosk showed a text option.' : 'The customer cancelled.');
    state.ring = null;
  }
}

// If the kiosk stops re-broadcasting the ring, the call is over.
setInterval(() => {
  if (app.dataset.view === 'incoming' && state.ring && Date.now() - state.ring.seenAt > 8000) {
    notice('Missed call', 'That call already ended.');
    state.ring = null;
  }
}, 1000);

async function answer() {
  const callId = state.ring?.callId;
  if (!callId) return;
  view('connecting');
  let stream;
  try {
    stream = await getMedia({ video: $('camera').checked });
  } catch {
    return failed('Allow microphone access for WW Kiosk to answer calls.');
  }
  const call = { callId, stream };
  state.call = call;
  call.peer = createPeer({
    iceServers: state.session.iceServers,
    localStream: stream,
    onRemoteStream: (remote) => ($('remote').srcObject = remote),
    onState: (s) => {
      if (s === 'connected') {
        clearTimeout(state.timers.connect);
        $('self').srcObject = stream;
        view('incall');
      } else if (s === 'failed') failed('The connection dropped.');
    },
  });
  state.channel.send({ type: 'claim', callId, device: state.staff.device, name: state.staff.name });
  state.timers.connect = setTimeout(() => {
    if (app.dataset.view === 'connecting') failed('Could not connect to the kiosk.');
  }, 25000);
}

function endLocal() {
  clearTimeout(state.timers.connect);
  if (!state.call) return;
  state.call.peer.close();
  stopStream(state.call.stream);
  state.call = null;
  $('remote').srcObject = null;
  $('self').srcObject = null;
}

function failed(message) {
  if (state.call) state.channel.send({ type: 'hangup', callId: state.call.callId, device: state.staff.device });
  endLocal();
  notice('Call problem', message);
}

// ---------- Setup ----------

async function subscribePush(session) {
  const registration = await navigator.serviceWorker.register('/sw.js');
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return (
    existing ||
    registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToBytes(session.vapidPublicKey) })
  );
}

async function connect() {
  state.session = await fetchSession(state.staff.code);
  state.channel = await openChannel(state.session, onMessage);
  status('Ready for calls', true);
}

async function start() {
  if (isIos && !standalone) return view('install');
  state.staff = loadStaff();
  if (!state.staff) return view('signin');
  try {
    await connect();
    const callFromNotification = new URLSearchParams(location.search).get('call');
    if (callFromNotification) {
      history.replaceState(null, '', '/answer.html');
      view('connecting');
      // The kiosk re-sends its ring every few seconds; wait briefly for it.
      setTimeout(() => {
        if (app.dataset.view === 'connecting' && !state.call) notice('Missed call', 'That call already ended.');
      }, 6000);
    } else view('ready');
  } catch (error) {
    status('Offline');
    notice('Not connected', error.message);
  }
}

$('signin').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = new FormData(e.target);
  const name = form.get('name').trim();
  const code = form.get('code').trim();
  $('signin-error').textContent = '';
  try {
    // Permission must be requested directly from this tap on iPhone.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notifications are blocked. Allow them in Settings → Notifications → WW Kiosk.');
    const session = await fetchSession(code);
    const subscription = await subscribePush(session);
    const device = loadStaff()?.device || crypto.randomUUID();
    await postJson('/api/subscribe', { code, name, device, subscription: subscription.toJSON() });
    state.staff = { name, code, device };
    localStorage.setItem('staff', JSON.stringify(state.staff));
    await connect();
    view('ready');
  } catch (error) {
    $('signin-error').textContent = error.message;
  }
});

$('test').addEventListener('click', async () => {
  $('test-result').textContent = 'Sending…';
  try {
    const result = await postJson('/api/test-push', { code: state.staff.code, device: state.staff.device });
    $('test-result').textContent = result.sent ? 'Sent. It should arrive in a few seconds.' : 'This phone is not registered. Sign in again.';
  } catch (error) {
    $('test-result').textContent = error.message;
  }
});

$('answer').addEventListener('click', answer);
$('decline').addEventListener('click', () => {
  if (state.ring) state.done.add(state.ring.callId);
  state.ring = null;
  view('ready');
});
$('hangup').addEventListener('click', () => {
  if (state.call) state.channel.send({ type: 'hangup', callId: state.call.callId, device: state.staff.device });
  endLocal();
  if (state.ring) state.done.add(state.ring.callId);
  state.ring = null;
  view('ready');
});
$('notice-ok').addEventListener('click', () => view(state.staff ? 'ready' : 'signin'));

navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.type === 'open-call' && !state.call && app.dataset.view !== 'incoming') view('connecting');
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.staff && !state.channel) start();
});

start();
