// =====================================================
// Google Apps Script — Breakdown Database
// วิธีติดตั้ง:
//  1. ไปที่ script.google.com → New project
//  2. วางโค้ดนี้ทั้งหมดแทนที่โค้ดเดิม
//  3. ใส่ค่า SPREADSHEET_ID ด้านล่าง
//  4. Deploy → New deployment → Web app
//     - Execute as: Me
//     - Who has access: Anyone
//  5. คัดลอก Web App URL ไปใส่ในหน้า Settings ของ app
// =====================================================

const SPREADSHEET_ID = '1knVTnZf7Ecu-LxOYv4911J-QHwr-PuSgrd44JY_UFqc'; // ID ของ Google Sheet

// Token สำหรับ Daily Check ผ่าน QR (ฝังใน URL ของ QR เท่านั้น)
const DAILY_TOKEN = 'cprdaily2026';

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
  User:          {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':0,'bd.editdoc':0,'bd.close':0,'bd.whywhy':0,'bd.manual':0,'bd.cancel':0,'mc.view':1,'mc.edit':0,'mc.delete':0,'mc.add':0,'mc.import':0,'mc.backup':0,'mc.restore':0,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':1,'cl.pm':0,'cl.edit':0,'cl.calendar':0,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  QA:            {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':0,'bd.editdoc':0,'bd.close':0,'bd.whywhy':0,'bd.manual':0,'bd.cancel':0,'mc.view':1,'mc.edit':0,'mc.delete':0,'mc.add':0,'mc.import':0,'mc.backup':0,'mc.restore':0,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':1,'cl.pm':0,'cl.edit':0,'cl.calendar':0,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Production:    {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':0,'bd.editdoc':0,'bd.close':0,'bd.whywhy':0,'bd.manual':0,'bd.cancel':0,'mc.view':1,'mc.edit':0,'mc.delete':0,'mc.add':0,'mc.import':0,'mc.backup':0,'mc.restore':0,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':1,'cl.pm':0,'cl.edit':0,'cl.calendar':0,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Safety:        {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':0,'bd.editdoc':0,'bd.close':0,'bd.whywhy':0,'bd.manual':0,'bd.cancel':0,'mc.view':1,'mc.edit':0,'mc.delete':0,'mc.add':0,'mc.import':0,'mc.backup':0,'mc.restore':0,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':1,'cl.pm':0,'cl.edit':0,'cl.calendar':0,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Technician:    {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':1,'bd.editdoc':1,'bd.close':0,'bd.whywhy':0,'bd.manual':0,'bd.cancel':0,'mc.view':1,'mc.edit':0,'mc.delete':0,'mc.add':0,'mc.import':0,'mc.backup':0,'mc.restore':0,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':0,'cl.pm':1,'cl.edit':0,'cl.calendar':0,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Engineer:      {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':1,'bd.editdoc':1,'bd.close':1,'bd.whywhy':1,'bd.manual':1,'bd.cancel':0,'mc.view':1,'mc.edit':1,'mc.delete':1,'mc.add':1,'mc.import':1,'mc.backup':1,'mc.restore':1,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':0,'cl.pm':1,'cl.edit':1,'cl.calendar':1,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Supervisor:    {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':1,'bd.editdoc':1,'bd.close':1,'bd.whywhy':1,'bd.manual':1,'bd.cancel':1,'mc.view':1,'mc.edit':0,'mc.delete':0,'mc.add':0,'mc.import':0,'mc.backup':0,'mc.restore':0,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':0,'cl.pm':0,'cl.edit':1,'cl.calendar':1,'ua.add':0,'ua.del':0,'ua.level':0,'ua.perm':0,'ua.log':0},
  Administrator: {'bd.view':1,'bd.export':1,'bd.report':1,'bd.accept':1,'bd.editdoc':1,'bd.close':1,'bd.whywhy':1,'bd.manual':1,'bd.cancel':1,'mc.view':1,'mc.edit':1,'mc.delete':1,'mc.add':1,'mc.import':1,'mc.backup':1,'mc.restore':1,'cl.view':1,'cl.history':1,'cl.status':1,'cl.export':1,'cl.daily':1,'cl.pm':1,'cl.edit':1,'cl.calendar':1,'ua.add':1,'ua.del':1,'ua.level':1,'ua.perm':1,'ua.log':1},
};

// ============================================================
// PHASE 3 — Sheet-backed permission matrix (อ่านจาก _Permissions sheet, cache 60s)
// Fallback กลับ const PERM_MATRIX ถ้า sheet ว่าง
// ============================================================
function readPermMatrix(ss) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get('perm_matrix');
  if (cached) { try { return JSON.parse(cached); } catch (_) {} }

  var matrix = {};
  var sh = ss ? ss.getSheetByName('_Permissions') : null;
  if (sh && sh.getLastRow() > 1) {
    sh.getDataRange().getValues().slice(1).forEach(function(r) {
      var role = String(r[0]).trim(), code = String(r[1]).trim();
      var allow = (r[2] === 1 || r[2] === true || String(r[2]).toUpperCase() === 'TRUE' || r[2] === '1') ? 1 : 0;
      if (role && code) { if (!matrix[role]) matrix[role] = {}; matrix[role][code] = allow; }
    });
  }
  if (Object.keys(matrix).length === 0) return PERM_MATRIX;   // fallback
  try { cache.put('perm_matrix', JSON.stringify(matrix), 60); } catch (_) {}
  return matrix;
}

// Tools → Run → seedPermissions  (รัน 1 ครั้งจาก GAS Editor)
function seedPermissions() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName('_Permissions') || ss.insertSheet('_Permissions');
  sh.clearContents();
  sh.getRange(1,1,1,3).setValues([['role','perm_code','allow']]).setBackground('#2475b0').setFontColor('#fff').setFontWeight('bold');
  const ROLES = ['Visitor','User','QA','Production','Technician','Engineer','Safety','Supervisor','Administrator'];
  const CODES = ['bd.view','bd.export','bd.report','bd.accept','bd.editdoc','bd.close','bd.whywhy','bd.manual','bd.cancel','mc.view','mc.edit','mc.delete','mc.add','mc.import','mc.backup','mc.restore','cl.view','cl.history','cl.status','cl.export','cl.daily','cl.pm','cl.edit','cl.calendar','ua.add','ua.del','ua.level','ua.perm','ua.log'];
  const rows = [];
  ROLES.forEach(function(role) { CODES.forEach(function(code) { rows.push([role, code, PERM_MATRIX[role][code] || 0]); }); });
  sh.getRange(2,1,rows.length,3).setValues(rows);
  sh.setFrozenRows(1);
  sh.autoResizeColumns(1,3);
  Logger.log('Seeded ' + rows.length + ' rows');  // expect 261 (9 roles × 29 codes)
}

// Tools → Run → migrateRolesV2_runOnce  (v2.21 — รัน 1 ครั้งหลัง redeploy: ยุบแผนก→Level)
// 1) reseed _Permissions = 9 roles ใหม่  2) level 'Production' (floor เดิม) → 'User'
function migrateRolesV2_runOnce() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  seedPermissions();   // _Permissions ← 9 roles (User/QA/Production/Safety/...) ⚠️ ทับ custom perm เดิม
  ['_Users','_PendingUsers'].forEach(function(nm){
    var sh = ss.getSheetByName(nm); if (!sh || sh.getLastRow() < 2) return;
    var rng = sh.getRange(2, 6, sh.getLastRow() - 1, 1);   // คอลัมน์ level (F)
    var v = rng.getValues(), changed = false;
    v.forEach(function(r){ if (String(r[0]).trim() === 'Production') { r[0] = 'User'; changed = true; } });
    if (changed) rng.setValues(v);
  });
  CacheService.getScriptCache().remove('perm_matrix');
  Logger.log('migrateRolesV2 done — Production→User + reseeded. อย่าลืมตั้ง level ทีม (QA/Production/Engineer/Safety) ให้หัวหน้าเดิม');
}

// Tools → Run → seedInitialAdmin  (รัน 1 ครั้ง — เปลี่ยน PIN หลัง setup!)
function seedInitialAdmin() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName('_Users') || ss.insertSheet('_Users');
  if (sh.getLastRow() > 1) { Logger.log('Already has users — skipped'); return; }
  sh.getRange(1,1,1,10).setValues([['id','name','username','pin_hash','salt','level','active','createdAt','createdBy','department']]).setBackground('#c0392b').setFontColor('#fff').setFontWeight('bold');
  sh.setFrozenRows(1);
  var INITIAL_PIN = '0000';   // เปลี่ยนหลัง login ครั้งแรก (ผ่าน _Users sheet หรือ P3 UI)
  var salt = Utilities.getUuid();
  var now  = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
  sh.appendRow(['uid-admin-001','ผู้ดูแลระบบ','admin', sha256hex(salt+INITIAL_PIN), salt, 'Administrator', true, now, 'seed']);
  Logger.log('Admin created. PIN: ' + INITIAL_PIN + ' — CHANGE THIS IMMEDIATELY!');
}

// ============================================================
// USER REGISTRATION (v2.12) — self-service request → admin approve
// ============================================================
var REGISTER_LEVELS = ['Visitor','User','Technician'];       // สมัครเองได้เฉพาะ non-signing (team QA/Production/Engineer/Safety/Supervisor = admin ตั้งให้ กัน escalation)
var ALL_LEVELS      = ['Visitor','User','QA','Production','Technician','Engineer','Safety','Supervisor','Administrator'];

function ensurePendingUsers(ss) {
  var sh = ss.getSheetByName('_PendingUsers');
  if (!sh) {
    sh = ss.insertSheet('_PendingUsers');
    sh.getRange(1,1,1,9).setValues([['id','name','username','pin_hash','salt','level','requestedAt','status','department']])
      .setBackground('#e67e22').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureAccessLog(ss) {
  var sh = ss.getSheetByName('_AccessLog');
  if (!sh) {
    sh = ss.insertSheet('_AccessLog');
    sh.getRange(1,1,1,4).setValues([['timestamp','username','action','detail']]).setBackground('#27ae60').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function writeAccessLog(ss, username, action, detail) {
  var sh = ensureAccessLog(ss);
  sh.appendRow([Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss'), username||'', action||'', detail||'']);
}

// ============================================================
// MACHINE CONFIG (OEE/Reliability) — planned time ต่อเครื่อง (opt-in)
// ============================================================
function ensureMachineConfig_(ss) {
  var sh = ss.getSheetByName('_MachineConfig');
  if (!sh) {
    sh = ss.insertSheet('_MachineConfig');
    sh.getRange(1,1,1,4).setValues([['machineCode','plannedMinPerDay','idealCycleSec','note']])
      .setBackground('#16a085').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function readMachineConfig_(ss) {
  var sh = ensureMachineConfig_(ss), m = {};
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    var c = String(v[i][0]||'').trim();
    if (c) m[c] = { planned: Number(v[i][1])||0, cycle: Number(v[i][2])||0, note: String(v[i][3]||'') };
  }
  return m;
}

// JOB counter — increment-only per (factory+month), ไม่สวมเลขแม้ delete แถว
function nextJobSeq(ss, key) {
  var sh = ss.getSheetByName('_Counters');
  if (!sh) {
    sh = ss.insertSheet('_Counters');
    sh.getRange(1,1,1,2).setValues([['key','lastSeq']]).setBackground('#8e44ad').setFontColor('#fff').setFontWeight('bold');
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
  // key ใหม่ — หา max seq ในชีต factory+month ก่อน (migration safety)
  sh.appendRow([key, 1]);
  return 1;
}

// รันครั้งเดียวจาก GAS Editor → seed _Counters จาก data ที่มีอยู่แล้ว
function seedCounters() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sh = ss.getSheetByName('_Counters');
  if (!sh) {
    sh = ss.insertSheet('_Counters');
    sh.getRange(1,1,1,2).setValues([['key','lastSeq']]).setBackground('#8e44ad').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  var allSheets = ss.getSheets();
  var counts = {};
  allSheets.forEach(function(s) {
    var name = s.getName();
    // ชีตข้อมูล BD รูปแบบ {factory}_{yyyy-MM}
    if (name.charAt(0) === '_' || name.indexOf('_') < 0) return;
    if (s.getLastRow() < 2) return;
    var rows = s.getDataRange().getValues().slice(1);
    rows.forEach(function(r) {
      var trk = String(r[24] || '');  // col index 24 = tracking
      // รองรับทั้ง BD-CHBx-yyyyMM-NNN และ JOB-CHBx-yyyyMM-NNN
      var m = trk.match(/^(?:BD|JOB)-([A-Z0-9]+)-(\d{6})-(\d+)$/);
      if (!m) return;
      var key = m[1] + '_' + m[2];
      var seq = parseInt(m[3], 10);
      if (!counts[key] || seq > counts[key]) counts[key] = seq;
    });
  });
  Object.keys(counts).forEach(function(key) {
    var vals = sh.getDataRange().getValues();
    var found = false;
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]) === key) { sh.getRange(i+1,2).setValue(counts[key]); found = true; break; }
    }
    if (!found) sh.appendRow([key, counts[key]]);
  });
  Logger.log('seedCounters done: ' + JSON.stringify(counts));
}

const HEADERS = [
  'วันที่บันทึก',
  'ชื่อเครื่องจักร',
  'โรงงาน',
  'พื้นที่',
  'รหัสเครื่องจักร',
  'สาย / ตำแหน่ง',
  'สถานะ',
  'เวลาเริ่ม Breakdown',
  'เวลาเสร็จสิ้น',
  'Downtime (นาที)',
  'ประเภท Breakdown',
  'ปัญหาที่พบ',
  'อุปกรณ์ที่เกิดปัญหา',
  'Why 1', 'Why 2', 'Why 3', 'Why 4', 'Why 5',
  'มาตรการแก้ไข',
  'มาตรการป้องกัน',
  'อายุมาตรฐาน (Std.)',
  'อายุจริงตอนเสีย',
  'หมายเหตุอายุอะไหล่',
  'อะไหล่ที่ใช้',
  'เลข Tracking',         // index 24
  'ผู้ดำเนินการล่าสุด',   // index 25
  'ผู้รับงาน',            // index 26
  'ผู้ปิดงาน',            // index 27
  'รูปก่อนแก้ไข (ID)',    // index 28 (หลายรูปคั่นด้วย |)
  'รูปหลังแก้ไข (ID)',    // index 29
  'Why-Why Images (JSON)',// index 30
  'ประเภทเหตุการณ์',     // index 31 (Breakdown / Adjustment)
  'เหตุผลยกเลิก',        // index 32
];

// ============================================================
// USER AUTH
// ============================================================
function getUserRow(ss, username) {
  var sh = ss.getSheetByName('_Users');
  if (!sh || sh.getLastRow() < 2) return null;
  var u = String(username).trim().toLowerCase();
  var rows = sh.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][2]).trim().toLowerCase() === u) return rows[i];
  }
  return null;
}

function verifyPin(row, pin) {
  return sha256hex(String(row[4]) + String(pin)) === String(row[3]);
}

function userCan(ss, username, pin, perm) {
  var row = getUserRow(ss, username);
  if (!row || !row[6]) return false;
  if (!verifyPin(row, pin)) return false;
  var m = readPermMatrix(ss)[String(row[5]).trim()];
  return m ? Boolean(m[perm]) : false;
}

function getPermsForLevel(level, ss) {
  var m = readPermMatrix(ss)[String(level).trim()];
  if (!m) return [];
  return Object.keys(m).filter(function(k) { return m[k] === 1; });
}

// ============================================================
// POST — บันทึก / อัปเดต
// ============================================================
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.openById(SPREADSHEET_ID);

    // อัปโหลดรูปขึ้น Drive (เฉพาะตอนสร้าง/แก้ไข) → เก็บเป็น fileId
    if (data.action === 'create' || data.action === 'update' || !data.action) {
      data.imgBefore = saveImgList(data.imgBefore);   // หลายรูปคั่น |
      data.imgAfter  = saveImgList(data.imgAfter);
      data.whyImages = saveWhyImgs(data.whyImages);   // Why-Why images (JSON)
    }

    // ---- UPDATE existing row ----
    if (data.action === 'update') {
      const sheet = ss.getSheetByName(data.sheetName);
      if (!sheet || !data.rowIndex) throw new Error('Sheet or rowIndex not found');

      // ผู้รับงาน = คนแรกที่รับงาน (ไม่ทับ) / ผู้ปิดงาน = คนที่กดปิดงาน
      const prev = sheet.getRange(data.rowIndex, 1, 1, HEADERS.length).getValues()[0];
      data.acceptedBy = prev[26] || '';
      data.closedBy   = prev[27] || '';
      if (data.status === 'ดำเนินการเสร็จสิ้น') {
        if (!data.closedBy)   data.closedBy   = data.byName || '';   // เซ็ตครั้งแรกที่ปิด (แก้ Why-Why ภายหลังไม่ทับ)
        if (!data.acceptedBy) data.acceptedBy = data.byName || '';
      } else if (data.status === 'กำลังดำเนินการแก้ไข' || data.status === 'รออะไหล่') {
        if (!data.acceptedBy) data.acceptedBy = data.byName || '';
      }

      const whys    = data.whys || [];
      const partsStr = buildPartsStr(data.parts);
      const row = buildRow(data, whys, partsStr, /*keepTimestamp=*/true);
      sheet.getRange(data.rowIndex, 1, 1, row.length).setValues([row]);

      const detail = buildChangeDetail(prev, row);
      writeLog(ss, data.tracking, 'แก้ไข → ' + (data.status || '') + ' | ' + detail, data.byName, data.status);
      return jsonOut({ success: true, action: 'updated' });
    }

    // ---- SET machines (เขียนทับแท็บ _Machines — มีสำรอง + กันลบทั้งหมด) ----
    if (data.action === 'setMachines') {
      if (!userCan(ss, data.username, data.pin, 'mc.backup'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ mc.backup' });
      const incoming = (data.machines || []).filter(m => m && String(m.id).trim());
      let sh = ss.getSheetByName('_Machines');
      const existingCount = sh ? Math.max(0, sh.getLastRow() - 1) : 0;

      // กันข้อมูลหาย: ของใหม่ว่าง แต่ของเดิมมี → ปฏิเสธ (เว้นแต่ตั้งใจล้างด้วย force)
      if (incoming.length === 0 && existingCount > 0 && !data.force)
        return jsonOut({ success: false, error: 'รายการว่าง — ยกเลิกเพื่อกันข้อมูลหาย' });

      // สำรองของเดิมไว้ที่ _Machines_bak ก่อนเขียนทับ
      if (sh && sh.getLastRow() > 1) {
        let bak = ss.getSheetByName('_Machines_bak') || ss.insertSheet('_Machines_bak');
        bak.clearContents();
        const cur = sh.getDataRange().getValues();
        bak.getRange(1, 1, cur.length, cur[0].length).setValues(cur);
      }

      if (!sh) sh = ss.insertSheet('_Machines');
      sh.clearContents();
      const header = ['รหัสเครื่องจักร', 'ชื่อเครื่องจักร', 'โรงงาน', 'พื้นที่', 'ไลน์', 'ผู้แก้ไข', 'แก้ไขเมื่อ'];
      sh.getRange(1, 1, 1, header.length).setValues([header]);
      const rows = incoming.map(m => [m.id || '', m.name || '', m.factory || '', m.area || '', m.line || '', m.editedBy || '', m.editedAt || '']);
      if (rows.length) sh.getRange(2, 1, rows.length, header.length).setValues(rows);
      return jsonOut({ success: true, count: rows.length, backedUp: existingCount });
    }

    // ---- RESTORE machines จาก _Machines_bak (กู้คืน) ----
    if (data.action === 'restoreMachines') {
      if (!userCan(ss, data.username, data.pin, 'mc.restore'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ mc.restore' });
      const bak = ss.getSheetByName('_Machines_bak');
      if (!bak || bak.getLastRow() < 2) return jsonOut({ success: false, error: 'ไม่มีข้อมูลสำรอง' });
      let sh = ss.getSheetByName('_Machines') || ss.insertSheet('_Machines');
      sh.clearContents();
      const cur = bak.getDataRange().getValues();
      sh.getRange(1, 1, cur.length, cur[0].length).setValues(cur);
      return jsonOut({ success: true, count: cur.length - 1 });
    }

    // ---- UPSERT เครื่องจักรรายตัว (Admin) ----
    if (data.action === 'upsertMachine') {
      if (!userCan(ss, data.username, data.pin, 'mc.edit'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ mc.edit' });
      const m = data.machine || {};
      if (!String(m.id || '').trim()) return jsonOut({ success: false, error: 'ไม่มีรหัสเครื่องจักร' });
      let sh = ss.getSheetByName('_Machines');
      if (!sh) {
        sh = ss.insertSheet('_Machines');
        sh.getRange(1,1,1,7).setValues([['รหัสเครื่องจักร','ชื่อเครื่องจักร','โรงงาน','พื้นที่','ไลน์','ผู้แก้ไข','แก้ไขเมื่อ']]);
      }
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

    // ---- ลบเครื่องจักรรายตัว (Admin) ----
    if (data.action === 'deleteMachineRow') {
      if (!userCan(ss, data.username, data.pin, 'mc.delete'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ mc.delete' });
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

    // ---- ACCEPT job (Engineer / Admin รับงาน) ----
    if (data.action === 'accept') {
      if (!userCan(ss, data.username, data.pin, 'bd.accept'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ bd.accept' });
      const sheet = ss.getSheetByName(data.sheetName);
      if (!sheet || !data.rowIndex) throw new Error('Sheet or rowIndex not found');
      sheet.getRange(data.rowIndex, 7).setValue('รับงานแล้ว');
      sheet.getRange(data.rowIndex, 27).setValue(data.acceptedBy || '');
      writeLog(ss, data.tracking, 'รับงาน — ' + (data.acceptedBy || ''), data.acceptedBy, 'รับงานแล้ว');
      writeAccessLog(ss, data.username, 'accept', 'รับงาน: ' + (data.tracking || ''));
      return jsonOut({ success: true, action: 'accepted' });
    }

    // ---- REPAIR COMPLETE (status + bdEnd + downtime + corrective + imgAfter) ----
    if (data.action === 'repairComplete') {
      if (!userCan(ss, data.username, data.pin, 'bd.editdoc'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ bd.editdoc' });
      const sheet = ss.getSheetByName(data.sheetName);
      if (!sheet || !data.rowIndex) throw new Error('Sheet or rowIndex not found');
      // อ่าน row เพื่อ merge corrective + imgAfter + คำนวณ downtime จาก bdStart
      const row = sheet.getRange(data.rowIndex, 1, 1, 31).getValues()[0];
      const bdStartVal     = row[7]  || '';  // col 8  = bdStart
      const prevCorrective = row[18] || '';  // col 19 = corrective
      const prevImgAfter   = row[29] || '';  // col 30 = imgAfter
      // คำนวณ downtime (นาที)
      let downtimeMin = 0;
      if (bdStartVal && data.bdEnd) {
        const s = new Date(String(bdStartVal).replace(' ', 'T'));
        const e = new Date(String(data.bdEnd).replace(' ', 'T'));
        if (!isNaN(s) && !isNaN(e)) downtimeMin = Math.round((e - s) / 60000);
      }
      // merge corrective (เพิ่มต่อท้ายถ้ามีข้อมูลเดิม)
      const newCorr = (data.corrective || '').trim();
      const mergedCorr = [prevCorrective, newCorr].filter(Boolean).join('\n');
      // upload รูป imgAfter ขึ้น Drive แล้ว merge กับเดิม
      const newImgAfterIds = data.imgAfter ? saveImgList(data.imgAfter) : '';
      const mergedImgAfter = [prevImgAfter, newImgAfterIds].filter(Boolean).join('|');
      // เขียนกลับ
      sheet.getRange(data.rowIndex, 7).setValue('ซ่อมสำเร็จ');       // col 7  = status
      sheet.getRange(data.rowIndex, 9).setValue(data.bdEnd || '');    // col 9  = bdEnd
      if (downtimeMin > 0) sheet.getRange(data.rowIndex, 10).setValue(downtimeMin);  // col 10 = downtime
      sheet.getRange(data.rowIndex, 19).setValue(mergedCorr);         // col 19 = corrective
      if (mergedImgAfter) sheet.getRange(data.rowIndex, 30).setValue(mergedImgAfter); // col 30 = imgAfter
      writeLog(ss, data.tracking, 'ซ่อมสำเร็จ — เวลาเสร็จ: ' + (data.bdEnd || ''), data.byName, 'ซ่อมสำเร็จ');
      writeAccessLog(ss, data.username, 'repairComplete', 'ซ่อมสำเร็จ: ' + (data.tracking || ''));
      return jsonOut({ success: true, action: 'repairComplete' });
    }

    // ---- CANCEL record (เปลี่ยนสถานะเป็น "ยกเลิกงาน" — Admin เท่านั้น) ----
    if (data.action === 'cancel') {
      if (!userCan(ss, data.username, data.pin, 'bd.cancel'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ bd.cancel' });
      const sheet = ss.getSheetByName(data.sheetName);
      if (!sheet || !data.rowIndex) throw new Error('Sheet or rowIndex not found');
      sheet.getRange(data.rowIndex, 7).setValue('ยกเลิกงาน');           // col 7 = สถานะ
      sheet.getRange(data.rowIndex, 33).setValue(data.cancelReason || ''); // col 33 = เหตุผลยกเลิก
      writeLog(ss, data.tracking, 'ยกเลิกงาน — ' + (data.cancelReason || ''), data.byName, 'ยกเลิกงาน');
      writeAccessLog(ss, data.username, 'cancel', 'ยกเลิกงาน: ' + (data.tracking || ''));
      return jsonOut({ success: true, action: 'cancelled' });
    }

    // ---- SAVE Checklist record ----
    if (data.action === 'saveChecklist') {
      const clPerm = data.type === 'pm' ? 'cl.pm' : 'cl.daily';
      if (!userCan(ss, data.username, data.pin, clPerm))
        return jsonOut({ success: false, error: 'ต้องเข้าสู่ระบบก่อน' });
      // Upload per-item images to Drive (Checklist_Images folder)
      data.results = saveChecklistItemImgs(data.results || []);
      let sh = ss.getSheetByName('_Checklists');
      if (!sh) {
        sh = ss.insertSheet('_Checklists');
        const hdr = ['tracking','type','date','shift','factory','area','machineId','machineName','inspector','remark','ok','ng','fix','na','overallResult','resultsJSON','createdAt'];
        const hr = sh.getRange(1, 1, 1, hdr.length);
        hr.setValues([hdr]);
        hr.setBackground('#16a085').setFontColor('#fff').setFontWeight('bold');
        sh.setFrozenRows(1);
      }
      const lock2 = LockService.getScriptLock();
      try { lock2.waitLock(10000); } catch(e) {}
      const seq2 = Math.max(0, sh.getLastRow() - 1) + 1;
      const ym2 = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMM');
      const tracking = 'CL-' + factoryToCHB(data.factory) + '-' + ym2 + '-' + String(seq2).padStart(3,'0');
      sh.appendRow([
        tracking, data.type||'', data.date||'', data.shift||'',
        data.factory||'', data.area||'', data.machineId||'', data.machineName||'',
        data.inspector||'', data.remark||'',
        Number(data.ok)||0, Number(data.ng)||0, Number(data.fix)||0, Number(data.na)||0,
        data.overallResult||'', JSON.stringify(data.results||[]),
        Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss'),
      ]);
      SpreadsheetApp.flush();
      sh.getRange(2, 3, Math.max(1, sh.getLastRow()-1), 1).setNumberFormat('@'); // กัน Sheets แปลง date
      try { lock2.releaseLock(); } catch(e) {}
      writeLog(ss, tracking, 'บันทึก Checklist ' + (data.type||''), data.inspector, data.overallResult);
      return jsonOut({ success: true, tracking });
    }

    // ---- COPY machine items (engineer+admin) ----
    if (data.action === 'copyMachineItems') {
      if (!userCan(ss, data.username, data.pin, 'cl.edit'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ cl.edit' });
      const sourceId  = String(data.sourceId || '').trim();
      const targetIds = (data.targetIds || []).map(id => String(id).trim()).filter(Boolean);
      const type      = data.type || 'daily';
      if (!sourceId || !targetIds.length) return jsonOut({ success: false, error: 'sourceId/targetIds required' });
      const COPY_HDR = ['machineId','machineName','factory','area','dailyEnabled','pmFreqMonths','pmStartMonth','dailyItemsJSON','pmItemsJSON','dailyEditedBy','dailyEditedAt','pmEditedBy','pmEditedAt','dailyMergeDefault'];
      let sh = ss.getSheetByName('_PmPlans');
      if (!sh) {
        sh = ss.insertSheet('_PmPlans');
        const hr = sh.getRange(1, 1, 1, COPY_HDR.length);
        hr.setValues([COPY_HDR]);
        hr.setBackground('#2475b0').setFontColor('#fff').setFontWeight('bold');
        sh.setFrozenRows(1);
      }
      const existing = {};
      const existingOrder = [];
      if (sh.getLastRow() > 1) {
        const lastCol = Math.max(sh.getLastColumn(), COPY_HDR.length);
        const cur = sh.getRange(2, 1, sh.getLastRow()-1, lastCol).getValues();
        cur.forEach(r => {
          if (!r[0]) return;
          const id = String(r[0]);
          existing[id] = r.concat(new Array(COPY_HDR.length)).slice(0, COPY_HDR.length);
          existingOrder.push(id);
        });
      }
      if (!existing[sourceId]) return jsonOut({ success: false, error: 'Source machine not found in _PmPlans' });
      const srcRow   = existing[sourceId];
      const nowStr   = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
      const colIdx   = type === 'daily' ? 7 : 8;
      const editByCol = type === 'daily' ? 9 : 11;
      const editAtCol = type === 'daily' ? 10 : 12;
      targetIds.forEach(tid => {
        if (!existing[tid]) { existingOrder.push(tid); existing[tid] = new Array(COPY_HDR.length).fill(''); existing[tid][0] = tid; }
        existing[tid][colIdx]    = srcRow[colIdx];
        existing[tid][editByCol] = data.editedBy || '';
        existing[tid][editAtCol] = nowStr;
        if (type === 'daily') existing[tid][13] = srcRow[13]; // copy dailyMergeDefault
        if (type === 'pm')   { existing[tid][5] = srcRow[5]; existing[tid][6] = srcRow[6]; } // pmFreq + pmStartMonth
      });
      sh.clearContents();
      sh.getRange(1, 1, 1, COPY_HDR.length).setValues([COPY_HDR]);
      const allRows = existingOrder.map(id => existing[id]).filter(Boolean);
      if (allRows.length) sh.getRange(2, 1, allRows.length, COPY_HDR.length).setValues(allRows);
      writeLog(ss, '-', 'Copy ' + type + ' items: ' + sourceId + ' → ' + targetIds.join(','), data.editedBy||'', '');
      return jsonOut({ success: true, count: targetIds.length });
    }

    // ---- SAVE PM Plans (engineer+admin) — per-row UPSERT, item cols preserved ----
    if (data.action === 'savePmPlans') {
      if (!userCan(ss, data.username, data.pin, 'cl.edit'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ cl.edit' });
      const PM_HDR = ['machineId','machineName','factory','area','dailyEnabled','pmFreqMonths','pmStartMonth','dailyItemsJSON','pmItemsJSON','dailyEditedBy','dailyEditedAt','pmEditedBy','pmEditedAt','dailyMergeDefault'];
      let sh = ss.getSheetByName('_PmPlans');
      if (!sh) {
        sh = ss.insertSheet('_PmPlans');
        const hr = sh.getRange(1, 1, 1, PM_HDR.length);
        hr.setValues([PM_HDR]);
        hr.setBackground('#2475b0').setFontColor('#fff').setFontWeight('bold');
        sh.setFrozenRows(1);
      }
      // Load existing rows into map keyed by machineId
      const existing = {};
      const existingOrder = [];
      if (sh.getLastRow() > 1) {
        const cur = sh.getRange(2, 1, sh.getLastRow()-1, Math.max(sh.getLastColumn(), PM_HDR.length)).getValues();
        cur.forEach(r => {
          if (!r[0]) return;
          const id = String(r[0]);
          existing[id] = r.concat(new Array(PM_HDR.length)).slice(0, PM_HDR.length);
          existingOrder.push(id);
        });
      }
      const nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
      const plans = data.plans || [];
      plans.forEach(p => {
        const id = String(p.machineId || '').trim();
        if (!id) return;
        if (!existing[id]) { existingOrder.push(id); existing[id] = new Array(PM_HDR.length).fill(''); }
        const prev = existing[id];
        existing[id] = [
          id,
          p.machineName || prev[1] || '',
          p.factory     || prev[2] || '',
          p.area        || prev[3] || '',
          prev[4] !== '' && prev[4] !== undefined ? prev[4] : 1,  // dailyEnabled — preserved
          Number(p.pmFreqMonths || p.pmFreq) || Number(prev[5]) || 3,
          p.pmStartMonth || prev[6] || '',
          prev[7] || '[]',   // dailyItemsJSON — preserved
          prev[8] || '[]',   // pmItemsJSON — preserved
          prev[9]  || '',    // dailyEditedBy — preserved
          prev[10] || '',    // dailyEditedAt — preserved
          data.editedBy || prev[11] || '',
          nowStr,
          p.dailyMergeDefault !== undefined ? (p.dailyMergeDefault ? 1 : 0) : (prev[13] !== '' && prev[13] !== undefined ? prev[13] : 0),
        ];
      });
      sh.clearContents();
      sh.getRange(1, 1, 1, PM_HDR.length).setValues([PM_HDR]);
      const allRows = existingOrder.map(id => existing[id]).filter(Boolean);
      if (allRows.length) sh.getRange(2, 1, allRows.length, PM_HDR.length).setValues(allRows);
      sh.getRange(2, 7, Math.max(1, sh.getLastRow()-1), 1).setNumberFormat('@'); // กัน Sheets แปลง pmStartMonth เป็น Date
      writeLog(ss, '-', 'บันทึกแผน PM (' + plans.length + ' เครื่อง)', data.editedBy||'', '');
      return jsonOut({ success: true, count: allRows.length });
    }

    // ---- SAVE Daily Default items (engineer+admin) ----
    if (data.action === 'saveDailyDefault') {
      if (!userCan(ss, data.username, data.pin, 'cl.edit'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ cl.edit' });
      let sh = ss.getSheetByName('_DailyDefault');
      if (!sh) {
        sh = ss.insertSheet('_DailyDefault');
        const hr = sh.getRange(1, 1, 1, 3);
        hr.setValues([['itemsJSON','editedBy','editedAt']]);
        hr.setBackground('#27ae60').setFontColor('#fff').setFontWeight('bold');
        sh.setFrozenRows(1);
      }
      const nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
      sh.clearContents();
      sh.getRange(1,1,1,3).setValues([['itemsJSON','editedBy','editedAt']]);
      sh.getRange(2,1,1,3).setValues([[JSON.stringify(data.items||[]), data.editedBy||'', nowStr]]);
      writeLog(ss, '-', 'แก้ไข Daily Default items', data.editedBy||'', '');
      return jsonOut({ success: true });
    }

    // ---- SAVE per-machine items (engineer+admin) ----
    if (data.action === 'saveMachineItems') {
      if (!userCan(ss, data.username, data.pin, 'cl.edit'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ cl.edit' });
      const machineId = String(data.machineId || '').trim();
      const type = data.type || 'daily'; // 'daily' | 'pm'
      if (!machineId) return jsonOut({ success: false, error: 'machineId required' });
      const PM_HDR2 = ['machineId','machineName','factory','area','dailyEnabled','pmFreqMonths','pmStartMonth','dailyItemsJSON','pmItemsJSON','dailyEditedBy','dailyEditedAt','pmEditedBy','pmEditedAt','dailyMergeDefault'];
      let sh = ss.getSheetByName('_PmPlans');
      if (!sh) {
        sh = ss.insertSheet('_PmPlans');
        const hr = sh.getRange(1, 1, 1, PM_HDR2.length);
        hr.setValues([PM_HDR2]);
        hr.setBackground('#2475b0').setFontColor('#fff').setFontWeight('bold');
        sh.setFrozenRows(1);
      }
      const nowStr = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
      let rowIdx = -1;
      let rowData = new Array(PM_HDR2.length).fill('');
      if (sh.getLastRow() > 1) {
        const lastCol = Math.max(sh.getLastColumn(), PM_HDR2.length);
        const vals = sh.getRange(2, 1, sh.getLastRow()-1, lastCol).getValues();
        for (let i = 0; i < vals.length; i++) {
          if (String(vals[i][0]) === machineId) {
            rowIdx = i + 2;
            rowData = vals[i].concat(new Array(PM_HDR2.length)).slice(0, PM_HDR2.length);
            break;
          }
        }
      }
      rowData[0] = machineId;
      if (data.machineName) rowData[1] = data.machineName;
      if (data.factory)     rowData[2] = data.factory;
      if (data.area)        rowData[3] = data.area;
      if (type === 'daily') {
        rowData[4] = data.dailyEnabled !== undefined ? (data.dailyEnabled ? 1 : 0) : (rowData[4] !== '' ? rowData[4] : 1);
        rowData[7] = JSON.stringify(data.items || []);
        rowData[9]  = data.editedBy || '';
        rowData[10] = nowStr;
        if (data.dailyMergeDefault !== undefined) rowData[13] = data.dailyMergeDefault ? 1 : 0;
      } else {
        rowData[8]  = JSON.stringify(data.items || []);
        rowData[11] = data.editedBy || '';
        rowData[12] = nowStr;
      }
      if (rowIdx > 0) {
        sh.getRange(rowIdx, 1, 1, PM_HDR2.length).setValues([rowData]);
        sh.getRange(rowIdx, 7, 1, 1).setNumberFormat('@'); // กัน Sheets แปลง pmStartMonth เป็น Date
      } else {
        if (!rowData[5]) rowData[5] = 3;
        if (!rowData[7]) rowData[7] = '[]';
        if (!rowData[8]) rowData[8] = '[]';
        sh.appendRow(rowData);
        sh.getRange(sh.getLastRow(), 7, 1, 1).setNumberFormat('@');
      }
      SpreadsheetApp.flush();
      writeLog(ss, '-', 'แก้ไข ' + (type === 'daily' ? 'Daily' : 'PM') + ' items — ' + machineId, data.editedBy||'', '');
      return jsonOut({ success: true });
    }

    // ---- SAVE PM Specific Dates ----
    if (data.action === 'savePmDates') {
      if (!userCan(ss, data.username, data.pin, 'cl.calendar'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ cl.calendar' });
      let sh = ss.getSheetByName('_PmDates');
      if (!sh) {
        sh = ss.insertSheet('_PmDates');
        const hr = sh.getRange(1, 1, 1, 2);
        hr.setValues([['key','date']]);
        hr.setBackground('#8e44ad').setFontColor('#fff').setFontWeight('bold');
        sh.setFrozenRows(1);
      }
      // upsert: โหลดของเดิม แล้วแทนที่/เพิ่ม
      const existing = {};
      if (sh.getLastRow() > 1) {
        sh.getRange(2, 1, sh.getLastRow()-1, 2).getValues().forEach(r => { if(r[0]) existing[r[0]] = r[1]; });
      }
      const updates = data.dates || {}; // { key: date }
      Object.assign(existing, updates);
      sh.clearContents();
      sh.getRange(1,1,1,2).setValues([['key','date']]);
      const rows = Object.entries(existing).map(([k,v]) => [k, v]);
      if (rows.length) sh.getRange(2, 1, rows.length, 2).setValues(rows);
      return jsonOut({ success: true, count: rows.length });
    }

    // ---- DELETE row (Admin เท่านั้น — เช็ครหัสฝั่ง server) ----
    if (data.action === 'delete') {
      if (!userCan(ss, data.username, data.pin, 'bd.cancel'))
        return jsonOut({ success: false, error: 'ต้องมีสิทธิ์ bd.cancel' });
      const sheet = ss.getSheetByName(data.sheetName);
      if (!sheet || !data.rowIndex) throw new Error('Sheet or rowIndex not found');
      // ลบไฟล์รูปใน Drive ที่ผูกกับเอกสารนี้ (ก่อน/หลัง) ก่อนลบแถว
      const row = sheet.getRange(data.rowIndex, 1, 1, HEADERS.length).getValues()[0];
      splitIds(row[28]).forEach(trashDriveFile);
      splitIds(row[29]).forEach(trashDriveFile);
      collectWhyImgIds(row[30]).forEach(trashDriveFile);   // Why-Why image ids (JSON) — ถ้ามี
      sheet.deleteRow(data.rowIndex);
      writeLog(ss, data.tracking, 'ลบเอกสาร', data.byName, 'ลบแล้ว');
      return jsonOut({ success: true, action: 'deleted' });
    }

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
      if (REGISTER_LEVELS.indexOf(rLevel) < 0) return jsonOut({ success:false, error:'Level ไม่ถูกต้อง' });
      if (getUserRow(ss, rUser)) return jsonOut({ success:false, error:'username นี้มีอยู่ในระบบแล้ว' });
      var shReg = ensurePendingUsers(ss);
      var uLower = rUser.toLowerCase();
      var pend = shReg.getDataRange().getValues();
      for (var ip = 1; ip < pend.length; ip++) {
        if (String(pend[ip][2]).toLowerCase() === uLower && String(pend[ip][7]) === 'pending')
          return jsonOut({ success:false, error:'username นี้มีคำขอที่รออนุมัติอยู่แล้ว' });
      }
      var rDept = String(rg.department||'').trim();
      var rSalt = Utilities.getUuid();
      var rNow  = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
      shReg.appendRow([Utilities.getUuid(), rName, rUser, sha256hex(rSalt + rPin), rSalt, rLevel, rNow, 'pending', rDept]);
      writeAccessLog(ss, rUser, 'registerUser', 'คำขอใช้งานใหม่: ' + rUser + ' (' + rLevel + ')');
      return jsonOut({ success:true });
    }

    // ---- USER ACCESS: addUser ----
    if (data.action === 'addUser') {
      if (!userCan(ss, data.username, data.pin, 'ua.add'))
        return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.add' });
      var shU = ss.getSheetByName('_Users');
      if (!shU) return jsonOut({ success:false, error:'ไม่พบ sheet _Users' });
      var existRows = shU.getDataRange().getValues().slice(1);
      if (existRows.some(function(r){ return String(r[2]).toLowerCase() === String((data.newUser||{}).username||'').toLowerCase(); }))
        return jsonOut({ success:false, error:'username นี้มีอยู่แล้ว' });
      var salt = Utilities.getUuid();
      var nowStr = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
      shU.appendRow([Utilities.getUuid(), data.newUser.name, data.newUser.username,
                     sha256hex(salt + data.newUser.pin), salt, data.newUser.level, true, nowStr, data.username,
                     String(data.newUser.department||'').trim()]);
      writeAccessLog(ss, data.username, 'addUser', 'เพิ่ม user: ' + data.newUser.username + ' (' + data.newUser.level + ')');
      return jsonOut({ success:true });
    }

    // ---- USER ACCESS: deleteUser ----
    if (data.action === 'deleteUser') {
      if (!userCan(ss, data.username, data.pin, 'ua.del'))
        return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.del' });
      var shD = ss.getSheetByName('_Users');
      if (!shD) return jsonOut({ success:false, error:'ไม่พบ sheet _Users' });
      var rowsD = shD.getDataRange().getValues();
      for (var iD = rowsD.length - 1; iD >= 1; iD--) {
        if (String(rowsD[iD][0]) === String(data.userId)) {
          if (String(rowsD[iD][2]).toLowerCase() === 'admin' && String(data.username).toLowerCase() !== 'admin')
            return jsonOut({ success:false, error:'ลบบัญชี admin หลักไม่ได้' });
          writeAccessLog(ss, data.username, 'deleteUser', 'ลบ user: ' + rowsD[iD][2]);
          shD.deleteRow(iD + 1);
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
      var rowsL = shL ? shL.getDataRange().getValues() : [];
      for (var iL = 1; iL < rowsL.length; iL++) {
        if (String(rowsL[iL][0]) === String(data.userId)) {
          shL.getRange(iL + 1, 6).setValue(data.level);
          writeAccessLog(ss, data.username, 'setUserLevel', rowsL[iL][2] + ' → ' + data.level);
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
      var rowsP = shP ? shP.getDataRange().getValues() : [];
      for (var iP = 1; iP < rowsP.length; iP++) {
        if (String(rowsP[iP][0]) === String(data.userId)) {
          var newSalt = Utilities.getUuid();
          shP.getRange(iP + 1, 4).setValue(sha256hex(newSalt + String(data.newPin)));
          shP.getRange(iP + 1, 5).setValue(newSalt);
          writeAccessLog(ss, data.username, 'resetUserPin', 'รีเซ็ต PIN: ' + rowsP[iP][2]);
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
      var rowsA = shA ? shA.getDataRange().getValues() : [];
      for (var iA = 1; iA < rowsA.length; iA++) {
        if (String(rowsA[iA][0]) === String(data.userId)) {
          shA.getRange(iA + 1, 7).setValue(!!data.active);
          writeAccessLog(ss, data.username, 'toggleUserActive', rowsA[iA][2] + ' → ' + (data.active ? 'เปิด' : 'ปิด'));
          return jsonOut({ success:true });
        }
      }
      return jsonOut({ success:false, error:'ไม่พบ user' });
    }

    // ---- USER ACCESS: setPermission (Phase 3) ----
    if (data.action === 'setPermission') {
      if (!userCan(ss, data.username, data.pin, 'ua.perm'))
        return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.perm' });
      var shP = ss.getSheetByName('_Permissions');
      if (!shP) return jsonOut({ success:false, error:'ไม่พบ sheet _Permissions (รัน seedPermissions ก่อน)' });
      var rowsP = shP.getDataRange().getValues();
      for (var iP = 1; iP < rowsP.length; iP++) {
        if (String(rowsP[iP][0]).trim() === String(data.role).trim() &&
            String(rowsP[iP][1]).trim() === String(data.perm_code).trim()) {
          shP.getRange(iP + 1, 3).setValue(data.allow ? 1 : 0);
          CacheService.getScriptCache().remove('perm_matrix');   // invalidate cache
          writeAccessLog(ss, data.username, 'setPermission', data.role + '.' + data.perm_code + ' → ' + (data.allow ? '✓' : '✗'));
          return jsonOut({ success:true });
        }
      }
      return jsonOut({ success:false, error:'ไม่พบ permission row: ' + data.role + '.' + data.perm_code });
    }

    // ---- USER ACCESS: setUserDept ----
    if (data.action === 'setUserDept') {
      if (!userCan(ss, data.username, data.pin, 'ua.level'))
        return jsonOut({ success:false, error:'ต้องมีสิทธิ์ ua.level' });
      var depts = ['QA','Production','Engineer','Safety','อื่นๆ',''];
      var newDept = String(data.department||'').trim();
      if (depts.indexOf(newDept) < 0) return jsonOut({ success:false, error:'แผนกไม่ถูกต้อง' });
      var shDt = ss.getSheetByName('_Users');
      var rowsDt = shDt ? shDt.getDataRange().getValues() : [];
      for (var iDt = 1; iDt < rowsDt.length; iDt++) {
        if (String(rowsDt[iDt][0]) === String(data.userId)) {
          shDt.getRange(iDt + 1, 10).setValue(newDept);
          writeAccessLog(ss, data.username, 'setUserDept', rowsDt[iDt][2] + ' → ' + newDept);
          return jsonOut({ success:true });
        }
      }
      return jsonOut({ success:false, error:'ไม่พบ user' });
    }

    // ---- RANKING: setRankingSection ----
    if (data.action === 'setRankingSection') {
      return handleSetRankingSection_(ss, data);
    }
    // ---- RANKING: setAreaDescriptions ----
    if (data.action === 'setAreaDescriptions') {
      return handleSetAreaDescriptions_(ss, data);
    }
    // ---- RANKING: setFormApproval ----
    if (data.action === 'setFormApproval') {
      return handleSetFormApproval_(ss, data);
    }

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
          var finalLevel = (data.level && ALL_LEVELS.indexOf(String(data.level)) >= 0) ? String(data.level) : pLevel;
          if (getUserRow(ss, pUser)) {
            shAp.getRange(ia+1, 8).setValue('approved');
            return jsonOut({ success:false, error:'username นี้ถูกสร้างไปแล้ว (ปิดคำขอให้อัตโนมัติ)' });
          }
          var shU = ss.getSheetByName('_Users');
          if (!shU) return jsonOut({ success:false, error:'ไม่พบ sheet _Users' });
          var apNow = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
          var pDept = String(apRows[ia][8]||'').trim();
          shU.appendRow([Utilities.getUuid(), pName, pUser, pHash, pSalt, finalLevel, true, apNow, 'approve:'+data.username, pDept]);
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

    // ---- MACHINE CONFIG: setMachineConfig ----
    if (data.action === 'setMachineConfig') {
      if (!userCan(ss, data.username, data.pin, 'mc.edit'))
        return jsonOut({ success:false, error:'ต้องมีสิทธิ์ mc.edit' });
      var code = String(data.machineCode||'').trim();
      if (!code) return jsonOut({ success:false, error:'ไม่ระบุรหัสเครื่อง' });
      var sh = ensureMachineConfig_(ss), v = sh.getDataRange().getValues(), found = -1;
      for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === code) { found = i+1; break; }
      var row = [code, Number(data.plannedMinPerDay)||0, Number(data.idealCycleSec)||0, String(data.note||'')];
      if (found > 0) sh.getRange(found,1,1,4).setValues([row]);
      else sh.appendRow(row);
      writeAccessLog(ss, data.username, 'setMachineConfig', code + ' planned=' + row[1]);
      return jsonOut({ success:true });
    }

    // ---- CREATE new row ----
    // ล็อกกันเลขรันชนกันเวลาหลายคนแจ้งพร้อมกัน
    const lock = LockService.getScriptLock();
    try { lock.waitLock(15000); } catch (e) {}

    const factoryCode = (data.factory || 'Unknown').replace(/\s+/g, '');
    const now         = new Date();
    const month       = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyy-MM');
    const sheetName   = factoryCode + '_' + month;

    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      const hRange = sheet.getRange(1, 1, 1, HEADERS.length);
      hRange.setValues([HEADERS]);
      hRange.setBackground('#f97316');
      hRange.setFontColor('#ffffff');
      hRange.setFontWeight('bold');
      sheet.setFrozenRows(1);
      sheet.setColumnWidths(1, HEADERS.length, 120);
      sheet.setColumnWidth(1, 140);
      sheet.setColumnWidth(12, 240);
      sheet.setColumnWidth(13, 200);
    }

    // เลขรันต่อเนื่อง แยกตามโรงงาน+เดือน → JOB-CHB{n}-{YYYYMM}-{NNN}
    // ใช้ _Counters (increment-only) ป้องกันสวมเลขเมื่อ delete แถว
    const ym      = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMM');
    const ctrKey  = factoryToCHB(data.factory) + '_' + ym;
    const seq     = nextJobSeq(ss, ctrKey);
    data.tracking = 'JOB-' + factoryToCHB(data.factory) + '-' + ym + '-' + String(seq).padStart(3, '0');

    const whys    = data.whys || [];
    const partsStr = buildPartsStr(data.parts);
    sheet.appendRow(buildRow(data, whys, partsStr, /*keepTimestamp=*/false, now));
    SpreadsheetApp.flush();
    try { lock.releaseLock(); } catch (e) {}

    writeLog(ss, data.tracking, 'แจ้ง Breakdown (สร้างใหม่)', data.byName, data.status);
    return jsonOut({ success: true, sheet: sheetName, tracking: data.tracking });

  } catch (err) {
    return jsonOut({ success: false, error: err.toString() });
  }
}

function buildRow(data, whys, partsStr, keepTimestamp, now) {
  const ts = keepTimestamp
    ? (data.timestamp || '')
    : Utilities.formatDate(now || new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss');
  return [
    ts,
    data.machineName   || '',
    data.factory       || '',
    data.area          || '',
    data.machineId     || '',
    data.line          || '',
    data.status        || '',
    data.bdStart       || '',
    data.bdEnd         || '',
    Number(data.downtimeMin) || 0,
    data.bdType        || '',
    data.problem       || '',
    data.device        || '',
    whys[0]||'', whys[1]||'', whys[2]||'', whys[3]||'', whys[4]||'',
    data.corrective    || '',
    data.preventive    || '',
    data.stdLife       || '',
    data.actualLife    || '',
    data.lifeNote      || '',
    partsStr,
    data.tracking      || '',
    data.byName        || '',
    data.acceptedBy    || '',
    data.closedBy      || '',
    data.imgBefore     || '',
    data.imgAfter      || '',
    data.whyImages     || '',
    data.eventType     || '',
    data.cancelReason  || '',
  ];
}

// รันฟังก์ชันนี้ 1 ครั้งในตัว editor เพื่ออนุญาตสิทธิ์ Google Drive (แก้ error DriveApp ไม่ได้รับอนุญาต)
function authorizeDrive() {
  DriveApp.getRootFolder().getName();   // กด Run → Allow สิทธิ์ Drive
  return 'OK — Drive authorized';
}

// อัปโหลดรูป (dataURL) ขึ้น Drive → คืน fileId / ถ้าเป็น id เดิมอยู่แล้วก็คืนเดิม
function saveImgToDrive(val) {
  if (!val || String(val).indexOf('data:') !== 0) return val || '';
  const m = String(val).match(/^data:([^;]+);base64,(.*)$/);
  if (!m) return '';
  const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'bd_' + Date.now() + '_' + Math.floor(Math.random() * 1e5));
  const it = DriveApp.getFoldersByName('BreakdownReport_Images');
  const folder = it.hasNext() ? it.next() : DriveApp.createFolder('BreakdownReport_Images');
  return folder.createFile(blob).getId();
}

// แยกหลาย fileId (คั่นด้วย |) → array (รองรับ before/after หลายรูป)
function splitIds(s) { return String(s || '').split('|').map(x => x.trim()).filter(Boolean); }

// แปลงรายการรูป (คั่น |) เป็น id: dataURL→อัปขึ้น Drive, id เดิม→คงไว้
function saveImgList(val) {
  return splitIds(val).map(v => saveImgToDrive(v)).filter(Boolean).join('|');
}

// Why-Why images: JSON { "path": ["dataURL/id", ...] } → อัปรูปใหม่ แล้วคืน JSON ของ fileId
function saveWhyImgs(json) {
  let obj; try { obj = JSON.parse(json || '{}'); } catch (e) { return ''; }
  const out = {};
  Object.keys(obj).forEach(p => {
    const ids = (obj[p] || []).map(v => saveImgToDrive(v)).filter(Boolean);
    if (ids.length) out[p] = ids;
  });
  return JSON.stringify(out);
}
// อัปโหลดรูปของแต่ละ item ใน checklist (folder Checklist_Images) — replaces dataURL with fileId
function saveChecklistItemImgs(results) {
  let folder = null;
  return (results||[]).map(item => {
    const imgs = (item.images||[]).map(v => {
      if (!v || String(v).indexOf('data:') !== 0) return v || '';
      if (!folder) {
        const it = DriveApp.getFoldersByName('Checklist_Images');
        folder = it.hasNext() ? it.next() : DriveApp.createFolder('Checklist_Images');
      }
      const m = String(v).match(/^data:([^;]+);base64,(.*)$/);
      if (!m) return '';
      const blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], 'cl_item_' + Date.now() + '_' + Math.floor(Math.random()*1e5));
      return folder.createFile(blob).getId();
    }).filter(Boolean);
    return Object.assign({}, item, { images: imgs });
  });
}

function collectWhyImgIds(json) {
  try { return Object.keys(JSON.parse(json || '{}')).reduce((a, p) => a.concat(JSON.parse(json)[p]), []).filter(Boolean); }
  catch (e) { return []; }
}

function trashDriveFile(id) {
  if (!id) return;
  try { DriveApp.getFileById(String(id)).setTrashed(true); } catch (e) {}
}

// ดึงรูปจาก Drive กลับมาเป็น dataURL (สำหรับแสดง/ใส่ PDF)
function doGetImage(id) {
  try {
    const blob = DriveApp.getFileById(id).getBlob();
    return jsonOut({ success: true, dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) });
  } catch (e) { return jsonOut({ success: false, error: String(e) }); }
}

// เก็บ log ทุกการกระทำลงชีต "_Log" (ใคร/เมื่อไหร่/ทำอะไร)
function buildChangeDetail(prev, row) {
  const WATCH = [6,7,8,9,10,11,12,18,19,23,31];
  const trunc = v => { v = String(v == null ? '' : v); return v.length > 40 ? v.slice(0,40)+'…' : v; };
  const changes = [];
  WATCH.forEach(i => {
    const a = String(prev[i] == null ? '' : prev[i]);
    const b = String(row[i]  == null ? '' : row[i]);
    if (a !== b) changes.push((typeof HEADERS !== 'undefined' && HEADERS[i] ? HEADERS[i] : 'col'+i) + ' [' + trunc(a) + '→' + trunc(b) + ']');
  });
  return changes.length ? changes.join(', ') : 'ไม่มีการเปลี่ยนฟิลด์หลัก';
}

function writeLog(ss, tracking, action, byName, status) {
  let log = ss.getSheetByName('_Log');
  if (!log) {
    log = ss.insertSheet('_Log');
    const h = log.getRange(1, 1, 1, 5);
    h.setValues([['เวลา', 'เลข Tracking', 'การกระทำ', 'ผู้ดำเนินการ', 'สถานะ']]);
    h.setBackground('#18181b').setFontColor('#ffffff').setFontWeight('bold');
    log.setFrozenRows(1);
  }
  log.appendRow([
    Utilities.formatDate(new Date(), 'Asia/Bangkok', 'dd/MM/yyyy HH:mm:ss'),
    tracking || '', action || '', byName || '', status || '',
  ]);
}

// โรงงาน → รหัส CHB (โรงงาน 1 → CHB1, โรงงาน 2 → CHB2)
function factoryToCHB(factory) {
  const m = String(factory || '').match(/(\d+)/);
  return 'CHB' + (m ? m[1] : 'X');
}

function buildPartsStr(parts) {
  return (parts || [])
    .filter(p => p.name)
    .map(p => `${p.name}${p.partNo ? ' (' + p.partNo + ')' : ''} x${p.qty || 1} ${p.unit || 'ชิ้น'}`)
    .join(' | ');
}

// ============================================================
// GET — ดึงข้อมูล (getData / getAll)
// ============================================================
function doGet(e) {
  try {
    const action  = e.parameter.action  || '';
    const year    = e.parameter.year    || String(new Date().getFullYear());
    const factory = (e.parameter.factory || '').trim();
    const area    = e.parameter.area    || '';
    const status  = e.parameter.status  || '';
    const month   = e.parameter.month   || ''; // YYYY-MM
    const machineId = e.parameter.machineId || '';

    if (action === 'login') {
      var uname = (e.parameter.user || '').trim();
      var pin   = (e.parameter.pin  || '').trim();
      if (!uname || !pin) return jsonOut({ success: false, error: 'กรุณากรอก username และ PIN' });
      var ss2 = SpreadsheetApp.openById(SPREADSHEET_ID);
      var row  = getUserRow(ss2, uname);
      if (!row)    return jsonOut({ success: false, error: 'ไม่พบ username' });
      if (!row[6]) return jsonOut({ success: false, error: 'บัญชีถูกระงับ' });
      if (!verifyPin(row, pin)) return jsonOut({ success: false, error: 'PIN ไม่ถูกต้อง' });
      var perms = getPermsForLevel(row[5], ss2);
      return jsonOut({ success: true, name: String(row[1]).trim(), level: String(row[5]).trim(), perms: perms, department: String(row[9]||'').trim() });
    }
    if (action === 'getLog') {
      return doGetLog(e.parameter.tracking || '');
    }
    if (action === 'getMachines') {
      return doGetMachines();
    }
    if (action === 'getImage') {
      return doGetImage(e.parameter.id || '');
    }
    if (action === 'getData') {
      return doGetSummary(year, factory, area);
    }
    if (action === 'getAll') {
      return doGetAll(factory, area, status, month, machineId);
    }
    if (action === 'getChecklists') {
      return doGetChecklists(factory, area, e.parameter.type||'', month, e.parameter.year||'');
    }
    if (action === 'getPmPlans') {
      return doGetPmPlans(factory, area);
    }
    if (action === 'getPmDates') {
      return doGetPmDates(e.parameter.monthKey||'');
    }
    if (action === 'getDailyDefault') {
      return doGetDailyDefault();
    }
    if (action === 'getUsers') {
      var ss2 = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sh  = ss2.getSheetByName('_Users');
      if (!sh || sh.getLastRow() < 2) return jsonOut({ success: true, data: [] });
      var data = sh.getDataRange().getValues().slice(1).map(function(r) {
        return { id:r[0], name:r[1], username:r[2], level:r[5], active:r[6], createdAt:r[7], department:String(r[9]||'').trim() };
      });
      return jsonOut({ success: true, data: data });
    }
    if (action === 'getPendingUsers') {
      var ssP = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shP = ssP.getSheetByName('_PendingUsers');
      if (!shP || shP.getLastRow() < 2) return jsonOut({ success:true, data:[] });
      var dataP = shP.getDataRange().getValues().slice(1)
        .filter(function(r){ return String(r[7]) === 'pending'; })
        .map(function(r){ return { id:r[0], name:r[1], username:r[2], level:r[5], requestedAt:r[6], department:String(r[8]||'').trim() }; });
      return jsonOut({ success:true, data: dataP });
    }
    if (action === 'getPermissions') {
      var ssPerm = SpreadsheetApp.openById(SPREADSHEET_ID);
      return jsonOut({ success: true, data: readPermMatrix(ssPerm) });
    }
    if (action === 'getAccessLog') {
      var ssAL = SpreadsheetApp.openById(SPREADSHEET_ID);
      var shAL = ssAL.getSheetByName('_AccessLog');
      if (!shAL || shAL.getLastRow() < 2) return jsonOut({ success:true, data:[] });
      var rowsAL = shAL.getDataRange().getValues().slice(1).reverse().slice(0, 200).map(function(r){
        return { time:String(r[0]), username:r[1], action:r[2], detail:r[3] };
      });
      return jsonOut({ success:true, data: rowsAL });
    }
    if (action === 'getReliabilityMetrics') {
      var ssR = SpreadsheetApp.openById(SPREADSHEET_ID);
      var fromD = e.parameter.from ? new Date(e.parameter.from) : new Date('2000-01-01');
      var toD   = e.parameter.to   ? new Date(e.parameter.to + 'T23:59:59') : new Date();
      var facF  = (e.parameter.factory || '').trim();            // '' = ทุกโรงงาน
      var cfg   = readMachineConfig_(ssR);
      var days  = Math.max(1, Math.round((toD - fromD)/86400000) + 1);
      var agg   = {};
      ssR.getSheets().forEach(function(sh){
        if (!/_\d{4}-\d{2}$/.test(sh.getName()) || sh.getLastRow() < 2) return;  // เฉพาะชีต BD รายเดือน
        var rows = sh.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          var r = rows[i];
          var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
          if (isNaN(d) || d < fromD || d > toD) continue;
          if (String(r[31] || 'Breakdown') !== 'Breakdown') continue;   // ตัด Adjustment
          if (String(r[32] || '').trim()) continue;                      // ตัดงานยกเลิก
          if (facF && String(r[2] || '').trim() !== facF) continue;      // filter factory (เทียบตรง)
          var code = String(r[4] || '').trim() || String(r[1] || '').trim();
          if (!code) continue;
          if (!agg[code]) agg[code] = { code:code, name:String(r[1]||''), factory:String(r[2]||''), fail:0, dt:0 };
          agg[code].fail += 1;
          agg[code].dt   += Number(r[9]) || 0;
        }
      });
      var out = Object.keys(agg).map(function(code){
        var a = agg[code], c = cfg[code];
        var ppm  = c && c.planned > 0 ? c.planned * days : null;
        var mttr = a.fail ? a.dt / a.fail : 0;
        var avail = (ppm != null) ? Math.max(0, (ppm - a.dt) / ppm) : null;
        var mtbf  = (ppm != null && a.fail) ? (ppm - a.dt) / a.fail : null;
        return {
          code:a.code, name:a.name, factory:a.factory,
          failures:a.fail, downtimeMin:Math.round(a.dt), mttrMin:Math.round(mttr),
          mtbfMin: mtbf != null ? Math.round(mtbf) : null,
          availability: avail != null ? Math.round(avail*1000)/10 : null,   // %
          hasConfig: ppm != null
        };
      });
      return jsonOut({ success:true, days:days, data:out });
    }

    if (action === 'getMachineConfig') {
      var ssC = SpreadsheetApp.openById(SPREADSHEET_ID);
      var cm  = readMachineConfig_(ssC);
      var arr = Object.keys(cm).map(function(k){ return { machineCode:k, plannedMinPerDay:cm[k].planned, idealCycleSec:cm[k].cycle, note:cm[k].note }; });
      return jsonOut({ success:true, data:arr });
    }

    if (action === 'getMachineRankings')  return doGetMachineRankings_(e.parameter);
    if (action === 'getRankingOverview')  return doGetRankingOverview_(e.parameter);
    if (action === 'getAreaDescriptions') return doGetAreaDescriptions_(e.parameter);
    if (action === 'getFormApprovals')    return doGetFormApprovals_(e.parameter);

    return jsonOut({ success: false, error: 'Unknown action' });

  } catch (err) {
    return jsonOut({ success: false, error: err.toString() });
  }
}

// สรุปข้อมูลรายเดือน (สำหรับ Summary tab)
function doGetSummary(year, factory, area) {
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  const rows   = [];

  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name.charAt(0) === '_') return;   // ข้ามชีตภายใน (_Log)
    if (!name.includes('_')) return;
    const sheetMonth = name.split('_').pop();
    if (!sheetMonth.startsWith(year)) return;
    if (factory && !name.startsWith(factory)) return;

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (!r[0]) continue;
      if (area && r[3] !== area) continue;
      rows.push({
        month:       sheetMonth,
        machineName: r[1],  factory:    r[2],
        area:        r[3],  status:     r[6],
        downtimeMin: Number(r[9]) || 0,
        bdType:      r[10],
      });
    }
  });
  return jsonOut({ success: true, year, data: rows });
}

// ดึงข้อมูลทั้งหมด พร้อม rowIndex (สำหรับ Records tab + Edit)
function doGetAll(factory, area, status, month, machineId) {
  const mid = (machineId || '').toLowerCase();
  const ss     = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheets = ss.getSheets();
  const rows   = [];

  sheets.forEach(sheet => {
    const name = sheet.getName();
    if (name.charAt(0) === '_') return;   // ข้ามชีตภายใน (_Log)
    if (!name.includes('_')) return;
    const sheetMonth = name.split('_').pop(); // YYYY-MM
    const sheetFactory = name.replace('_' + sheetMonth, '');

    if (factory && sheetFactory !== factory.replace(/\s+/g,'')) return;
    if (month   && sheetMonth !== month) return;

    const data = sheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (!r[0]) continue;
      if (area   && r[3] !== area)   continue;
      if (status && r[6] !== status) continue;
      if (mid    && String(r[4]).toLowerCase().indexOf(mid) < 0) continue; // รหัสเครื่องจักร (บางส่วน)

      const whys = [r[13]||'', r[14]||'', r[15]||'', r[16]||'', r[17]||''].filter(Boolean);
      rows.push({
        rowIndex:    i + 1,            // 1-based row number ใน sheet
        sheetName:   name,
        timestamp:   r[0]  ? String(r[0])  : '',
        machineName: r[1]  || '',
        factory:     r[2]  || '',
        area:        r[3]  || '',
        machineId:   r[4]  || '',
        line:        r[5]  || '',
        status:      r[6]  || '',
        bdStart:     r[7]  || '',
        bdEnd:       r[8]  || '',
        downtimeMin: Number(r[9])  || 0,
        bdType:      r[10] || '',
        problem:     r[11] || '',
        device:      r[12] || '',
        whys,
        corrective:  r[18] || '',
        preventive:  r[19] || '',
        stdLife:     r[20] || '',
        actualLife:  r[21] || '',
        lifeNote:    r[22] || '',
        parts:       r[23] || '',
        tracking:    r[24] || '',
        byName:      r[25] || '',
        acceptedBy:  r[26] || '',
        closedBy:    r[27] || '',
        imgBefore:    r[28] || '',
        imgAfter:     r[29] || '',
        whyImages:    r[30] || '',
        eventType:    r[31] || '',
        cancelReason: r[32] || '',
      });
    }
  });

  // เรียงล่าสุดก่อน
  rows.sort((a, b) => b.rowIndex - a.rowIndex || b.sheetName.localeCompare(a.sheetName));
  return jsonOut({ success: true, data: rows });
}

// ดึงประวัติ log ของเลข Tracking หนึ่งๆ (สำหรับหน้าดู Log)
function doGetLog(tracking) {
  const ss  = SpreadsheetApp.openById(SPREADSHEET_ID);
  const log = ss.getSheetByName('_Log');
  if (!log) return jsonOut({ success: true, data: [] });
  const data = log.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (tracking && String(r[1]) !== tracking) continue;
    rows.push({ time: String(r[0]), tracking: r[1], action: r[2], byName: r[3], status: r[4] });
  }
  rows.reverse(); // ล่าสุดก่อน
  return jsonOut({ success: true, data: rows });
}

// master รายการเครื่องจักร — อ่านจากแท็บ "_Machines"
// คอลัมน์: A=รหัสเครื่องจักร  B=ชื่อเครื่องจักร  C=โรงงาน  D=พื้นที่  E=ไลน์ (E ไม่บังคับ)
function doGetMachines() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('_Machines');
  if (!sh) return jsonOut({ success: true, data: [] });
  const data = sh.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    rows.push({ id: String(r[0]).trim(), name: r[1] || '', factory: r[2] || '', area: r[3] || '', line: r[4] || '', editedBy: r[5] || '', editedAt: r[6] || '', rank: r[7] || '', rankYear: r[8] || '' });
  }
  return jsonOut({ success: true, data: rows });
}

function doGetChecklists(factory, area, type, month, year) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('_Checklists');
  if (!sh || sh.getLastRow() < 2) return jsonOut({ success: true, data: [] });
  const data = sh.getDataRange().getValues();
  const rows = [];
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
  rows.reverse();
  return jsonOut({ success: true, data: rows });
}

function doGetPmPlans(factory, area) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('_PmPlans');
  if (!sh || sh.getLastRow() < 2) return jsonOut({ success: true, data: [] });
  const lastCol = Math.max(sh.getLastColumn(), 14);
  const data = sh.getRange(1, 1, sh.getLastRow(), lastCol).getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    if (factory && r[2] !== factory) continue;
    if (area    && r[3] !== area)    continue;
    let dailyItems = [], pmItems = [];
    try { dailyItems = JSON.parse(r[7]||'[]'); } catch(e) {}
    try { pmItems    = JSON.parse(r[8]||'[]'); } catch(e) {}
    rows.push({
      machineId: r[0], machineName: r[1], factory: r[2], area: r[3],
      dailyEnabled: r[4] !== 0 && r[4] !== '0' && r[4] !== false,
      pmFreqMonths: Number(r[5]) || 3,
      pmStartMonth: (r[6] instanceof Date)
        ? Utilities.formatDate(r[6], 'Asia/Bangkok', 'yyyy-MM')
        : String(r[6] || '').slice(0, 7),
      dailyItems, pmItems,
      dailyEditedBy: r[9]||'', dailyEditedAt: r[10]||'',
      pmEditedBy: r[11]||'', pmEditedAt: r[12]||'',
      dailyMergeDefault: (r[13] === 1 || r[13] === '1' || r[13] === true),
    });
  }
  return jsonOut({ success: true, data: rows });
}

function doGetDailyDefault() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('_DailyDefault');
  if (!sh || sh.getLastRow() < 2) return jsonOut({ success: true, data: { items: [], editedBy: '', editedAt: '' } });
  const r = sh.getRange(2, 1, 1, 3).getValues()[0];
  let items = [];
  try { items = JSON.parse(r[0]||'[]'); } catch(e) {}
  return jsonOut({ success: true, data: { items, editedBy: r[1]||'', editedAt: r[2]||'' } });
}

function doGetPmDates(monthKey) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sh = ss.getSheetByName('_PmDates');
  if (!sh || sh.getLastRow() < 2) return jsonOut({ success: true, data: {} });
  const data = sh.getDataRange().getValues();
  const out = {};
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    if (monthKey && !String(r[0]).endsWith('_' + monthKey)) continue;
    out[r[0]] = r[1];
  }
  return jsonOut({ success: true, data: out });
}

// ============================================================
// MACHINE CRITICALITY RANKING (v2.14)
// ============================================================

var MC_SECTIONS = {
  'คุณภาพ':       { ids:[1,2,3],           byCol:20, atCol:21 },
  'ผลผลิต':       { ids:[4,5,6,7],         byCol:22, atCol:23 },
  'การซ่อมบำรุง': { ids:[8,9,10,11,12],    byCol:24, atCol:25 },
  'ความปลอดภัย':  { ids:[13,14],           byCol:26, atCol:27 },
  'อื่นๆ':        { ids:[15],              byCol:28, atCol:29 },
};
var SECTION_LEVEL   = { 'คุณภาพ':'QA','ผลผลิต':'Production','การซ่อมบำรุง':'Engineer','ความปลอดภัย':'Safety','อื่นๆ':'*' };   // v2.21: เซ็นตาม Level (เลิกใช้แผนก)
var MC_RANK_FACTOR  = 1.11;   // FIX — max raw 90 เสมอ (12×5 + 3×10 = 90)

function ensureMachineRanking_(ss) {
  var sh = ss.getSheetByName('_MachineRanking');
  if (!sh) {
    sh = ss.insertSheet('_MachineRanking');
    var hdr = ['machineCode','machineName','factory','area','year',
               's1','s2','s3','s4','s5','s6','s7','s8','s9','s10','s11','s12','s13','s14','s15',
               'qaBy','qaAt','prodBy','prodAt','engBy','engAt','safetyBy','safetyAt','otherBy','otherAt',
               'rawSum','finalScore','rank','status','updatedAt'];
    sh.getRange(1,1,1,hdr.length).setValues([hdr]).setBackground('#8e44ad').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}

function ensureRankingDescriptions_(ss) {
  var sh = ss.getSheetByName('_RankingDescriptions');
  if (!sh) {
    sh = ss.insertSheet('_RankingDescriptions');
    sh.getRange(1,1,1,5).setValues([['area','year','criterionId','score','label']]).setBackground('#27ae60').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
    return sh;
  }
  // v2.20 migrate: schema เก่า 4 คอลัมน์ (area,criterionId,score,label) → 5 (แทรก year)
  if (String(sh.getRange(1,2).getValue()).trim() === 'criterionId') {
    sh.insertColumnAfter(1);
    sh.getRange(1,2).setValue('year');
    var n = sh.getLastRow();
    if (n > 1) {
      var defYear = String(new Date().getFullYear());
      var arr = []; for (var i = 0; i < n-1; i++) arr.push([defYear]);
      sh.getRange(2,2,n-1,1).setValues(arr);   // backfill ปีปัจจุบัน
    }
  }
  return sh;
}

function ensureRankingFormApproval_(ss) {
  var sh = ss.getSheetByName('_RankingFormApproval');
  if (!sh) {
    sh = ss.insertSheet('_RankingFormApproval');
    var hdr = ['area','year','qaBy','qaAt','prodBy','prodAt','engBy','engAt',
               'safetyBy','safetyAt','otherBy','otherAt','status','updatedAt'];
    sh.getRange(1,1,1,hdr.length).setValues([hdr]).setBackground('#8e44ad').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
var MC_APPROVAL_COLS = {
  'คุณภาพ':       { byCol:2,  atCol:3  },
  'ผลผลิต':       { byCol:4,  atCol:5  },
  'การซ่อมบำรุง': { byCol:6,  atCol:7  },
  'ความปลอดภัย':  { byCol:8,  atCol:9  },
  'อื่นๆ':        { byCol:10, atCol:11 },
};

function doGetFormApprovals_(params) {
  var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  var year = params.year || String(new Date().getFullYear());
  var sh   = ensureRankingFormApproval_(ss);
  var out  = {};
  if (sh.getLastRow() > 1) {
    sh.getDataRange().getValues().slice(1).forEach(function(r) {
      if (String(r[1]) !== String(year)) return;
      var sections = {};
      Object.keys(MC_APPROVAL_COLS).forEach(function(sec) {
        var c = MC_APPROVAL_COLS[sec];
        sections[sec] = { by: String(r[c.byCol]||''), at: String(r[c.atCol]||'') };
      });
      out[String(r[0]).trim()] = { area:r[0], year:r[1], sections:sections, status:r[12], updatedAt:r[13] };
    });
  }
  return jsonOut({ success:true, year:year, data:out });
}

function handleSetFormApproval_(ss, data) {
  var uRow = getUserRow(ss, data.username);
  if (!uRow || !verifyPin(uRow, data.pin)) return jsonOut({ success:false, error:'ยืนยันตัวตนไม่สำเร็จ' });
  if (!canReviewSection_(uRow, data.section)) return jsonOut({ success:false, error:'ไม่มีสิทธิ์อนุมัติหัวข้อ "' + data.section + '"' });
  var col = MC_APPROVAL_COLS[data.section];
  if (!col) return jsonOut({ success:false, error:'หัวข้อไม่ถูกต้อง' });
  var area = String(data.area||'').trim();
  var year = String(data.year || new Date().getFullYear());
  if (!area) return jsonOut({ success:false, error:'ไม่ระบุพื้นที่' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch(e) {}

  var sh   = ensureRankingFormApproval_(ss);
  var rows = sh.getLastRow() > 1 ? sh.getDataRange().getValues() : [[]];
  var rowIdx = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === area && String(rows[i][1]) === year) { rowIdx = i; break; }
  }
  var now = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
  if (rowIdx < 0) {
    sh.appendRow([area, year, '','','','','','','','','','', 'partial', now]);
    rowIdx = sh.getLastRow() - 1;
  }
  var reviewerName = String(uRow[1]||data.username).trim();
  sh.getRange(rowIdx+1, col.byCol+1).setValue(reviewerName);
  sh.getRange(rowIdx+1, col.atCol+1).setValue(now);

  var fresh = sh.getRange(rowIdx+1, 1, 1, 14).getValues()[0];
  var signed = 0;
  Object.keys(MC_APPROVAL_COLS).forEach(function(s){ if (String(fresh[MC_APPROVAL_COLS[s].byCol]||'').trim()) signed++; });
  var newStatus = signed >= 5 ? 'approved' : 'partial';
  sh.getRange(rowIdx+1, 13).setValue(newStatus);
  sh.getRange(rowIdx+1, 14).setValue(now);

  try { lock.releaseLock(); } catch(e) {}
  writeAccessLog(ss, data.username, 'setFormApproval', area + '/' + year + ' หัวข้อ:' + data.section + ' → ' + newStatus);
  return jsonOut({ success:true, status:newStatus });
}

function getUserRowById_(ss, username) {
  var row = getUserRow(ss, username);
  return row;
}

function canReviewSection_(userRow, section) {
  var level = String(userRow[5]||'').trim();
  if (level === 'Administrator') return true;          // admin เซ็นได้ทุกหมวด
  var req = SECTION_LEVEL[section];
  if (!req) return false;
  if (req === '*') return level !== 'Visitor';          // 'อื่นๆ' = ใครก็ได้ที่ login (ไม่ใช่ Visitor)
  return level === req;                                 // QA→คุณภาพ, Production→ผลผลิต, Engineer→ซ่อมบำรุง, Safety→ปลอดภัย
}

function calcRankGas_(scores) {
  var raw = 0;
  for (var id = 1; id <= 15; id++) raw += Number(scores[id]||0);
  var f = Math.round(raw * MC_RANK_FACTOR * 100) / 100;
  var r = f >= 81 ? 'A' : f >= 61 ? 'B' : f >= 41 ? 'C' : 'D';
  return { rawSum: raw, finalScore: f, rank: r };
}

function writeMachineRank_(ss, machineCode, rank, year) {
  var sh = ss.getSheetByName('_Machines');
  if (!sh) return;
  var vals = sh.getDataRange().getValues();
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][0]).trim().toLowerCase() === String(machineCode).trim().toLowerCase()) {
      sh.getRange(i+1, 8).setValue(rank);
      sh.getRange(i+1, 9).setValue(year);
      return;
    }
  }
}

// GET: getMachineRankings
function doGetMachineRankings_(params) {
  var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  var year = params.year || String(new Date().getFullYear());
  var facF = params.factory || '';
  var areaF = params.area || '';
  var sh   = ensureMachineRanking_(ss);
  if (sh.getLastRow() < 2) return jsonOut({ success:true, data:[] });
  var rows = sh.getDataRange().getValues().slice(1);
  var out  = rows.filter(function(r) {
    return String(r[4]) === String(year) &&
           (!facF  || String(r[2]).trim() === facF) &&
           (!areaF || String(r[3]).trim() === areaF);
  }).map(function(r) {
    var scores = {};
    for (var i = 0; i < 15; i++) scores[i+1] = r[5+i] === '' || r[5+i] == null ? null : Number(r[5+i]);
    var sections = {};
    Object.keys(MC_SECTIONS).forEach(function(sec) {
      var s = MC_SECTIONS[sec];
      sections[sec] = { by: String(r[s.byCol]||''), at: String(r[s.atCol]||'') };
    });
    return {
      machineCode: r[0], machineName: r[1], factory: r[2], area: r[3], year: r[4],
      scores: scores, sections: sections,
      rawSum: r[30], finalScore: r[31], rank: r[32], status: r[33], updatedAt: r[34]
    };
  });
  return jsonOut({ success:true, data:out });
}

// GET: getRankingOverview
function doGetRankingOverview_(params) {
  var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  var year = params.year || String(new Date().getFullYear());
  var sh   = ensureMachineRanking_(ss);
  var rows = sh.getLastRow() > 1 ? sh.getDataRange().getValues().slice(1) : [];
  var filtered = rows.filter(function(r){ return String(r[4]) === String(year); });
  var secDone = { 'คุณภาพ':0,'ผลผลิต':0,'การซ่อมบำรุง':0,'ความปลอดภัย':0,'อื่นๆ':0 };
  var rankDist = { A:0,B:0,C:0,D:0 };
  var statusCnt = { 'not-started':0,'partial':0,'complete':0 };
  filtered.forEach(function(r) {
    Object.keys(MC_SECTIONS).forEach(function(sec) {
      var s = MC_SECTIONS[sec];
      if (String(r[s.byCol]||'').trim()) secDone[sec]++;
    });
    var st = String(r[33]||'not-started');
    if (statusCnt[st] != null) statusCnt[st]++;
    if (r[32] && rankDist[r[32]] != null) rankDist[r[32]]++;
  });
  return jsonOut({ success:true, year:year, total: filtered.length, sections: secDone, statusCounts: statusCnt, rankDist: rankDist });
}

// GET: getAreaDescriptions
function doGetAreaDescriptions_(params) {
  var ss   = SpreadsheetApp.openById(SPREADSHEET_ID);
  var area = params.area || '';
  var year = String(params.year || new Date().getFullYear());
  var sh   = ensureRankingDescriptions_(ss);
  if (sh.getLastRow() < 2) return jsonOut({ success:true, data:{} });
  var rows = sh.getDataRange().getValues().slice(1);
  var out  = {};
  rows.forEach(function(r) {
    if (String(r[0]).trim() !== area) return;
    if (String(r[1]).trim() !== year) return;   // NEW: filter ปี
    var cid = String(r[2]).trim(), sc = String(r[3]).trim();
    if (!out[cid]) out[cid] = {};
    out[cid][sc] = String(r[4]);
  });
  return jsonOut({ success:true, data:out });
}

// POST handler: setRankingSection
function handleSetRankingSection_(ss, data) {
  var uRow = getUserRow(ss, data.username);
  if (!uRow || !verifyPin(uRow, data.pin)) return jsonOut({ success:false, error:'ยืนยันตัวตนไม่สำเร็จ' });
  if (!canReviewSection_(uRow, data.section)) return jsonOut({ success:false, error:'ไม่มีสิทธิ์รีวิวหัวข้อ "' + data.section + '"' });
  var sec = MC_SECTIONS[data.section];
  if (!sec) return jsonOut({ success:false, error:'หัวข้อไม่ถูกต้อง' });
  var code = String(data.machineCode||'').trim();
  var year = String(data.year || new Date().getFullYear());
  if (!code) return jsonOut({ success:false, error:'ไม่ระบุรหัสเครื่อง' });

  var lock = LockService.getScriptLock();
  try { lock.waitLock(15000); } catch(e) {}

  var sh   = ensureMachineRanking_(ss);
  var rows = sh.getLastRow() > 1 ? sh.getDataRange().getValues() : [[]];
  var rowIdx = -1;
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim().toLowerCase() === code.toLowerCase() && String(rows[i][4]) === year) {
      rowIdx = i; break;
    }
  }

  var now = Utilities.formatDate(new Date(),'Asia/Bangkok','dd/MM/yyyy HH:mm:ss');
  var rowData;
  if (rowIdx < 0) {
    // สร้างแถวใหม่
    rowData = [code, data.machineName||'', data.factory||'', data.area||'', year,
               '','','','','','','','','','','','','','','',
               '','','','','','','','','','','',
               '','','','not-started',''];
    sh.appendRow(rowData);
    rowIdx = sh.getLastRow() - 1;
    rows = sh.getDataRange().getValues();
  }

  // เขียนคะแนนของ section นี้
  var scores = data.scores || {};
  sec.ids.forEach(function(id) {
    var colIdx = 5 + (id - 1);   // s1=col5(idx5) ... s15=col19(idx19)
    var val = scores[id] != null ? Number(scores[id]) : '';
    sh.getRange(rowIdx+1, colIdx+1).setValue(val);   // GAS 1-indexed
  });

  // เขียน reviewer name + time
  var reviewerName = String(uRow[1]||data.username).trim();
  sh.getRange(rowIdx+1, sec.byCol+1).setValue(reviewerName);
  sh.getRange(rowIdx+1, sec.atCol+1).setValue(now);

  // คำนวณ status ใหม่ (นับแผนกที่เซ็นแล้ว)
  var freshRow = sh.getRange(rowIdx+1, 1, 1, 35).getValues()[0];
  var signed = 0;
  Object.keys(MC_SECTIONS).forEach(function(s) { if (String(freshRow[MC_SECTIONS[s].byCol]||'').trim()) signed++; });
  var newStatus = signed === 0 ? 'not-started' : signed < 5 ? 'partial' : 'complete';
  sh.getRange(rowIdx+1, 34).setValue(newStatus);
  sh.getRange(rowIdx+1, 35).setValue(now);

  var rankResult = null;
  if (newStatus === 'complete') {
    var scMap = {};
    for (var k = 0; k < 15; k++) scMap[k+1] = Number(freshRow[5+k]||0);
    rankResult = calcRankGas_(scMap);
    sh.getRange(rowIdx+1, 31).setValue(rankResult.rawSum);
    sh.getRange(rowIdx+1, 32).setValue(rankResult.finalScore);
    sh.getRange(rowIdx+1, 33).setValue(rankResult.rank);
    // เขียนกลับ Machine List
    writeMachineRank_(ss, code, rankResult.rank, year);
  }

  try { lock.releaseLock(); } catch(e) {}
  writeAccessLog(ss, data.username, 'setRankingSection', code + '/' + year + ' หัวข้อ:' + data.section + (rankResult ? ' → rank:' + rankResult.rank : ''));
  return jsonOut({ success:true, status:newStatus, rank: rankResult ? rankResult.rank : null });
}

// POST handler: setAreaDescriptions
function handleSetAreaDescriptions_(ss, data) {
  var uRow = getUserRow(ss, data.username);
  if (!uRow || !verifyPin(uRow, data.pin)) return jsonOut({ success:false, error:'ยืนยันตัวตนไม่สำเร็จ' });
  var area  = String(data.area||'').trim();
  var year  = String(data.year || new Date().getFullYear());
  var items = Array.isArray(data.items) ? data.items : [];
  if (!area) return jsonOut({ success:false, error:'ไม่ระบุพื้นที่' });

  // สิทธิ์: admin (ua.perm) หรือ Level ทีมของ "ทุกหัวข้อที่ส่งมา" (canReviewSection_ = level-based v2.21)
  var isAdmin = userCan(ss, data.username, data.pin, 'ua.perm');
  if (!isAdmin) {
    var critSec = {};
    Object.keys(MC_SECTIONS).forEach(function(s){ MC_SECTIONS[s].ids.forEach(function(id){ critSec[id] = s; }); });
    var ok = items.length > 0 && items.every(function(it){
      var sec = critSec[Number(it.criterionId)];
      return sec && canReviewSection_(uRow, sec);
    });
    if (!ok) return jsonOut({ success:false, error:'ไม่มีสิทธิ์แก้คำอธิบายหัวข้อนี้' });
  }

  var sh = ensureRankingDescriptions_(ss);
  // upsert เฉพาะ (criterionId,score) ที่ส่งมา ของ (area,year) นี้ — ไม่แตะหัวข้ออื่น
  var submitted = {};
  items.forEach(function(it){ submitted[String(it.criterionId)+'|'+String(it.score)] = true; });
  var rows = sh.getLastRow() > 1 ? sh.getDataRange().getValues() : [];
  for (var i = rows.length - 1; i >= 1; i--) {
    if (String(rows[i][0]).trim() !== area) continue;
    if (String(rows[i][1]).trim() !== year) continue;
    var key = String(rows[i][2]).trim()+'|'+String(rows[i][3]).trim();
    if (submitted[key]) sh.deleteRow(i+1);
  }
  items.forEach(function(it){
    sh.appendRow([area, year, String(it.criterionId||''), String(it.score||''), String(it.label||'')]);
  });
  writeAccessLog(ss, data.username, 'setAreaDescriptions', area + '/' + year + ' — ' + items.length + ' items');
  return jsonOut({ success:true });
}

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
