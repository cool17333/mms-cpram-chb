# PLAN v2.12 — User Register (self-service request → admin approve) + แยกช่องชื่อ/นามสกุล

> **For executor:** ใช้ Sonnet execute ทีละ Phase. **มี GAS — ต้อง redeploy** (Phase A เพิ่ม 4 endpoints + sheet ใหม่). `node --check js/<ไฟล์>.js` ก่อน commit ทุกครั้ง.

**Goal:** (1) ระบบ Register — คนยังไม่มีบัญชีกรอก ชื่อ/นามสกุล/username/password/level ส่งคำขอจากหน้า Login → admin เห็นคิว approve → ดึงเข้า `_Users`. (2) แยกช่องชื่อ/นามสกุลในฟอร์มเพิ่ม user เดิม

**Architecture:** sheet ใหม่ `_PendingUsers` เก็บคำขอ (hash password ตั้งแต่ส่งคำขอ — ไม่เก็บ plaintext). registerUser สาธารณะ (ไม่เช็คสิทธิ์), approveUser/rejectUser ต้องมีสิทธิ์ `ua.add` (reuse — ไม่เพิ่ม perm code ใหม่ → ไม่ต้อง re-seed `_Permissions`). frontend: register modal บนหน้า login + subtab "คำขอใช้งาน" ใน User Access

**Branch:** `feature/v2.12-user-register` (แตกจาก main หลัง v2.11 merge)

---

## Decisions (ยืนยันกับ user แล้ว 2026-06-26)

| ประเด็น | เลือก |
|---|---|
| จุดเข้า Register | **หน้า Login (สาธารณะ)** — ลิงก์ "ขอสมัครใช้งาน" |
| Level ที่ขอได้ | **ทุก level ยกเว้น Administrator** (บังคับ server-side) |
| เก็บชื่อ-สกุล | **คงคอลัมน์ `name` เดียว** — รวม `ชื่อ + นามสกุล` ตอนบันทึก (ไม่ migrate sheet) |
| ตอน Approve | **admin ดู/ปรับ level ได้ก่อนยืนยัน** |

---

## บริบทระบบเดิม (verified)

- `_Users` 9 คอลัมน์: `id, name, username, pin_hash, salt, level, active, createdAt, createdBy` — `name` คอลัมน์เดียว, password = `sha256hex(salt+pin)`
- `getUserRow(ss, username)` หา user (lowercase compare), `sha256hex()`, `userCan()`, `writeAccessLog()`, `jsonOut()` มีอยู่แล้ว
- POST pattern ที่อ่าน response ได้ (ไม่ติด CORS): `fetch(GAS_URL,{method:'POST',body:JSON.stringify(...)})` ไม่ใส่ header → text/plain → simple request (เหมือน `submitAddUser` เดิม)
- Levels: `Visitor, Production, Technician, Engineer, Supervisor, Administrator`
- ฟอร์มเพิ่ม user: [index.html:2762](../../index.html) `au-name/au-user/au-pin/au-level`; `submitAddUser()` [user-access.js:95](../../js/user-access.js)
- Login modal: [index.html:403](../../index.html); `doLogin()` [core.js:63](../../js/core.js)
- UA subtabs: [index.html:2702](../../index.html) `users/perms/log`; `uaSwitch()` [user-access.js:23](../../js/user-access.js)

---

## ⛔ Phase A: GAS — sheet + 4 endpoints (ต้อง redeploy หลังเสร็จ)

**Files:** Modify `gas_code.gs`

- [ ] **A1: เพิ่ม helper + constants** — วางใกล้ `ensureAccessLog` (~บรรทัด 91) หรือบนสุดของ USER AUTH section

```js
// ============================================================
// USER REGISTRATION (v2.12) — self-service request → admin approve
// ============================================================
var REGISTER_LEVELS = ['Visitor','Production','Technician','Engineer','Supervisor'];       // ขอเองได้ (ไม่รวม Administrator)
var ALL_LEVELS      = ['Visitor','Production','Technician','Engineer','Supervisor','Administrator'];

function ensurePendingUsers(ss) {
  var sh = ss.getSheetByName('_PendingUsers');
  if (!sh) {
    sh = ss.insertSheet('_PendingUsers');
    sh.getRange(1,1,1,8).setValues([['id','name','username','pin_hash','salt','level','requestedAt','status']])
      .setBackground('#e67e22').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
```
> `_PendingUsers` สร้างอัตโนมัติครั้งแรกที่ถูกเรียก — ไม่ต้อง seed มือ

- [ ] **A2: registerUser (สาธารณะ — ไม่เช็คสิทธิ์)** — วางใน `doPost` **ก่อน** block `addUser` (~บรรทัด 680)

```js
    // ---- REGISTER: คำขอใช้งาน (สาธารณะ ไม่ต้อง login) ----
    if (data.action === 'registerUser') {
      var rg = data.newUser || {};
      var rName  = String(rg.name||'').trim();
      var rUser  = String(rg.username||'').trim();
      var rPin   = String(rg.pin||'');
      var rLevel = String(rg.level||'').trim();
      if (!rName || !rUser || !rPin) return jsonOut({ success:false, error:'กรอกข้อมูลให้ครบ' });
      if (!/^[A-Za-z0-9_.]+$/.test(rUser)) return jsonOut({ success:false, error:'username ใช้ได้เฉพาะ a-z 0-9 _ . (ห้ามเว้นวรรค)' });
      if (rPin.length < 8 || rPin.length > 12) return jsonOut({ success:false, error:'Password ต้อง 8–12 ตัว' });
      if (REGISTER_LEVELS.indexOf(rLevel) < 0) return jsonOut({ success:false, error:'Level ไม่ถูกต้อง' });   // กัน Administrator/ค่าแปลก (server-side)
      if (getUserRow(ss, rUser)) return jsonOut({ success:false, error:'username นี้มีอยู่ในระบบแล้ว' });
      var shReg = ensurePendingUsers(ss);
      var uLower = rUser.toLowerCase();
      var pend = shReg.getDataRange().getValues();
      for (var ip = 1; ip < pend.length; ip++) {
        if (String(pend[ip][2]).toLowerCase() === uLower && String(pend[ip][7]) === 'pending')
          return jsonOut({ success:false, error:'username นี้มีคำขอที่รออนุมัติอยู่แล้ว' });
      }
      var rSalt = Utilities.getUuid();
      var rNow  = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
      shReg.appendRow([Utilities.getUuid(), rName, rUser, sha256hex(rSalt + rPin), rSalt, rLevel, rNow, 'pending']);
      writeAccessLog(ss, rUser, 'registerUser', 'คำขอใช้งานใหม่: ' + rUser + ' (' + rLevel + ')');
      return jsonOut({ success:true });
    }
```

- [ ] **A3: approveUser + rejectUser** — วางใน `doPost` หลัง block user-access เดิม (หลัง `setPermission` ~บรรทัด 785) หรือถัดจาก `addUser`

```js
    // ---- USER ACCESS: approveUser (อนุมัติคำขอ → ดึงเข้า _Users) ----
    if (data.action === 'approveUser') {
      if (!userCan(ss, data.username, data.pin, 'ua.add'))
        return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.add' });
      var shAp = ensurePendingUsers(ss);
      var apRows = shAp.getDataRange().getValues();
      for (var ia = 1; ia < apRows.length; ia++) {
        if (String(apRows[ia][0]) === String(data.pendingId) && String(apRows[ia][7]) === 'pending') {
          var pName = apRows[ia][1], pUser = apRows[ia][2], pHash = apRows[ia][3], pSalt = apRows[ia][4];
          var pLevel = String(apRows[ia][5]);
          var finalLevel = (data.level && ALL_LEVELS.indexOf(String(data.level)) >= 0) ? String(data.level) : pLevel;   // admin ปรับได้
          if (getUserRow(ss, pUser)) {                       // race — ถูกสร้างไปแล้ว → ปิดคำขอ
            shAp.getRange(ia+1, 8).setValue('approved');
            return jsonOut({ success:false, error:'username นี้ถูกสร้างไปแล้ว (ปิดคำขอให้อัตโนมัติ)' });
          }
          var shU = ss.getSheetByName('_Users');
          if (!shU) return jsonOut({ success:false, error:'ไม่พบ sheet _Users' });
          var apNow = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
          shU.appendRow([Utilities.getUuid(), pName, pUser, pHash, pSalt, finalLevel, true, apNow, 'approve:'+data.username]);
          shAp.getRange(ia+1, 8).setValue('approved');
          writeAccessLog(ss, data.username, 'approveUser', 'อนุมัติ: ' + pUser + ' (' + finalLevel + ')');
          return jsonOut({ success:true });
        }
      }
      return jsonOut({ success:false, error:'ไม่พบคำขอ หรือถูกดำเนินการไปแล้ว' });
    }

    // ---- USER ACCESS: rejectUser (ปฏิเสธคำขอ) ----
    if (data.action === 'rejectUser') {
      if (!userCan(ss, data.username, data.pin, 'ua.add'))
        return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.add' });
      var shRj = ensurePendingUsers(ss);
      var rjRows = shRj.getDataRange().getValues();
      for (var ir = 1; ir < rjRows.length; ir++) {
        if (String(rjRows[ir][0]) === String(data.pendingId) && String(rjRows[ir][7]) === 'pending') {
          shRj.getRange(ir+1, 8).setValue('rejected');
          writeAccessLog(ss, data.username, 'rejectUser', 'ปฏิเสธคำขอ: ' + rjRows[ir][2]);
          return jsonOut({ success:true });
        }
      }
      return jsonOut({ success:false, error:'ไม่พบคำขอ' });
    }
```

- [ ] **A4: getPendingUsers (GET — เปิดเหมือน getUsers)** — วางใน `doGet` ถัดจาก block `getUsers` (~บรรทัด 1041)

```js
    if (action === 'getPendingUsers') {
      var ssP = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shP = ssP.getSheetByName('_PendingUsers');
      if (!shP || shP.getLastRow() < 2) return jsonOut({ success:true, data:[] });
      var dataP = shP.getDataRange().getValues().slice(1)
        .filter(function(r){ return String(r[7]) === 'pending'; })
        .map(function(r){ return { id:r[0], name:r[1], username:r[2], level:r[5], requestedAt:r[6] }; });   // ไม่คืน pin_hash/salt
      return jsonOut({ success:true, data: dataP });
    }
```

- [ ] **A5: redeploy GAS Web App** (Manage deployments → Edit → New version → Deploy) — **ห้ามข้าม** ไม่งั้น client เห็น "unknown action"

---

## Phase B: Frontend — Register (สาธารณะ บนหน้า Login)

**Files:** Modify `index.html`, `js/core.js`

- [ ] **B1: ลิงก์ "ขอสมัครใช้งาน" ในหน้า login** — [index.html:437](../../index.html) แทรกหลัง `<p>...ไม่เข้าสู่ระบบ = Visitor...</p>`

```html
            <p style="text-align:center;font-size:12px;color:#6b7280;margin:10px 0 0">ยังไม่มีบัญชี? <a onclick="openRegister()" style="color:#c0392b;font-weight:700;cursor:pointer">ขอสมัครใช้งาน</a></p>
```

- [ ] **B2: register modal** — [index.html](../../index.html) วางหลัง `</div>` ปิด `#login-modal` (~บรรทัด 440)

```html
<!-- ==================== MODAL: ขอสมัครใช้งาน (Register) ==================== -->
<div id="register-modal" class="modal-bg hidden" onclick="if(event.target===this)closeRegister()">
  <div style="background:white;border-radius:20px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:380px;overflow:hidden">
    <div style="background:linear-gradient(135deg,#2475b0,#1a567f);padding:24px;text-align:center">
      <div style="width:52px;height:52px;border-radius:50%;background:rgba(255,255,255,0.2);margin:0 auto 10px;display:flex;align-items:center;justify-content:center;font-size:22px">📨</div>
      <p style="color:white;font-size:17px;font-weight:700;margin:0">ขอสมัครใช้งาน</p>
      <p style="color:rgba(255,255,255,0.7);font-size:11px;margin:4px 0 0">ส่งคำขอ — รออนุมัติจากผู้ดูแลระบบ</p>
    </div>
    <div style="padding:22px;display:flex;flex-direction:column;gap:12px">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div><label class="lbl-ua">ชื่อ <span class="text-red-500">*</span></label><input id="rg-fname" class="inp-ua" placeholder="ชื่อ"></div>
        <div><label class="lbl-ua">นามสกุล <span class="text-red-500">*</span></label><input id="rg-lname" class="inp-ua" placeholder="นามสกุล"></div>
      </div>
      <div><label class="lbl-ua">Username <span class="text-red-500">*</span></label><input id="rg-user" class="inp-ua" placeholder="ตัวอักษร/ตัวเลข ไม่มีช่องว่าง" autocapitalize="none" autocomplete="off"></div>
      <div><label class="lbl-ua">Password <span class="text-red-500">*</span></label><input id="rg-pin" type="password" maxlength="12" class="inp-ua" placeholder="8-12 ตัว"></div>
      <div><label class="lbl-ua">Level ที่ขอ</label>
        <select id="rg-level" class="inp-ua">
          <option>Visitor</option><option>Production</option><option>Technician</option><option>Engineer</option><option>Supervisor</option>
        </select>
        <p style="font-size:10px;color:#9ca3af;margin-top:4px">* ผู้ดูแลระบบจะปรับ Level สุดท้ายตอนอนุมัติ</p>
      </div>
      <div class="flex gap-3 justify-end pt-1">
        <button onclick="closeRegister()" class="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-800">ยกเลิก</button>
        <button onclick="submitRegister()" class="px-6 py-2 text-white text-sm font-bold rounded-lg" style="background:#2475b0">ส่งคำขอ</button>
      </div>
    </div>
  </div>
</div>
```
> dropdown `rg-level` **ไม่มี** Administrator (กันฝั่ง UI) — ฝั่ง server กันซ้ำใน A2

- [ ] **B3: register handlers** — [js/core.js](../../js/core.js) วางหลัง `closeLogin()` (~บรรทัด 47)

```js
// ---- Register (ขอใช้งาน — สาธารณะ) ----
function openRegister() {
    closeLogin();
    ['rg-fname','rg-lname','rg-user','rg-pin'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const lv = document.getElementById('rg-level'); if (lv) lv.value = 'Visitor';
    document.getElementById('register-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('rg-fname')?.focus(), 80);
}
function closeRegister() { document.getElementById('register-modal').classList.add('hidden'); }

async function submitRegister() {
    const fname = (document.getElementById('rg-fname')?.value || '').trim();
    const lname = (document.getElementById('rg-lname')?.value || '').trim();
    const uname = (document.getElementById('rg-user')?.value  || '').trim();
    const pin   = (document.getElementById('rg-pin')?.value   || '').trim();
    const level = document.getElementById('rg-level')?.value  || 'Visitor';
    if (!fname || !lname || !uname || !pin) { showToast('⚠️ กรอกข้อมูลให้ครบ', 'error'); return; }
    if (!/^[A-Za-z0-9_.]+$/.test(uname)) { showToast('⚠️ Username ใช้ a-z 0-9 _ . (ห้ามเว้นวรรค)', 'error'); return; }
    if (pin.length < 8 || pin.length > 12) { showToast('⚠️ Password ต้อง 8–12 ตัว', 'error'); return; }
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า Web App URL ก่อน', 'error'); return; }
    showLoading('กำลังส่งคำขอ…');
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'registerUser',
            newUser: { name: `${fname} ${lname}`.trim(), username: uname, pin, level }
        })});
        const json = await res.json();
        if (!json.success) { showToast(/unknown action/i.test(json.error||'') ? '⚠️ GAS ยังไม่ได้ redeploy' : '❌ ' + (json.error||'ส่งคำขอไม่สำเร็จ'), 'error'); return; }
        closeRegister();
        showToast('✅ ส่งคำขอแล้ว — รออนุมัติจากผู้ดูแลระบบ', 'success');
    } catch (e) {
        showToast('❌ ส่งคำขอไม่สำเร็จ: ' + e.message, 'error');
    } finally { hideLoading(); }
}
```

- [ ] **B4: verify** — `node --check js/core.js`

---

## Phase C: Frontend — Pending queue ใน User Access (admin)

**Files:** Modify `index.html`, `js/user-access.js`

- [ ] **C1: subtab "คำขอใช้งาน" + badge** — [index.html:2704](../../index.html) แทรกระหว่าง subtab `users` กับ `perms`

```html
        <button class="ua-subtab" data-ua="pending" onclick="uaSwitch('pending')">📨 คำขอใช้งาน <span id="ua-pending-badge" class="hidden ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full">0</span></button>
```

- [ ] **C2: pane pending** — [index.html](../../index.html) วางหลัง `</div>` ปิด `#ua-pane-users` (~บรรทัด 2746) ก่อน pane perms

```html
    <!-- Pane: Pending requests -->
    <div id="ua-pane-pending" class="hidden">
        <div class="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div class="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <p class="text-sm font-bold text-gray-700">คำขอใช้งานที่รออนุมัติ</p>
                <button onclick="loadUaPending()" class="text-xs font-bold text-blue-600 hover:text-blue-800 underline">🔄 รีเฟรช</button>
            </div>
            <table class="w-full text-sm">
                <thead class="bg-gray-50 text-gray-500 text-xs"><tr>
                    <th class="px-4 py-2 text-left">ชื่อ-นามสกุล</th>
                    <th class="px-4 py-2 text-left">Username</th>
                    <th class="px-4 py-2 text-left">Level ที่ขอ</th>
                    <th class="px-4 py-2 text-left">วันที่ขอ</th>
                    <th class="px-4 py-2 text-center">จัดการ</th>
                </tr></thead>
                <tbody id="ua-pending-tbody"></tbody>
            </table>
        </div>
    </div>
```

- [ ] **C3: approve modal** — [index.html](../../index.html) วางใกล้ `#add-user-modal` (~บรรทัด 2792)

```html
<!-- ==================== MODAL: อนุมัติคำขอ ==================== -->
<div id="approve-modal" class="modal-bg hidden" onclick="if(event.target===this)closeApproveModal()">
    <div class="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div style="background:linear-gradient(135deg,#16a085,#117a65);padding:18px 22px">
            <p class="text-white font-bold text-lg">อนุมัติคำขอใช้งาน</p>
        </div>
        <div class="p-6 space-y-3">
            <div class="text-sm"><span class="text-gray-500">ชื่อ:</span> <b id="ap-name"></b></div>
            <div class="text-sm"><span class="text-gray-500">Username:</span> <b id="ap-user" class="font-mono"></b></div>
            <div>
                <label class="lbl-ua">กำหนด Level</label>
                <select id="ap-level" class="inp-ua">
                    <option>Visitor</option><option>Production</option><option>Technician</option><option>Engineer</option><option>Supervisor</option><option>Administrator</option>
                </select>
            </div>
            <div class="flex gap-3 justify-end pt-2 border-t border-gray-100">
                <button onclick="closeApproveModal()" class="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-800">ยกเลิก</button>
                <button onclick="uaConfirmApprove()" class="px-6 py-2 text-white text-sm font-bold rounded-lg" style="background:#16a085">อนุมัติ & ดึงเข้าระบบ</button>
            </div>
        </div>
    </div>
</div>
```

- [ ] **C4: uaSwitch เพิ่ม 'pending'** — [user-access.js:23](../../js/user-access.js) แทนที่ฟังก์ชัน `uaSwitch`

```js
function uaSwitch(pane) {
    ['users','pending','perms','log'].forEach(p => {
        document.getElementById('ua-pane-' + p)?.classList.toggle('hidden', p !== pane);
        document.querySelector(`.ua-subtab[data-ua="${p}"]`)?.classList.toggle('active', p === pane);
    });
    if (pane === 'users')   loadUaUsers();
    if (pane === 'pending') loadUaPending();
    if (pane === 'perms')   renderPermMatrix();
    if (pane === 'log')     loadUaLog();
}
```

- [ ] **C5: pending functions** — [user-access.js](../../js/user-access.js) วางต่อท้าย `submitAddUser` (~บรรทัด 113)

```js
// ---- Pending requests (คำขอใช้งาน) ----
let _uaPendingList = [];
let _uaApproveId   = null;

async function loadUaPending() {
    const tb = document.getElementById('ua-pending-tbody');
    if (!GAS_URL) { if (tb) tb.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">⚠️ ยังไม่ได้ตั้งค่า GAS URL</td></tr>'; return; }
    if (typeof showLoading === 'function') showLoading('กำลังโหลดคำขอ…');
    try {
        const res  = await fetch(`${GAS_URL}?action=getPendingUsers`);
        const json = await res.json();
        _uaPendingList = json.data || [];
        renderUaPending();
        updatePendingBadge();
    } catch (e) {
        if (tb) tb.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-red-400">❌ โหลดไม่สำเร็จ: ' + e.message + '</td></tr>';
    } finally { if (typeof hideLoading === 'function') hideLoading(); }
}

function renderUaPending() {
    const tb = document.getElementById('ua-pending-tbody');
    if (!tb) return;
    const canAdd = can('ua.add');
    if (!_uaPendingList.length) {
        tb.innerHTML = '<tr><td colspan="5" class="px-4 py-10 text-center text-gray-400">ไม่มีคำขอที่รออนุมัติ</td></tr>';
        return;
    }
    tb.innerHTML = _uaPendingList.map(p => {
        const lvlCls  = 'ua-level-badge ua-level-' + (p.level || 'Visitor');
        const uname   = String(p.username || '').replace(/'/g, '');
        const actions = canAdd
            ? `<button onclick="uaOpenApprove('${p.id}')" class="text-xs font-bold text-green-600 hover:text-green-800 underline">อนุมัติ</button>
               <button onclick="uaRejectPending('${p.id}','${uname}')" class="text-xs font-bold text-red-600 hover:text-red-800 underline">ปฏิเสธ</button>`
            : '—';
        return `<tr class="border-t border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-3 font-medium text-gray-800">${p.name || '—'}</td>
            <td class="px-4 py-3 font-mono text-gray-600 text-xs">${p.username || '—'}</td>
            <td class="px-4 py-3"><span class="${lvlCls}">${p.level || '—'}</span></td>
            <td class="px-4 py-3 text-xs text-gray-500">${p.requestedAt || '—'}</td>
            <td class="px-4 py-3 text-center flex gap-3 justify-center flex-wrap">${actions}</td>
        </tr>`;
    }).join('');
}

function updatePendingBadge() {
    const badge = document.getElementById('ua-pending-badge');
    if (!badge) return;
    const n = _uaPendingList.length;
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
}

// อัปเดต badge เบื้องหลัง (เรียกจาก loadUaUsers) — admin เห็นจำนวนแม้อยู่แท็บอื่น
async function refreshPendingBadge() {
    if (!GAS_URL || !can('ua.add')) return;
    try {
        const res  = await fetch(`${GAS_URL}?action=getPendingUsers`);
        const json = await res.json();
        _uaPendingList = json.data || [];
        updatePendingBadge();
    } catch (e) {}
}

function uaOpenApprove(pendingId) {
    const p = _uaPendingList.find(x => String(x.id) === String(pendingId));
    if (!p) return;
    _uaApproveId = pendingId;
    document.getElementById('ap-name').textContent = p.name || '';
    document.getElementById('ap-user').textContent = p.username || '';
    document.getElementById('ap-level').value = p.level || 'Visitor';
    document.getElementById('approve-modal').classList.remove('hidden');
}
function closeApproveModal() { document.getElementById('approve-modal').classList.add('hidden'); _uaApproveId = null; }

async function uaConfirmApprove() {
    if (!_uaApproveId) return;
    const level = document.getElementById('ap-level')?.value || 'Visitor';
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'approveUser', username: currentUser.username, pin: currentUser.pin,
            pendingId: _uaApproveId, level
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        closeApproveModal();
        showToast('✅ อนุมัติแล้ว — ดึงเข้าระบบเรียบร้อย', 'success');
        loadUaPending();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

async function uaRejectPending(pendingId, uname) {
    if (!confirm(`ปฏิเสธคำขอของ "${uname}"?`)) return;
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'rejectUser', username: currentUser.username, pin: currentUser.pin, pendingId
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        showToast('ปฏิเสธคำขอแล้ว', 'info');
        loadUaPending();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
```

- [ ] **C6: เรียก refreshPendingBadge ใน loadUaUsers** — [user-access.js:41](../../js/user-access.js) เพิ่มบรรทัดหลัง `renderUaUsers();`

```js
        _uaUsers = json.data || [];
        renderUaUsers();
        refreshPendingBadge();   // v2.12: โชว์ badge คำขอแม้อยู่แท็บผู้ใช้
```

- [ ] **C7: verify** — `node --check js/user-access.js`

---

## Phase D: แยกช่องชื่อ/นามสกุล (ฟอร์มเพิ่ม user เดิม)

**Files:** Modify `index.html`, `js/user-access.js`

- [ ] **D1: แยก input ในฟอร์มเพิ่ม user** — [index.html:2762-2765](../../index.html) แทนที่ block `<div>...au-name...</div>`

```html
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <div>
                    <label class="lbl-ua">ชื่อ <span class="text-red-500">*</span></label>
                    <input id="au-fname" class="inp-ua" placeholder="เช่น สมชาย">
                </div>
                <div>
                    <label class="lbl-ua">นามสกุล <span class="text-red-500">*</span></label>
                    <input id="au-lname" class="inp-ua" placeholder="เช่น ใจดี">
                </div>
            </div>
```

- [ ] **D2: update openAddUserModal + submitAddUser** — [user-access.js:88-113](../../js/user-access.js) แทนที่ทั้ง 2 ฟังก์ชัน

```js
// ---- Add user modal ----
function openAddUserModal() {
    ['au-fname','au-lname','au-user','au-pin'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('add-user-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('au-fname')?.focus(), 80);
}
function closeAddUserModal() { document.getElementById('add-user-modal').classList.add('hidden'); }

async function submitAddUser() {
    const fname = (document.getElementById('au-fname')?.value || '').trim();
    const lname = (document.getElementById('au-lname')?.value || '').trim();
    const uname = (document.getElementById('au-user')?.value  || '').trim();
    const pin   = (document.getElementById('au-pin')?.value   || '').trim();
    const level = document.getElementById('au-level')?.value  || 'Visitor';
    if (!fname || !lname || !uname || !pin) { showToast('⚠️ กรอกข้อมูลให้ครบ', 'error'); return; }
    if (pin.length < 8 || pin.length > 12) { showToast('⚠️ Password ต้อง 8–12 ตัว', 'error'); return; }
    const name = `${fname} ${lname}`.trim();   // v2.12: รวมเป็นคอลัมน์ name เดียว (backend ไม่เปลี่ยน)
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'addUser', username: currentUser.username, pin: currentUser.pin,
            newUser: { name, username: uname, pin, level }
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        closeAddUserModal();
        showToast('✅ เพิ่มผู้ใช้ ' + name + ' สำเร็จ', 'success');
        loadUaUsers();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}
```

- [ ] **D3: verify** — `node --check js/user-access.js`

---

## Phase E: bump + test + commit + PR

- [ ] **E1:** bump `?v=2.11` → `?v=2.12` ทุก `<script src>` ใน [index.html](../../index.html) (12 จุด)
- [ ] **E2:** `node --check` ทั้ง `js/core.js` + `js/user-access.js`
- [ ] **E3:** test (preview `localhost:3456`, GAS redeploy แล้ว):
  - หน้า Login → กด "ขอสมัครใช้งาน" → กรอกครบ → ส่งคำขอ → toast สำเร็จ
  - ลอง username ซ้ำกับ user จริง / ซ้ำคำขอ pending → error ถูก
  - ลอง level dropdown ไม่มี Administrator
  - Login admin → User Access → subtab "คำขอใช้งาน" มี badge นับ → เห็นคำขอ
  - กด อนุมัติ → ปรับ level → ยืนยัน → คำขอหายจากคิว, user โผล่ในแท็บผู้ใช้, login ด้วย user+password นั้นได้
  - กด ปฏิเสธ → คำขอหายจากคิว
  - ฟอร์มเพิ่ม user (admin) → ช่อง ชื่อ/นามสกุล แยก → บันทึก → ชื่อรวมถูกต้องในตาราง
- [ ] **E4:** commit
```
feat(v2.12): ระบบ Register user (request→approve) + แยกช่องชื่อ/นามสกุล

- _PendingUsers sheet + registerUser(สาธารณะ)/approveUser/rejectUser/getPendingUsers
- หน้า Login มีลิงก์ขอสมัครใช้งาน (level ทุกอย่างยกเว้น Admin, hash ตั้งแต่ส่งคำขอ)
- User Access subtab คำขอใช้งาน + badge + approve dialog ปรับ level ได้
- แยกช่องชื่อ/นามสกุลในฟอร์มเพิ่ม user (รวมเป็น name เดียวตอนบันทึก)
- bump ?v=2.12
```
- [ ] **E5:** `git push mms feature/v2.12-user-register` → เปิด PR → **redeploy GAS แล้ว merge**

---

## Notes / Gotchas / Security

- **REDEPLOY GATE = Phase A** — frontend ทั้งหมดพึ่ง endpoint ใหม่. ไม่ redeploy = "unknown action" (B3/C5 มี guard ขึ้น toast เตือน)
- **Password ปลอดภัย:** hash (`sha256hex(salt+pin)`) ตั้งแต่ตอน registerUser — `_PendingUsers` ไม่เก็บ plaintext, `getPendingUsers` ไม่คืน hash/salt, admin ไม่เห็นรหัสผู้ขอ. ตอน approve คัด hash+salt เดิมเข้า `_Users` → password ที่ผู้ขอตั้งใช้ login ได้เลย
- **กัน privilege escalation 2 ชั้น:** UI dropdown ไม่มี Administrator + server เช็ค `REGISTER_LEVELS.indexOf(rLevel) < 0` (กันคนยิง POST ตรง)
- **ไม่เพิ่ม perm code ใหม่:** approve/reject reuse `ua.add` → **ไม่ต้องรัน seedPermissions / แก้ `_Permissions`** (เลี่ยงงานหนัก + เลี่ยง role เก่าไม่มีสิทธิ์ใหม่)
- **race:** approveUser เช็ค `getUserRow` ซ้ำก่อน append — ถ้า username ถูกสร้างระหว่างนั้น ปิดคำขอ + error
- **ความเสี่ยงที่ยอมรับ:** registerUser เป็น public endpoint — ใครมี GAS URL ยิงสร้างคำขอได้ (spam `_PendingUsers`). ระบบ internal + admin gate + dup-check พอรับได้. future option: rate-limit/CAPTCHA (YAGNI ตอนนี้)
- **audit:** คำขอที่ approve/reject ไม่ถูกลบ — เก็บ status ใน `_PendingUsers` + `_AccessLog` (registerUser/approveUser/rejectUser)
- ชื่อ-สกุลเก็บคอลัมน์ `name` เดียว → ไม่กระทบ login/getUsers/report/ที่แสดงผู้แจ้ง-ผู้ดำเนินการ. ถ้าอนาคตอยาก sort by สกุล ค่อย migrate เพิ่มคอลัมน์ (ดู option B ที่ไม่ได้เลือก)
```
