# Wings World counter kiosk

Software for the Wings World counter tablet (TCL TAB 8 Gen 2 on an onn metal stand) and the staff phones that answer it.

- **Tablet** (`/`): while open (11 AM–9 PM, America/Chicago) shows a 3-slide rotation, the brand signature, a menu QR code and **Tap to talk to us**. Tapping starts a video call to staff. Closed: plays the configured YouTube video/playlist with hours and the menu QR.
- **Staff phone** (`/answer.html`): saved to the iPhone Home Screen. Gets a notification when the kiosk calls; tap → Answer. Owner and managers can all register; the first to answer takes the call, the others are told who did.
- **Missed call** (no answer in 45 s): the tablet shows a QR code that opens a text message to the restaurant.
- **Call history**: every ring, answer, miss and drop is written to `kiosk_events` (who answered, how long).

## Change what the kiosk shows

Edit `public/config.json` (slides, hours, YouTube link, menu link, text number, colors, logo) and redeploy. Slide images go in `public/slides/` and are referenced as `/slides/name.jpg`. The tablet re-checks hours every 30 seconds; reload it to pick up new content.

## Run locally

```
npm install
npm run dev     # http://localhost:3300/?key=dev-kiosk  and  /answer.html (code 1234)
npm test
```

Without Supabase settings the dev server uses a same-browser call channel, so a kiosk tab and a staff tab can call each other with no accounts. Push alerts are not sent locally.

## How calls work

Video goes directly between the tablet and the phone (WebRTC). A Supabase Realtime channel with a secret name carries the call setup. The server (`/api`) checks the kiosk key and staff code, stores phone alert subscriptions, and sends Web Push alerts (VAPID). Tables have row-level security with no public access. See `docs/` for setup and `NEXT_TASK.md` for what is still open.
