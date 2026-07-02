// ============================================================
// CHECKLIST: FLOWCHART รายเครื่องจักร
// node เครื่องจักร → 3 function (Checklist รายวัน / PM Inspection / PM Replacement)
// คลิก function = toggle ขยาย (ค้างได้หลายอันพร้อมกัน) เห็นทุกรายการเป็น node ย่อย
// แก้ไข inline ได้ทีละกิ่ง — โหมดแก้ครั้งเดียว บันทึกทีเดียว (draft แยกจาก cache จริง)
// ============================================================
let _clfwMachineId = '';
let _clfwExpanded  = { daily:false, pm:false, pmrep:false };
let _clfwEditing   = { daily:false, pm:false, pmrep:false };
let _clfwDraft      = null;
let _clfwResizeBound = false;

// bg = การ์ด function/กลุ่ม detail (โทนเข้มขึ้นหน่อย), itemBg = การ์ด item ย่อยข้างใน (อ่อนกว่า bg แยกชั้นชัดเจน)
const CLFW_BRANCH = {
    daily: { color:'#16a34a', bg:'#dcfce7', itemBg:'#f0fdf4', icon:'📋', label:'Checklist รายวัน' },
    pm:    { color:'#2563eb', bg:'#dbeafe', itemBg:'#eff6ff', icon:'🔧', label:'PM Inspection' },
    pmrep: { color:'#0d9488', bg:'#ccfbf1', itemBg:'#f0fdfa', icon:'🔩', label:'PM Replacement' },
};
const CLFW_LANE = { daily:0, pm:1, pmrep:2 };
const _CLFW_EMPTY_NODE = '<div class="border border-dashed border-gray-300 rounded-lg px-2.5 py-2 text-xs text-gray-400 text-center" style="background:#f8fafc">ยังไม่มีรายการ — กด ✏️ เพื่อตั้งค่า</div>';

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

// ---- เข้าถึงจากปุ่มลัด 🔀 ในตารางหน้ารายละเอียดตรวจสอบ (silent reset — ผู้ใช้ออกจากหน้าไปแล้ว) ----
function clFlowOpen(machineId) {
    _clfwMachineId = machineId;
    _clfwExpanded  = { daily:false, pm:false, pmrep:false };
    _clfwEditing   = { daily:false, pm:false, pmrep:false };
    _clfwDraft     = null;
    switchTab('cl-flow');
}

// ---- กันทิ้ง draft เงียบๆ ระหว่างแก้ไขอยู่ในหน้าเดียวกัน ----
function _clfwConfirmDiscardIfEditing() {
    const anyEditing = Object.values(_clfwEditing).some(Boolean);
    if (!anyEditing) return true;
    if (!confirm('กำลังแก้ไขอยู่ — การดำเนินการนี้จะทิ้งการแก้ไขที่ยังไม่บันทึก ดำเนินการต่อ?')) return false;
    _clfwEditing = { daily:false, pm:false, pmrep:false };
    _clfwDraft = null;
    return true;
}

function clFlowFacChange() {
    if (!_clfwConfirmDiscardIfEditing()) return;
    const fac = document.getElementById('clfw-fac')?.value || '';
    clFillAreaSelect('clfw-area', fac, '');
    const inp = document.getElementById('clfw-machine-input'); if (inp) inp.value = '';
    _clfwMachineId = '';
    clFlowFillMachineSelect();
}
function clFlowAreaChange() {
    if (!_clfwConfirmDiscardIfEditing()) return;
    const inp = document.getElementById('clfw-machine-input'); if (inp) inp.value = '';
    _clfwMachineId = '';
    clFlowFillMachineSelect();
}

function clFlowFillMachineSelect() {
    const fac  = document.getElementById('clfw-fac')?.value  || '';
    const area = document.getElementById('clfw-area')?.value || '';
    const dl   = document.getElementById('clfw-machine-hint');
    if (!dl) return;
    const machines = clMachinesFor(fac, area);
    dl.innerHTML = machines.map(m => {
        const id   = m.id || m.machineId || m.machine_id || '';
        const name = String(m.name||m.machineName||'').replace(/"/g,'&quot;');
        return `<option value="${id} — ${name}">`;
    }).join('');
    if (_clfwMachineId) {
        const m = machines.find(x => (x.id||x.machineId||'') === _clfwMachineId);
        const inp = document.getElementById('clfw-machine-input');
        if (m && inp) inp.value = `${_clfwMachineId} — ${m.name||m.machineName||''}`;
    }
    clFlowMachineChange();
}

// ---- typeahead: จับ exact match "id — name" จาก datalist ----
function clFlowMachinePick(inp) {
    const val = inp.value;
    const m = machineMaster.find(x => {
        const id = x.id||x.machineId||x.machine_id||'';
        return `${id} — ${x.name||x.machineName||''}` === val;
    });
    if (m) clFlowMachineChange(m.id||m.machineId||m.machine_id||'');
}

async function clFlowMachineChange(id) {
    if (id !== undefined && id !== _clfwMachineId) {
        if (!_clfwConfirmDiscardIfEditing()) return;
    }
    if (id !== undefined) _clfwMachineId = id;
    const mid = _clfwMachineId;
    _clfwExpanded = { daily:false, pm:false, pmrep:false };
    if (!mid) { clFlowRender(); return; }
    const m = machineMaster.find(x => (x.id||x.machineId||'') === mid);
    if (m && !_clPmPlans[mid]) {
        try {
            const d = await clFetch({ action:'getPmPlans', factory: m.factory||'', area: m.area||'' });
            (d.data||[]).forEach(r => { _clPmPlans[r.machineId] = r; });
        } catch (e) {}
    }
    clFlowRender();
}

async function clFlowReload() {
    if (!_clfwConfirmDiscardIfEditing()) return;
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

function clFlowToggle(key) {
    if (!_clfwConfirmDiscardIfEditing()) return;
    _clfwExpanded[key] = !_clfwExpanded[key];
    clFlowRender();
}
function clFlowActive() { return !!document.getElementById('panel-cl-flow')?.classList.contains('active') && !!_clfwMachineId; }
function clFlowRefreshIfActive() { if (clFlowActive()) clFlowRender(); }

// PM Inspection: pmItems เป็น tree (เหมือน Why-Why) → flatten เอาเฉพาะ leaf พร้อม path (สำหรับเขียนกลับตอนแก้ไข)
function _clfwFlattenPmItems(pmItems) {
    const items = [];
    const walk = (node, prefix, path) => {
        if (!node.children || !node.children.length) items.push({ prefix, rawLabel: node.label || node.text || '', path });
        else node.children.forEach((ch, j) => walk(ch, prefix + '.' + (j+1), [...path, j]));
    };
    (pmItems || []).forEach((n, i) => walk(n, String(i+1), [i]));
    return items;
}
function _clfwGetNodeByPath(tree, path) {
    let node = { children: tree };
    for (const idx of path) node = node.children[idx];
    return node;
}

function _clfwFuncCard(key, badgeHtml, editOnclick, canEdit) {
    const br = CLFW_BRANCH[key];
    const open = _clfwExpanded[key];
    return `<div id="clfw-node-${key}" onclick="clFlowToggle('${key}')" class="rounded-xl px-4 py-3 shadow-sm cursor-pointer hover:shadow-md transition-shadow" style="width:220px;background:${br.bg};border-left:4px solid ${br.color}">
        <div class="flex items-center justify-between gap-2">
            <div class="font-bold text-sm" style="color:${br.color}">${br.icon} ${br.label}</div>
            <span class="text-gray-400 text-xs">${open ? '▾' : '▸'}</span>
        </div>
        <div class="text-xs text-gray-500 mt-1">${badgeHtml}</div>
        ${canEdit ? `<button onclick="event.stopPropagation();${editOnclick}" class="mt-2 text-xs font-bold text-blue-600 hover:text-blue-800">✏️ แก้ไข</button>` : ''}
    </div>`;
}
function _clfwDetailGroup(key, bodyHtml, editBtnHtml) {
    if (!_clfwExpanded[key]) return '';
    const br = CLFW_BRANCH[key];
    return `<div id="clfw-detail-${key}" class="rounded-xl p-3" style="width:280px;background:${br.bg};border:1px solid ${br.color}55">
        <div class="flex items-center justify-between gap-2 mb-2">
            <div class="text-xs font-bold" style="color:${br.color}">${br.icon} ${br.label}</div>
            ${editBtnHtml}
        </div>
        <div class="space-y-1.5">${bodyHtml}</div>
    </div>`;
}
function _clfwEditBtnHtml(anyEditing, onclickFn) {
    return anyEditing
        ? `<button disabled class="text-[11px] font-bold text-gray-300 cursor-not-allowed">✏️ แก้ไขในผัง</button>`
        : `<button onclick="${onclickFn}" class="text-[11px] font-bold text-gray-500 hover:text-gray-700 underline">✏️ แก้ไขในผัง</button>`;
}

function clFlowRender() {
    const wrap = document.getElementById('clfw-nodes');
    if (!wrap) return;
    const id = _clfwMachineId;
    if (!id) {
        wrap.innerHTML = '<p class="text-slate-500 text-sm py-12 text-center w-full">เลือกเครื่องจักรเพื่อดูผัง</p>';
        clFlowDrawLines();
        return;
    }
    const m = machineMaster.find(x => (x.id||x.machineId||'') === id) || {};
    const machineName = String(m.name||m.machineName||id).replace(/</g,'&lt;');

    // ---- ข้อมูล 3 กิ่ง ----
    const dailyItems    = clResolveDailyItems(id);
    const dailyIsCustom = Array.isArray(_clPmPlans[id]?.dailyItems) && _clPmPlans[id].dailyItems.length > 0;

    const pmPlan   = clGetPmPlan(id);
    const pmLeaves = _clfwFlattenPmItems(pmPlan.pmItems);
    const pmFreq   = pmPlan.pmFreqMonths || 3;
    const pmStart  = String(pmPlan.pmStartMonth || pmPlan.pmStartDate || '').slice(0,7);
    const pmNext   = clNextPmDate(id);

    const pmrPlans   = _pmrByMachine[id] || [];
    const pmrOverdue = pmrPlans.filter(p => p.status === 'overdue').length;
    const pmrSoon    = pmrPlans.filter(p => p.status === 'soon').length;

    const canEditCl  = can('cl.edit');
    const canEditPmr = can('cl.pm');
    const anyEditing = Object.values(_clfwEditing).some(Boolean);

    // ---- คอลัมน์ 1: เครื่องจักร ----
    const machineHtml = `<div id="clfw-node-machine" class="flex-shrink-0 border-2 border-gray-800 rounded-xl px-4 py-3 shadow-lg" style="width:200px;background:#f1f5f9">
        <div class="font-bold text-sm text-gray-900">${machineName}</div>
        <div class="text-xs text-gray-400 font-mono mt-0.5">${id}</div>
    </div>`;

    // ---- คอลัมน์ 2: 3 function ----
    const dailyBadge = `${dailyItems.length} รายการ · <span style="color:${dailyIsCustom?CLFW_BRANCH.daily.color:'#9ca3af'};font-weight:${dailyIsCustom?700:400}">${dailyIsCustom?'Custom':'Default'}</span>`;
    const pmBadge     = `ทุก ${pmFreq} เดือน · ${pmLeaves.length} รายการ`;
    let pmrBadge = `${pmrPlans.length} อะไหล่`;
    if (pmrOverdue) pmrBadge += ` · <span class="text-red-600 font-bold">🔴 ${pmrOverdue} เกิน</span>`;
    else if (pmrSoon) pmrBadge += ` · <span class="text-orange-500 font-bold">🟠 ${pmrSoon} ใกล้</span>`;

    const funcHtml = `<div class="flex-shrink-0 flex flex-col gap-6">
        ${_clfwFuncCard('daily', dailyBadge, `openClItemsEditor('per-machine-daily','${id}')`, canEditCl)}
        ${_clfwFuncCard('pm', pmBadge, `openClItemsEditor('per-machine-pm','${id}')`, canEditCl)}
        ${_clfwFuncCard('pmrep', pmrBadge, `pmrOpenBatch('${id}')`, canEditPmr)}
    </div>`;

    // ---- คอลัมน์ 3: detail (โหมดปกติ / โหมดแก้ไข ต่อกิ่ง) ----
    let dailyBody, dailyEditBtn;
    if (_clfwEditing.daily) {
        dailyBody = _clfwDailyEditHtml();
        dailyEditBtn = '';
    } else {
        dailyBody = dailyItems.length
            ? dailyItems.map((it,i) => `<div class="border rounded-lg px-2.5 py-1.5 text-xs text-gray-700" style="background:${CLFW_BRANCH.daily.itemBg};border-color:${CLFW_BRANCH.daily.color}33">${i+1}. ${String(it.label||it.text||'').replace(/</g,'&lt;')}</div>`).join('')
            : _CLFW_EMPTY_NODE;
        dailyEditBtn = canEditCl ? _clfwEditBtnHtml(anyEditing, `clFlowEditDaily('${id}')`) : '';
    }

    let pmBody, pmEditBtn;
    if (_clfwEditing.pm) {
        pmBody = _clfwPmEditHtml(id);
        pmEditBtn = '';
    } else {
        const pmHeader = `<div class="border rounded-lg px-2.5 py-1.5 text-xs text-gray-700 mb-1.5" style="background:${CLFW_BRANCH.pm.itemBg};border-color:${CLFW_BRANCH.pm.color}33">PM ทุก ${pmFreq} เดือน${pmStart?` · เริ่ม ${pmStart}`:''} · ถัดไป ${pmNext}</div>`;
        const pmItemsHtml = pmLeaves.length
            ? pmLeaves.map(it => `<div class="border rounded-lg px-2.5 py-1.5 text-xs text-gray-700" style="background:${CLFW_BRANCH.pm.itemBg};border-color:${CLFW_BRANCH.pm.color}33">${it.prefix} ${String(it.rawLabel).replace(/</g,'&lt;')}</div>`).join('')
            : _CLFW_EMPTY_NODE;
        pmBody = pmHeader + pmItemsHtml;
        pmEditBtn = canEditCl ? _clfwEditBtnHtml(anyEditing, `clFlowEditPm('${id}')`) : '';
    }

    let pmrepBody, pmrepEditBtn;
    if (_clfwEditing.pmrep) {
        pmrepBody = _clfwPmrepEditHtml(id);
        pmrepEditBtn = '';
    } else {
        pmrepBody = pmrPlans.length
            ? pmrPlans.map(p => {
                const color = PMR_STATUS_COLOR[p.status] || '#94a3b8';
                const lbl   = (p.partNo ? '['+p.partNo+'] ' : '') + String(p.partLabel||'').replace(/</g,'&lt;');
                const unit  = PMR_UNIT_LABEL[p.cycleUnit] || p.cycleUnit;
                return `<div class="border-l-4 rounded-lg px-2.5 py-1.5 text-xs text-gray-700" style="background:${CLFW_BRANCH.pmrep.itemBg};border-left-color:${color}">${lbl}<br><span class="text-gray-400">ทุก ${p.cycleValue} ${unit} · ครบกำหนด ${p.nextDue||'—'}</span></div>`;
            }).join('')
            : _CLFW_EMPTY_NODE;
        pmrepEditBtn = (canEditPmr && pmrPlans.length) ? _clfwEditBtnHtml(anyEditing, `clFlowEditPmrep('${id}')`) : '';
    }

    const detailHtml = `<div class="flex-shrink-0 flex flex-col gap-6">
        ${_clfwDetailGroup('daily', dailyBody, dailyEditBtn)}
        ${_clfwDetailGroup('pm', pmBody, pmEditBtn)}
        ${_clfwDetailGroup('pmrep', pmrepBody, pmrepEditBtn)}
    </div>`;

    wrap.innerHTML = machineHtml + funcHtml + detailHtml;
    clFlowDrawLines();
}

// ================= โหมดแก้ไข inline =================

// ---- Checklist รายวัน ----
function clFlowEditDaily(id) {
    const isDefault = !(_clPmPlans[id]?.dailyItems?.length > 0);
    if (isDefault && !confirm('เครื่องนี้ใช้รายการกลางอยู่ — การแก้จะสร้างชุด Custom เฉพาะเครื่องนี้ ไม่กระทบเครื่องอื่น\n\nดำเนินการต่อ?')) return;
    _clfwDraft = clResolveDailyItems(id).map(i => ({...i}));
    _clfwEditing.daily = true;
    clFlowRender();
}
function _clfwDailyEditHtml() {
    const rows = _clfwDraft.map((it,i) => `
        <div class="flex items-center gap-1.5">
            <input type="text" value="${String(it.label||'').replace(/"/g,'&quot;')}" oninput="_clfwDraft[${i}].label=this.value" class="flex-1 border border-gray-200 rounded px-2 py-1 text-xs bg-white">
            <button onclick="_clfwDailyRemoveRow(${i})" class="text-red-400 hover:text-red-600 text-sm flex-shrink-0">🗑️</button>
        </div>`).join('');
    return `<div class="space-y-1.5">${rows || '<p class="text-xs text-gray-400">ยังไม่มีรายการ</p>'}</div>
        <button onclick="_clfwDailyAddRow()" class="mt-2 w-full py-1.5 text-xs font-bold rounded border border-dashed hover:opacity-80" style="color:${CLFW_BRANCH.daily.color};border-color:${CLFW_BRANCH.daily.color}">➕ เพิ่มรายการ</button>
        <div class="flex gap-2 mt-2">
            <button onclick="clFlowSaveDaily('${_clfwMachineId}')" class="flex-1 text-white text-xs font-bold py-1.5 rounded" style="background:${CLFW_BRANCH.daily.color}">💾 บันทึก</button>
            <button onclick="clFlowCancelEdit('daily')" class="px-3 py-1.5 text-xs font-bold text-gray-500 border border-gray-300 rounded hover:bg-gray-50 bg-white">✖ ยกเลิก</button>
        </div>`;
}
function _clfwDailyAddRow() { _clfwDraft.push({ id:'', label:'' }); clFlowRender(); }
function _clfwDailyRemoveRow(i) { _clfwDraft.splice(i,1); clFlowRender(); }

async function clFlowSaveDaily(id) {
    const editorName = currentUser.name;
    if (!editorName) { showToast('กรุณาเข้าสู่ระบบก่อน', 'warn'); openLogin(); return; }
    if (!can('cl.edit')) { showToast('ไม่มีสิทธิ์', 'error'); return; }
    const items = _clfwDraft.map((it,i) => ({ id:'c'+i, label:String(it.label||'').trim() })).filter(it => it.label);
    if (!items.length) { showToast('⚠️ ต้องมีอย่างน้อย 1 รายการ', 'error'); return; }
    const m = machineMaster.find(x => (x.id||x.machineId||'') === id) || {};
    const merge = _clPmPlans[id]?.dailyMergeDefault || false;
    try {
        const res = await clPost({ action:'saveMachineItems', type:'daily', machineId:id, machineName:m.name||m.machineName||'', factory:m.factory||'', area:m.area||'', items, dailyMergeDefault: merge, editedBy: editorName });
        if (!res.success) { showToast('บันทึกล้มเหลว: '+(res.error||''), 'error'); return; }
        if (!_clPmPlans[id]) _clPmPlans[id] = {};
        _clPmPlans[id].dailyItems = items;
        _clfwEditing.daily = false; _clfwDraft = null;
        clFlowRender();
        showToast('บันทึกรายการ Daily เรียบร้อย', 'success');
    } catch (e) { showToast('เชื่อมต่อ GAS ล้มเหลว', 'error'); }
}

// ---- PM Inspection ----
function clFlowEditPm(id) {
    const plan = clGetPmPlan(id);
    _clfwDraft = {
        freq: plan.pmFreqMonths || 3,
        start: String(plan.pmStartMonth || plan.pmStartDate || '').slice(0,7),
        tree: structuredClone(plan.pmItems || []),
    };
    _clfwEditing.pm = true;
    clFlowRender();
}
function _clfwPmEditHtml(id) {
    const leaves = _clfwFlattenPmItems(_clfwDraft.tree);
    const rows = leaves.map(it => `
        <div class="flex items-center gap-1.5">
            <span class="text-[10px] text-gray-400 w-8 flex-shrink-0">${it.prefix}</span>
            <input type="text" value="${String(it.rawLabel||'').replace(/"/g,'&quot;')}" data-path="${it.path.join('_')}" oninput="_clfwPmSetLeaf(this)" class="flex-1 border border-gray-200 rounded px-2 py-1 text-xs bg-white">
            <button onclick="_clfwPmRemoveLeaf('${it.path.join('_')}')" class="text-red-400 hover:text-red-600 text-sm flex-shrink-0">🗑️</button>
        </div>`).join('');
    return `<div class="flex gap-2 mb-2">
            <input type="number" min="1" value="${_clfwDraft.freq}" oninput="_clfwDraft.freq=parseInt(this.value)||1" placeholder="ความถี่ (เดือน)" class="w-1/2 border border-gray-200 rounded px-2 py-1 text-xs bg-white">
            <input type="month" value="${_clfwDraft.start}" oninput="_clfwDraft.start=this.value" class="w-1/2 border border-gray-200 rounded px-2 py-1 text-xs bg-white">
        </div>
        <div class="space-y-1.5">${rows || '<p class="text-xs text-gray-400">ยังไม่มีรายการ</p>'}</div>
        <button onclick="_clfwPmAddRoot()" class="mt-2 w-full py-1.5 text-xs font-bold rounded border border-dashed hover:opacity-80" style="color:${CLFW_BRANCH.pm.color};border-color:${CLFW_BRANCH.pm.color}">➕ เพิ่มรายการ</button>
        <p class="text-[10px] text-gray-400 mt-1">โครงสร้างซ้อนหลายชั้น → <button onclick="openClItemsEditor('per-machine-pm','${id}')" class="underline">เปิดหน้าตั้งค่าเต็ม</button></p>
        <div class="flex gap-2 mt-2">
            <button onclick="clFlowSavePm('${id}')" class="flex-1 text-white text-xs font-bold py-1.5 rounded" style="background:${CLFW_BRANCH.pm.color}">💾 บันทึก</button>
            <button onclick="clFlowCancelEdit('pm')" class="px-3 py-1.5 text-xs font-bold text-gray-500 border border-gray-300 rounded hover:bg-gray-50 bg-white">✖ ยกเลิก</button>
        </div>`;
}
function _clfwPmSetLeaf(inp) {
    const path = inp.dataset.path.split('_').map(Number);
    const node = _clfwGetNodeByPath(_clfwDraft.tree, path);
    if (node) node.label = inp.value;
}
function _clfwPmRemoveLeaf(pathStr) {
    const path = pathStr.split('_').map(Number);
    if (path.length === 1) {
        _clfwDraft.tree.splice(path[0], 1);
    } else {
        const parent = _clfwGetNodeByPath(_clfwDraft.tree, path.slice(0,-1));
        if (parent) parent.children.splice(path[path.length-1], 1);
    }
    clFlowRender();
}
function _clfwPmAddRoot() { _clfwDraft.tree.push({ label:'', children:[] }); clFlowRender(); }

async function clFlowSavePm(id) {
    const editorName = currentUser.name;
    if (!editorName) { showToast('กรุณาเข้าสู่ระบบก่อน', 'warn'); openLogin(); return; }
    if (!can('cl.edit')) { showToast('ไม่มีสิทธิ์', 'error'); return; }
    const freq = _clfwDraft.freq, start = _clfwDraft.start;
    if (!freq || freq < 1) { showToast('⚠️ กรุณาระบุความถี่', 'error'); return; }
    const leaves = _clfwFlattenPmItems(_clfwDraft.tree);
    if (leaves.some(l => !String(l.rawLabel||'').trim())) { showToast('⚠️ กรุณากรอกข้อความให้ครบทุกรายการ', 'error'); return; }
    const m = machineMaster.find(x => (x.id||x.machineId||'') === id) || {};
    try {
        const planRes = await clPost({ action:'savePmPlans', plans:[{ machineId:id, machineName:m.name||m.machineName||'', factory:m.factory||'', area:m.area||'', dailyEnabled:true, pmFreqMonths:freq, pmStartMonth:start }] });
        if (!planRes.success) { showToast('บันทึกแผน PM ล้มเหลว: '+(planRes.error||''), 'error'); return; }
        const res = await clPost({ action:'saveMachineItems', type:'pm', machineId:id, machineName:m.name||m.machineName||'', factory:m.factory||'', area:m.area||'', items:_clfwDraft.tree, editedBy: editorName });
        if (!res.success) { showToast('บันทึกรายการล้มเหลว: '+(res.error||''), 'error'); return; }
        if (!_clPmPlans[id]) _clPmPlans[id] = {};
        Object.assign(_clPmPlans[id], { pmItems:_clfwDraft.tree, pmFreqMonths:freq, pmStartMonth:start });
        _clfwEditing.pm = false; _clfwDraft = null;
        clFlowRender();
        showToast('บันทึกรายการ PM เรียบร้อย', 'success');
    } catch (e) { showToast('เชื่อมต่อ GAS ล้มเหลว', 'error'); }
}

// ---- PM Replacement (D2: แก้ได้เฉพาะ ความถี่/เดือนเริ่ม/หมายเหตุ) ----
function clFlowEditPmrep(id) {
    _clfwDraft = (_pmrByMachine[id]||[]).map(p => ({
        planId: p.planId, partId: p.partId,
        partName: p.partNo ? String(p.partLabel||'').replace(p.partNo + ' - ', '') : (p.partLabel || ''),
        partNo: p.partNo || '',
        cycleMonths: p.cycleUnit === 'month' ? p.cycleValue : '',
        legacyCycleLabel: p.cycleUnit !== 'month' ? `เดิม: ${p.cycleValue} ${PMR_UNIT_LABEL[p.cycleUnit]||p.cycleUnit}` : '',
        startDate: String(p.startDate||'').slice(0,7),
        note: p.note || '',
        status: p.status,
        existingLocationImageId: p.locationImageId || '',
    }));
    _clfwEditing.pmrep = true;
    clFlowRender();
}
function _clfwPmrepEditHtml(id) {
    const rows = _clfwDraft.map((row,i) => `
        <div class="border-l-2 pl-2 mb-2" style="border-color:${PMR_STATUS_COLOR[row.status]||'#94a3b8'}">
            <div class="text-xs font-bold text-gray-700">${row.partNo?('['+row.partNo+'] '):''}${String(row.partName).replace(/</g,'&lt;')}</div>
            <div class="flex gap-1.5 mt-1">
                <input type="number" min="1" value="${row.cycleMonths}" placeholder="${row.legacyCycleLabel||'เดือน'}" oninput="_clfwDraft[${i}].cycleMonths=parseInt(this.value)||''" class="w-1/3 border border-gray-200 rounded px-1.5 py-1 text-xs bg-white">
                <input type="month" value="${row.startDate}" oninput="_clfwDraft[${i}].startDate=this.value" class="w-1/3 border border-gray-200 rounded px-1.5 py-1 text-xs bg-white">
                <input type="text" value="${String(row.note||'').replace(/"/g,'&quot;')}" placeholder="หมายเหตุ" oninput="_clfwDraft[${i}].note=this.value" class="w-1/3 border border-gray-200 rounded px-1.5 py-1 text-xs bg-white">
            </div>
        </div>`).join('');
    return `${rows}
        <p class="text-[10px] text-gray-400 mt-1">เปลี่ยนอะไหล่/รูป/เพิ่มลบรายการ → <button onclick="pmrOpenBatch('${id}')" class="underline">เปิดหน้าตั้งค่าเต็ม</button></p>
        <div class="flex gap-2 mt-2">
            <button onclick="clFlowSavePmrep('${id}')" class="flex-1 text-white text-xs font-bold py-1.5 rounded" style="background:${CLFW_BRANCH.pmrep.color}">💾 บันทึก</button>
            <button onclick="clFlowCancelEdit('pmrep')" class="px-3 py-1.5 text-xs font-bold text-gray-500 border border-gray-300 rounded hover:bg-gray-50 bg-white">✖ ยกเลิก</button>
        </div>`;
}

async function clFlowSavePmrep(id) {
    const editorName = currentUser.name;
    if (!editorName) { showToast('กรุณาเข้าสู่ระบบก่อน', 'warn'); openLogin(); return; }
    if (!can('cl.pm')) { showToast('ไม่มีสิทธิ์', 'error'); return; }
    for (const row of _clfwDraft) {
        if (!row.cycleMonths || row.cycleMonths < 1) { showToast('⚠️ กรุณาระบุความถี่ให้ครบทุกรายการ', 'error'); return; }
        if (!row.startDate) { showToast('⚠️ กรุณาระบุเดือนเริ่มให้ครบทุกรายการ', 'error'); return; }
    }
    const items = _clfwDraft.map(row => ({
        planId: row.planId, partId: row.partId, partName: row.partName, partNo: row.partNo,
        cycleMonths: row.cycleMonths, startDate: row.startDate, note: row.note,
        locationImageId: null, existingLocationImageId: row.existingLocationImageId || '',
    }));
    try {
        const j = await clPost({ action:'pmReplaceBatchSave', machineId:id, byName:editorName, items, removedPlanIds:[] });
        if (j.success) {
            _pmrByMachine[id] = j.data || [];
            _clfwEditing.pmrep = false; _clfwDraft = null;
            clFlowRender();
            showToast('บันทึกแผนเปลี่ยนอะไหล่เรียบร้อย', 'success');
        } else showToast('เกิดข้อผิดพลาด: '+(j.error||''), 'error');
    } catch (e) { showToast('เชื่อมต่อ GAS ไม่ได้', 'error'); }
}

function clFlowCancelEdit(key) {
    _clfwEditing[key] = false;
    _clfwDraft = null;
    clFlowRender();
}

// ---- เส้นเชื่อม SVG: lane แนวตั้งแยกต่อกิ่ง (ไม่ทับกัน) + สีตามกิ่ง ----
function clFlowDrawLines() {
    const canvas = document.getElementById('clfw-canvas');
    const svg    = document.getElementById('clfw-lines');
    if (!canvas || !svg) return;
    svg.innerHTML = '';
    svg.setAttribute('width', canvas.scrollWidth);
    svg.setAttribute('height', canvas.scrollHeight);
    const cRect = canvas.getBoundingClientRect();
    const NS = 'http://www.w3.org/2000/svg';
    const addPath = (fromEl, toEl, color, laneOffset, fromYFrac) => {
        if (!fromEl || !toEl) return;
        const fRect = fromEl.getBoundingClientRect();
        const tRect = toEl.getBoundingClientRect();
        const x1 = fRect.right - cRect.left;
        const y1 = fRect.top - cRect.top + fRect.height * (fromYFrac ?? 0.5);
        const x2 = tRect.left - cRect.left;
        const y2 = tRect.top - cRect.top + tRect.height/2;
        const midX = x1 + laneOffset;
        const path = document.createElementNS(NS, 'path');
        path.setAttribute('d', `M${x1},${y1} H${midX} V${y2} H${x2}`);
        path.setAttribute('stroke', color);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(path);
    };
    const machineEl = document.getElementById('clfw-node-machine');
    // แยกจุดออกจาก machine node ตามสัดส่วนความสูง (25%/50%/75%) กันเส้นทับกันตั้งแต่ต้นทาง
    const MACHINE_EXIT_FRAC = { daily:0.25, pm:0.5, pmrep:0.75 };
    ['daily','pm','pmrep'].forEach(key => {
        const lane  = CLFW_LANE[key];
        const color = CLFW_BRANCH[key].color;
        addPath(machineEl, document.getElementById('clfw-node-' + key), color, 26 + lane*16, MACHINE_EXIT_FRAC[key]);
        if (_clfwExpanded[key]) addPath(document.getElementById('clfw-node-' + key), document.getElementById('clfw-detail-' + key), color, 16 + lane*12);
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
