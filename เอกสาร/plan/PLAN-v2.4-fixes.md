# MMS v2.4 — Fixes & Enhancements Plan

> **For agentic workers:** รันทีละ Task. Steps เป็น checkbox. **Opus = วางแผน (ไฟล์นี้), Sonnet = ลงมือ** ([[opus-planning-only]]).
> **เลขบรรทัด = ค่าประมาณ** — Grep หา anchor (ชื่อฟังก์ชัน/ข้อความ) ก่อนแก้ทุกครั้ง.

**Goal:** แก้บั๊กจาก feedback รอบ v2.4: (BD) ปิดงานไม่ได้ทั้งที่มีปัญหาแล้ว, Dashboard เพี้ยนตาม filter + ปุ่ม refresh, Export PNG ให้เป็นสไลด์ PPT; (Checklist) QR/ทุก checklist ไม่ขึ้นใน list/สรุป + วันที่โชว์ ISO, หน้าใหม่ "สถานะการตรวจ" รายเครื่อง.

**Architecture:** Single `index.html` + `gas_code.gs` (GAS Web App) บน GitHub Pages.

**Design decisions (ยืนยันแล้ว 2026-06-23):**
1. Export PNG → **จัดใหม่เป็นสไลด์ 16:9** (2 คอลัมน์แนวนอน เต็มสไลด์) — Task D1.
2. หน้าดูสถานะตรวจรายเครื่อง → **หน้าใหม่ "สถานะการตรวจ"** ใน Checklist — Task C1.

---

## ลำดับ: PHASE A (GAS) → redeploy → B–D (frontend)
GAS แก้จุดเดียว (date coercion ใน `_Checklists`) แต่เป็น **root cause ร่วม** ของ "QR ไม่ขึ้น + วันที่ ISO + list/สรุปว่าง" — **redeploy ก่อนทดสอบ C1** ([[gas-deploy-stale-root-cause]]).

---

# PHASE A — Backend (gas_code.gs)

### Task A1: `doGetChecklists` — date coercion ทำ filter/แสดงผลพัง (root cause QR ไม่ขึ้น)
**Files:** `gas_code.gs` — `doGetChecklists` (~850), `saveChecklist` write (~225 หลัง `appendRow`).

**Root cause (ยืนยันจากโค้ด + screenshot):** `saveChecklist` เขียน `data.date` ("2026-06-23") ลงคอลัมน์ C → **Sheets auto-coerce เป็น Date object** → `getValues()` คืน Date → JSON.stringify เป็น `"2026-06-23T00:00:00.000Z"` (เห็นในหน้า hub-recent). ใน `doGetChecklists`:
- L862 `if (month && !String(r[2]).startsWith(month))` → `String(Date)` = "Tue Jun 23 2026..." → `startsWith("06")` = false → `continue` (ตัดทิ้งทุกแถว)
- L863 year filter `startsWith("2026")` ก็พังเหมือนกัน
→ **ทุก checklist ที่มี month/year filter หาย** (list ตั้ง default = เดือนปัจจุบัน → ว่างเปล่า; summary/calendar/overdue เหมือนกัน). ไม่ใช่แค่ QR — QR แค่เป็นสิ่งที่ user เพิ่งทดสอบ.

- [ ] **Step 1 (อ่าน — normalize + fix filter):** แทน loop ใน `doGetChecklists` (gas:856-872) ด้วย:
```javascript
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    // normalize date — Sheets อาจ coerce "2026-06-23" เป็น Date object
    const ds = (r[2] instanceof Date)
      ? Utilities.formatDate(r[2], 'Asia/Bangkok', 'yyyy-MM-dd')
      : String(r[2] || '').slice(0, 10);
    if (factory && r[4] !== factory) continue;
    if (area    && r[5] !== area)    continue;
    if (type    && r[1] !== type)    continue;
    if (month   && ds.slice(5, 7) !== month) continue; // month param = "06" (2 หลัก)
    if (year    && ds.slice(0, 4) !== year)  continue; // year param = "2026"
    let results = [];
    try { results = JSON.parse(r[15]||'[]'); } catch(e) {}
    rows.push({
      id: r[0], type: r[1], date: ds, shift: r[3], factory: r[4], area: r[5],
      machine: r[6], machineName: r[7], inspector: r[8], remark: r[9],
      ok: Number(r[10])||0, ng: Number(r[11])||0, fix: Number(r[12])||0, na: Number(r[13])||0,
      overallResult: r[14], results, createdAt: r[16],
    });
  }
```
> เปลี่ยนหลัก: (ก) `date: ds` (yyyy-MM-dd แทน Date/ISO), (ข) month/year filter ใช้ `ds.slice()` เทียบ exact แทน `startsWith` (logic เดิมผิดแม้เป็น text — `"2026-06-23".startsWith("06")` = false). ตรวจ client ส่ง month เป็น 2 หลัก: `loadClList` (`mon` จาก `split('-')`), `loadClSummary` (`cls-month` value "01".."12"), calendar E1 + overdue G1 (`String(month+1).padStart(2,'0')`) — ตรงกันหมด.

- [ ] **Step 2 (เขียน — กัน coerce รอบหน้า):** หลัง `appendRow([...])` + `SpreadsheetApp.flush()` ใน `saveChecklist` (gas:233) เพิ่มบังคับคอลัมน์ C (date, col index 3) เป็น text:
```javascript
      sh.getRange(2, 3, Math.max(1, sh.getLastRow()-1), 1).setNumberFormat('@'); // กัน Sheets แปลง date เป็น Date
```
> วางก่อน `lock2.releaseLock()`. แถวเก่าที่ coerce ไปแล้ว Step 1 จัดการตอนอ่าน (instanceof Date).

### Task A-final: Redeploy GAS
- [ ] Deploy → Manage deployments → Edit (ดินสอ) → New version → Deploy (URL เดิม).
- [ ] **Verify:** `GET ...?action=getChecklists&type=daily&month=06&year=2026` → ต้องได้แถวที่ date เป็น `"2026-06-23"` (ไม่ใช่ ISO) และมีข้อมูล (ไม่ว่าง). หน้า cl-list/summary เปิดมาเห็นรายการ.

---

# PHASE B — Breakdown

### Task B1: ปิดงานไม่ได้ — validate อ่าน problem จากช่องว่าง
**Files:** `index.html` — `closeJob` (~3072), `collectFormData` (~4354 `problem: g('inp-problem')`).

**Root cause:** `collectFormData()` คืน `problem: g('inp-problem')` (hidden input ที่**ไม่เคยถูกเซ็ตค่า** — ว่างเสมอ). เนื้อหาจริงอยู่ใน `_problemLocked` (บรรทัดล็อกสีเทา) + `inp-problem-new` (textarea). ตอน **save** ใช้ `data.problem = composeProblem(byName)` (L4443) จึงถูก แต่ตอน **validate ปิดงาน** (`closeJob` L3082 เช็ค `d.problem`) อ่านช่องว่าง → รายงาน "ปัญหา/อาการ" ขาด → บล็อก. (เห็นใน screenshot: มี 2 บรรทัดล็อกแล้วแต่ยังเตือน.)

- [ ] **Step 1:** ใน `closeJob` (idx:3073) — หลัง `const d = collectFormData();` override `d.problem` ด้วยค่ารวมจริง:
```javascript
function closeJob() {
    const d = collectFormData();
    // problem จริง = locked lines + บรรทัดใหม่ (hidden inp-problem ว่างเสมอ)
    d.problem = [ _problemLocked, (document.getElementById('inp-problem-new')?.value || '').trim() ]
                .filter(Boolean).join('\n');
    const need = [
```
> ใช้ pattern เดียวกับ `composeProblem` แต่ไม่ต่อ `*ผู้ทำ - สถานะ` (validate แค่เช็คว่ามีเนื้อหา). `_problemLocked` ถูกเซ็ตตอน `openForEdit` (idx:4517) จาก `item.problem`.

- [ ] **Step 2 (verify):** เปิด record ที่แจ้งผ่าน popup (มีบรรทัดล็อก problem) → กรอกข้อมูลปิดงานครบ (ยกเว้นไม่แตะช่องปัญหาใหม่) → กดปิดงาน → **ผ่าน ไม่ติด "ปัญหา/อาการ"**. ลอง record ที่ไม่มี problem เลย → ยังเตือนถูกต้อง.

### Task B2: Dashboard เพี้ยนตาม filter หน้ารายการ + ปุ่ม Refresh หน้าหลัก
**Files:** `index.html` — `_lastRecords` (~4546), `loadRecords` (~4548), `initHubStats` (~3565 `facStats`/`hub-count-bd`), DOMContentLoaded (~5309 getAll), `goHome` (~3353), home header (~528).

**Root cause:** `_lastRecords` ใช้ร่วมกัน 2 ที่ — dashboard (`facStats`, `hub-count-*`) และหน้ารายการ (`loadRecords` เขียนทับด้วยข้อมูล**ที่ filter แล้ว**). พอ user filter หน้ารายการ → `_lastRecords` = subset → กลับหน้าหลัก (`goHome→initHubStats`) → นับจาก subset → เพี้ยน. ต้องแยก store ของ dashboard ที่ดึง `getAll` แบบไม่มี filter.

- [ ] **Step 1 (state แยก):** ใกล้ `_lastRecords` (idx:4546) เพิ่ม:
```javascript
let _dashRecords = [];   // ข้อมูล BD ทั้งหมด (ไม่มี filter) — สำหรับ Dashboard เท่านั้น
```

- [ ] **Step 2 (loader แยก):** เพิ่มฟังก์ชันใกล้ `initHubStats` (idx:3565):
```javascript
async function refreshDashboard() {
    if (!GAS_URL) return;
    const chip = document.getElementById('dash-refresh-btn');
    if (chip) { chip.disabled = true; chip.textContent = '⏳'; }
    try {
        const r = await fetch(`${GAS_URL}?action=getAll`); // ไม่ส่ง filter
        const j = await r.json();
        if (j.success && Array.isArray(j.data)) _dashRecords = j.data;
    } catch(e) {}
    if (chip) { chip.disabled = false; chip.textContent = '🔄 รีเฟรช'; }
    initHubStats();
}
```

- [ ] **Step 3 (ให้ initHubStats ใช้ _dashRecords):** ใน `initHubStats` (idx:3571-3591) เปลี่ยนทุก `_lastRecords` เป็น `_dashRecords` (3 จุด: `hub-count-bd`/`hub-count-wip` block idx:3571-3578, และใน `facStats` idx:3587 `bdIds`). ตัวอย่าง bdIds:
```javascript
        const bdIds = new Set(
            _dashRecords.filter(r => normFac(r.factory) === facFull && ACTIVE.has(r.status))
                        .map(r => r.machineId || r.machineName).filter(Boolean));
```
> guard idx:3571 เปลี่ยนเป็น `if (_dashRecords.length) {`.

- [ ] **Step 4 (DOMContentLoaded ใช้ตัวใหม่):** ใน DOMContentLoaded (idx:5327 — block `loadMachines().then(async () => {...})` ที่ v2.3 เพิ่ม) เปลี่ยนให้เขียน `_dashRecords` แทน `_lastRecords`:
```javascript
    loadMachines().then(async () => {
        initHubStats();
        await refreshDashboard(); // โหลด getAll → _dashRecords → initHubStats
    });
```
> ลบ block fetch getAll เดิมที่เขียน `_lastRecords` (idx:5328-5335) ออก — ย้ายไป `refreshDashboard`.

- [ ] **Step 5 (goHome refresh):** ใน `goHome` (idx:3353) เปลี่ยน `initHubStats();` เป็น `refreshDashboard();` (กลับหน้าหลักทีไรดึงข้อมูลสดเสมอ ไม่อิง filter ค้าง).

- [ ] **Step 6 (ปุ่ม Refresh ใน header):** ใน home header (idx:528-531) เพิ่มปุ่มในกล่อง chips:
```html
            <div class="flex flex-wrap gap-2 items-center">
                <span class="mms-stat-chip" id="hub-stat-machines">🔧 เครื่องจักร: —</span>
                <span class="mms-stat-chip" id="hub-stat-online">🟢 ระบบออนไลน์</span>
                <button id="dash-refresh-btn" onclick="refreshDashboard()" class="mms-stat-chip cursor-pointer hover:bg-white/20">🔄 รีเฟรช</button>
            </div>
```
> แทนที่ `<div class="flex flex-wrap gap-2">` เดิม (idx:528).

- [ ] **Step 7 (verify):** เปิดแอป → จดเลข run/bd. ไปหน้ารายการ Breakdown → filter โรงงาน 1 อย่างเดียว → กลับหน้าหลัก → ตัวเลข **ตรงเหมือนเดิม** (ไม่ลดตาม filter). กดปุ่ม 🔄 รีเฟรช → ดึงใหม่ ตัวเลขเท่าระบบจริง.

---

# PHASE C — Checklist: หน้าใหม่ "สถานะการตรวจ"

### Task C1: หน้า per-machine inspection status (รายวันกะ/รายเดือนตามแผน — ตรวจแล้ว/ยัง)
**Files:** `index.html` — sidebar submenu (idx:255), `CL_SUB_PANELS` (idx:3303), `grpMap` (idx:3345), `PAGE_TITLE` (idx:2962), `switchTab` cases (idx:3374-3379), เพิ่ม panel HTML (หลัง `panel-cl-schedule` idx:1240) + JS ใหม่.
**ต้องทำหลัง A1 redeploy** (อาศัย `getChecklists` คืน date/filter ถูก).

**แนวคิด:** ตาราง เครื่องจักร × คอลัมน์สถานะ:
| เครื่อง | รายวัน-กะเช้า (วันนี้) | รายวัน-กะดึก (วันนี้) | PM (เดือนนี้) |
- รายวัน: ถ้า `dailyEnabled` → ✅ ตรวจแล้ว / ❌ ยังไม่ตรวจ (เทียบ getChecklists daily วันนี้ shift นั้น); ถ้าปิด daily → `—`
- PM: ถ้า `clIsPmDueInMonth` เดือนนี้ → ✅ ตรวจแล้ว / ⏰ ค้าง (เทียบ getChecklists pm เดือนนี้); ถ้าไม่ถึงกำหนด → `—`

- [ ] **Step 1 (sidebar item):** หลัง `sni-cl-schedule` (idx:255) เพิ่ม:
```html
                <div class="sidebar-subitem" id="sni-cl-status" onclick="switchTab('cl-status')">สถานะการตรวจ</div>
```

- [ ] **Step 2 (register panel):**
  - `CL_SUB_PANELS` (idx:3303): เพิ่ม `'cl-status'` ใน Set.
  - `grpMap` (idx:3345 หลัง `'cl-schedule'`): เพิ่ม `'cl-status': ['cl','sni-cl-status'],`
  - `PAGE_TITLE` (idx:2962): เพิ่ม `'cl-status': '✅ สถานะการตรวจ',`
  - `switchTab` (idx:3374-3379 ที่มี `if (name === 'cl-schedule')...`): เพิ่ม `if (name === 'cl-status') initClStatus();`

- [ ] **Step 3 (panel HTML):** หลัง `</div><!-- end panel-cl-schedule -->` (idx:1240) เพิ่ม:
```html
<!-- ==================== CHECKLIST: STATUS ==================== -->
<div id="panel-cl-status" class="tab-panel p-4 md:p-6">
<div class="max-w-5xl mx-auto">
    <div class="mms-card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
            <label class="text-xs font-bold text-gray-500 block mb-1">Factory</label>
            <select id="clst-fac" onchange="clstFacChange()" class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">-- เลือก Factory --</option>
            </select>
        </div>
        <div>
            <label class="text-xs font-bold text-gray-500 block mb-1">Area</label>
            <select id="clst-area" onchange="renderClStatus()" class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
                <option value="">ทั้งหมด</option>
            </select>
        </div>
        <div>
            <label class="text-xs font-bold text-gray-500 block mb-1">วันที่ (รายวัน)</label>
            <input id="clst-date" type="date" onchange="loadClStatus()" class="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none">
        </div>
        <button onclick="loadClStatus()" class="mms-btn text-sm">🔄 รีเฟรช</button>
    </div>
    <div class="mms-card overflow-hidden">
        <div class="overflow-x-auto">
        <table class="w-full text-sm">
            <thead>
                <tr class="bg-gray-50 border-b border-gray-200">
                    <th class="text-left px-4 py-3 font-bold text-gray-600">เครื่องจักร</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-600">🌅 กะเช้า</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-600">🌙 กะดึก</th>
                    <th class="text-center px-3 py-3 font-bold text-gray-600">🔧 PM (เดือนนี้)</th>
                </tr>
            </thead>
            <tbody id="clst-body">
                <tr><td colspan="4" class="text-center text-gray-400 py-8">เลือก Factory</td></tr>
            </tbody>
        </table>
        </div>
    </div>
</div>
</div><!-- end panel-cl-status -->
```

- [ ] **Step 4 (JS):** เพิ่มใกล้ `loadClSchedule` (idx:6175). ใช้ state ที่มีอยู่ (`_clPmPlans`, helpers `clMachinesFor`, `clIsPmDueInMonth`):
```javascript
let _clstDaily = {};   // set machineId ที่ตรวจ daily แล้ว: { 'เช้า': Set, 'ดึก': Set }
let _clstPm    = new Set(); // machineId ที่ตรวจ PM เดือนนี้แล้ว

async function initClStatus() {
    if (!machineMaster.length) await loadMachineMaster();
    clFillFacSelect('clst-fac', '');
    clFillAreaSelect('clst-area', '', '');
    document.getElementById('clst-date').value = new Date().toISOString().slice(0,10);
    // โหลด plans (dailyEnabled + PM) ถ้ายังไม่มี
    if (!Object.keys(_clPmPlans).length) {
        try { const p = await clFetch({ action:'getPmPlans', factory:'', area:'' }); (p.data||[]).forEach(r => _clPmPlans[r.machineId] = r); } catch(e) {}
    }
    loadClStatus();
}
function clstFacChange() {
    clFillAreaSelect('clst-area', document.getElementById('clst-fac')?.value || '', '');
    loadClStatus();
}
async function loadClStatus() {
    const fac  = document.getElementById('clst-fac')?.value  || '';
    const area = document.getElementById('clst-area')?.value || '';
    const dateStr = document.getElementById('clst-date')?.value || new Date().toISOString().slice(0,10);
    const tbody = document.getElementById('clst-body');
    if (!fac) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">เลือก Factory</td></tr>'; return; }
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">กำลังโหลด...</td></tr>';
    const ym = dateStr.slice(0,7); const yr = ym.slice(0,4), mo = ym.slice(5,7);
    _clstDaily = { 'เช้า': new Set(), 'ดึก': new Set() };
    _clstPm = new Set();
    try {
        const dr = await clFetch({ action:'getChecklists', factory:fac, area, type:'daily', month:mo, year:yr });
        (dr.data||[]).forEach(r => { if (r.date === dateStr && _clstDaily[r.shift]) _clstDaily[r.shift].add(r.machineId||r.machine||''); });
        const pr = await clFetch({ action:'getChecklists', factory:fac, area, type:'pm', month:mo, year:yr });
        (pr.data||[]).forEach(r => _clstPm.add(r.machineId||r.machine||''));
    } catch(e) {}
    renderClStatus();
}
function renderClStatus() {
    const fac  = document.getElementById('clst-fac')?.value  || '';
    const area = document.getElementById('clst-area')?.value || '';
    const dateStr = document.getElementById('clst-date')?.value || new Date().toISOString().slice(0,10);
    const [yr, mo] = dateStr.split('-').map(Number);
    const tbody = document.getElementById('clst-body');
    if (!fac) return;
    const machines = clMachinesFor(fac, area);
    if (!machines.length) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">ไม่พบเครื่องจักร</td></tr>'; return; }
    const okB  = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✅ ตรวจแล้ว</span>';
    const noB  = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">❌ ยังไม่ตรวจ</span>';
    const dueB = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-500">⏰ ค้าง</span>';
    const naB  = '<span class="text-xs text-gray-300">—</span>';
    tbody.innerHTML = machines.map(m => {
        const id   = m.id || m.machineId || m.machine_id || '';
        const name = m.name || m.machineName || id;
        const plan = _clPmPlans[id] || {};
        const dailyOn = plan.dailyEnabled !== false && plan.dailyEnabled !== 0 && plan.dailyEnabled !== '0';
        const morning = !dailyOn ? naB : (_clstDaily['เช้า'].has(id) ? okB : noB);
        const night   = !dailyOn ? naB : (_clstDaily['ดึก'].has(id) ? okB : noB);
        const pmDue   = clIsPmDueInMonth(id, yr, mo-1);
        const pm      = !pmDue ? naB : (_clstPm.has(id) ? okB : dueB);
        return `<tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-2.5"><span class="text-sm font-medium">${name}</span> <span class="text-xs text-gray-400 font-mono">${id}</span></td>
            <td class="px-3 py-2.5 text-center">${morning}</td>
            <td class="px-3 py-2.5 text-center">${night}</td>
            <td class="px-3 py-2.5 text-center">${pm}</td>
        </tr>`;
    }).join('');
}
```
> ตรวจชื่อ helper จริงก่อนใช้: `clFillFacSelect`, `clFillAreaSelect`, `clMachinesFor`, `clIsPmDueInMonth`, `clFetch` (มีอยู่จาก v2.1/v2.3). `clIsPmDueInMonth(id, year, monthIndex0)` — เดือน 0-based (มิ.ย.=5).

- [ ] **Step 5 (verify):** เปิด "สถานะการตรวจ" → เลือก Factory 1 → เห็นทุกเครื่อง + สถานะกะเช้า/ดึกวันนี้ + PM เดือนนี้. คีย์ daily กะเช้าเครื่องหนึ่ง → กดรีเฟรช → ช่องกะเช้าเครื่องนั้นเป็น ✅. เครื่องที่ไม่ถึงกำหนด PM → คอลัมน์ PM = "—".

---

# PHASE D — Export PNG เป็นสไลด์ PPT 16:9

### Task D1: จัด layout export PNG ใหม่เป็นสไลด์แนวนอนเต็ม 16:9
**Files:** `index.html` — `exportPDF` PNG branch (~5225 `fitTo16x9`), เพิ่มฟังก์ชัน `buildPptSlide` + container ใหม่, `_captureNode` (มีอยู่).

**Root cause ปัจจุบัน:** `fitTo16x9` (idx:5227) เอา canvas ของ `report-content` (**แนวตั้ง สูง**) มา `drawImage` ย่อให้พอดี 1920×1080 → ได้คอลัมน์แคบกลางจอ ขอบขาวซ้าย-ขวาเยอะ. ต้อง **จัด content ใหม่เป็น layout แนวนอน** ก่อน capture.

**แนวทาง:** สร้าง off-screen container `#ppt-slide` ขนาด 1600×900 (16:9, scale ×2 ตอน capture = 3200×1800 คม) → เติมข้อมูลจาก `collectFormData()` + รูป → capture ด้วย `_captureNode` → ดาวน์โหลด. **งานนี้ต้อง iterate ด้วย preview screenshot** (จัดวางให้พอดีไม่ล้น).

**Layout 16:9 (2 คอลัมน์):**
```
┌─────────────────────────────────────────────────┐
│ HEADER: ชื่อเครื่อง • Tracking • โรงงาน/พื้นที่/ไลน์      │
├──────────────────────┬──────────────────────────┤
│ ซ้าย (55%)           │ ขวา (45%)                 │
│ • ข้อมูลเวลา/Downtime  │ • รูป ก่อนแก้ไข            │
│ • ปัญหาที่พบ          │ • รูป หลังแก้ไข            │
│ • อุปกรณ์            │                          │
│ • Why-Why (ย่อ)      │ • มาตรการแก้ไข/ป้องกัน      │
└──────────────────────┴──────────────────────────┘
```

- [ ] **Step 1 (container):** เพิ่ม off-screen div (ใกล้ `#photo-gallery` — Grep `id="photo-gallery"`):
```html
<div id="ppt-slide" style="position:fixed;left:-99999px;top:0;width:1600px;height:900px;background:#fff;font-family:'Prompt',sans-serif;overflow:hidden"></div>
```

- [ ] **Step 2 (builder):** เพิ่มฟังก์ชัน `buildPptSlide()` ที่อ่าน `collectFormData()` + `imgList` (before/after) + สร้าง innerHTML ของ `#ppt-slide` เป็น grid 2 คอลัมน์. ใช้ inline style (html2canvas ไม่ค่อยรองรับ Tailwind บาง util). โครง:
```javascript
function _pptImg(arr) { // คืน <img> แรกของ before/after (หรือ placeholder)
    const d = (arr && arr[0] && (arr[0].data || arr[0])) || '';
    return d ? `<img src="${d}" style="width:100%;height:100%;object-fit:contain;background:#f3f4f6;border-radius:8px">` : '<div style="width:100%;height:100%;background:#f3f4f6;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9ca3af">ไม่มีรูป</div>';
}
function buildPptSlide() {
    const d = collectFormData();
    d.problem = [ _problemLocked, (document.getElementById('inp-problem-new')?.value||'').trim() ].filter(Boolean).join('\n');
    const h = Math.floor(d.downtimeMin/60), mn = d.downtimeMin%60;
    const slide = document.getElementById('ppt-slide');
    slide.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;padding:36px 44px;box-sizing:border-box">
        <div style="border-bottom:3px solid #c0392b;padding-bottom:14px;margin-bottom:18px">
          <div style="font-size:13px;color:#c0392b;font-weight:700;letter-spacing:1px">🔴 BREAKDOWN REPORT — CPRAM CHB</div>
          <div style="font-size:30px;font-weight:800;color:#1f2937;line-height:1.1">${d.machineName||'—'}</div>
          <div style="font-size:13px;color:#6b7280;margin-top:4px">Tracking: ${d.tracking||'—'} • ${d.factory||''} / ${d.area||''} / ${d.line||''}</div>
        </div>
        <div style="flex:1;display:grid;grid-template-columns:1.2fr 1fr;gap:24px;min-height:0">
          <div style="display:flex;flex-direction:column;gap:14px;min-height:0">
            <div style="display:flex;gap:10px">
              ${_pptCell('⏱️ Downtime', `${h} ชม. ${mn} นาที`)}
              ${_pptCell('🔧 ประเภท', d.bdType||'—')}
            </div>
            <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:14px;flex:1;min-height:0;overflow:hidden">
              <div style="font-size:13px;font-weight:700;color:#b91c1c;margin-bottom:6px">⚠️ ปัญหาที่พบ</div>
              <div style="font-size:15px;color:#374151;white-space:pre-wrap;line-height:1.5">${(d.problem||'—').replace(/</g,'&lt;')}</div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              ${_pptBox('✏️ มาตรการแก้ไข', d.corrective)}
              ${_pptBox('🛡️ มาตรการป้องกัน', d.preventive)}
            </div>
          </div>
          <div style="display:flex;flex-direction:column;gap:14px;min-height:0">
            <div style="flex:1;min-height:0"><div style="font-size:12px;font-weight:700;color:#c0392b;margin-bottom:4px">📷 ก่อนแก้ไข</div><div style="height:calc(100% - 22px)">${_pptImg(imgList.before)}</div></div>
            <div style="flex:1;min-height:0"><div style="font-size:12px;font-weight:700;color:#16a085;margin-bottom:4px">📷 หลังแก้ไข</div><div style="height:calc(100% - 22px)">${_pptImg(imgList.after)}</div></div>
          </div>
        </div>
      </div>`;
}
function _pptCell(label, val) {
    return `<div style="flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px">
        <div style="font-size:11px;color:#9ca3af">${label}</div>
        <div style="font-size:16px;font-weight:700;color:#1f2937">${val}</div></div>`;
}
function _pptBox(label, val) {
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;overflow:hidden">
        <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px">${label}</div>
        <div style="font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.4">${(val||'—').replace(/</g,'&lt;')}</div></div>`;
}
```

- [ ] **Step 3 (capture แทน fitTo16x9):** ใน `exportPDF` PNG branch (idx:5225-5247) แทนการ capture `report-content`+`fitTo16x9` ด้วย:
```javascript
        if (isPNG) {
            buildPptSlide();
            const slide = document.getElementById('ppt-slide');
            slide.style.left = '0'; // นำเข้าจอชั่วคราวให้ html2canvas เห็น (ยังอยู่หลัง content อื่น)
            const cv = await _captureNode(slide, 1600);
            slide.style.left = '-99999px';
            _download(cv.toDataURL('image/png'), `BD_${name}.png`);
            if (withGallery) {
                buildGallery('png');
                const gal = document.getElementById('photo-gallery');
                gal.style.display = 'block';
                const galCanvas = await _captureNode(gal, 1600);
                gal.style.display = 'none';
                await new Promise(r => setTimeout(r, 300));
                _download(galCanvas.toDataURL('image/png'), `BD_${name}_รูปภาพ.png`);
            }
        } else {
```
> ตรวจ `_captureNode(node, width)` signature จริง (idx ~5020) — ส่ง width 1600. ถ้า `_captureNode` ฟิกซ์ scale 2 → ได้ 3200×1800 (คมพอ PPT). ถ้าต้องการ 1920×1080 พอดี ปรับ `#ppt-slide` เป็น 1920×1080 + width 1920.

- [ ] **Step 4 (เก็บกวาด):** ลบ `fitTo16x9` ที่ไม่ใช้แล้ว (idx:5227-5237) ออกจาก branch (ถ้าไม่มีที่อื่นเรียก — Grep ก่อนลบ).

- [ ] **Step 5 (verify — iterate ด้วย preview):** เปิด record ที่มีข้อมูลครบ + รูป ก่อน/หลัง → Export PNG → ไฟล์ `BD_<ชื่อ>.png` เป็นสไลด์ **16:9 เต็มจอ ไม่มีขอบขาวเยอะ**, header + 2 คอลัมน์ (ข้อมูล/ปัญหา ซ้าย, รูป ขวา) อ่านได้. ถ้าข้อความล้นกล่อง → ปรับ font-size/`overflow` ใน builder แล้ว capture ใหม่. ตรวจฟอนต์ไทย Prompt แสดงถูก (รอ `document.fonts.ready` มีแล้วใน exportPDF idx:5219).

> **หมายเหตุ Why-Why:** layout นี้ตัด Why-Why tree ออกจากสไลด์หลัก (เน้นสรุปผู้บริหาร). ถ้า user อยากได้ Why-Why ในสไลด์ → เพิ่มสไลด์ที่ 2 หรือย่อใส่ใต้คอลัมน์ซ้าย (ถามก่อนทำเพิ่ม).

---

## Self-Review (ตรวจกับ feedback)

| feedback | Task | redeploy GAS |
|---|---|---|
| Dashboard เพี้ยนตาม filter + ปุ่ม refresh | B2 | - |
| ปิดงานไม่ได้ (ขาดปัญหา/อาการ ทั้งที่มี) | B1 | - |
| Export PNG ให้เป็นสไลด์ PPT | D1 | - |
| Checklist ดูสถานะรายเครื่อง (กะ/เดือน ตรวจหรือยัง) | C1 | ✅ (อาศัย A1) |
| QR/checklist ไม่ขึ้น list+สรุป + วันที่ ISO | A1 | ✅ |

**จุดเสี่ยงต้องอ่านโค้ดจริงก่อนแก้:** B2 (ทุกจุดที่อ้าง `_lastRecords` ใน initHubStats/goBdHub — เปลี่ยนเฉพาะ dashboard ไม่แตะหน้ารายการ), C1 (ชื่อ helper `clFillFacSelect/clFillAreaSelect/clMachinesFor/clIsPmDueInMonth/clFetch`), D1 (`_captureNode` signature + scale, ฟอนต์ Prompt ใน html2canvas, iterate layout ด้วย preview).

## Execution Handoff
ลำดับ: **A → redeploy → B1, B2 → C1 → D1**. commit ทีละ Task, push `mms main`. สลับไป **Sonnet** เริ่ม Phase A.
