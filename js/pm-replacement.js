// ============================================================
// PM REPLACEMENT — เปลี่ยนอะไหล่ตามรอบปฏิทิน (PM ประเภทที่ 2)
// ตาราง (เหมือน PM Inspection) → popup แก้ไขหลายรายการ (เพิ่ม/ลบ 1,2,3,4)
// ============================================================
let _pmrByMachine = {};       // machineId → [plans active]

let _pmrBatchMachineId = '';
let _pmrBatchRows = [];       // [{ planId, partId, partName, partNo, cycleMonths, legacyCycleLabel,
                               //    startDate, note, existingLocationImageId, newImgDataUrl, nextDue, status }]
let _pmrRemovedIds = [];

let _pmrDoneImgDataUrl = null;
let _pmrDoneItem = null;      // { planId, partLabel } ที่กด "บันทึกเปลี่ยนแล้ว"

const PMR_STATUS_LABEL = { overdue:'เกินกำหนด', soon:'ใกล้ครบกำหนด', ok:'ปกติ' };
const PMR_STATUS_COLOR = { overdue:'#c0392b', soon:'#e67e22', ok:'#27ae60' };
const PMR_UNIT_LABEL   = { month:'เดือน', day:'วัน', year:'ปี' };
const PMR_EDITLOG_BADGE = {
    create: '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">เพิ่ม</span>',
    update: '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">แก้ไข</span>',
    delete: '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">ลบ</span>',
    copy:   '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">คัดลอก</span>',
};

async function initPmReplace() {
    if (!machineMaster.length) await loadMachineMaster();
    if (typeof SPARE_CACHE === 'undefined' || !SPARE_CACHE.length) { if (typeof loadSpareCache === 'function') await loadSpareCache(); }
    await pmrLoadAll();
    pmrFillPartHint();
    if (_clScCurrentTab === 'pmrep') renderClSchedule();   // ตารางถูก render ว่างไปก่อนหน้านี้แล้ว — รีเฟรชด้วยข้อมูลจริง
}

// ---- โหลดทุกแผน active ทุกเครื่อง แล้วจัดกลุ่มตาม machineId ----
async function pmrLoadAll() {
    try {
        const j = await clFetch({ action:'pmReplaceList' });   // ไม่ส่ง machineId = คืนทุกแผน active
        const list = j.success ? (j.data || []) : [];
        _pmrByMachine = {};
        list.forEach(p => { (_pmrByMachine[p.machineId] || (_pmrByMachine[p.machineId] = [])).push(p); });
    } catch (e) { _pmrByMachine = {}; }
}

function pmrFillPartHint() {
    const dl = document.getElementById('pmr-part-hint'); if (!dl) return;
    dl.innerHTML = (typeof SPARE_CACHE !== 'undefined' ? SPARE_CACHE : []).map(p => {
        const pn = p.partNo ? '[' + p.partNo + '] ' : '';
        return `<option value="${pn}${String(p.name||'').replace(/"/g,'&quot;')}">`;
    }).join('');
}

// ---- ตารางเครื่องจักร (เหมือน PM Inspection) ----
function pmrRenderTable(machines) {
    const tbody = document.getElementById('clsc-pmrep-body');
    if (!tbody) return;
    const total = machines.length;
    const ps    = _clPmrepPageSize;
    _clPmrepTotalPages = ps ? Math.max(1, Math.ceil(total/ps)) : 1;
    if (_clPmrepPage >= _clPmrepTotalPages) _clPmrepPage = _clPmrepTotalPages-1;
    const start    = ps ? _clPmrepPage * ps : 0;
    const pageRows = ps ? machines.slice(start, start+ps) : machines;
    clScRenderPagBar('pmrep', _clPmrepPage, _clPmrepTotalPages, total, start, ps);
    if (!total) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8">ไม่พบเครื่องจักร</td></tr>'; return; }
    const canEdit = can('cl.pm');
    tbody.innerHTML = pageRows.map(m => {
        const id    = m.id || m.machineId || m.machine_id || '';
        const plans = _pmrByMachine[id] || [];
        const overdue = plans.filter(p => p.status === 'overdue').length;
        const soon    = plans.filter(p => p.status === 'soon').length;
        let statusHtml;
        if (!plans.length) statusHtml = '<span class="text-gray-400 text-xs">—</span>';
        else if (overdue)  statusHtml = `<span class="text-xs font-bold text-white px-2 py-0.5 rounded-full" style="background:${PMR_STATUS_COLOR.overdue}">🔴 ${overdue} เกิน</span>`;
        else if (soon)     statusHtml = `<span class="text-xs font-bold text-white px-2 py-0.5 rounded-full" style="background:${PMR_STATUS_COLOR.soon}">🟠 ${soon} ใกล้</span>`;
        else               statusHtml = `<span class="text-xs font-bold text-white px-2 py-0.5 rounded-full" style="background:${PMR_STATUS_COLOR.ok}">✓ ปกติ</span>`;
        return `<tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-2.5 text-xs text-gray-500 font-mono">${id}</td>
            <td class="px-4 py-2.5 text-sm">${m.name||m.machineName||id}</td>
            <td class="px-3 py-2.5 text-center text-sm text-gray-700">${plans.length} รายการ</td>
            <td class="px-3 py-2.5 text-center">${statusHtml}</td>
            <td class="px-3 py-2.5 text-center">
                <div class="flex gap-2 justify-center">
                    ${canEdit ? `<button onclick="pmrOpenBatch('${id}')" class="px-2.5 py-1 text-xs font-bold bg-teal-50 text-teal-600 hover:bg-teal-100 rounded-lg transition-colors">✏️ แก้ไข</button>` : ''}
                    ${canEdit ? `<button onclick="openClCopyModal('pmrep','${id}')" class="px-2.5 py-1 text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors">📋 คัดลอก</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}

// ---- popup แก้ไขหลายรายการ ----
function pmrOpenBatch(machineId) {
    if (!can('cl.pm')) { showToast('ไม่มีสิทธิ์', 'error'); return; }
    _pmrBatchMachineId = machineId;
    _pmrRemovedIds = [];
    const m = machineMaster.find(x => (x.id||x.machineId||'') === machineId) || {};
    document.getElementById('pmr-batch-subtitle').textContent = `${m.name||m.machineName||machineId} (${machineId})`;
    const plans = _pmrByMachine[machineId] || [];
    _pmrBatchRows = plans.length ? plans.map(p => ({
        planId: p.planId,
        partId: p.partId,
        partName: p.partNo ? String(p.partLabel||'').replace(p.partNo + ' - ', '') : (p.partLabel || ''),
        partNo: p.partNo || '',
        cycleMonths: p.cycleUnit === 'month' ? p.cycleValue : '',
        legacyCycleLabel: p.cycleUnit !== 'month' ? `เดิม: ${p.cycleValue} ${PMR_UNIT_LABEL[p.cycleUnit]||p.cycleUnit}` : '',
        startDate: String(p.startDate||'').slice(0,7),
        note: p.note || '',
        existingLocationImageId: p.locationImageId || '',
        newImgDataUrl: null,
        nextDue: p.nextDue, status: p.status,
    })) : [_pmrBlankRow()];
    pmrFillPartHint();
    pmrRenderBatchRows();
    document.getElementById('pmr-batch-modal').classList.remove('hidden');
}
function _pmrBlankRow() {
    return { planId:null, partId:'', partName:'', partNo:'', cycleMonths:'', legacyCycleLabel:'', startDate:'', note:'', existingLocationImageId:'', newImgDataUrl:null, nextDue:'', status:'' };
}
function pmrCloseBatch() {
    document.getElementById('pmr-batch-modal').classList.add('hidden');
    _pmrBatchMachineId = ''; _pmrBatchRows = []; _pmrRemovedIds = [];
}

function pmrRenderBatchRows() {
    const wrap = document.getElementById('pmr-batch-rows');
    if (!wrap) return;
    wrap.innerHTML = _pmrBatchRows.map((row, i) => {
        const hasPlan = !!row.planId;
        const imgSrc = row.newImgDataUrl || '';
        const legacyImgId = !row.newImgDataUrl && row.existingLocationImageId ? row.existingLocationImageId : '';
        const statusLine = hasPlan
            ? `<p class="text-xs text-gray-400 mt-0.5">ครบกำหนดถัดไป ${row.nextDue||'—'} <span style="color:${PMR_STATUS_COLOR[row.status]||'#666'}">● ${PMR_STATUS_LABEL[row.status]||''}</span></p>`
            : '';
        return `<div class="border border-gray-200 rounded-xl p-3" data-row-idx="${i}">
            <div class="flex items-center justify-between mb-2">
                <div><span class="text-xs font-bold text-teal-700">#${i+1}</span>${statusLine}</div>
                <div class="flex items-center gap-2 flex-shrink-0">
                    ${hasPlan ? `<button onclick="pmrOpenDoneRow(${i})" class="text-xs font-bold text-blue-600 hover:text-blue-800 whitespace-nowrap">✅ เปลี่ยนแล้ว</button>` : ''}
                    ${hasPlan ? `<button onclick="pmrOpenHistory('${row.planId}', ${JSON.stringify((row.partNo?row.partNo+' - ':'')+row.partName).replace(/"/g,'&quot;')})" class="text-xs font-bold text-gray-500 hover:text-gray-700 whitespace-nowrap">📜 ประวัติ</button>` : ''}
                    <button onclick="pmrRemoveRow(${i})" class="text-red-400 hover:text-red-600 text-lg leading-none" title="ลบรายการ">🗑️</button>
                </div>
            </div>
            <div class="mb-2">
                <label class="text-xs text-gray-600 font-bold mb-1 block">อะไหล่ <span class="text-orange-500">*</span></label>
                <div class="flex gap-2">
                    <input id="pmr-row-part-${i}" list="pmr-part-hint" type="text" value="${(row.partNo?('['+row.partNo+'] '):'')+(row.partName||'')}" placeholder="พิมพ์ชื่อ/รหัสอะไหล่..." class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none" oninput="pmrRowPartPick(${i},this)">
                    <input id="pmr-row-partno-${i}" type="text" value="${row.partNo||''}" readonly class="w-28 border border-gray-100 bg-gray-50 rounded-lg px-2 py-2 text-xs text-gray-500 text-center" placeholder="รหัส">
                </div>
            </div>
            <div class="grid grid-cols-2 gap-2 mb-2">
                <div>
                    <label class="text-xs text-gray-600 font-bold mb-1 block">ความถี่ (เดือน) <span class="text-orange-500">*</span></label>
                    <input id="pmr-row-cycle-${i}" type="number" min="1" value="${row.cycleMonths||''}" placeholder="${row.legacyCycleLabel||'เช่น 6'}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
                </div>
                <div>
                    <label class="text-xs text-gray-600 font-bold mb-1 block">เดือนที่เริ่ม <span class="text-orange-500">*</span></label>
                    <input id="pmr-row-start-${i}" type="month" value="${row.startDate||''}" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
                </div>
            </div>
            <div class="mb-2">
                <label class="text-xs text-gray-600 font-bold mb-1 block">รูปภาพบริเวณที่เปลี่ยน <span class="text-orange-500">*</span></label>
                <div class="flex items-center gap-2">
                    <input id="pmr-row-img-input-${i}" type="file" accept="image/*" onchange="pmrRowImgPick(${i},this)" class="text-xs text-gray-600 flex-1">
                    <img id="pmr-row-img-preview-${i}" src="${imgSrc}" data-imgid="${legacyImgId}" class="w-12 h-12 object-cover rounded border border-gray-200 flex-shrink-0 ${imgSrc||legacyImgId?'':'hidden'}">
                </div>
            </div>
            <div>
                <label class="text-xs text-gray-600 font-bold mb-1 block">หมายเหตุ</label>
                <input id="pmr-row-note-${i}" type="text" value="${(row.note||'').replace(/"/g,'&quot;')}" placeholder="หมายเหตุเพิ่มเติม..." class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none">
            </div>
        </div>`;
    }).join('');
    wrap.querySelectorAll('img[data-imgid]').forEach(async img => {
        const id = img.dataset.imgid; if (!id) return;
        try {
            const j = await clFetch({ action:'getImage', id });
            if (j.success && j.dataUrl) { img.src = j.dataUrl; img.classList.remove('hidden'); }
        } catch (e) {}
    });
}

function pmrAddRow() { _pmrBatchRows.push(_pmrBlankRow()); pmrRenderBatchRows(); }
function pmrRemoveRow(i) {
    if (!confirm('ยืนยันลบรายการนี้?')) return;
    const row = _pmrBatchRows[i];
    if (row.planId) _pmrRemovedIds.push(row.planId);
    _pmrBatchRows.splice(i, 1);
    if (!_pmrBatchRows.length) _pmrBatchRows.push(_pmrBlankRow());
    pmrRenderBatchRows();
}

function pmrRowPartPick(i, inp) {
    const val = inp.value;
    const hit = (typeof SPARE_CACHE !== 'undefined' ? SPARE_CACHE : []).find(p => (p.partNo ? '[' + p.partNo + '] ' : '') + p.name === val);
    _pmrBatchRows[i].partId   = hit ? hit.partId : '';
    _pmrBatchRows[i].partName = hit ? hit.name   : val;
    _pmrBatchRows[i].partNo   = hit ? (hit.partNo||'') : '';
    const noEl = document.getElementById(`pmr-row-partno-${i}`);
    if (noEl) noEl.value = hit ? (hit.partNo||'') : '';
}

function pmrRowImgPick(i, input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        compressImage(e.target.result, d => {
            _pmrBatchRows[i].newImgDataUrl = d;
            const img = document.getElementById(`pmr-row-img-preview-${i}`);
            if (img) { img.src = d; img.classList.remove('hidden'); }
        });
    };
    reader.readAsDataURL(file);
}

// คืน index แถวแรกที่ข้อมูลไม่ครบ (-1 = ครบทุกแถว) + sync ค่าฟอร์มปัจจุบันกลับเข้า row model
function pmrValidateRows() {
    let firstBadIdx = -1;
    _pmrBatchRows.forEach((row, i) => {
        const cycleVal = parseInt(document.getElementById(`pmr-row-cycle-${i}`)?.value) || 0;
        const startVal = document.getElementById(`pmr-row-start-${i}`)?.value || '';
        row.cycleMonths = cycleVal;
        row.startDate   = startVal;
        row.note        = (document.getElementById(`pmr-row-note-${i}`)?.value || '').trim();
        const hasImg = !!(row.newImgDataUrl || row.existingLocationImageId);
        const ok = !!row.partId && cycleVal >= 1 && !!startVal && hasImg;
        const el = document.querySelector(`#pmr-batch-rows [data-row-idx="${i}"]`);
        if (el) { el.classList.toggle('border-red-400', !ok); el.classList.toggle('ring-2', !ok); el.classList.toggle('ring-red-200', !ok); }
        if (!ok && firstBadIdx < 0) firstBadIdx = i;
    });
    return firstBadIdx;
}

async function pmrSaveBatch() {
    const editorName = currentUser.name;
    if (!editorName) { showToast('กรุณาเข้าสู่ระบบก่อนดำเนินการ', 'warn'); openLogin(); return; }
    const badIdx = pmrValidateRows();
    if (badIdx >= 0) { showToast(`⚠️ กรุณากรอกข้อมูลให้ครบที่รายการ #${badIdx+1}`, 'error'); return; }
    const items = _pmrBatchRows.map(row => ({
        planId: row.planId || null,
        partId: row.partId, partName: row.partName, partNo: row.partNo,
        cycleMonths: row.cycleMonths, startDate: row.startDate, note: row.note,
        locationImageId: row.newImgDataUrl || null,
        existingLocationImageId: row.existingLocationImageId || '',
    }));
    try {
        const j = await clPost({ action:'pmReplaceBatchSave', machineId:_pmrBatchMachineId, byName:editorName, items, removedPlanIds:_pmrRemovedIds });
        if (j.success) {
            _pmrByMachine[_pmrBatchMachineId] = j.data || [];
            pmrCloseBatch();
            renderClSchedule();
            showSuccessModal('บันทึกแผนเปลี่ยนอะไหล่สำเร็จ', items.length + ' รายการ');
        } else showToast('เกิดข้อผิดพลาด: ' + (j.error||''), 'error');
    } catch (e) { showToast('เชื่อมต่อ GAS ไม่ได้', 'error'); }
}

// ---- modal บันทึกเปลี่ยนแล้ว (ต่อแถวใน batch modal) ----
function pmrOpenDoneRow(i) {
    const row = _pmrBatchRows[i];
    if (!row.planId) return;
    pmrOpenDone({ planId: row.planId, partLabel: (row.partNo?row.partNo+' - ':'')+row.partName });
}
function pmrOpenDone(p) {
    if (!can('cl.pm')) { showToast('ไม่มีสิทธิ์', 'error'); return; }
    _pmrDoneItem = p;
    _pmrDoneImgDataUrl = null;
    document.getElementById('pmr-done-partlabel').textContent = p.partLabel || '';
    document.getElementById('pmr-done-date').value = new Date().toISOString().slice(0,10);
    document.getElementById('pmr-done-img-input').value = '';
    document.getElementById('pmr-done-img-preview').classList.add('hidden');
    document.getElementById('pmr-done-note').value = '';
    document.getElementById('pmr-done-modal').classList.remove('hidden');
}
function pmrCloseDone() { document.getElementById('pmr-done-modal').classList.add('hidden'); _pmrDoneItem = null; }

function pmrDoneImgPreview(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        compressImage(e.target.result, d => {
            _pmrDoneImgDataUrl = d;
            document.getElementById('pmr-done-img-preview-img').src = d;
            document.getElementById('pmr-done-img-preview').classList.remove('hidden');
        });
    };
    reader.readAsDataURL(file);
}

async function pmrConfirmDone() {
    if (!_pmrDoneItem) return;
    if (!can('cl.pm')) { showToast('ไม่มีสิทธิ์', 'error'); return; }
    const byName = currentUser.name;
    if (!byName) { showToast('⚠️ กรุณาเข้าสู่ระบบก่อนดำเนินการ', 'error'); return; }
    const doneDate = document.getElementById('pmr-done-date').value;
    if (!doneDate) { showToast('⚠️ กรุณาระบุวันที่เปลี่ยน', 'error'); return; }
    const note = document.getElementById('pmr-done-note').value.trim();
    const label = _pmrDoneItem.partLabel;
    try {
        const j = await clPost({ action:'pmReplaceDone', planId:_pmrDoneItem.planId, doneDate, note, byName, photoId:_pmrDoneImgDataUrl||null });
        if (j.success) {
            pmrCloseDone();
            await pmrLoadAll();
            const fresh = (_pmrByMachine[_pmrBatchMachineId]||[]).find(p => p.planId === _pmrDoneItem.planId);
            const row = _pmrBatchRows.find(r => r.planId === (fresh?fresh.planId:null));
            if (row && fresh) { row.nextDue = fresh.nextDue; row.status = fresh.status; }
            pmrRenderBatchRows();
            renderClSchedule();
            showSuccessModal('บันทึกเปลี่ยนอะไหล่สำเร็จ', label + ' · ครบกำหนดถัดไป ' + j.nextDue);
        } else showToast('เกิดข้อผิดพลาด: ' + (j.error||''), 'error');
    } catch (e) { showToast('เชื่อมต่อ GAS ไม่ได้', 'error'); }
}

// ---- modal ประวัติเปลี่ยนอะไหล่ (per plan — เดิม) ----
async function pmrOpenHistory(planId, label) {
    document.getElementById('pmr-history-title').textContent = '📜 ประวัติ — ' + label;
    document.getElementById('pmr-history-body').innerHTML = '<p class="text-gray-400 animate-pulse text-center py-6">กำลังโหลด...</p>';
    document.getElementById('pmr-history-modal').classList.remove('hidden');
    try {
        const j = await clFetch({ action:'pmReplaceLog', planId });
        const rows = j.data || [];
        document.getElementById('pmr-history-body').innerHTML = rows.length
            ? rows.map(l => `<div class="border border-gray-200 rounded-lg px-3 py-2">
                  <div class="flex justify-between items-center gap-2"><span class="font-bold text-gray-800">${l.doneDate || '—'}</span><span class="text-xs text-gray-400">โดย ${l.by || '—'}</span></div>
                  ${l.note ? `<div class="text-xs text-gray-500 mt-0.5">${l.note}</div>` : ''}
                  <div class="text-xs text-gray-400 mt-0.5">ครบกำหนดถัดไป: ${l.nextDueAfter || '—'}</div>
              </div>`).join('')
            : '<p class="text-gray-400 text-center py-6">ยังไม่มีประวัติ</p>';
    } catch (e) {
        document.getElementById('pmr-history-body').innerHTML = '<p class="text-red-500 text-center py-6">โหลดประวัติไม่สำเร็จ</p>';
    }
}
function pmrCloseHistory() { document.getElementById('pmr-history-modal').classList.add('hidden'); }

// ---- modal ประวัติการแก้ไขแผน (เพิ่ม/แก้/ลบ/คัดลอก — ไม่ใช่ "เปลี่ยนแล้ว") ----
async function pmrOpenEditLog() {
    document.getElementById('pmr-editlog-body').innerHTML = '<p class="text-gray-400 animate-pulse text-center py-6">กำลังโหลด...</p>';
    document.getElementById('pmr-editlog-modal').classList.remove('hidden');
    try {
        const j = await clFetch({ action:'pmReplaceEditLog', machineId:_pmrBatchMachineId });
        const rows = j.data || [];
        document.getElementById('pmr-editlog-body').innerHTML = rows.length
            ? rows.map(l => `<div class="border border-gray-200 rounded-lg px-3 py-2">
                  <div class="flex justify-between items-center gap-2 mb-1">${PMR_EDITLOG_BADGE[l.action]||l.action}<span class="text-xs text-gray-400">${l.at ? new Date(l.at).toLocaleString('th-TH') : ''}</span></div>
                  <div class="text-sm text-gray-700">${l.detail||''}</div>
                  <div class="text-xs text-gray-400 mt-0.5">โดย ${l.by||'—'}</div>
              </div>`).join('')
            : '<p class="text-gray-400 text-center py-6">ยังไม่มีประวัติการแก้ไข</p>';
    } catch (e) {
        document.getElementById('pmr-editlog-body').innerHTML = '<p class="text-red-500 text-center py-6">โหลดประวัติไม่สำเร็จ</p>';
    }
}
function pmrCloseEditLog() { document.getElementById('pmr-editlog-modal').classList.add('hidden'); }
