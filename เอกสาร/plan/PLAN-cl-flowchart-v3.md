# PLAN — Flowchart v3: daily ติ๊กใช้ Default + PM/pmrep แก้ผ่าน popup เท่านั้น + แสดงแบ่งชั้นชัดเจน

**ต่อยอด PR#79/#80** — feedback 3 ข้อ:
1. **Daily inline**: เพิ่มปุ่มติ๊ก "ใช้ Default" + รายการที่มาจาก Default มีกรอบวงไว้และ**แก้ไม่ได้**
2. **PM Inspection**: ตัด inline edit ออก — ดูได้อย่างเดียว กด ✏️ → popup (modal เดิม) บันทึกแล้ว node อัปเดต + **แสดงข้อมูลแบ่งชั้น (tree ลำดับชั้น) ชัดเจน**
3. **PM Replacement**: ตัด inline edit ออก — ✏️ → popup (pmrOpenBatch เดิม) บันทึกแล้ว node อัปเดต + แสดงข้อมูลแบ่งชั้นชัดเจน

**ขอบเขต:** `js/cl-flowchart.js` เป็นหลัก (+bump index.html) — **frontend ล้วน ไม่แตะ GAS ไม่ redeploy** · โค้ดโดยรวม**ลดลง** (ลบ inline editor ของ pm/pmrep ที่เพิ่งทำใน v2 ออก เหลือ daily อย่างเดียว)
**Executor:** Sonnet (Fable/Opus = plan only)

---

## ข้อเท็จจริงจากโค้ด (ยืนยันแล้ว 2026-07-02)
- flag `dailyMergeDefault` มีอยู่แล้วทั้งระบบ — semantics ([checklist-core.js:124-133]):
  - ไม่มี custom → ใช้ Default ทั้งชุด (โดยปริยาย)
  - มี custom + merge=true → Default (ตัวที่ไม่ซ้ำ) + custom
  - มี custom + merge=false → custom เท่านั้น
- modal เดิมมี checkbox `mcie-daily-merge` แล้ว ([checklist-status.js:293,400]) — inline ใช้ semantics เดียวกันเป๊ะ
- **refresh หลัง popup save มีครบแล้ว ไม่ต้องเพิ่ม**: `saveClItemsEditor`→`loadClSchedule`→`renderClSchedule`→`clFlowRefreshIfActive()` ✓ · `pmrSaveBatch`→`renderClSchedule`→hook ✓
- ปุ่ม ✏️ บน function node เปิด modal ถูกตัวอยู่แล้ว (v1) — v3 เพิ่มปุ่ม ✏️ ที่หัว detail group ให้กดสะดวกอีกจุด

---

## Phase A — Daily inline: ติ๊ก "ใช้ Default" + Default ล็อกแก้ไม่ได้

### A1 — โครงโหมดแก้ไข daily ใหม่ (`clFlowEditDaily` + `_clfwDailyEditHtml`)
- **เลิกใช้ D3 confirm "แปลงเป็น Custom"** (v2) — แทนด้วยโมเดลตรงไปตรงมา:
```js
_clfwDraft = {
    useDefault: /* เครื่องไม่มี custom → true | มี custom → plan.dailyMergeDefault */,
    customItems: (_clPmPlans[id]?.dailyItems || []).map(i => ({...i})),   // เฉพาะ custom จริง ไม่รวม default
};
```
- UI ในกลุ่ม detail:
```
[✓] ใช้รายการ Default (N รายการ)          ← checkbox toggle _clfwDraft.useDefault
┌─ กรอบเส้นประ (โชว์เมื่อติ๊ก) ──────────────┐
│ 🔒 1. ตรวจสอบระดับน้ำมันหล่อลื่น          │  ← Default items: read-only ไม่มี input/🗑️
│ 🔒 2. ...                                │     พื้นเทาอ่อน + badge "Default"
└──────────────────────────────────────────┘
รายการเพิ่มเอง (Custom):
[input] 🗑️        ← แก้/ลบได้เฉพาะ custom
➕ เพิ่มรายการ
[💾 บันทึก] [✖ ยกเลิก]
```
- toggle checkbox → re-render โหมดแก้ (ค่า customItems คงอยู่ใน draft — **sync input ทุกช่องเข้า draft ก่อน re-render** กันค่าหาย)
- validation ตอน 💾: `!useDefault && customItems(กรองว่าง).length === 0` → toast "ต้องมีอย่างน้อย 1 รายการ หรือเปิดใช้ Default"

### A2 — save
```js
clPost({ action:'saveMachineItems', type:'daily', machineId, machineName, factory, area,
         items: customItems,               // เฉพาะ custom (id 'c'+i เหมือนเดิม)
         dailyMergeDefault: useDefault, editedBy });
```
- อัป cache: `_clPmPlans[id].dailyItems = items; _clPmPlans[id].dailyMergeDefault = useDefault;`
- ⚠️ edge จาก semantics เดิม: **custom ว่าง + useDefault ไม่ติ๊ก = เป็นไปไม่ได้** (fallback ไป Default เสมอ) → validation A1 กันไว้แล้ว
- โหมดแสดงปกติ (ไม่แก้): item ที่มาจาก Default ใส่ badge/กรอบประ แยกจาก custom ด้วย (ให้เห็นตั้งแต่ยังไม่กดแก้ — ระบุที่มา: เทียบกับ `_clDailyDefault` ด้วย id/label เหมือน logic merge)

## Phase B — PM Inspection: view-only + popup + แสดง tree แบ่งชั้น

### B1 — ลบ inline edit ของ pm ออกทั้งหมด (โค้ดจาก v2)
- ลบ: `clFlowEditPm`, `_clfwPmEditHtml`, `_clfwPmSetLeaf`, `_clfwPmRemoveLeaf`, `_clfwPmAddRoot`, `clFlowSavePm` + branch `_clfwEditing.pm`
- `_clfwEditing` เหลือ `{ daily:false }` (pmrep ก็ลบ — Phase C) — ปรับ `_clfwConfirmDiscardIfEditing` ตาม

### B2 — ปุ่ม ✏️ ที่หัว detail group ของ pm → `openClItemsEditor('per-machine-pm', id)` (gate `can('cl.edit')`)
- refresh หลัง save: มีแล้วผ่าน hook (ไม่ต้องแก้)

### B3 — แสดง tree แบ่งชั้น (แทน flatten leaf-only เดิม)
- render **ทุก node** (parent + leaf) ไล่ตามชั้น:
```js
// walk ทั้ง tree: parent = การ์ดหนา/ตัวหนา + เลขลำดับ, leaf = การ์ดปกติ
// indent ต่อชั้น: style="margin-left:${depth*14}px"
// ตัวอย่างผลลัพธ์:
//  [1 ระบบหล่อลื่น]        ← parent: bold + พื้น itemBg เข้มกว่า/border สีกิ่ง
//    [1.1 เช็คระดับน้ำมัน]  ← leaf: การ์ดปกติ indent
//    [1.2 เช็คการรั่วซึม]
//  [2 มอเตอร์]
```
- header สรุป (PM ทุก X เดือน · เริ่ม · ถัดไป) คงไว้บนสุดเหมือนเดิม
- เส้น SVG ไม่กระทบ (detail group เป็นกล่องเดียวเท่าเดิม)

## Phase C — PM Replacement: view-only + popup + แสดงแบ่งชั้น

### C1 — ลบ inline edit ของ pmrep (โค้ดจาก v2): `clFlowEditPmrep`, `_clfwPmrepEditHtml`, `clFlowSavePmrep`
### C2 — ปุ่ม ✏️ ที่หัว detail group → `pmrOpenBatch(id)` (gate `can('cl.pm')`) — refresh หลัง save มีแล้ว
### C3 — การ์ดอะไหล่แบ่งชั้นชัดเจน (3 บรรทัด hierarchy):
```
[PN001] ตลับลูกปืน                ← บรรทัด 1: ชื่อ bold (border-left สีสถานะเดิม)
ทุก 6 เดือน · เริ่ม 2026-01        ← บรรทัด 2: รอบ (เทา)
ครบกำหนด 2026-07-01 · ● ปกติ      ← บรรทัด 3: กำหนด + จุดสถานะสีตาม PMR_STATUS_COLOR
```

## Phase D — Verify (ห้าม POST จริง — mock `clPost` จับ payload เฉพาะ daily)
1. `node --check` + reload ไม่มี console error
2. **daily**: เครื่อง Default ล้วน → เปิดแก้: checkbox ติ๊ก + default ล็อก🔒 ไม่มี input · เครื่อง custom → checkbox ตาม flag จริง · toggle แล้วค่า custom ใน input ไม่หาย · mock save → payload `items=custom เท่านั้น` + `dailyMergeDefault` ตรง checkbox · validation (ไม่ติ๊ก+custom ว่าง) block
3. **pm**: กิ่งแสดง tree ครบทุกชั้น (parent+leaf, indent ถูก) เทียบ `_clPmPlans[id].pmItems` จริง · ปุ่ม ✏️ หัวกลุ่มเปิด modal ถูกตัว · จำลอง save จบ (`renderClSchedule()` ตรง) → node refresh
4. **pmrep**: การ์ด 3 บรรทัด + ✏️ เปิด popup ถูกตัว
5. ฟังก์ชัน inline เก่าถูกลบหมด — grep ต้องไม่เหลือ `clFlowEditPm\b|clFlowSavePm\b|clFlowEditPmrep|clFlowSavePmrep` + ไม่มี onclick ค้างชี้ฟังก์ชันที่หายไป
6. perm: `can()=false` → ✏️ หายทุกจุด · discard-guard daily ยังทำงาน (toggle/เปลี่ยนเครื่องระหว่างแก้)

## Phase E — commit / PR
- branch `feature/cl-flowchart-v3` — frontend ล้วน ไม่ redeploy

---

## จุดเสี่ยง / gotcha
- **toggle checkbox ระหว่างแก้ต้อง sync input → draft ก่อน re-render** (ไม่งั้นข้อความที่พิมพ์ค้างหาย — กติกาเดิม v2: ห้าม re-render กลางพิมพ์ ยกเว้น sync ก่อน)
- ระบุที่มา Default ใช้ logic เดียวกับ `clResolveDailyItems` (Set ของ `id||label`) — อย่าเขียน heuristic ใหม่
- ลบฟังก์ชัน inline เก่าให้ครบคู่กับ onclick ทุกจุด (กันปุ่มเงียบ — บทเรียน pmr-edit-modal)
- อย่าแตะ `_clfwFlattenPmItems` ที่ยังใช้ (นับ badge จำนวนรายการบน function node) — B3 เขียน walker ใหม่แยกสำหรับ display แบ่งชั้น
- bump `cl-flowchart.js?v=` + index.html
