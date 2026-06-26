# PLAN-v2.9 — QR picker + Scan autofill/lock + Accept ปรับปรุง

> **สถานะ:** เฟส A–F = frontend ล้วน · **ไม่แตะ `gas_code.gs` → ไม่ต้อง redeploy GAS**
> **Goal:** (1) Generate QR เลือกเครื่อง/ทั้งหมด + ขนาด mm · (2) สแกน QR แล้ว autofill + **ล็อก**ฟิลด์ที่รู้แน่ (วันที่/โรงงาน/Area/รหัส+ชื่อเครื่อง/ผู้แจ้ง) เหลือกรอกเฉพาะที่ต้องระบุ · (3) แจ้งซ่อม header ส้ม · (4) รับงานเห็นรูป+ผู้แจ้ง ไม่ต้องพิมพ์ชื่อผู้รับ · (5) **ลบช่อง "ยืนยันชื่อผู้ดำเนินการ" ทุกฟอร์ม → ยึดชื่อ login เสมอ** (เฟส G)
> **Version:** bump `?v=2.8.1` → `?v=2.9` (12 script tags) + `EXPORT_VER` (export.js:120) → `v2.9`

---

## ⛔ กฎที่ต้องคุม
- ทุก commit ผ่าน feature branch → PR → main (main = production auto-deploy)
- `node --check js/<ไฟล์>.js` ทุกไฟล์ที่แก้ ก่อน commit
- ห้ามเปลี่ยนเป็น ES module · classic `<script>` order เดิม · ฟังก์ชันใหม่ = global
- **แก้ js ใดๆ ต้อง bump `?v=`** — เฟสนี้ → `v2.9`
- **ไม่แตะ GAS** — ทุก endpoint ที่ใช้ (`create` รับ `machineId`, `accept`, `getImage`, `getMachines`) มีอยู่แล้ว

## คำตอบ design ที่ยืนยันแล้ว (ห้ามเดาใหม่)
1. Generate QR = **Modal เลือกเครื่องแยก** (checkbox รายเครื่อง + เลือกทั้งหมด + ช่องขนาด mm + ปุ่มสร้าง PDF)
2. ฟิลด์ autofill หลังสแกน = **โชว์ในช่องเดิมแต่ `disabled`** (เห็นค่า แก้ไม่ได้)
3. รูปแจ้ง BD/แจ้งซ่อม = **บังคับ ≥1 รูป (ช่องเดียวเดิม)** — ไม่ต้องทำ multi-photo

## ของเดิมที่มีอยู่แล้ว (ไม่ต้องสร้างใหม่)
- Checklist รายวัน: กะ (`clf-shift`) + ผลตรวจ OK/NG/FIX/NA + **รูปถ่ายรวมขั้นต่ำ 2 รูป** (`clf-overall-photos`, index.html:1180–1187) ครบแล้ว
- `confirmAccept()` ใช้ `currentUser.name` เป็นผู้รับงานอยู่แล้ว (ช่อง `accept-byname` เป็น dead field — ไม่เคยถูกอ่าน)
- record มี `byName` (ผู้แจ้ง) + `imgBefore` (รูป id\|id) — โหลดรูปด้วย `GET ?action=getImage&id=<id>` → `{success,dataUrl}`
- lock/unlock infra ของ popup BD มีแล้ว: `openReportPopup()` (breakdown-report.js:293–295) และ `closeReportModal()` (327–329) re-enable `rm-*` ทุกครั้ง

## ⚠️ ราก mismatch ที่ต้องระวัง (สำคัญต่อ autofill)
- machine master เก็บโรงงานเป็น **`"โรงงาน 1"` / `"โรงงาน 2"`** (breakdown-form.js:57)
- `rm-factory` option **value = `"1"`/`"2"`** (text = `"โรงงาน 1/2"`) → set `.value="โรงงาน 1"` **ไม่ match** → area ไม่ cascade
- → ต้อง normalize: `const facDigit = String(machine.factory).match(/\d/)?.[0] || '';` แล้ว set `rm-factory.value = facDigit`
- `clf-fac` (daily) option value ใช้ชื่อเต็ม → set `clf-fac.value = machine.factory` ตรงๆ (verify ใน preview)
- **บั๊กเดิม:** scan.js daily อ้าง `clf-factory` แต่ id จริง = `clf-fac` → factory ไม่เคยถูกเติม (แก้ในเฟส B)

---

# เฟส A — Generate QR: Modal เลือกเครื่อง + ขนาด mm

**ไฟล์:** `index.html` (modal ใหม่ + เปลี่ยน onclick ปุ่มเดิม), `js/scan.js` (3 ฟังก์ชันใหม่)

## A1. index.html — เปลี่ยนปุ่มเดิมให้เปิด modal
บรรทัด **2478** เดิม:
```html
<button onclick="generateMachineQrPdf(machineMaster.map(m=>m.id||m.machineId||m.machine_id||'').filter(Boolean),40)" class="mms-btn mms-btn-blue text-sm">📱 Generate QR ทุกเครื่อง</button>
```
→ เปลี่ยนเป็น:
```html
<button onclick="openQrPicker()" class="mms-btn mms-btn-blue text-sm">📱 Generate QR</button>
```

## A2. index.html — เพิ่ม modal ใหม่ (วางต่อจาก `accept-modal` ปิด ~บรรทัด 1931)
```html
<!-- ==================== QR PICKER MODAL ==================== -->
<div id="qr-picker-modal" class="modal-bg hidden">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        <div class="bg-blue-600 px-6 py-4 flex-shrink-0">
            <h2 class="text-lg font-bold text-white flex items-center gap-2">📱 Generate QR เครื่องจักร</h2>
            <p class="text-xs text-blue-200 mt-0.5">เลือกเครื่อง + กำหนดขนาด แล้วสร้าง PDF</p>
        </div>
        <div class="px-6 py-3 border-b border-gray-100 flex items-center gap-4 flex-shrink-0">
            <label class="flex items-center gap-2 text-sm font-bold text-gray-700 cursor-pointer">
                <input type="checkbox" id="qr-pick-all" onchange="qrPickerToggleAll(this)" class="w-4 h-4"> เลือกทั้งหมด
            </label>
            <span id="qr-pick-count" class="text-xs text-gray-500">เลือก 0 เครื่อง</span>
            <div class="ml-auto flex items-center gap-2">
                <label class="text-xs font-bold text-gray-600">ขนาด</label>
                <input id="qr-pick-size" type="number" min="15" max="100" value="40"
                       class="w-16 border border-gray-300 rounded-lg px-2 py-1 text-sm text-center outline-none focus:border-blue-500">
                <span class="text-xs text-gray-500">mm</span>
            </div>
        </div>
        <div id="qr-pick-list" class="p-4 overflow-y-auto flex-1 space-y-1"></div>
        <div class="flex gap-3 justify-end px-6 py-4 border-t border-gray-100 flex-shrink-0">
            <button onclick="closeQrPicker()" class="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900">ยกเลิก</button>
            <button onclick="qrPickerGenerate()" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-full text-sm">📄 สร้าง PDF</button>
        </div>
    </div>
</div>
```

## A3. js/scan.js — เพิ่ม 3 ฟังก์ชัน (ต่อท้ายไฟล์ หลัง `generateMachineQrPdf`)
```javascript
// ---- QR Picker modal ----
function openQrPicker() {
    const list = typeof machineMaster !== 'undefined' ? machineMaster : [];
    const box  = document.getElementById('qr-pick-list');
    if (!list.length) { showToast('⚠️ ยังไม่มีข้อมูลเครื่องจักร', 'warn'); return; }
    const esc = s => String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    box.innerHTML = list.map(m => {
        const id = m.id || m.machineId || m.machine_id || '';
        if (!id) return '';
        return `<label class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer text-sm">
            <input type="checkbox" class="qr-pick-cb w-4 h-4" value="${esc(id)}" onchange="qrPickerCount()">
            <span class="font-bold text-gray-800">${esc(m.name||id)}</span>
            <span class="text-gray-400 text-xs">${esc(id)}</span>
            <span class="ml-auto text-gray-400 text-xs">${esc(m.factory||'')} ${esc(m.area||'')}</span>
        </label>`;
    }).join('');
    document.getElementById('qr-pick-all').checked = false;
    qrPickerCount();
    document.getElementById('qr-picker-modal').classList.remove('hidden');
}
function closeQrPicker() { document.getElementById('qr-picker-modal').classList.add('hidden'); }
function qrPickerToggleAll(cb) {
    document.querySelectorAll('.qr-pick-cb').forEach(x => { x.checked = cb.checked; });
    qrPickerCount();
}
function qrPickerCount() {
    const n = document.querySelectorAll('.qr-pick-cb:checked').length;
    document.getElementById('qr-pick-count').textContent = `เลือก ${n} เครื่อง`;
}
function qrPickerGenerate() {
    const ids = [...document.querySelectorAll('.qr-pick-cb:checked')].map(x => x.value);
    if (!ids.length) { showToast('⚠️ เลือกเครื่องอย่างน้อย 1 เครื่อง', 'warn'); return; }
    const size = parseFloat(document.getElementById('qr-pick-size').value) || 40;
    closeQrPicker();
    generateMachineQrPdf(ids, size);   // clamp 15–100 อยู่ในฟังก์ชันแล้ว
}
```
> หมายเหตุ: เพิ่ม `onchange="qrPickerCount()"` ใน checkbox รายเครื่อง (มีใน template A3) เพื่อให้ตัวนับอัปเดต — และ A2 มี `onchange="qrPickerToggleAll(this)"` ที่หัว

**verify A:** `node --check js/scan.js` · preview → Machine list → 📱 Generate QR → เลือก 2–3 เครื่อง / เลือกทั้งหมด → ตั้งขนาด 50mm → สร้าง PDF ได้ถูกต้อง

---

# เฟส B — สแกน QR: autofill + ล็อกฟิลด์

**ไฟล์:** `js/scan.js` (`_scanGo` daily + bd/adj), `js/breakdown-report.js` (`submitReportPopup` ส่ง machineId, `openReportPopup`/`closeReportModal` lock list), `index.html` (เพิ่มช่องรหัสเครื่องใน popup BD)

## B1. index.html — เพิ่มช่อง "รหัสเครื่องจักร" (locked) ใน report popup
ใต้ `rm-machine` (หลังบรรทัด 2160 `<p ...>รหัสเครื่องจักรจะระบุตอนรับงาน...</p>`) เพิ่ม:
```html
<div id="rm-machineid-wrap" class="hidden mt-2">
    <label class="text-xs font-bold text-gray-600 block mb-1">รหัสเครื่องจักร (จาก QR)</label>
    <input id="rm-machine-id" type="text" disabled
           class="w-full border border-gray-200 bg-gray-100 text-gray-600 rounded-lg px-3 py-2 outline-none">
</div>
```
> แสดงเฉพาะตอนสแกน (B3 สั่ง `.remove('hidden')`) · ตอนแจ้งเอง (manual) ซ่อนไว้

## B2. js/breakdown-report.js — `submitReportPopup` ส่ง machineId จริง + `openReportPopup` reset
- บรรทัด **376** เดิม `machineName: machine, factory, area, machineId: '', line,`
  → `machineName: machine, factory, area, machineId: (document.getElementById('rm-machine-id')?.value || ''), line,`
- ใน `openReportPopup()` (หลังบรรทัด 299 ที่ clear rm-* fields) เพิ่ม reset ช่องรหัส + ซ่อน wrap:
```javascript
const mid = document.getElementById('rm-machine-id'); if (mid) mid.value = '';
document.getElementById('rm-machineid-wrap')?.classList.add('hidden');
```
- เพิ่ม `'rm-machine-id'` เข้า lock-list ทั้ง 2 จุด (re-enable) — บรรทัด 293 และ 327:
  `['rm-machine','rm-factory','rm-area','rm-line','rm-date','rm-time','rm-machine-id'].forEach(...)`

## B3. js/scan.js — `_scanGo` สาขา bd/adj: autofill วันที่/รหัส + ล็อก
แทนที่บล็อกใน `else if (type === 'bd' || type === 'adj')` (บรรทัด 76–97) ด้วย:
```javascript
} else if (type === 'bd' || type === 'adj') {
    const eventType = type === 'adj' ? 'Adjustment' : 'Breakdown';
    if (typeof openReportPopup === 'function') openReportPopup();
    setTimeout(() => {
        const facDigit = String(factory).match(/\d/)?.[0] || '';   // "โรงงาน 1" → "1"
        const fFac  = document.getElementById('rm-factory');
        const fArea = document.getElementById('rm-area');
        const fMach = document.getElementById('rm-machine');
        const fDate = document.getElementById('rm-date');
        const fMid  = document.getElementById('rm-machine-id');
        if (fFac && facDigit) { fFac.value = facDigit; fFac.dispatchEvent(new Event('change')); }
        if (fMach) fMach.value = machineName;
        if (fDate) fDate.value = new Date().toISOString().slice(0,10);   // วันนี้
        if (fMid && machineId) { fMid.value = machineId; document.getElementById('rm-machineid-wrap')?.classList.remove('hidden'); }
        // area cascade หลัง factory change — set ใน setTimeout ซ้อน
        setTimeout(() => { if (fArea && area) fArea.value = area; lockScanFields(); }, 350);
        // eventType + notice
        if (typeof _applyReportEventType === 'function') _applyReportEventType(eventType);
        const notice = document.getElementById('rm-qr-notice');
        const ntext  = document.getElementById('rm-qr-notice-text');
        if (notice) notice.classList.remove('hidden');
        if (ntext)  ntext.textContent = `สแกน QR — ${machineName} · เหตุการณ์: ${eventType==='Adjustment'?'แจ้งซ่อม (Adjustment)':'Breakdown'}`;
    }, 250);
}
```
เพิ่มฟังก์ชัน helper (ต่อท้าย `_scanGo` หรือบนสุดของไฟล์):
```javascript
function lockScanFields() {   // ล็อกเฉพาะที่ autofill จาก QR — เหลือ rm-time / rm-problem / รูป ให้กรอก
    ['rm-machine','rm-factory','rm-area','rm-date','rm-machine-id'].forEach(id => {
        const el = document.getElementById(id); if (el) el.disabled = true;
    });
}
```
> ผู้แจ้ง = `currentUser.name` (auto อยู่แล้วใน submit — มี notice "ผู้แจ้งบันทึกจากชื่อที่เข้าสู่ระบบ") → ไม่มีช่องให้แก้อยู่แล้ว ✅

## B4. js/scan.js — `_scanGo` สาขา daily: แก้บั๊ก id + วันที่ + ล็อก
แทนที่บล็อก `if (type === 'daily')` (บรรทัด 62–74) ด้วย:
```javascript
if (type === 'daily') {
    if (typeof switchTab === 'function') switchTab('cl-form');
    setTimeout(() => {
        const fDate = document.getElementById('clf-date');
        const fFac  = document.getElementById('clf-fac');      // ← แก้บั๊ก: เดิมอ้าง clf-factory
        const fArea = document.getElementById('clf-area');
        const fMach = document.getElementById('clf-machine');
        const fInsp = document.getElementById('clf-inspector');
        if (fDate) fDate.value = new Date().toISOString().slice(0,10);
        if (fFac  && factory)   { fFac.value  = factory;  fFac.dispatchEvent(new Event('change')); }
        if (fInsp && byName)      fInsp.value = byName;
        setTimeout(() => { if (fArea && area) { fArea.value = area; fArea.dispatchEvent(new Event('change')); } }, 350);
        setTimeout(() => {
            if (fMach && machineId) { fMach.value = machineId; fMach.dispatchEvent(new Event('change')); }
            // ล็อกหลัง cascade เสร็จ
            ['clf-date','clf-fac','clf-area','clf-machine','clf-inspector'].forEach(id => {
                const el = document.getElementById(id); if (el) el.disabled = true;
            });
        }, 750);
    }, 200);
}
```
> ⚠️ ต้องปลดล็อกเมื่อเริ่มฟอร์มใหม่ (ไม่ผ่าน QR) — ดู B5

## B5. js/checklist-core.js — ปลดล็อก clf-* ตอน reset ฟอร์ม
หา `switchTab('cl-form')` / จุดเริ่มฟอร์มรายวัน (เช่นปุ่ม "ตรวจรายวัน" ที่ cl-hub) — ในฟังก์ชันที่เปิดฟอร์มเปล่า ให้เพิ่มต้นฟังก์ชัน:
```javascript
['clf-date','clf-fac','clf-area','clf-machine','clf-inspector'].forEach(id => {
    const el = document.getElementById(id); if (el) el.disabled = false;
});
```
> หาในเฟสทำจริง: ฟังก์ชันที่ผูกปุ่มเปิดฟอร์มรายวันจาก hub (grep `cl-form` ใน checklist-core.js) — ถ้าใช้ฟังก์ชันร่วม ให้ปลดล็อกที่นั่น เพื่อกัน field ค้าง disabled จากการสแกนรอบก่อน

**verify B:**
- `node --check js/scan.js js/breakdown-report.js js/checklist-core.js`
- preview → `?mode=scan&m=<id จริง>` → login → เลือก "แจ้ง Breakdown":
  - โรงงาน/Area/ชื่อเครื่อง/รหัสเครื่อง/วันที่ ถูกเติม + **เทา กดแก้ไม่ได้** · เหลือ เวลา/อาการ/รูป ให้กรอก
  - แจ้ง → record มี `machineId` ตรงกับที่สแกน
- เลือก "Checklist รายวัน": วันที่/โรงงาน/Area/เครื่อง/ผู้ตรวจ เติม+ล็อก · เหลือ กะ/ผลตรวจ/รูป ≥2
- เปิดฟอร์มรายวันปกติ (ไม่ผ่าน QR) → ฟิลด์ **แก้ได้ตามปกติ** (ไม่ค้าง disabled)

---

# เฟส C — แจ้งซ่อม (Adjustment): header สีส้ม

**ไฟล์:** `index.html` (เพิ่ม id ที่ header div), `js/breakdown-report.js` (`_applyReportEventType` สลับสี)

## C1. index.html — เพิ่ม id ที่แถบหัว popup
บรรทัด **2142** เดิม `<div class="bg-red-600 px-6 py-4 flex-shrink-0">`
→ `<div id="rm-header" class="bg-red-600 px-6 py-4 flex-shrink-0">`

## C2. js/breakdown-report.js — `_applyReportEventType` สลับสี (บรรทัด 311–318)
แทนที่ทั้งฟังก์ชันด้วย:
```javascript
function _applyReportEventType(et) {
    window._scanEventType = et;
    const isAdj = et === 'Adjustment';
    const t = document.getElementById('rm-modal-title');
    const b = document.getElementById('rm-submit');
    const h = document.getElementById('rm-header');
    if (t) t.textContent = isAdj ? '🔧 แจ้งซ่อม (Adjustment)' : '🚨 แจ้ง Breakdown';
    if (b) {
        b.textContent = isAdj ? '🔧 แจ้งซ่อม' : '🚨 แจ้ง Breakdown';
        b.classList.toggle('bg-orange-500', isAdj);  b.classList.toggle('hover:bg-orange-600', isAdj);
        b.classList.toggle('bg-red-500', !isAdj);     b.classList.toggle('hover:bg-red-600', !isAdj);
    }
    if (h) { h.classList.toggle('bg-orange-500', isAdj); h.classList.toggle('bg-red-600', !isAdj); }
}
```
> `openReportPopup()` (default Breakdown) reset title/button เป็นแดงอยู่แล้ว — แต่ต้อง reset สี header ด้วย: ใน `openReportPopup()` ที่ set title/button (บรรทัด 303–306) เพิ่ม:
> ```javascript
> document.getElementById('rm-header')?.classList.add('bg-red-600');
> document.getElementById('rm-header')?.classList.remove('bg-orange-500');
> ```

**verify C:** BD hub → การ์ด "🔧 แจ้งซ่อม" → popup หัว **ส้ม** + ปุ่มส้ม · การ์ด "แจ้ง Breakdown" → หัว **แดง** · สแกน QR เลือกแจ้งซ่อม → ส้ม

---

# เฟส D — บังคับรูป ≥1 ตอนแจ้ง BD/แจ้งซ่อม

**ไฟล์:** `js/breakdown-report.js` (`submitReportPopup` validation)

## D1. เพิ่ม validation ก่อนสร้าง data (หลังบรรทัด 370 `if (!problem) ...`)
```javascript
if (!imgList.before.length) return showToast('⚠️ กรุณาแนบรูปอย่างน้อย 1 รูป', 'error');
```
> `imgList.before` ถูกเซ็ตใน `rmSetImage` (1 รูป/ช่อง) — ใช้ได้ทั้ง Breakdown และ Adjustment

**verify D:** แจ้งโดยไม่แนบรูป → toast "กรุณาแนบรูปอย่างน้อย 1 รูป" · แนบ 1 รูป → ผ่าน

---

# เฟส E — รับงาน: เห็นรูป + ผู้แจ้ง + ไม่ต้องพิมพ์ชื่อผู้รับ

**ไฟล์:** `index.html` (ถอดช่อง `accept-byname`), `js/breakdown-report.js` (`acceptRecord` เพิ่มรูป+ผู้แจ้ง, ลบ reset byname)

## E1. index.html — ถอดช่องกรอกชื่อผู้รับ (บรรทัด 1916–1918)
ลบ 3 บรรทัด:
```html
<label class="text-xs font-bold text-gray-500 block mb-1">ชื่อผู้รับงาน <span class="text-red-500">*</span></label>
<input id="accept-byname" type="text" placeholder="กรอกชื่อ-นามสกุลผู้รับงาน"
       class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500 transition-colors mb-4">
```
แทนด้วยแถบยืนยันผู้รับ (อ้างอิง user ที่ login):
```html
<div class="bg-orange-50 border border-orange-200 rounded-lg px-4 py-2.5 mb-4 text-sm">
    👤 ผู้รับงาน: <strong id="accept-byuser" class="text-orange-700"></strong>
</div>
```
> ปุ่ม "✅ ยืนยันรับงาน" คงเดิม → เรียก `confirmAccept()` ที่ใช้ `currentUser.name` อยู่แล้ว

## E2. js/breakdown-report.js — `acceptRecord` เพิ่มผู้แจ้ง + รูป, ลบ reset byname
- **ลบ** บรรทัด 183 `document.getElementById('accept-byname').value = '';`
- **เพิ่ม** set ชื่อผู้รับจาก login (หลัง `_acceptItem = item;`):
```javascript
const _byu = document.getElementById('accept-byuser'); if (_byu) _byu.textContent = currentUser.name || '—';
```
- ใน `accept-detail` innerHTML (บรรทัด 185–193) **เพิ่มแถวผู้แจ้ง** ต่อจากแถว "ปัญหาที่พบ":
```javascript
<div class="grid grid-cols-3 gap-1"><span class="text-gray-500">ผู้แจ้ง</span><span class="col-span-2 font-bold text-blue-700">${esc(item.byName)||'—'}</span></div>
```
- **เพิ่มกล่องรูป** ใต้ `accept-detail` — ต่อท้าย string innerHTML (ก่อนปิด `</div>` ของ accept-detail) เพิ่ม:
```javascript
<div id="accept-photo-wrap" class="mt-3 hidden">
  <p class="text-xs text-gray-500 mb-1">รูปที่แจ้ง</p>
  <img id="accept-photo" class="w-full max-h-56 object-contain rounded-lg border border-gray-200 bg-gray-50">
</div>
```
- **โหลดรูป** (หลัง set innerHTML, ก่อน `.remove('hidden')` ของ modal บรรทัด 194) — async fire-and-forget:
```javascript
const firstImg = String(item.imgBefore||'').split('|').map(s=>s.trim()).filter(Boolean)[0];
if (firstImg) {
    fetch(`${GAS_URL}?action=getImage&id=${encodeURIComponent(firstImg)}`)
        .then(r => r.json())
        .then(j => { if (j && j.success && j.dataUrl) {
            document.getElementById('accept-photo').src = j.dataUrl;
            document.getElementById('accept-photo-wrap').classList.remove('hidden');
        }})
        .catch(()=>{});
}
```
> `confirmAccept()` ไม่ต้องแก้ — ใช้ `currentUser.name` + guard login อยู่แล้ว (บรรทัด 202–204)

**verify E:** records → งานสถานะ "รอรับงาน" ที่มีรูป → กด "✅ รับงาน":
- modal โชว์ **ผู้แจ้ง** + **รูปที่แจ้ง** · ไม่มีช่องให้พิมพ์ชื่อผู้รับ · แถบ "👤 ผู้รับงาน: <ชื่อที่ login>"
- กดยืนยัน → รับงานสำเร็จ อ้างชื่อ login · งานที่ไม่มีรูป → กล่องรูปซ่อน ไม่ค้าง

---

# เฟส G — ลบช่อง "ยืนยันชื่อผู้ดำเนินการ" ทุกฟอร์ม → ยึดชื่อ login

> **ออดิตแล้ว:** ทุก submit ใช้ `currentUser.name` อยู่แล้ว — ช่องพิมพ์ชื่อเป็น **dead field** (ยกเว้น `clf-inspector` ที่ยังแก้ได้). รูปแบบที่ถูกต้องอ้างจาก `cancel-modal` (notice "👤 ผู้ดำเนินการ: บันทึกจากชื่อที่เข้าสู่ระบบอัตโนมัติ", index.html:577)
> **คงไว้ (นอกขอบเขต — ไม่ใช่ identity):** `confirm()` กันงานทำลายข้อมูล — machines.js:272/285/374 (save/restore/import overwrite), user-access.js:120/179 (เปลี่ยน level / ลบ user). **ห้ามลบ** เพราะกัน action ที่กู้คืนไม่ได้

## ตารางออดิต — ช่องยืนยันชื่อทั้งหมด
| # | field id | ฟอร์ม | สถานะ | การแก้ |
|---|----------|-------|-------|--------|
| 1 | `confirm-name` | confirm-modal (ฟอร์มเต็ม: แจ้ง/manual/แก้ไข/**ปิดงาน**/whyedit) | **Dead** — `confirmAddData()` ใช้ currentUser.name ไม่อ่าน field | G1 |
| 2 | `accept-byname` | accept-modal (รับงาน) | **Dead** — `confirmAccept()` ใช้ currentUser.name | **อยู่ในเฟส E แล้ว** |
| 3 | `clf-inspector` | Checklist รายวัน | **Editable** — default login แต่แก้ได้ | G2 |
| 4 | `bdk-byname` | panel-bd-kiosk | **Dead code ทั้ง panel** | G3 |

## G1. confirm-modal — ลบ confirm-name (กระทบทุก stage รวมปิดงาน)
**index.html:548–552** แทน block input ด้วย notice (คง role label dynamic):
```html
<div class="mb-5">
    <p class="text-xs text-gray-500">👤 <span id="confirm-name-label">ผู้ดำเนินการ</span>: บันทึกจากชื่อที่เข้าสู่ระบบอัตโนมัติ</p>
</div>
```
**js/breakdown-form.js:820–822** แทน 3 บรรทัด (ลบการ set value) ด้วย:
```javascript
document.getElementById('confirm-name-label').textContent = nameL;
```
> `confirmAddData()` (breakdown-form.js:849) ใช้ `currentUser.name` อยู่แล้ว — ไม่ต้องแก้ logic

## G2. clf-inspector — ล็อกเป็นชื่อ login (Checklist รายวัน)
**index.html:1140** เพิ่ม `readonly` + สไตล์ล็อก:
```html
<input type="text" id="clf-inspector" readonly placeholder="—"
       class="w-full border border-gray-200 bg-gray-100 text-gray-600 rounded-lg px-3 py-2 text-sm focus:outline-none">
```
> checklist-core.js:503 ตั้ง `currentUser.name` ตอนเปิดฟอร์มอยู่แล้ว — คงไว้ · save อ่านจาก field ที่ล็อก = ค่า login เดิม · เข้ากันได้กับ `disabled` ตอนสแกน (เฟส B)

## G3. ลบ panel-bd-kiosk (dead code ทั้ง block)
**index.html:785–826** ลบ `<div id="panel-bd-kiosk" ...>...</div>` ทั้งก้อน — `submitBdKiosk()`/`bdkSetImage()` ไม่มีใน js (orphan ตั้งแต่ v2.7 แทนด้วย scan flow) → ลบ `bdk-byname` ไปในตัว
> verify: grep `bd-kiosk` เหลือ 0 · ไม่มี `switchTab('bd-kiosk')` ที่ใด

**verify G:**
- `node --check js/breakdown-form.js`
- ฟอร์มเต็ม (แจ้ง/manual/**ปิดงาน**) → กดบันทึก → confirm-modal **ไม่มีช่องพิมพ์ชื่อ** เหลือ notice → บันทึกได้ ชื่อ = login
- Checklist รายวัน → ช่องผู้ตรวจ = ชื่อ login **แก้ไม่ได้**
- ไม่มี panel-bd-kiosk ค้างใน DOM

---

# เฟส F — Version bump
- `index.html` — 12 script tags `?v=2.8.1` → `?v=2.9` (replace_all)
- `js/export.js:120` — `const EXPORT_VER = 'v2.8.1'` → `'v2.9'`

---

## Verify รวม (ก่อน PR)
1. `node --check` ทุกไฟล์ที่แก้: `scan.js`, `breakdown-report.js`, `breakdown-form.js`, `checklist-core.js`, `export.js`
2. preview `localhost:3456` — รันครบ flow เฟส A–E (ตาม verify ย่อย)
3. badge มุมล่างขวา = `v2.9`
4. **ยืนยันไม่มี diff ใน `gas_code.gs`** (`git diff --stat` ต้องไม่มี gas_code.gs)

## Branch / PR
- branch ใหม่จาก `main` (หลัง v2.8 merge แล้ว): `git checkout main && git pull mms main && git checkout -b feature/v2.9-qr-autofill`
- commit แยกตามเฟส (A / B / C / D / E / F) → `git push mms feature/v2.9-qr-autofill` → PR → main
- **ไม่ต้อง redeploy GAS** — ระบุใน PR body ให้ชัด

## หมายเหตุ execution (สำหรับ Sonnet)
- ฟังก์ชันใหม่ทุกตัว = **global** (classic script) ห้ามใส่ใน IIFE/module
- timing ของ cascade (setTimeout 350/750ms) อาจต้องจูนถ้าเครื่องช้า — verify ใน preview ว่า area/machine ถูกเติมก่อนล็อก
- ถ้า `clf-fac.value = factory` ไม่ match option (preview แล้ว area ไม่ขึ้น) → ลอง normalize เป็น digit เหมือน rm-factory
