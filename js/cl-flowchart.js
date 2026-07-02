// ============================================================
// CHECKLIST: FLOWCHART รายเครื่องจักร
// node เครื่องจักร → 3 function (Checklist รายวัน / PM Inspection / PM Replacement)
// คลิก function = toggle ขยาย (ค้างได้หลายอันพร้อมกัน) เห็นทุกรายการเป็น node ย่อย
// ============================================================
let _clfwMachineId = '';
let _clfwExpanded  = { daily:false, pm:false, pmrep:false };
let _clfwResizeBound = false;

async function initClFlow() {
    if (!machineMaster.length) await loadMachineMaster();
    if (!_clDailyDefault.length) {
        try { const d = await clFetch({ action:'getDailyDefault' }); if (d.success && d.data?.items?.length) _clDailyDefault = d.data.items; } catch (e) {}
    }
    if (!Object.keys(_pmrByMachine).length) await pmrLoadAll();
    if (typeof SPARE_CACHE !== 'undefined' && !SPARE_CACHE.length && typeof loadSpareCache === 'function') await loadSpareCache();
    _clfwBindResize();
    const m = _clfwMachineId ? machineMaster.find(x => (x.id||x.machineId||'') === _clfwMachineId) : null;
    clFillFacSelect('clfw-fac', m ? m.factory : '');
    clFillAreaSelect('clfw-area', m ? m.factory : '', m ? m.area : '');
    clFlowFillMachineSelect();
}

// ---- เข้าถึงจากปุ่มลัด 🔀 ในตารางหน้ารายละเอียดตรวจสอบ ----
function clFlowOpen(machineId) {
    _clfwMachineId = machineId;
    _clfwExpanded  = { daily:false, pm:false, pmrep:false };
    switchTab('cl-flow');
}

function clFlowFacChange() {
    const fac = document.getElementById('clfw-fac')?.value || '';
    clFillAreaSelect('clfw-area', fac, '');
    clFlowFillMachineSelect();
}
function clFlowAreaChange() { clFlowFillMachineSelect(); }

function clFlowFillMachineSelect() {
    const fac  = document.getElementById('clfw-fac')?.value  || '';
    const area = document.getElementById('clfw-area')?.value || '';
    const sel  = document.getElementById('clfw-machine');
    if (!sel) return;
    const machines = clMachinesFor(fac, area);
    const keep = _clfwMachineId && machines.some(m => (m.id||m.machineId||'') === _clfwMachineId) ? _clfwMachineId : '';
    sel.innerHTML = '<option value="">-- เลือกเครื่องจักร --</option>' + machines.map(m => {
        const id = m.id || m.machineId || m.machine_id || '';
        return `<option value="${id}" ${id===keep?'selected':''}>${id} — ${String(m.name||m.machineName||'').replace(/</g,'&lt;')}</option>`;
    }).join('');
    clFlowMachineChange();
}

async function clFlowMachineChange() {
    const id = document.getElementById('clfw-machine')?.value || '';
    _clfwMachineId = id;
    if (!id) { clFlowRender(); return; }
    const m = machineMaster.find(x => (x.id||x.machineId||'') === id);
    if (m && !_clPmPlans[id]) {
        try {
            const d = await clFetch({ action:'getPmPlans', factory: m.factory||'', area: m.area||'' });
            (d.data||[]).forEach(r => { _clPmPlans[r.machineId] = r; });
        } catch (e) {}
    }
    clFlowRender();
}

async function clFlowReload() {
    _pmrByMachine = {};
    await pmrLoadAll();
    const id = _clfwMachineId;
    if (id) {
        const m = machineMaster.find(x => (x.id||x.machineId||'') === id);
        if (m) {
            try {
                const d = await clFetch({ action:'getPmPlans', factory: m.factory||'', area: m.area||'' });
                (d.data||[]).forEach(r => { _clPmPlans[r.machineId] = r; });
            } catch (e) {}
        }
    }
    clFlowRender();
}

function clFlowToggle(key) { _clfwExpanded[key] = !_clfwExpanded[key]; clFlowRender(); }
function clFlowActive() { return !!document.getElementById('panel-cl-flow')?.classList.contains('active') && !!_clfwMachineId; }
function clFlowRefreshIfActive() { if (clFlowActive()) clFlowRender(); }

// PM Inspection: pmItems เป็น tree (เหมือน Why-Why) → flatten เอาเฉพาะ leaf พร้อมเลขลำดับ (ลอก clfGetItems)
function _clfwFlattenPmItems(pmItems) {
    const items = [];
    const walk = (node, prefix) => {
        if (!node.children || !node.children.length) items.push(prefix + ' ' + (node.label || node.text || ''));
        else node.children.forEach((ch, j) => walk(ch, prefix + '.' + (j+1)));
    };
    (pmItems || []).forEach((n, i) => walk(n, String(i+1)));
    return items;
}

function _clfwFuncCard(key, icon, label, badgeHtml, editOnclick, canEdit) {
    const open = _clfwExpanded[key];
    return `<div id="clfw-node-${key}" onclick="clFlowToggle('${key}')" class="bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm cursor-pointer hover:border-teal-400 transition-colors" style="width:220px">
        <div class="flex items-center justify-between gap-2">
            <div class="font-bold text-sm text-gray-800">${icon} ${label}</div>
            <span class="text-gray-400 text-xs">${open ? '▾' : '▸'}</span>
        </div>
        <div class="text-xs text-gray-500 mt-1">${badgeHtml}</div>
        ${canEdit ? `<button onclick="event.stopPropagation();${editOnclick}" class="mt-2 text-xs font-bold text-blue-600 hover:text-blue-800">✏️ แก้ไข</button>` : ''}
    </div>`;
}
function _clfwDetailGroup(key, title, itemsHtml) {
    if (!_clfwExpanded[key]) return '';
    return `<div id="clfw-detail-${key}" class="bg-gray-50 border border-gray-200 rounded-xl p-3" style="width:280px">
        <div class="text-xs font-bold text-gray-500 mb-2">${title}</div>
        <div class="space-y-1.5">${itemsHtml}</div>
    </div>`;
}
const _CLFW_EMPTY_NODE = '<div class="bg-white border border-dashed border-gray-300 rounded-lg px-2.5 py-2 text-xs text-gray-400 text-center">ยังไม่มีรายการ — กด ✏️ เพื่อตั้งค่า</div>';

function clFlowRender() {
    const wrap = document.getElementById('clfw-nodes');
    if (!wrap) return;
    const id = _clfwMachineId;
    if (!id) {
        wrap.innerHTML = '<p class="text-gray-400 text-sm py-12 text-center w-full">เลือกเครื่องจักรเพื่อดูผัง</p>';
        clFlowDrawLines();
        return;
    }
    const m = machineMaster.find(x => (x.id||x.machineId||'') === id) || {};
    const machineName = String(m.name||m.machineName||id).replace(/</g,'&lt;');

    // ---- ข้อมูล 3 กิ่ง ----
    const dailyItems   = clResolveDailyItems(id);
    const dailyIsCustom = Array.isArray(_clPmPlans[id]?.dailyItems) && _clPmPlans[id].dailyItems.length > 0;

    const pmPlan  = clGetPmPlan(id);
    const pmLeafItems = _clfwFlattenPmItems(pmPlan.pmItems);
    const pmFreq  = pmPlan.pmFreqMonths || 3;
    const pmStart = String(pmPlan.pmStartMonth || pmPlan.pmStartDate || '').slice(0,7);
    const pmNext  = clNextPmDate(id);

    const pmrPlans   = _pmrByMachine[id] || [];
    const pmrOverdue = pmrPlans.filter(p => p.status === 'overdue').length;
    const pmrSoon    = pmrPlans.filter(p => p.status === 'soon').length;

    const canEditCl  = can('cl.edit');
    const canEditPmr = can('cl.pm');

    // ---- คอลัมน์ 1: เครื่องจักร ----
    const machineHtml = `<div id="clfw-node-machine" class="flex-shrink-0 bg-white border-2 border-gray-800 rounded-xl px-4 py-3 shadow-sm" style="width:200px">
        <div class="font-bold text-sm text-gray-900">${machineName}</div>
        <div class="text-xs text-gray-400 font-mono mt-0.5">${id}</div>
    </div>`;

    // ---- คอลัมน์ 2: 3 function ----
    const dailyBadge = `${dailyItems.length} รายการ · <span class="${dailyIsCustom?'text-green-600':'text-gray-400'}">${dailyIsCustom?'Custom':'Default'}</span>`;
    const pmBadge     = `ทุก ${pmFreq} เดือน · ${pmLeafItems.length} รายการ`;
    let pmrBadge = `${pmrPlans.length} อะไหล่`;
    if (pmrOverdue) pmrBadge += ` · <span class="text-red-600 font-bold">🔴 ${pmrOverdue} เกิน</span>`;
    else if (pmrSoon) pmrBadge += ` · <span class="text-orange-500 font-bold">🟠 ${pmrSoon} ใกล้</span>`;

    const funcHtml = `<div class="flex-shrink-0 flex flex-col gap-6">
        ${_clfwFuncCard('daily', '📋', 'Checklist รายวัน', dailyBadge, `openClItemsEditor('per-machine-daily','${id}')`, canEditCl)}
        ${_clfwFuncCard('pm', '🔧', 'PM Inspection', pmBadge, `openClItemsEditor('per-machine-pm','${id}')`, canEditCl)}
        ${_clfwFuncCard('pmrep', '🔩', 'PM Replacement', pmrBadge, `pmrOpenBatch('${id}')`, canEditPmr)}
    </div>`;

    // ---- คอลัมน์ 3: detail (เฉพาะ function ที่ expand) ----
    const dailyItemsHtml = dailyItems.length
        ? dailyItems.map((it, i) => `<div class="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700">${i+1}. ${String(it.label||it.text||'').replace(/</g,'&lt;')}</div>`).join('')
        : _CLFW_EMPTY_NODE;

    const pmHeaderHtml = `<div class="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700 mb-1.5">PM ทุก ${pmFreq} เดือน${pmStart?` · เริ่ม ${pmStart}`:''} · ถัดไป ${pmNext}</div>`;
    const pmItemsHtml  = pmLeafItems.length
        ? pmLeafItems.map(label => `<div class="bg-white border border-gray-200 rounded-lg px-2.5 py-1.5 text-xs text-gray-700">${String(label).replace(/</g,'&lt;')}</div>`).join('')
        : _CLFW_EMPTY_NODE;

    const pmrItemsHtml = pmrPlans.length
        ? pmrPlans.map(p => {
            const color = PMR_STATUS_COLOR[p.status] || '#94a3b8';
            const lbl   = (p.partNo ? '['+p.partNo+'] ' : '') + String(p.partLabel||'').replace(/</g,'&lt;');
            const unit  = PMR_UNIT_LABEL[p.cycleUnit] || p.cycleUnit;
            return `<div class="bg-white border-l-4 rounded-lg px-2.5 py-1.5 text-xs text-gray-700" style="border-left-color:${color}">${lbl}<br><span class="text-gray-400">ทุก ${p.cycleValue} ${unit} · ครบกำหนด ${p.nextDue||'—'}</span></div>`;
        }).join('')
        : _CLFW_EMPTY_NODE;

    const detailHtml = `<div class="flex-shrink-0 flex flex-col gap-6">
        ${_clfwDetailGroup('daily', '📋 รายการตรวจรายวัน', dailyItemsHtml)}
        ${_clfwDetailGroup('pm', '🔧 รายการตรวจ PM Inspection', pmHeaderHtml + pmItemsHtml)}
        ${_clfwDetailGroup('pmrep', '🔩 รายการอะไหล่', pmrItemsHtml)}
    </div>`;

    wrap.innerHTML = machineHtml + funcHtml + detailHtml;
    clFlowDrawLines();
}

// ---- เส้นเชื่อม SVG: machine→function (เสมอ) + function→detail (เฉพาะที่ expand) ----
function clFlowDrawLines() {
    const canvas = document.getElementById('clfw-canvas');
    const svg    = document.getElementById('clfw-lines');
    if (!canvas || !svg) return;
    svg.innerHTML = '';
    svg.setAttribute('width', canvas.scrollWidth);
    svg.setAttribute('height', canvas.scrollHeight);
    const cRect = canvas.getBoundingClientRect();
    const NS = 'http://www.w3.org/2000/svg';
    const addPath = (fromEl, toEl) => {
        if (!fromEl || !toEl) return;
        const fRect = fromEl.getBoundingClientRect();
        const tRect = toEl.getBoundingClientRect();
        const x1 = fRect.right - cRect.left;
        const y1 = fRect.top - cRect.top + fRect.height/2;
        const x2 = tRect.left - cRect.left;
        const y2 = tRect.top - cRect.top + tRect.height/2;
        const midX = (x1 + x2) / 2;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M${x1},${y1} H${midX} V${y2} H${x2}`);
        path.setAttribute('stroke', '#cbd5e1');
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', '1.5');
        svg.appendChild(path);
    };
    const machineEl = document.getElementById('clfw-node-machine');
    ['daily','pm','pmrep'].forEach(key => {
        addPath(machineEl, document.getElementById('clfw-node-' + key));
        if (_clfwExpanded[key]) addPath(document.getElementById('clfw-node-' + key), document.getElementById('clfw-detail-' + key));
    });
}
function _clfwBindResize() {
    if (_clfwResizeBound) return;
    _clfwResizeBound = true;
    let t;
    window.addEventListener('resize', () => {
        clearTimeout(t);
        t = setTimeout(() => { if (clFlowActive()) clFlowDrawLines(); }, 150);
    });
}
