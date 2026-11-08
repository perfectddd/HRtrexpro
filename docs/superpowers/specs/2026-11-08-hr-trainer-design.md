# HR Trainer — Design Spec

วันที่: 2026-11-08
สถานะ: รอผู้ใช้ตรวจ

## 1. เป้าหมาย

PWA บนมือถือ/แท็บเล็ต Android ที่เชื่อมต่อนาฬิกา **Amazfit T-Rex Pro** โดยตรงผ่าน Bluetooth
(ไม่ต้องเปิด Zepp หรือ Notify ระหว่างใช้งาน) เพื่อ:

- แสดงชีพจรปัจจุบันแบบ realtime
- แจ้งเตือนเมื่อเปลี่ยน Zone หัวใจ
- แสดงระยะเวลาการฝึก
- รันโปรแกรมฝึกที่สร้างเองได้ (รวม template Interval / Tabata)
- ลอยทับแอปอื่น (เช่น YouTube) ผ่าน Picture-in-Picture และใช้งานในโหมดแบ่งจอได้
- สรุปผลหลังจบและเก็บประวัติไว้ในเครื่อง

### เกณฑ์สำเร็จ
1. กด "เชื่อมต่อ" แล้วเห็น bpm จาก T-Rex Pro อัปเดตทุก ~1 วินาที
2. รันโปรแกรม Tabata 20/10 × 8 ได้ครบ พร้อมเสียง/สั่น/แฟลชตอนเปลี่ยนช่วง
3. เปิด YouTube แล้ว หน้าต่าง PiP ยังแสดง bpm, Zone และเวลาที่อัปเดตอยู่
4. จบการฝึกแล้วเห็นหน้าสรุป และเปิดดูย้อนหลังได้จากหน้าประวัติ

### ข้อมูลจากผู้ใช้ vs. สมมติฐาน
- **ผู้ใช้กำหนด:** แจ้งเตือนบนจอ (เสียง + สี) ไม่ใช่บนนาฬิกา / Android standalone /
  เก็บสรุป + ประวัติในเครื่อง / ใช้ PWA / เปิด-ปิดเสียงได้ / สร้าง workout เองได้ /
  หน้าต่างย่อด้วย PiP + แบ่งจอ
- **สมมติฐาน:** ใช้ฝึกคนเดียว / Zone คำนวณจาก %HRmax 5 Zone /
  T-Rex Pro รองรับ Heart Rate Broadcast (ต้องพิสูจน์ใน Spike — หัวข้อ 2)

### นอกขอบเขต
สั่นหรือแจ้งเตือนบนนาฬิกา, ก้าวเดิน/แบตเตอรี่, การทำงานเมื่อปิดจอ, sync ขึ้น cloud,
รองรับ iOS, ผู้ใช้หลายคน

## 2. Spike (ต้องผ่านก่อนเริ่มพัฒนา)

ทำหน้า `spike/index.html` หน้าเดียว แล้ว deploy ขึ้น HTTPS (GitHub Pages)
เพื่อทดสอบบน Android จริงกับ T-Rex Pro:

| # | สิ่งที่ทดสอบ | ผ่านเมื่อ |
|---|---|---|
| S1 | Web Bluetooth เห็นและต่อนาฬิกาผ่าน Heart Rate Service `0x180D` | bpm แสดงและอัปเดตต่อเนื่อง |
| S2 | PiP จาก canvas → `captureStream()` → `<video>` → `requestPictureInPicture()` | หน้าต่าง PiP ลอยทับหน้า Home ได้ ย่อ/ขยายได้ |
| S3 | เปิด YouTube ระหว่างอยู่ใน PiP | bpm และตัวนับเวลาใน PiP ยังอัปเดต, BLE ไม่หลุด, เสียง beep ยังดัง |

ผลลัพธ์ที่เป็นไปได้:
- **S1 ไม่ผ่าน** → หยุดและกลับมาออกแบบใหม่ (ทางเลือกคือโปรโตคอล Huami + auth key)
- **S1 ผ่าน แต่ S3 ไม่ผ่าน** → ทำ PWA ต่อ แต่ใช้แบ่งจอแทน PiP และบันทึกไว้ว่าต้องย้ายไป
  Capacitor + native overlay ในเฟสถัดไป
- **ผ่านทั้งหมด** → พัฒนาตาม spec นี้

โค้ด spike เป็นของทิ้ง ไม่นำไปใช้ต่อโดยตรง

### ผล Spike (อัปเดต 2026-11-08)
- **S1:** T-Rex Pro ไม่มีโหมด broadcast (ประกาศแค่ `fee0`) และตัดการเชื่อมต่อที่ไม่ยืนยันตัวภายใน ~20 วินาที
- **การแก้:** `hr-source` ยืนยันตัวแบบ Huami ด้วย auth key เดิม (crypt flag 0x80)
  แล้วสั่ง `2a39` วัดต่อเนื่อง และส่ง ping `16` ทุก 12 วินาที (โมดูล `huami-auth.js`)
- **ผลกระทบ:**
  - เพิ่มช่อง auth key ในหน้าตั้งค่า
  - ผู้ใช้ต้องปิด Bluetooth มือถือ (ให้ Zepp หลุด) ระหว่างฝึก
- รายละเอียดอยู่ใน `spike/RESULT.md`

## 3. สถาปัตยกรรม

- เป็น static PWA: HTML + CSS + vanilla JS (ES modules) ไม่มีขั้นตอน build และไม่มี backend
- โฟลเดอร์: `hr-trainer/` ในโปรเจกต์นี้
- รันเฉพาะบน Chrome Android (บน Chrome PC ใช้ทดสอบด้วยโหมด Demo)

```
hr-trainer/
  index.html, manifest.json, sw.js, styles.css
  js/
    hr-source.js        BLE + Demo source
    hr-parse.js         parse 0x2A37
    zones.js            คำนวณ Zone + ตรวจจับการเปลี่ยน Zone
    workout-model.js    โครงสร้าง workout + ขยาย repeat เป็นลำดับ step
    workout-timer.js    state machine ระหว่างฝึก
    alerts.js           เสียง / สั่น / แฟลช + mute
    pip.js              วาด mini view ลง canvas → video → PiP
    session-recorder.js บันทึกตัวอย่างทุกวินาที + checkpoint
    storage.js          IndexedDB
    app.js              ผูก event ทุกตัวเข้าด้วยกัน + routing
    ui/ workout-screen.js, builder-screen.js, summary-screen.js,
        history-screen.js, settings-screen.js
  test/  *.test.js      (node --test)
```

### ขอบเขตของแต่ละโมดูล

| โมดูล | Input → Output | หมายเหตุ |
|---|---|---|
| `hr-parse` | `DataView` → `{bpm, rr[]}` | รองรับ flag bpm แบบ uint8/uint16 |
| `hr-source` | — → events `hr {bpm, t}`, `status {connected\|reconnecting\|disconnected}` | ต่อใหม่ด้วย backoff 1→2→4→8→10 วินาที, จำอุปกรณ์ที่เคยต่อไว้ด้วย `getDevices()` ถ้ามี; `DemoSource` ใช้ interface เดียวกัน |
| `zones` | `(bpm, settings)` → `zone 1..5 \| 0` ; detector → event `zoneChange {from,to}` | การเปลี่ยน Zone ต้องคงอยู่ ≥ 3 วินาทีจึงจะส่ง event |
| `workout-model` | Workout → ลำดับ step แบบแบน | validate: ระยะเวลา > 0 หรือ `open`, repeat ≥ 1 |
| `workout-timer` | `(steps, now)` → state + events `stepStart`, `countdown(n)`, `finished` | เป็นฟังก์ชันล้วน รับค่า `now` จากภายนอก (ทดสอบได้); รองรับ pause/resume/skip/stop |
| `alerts` | events → เสียง/สั่น/แฟลช | เคารพค่า mute และค่าเปิด-ปิดแยกแต่ละเหตุการณ์; ปลดล็อก AudioContext ตอนกดเริ่ม |
| `pip` | state ปัจจุบัน → canvas 4 fps → PiP | ใช้ได้เฉพาะเมื่อ browser รองรับ `requestPictureInPicture` |
| `session-recorder` | hr + timer state → `samples[]` 1 Hz | checkpoint ลง IndexedDB ทุก 30 วินาที |
| `storage` | CRUD: `settings`, `workouts`, `sessions`, `checkpoint` | IndexedDB ชื่อ `hr-trainer` v1 |

### การไหลของข้อมูล
`hr-source` → `zones` → (`alerts`, UI, `pip`, `session-recorder`)
`workout-timer` (tick 250ms) → (`alerts`, UI, `pip`, `session-recorder`)
Wake Lock จะเปิดไว้ตลอดตั้งแต่เริ่มจนจบการฝึก

## 4. Data model

```js
Settings { age, hrMax, hrMaxManual: bool, zoneBounds: [50,60,70,80,90,100] /* %HRmax */,
           muted: bool,
           alerts: { countdown, stepChange, zoneChange, zoneHigh, belowTarget, disconnect }
                    // แต่ละตัว: { sound, vibrate, flash }
           zoneHighRepeatSec: 10 }

Workout { id, name, createdAt, updatedAt, items: Item[] }
Item  = Step | Repeat
Step  { type:'step', name, kind:'warmup'|'work'|'rest'|'cooldown'|'other',
        durationSec | null /* null = open, รอกด "ถัดไป" */,
        targetZone: {min,max} | null, color }
Repeat{ type:'repeat', times, items: Step[] }   // ซ้อนได้ 1 ชั้น

Session { id, workoutId|null, workoutName, startedAt, endedAt,
          samples: [{t, bpm|null, zone, stepIndex}],
          steps: [{name, kind, startT, endT}],
          summary: { durationSec, avg, max, min, zoneSec:[z1..z5] } }
```

Template ในตัวแอป (สร้างเป็น Workout ที่แก้ต่อได้):
- **Free:** step เดียวแบบ `open`
- **Interval:** วอร์มอัพ 5 นาที, [ทำงาน 60 วินาที, พัก 60 วินาที] × 8, คูลดาวน์ 5 นาที
- **Tabata:** วอร์มอัพ 5 นาที, [ทำงาน 20 วินาที, พัก 10 วินาที] × 8, คูลดาวน์ 5 นาที

## 5. หน้าจอ

1. **ฝึก**
   - bpm ตัวใหญ่, พื้นหลังสีตาม Zone (Z1 เทา, Z2 ฟ้า, Z3 เขียว, Z4 ส้ม, Z5 แดง)
   - ชื่อ Zone + %HRmax, จุดสถานะการเชื่อมต่อ
   - เวลารวม, step ปัจจุบัน (เช่น "ทำงาน 3/8") + นับถอยหลัง, step ถัดไป
   - ปุ่ม: เริ่ม / พัก / ข้าม / จบ / 🔊🔇 / PiP
   - layout ยืดหยุ่นตามขนาดหน้าต่าง: ถ้าหน้าต่างสูงน้อยกว่า 400px (เช่นตอนแบ่งจอ)
     จะเหลือแค่ bpm + เวลา + ปุ่มหลัก
2. **รายการ Workout / ตัวสร้าง**
   - แสดงรายการ, สร้างจาก template หรือเริ่มจากว่าง
   - เพิ่ม/แก้/ลบ/เรียงลำดับ step, ห่อหลาย step เป็นบล็อก Repeat
   - ทำสำเนา, ลบ, แสดงเวลารวมของโปรแกรม
3. **สรุป**
   - เวลา, HR เฉลี่ย/สูงสุด/ต่ำสุด, กราฟแท่งเวลาในแต่ละ Zone
   - กราฟเส้น HR ตามเวลา พร้อมแถบสีของแต่ละ step (วาดด้วย canvas ไม่ใช้ไลบรารี)
4. **ประวัติ**
   - รายการ session, เปิดดูสรุป, ลบ, export JSON/CSV
5. **ตั้งค่า**
   - อายุ/HRmax, ขอบเขต Zone, เปิด-ปิดการแจ้งเตือนแยกเหตุการณ์และแยกช่องทาง
   - ทดสอบเสียง, ลืมอุปกรณ์ที่เคยต่อ
   - คำแนะนำวิธีเปิด HR Broadcast

**มุมมอง PiP:** canvas 320×180 แสดง bpm + สี Zone, step ปัจจุบัน + นับถอยหลัง และเวลารวม

## 6. การแจ้งเตือน

| เหตุการณ์ | เสียง | สั่น | ภาพ |
|---|---|---|---|
| 3-2-1 ก่อนจบ step ที่มีเวลากำหนด | ติ๊ก 3 ครั้ง | – | – |
| เริ่ม step ทำงาน | เสียงสูงยาว | 400ms | แฟลชสีส้ม |
| เริ่ม step พัก | เสียงต่ำ 2 ครั้ง | 150×2 | แฟลชสีฟ้า |
| ขึ้น Zone | เสียงไล่ขึ้น | – | ชื่อ Zone เด้งขึ้น |
| ลง Zone | เสียงไล่ลง | – | ชื่อ Zone เด้งขึ้น |
| อยู่ Z5 หรือเกินเป้าหมายของ step | เตือนซ้ำทุก N วินาที | 200ms | ขอบจอกะพริบแดง |
| ต่ำกว่าเป้าหมายของ step (≥10 วินาที) | เสียงเบา 1 ครั้ง | – | ลูกศร ↑ |
| BLE หลุด | เสียงเตือน | 500ms | แบนเนอร์ |

ปุ่ม Mute ปิดเฉพาะเสียง ส่วนการสั่นและภาพยังทำงานตามที่ตั้งค่าไว้

## 7. การจัดการข้อผิดพลาด

- **ไม่มี `navigator.bluetooth`:** แสดงหน้าคำแนะนำให้เปิดด้วย Chrome บน Android ผ่าน HTTPS
  และยังใช้โหมด Demo ได้
- **ผู้ใช้กดยกเลิกตอนเลือกอุปกรณ์ / ไม่พบนาฬิกา:** แสดงขั้นตอนเปิด HR Broadcast
- **BLE หลุดระหว่างฝึก:**
  - ตัวจับเวลายังเดินต่อ
  - บันทึก sample เป็น `bpm: null` ซึ่งกราฟจะเว้นช่องว่างไว้และไม่นำไปคิดค่าเฉลี่ย
  - ต่อใหม่ด้วย backoff
- **ค่า bpm ผิดปกติ (0 หรือ >230):** ทิ้งค่า
- **Wake Lock ถูกปล่อย (สลับแอป):** ขอใหม่ใน `visibilitychange`
- **แอปปิดกลางคัน:** เปิดใหม่แล้วถ้ามี checkpoint จะถามว่า "กู้คืน / ทิ้ง"
- **ไม่รองรับ PiP:** ซ่อนปุ่ม PiP

## 8. การทดสอบ

- **Unit (`node --test`):** `hr-parse`, `zones` (รวม hysteresis), `workout-model`
  (การขยาย repeat และ validate), `workout-timer` (ทุก transition, pause/skip, step แบบ open),
  การคำนวณ summary
- **Manual บน Chrome PC:** ใช้โหมด Demo ไล่ทุกหน้าจอ, การแจ้งเตือน, mute, PiP และ layout หน้าต่างเล็ก
- **บนเครื่องจริง (ผู้ใช้):**
  - Android + T-Rex Pro ตามเกณฑ์สำเร็จ 4 ข้อ
  - ทดสอบแบ่งจอกับ YouTube
- **Deploy:** GitHub Pages (ต้องเป็น HTTPS)
