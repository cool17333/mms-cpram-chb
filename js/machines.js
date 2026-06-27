// ============================================================
// MACHINE REGISTRY PAGE (Admin) — จัดการทะเบียนเครื่องจักร
// ============================================================
let machineMaster = [];   // สำเนาที่แก้ไขได้ (โหลดจาก GAS, บันทึกกลับทั้งชุด)

const MACH_RANK_COLOR = { A:'#c0392b', B:'#e67e22', C:'#f1c40f', D:'#27ae60' };
function machRankBadge(rank) {
    var r = String(rank||'').trim().toUpperCase();
    if (!MACH_RANK_COLOR[r]) return '<span class="text-xs text-gray-300">ยังไม่ประเมิน</span>';
    return '<span class="inline-block px-2 py-0.5 rounded font-bold text-white text-xs" style="background:' + MACH_RANK_COLOR[r] + '">' + r + '</span>';
}

function goMachines() {
    switchTab('machines');
    loadMachineMaster();
}

async function loadMachineMaster() {
    if (!GAS_URL) return;
    setVisible('mach-loading', true);
    showLoading('กำลังโหลดทะเบียนเครื่องจักร…');
    try {
        const res  = await fetch(`${GAS_URL}?action=getMachines`);
        const json = await res.json();
        machineMaster = (json.data || []).map(m => ({ id:m.id||'', name:m.name||'', factory:m.factory||'', area:m.area||'', line:m.line||'', editedBy:m.editedBy||'', editedAt:m.editedAt||'', rank:m.rank||'', rankYear:m.rankYear||'' }));
    } catch (e) { showToast('❌ โหลดทะเบียนไม่สำเร็จ', 'error'); }
    finally { hideLoading(); }
    setVisible('mach-loading', false);
    machUpdateFilterArea();
    renderMachTable();
}

// filter พื้นที่ตามโรงงานที่เลือก (รวมพื้นที่จริงที่มีในข้อมูล + ตาม AREA_MAP)
function machUpdateFilterArea() {
    _machPage = 0;
    const f = document.getElementById('mach-f-factory').value;
    const sel = document.getElementById('mach-f-area');
    const cur = sel.value;
    const areas = new Set();
    if (f === 'โรงงาน 1') (AREA_MAP['1']||[]).forEach(a=>areas.add(a));
    else if (f === 'โรงงาน 2') (AREA_MAP['2']||[]).forEach(a=>areas.add(a));
    machineMaster.forEach(m => { if (!f || m.factory === f) { if (m.area) areas.add(m.area); } });
    sel.innerHTML = '<option value="">ทุกพื้นที่</option>' + [...areas].map(a=>`<option ${a===cur?'selected':''}>${a}</option>`).join('');
}

const AREA_OPTS = (fac) => (/2/.test(fac) ? AREA_MAP['2'] : /1/.test(fac) ? AREA_MAP['1'] : []);

let _machPage      = 0;   // หน้าปัจจุบัน (0-based)
let _machPageSize  = 10;  // 0 = ทั้งหมด
let _machTotalPages = 1;

function machSetPageSize(val) {
    _machPageSize = parseInt(val, 10);
    _machPage = 0;
    renderMachTable();
}

function machGoPage(p) {
    if (p < 0 || p >= _machTotalPages) return;
    _machPage = p;
    renderMachTable();
    document.getElementById('panel-machines').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderMachTable() {
    const ff = document.getElementById('mach-f-factory').value;
    const fa = document.getElementById('mach-f-area').value;
    const fr = document.getElementById('mach-f-rank')?.value || '';
    const fq = (document.getElementById('mach-f-search')?.value || '').trim().toLowerCase();
    const tb = document.getElementById('mach-tbody');
    const emptyEl    = document.getElementById('mach-empty');
    const pagBar     = document.getElementById('mach-pagination');

    const filtered = machineMaster
        .map((m, i) => ({ m, i }))
        .filter(({m}) => (!ff || m.factory === ff) && (!fa || m.area === fa) &&
            (!fr || (fr === 'none' ? !String(m.rank||'').trim() : String(m.rank||'').trim().toUpperCase() === fr)) &&
            (!fq || String(m.id||'').toLowerCase().includes(fq) || String(m.name||'').toLowerCase().includes(fq)));

    const total = filtered.length;

    // Pagination calc
    const pageSize     = _machPageSize || total || 1;  // 0 = ทั้งหมด
    _machTotalPages    = Math.max(1, Math.ceil(total / pageSize));
    if (_machPage >= _machTotalPages) _machPage = _machTotalPages - 1;
    const start        = _machPage * pageSize;
    const pageRows     = _machPageSize ? filtered.slice(start, start + pageSize) : filtered;

    // Count label
    const showing = _machPageSize
        ? `แสดง ${total ? start+1 : 0}–${Math.min(start+pageSize, total)} จาก ${total} / ${machineMaster.length} เครื่อง`
        : `แสดงทั้งหมด ${total} / ${machineMaster.length} เครื่อง`;
    document.getElementById('mach-count').textContent = showing;

    if (!total) {
        tb.innerHTML = '';
        emptyEl.classList.remove('hidden');
        pagBar.classList.add('hidden');
        return;
    }
    emptyEl.classList.add('hidden');

    tb.innerHTML = pageRows.map(({m, i}, seq) => {
        const editInfo = m.editedBy
            ? `<span class="font-medium text-gray-700">${m.editedBy}</span><br><span class="text-gray-400">${m.editedAt ? new Date(m.editedAt).toLocaleDateString('th-TH',{day:'2-digit',month:'2-digit',year:'2-digit'}) : ''}</span>`
            : '<span class="text-gray-300">—</span>';
        return `<tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
        <td class="px-4 py-2.5 text-center text-xs text-gray-400">${start+seq+1}</td>
        <td class="px-4 py-2.5"><span class="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">${m.id||'—'}</span></td>
        <td class="px-4 py-2.5 text-sm font-medium text-gray-800">${m.name||'—'}</td>
        <td class="px-4 py-2.5 text-xs text-gray-600">${m.factory||'—'}</td>
        <td class="px-4 py-2.5 text-xs text-gray-600">${m.area||'—'}</td>
        <td class="px-4 py-2.5 text-xs text-gray-600">${m.line||'—'}</td>
        <td class="px-4 py-2.5 text-center">${machRankBadge(m.rank)}</td>
        <td class="px-4 py-2.5 text-xs leading-tight">${editInfo}</td>
        <td class="px-4 py-2.5">
            <div class="flex gap-1.5 justify-end">
                <button onclick="machOpenEdit(${i})" title="แก้ไข"
                    class="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors">✏️ แก้ไข</button>
                <button onclick="machDeleteRow(${i})" title="ลบ"
                    class="px-2.5 py-1 text-xs font-bold bg-red-50 text-red-500 hover:bg-red-100 rounded-lg transition-colors">🗑️ ลบ</button>
            </div>
        </td>
    </tr>`;
    }).join('');

    // Pagination bar
    const showPag = _machPageSize && _machTotalPages > 1;
    pagBar.classList.toggle('hidden', !showPag);
    if (!showPag) return;

    document.getElementById('mach-page-info').textContent =
        `หน้า ${_machPage+1} / ${_machTotalPages}`;

    // Prev/First/Next/Last enable state
    const atFirst = _machPage === 0;
    const atLast  = _machPage === _machTotalPages - 1;
    document.getElementById('mach-pg-first').disabled = atFirst;
    document.getElementById('mach-pg-prev').disabled  = atFirst;
    document.getElementById('mach-pg-next').disabled  = atLast;
    document.getElementById('mach-pg-last').disabled  = atLast;

    // Page number buttons (show up to 5 around current)
    const pgNums = document.getElementById('mach-pg-nums');
    const half = 2;
    let pStart = Math.max(0, _machPage - half);
    let pEnd   = Math.min(_machTotalPages - 1, _machPage + half);
    if (pEnd - pStart < 4) {
        if (pStart === 0) pEnd = Math.min(_machTotalPages-1, 4);
        else pStart = Math.max(0, pEnd - 4);
    }
    let nums = '';
    for (let p = pStart; p <= pEnd; p++) {
        const active = p === _machPage;
        nums += `<button onclick="machGoPage(${p})"
            class="px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${active
                ? 'text-white' : 'border border-gray-200 hover:bg-gray-100 text-gray-600'}"
            ${active ? `style="background:var(--mms-red)"` : ''}>${p+1}</button>`;
    }
    pgNums.innerHTML = nums;
}

// ---------- Machine Modal (Add / Edit) ----------
function machOpenAdd() {
    document.getElementById('modal-mc-title').textContent = '➕ เพิ่มเครื่องจักร';
    document.getElementById('mc-id').value = '';
    document.getElementById('mc-name').value = '';
    document.getElementById('mc-factory').value = '';
    document.getElementById('mc-line').value = '';
    document.getElementById('mc-editor').value = '';
    document.getElementById('mc-edit-idx').value = '-1';
    document.getElementById('mc-rank-row').classList.add('hidden');
    mcUpdateArea('');
    document.getElementById('modal-mc').classList.remove('hidden');
    setTimeout(() => document.getElementById('mc-id').focus(), 50);
}

function machOpenEdit(i) {
    const m = machineMaster[i];
    document.getElementById('modal-mc-title').textContent = '✏️ แก้ไขเครื่องจักร';
    document.getElementById('mc-id').value = m.id || '';
    document.getElementById('mc-name').value = m.name || '';
    document.getElementById('mc-factory').value = m.factory || '';
    document.getElementById('mc-line').value = m.line || '';
    document.getElementById('mc-editor').value = '';
    document.getElementById('mc-edit-idx').value = String(i);
    var rankRow = document.getElementById('mc-rank-row');
    rankRow.classList.remove('hidden');
    rankRow.dataset.code = m.id || '';
    document.getElementById('mc-rank-badge').innerHTML = machRankBadge(m.rank);
    document.getElementById('mc-rank-year').textContent = m.rankYear ? '(ปี ' + m.rankYear + ')' : '';
    mcUpdateArea(m.area || '');
    document.getElementById('modal-mc').classList.remove('hidden');
}

function machGoAssess() {
    var code = document.getElementById('mc-rank-row').dataset.code || '';
    closeMcModal();
    if (typeof switchTab === 'function') switchTab('mcrank');
    if (code && typeof openMcRankForm === 'function') setTimeout(function(){ openMcRankForm(code); }, 200);
}

function mcUpdateArea(keepVal) {
    const f = document.getElementById('mc-factory').value;
    const sel = document.getElementById('mc-area');
    const cur = keepVal !== undefined ? keepVal : sel.value;
    const areas = f === 'โรงงาน 1' ? (AREA_MAP['1']||[]) : f === 'โรงงาน 2' ? (AREA_MAP['2']||[]) : [];
    sel.innerHTML = '<option value="">-- เลือกพื้นที่ --</option>' +
        areas.map(a => `<option ${a===cur?'selected':''}>${a}</option>`).join('');
}

async function machSaveModal() {
    const id       = document.getElementById('mc-id').value.trim();
    const name     = document.getElementById('mc-name').value.trim();
    const fac      = document.getElementById('mc-factory').value;
    const area     = document.getElementById('mc-area').value;
    const line     = document.getElementById('mc-line').value.trim();
    const editedBy = currentUser.name;
    if (!id)       { showToast('⚠️ กรุณาระบุรหัสเครื่องจักร', 'error'); return; }
    if (!name)     { showToast('⚠️ กรุณาระบุชื่อเครื่องจักร', 'error'); return; }
    if (!fac)      { showToast('⚠️ กรุณาเลือกโรงงาน', 'error'); return; }
    if (!area)     { showToast('⚠️ กรุณาเลือกพื้นที่', 'error'); return; }
    if (!editedBy) { showToast('⚠️ กรุณาเข้าสู่ระบบก่อนแก้ไข', 'error'); openLogin(); return; }
    if (!GAS_URL)  { showToast('⚠️ ตั้งค่า URL ก่อน', 'error'); return; }
    const idx = parseInt(document.getElementById('mc-edit-idx').value, 10);
    const rec = { id, name, factory: fac, area, line };
    showLoading('กำลังบันทึก…');
    try {
        const res  = await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
            body: JSON.stringify({ action:'upsertMachine', username: currentUser.username, pin: currentUser.pin, machine: rec, byName: editedBy }) });
        const json = await res.json();
        if (!json.success) { showToast('❌ บันทึกล้มเหลว: ' + (json.error||''), 'error'); return; }
        const full = { ...rec, editedBy, editedAt: new Date().toISOString() };
        if (idx >= 0) Object.assign(machineMaster[idx], full);
        else { const dup = machineMaster.findIndex(m => String(m.id).toLowerCase() === id.toLowerCase());
               if (dup >= 0) Object.assign(machineMaster[dup], full); else machineMaster.unshift(full); }
        closeMcModal(); renderMachTable();
        showToast('✅ บันทึกเครื่องจักรแล้ว', 'success');
    } catch(e) { showToast('❌ เกิดข้อผิดพลาด: ' + e.message, 'error'); }
    finally { hideLoading(); }
}

function closeMcModal() {
    document.getElementById('modal-mc').classList.add('hidden');
}

// ---------- Import panel toggle ----------
function machOpenImport() {
    document.getElementById('reg-import-panel').classList.remove('hidden');
    document.getElementById('reg-import-panel').scrollIntoView({ behavior:'smooth', block:'start' });
}
function machCloseImport() {
    document.getElementById('reg-import-panel').classList.add('hidden');
    impCancel();
}

let _machDelIdx = -1;
function machDeleteRow(i) {
    const m = machineMaster[i];
    if (!m) return;
    _machDelIdx = i;
    document.getElementById('mach-del-desc').textContent =
        `คุณกำลังจะลบเครื่องจักร "${m.id || ''} — ${m.name || ''}" ออกจากทะเบียน ข้อมูลนี้จะถูกลบถาวรและไม่สามารถกู้คืนได้`;
    document.getElementById('mach-del-by').value = '';
    document.getElementById('modal-mach-del').classList.remove('hidden');
}
function closeMachDelModal() {
    document.getElementById('modal-mach-del').classList.add('hidden');
    _machDelIdx = -1;
}
async function confirmMachDelete() {
    const byName = currentUser.name;
    if (!byName) { showToast('⚠️ กรุณาเข้าสู่ระบบก่อนดำเนินการ', 'error'); openLogin(); return; }
    if (!can('mc.delete')) { showToast('⚠️ ไม่มีสิทธิ์ลบเครื่องจักร', 'error'); return; }
    const m = machineMaster[_machDelIdx];
    if (!m) { closeMachDelModal(); return; }
    showLoading('กำลังลบ…');
    try {
        const res  = await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
            body: JSON.stringify({ action:'deleteMachineRow', username: currentUser.username, pin: currentUser.pin, machineId: m.id, byName }) });
        const json = await res.json();
        if (!json.success) { showToast('❌ ลบล้มเหลว: ' + (json.error||''), 'error'); return; }
        machineMaster.splice(_machDelIdx, 1);
        closeMachDelModal();
        renderMachTable();
        showToast('🗑️ ลบเครื่องจักรแล้ว', 'success');
    } catch(e) { showToast('❌ เกิดข้อผิดพลาด: ' + e.message, 'error'); }
    finally { hideLoading(); }
}

async function saveMachines() {
    if (!can('mc.edit')) { showToast('⚠️ ไม่มีสิทธิ์แก้ไขทะเบียน', 'error'); return; }
    const clean = machineMaster.filter(m => String(m.id).trim());
    if (!clean.length) { showToast('⚠️ รายการว่าง — ไม่บันทึก (กันข้อมูลหาย)', 'error'); return; }
    if (!confirm(`บันทึกทะเบียนเครื่องจักรทั้งหมด ${clean.length} รายการ?\n(ของเดิมจะถูกสำรองไว้ให้อัตโนมัติ)`)) return;
    try {
        const res  = await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
            body: JSON.stringify({ action:'setMachines', username: currentUser.username, pin: currentUser.pin, machines: clean }) });
        const json = await res.json();
        if (json && json.success) { showToast(`✅ บันทึก ${json.count} เครื่องจักรแล้ว`, 'success'); machineList=[]; loadMachines(); }
        else showToast('❌ บันทึกไม่สำเร็จ: ' + (json && json.error || ''), 'error');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// กู้คืนทะเบียนเครื่องจักรจากข้อมูลสำรองล่าสุด (_Machines_bak)
async function restoreMachines() {
    if (!can('mc.restore')) { showToast('⚠️ ไม่มีสิทธิ์กู้คืน', 'error'); return; }
    if (!confirm('กู้คืนทะเบียนเครื่องจักรจากข้อมูลสำรองล่าสุด?\n(เขียนทับรายการปัจจุบัน)')) return;
    try {
        const res  = await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'},
            body: JSON.stringify({ action:'restoreMachines', username: currentUser.username, pin: currentUser.pin }) });
        const json = await res.json();
        if (json && json.success) { showToast(`✅ กู้คืน ${json.count} เครื่องจักรแล้ว`, 'success'); loadMachineMaster(); machineList=[]; loadMachines(); }
        else showToast('❌ กู้คืนไม่สำเร็จ: ' + (json && json.error || ''), 'error');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// สำรองข้อมูลทะเบียนเครื่องจักรเป็นไฟล์ JSON
function backupData() {
    if (!machineMaster.length) { showToast('⚠️ ยังไม่มีข้อมูลให้สำรอง', 'error'); return; }
    const payload = { machineRegistry: machineMaster, backupDate: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `machine_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    showToast(`📁 สำรองข้อมูล ${machineMaster.length} เครื่องแล้ว`, 'success');
}

// ---------- IMPORT (แยกพื้นที่ + เลือก column + preview + confirm) ----------
let _impRows = [];   // แถวดิบจากไฟล์ (array ของ array)

function impUpdateArea() {
    const f = document.getElementById('imp-factory').value;
    const sel = document.getElementById('imp-area');
    sel.innerHTML = '<option value="">-- เลือกพื้นที่ --</option>' + (AREA_MAP[f]||[]).map(a=>`<option>${a}</option>`).join('');
}

async function impReadFile(input) {
    const file = input.files[0]; if (!file) return;
    if (typeof XLSX === 'undefined') { showToast('❌ โหลดตัวอ่าน Excel ไม่สำเร็จ', 'error'); return; }
    try {
        const wb  = XLSX.read(await file.arrayBuffer(), { type:'array' });
        _impRows  = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header:1, defval:'' });
        if (!_impRows.length) { showToast('⚠️ ไฟล์ว่าง', 'error'); return; }
        const head = _impRows[0].map((h,i) => String(h||('คอลัมน์ '+(i+1))));
        const opts = (def) => head.map((h,i)=>`<option value="${i}" ${i===def?'selected':''}>${String(h).replace(/"/g,'&quot;')}</option>`).join('');
        const guess = kw => { const j = head.findIndex(h => kw.some(k => String(h).toLowerCase().includes(k))); return j<0?-1:j; };
        const gId = guess(['รหัส','code','id']), gName = guess(['ชื่อ','name']), gLine = guess(['ไลน์','line','สาย']);
        document.getElementById('imp-col-id').innerHTML   = opts(gId>=0?gId:0);
        document.getElementById('imp-col-name').innerHTML = opts(gName>=0?gName:1);
        document.getElementById('imp-col-line').innerHTML = '<option value="-1">— ไม่มี —</option>' + head.map((h,i)=>`<option value="${i}" ${i===gLine?'selected':''}>${String(h).replace(/"/g,'&quot;')}</option>`).join('');
        const lbl = document.getElementById('imp-file-label');
        if (lbl) lbl.textContent = `📄 ${file.name} (${_impRows.length-1} แถว)`;
        document.getElementById('imp-map').classList.remove('hidden');
        impPreview();
    } catch (e) { showToast('❌ อ่านไฟล์ไม่ได้: ' + e.message, 'error'); }
    finally { input.value=''; }
}

function impBuild() {
    const cId = +document.getElementById('imp-col-id').value;
    const cName = +document.getElementById('imp-col-name').value;
    const cLine = +document.getElementById('imp-col-line').value;
    const out = [];
    for (let i = 1; i < _impRows.length; i++) {
        const r = _impRows[i], id = String(r[cId]||'').trim();
        if (!id) continue;
        out.push({ id, name:String(r[cName]||'').trim(), line: cLine>=0 ? String(r[cLine]||'').trim() : '' });
    }
    return out;
}

function impPreview() {
    const rows = impBuild();
    document.getElementById('imp-count').textContent = `${rows.length} เครื่อง`;
    document.getElementById('imp-preview-body').innerHTML = rows.slice(0, 200).map(m =>
        `<tr class="border-b border-gray-100"><td class="px-3 py-1">${m.id}</td><td class="px-3 py-1">${m.name||'—'}</td><td class="px-3 py-1">${m.line||'—'}</td></tr>`).join('')
        || '<tr><td colspan="3" class="text-center text-gray-400 py-4">— ไม่มีข้อมูล —</td></tr>';
}

function impCancel() {
    document.getElementById('imp-map').classList.add('hidden');
    _impRows = [];
    const lbl = document.getElementById('imp-file-label');
    if (lbl) lbl.textContent = 'คลิกเพื่อเลือกไฟล์ Excel หรือ CSV';
}

function impConfirm() {
    const fSel = document.getElementById('imp-factory');
    const factory = fSel.options[fSel.selectedIndex]?.text?.startsWith('--') ? '' : fSel.options[fSel.selectedIndex]?.text || '';
    const area = document.getElementById('imp-area').value;
    if (!fSel.value) return showToast('⚠️ เลือกโรงงานของไฟล์', 'error');
    if (!area)       return showToast('⚠️ เลือกพื้นที่ของไฟล์', 'error');
    const rows = impBuild();
    if (!rows.length) return showToast('⚠️ ไม่มีข้อมูลให้นำเข้า', 'error');
    if (!confirm(`นำเข้า ${rows.length} เครื่องจักร เข้า ${factory} / ${area}?\n(รหัสซ้ำจะถูกอัปเดต)`)) return;

    // upsert ตามรหัส — เพิ่มเข้า machineMaster (ไม่ลบพื้นที่อื่น)
    const map = new Map(machineMaster.map(m => [String(m.id).toLowerCase(), m]));
    rows.forEach(r => {
        const ex = map.get(r.id.toLowerCase());
        const rec = { id:r.id, name:r.name, factory, area, line:r.line };
        if (ex) Object.assign(ex, rec);
        else { machineMaster.unshift(rec); map.set(r.id.toLowerCase(), rec); }
    });
    impCancel();
    document.getElementById('imp-factory').value=''; impUpdateArea();
    machUpdateFilterArea(); renderMachTable();
    showToast(`✅ เตรียมนำเข้า ${rows.length} เครื่อง — กด "บันทึกทั้งหมด" เพื่อยืนยันลงระบบ`, 'success');
}

// ยกเลิกงาน (Admin) — เปลี่ยนสถานะเป็น "ยกเลิกงาน" แทนการลบถาวร
let _cancelItem = null;

function cancelRecord(item) {
    if (!can('bd.cancel')) { showToast('⚠️ ไม่มีสิทธิ์ยกเลิกงาน', 'error'); return; }
    _cancelItem = item;
    document.getElementById('cancel-tracking-display').textContent =
        (item.tracking || '') + (item.machineName ? ' — ' + item.machineName : '');
    document.getElementById('cancel-reason').value  = '';
    document.getElementById('cancel-modal').classList.remove('hidden');
}

function closeCancelModal() {
    document.getElementById('cancel-modal').classList.add('hidden');
    _cancelItem = null;
}

async function confirmCancel() {
    const reason = document.getElementById('cancel-reason').value.trim();
    const byName = currentUser.name;
    if (!reason) { showToast('⚠️ กรุณาระบุเหตุผลการยกเลิก', 'error'); return; }
    if (!byName) { showToast('⚠️ กรุณาเข้าสู่ระบบก่อนดำเนินการ', 'error'); closeCancelModal(); openLogin(); return; }
    const item = _cancelItem;
    closeCancelModal();
    try {
        await fetch(GAS_URL, {
            method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'cancel', sheetName: item.sheetName, rowIndex: item.rowIndex,
                tracking: item.tracking, username: currentUser.username, pin: currentUser.pin, byName, cancelReason: reason }),
        });
        showToast('🚫 ยกเลิกงานเรียบร้อย — กำลังรีโหลด', 'info');
        setTimeout(loadRecords, 900);
    } catch (err) {
        showToast('❌ ยกเลิกไม่สำเร็จ: ' + err.message, 'error');
    }
}

// ดูประวัติ log ของเอกสาร (เปิดได้ทุกคน)
async function openLog(tracking) {
    if (!GAS_URL) return;
    document.getElementById('log-tracking').textContent = tracking;
    document.getElementById('log-body').innerHTML = '<p class="text-gray-400 animate-pulse text-center py-6">กำลังโหลด...</p>';
    document.getElementById('log-modal').classList.remove('hidden');
    try {
        const res  = await fetch(`${GAS_URL}?action=getLog&tracking=${encodeURIComponent(tracking)}`);
        const json = await res.json();
        const rows = json.data || [];
        document.getElementById('log-body').innerHTML = rows.length
            ? rows.map(l => `<div class="border border-gray-200 rounded-lg px-3 py-2">
                  <div class="flex justify-between items-center gap-2"><span class="font-bold text-gray-800">${l.action || '—'}</span><span class="text-xs text-gray-400 whitespace-nowrap">${l.time || ''}</span></div>
                  <div class="text-xs text-gray-500 mt-0.5">โดย: <b>${l.byName || '—'}</b> · สถานะ: ${l.status || '—'}</div>
              </div>`).join('')
            : '<p class="text-gray-400 text-center py-6">ยังไม่มีประวัติ</p>';
    } catch (err) {
        document.getElementById('log-body').innerHTML = '<p class="text-red-500 text-center py-6">โหลด log ไม่สำเร็จ</p>';
    }
}

