import { handler, isKiosk, pushAll, recentRing, logEvent } from '../lib/server.mjs';

// POST { key, callId } — the kiosk asks every staff phone to ring.
export default handler(async ({ body }) => {
  if (!isKiosk(body.key)) return [401, { error: 'This kiosk is not set up' }];
  const callId = String(body.callId || '').slice(0, 40);
  if (!/^[\w-]+$/.test(callId)) return [400, { error: 'Missing call id' }];
  if (await recentRing()) return [429, { error: 'A call alert was just sent' }];
  await logEvent('push', { call_id: callId });
  const result = await pushAll({ title: 'Kiosk is calling', body: 'A customer at the counter wants to talk. Tap to answer.', callId });
  return [200, result];
});
