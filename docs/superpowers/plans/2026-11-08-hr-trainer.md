# HR Trainer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** สร้าง PWA บน Chrome Android ที่อ่านชีพจรจาก Amazfit T-Rex Pro ผ่าน Web Bluetooth แล้วแสดง Zone, จับเวลา, รัน workout ที่ผู้ใช้สร้างเอง, แจ้งเตือนด้วยเสียง/สั่น/แฟลช, รองรับ PiP และเก็บประวัติใน IndexedDB

**Architecture:** static PWA ใช้ vanilla JS ES modules ไม่มี build และไม่มี backend
logic หลัก (parse, zones, workout model/timer, alerts plan, summary, recorder) เขียนเป็นโมดูลล้วน
ที่ไม่แตะ DOM และทดสอบด้วย `node --test`
ส่วนที่แตะ browser API (BLE, IndexedDB, Audio, PiP, UI) เป็นชั้นบางๆ ทดสอบด้วยมือผ่านโหมด Demo

**Tech Stack:** HTML/CSS/JS (ES2022 modules), Web Bluetooth, IndexedDB, Web Audio, Vibration API,
Screen Wake Lock, Picture-in-Picture (canvas `captureStream`), Service Worker, Node 24 `node:test`

**Spec:** `docs/superpowers/specs/2026-11-08-hr-trainer-design.md`

## Global Constraints

- ไม่มี runtime dependency และไม่มี bundler; dev dependency = 0 (ใช้ `node --test` ในตัว)
- เป้าหมายคือ Chrome บน Android; Web Bluetooth ต้องรันใน secure context (HTTPS หรือ `localhost`)
- BLE: Heart Rate Service `0x180D`, characteristic Heart Rate Measurement `0x2A37`
- Zone bounds ค่าเริ่มต้น `[50,60,70,80,90,100]` (%HRmax); HRmax = `220 − age` เว้นแต่ `hrMaxManual`
- สี Zone: Z1 `#9e9e9e`, Z2 `#2196f3`, Z3 `#4caf50`, Z4 `#ff9800`, Z5 `#f44336`, Z0/ไม่มีข้อมูล `#424242`
- การเปลี่ยน Zone ต้องคงอยู่ ≥ 3000 ms; bpm ที่ใช้ได้คือ 1–230 เท่านั้น
- Reconnect backoff (ms): `1000, 2000, 4000, 8000, 10000` (ค้างที่ 10000)
- Recorder บันทึก 1 Hz และ checkpoint ทุก 30 วินาที; sample ที่ bpm เก่ากว่า 3 วินาทีให้บันทึกเป็น `bpm: null`
- เตือนเกินเป้าหรืออยู่ Z5: ซ้ำทุก `zoneHighRepeatSec` (ค่าเริ่มต้น 10); เตือนต่ำกว่าเป้าเมื่อต่ำต่อเนื่อง ≥ 10 วินาที
- Layout แบบ compact เมื่อความสูงหน้าต่าง < 400px; PiP canvas 320×180 วาดที่ 4 fps
- IndexedDB ชื่อ `hr-trainer` version 1, stores: `settings`, `workouts`, `sessions`, `checkpoint`
- ข้อความ UI เป็นภาษาไทย
- โค้ดทั้งหมดอยู่ใน `hr-trainer/`; โค้ด spike อยู่ใน `spike/` และทิ้งหลังใช้

## Review Focus

1. **HR packet ที่มี flag อื่นนอกจาก bpm** (uint16 bpm, energy expended, RR หลายค่า) — ต้อง parse bpm ถูกและ offset ของ RR ถูก → ทดสอบใน Task 2
2. **ชีพจรแกว่งรอบขอบ Zone** (เช่น 139/141 สลับทุกวินาที) — ต้องไม่ส่ง event ถี่ และส่งเพียงครั้งเดียวเมื่อค้างครบ 3 วินาที → ทดสอบใน Task 3
3. **Step แบบ open (`durationSec: null`) อยู่ใน Repeat** — ต้องไม่นับถอยหลัง ไม่จบเอง และจะไปต่อเมื่อกด skip เท่านั้น → ทดสอบใน Task 5
4. **Pause ข้ามขอบ step / pause ระหว่างนับ 3-2-1** — เวลาต้องไม่เดินระหว่าง pause และ countdown ต้องไม่ยิงซ้ำหลัง resume → ทดสอบใน Task 5
5. **Session ที่ BLE หลุดตลอดทั้งรอบ** (ทุก sample เป็น `bpm:null`) — summary ต้องให้ `avg/max/min = null` ไม่ใช่ `NaN`/`Infinity` และ zoneSec เป็นศูนย์ทั้งหมด → ทดสอบใน Task 6

---

### Task 0: ตั้งค่า repo และ test runner

**Files:**
- Create: `.gitignore`, `package.json`, `hr-trainer/test/smoke.test.js`

- [ ] **Step 1:** `git init` ที่ `C:\Users\perfe\Desktop\reaNotifyforamazfit` (เป็น repo แยก ไม่ใช่ repo ของ home)
- [ ] **Step 2:** `.gitignore` ใส่ `*.apk`, `node_modules/`
- [ ] **Step 3:** `package.json` = `{ "name": "hr-trainer", "private": true, "type": "module", "scripts": { "test": "node --test hr-trainer/test/", "serve": "python -m http.server 8080" } }`
- [ ] **Step 4:** `smoke.test.js` มี `test('runner works', () => assert.equal(1, 1))`
- [ ] **Step 5:** Run `npm test` → Expected: `pass 1`
- [ ] **Step 6:** Commit `chore: init hr-trainer project` (รวม spec และ plan)

---

### Task 1: Spike — BLE + PiP บนเครื่องจริง (โค้ดทิ้ง)

**Files:**
- Create: `spike/index.html` (ไฟล์เดียว มี inline JS)

**Interfaces:** ไม่มี (โค้ดทิ้ง ไม่มีโมดูลอื่นใช้)

- [ ] **Step 1:** หน้ามีปุ่ม "Connect" ซึ่งเรียก `requestDevice({ filters:[{services:['heart_rate']}] })` แล้ว `startNotifications()` บน `heart_rate_measurement` และแสดง bpm กับเวลาที่นับขึ้นทุกวินาที
- [ ] **Step 2:** ปุ่ม "PiP" วาด bpm และเวลาลง canvas 320×180 ทุก 250ms แล้วใช้ `canvas.captureStream(4)` → `<video muted playsinline>` → `video.play()` → `video.requestPictureInPicture()`
- [ ] **Step 3:** เมื่อ bpm เปลี่ยน จะเล่น beep 50ms ด้วย `AudioContext` (สร้างตอนกด Connect)
- [ ] **Step 4:** ทดสอบในเครื่อง: `npm run serve`, เปิดมือถือแบบ USB debugging แล้วรัน `adb reverse tcp:8080 tcp:8080` จากนั้นเปิด `http://localhost:8080/spike/` ใน Chrome บนมือถือ (`localhost` นับเป็น secure context)
- [ ] **Step 5 (ผู้ใช้ทดสอบ):** เปิด Heart Rate Broadcast บน T-Rex Pro แล้วตรวจตามเกณฑ์
  - **S1:** bpm อัปเดตต่อเนื่อง
  - **S2:** PiP ลอยทับหน้า Home ได้ และย่อ/ขยายได้
  - **S3:** เปิด YouTube แล้ว bpm และเวลาใน PiP ยังเดิน และยังได้ยิน beep
- [ ] **Step 6:** บันทึกผลลงไฟล์ `spike/RESULT.md` แล้ว commit `spike: ble + pip feasibility`
- [ ] **Gate:**
  - ถ้า **S1 ไม่ผ่าน** → หยุด แล้วกลับไปออกแบบใหม่
  - ถ้า **S3 ไม่ผ่าน** → ข้าม Task 15 (PiP) และทำงานส่วนอื่นต่อได้

---

### Task 2: `hr-parse.js`

**Files:** Create `hr-trainer/js/hr-parse.js`, Test `hr-trainer/test/hr-parse.test.js`

**Interfaces — Produces:**
- `parseHeartRate(dataView: DataView) -> { bpm: number, rr: number[] /* ms, ปัดเป็นจำนวนเต็ม */ }`
- `isValidBpm(bpm: number) -> boolean` (true เมื่อ 1 ≤ bpm ≤ 230)

- [ ] **Step 1: เขียน test ที่ fail ก่อน**
  - `parses uint8 bpm`: bytes `[0x00, 72]` → `{bpm:72, rr:[]}`
  - `parses uint16 bpm`: `[0x01, 0x2C, 0x01]` → bpm `300`
  - `skips energy expended before RR`: `[0x18, 80, 0x10,0x00, 0x00,0x04]` → `{bpm:80, rr:[1000]}` (flag 0x08 = energy 2 bytes, 0x10 = RR; RR 1024/1024 s)
  - `parses multiple RR`: `[0x10, 60, 0x00,0x04, 0x00,0x02]` → rr `[1000, 500]`
  - `isValidBpm`: 0→false, 1→true, 230→true, 231→false
- [ ] **Step 2:** `npm test` → FAIL (module not found)
- [ ] **Step 3:** เขียนโค้ดตาม flags: bit0 = uint16, bit3 = energy (ข้าม 2 bytes), bit4 = RR (uint16 LE จนจบ buffer, ×1000/1024)
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: parse BLE heart rate measurement`

---

### Task 3: `zones.js` + ค่า settings เริ่มต้น

**Files:** Create `hr-trainer/js/zones.js`, `hr-trainer/js/settings-defaults.js`; Test `hr-trainer/test/zones.test.js`

**Interfaces — Produces:**
- `DEFAULT_SETTINGS` (ใน `settings-defaults.js`)
  - `{ age: 30, hrMax: 190, hrMaxManual: false, zoneBounds: [50,60,70,80,90,100], muted: false, zoneHighRepeatSec: 10, alerts: {...} }`
  - `alerts` มี key `countdown, stepChange, zoneChange, zoneHigh, belowTarget, disconnect` แต่ละตัวเป็น `{sound:true, vibrate:true, flash:true}`
- `ZONE_COLORS: string[6]` (index 0–5 ตาม Global Constraints)
- `hrMaxFor(settings) -> number`
- `pctOfMax(bpm, hrMax) -> number` (ปัดเป็นจำนวนเต็ม)
- `zoneFor(bpm, hrMax, zoneBounds) -> 0|1|2|3|4|5`
  - pct < bounds[0] → 0; pct ≥ bounds[5] → 5; อื่นๆ คือ i ที่ bounds[i-1] ≤ pct < bounds[i]
- `class ZoneDetector { constructor({ holdMs = 3000 } = {}); update(zone: number, nowMs: number) -> { from: number, to: number } | null; get current(): number | null }`
  - update ครั้งแรกจะตั้ง `current` โดยไม่ส่ง event

- [ ] **Step 1: เขียน test ที่ fail ก่อน**
  - `hrMaxFor({age:40, hrMaxManual:false})` → 180; `{hrMax:195, hrMaxManual:true}` → 195
  - `zoneFor` เมื่อ hrMax 200: bpm 99→0, 100→1, 139→2, 140→3, 179→4, 180→5, 200→5, 230→5
  - `detector emits once after hold`: update(3,0); update(4,1000) → null; update(4,3999) → null; update(4,4000) → `{from:3,to:4}`; update(4,5000) → null
  - `flapping never emits` (Review Focus 2): สลับ 3/4 ทุก 1000ms เป็นเวลา 20s แล้วทุกครั้งได้ null และ `current` ยังเป็น 3
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** เขียนโค้ด ZoneDetector โดยเก็บ `pending` zone และ `pendingSince`; ถ้า zone เท่ากับ current ให้ล้าง pending
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: heart rate zones and change detector`

---

### Task 4: `workout-model.js`

**Files:** Create `hr-trainer/js/workout-model.js`; Test `hr-trainer/test/workout-model.test.js`

**Interfaces — Produces:**
- Types ตาม spec หัวข้อ 4 (`Workout`, `Step`, `Repeat`)
- `flattenWorkout(workout) -> FlatStep[]`
  - `FlatStep = { name, kind, durationSec: number|null, targetZone: {min,max}|null, color, round: number|null, rounds: number|null }`
- `validateWorkout(workout) -> string[]` (array ว่าง = ใช้ได้; ข้อความภาษาไทย)
- `totalDurationSec(workout) -> { sec: number, hasOpen: boolean }`
- `createFromTemplate(key: 'free'|'interval'|'tabata', nowMs: number) -> Workout`
  - id ได้จาก `crypto.randomUUID()`
  - ชื่อ: `'อิสระ'`, `'Interval'`, `'Tabata'`
- ค่า kind → สีเริ่มต้น `KIND_COLORS`: warmup `#ffc107`, work `#ff9800`, rest `#2196f3`, cooldown `#00bcd4`, other `#9e9e9e`

- [ ] **Step 1: เขียน test ที่ fail ก่อน**
  - `tabata flattens to 18 steps`: warmup + 16 (work/rest สลับกัน) + cooldown โดย step[1] = `{kind:'work', durationSec:20, round:1, rounds:8}`
  - `tabata total`: `5*60 + 8*30 + 5*60 = 840`, `hasOpen:false`
  - `free has one open step`: `totalDurationSec` → `{sec:0, hasOpen:true}`
  - `interval`: warmup 300, [60 work, 60 rest]×8, cooldown 300
  - `validate rejects`: repeat `times:0`, step `durationSec:0`, workout ที่ไม่มี item, ชื่อว่าง → แต่ละกรณีได้ error ≥ 1 ข้อ
  - `validate rejects nested repeat` (Repeat ที่อยู่ใน Repeat)
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** เขียนโค้ด
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: workout model with templates`

---

### Task 5: `workout-timer.js`

**Files:** Create `hr-trainer/js/workout-timer.js`; Test `hr-trainer/test/workout-timer.test.js`

**Interfaces:**
- Consumes: `FlatStep[]` จาก Task 4
- Produces: `class WorkoutTimer`
  - `constructor(steps: FlatStep[])`
  - `start(nowMs) -> Event[]`, `pause(nowMs)`, `resume(nowMs)`, `skip(nowMs) -> Event[]`, `stop(nowMs) -> Event[]`, `tick(nowMs) -> Event[]`
  - `getState(nowMs) -> { status:'idle'|'running'|'paused'|'finished', stepIndex, step, nextStep|null, stepElapsedSec, stepRemainingSec|null, totalElapsedSec }`
  - `Event = {type:'stepStart', index, step} | {type:'countdown', n: 3|2|1} | {type:'finished'}`
  - เวลาทั้งหมดเป็นวินาทีแบบทศนิยม; UI เป็นคนปัดเอง

- [ ] **Step 1: เขียน test ที่ fail ก่อน** (steps: A 10s, B open, C 5s)
  - `start emits stepStart 0`
  - `countdown fires 3,2,1 once each`: tick ที่ 7.0 → `[countdown 3]`; ที่ 7.5 → `[]`; 8.0 → `[countdown 2]`; 9.0 → `[countdown 1]`; 10.0 → `[stepStart 1]`
  - `tick with large gap emits all crossed events in order` (tick 0 แล้วกระโดดไป 10.0 → countdown 3,2,1 แล้ว stepStart 1)
  - `open step never ends by time` (Review Focus 3): ที่ step B tick ไปถึง 1000s ไม่มี event และ `stepRemainingSec === null`; `skip` → stepStart 2
  - `open step inside repeat` ทำงานเหมือนกัน (ใช้ steps จาก `flattenWorkout`)
  - `pause freezes time` (Review Focus 4): pause ที่ 7.5, resume ที่ 100 แล้ว `stepElapsedSec` ≈ 7.5; tick ที่ 100.5 → `[countdown 2]` (ไม่ยิง 3 ซ้ำ)
  - `last step ends with finished`, `totalElapsedSec` ไม่นับช่วง pause
  - `stop emits finished` และ status = `'finished'`
  - `countdown skipped when step shorter than n`: step 2s → countdown แค่ 1
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** เขียนโค้ดโดยเก็บ `stepStartedAt`, `pausedAccum`, `firedCountdowns:Set` ต่อ step; tick วน loop จนกว่าจะไม่มี step ที่ข้ามขอบเวลาอีก
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: workout timer state machine`

---

### Task 6: `session-summary.js` + `session-recorder.js`

**Files:** Create `hr-trainer/js/session-summary.js`, `hr-trainer/js/session-recorder.js`; Test `hr-trainer/test/session.test.js`

**Interfaces — Produces:**
- `summarize(samples: {t,bpm,zone,stepIndex}[]) -> { durationSec, avg: number|null, max: number|null, min: number|null, zoneSec: number[5] /* Z1..Z5 */ }`
  - avg ปัดเป็นจำนวนเต็ม; durationSec = จำนวน sample (เพราะบันทึก 1 Hz)
- `toCsv(session) -> string` header `t,bpm,zone,stepIndex`; ค่า null เป็นช่องว่าง
- `class SessionRecorder`
  - `constructor({ workoutId, workoutName, startedAt, onCheckpoint, checkpointEverySec = 30 })`
  - `addSample({t, bpm, zone, stepIndex})`
  - `markStep({name, kind, startT})` (จะปิด `endT` ของ step ก่อนหน้าให้)
  - `snapshot() -> Session`
  - `finish(endedAt) -> Session` (คำนวณ `summary` ให้ด้วย)
  - `static fromCheckpoint(session) -> SessionRecorder`

- [ ] **Step 1: เขียน test ที่ fail ก่อน**
  - `summarize basic`: bpm [100,120,140] zone [1,2,3] → avg 120, max 140, min 100, zoneSec [1,1,1,0,0]
  - `summarize ignores null` : [100,null,140] → avg 120, durationSec 3
  - `all-null session` (Review Focus 5): avg/max/min = `null`, zoneSec `[0,0,0,0,0]`
  - `recorder calls onCheckpoint every 30 samples` (เรียก 2 ครั้งที่ 60 samples)
  - `markStep closes previous`: endT ของ step แรก = startT ของ step ที่สอง
  - `toCsv` บรรทัดที่สองของ `[ {t:0,bpm:null,zone:0,stepIndex:0} ]` = `0,,0,0`
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** เขียนโค้ด
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: session recorder and summary`

---

### Task 7: `alerts.js` — แผนการแจ้งเตือน + TargetMonitor + player

**Files:** Create `hr-trainer/js/alerts.js`; Test `hr-trainer/test/alerts.test.js`

**Interfaces — Produces:**
- `alertPlan(event: AlertEvent, settings) -> { sound: string|null, vibrate: number[]|null, flash: string|null }`
  - `AlertEvent.type` ∈ `countdown | stepStart | zoneUp | zoneDown | zoneHigh | belowTarget | disconnect` (stepStart มี `kind`)
  - การแมปเป็นไปตาม spec หัวข้อ 6:
    - sound keys: `'tick'`, `'workStart'`, `'restStart'`, `'zoneUp'`, `'zoneDown'`, `'warn'`, `'soft'`, `'alarm'`
    - vibrate: work `[400]`, rest `[150,100,150]`, zoneHigh `[200]`, disconnect `[500]`
    - flash: work `'#ff9800'`, rest `'#2196f3'`, zoneHigh `'#f44336'`
  - stepStart ที่ kind ไม่ใช่ work/rest ให้ใช้ sound `'workStart'` แต่ flash เป็น `null`
  - settings key mapping: countdown→`countdown`, stepStart→`stepChange`, zoneUp/zoneDown→`zoneChange`, zoneHigh→`zoneHigh`, belowTarget→`belowTarget`, disconnect→`disconnect`
  - `settings.muted` ทำให้ `sound=null` เท่านั้น
- `class TargetMonitor`
  - `constructor({ repeatSec, belowSec = 10 })`
  - `update({ zone, targetZone, nowMs }) -> AlertEvent[]`
  - "สูง" = zone 5 หรือ zone > targetZone.max; "ต่ำ" = zone < targetZone.min และต่อเนื่อง ≥ belowSec
  - `reset()` เรียกตอนเริ่ม step ใหม่
- `class AlertPlayer` (ไม่มี unit test): `unlock()` สร้างหรือ resume AudioContext; `play(plan, flashEl)`; ใช้ oscillator โทน: tick 880Hz 60ms, workStart 1320Hz 500ms, restStart 440Hz 150ms×2, zoneUp 660→990Hz, zoneDown 990→660Hz, warn 1000Hz 200ms×2, soft 520Hz 120ms, alarm 300Hz 600ms

- [ ] **Step 1: เขียน test ที่ fail ก่อน**
  - `work start plan` = `{sound:'workStart', vibrate:[400], flash:'#ff9800'}`
  - `muted removes only sound`
  - `per-event toggle`: `alerts.zoneChange.sound=false` → zoneUp sound null แต่ countdown ยังมีเสียง
  - `zoneHigh repeats every repeatSec`: zone 5 ต่อเนื่อง t=0,1..25s → event ที่ 0, 10, 20
  - `belowTarget after 10s`: target {min:4,max:5}, zone 2 ต่อเนื่อง → event ครั้งแรกที่ 10s ครั้งเดียว จนกว่าจะกลับเข้าเป้าแล้วต่ำลงอีกครั้ง
  - `null targetZone` → มีแค่การเตือน zone 5
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** เขียนโค้ด
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: alert planning and target monitor`

---

### Task 8: `hr-source.js` — BLE + Demo

**Files:** Create `hr-trainer/js/hr-source.js`; Test `hr-trainer/test/hr-source.test.js`

**Interfaces:**
- Consumes: `parseHeartRate`, `isValidBpm` (Task 2)
- Produces:
  - `nextBackoff(attempt: number) -> number` (ms ตาม Global Constraints; attempt เริ่มที่ 0)
  - `class BleHeartRateSource extends EventTarget`
    - `async connect()` (เปิดตัวเลือกอุปกรณ์), `async reconnectKnown() -> boolean` (ใช้ `navigator.bluetooth.getDevices()` ถ้ามี), `disconnect()`
  - `class DemoSource extends EventTarget`: `connect()`, `disconnect()` สร้าง bpm แบบ sine 90–175 คาบ 60s พร้อม noise ±3 ทุก 1000ms
  - Events: `'hr'` detail `{bpm, rr, t}` (ส่งเฉพาะ bpm ที่ valid), `'status'` detail `{state:'connected'|'reconnecting'|'disconnected'}`
  - `isBluetoothSupported() -> boolean`

- [ ] **Step 1:** test `nextBackoff`: 0→1000, 1→2000, 3→8000, 4→10000, 9→10000
- [ ] **Step 2:** `npm test` → FAIL
- [ ] **Step 3:** เขียนโค้ด
  - เมื่อ `gattserverdisconnected` ให้ส่ง status `reconnecting` แล้วลองต่อใหม่ด้วย backoff จนกว่า `disconnect()` จะถูกเรียก
  - ระหว่างนั้นถ้าลองไม่สำเร็จ **3 ครั้งติดกัน** ให้ส่ง `disconnected` หนึ่งครั้ง แต่ยังลองต่อไปเรื่อยๆ
- [ ] **Step 4:** `npm test` → PASS
- [ ] **Step 5:** Commit `feat: BLE and demo heart rate sources`

---

### Task 9: `storage.js` (IndexedDB)

**Files:** Create `hr-trainer/js/storage.js`

**Interfaces — Produces** (ทุกฟังก์ชันเป็น async):
- `getSettings() -> Settings` (merge กับ `DEFAULT_SETTINGS`), `saveSettings(s)`
- `listWorkouts() -> Workout[]` (เรียงตาม `updatedAt` ใหม่สุดก่อน), `getWorkout(id)`, `saveWorkout(w)`, `deleteWorkout(id)`
- `listSessions() -> SessionMeta[]` (ไม่มี samples; เรียงตาม `startedAt` ใหม่สุดก่อน), `getSession(id)`, `saveSession(s)`, `deleteSession(id)`
- `getCheckpoint() -> Session|null`, `saveCheckpoint(s)`, `clearCheckpoint()`
- `ensureSeedWorkouts()` ถ้ายังไม่มี workout เลย ให้สร้างจาก 3 template

- [ ] **Step 1:** เขียนโค้ดโดยห่อ `indexedDB.open('hr-trainer', 1)` และสร้าง store ใน `onupgradeneeded` (keyPath `id`; store `settings`/`checkpoint` ใช้ key คงที่ `'singleton'`)
- [ ] **Step 2:** ตรวจด้วยมือหลัง Task 10: เปิด DevTools → Application → IndexedDB แล้วเห็น 4 stores และ workout 3 ตัว
- [ ] **Step 3:** Commit `feat: IndexedDB storage`

---

### Task 10: App shell, routing, PWA

**Files:** Create `hr-trainer/index.html`, `hr-trainer/styles.css`, `hr-trainer/js/app.js`, `hr-trainer/manifest.json`, `hr-trainer/sw.js`, `hr-trainer/icons/icon-192.png`, `hr-trainer/icons/icon-512.png`

**Interfaces:**
- Consumes: ทุกโมดูลก่อนหน้า
- Produces:
  - Hash routes: `#/workout/:workoutId?`, `#/workouts`, `#/builder/:id`, `#/summary/:sessionId`, `#/history`, `#/settings`
  - แต่ละหน้าจอ export `mount(rootEl, ctx) -> unmount()`
  - `ctx = { storage, settings, source, navigate(hash), reloadSettings() }`
  - `source` เป็น BLE หรือ Demo ตามตัวเลือก

- [ ] **Step 1:** `index.html` มี `<main id="app">`, แถบนำทางล่าง (ฝึก / โปรแกรม / ประวัติ / ตั้งค่า) และ `<script type="module" src="js/app.js">`
- [ ] **Step 2:** `app.js` โหลด settings, เรียก `ensureSeedWorkouts()`, mount route และถ้า `getCheckpoint()` มีค่า ให้แสดง dialog "กู้คืน / ทิ้ง"
  - กู้คืน: ใช้ `SessionRecorder.fromCheckpoint` แล้ว `finish` และบันทึก จากนั้นไปหน้าสรุป
  - ทิ้ง: `clearCheckpoint()`
- [ ] **Step 3:** `manifest.json`: `display:'standalone'`, `orientation:'any'`, `theme_color:'#212121'`, `start_url:'./'`
- [ ] **Step 4:** `sw.js` ทำ cache-first สำหรับไฟล์ทั้งหมดในแอป (มีรายการไฟล์และ cache version `'v1'`)
- [ ] **Step 5:** ตรวจ: `npm run serve` แล้วเปิด `http://localhost:8080/hr-trainer/` บน Chrome PC
  - nav ทุกหน้าเปลี่ยนได้ และ Lighthouse ขึ้น "Installable"
  - ถ้าไม่รองรับ Web Bluetooth ต้องเห็นข้อความแนะนำ และยังกดใช้โหมด Demo ได้
- [ ] **Step 6:** Commit `feat: app shell and PWA`

---

### Task 11: หน้าจอฝึก (รวม compact layout, mute, wake lock)

**Files:** Create `hr-trainer/js/ui/workout-screen.js`; Modify `hr-trainer/styles.css`

**Interfaces — Consumes:** `ZoneDetector`, `zoneFor`, `hrMaxFor`, `pctOfMax`, `ZONE_COLORS`, `flattenWorkout`, `WorkoutTimer`, `alertPlan`, `TargetMonitor`, `AlertPlayer`, `SessionRecorder`, `storage.*`, `ctx.source`

- [ ] **Step 1:** ส่วนบนของหน้า
  - ตัวเลือก workout และปุ่ม "เชื่อมต่อนาฬิกา" / "Demo"
  - จุดสถานะการเชื่อมต่อ 🟢🟡🔴
- [ ] **Step 2:** แสดงผลหลัก
  - bpm ตัวใหญ่ (`font-size: min(40vw, 40vh)`) และพื้นหลังเป็น `ZONE_COLORS[zone]`
  - ชื่อ Zone + `%HRmax`
  - เวลารวม (`mm:ss`), step ปัจจุบัน (`ทำงาน 3/8`) + นับถอยหลัง และ step ถัดไป
- [ ] **Step 3:** ปุ่มควบคุม
  - เริ่ม / พัก-ต่อ / ข้าม / จบ
  - 🔊/🔇: สลับ `settings.muted` และบันทึกทันที
  - PiP: ซ่อนไว้จนกว่าจะทำ Task 15
- [ ] **Step 4:** loop ทุก 250ms เรียก `timer.tick`
  - events → `alertPlan` → `AlertPlayer.play`
  - `stepStart` → `recorder.markStep` และ `targetMonitor.reset()`
  - การแปลง event ก่อนเรียก `alertPlan`: timer `{type:'stepStart', step}` → `{type:'stepStart', kind: step.kind}`; ZoneDetector `{from,to}` → `{type: to > from ? 'zoneUp' : 'zoneDown'}`; status `disconnected` → `{type:'disconnect'}`
- [ ] **Step 5:** loop ทุก 1000ms
  - เรียก `recorder.addSample` (bpm เป็น null ถ้า hr ล่าสุดเก่ากว่า 3s)
  - `ZoneDetector.update` → zoneUp/zoneDown
  - `TargetMonitor.update`
- [ ] **Step 6:** เมื่อกดเริ่ม
  - `AlertPlayer.unlock()` และ `navigator.wakeLock.request('screen')`
  - ขอ wake lock ใหม่ใน `visibilitychange`
  - บันทึก checkpoint ผ่าน `onCheckpoint → storage.saveCheckpoint`
- [ ] **Step 7:** เมื่อจบ
  - `recorder.finish` → `saveSession` → `clearCheckpoint` → `navigate('#/summary/'+id)`
- [ ] **Step 8:** CSS `@media (max-height: 399px)` ซ่อนทุกอย่างยกเว้น bpm, เวลา step และปุ่ม เริ่ม/พัก/ข้าม
- [ ] **Step 9:** ตรวจด้วย Demo บน Chrome PC
  - รัน Tabata ครบ: ได้ยิน countdown, เสียงเริ่มทำงาน/พัก และเห็นแฟลช
  - ลองปุ่ม mute
  - ย่อหน้าต่างให้สูง < 400px แล้วได้ layout compact
- [ ] **Step 10:** Commit `feat: workout screen`

---

### Task 12: ตัวสร้าง Workout + รายการโปรแกรม

**Files:** Create `hr-trainer/js/ui/workouts-screen.js`, `hr-trainer/js/ui/builder-screen.js`

**Interfaces — Consumes:** `createFromTemplate`, `validateWorkout`, `totalDurationSec`, `KIND_COLORS`, `storage.*Workout*`

- [ ] **Step 1:** หน้ารายการ
  - แต่ละการ์ดแสดงชื่อ, เวลารวม (`+ เปิด` ถ้ามี step แบบ open) และปุ่ม เริ่ม / แก้ / ทำสำเนา / ลบ (ต้องยืนยันก่อนลบ)
  - ปุ่ม "+ ใหม่" ให้เลือก ว่าง / Interval / Tabata
- [ ] **Step 2:** หน้าตัวสร้าง
  - ฟิลด์ชื่อ และรายการ item
  - Step: ชื่อ, kind (select), ระยะเวลา (นาที+วินาที หรือ checkbox "จนกว่าจะกดถัดไป"), Zone เป้าหมาย min/max (select ว่าง/1–5), สี
  - Repeat: จำนวนรอบ และรายการ step ข้างใน
  - ปุ่ม ↑↓ ใช้เรียงลำดับ; "เพิ่ม step" / "เพิ่มบล็อกทำซ้ำ" / ลบ
- [ ] **Step 3:** ปุ่มบันทึก
  - เรียก `validateWorkout` ถ้ามี error ให้แสดงรายการและไม่บันทึก
  - ถ้าผ่าน ให้ `saveWorkout` (อัปเดต `updatedAt`) แล้วกลับไปหน้ารายการ
- [ ] **Step 4:** ตรวจ
  - สร้าง `[วิ่ง 60s Z4–5, เดิน 120s Z2] × 3` บันทึกแล้วรันด้วย Demo ได้ลำดับถูก
  - ทดสอบว่า step แบบ open รอจนกด "ข้าม"
- [ ] **Step 5:** Commit `feat: workout builder`

---

### Task 13: หน้าสรุป + ประวัติ

**Files:** Create `hr-trainer/js/ui/summary-screen.js`, `hr-trainer/js/ui/history-screen.js`, `hr-trainer/js/ui/charts.js`

**Interfaces:**
- Consumes: `storage.getSession/listSessions/deleteSession`, `toCsv`, `ZONE_COLORS`
- Produces:
  - `drawHrChart(canvas, session, settings)`: เส้น HR, เว้นช่องที่เป็น null และมีแถบสีของแต่ละ step ด้านล่าง
  - `drawZoneBars(canvas, zoneSec)`

- [ ] **Step 1:** หน้าสรุป
  - แสดงชื่อ workout, วันที่, เวลารวม, HR เฉลี่ย/สูงสุด/ต่ำสุด (ถ้าเป็น null แสดง `—`)
  - กราฟแท่ง Zone (แสดงเป็นนาที:วินาที) และกราฟ HR
- [ ] **Step 2:** หน้าประวัติ
  - รายการเรียงใหม่สุดก่อน แต่ละรายการแสดงวันที่ / ชื่อ / เวลา / HR เฉลี่ย กดแล้วไปหน้าสรุป
  - ลบได้ (ต้องยืนยันก่อน)
  - Export: ดาวน์โหลด `.json` (session เต็ม) และ `.csv` (`toCsv`) ผ่าน `Blob` + `<a download>`
- [ ] **Step 3:** ตรวจ
  - session ที่ได้จาก Demo แสดงผลครบ
  - session ที่กด "เชื่อมต่อ" แต่ไม่มีนาฬิกาเลย ต้องแสดง `—` และไม่มี NaN
- [ ] **Step 4:** Commit `feat: summary and history`

---

### Task 14: หน้าตั้งค่า

**Files:** Create `hr-trainer/js/ui/settings-screen.js`

**Interfaces — Consumes:** `storage.getSettings/saveSettings`, `hrMaxFor`, `alertPlan`, `AlertPlayer`

- [ ] **Step 1:** ฟิลด์
  - อายุ, checkbox "กำหนด HRmax เอง" + HRmax
  - ขอบ Zone 6 ค่า: ต้องเรียงจากน้อยไปมาก ถ้าไม่ถูกต้องจะไม่ให้บันทึก
  - `zoneHighRepeatSec`
- [ ] **Step 2:** ตารางการแจ้งเตือน
  - 6 เหตุการณ์ × 3 ช่องทาง (checkbox) และปุ่ม "ทดสอบ" ต่อแถว ที่เล่น `alertPlan` ของเหตุการณ์นั้น
  - checkbox mute รวม
- [ ] **Step 3:** ปุ่ม "ลืมนาฬิกาที่เคยเชื่อมต่อ" (`device.forget()` ถ้ามี)
- [ ] **Step 4:** การ์ดวิธีเปิด Heart Rate Broadcast บน T-Rex Pro (เนื้อหาตามผล spike ใน `spike/RESULT.md`)
- [ ] **Step 5:** ตรวจว่าเปลี่ยนอายุแล้ว Zone ในหน้าฝึกเปลี่ยนตาม และการปิดเสียง zoneChange มีผลจริง
- [ ] **Step 6:** Commit `feat: settings screen`

---

### Task 15: Picture-in-Picture (ข้ามถ้า S3 ใน spike ไม่ผ่าน)

**Files:** Create `hr-trainer/js/pip.js`; Modify `hr-trainer/js/ui/workout-screen.js`

**Interfaces — Produces:**
- `class PipView`
  - `static isSupported() -> boolean` (`document.pictureInPictureEnabled` และมี `HTMLCanvasElement.prototype.captureStream`)
  - `async open()`, `async close()`, `render(view)` (เก็บ view ล่าสุดไว้ และวาด 4 fps เฉพาะตอนเปิดอยู่)
  - `view = { bpm|null, zone, stepName, stepRemainingSec|null, totalElapsedSec, connection }`

- [ ] **Step 1:** วาด canvas 320×180
  - พื้นหลังสี Zone, bpm ด้านซ้ายขนาด 96px
  - ด้านขวาแสดงชื่อ step, นับถอยหลัง และเวลารวม; จุดสถานะมุมบนขวา
- [ ] **Step 2:** แสดงปุ่ม PiP ในหน้าฝึกเมื่อ `isSupported()`
  - หน้าฝึกเรียก `pip.render` ทุก 250ms
  - ปิด PiP เมื่อจบการฝึก
- [ ] **Step 3:** ตรวจบน Android จริง: เปิด PiP แล้วเปิด YouTube; ค่าอัปเดตและเสียงเตือนยังทำงาน
- [ ] **Step 4:** Commit `feat: picture-in-picture mini view`

---

### Task 16: Deploy และทดสอบรับมอบบนเครื่องจริง

**Files:** Create `README.md` (วิธีรัน, วิธีติดตั้งบนมือถือ, วิธีเปิด HR Broadcast)

- [ ] **Step 1:** `npm test` → ทุก test ผ่าน
- [ ] **Step 2 (ต้องถามผู้ใช้ก่อน):** สร้าง GitHub repo และเปิด GitHub Pages จาก `main` ถ้าผู้ใช้ไม่ต้องการเผยแพร่ ให้ใช้ `adb reverse` ตาม Task 1 แทน
- [ ] **Step 3 (ผู้ใช้):** ติดตั้ง PWA บนหน้าจอหลักของ Android แล้วตรวจเกณฑ์สำเร็จ 4 ข้อของ spec และทดสอบแบ่งจอกับ YouTube
- [ ] **Step 4:** Commit `docs: readme and deploy notes`
