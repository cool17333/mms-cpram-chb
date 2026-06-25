# MMS v2.3 — Bug Fixes & Enhancements Plan

> **For agentic workers:** รันทีละ Task. Steps เป็น checkbox. **Opus = วางแผน (ไฟล์นี้), Sonnet = ลงมือ** ([[opus-planning-only]]).
> **เลขบรรทัด = ค่าประมาณ** — Grep หา anchor ก่อนแก้ทุกครั้ง.

**Goal:** แก้บั๊ก + เพิ่มฟีเจอร์ตาม feedback: Dashboard นับผิด, รับงานเด้งกลับหน้าหลัก, ปัญหาที่พบไม่มี remark ผู้คีย์, Checklist (refresh, เดือน PM หาย/copy ไม่ไป, submenu PM ไฮไลต์ผิด, PM save ไม่เข้า, ปฏิทินใส่สถานะเครื่อง, สรุป refresh+link, รายการ filter เลยกำหนด).

**Architecture:** Single `index.html` + `gas_code.gs` (GAS Web App) บน GitHub Pages.

---

## ลำดับ: PHASE A (GAS) → redeploy → B–H (frontend)
GAS แก้ 2 จุด (copy เดือน PM, pmStartMonth ถูก Sheets แปลงเป็น Date) — **redeploy ก่อนทำ frontend ที่เกี่ยว** ([[gas-deploy-stale-root-cause]]).

---

# PHASE A — Backend (gas_code.gs)

### Task A1: copyMachineItems — คัดลอกเดือน/ความถี่ PM ไปด้วย
**Files:** `gas_code.gs` — `copyMachineItems` (~271 loop `targetIds.forEach`).
**Root cause:** ตอน copy คัดเฉพาะ col 7/8 (items) + editBy/At — **ไม่คัด col 5 (pmFreqMonths) / col 6 (pmStartMonth)** → เดือนไม่ตามไป.

- [ ] **Step 1:** ใน `targetIds.forEach(tid => {...})` (gas:271-276) — เมื่อ `type==='pm'` ให้คัด col 5,6 จาก source ด้วย:
```javascript
      targetIds.forEach(tid => {
        if (!existing[tid]) { existingOrder.push(tid); existing[tid] = new Array(COPY_HDR.length).fill(''); existing[tid][0] = tid; }
        existing[tid][colIdx]    = srcRow[colIdx];
        existing[tid][editByCol] = data.editedBy || '';
        existing[tid][editAtCol] = nowStr;
        if (type === 'daily') existing[tid][13] = srcRow[13];      // dailyMergeDefault (มีจาก v2.2)
        if (type === 'pm')   { existing[tid][5] = srcRow[5]; existing[tid][6] = srcRow[6]; } // pmFreq + pmStartMonth
      });
```
> ตรวจว่า `COPY_HDR` มี 14 คอลัมน์ (รวม dailyMergeDefault จาก v2.2 commit e56f6a8). ถ้ายังเป็น 13 ให้ขยายเป็น 14 ก่อน (ดู commit นั้น).

### Task A2: pmStartMonth ไม่ถูกแปลงเป็น Date (เดือนหายตอน reopen)
**Files:** `gas_code.gs` — `savePmPlans` (~326 เขียน col 6), `saveMachineItems` (~414), `doGetPmPlans` (~888 อ่าน col 6).
**Root cause:** ค่า `"2026-06"` ที่เขียนลง Sheets ถูก auto-แปลงเป็น **Date object** → `doGetPmPlans` คืน `r[6]` เป็น ISO string (`2026-05-31T17:00:00Z`) → client เซ็ตเข้า `<input type="month">` ไม่ได้ → ช่องว่าง = "เดือนหาย".

- [ ] **Step 1 (อ่าน — normalize):** ใน `doGetPmPlans` (gas:888) เปลี่ยน `pmStartMonth: r[6] || ''` เป็น:
```javascript
      pmStartMonth: (r[6] instanceof Date)
        ? Utilities.formatDate(r[6], 'Asia/Bangkok', 'yyyy-MM')
        : String(r[6] || '').slice(0, 7),
```
- [ ] **Step 2 (เขียน — กันแปลงเป็น Date):** หลัง `sh.getRange(...).setValues(...)` ทั้งใน `savePmPlans` (gas:339) และ `saveMachineItems` (gas:412/415) เพิ่มบังคับ format คอลัมน์ 7 (col index 6 = pmStartMonth) เป็น text:
```javascript
      sh.getRange(2, 7, Math.max(1, sh.getLastRow()-1), 1).setNumberFormat('@');
```
> วางหลังเขียนแถวเสร็จในแต่ละ action. กันรอบหน้า Sheets ตีความเป็นวันที่.

### Task A-final: Redeploy GAS
- [ ] Deploy → Manage deployments → Edit → New version → Deploy (URL เดิม).
- [ ] **Verify:** ตั้งเดือน PM เครื่องหนึ่ง บันทึก → reopen editor เห็นเดือนเดิม; copy ไปเครื่องอื่น → เดือนตามไป.

---

# PHASE B — หน้าหลัก / Breakdown

### Task B0 (ค้างจากรอบก่อน): ปุ่ม "แจ้ง Breakdown" ใน sidebar เปิด popup
**Files:** `index.html:230`.
- [ ] เปลี่ยน `onclick="goManualCreate()"` → `onclick="openReportPopup()"` (ปุ่ม sidebar id `sni-bd-form`). ให้ตรงกับการ์ดหน้า Hub (idx:621).
- [ ] **หมายเหตุ:** `updateNavActive` grpMap (idx:3282) map `'form'→sni-bd-form`. เมื่อเปลี่ยนเป็น popup จะไม่เข้า panel 'form' — sub-item อาจไม่ไฮไลต์ ไม่เป็นไร (popup ไม่ใช่หน้า).

### Task B1: Dashboard นับเครื่องใช้งาน/Breakdown ไม่ตรงระบบ Breakdown
**Files:** `index.html` — `initHubStats` (~3565 `facStats`), DOMContentLoaded (~5307).
**Root cause:** `facStats` นับ breakdown จาก `_lastRecords` แต่ตอน start แอปโหลด `home` ก่อน, `_lastRecords` **ยังว่าง** (records ยังไม่ถูก fetch) → ตัวเลข bd = 0/เพี้ยน. และไม่ refresh เมื่อ records โหลดทีหลัง. นิยาม "active" ใน facStats อาจต่างจากหน้ารายการ/สรุป.

- [ ] **Step 1:** หา loader ที่ populate `_lastRecords` (Grep `_lastRecords =`). ใน DOMContentLoaded (idx:5309) เปลี่ยนให้โหลด records ด้วยก่อนคำนวณ dashboard:
```javascript
loadMachines().then(() => Promise.resolve(loadRecordsData?.()).then(() => initHubStats()));
```
> ใช้ฟังก์ชันโหลด records ที่มีจริง (เช่น `loadRecords`/`fetchAll`). ถ้ามันผูกกับการ render หน้า records ให้แยก fetch ข้อมูลออกมา (หรือเรียก `getAll` ตรงๆ เก็บใน `_lastRecords`).
- [ ] **Step 2:** ให้ `facStats` ใช้ **นิยาม active เดียวกับหน้ารายการ/สรุป** — เปิดดู `checkRecordsSetup`/`loadRecords` ว่ากรองสถานะ "ยังไม่ปิด" ยังไง แล้วใช้ set เดียวกัน. นับ unique `machineId` (fallback machineName) ด้วย `normFac` เทียบโรงงาน (มีอยู่แล้ว).
- [ ] **Step 3 (verify):** เปิดแอป → ตัวเลข run/bd ในการ์ดโรงงาน = ที่นับได้จากหน้ารายการ Breakdown ของโรงงานนั้น.

### Task B2: รับงานแล้วเด้งกลับหน้าหลัก → ให้ค้างหน้ารายการ + refresh
**Files:** `index.html` — `confirmAccept` (~3098).
**Root cause:** `setTimeout(() => location.reload(), 900)` → reload ทั้งแอป → DOMContentLoaded เปิด home.

- [ ] **Step 1:** แทน `location.reload()` ด้วยการอยู่หน้ารายการ + รีเฟรชข้อมูล:
```javascript
        showToast('✅ รับงานเรียบร้อย — ' + acceptedBy, 'success');
        setTimeout(() => { switchTab('records'); checkRecordsSetup(); }, 700);
```
> ตรวจว่า `checkRecordsSetup`/`loadRecords` ดึงข้อมูลใหม่จริง (ไม่ใช้ cache). ถ้ามันเช็ค setup อย่างเดียว ให้เรียกตัวโหลด records โดยตรง (เช่น `loadRecords(true)` / clear cache ก่อน). `accept` ใช้ `mode:'no-cors'` (ไม่รอผล) — หน่วง 700ms พอให้ Sheets เขียนเสร็จ ก่อน fetch ใหม่.
- [ ] **Step 2 (verify):** อยู่หน้ารายการ → กดรับงาน → ยังอยู่หน้ารายการ, แถวนั้นเปลี่ยนสถานะเป็น "รับงานแล้ว" (ข้อมูลใหม่).

### Task B3: "ปัญหาที่พบ" ใน Report popup ไม่มี `*ผู้แจ้ง - สถานะ` + ไม่บังคับตอนปิดงานถ้ามีข้อมูลแล้ว
**Files:** `index.html` — `submitReportPopup` (~3207), validation `openConfirmModal` (~4324).
**Root cause:** `submitReportPopup` ส่ง `problem` ดิบจาก `rm-problem` **ไม่ต่อท้าย** `*byName - แจ้ง Breakdown` (ฟอร์มเต็มใช้ `composeProblem` แต่ popup เป็นคนละ path).

- [ ] **Step 1 (annotate ใน popup):** ใน `submitReportPopup` (idx:3222-3223) เปลี่ยนการเซ็ต `problem` เป็น:
```javascript
        bdType: '', problem: `${problem} *${byName} - แจ้ง Breakdown`, device: '', whys: [''],
```
> ให้รูปแบบตรงกับ `composeProblem` (`<ข้อความ> *<ผู้ทำ> - <สถานะ>`) เพื่อให้ตอนเปิดแก้ไขภายหลัง บรรทัดนี้ถูกล็อกเป็น locked line ได้ถูกต้อง.
- [ ] **Step 2 (ไม่บังคับตอนปิดงานถ้ามีข้อมูล):** ยืนยันว่า validation (idx:4324-4325) บังคับ `inp-problem-new` เฉพาะ `formStage==='report'` — **edit/ปิดงานไม่บังคับอยู่แล้ว**. ถ้าพบจุดอื่นบังคับตอน edit/closing ให้ผ่อนเป็น: บังคับเฉพาะเมื่อ `!_problemLocked && !freshProblem`. (Grep หา validation problem อื่นใน `saveChecklistConfirm`/`confirmAddData` ก่อน — ถ้าไม่มี ข้อนี้ถือว่าผ่าน.)
- [ ] **Step 3 (verify):** แจ้งผ่าน popup โดย "สมชาย" → record `problem` = "...อาการ... *สมชาย - แจ้ง Breakdown"; เปิดปิดงานโดยไม่แก้ปัญหา → บันทึกได้ไม่ติด validation.

---

# PHASE C — Checklist: รายละเอียดตรวจสอบ

### Task C1: ปุ่ม Refresh ข้อมูล
**Files:** `index.html` — toolbar `panel-cl-schedule` (~1087 filter bar), `loadClSchedule` (~6166 มีอยู่).
- [ ] เพิ่มปุ่มใน filter bar ของ cl-schedule:
```html
<button onclick="loadClSchedule()" class="mms-btn text-sm">🔄 รีเฟรช</button>
```
> `loadClSchedule` fetch `getPmPlans` ใหม่อยู่แล้ว — แค่ผูกปุ่ม. ใส่ `showLoading` ครอบ (มีแล้วใน loadClSchedule idx:6169).

### Task C2: เดือน PM หายตอน reopen (client-side defensive)
**Files:** `index.html` — `openClItemsEditor` per-machine-pm (~6363 `mcie-pm-start`).
**Root cause:** คู่กับ A2. กันเหนียวฝั่ง client: normalize ค่าก่อนเซ็ต `<input type="month">`.
- [ ] เปลี่ยน (idx:6364) `document.getElementById('mcie-pm-start').value = plan.pmStartMonth || '';` เป็น:
```javascript
        document.getElementById('mcie-pm-start').value = String(plan.pmStartMonth || '').slice(0, 7);
```
- [ ] **Verify:** (หลัง A2 redeploy) ตั้งเดือน → reopen → เดือนคงอยู่.

---

# PHASE D — Checklist: PM Checklist form

### Task D1: submenu ไฮไลต์ "รายวัน" แทน "PM Checklist"
**Files:** `index.html` — `updateNavActive` grpMap (~3286 `'cl-form': ['cl','sni-cl-daily']`).
**Root cause:** daily และ pm ใช้ panel เดียวกัน `cl-form` → grpMap ฟิกซ์ไฮไลต์ `sni-cl-daily` เสมอ.
- [ ] แก้ logic: สำหรับ panel `cl-form` ให้เลือก sub-item ตาม `clf-type`. แทนบรรทัด grpMap entry + ส่วนใช้งาน (idx:3292-3296) ด้วยการคำนวณ:
```javascript
    let gi = grpMap[panel];
    if (panel === 'cl-form') {
        const t = document.getElementById('clf-type')?.value || 'daily';
        gi = ['cl', t === 'pm' ? 'sni-cl-pm' : 'sni-cl-daily'];
    }
    if (gi) { document.getElementById('grp-' + gi[0])?.classList.add('open');
              document.getElementById(gi[1])?.classList.add('active'); }
```
> ลบ `'cl-form': ['cl','sni-cl-daily']` ออกจาก grpMap (หรือคงไว้เป็น fallback). **สำคัญ:** `goClForm` ต้องเซ็ต `clf-type.value` **ก่อน** เรียก `switchTab('cl-form')` (ดู idx:5478-5479 — เซ็ต value หลัง switchTab; ต้องสลับลำดับ หรือเรียก `updateNavActive('cl-form')` ซ้ำหลังเซ็ต type).
- [ ] **Verify:** กด "PM Checklist" → submenu ไฮไลต์ "PM Checklist"; กด "รายวัน" → ไฮไลต์ "รายวัน".

### Task D2: PM Checklist กดบันทึกแล้วข้อมูลไม่เข้า/ไม่โชว์
**Files:** `index.html` — `saveChecklistConfirm` (~5718), cl-list render (`loadClList`/renderer), cl-summary (`initClSummary`).
**วินิจฉัย:** การบันทึก pm ผ่าน `saveChecklist` (GAS:202 ต้องมี role — ต้อง login engineer/admin). ถ้า login แล้ว save success แต่ "ไม่เข้าระบบ" มักเป็น **หน้าแสดงผล (รายการ/สรุป) กรองไม่รวม type='pm'** หรืออ่านผิด field.
- [ ] **Step 1:** ทดสอบจริง — login engineer → บันทึก PM → ดู toast tracking. เปิด `_Checklists` sheet ว่ามีแถว type=pm ไหม. ถ้า **มีแถว** = ปัญหาการแสดงผล (ไป Step 2); ถ้า **ไม่มี** = ปัญหาการบันทึก (เช็ค role/login, items ว่าง).
- [ ] **Step 2 (ถ้าเป็นการแสดงผล):** เปิด `loadClList` + renderer (Grep `getChecklists` ใน cl-list) และ `initClSummary` — ตรวจว่า filter `type` ตัด pm ออกไหม, และ overallResult/นับถูก. ให้รวม pm. (เชื่อมกับ Phase F/G ที่ปรับ list/summary อยู่แล้ว.)
- [ ] **Step 3 (verify):** บันทึก PM → เห็นในหน้ารายการ + สรุปนับเพิ่ม.

---

# PHASE E — Checklist: ปฏิทิน PM (ใส่สถานะเครื่องในวัน)

### Task E1: แต่ละวันโชว์เครื่อง OK / NG / ซ่อมแล้ว / ยังไม่ PM / เลยกำหนด
**Files:** `index.html` — `renderClCalendar` (~5980, v2.2 factory-wide), `clCalClickDay` (~6041 modal `modal-cl-day`).
**แนวคิด:** รวมผล checklist (`getChecklists` type=pm เดือนนั้น) เข้ากับ dayMap. แต่ละเครื่องในวันมีสถานะ: **OK** (PASS), **NG** (FAIL), **ซ่อมแล้ว** (FIX), **ยังไม่ PM** (ถึง/เลยกำหนดแต่ไม่มีผล), **เลยกำหนด** (วันผ่านไปแล้วไม่มีผล).
- [ ] **Step 1:** ใน `renderClCalendar` หลังโหลด pmDates เพิ่ม fetch ผล:
```javascript
let _clCalResults = {}; // key machineId_YYYY-MM-DD -> overallResult
try {
  const cr = await clFetch({ action:'getChecklists', factory:fac, area, type:'pm', month:String(_clCalMonth+1).padStart(2,'0'), year:String(_clCalYear) });
  (cr.data||[]).forEach(r => { _clCalResults[`${r.machine||r.machineId}_${r.date}`] = r.overallResult; });
} catch(e) {}
```
> ตรวจชื่อ field ที่ `getChecklists` คืน (machine vs machineId, date format) — ดู doGetChecklists (gas:~859).
- [ ] **Step 2:** ใน `clCalClickDay(day)` — แต่ละเครื่องใน `_clCalDayMap[day]` คำนวณสถานะ:
```javascript
const dateStr = `${ym}-${String(day).padStart(2,'0')}`;
const res = _clCalResults[`${id}_${dateStr}`];
const today = new Date().toISOString().slice(0,10);
let badge;
if (res === 'PASS') badge = '<span class="...green">✅ OK</span>';
else if (res === 'FAIL') badge = '<span class="...red">❌ NG</span>';
else if (res === 'FIX')  badge = '<span class="...yellow">🔧 ซ่อมแล้ว</span>';
else if (dateStr < today) badge = '<span class="...gray">⏰ เลยกำหนด</span>';
else badge = '<span class="...blue">🕒 ยังไม่ PM</span>';
```
แสดง badge ข้างชื่อเครื่องในรายการ modal.
- [ ] **Step 3 (badge บนปฏิทิน):** (option) จุดสีบนวัน — เพิ่มสรุปสีตามสถานะรวมของวัน (เช่น มี NG = แดง). 
- [ ] **Step 4 (verify):** คลิกวันที่มี PM → เห็นรายชื่อเครื่อง + สถานะ OK/NG/ซ่อมแล้ว/ยังไม่ PM/เลยกำหนด ถูกต้องตามที่คีย์.

---

# PHASE F — Checklist: หน้าสรุป

### Task F1: ปุ่ม Refresh + link ข้อมูลจริง
**Files:** `index.html` — `panel-cl-summary` toolbar, `initClSummary` (~Grep).
- [ ] เพิ่มปุ่ม `🔄 รีเฟรช` ที่เรียก `initClSummary()` (re-fetch).
- [ ] ตรวจ `initClSummary` ว่า fetch `getChecklists` ใหม่ทุกครั้ง (ไม่ cache) และนับ PASS/FAIL/FIX + แยก daily/pm จากข้อมูลจริง. ถ้านับจาก cache/ค่าว่าง ให้ผูกกับ `getChecklists` ให้ครบ (รวม pm — เชื่อม D2).
- [ ] **Verify:** คีย์ checklist ใหม่ → กดรีเฟรชหน้าสรุป → ตัวเลขขยับตามจริง.

---

# PHASE G — Checklist: หน้ารายการ (filter เลยกำหนด)

### Task G1: เพิ่ม filter "เลยกำหนด" — รายวัน (กะเช้า/ดึก) + PM
**Files:** `index.html` — `panel-cl-list` filter bar (~956), `loadClList`/renderer.
**นิยาม "เลยกำหนด":**
- **PM:** เครื่องที่ `clIsPmDueInMonth` ในเดือน/วันที่ผ่านมาแล้วแต่ไม่มีผล checklist pm — (มี helper `clIsPmDueInMonth` จาก v2.1 fix).
- **รายวัน:** เครื่องที่วันนี้/ย้อนหลังไม่มีผล daily ในกะนั้น (เช้า/ดึก) — ใช้ `shift` (จาก v2.2) เทียบ.
- [ ] **Step 1 (UI):** เพิ่ม dropdown filter ใน cl-list:
```html
<select id="cll-overdue" onchange="loadClList()" class="border ... text-sm">
  <option value="">ทั้งหมด</option>
  <option value="daily-morning">เลยกำหนด: รายวัน (กะเช้า)</option>
  <option value="daily-night">เลยกำหนด: รายวัน (กะดึก)</option>
  <option value="pm">เลยกำหนด: PM</option>
</select>
```
- [ ] **Step 2 (logic):** ใน renderer ของ cl-list — เมื่อเลือก overdue filter ให้คำนวณรายชื่อเครื่องที่ "ควรตรวจแต่ไม่มีผล" จาก `machineMaster` ∖ (เครื่องที่มีผลในช่วง/กะนั้น). 
  - daily-morning/night: เครื่องที่ "วันนี้ยังไม่มีผล daily กะนั้น" (เทียบ `getChecklists type=daily date=today shift=...`).
  - pm: ใช้ `clMachinesDueForPm(fac,area,y,m)` ∖ เครื่องที่มีผล pm เดือนนั้น.
  - แสดงเป็นรายการ "ค้างตรวจ" (ต่างจากรายการผลที่คีย์แล้ว) — อาจสลับ view เมื่อ filter overdue.
- [ ] **Step 3 (verify):** เลือก "เลยกำหนด: PM" → เห็นเฉพาะเครื่องที่ถึงกำหนด PM เดือนนี้แต่ยังไม่คีย์; daily กะเช้า → เครื่องที่กะเช้าวันนี้ยังไม่ตรวจ.

---

## Self-Review (ตรวจกับ feedback)

| feedback | Task | ต้อง redeploy GAS |
|---|---|---|
| ปุ่มแจ้ง Breakdown เข้า manual | B0 | - |
| Dashboard นับเครื่องผิด | B1 | - |
| รับงานเด้งกลับหน้าหลัก | B2 | - |
| ปัญหาที่พบไม่มี remark ผู้คีย์ + ไม่บังคับตอนปิด | B3 | - |
| Schedule: ปุ่ม refresh | C1 | - |
| Schedule: เดือน PM หาย reopen | A2+C2 | ✅ |
| Schedule: copy ไม่พาเดือนไป | A1 | ✅ |
| PM Checklist: submenu ไฮไลต์ผิด | D1 | - |
| PM Checklist: บันทึกไม่เข้า | D2 | - |
| ปฏิทิน PM: ใส่สถานะเครื่องในวัน | E1 | - |
| สรุป: refresh + link ข้อมูล | F1 | - |
| รายการ: filter เลยกำหนด daily(กะ)/PM | G1 | - |

**จุดเสี่ยงต้องอ่านโค้ดจริงก่อนแก้:** B1 (ตัวโหลด `_lastRecords` + นิยาม active หน้ารายการ), B2 (`checkRecordsSetup` รีเฟรชจริงไหม), D1 (ลำดับเซ็ต `clf-type` ก่อน switchTab), D2 (save vs display — ต้องทดสอบก่อนตัดสิน), E1/G1 (field ที่ `getChecklists` คืน), F1 (`initClSummary` fetch ใหม่ไหม).

## Execution Handoff
ลำดับ: **A → redeploy → B0,B1,B2,B3 → C → D → E → F → G**. commit ทีละ Task, push `mms main`. สลับไป **Sonnet** เริ่ม Phase A.
