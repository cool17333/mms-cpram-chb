# PLAN-v2.7 — User Access UI + QR Concept ใหม่ + ยกเลิก Confirm + JOB Numbering

> **สถานะ:** ✅ ยืนยัน design decisions แล้ว (D1/D3/D4 ตามค่าแนะนำ · D2/D5 default) — พร้อมลงมือ
> **โมเดล:** วางแผนด้วย Opus · ลงโค้ดด้วย Sonnet (กฎทีม)
> **ต่อยอดจาก:** v2.6 (PR #3 engine + PR #4 login modal) — engine สิทธิ์ + login popup เสร็จแล้ว
> **Branch:** `feature/v2.7-user-access-ui` (แตกจาก main ล่าสุด)

---

## ภาพรวม — 4 ก้อนงาน

| ก้อน | ชื่อ | แตะ GAS? | Redeploy? |
|------|------|:--------:|:---------:|
| **A** | User Access Management UI (หน้าจัดการ user) | ✅ เพิ่ม write endpoints | ✅ |
| **B** | QR Concept ใหม่ — QR เดียวต่อเครื่อง + popup เลือก 3 อย่าง | ⚠️ token logic | ✅ ถ้าแตะ saveChecklist token |
| **C** | ยกเลิก confirmation ทั้งระบบ — ใช้ชื่อ login เป็นผู้ยืนยัน | ❌ (frontend) | ❌ |
| **D** | เลข Tracking BD → JOB + รันต่อเนื่องไม่สวมเลข | ✅ genTracking | ✅ |

> ⚠️ **Redeploy gate:** ก้อน A และ D แก้ `gas_code.gs` → **ต้อง redeploy GAS Web App ก่อน** ถึงจะเห็นผลฝั่ง client (อาการ "แก้แล้วหาย" = ยังไม่ redeploy ไม่ใช่บั๊ก — ดู [[gas-deploy-stale-root-cause]])

---

## ✅ Design Decisions — ยืนยันแล้ว (2026-06-26)

| # | ประเด็น | มติ |
|---|---------|-----|
| **D1** | เอกสาร BD เก่า (BD-xxx) จะเปลี่ยนเป็น JOB ย้อนหลังไหม | ✅ **ไม่เปลี่ยน** — ของเก่าคงเลข BD เดิม, เฉพาะเอกสารใหม่ = JOB |
| **D2** | "แจ้งซ่อม (Adjustment)" เป็น document type ใหม่ หรือใช้ Report เดิม | ✅ **ใช้ Report เดิม** — แค่ตั้ง `eventType='Adjustment'` (field มีอยู่แล้ว) |
| **D3** | QR scan ต้อง login เสมอไหม (เลิกใช้ token-in-URL?) | ✅ **บังคับ login เสมอ** — ตัด token-in-URL ทั้งหมด, ใช้ session เก็บชื่อผู้แจ้งจริง |
| **D4** | confirm() destructive (เขียนทับทะเบียนทั้งหมด / กู้คืน / นำเข้า) จะตัดด้วยไหม | ✅ **คงไว้เฉพาะ 3 ตัวนี้** (เขียนทับ/กู้คืน/import) — ตัดเฉพาะ "ยืนยันชื่อ" + confirm ทั่วไป |
| **D5** | ใครเปลี่ยน PIN ของ user ได้ใน UI | ✅ **เฉพาะ `ua.level`/Admin** — รีเซ็ต PIN ได้ แต่เห็นเป็น •••• เท่านั้น |

> **D3 ยืนยันตัด token เต็มรูปแบบ** → ก้อน B5 ต้องแก้ saveChecklist บังคับ `userCan(cl.daily)` อย่างเดียว (ไม่มี token fallback) → **redeploy GAS**. QR เก่าที่ scan แบบไม่ login จะใช้ไม่ได้ (ผู้ใช้ต้อง login ก่อนเสมอ — ตามต้องการเพื่อเก็บชื่อผู้แจ้ง)

---

# ก้อน A — User Access Management UI

**เป้าหมาย:** สร้างหน้า `panel-ua` ให้ Admin จัดการ user (ดู/เพิ่ม/ลบ/เปลี่ยน level/รีเซ็ต PIN) + ดู permission matrix + ดู access log — ตาม mockup 3 จอที่เหลือ

## A1. GAS — เพิ่ม write endpoints (แก้ `gas_code.gs` → redeploy)

ใส่ใน `doPost` (ก่อน `// ---- CREATE new row ----`):

```javascript
// ---- USER ACCESS: addUser ----
if (data.action === 'addUser') {
  if (!userCan(ss, data.username, data.pin, 'ua.add'))
    return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.add' });
  var shU = ss.getSheetByName('_Users');
  // กัน username ซ้ำ
  var existing = shU.getDataRange().getValues().slice(1);
  if (existing.some(function(r){ return String(r[2]).toLowerCase() === String(data.newUser.username).toLowerCase(); }))
    return jsonOut({ success:false, error:'username นี้มีอยู่แล้ว' });
  var salt = Utilities.getUuid();
  var now  = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
  shU.appendRow([ Utilities.getUuid(), data.newUser.name, data.newUser.username,
                  sha256hex(salt + data.newUser.pin), salt, data.newUser.level,
                  true, now, data.username ]);
  writeAccessLog(ss, data.username, 'addUser', 'เพิ่ม user: ' + data.newUser.username + ' (' + data.newUser.level + ')');
  return jsonOut({ success:true });
}

// ---- USER ACCESS: deleteUser ----
if (data.action === 'deleteUser') {
  if (!userCan(ss, data.username, data.pin, 'ua.del'))
    return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.del' });
  var shD = ss.getSheetByName('_Users');
  var rowsD = shD.getDataRange().getValues();
  for (var i = rowsD.length - 1; i >= 1; i--) {
    if (String(rowsD[i][0]) === String(data.userId)) {
      if (String(rowsD[i][2]).toLowerCase() === 'admin')
        return jsonOut({ success:false, error:'ลบบัญชี admin หลักไม่ได้' });
      shD.deleteRow(i + 1);
      writeAccessLog(ss, data.username, 'deleteUser', 'ลบ user: ' + rowsD[i][2]);
      return jsonOut({ success:true });
    }
  }
  return jsonOut({ success:false, error:'ไม่พบ user' });
}

// ---- USER ACCESS: setUserLevel ----
if (data.action === 'setUserLevel') {
  if (!userCan(ss, data.username, data.pin, 'ua.level'))
    return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.level' });
  var shL = ss.getSheetByName('_Users');
  var rowsL = shL.getDataRange().getValues();
  for (var j = 1; j < rowsL.length; j++) {
    if (String(rowsL[j][0]) === String(data.userId)) {
      shL.getRange(j + 1, 6).setValue(data.level);     // col 6 = level
      writeAccessLog(ss, data.username, 'setUserLevel', rowsL[j][2] + ' → ' + data.level);
      return jsonOut({ success:true });
    }
  }
  return jsonOut({ success:false, error:'ไม่พบ user' });
}

// ---- USER ACCESS: resetUserPin ----
if (data.action === 'resetUserPin') {
  if (!userCan(ss, data.username, data.pin, 'ua.level'))
    return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.level' });
  var shP = ss.getSheetByName('_Users');
  var rowsP = shP.getDataRange().getValues();
  for (var k = 1; k < rowsP.length; k++) {
    if (String(rowsP[k][0]) === String(data.userId)) {
      var newSalt = Utilities.getUuid();
      shP.getRange(k + 1, 4).setValue(sha256hex(newSalt + data.newPin));  // col 4 = pin_hash
      shP.getRange(k + 1, 5).setValue(newSalt);                            // col 5 = salt
      writeAccessLog(ss, data.username, 'resetUserPin', 'รีเซ็ต PIN: ' + rowsP[k][2]);
      return jsonOut({ success:true });
    }
  }
  return jsonOut({ success:false, error:'ไม่พบ user' });
}

// ---- USER ACCESS: toggleUserActive ----
if (data.action === 'toggleUserActive') {
  if (!userCan(ss, data.username, data.pin, 'ua.level'))
    return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.level' });
  var shA = ss.getSheetByName('_Users');
  var rowsA = shA.getDataRange().getValues();
  for (var n = 1; n < rowsA.length; n++) {
    if (String(rowsA[n][0]) === String(data.userId)) {
      shA.getRange(n + 1, 7).setValue(!!data.active);   // col 7 = active
      writeAccessLog(ss, data.username, 'toggleUserActive', rowsA[n][2] + ' → ' + (data.active?'เปิด':'ปิด'));
      return jsonOut({ success:true });
    }
  }
  return jsonOut({ success:false, error:'ไม่พบ user' });
}
```

เพิ่ม read endpoint ใน `doGet` (ใกล้ `getUsers`):

```javascript
if (action === 'getAccessLog') {
  var ssL = SpreadsheetApp.openById(SPREADSHEET_ID);
  var shL = ssL.getSheetByName('_AccessLog');
  if (!shL || shL.getLastRow() < 2) return jsonOut({ success:true, data:[] });
  var rows = shL.getDataRange().getValues().slice(1).reverse().slice(0, 200).map(function(r){
    return { time:String(r[0]), username:r[1], action:r[2], detail:r[3] };
  });
  return jsonOut({ success:true, data: rows });
}
```

> **login ต้องเช็ค active:** ตรวจว่า login endpoint ([gas_code.gs:772](gas_code.gs:772)) reject ถ้า `active === false` — ถ้ายังไม่เช็ค เพิ่มเงื่อนไข

**✅ หลังแก้ A1: redeploy GAS → ทดสอบ `?action=getAccessLog` ได้ JSON ก่อนทำ frontend**

## A2. HTML — panel-ua (เพิ่มใน `index.html`)

โครงหน้า (วางในกลุ่ม panel เดียวกับ panel อื่น) — 3 ส่วนตาม mockup:

```html
<!-- ==================== PANEL: USER ACCESS ==================== -->
<div id="panel-ua" class="panel hidden">
  <!-- Tabs ย่อย: ผู้ใช้ / สิทธิ์ / Log -->
  <div class="flex gap-2 mb-5 border-b border-gray-200">
    <button class="ua-subtab active" data-ua="users" onclick="uaSwitch('users')">👥 ผู้ใช้งาน</button>
    <button class="ua-subtab" data-ua="perms" onclick="uaSwitch('perms')">🔑 สิทธิ์การใช้งาน</button>
    <button class="ua-subtab" data-ua="log" onclick="uaSwitch('log')">📋 ประวัติ (Log)</button>
  </div>

  <!-- ส่วนที่ 1: ตารางผู้ใช้ -->
  <div id="ua-pane-users">
    <div class="flex justify-between items-center mb-4">
      <h3 class="font-bold text-lg">รายชื่อผู้ใช้งาน</h3>
      <button data-perm="ua.add" onclick="openAddUserModal()"
              class="px-4 py-2 text-white text-sm font-bold rounded-lg" style="background:var(--mms-red)">+ เพิ่มผู้ใช้</button>
    </div>
    <div class="overflow-x-auto bg-white rounded-xl border border-gray-200">
      <table class="w-full text-sm">
        <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
          <tr><th class="px-4 py-3 text-left">ชื่อ-นามสกุล</th><th class="px-4 py-3 text-left">Username</th>
              <th class="px-4 py-3 text-left">Level</th><th class="px-4 py-3 text-center">สถานะ</th>
              <th class="px-4 py-3 text-center">จัดการ</th></tr>
        </thead>
        <tbody id="ua-user-tbody"></tbody>
      </table>
    </div>
  </div>

  <!-- ส่วนที่ 2: Permission Matrix (อ่านอย่างเดียว — สะท้อน PERM_MATRIX) -->
  <div id="ua-pane-perms" class="hidden">
    <div id="ua-perm-matrix" class="overflow-x-auto"></div>
  </div>

  <!-- ส่วนที่ 3: Access Log -->
  <div id="ua-pane-log" class="hidden">
    <div id="ua-log-body" class="space-y-2"></div>
  </div>
</div>

<!-- ==================== MODAL: เพิ่มผู้ใช้ ==================== -->
<div id="add-user-modal" class="modal-bg hidden" onclick="if(event.target===this)closeAddUserModal()">
  <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
    <div style="background:linear-gradient(135deg,#c0392b,#962d22);padding:20px 24px">
      <p class="text-white font-bold text-lg">เพิ่มผู้ใช้งาน</p>
    </div>
    <div class="p-6 space-y-4">
      <div><label class="lbl-ua">ชื่อ-นามสกุล</label><input id="au-name" class="inp-ua"></div>
      <div><label class="lbl-ua">ชื่อผู้ใช้ (Username)</label><input id="au-user" class="inp-ua" autocapitalize="none"></div>
      <div><label class="lbl-ua">PIN (4 หลัก)</label><input id="au-pin" type="password" maxlength="8" inputmode="numeric" class="inp-ua"></div>
      <div><label class="lbl-ua">Level</label>
        <select id="au-level" class="inp-ua">
          <option>Visitor</option><option>Production</option><option>Technician</option>
          <option>Engineer</option><option>Supervisor</option><option>Administrator</option>
        </select>
      </div>
      <div class="flex gap-3 justify-end pt-2">
        <button onclick="closeAddUserModal()" class="px-4 py-2 text-sm font-bold text-gray-500">ยกเลิก</button>
        <button onclick="submitAddUser()" class="px-6 py-2 text-white text-sm font-bold rounded-lg" style="background:var(--mms-red)">บันทึก</button>
      </div>
    </div>
  </div>
</div>
```

CSS เพิ่ม (ใน `<style>`): `.ua-subtab`, `.ua-subtab.active`, `.lbl-ua`, `.inp-ua`, badge สี level

## A3. Nav — เข้าถึงหน้า ua

- **Sidebar**: ใน `#sidebar-admin-section` ([index.html:261](index.html:261)) เพิ่ม item `data-perm="ua.level"`:
  ```html
  <div class="sidebar-item" data-perm="ua.level" onclick="switchTab('ua')">
    <span class="nav-icon">👥</span><span>จัดการผู้ใช้</span>
  </div>
  ```
- **More-sheet (mobile)**: เพิ่ม item คล้าย `more-log-item` พร้อม `data-perm="ua.level"`
- `applyPermissions()` จะ toggle ให้อัตโนมัติ (มี data-perm แล้ว)

## A4. JS — สร้าง `js/user-access.js` (ไฟล์ใหม่)

> ไฟล์ใหม่แยก feature ตามกฎโครงสร้าง js/ — โหลดท้าย `<body>` หลัง `permissions.js`

ฟังก์ชันหลัก:
- `loadUaUsers()` — `fetch(?action=getUsers)` → render `#ua-user-tbody` (badge level, ปุ่มเปลี่ยน level/รีเซ็ต PIN/ลบ ตาม `can()`)
- `loadUaLog()` — `fetch(?action=getAccessLog)` → render `#ua-log-body`
- `renderPermMatrix()` — `fetch(?action=getPermissions)` → ตาราง 6 roles × 29 codes (จัดกลุ่ม BD/Machine/Checklist/UA)
- `uaSwitch(pane)` — สลับ sub-tab + lazy load
- `openAddUserModal()` / `closeAddUserModal()` / `submitAddUser()` — POST addUser
- `uaSetLevel(id)` / `uaResetPin(id)` / `uaDeleteUser(id)` / `uaToggleActive(id)` — POST ตาม action
- ทุก POST แนบ `username: currentUser.username, pin: currentUser.pin`

แก้ `switchTab` ([breakdown-report.js:463](js/breakdown-report.js:463)) — มี hook `loadUaUsers?.()` อยู่แล้ว เปลี่ยนเป็น:
```javascript
if (name === 'ua') { uaSwitch('users'); }
```

แก้ `index.html` ท้าย body เพิ่ม `<script src="js/user-access.js"></script>`

**✅ verify: `node --check js/user-access.js` + preview กดเพิ่ม/ลบ user**

---

# ก้อน B — QR Concept ใหม่ (QR เดียวต่อเครื่อง + popup เลือก)

**เป้าหมาย:** ย้าย QR generate ไปหน้า **ทะเบียนเครื่องจักร** · QR 1 อันต่อเครื่อง · scan แล้วเด้ง popup เลือก 3 อย่าง · login ก่อน · auto-fill ข้อมูลเครื่อง + ชื่อผู้แจ้ง

## B1. URL scheme ใหม่

เปลี่ยนจาก 2 mode (`mode=daily` / `mode=bd-report`) เป็น **mode เดียว** `mode=scan`:
```
{base}?mode=scan&m={machineId}
```
- **ไม่มี token ใน URL** (ตัดออก — D3) → บังคับ login แทน
- รองรับ URL เก่า (`mode=daily` / `mode=bd-report`) ให้ redirect เข้า scan-popup เพื่อ backward-compat QR ที่พิมพ์ไปแล้ว

## B2. Scan landing flow (`bootstrap.js` + ไฟล์ใหม่ `js/scan.js`)

แก้ `bootstrap.js` ([bootstrap.js:21](js/bootstrap.js:21)):
```javascript
const _qp = new URLSearchParams(location.search);
if (_qp.get('mode') === 'scan' && _qp.get('m')) {
    enterScan(_qp.get('m'));
} else if (_qp.get('mode') === 'daily' && _qp.get('m')) {
    enterScan(_qp.get('m'), 'daily');     // backward-compat
} else if (_qp.get('mode') === 'bd-report' && _qp.get('m')) {
    enterScan(_qp.get('m'), 'bd');        // backward-compat
} else { switchTab('home'); initHubDatetime(); }
```

`enterScan(machineId, preselect)` ใน `js/scan.js`:
1. ถ้า **ยังไม่ login** → เปิด login modal พร้อม flag `_pendingScan = {machineId, preselect}` → หลัง login สำเร็จเรียก `showScanChoice()` ต่อ
2. ถ้า login แล้ว → `showScanChoice(machineId)` ทันที

`showScanChoice(machineId)` — popup 3 ปุ่มใหญ่:
```
┌─────────────────────────────┐
│   เครื่อง: {machineName}      │
│   เลือกการดำเนินการ           │
│  [ ✅ Checklist รายวัน ]      │  → goClForm('daily') + autofill
│  [ ⛔ แจ้ง Breakdown ]        │  → openReport(eventType='Breakdown') + autofill
│  [ 🔧 แจ้งซ่อม (Adjustment) ] │  → openReport(eventType='Adjustment') + autofill
└─────────────────────────────┘
```

## B3. Auto-fill + ชื่อผู้แจ้งจาก login

- ทั้ง 3 path: หาเครื่องจาก `machineMaster`/`machines` ด้วย machineId → เติม factory/area/machineId/machineName
- **ชื่อผู้แจ้ง = `currentUser.name`** (ไม่ถามซ้ำ — เชื่อมกับก้อน C)
- Checklist: เติม `clf-inspector` = currentUser.name
- Report: เติมช่องผู้แจ้ง + ตั้ง `inp-event-type` ตามตัวเลือก (Breakdown→Breakdown, แจ้งซ่อม→Adjustment)
- **eventType เปลี่ยนย้อนหลังได้ตอนแก้ไขเอกสาร** — field `inp-event-type` ยัง editable ในโหมด edit (ไม่ lock)

## B4. ย้าย QR generate → หน้าทะเบียนเครื่องจักร

- **ลบ/ยุบ** 2 ปุ่ม QR เดิมในหน้า checklist-status (`openQrGenModal` daily + `generateBdQrPdf`)
- เพิ่มปุ่ม **"พิมพ์ QR"** ในหน้าทะเบียนเครื่องจักร (panel machines) `data-perm="mc.view"`
- ใช้ generator เดิม (`qrDataUrl` + jsPDF grid) แต่ URL = `?mode=scan&m={id}` อันเดียว — label ใต้ QR = รหัส + ชื่อเครื่อง (ไม่ต้องเขียน "แจ้ง Breakdown" เพราะ scan แล้วเลือกเอง)
- ย้าย `qrDataUrl()` / generator ไป `js/machines.js` หรือ `js/scan.js` (ฟังก์ชัน global เดิม เรียกข้ามไฟล์ได้)

## B5. saveChecklist token — ตัดออก (D3 ยืนยันแล้ว, แตะ GAS → redeploy)

- เดิม daily kiosk ใช้ `token === DAILY_TOKEN` ผ่าน ([gas_code.gs:299-301](gas_code.gs:299)) โดยไม่ login
- **D3 ยืนยันตัด token** → แก้ saveChecklist บังคับ `userCan(ss, data.username, data.pin, clPerm)` อย่างเดียว ลบ `tokenOk` ออก:
  ```javascript
  // เดิม
  const tokenOk = String(data.token||'') === DAILY_TOKEN && (data.type === 'daily');
  const authed  = tokenOk || userCan(ss, data.username, data.pin, clPerm);
  // ใหม่
  const authed  = userCan(ss, data.username, data.pin, clPerm);
  ```
- ลบ `_clKiosk` / `_clKioskToken` ([checklist-core.js:36-37](js/checklist-core.js:36)) + guard `!currentUser.username && !_clKiosk` ([checklist-core.js:690](js/checklist-core.js:690)) → เหลือ `!currentUser.username` อย่างเดียว
- ลบค่าคงที่ `BD_QR_TOKEN` / `QR_TOKEN` / `DAILY_TOKEN` ที่ไม่ใช้แล้ว
- **→ redeploy GAS**

**✅ verify: preview เปิด `?mode=scan&m=<id>` → ต้องเด้ง login → เลือก → autofill ถูก**

---

# ก้อน C — ยกเลิก Confirmation ทั้งระบบ (ใช้ชื่อ login)

**เป้าหมาย:** เลิกถามชื่อผู้ยืนยันทุกจุด — ใช้ `currentUser.name` เป็นผู้ยืนยัน/ผู้ดำเนินการอัตโนมัติ · เก็บ log ผู้ใช้ + ชื่อผู้ยืนยันเหมือนเดิม

## C1. แทนช่อง "ยืนยันชื่อ" ด้วย currentUser.name (8 จุด)

| ไฟล์ | จุด | เดิม | ใหม่ |
|------|-----|------|------|
| [breakdown-form.js:839](js/breakdown-form.js:839) | submit report | `confirm-name` input | `byName = currentUser.name` |
| [breakdown-report.js:204](js/breakdown-report.js:204) | accept งาน | `accept-byname` input | `acceptedBy = currentUser.name` |
| [breakdown-report.js:346](js/breakdown-report.js:346) | report-popup quick BD | `rm-byname` input | `byName = currentUser.name` |
| [machines.js:200](js/machines.js:200) | upsertMachine | `editedBy` input | `currentUser.name` |
| [machines.js:250](js/machines.js:250) | delete machine | `mach-del-by` input | `currentUser.name` |
| [machines.js:411](js/machines.js:411) | cancel BD | `cancel-byname` input | `currentUser.name` |
| [checklist-core.js:685](js/checklist-core.js:685) | save checklist | `clf-inspector` / `clf-confirm-name` | `currentUser.name` |
| [checklist-status.js:379,647](js/checklist-status.js:379) | edit checklist | `editorName` input | `currentUser.name` |

แนวทาง:
- **ซ่อน/ลบช่อง input ชื่อ** ใน HTML (หรือเปลี่ยนเป็น read-only แสดง currentUser.name)
- โค้ดอ่านค่าจาก `currentUser.name` แทน `document.getElementById(...).value`
- **guard:** ถ้า `!currentUser.username` (ยังไม่ login) → `showToast('กรุณาเข้าสู่ระบบก่อน')` + เปิด login modal (Visitor ทำ action เขียนไม่ได้อยู่แล้วจาก data-perm แต่กันชั้นสอง)
- ตัด `localStorage.setItem('last_by_name', ...)` (ไม่จำเป็นแล้ว)

## C2. ตัด confirm() ทั่วไป — คงเฉพาะ destructive (D4)

| ไฟล์ | confirm() | ตัด? |
|------|-----------|:----:|
| [checklist-core.js:1219](js/checklist-core.js:1219) | เลื่อนวัน PM | ✅ ตัด (ใช้ชื่อ login log แทน) |
| [machines.js:273](js/machines.js:273) | เขียนทับทะเบียนทั้งหมด | ⚠️ คง (ทำลายข้อมูล) — รอยืนยัน D4 |
| [machines.js:286](js/machines.js:286) | กู้คืนทะเบียน | ⚠️ คง — รอยืนยัน D4 |
| [machines.js:375](js/machines.js:375) | import เครื่องจักร | ⚠️ คง — รอยืนยัน D4 |

## C3. log ยังเก็บชื่อเหมือนเดิม

- `writeLog(ss, tracking, action, byName, status)` — `byName` ส่ง `currentUser.name` เข้าไปปกติ
- `writeAccessLog` ใช้ `currentUser.username` อยู่แล้ว — ครบทั้ง username + ชื่อผู้ยืนยัน

**✅ verify: preview ทุก action ไม่เด้งถามชื่อ + log แสดงชื่อ login ถูก**

---

# ก้อน D — เลข Tracking BD → JOB + รันต่อเนื่องไม่สวมเลข

**เป้าหมาย:** เปลี่ยน prefix `BD-` → `JOB-` · เลขรันต่อเนื่องแม้เอกสารถูกยกเลิก/ลบ (ไม่สวมเลขเดิม)

## D1. เปลี่ยน prefix (แก้ `gas_code.gs` → redeploy)

[gas_code.gs:593](gas_code.gs:593):
```javascript
// เดิม
data.tracking = 'BD-' + factoryToCHB(data.factory) + '-' + ym + '-' + String(seq).padStart(3, '0');
// ใหม่
data.tracking = 'JOB-' + factoryToCHB(data.factory) + '-' + ym + '-' + String(seq).padStart(3, '0');
```

## D2. แก้ numbering ไม่ให้สวมเลข — ใช้ counter ถาวร

**ปัญหาเดิม:** `seq = sheet.getLastRow()` ([gas_code.gs:591](gas_code.gs:591)) — ถ้า `delete` ลบแถว ([gas_code.gs:559](gas_code.gs:559)) getLastRow หด → เอกสารถัดไป**สวมเลขที่ถูกลบ**

**วิธีแก้:** counter ถาวรต่อ (โรงงาน+เดือน) ใน sheet `_Counters` — เพิ่มอย่างเดียว ไม่ลด

```javascript
function nextJobSeq(ss, key) {              // key = factoryCHB + '_' + ym
  var sh = ss.getSheetByName('_Counters');
  if (!sh) {
    sh = ss.insertSheet('_Counters');
    sh.getRange(1,1,1,2).setValues([['key','lastSeq']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]) === key) {
      var next = Number(vals[i][1]) + 1;
      sh.getRange(i + 1, 2).setValue(next);
      return next;
    }
  }
  sh.appendRow([key, 1]);
  return 1;
}
```

แก้ในส่วน CREATE (อยู่ใน `lock.waitLock` อยู่แล้ว — atomic):
```javascript
const ym  = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMM');
const key = factoryToCHB(data.factory) + '_' + ym;
const seq = nextJobSeq(ss, key);            // แทน sheet.getLastRow()
data.tracking = 'JOB-' + factoryToCHB(data.factory) + '-' + ym + '-' + String(seq).padStart(3, '0');
```

> **migration counter:** ครั้งแรกหลัง deploy `_Counters` ว่าง → seq เริ่ม 1 อาจชนเลขเดือนปัจจุบันที่มีอยู่. แก้: seed `_Counters` ด้วย max seq เดิมของแต่ละ (factory+เดือน) ที่มีอยู่ — เขียนฟังก์ชัน `seedCounters()` รันครั้งเดียวจาก GAS Editor (สแกนทุก sheet `{factory}_{month}` หาเลขท้ายสูงสุด)

## D3. UI ที่อ้าง "BD"

- ค้น label "BD" / "Breakdown" ที่เป็นชื่อเลขเอกสาร → เปลี่ยนข้อความเป็น "JOB" (เลขเอกสาร) — แต่ "ระบบ Breakdown" (ชื่อระบบ) คงไว้
- filter/search ที่ match prefix ('BD-') ต้องรองรับทั้ง BD เก่า + JOB ใหม่ (D1: ของเก่าคงเลขเดิม)

**✅ verify: redeploy → แจ้งใหม่ได้ JOB-xxx → ลบเอกสาร → แจ้งใหม่อีกอันเลขไม่ซ้ำของที่ลบ**

---

## ลำดับการทำ (แนะนำ)

```
1. แตก branch feature/v2.7-user-access-ui จาก main
2. ก้อน D (เล็ก ชัด) → แก้ gas → redeploy → verify JOB numbering
3. ก้อน A (GAS endpoints) → redeploy → verify → frontend panel-ua → verify
4. ก้อน C (frontend ล้วน — ต้องทำก่อน B เพราะ B พึ่ง currentUser.name) → verify
5. ก้อน B (QR concept — พึ่ง C) → verify scan flow
6. node --check ทุกไฟล์ js → commit เป็นก้อน ๆ → push mms → PR → merge main
```

> **กฎเหล็ก:** ทุกครั้งแก้ `js/` → `node --check` · แก้ `gas_code.gs` → redeploy ก่อน verify · push `mms` เท่านั้น (origin = frozen) · main ผ่าน PR เท่านั้น

## ไฟล์ที่แตะ (สรุป)

| ไฟล์ | ก้อน | สร้าง/แก้ |
|------|------|----------|
| `gas_code.gs` | A, D | แก้ (5 endpoints + getAccessLog + nextJobSeq + prefix) → **redeploy** |
| `js/user-access.js` | A | **สร้างใหม่** |
| `js/scan.js` | B | **สร้างใหม่** |
| `index.html` | A, B, C | แก้ (panel-ua, modals, nav, ลบ QR เดิม, ลบช่องชื่อ, +2 script tags) |
| `js/bootstrap.js` | A, B | แก้ (scan routing, switchTab ua) |
| `js/breakdown-report.js` | A, C | แก้ (switchTab ua, accept/quick-BD ใช้ login name) |
| `js/breakdown-form.js` | C | แก้ (submit ใช้ login name) |
| `js/machines.js` | B, C | แก้ (QR generate, upsert/delete/cancel ใช้ login name) |
| `js/checklist-core.js` | B, C | แก้ (autofill inspector, save ใช้ login name, ตัด PM confirm) |
| `js/checklist-status.js` | B, C | แก้ (ลบ QR เดิม, edit ใช้ login name) |
| `js/permissions.js` | A | แก้ (ถ้าต้อง toggle element เพิ่ม) |
```
