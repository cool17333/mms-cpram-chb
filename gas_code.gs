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

// รหัสผ่านตามบทบาท (เก็บฝั่ง server — ไม่โผล่ในหน้าเว็บ)
const ROLE_PW = {
  'engineer123456': 'engineer',
  'cpram123456':    'admin',
};

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
      if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
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
      if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
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
      if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
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

    // ---- ACCEPT job (Engineer / Admin รับงาน) ----
    if (data.action === 'accept') {
      const role = ROLE_PW[(data.pw || '').trim()];
      if (role !== 'engineer' && role !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Engineer หรือ Admin เท่านั้น' });
      const sheet = ss.getSheetByName(data.sheetName);
      if (!sheet || !data.rowIndex) throw new Error('Sheet or rowIndex not found');
      sheet.getRange(data.rowIndex, 7).setValue('รับงานแล้ว');
      sheet.getRange(data.rowIndex, 27).setValue(data.acceptedBy || '');
      writeLog(ss, data.tracking, 'รับงาน — ' + (data.acceptedBy || ''), data.acceptedBy, 'รับงานแล้ว');
      return jsonOut({ success: true, action: 'accepted' });
    }

    // ---- CANCEL record (เปลี่ยนสถานะเป็น "ยกเลิกงาน" — Admin เท่านั้น) ----
    if (data.action === 'cancel') {
      if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
      const sheet = ss.getSheetByName(data.sheetName);
      if (!sheet || !data.rowIndex) throw new Error('Sheet or rowIndex not found');
      sheet.getRange(data.rowIndex, 7).setValue('ยกเลิกงาน');           // col 7 = สถานะ
      sheet.getRange(data.rowIndex, 33).setValue(data.cancelReason || ''); // col 33 = เหตุผลยกเลิก
      writeLog(ss, data.tracking, 'ยกเลิกงาน — ' + (data.cancelReason || ''), data.byName, 'ยกเลิกงาน');
      return jsonOut({ success: true, action: 'cancelled' });
    }

    // ---- SAVE Checklist record ----
    if (data.action === 'saveChecklist') {
      const role = ROLE_PW[(data.pw || '').trim()];
      if (!role) return jsonOut({ success: false, error: 'ต้องเข้าสู่ระบบก่อน' });
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
      try { lock2.releaseLock(); } catch(e) {}
      writeLog(ss, tracking, 'บันทึก Checklist ' + (data.type||''), data.inspector, data.overallResult);
      return jsonOut({ success: true, tracking });
    }

    // ---- COPY machine items (engineer+admin) ----
    if (data.action === 'copyMachineItems') {
      const role = ROLE_PW[(data.pw || '').trim()];
      if (role !== 'engineer' && role !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Engineer หรือ Admin' });
      const sourceId  = String(data.sourceId || '').trim();
      const targetIds = (data.targetIds || []).map(id => String(id).trim()).filter(Boolean);
      const type      = data.type || 'daily';
      if (!sourceId || !targetIds.length) return jsonOut({ success: false, error: 'sourceId/targetIds required' });
      const COPY_HDR = ['machineId','machineName','factory','area','dailyEnabled','pmFreqMonths','pmStartMonth','dailyItemsJSON','pmItemsJSON','dailyEditedBy','dailyEditedAt','pmEditedBy','pmEditedAt'];
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
      const role = ROLE_PW[(data.pw || '').trim()];
      if (role !== 'engineer' && role !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Engineer หรือ Admin' });
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
      writeLog(ss, '-', 'บันทึกแผน PM (' + plans.length + ' เครื่อง)', data.editedBy||'', '');
      return jsonOut({ success: true, count: allRows.length });
    }

    // ---- SAVE Daily Default items (engineer+admin) ----
    if (data.action === 'saveDailyDefault') {
      const role = ROLE_PW[(data.pw || '').trim()];
      if (role !== 'engineer' && role !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Engineer หรือ Admin' });
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
      const role = ROLE_PW[(data.pw || '').trim()];
      if (role !== 'engineer' && role !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Engineer หรือ Admin' });
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
      } else {
        if (!rowData[5]) rowData[5] = 3;
        if (!rowData[7]) rowData[7] = '[]';
        if (!rowData[8]) rowData[8] = '[]';
        sh.appendRow(rowData);
      }
      SpreadsheetApp.flush();
      writeLog(ss, '-', 'แก้ไข ' + (type === 'daily' ? 'Daily' : 'PM') + ' items — ' + machineId, data.editedBy||'', '');
      return jsonOut({ success: true });
    }

    // ---- SAVE PM Specific Dates ----
    if (data.action === 'savePmDates') {
      const role = ROLE_PW[(data.pw || '').trim()];
      if (!role) return jsonOut({ success: false, error: 'ต้องเข้าสู่ระบบก่อน' });
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
      if (ROLE_PW[(data.pw || '').trim()] !== 'admin')
        return jsonOut({ success: false, error: 'ต้องเป็น Admin เท่านั้น' });
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

    // เลขรันต่อเนื่อง แยกตามโรงงาน+เดือน → BD-CHB{n}-{YYYYMM}-{NNN}
    // seq = จำนวนแถวที่มีอยู่ (header=1 → รายการแรก = 1)
    const seq = sheet.getLastRow();
    const ym  = Utilities.formatDate(now, 'Asia/Bangkok', 'yyyyMM');
    data.tracking = 'BD-' + factoryToCHB(data.factory) + '-' + ym + '-' + String(seq).padStart(3, '0');

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
    const factory = (e.parameter.factory || '').replace(/\s+/g, '');
    const area    = e.parameter.area    || '';
    const status  = e.parameter.status  || '';
    const month   = e.parameter.month   || ''; // YYYY-MM
    const machineId = e.parameter.machineId || '';

    if (action === 'login') {
      const role = ROLE_PW[(e.parameter.pw || '').trim()] || '';
      return jsonOut(role ? { success: true, role } : { success: false, error: 'รหัสผ่านไม่ถูกต้อง' });
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
    rows.push({ id: String(r[0]).trim(), name: r[1] || '', factory: r[2] || '', area: r[3] || '', line: r[4] || '', editedBy: r[5] || '', editedAt: r[6] || '' });
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
    if (factory && r[4] !== factory) continue;
    if (area    && r[5] !== area)    continue;
    if (type    && r[1] !== type)    continue;
    if (month   && !String(r[2]).startsWith(month)) continue;
    if (year    && !String(r[2]).startsWith(year))  continue;
    let results = [];
    try { results = JSON.parse(r[15]||'[]'); } catch(e) {}
    rows.push({
      id: r[0], type: r[1], date: r[2], shift: r[3], factory: r[4], area: r[5],
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
      pmStartMonth: r[6] || '',
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

function jsonOut(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
