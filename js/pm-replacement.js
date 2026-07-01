// ============================================================
// PM REPLACEMENT — เปลี่ยนอะไหล่ตามรอบปฏิทิน (PM ประเภทที่ 2)
// ============================================================
let _pmrData = [];
let _pmrEditing = null;       // { planId, ... } หรือ null (เพิ่มใหม่)
let _pmrLocImgDataUrl = null;
let _pmrDoneImgDataUrl = null;
let _pmrDoneItem = null;      // plan item ที่กด "บันทึกเปลี่ยนแล้ว"
let _pmrPickedPart = null;    // { partId, name, partNo } ที่เลือกจาก datalist

const PMR_STATUS_LABEL = { overdue:'เกินกำหนด', soon:'ใกล้ครบกำหนด', ok:'ปกติ' };
const PMR_STATUS_COLOR = { overdue:'#c0392b', soon:'#e67e22', ok:'#27ae60' };
const PMR_UNIT_LABEL   = { month:'เดือน', day:'วัน', year:'ปี' };

async function initPmReplace() {
    if (!machineMaster.length) await loadMachineMaster();
    if (typeof SPARE_CACHE === 'undefined' || !SPARE_CACHE.length) { if (typeof loadSpareCache === 'function') await loadSpareCache(); }
    const sel = document.getElementById('pmr-machine-select');
    if (sel && sel.options.length <= 1) {
        sel.innerHTML = '<option value="">-- เลือกเครื่องจักร --</option>' +
            machineMaster.map(m => `<option value="${m.id}">${m.id} — ${m.name||''}</option>`).join('');
    }
}

// ---- โหลด + render รายการแผนของเครื่องที่เลือก ----
async function pmrLoadForMachine() {
    const machineId = document.getElementById('pmr-machine-select').value;
    const wrap = document.getElementById('pmr-list-wrap');
    if (!machineId) { wrap.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">เลือกเครื่องจักรเพื่อดูแผนเปลี่ยนอะไหล่</p>'; _pmrData = []; return; }
    showLoading('กำลังโหลดแผน…');
    try {
        const r = await fetch(GAS_URL + '?action=pmReplaceList&machineId=' + encodeURIComponent(machineId));
        const j = await r.json();
        _pmrData = j.success ? (j.data || []) : [];
    } catch(e) { _pmrData = []; }
    finally { hideLoading(); }
    pmrRender();
}

function pmrRender() {
    const wrap = document.getElementById('pmr-list-wrap');
    if (!wrap) return;
    if (!_pmrData.length) {
        wrap.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">ยังไม่มีแผนเปลี่ยนอะไหล่สำหรับเครื่องนี้</p>';
        return;
    }
    const canEdit = can('cl.pm');
    wrap.innerHTML = _pmrData.map(p => {
        const color = PMR_STATUS_COLOR[p.status] || '#666';
        const label = PMR_STATUS_LABEL[p.status] || '';
        const partImg = p.partImageId
            ? `<img src="" data-imgid="${p.partImageId}" class="pmr-thumb w-14 h-14 object-contain rounded-lg border border-gray-100 flex-shrink-0 bg-gray-50">`
            : '<div class="w-14 h-14 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-300 text-xl">🔩</div>';
        const locImg = p.locationImageId
            ? `<img src="" data-imgid="${p.locationImageId}" class="pmr-thumb w-14 h-14 object-cover rounded-lg border border-gray-100 flex-shrink-0 bg-gray-50" title="ตำแหน่งบนเครื่อง">`
            : '';
        const unitLabel = PMR_UNIT_LABEL[p.cycleUnit] || p.cycleUnit;
        const editBtn = canEdit
            ? `<button onclick="pmrOpenEdit(${JSON.stringify(p).replace(/"/g,'&quot;')})" class="text-xs text-blue-500 hover:text-blue-700 font-bold px-2 py-1 rounded hover:bg-blue-50 transition-colors">แก้ไข</button>`
            : '';
        const doneBtn = canEdit
            ? `<button onclick="pmrOpenDone(${JSON.stringify(p).replace(/"/g,'&quot;')})" class="mms-btn mms-btn-blue text-xs">✅ บันทึกเปลี่ยนแล้ว</button>`
            : '';
        const histBtn = `<button onclick="pmrOpenHistory('${p.planId}', ${JSON.stringify(p.partLabel||'').replace(/"/g,'&quot;')})" class="text-xs text-gray-500 hover:text-gray-700 font-bold px-2 py-1 rounded hover:bg-gray-50 transition-colors">ประวัติ</button>`;
        return `<div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3 flex-wrap">
            ${partImg}
            ${locImg}
            <div class="flex-1 min-w-40">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-gray-800 text-sm">${p.partLabel || '-'}</span>
                    <span class="text-xs font-bold px-2 py-0.5 rounded-full text-white" style="background:${color}">${label}</span>
                </div>
                <p class="text-xs text-gray-500 mt-0.5">ทุก ${p.cycleValue} ${unitLabel} · ครบกำหนด ${p.nextDue || '—'}</p>
                ${p.note ? `<p class="text-xs text-gray-400 mt-0.5">${p.note}</p>` : ''}
            </div>
            <div class="flex gap-1.5 flex-wrap items-center">
                ${histBtn}
                ${editBtn}
                ${doneBtn}
            </div>
        </div>`;
    }).join('');

    // โหลดรูป thumbnail (lazy ผ่าน getImage endpoint — อ่าน j.dataUrl)
    wrap.querySelectorAll('.pmr-thumb[data-imgid]').forEach(async img => {
        const id = img.dataset.imgid; if (!id) return;
        try {
            const r = await fetch(GAS_URL + '?action=getImage&id=' + encodeURIComponent(id));
            const j = await r.json();
            if (j.success && j.dataUrl) img.src = j.dataUrl;
        } catch(e){}
    });
}

// ---- modal เพิ่ม/แก้แผน ----
function pmrOpenAdd() {
    if (!document.getElementById('pmr-machine-select').value) { showToast('⚠️ กรุณาเลือกเครื่องจักรก่อน', 'error'); return; }
    _pmrEditing = null;
    _pmrLocImgDataUrl = null;
    _pmrPickedPart = null;
    document.getElementById('pmr-edit-title').textContent = '🔩 ตั้งค่า PM Replacement';
    document.getElementById('pmr-part-input').value = '';
    document.getElementById('pmr-cycle-value').value = '';
    document.getElementById('pmr-cycle-unit').value = 'month';
    document.getElementById('pmr-start-date').value = new Date().toISOString().slice(0,7);   // เดือนปี (YYYY-MM)
    document.getElementById('pmr-note').value = '';
    document.getElementById('pmr-loc-img-input').value = '';
    document.getElementById('pmr-loc-img-preview').classList.add('hidden');
    pmrFillPartHint();
    document.getElementById('pmr-edit-modal').classList.remove('hidden');
}
function pmrOpenEdit(p) {
    _pmrEditing = p;
    _pmrLocImgDataUrl = null;
    _pmrPickedPart = { partId: p.partId, name: p.partLabel, partNo: '' };
    document.getElementById('pmr-edit-title').textContent = '🔩 แก้ไข PM Replacement';
    document.getElementById('pmr-part-input').value = p.partLabel || '';
    document.getElementById('pmr-cycle-value').value = p.cycleValue || '';
    document.getElementById('pmr-cycle-unit').value = p.cycleUnit || 'month';
    document.getElementById('pmr-start-date').value = String(p.startDate||'').slice(0,7);   // เดือนปี (YYYY-MM)
    document.getElementById('pmr-note').value = p.note || '';
    document.getElementById('pmr-loc-img-input').value = '';
    document.getElementById('pmr-loc-img-preview').classList.add('hidden');
    pmrFillPartHint();
    document.getElementById('pmr-edit-modal').classList.remove('hidden');
}
function pmrCloseEdit() { document.getElementById('pmr-edit-modal').classList.add('hidden'); }

function pmrFillPartHint() {
    const dl = document.getElementById('pmr-part-hint'); if (!dl) return;
    dl.innerHTML = (typeof SPARE_CACHE !== 'undefined' ? SPARE_CACHE : []).map(p => {
        const pn = p.partNo ? '[' + p.partNo + '] ' : '';
        return `<option value="${pn}${String(p.name||'').replace(/"/g,'&quot;')}">`;
    }).join('');
}
function pmrPartPick(inp) {
    const val = inp.value;
    const hit = (typeof SPARE_CACHE !== 'undefined' ? SPARE_CACHE : []).find(p => (p.partNo ? '[' + p.partNo + '] ' : '') + p.name === val);
    _pmrPickedPart = hit ? { partId: hit.partId, name: hit.name, partNo: hit.partNo } : null;
}

function pmrLocImgPreview(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        compressImage(e.target.result, d => {
            _pmrLocImgDataUrl = d;
            document.getElementById('pmr-loc-img-preview-img').src = d;
            document.getElementById('pmr-loc-img-preview').classList.remove('hidden');
        });
    };
    reader.readAsDataURL(file);
}

async function pmrSaveEdit() {
    if (!can('cl.pm')) { showToast('ไม่มีสิทธิ์', 'error'); return; }
    const machineId = document.getElementById('pmr-machine-select').value;
    if (!machineId) { showToast('⚠️ กรุณาเลือกเครื่องจักร', 'error'); return; }
    const cycleValue = Number(document.getElementById('pmr-cycle-value').value);
    const cycleUnit  = document.getElementById('pmr-cycle-unit').value;
    const startDate  = document.getElementById('pmr-start-date').value;
    const note       = document.getElementById('pmr-note').value.trim();
    const hasImg = !!_pmrLocImgDataUrl || (_pmrEditing && _pmrEditing.locationImageId);
    if (!_pmrPickedPart) { showToast('⚠️ กรุณาเลือกอะไหล่จากรายการ', 'error'); return; }
    if (!cycleValue || cycleValue < 1) { showToast('⚠️ กรุณาระบุรอบเปลี่ยน', 'error'); return; }
    if (!startDate) { showToast('⚠️ กรุณาระบุเดือนที่เริ่ม', 'error'); return; }
    if (!hasImg) { showToast('⚠️ กรุณาแนบรูปภาพบริเวณที่เปลี่ยน', 'error'); return; }

    const partLabel = _pmrPickedPart.partNo ? _pmrPickedPart.partNo + ' - ' + _pmrPickedPart.name : _pmrPickedPart.name;
    const payload = {
        action: 'pmReplaceUpsert',
        username: currentUser.username, pin: currentUser.pin,
        planId: _pmrEditing ? _pmrEditing.planId : null,
        machineId, partId: _pmrPickedPart.partId, partLabel,
        cycleValue, cycleUnit, startDate, note,
        locationImageId: _pmrLocImgDataUrl || null,
        existingLocationImageId: _pmrEditing ? (_pmrEditing.locationImageId || '') : '',
    };
    showLoading('กำลังบันทึก…');
    try {
        const r = await fetch(GAS_URL, { method:'POST', body: JSON.stringify(payload) });
        const j = await r.json();
        if (j.success) {
            pmrCloseEdit();
            await pmrLoadForMachine();
            showSuccessModal('บันทึกแผนสำเร็จ', partLabel);
        } else { showToast('เกิดข้อผิดพลาด: ' + (j.error||''), 'error'); }
    } catch(e) { showToast('เชื่อมต่อ GAS ไม่ได้', 'error'); }
    finally { hideLoading(); }
}

// ---- modal บันทึกเปลี่ยนแล้ว ----
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
    const payload = {
        action: 'pmReplaceDone',
        username: currentUser.username, pin: currentUser.pin,
        planId: _pmrDoneItem.planId, doneDate, note, byName,
        photoId: _pmrDoneImgDataUrl || null,
    };
    showLoading('กำลังบันทึก…');
    try {
        const r = await fetch(GAS_URL, { method:'POST', body: JSON.stringify(payload) });
        const j = await r.json();
        if (j.success) {
            pmrCloseDone();
            await pmrLoadForMachine();
            showSuccessModal('บันทึกเปลี่ยนอะไหล่สำเร็จ', label + ' · ครบกำหนดถัดไป ' + j.nextDue);
        } else { showToast('เกิดข้อผิดพลาด: ' + (j.error||''), 'error'); }
    } catch(e) { showToast('เชื่อมต่อ GAS ไม่ได้', 'error'); }
    finally { hideLoading(); }
}

// ---- modal ประวัติ ----
async function pmrOpenHistory(planId, label) {
    document.getElementById('pmr-history-title').textContent = '📜 ประวัติ — ' + label;
    document.getElementById('pmr-history-body').innerHTML = '<p class="text-gray-400 animate-pulse text-center py-6">กำลังโหลด...</p>';
    document.getElementById('pmr-history-modal').classList.remove('hidden');
    try {
        const r = await fetch(GAS_URL + '?action=pmReplaceLog&planId=' + encodeURIComponent(planId));
        const j = await r.json();
        const rows = j.data || [];
        document.getElementById('pmr-history-body').innerHTML = rows.length
            ? rows.map(l => `<div class="border border-gray-200 rounded-lg px-3 py-2">
                  <div class="flex justify-between items-center gap-2"><span class="font-bold text-gray-800">${l.doneDate || '—'}</span><span class="text-xs text-gray-400">โดย ${l.by || '—'}</span></div>
                  ${l.note ? `<div class="text-xs text-gray-500 mt-0.5">${l.note}</div>` : ''}
                  <div class="text-xs text-gray-400 mt-0.5">ครบกำหนดถัดไป: ${l.nextDueAfter || '—'}</div>
              </div>`).join('')
            : '<p class="text-gray-400 text-center py-6">ยังไม่มีประวัติ</p>';
    } catch(e) {
        document.getElementById('pmr-history-body').innerHTML = '<p class="text-red-500 text-center py-6">โหลดประวัติไม่สำเร็จ</p>';
    }
}
function pmrCloseHistory() { document.getElementById('pmr-history-modal').classList.add('hidden'); }
