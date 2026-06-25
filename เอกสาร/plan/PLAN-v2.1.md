# MMS v2.1 Implementation Plan

> **For agentic workers:** ใช้ superpowers:subagent-driven-development หรือ executing-plans รันทีละ Task. Steps ใช้ checkbox (`- [ ]`).
> **โมเดล:** Opus = วางแผน, Sonnet = ลงมือ. แผนนี้เขียนโดย Opus.
> **เลขบรรทัดเป็นค่าประมาณ ณ ตอนวางแผน** — ก่อนแก้ทุก Task ให้ `Grep` หา anchor (ชื่อฟังก์ชัน/ข้อความ) ก่อน เพราะการแก้ก่อนหน้าจะเลื่อนบรรทัด.

**Goal:** ยกระดับ MMS CPRAM CHB เป็น v2.1 — ปรับ Breakdown (รับงานเห็นรายละเอียด, log บอกว่าแก้อะไร, ปัญหาต่อท้าย `*ผู้ทำ-สถานะ` ล็อกได้, PNG ลง PowerPoint), Checklist (ตัด combobox, ปุ่มสวย, toggle Default+Custom, ปฏิทิน PM รายโรงงาน), ทะเบียน (บันทึกรายตัว+ยืนยันชื่อ), Log (tab Checklist), หน้าหลัก (เปลี่ยนข้อความ + dashboard 2 โรงงาน), และ loading overlay ทั้งระบบ.

**Architecture:** Single `index.html` (Tailwind CDN + vanilla JS) + `gas_code.gs` (Apps Script Web App). GAS คืน `{success, data}`. แก้ GAS แล้ว **redeploy** (ผู้ใช้ยืนยันแล้วว่าทำได้).

**Tech Stack:** HTML, Tailwind (CDN), vanilla JS, html2canvas, jsPDF, Google Apps Script.

**คำตอบ design ที่ยืนยันแล้ว:**
1. แก้ GAS + redeploy ได้
2. Daily merge = **2 โหมด** (toggle เปิด/ปิด รวม Default เข้ากับ Custom ต่อเครื่อง)
3. ปฏิทิน PM = **แสดงทุกเครื่องในโรงงาน** (คลิกวัน → เห็นเครื่องที่ต้องตรวจ + ปุ่มเข้าหน้าบันทึก)
4. Annotation `*ผู้ทำ - สถานะ` = **เฉพาะฟิลด์ "ปัญหาที่พบ"**, ล็อกบรรทัดเดิม เพิ่มได้เฉพาะบรรทัดใหม่

---

## ลำดับการทำ (สำคัญ)
**PHASE A (GAS) ทำก่อน → redeploy ครั้งเดียว → ค่อยทำ B–G (frontend).** ถ้าทำ frontend ที่เรียก action ใหม่ก่อน redeploy จะ error (ดู memory `gas-deploy-stale-root-cause`).

---

# PHASE A — Backend (gas_code.gs) — redeploy หลังจบ Phase นี้

### Task A1: Log บอกว่า "แก้อะไรไป" (field-level diff)

**Files:** Modify `gas_code.gs` — `doPost` update branch (~บรรทัด 69–91) + เพิ่ม helper `buildChangeDetail`.

ปัจจุบัน (บรรทัด ~89): `writeLog(ss, data.tracking, 'แก้ไข → ' + (data.status||''), data.byName, data.status);` — บอกแค่สถานะ.

- [ ] **Step 1:** เพิ่ม helper ก่อน `writeLog` (anchor: `function writeLog`):

```javascript
// เทียบแถวเดิม (prev) กับแถวใหม่ (row) → สรุปคอลัมน์ที่เปลี่ยน (อ่านง่าย, ตัดสั้น)
function buildChangeDetail(prev, row) {
  const WATCH = [6,7,8,9,10,11,12,18,19,23,31]; // index ใน HEADERS ที่อยากติดตาม (ข้ามรูป/timestamp/tracking)
  const trunc = v => { v = String(v == null ? '' : v); return v.length > 40 ? v.slice(0,40)+'…' : v; };
  const changes = [];
  WATCH.forEach(i => {
    const a = String(prev[i] == null ? '' : prev[i]);
    const b = String(row[i]  == null ? '' : row[i]);
    if (a !== b) changes.push(HEADERS[i] + ' [' + trunc(a) + '→' + trunc(b) + ']');
  });
  return changes.length ? changes.join(', ') : 'ไม่มีการเปลี่ยนฟิลด์หลัก';
}
```

- [ ] **Step 2:** ใน update branch หลัง `sheet.getRange(...).setValues([row]);` เปลี่ยนบรรทัด writeLog เป็น:

```javascript
const detail = buildChangeDetail(prev, row);
writeLog(ss, data.tracking, 'แก้ไข → ' + (data.status || '') + ' | ' + detail, data.byName, data.status);
```

- [ ] **Step 3 (verify):** หลัง redeploy (ทำใน A-final) — แก้ไข record หนึ่ง เปลี่ยนสถานะ+ปัญหา → เปิด Log modal ของ tracking นั้น เห็นข้อความมี `สถานะ [...→...], ปัญหาที่พบ [...→...]`.

---

### Task A2: บันทึกทะเบียน "รายตัว" (upsert + delete รายแถว) + log ชื่อผู้ทำ

**Files:** Modify `gas_code.gs` — เพิ่ม 2 action branch ใน `doPost` (วางถัดจาก `setMachines`/`restoreMachines` ~บรรทัด 133).

> _Machines header (จาก setMachines): `['รหัสเครื่องจักร','ชื่อเครื่องจักร','โรงงาน','พื้นที่','ไลน์','ผู้แก้ไข','แก้ไขเมื่อ']` (7 คอลัมน์).

- [ ] **Step 1:** เพิ่ม `upsertMachine`:

```javascript
// ---- UPSERT เครื่องจักรรายตัว (เพิ่ม/แก้ไข 1 แถว) — Admin ----
if (data.action === 'upsertMachine') {
  if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
    return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
  const m = data.machine || {};
  if (!String(m.id || '').trim()) return jsonOut({ success: false, error: 'ไม่มีรหัสเครื่องจักร' });
  let sh = ss.getSheetByName('_Machines');
  if (!sh) { sh = ss.insertSheet('_Machines');
    sh.getRange(1,1,1,7).setValues([['รหัสเครื่องจักร','ชื่อเครื่องจักร','โรงงาน','พื้นที่','ไลน์','ผู้แก้ไข','แก้ไขเมื่อ']]); }
  const vals = sh.getDataRange().getValues();
  let foundRow = -1;
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === String(m.id).trim().toLowerCase()) { foundRow = i+1; break; }
  }
  const rowArr = [m.id||'', m.name||'', m.factory||'', m.area||'', m.line||'', data.byName||m.editedBy||'', new Date().toISOString()];
  if (foundRow > 0) sh.getRange(foundRow,1,1,7).setValues([rowArr]);
  else              sh.appendRow(rowArr);
  writeLog(ss, '-', (foundRow>0?'แก้ไขทะเบียน — ':'เพิ่มทะเบียน — ') + (m.id||''), data.byName||'', '');
  return jsonOut({ success: true, updated: foundRow>0 });
}
```

- [ ] **Step 2:** เพิ่ม `deleteMachineRow`:

```javascript
// ---- ลบเครื่องจักรรายตัว — Admin ----
if (data.action === 'deleteMachineRow') {
  if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
    return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
  const sh = ss.getSheetByName('_Machines');
  if (!sh) return jsonOut({ success: false, error: 'ไม่พบทะเบียน' });
  const vals = sh.getDataRange().getValues();
  for (let i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === String(data.id||'').trim().toLowerCase()) {
      sh.deleteRow(i+1);
      writeLog(ss, '-', 'ลบทะเบียน — ' + (data.id||''), data.byName||'', '');
      return jsonOut({ success: true });
    }
  }
  return jsonOut({ success: false, error: 'ไม่พบรหัส ' + (data.id||'') });
}
```

- [ ] **Step 3 (verify):** หลัง redeploy — Task F2 จะเรียก action นี้; ดู _Machines sheet เปลี่ยนทีละแถว + _Log มีบรรทัด "เพิ่ม/แก้ไข/ลบทะเบียน".

---

### Task A3: เก็บ flag "รวม Default" ต่อเครื่อง (สำหรับ Daily 2 โหมด)

**Files:** Modify `gas_code.gs` — `savePmPlans` (~245), `saveMachineItems` (~323), `doGetPmPlans` (~813).

> `_PmPlans` ปัจจุบันใช้ถึง col index 12 (r[12]). เพิ่ม **col index 13 = `dailyMergeDefault`** (1/0).

- [ ] **Step 1:** ใน `doGetPmPlans` push object เพิ่มฟิลด์ (หลัง `pmEditedAt`):

```javascript
dailyMergeDefault: (r[13] === 1 || r[13] === '1' || r[13] === true),
```

- [ ] **Step 2:** ใน `saveMachineItems` (type==='daily') และ/หรือ `savePmPlans` ตอนเขียนแถว `_PmPlans` ให้เซ็ต col 14 (1-based) จาก `data.dailyMergeDefault`. หา anchor การเขียน row ของ _PmPlans (UPSERT) แล้วต่อค่า:
  - ถ้าโค้ดสร้าง array `row = [...]` ก่อน setValues → push `data.dailyMergeDefault ? 1 : 0` ที่ตำแหน่ง index 13 (เก็บค่าเดิมถ้า undefined: `prevRow[13]`).
  - **สำคัญ:** อ่านโครงสร้างจริงของ savePmPlans/saveMachineItems ก่อน (ทั้งสองแชร์ชีต `_PmPlans`) เพื่อไม่ทับคอลัมน์ items. คง logic UPSERT เดิมที่ "preserves item cols".

- [ ] **Step 3 (verify):** หลัง redeploy + Task E3 — ติ๊ก toggle merge บนเครื่องหนึ่ง บันทึก รีเฟรช → `getPmPlans` คืน `dailyMergeDefault:true`.

---

### Task A-final: Redeploy GAS

- [ ] วาง `gas_code.gs` ที่แก้แล้วใน script.google.com → **Deploy → Manage deployments → Edit (ดินสอ) → Version: New version → Deploy** (ใช้ deployment เดิม URL ไม่เปลี่ยน).
- [ ] **Verify deploy ใหม่ติด:** login admin ในแอป → ถ้า `upsertMachine` ใช้ได้ (Task F2) แปลว่า deploy ใหม่แล้ว. (อาการ deploy ค้าง = action ใหม่คืน "unknown action" — ดู memory `gas-deploy-stale-root-cause`.)

---

# PHASE B — ทั้งระบบ

### Task B1: Loading overlay (theme เดียวกับระบบ)

**Files:** Modify `index.html` — เพิ่ม overlay HTML (ใต้ `<div id="app-content">` หรือใกล้ `#toast`), CSS, และ helper `showLoading/hideLoading`. แล้วครอบ fetch หลัก.

- [ ] **Step 1:** เพิ่ม HTML (วางใกล้ `#toast`, นอก app-content ก็ได้):

```html
<div id="loading-overlay" class="hidden">
  <div class="lo-card">
    <div class="lo-spin"></div>
    <p id="loading-text" class="lo-text">กำลังโหลดข้อมูล…</p>
  </div>
</div>
```

- [ ] **Step 2:** เพิ่ม CSS (ใน `<style>`), ใช้โทน `--mms-red`:

```css
#loading-overlay { position:fixed; inset:0; z-index:300; display:flex; align-items:center;
  justify-content:center; background:rgba(24,24,27,.55); backdrop-filter:blur(2px); }
#loading-overlay.hidden { display:none; }
.lo-card { background:#fff; border-radius:var(--mms-radius); padding:26px 34px; box-shadow:var(--mms-shadow);
  display:flex; flex-direction:column; align-items:center; gap:14px; }
.lo-spin { width:42px; height:42px; border-radius:50%; border:4px solid #f0e0de;
  border-top-color:var(--mms-red); animation:lo-rot .8s linear infinite; }
@keyframes lo-rot { to { transform:rotate(360deg); } }
.lo-text { font-size:.85rem; font-weight:700; color:var(--mms-text); }
```

- [ ] **Step 3:** เพิ่ม helper (ใกล้ `showToast`):

```javascript
let _loadingCount = 0;
function showLoading(msg) {
  _loadingCount++;
  const t = document.getElementById('loading-text'); if (t && msg) t.textContent = msg;
  document.getElementById('loading-overlay')?.classList.remove('hidden');
}
function hideLoading(force) {
  _loadingCount = force ? 0 : Math.max(0, _loadingCount - 1);
  if (_loadingCount === 0) document.getElementById('loading-overlay')?.classList.add('hidden');
}
```

- [ ] **Step 4:** ครอบ loader หลักด้วย try/finally — อย่างน้อย: `loadRecords`, `loadSummary`, `loadMachineMaster`, `loadMachines`, `loadClSchedule`, `initClCalendar/renderClCalendar`, `goClForm`, การ submit (`confirmAddData`, `confirmAccept`, `saveChecklistForm`). รูปแบบ:

```javascript
showLoading('กำลังโหลด…');
try { /* fetch เดิม */ } finally { hideLoading(); }
```
ใช้ counter กันซ้อน (หลาย fetch พร้อมกัน). อย่าครอบ fetch แบบ `no-cors` ที่ไม่รอผล (เช่น accept เดิม) เกินจำเป็น — ใส่ showLoading ก่อน reload ก็พอ.

- [ ] **Step 5 (verify):** preview → กดเข้าหน้ารายการ/Summary → เห็น overlay หมุนแล้วหาย; ไม่มี overlay ค้าง.

---

### Task B2: Bump version → v2.1

**Files:** Modify `index.html` — `EXPORT_VER`.

- [ ] Grep `EXPORT_VER` → แก้ค่าเป็น `'v2.1'` (หรือรูปแบบเดิม + 2.1). Verify: ป้ายมุมล่างขวาโชว์ v2.1.

---

# PHASE C — หน้าหลัก

### Task C1: เปลี่ยนข้อความหัวเรื่อง

**Files:** Modify `index.html` — Hub Header (~บรรทัด 470–478, anchor: `ระบบจัดการเครื่องจักร`).

- [ ] เปลี่ยน `<h1>ระบบจัดการเครื่องจักร</h1>` → `Machine Management System`.
- [ ] เปลี่ยน subtitle `CPRAM Chonburi — Plant Management` → `CPRAM Chonburi`.
- [ ] Verify: หน้าหลักโชว์ข้อความใหม่.

---

### Task C2: Dashboard 2 โรงงาน (กำลังใช้งาน vs Breakdown)

**Files:** Modify `index.html` — บล็อก stats หน้าหลัก (~บรรทัด 484–503) + `initHubStats` (~3295).

> โรงงานในทะเบียน = `"โรงงาน 1"` / `"โรงงาน 2"` (machineMaster.factory). เครื่อง "Breakdown ตอนนี้" = มี record สถานะยังไม่ปิด/ยกเลิก (`รอรับงาน/รับงานแล้ว/กำลังดำเนินการแก้ไข/รออะไหล่`) — นับ **machineId ไม่ซ้ำ**. "กำลังใช้งาน" = เครื่องทั้งหมดในโรงงาน − เครื่องที่ Breakdown.

- [ ] **Step 1:** แทนการ์ด stats 4 ใบเดิม ด้วย 2 การ์ดต่อโรงงาน (รวม 2 โรงงาน). โครง:

```html
<div class="grid grid-cols-1 md:grid-cols-2 gap-5" id="hub-fac-dash">
  <!-- ต่อโรงงาน: card -->
  <div class="bg-white rounded-xl border border-gray-200 p-5">
    <p class="text-sm font-bold text-gray-700 mb-3">🏭 โรงงาน 1</p>
    <div class="grid grid-cols-2 gap-3">
      <div class="rounded-lg p-3 text-center" style="background:#eafaf1">
        <p class="text-2xl font-bold" style="color:var(--mms-green)" id="dash-f1-run">—</p>
        <p class="text-xs text-gray-500 mt-1">กำลังใช้งาน</p>
      </div>
      <div class="rounded-lg p-3 text-center" style="background:#fdeceа">
        <p class="text-2xl font-bold" style="color:var(--mms-red)" id="dash-f1-bd">—</p>
        <p class="text-xs text-gray-500 mt-1">Breakdown</p>
      </div>
    </div>
  </div>
  <!-- ทำซ้ำสำหรับโรงงาน 2: id dash-f2-run / dash-f2-bd -->
</div>
```

- [ ] **Step 2:** ใน `initHubStats` คำนวณต่อโรงงาน:

```javascript
function facStats(facName) {
  const machines = machineList.filter(m => (m.factory||'') === facName);
  const totalMc  = machines.length;
  const ACTIVE = new Set(['รอรับงาน','แจ้ง Breakdown','รับงานแล้ว','กำลังดำเนินการแก้ไข','กำลังดำเนินการ','รออะไหล่']);
  const bdIds = new Set(
    _lastRecords.filter(r => (r.factory||'') === facName && ACTIVE.has(r.status))
                .map(r => r.machineId || r.machineName).filter(Boolean));
  const bd = bdIds.size;
  return { run: Math.max(0, totalMc - bd), bd };
}
// ใช้:
const f1 = facStats('โรงงาน 1'), f2 = facStats('โรงงาน 2');
document.getElementById('dash-f1-run').textContent = f1.run;
document.getElementById('dash-f1-bd').textContent  = f1.bd;
document.getElementById('dash-f2-run').textContent = f2.run;
document.getElementById('dash-f2-bd').textContent  = f2.bd;
```

> **หมายเหตุข้อมูล:** record.factory อาจเก็บเป็น `"โรงงาน 1"` (ฟอร์มเต็ม value=`"โรงงาน 1"`) หรือ `"1"` (ฟอร์มย่อ value=`"1"`). ตรวจค่าจริงจาก `_lastRecords[0].factory` ก่อน; ถ้าเป็น `"1"/"2"` ให้ map (`'1'→'โรงงาน 1'`). จับคู่ด้วย `machineId` เป็นหลักจะแม่นกว่า factory string.

- [ ] **Step 3 (verify):** preview หน้าหลัก (มี GAS URL + records) → เห็น 2 การ์ดโรงงาน ตัวเลข run/bd รวมกัน = จำนวนเครื่องในโรงงานนั้น.

---

# PHASE D — Breakdown

### Task D1: รับงาน → เห็นรายละเอียดที่แจ้ง

**Files:** Modify `index.html` — Accept modal HTML (~บรรทัด 1450–1470, anchor `accept-tracking-display`) + `acceptRecord` (~2842).

ปัจจุบัน modal โชว์แค่ tracking + machineName. เพิ่มกล่องรายละเอียด (อ่านอย่างเดียว) จาก object `item` ที่ส่งเข้ามา (มี problem, device, factory, area, bdStart, bdType, ผู้แจ้ง ฯลฯ — เป็น record เดียวกับ records table).

- [ ] **Step 1:** เพิ่ม `<div id="accept-detail" ...>` ใน modal (เหนือช่องกรอกชื่อผู้รับงาน).
- [ ] **Step 2:** ใน `acceptRecord(item)` เติมรายละเอียดก่อนเปิด modal:

```javascript
document.getElementById('accept-detail').innerHTML = `
  <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-1.5 mb-4">
    <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">เครื่องจักร</span><span class="col-span-2 font-bold">${item.machineName||'—'} <span class="text-gray-400 font-normal">${item.machineId||''}</span></span></div>
    <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">โรงงาน/พื้นที่</span><span class="col-span-2">${item.factory||'—'} / ${item.area||'—'}</span></div>
    <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">เวลาเริ่ม</span><span class="col-span-2">${(item.bdStart||'').replace('T',' ')||'—'}</span></div>
    <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">ประเภท</span><span class="col-span-2">${item.bdType||'—'}</span></div>
    <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">ปัญหาที่พบ</span><span class="col-span-2 text-gray-800">${(item.problem||'—')}</span></div>
    ${item.device?`<div class="grid grid-cols-3 gap-1"><span class="text-gray-500">อุปกรณ์</span><span class="col-span-2">${item.device}</span></div>`:''}
  </div>`;
```
(escape ค่าด้วย helper `esc` ที่มีอยู่ ถ้าจำเป็น)

- [ ] **Step 3 (verify):** login engineer → รายการ → กด "รับงาน" → modal โชว์ปัญหา/อุปกรณ์/เวลา/โรงงาน ครบ.

---

### Task D2: "ปัญหาที่พบ" ต่อท้าย `*ผู้ทำ - สถานะ` + ล็อกบรรทัดเดิม

**Files:** Modify `index.html` — โครง field ปัญหา (~1219–1225, anchor `inp-problem`), `collectFormData` (หา `problem:`), `loadForm`/`openEditMode` (หา `inp-problem` ตอน populate), `confirmAddData` (~4021).

**แนวคิด:** เก็บใน col "ปัญหาที่พบ" เป็นหลายบรรทัด แต่ละบรรทัด = `<ข้อความ> *<ผู้ทำ> - <สถานะการกระทำ>`. บรรทัดที่บันทึกแล้ว **ล็อก** (แสดงอ่านอย่างเดียว) แก้ได้เฉพาะการ "เพิ่มบรรทัดใหม่".

- [ ] **Step 1 (UI):** แทน `<textarea id="inp-problem">` เดี่ยว ด้วย 2 ส่วน:
  - `<div id="problem-locked">` — render บรรทัดเดิม (อ่านอย่างเดียว, จาง) จากค่า record.
  - `<textarea id="inp-problem-new">` — บรรทัดใหม่ที่กำลังพิมพ์ (placeholder "เพิ่มรายละเอียดปัญหา…").

- [ ] **Step 2 (state):** เพิ่มตัวแปร `let _problemLocked = '';` เก็บข้อความเดิมทั้งก้อน.
  - ใน `loadForm`/`openEditMode` ตอน populate ปัญหา: `_problemLocked = item.problem || ''; renderProblemLocked();` (โหมดแจ้งใหม่ `report` → `_problemLocked=''`).
  - `renderProblemLocked()` แสดงแต่ละบรรทัดของ `_problemLocked` เป็น chip/▸ อ่านอย่างเดียว (ถ้าว่าง → ซ่อนกล่อง).

- [ ] **Step 3 (label สถานะการกระทำ):** map stage → คำ:

```javascript
function problemStageLabel() {
  if (formStage === 'report')  return 'แจ้ง Breakdown';
  if (formStage === 'manual')  return 'สร้างเอกสาร';
  if (formStage === 'whyedit') return 'แก้ไข Why-Why';
  return 'แก้ไขเอกสาร';
}
```

- [ ] **Step 4 (ประกอบตอนบันทึก):** ใน `collectFormData` (หรือใน `confirmAddData` ก่อนยิง) ประกอบค่า problem สุดท้าย:

```javascript
function composeProblem(byName) {
  const fresh = (document.getElementById('inp-problem-new')?.value || '').trim();
  const line  = fresh ? `${fresh} *${byName || 'ไม่ระบุ'} - ${problemStageLabel()}` : '';
  return [_problemLocked, line].filter(Boolean).join('\n');
}
```
  - `byName` รู้ตอน `confirmAddData` (ช่อง confirm-name). ดังนั้นประกอบใน `confirmAddData`: `data.problem = composeProblem(byName);` ก่อนส่ง (override ค่า problem จาก collectFormData).
  - **validation:** โหมด `report` ต้องมี `inp-problem-new` ไม่ว่าง (แทน check `d.problem` เดิมที่บรรทัด ~3975).

- [ ] **Step 5 (verify):** แจ้งใหม่ปัญหา "มอเตอร์เสีย" โดย Udom → ค่าเก็บ `มอเตอร์เสีย *Udom - แจ้ง Breakdown`. เปิดแก้ไขเพิ่ม "เปลี่ยนเฟือง" โดยนิว → กลายเป็น 2 บรรทัด, บรรทัดแรกล็อก/อ่านอย่างเดียว, บรรทัดสอง `เปลี่ยนเฟือง *นิว - แก้ไขเอกสาร`.

> **หมายเหตุ:** ปัญหานี้โชว์ในรายงาน/PDF ด้วย — ตรวจว่า render หลายบรรทัดไม่พัง layout (ใช้ `white-space:pre-line`).

---

### Task D3: Export PNG ลง PowerPoint ได้พอดี (16:9)

**Files:** Modify `index.html` — `doExportPDF` PNG branch (~4793–4870, anchor `isPNG`).

ปัจจุบัน PNG = render `#report-content` ตามขนาดจริง (A4 portrait-ish). PowerPoint slide = 16:9. เป้าหมาย: ออก PNG ที่ "ลากวางเต็มสไลด์" ได้ทันที.

- [ ] **Step 1:** สำหรับ PNG ให้ render ลง canvas เป้าหมายอัตราส่วน **16:9** (เช่น 1920×1080). วิธี: html2canvas ตามเนื้อหาเดิม → แล้ววาดผลลง canvas 1920×1080 พื้นขาว จัด "contain" กึ่งกลาง (ไม่บิดสัดส่วน, ขอบขาว). 

```javascript
// หลังได้ canvas เนื้อหา (src) แล้ว สำหรับ isPNG:
const W = 1920, H = 1080;
const out = document.createElement('canvas'); out.width = W; out.height = H;
const g = out.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0,0,W,H);
const s = Math.min(W / src.width, H / src.height);
const dw = src.width * s, dh = src.height * s;
g.drawImage(src, (W-dw)/2, (H-dh)/2, dw, dh);
const url = out.toDataURL('image/png');
// download url เป็น .png (ใช้ชื่อไฟล์เดิม + .png)
```

- [ ] **Step 2:** อัปเดตข้อความ helper ใน PDF picker (~บรรทัด 247) ให้ตรง: "PNG = ขนาด 16:9 วางเต็มสไลด์ PowerPoint ได้เลย".
- [ ] **Step 3 (verify):** เปิด record ที่ปิดงานแล้ว → Export → PNG → ไฟล์เป็น 1920×1080, เนื้อหา contain กึ่งกลาง พื้นขาว; ลองวางใน PowerPoint เต็มสไลด์พอดี.

> ถ้าเนื้อหาแนวตั้งมาก (เกิน 16:9) จะมีขอบขาวซ้าย-ขวาเยอะ — รับได้ตาม spec ("ปรับขนาดให้พอดีหน้า PPT"). ทางเลือก: ปรับ layout `#report-content` ตอน capture ให้กว้างขึ้น (2 คอลัมน์) ผ่าน class ชั่วคราว ถ้าผู้ใช้อยากเต็มกว่านี้.

---

# PHASE E — Checklist

### Task E1: ตัด combobox เลือกประเภท (fix ตามการ์ด)

**Files:** Modify `index.html` — `clf-type` select (~บรรทัด 757) + `goClForm` (~5147) + จุดที่อ่าน `clf-type` (~5183, 5297, 5329).

`goClForm('daily'|'pm')` ถูกเรียกจากการ์ด (บรรทัด 712/717) และเซ็ต `clf-type.value` อยู่แล้ว. แค่ซ่อน combobox แล้วโชว์เป็น label.

- [ ] **Step 1:** แทน `<select id="clf-type" onchange="clfTypeChange()">` ด้วย badge อ่านอย่างเดียว + เก็บค่า type ใน hidden:
```html
<input type="hidden" id="clf-type">
<span id="clf-type-label" class="inline-block px-3 py-1 rounded-full text-xs font-bold"></span>
```
- [ ] **Step 2:** ใน `goClForm(type)` หลังเซ็ต `clf-type.value=type` เพิ่ม:
```javascript
const lbl = document.getElementById('clf-type-label');
lbl.textContent = type === 'pm' ? '🔧 PM Checklist' : '✅ ตรวจประจำวัน';
lbl.className = 'inline-block px-3 py-1 rounded-full text-xs font-bold ' +
  (type==='pm' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700');
```
- [ ] **Step 3:** จุดที่อ่าน `document.getElementById('clf-type').value` ยังใช้ได้ (hidden input). ลบ/ปล่อย `clfTypeChange` (ถ้าไม่มีที่เรียกอื่น). 
- [ ] **Step 4 (verify):** เข้า cl-hub → กดการ์ด "ตรวจประจำวัน" → ฟอร์มโชว์ badge เขียว ไม่มี dropdown; กดการ์ด PM → badge น้ำเงิน. บันทึกแล้ว type ถูกต้อง.

---

### Task E2: ปุ่มแก้ไข/คัดลอก (schedule) ใช้ธีมเหมือนทะเบียน + มี label

**Files:** Modify `index.html` — `renderClScDaily` (~5776–5777) + `renderClScPm` (~5812–5813).

ธีมอ้างอิง (ปุ่มแก้ไขทะเบียน ~2361): `px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg`.

- [ ] **Step 1 (daily):** แทนปุ่ม emoji ด้วย:
```javascript
${canEdit ? `<button onclick="openClItemsEditor('per-machine-daily','${id}')" class="px-2.5 py-1 text-xs font-bold bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors">✏️ แก้ไข</button>` : ''}
${canEdit ? `<button onclick="openClCopyModal('daily','${id}')" class="px-2.5 py-1 text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors">📋 คัดลอก</button>` : ''}
```
- [ ] **Step 2 (pm):** เช่นเดียวกัน (ปุ่มแก้ไข PM ใช้ `bg-blue-50 text-blue-600`, คัดลอก `bg-indigo-50`), label `✏️ แก้ไข` / `📋 คัดลอก`. ปรับ `<td>` ให้ `flex gap-2 justify-center`.
- [ ] **Step 3 (verify):** หน้า Checklist schedule (daily & PM) → ปุ่มมีกรอบพื้นหลังสี + ตัวหนังสือ "แก้ไข"/"คัดลอก".

---

### Task E3: Daily — toggle "รวม Default เข้ากับ Custom" (2 โหมด)

**Files:** Modify `index.html` — popup editor per-machine-daily (`openClItemsEditor`/HTML รอบ `mcie-pm-settings`), `saveClItemsEditor` (per-machine-daily branch ~5993), ตัวสร้างรายการ daily ในฟอร์ม checklist (จุดที่ใช้ `clGetDailyItems`), `clGetDailyItems` (~5058). + ใช้ฟิลด์ `dailyMergeDefault` จาก Task A3.

- [ ] **Step 1 (UI):** ในป๊อปอัปแก้ไข **per-machine-daily** เพิ่ม checkbox:
```html
<label id="mcie-daily-merge-wrap" class="hidden flex items-center gap-2 px-5 py-2 text-sm">
  <input type="checkbox" id="mcie-daily-merge"> รวมรายการ Default เข้ากับรายการ Custom
</label>
```
แสดงเฉพาะ mode `per-machine-daily` (ซ่อนใน mode อื่น เหมือน `mcie-pm-settings`). ตอนเปิด: `mcie-daily-merge.checked = !!(_clPmPlans[machineId]?.dailyMergeDefault)`.

- [ ] **Step 2 (save):** ใน `saveClItemsEditor` per-machine-daily — ส่ง `dailyMergeDefault` ไปกับ `saveMachineItems` (และ/หรือ savePmPlans ที่เขียน _PmPlans). อัปเดต cache: `_clPmPlans[machineId].dailyMergeDefault = merge;`.

- [ ] **Step 3 (consume):** เพิ่ม helper รวมรายการ:
```javascript
function clResolveDailyItems(machineId) {
  const plan = _clPmPlans[machineId] || {};
  const custom = (Array.isArray(plan.dailyItems) && plan.dailyItems.length) ? plan.dailyItems : [];
  const def    = _clDailyDefault.length ? _clDailyDefault : CL_DAILY_DEFAULT;
  if (!custom.length) return def;                 // ไม่มี custom → ใช้ default
  if (plan.dailyMergeDefault) {                   // โหมดรวม → default + custom (กัน id ซ้ำ)
    const seen = new Set(custom.map(i => i.id || i.label));
    return [...def.filter(i => !seen.has(i.id || i.label)), ...custom];
  }
  return custom;                                  // โหมดไม่รวม → custom อย่างเดียว
}
```
แล้วในฟอร์ม checklist daily ที่เดิมเรียก `clGetDailyItems(id)` (ตัดสินใจ default vs custom) ให้เปลี่ยนมาใช้ `clResolveDailyItems(id)`.

- [ ] **Step 4 (verify):** เครื่องที่มี custom 3 ข้อ + default 5 ข้อ: toggle OFF → ฟอร์มโชว์ 3; toggle ON บันทึก → ฟอร์มโชว์ 8 (ไม่ซ้ำ).

---

### Task E4: PM Calendar รายโรงงาน (คลิกวันเห็นเครื่อง + กำหนดวันแบบรวม + เลื่อนวันยืนยัน)

**Files:** Modify `index.html` — calendar HTML (panel-cl-calendar ~บรรทัด 837–873), `initClCalendar`/`renderClCalendar`/`clCalClickDay`/`openClSetDates`/`saveClPmDates` (~5543–5665), modal `modal-cl-set-dates` (~รอบ 1590). ใช้ `getPmDates({monthKey})` คืนทั้งเดือนทุกเครื่อง.

> เปลี่ยน paradigm: จาก "เลือก 1 เครื่อง" → "เลือกโรงงาน/พื้นที่ แล้วเห็นทุกเครื่อง". ตัวเลือกเครื่องเดิม (`clcal-machine`) เปลี่ยนเป็น filter ไม่บังคับ.

- [ ] **Step 1 (state):** เพิ่ม `_clCalAllPmDates = {}` (map key→days สำหรับทั้งเดือน). 

- [ ] **Step 2 (โหลดทั้งเดือน):** ใน `renderClCalendar` (factory-wide):
```javascript
const ym = `${_clCalYear}-${String(_clCalMonth+1).padStart(2,'0')}`;
const pd = await clFetch({ action:'getPmDates', monthKey: ym });
_clCalAllPmDates = pd.data || {};                  // { "<id>_YYYY-MM": "1,15" }
const fac  = document.getElementById('clcal-fac')?.value || '';
const area = document.getElementById('clcal-area')?.value || '';
const machines = clMachinesFor(fac, area);          // เครื่องในขอบเขต
// map day -> [machineId...]
const dayMap = {};                                   // {12:[id,id], 20:[id]}
machines.forEach(m => {
  const id = m.id || m.machineId || '';
  const days = String(_clCalAllPmDates[`${id}_${ym}`] || '').split(',').map(Number).filter(Boolean);
  days.forEach(d => { (dayMap[d] = dayMap[d] || []).push(id); });
});
```
แต่ละช่องวันโชว์ badge จำนวนเครื่อง (`dayMap[d]?.length`).

- [ ] **Step 3 (คลิกวัน):** `clCalClickDay(day)` → เปิด modal ใหม่ `modal-cl-day` แสดงรายการเครื่องของ `dayMap[day]` (ชื่อ+รหัส) แต่ละแถวมีปุ่ม **"บันทึก PM"** → `goClForm('pm')` พร้อม prefill เครื่อง+วันที่:
```javascript
function clCalGoPm(machineId, dateStr) {
  goClForm('pm');
  // prefill: เซ็ต factory/area/machine ในฟอร์ม checklist + วันที่ = dateStr
  // (อ่านโครง goClForm/saveChecklistForm หา id ช่องเครื่อง/วันที่ แล้วเซ็ตค่า)
}
```
> ต้องดูโครงฟอร์ม checklist (cl-form) ว่ามีช่องเลือกเครื่อง/วันที่ id อะไร เพื่อ prefill ให้ครบ ("ใส่ข้อมูลเรียบร้อย" ตาม spec).

- [ ] **Step 4 (ปุ่มกำหนดวัน PM แบบรวม + นับ):** เพิ่มปุ่ม "📅 กำหนดวัน PM (เดือนนี้)" เหนือปฏิทิน + ป้ายนับ:
  - `กำหนดแล้ว X / ยังไม่กำหนด Y` โดย X = จำนวนเครื่องในขอบเขตที่มี days เดือนนี้, Y = ที่เหลือ.
  - เปิด modal ตารางทุกเครื่อง: แต่ละแถว = เครื่อง + ช่องกรอก/เลือกวัน (เช่น input หลายวัน หรือปุ่มเปิด day-picker ต่อเครื่อง). สถานะ "กำหนดแล้ว/ยัง".
- [ ] **Step 5 (เลื่อนวัน + ยืนยัน):** การแก้วันของเครื่องที่ "กำหนดแล้ว" = ถือเป็นการเลื่อน → ก่อนบันทึกต้อง `confirm()`/modal ยืนยัน ("ยืนยันเลื่อนวัน PM ของ <id> จาก ... เป็น ...?"). บันทึกผ่าน `savePmDates` (action เดิม, upsert ทีละ key) — ส่งได้หลาย key รวด: `{ dates: { 'id1_YYYY-MM':'12', 'id2_YYYY-MM':'20,21' } }`.
- [ ] **Step 6 (verify):** เลือกโรงงาน 1 → ปฏิทินโชว์ badge จำนวนเครื่องในแต่ละวันที่มี PM; คลิกวัน → เห็นรายชื่อเครื่อง + ปุ่มบันทึก PM (กดแล้วเข้า cl-form PM พร้อมข้อมูล); ปุ่มกำหนดวันโชว์ "กำหนดแล้ว/ยัง"; แก้วันเครื่องเดิม → เด้งยืนยันก่อนเซฟ.

> Task นี้ใหญ่สุด — แนะนำแตกเป็น sub-commit: (a) factory-wide render + badge, (b) คลิกวัน modal + prefill, (c) ปุ่มกำหนดวันรวม + นับ + ยืนยันเลื่อน.

---

# PHASE F — ทะเบียนเครื่องจักร

### Task F1: ปุ่มลบมี label (เหมือนปุ่มแก้ไข)

**Files:** Modify `index.html` — `renderMachTable` ปุ่มลบ (~2363).

- [ ] เปลี่ยน `>🗑️</button>` เป็น label เต็ม:
```javascript
<button onclick="machDeleteRow(${i})" title="ลบ"
  class="px-2.5 py-1 text-xs font-bold bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-colors">🗑️ ลบ</button>
```
- [ ] Verify: คอลัมน์จัดการมีปุ่ม "✏️ แก้ไข" + "🗑️ ลบ" ขนาดเท่ากัน.

---

### Task F2: บันทึกรายตัว (เอา "บันทึกทั้งหมด" ออก) + ยืนยันชื่อผู้กระทำทุกครั้ง

**Files:** Modify `index.html` — ปุ่ม "บันทึกทั้งหมด" (~2030/2076), `machSaveModal` (~2442), `machDeleteRow` (~2482). ใช้ action `upsertMachine`/`deleteMachineRow` จาก Task A2. ต้อง redeploy แล้ว.

- [ ] **Step 1:** ลบปุ่ม `💾 บันทึกทั้งหมด` (anchor บรรทัด 2030 `onclick="saveMachines()"`). (คง `saveMachines` ไว้ใช้กับ import bulk ได้ หรือเก็บไว้เฉพาะหน้า import.)

- [ ] **Step 2 (edit/add → บันทึกทันที):** `machSaveModal` มีช่อง `mc-editor` (ชื่อผู้แก้ไข) อยู่แล้ว = "ยืนยันชื่อผู้กระทำ". เปลี่ยนให้ยิง `upsertMachine` ทันทีแทนแก้ array เฉยๆ:
```javascript
// หลัง validate ครบ (รวม editedBy):
const rec = { id, name, factory: fac, area, line };
try {
  showLoading('กำลังบันทึก…');
  const res = await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
    body: JSON.stringify({ action:'upsertMachine', pw: sessionPw, machine: rec, byName: editedBy }) });
  const json = await res.json();
  if (!json.success) { showToast('บันทึกล้มเหลว: ' + (json.error||''), 'error'); return; }
  // sync local
  const idx2 = machineMaster.findIndex(m => String(m.id).toLowerCase() === id.toLowerCase());
  const full = { ...rec, editedBy, editedAt: new Date().toISOString() };
  if (idx2 >= 0) Object.assign(machineMaster[idx2], full); else machineMaster.unshift(full);
  closeMcModal(); renderMachTable();
  showToast('✅ บันทึกเครื่องจักรแล้ว', 'success');
} finally { hideLoading(); }
```
(เอาข้อความ "กด บันทึกทั้งหมด" ออก)

- [ ] **Step 3 (delete → ยืนยันชื่อ + บันทึกทันที):** เปลี่ยน `machDeleteRow` จาก `confirm()` เป็น modal ยืนยันที่มีช่อง **ชื่อผู้ลบ** (บังคับ) แล้วยิง `deleteMachineRow`:
  - เพิ่ม modal `modal-mach-del` (ข้อความ + `<input id="mach-del-by">` + ปุ่มยืนยัน).
  - ยืนยัน → ต้องมีชื่อ → `fetch deleteMachineRow {id, byName, pw}` → สำเร็จ → `machineMaster.splice` + render + toast. (ครอบ showLoading/hideLoading)

- [ ] **Step 4 (verify):** login admin → แก้ไขเครื่อง → บันทึก → รีโหลดหน้ายังอยู่ (เพราะลง sheet จริง, ไม่ต้องกดบันทึกทั้งหมด); ลบเครื่อง → ต้องกรอกชื่อก่อน → _Log มี "ลบทะเบียน — <id>" + ชื่อ; ดู _Machines sheet เปลี่ยนเฉพาะแถวนั้น.

> **กันพลาด:** ทุก path ต้องเช็ค `userRole==='admin'` + `GAS_URL` ก่อนยิง (มีอยู่บางจุดแล้ว — คงไว้).

---

# PHASE G — Log

### Task G1: เพิ่ม tab "Checklist" ในหน้า Log + ผูกข้อมูล

**Files:** Modify `index.html` — Log panel HTML (panel-log ~บรรทัด 525–585), `switchLogTab` (~3138), loader (~3155–3181), + ฟังก์ชัน render ใหม่ `renderClLog`.

> `?action=getLog` (ไม่มี tracking) คืน **ทุกแถว** ของ `_Log`. checklist actions มีอยู่แล้ว (เช่น `บันทึก Checklist daily`, `แก้ไข Daily Default items`, `บันทึกแผน PM (...)`, `Copy ... items`, `แก้ไข PM items — <id>`) — ส่วนใหญ่ tracking = `'-'`. กรองฝั่ง client, **ไม่ต้องแก้ GAS**.

- [ ] **Step 1 (tab UI):** เพิ่มปุ่ม tab ที่ 3 "✅ Checklist" + `<div id="log-panel-cl" class="hidden">` (ตารางคล้าย bd: เวลา/การกระทำ/ผู้ดำเนินการ).
- [ ] **Step 2 (switch):** ใน `switchLogTab` toggle `log-panel-cl` + เรียก `renderClLog()` เมื่อ tab==='cl'.
- [ ] **Step 3 (กรอง):** ใช้ `_allBdLog` (โหลดอยู่แล้ว) แยกหมวด:
```javascript
const CL_KEYS = ['Checklist','Daily','PM items','แผน PM','Copy','Default'];
function isClLog(row) {                  // row = [เวลา, tracking, การกระทำ, ผู้ทำ, สถานะ]
  const act = String(row[2] || row.action || '');
  return CL_KEYS.some(k => act.includes(k));
}
```
  - **สำคัญ:** ตรวจรูปแบบ row ที่ `getLog` คืน (array หรือ object?) จาก `doGetLog` (~755) ก่อนเขียน accessor. ปรับ `renderClLog` ให้ filter `_allBdLog.filter(isClLog)` แล้ว render.
  - (ทางเลือก) แท็บ "Breakdown" ให้กรอง **ไม่ใช่** checklist (`!isClLog`) เพื่อให้ 2 แท็บไม่ปนกัน — ตรวจ behavior เดิมก่อนเปลี่ยน.
- [ ] **Step 4 (verify):** login admin → Log → แท็บ Checklist → เห็นรายการบันทึก/แก้ไข checklist+PM+copy พร้อมชื่อผู้ทำ-เวลา; แท็บ Breakdown ไม่ปน checklist.

---

## Self-Review (ตรวจแผนกับ spec)

| spec ข้อ | Task |
|---|---|
| รับงานเห็นรายละเอียด | D1 |
| log แก้ไขบอกว่าแก้อะไร | A1 |
| ปัญหาที่พบ `*ผู้ทำ-สถานะ` ล็อก | D2 |
| Export PNG ลง PPT | D3 |
| ตัด combobox checklist | E1 |
| ปุ่มแก้ไข/คัดลอกสวย+label | E2 |
| ปฏิทิน PM: คลิกวันเห็นเครื่อง+ปุ่มบันทึก | E4 |
| ปฏิทิน PM: กำหนดวันรวม+นับ+เลื่อนยืนยัน | E4 |
| Daily รวม Default+Custom (2 โหมด) | A3+E3 |
| Log tab Checklist | G1 |
| ทะเบียน: ปุ่มลบมี label | F1 |
| ทะเบียน: บันทึกรายตัว | A2+F2 |
| ทะเบียน: ทุกการเปลี่ยน/ลบ ยืนยันชื่อ | F2 |
| หน้าหลัก: เปลี่ยนข้อความ | C1 |
| หน้าหลัก: dashboard 2 โรงงาน | C2 |
| ทั้งระบบ: loading overlay | B1 |
| version v2.1 | B2 |

**ครบทุกข้อ.** จุดเสี่ยง/ต้องอ่านโค้ดจริงก่อนแก้: A3 (โครงเขียน _PmPlans ห้ามทับ item cols), D2 (loadForm/PDF render หลายบรรทัด), E4 (โครงฟอร์ม cl-form เพื่อ prefill), G1 (รูปแบบ row ของ getLog).

---

## Execution Handoff

**แนะนำลำดับ:** A (ทั้งหมด) → **redeploy** → B → C → D → E → F → G. commit ทีละ Task. push `mms main`.

**v2.1 = งานใหญ่** — เหมาะทำแบบ subagent-driven (1 subagent / Task, review ระหว่าง Task) หรือ executing-plans แบบ batch มี checkpoint. สลับไป **Sonnet** แล้วเริ่ม Phase A.

---

# PHASE H — Nav / UI polish (เล็ก, อิสระจาก Phase A — ทำได้ทันที ไม่ต้อง redeploy)

### Task H1: PM table — Font "PM ถัดไป" ให้เท่ากับ "เริ่มต้น PM"

**Files:** Modify `index.html` — `renderClScPm` cell `${next}` (~บรรทัด 5806).

ปัจจุบัน: `เริ่มต้น PM` = `text-sm text-gray-700`, `PM ถัดไป` = `text-xs text-gray-600` → ไม่เท่ากัน.

- [ ] เปลี่ยน cell `${next}`:
```javascript
// เดิม
<td class="px-3 py-2.5 text-center text-xs text-gray-600">${next}</td>
// เป็น (เท่ากับเริ่มต้น PM)
<td class="px-3 py-2.5 text-center text-sm text-gray-700">${next}</td>
```
- [ ] Verify: คอลัมน์ "เริ่มต้น PM" และ "PM ถัดไป" ขนาด/สีตัวอักษรเท่ากัน.

---

### Task H2: Sidebar Desktop — submenu สำหรับเมนูที่เข้าหลายหน้า

**Files:** Modify `index.html` — sidebar nav (`#sn-bd` ~204, `#sn-cl` ~210) + CSS (`.sidebar-item` block ~142) + `updateNavActive` (~JS) + helper ใหม่ `clToggleNavGroup`.

> เฉพาะ **Desktop sidebar** (ตาม spec "สำหรับ Desktop"). Bottom nav มือถือคงเดิม. เมนูที่มีหลายหน้า = **ระบบ Breakdown** และ **Checklist**. เมนูหน้าเดียว (หน้าหลัก/ทะเบียน/Log) คงเป็นปุ่มเดี่ยว.

ปลายทาง submenu (ฟังก์ชันที่มีอยู่จริง):
- Breakdown: ภาพรวม `goBdHub()` · แจ้ง `openReportPopup()` · รายการ `goRecords()` · สรุป `goSummary()`
- Checklist: ภาพรวม `goChecklist()` · รายวัน `goClForm('daily')` · PM `goClForm('pm')` · รายการ `switchTab('cl-list')` · สรุป/KPI `switchTab('cl-summary')` · ปฏิทิน `switchTab('cl-calendar')` · รายละเอียดตรวจสอบ `switchTab('cl-schedule')`

- [ ] **Step 1 (HTML):** แทน `#sn-bd` (3 บรรทัด) ด้วย group + submenu:
```html
<div class="sidebar-item" id="sn-bd" onclick="clToggleNavGroup('bd')">
    <span class="nav-icon">🚨</span><span class="flex-1">ระบบ Breakdown</span><span id="chev-bd" class="nav-chev">▸</span>
</div>
<div id="submenu-bd" class="nav-submenu hidden">
    <div class="sidebar-subitem" data-panel="bd-hub" onclick="goBdHub()">ภาพรวม</div>
    <div class="sidebar-subitem" onclick="openReportPopup()">แจ้ง Breakdown</div>
    <div class="sidebar-subitem" data-panel="records" onclick="goRecords()">รายการ Breakdown</div>
    <div class="sidebar-subitem" data-panel="summary" onclick="goSummary()">สรุป Breakdown</div>
</div>
```
- [ ] **Step 2 (HTML):** แทน `#sn-cl` (3 บรรทัด) ด้วย:
```html
<div class="sidebar-item" id="sn-cl" onclick="clToggleNavGroup('cl')">
    <span class="nav-icon">✅</span><span class="flex-1">Checklist</span><span id="chev-cl" class="nav-chev">▸</span>
</div>
<div id="submenu-cl" class="nav-submenu hidden">
    <div class="sidebar-subitem" data-panel="cl-hub" onclick="goChecklist()">ภาพรวม</div>
    <div class="sidebar-subitem" onclick="goClForm('daily')">Checklist รายวัน</div>
    <div class="sidebar-subitem" onclick="goClForm('pm')">PM Checklist</div>
    <div class="sidebar-subitem" data-panel="cl-list" onclick="switchTab('cl-list')">รายการ Checklist</div>
    <div class="sidebar-subitem" data-panel="cl-summary" onclick="switchTab('cl-summary')">สรุปผล / KPI</div>
    <div class="sidebar-subitem" data-panel="cl-calendar" onclick="switchTab('cl-calendar')">ปฏิทิน PM</div>
    <div class="sidebar-subitem" data-panel="cl-schedule" onclick="switchTab('cl-schedule')">รายละเอียดตรวจสอบ</div>
</div>
```
- [ ] **Step 3 (CSS):** เพิ่มหลัง `.sidebar-item.active`:
```css
.nav-chev { font-size:.7rem; transition:transform .2s; color:#71717a; }
.nav-chev.open { transform:rotate(90deg); }
.nav-submenu { margin:2px 8px 4px 30px; border-left:1px solid #3f3f46; padding-left:6px; }
.nav-submenu.hidden { display:none; }
.sidebar-subitem { padding:7px 10px; border-radius:8px; color:#a1a1aa; font-size:.78rem; cursor:pointer; transition:background .15s,color .15s; }
.sidebar-subitem:hover { background:#27272a; color:#f4f4f5; }
.sidebar-subitem.active { color:#fff; background:rgba(192,57,43,.28); font-weight:600; }
```
- [ ] **Step 4 (JS helper):** เพิ่มใกล้ `updateNavActive`:
```javascript
function clToggleNavGroup(grp) {
    const sm = document.getElementById('submenu-'+grp);
    const ch = document.getElementById('chev-'+grp);
    const open = sm.classList.contains('hidden');
    sm.classList.toggle('hidden', !open);
    ch.classList.toggle('open', open);
}
```
- [ ] **Step 5 (active + auto-expand):** ใน `updateNavActive(panel)` ต่อท้าย (หลัง highlight `sn-*` เดิม) — ไฮไลต์ sub-item + กางกลุ่มที่ active:
```javascript
document.querySelectorAll('.sidebar-subitem').forEach(el => el.classList.remove('active'));
const grpOf = { 'bd-hub':'bd','form':'bd','records':'bd','summary':'bd',
                'cl-hub':'cl','cl-form':'cl','cl-list':'cl','cl-summary':'cl','cl-calendar':'cl','cl-schedule':'cl' };
const g = grpOf[panel];
if (g) {
    document.getElementById('submenu-'+g)?.classList.remove('hidden');
    document.getElementById('chev-'+g)?.classList.add('open');
    document.querySelector(`#submenu-${g} .sidebar-subitem[data-panel="${panel}"]`)?.classList.add('active');
}
```
> `sn-bd`/`sn-cl` ตอนนี้ onclick = toggle (ไม่ navigate) — การเข้าหน้าใช้ sub-item "ภาพรวม". `updateNavActive` ยัง toggle `.active` ที่ `sn-bd/sn-cl` ได้ปกติ (parent ติฮัไลต์เมื่ออยู่ในกลุ่ม).

- [ ] **Step 6 (verify):** Desktop — คลิก "ระบบ Breakdown" → กาง submenu (chevron หมุน), คลิก "รายการ Breakdown" → เข้าหน้า + sub-item ไฮไลต์; เข้าหน้า cl-schedule จากที่อื่น → กลุ่ม Checklist กางอัตโนมัติ + ไฮไลต์ "รายละเอียดตรวจสอบ"; มือถือ bottom nav เหมือนเดิม.
