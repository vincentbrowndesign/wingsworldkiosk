import { handler, isStaff, validSubscription, saveSubscription } from '../lib/server.mjs';

// POST { code, name, device, subscription } — registers a phone for call alerts.
export default handler(async ({ body }) => {
  if (!isStaff(body.code)) return [401, { error: 'Wrong staff code' }];
  const name = String(body.name || '').trim().slice(0, 40);
  const device = String(body.device || '');
  if (!name || !/^[\w-]{8,64}$/.test(device) || !validSubscription(body.subscription)) {
    return [400, { error: 'Missing name or notification details' }];
  }
  await saveSubscription({ device, name, subscription: body.subscription });
  return [200, { ok: true }];
});
