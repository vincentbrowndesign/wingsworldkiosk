// Video call plumbing shared by the kiosk (caller) and the staff page (answerer).
// Signaling travels over a private-named Supabase Realtime broadcast channel.
// SDP is sent once, after ICE gathering, so there is no candidate trickling to keep in order.

const SUPABASE_ESM = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.115.0/+esm';

export async function openChannel(session, onMessage) {
  // Local development only: same-browser tabs talk over BroadcastChannel (see scripts/serve.mjs).
  if (session.transport === 'local') {
    const bc = new BroadcastChannel(session.channel);
    bc.onmessage = (e) => onMessage(e.data);
    return { send: async (payload) => bc.postMessage(payload), close: () => bc.close() };
  }
  const { createClient } = await import(SUPABASE_ESM);
  const client = createClient(session.supabaseUrl, session.supabaseAnonKey, { auth: { persistSession: false } });
  const channel = client.channel(session.channel, { config: { broadcast: { self: false, ack: true } } });
  channel.on('broadcast', { event: 'msg' }, ({ payload }) => onMessage(payload));
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Could not reach the call service')), 15000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        clearTimeout(timer);
        resolve();
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        reject(new Error(`Call service ${status.toLowerCase()}`));
      }
    });
  });
  return {
    send: (payload) => channel.send({ type: 'broadcast', event: 'msg', payload }),
    close: () => client.removeChannel(channel),
  };
}

export async function getMedia({ video = true } = {}) {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: video ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

function gatheringDone(pc, ms = 4000) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    pc.addEventListener('icegatheringstatechange', () => {
      if (pc.iceGatheringState === 'complete') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

export function createPeer({ iceServers, localStream, onRemoteStream, onState }) {
  const pc = new RTCPeerConnection({ iceServers });
  localStream.getTracks().forEach((track) => pc.addTrack(track, localStream));
  pc.addEventListener('track', (event) => onRemoteStream(event.streams[0]));
  pc.addEventListener('connectionstatechange', () => onState(pc.connectionState));
  return {
    pc,
    async offer() {
      await pc.setLocalDescription(await pc.createOffer());
      await gatheringDone(pc);
      return pc.localDescription.toJSON();
    },
    async answer(remote) {
      await pc.setRemoteDescription(remote);
      await pc.setLocalDescription(await pc.createAnswer());
      await gatheringDone(pc);
      return pc.localDescription.toJSON();
    },
    accept: (remote) => pc.setRemoteDescription(remote),
    close: () => pc.close(),
  };
}

export function stopStream(stream) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function postJson(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
  return data;
}
