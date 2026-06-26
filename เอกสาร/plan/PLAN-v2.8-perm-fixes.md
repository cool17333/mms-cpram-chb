# PLAN-v2.8 — แก้บั๊ก permission ตกค้าง + UI polish

> สถานะ: เฟส 1+2 = execute ตอนนี้ (Sonnet) · เฟส 3 = deferred (ต้อง redeploy GAS)
> **Goal:** กู้คืน core function ที่ Admin กดไม่ได้ (role-string เก่าตกค้างจาก migrate v2.6) + ขัดเกลา UI หน้า User Access
> **Version:** bump `?v=2.7.1` → `?v=2.8` (12 script tags ใน index.html) + `EXPORT_VER` (export.js:120) → `v2.8`

---

## ⛔ กฎที่ต้องคุม
- ทุก commit ผ่าน feature branch → PR → main (main = production auto-deploy)
- `node --check js/<ไฟล์>.js` ทุกไฟล์ที่แก้ ก่อน commit
- ห้ามเปลี่ยนเป็น ES module · classic `<script>` order เดิม
- **แก้ js ใดๆ ต้อง bump `?v=` (cache-bust convention)** — เฟสนี้ → `v2.8`
- เฟส 1+2 ไม่แตะ `gas_code.gs` → ไม่ต้อง redeploy

---

# เฟส 1 — แก้บั๊ก role ตกค้าง (ข้อ 3 ขยาย) + redirect (ข้อ 6)

## 1A. แทนที่ stale role-check → `can('<code>')`

รากปัญหา: `userRole` (core.js:60 shim) คืน **level** (`'Administrator'`/`'Engineer'`/`'Visitor'`) แต่โค้ดเก่าเทียบ `'admin'/'engineer'/'user'` → พังเสมอ. แก้ทุกจุดเป็น permission code:

### js/machines.js
- `:251` `confirmMachDelete` → `if (!can('mc.delete')) { showToast('⚠️ ไม่มีสิทธิ์ลบเครื่องจักร', 'error'); return; }`
- `:269` `saveMachines` → `if (!can('mc.edit')) { ... 'ไม่มีสิทธิ์แก้ไขทะเบียน' ... }`
- `:284` `restoreMachines` → `if (!can('mc.restore')) { ... 'ไม่มีสิทธิ์กู้คืน' ... }`
- `:394` `cancelRecord` → `if (!can('bd.cancel')) { ... 'ไม่มีสิทธิ์ยกเลิกงาน' ... }`

### js/breakdown-report.js
- `:177` `acceptRecord` → `if (!can('bd.accept')) { ... 'ไม่มีสิทธิ์รับงาน' ... }`
- `:507` `goLog` (**ข้อ 3 ที่รายงาน**) → `if (!can('ua.log')) { showToast('⚠️ ไม่มีสิทธิ์ดู Log ระบบ', 'error'); return; }`

### js/records-summary.js (บรรทัด 93–95 เป็น flag ไม่ใช่ guard)
- `:93` `const isAdmin = can('bd.manual');`  ← gate canPDF (ส่งออกได้แม้ไม่มี why)
- `:94` `const canEdit = can('bd.editdoc');`
- `:95` `const canAccept = can('bd.accept');`

### js/checklist-status.js
- `:165,:190` `const canEdit = can('cl.edit');`
- `:216` not-logged-in → `if (!currentUser.username) { showToast('กรุณาเข้าสู่ระบบก่อน', 'warn'); return; }`
- `:217,:247,:437` → `if (!can('cl.edit')) { showToast('ไม่มีสิทธิ์แก้ไขรายการตรวจ', 'warn'); return; }`
- `:380` `if (!can('cl.edit')) { ... }`

### js/checklist-core.js
- `:1096` ซ่อนปุ่ม set → `setBtn.classList.toggle('hidden', !can('cl.edit'));`
- `:1166` early return → `if (!can('cl.edit')) return;`

> หลังแก้: server `userCan()` ยังเป็นด่านจริง — เหล่านี้คือ client pre-check (defense in depth)
> verify: `node --check` ทั้ง 5 ไฟล์

## 1B. ข้อ 6 — redirect home หลัง login ถ้าสิทธิ์ไม่ถึง

### js/permissions.js
- เพิ่ม const บนสุด:
```javascript
const PANEL_PERM = { ua: 'ua.level', log: 'ua.log' };
```
- ใน `applyPermissions()` ต่อท้าย (หลัง updateNavRole guard):
```javascript
// ถ้าหน้าที่ค้างอยู่สิทธิ์ไม่ถึง → กลับหน้าหลัก
const _active = document.querySelector('.tab-panel.active')?.id.replace('panel-', '');
if (_active && PANEL_PERM[_active] && !can(PANEL_PERM[_active]) && typeof switchTab === 'function') {
    switchTab('home');
}
```

## 1C. 🚨 P0 — `openReportPopup()` crash (หน้าแจ้ง Breakdown เปิดไม่ขึ้น)
Block C ลบ field `rm-byname` ออกจาก HTML แต่เหลือ ref ใน JS → `getElementById` คืน null → throw → modal ไม่เปิด (กระทบทั้งปุ่มแจ้ง BD และสแกน QR)
### js/breakdown-report.js:299 — **ลบบรรทัดนี้ทิ้ง**
```javascript
document.getElementById('rm-byname').value = '';   // ← ลบ: field ถูกลบใน Block C, ผู้แจ้งใช้ currentUser.name แล้ว
```

---

# เฟส 2 — UI polish (frontend ล้วน)

## ข้อ 1 — Permission label ไทย+อังกฤษ
### js/user-access.js — เพิ่ม map + ใช้ใน `renderPermMatrix()` (แทน raw code บรรทัด 194)
```javascript
const PERM_LABEL = {
  'bd.view':'ดูรายการ Breakdown (View)','bd.export':'ส่งออก Breakdown (Export)',
  'bd.report':'แจ้ง Breakdown (Report)','bd.accept':'รับงาน (Accept)',
  'bd.editdoc':'แก้ไขเอกสาร BD (Edit)','bd.close':'ปิดงาน (Close)',
  'bd.whywhy':'วิเคราะห์ Why-Why','bd.manual':'สร้างย้อนหลัง (Manual)','bd.cancel':'ยกเลิกงาน (Cancel)',
  'mc.view':'ดูทะเบียนเครื่องจักร (View)','mc.edit':'แก้ไขเครื่องจักร (Edit)',
  'mc.delete':'ลบเครื่องจักร (Delete)','mc.add':'เพิ่มเครื่องจักร (Add)',
  'mc.import':'นำเข้า Excel (Import)','mc.backup':'สำรองข้อมูล (Backup)','mc.restore':'กู้คืนข้อมูล (Restore)',
  'cl.view':'ดู Checklist (View)','cl.history':'ประวัติ Checklist (History)',
  'cl.status':'สถานะการตรวจ (Status)','cl.export':'ส่งออก Checklist (Export)',
  'cl.daily':'ตรวจรายวัน (Daily)','cl.pm':'ตรวจ PM (PM)','cl.edit':'แก้ไขรายการตรวจ (Edit)','cl.calendar':'ปฏิทิน PM (Calendar)',
  'ua.add':'เพิ่มผู้ใช้ (Add user)','ua.del':'ลบผู้ใช้ (Delete user)','ua.level':'เปลี่ยน Level (Set level)',
  'ua.perm':'แก้สิทธิ์ (Edit perm)','ua.log':'ดู Log ระบบ (View log)',
};
```
- บรรทัด 194: `<td ...>${PERM_LABEL[code] || code}</td>` + เพิ่ม `<div class="text-[10px] text-gray-300 font-mono">${code}</div>` ไว้ใต้ (โชว์ code เล็กๆ กำกับ)

## ข้อ 4 — Rename label (nav bar + page title + การ์ดหน้าแรก)
`ทะเบียนเครื่องจักร` → **ระบบ Machine List** · `Checklist` → **ระบบ Check List** · `ระบบ Breakdown` → **ระบบแจ้งซ่อม & Breakdown** (รับทั้ง Breakdown+Adjustment)

| ไฟล์:บรรทัด | เดิม | ใหม่ |
|---|---|---|
| index.html:255 (sidebar) | `ทะเบียนเครื่องจักร` | `ระบบ Machine List` |
| index.html:260 (sidebar) | `Checklist` | `ระบบ Check List` |
| index.html:306 (bottom-nav) | `ทะเบียน` | `Machine List` (สั้น พอดีแถบ) |
| index.html:309 (bottom-nav) | `Checklist` | `Check List` (สั้น พอดีแถบ) |
| index.html:838 (การ์ดหน้าแรก) | `🗂️ ทะเบียนเครื่องจักร` | `🗂️ ระบบ Machine List` |
| index.html:842 (การ์ดหน้าแรก) | `✅ Checklist` | `✅ ระบบ Check List` |
| breakdown-report.js:33 (PAGE_TITLE) | `🗂️ ระบบทะเบียนเครื่องจักร` | `🗂️ ระบบ Machine List` |
| breakdown-report.js:34,36 (PAGE_TITLE) | `✅ ระบบ Check list` | `✅ ระบบ Check List` |
| index.html:245 (sidebar) | `ระบบ Breakdown` | `ระบบแจ้งซ่อม & Breakdown` |
| index.html:303 (bottom-nav) | `Breakdown` | `แจ้งซ่อม/BD` (สั้น พอดีแถบ) |
| index.html:707 (hub H1) | `🚨 ระบบ Breakdown` | `🚨 ระบบแจ้งซ่อม & Breakdown` |
| breakdown-report.js:29 (PAGE_TITLE bd-hub) | `🚨 ระบบ Breakdown` | `🚨 ระบบแจ้งซ่อม & Breakdown` |

> **คงไว้ไม่แตะ:** action/feature labels "แจ้ง Breakdown" / "รายการ Breakdown" / "สรุป Breakdown" (เป็นชื่อฟังก์ชันเฉพาะ), sub-item "PM Checklist"/"ประวัติ Checklist", "Daily Checklist วันนี้", code identifiers, ข้อความช่วย "อิงทะเบียนเครื่องจักร" (index.html:392,1601,2159)

## ข้อ 5 — User Access tab ผู้ใช้: filter + refresh + loading
### index.html (panel-ua, pane users ~บรรทัด 2645–2660)
เพิ่มแถบควบคุมเหนือ table:
```html
<div class="flex flex-wrap gap-2 items-center mb-3">
  <input id="ua-filter-name" oninput="renderUaUsers()" placeholder="🔍 ค้นหาชื่อ/username"
         class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm flex-1 min-w-[160px]">
  <select id="ua-filter-level" onchange="renderUaUsers()" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">
    <option value="">ทุก Level</option>
    <option>Visitor</option><option>Production</option><option>Technician</option>
    <option>Engineer</option><option>Supervisor</option><option>Administrator</option>
  </select>
  <button onclick="loadUaUsers()" class="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-bold">🔄 รีเฟรช</button>
</div>
```
### js/user-access.js
- `loadUaUsers()` ครอบ `showLoading('กำลังโหลดผู้ใช้…')` / `finally { hideLoading(); }`
- `renderUaUsers()` กรอง `_uaUsers` ก่อน map:
```javascript
const fName = (document.getElementById('ua-filter-name')?.value || '').trim().toLowerCase();
const fLvl  = document.getElementById('ua-filter-level')?.value || '';
const list = _uaUsers.filter(u =>
  (!fName || (u.name||'').toLowerCase().includes(fName) || (u.username||'').toLowerCase().includes(fName)) &&
  (!fLvl  || u.level === fLvl));
```
แล้ว map จาก `list` แทน `_uaUsers` (เหลือ 0 แถว → แสดง "ไม่พบผู้ใช้ตามเงื่อนไข")

## ข้อ 7 — QR Code: รวมปุ่มที่ Machine list + wire eventType
> v2.7 (scan.js) ทำ flow ไว้แล้ว: popup 3 ตัวเลือก daily/bd/adj, login-first, autofill เครื่อง+ผู้แจ้ง (`currentUser.name`). เหลือ 3 delta:

### 7A. ลบปุ่ม Generate QR ออกจาก BD + Checklist
- **index.html:763–767** — ลบการ์ด `bdhub-card-qr` ทั้งก้อน (Generate QR ที่ BD hub)
- **index.html:1413** — ลบปุ่ม `📱 Generate QR` ในหน้า Checklist

### 7B. เพิ่มปุ่มเดียวในหน้า Machine list
- ใน `panel-machines` แถบ toolbar (ข้างปุ่ม import/เพิ่มเครื่อง) เพิ่ม:
```html
<button onclick="generateMachineQrPdf(machineMaster.map(m=>m.id||m.machineId||m.machine_id||'').filter(Boolean),40)"
        class="mms-btn mms-btn-blue text-xs">📱 Generate QR ทุกเครื่อง</button>
```
(ไม่ต้อง gate perm พิเศษ — หน้านี้เห็นด้วย mc.view อยู่แล้ว)

### 7C. บันทึก eventType ตามตัวเลือก popup (Adjustment ให้มีผลจริง)
ปัญหา: `submitReportPopup` data **ไม่มี `eventType`**; `_scanGo` set `inp-event-type` ผิดฟอร์ม. แก้ด้วย global:

**js/breakdown-report.js**
- `openReportPopup()` ต้นฟังก์ชัน เพิ่ม default: `window._scanEventType = 'Breakdown';` (เปิดเองจากปุ่ม = Breakdown)
- `submitReportPopup()` ใน data object (หลัง `bdType: ''`) เพิ่ม: `eventType: window._scanEventType || 'Breakdown',`
- `submitReportPopup()` problem-suffix (บรรทัด 360) ให้สะท้อนประเภท: `problem: \`${problem} *${byName} - ${window._scanEventType==='Adjustment'?'แจ้งซ่อม':'แจ้ง Breakdown'}\`,`

**js/scan.js `_scanGo` (bd/adj)** — แทนที่บล็อก set `inp-event-type` (บรรทัด 89–92) ด้วย:
```javascript
window._scanEventType = eventType;   // 'Breakdown' | 'Adjustment'
const notice = document.getElementById('rm-qr-notice');
const ntext  = document.getElementById('rm-qr-notice-text');
if (notice) notice.classList.remove('hidden');
if (ntext)  ntext.textContent = `สแกน QR — ${machineName} · เหตุการณ์: ${eventType==='Adjustment'?'แจ้งซ่อม (Adjustment)':'Breakdown'}`;
```
> ⚠️ ลำดับสำคัญ: `_scanGo` เรียก `openReportPopup()` (reset = Breakdown) **ก่อน** แล้วค่อย set `window._scanEventType = eventType` ใน setTimeout → ค่าตัวเลือกชนะ
> eventType แก้ย้อนหลังได้ในฟอร์มเต็ม (`inp-event-type` โหลด `item.eventType` ตอน edit อยู่แล้ว — breakdown-form.js:949)

### 7D. popup เปลี่ยนหัวข้อ/ปุ่มตามตัวเลือก (ยืนยันแล้ว — ลดสับสน)
Adjustment = workflow เดียวกับ BD (record เข้าระบบ BD รับงาน→ปิดงาน) ต่างแค่ tag + **ป้ายใน popup**
- **index.html:2142** — เพิ่ม `id="rm-modal-title"` ที่ `<h2>` (ปัจจุบันไม่มี id) · ปุ่มส่งมี `id="rm-submit"` อยู่แล้ว
- **js/breakdown-report.js `openReportPopup()`** (manual entry = default Breakdown): set
  ```javascript
  document.getElementById('rm-modal-title').textContent = '🚨 แจ้ง Breakdown';
  document.getElementById('rm-submit').textContent      = '🚨 แจ้ง Breakdown';
  ```
- **js/scan.js `_scanGo` (bd/adj)** — หลังเปิด popup set ตาม eventType:
  ```javascript
  const isAdj = eventType === 'Adjustment';
  document.getElementById('rm-modal-title').textContent = isAdj ? '🔧 แจ้งซ่อม (Adjustment)' : '🚨 แจ้ง Breakdown';
  document.getElementById('rm-submit').textContent      = isAdj ? '🔧 แจ้งซ่อม' : '🚨 แจ้ง Breakdown';
  ```
> หมายเหตุ: `submitReportPopup` finally (breakdown-report.js:380) reset ปุ่ม → "🚨 แจ้ง Breakdown" — ยอมรับได้ (สำเร็จ = ปิด modal) · สีแถบหัว popup (แดง) คงไว้ ไม่ต้องสลับสี (YAGNI)

### 7E. header เอกสาร Report เต็ม + PDF เปลี่ยนตาม eventType (ยืนยันแล้ว)
hard-code "Breakdown Report" 3 จุดที่ไม่ผูก eventType → ทำให้ dynamic:

**HTML — เพิ่ม id**
- **index.html:1557** → `<p id="report-doc-title" class="...">🔴 Breakdown Report — Machine · CPRAM CHB</p>`
- **index.html:1777** → `<p id="report-whyimg-title" class="...">● BREAKDOWN REPORT — รูปภาพประกอบ WHY-WHY</p>`
- **index.html:1647** (`inp-event-type` select) → เพิ่ม `onchange="setReportDocHeader(this.value)"` (แก้สดในฟอร์มเต็ม → header อัปเดตทันที)

**js/breakdown-form.js — helper + เรียกตอนโหลด record**
```javascript
function setReportDocHeader(et) {
  const isAdj = et === 'Adjustment';
  const t1 = document.getElementById('report-doc-title');
  const t2 = document.getElementById('report-whyimg-title');
  if (t1) t1.textContent = isAdj ? '🔧 Adjustment Report — Machine · CPRAM CHB' : '🔴 Breakdown Report — Machine · CPRAM CHB';
  if (t2) t2.textContent = isAdj ? '● ADJUSTMENT REPORT — รูปภาพประกอบ WHY-WHY' : '● BREAKDOWN REPORT — รูปภาพประกอบ WHY-WHY';
}
```
- หลัง `if (etSel) etSel.value = item.eventType || '';` (breakdown-form.js:949) เพิ่ม: `setReportDocHeader(item.eventType || 'Breakdown');`

**js/export.js:403 — PDF header dynamic** (มี `d.eventType` พร้อมใช้)
```javascript
<div style="...">${d.eventType === 'Adjustment' ? '🔧 ADJUSTMENT REPORT • MACHINE • CPRAM CHB' : '🔴 BREAKDOWN REPORT • MACHINE • CPRAM CHB'}</div>
```
> manual create: eventType ว่างตอนเริ่ม → default Breakdown · เลือก Adjustment ใน select → onchange อัปเดต header สด

### 7F. ปุ่ม "แจ้งซ่อม (Adjustment)" บน BD hub — first-class (ยืนยันแล้ว)
ตอนนี้แจ้งซ่อมเข้าได้แค่ทาง QR → เพิ่มทางแจ้งตรงบน hub

**js/breakdown-report.js — helper (ใช้ร่วม 7D)**
```javascript
function _applyReportEventType(et) {   // DRY: ใช้ทั้ง _scanGo (7D) และ openReportPopupType
  window._scanEventType = et;
  const isAdj = et === 'Adjustment';
  const t = document.getElementById('rm-modal-title');
  const b = document.getElementById('rm-submit');
  if (t) t.textContent = isAdj ? '🔧 แจ้งซ่อม (Adjustment)' : '🚨 แจ้ง Breakdown';
  if (b) b.textContent = isAdj ? '🔧 แจ้งซ่อม' : '🚨 แจ้ง Breakdown';
}
function openReportPopupType(eventType) {
  openReportPopup();                          // reset + เปิด (default Breakdown)
  _applyReportEventType(eventType || 'Breakdown');
}
```
> 7D `_scanGo` + 7E ให้เรียก `_applyReportEventType(eventType)` แทน inline label (DRY)

**index.html — BD hub (grid cols-4, ลบการ์ด QR 7A แล้วเหลือที่พอดี)**
- การ์ด "แจ้ง Breakdown" (739) + ปุ่ม (743): `onclick` → `openReportPopupType('Breakdown')`
- **เพิ่มการ์ดใหม่หลังการ์ด Breakdown** (สีเหลือง):
```html
<div class="mms-card p-6 cursor-pointer text-center" style="border-top:5px solid #eab308" onclick="openReportPopupType('Adjustment')">
    <div class="text-4xl mb-3">🔧</div>
    <h3 class="font-bold mb-1" style="color:var(--mms-text)">แจ้งซ่อม (Adjustment)</h3>
    <p class="text-xs mb-4" style="color:var(--mms-text-sub)">เปิดใบแจ้งซ่อม/ปรับแต่งเครื่องจักร</p>
    <button class="mms-btn w-full justify-center text-sm" style="background:#eab308;color:#fff" onclick="event.stopPropagation();openReportPopupType('Adjustment')">🔧 แจ้งซ่อม</button>
</div>
```
- sidebar:249 "แจ้ง Breakdown" → `openReportPopupType('Breakdown')`; **เพิ่ม sub-item ใหม่** "แจ้งซ่อม" `data-perm="bd.report"` → `openReportPopupType('Adjustment')`

> ไม่ autofill เครื่อง (ไม่ได้มาจาก QR) → ผู้ใช้เลือกเครื่องเอง · header/PDF เปลี่ยนตาม eventType (7E) อยู่แล้ว

→ ไฟล์ข้อ 7: index.html, breakdown-report.js, scan.js, breakdown-form.js, export.js · ไม่แตะ GAS

## ข้อ 8 — Login modal + nav header (index.html ล้วน)
### 8A. ปุ่มยกเลิกใน login modal
หลังปุ่ม "เข้าสู่ระบบ" (index.html:434) เพิ่ม:
```html
<button onclick="closeLogin()"
        style="width:100%;background:transparent;color:#7f8c8d;font-weight:700;font-size:14px;padding:10px;border-radius:12px;border:none;cursor:pointer;margin-top:8px"
        onmouseover="this.style.background='#f3f4f6'" onmouseout="this.style.background='transparent'">
    ยกเลิก
</button>
```

### 8B. ช่อง PIN → "Password" (Enter=login มีอยู่แล้ว)
- index.html:421 — label `PIN` → `Password`
- index.html:424 — placeholder `PIN...` → `Password...`
- **Enter→doLogin มีอยู่แล้ว** ที่ `lm-pin` (index.html:425 `onkeydown="...doLogin()"`) — คงไว้ แค่ verify ว่ายังทำงาน
> ความยาว → ดู 8D

### 8C. nav header `MMS` → `CMMS`
- index.html:226 `<p ...>MMS</p>` → `CMMS` (จุดแสดงผลเดียว — ที่เหลือเป็นคลาส `mms-*` / login subtitle เป็น CMMS อยู่แล้ว ห้ามแตะ)

### 8D. Password ยาว 8–12 ตัว (frontend ล้วน — GAS ยืนยันไม่ validate ความยาว)
**index.html — maxlength + placeholder**
- :424 `lm-pin` (login) `maxlength="8"` → `"12"` (ไม่บังคับ min ตอน login → บัญชีเก่า PIN สั้นยัง login ได้)
- :2704 `au-pin` (เพิ่ม user) `maxlength="8"` → `"12"` · placeholder `4-8 หลัก` → `8-12 ตัว` · ลบ `inputmode="numeric"` (Password = พิมพ์ตัวอักษรได้)
- :2736 `new-pin-val` (reset) `maxlength="8"` → `"12"` · placeholder `4-8 หลัก` → `8-12 ตัว` · ลบ `inputmode="numeric"`

**js/user-access.js — บังคับ 8–12 ตอนสร้าง/รีเซ็ต**
- :78 `submitAddUser` → `if (pin.length < 8 || pin.length > 12) { showToast('⚠️ Password ต้อง 8–12 ตัว', 'error'); return; }`
- :128 `submitResetPin` → `if (newPin.length < 8 || newPin.length > 12) { showToast('⚠️ Password ต้อง 8–12 ตัว', 'error'); return; }`

> ⚠️ บัญชีเดิม (เช่น admin seed) ที่ PIN < 8 → **ยัง login ได้** (login ไม่บังคับ min) แต่เมื่อ reset ต้อง 8–12 · auth/ฝั่ง GAS ไม่เปลี่ยน (hash เทียบเหมือนเดิม)

→ ไฟล์ข้อ 8: index.html, user-access.js · ไม่แตะ GAS

---

## Verify เฟส 1+2
1. `node --check` ทุกไฟล์ที่แก้ (machines, breakdown-report, records-summary, checklist-status, checklist-core, permissions, user-access, scan, export)
2. Preview `localhost:3456` → login Administrator:
   - **แจ้ง Breakdown popup เปิดได้** (1C — เดิม crash) · Log ระบบ เข้าได้ · เพิ่ม/ลบ/แก้เครื่องจักรได้ · รับงาน BD ได้
   - Permission matrix แสดงป้ายไทย · nav = "ระบบ Machine List"/"ระบบ Check List"/**"ระบบแจ้งซ่อม & Breakdown"**
   - tab ผู้ใช้ filter/refresh/loading ทำงาน
   - **ปุ่ม Generate QR อยู่หน้า Machine list ที่เดียว** (หาย BD hub + Checklist)
   - **BD hub มีการ์ด "🔧 แจ้งซ่อม (Adjustment)" → เปิด popup preset Adjustment โดยไม่ต้องสแกน QR** (7F)
3. login เป็น Visitor ขณะค้างหน้า User Access → เด้งกลับหน้าหลัก
   - login modal: มีปุ่ม "ยกเลิก" (ปิด modal) · label = "Password" · กด Enter ในช่อง Password → login · nav header = "CMMS"
   - เพิ่ม user / reset PIN ด้วย password < 8 หรือ > 12 ตัว → ขึ้น error "8–12 ตัว"; 8–12 ตัว → ผ่าน · บัญชีเดิม PIN สั้นยัง login ได้
4. **สแกน QR (หรือ `?mode=scan&m=<id>`) → popup → เลือก "แจ้งซ่อม (Adjustment)"**:
   - popup หัวข้อ/ปุ่ม = "🔧 แจ้งซ่อม (Adjustment)" (7D)
   - แจ้ง → record มี `eventType=Adjustment`; ผู้แจ้ง = ชื่อที่ login; เลือก Breakdown → `eventType=Breakdown`
   - เปิดเอกสาร record นั้น → header = "Adjustment Report"; export PDF → header PDF = "ADJUSTMENT REPORT" (7E); เปลี่ยน select เป็น Breakdown → header เปลี่ยนสด
5. badge = `v2.8`

## Branch / PR
`feature/v2.8-perm-fixes` → commit แยกตามเฟส (1A / 1B / 1C / 2 / ข้อ7) → push mms → PR → merge

---

# เฟส 3 — ข้อ 2: แก้ Permission ผ่าน UI (DEFERRED · ต้อง redeploy GAS)

**Approach = sheet-backed (ยืนยันแล้ว)**

ปัจจุบัน `PERM_MATRIX` = const ใน gas_code.gs:29 · `userCan`(192)/`getPermsForLevel`(200)/`getPermissions`(966) อ่าน const · sheet `_Permissions` เขียนครั้งเดียวตอน seed (41) **ไม่เคยอ่านกลับ**

งานเฟส 3:
1. **gas_code.gs** — ฟังก์ชัน `readPermMatrix(ss)` อ่าน sheet `_Permissions` → object (cache ด้วย CacheService 60s), fallback เป็น const ถ้า sheet ว่าง
2. เปลี่ยน `userCan`/`getPermsForLevel`/`getPermissions` ให้เรียก `readPermMatrix(ss)` แทน const ตรงๆ
3. endpoint ใหม่ `setPermission` (POST) — gate `userCan(...,'ua.perm')` → เขียน cell ใน `_Permissions` + ล้าง cache + log
4. **redeploy GAS Web App** (ไม่งั้น client เห็นโค้ดเก่า)
5. **js/user-access.js** — `renderPermMatrix()` ทำ cell เป็น toggle กดได้ถ้า `can('ua.perm')` → ยิง `setPermission`
6. bump version

> ⚠️ ปุ่มแก้ถูก gate ด้วย `ua.perm` (มีแค่ Administrator) อยู่แล้ว · เปลี่ยน matrix = มีผลกับ user ทุกคนรอบ login ถัดไป
