import { handler, isKiosk, logEvent, EVENT_TYPES } from '../lib/server.mjs';

// POST { key, type, callId, name, seconds, detail } — call history for the owner.
export default handler(async ({ body }) => {
  if (!isKiosk(body.key)) return [401, { error: 'This kiosk is not set up' }];
  if (!EVENT_TYPES.includes(body.type)) return [400, { error: 'Unknown event' }];
  await logEvent(body.type, {
    call_id: String(body.callId || '').slice(0, 40) || null,
    answered_by: body.name ? String(body.name).slice(0, 40) : null,
    seconds: Number.isFinite(body.seconds) ? Math.round(body.seconds) : null,
    detail: body.detail ? String(body.detail).slice(0, 200) : null,
  });
  return [200, { ok: true }];
});
