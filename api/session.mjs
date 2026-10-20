import { handler, isKiosk, isStaff, sessionFor } from '../lib/server.mjs';

// GET /api/session?role=kiosk&key=…  or  ?role=staff&code=…
export default handler(
  async ({ query }) => {
    if (query.role === 'kiosk' && isKiosk(query.key)) return [200, sessionFor('kiosk')];
    if (query.role === 'staff' && isStaff(query.code)) return [200, sessionFor('staff')];
    return [401, { error: query.role === 'staff' ? 'Wrong staff code' : 'This kiosk is not set up' }];
  },
  { method: 'GET' },
);
