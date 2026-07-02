// ============================================================
// CHECKLIST: FLOWCHART รายเครื่องจักร
// node เครื่องจักร → 3 function (Checklist รายวัน / PM Inspection / PM Replacement)
// คลิก function = toggle ขยาย (ค้างได้หลายอันพร้อมกัน) เห็นทุกรายการเป็น node ย่อย
// แก้ไข inline ได้เฉพาะ Checklist รายวัน (โหมดแก้ครั้งเดียว บันทึกทีเดียว)
// PM Inspection / PM Replacement = ดูอย่างเดียว + ปุ่ม ✏️ เปิด popup เดิม
// ============================================================
let _clfwMachineId = '';
let _clfwExpanded  = { daily:false, pm:false, pmrep:false };
let _clfwEditing   = { daily:false };
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
    _clfwEditing   = { daily:false };
    _clfwDraft     = null;
    switchTab('cl-flow');
}

// ---- กันทิ้ง draft เงียบๆ ระหว่างแก้ไขอยู่ในหน้าเดียวกัน ----
function _clfwConfirmDiscardIfEditing() {
    if (!_clfwEditing.daily) return true;
    if (!confirm('กำลังแก้ไขอยู่ — การดำเนินการนี้จะทิ้งการแก้ไขที่ยังไม่บันทึก ดำเนินการต่อ?')) return false;
    _clfwEditing.daily = false;
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

// PM Inspection: pmItems เป็น tree (เหมือน Why-Why) → flatten เอาเฉพาะ leaf (ใช้นับ badge จำนวนรายการ)
function _clfwFlattenPmItems(pmItems) {
    const items = [];
    const walk = (node, prefix) => {
        if (!node.children || !node.children.length) items.push({ prefix, rawLabel: node.label || node.text || '' });
        else node.children.forEach((ch, j) => walk(ch, prefix + '.' + (j+1)));
    };
    (pmItems || []).forEach((n, i) => walk(n, String(i+1)));
    return items;
}
// render tree แบ่งชั้นเต็ม (parent+leaf) สำหรับแสดงผลใน detail group — parent ตัวหนา indent ตามชั้น
function _clfwRenderPmTree(pmItems) {
    const rows = [];
    const walk = (node, prefix, depth) => {
        const isLeaf = !node.children || !node.children.length;
        const label  = String(node.label || node.text || '').replace(/</g,'&lt;');
        const indent = depth * 14;
        if (isLeaf) {
            rows.push(`<div class="rounded-lg px-2.5 py-1.5 text-xs text-gray-700" style="margin-left:${indent}px;background:${CLFW_BRANCH.pm.itemBg};border:1px solid ${CLFW_BRANCH.pm.color}33">${prefix} ${label}</div>`);
        } else {
            rows.push(`<div class="rounded-lg px-2.5 py-1.5 text-xs font-bold" style="margin-left:${indent}px;background:${CLFW_BRANCH.pm.bg};border:1px solid ${CLFW_BRANCH.pm.color}66;color:${CLFW_BRANCH.pm.color}">${prefix} ${label}</div>`);
            node.children.forEach((ch,j) => walk(ch, prefix + '.' + (j+1), depth+1));
        }
    };
    (pmItems||[]).forEach((n,i) => walk(n, String(i+1), 0));
    return rows.join('') || _CLFW_EMPTY_NODE;
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
function _clfwEditBtnHtml(onclickFn) {
    return `<button onclick="${onclickFn}" class="text-[11px] font-bold text-gray-500 hover:text-gray-700 underline">✏️ แก้ไข</button>`;
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
    const dailyCustomIdSet = new Set((dailyIsCustom ? _clPmPlans[id].dailyItems : []).map(i => i.id || i.label));

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

    // ---- คอลัมน์ 3: detail ----
    // Checklist รายวัน — inline editable (โหมดแก้ไข/ปกติ)
    let dailyBody, dailyEditBtn;
    if (_clfwEditing.daily) {
        dailyBody = _clfwDailyEditHtml();
        dailyEditBtn = '';
    } else {
        dailyBody = dailyItems.length
            ? dailyItems.map((it,i) => {
                const isDefaultItem = !dailyCustomIdSet.has(it.id || it.label);
                const style = isDefaultItem
                    ? `border:1px dashed ${CLFW_BRANCH.daily.color}88;background:#f8fafc;color:#6b7280`
                    : `background:${CLFW_BRANCH.daily.itemBg};border:1px solid ${CLFW_BRANCH.daily.color}33;color:#374151`;
                return `<div class="rounded-lg px-2.5 py-1.5 text-xs" style="${style}">${isDefaultItem?'🔒 ':''}${i+1}. ${String(it.label||it.text||'').replace(/</g,'&lt;')}</div>`;
            }).join('')
            : _CLFW_EMPTY_NODE;
        dailyEditBtn = canEditCl ? _clfwEditBtnHtml(`clFlowEditDaily('${id}')`) : '';
    }

    // PM Inspection — view-only, แสดง tree แบ่งชั้น + ปุ่มเปิด modal เดิม
    const pmHeader = `<div class="border rounded-lg px-2.5 py-1.5 text-xs text-gray-700 mb-1.5" style="background:${CLFW_BRANCH.pm.itemBg};border-color:${CLFW_BRANCH.pm.color}33">PM ทุก ${pmFreq} เดือน${pmStart?` · เริ่ม ${pmStart}`:''} · ถัดไป ${pmNext}</div>`;
    const pmBody = pmHeader + _clfwRenderPmTree(pmPlan.pmItems);
    const pmEditBtn = canEditCl ? _clfwEditBtnHtml(`openClItemsEditor('per-machine-pm','${id}')`) : '';

    // PM Replacement — view-only, การ์ด 3 บรรทัดแบ่งชั้น + ปุ่มเปิด popup เดิม
    const pmrepBody = pmrPlans.length
        ? pmrPlans.map(p => {
            const color = PMR_STATUS_COLOR[p.status] || '#94a3b8';
            const partName = p.partNo ? String(p.partLabel||'').replace(p.partNo + ' - ', '') : (p.partLabel || '');
            const lbl   = (p.partNo ? '['+p.partNo+'] ' : '') + String(partName).replace(/</g,'&lt;');
            const unit  = PMR_UNIT_LABEL[p.cycleUnit] || p.cycleUnit;
            const stLbl = PMR_STATUS_LABEL[p.status] || '';
            return `<div class="border-l-4 rounded-lg px-2.5 py-1.5 text-xs" style="background:${CLFW_BRANCH.pmrep.itemBg};border-left-color:${color}">
                <div class="font-bold text-gray-700">${lbl}</div>
                <div class="text-gray-500 mt-0.5">ทุก ${p.cycleValue} ${unit}${p.startDate?` · เริ่ม ${String(p.startDate).slice(0,7)}`:''}</div>
                <div class="text-gray-400 mt-0.5">ครบกำหนด ${p.nextDue||'—'} · <span style="color:${color}">● ${stLbl}</span></div>
            </div>`;
        }).join('')
        : _CLFW_EMPTY_NODE;
    const pmrepEditBtn = canEditPmr ? _clfwEditBtnHtml(`pmrOpenBatch('${id}')`) : '';

    const detailHtml = `<div class="flex-shrink-0 flex flex-col gap-6">
        ${_clfwDetailGroup('daily', dailyBody, dailyEditBtn)}
        ${_clfwDetailGroup('pm', pmBody, pmEditBtn)}
        ${_clfwDetailGroup('pmrep', pmrepBody, pmrepEditBtn)}
    </div>`;

    wrap.innerHTML = machineHtml + funcHtml + detailHtml;
    clFlowDrawLines();
}

// ================= โหมดแก้ไข inline: เฉพาะ Checklist รายวัน =================
function clFlowEditDaily(id) {
    const plan = _clPmPlans[id] || {};
    const hasCustom = Array.isArray(plan.dailyItems) && plan.dailyItems.length > 0;
    _clfwDraft = {
        useDefault: hasCustom ? !!plan.dailyMergeDefault : true,
        customItems: hasCustom ? plan.dailyItems.map(i => ({...i})) : [],
    };
    _clfwEditing.daily = true;
    clFlowRender();
}
function _clfwDailyEditHtml() {
    const defList = (_clDailyDefault.length ? _clDailyDefault : CL_DAILY_DEFAULT);
    const defBlock = _clfwDraft.useDefault ? `
        <div class="border border-dashed rounded-lg p-2 mb-2" style="border-color:${CLFW_BRANCH.daily.color}88;background:#f8fafc">
            <div class="text-[10px] font-bold text-gray-400 mb-1">🔒 รายการ Default (${defList.length}) — แก้ไม่ได้</div>
            <div class="space-y-1">
                ${defList.map((it,i) => `<div class="text-xs text-gray-500 px-2 py-1 bg-white rounded border border-gray-100">${i+1}. ${String(it.label||'').replace(/</g,'&lt;')}</div>`).join('')}
            </div>
        </div>` : '';
    const customRows = _clfwDraft.customItems.map((it,i) => `
        <div class="flex items-center gap-1.5">
            <input type="text" value="${String(it.label||'').replace(/"/g,'&quot;')}" oninput="_clfwDraft.customItems[${i}].label=this.value" class="flex-1 border border-gray-200 rounded px-2 py-1 text-xs bg-white">
            <button onclick="_clfwDailyRemoveRow(${i})" class="text-red-400 hover:text-red-600 text-sm flex-shrink-0">🗑️</button>
        </div>`).join('');
    return `<label class="flex items-center gap-2 text-xs font-bold text-gray-700 mb-2 cursor-pointer">
            <input type="checkbox" ${_clfwDraft.useDefault?'checked':''} onchange="_clfwDailyToggleDefault(this)">
            ใช้รายการ Default (${defList.length} รายการ)
        </label>
        ${defBlock}
        <div class="text-[10px] font-bold text-gray-400 mb-1">รายการเพิ่มเอง (Custom)</div>
        <div class="space-y-1.5">${customRows || '<p class="text-xs text-gray-400">ยังไม่มีรายการเพิ่มเอง</p>'}</div>
        <button onclick="_clfwDailyAddRow()" class="mt-2 w-full py-1.5 text-xs font-bold rounded border border-dashed hover:opacity-80" style="color:${CLFW_BRANCH.daily.color};border-color:${CLFW_BRANCH.daily.color}">➕ เพิ่มรายการ</button>
        <div class="flex gap-2 mt-2">
            <button onclick="clFlowSaveDaily('${_clfwMachineId}')" class="flex-1 text-white text-xs font-bold py-1.5 rounded" style="background:${CLFW_BRANCH.daily.color}">💾 บันทึก</button>
            <button onclick="clFlowCancelEdit('daily')" class="px-3 py-1.5 text-xs font-bold text-gray-500 border border-gray-300 rounded hover:bg-gray-50 bg-white">✖ ยกเลิก</button>
        </div>`;
}
function _clfwDailyToggleDefault(cb) { _clfwDraft.useDefault = cb.checked; clFlowRender(); }
function _clfwDailyAddRow() { _clfwDraft.customItems.push({ id:'', label:'' }); clFlowRender(); }
function _clfwDailyRemoveRow(i) { _clfwDraft.customItems.splice(i,1); clFlowRender(); }

async function clFlowSaveDaily(id) {
    const editorName = currentUser.name;
    if (!editorName) { showToast('กรุณาเข้าสู่ระบบก่อน', 'warn'); openLogin(); return; }
    if (!can('cl.edit')) { showToast('ไม่มีสิทธิ์', 'error'); return; }
    const useDefault = _clfwDraft.useDefault;
    const items = _clfwDraft.customItems.map((it,i) => ({ id:'c'+i, label:String(it.label||'').trim() })).filter(it => it.label);
    if (!useDefault && !items.length) { showToast('⚠️ ต้องมีอย่างน้อย 1 รายการ หรือเปิดใช้ Default', 'error'); return; }
    const m = machineMaster.find(x => (x.id||x.machineId||'') === id) || {};
    try {
        const res = await clPost({ action:'saveMachineItems', type:'daily', machineId:id, machineName:m.name||m.machineName||'', factory:m.factory||'', area:m.area||'', items, dailyMergeDefault: useDefault, editedBy: editorName });
        if (!res.success) { showToast('บันทึกล้มเหลว: '+(res.error||''), 'error'); return; }
        if (!_clPmPlans[id]) _clPmPlans[id] = {};
        _clPmPlans[id].dailyItems = items;
        _clPmPlans[id].dailyMergeDefault = useDefault;
        _clfwEditing.daily = false; _clfwDraft = null;
        clFlowRender();
        showToast('บันทึกรายการ Daily เรียบร้อย', 'success');
    } catch (e) { showToast('เชื่อมต่อ GAS ล้มเหลว', 'error'); }
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
