# Next task

Built 2026-10-20 for delivery 2026-10-21. Software works end to end in a local browser test (tablet → staff phone alert screen → answer → two-way video → hang up; cancel; missed → text QR; closed → YouTube). Not yet deployed; not yet tested on the real TCL tablet or an iPhone.

## Blocking go-live (need from owner / Vincent)
- **Menu link**: set to `https://www.wingsworldfood.com` (owner-supplied). Both it and the bare domain returned ENOTFOUND (no DNS) from the build environment on 2026-10-20; scan the QR on a phone to confirm it loads before go-live.
- **Hosting decision**: Supabase org already has 2 active free projects (trophy-labs-staging, city2city); a new project likely needs a paid plan or pausing one. Vercel Hobby is non-commercial by its terms. Choose: new paid Supabase project / pause one / other backend.
- **Repository**: create `vincentbrowndesign/wings-world-kiosk` (private) and push this checkout.
- **Secrets** in Vercel: see `.env.example` (generate VAPID with `npm run vapid`).
- **Closed-hours YouTube link** (M.E. music or Wings World TV), **text-us phone number**, **staff code**, slide photos/specials.

## Acceptance still open
- Real devices: Android Chrome autoplay with sound after Start tap; iPhone push delivery and tap-to-answer from a locked phone; camera/mic in iOS Home Screen app.
- Calls across store Wi-Fi ↔ cellular without TURN (inferred to mostly work; unverified).
- Time zone assumed America/Chicago (inferred: Wings World Dallas area). Confirm location.

## Next executable task
Deploy to a preview URL with the chosen backend, register the owner's iPhone, and complete one real call from the tablet at the counter.
