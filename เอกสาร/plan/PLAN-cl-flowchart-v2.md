# PLAN — Flowchart v2: สีแยกประเภท + เส้นไม่ชน + พื้นเข้ม + แก้ไข inline + filter พิมพ์รหัส

**ต่อยอด PR#78** (PLAN-cl-flowchart.md) — feedback หลังเห็นของจริง 3 ก้อน:
1. **สีแยกประเภท** ทั้ง node/กิ่ง/เส้น + **เส้นไม่ชนกัน** + **พื้นหลัง canvas สีเข้ม**
2. **แก้ไขรายการ inline ในผังเลย** — บันทึกกลับเข้าข้อมูลจริงของแต่ละระบบ
3. **filter เครื่องจักรแบบพิมพ์** — typeahead รหัส + hint ชื่อเครื่อง

**ขอบเขต:** `index.html` + `js/cl-flowchart.js` (แก้หลัก) — **frontend ล้วน ไม่แตะ GAS ไม่ redeploy** (ใช้ action เดิมที่ deploy แล้วทั้งหมด: `saveMachineItems`, `savePmPlans`, `pmReplaceBatchSave`)
**Executor:** Sonnet (Fable/Opus = plan only)

---

## Decisions confirmed (user 2026-07-02)
| # | หัวข้อ | สรุป |
|---|--------|------|
| D1 | โหมดบันทึก inline | **โหมดแก้ไขครั้งเดียวต่อกิ่ง** — กด ✏️ ที่หัวกลุ่ม detail → ทั้งกลุ่มกลายเป็นช่องพิมพ์ แก้หลายจุด/เพิ่ม/ลบ → กด 💾 บันทึกทีเดียว (ยิง GAS ครั้งเดียวต่อกิ่ง) / ✖ ยกเลิก |
| D2 | pmrep inline | แก้ได้เฉพาะ **ความถี่(เดือน)/เดือนเริ่ม/หมายเหตุ** — เปลี่ยนอะไหล่/รูป/เพิ่มลบรายการ → ปุ่มเปิด popup `pmrOpenBatch` เดิม (เหตุ: อะไหล่บังคับเลือกทะเบียน+รูปบังคับ ใส่ node เล็กไม่ไหว) |
| D3 | เครื่องที่ใช้ Default | แก้ inline ได้ แต่ **confirm ก่อน**: "เครื่องนี้ใช้รายการกลางอยู่ — การแก้จะสร้างชุด Custom เฉพาะเครื่องนี้ ไม่กระทบเครื่องอื่น" → save เป็น custom (พฤติกรรมเดียวกับ modal เดิม แค่เตือนชัด) |

## ข้อเท็จจริงจากโค้ด (สำรวจแล้ว)
- daily item id ใน modal เดิม gen ใหม่ทุก save: `{ id:'c'+index, label }` (mcieFlatGetItems, checklist-status.js:333) → inline ทำแบบเดียวกัน = ตรง behavior เดิม
- pm tree node = `{ label, children[] }` — save ผ่าน 2 POST: `savePmPlans` (freq/start) + `saveMachineItems type='pm'` (mirror saveClItemsEditor:408-425)
- pmrep: `pmReplaceBatchSave` **deploy แล้ว ยืนยันแล้ว** — รับ items เต็มชุด + diff log อัตโนมัติฝั่ง GAS
- สี accent ที่ใช้อยู่ในแอป: daily=เขียว `#16a34a` / PM Inspection=น้ำเงิน `#2563eb` / pmrep=teal `#0d9488`

---

## Phase A — ธีมเข้ม + สี + เส้น (index.html + cl-flowchart.js)

### A1 — canvas พื้นเข้ม (index.html `#clfw-canvas`)
- เปลี่ยน style เป็นพื้นเข้ม + dot grid แบบ mockup แรก:
  `background:#0f172a; background-image:radial-gradient(circle,#1e293b 1px,transparent 1px); background-size:22px 22px; border-radius:12px`
- ข้อความ fallback ("เลือกเครื่องจักรเพื่อดูผัง") → `text-slate-500`

### A2 — สีแยกประเภท (cl-flowchart.js)
```js
const CLFW_BRANCH = {
    daily: { color:'#16a34a', bg:'#f0fdf4', icon:'📋', label:'Checklist รายวัน' },
    pm:    { color:'#2563eb', bg:'#eff6ff', icon:'🔧', label:'PM Inspection' },
    pmrep: { color:'#0d9488', bg:'#f0fdfa', icon:'🔩', label:'PM Replacement' },
};
```
- **machine node**: การ์ดขาว border ขาวหนา + shadow (เด่นบนพื้นเข้ม)
- **function node**: การ์ดขาว + `border-left:4px solid {color}` + ชื่อ function สี {color}
- **detail group**: หัวกลุ่มสี {color} + กล่องพื้น `{bg}` อ่อนตามสี + node ย่อยขาว border อ่อนสีเดียวกัน
- **เส้น**: stroke = `{color}` ของกิ่งนั้น (machine→function และ function→detail สีเดียวกันทั้งเส้นทาง) `stroke-width:2`

### A3 — เส้นไม่ชนกัน (`clFlowDrawLines`)
ปัจจุบันทุกเส้นใช้ `midX=(x1+x2)/2` เดียวกัน → แนวตั้งทับกัน (ตามภาพ feedback)
- ให้แต่ละกิ่งมี **lane แนวตั้งของตัวเอง**: `laneIdx = {daily:0, pm:1, pmrep:2}` →
  - machine→function: `midX = x1 + 20 + laneIdx*10`
  - function→detail: `midX = x1 + 16 + laneIdx*12`
- เพิ่มมุมโค้ง (rounded elbow) ด้วย path `Q` สั้นๆ ที่หัวมุม (ถ้ายุ่งเกิน ใช้เหลี่ยมเดิมแต่แยก lane + สีต่าง = แยกด้วยตาได้แล้ว — ให้ executor ตัดสิน)
- จัด detail group ให้**ต้นกลุ่มเรียงตามลำดับ function เสมอ** (daily,pm,pmrep — เป็นอยู่แล้ว) เส้นจะไล่ระดับไม่ไขว้

## Phase B — filter พิมพ์รหัส + hint ชื่อ (index.html + cl-flowchart.js)

### B1 — แทน `<select id="clfw-machine">` ด้วย typeahead
```html
<input id="clfw-machine-input" list="clfw-machine-hint" type="text"
       placeholder="พิมพ์รหัส/ชื่อเครื่องจักร..." oninput="clFlowMachinePick(this)"
       class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
<datalist id="clfw-machine-hint"></datalist>
```
### B2 — logic (cl-flowchart.js)
- `clFlowFillMachineSelect()` → เปลี่ยนเป็นเติม datalist: option value = `"${id} — ${name}"` จาก `clMachinesFor(fac,area)` (กรองตาม fac/area เดิม)
- `clFlowMachinePick(inp)`: หา exact match กับ option → ดึง id → `clFlowMachineChange(id)`; พิมพ์บางส่วน = browser โชว์ hint เอง; ไม่ match = ไม่ render (ไม่ error)
- `clFlowOpen(machineId)` (ปุ่มลัด 🔀): set ค่า input เป็น `"id — name"` ให้สอดคล้อง
- ล้าง input เมื่อเปลี่ยน fac/area

## Phase C — แก้ไข inline ต่อกิ่ง (cl-flowchart.js — หัวใจรอบนี้)

### C1 — state + โครง
```js
let _clfwEditing = { daily:false, pm:false, pmrep:false };   // กิ่งไหนอยู่ในโหมดแก้ไข
let _clfwDraft   = null;   // สำเนาข้อมูลกิ่งที่กำลังแก้ (แก้บน draft, ยกเลิก = ทิ้ง)
```
- หัว detail group เพิ่มปุ่มตาม perm: ปกติ → `✏️ แก้ไขในผัง` (daily/pm: `can('cl.edit')`, pmrep: `can('cl.pm')`) · โหมดแก้ → `💾 บันทึก` + `✖ ยกเลิก`
- เข้าโหมดแก้ได้ทีละกิ่ง (กิ่งอื่นปุ่ม disable ระหว่างแก้ — กันงง/กัน state ซ้อน)
- คลิก function node (toggle หุบ) ระหว่างโหมดแก้ = confirm ทิ้ง draft ก่อน

### C2 — daily inline
- เข้าโหมด: `_clfwDraft = clResolveDailyItems(id).map(i=>({...i}))` · **ถ้าเครื่องใช้ Default** (`!_clPmPlans[id]?.dailyItems?.length`) → `confirm()` ตาม D3 ก่อนเข้าโหมด
- render: 1 แถว = input text + 🗑️ · ปุ่ม ➕ เพิ่มรายการ ท้ายกลุ่ม
- 💾: กรองแถวว่าง → `{id:'c'+i, label}` → `clPost({action:'saveMachineItems', type:'daily', machineId, machineName, factory, area, items, dailyMergeDefault:(คงค่าเดิมของ plan||false), editedBy:currentUser.name})` → update `_clPmPlans[id].dailyItems` → ออกโหมด + re-render + toast
- validation: อย่างน้อย 1 รายการ

### C3 — PM Inspection inline
- header กลุ่มเป็นช่องแก้: ความถี่ (number ≥1 เดือน) + เดือนเริ่ม (month)
- รายการ: แก้**ข้อความ leaf ได้ทุกตัว** — ตอน flatten เก็บ `path` (array ดัชนีลงไปใน tree) ต่อ leaf → เขียนกลับ `node.label` ตาม path บน draft (`structuredClone(_clPmPlans[id].pmItems||[])`)
- ➕ เพิ่ม = push root node ใหม่ `{label,children:[]}` · 🗑️ ลบ = ลบ node ตาม path (parent ที่ลูกหมดกลายเป็น leaf เอง — พฤติกรรมยอมรับได้) · **จัดโครงสร้างซ้อนหลายชั้น → ใช้ modal เดิม** (ปุ่มเปิด modal มีอยู่แล้วบน function node)
- 💾: mirror `saveClItemsEditor` โหมด per-machine-pm = 2 POST (`savePmPlans` แล้ว `saveMachineItems type='pm'`) → update `_clPmPlans[id]` → ออกโหมด
- validation: freq ≥1, leaf label ไม่ว่าง

### C4 — pmrep inline (D2: 3 ฟิลด์)
- แถวอะไหล่ในโหมดแก้: ชื่อ/รหัส/รูป = **readonly** · ช่องแก้: ความถี่(เดือน number ≥1) + เดือนเริ่ม(month) + หมายเหตุ(text)
- แถว legacy หน่วย วัน/ปี → ช่องความถี่ว่าง + placeholder "เดิม: X วัน" บังคับกรอก (กติกาเดียวกับ popup PR#77)
- 💾: สร้าง items เต็มชุดจาก `_pmrByMachine[id]` (partId/partName←ตัด partNo ออกจาก partLabel/partNo/existingLocationImageId คงเดิม + ฟิลด์ที่แก้), `removedPlanIds:[]` → `clPost({action:'pmReplaceBatchSave', machineId, byName, items, removedPlanIds:[]})` → GAS diff-log ให้อัตโนมัติ → update `_pmrByMachine[id] = res.data` → ออกโหมด
- ใต้กลุ่มมีลิงก์ "เปลี่ยนอะไหล่/รูป/เพิ่มลบรายการ → เปิดหน้าตั้งค่าเต็ม" = `pmrOpenBatch(id)`
- กิ่งว่าง (0 อะไหล่) → ไม่มีปุ่มแก้ inline มีแต่ปุ่มเปิด popup

### C5 — หลัง save ทุกกิ่ง
- `clFlowRender()` (วาดใหม่+เส้นใหม่) + toast/`showSuccessModal` — cache ที่แก้แล้วทำให้ตาราง schedule/ฟอร์ม checklist เห็นข้อมูลใหม่ทันทีอยู่แล้ว (อ่าน `_clPmPlans`/`_pmrByMachine` ชุดเดียวกัน)

## Phase D — Verify (ห้าม POST จริงบน production)
1. `node --check` ทุกไฟล์ + reload preview ไม่มี console error
2. ธีมเข้ม: canvas เข้ม node ขาวชัด สี 3 กิ่งถูกต้อง (เขียว/น้ำเงิน/teal ทั้ง node+เส้น)
3. เส้น: ขยายทั้ง 3 กิ่งพร้อมกัน → ตรวจ path `d` ว่า lane แนวตั้งไม่ทับกัน (คนละ midX)
4. typeahead: พิมพ์บางส่วน → datalist hint ขึ้น (id—ชื่อ) · เลือก exact → ผัง render · fac/area กรอง hint
5. **ทดสอบ save โดย mock `clPost`**: override ชั่วคราว `window.clPost = async(b)=>{_captured=b; return {success:true, data:[...]}}` → เข้าโหมดแก้ → แก้/เพิ่ม/ลบ → 💾 → ตรวจ payload ถูก schema ทุกกิ่ง (daily: items id 'c'+i / pm: 2 call เรียงถูก / pmrep: items เต็มชุด+ฟิลด์แก้) → reload ล้าง mock
6. D3 confirm dialog เด้งเมื่อเครื่องใช้ Default · ยกเลิกโหมดแก้ = draft ทิ้งจริง (ค่าเดิมกลับมา)
7. perm: mock can()=false → ปุ่มแก้ inline หาย

## Phase E — commit / PR
- branch `feature/cl-flowchart-v2` — ระบุ frontend ล้วน ไม่ redeploy

---

## จุดเสี่ยง / gotcha
- **pm tree path-mapping** = จุดพลาดง่ายสุด — แก้ leaf ต้องเขียนกลับตาม path บน **draft clone** ไม่ใช่ cache ตรง (ยกเลิกต้องไม่เปื้อน) · `structuredClone` มีใน browser ใหม่ (แอปใช้ ES2020+ อยู่แล้ว โอเค)
- pmrep partName ต้อง derive จาก partLabel (ตัด `"PN - "` prefix ถ้า partNo มี) — ใช้ logic เดียวกับ `pmrOpenBatch` เป๊ะ อย่าเขียนใหม่
- inline อยู่ใน node ที่วาดใหม่ทุกครั้ง — **ห้ามเรียก `clFlowRender()` ระหว่างพิมพ์** (จะล้าง input) → โหมดแก้ render ครั้งเดียวตอนเข้าโหมด, เส้น redraw ได้ (`clFlowDrawLines` ไม่แตะ DOM node)
- เข้าโหมดแก้แล้ว canvas สูงเปลี่ยน → เรียก `clFlowDrawLines()` หลังสลับโหมด
- ตาราง schedule ใช้ cache เดียวกัน — หลัง save inline ไม่ต้อง reload GAS (แต่ปุ่ม 🔄 รีเฟรชยังใช้ดึงสดได้)
- อย่าลืม bump `cl-flowchart.js?v=` + index.html
