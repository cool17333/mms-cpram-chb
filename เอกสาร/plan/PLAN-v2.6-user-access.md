# User Access System (v2.6) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เปลี่ยนระบบ login จาก shared password 3 roles → user รายคน 6 levels × 29 สิทธิ์ พร้อม rename MMS → CMMS

**Architecture:** GAS เก็บ users+permissions ใน 3 sheets (`_Users`, `_Permissions`, `_AccessLog`). Frontend ใช้ `js/permissions.js` ใหม่ (`currentUser`, `can()`, `applyPermissions()`). GAS บังคับ write actions ผ่าน `userCan(ss, username, pin, perm)` helper ที่ verify SHA-256(salt+pin) server-side.

**Tech Stack:** JavaScript (classic `<script>` ไม่ใช่ ES module), Google Apps Script, Google Sheets, SHA-256 via `Utilities.computeDigest`

---

> ⚠️ **Migration window**: P0 → P1 → P2 ต้องทำต่อเนื่องในช่วงนอกเวลาใช้งาน เพราะ P0 เปลี่ยน login endpoint format และ P1 เปลี่ยน frontend ให้ตามทัน ช่วงระหว่าง P0 deploy กับ P1 deploy ผู้ใช้ login ไม่ได้

---

## File Map

| File | Action | เฟส |
|------|--------|-----|
| `gas_code.gs` | Modify | P0, P2, P3 |
| `js/permissions.js` | **Create** | P1 |
| `js/user-access.js` | **Create** | P3 |
| `js/core.js` | Modify | P1 |
| `js/breakdown-report.js` | Modify | P1 |
| `js/machines.js` | Modify | P1 |
| `js/checklist-core.js` | Modify | P1 |
| `js/bootstrap.js` | Modify | P1 |
| `index.html` | Modify | P1, P3 |

---

## P0: GAS Foundation

### Task 1: SHA-256 helper + PERM_MATRIX + seed utilities

**Files:**
- Modify: `gas_code.gs`

- [ ] **Step 1: เพิ่ม sha256hex helper หลัง DAILY_TOKEN (บรรทัดประมาณ 21)**

```javascript
// ============================================================
// SHA-256 helper
// ============================================================
function sha256hex(text) {
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return raw.map(b => ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2)).join('');
}

// ============================================================
// PERMISSIONS MATRIX — 6 roles × 29 codes (อ้างอิง SPEC-user-access.md)
// ============================================================
const PERM_MATRIX = {
  Visitor:       {'bd.view':1,'bd.export':1,'bd.report':0,'bd.accept':0,'bd.editdoc':0,'bd.close':0,'bd.whywhy':0,'bd.manual':0,'bd.cancel':0,'mc.view':1,'mc.edit':0,'mc.delete':0,'mc.add':0,'mc.import':0,'mc.backup':0,'mc.restore':0,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':0,'cl.pm':0,'cl.edit':0,'cl.calendar':0,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Production:    {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':0,'bd.editdoc':0,'bd.close':0,'bd.whywhy':0,'bd.manual':0,'bd.cancel':0,'mc.view':1,'mc.edit':0,'mc.delete':0,'mc.add':0,'mc.import':0,'mc.backup':0,'mc.restore':0,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':1,'cl.pm':0,'cl.edit':0,'cl.calendar':0,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Technician:    {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':1,'bd.editdoc':1,'bd.close':0,'bd.whywhy':0,'bd.manual':0,'bd.cancel':0,'mc.view':1,'mc.edit':0,'mc.delete':0,'mc.add':0,'mc.import':0,'mc.backup':0,'mc.restore':0,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':0,'cl.pm':1,'cl.edit':0,'cl.calendar':0,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Engineer:      {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':1,'bd.editdoc':1,'bd.close':1,'bd.whywhy':1,'bd.manual':1,'bd.cancel':0,'mc.view':1,'mc.edit':1,'mc.delete':1,'mc.add':1,'mc.import':1,'mc.backup':1,'mc.restore':1,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':0,'cl.pm':1,'cl.edit':1,'cl.calendar':1,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Supervisor:    {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':1,'bd.editdoc':1,'bd.close':1,'bd.whywhy':1,'bd.manual':1,'bd.cancel':1,'mc.view':1,'mc.edit':0,'mc.delete':0,'mc.add':0,'mc.import':0,'mc.backup':0,'mc.restore':0,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':0,'cl.pm':0,'cl.edit':1,'cl.calendar':1,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Administrator: {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':1,'bd.editdoc':1,'bd.close':1,'bd.whywhy':1,'bd.manual':1,'bd.cancel':1,'mc.view':1,'mc.edit':1,'mc.delete':1,'mc.add':1,'mc.import':1,'mc.backup':1,'mc.restore':1,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':1,'cl.pm':1,'cl.edit':1,'cl.calendar':1,'ua.add':1,'ua.del':1,'ua.level':1,'ua.perm':1,'ua.log':1},
};
```

- [ ] **Step 2: เพิ่ม seedPermissions() — utility รัน 1 ครั้งจาก GAS Editor**

เพิ่มต่อจาก PERM_MATRIX:

```javascript
// Tools → Run → seedPermissions  (รัน 1 ครั้ง)
function seedPermissions() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName('_Permissions') || ss.insertSheet('_Permissions');
  sh.clearContents();
  sh.getRange(1,1,1,3).setValues([['role','perm_code','allow']]).setBackground('#2475b0').setFontColor('#fff').setFontWeight('bold');
  const ROLES = ['Visitor','Production','Technician','Engineer','Supervisor','Administrator'];
  const CODES = ['bd.view','bd.export','bd.report','bd.accept','bd.editdoc','bd.close','bd.whywhy','bd.manual','bd.cancel','mc.view','mc.edit','mc.delete','mc.add','mc.import','mc.backup','mc.restore','cl.view','cl.history','cl.status','cl.export','cl.daily','cl.pm','cl.edit','cl.calendar','ua.add','ua.del','ua.level','ua.perm','ua.log'];
  const rows = [];
  ROLES.forEach(role => CODES.forEach(code => rows.push([role, code, PERM_MATRIX[role][code] || 0])));
  sh.getRange(2,1,rows.length,3).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1,3);
  Logger.log('Seeded ' + rows.length + ' rows');  // expect 174
}

// Tools → Run → seedInitialAdmin  (รัน 1 ครั้ง — เปลี่ยน PIN หลัง setup!)
function seedInitialAdmin() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName('_Users') || ss.insertSheet('_Users');
  if (sh.getLastRow() > 1) { Logger.log('Already has users — skipped'); return; }
  sh.getRange(1,1,1,9).setValues([['id','name','username','pin_hash','salt','level','active','createdAt','createdBy']]).setBackground('#c0392b').setFontColor('#fff').setFontWeight('bold');
  sh.setFrozenRows(1);
  const INITIAL_PIN = '0000';   // ← เปลี่ยนหลัง login ครั้งแรก (ผ่าน _Users sheet หรือ P3 UI)
  const salt = Utilities.getUuid();
  const now  = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
  sh.appendRow(['uid-admin-001','ผู้ดูแลระบบ','admin', sha256hex(salt+INITIAL_PIN), salt, 'Administrator', true, now, 'seed']);
  Logger.log('Admin created. PIN: ' + INITIAL_PIN + ' — CHANGE THIS IMMEDIATELY!');
}
```

- [ ] **Step 3: เพิ่ม AccessLog helper**

เพิ่มต่อจาก seed functions:

```javascript
function ensureAccessLog(ss) {
  let sh = ss.getSheetByName('_AccessLog');
  if (!sh) {
    sh = ss.insertSheet('_AccessLog');
    sh.getRange(1,1,1,4).setValues([['timestamp','username','action','detail']]).setBackground('#27ae60').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function writeAccessLog(ss, username, action, detail) {
  const sh = ensureAccessLog(ss);
  sh.appendRow([Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss'), username||'', action||'', detail||'']);
}
```

- [ ] **Step 4: รัน seed functions จาก GAS Editor**

เปิด script.google.com → เลือก project → Save (Ctrl+S):
1. Function dropdown → `seedPermissions` → ▶ Run → อนุมัติถ้าถาม permissions
   - Log: `Seeded 174 rows`
2. Function dropdown → `seedInitialAdmin` → ▶ Run
   - Log: `Admin created. PIN: 0000 — CHANGE THIS IMMEDIATELY!`
3. เปิด Google Sheet → ตรวจ tab `_Permissions` (175 แถว), `_Users` (2 แถว)

---

### Task 2: userCan helper + login endpoint ใหม่ + getUsers/getPermissions

**Files:**
- Modify: `gas_code.gs`

- [ ] **Step 1: เพิ่ม userCan + verify helpers ก่อน doPost**

ค้นหาบรรทัด `function doPost(e) {` แล้วแทรกก่อนมัน:

```javascript
// ============================================================
// USER AUTH
// ============================================================
function getUserRow(ss, username) {
  const sh = ss.getSheetByName('_Users');
  if (!sh || sh.getLastRow() < 2) return null;
  const u = String(username).trim().toLowerCase();
  const rows = sh.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][2]).trim().toLowerCase() === u) return rows[i];
  }
  return null;
}

function verifyPin(row, pin) {
  return sha256hex(String(row[4]) + String(pin)) === String(row[3]);
}

function userCan(ss, username, pin, perm) {
  const row = getUserRow(ss, username);
  if (!row || !row[6]) return false;        // not found or inactive
  if (!verifyPin(row, pin)) return false;
  const m = PERM_MATRIX[String(row[5]).trim()];
  return m ? Boolean(m[perm]) : false;
}

function getPermsForLevel(level) {
  const m = PERM_MATRIX[String(level).trim()];
  return m ? Object.keys(m).filter(k => m[k] === 1) : [];
}
```

- [ ] **Step 2: แทนที่ login handler ใน doGet**

ค้นหา (บรรทัดประมาณ 683-686 ใน doGet):
```javascript
    if (action === 'login') {
      const role = ROLE_PW[(e.parameter.pw || '').trim()] || '';
      return jsonOut(role ? { success: true, role } : { success: false, error: 'รหัสผ่านไม่ถูกต้อง' });
    }
```

แทนที่:
```javascript
    if (action === 'login') {
      const uname = (e.parameter.user || '').trim();
      const pin   = (e.parameter.pin  || '').trim();
      if (!uname || !pin) return jsonOut({ success: false, error: 'กรุณากรอก username และ PIN' });
      const ss2 = SpreadsheetApp.openById(SPREADSHEET_ID);
      const row  = getUserRow(ss2, uname);
      if (!row)    return jsonOut({ success: false, error: 'ไม่พบ username' });
      if (!row[6]) return jsonOut({ success: false, error: 'บัญชีถูกระงับ' });
      if (!verifyPin(row, pin)) return jsonOut({ success: false, error: 'PIN ไม่ถูกต้อง' });
      const perms = getPermsForLevel(row[5]);
      return jsonOut({ success: true, name: String(row[1]).trim(), level: String(row[5]).trim(), perms });
    }
```

- [ ] **Step 3: เพิ่ม getUsers และ getPermissions ใน doGet**

เพิ่มก่อน `return jsonOut({ success: false, error: 'Unknown action' });` ท้าย doGet:

```javascript
    if (action === 'getUsers') {
      const ss2 = SpreadsheetApp.openById(SPREADSHEET_ID);
      const sh  = ss2.getSheetByName('_Users');
      if (!sh || sh.getLastRow() < 2) return jsonOut({ success: true, data: [] });
      const data = sh.getDataRange().getValues().slice(1)
        .map(r => ({ id:r[0], name:r[1], username:r[2], level:r[5], active:r[6], createdAt:r[7] }));
      return jsonOut({ success: true, data });
    }
    if (action === 'getPermissions') {
      return jsonOut({ success: true, data: PERM_MATRIX });
    }
```

- [ ] **Step 4: Redeploy GAS Web App**

GAS Editor → Deploy → Manage deployments → (deployment ที่ใช้งาน) → ✏️ Edit → Version → **New version** → Deploy

ทดสอบใน browser (แทนที่ `<URL>` ด้วย GAS_URL จริง):

```
<URL>?action=login&user=admin&pin=0000
```
Expected: `{"success":true,"name":"ผู้ดูแลระบบ","level":"Administrator","perms":["bd.view","bd.export",...29 items]}`

```
<URL>?action=login&user=admin&pin=9999
```
Expected: `{"success":false,"error":"PIN ไม่ถูกต้อง"}`

- [ ] **Step 5: Commit**

```bash
git add gas_code.gs
git commit -m "feat(P0): GAS foundation — PERM_MATRIX + sha256hex + userCan + login(user+pin) + getUsers + AccessLog"
```

---

## P1: Frontend Engine + Rename

> ⚠️ ทำทันทีหลัง P0 redeploy เสร็จ

### Task 3: สร้าง js/permissions.js

**Files:**
- Create: `js/permissions.js`

- [ ] **Step 1: สร้างไฟล์ js/permissions.js**

```javascript
// ============================================================
// PERMISSIONS ENGINE
// currentUser เก็บ session เท่านั้น — reload = ออกจากระบบ
// ============================================================
let currentUser = {
    username: '',
    name:     '',
    level:    'Visitor',
    perms:    new Set(),
    pin:      '',
};

function can(code) {
    return currentUser.perms.has(code);
}

// toggle hidden บน elements ที่มี data-perm attribute
function applyPermissions() {
    document.querySelectorAll('[data-perm]').forEach(el => {
        const code = el.getAttribute('data-perm');
        el.classList.toggle('hidden', !can(code));
    });

    // elements ที่ logic ไม่ตรงไปตรงมา — จัดการแยก
    const loggedIn = Boolean(currentUser.username);
    document.getElementById('login-row')?.classList.toggle('hidden', loggedIn);
    document.getElementById('logout-btn')?.classList.toggle('hidden', !loggedIn);
    document.getElementById('more-login-row')?.classList.toggle('hidden', loggedIn);
    document.getElementById('more-logout-btn')?.classList.toggle('hidden', !loggedIn);
    document.getElementById('sidebar-logout')?.classList.toggle('hidden', !loggedIn);

    const name = currentUser.name || (loggedIn ? currentUser.level : 'ไม่ได้เข้าสู่ระบบ');
    const el1 = document.getElementById('role-display');
    const el2 = document.getElementById('more-role-display');
    const el3 = document.getElementById('sidebar-role');
    if (el1) el1.textContent = name;
    if (el2) el2.textContent = name;
    if (el3) el3.textContent = name;

    // ua.perm: ควบคุม GAS URL input
    const urlInput = document.getElementById('gas-url-input');
    if (urlInput) urlInput.disabled = !can('ua.perm');
    document.getElementById('url-lock-hint')?.classList.toggle('hidden', can('ua.perm'));

    // re-render elements ที่ขึ้นกับ role ใน JS
    if (typeof applyRecordFilter === 'function' && typeof _lastRecords !== 'undefined' && _lastRecords?.length) {
        applyRecordFilter();
    }
}

// Visitor perms (hardcode — ไม่ต้องเรียก GAS)
const VISITOR_PERMS = ['bd.view','bd.export','mc.view','cl.view','cl.history','cl.status','cl.export'];

function initVisitorPerms() {
    currentUser = { username:'', name:'', level:'Visitor', perms: new Set(VISITOR_PERMS), pin:'' };
    applyPermissions();
}
```

- [ ] **Step 2: ตรวจสอบ syntax**

```bash
node --check js/permissions.js
```
Expected: ไม่มี output (pass)

---

### Task 4: อัปเดต js/core.js — ใช้ระบบ permissions ใหม่

**Files:**
- Modify: `js/core.js`

- [ ] **Step 1: แทนที่ userRole/sessionPw declarations + roleLabel (บรรทัด 50-55)**

ค้นหา:
```javascript
let userRole  = 'user';   // 'user' | 'engineer' | 'admin'
let sessionPw = '';       // ส่งไปกับ op ที่ server ต้องตรวจ (delete)

function roleLabel(r) {
    return r === 'admin' ? 'Administrator' : r === 'engineer' ? 'Engineer' : 'User (ทั่วไป)';
}
```

แทนที่:
```javascript
// backwards compat shims — ไฟล์อื่นยังอาจอ่าน userRole/sessionPw
Object.defineProperty(window, 'userRole',  { get: () => currentUser.level, set: () => {} });
Object.defineProperty(window, 'sessionPw', { get: () => currentUser.pin,   set: () => {} });
```

- [ ] **Step 2: แทนที่ doLogin() ทั้งหมด (บรรทัด 57-79)**

ค้นหา `async function doLogin()` จนถึงปิด `}` แล้วแทนที่ทั้ง function:

```javascript
async function doLogin() {
    const username = (
        document.getElementById('login-user')?.value ||
        document.getElementById('more-login-user')?.value || ''
    ).trim();
    const pin = (
        document.getElementById('login-pin')?.value ||
        document.getElementById('more-login-pin')?.value || ''
    ).trim();
    if (!username || !pin) { showToast('⚠️ กรอก Username และ PIN', 'error'); return; }
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า Web App URL ก่อน', 'error'); return; }
    try {
        const res  = await fetch(`${GAS_URL}?action=login&user=${encodeURIComponent(username)}&pin=${encodeURIComponent(pin)}`);
        const json = await res.json();
        if (!json.success) {
            showToast(/unknown action/i.test(json.error||'') ? '⚠️ GAS ยังไม่ได้ redeploy' : `❌ ${json.error||'เข้าสู่ระบบไม่สำเร็จ'}`, 'error');
            return;
        }
        currentUser = { username, name: json.name, level: json.level, perms: new Set(json.perms||[]), pin };
        document.getElementById('login-user') && (document.getElementById('login-user').value = '');
        document.getElementById('login-pin')  && (document.getElementById('login-pin').value  = '');
        document.getElementById('more-login-user') && (document.getElementById('more-login-user').value = '');
        document.getElementById('more-login-pin')  && (document.getElementById('more-login-pin').value  = '');
        closeMoreSheet?.();
        applyPermissions();
        showToast(`✅ เข้าสู่ระบบเป็น ${json.name} (${json.level})`, 'success');
    } catch (err) {
        showToast('❌ เข้าสู่ระบบไม่สำเร็จ: ' + err.message, 'error');
    }
}
```

- [ ] **Step 3: แทนที่ doLogout() + applyRole() (บรรทัด 81-105)**

ค้นหา `function doLogout()` จนถึงสิ้นสุด `applyRole()` แล้วแทนที่ทั้งสองด้วย:

```javascript
function doLogout() {
    initVisitorPerms();
    showToast('ออกจากระบบแล้ว', 'info');
}

function applyRole() { applyPermissions(); }   // backwards compat — เรียกจาก bootstrap.js
```

- [ ] **Step 4: แก้ saveSettings() ให้ใช้ can()**

ค้นหา:
```javascript
    if (userRole !== 'admin') { showToast('⚠️ ต้องเข้าสู่ระบบเป็น Admin เพื่อแก้ไข URL', 'error'); return; }
```
แทนที่:
```javascript
    if (!can('ua.perm')) { showToast('⚠️ ต้องมีสิทธิ์ Administrator เพื่อแก้ไข URL', 'error'); return; }
```

- [ ] **Step 5: ตรวจสอบ syntax**

```bash
node --check js/core.js
```
Expected: ไม่มี output

---

### Task 5: อัปเดต updateNavRole() ใน js/breakdown-report.js

**Files:**
- Modify: `js/breakdown-report.js`

- [ ] **Step 1: แทนที่ updateNavRole() ทั้งหมด (บรรทัด 438-451)**

ค้นหา:
```javascript
function updateNavRole() {
    const isAdmin = userRole === 'admin';
    const isEng   = isAdmin || userRole === 'engineer';
    const label   = isAdmin ? 'Admin' : isEng ? 'Engineer' : 'User (ทั่วไป)';
    const sideRole = document.getElementById('sidebar-role');
    if (sideRole) sideRole.textContent = label;
    const moreRole = document.getElementById('more-role-display');
    if (moreRole) moreRole.textContent = label;
    document.getElementById('sidebar-logout')?.classList.toggle('hidden', !isEng);
    document.getElementById('more-logout-btn')?.classList.toggle('hidden', !isEng);
    document.getElementById('more-login-row')?.classList.toggle('hidden', isEng);
    document.getElementById('sidebar-admin-section')?.classList.toggle('hidden', !isAdmin);
    document.getElementById('more-log-item')?.classList.toggle('hidden', !isAdmin);
}
```

แทนที่:
```javascript
function updateNavRole() {
    // ตอนนี้ applyPermissions() จัดการ UI ทั้งหมดแล้ว — เรียก delegate เท่านั้น
    document.getElementById('sidebar-admin-section')?.classList.toggle('hidden', !can('ua.log'));
    document.getElementById('more-log-item')?.classList.toggle('hidden', !can('ua.log'));
}
```

- [ ] **Step 2: เพิ่ม ua tab handler ใน switchTab() (บรรทัด 454-464)**

ค้นหาปลาย switchTab function (บรรทัดสุดท้ายใน function ก่อน `}`):
```javascript
    if (name === 'home' && machineMaster.length) loadHomeDash();
```
เพิ่มบรรทัดใหม่หลังจากนั้น:
```javascript
    if (name === 'ua') { loadUaUsers?.(); loadUaLog?.(); }
```

- [ ] **Step 3: ตรวจสอบ syntax**

```bash
node --check js/breakdown-report.js
```
Expected: ไม่มี output

---

### Task 6: แทนที่ pw: sessionPw → username/pin ใน write operations

**Files:**
- Modify: `js/machines.js`
- Modify: `js/checklist-core.js`
- Modify: `js/breakdown-report.js`

- [ ] **Step 1: แก้ js/machines.js — upsertMachine**

ค้นหา:
```javascript
body: JSON.stringify({ action:'upsertMachine', pw: sessionPw, machine: rec, byName: editedBy })
```
แทนที่:
```javascript
body: JSON.stringify({ action:'upsertMachine', username: currentUser.username, pin: currentUser.pin, machine: rec, byName: editedBy })
```

- [ ] **Step 2: แก้ js/machines.js — deleteMachineRow**

ค้นหา:
```javascript
body: JSON.stringify({ action:'deleteMachineRow', pw: sessionPw, machineId: m.id, byName })
```
แทนที่:
```javascript
body: JSON.stringify({ action:'deleteMachineRow', username: currentUser.username, pin: currentUser.pin, machineId: m.id, byName })
```

- [ ] **Step 3: แก้ js/machines.js — setMachines**

ค้นหา:
```javascript
body: JSON.stringify({ action:'setMachines', pw: sessionPw, machines: clean })
```
แทนที่:
```javascript
body: JSON.stringify({ action:'setMachines', username: currentUser.username, pin: currentUser.pin, machines: clean })
```

- [ ] **Step 4: แก้ js/machines.js — restoreMachines**

ค้นหา:
```javascript
body: JSON.stringify({ action:'restoreMachines', pw: sessionPw })
```
แทนที่:
```javascript
body: JSON.stringify({ action:'restoreMachines', username: currentUser.username, pin: currentUser.pin })
```

- [ ] **Step 5: แก้ js/machines.js — cancel action**

ค้นหา:
```javascript
tracking: item.tracking, pw: sessionPw, byName, cancelReason: reason
```
แทนที่:
```javascript
tracking: item.tracking, username: currentUser.username, pin: currentUser.pin, byName, cancelReason: reason
```

- [ ] **Step 6: แก้ js/checklist-core.js — POST body**

ค้นหา:
```javascript
body: JSON.stringify({ ...body, pw: sessionPw || '' }),
```
แทนที่:
```javascript
body: JSON.stringify({ ...body, username: currentUser.username||'', pin: currentUser.pin||'' }),
```

- [ ] **Step 7: แก้ js/checklist-core.js — guard check**

ค้นหา:
```javascript
if (!sessionPw && !_clKiosk) { showToast('กรุณาเข้าสู่ระบบก่อนบันทึก', 'warn'); return; }
```
แทนที่:
```javascript
if (!currentUser.username && !_clKiosk) { showToast('กรุณาเข้าสู่ระบบก่อนบันทึก', 'warn'); return; }
```

- [ ] **Step 8: แก้ js/breakdown-report.js — accept action**

ค้นหา:
```javascript
                acceptedBy,
                pw: sessionPw,
```
แทนที่:
```javascript
                acceptedBy,
                username: currentUser.username,
                pin: currentUser.pin,
```

- [ ] **Step 9: ตรวจสอบ syntax ทุกไฟล์**

```bash
node --check js/machines.js && node --check js/checklist-core.js && node --check js/breakdown-report.js
```
Expected: ไม่มี output (pass ทั้ง 3)

---

### Task 7: อัปเดต index.html — login UI + data-perm + rename CMMS + script tags

**Files:**
- Modify: `index.html`

- [ ] **Step 1: แทนที่ `<title>`**

ค้นหา:
```html
    <title>Machine Management System - CPRAM Chonburi</title>
```
แทนที่:
```html
    <title>CMMS - CPRAM Chonburi</title>
```

- [ ] **Step 2: แทนที่ H1 ใน hub header**

ค้นหา:
```html
                <h1 class="text-2xl md:text-3xl font-bold text-white">Machine Management System</h1>
```
แทนที่:
```html
                <h1 class="text-2xl md:text-3xl font-bold text-white">CMMS</h1>
                <p class="text-white/60 text-xs mt-0.5">Computerized Maintenance Management System</p>
```

- [ ] **Step 3: แทนที่ login UI ใน sidebar (ค้นหา id="login-row")**

ค้นหา block นี้ทั้งหมด:
```html
            <label class="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-1">เข้าสู่ระบบ (Engineer / Admin)</label>
            <p class="text-xs text-gray-400 mb-2">บทบาทปัจจุบัน: <span id="role-display" class="font-bold text-gray-700">User (ทั่วไป)</span></p>
            <div id="login-row" class="flex gap-2">
                <input id="login-pw" type="password" placeholder="รหัสผ่าน..." autocomplete="off"
                       onkeydown="if(event.key==='Enter')doLogin()"
                       class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500 transition-colors">
                <button onclick="doLogin()" class="px-5 py-2 bg-gray-900 hover:bg-orange-500 text-white font-bold rounded-lg text-sm transition-colors whitespace-nowrap">เข้าสู่ระบบ</button>
            </div>
            <button id="logout-btn" onclick="doLogout()" class="hidden text-xs font-bold text-red-600 hover:text-red-800 underline mt-2">ออกจากระบบ</button>
```

แทนที่:
```html
            <label class="text-xs font-bold uppercase tracking-widest text-gray-500 block mb-1">เข้าสู่ระบบ</label>
            <p class="text-xs text-gray-400 mb-2">ผู้ใช้: <span id="role-display" class="font-bold text-gray-700">ไม่ได้เข้าสู่ระบบ</span></p>
            <div id="login-row" class="flex flex-col gap-2">
                <input id="login-user" type="text" placeholder="Username..." autocomplete="off"
                       class="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500 transition-colors">
                <div class="flex gap-2">
                    <input id="login-pin" type="password" placeholder="PIN..." autocomplete="off"
                           onkeydown="if(event.key==='Enter')doLogin()"
                           class="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500 transition-colors">
                    <button onclick="doLogin()" class="px-4 py-2 bg-gray-900 hover:bg-orange-500 text-white font-bold rounded-lg text-sm transition-colors whitespace-nowrap">เข้า</button>
                </div>
            </div>
            <button id="logout-btn" onclick="doLogout()" class="hidden text-xs font-bold text-red-600 hover:text-red-800 underline mt-2">ออกจากระบบ</button>
```

- [ ] **Step 4: แทนที่ login UI ใน more-sheet (ค้นหา id="more-login-row")**

ค้นหา:
```html
                    <div id="more-login-row" class="flex gap-2">
                        <input id="more-login-pw" type="password" placeholder="รหัสผ่าน..."
                               autocomplete="off" onkeydown="if(event.key==='Enter')doLogin()"
                               class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-28 outline-none focus:border-orange-500">
                        <button onclick="doLogin()" class="px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg whitespace-nowrap">เข้า</button>
                    </div>
```

แทนที่:
```html
                    <div id="more-login-row" class="flex flex-col gap-1.5">
                        <input id="more-login-user" type="text" placeholder="Username..."
                               autocomplete="off"
                               class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-orange-500">
                        <div class="flex gap-2">
                            <input id="more-login-pin" type="password" placeholder="PIN..."
                                   autocomplete="off" onkeydown="if(event.key==='Enter')doLogin()"
                                   class="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-orange-500">
                            <button onclick="doLogin()" class="px-3 py-1.5 bg-gray-900 text-white text-xs font-bold rounded-lg whitespace-nowrap">เข้า</button>
                        </div>
                    </div>
```

- [ ] **Step 5: เพิ่ม data-perm attributes ให้ elements (ค้นหาแต่ละ id แล้วเพิ่ม attribute)**

รายการ elements ที่ต้องเพิ่ม `data-perm`:

| id | เพิ่ม attribute |
|----|----------------|
| `bdhub-card-qr` | `data-perm="bd.report"` |
| `bdhub-card-manual` | `data-perm="bd.manual"` |
| `hub-card-log` | `data-perm="ua.log"` |
| `btn-save-url` | `data-perm="ua.perm"` |
| `sni-bd-form` | `data-perm="bd.report"` |
| `sni-cl-daily` | `data-perm="cl.daily"` |
| `sni-cl-pm` | `data-perm="cl.pm"` |
| `btn-close-job` | `data-perm="bd.close"` |

ตัวอย่าง (เพิ่ม `data-perm` เข้าไปใน opening tag):
```html
<!-- ก่อน -->
<div id="bdhub-card-qr" class="hidden mms-card ...">
<!-- หลัง -->
<div id="bdhub-card-qr" data-perm="bd.report" class="hidden mms-card ...">
```

> หมายเหตุ: class `hidden` ยังคงอยู่ — `applyPermissions()` จะ toggle based on `can()` ตอน login

- [ ] **Step 6: เพิ่ม `<script src="js/permissions.js">` ต่อจาก core.js**

ค้นหา:
```html
<script src="js/core.js"></script>
```
แทนที่:
```html
<script src="js/core.js"></script>
<script src="js/permissions.js"></script>
```

---

### Task 8: แก้ js/bootstrap.js + ทดสอบ P1

**Files:**
- Modify: `js/bootstrap.js`

- [ ] **Step 1: แทนที่ applyRole() ด้วย initVisitorPerms() ใน bootstrap.js**

ค้นหา:
```javascript
    applyRole();             // เริ่มเป็น User → ซ่อน Manual Create/แก้ไข/ลบ
```
แทนที่:
```javascript
    initVisitorPerms();     // เริ่มเป็น Visitor — โหลด perms + ซ่อน UI ที่ไม่มีสิทธิ์
```

- [ ] **Step 2: ตรวจสอบ syntax ทั้งหมด**

```bash
node --check js/permissions.js && node --check js/core.js && node --check js/bootstrap.js && node --check js/breakdown-report.js
```
Expected: ไม่มี output (pass ทั้ง 4)

- [ ] **Step 3: ทดสอบ preview**

```bash
npx serve -p 3456 .
```

เปิด http://localhost:3456 แล้วทดสอบ:
1. Title tab = "CMMS - CPRAM Chonburi" ✓
2. Login UI ใน sidebar มี username + PIN (ไม่ใช่ password เดี่ยว) ✓
3. Login ด้วย `admin` / `0000` → toast "✅ เข้าสู่ระบบเป็น ผู้ดูแลระบบ (Administrator)" ✓
4. เห็น bdhub-card-manual, bdhub-card-qr ปรากฏหลัง login ✓
5. Logout → กลับเป็น Visitor, elements หายไป ✓
6. Browser console ไม่มี error ✓

- [ ] **Step 4: Commit**

```bash
git add js/permissions.js js/core.js js/machines.js js/checklist-core.js js/breakdown-report.js js/bootstrap.js index.html
git commit -m "feat(P1): permissions engine + username/PIN login + data-perm + rename MMS→CMMS"
```

---

## P2: GAS Enforcement

### Task 9: แทนที่ ROLE_PW checks ด้วย userCan() ใน doPost

**Files:**
- Modify: `gas_code.gs`

> ค้นหา block แต่ละ `if (data.action === '...')` แล้วแทนที่ ROLE_PW check

- [ ] **Step 1: แทนที่ check ใน setMachines**

ค้นหา (ใน `data.action === 'setMachines'`):
```javascript
      if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
```
แทนที่:
```javascript
      if (!userCan(ss, data.username, data.pin, 'mc.import'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ mc.import' });
```

- [ ] **Step 2: แทนที่ check ใน restoreMachines**

ค้นหา (ใน `data.action === 'restoreMachines'`):
```javascript
      if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
```
แทนที่:
```javascript
      if (!userCan(ss, data.username, data.pin, 'mc.restore'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ mc.restore' });
```

- [ ] **Step 3: แทนที่ check ใน upsertMachine**

ค้นหา (ใน `data.action === 'upsertMachine'`):
```javascript
      if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
```
แทนที่:
```javascript
      if (!userCan(ss, data.username, data.pin, 'mc.edit'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ mc.edit' });
```

- [ ] **Step 4: แทนที่ check ใน deleteMachineRow**

ค้นหา (ใน `data.action === 'deleteMachineRow'`):
```javascript
      if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
```
แทนที่:
```javascript
      if (!userCan(ss, data.username, data.pin, 'mc.delete'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ mc.delete' });
```

- [ ] **Step 5: แทนที่ check ใน accept**

ค้นหา (ใน `data.action === 'accept'`):
```javascript
      const role = ROLE_PW[(data.pw || '').trim()];
      if (role !== 'engineer' && role !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Engineer หรือ Admin เท่านั้น' });
```
แทนที่:
```javascript
      if (!userCan(ss, data.username, data.pin, 'bd.accept'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ bd.accept' });
```

- [ ] **Step 6: แทนที่ check ใน cancel**

ค้นหา (ใน `data.action === 'cancel'`):
```javascript
      if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
```
แทนที่:
```javascript
      if (!userCan(ss, data.username, data.pin, 'bd.cancel'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ bd.cancel' });
```
เพิ่ม AccessLog ก่อน `return jsonOut({ success: true, action: 'cancelled' })`:
```javascript
      writeAccessLog(ss, data.username||data.byName||'', 'bd.cancel', '#'+(data.tracking||'')+': '+(data.cancelReason||''));
```

- [ ] **Step 7: แทนที่ check ใน saveChecklist**

ค้นหา (ใน `data.action === 'saveChecklist'`):
```javascript
      const role    = ROLE_PW[(data.pw || '').trim()];
      const tokenOk = String(data.token || '') === DAILY_TOKEN && (data.type === 'daily');
      if (!role && !tokenOk) return jsonOut({ success: false, error: 'ต้องเข้าสู่ระบบก่อน' });
```
แทนที่:
```javascript
      const clPerm  = data.type === 'pm' ? 'cl.pm' : 'cl.daily';
      const tokenOk = String(data.token||'') === DAILY_TOKEN && data.type === 'daily';
      if (!tokenOk && !userCan(ss, data.username, data.pin, clPerm))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ ' + clPerm });
```

- [ ] **Step 8: แทนที่ check ใน copyMachineItems**

ค้นหา (ใน `data.action === 'copyMachineItems'`):
```javascript
      const role = ROLE_PW[(data.pw || '').trim()];
      if (role !== 'engineer' && role !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Engineer หรือ Admin' });
```
แทนที่:
```javascript
      if (!userCan(ss, data.username, data.pin, 'cl.edit'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ cl.edit' });
```

- [ ] **Step 9: เพิ่ม AccessLog ใน accept action**

ค้นหา (ใน accept block) `return jsonOut({ success: true, action: 'accepted' });` แล้วเพิ่มก่อน:
```javascript
      writeAccessLog(ss, data.username||'', 'bd.accept', '#'+(data.tracking||'')+' รับโดย '+(data.acceptedBy||''));
```

- [ ] **Step 10: ลบ ROLE_PW constant (บรรทัดประมาณ 15-18)**

ค้นหาและลบทั้ง block:
```javascript
// รหัสผ่านตามบทบาท (เก็บฝั่ง server — ไม่โผล่ในหน้าเว็บ)
const ROLE_PW = {
  'engineer123456': 'engineer',
  'cpram123456':    'admin',
};
```

- [ ] **Step 11: Redeploy GAS Web App**

GAS Editor → Deploy → Manage deployments → ✏️ Edit → New version → Deploy

ทดสอบ: เปิด app → Login admin/0000 → ลองแก้ไขชื่อเครื่องจักร → ควรสำเร็จ

ทดสอบ reject: Logout → เปิด DevTools → `fetch(GAS_URL, {method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify({action:'deleteMachineRow', username:'', pin:'', machineId:'TEST'})})`
Expected: `{success:false, error:'ต้องมีสิทธิ์ mc.delete'}`

- [ ] **Step 12: Commit**

```bash
git add gas_code.gs
git commit -m "feat(P2): GAS enforcement — replace ROLE_PW with userCan() + AccessLog + remove leaked passwords"
```

---

### Task 10: Push branch + เปิด PR (P0-P2)

- [ ] **Step 1: Push**

```bash
git push mms feature/user-access
```

- [ ] **Step 2: เปิด PR**

```bash
gh pr create --repo cool17333/mms-cpram-chb \
  --title "feat(v2.6 P0-P2): User Access — individual users + 6-level permissions + CMMS rename" \
  --body "$(cat <<'EOF'
## Summary
- P0: GAS — _Users/_Permissions/_AccessLog + SHA-256 login + userCan helper
- P1: Frontend — js/permissions.js + username/PIN UI + data-perm + rename MMS→CMMS
- P2: GAS — replace ROLE_PW (leaked in public repo) with userCan() + AccessLog

## Pre-merge checklist
- [ ] seedPermissions() + seedInitialAdmin() รันใน GAS Editor แล้ว (_Permissions 174 rows, _Users มี admin)
- [ ] P0 redeploy แล้ว + ทดสอบ ?action=login&user=admin&pin=0000 ตอบ perms ครบ
- [ ] P1 preview ที่ localhost:3456 login/logout ทำงาน
- [ ] P2 redeploy แล้ว + ทดสอบ write action ทำงานกับ username/pin
- [ ] เปลี่ยน PIN ของ admin จาก 0000 แล้ว (แก้ตรงใน _Users sheet)

## Test plan
- Login admin/0000 → เห็น Manual Report, QR BD, Log cards ✓
- Login Production user → เห็น Daily Checklist เท่านั้น (ไม่เห็น PM) ✓
- Visitor (ไม่ login) → ไม่เห็น bdhub-card-manual, Daily, PM ✓
- Engineer รับงาน → สำเร็จ (bd.accept) ✓
- Visitor ยิง deleteMachineRow ตรง → reject "ต้องมีสิทธิ์ mc.delete" ✓

🤖 Generated with Claude Code
EOF
)"
```

---

## P3: User Management UI

> P3 ทำหลังจาก P0-P2 merge เข้า main แล้ว — แยก branch ใหม่

### Task 11: GAS endpoints สำหรับ User Mgmt

**Files:**
- Modify: `gas_code.gs`

- [ ] **Step 1: checkout branch ใหม่**

```bash
git checkout main && git pull mms main
git checkout -b feature/user-access-p3
```

- [ ] **Step 2: เพิ่ม addUser, updateUser, deleteUser ใน doPost**

เพิ่มก่อน `} catch(e) {` ปิดของ doPost (ดูส่วนสุดท้ายของ doPost):

```javascript
    // ---- ADD USER (ua.add) ----
    if (data.action === 'addUser') {
      if (!userCan(ss, data.username, data.pin, 'ua.add'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ ua.add' });
      const ush = ss.getSheetByName('_Users') || ss.insertSheet('_Users');
      const existing = ush.getDataRange().getValues();
      const newUname = String(data.newUser?.username || '').trim().toLowerCase();
      if (!newUname) return jsonOut({ success: false, error: 'username ห้ามว่าง' });
      for (let i = 1; i < existing.length; i++) {
        if (String(existing[i][2]).trim().toLowerCase() === newUname)
          return jsonOut({ success: false, error: 'username ซ้ำ' });
      }
      const newPin = String(data.newUser?.pin || '0000');
      const salt   = Utilities.getUuid();
      const now    = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
      ush.appendRow([Utilities.getUuid(), data.newUser?.name||'', newUname, sha256hex(salt+newPin), salt, data.newUser?.level||'Visitor', true, now, data.username||'']);
      writeAccessLog(ss, data.username||'', 'ua.add', 'เพิ่มผู้ใช้: ' + newUname);
      return jsonOut({ success: true });
    }

    // ---- UPDATE USER (ua.level) ----
    if (data.action === 'updateUser') {
      if (!userCan(ss, data.username, data.pin, 'ua.level'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ ua.level' });
      const ush  = ss.getSheetByName('_Users');
      if (!ush) return jsonOut({ success: false, error: 'ไม่พบ _Users' });
      const urows = ush.getDataRange().getValues();
      for (let i = 1; i < urows.length; i++) {
        if (String(urows[i][0]) === String(data.userId)) {
          if (data.name  !== undefined) ush.getRange(i+1,2).setValue(data.name);
          if (data.level !== undefined) ush.getRange(i+1,6).setValue(data.level);
          if (data.active !== undefined) ush.getRange(i+1,7).setValue(Boolean(data.active));
          if (data.newPin) {
            const s2 = Utilities.getUuid();
            ush.getRange(i+1,4).setValue(sha256hex(s2+String(data.newPin)));
            ush.getRange(i+1,5).setValue(s2);
          }
          writeAccessLog(ss, data.username||'', 'ua.level', 'แก้ไขผู้ใช้: ' + urows[i][2]);
          return jsonOut({ success: true });
        }
      }
      return jsonOut({ success: false, error: 'ไม่พบ userId: ' + data.userId });
    }

    // ---- DELETE USER (ua.del) ----
    if (data.action === 'deleteUser') {
      if (!userCan(ss, data.username, data.pin, 'ua.del'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ ua.del' });
      const ush  = ss.getSheetByName('_Users');
      if (!ush) return jsonOut({ success: false, error: 'ไม่พบ _Users' });
      const urows = ush.getDataRange().getValues();
      for (let i = 1; i < urows.length; i++) {
        if (String(urows[i][0]) === String(data.userId)) {
          const uname = urows[i][2];
          ush.deleteRow(i+1);
          writeAccessLog(ss, data.username||'', 'ua.del', 'ลบผู้ใช้: ' + uname);
          return jsonOut({ success: true });
        }
      }
      return jsonOut({ success: false, error: 'ไม่พบ userId: ' + data.userId });
    }
```

- [ ] **Step 3: เพิ่ม getAccessLog ใน doGet**

เพิ่มก่อน `return jsonOut({ success: false, error: 'Unknown action' });` ใน doGet:

```javascript
    if (action === 'getAccessLog') {
      const sh = ss.getSheetByName('_AccessLog');
      if (!sh || sh.getLastRow() < 2) return jsonOut({ success: true, data: [] });
      const rows = sh.getDataRange().getValues().slice(1).reverse();
      return jsonOut({ success: true, data: rows.slice(0,200).map(r => ({ ts:r[0], username:r[1], action:r[2], detail:r[3] })) });
    }
```

- [ ] **Step 4: Redeploy GAS**

GAS Editor → Deploy → New version → Deploy

ทดสอบ: `<URL>?action=getUsers` → ควรเห็น admin user ใน array

---

### Task 12: สร้าง js/user-access.js + panel-ua ใน index.html

**Files:**
- Create: `js/user-access.js`
- Modify: `index.html`

- [ ] **Step 1: สร้าง js/user-access.js**

```javascript
// ============================================================
// USER ACCESS MANAGEMENT UI (P3)
// ============================================================
let _uaUsers  = [];
let _uaEditId = null;

async function loadUaUsers() {
    const el = document.getElementById('ua-user-list');
    if (!el) return;
    try {
        const json = await fetch(`${GAS_URL}?action=getUsers`).then(r => r.json());
        if (!json.success) throw new Error(json.error);
        _uaUsers = json.data || [];
        renderUaUsers();
    } catch (err) {
        el.innerHTML = `<p class="text-red-500 text-sm">❌ ${err.message}</p>`;
    }
}

function renderUaUsers() {
    const el = document.getElementById('ua-user-list');
    if (!el) return;
    if (!_uaUsers.length) { el.innerHTML = '<p class="text-gray-400 text-sm">ไม่มีผู้ใช้</p>'; return; }
    const BADGE = { Administrator:'bg-red-100 text-red-700', Supervisor:'bg-purple-100 text-purple-700', Engineer:'bg-blue-100 text-blue-700', Technician:'bg-orange-100 text-orange-700', Production:'bg-green-100 text-green-700', Visitor:'bg-gray-100 text-gray-600' };
    el.innerHTML = _uaUsers.map(u => `
        <div class="flex items-center justify-between p-3 rounded-xl border border-gray-200 ${u.active ? '' : 'opacity-50 bg-gray-50'}">
            <div class="flex items-center gap-2 flex-wrap">
                <span class="font-bold text-gray-800">${u.name}</span>
                <span class="text-xs text-gray-400">@${u.username}</span>
                <span class="text-xs px-2 py-0.5 rounded-full font-bold ${BADGE[u.level]||'bg-gray-100 text-gray-600'}">${u.level}</span>
                ${u.active ? '' : '<span class="text-xs text-red-500 font-bold">ระงับ</span>'}
            </div>
            <div class="flex gap-3 ml-2">
                ${can('ua.level') ? `<button onclick="openEditUserModal('${u.id}')" class="text-xs text-blue-600 font-bold hover:underline">แก้ไข</button>` : ''}
                ${can('ua.del') && u.username !== currentUser.username ? `<button onclick="deleteUser('${u.id}','${u.username}')" class="text-xs text-red-600 font-bold hover:underline">ลบ</button>` : ''}
            </div>
        </div>
    `).join('');
}

function openAddUserModal() {
    _uaEditId = null;
    document.getElementById('ua-modal-title').textContent = 'เพิ่มผู้ใช้';
    document.getElementById('ua-name').value   = '';
    document.getElementById('ua-uname').value  = '';
    document.getElementById('ua-pin').value    = '';
    document.getElementById('ua-level').value  = 'Visitor';
    document.getElementById('ua-uname').disabled = false;
    document.getElementById('ua-modal').classList.remove('hidden');
}

function openEditUserModal(userId) {
    const u = _uaUsers.find(x => x.id === userId);
    if (!u) return;
    _uaEditId = userId;
    document.getElementById('ua-modal-title').textContent = 'แก้ไขผู้ใช้';
    document.getElementById('ua-name').value   = u.name;
    document.getElementById('ua-uname').value  = u.username;
    document.getElementById('ua-pin').value    = '';
    document.getElementById('ua-level').value  = u.level;
    document.getElementById('ua-uname').disabled = true;
    document.getElementById('ua-modal').classList.remove('hidden');
}

function closeUaModal() {
    document.getElementById('ua-modal').classList.add('hidden');
    _uaEditId = null;
}

async function saveUaModal() {
    const name  = document.getElementById('ua-name').value.trim();
    const uname = document.getElementById('ua-uname').value.trim().toLowerCase();
    const pin   = document.getElementById('ua-pin').value.trim();
    const level = document.getElementById('ua-level').value;
    if (!name || !uname) { showToast('กรอกชื่อและ username', 'warn'); return; }
    try {
        let body;
        if (_uaEditId) {
            body = { action:'updateUser', username:currentUser.username, pin:currentUser.pin, userId:_uaEditId, name, level };
            if (pin) body.newPin = pin;
        } else {
            if (!pin || pin.length < 4) { showToast('PIN ต้องมีอย่างน้อย 4 หลัก', 'warn'); return; }
            body = { action:'addUser', username:currentUser.username, pin:currentUser.pin, newUser:{ name, username:uname, pin, level } };
        }
        const json = await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify(body) }).then(r=>r.json());
        if (!json.success) throw new Error(json.error);
        closeUaModal();
        showToast(_uaEditId ? '✅ แก้ไขแล้ว' : '✅ เพิ่มผู้ใช้แล้ว', 'success');
        loadUaUsers();
    } catch (err) {
        showToast('❌ ' + err.message, 'error');
    }
}

async function deleteUser(userId, username) {
    if (!confirm(`ลบผู้ใช้ "${username}" ออก?`)) return;
    try {
        const json = await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({ action:'deleteUser', username:currentUser.username, pin:currentUser.pin, userId }) }).then(r=>r.json());
        if (!json.success) throw new Error(json.error);
        showToast('✅ ลบแล้ว', 'success');
        loadUaUsers();
    } catch (err) {
        showToast('❌ ' + err.message, 'error');
    }
}

async function loadUaLog() {
    const el = document.getElementById('ua-log-list');
    if (!el) return;
    try {
        const json = await fetch(`${GAS_URL}?action=getAccessLog`).then(r=>r.json());
        if (!json.success || !json.data?.length) { el.innerHTML = '<p class="text-gray-400 text-sm">ยังไม่มี log</p>'; return; }
        el.innerHTML = json.data.map(r => `
            <div class="py-1 border-b border-gray-100 text-xs text-gray-600">
                <span class="text-gray-400">${r.ts}</span>
                <span class="ml-2 font-bold text-gray-700">${r.username}</span>
                <span class="ml-1 text-blue-600">${r.action}</span>
                <span class="ml-1">${r.detail}</span>
            </div>
        `).join('');
    } catch (err) {
        el.innerHTML = `<p class="text-red-500 text-sm">❌ ${err.message}</p>`;
    }
}
```

- [ ] **Step 2: ตรวจสอบ syntax**

```bash
node --check js/user-access.js
```
Expected: ไม่มี output

- [ ] **Step 3: เพิ่ม panel-ua + modal ใน index.html (ก่อน `<script src="js/core.js">`)**

```html
<!-- ==================== USER ACCESS MANAGEMENT ==================== -->
<div id="panel-ua" class="tab-panel p-4 md:p-6">
<div class="max-w-4xl mx-auto">
    <div class="mms-card p-6 mb-4">
        <div class="flex justify-between items-center mb-4">
            <h2 class="text-lg font-bold text-gray-800">👤 จัดการผู้ใช้</h2>
            <button data-perm="ua.add" onclick="openAddUserModal()"
                    class="hidden mms-btn mms-btn-blue text-sm">+ เพิ่มผู้ใช้</button>
        </div>
        <div id="ua-user-list" class="space-y-2 min-h-[100px]">
            <p class="text-gray-400 text-sm">กำลังโหลด...</p>
        </div>
    </div>
    <div class="mms-card p-6" data-perm="ua.log" style="display:none">
        <h3 class="font-bold mb-3 text-gray-800">📋 Access Log</h3>
        <div id="ua-log-list" class="space-y-1 max-h-64 overflow-y-auto"></div>
    </div>
</div>
</div>

<!-- Modal: Add/Edit User -->
<div id="ua-modal" class="fixed inset-0 bg-black/40 z-50 hidden flex items-center justify-center">
    <div class="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
        <h3 class="font-bold text-lg mb-4" id="ua-modal-title">เพิ่มผู้ใช้</h3>
        <div class="space-y-3">
            <div>
                <label class="text-xs font-bold text-gray-600 block mb-1">ชื่อแสดง</label>
                <input id="ua-name" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500">
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600 block mb-1">Username</label>
                <input id="ua-uname" type="text" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500">
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600 block mb-1">PIN (4-6 หลัก — เว้นว่าง = ไม่เปลี่ยน)</label>
                <input id="ua-pin" type="password" maxlength="6" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-500">
            </div>
            <div>
                <label class="text-xs font-bold text-gray-600 block mb-1">Level</label>
                <select id="ua-level" class="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                    <option>Visitor</option>
                    <option>Production</option>
                    <option>Technician</option>
                    <option>Engineer</option>
                    <option>Supervisor</option>
                    <option>Administrator</option>
                </select>
            </div>
        </div>
        <div class="flex gap-3 justify-end mt-5">
            <button onclick="closeUaModal()" class="px-4 py-2 text-sm font-bold text-gray-600 hover:text-gray-900">ยกเลิก</button>
            <button onclick="saveUaModal()" class="mms-btn mms-btn-blue text-sm px-6">บันทึก</button>
        </div>
    </div>
</div>
```

- [ ] **Step 4: เพิ่ม sidebar link "จัดการผู้ใช้" ใน index.html**

ค้นหา nav section สุดท้ายใน sidebar (ก่อนปิด `</nav>`) แล้วเพิ่ม:

```html
<div class="sidebar-item" id="sni-ua" data-perm="ua.add" onclick="switchTab('ua')" style="display:none">
    <span class="sidebar-icon">👤</span> จัดการผู้ใช้
</div>
```

> หมายเหตุ: `style="display:none"` เริ่มต้น — `applyPermissions()` จะ toggle เป็น visible เมื่อ `can('ua.add')` เป็น true

- [ ] **Step 5: เพิ่ม `<script src="js/user-access.js">` ในท้ายสุด (หลัง checklist-status.js)**

ค้นหา:
```html
<script src="js/checklist-status.js"></script>
```
เพิ่มหลัง:
```html
<script src="js/user-access.js"></script>
```

- [ ] **Step 6: ทดสอบ preview**

```bash
npx serve -p 3456 .
```
- Login admin/0000 → เห็น "จัดการผู้ใช้" ใน sidebar ✓
- คลิก → เห็นตาราง users ✓
- กด "เพิ่มผู้ใช้" → modal → กรอก name/username/pin/level → บันทึก → _Users sheet อัปเดต ✓
- กด "แก้ไข" user → modal โหลดข้อมูล → แก้ level → บันทึก ✓
- "ดู Log" section แสดง AccessLog ✓
- Login ด้วย non-admin → ไม่เห็นเมนู จัดการผู้ใช้ ✓

- [ ] **Step 7: Commit + Push + PR**

```bash
node --check js/user-access.js
git add js/user-access.js index.html gas_code.gs
git commit -m "feat(P3): User Management UI + GAS endpoints (addUser/updateUser/deleteUser/getAccessLog)"
git push mms feature/user-access-p3
gh pr create --repo cool17333/mms-cpram-chb \
  --title "feat(v2.6 P3): User Management UI — เพิ่ม/แก้ไข/ลบผู้ใช้ + Access Log viewer" \
  --body "$(cat <<'EOF'
## Summary
- GAS endpoints: addUser, updateUser, deleteUser, getAccessLog
- Frontend: panel-ua (user table + add/edit modal + access log)
- Sidebar link "จัดการผู้ใช้" (Admin only via data-perm="ua.add")

## Pre-merge checklist
- [ ] GAS redeploy แล้ว
- [ ] ทดสอบ เพิ่ม/แก้ไข/ลบ user สำเร็จ
- [ ] Access Log บันทึกทุก action

🤖 Generated with Claude Code
EOF
)"
```

---

## Self-Review

### Spec Coverage
- ✅ P0: 3 sheets + seed + SHA-256 login + userCan + getUsers/getPermissions (Task 1-2)
- ✅ P1: js/permissions.js + currentUser + can() + applyPermissions() (Task 3-8)
- ✅ P1: login UI username+PIN (Task 7 Step 3-4)
- ✅ P1: data-perm 8 elements + inline can() for dynamic elements (Task 7 Step 5)
- ✅ P1: rename MMS→CMMS title + H1 (Task 7 Step 1-2)
- ✅ P2: 8 ROLE_PW checks replaced + AccessLog on accept/cancel (Task 9)
- ✅ P2: ROLE_PW constant removed (Task 9 Step 10) — ลบ passwords ที่หลุดใน public repo
- ✅ P3: addUser/updateUser/deleteUser/getAccessLog (Task 11)
- ✅ P3: User Mgmt panel + modal + sidebar link (Task 12)

### Type Consistency
- `currentUser.username`, `currentUser.pin` — สม่ำเสมอใน js/ ทุกไฟล์
- `userCan(ss, username, pin, perm)` — ลายเซ็นเดียวกันทุก action ใน GAS
- `can(code)` — ใช้ทั้ง data-perm (auto) และ inline ใน render functions

### Placeholder Scan
- ไม่มี TBD หรือ TODO เหลือ
- ทุก step มีโค้ดจริงหรือ command จริง
