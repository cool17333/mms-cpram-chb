# PLAN — PM Replacement v2: ตารางเครื่องจักร + popup ตั้งค่าหลายรายการ + edit log (+ rename PM Inspection)

**เป้าหมาย:**
1. เปลี่ยนชื่อ tab `🔧 แผน PM` → `🔧 PM Inspection`
2. Tab `🔩 PM Replacement` เปลี่ยนจาก dropdown+card list → **ตารางเครื่องจักรเหมือน PM Inspection** (ปุ่ม ✏️แก้ไข + 📋คัดลอก ต่อแถว) → กดแก้ไขเปิด **popup รายการอะไหล่หลายแถว** (เพิ่ม/ลบ เหมือน Why-Why ชั้นเดียว 1,2,3,4) → บันทึกทีเดียว + **เก็บ log รายละเอียดที่แก้**

**ขอบเขต:** `gas_code.gs` (⚠️ **ต้อง redeploy**) + `index.html` + `js/pm-replacement.js` (rewrite ส่วนใหญ่) + `js/checklist-status.js` + `js/core.js` (MODAL_KEYS)
**Executor:** สลับเป็น **Sonnet** (Fable/Opus = plan only)

---

## Decisions ที่ confirm แล้ว (จาก user 2026-07-02)
| # | หัวข้อ | สรุป |
|---|--------|------|
| D1 | ชื่อ/รหัสอะไหล่ | **บังคับเลือกจากทะเบียนอะไหล่ (②) เท่านั้น** — picker (datalist) เลือกแล้ว autofill ชื่อ+รหัส แสดง 2 ช่องแยก (readonly); ทะเบียนการันตี partNo มีเสมอ (Store บังคับกรอก / Supplier รัน SUP-xxxx) |
| D2 | ปุ่ม ✅เปลี่ยนแล้ว + 📜ประวัติ | **อยู่ใน popup แก้ไข ต่อท้ายแต่ละแถว** (เฉพาะแถวที่มี planId แล้ว) — popup เดียวจบ |
| D3 | คัดลอก | **ทับทั้งหมด** ของเครื่องปลายทาง (deactivate ของเดิม + clone จากต้นทาง, reset lastDone, นับ nextDue ใหม่จากเดือนเริ่ม) — คอนเซ็ปเดียวกับ copy Daily/PM |
| D4 | ความถี่ | **บังคับหน่วยเดือนอย่างเดียว** (เหมือน PM Inspection) — ตัด select เดือน/วัน/ปี ออกจาก UI; แถว legacy ที่หน่วย day/year โหลดขึ้นมาช่องความถี่ว่าง + placeholder "เดิม: X วัน" ให้กรอกใหม่เป็นเดือน |
| — | ฟิลด์บังคับ/แถว | อะไหล่จากทะเบียน (ชื่อ+รหัส) · ความถี่(เดือน ≥1) · เดือนที่เริ่ม (YYYY-MM) · รูปบริเวณที่เปลี่ยน — **บังคับหมด ยกเว้น หมายเหตุ** |

---

## สภาพปัจจุบัน (สำรวจแล้ว 2026-07-02)
- Tab buttons: [index.html:1604-1605](../../index.html) — `clsc-tab-pm` "🔧 แผน PM", `clsc-tab-pmrep` (data-perm="cl.pm")
- PM Inspection table pattern: `renderClScPm()` [checklist-status.js:178-214] — ตาราง + ปุ่มแก้ไข/คัดลอก + pagination ผ่าน `clScRenderPagBar(tab,...)` (สร้าง id `clsc-${tab}-*`)
- pmrep view เดิม [index.html:1712-1730]: dropdown `pmr-machine-select` + `pmr-list-wrap` card list — **จะถูกแทนทั้งก้อน**
- `js/pm-replacement.js` (267 บรรทัด): เพิ่ม/แก้ทีละรายการผ่าน `pmr-edit-modal`, done ผ่าน `pmr-done-modal`, ประวัติ `pmr-history-modal`
- GAS: `_PmReplacePlan` cols A-M = planId, machineId, partId, partLabel, cycleValue, cycleUnit, startDate, lastDone, nextDue, locationImageId, note, active, updatedAt · `_PmReplaceLog` = log "เปลี่ยนแล้ว" เท่านั้น (**ยังไม่มี log การแก้แผน**) · `pmReplaceList_(machineId ว่าง = คืนทุกแผน` ✓ ใช้ทำตารางได้) · ไม่มี batch/copy
- copy modal เดิม: `openClCopyModal(type, sourceId)` + `saveClCopy()` [checklist-status.js:435-499] POST `copyMachineItems` — **reuse modal ได้ แต่ pmrep ต้อง POST action ใหม่**
- `clScTab('pmrep')` [checklist-core.js:1290] early-return ไป `initPmReplace()` · `renderClSchedule`/`clScSetPageSize`/`clScGoPage` [checklist-status.js:96-122] เป็น if/else 2 ทาง daily/pm — **ต้องขยายเป็น 3 ทาง**

---

## Phase A — GAS (⚠️ ทำก่อน + **redeploy** ก่อนทดสอบ frontend)

> guard สิทธิ์: **ลอก pattern เดียวกับ `pmReplaceUpsert` เดิม** (ดู gas_code.gs ~1105-1115 ว่าใช้ guard อะไร แล้วใช้แบบเดียวกันทุก action ใหม่)

### A1 — `_PmReplacePlan` เพิ่มคอลัมน์ N `partNo`
- ใน `pmReplacePlanSheet_()`: หลังได้ sheet เช็ค header N — ถ้ายังไม่มีให้ `sh.getRange(1,14).setValue('partNo')` (auto-migrate; แถวเก่าค่าว่าง)
- `pmReplaceList_` คืน `partNo: r[13] || ''` เพิ่ม (และคืน `note`, `startDate` เดิมครบอยู่แล้ว)
- fallback แสดงผล: แถว legacy partNo ว่าง + partLabel รูปแบบ "PN - ชื่อ" — client แสดง partLabel ตรงๆ ได้ ไม่ต้อง split

### A2 — sheet ใหม่ `_PmReplaceEditLog`
```
hdr: ['logId','machineId','planId','action','detail','by','at']
// action: create | update | delete | copy
// detail: ข้อความไทยอ่านได้ เช่น
//   create → "เพิ่ม: [PN123] ลูกปืน · ทุก 6 เดือน เริ่ม 2026-07"
//   update → "แก้ไข [PN123] ลูกปืน: ความถี่ 3→6 เดือน · เดือนเริ่ม 2026-01→2026-07 · เปลี่ยนรูป"
//   delete → "ลบ: [PN123] ลูกปืน"
//   copy   → "คัดลอกจาก MC-001 (3 รายการ) ทับของเดิม 2 รายการ"
```
- helper `pmReplaceEditLogSheet_()` สไตล์เดียวกับ `pmReplaceLogSheet_()`
- endpoint GET ใหม่: `pmReplaceEditLog` (`?machineId=`) คืน log ของเครื่อง เรียงล่าสุดก่อน (ลอก `pmReplaceLog_`)

### A3 — action ใหม่ `pmReplaceBatchSave` (POST)
```js
// payload: { action:'pmReplaceBatchSave', username, pin, machineId, byName,
//   items:[{ planId|null, partId, partName, partNo, cycleMonths, startDate(YYYY-MM),
//            note, locationImageId(base64|null), existingLocationImageId }],
//   removedPlanIds:[...] }
function pmReplaceBatchSave_(data) {
  // 1. โหลด rows เดิมของ machineId (active) ทำ map planId → row เดิม
  // 2. loop items:
  //    - รูปใหม่ → saveImgToDrive(...'PmReplace_Images'); ไม่มีรูปใหม่ → ใช้ existingLocationImageId
  //    - เขียน cycleUnit='month' เสมอ (D4), partLabel=partName, col N=partNo
  //    - planId เดิม → update แถว (preserve lastDone; base=lastDone||startDate → nextDue)
  //      + diff เทียบค่าเดิม (partId/ความถี่/เดือนเริ่ม/รูป/หมายเหตุ) → ถ้ามี diff append edit-log 'update'
  //    - planId null → append แถวใหม่ (PR-timestamp) + edit-log 'create'
  // 3. removedPlanIds → set active=false (col L) + edit-log 'delete'
  // 4. return { success:true, data: pmReplaceList_(machineId).data }  // คืน list สดให้ client
}
```
- ⚠️ diff ความถี่ต้องเทียบทั้ง value+unit (แถวเดิมอาจเป็น day/year — จะกลายเป็น month เสมอหลังบันทึก = นับเป็น diff)

### A4 — action ใหม่ `pmReplaceCopy` (POST)
```js
// payload: { action:'pmReplaceCopy', username, pin, sourceId, targetIds:[...], byName }
function pmReplaceCopy_(data) {
  // per target: นับ+deactivate แผน active เดิมทั้งหมดของ target (D3 ทับทั้งหมด)
  //   → clone แผน active ของ source: planId ใหม่, machineId=target,
  //     lastDone='', nextDue = pmNextDue_(startDate,...) นับใหม่จากเดือนเริ่ม,
  //     locationImageId อ้าง Drive file เดิมร่วมกัน (ไม่ copy ไฟล์)
  //   → edit-log 'copy' ต่อ target
  // return { success:true, count: targetIds.length }
}
```

### A5 — route GET/POST
- doGet: `pmReplaceEditLog` (ตาม A2)
- doPost: `pmReplaceBatchSave`, `pmReplaceCopy` (guard เดียวกับ upsert เดิม)
- **คง `pmReplaceUpsert`/`pmReplaceDone`/`pmReplaceLog` เดิมไว้** — done/history ยังใช้; upsert เดิมไม่มีใครเรียกแล้วแต่ไม่ลบ (กัน client เก่า cache)

---

## Phase B — index.html

### B1 — rename (โจทย์ข้อ 1)
- บรรทัด ~1604: `🔧 แผน PM` → `🔧 PM Inspection`
- บรรทัด ~1662: `แผน PM (Preventive Maintenance)` → `PM Inspection (Preventive Maintenance)`
- (คงไว้: submenu desc ~1295 "กำหนดแผน PM & รายการตรวจ", modal ~2573 "ตั้งค่าแผน PM" — ความหมายทั่วไป ไม่ใช่ชื่อ tab)

### B2 — แทน `clsc-pmrep-view` เดิมทั้งก้อน (dropdown+card ~1712-1730) ด้วยตารางแบบ PM Inspection
- โครงลอก `clsc-pm-view` [1659-1711] เปลี่ยน id เป็น `clsc-pmrep-*` ครบชุด (**สำคัญ**: `clsc-pmrep-count`, `clsc-pmrep-page-size` onchange `clScSetPageSize('pmrep',...)`, `clsc-pmrep-body`, `clsc-pmrep-pagination`, `clsc-pmrep-page-info`, `clsc-pmrep-pg-first/prev/nums/next/last` onclick `clScGoPage('pmrep',...)` — `clScRenderPagBar` สร้าง id จาก `clsc-${tab}-*`)
- คอลัมน์: รหัสเครื่องจักร | ชื่อเครื่องจักร | รายการอะไหล่ (จำนวน) | สถานะ (🔴X เกิน / 🟠Y ใกล้ / ✓) | (ปุ่ม)
- header การ์ด: "🔩 PM Replacement — เปลี่ยนอะไหล่ตามรอบ" + count + page-size select (ลอก pm)

### B3 — modal ใหม่ `pmr-batch-modal` (popup ตั้งค่าหลายรายการ)
```
┌─ 🔩 ตั้งค่าเปลี่ยนอะไหล่ — {ชื่อเครื่อง} ({id}) ──────────── [ประวัติการแก้ไข] ✕ ─┐
│ #1 ─────────────────────────────────────────────────────────────── 🗑️ │
│   เลือกอะไหล่ (datalist ทะเบียน②) → [ชื่ออะไหล่ ro] [รหัสอะไหล่ ro]      │
│   [ความถี่ (เดือน) number] [เดือนที่เริ่ม month] [📷 รูปบริเวณที่เปลี่ยน + thumb] │
│   [หมายเหตุ (ไม่บังคับ)]     (แถวมี planId: ✅ เปลี่ยนแล้ว · 📜 ประวัติ)      │
│ #2 ...                                                                  │
│ [➕ เพิ่มรายการ]                                                          │
│                                              [ยกเลิก] [💾 บันทึกทั้งหมด]    │
└──────────────────────────────────────────────────────────────────────────┘
```
- แถวเลขลำดับ 1,2,3,4 (Why-Why ชั้นเดียว) · ลบแถว = ถามยืนยัน (แถวมี planId → เข้า removedPlanIds)
- modal ย่อย "ประวัติการแก้ไข" (`pmr-editlog-modal`): list จาก `pmReplaceEditLog` — at · by · action badge · detail
- **ลบ markup `pmr-edit-modal` เดิม** (ถูกแทนด้วย batch modal) · **คง** `pmr-done-modal` + `pmr-history-modal`
- bump `?v=` : `pm-replacement.js`, `checklist-status.js`, `core.js` (ตามไฟล์ที่แก้จริง)

---

## Phase C — js/pm-replacement.js (rewrite ส่วน UI หลัก)

### C1 — data layer
```js
let _pmrAllPlans = [];        // ทุกแผน active ทุกเครื่อง (จาก pmReplaceList ไม่ส่ง machineId)
let _pmrByMachine = {};       // machineId → [plans]
async function pmrLoadAll() { ... fetch ?action=pmReplaceList → group → _pmrByMachine }
```
- `initPmReplace()`: โหลด machineMaster + SPARE_CACHE + `pmrLoadAll()` (ครั้งแรก/หลัง save/copy)

### C2 — ตาราง `pmrRenderTable(machines)`
- ลอกโครง `renderClScPm`: pagination vars ใหม่ `_clPmrepPage/_clPmrepPageSize/_clPmrepTotalPages` + `clScRenderPagBar('pmrep',...)`
- ต่อแถว: count = `_pmrByMachine[id]?.length||0`; สถานะนับจาก `p.status` (overdue/soon) ที่ GAS คืน
- ปุ่ม: `✏️ แก้ไข` → `pmrOpenBatch(id)` · `📋 คัดลอก` → `openClCopyModal('pmrep', id)` — ทั้งคู่ gate `can('cl.pm')` (ไม่ใช่ cl.edit)

### C3 — popup batch editor
```js
let _pmrBatchMachineId = '';
let _pmrBatchRows = [];   // [{ planId|null, partId, partName, partNo, cycleMonths,
                          //    startDate, note, existingLocationImageId, newImgDataUrl,
                          //    legacyCycleLabel }]   ← legacy day/year → cycleMonths=''
let _pmrRemovedIds = [];
```
- `pmrOpenBatch(machineId)`: map แผนเดิม → rows (partId หาย/ถูกลบจากทะเบียน → คงชื่อ/รหัสเดิมจาก partLabel/partNo แสดง แต่ไม่บังคับ re-pick ถ้าไม่แตะช่องอะไหล่); ไม่มีแผน → 1 แถวว่าง
- picker ต่อแถว: input+datalist จาก `SPARE_CACHE` (pattern `pmrFillPartHint`/`pmrPartPick` เดิม) — pick แล้ว fill ชื่อ+รหัส (readonly)
- รูปต่อแถว: `compressImage` (≤250KB เดิม) → thumb preview; แถวเดิมโชว์รูปเดิม (getImage lazy แบบ `pmr-thumb` เดิม)
- validate ก่อน save (ทุกแถว): มีอะไหล่ (partId เดิมหรือ pick ใหม่) · cycleMonths ≥1 (legacy ว่าง = ต้องกรอก) · startDate · มีรูป (เดิมหรือใหม่) — หมายเหตุข้าม; แถวไหนพลาด highlight แดง + toast บอกลำดับแถว
- `pmrSaveBatch()`: POST `pmReplaceBatchSave` → success: ปิด modal, อัปเดต `_pmrByMachine[machineId]` จาก data ที่คืน, `pmrRenderTable` ใหม่, `showSuccessModal`
- ✅/📜 ต่อแถว (มี planId): reuse `pmrOpenDone(p)` / `pmrOpenHistory(planId,label)` เดิม — หลัง done สำเร็จ: `pmrLoadAll()` + refresh popup แถวนั้น (nextDue เปลี่ยน)
- ปุ่ม "ประวัติการแก้ไข" หัว popup: fetch `?action=pmReplaceEditLog&machineId=` → modal list
- **ลบ/เลิกใช้**: `pmrLoadForMachine`, `pmrRender` (card list), `pmrOpenAdd`, `pmrOpenEdit`, `pmrSaveEdit`, `pmrCloseEdit` — ลบทิ้ง (markup ถูกลบใน B3 แล้ว; เช็คไม่มี onclick ค้างใน index.html)

---

## Phase D — glue (checklist-status.js / checklist-core.js / core.js)

### D1 — routing 3 ทาง (checklist-status.js)
- `renderClSchedule()` [~96-106]: เพิ่ม branch `else if (_clScCurrentTab==='pmrep') { _clPmrepPage=0; pmrRenderTable(machines); }`
- `clScSetPageSize` / `clScGoPage` [~107-122]: if/else 2 ทาง → 3 ทาง (pmrep vars + `pmrRenderTable`)
- `clScTab` (checklist-core.js ~1281-1292): **เอา early-return pmrep ออก** → `if (tab==='pmrep' && typeof initPmReplace==='function') initPmReplace();` แล้วปล่อยไหลลง `renderClSchedule()` (initPmReplace ต้อง idempotent + ครั้งแรก await pmrLoadAll ก่อน render — ให้ initPmReplace เรียก renderClSchedule เองหลังโหลดเสร็จ)

### D2 — copy modal (checklist-status.js)
- `openClCopyModal`: title map เพิ่ม `pmrep → 'PM Replacement'`; guard: type 'pmrep' ใช้ `can('cl.pm')` แทน cl.edit
- `saveClCopy`: branch — type 'pmrep' → POST `{action:'pmReplaceCopy', sourceId, targetIds, byName:editorName, username, pin}` → success: `pmrLoadAll()` + `renderClSchedule()` (ไม่แตะ `_clPmPlans`)

### D3 — MODAL_KEYS (core.js)
- ตรวจ registry `MODAL_KEYS` (memory: UI infra v2.36 — Enter/ESC) → เพิ่ม `pmr-batch-modal`, `pmr-editlog-modal` ตาม pattern modal อื่น (ESC ปิด; Enter ไม่ผูก save เพราะฟอร์มหลายช่อง)

---

## Phase E — Verify
1. `node --check` ทุกไฟล์ js ที่แก้ (pm-replacement, checklist-status, checklist-core, core)
2. **⚠️ redeploy GAS ก่อน** (Phase A) — ไม่งั้น batch/copy/editlog จะ "หาย/ไม่ทำงาน" (จำ: gas-deploy-stale)
3. Preview flow: เปิด Checklist → ตั้งค่า → เห็น tab "PM Inspection" (rename) → tab PM Replacement เห็นตารางเครื่อง + filter fac/area/search เดิมใช้ได้ + pagination
4. แก้ไข: เพิ่ม 2 แถว (บังคับครบ 4 ฟิลด์/แถว) → บันทึก → เช็ค `_PmReplacePlan` (partNo col N, unit=month) + `_PmReplaceEditLog` มี create 2 แถว → แก้ความถี่ 1 แถว + ลบ 1 แถว → บันทึก → log update+delete พร้อม detail diff
5. ✅เปลี่ยนแล้ว จาก popup → nextDue อัปเดต + `_PmReplaceLog` เดิมได้ log · 📜ประวัติ เดิมยังใช้ได้
6. คัดลอก → เครื่องปลายทางถูกทับ + log copy + ตาราง count อัปเดต
7. legacy row หน่วย วัน/ปี → เปิด popup ช่องความถี่ว่าง + placeholder ค่าเดิม → บังคับกรอกก่อนบันทึก
8. เช็ค perm: user ไม่มี cl.pm → tab ซ่อน (data-perm เดิม), ปุ่มแก้ไข/คัดลอกไม่แสดง

## Phase F — commit / PR
- branch `feature/pm-replacement-v2` (แตกจาก main ล่าสุด)
- commit แยก A (gas) / B-D (frontend) ได้ หรือรวม — PR เดียว ระบุ **⚠️ ต้อง redeploy GAS**

---

## จุดเสี่ยง / gotcha
- **redeploy gate**: อาการ "บันทึกแล้วหาย" = GAS เก่า ไม่ใช่บั๊ก client
- `clScRenderPagBar` ผูก id `clsc-${tab}-*` — markup B2 ต้องตั้ง id ตรงเป๊ะทุกตัว ไม่งั้น pagination เงียบ
- `clScTab` เดิม early-return — ถ้าลืมแก้ D1 ตารางจะไม่ render
- ตารางใช้ `can('cl.pm')` ไม่ใช่ `cl.edit` (ต่างจาก Daily/PM Inspection) — อย่า copy เพลิน
- batch รูปหลายแถว: บีบ ≤250KB/รูปอยู่แล้ว แต่ N รูปใหม่พร้อมกัน POST ก้อนใหญ่ — ยอมรับได้ (GAS limit ~50MB); ถ้าช้าให้ showProgress
- อะไหล่ถูกลบจากทะเบียน (spare-delete มีจริง): แถวเดิมต้องยังแก้ฟิลด์อื่นได้โดยไม่บังคับ re-pick
- อย่าลืมลบ `pmr-edit-modal` markup + ฟังก์ชันเก่าให้ครบคู่ (กัน onclick ชี้ฟังก์ชันที่หายไป → ปุ่มเงียบ)
- `_PmReplacePlan` col N migrate อัตโนมัติใน sheet helper — ห้าม insert คอลัมน์กลาง (index A-M เดิมถูกอ้างด้วยเลข)
