// ============================================================
// CHECKLIST: STATUS PAGE (สถานะการตรวจรายเครื่อง)
// ============================================================
let _clstDaily = {};   // { 'เช้า': Set<machineId>, 'ดึก': Set<machineId> }
let _clstPm    = new Set(); // machineId ที่ตรวจ PM เดือนนี้แล้ว

async function initClStatus() {
    if (!machineMaster.length) await loadMachineMaster();
    clFillFacSelect('clst-fac', '');
    clFillAreaSelect('clst-area', '', '');
    // วันที่ใช้ Bangkok timezone (UTC+7) ไม่ใช่ UTC
    const todayBKK = new Date(Date.now() + 7*3600000).toISOString().slice(0,10);
    document.getElementById('clst-date').value = todayBKK;
    if (!Object.keys(_clPmPlans).length) {
        try { const p = await clFetch({ action:'getPmPlans', factory:'', area:'' }); (p.data||[]).forEach(r => _clPmPlans[r.machineId] = r); } catch(e) {}
    }
    loadClStatus();
}
function clstFacChange() {
    clFillAreaSelect('clst-area', document.getElementById('clst-fac')?.value || '', '');
    loadClStatus();
}
async function loadClStatus() {
    const fac     = document.getElementById('clst-fac')?.value  || '';
    const area    = document.getElementById('clst-area')?.value || '';
    const dateStr = document.getElementById('clst-date')?.value
                    || new Date(Date.now() + 7*3600000).toISOString().slice(0,10);
    const tbody   = document.getElementById('clst-body');
    if (!fac) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">เลือก Factory</td></tr>'; return; }
    tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">กำลังโหลด...</td></tr>';
    const yr = dateStr.slice(0,4), mo = dateStr.slice(5,7);
    _clstDaily = {};   // รีเซ็ต — รับ shift ทุกชื่อแบบ dynamic
    _clstPm = new Set();
    try {
        const dr = await clFetch({ action:'getChecklists', factory:fac, area, type:'daily', month:mo, year:yr });
        (dr.data||[]).forEach(r => {
            const mid   = String(r.machineId || r.machine || '').trim();
            const shift = String(r.shift || '').trim();
            const date  = String(r.date  || '').slice(0, 10);
            if (!mid || date !== dateStr) return;
            if (!_clstDaily[shift]) _clstDaily[shift] = new Set();
            _clstDaily[shift].add(mid);
        });
        const pr = await clFetch({ action:'getChecklists', factory:fac, area, type:'pm', month:mo, year:yr });
        (pr.data||[]).forEach(r => _clstPm.add(String(r.machineId || r.machine || '').trim()));
    } catch(e) { console.error('[loadClStatus]', e); }
    renderClStatus();
}
function renderClStatus() {
    const fac     = document.getElementById('clst-fac')?.value  || '';
    const area    = document.getElementById('clst-area')?.value || '';
    const dateStr = document.getElementById('clst-date')?.value
                    || new Date(Date.now() + 7*3600000).toISOString().slice(0,10);
    const search  = (document.getElementById('clst-search')?.value || '').trim().toLowerCase();
    const yr = Number(dateStr.slice(0,4)), mo = Number(dateStr.slice(5,7));
    const tbody = document.getElementById('clst-body');
    if (!fac) return;
    let machines = clMachinesFor(fac, area);
    if (search) machines = machines.filter(m => {
        const id   = String(m.id || m.machineId || '').toLowerCase();
        const name = String(m.name || m.machineName || '').toLowerCase();
        return id.includes(search) || name.includes(search);
    });
    if (!machines.length) { tbody.innerHTML = '<tr><td colspan="4" class="text-center text-gray-400 py-8">ไม่พบเครื่องจักร</td></tr>'; return; }
    const okB  = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✅ ตรวจแล้ว</span>';
    const noB  = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">❌ ยังไม่ตรวจ</span>';
    const dueB = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-500">⏰ ค้าง</span>';
    const naB  = '<span class="text-xs text-gray-300">—</span>';
    tbody.innerHTML = machines.map(m => {
        const id   = String(m.id || m.machineId || m.machine_id || '').trim();
        const name = m.name || m.machineName || id;
        const plan = _clPmPlans[id] || {};
        const dailyOn = plan.dailyEnabled !== false && plan.dailyEnabled !== 0 && plan.dailyEnabled !== '0';
        const morning = !dailyOn ? naB : (_clstDaily['เช้า']?.has(id) ? okB : noB);
        const night   = !dailyOn ? naB : (_clstDaily['ดึก']?.has(id) ? okB : noB);
        const pmDue   = clIsPmDueInMonth(id, yr, mo - 1);
        const pm      = !pmDue ? naB : (_clstPm.has(id) ? okB : dueB);
        return `<tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-2.5"><span class="text-sm font-medium">${name}</span> <span class="text-xs text-gray-400 font-mono">${id}</span></td>
            <td class="px-3 py-2.5 text-center">${morning}</td>
            <td class="px-3 py-2.5 text-center">${night}</td>
            <td class="px-3 py-2.5 text-center">${pm}</td>
        </tr>`;
    }).join('');
}

async function loadClSchedule() {
    const fac  = document.getElementById('clsc-fac')?.value  || '';
    const area = document.getElementById('clsc-area')?.value || '';
    showLoading('กำลังโหลดแผน Checklist…');
    try {
        const data = await clFetch({ action:'getPmPlans', factory: fac, area });
        (data.data||[]).forEach(r => { _clPmPlans[r.machineId] = r; });
    } catch(e) {}
    finally { hideLoading(); }
    renderClSchedule();
}
function renderClSchedule() {
    const fac    = document.getElementById('clsc-fac')?.value  || '';
    const area   = document.getElementById('clsc-area')?.value || '';
    const search = (document.getElementById('clsc-search')?.value || '').toLowerCase();
    let machines = clMachinesFor(fac, area);
    if (search) machines = machines.filter(m => (m.id||m.machineId||'').toLowerCase().includes(search) || (m.name||m.machineName||'').toLowerCase().includes(search));
    if (_clScCurrentTab === 'daily') { _clDailyPage = 0; renderClScDaily(machines); }
    else { _clPmPage = 0; renderClScPm(machines); }
}
function clScSetPageSize(tab, val) {
    if (tab === 'daily') { _clDailyPageSize = parseInt(val); _clDailyPage = 0; }
    else                 { _clPmPageSize    = parseInt(val); _clPmPage    = 0; }
    renderClSchedule();
}
function clScGoPage(tab, page) {
    if (tab === 'daily') { _clDailyPage = Math.max(0, Math.min(page, _clDailyTotalPages-1)); }
    else                 { _clPmPage    = Math.max(0, Math.min(page, _clPmTotalPages-1)); }
    const fac    = document.getElementById('clsc-fac')?.value  || '';
    const area   = document.getElementById('clsc-area')?.value || '';
    const search = (document.getElementById('clsc-search')?.value || '').toLowerCase();
    let machines = clMachinesFor(fac, area);
    if (search) machines = machines.filter(m => (m.id||m.machineId||'').toLowerCase().includes(search) || (m.name||m.machineName||'').toLowerCase().includes(search));
    if (tab === 'daily') renderClScDaily(machines);
    else renderClScPm(machines);
}
function clScRenderPagBar(tab, page, totalPages, total, start, pageSize) {
    const pagBar  = document.getElementById(`clsc-${tab}-pagination`);
    const infoEl  = document.getElementById(`clsc-${tab}-page-info`);
    const numsEl  = document.getElementById(`clsc-${tab}-pg-nums`);
    const countEl = document.getElementById(`clsc-${tab}-count`);
    if (countEl) countEl.textContent = pageSize
        ? `แสดง ${total ? start+1 : 0}–${Math.min(start+pageSize, total)} จาก ${total} เครื่อง`
        : `แสดงทั้งหมด ${total} เครื่อง`;
    const showPag = pageSize > 0 && totalPages > 1;
    pagBar.classList.toggle('hidden', !showPag);
    if (!showPag) return;
    infoEl.textContent = `หน้า ${page+1} / ${totalPages}`;
    const atFirst = page === 0, atLast = page === totalPages-1;
    document.getElementById(`clsc-${tab}-pg-first`).disabled = atFirst;
    document.getElementById(`clsc-${tab}-pg-prev`).disabled  = atFirst;
    document.getElementById(`clsc-${tab}-pg-next`).disabled  = atLast;
    document.getElementById(`clsc-${tab}-pg-last`).disabled  = atLast;
    const half = 2;
    let pStart = Math.max(0, page-half), pEnd = Math.min(totalPages-1, page+half);
    if (pEnd-pStart < 4) { if (pStart===0) pEnd = Math.min(totalPages-1,4); else pStart = Math.max(0,pEnd-4); }
    let nums = '';
    for (let p = pStart; p <= pEnd; p++) {
        const active = p === page;
        nums += `<button onclick="clScGoPage('${tab}',${p})" class="px-2.5 py-1.5 text-xs font-bold rounded-lg transition-colors ${active?'text-white':'border border-gray-200 hover:bg-gray-100 text-gray-600'}" ${active?`style="background:var(--mms-red)"`:''}>${p+1}</button>`;
    }
    numsEl.innerHTML = nums;
}
function renderClScDaily(machines) {
    const tbody = document.getElementById('clsc-daily-body');
    if (!tbody) return;
    const total = machines.length;
    const ps    = _clDailyPageSize;
    _clDailyTotalPages = ps ? Math.max(1, Math.ceil(total/ps)) : 1;
    if (_clDailyPage >= _clDailyTotalPages) _clDailyPage = _clDailyTotalPages-1;
    const start   = ps ? _clDailyPage * ps : 0;
    const pageRows = ps ? machines.slice(start, start+ps) : machines;
    clScRenderPagBar('daily', _clDailyPage, _clDailyTotalPages, total, start, ps);
    if (!total) { tbody.innerHTML = '<tr><td colspan="5" class="text-center text-gray-400 py-8">ไม่พบเครื่องจักร</td></tr>'; return; }
    const defCount = _clDailyDefault.length || CL_DAILY_DEFAULT.length;
    tbody.innerHTML = pageRows.map(m => {
        const id     = m.id || m.machineId || m.machine_id || '';
        const custom = clResolveDailyItems(id);
        const canEdit = can('cl.edit');
        return `<tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-2.5 text-xs text-gray-500 font-mono">${id}</td>
            <td class="px-4 py-2.5 text-sm">${m.name||m.machineName||id}</td>
            <td class="px-4 py-2.5 text-center text-sm">${custom ? custom.length : '—'}</td>
            <td class="px-4 py-2.5 text-center text-sm">${defCount}</td>
            <td class="px-4 py-2.5 text-center flex gap-2 justify-center">
                ${canEdit ? `<button onclick="openClItemsEditor('per-machine-daily','${id}')" class="px-2.5 py-1 text-xs font-bold bg-green-50 text-green-600 hover:bg-green-100 rounded-lg transition-colors">✏️ แก้ไข</button>` : ''}
                ${canEdit ? `<button onclick="openClCopyModal('daily','${id}')" class="px-2.5 py-1 text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors">📋 คัดลอก</button>` : ''}
            </td>
        </tr>`;
    }).join('');
}
function renderClScPm(machines) {
    const tbody = document.getElementById('clsc-pm-body');
    if (!tbody) return;
    const total = machines.length;
    const ps    = _clPmPageSize;
    _clPmTotalPages = ps ? Math.max(1, Math.ceil(total/ps)) : 1;
    if (_clPmPage >= _clPmTotalPages) _clPmPage = _clPmTotalPages-1;
    const start    = ps ? _clPmPage * ps : 0;
    const pageRows = ps ? machines.slice(start, start+ps) : machines;
    clScRenderPagBar('pm', _clPmPage, _clPmTotalPages, total, start, ps);
    if (!total) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">ไม่พบเครื่องจักร</td></tr>'; return; }
    // plans already loaded by loadClSchedule()
    const canEdit = can('cl.edit');
    tbody.innerHTML = pageRows.map(m => {
        const id        = m.id || m.machineId || m.machine_id || '';
        const plan      = clGetPmPlan(id);
        const next      = clNextPmDate(id);
        const pmCount   = Array.isArray(plan.pmItems)    ? plan.pmItems.length    : 0;
        const dailyCount= Array.isArray(plan.dailyItems) ? plan.dailyItems.length : 0;
        return `<tr class="border-b border-gray-100 hover:bg-gray-50" data-machine-id="${id}">
            <td class="px-4 py-2.5 text-xs text-gray-500 font-mono">${id}</td>
            <td class="px-4 py-2.5 text-sm">${m.name||m.machineName||id}</td>
            <td class="px-3 py-2.5 text-center text-sm text-gray-700">${plan.pmFreqMonths||3} เดือน</td>
            <td class="px-3 py-2.5 text-center text-sm text-gray-700">${(plan.pmStartMonth||'').slice(0,7)||'—'}</td>
            <td class="px-3 py-2.5 text-center text-sm text-gray-700">${next}</td>
            <td class="px-3 py-2.5 text-center text-xs text-gray-500">
                <span class="text-blue-600">${dailyCount} Daily</span> / <span class="text-green-600">${pmCount} PM</span>
            </td>
            <td class="px-3 py-2.5 text-center">
                <div class="flex gap-2 justify-center">
                    ${canEdit ? `<button onclick="openClItemsEditor('per-machine-pm','${id}')" class="px-2.5 py-1 text-xs font-bold bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-colors">✏️ แก้ไข</button>` : ''}
                    ${canEdit ? `<button onclick="openClCopyModal('pm','${id}')" class="px-2.5 py-1 text-xs font-bold bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-lg transition-colors">📋 คัดลอก</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
}
async function saveAllPmPlans() {
    if (!currentUser.username) { showToast('กรุณาเข้าสู่ระบบก่อน', 'warn'); return; }
    if (!can('cl.edit')) { showToast('ไม่มีสิทธิ์แก้ไขรายการตรวจ', 'warn'); return; }
    const fac  = document.getElementById('clsc-fac')?.value  || '';
    const area = document.getElementById('clsc-area')?.value || '';
    const plans = [];
    document.querySelectorAll('#clsc-pm-body tr[data-machine-id]').forEach(row => {
        const id = row.dataset.machineId;
        const m  = machineMaster.find(x => (x.id||x.machineId||'') === id) || {};
        plans.push({
            machineId:    id,
            machineName:  m.name || m.machineName || '',
            factory:      m.factory || m.fac || fac,
            area:         m.area || area,
            dailyEnabled: true,
            pmFreqMonths: parseInt(row.querySelector('.pm-freq')?.value) || 3,
            pmStartMonth: row.querySelector('.pm-start')?.value || '',
        });
    });
    if (!plans.length) return;
    try {
        const res = await clPost({ action:'savePmPlans', plans });
        if (res.success) {
            showToast('บันทึกแผน PM เรียบร้อย', 'success');
            plans.forEach(p => { Object.assign(_clPmPlans[p.machineId] || (_clPmPlans[p.machineId] = {}), p); });
            renderClSchedule();
        } else showToast('บันทึกล้มเหลว: ' + (res.error||''), 'error');
    } catch(e) { showToast('เชื่อมต่อ GAS ล้มเหลว', 'error'); }
}

// ---- ITEMS EDITOR (3 modes) ----
async function openClItemsEditor(mode, machineId) {
    if (!can('cl.edit')) { showToast('ไม่มีสิทธิ์แก้ไขรายการตรวจ', 'warn'); return; }
    _clMcdeMode      = mode;
    _clMcdeMachineId = machineId || '';
    const machine    = machineId ? machineMaster.find(m => (m.id||m.machineId||m.machine_id||'') === machineId) : null;
    const machineName = machine ? (machine.name||machine.machineName||machineId) : '';
    const hdrEl  = document.getElementById('mcie-header');
    const titleEl = document.getElementById('mcie-title');
    const subEl   = document.getElementById('mcie-subtitle');
    const flatView = document.getElementById('mcie-flat-view');
    const treeView = document.getElementById('mcie-tree-view');
    const refSec   = document.getElementById('mcie-ref-section');
    const flatLbl  = document.getElementById('mcie-flat-label');
    document.getElementById('mcie-editor-name').value = '';

    if (mode === 'default-daily') {
        hdrEl.className = 'px-6 py-4 flex-shrink-0 flex justify-between items-center bg-green-700';
        titleEl.textContent = '⚙️ ตั้งค่ารายการ Default รายวัน';
        subEl.textContent = 'รายการนี้ใช้กับทุกเครื่องจักรที่ไม่มีรายการ Custom';
        flatView.classList.remove('hidden'); treeView.classList.add('hidden');
        refSec.classList.add('hidden');
        flatLbl.textContent = 'รายการ Default รายวัน';
        // load from DB
        try {
            const d = await clFetch({ action:'getDailyDefault' });
            _clDailyDefault = (d.data?.items || []);
        } catch(e) {}
        mcieFlatRender(_clDailyDefault.length ? _clDailyDefault : CL_DAILY_DEFAULT.slice());

    } else if (mode === 'per-machine-daily') {
        hdrEl.className = 'px-6 py-4 flex-shrink-0 flex justify-between items-center bg-green-700';
        titleEl.textContent = '✏️ แก้ไขรายการตรวจสอบรายวัน';
        subEl.textContent = machineName + ' (' + machineId + ')';
        flatView.classList.remove('hidden'); treeView.classList.add('hidden');
        refSec.classList.remove('hidden');
        flatLbl.textContent = 'รายการ Custom (เฉพาะเครื่องนี้)';
        // show default as reference
        const defItems = _clDailyDefault.length ? _clDailyDefault : CL_DAILY_DEFAULT;
        document.getElementById('mcie-ref-items').innerHTML = defItems.map(i => `<div class="px-2 py-1 bg-gray-50 rounded text-xs">${i.label}</div>`).join('');
        const custom = clGetDailyItems(machineId) || [];
        mcieFlatRender(custom);
        document.getElementById('mcie-daily-merge').checked = !!(_clPmPlans[machineId]?.dailyMergeDefault);
        document.getElementById('mcie-daily-merge-wrap').classList.remove('hidden');

    } else if (mode === 'per-machine-pm') {
        hdrEl.className = 'px-6 py-4 flex-shrink-0 flex justify-between items-center bg-blue-700';
        titleEl.textContent = '🔧 แก้ไขรายการตรวจสอบ PM';
        subEl.textContent = machineName + ' (' + machineId + ')';
        flatView.classList.add('hidden'); treeView.classList.remove('hidden');
        const plan = _clPmPlans[machineId] || {};
        _clPmTree = Array.isArray(plan.pmItems) && plan.pmItems.length ? plan.pmItems : [_newClPmNode()];
        renderClPmTree();
        // populate PM plan settings
        document.getElementById('mcie-pm-freq').value  = plan.pmFreqMonths || 3;
        document.getElementById('mcie-pm-start').value = String(plan.pmStartMonth || '').slice(0, 7);
        document.getElementById('mcie-pm-settings').classList.remove('hidden');
    }
    if (mode !== 'per-machine-pm') document.getElementById('mcie-pm-settings').classList.add('hidden');
    if (mode !== 'per-machine-daily') document.getElementById('mcie-daily-merge-wrap').classList.add('hidden');
    document.getElementById('modal-cl-items-editor').classList.remove('hidden');
}
function mcieFlatRender(items) {
    const container = document.getElementById('mcie-flat-items');
    container.innerHTML = items.map((item, idx) => `
        <div class="flex gap-2 items-center">
            <input type="text" value="${(item.label||'').replace(/"/g,'&quot;')}" data-idx="${idx}" class="mcie-flat-input flex-1 border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-green-400">
            <button onclick="mcieFlatRemove(${idx})" class="text-red-400 hover:text-red-600 text-lg font-bold leading-none">✕</button>
        </div>`).join('');
}
function mcieFlatAddItem() {
    const inputs = [...document.querySelectorAll('.mcie-flat-input')];
    const items  = inputs.map((inp, i) => ({ id: 'c' + i, label: inp.value }));
    items.push({ id: 'c' + items.length, label: '' });
    mcieFlatRender(items);
    document.querySelector('.mcie-flat-input:last-of-type')?.focus();
}
function mcieFlatRemove(idx) {
    const inputs = [...document.querySelectorAll('.mcie-flat-input')];
    const items  = inputs.map((inp, i) => ({ id: 'c' + i, label: inp.value })).filter((_,i) => i !== idx);
    mcieFlatRender(items);
}
function mcieFlatGetItems() {
    return [...document.querySelectorAll('.mcie-flat-input')]
        .map((inp, i) => ({ id: 'c' + i, label: inp.value.trim() }))
        .filter(i => i.label);
}

// PM tree (simplified Why-Why without images/coloring)
let _clPmTree = [];
function _newClPmNode() { return { label: '', children: [] }; }
function addClPmRoot()        { _clPmTree.push(_newClPmNode()); renderClPmTree(); }
function addClPmChild(node)   { node.children.push(_newClPmNode()); renderClPmTree(); }
function removeClPmNode(node) {
    const rm = list => { const i = list.indexOf(node); if (i>=0){list.splice(i,1);return true;} return list.some(n=>rm(n.children)); };
    rm(_clPmTree);
    if (!_clPmTree.length) _clPmTree.push(_newClPmNode());
    renderClPmTree();
}
function renderClPmTree() {
    const c = document.getElementById('mcie-pm-tree');
    if (!c) return;
    c.innerHTML = '';
    _clPmTree.forEach((node, i) => c.appendChild(_renderClPmNode(node, String(i+1))));
}
function _renderClPmNode(node, label) {
    const container = document.createElement('div');
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 mb-1.5';
    row.innerHTML = `
        <span class="shrink-0 text-xs font-bold px-2 py-1 rounded bg-blue-100 text-blue-700 border border-blue-200" style="white-space:nowrap">${label}</span>
        <input type="text" class="cl-pm-node-input flex-1 min-w-0 border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-blue-400" placeholder="ระบุหัวข้อ / รายการ...">
        <button type="button" onclick="addClPmChild(this.__node)" title="เพิ่มรายการย่อย" class="shrink-0 w-7 h-7 flex items-center justify-center rounded bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 font-bold text-base leading-none">+</button>
        <button type="button" onclick="removeClPmNode(this.__node)" title="ลบ" class="shrink-0 w-7 h-7 flex items-center justify-center rounded bg-red-50 hover:bg-red-100 text-red-500 border border-red-200">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>
        </button>`;
    const inp = row.querySelector('.cl-pm-node-input');
    inp.value = node.label || '';
    inp.addEventListener('input', e => { node.label = e.target.value; });
    row.querySelector('[title="เพิ่มรายการย่อย"]').__node = node;
    row.querySelector('[title="ลบ"]').__node = node;
    container.appendChild(row);
    if (node.children.length) {
        const childWrap = document.createElement('div');
        childWrap.style.cssText = 'margin-left:16px;padding-left:12px;border-left:2px dashed #bfdbfe';
        node.children.forEach((ch, j) => childWrap.appendChild(_renderClPmNode(ch, label + '.' + (j+1))));
        container.appendChild(childWrap);
    }
    return container;
}
function mcieAddPmRoot() { addClPmRoot(); }

async function saveClItemsEditor() {
    const editorName = currentUser.name;
    if (!editorName) { showToast('กรุณาเข้าสู่ระบบก่อนแก้ไข', 'warn'); openLogin(); return; }
    if (!can('cl.edit')) { showToast('ไม่มีสิทธิ์แก้ไขรายการตรวจ', 'warn'); return; }
    const mode      = _clMcdeMode;
    const machineId = _clMcdeMachineId;

    try {
        if (mode === 'default-daily') {
            const items = mcieFlatGetItems();
            const res = await clPost({ action:'saveDailyDefault', items, editedBy: editorName });
            if (!res.success) { showToast('บันทึกล้มเหลว: ' + (res.error||''), 'error'); return; }
            _clDailyDefault = items;
            showToast('บันทึก Default รายวันเรียบร้อย', 'success');

        } else if (mode === 'per-machine-daily') {
            const items = mcieFlatGetItems();
            const merge = document.getElementById('mcie-daily-merge')?.checked || false;
            const m  = machineMaster.find(x => (x.id||x.machineId||'') === machineId) || {};
            const res = await clPost({ action:'saveMachineItems', type:'daily', machineId, machineName: m.name||m.machineName||'', factory: m.factory||'', area: m.area||'', items, dailyMergeDefault: merge, editedBy: editorName });
            if (!res.success) { showToast('บันทึกล้มเหลว: ' + (res.error||''), 'error'); return; }
            if (!_clPmPlans[machineId]) _clPmPlans[machineId] = {};
            _clPmPlans[machineId].dailyItems = items;
            _clPmPlans[machineId].dailyMergeDefault = merge;
            showToast('บันทึกรายการ Daily เรียบร้อย', 'success');

        } else if (mode === 'per-machine-pm') {
            const items        = _clPmTree;
            const pmFreqMonths = parseInt(document.getElementById('mcie-pm-freq')?.value) || 3;
            const pmStartMonth = document.getElementById('mcie-pm-start')?.value || '';
            const m  = machineMaster.find(x => (x.id||x.machineId||'') === machineId) || {};
            // save plan settings (freq + start)
            const planRes = await clPost({ action:'savePmPlans', plans: [{
                machineId, machineName: m.name||m.machineName||'',
                factory: m.factory||'', area: m.area||'',
                dailyEnabled: true, pmFreqMonths, pmStartMonth,
            }]});
            if (!planRes.success) { showToast('บันทึกแผน PM ล้มเหลว: ' + (planRes.error||''), 'error'); return; }
            // save PM items
            const res = await clPost({ action:'saveMachineItems', type:'pm', machineId, machineName: m.name||m.machineName||'', factory: m.factory||'', area: m.area||'', items, editedBy: editorName });
            if (!res.success) { showToast('บันทึกรายการล้มเหลว: ' + (res.error||''), 'error'); return; }
            if (!_clPmPlans[machineId]) _clPmPlans[machineId] = {};
            Object.assign(_clPmPlans[machineId], { pmItems: items, pmFreqMonths, pmStartMonth });
            showToast('บันทึกรายการ PM เรียบร้อย', 'success');
        }
    } catch(e) { showToast('เชื่อมต่อ GAS ล้มเหลว', 'error'); return; }

    document.getElementById('modal-cl-items-editor').classList.add('hidden');
    loadClSchedule();
}

// ---- BD KIOSK (legacy stub — ส่งต่อเข้า scan flow) ----
async function enterBdKiosk(machineId, token) {
    if (typeof enterScan === 'function') enterScan(machineId, 'bd');
}

// ---- COPY ITEMS MODAL (Phase F) ----
let _mccAllMachines = []; // machines in current scope for copy modal

function openClCopyModal(type, sourceId) {
    if (!can('cl.edit')) { showToast('ไม่มีสิทธิ์แก้ไขรายการตรวจ', 'warn'); return; }
    _clCopyType     = type;
    _clCopySourceId = sourceId;
    const fac  = document.getElementById('clsc-fac')?.value  || '';
    const area = document.getElementById('clsc-area')?.value || '';
    const sourceM = machineMaster.find(m => (m.id||m.machineId||'') === sourceId) || {};
    const sourceName = sourceM.name || sourceM.machineName || sourceId;
    document.getElementById('mcc-title').textContent    = `📋 Copy ${type === 'pm' ? 'PM' : 'Daily'} Items`;
    document.getElementById('mcc-subtitle').textContent = `จาก: ${sourceName} (${sourceId})`;
    document.getElementById('mcc-search').value         = '';
    document.getElementById('mcc-editor-name').value    = '';
    document.getElementById('mcc-select-all').checked   = false;
    _mccAllMachines = clMachinesFor(fac, area).filter(m => (m.id||m.machineId||m.machine_id||'') !== sourceId);
    mccRenderList(_mccAllMachines);
    document.getElementById('modal-cl-copy').classList.remove('hidden');
}
function mccRenderList(machines) {
    const list = document.getElementById('mcc-machine-list');
    const count = document.getElementById('mcc-count');
    count.textContent = machines.length + ' เครื่อง';
    list.innerHTML = machines.map(m => {
        const id   = m.id || m.machineId || m.machine_id || '';
        const name = m.name || m.machineName || id;
        return `<label class="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" class="mcc-checkbox w-4 h-4" value="${id}">
            <span class="text-xs font-mono text-gray-500 shrink-0">${id}</span>
            <span class="text-sm">${name}</span>
        </label>`;
    }).join('') || '<p class="text-center text-gray-400 py-4 text-sm">ไม่พบเครื่องจักร</p>';
}
function mccFilterMachines() {
    const q = (document.getElementById('mcc-search')?.value || '').toLowerCase();
    const filtered = q
        ? _mccAllMachines.filter(m => (m.id||m.machineId||'').toLowerCase().includes(q) || (m.name||m.machineName||'').toLowerCase().includes(q))
        : _mccAllMachines;
    mccRenderList(filtered);
}
function mccToggleAll(checked) {
    document.querySelectorAll('.mcc-checkbox').forEach(cb => { cb.checked = checked; });
}
async function saveClCopy() {
    const editorName = currentUser.name;
    if (!editorName) { showToast('กรุณาเข้าสู่ระบบก่อนดำเนินการ', 'warn'); openLogin(); return; }
    const targetIds = [...document.querySelectorAll('.mcc-checkbox:checked')].map(cb => cb.value);
    if (!targetIds.length) { showToast('กรุณาเลือกเครื่องจักรปลายทางอย่างน้อย 1 เครื่อง', 'warn'); return; }
    try {
        const res = await clPost({ action:'copyMachineItems', type: _clCopyType, sourceId: _clCopySourceId, targetIds, editedBy: editorName });
        if (res.success) {
            showToast(`📋 Copy สำเร็จ ${res.count} เครื่อง`, 'success');
            // update local cache
            const srcPlan = _clPmPlans[_clCopySourceId] || {};
            targetIds.forEach(tid => {
                if (!_clPmPlans[tid]) _clPmPlans[tid] = {};
                if (_clCopyType === 'daily') {
                    _clPmPlans[tid].dailyItems = srcPlan.dailyItems || [];
                    _clPmPlans[tid].dailyMergeDefault = srcPlan.dailyMergeDefault || false;
                } else _clPmPlans[tid].pmItems = srcPlan.pmItems || [];
            });
            document.getElementById('modal-cl-copy').classList.add('hidden');
            loadClSchedule();
        } else {
            showToast('Copy ล้มเหลว: ' + (res.error||''), 'error');
        }
    } catch(e) { showToast('เชื่อมต่อ GAS ล้มเหลว', 'error'); }
}
