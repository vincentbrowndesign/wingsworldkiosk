# Tablet setup (TCL TAB 8 Gen 2, Android 15)

1. Charge, power on, connect to the restaurant Wi-Fi. Install system updates.
2. Settings → Display: brightness high, **Screen timeout** longest. Settings → About tablet → tap *Build number* 7× → Developer options → **Stay awake** (while charging) ON.
3. Open Chrome and go to the setup link: `https://<kiosk-domain>/?key=<KIOSK_KEY>` (only needed once; the key is remembered).
4. Chrome menu ⋮ → **Add to Home screen** → Install. Open **Wings World** from the home screen.
5. Tap **Start kiosk**. Allow camera and microphone when asked (first call). The start tap is what allows sound and full screen; repeat it after any restart.
6. Lock it to the app: Settings → Security → **App pinning** ON (ask for PIN before unpinning). Open Recents, tap the app icon → **Pin**. To exit: hold Back + Recents, enter PIN.
7. Volume up to ~70 %. Place on the stand at the counter with the camera at face height and the charger plugged in.

Test: tap *Tap to talk to us* → *Start video call*; a registered phone should get an alert within a few seconds.

Wi-Fi is shared with the store: if calls connect but show no video, the network is blocking direct connections and a TURN relay must be added (`TURN_*` settings).
