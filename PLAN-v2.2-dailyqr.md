# MMS v2.2 — Daily Check QR Kiosk Implementation Plan

> **For agentic workers:** รันทีละ Task. Steps เป็น checkbox (`- [ ]`).
> **โมเดล:** Opus = วางแผน (ไฟล์นี้), **Sonnet = ลงมือ**. ([[opus-planning-only]])
> **เลขบรรทัด = ค่าประมาณ** — ก่อนแก้ทุก Task ให้ `Grep` หา anchor (ชื่อฟังก์ชัน/ข้อความ) ก่อน เพราะการแก้ก่อนหน้าเลื่อนบรรทัด.

**Goal:** เปลี่ยน concept Daily Check เป็นระบบ QR — สแกน QR ของเครื่อง → เข้าฟอร์มที่กรอกข้อมูลเครื่องครบแล้ว เหลือใส่ชื่อผู้ตรวจ + กะ + รายการตรวจ + รูปรวมบังคับ ≥2 รูป → บันทึกได้โดยไม่ต้อง login. เพิ่มหน้า Generate QR เป็น PDF (เลือกหลายเครื่อง, ขนาด mm, จัดลง A4).

**Architecture:** Single `index.html` (Tailwind CDN + vanilla JS) + `gas_code.gs` (Apps Script Web App) บน GitHub Pages. การยืนยันตัวตน QR ใช้ **token ฝังใน URL ของ QR** — client แค่ forward token ไป GAS; GAS ตรวจ token (เฉพาะ `type==='daily'`) อนุญาตบันทึกโดยไม่ต้องมีรหัส role.

**Tech Stack:** HTML, Tailwind (CDN), vanilla JS, jsPDF (โหลดอยู่แล้ว), **qrcode-generator** (เพิ่มใหม่), Google Apps Script.

---

## คำตอบ design ที่ยืนยันแล้ว (ห้ามถามซ้ำ)
1. **QR submit auth = Token ฝังใน QR.** GAS รับ `data.token`; ถ้า token ตรง `DAILY_TOKEN` และ `type==='daily'` → บันทึกได้โดยไม่ต้องมี role. Client ไม่ hardcode token — อ่านจาก URL param `t` แล้วส่งต่อ.
2. **รูปถ่าย = แทนที่ของเดิม.** Daily form: เอา 📷 รายหัวข้อออก, เพิ่ม "รูปถ่ายรวม" 1 กล่อง บังคับ ≥2 รูป. **PM form คงเดิม** (per-item photo ไม่แตะ).
3. กะ = เช้า/ดึก เป็น field บังคับใน Daily check.

## ข้อเท็จจริงจากโค้ดจริง (ตรวจแล้ว)
- `ROLE_PW` (gas:16) มีแค่ `engineer123456`/`cpram123456`. ไม่มี role operator.
- `saveChecklist` (gas:202) บังคับ `const role = ROLE_PW[pw]; if(!role) error`. **ต้องแก้จุดนี้ให้รับ token.**
- `_Checklists` header 17 คอลัมน์ (gas:210): `tracking,type,date,shift,factory,area,machineId,machineName,inspector,remark,ok,ng,fix,na,overallResult,resultsJSON,createdAt`. **`shift` มีอยู่แล้ว (index 3)** — client ส่ง `'-'` (idx:5747). **ไม่ต้องเพิ่มคอลัมน์**: รูปรวมเก็บเป็น result entry พิเศษใน `resultsJSON`.
- `saveChecklistItemImgs` (gas:584) อัปโหลดรูปใน `results[].images` ลง Drive อยู่แล้ว → รูปรวมที่ฝังเป็น result entry จะถูกอัปโหลดด้วย logic เดิม.
- App init (idx:5290 `DOMContentLoaded`) **ไม่มี URL routing** — เปิดมา `switchTab('home')` เสมอ. ต้องเพิ่ม parse param.
- Daily form items table (idx:921–940) มีคอลัมน์ 📷 (idx:932). รูปต่อ item เก็บใน `_clfItemImages` (idx:5642 `clfItemPickImage`).
- `clfGetItems` (idx:5578), `clfRenderItems` (idx:5611), `saveChecklistForm` (idx:5690), `saveChecklistConfirm` (idx:5718).
- Schedule daily toolbar = `clsc-daily-view` (idx:1134), ปุ่ม tab `clsc-tab-daily` (idx:1131).
- `clMachinesFor(fac,area)` (idx:5380), `clResolveDailyItems` (มีแล้วจาก v2.1).
- ยังไม่มี QR lib (มีแค่ html2canvas idx:10, jsPDF idx:11).

---

## ลำดับการทำ (สำคัญ)
**PHASE A (GAS) ทำก่อน → redeploy → ค่อยทำ B–E.** ถ้าทำ frontend submit ผ่าน token ก่อน redeploy จะได้ error "ต้องเข้าสู่ระบบก่อน".
ลำดับ frontend: **B (shift) → C (รูปรวม) → D (kiosk deep-link) → E (Generate QR PDF)**. D ใช้ฟอร์ม daily ที่ B/C ปรับแล้ว; E ใช้ URL format จาก D.

---

# PHASE A — Backend (gas_code.gs) — redeploy หลังจบ

### Task A1: เพิ่ม DAILY_TOKEN + ให้ saveChecklist รับ token (daily only)

**Files:** Modify `gas_code.gs` — ใกล้ `const ROLE_PW` (~16) และ `if (data.action === 'saveChecklist')` (~202).

- [ ] **Step 1:** เพิ่มค่าคงที่ใต้ `ROLE_PW` (gas:19):
```javascript
// Token สำหรับ Daily Check ผ่าน QR (ฝังใน URL ของ QR เท่านั้น — เปลี่ยนได้ตามต้องการ)
const DAILY_TOKEN = 'cprdaily2026';
```

- [ ] **Step 2:** ใน branch `saveChecklist` แก้บล็อกตรวจ auth (gas:203–204) จาก:
```javascript
      const role = ROLE_PW[(data.pw || '').trim()];
      if (!role) return jsonOut({ success: false, error: 'ต้องเข้าสู่ระบบก่อน' });
```
เป็น:
```javascript
      const role    = ROLE_PW[(data.pw || '').trim()];
      const tokenOk = String(data.token || '') === DAILY_TOKEN && (data.type === 'daily');
      if (!role && !tokenOk) return jsonOut({ success: false, error: 'ต้องเข้าสู่ระบบก่อน' });
```

- [ ] **Step 3 (verify หลัง redeploy):** POST `{action:'saveChecklist', type:'daily', token:'cprdaily2026', machineId:'TEST', inspector:'x', results:[], ok:0,ng:0,fix:0,na:0, overallResult:'PASS', factory:'โรงงาน 1'}` (ไม่มี pw) → ต้องได้ `{success:true, tracking:'CL-...'}`. ลอง token ผิด → `'ต้องเข้าสู่ระบบก่อน'`. (ลบแถว TEST ออกจาก `_Checklists` หลังทดสอบ.)

> **ไม่ต้องแก้ schema.** รูปรวมจะมาเป็น entry ใน `data.results` (Task C) → `saveChecklistItemImgs` อัปโหลดให้เอง. `shift` มีคอลัมน์อยู่แล้ว.

---

### Task A-final: Redeploy GAS
- [ ] script.google.com → วาง `gas_code.gs` ใหม่ → **Deploy → Manage deployments → Edit (ดินสอ) → Version: New version → Deploy** (URL เดิมไม่เปลี่ยน).
- [ ] **Verify:** ทำ A1 Step 3. ถ้า token ถูกแล้วยังได้ "ต้องเข้าสู่ระบบก่อน" = deploy ค้าง ([[gas-deploy-stale-root-cause]]).

---

# PHASE B — Shift selector (เช้า/ดึก) ในฟอร์ม Daily

### Task B1: เพิ่ม UI เลือกกะ + ส่งค่า

**Files:** Modify `index.html` — ฟอร์ม checklist (~879–913), `goClForm` (~5474 reset), `saveChecklistConfirm` (~5747 ส่งค่า).

- [ ] **Step 1 (UI):** ในกล่องหัวฟอร์ม (หลังช่อง "ผู้ตรวจสอบ" idx:909–912) เพิ่ม:
```html
<div id="clf-shift-wrap" class="mt-3">
    <label class="text-xs font-bold text-gray-500 block mb-1">กะ <span class="text-red-500">*</span></label>
    <div class="flex gap-2">
        <label class="flex-1"><input type="radio" name="clf-shift" value="เช้า" class="peer hidden">
            <span class="block text-center px-3 py-2 rounded-lg border border-gray-200 text-sm cursor-pointer peer-checked:bg-green-100 peer-checked:border-green-400 peer-checked:text-green-700 peer-checked:font-bold">🌅 กะเช้า</span></label>
        <label class="flex-1"><input type="radio" name="clf-shift" value="ดึก" class="peer hidden">
            <span class="block text-center px-3 py-2 rounded-lg border border-gray-200 text-sm cursor-pointer peer-checked:bg-indigo-100 peer-checked:border-indigo-400 peer-checked:text-indigo-700 peer-checked:font-bold">🌙 กะดึก</span></label>
    </div>
</div>
```
> แสดงเฉพาะ daily (PM ไม่ใช้กะ): ใน `goClForm(type)` toggle `clf-shift-wrap` ตาม `type==='daily'`.

- [ ] **Step 2 (toggle + reset):** ใน `goClForm` (idx:5486 หลัง set date) เพิ่ม:
```javascript
document.getElementById('clf-shift-wrap').classList.toggle('hidden', type !== 'daily');
document.querySelectorAll('input[name="clf-shift"]').forEach(r => r.checked = false);
// default กะตามเวลา: 06:00–17:59 = เช้า, อื่น = ดึก
const hr = new Date().getHours();
const defShift = (hr >= 6 && hr < 18) ? 'เช้า' : 'ดึก';
const dr = document.querySelector(`input[name="clf-shift"][value="${defShift}"]`); if (dr) dr.checked = true;
```

- [ ] **Step 3 (validate + ส่ง):** ใน `saveChecklistForm` (idx:5694 หลัง check inspector) เพิ่มเฉพาะ daily:
```javascript
if (type === 'daily' && !document.querySelector('input[name="clf-shift"]:checked')) { showToast('กรุณาเลือกกะ', 'warn'); return; }
```
ใน `saveChecklistConfirm` (idx:5747) เปลี่ยน `shift:'-'` เป็น:
```javascript
shift: (document.querySelector('input[name="clf-shift"]:checked')?.value || '-'),
```

- [ ] **Step 4 (verify):** เปิด daily form → เห็นปุ่มกะ (default ตามเวลา); PM form → ไม่มีปุ่มกะ. บันทึก daily → ดู `_Checklists` คอลัมน์ `shift` = "เช้า"/"ดึก".

---

# PHASE C — รูปถ่ายรวมบังคับ ≥2 รูป (แทน per-item ใน Daily)

### Task C1: เอา 📷 รายหัวข้อออก (เฉพาะ daily) + เพิ่มกล่องรูปรวม

**Files:** Modify `index.html` — items table header (~924–934), `clfRenderItems` (~5611), เพิ่ม HTML กล่องรูปรวม (ใต้ตาราง ~941), state ใหม่.

- [ ] **Step 1 (state):** ใกล้ `_clfItemImages` (idx:5616/5620) เพิ่ม `let _clfOverallImages = [];`

- [ ] **Step 2 (ซ่อนคอลัมน์ 📷 ใน daily):** ใน `clfRenderItems` (idx:5611) — คอลัมน์ 📷 ของ item ให้ render เฉพาะเมื่อ `type!=='daily'`. วิธีง่าย: อ่าน type ต้นฟังก์ชัน `const isDaily = (document.getElementById('clf-type')?.value==='daily');` แล้วในแต่ละแถว เปลี่ยน `<td>...ปุ่ม 📷...</td>` เป็น render เฉพาะ `!isDaily`; ถ้า daily ใส่ `<td class="px-2 py-2"></td>` (คงคอลัมน์ไว้ให้ตารางตรง) หรือซ่อนทั้ง column ด้วยการเพิ่ม class. **เลือกแบบง่าย:** คง `<td>` ว่างไว้เมื่อ daily.
  - header 📷 (idx:932) ปล่อยไว้ได้ (ว่างใต้หัวเมื่อ daily) — หรือถ้าจะเนียน เพิ่ม id ให้ `<th>📷</th>` แล้ว toggle hidden ตาม type ใน `clfRenderItems`.

- [ ] **Step 3 (กล่องรูปรวม HTML):** เพิ่มใต้ `mms-card` ของตาราง (หลัง idx:941 ก่อน remark card) — แสดงเฉพาะ daily:
```html
<div id="clf-overall-photos" class="mms-card p-5 mb-4 hidden">
    <div class="flex items-center justify-between mb-3">
        <label class="text-sm font-bold text-gray-700">📷 รูปถ่ายรวม <span class="text-red-500">*</span> <span class="text-xs font-normal text-gray-400">(ขั้นต่ำ 2 รูป)</span></label>
        <span id="clf-overall-count" class="text-xs font-bold text-gray-500">0 รูป</span>
    </div>
    <div id="clf-overall-thumbs" class="flex flex-wrap gap-2 mb-3"></div>
    <button type="button" onclick="clfOverallPick()" class="mms-btn mms-btn-green text-sm">+ เพิ่มรูป</button>
</div>
```

- [ ] **Step 4 (toggle กล่อง):** ใน `clfRenderItems` ตอนมี machineId — `document.getElementById('clf-overall-photos').classList.toggle('hidden', !isDaily)`. และ reset `_clfOverallImages = []; clfOverallRender();` เมื่อ render ใหม่ (เปลี่ยนเครื่อง). [ทำคู่กับ `_clfItemImages = {}` เดิม idx:5620]

- [ ] **Step 5 (ฟังก์ชันรูปรวม):** เพิ่มใกล้ `clfItemPickImage`:
```javascript
function clfOverallPick() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment'; inp.multiple = true;
    inp.onchange = () => {
        const files = [...inp.files]; if (!files.length) return;
        let pending = files.length;
        files.forEach(f => { const r = new FileReader();
            r.onload = () => compressImage(r.result, d => { _clfOverallImages.push(d); if (--pending===0) clfOverallRender(); });
            r.readAsDataURL(f); });
    };
    inp.click();
}
function clfOverallRemove(i) { _clfOverallImages.splice(i,1); clfOverallRender(); }
function clfOverallRender() {
    const wrap = document.getElementById('clf-overall-thumbs');
    const cnt  = document.getElementById('clf-overall-count');
    if (cnt) cnt.textContent = _clfOverallImages.length + ' รูป';
    if (!wrap) return;
    wrap.innerHTML = _clfOverallImages.map((d,i) => `
        <div class="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
            <img src="${d}" class="w-full h-full object-cover">
            <button type="button" onclick="clfOverallRemove(${i})" class="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 leading-5 text-center">✕</button>
        </div>`).join('');
}
```

- [ ] **Step 6 (validate ≥2):** ใน `saveChecklistForm` (idx:5694) เพิ่มเฉพาะ daily:
```javascript
if (type === 'daily' && _clfOverallImages.length < 2) { showToast('กรุณาแนบรูปถ่ายรวมอย่างน้อย 2 รูป', 'warn'); return; }
```
อัปเดต summary modal (idx:5705) ให้แสดงจำนวนรูปรวมแทน totalImgs per-item เมื่อ daily.

- [ ] **Step 7 (ฝังรูปรวมตอนส่ง):** ใน `saveChecklistConfirm` (idx:5730 หลังสร้าง `resultsArr`) เพิ่มเฉพาะ daily — push entry พิเศษ:
```javascript
if (type === 'daily' && _clfOverallImages.length) {
    resultsArr.push({ id:'__overall__', label:'รูปถ่ายรวม', result:'na', remark:'', images:_clfOverallImages.slice() });
}
```
(GAS `saveChecklistItemImgs` จะอัปโหลดรูปใน entry นี้เหมือน item ปกติ; ตอนแสดงผลให้กรอง `id==='__overall__'` แยกเป็นแกลเลอรี.)

- [ ] **Step 8 (แสดงผลในรายละเอียด):** จุดที่ render ผล checklist (รายการ/วิว detail — Grep `__overall__` ยังไม่มี; หา renderer ของ resultsJSON เช่นใน cl-list detail) ให้ดึง entry `__overall__` ออกมาโชว์เป็นแกลเลอรี "รูปถ่ายรวม" และไม่นับเป็นข้อตรวจ. **อ่าน renderer จริงก่อนแก้.**

- [ ] **Step 9 (verify):** daily form: ปุ่ม 📷 รายข้อหาย, มีกล่องรูปรวม; แนบ 1 รูป → กดบันทึกเตือน "≥2 รูป"; แนบ 2 รูป → บันทึกได้; เปิด detail เห็นแกลเลอรีรูปรวม. PM form: ยังมี 📷 รายข้อเหมือนเดิม.

---

# PHASE D — QR Kiosk deep-link (สแกนแล้วเข้าฟอร์มกรอกพร้อม)

### Task D1: URL routing + kiosk mode

**Files:** Modify `index.html` — `DOMContentLoaded` (~5290), เพิ่มฟังก์ชัน `enterDailyKiosk`, state kiosk, ปรับ `saveChecklistConfirm` ให้ส่ง token เมื่อ kiosk.

**URL scheme:** `<pages-url>?mode=daily&m=<machineId>&t=<token>`

- [ ] **Step 1 (state):** ใกล้ตัวแปร cl ด้านบน เพิ่ม:
```javascript
let _clKiosk = false;        // อยู่ในโหมด QR kiosk
let _clKioskToken = '';      // token จาก URL (ส่งต่อ GAS, ไม่เก็บใน HTML)
```

- [ ] **Step 2 (parse param ใน DOMContentLoaded):** แทนบล็อกเปิดหน้า (idx:5306–5309 `switchTab('home'); ... loadMachines().then(initHubStats)`) ด้วยการเช็ค param ก่อน:
```javascript
const _qp = new URLSearchParams(location.search);
if (_qp.get('mode') === 'daily' && _qp.get('m')) {
    enterDailyKiosk(_qp.get('m'), _qp.get('t') || '');
} else {
    switchTab('home');
    initHubDatetime();
    loadMachines().then(() => initHubStats());
}
```

- [ ] **Step 3 (ฟังก์ชัน kiosk):** เพิ่มใหม่ (ใกล้ `goClForm`):
```javascript
async function enterDailyKiosk(machineId, token) {
    _clKiosk = true; _clKioskToken = token;
    document.body.classList.add('kiosk-mode'); // CSS ซ่อน nav/sidebar/bottom-nav
    showLoading('กำลังโหลดฟอร์ม…');
    try {
        if (!machineMaster.length) await loadMachineMaster();
        // โหลด default daily + plan ของเครื่องนี้
        try { const d = await clFetch({ action:'getDailyDefault' }); _clDailyDefault = d.data?.items || []; } catch(e) {}
        try { const p = await clFetch({ action:'getPmPlans', factory:'', area:'' }); (p.data||[]).forEach(r => _clPmPlans[r.machineId] = r); } catch(e) {}
        const m = machineMaster.find(x => (x.id||x.machineId||x.machine_id||'') === machineId);
        if (!m) { hideLoading(); document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif">❌ ไม่พบเครื่องจักรรหัส '+machineId+'</div>'; return; }
        // ตั้งค่า daily form แบบ kiosk
        goClForm('daily', m.factory||'', m.area||'');
        setTimeout(() => {
            const msel = document.getElementById('clf-machine');
            if (msel) { msel.value = machineId; clfMachineChange(); }
            // ล็อก selectors (read-only)
            ['clf-fac','clf-area','clf-machine','clf-date'].forEach(id => { const el=document.getElementById(id); if(el) el.disabled=true; });
            document.getElementById('clf-machine')?.closest('.mms-card')?.querySelectorAll('select').forEach(s=>s.classList.add('bg-gray-100'));
        }, 120);
    } finally { hideLoading(); }
}
```

- [ ] **Step 4 (CSS kiosk):** ใน `<style>` เพิ่ม:
```css
body.kiosk-mode #sidebar, body.kiosk-mode #bottom-nav, body.kiosk-mode .app-header, body.kiosk-mode #cl-subnav { display:none !important; }
body.kiosk-mode #app-content, body.kiosk-mode main { margin:0 !important; padding-top:0 !important; }
```
> **อ่าน id จริงของ nav/sidebar/header ก่อน** (Grep `id="sidebar"`, `bottom-nav`, header class) แล้วปรับ selector ให้ตรง.

- [ ] **Step 5 (ส่ง token ตอนบันทึก):** ใน `saveChecklistConfirm` (idx:5746 `clPost({action:'saveChecklist'...})`) เพิ่ม field — ถ้า kiosk ส่ง token, ไม่งั้นใช้ session ปกติ. `clPost` ปกติแนบ `pw:sessionPw` (ตรวจ `clPost` ว่าแนบ pw ยังไง — Grep `function clPost`). ส่ง `token` เพิ่ม:
```javascript
const res = await clPost({
    action:'saveChecklist', type, date, shift: (...), factory:fac, area, machineId, machineName, inspector, remark,
    results: resultsArr, ok, ng, fix, na, overallResult,
    token: _clKiosk ? _clKioskToken : undefined,
});
```
> ตรวจ `clPost`: ถ้ามันใส่ `pw:sessionPw` เสมอ ก็ไม่เป็นไร (kiosk `sessionPw=''`, GAS ผ่านด้วย tokenOk). ถ้า `clPost` ต้องการ pw ไม่ว่าง ให้ปรับให้ส่ง token ได้.

- [ ] **Step 6 (หลังบันทึกใน kiosk):** ใน success (idx:5751) — ถ้า `_clKiosk` แทน `switchTab('cl-hub')` ด้วยหน้า "บันทึกสำเร็จ" + ปุ่ม "ตรวจเครื่องถัดไป/ปิด":
```javascript
if (_clKiosk) { document.body.innerHTML = '<div style="padding:48px 24px;text-align:center;font-family:sans-serif"><div style="font-size:64px">✅</div><h2 style="color:#16a085">บันทึกสำเร็จ</h2><p style="color:#666">'+res.tracking+'</p><button onclick="location.reload()" style="margin-top:16px;padding:10px 20px;background:#16a085;color:#fff;border:none;border-radius:10px">ตรวจอีกครั้ง</button></div>'; return; }
switchTab('cl-hub');
```

- [ ] **Step 7 (verify):** เปิด `index.html?mode=daily&m=<รหัสจริง>&t=cprdaily2026` (local preview หรือ Pages) → เข้าฟอร์ม daily โดยตรง, ข้อมูลเครื่องครบ+ล็อก, nav ซ่อน, เหลือกรอกชื่อ+กะ+รายการ+รูปรวม → บันทึกได้ (ไม่ login) → เห็นหน้าสำเร็จ. token ผิด → toast error จาก GAS.

---

# PHASE E — Generate QR เป็น PDF (หน้า รายละเอียดตรวจสอบ → tab รายวัน)

### Task E1: เพิ่ม QR library + ปุ่ม + modal เลือกเครื่อง

**Files:** Modify `index.html` — `<head>` (~11 ใต้ jsPDF), toolbar `clsc-daily-view` (~1134), เพิ่ม modal `modal-qr-gen`, JS ใหม่.

- [ ] **Step 1 (lib):** ใต้ jsPDF (idx:11) เพิ่ม:
```html
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js"></script>
```

- [ ] **Step 2 (ปุ่ม):** ใน toolbar ของ `clsc-daily-view` (ใกล้ idx:1134 — Grep หา div แรกใน `clsc-daily-view`) เพิ่มปุ่ม (เฉพาะ engineer/admin):
```html
<button onclick="openQrGenModal()" class="mms-btn mms-btn-blue text-sm">📱 Generate QR</button>
```

- [ ] **Step 3 (modal):** เพิ่มใกล้ modal cl อื่น:
```html
<div id="modal-qr-gen" class="modal-bg hidden">
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
    <div class="bg-blue-600 px-6 py-4 flex-shrink-0 flex justify-between items-center">
      <h2 class="text-base font-bold text-white">📱 Generate QR Code (Daily Check)</h2>
      <button onclick="document.getElementById('modal-qr-gen').classList.add('hidden')" class="text-white opacity-70 hover:opacity-100 text-xl font-bold">✕</button>
    </div>
    <div class="p-4 flex-shrink-0 border-b border-gray-100 flex flex-wrap items-end gap-3">
      <div><label class="text-xs font-bold text-gray-500 block mb-1">ขนาด QR (mm)</label>
        <input id="qr-size-mm" type="number" min="15" max="100" value="40" class="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm"></div>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="qr-select-all" onchange="qrToggleAll(this.checked)"> เลือกทั้งหมด</label>
      <span id="qr-sel-count" class="text-xs text-gray-500 ml-auto">เลือก 0</span>
    </div>
    <div id="qr-machine-list" class="flex-1 overflow-y-auto p-4 space-y-1"></div>
    <div class="p-4 border-t border-gray-100 flex-shrink-0 flex gap-3 justify-end">
      <button onclick="document.getElementById('modal-qr-gen').classList.add('hidden')" class="mms-btn">ยกเลิก</button>
      <button onclick="generateQrPdf()" class="mms-btn mms-btn-blue">📄 สร้าง PDF</button>
    </div>
  </div>
</div>
```

- [ ] **Step 4 (เปิด modal + list):**
```javascript
const QR_TOKEN = 'cprdaily2026'; // ต้องตรง DAILY_TOKEN ใน GAS
function openQrGenModal() {
    if (userRole !== 'engineer' && userRole !== 'admin') { showToast('ต้องเป็น Engineer หรือ Admin', 'warn'); return; }
    const fac  = document.getElementById('clsc-fac')?.value  || '';
    const area = document.getElementById('clsc-area')?.value || '';
    const machines = clMachinesFor(fac, area);
    document.getElementById('qr-machine-list').innerHTML = machines.map(m => {
        const id = m.id||m.machineId||m.machine_id||''; const name = m.name||m.machineName||id;
        return `<label class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" class="qr-cb w-4 h-4" value="${id}" onchange="qrUpdateCount()">
            <span class="text-xs font-mono text-gray-500 shrink-0">${id}</span><span class="text-sm">${name}</span></label>`;
    }).join('') || '<p class="text-center text-gray-400 py-6">ไม่พบเครื่องจักร</p>';
    document.getElementById('qr-select-all').checked = false;
    qrUpdateCount();
    document.getElementById('modal-qr-gen').classList.remove('hidden');
}
function qrToggleAll(on){ document.querySelectorAll('.qr-cb').forEach(cb=>cb.checked=on); qrUpdateCount(); }
function qrUpdateCount(){ document.getElementById('qr-sel-count').textContent = 'เลือก ' + document.querySelectorAll('.qr-cb:checked').length; }
```

### Task E2: สร้าง PDF (จัด QR ลง A4)

- [ ] **Step 5 (generate):** ฟังก์ชันคำนวณ grid บน A4 (210×297mm) + วาด QR ผ่าน qrcode-generator → dataURL → jsPDF `addImage`:
```javascript
function qrDataUrl(text, pxSize) {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    const count = qr.getModuleCount();
    const cell  = Math.max(2, Math.floor(pxSize / count));
    const dim   = cell * count;
    const cv = document.createElement('canvas'); cv.width = cv.height = dim;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,dim,dim); ctx.fillStyle = '#000';
    for (let r=0;r<count;r++) for (let c=0;c<count;c++) if (qr.isDark(r,c)) ctx.fillRect(c*cell,r*cell,cell,cell);
    return cv.toDataURL('image/png');
}
function generateQrPdf() {
    const ids = [...document.querySelectorAll('.qr-cb:checked')].map(cb=>cb.value);
    if (!ids.length) { showToast('เลือกเครื่องอย่างน้อย 1 เครื่อง', 'warn'); return; }
    const sizeMm = Math.min(100, Math.max(15, parseFloat(document.getElementById('qr-size-mm').value)||40));
    const base   = location.origin + location.pathname; // URL แอปจริง
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
    const PAGE_W=210, PAGE_H=297, MARGIN=10, LABEL_H=6, GAP=8;
    const cellW = sizeMm + GAP;
    const cellH = sizeMm + LABEL_H + GAP;
    const cols  = Math.max(1, Math.floor((PAGE_W - 2*MARGIN + GAP) / cellW));
    const rows  = Math.max(1, Math.floor((PAGE_H - 2*MARGIN + GAP) / cellH));
    const perPage = cols * rows;
    ids.forEach((id, i) => {
        if (i > 0 && i % perPage === 0) pdf.addPage();
        const idx = i % perPage; const r = Math.floor(idx/cols), c = idx % cols;
        const x = MARGIN + c*cellW, y = MARGIN + r*cellH;
        const m = machineMaster.find(z => (z.id||z.machineId||z.machine_id||'')===id) || {};
        const name = m.name||m.machineName||id;
        const url  = `${base}?mode=daily&m=${encodeURIComponent(id)}&t=${encodeURIComponent(QR_TOKEN)}`;
        pdf.addImage(qrDataUrl(url, Math.round(sizeMm*8)), 'PNG', x, y, sizeMm, sizeMm);
        pdf.setFontSize(8);
        pdf.text(String(name).slice(0,28), x + sizeMm/2, y + sizeMm + 4, { align:'center', maxWidth: sizeMm + GAP });
        pdf.setFontSize(6); pdf.setTextColor(150);
        pdf.text(String(id), x + sizeMm/2, y + sizeMm + 4 + 3, { align:'center' });
        pdf.setTextColor(0);
    });
    pdf.save(`QR_DailyCheck_${ids.length}.pdf`);
    document.getElementById('modal-qr-gen').classList.add('hidden');
}
```
> **ฟอนต์ไทยใน jsPDF:** ค่า default ของ jsPDF ไม่รองรับสระไทยเต็มที่ — ชื่อเครื่องที่เป็นไทยอาจเพี้ยน. ถ้าชื่อเครื่องเป็นไทยและต้องการคมชัด ให้พิจารณา: (ก) แสดงเฉพาะ `id` (อังกฤษ/ตัวเลข) ใต้ QR, หรือ (ข) ฝัง custom Thai font (Sarabun) เข้า jsPDF ด้วย `addFileToVFS`/`addFont` (งานเพิ่ม). **ค่าเริ่มต้นที่ปลอดภัย: ใส่ `id` ตัวใหญ่ + ชื่อไทยตัวเล็ก (เพี้ยนได้)** หรือถาม user ถ้าชื่อเครื่องส่วนใหญ่เป็นไทย.

- [ ] **Step 6 (verify):** Schedule → tab Daily → 📱 Generate QR → เลือก 5 เครื่อง, ขนาด 40mm → สร้าง PDF: QR หลายตัวต่อหน้า A4, มีชื่อ/รหัสใต้แต่ละตัว. สแกน QR ด้วยมือถือ → เปิด deep-link เข้าฟอร์ม daily ของเครื่องนั้น (Phase D).

---

## Self-Review (ตรวจกับ requirement)

| requirement | Task |
|---|---|
| QR → ฟอร์มกรอกข้อมูลเครื่องครบ เหลือชื่อผู้ตรวจ+รายการ | D1 |
| บันทึกได้โดยไม่ login (token) | A1 + D1 |
| app ดึง data ได้เมื่อต้องการ | ใช้ getChecklists เดิม (ไม่แตะ) |
| รูปบังคับ ≥2 ในหัวข้อรวม (แทน per-item) | C1 |
| ตัวเลือกกะเช้า/ดึก | B1 |
| ปุ่ม Generate QR ใน tab รายวัน + popup เลือกหลายเครื่อง | E1 |
| Gen PDF + ชื่อใต้ QR + ขนาด mm + หลายตัว/หน้า A4 | E2 |

**จุดเสี่ยงต้องอ่านโค้ดจริงก่อนแก้:** C1 Step 8 (renderer ของ resultsJSON ที่ต้องแยก `__overall__`), D1 Step 4 (id จริงของ nav/sidebar/header), D1 Step 5 (`clPost` แนบ pw ยังไง), E2 Step 5 (ฟอนต์ไทยใน jsPDF).

**Token sync:** `DAILY_TOKEN` (GAS) ต้องตรงกับ `QR_TOKEN` (index.html). เปลี่ยนต้องแก้ทั้งสองที่ + redeploy.

## Execution Handoff
ลำดับ: **A → redeploy → B → C → D → E**, commit ทีละ Task, push `mms main`. สลับไป **Sonnet** เริ่ม Phase A. ([[v2.1-plan]] เป็น baseline ที่ทำเสร็จแล้ว)
