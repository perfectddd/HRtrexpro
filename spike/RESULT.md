# Spike result — Amazfit T-Rex Pro + Web Bluetooth

Date: 2026-11-08 · Host: Windows 10 PC, Chrome, Intel Wireless Bluetooth · Watch: Amazfit T-Rex Pro

## S1 — Read heart rate: ✅ PASS (with auth key; NOT via broadcast)

| Attempt | Result |
|---|---|
| Filter `services: ['heart_rate']` | ❌ "No compatible devices found" — watch advertises only `fee0`, no `180d` in advertisement |
| Scan all → connect while phone/Zepp connected | ❌ `NetworkError: Connection attempt failed` |
| Connect without auth (phone BT off) | GATT ok, services `180d, fee1, fee0`, HR notifications start, **0 packets**, watch disconnects after ~20 s |
| Connect + Huami auth with existing key | ✅ `AUTH OK`, HR packets arrive (~1 per 2–3 s), 83–86 bpm, stays connected > 1 min with ping |

Working sequence:
1. `requestDevice({ filters: [{ namePrefix: 'Amazfit' }, { services: [fee0] }], optionalServices: ['heart_rate', fee0, fee1] })`
2. Auth char `00000009-0000-3512-2118-0009af100700` (service `fee1`): start notifications
3. Write `82 00 02 01 00` (request random, crypt flag 0x80) → watch replies `10 82 01 <16 random bytes>`
4. Write `83 00 <AES-128-ECB(random, authKey)>` → watch replies `10 83 01` = success
5. Heart Rate `180d`/`2a37`: start notifications
6. `2a39` write `15 02 00`, `15 01 00`, `15 01 01` (continuous), then `16` every 12 s as keep-alive

Notes:
- Crypt flag **0x80 is required** on this watch.
- Watch accepts only one central: Zepp on the phone must be disconnected (phone Bluetooth off) while the app is connected.
- No "Heart rate sharing / broadcast" menu was found, so the no-key route is not available.
- The key comes from Zepp → Profile → Settings → About → tap logo 10× → Network diagnostics → Share logs (the method Notify for Xiaomi uses). Never reset/unpair the watch: that changes the key.

Main app (`hr-trainer/`) with the auth key in Settings: ✅ confirmed working on the PC browser by the user (2026-11-08).

## S2 — PiP opens: ✅ on desktop Chrome (not yet tested on Android)
## S3 — PiP keeps updating with YouTube on top: ⏳ not tested yet (needs Android device)

## Decision
`hr-source.js` must use the auth-key flow above. The app needs an auth key setting. The rest of the app (zones, timer, alerts, history, PiP) is unaffected.
