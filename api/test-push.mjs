import { handler, isStaff, pushAll } from '../lib/server.mjs';

// POST { code, device } — sends a test alert to one phone.
export default handler(async ({ body }) => {
  if (!isStaff(body.code)) return [401, { error: 'Wrong staff code' }];
  if (!/^[\w-]{8,64}$/.test(String(body.device || ''))) return [400, { error: 'Missing device' }];
  const result = await pushAll({ title: 'Test alert', body: 'Kiosk call alerts are working.' }, { device: body.device });
  return [200, result];
});
