// ============================================================
// CHECKLIST MODULE (Phase 3)
// ============================================================

// Default daily check items (shared across all machines unless overridden)
const CL_DAILY_DEFAULT = [
    { id:'d01', label:'ตรวจสอบระดับน้ำมันหล่อลื่น' },
    { id:'d02', label:'ตรวจสอบระดับน้ำมันไฮดรอลิก' },
    { id:'d03', label:'ตรวจสอบสายพาน / โซ่' },
    { id:'d04', label:'ตรวจสอบเสียงผิดปกติ' },
    { id:'d05', label:'ตรวจสอบแรงสั่นสะเทือน' },
    { id:'d06', label:'ตรวจสอบอุณหภูมิมอเตอร์' },
    { id:'d07', label:'ตรวจสอบระบบความปลอดภัย' },
    { id:'d08', label:'ตรวจสอบความสะอาดโดยรวม' },
];

// Default PM items — 3 levels (categoryId, subcategoryId, itemId)
const CL_PM_DEFAULT = [
    { cat:'ระบบกลไก', sub:'สายพาน/โซ่', items:['ตรวจสอบแรงตึง','ตรวจสอบการสึกหรอ','หล่อลื่น'] },
    { cat:'ระบบกลไก', sub:'เกียร์/ลูกปืน', items:['ตรวจสอบเสียง','ตรวจสอบอุณหภูมิ','เพิ่มจาระบี'] },
    { cat:'ระบบไฮดรอลิก', sub:'น้ำมัน', items:['ตรวจระดับน้ำมัน','ตรวจสอบสี/กลิ่น','เปลี่ยนกรอง (ตามกำหนด)'] },
    { cat:'ระบบไฮดรอลิก', sub:'ปั๊ม/วาล์ว', items:['ตรวจสอบการรั่วซึม','ตรวจสอบแรงดัน'] },
    { cat:'ระบบไฟฟ้า', sub:'มอเตอร์', items:['ตรวจสอบฉนวน','ตรวจสอบขั้วสายไฟ','ตรวจสอบอุณหภูมิ'] },
    { cat:'ระบบไฟฟ้า', sub:'แผงควบคุม', items:['ทำความสะอาด','ตรวจสอบสัญญาณเตือน'] },
    { cat:'ระบบความปลอดภัย', sub:'อุปกรณ์นิรภัย', items:['ตรวจสอบ Emergency stop','ตรวจสอบ Guard cover','ตรวจสอบสัญญาณแสง/เสียง'] },
];

// In-memory stores (loaded from GAS)
let _clChecklists   = [];   // recent checklists from GAS
let _clPmPlans      = {};   // { machineId: plan } from GAS _PmPlans
let _clPmDates      = {};   // { "machineId_YYYY-MM": [day, day, ...] }
let _clDailyDefault = [];   // global default daily items from _DailyDefault sheet
let _clDailyItems   = {};   // deprecated localStorage cache (kept for compat)
let _clfItemImages  = {};   // { itemId: [{data: dataURL}] } — per-item images in cl-form
let _clfOverallImages = []; // รูปถ่ายรวม daily check (≥2 บังคับ)
let _clCopyType     = '';   // 'daily' | 'pm' — active copy modal type
let _clCopySourceId = '';   // source machineId for copy
let _clCalYear    = new Date().getFullYear();
let _clCalMonth   = new Date().getMonth(); // 0-based
let _clCalMachineId = '';
let _clSetDatesMachineId = '';
let _clSetDatesYear = 0;
let _clSetDatesMonth = 0;
let _clMcdeMode      = 'default-daily';  // current editor mode
let _clMcdeMachineId = '';               // machine being edited
let _clScCurrentTab = 'daily';
let _clChartObj = null;
let _clDailyPage = 0; let _clDailyPageSize = 10; let _clDailyTotalPages = 1;
let _clPmPage    = 0; let _clPmPageSize    = 10; let _clPmTotalPages    = 1;

// ---- helpers ----
function clFacOptions() {
    const facs = [...new Set(machineMaster.map(m => m.factory).filter(Boolean))].sort();
    return facs;
}
function clAreaOptions(factory) {
    const areas = [...new Set(machineMaster.filter(m => !factory || m.factory === factory).map(m => m.area).filter(Boolean))].sort();
    return areas;
}
function clMachinesFor(factory, area) {
    return machineMaster.filter(m => (!factory || m.factory === factory) && (!area || m.area === area));
}
function clIsPmDueInMonth(machineId, year, month) {
    const plan = _clPmPlans[machineId] || {};
    const sm   = (plan.pmStartMonth || plan.pmStartDate || '').slice(0, 7); // YYYY-MM
    if (!sm) return false;
    const freq = parseInt(plan.pmFreqMonths || plan.pmFreq) || 3;
    const [sy, smm] = sm.split('-').map(Number);
    const diffMonths = (year - sy) * 12 + (month - (smm - 1)); // month is 0-based
    return diffMonths >= 0 && diffMonths % freq === 0;
}
function clMachinesDueForPm(factory, area, year, month) {
    return clMachinesFor(factory, area).filter(m => {
        const id = m.id || m.machineId || m.machine_id || '';
        return clIsPmDueInMonth(id, year, month);
    });
}
function clResultBadge(result) {
    if (result === 'PASS') return '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">✅ PASS</span>';
    if (result === 'FAIL') return '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">❌ FAIL</span>';
    if (result === 'FIX')  return '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-700">🔧 FIX</span>';
    return '<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">—</span>';
}
function clFillFacSelect(elId, selected) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<option value="">-- โรงงาน --</option>';
    clFacOptions().forEach(f => {
        const o = document.createElement('option');
        o.value = o.textContent = f;
        if (f === selected) o.selected = true;
        el.appendChild(o);
    });
}
function clFillAreaSelect(elId, factory, selected) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<option value="">ทั้งหมด</option>';
    clAreaOptions(factory).forEach(a => {
        const o = document.createElement('option');
        o.value = o.textContent = a;
        if (a === selected) o.selected = true;
        el.appendChild(o);
    });
}
function clFillMachineSelect(elId, factory, area, selected) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '<option value="">-- เลือกเครื่องจักร --</option>';
    clMachinesFor(factory, area).forEach(m => {
        const o = document.createElement('option');
        o.value = m.id || m.machineId || m.machine_id || '';
        o.textContent = m.name || m.machineName || o.value;
        if (o.value === selected) o.selected = true;
        el.appendChild(o);
    });
}
function clGetDailyItems(machineId) {
    const plan = _clPmPlans[machineId];
    if (plan && Array.isArray(plan.dailyItems) && plan.dailyItems.length > 0) return plan.dailyItems;
    return null;
}
function clResolveDailyItems(machineId) {
    const plan   = _clPmPlans[machineId] || {};
    const custom = Array.isArray(plan.dailyItems) && plan.dailyItems.length ? plan.dailyItems : null;
    const def    = _clDailyDefault.length ? _clDailyDefault : CL_DAILY_DEFAULT;
    if (!custom) return def;
    if (plan.dailyMergeDefault) {
        const seen = new Set(custom.map(i => i.id || i.label));
        return [...def.filter(i => !seen.has(i.id || i.label)), ...custom];
    }
    return custom;
}
function clGetPmPlan(machineId) {
    return _clPmPlans[machineId] || { dailyEnabled: true, pmFreqMonths: 3, pmStartMonth: '' };
}
function clNextPmDate(machineId) {
    const plan = clGetPmPlan(machineId);
    const sm   = plan.pmStartMonth || plan.pmStartDate || '';
    if (!sm) return '—';
    const start = new Date(sm + (sm.length === 7 ? '-01' : ''));
    const freq  = parseInt(plan.pmFreqMonths || plan.pmFreq) || 3;
    const now   = new Date();
    let next = new Date(start);
    while (next <= now) next.setMonth(next.getMonth() + freq);
    return next.toISOString().slice(0,7);
}
function clPmDateKey(machineId, year, month) {
    return machineId + '_' + year + '-' + String(month + 1).padStart(2,'0');
}
function clGetPmDatesForMonth(machineId, year, month) {
    return _clPmDates[clPmDateKey(machineId, year, month)] || [];
}
async function clFetch(params) {
    const url = new URL(GAS_URL);
    Object.entries(params).forEach(([k,v]) => url.searchParams.set(k, v));
    const overlay = params.action !== 'getImage';
    if (overlay) showLoading('กำลังโหลด…');
    try { const r = await fetch(url.toString()); return await r.json(); }
    finally { if (overlay) hideLoading(); }
}
async function clPost(body) {
    showLoading('กำลังบันทึก…');
    try {
        const res = await fetch(GAS_URL, {
            method:'POST',
            body: JSON.stringify({ ...body, username: currentUser.username, pin: currentUser.pin }),
        });
        return await res.json();
    } finally { hideLoading(); }
}

// ---- HUB ----
async function initClHub() {
    if (!machineMaster.length) await loadMachineMaster();
    clFillFacSelect('cl-hub-fac', '');
    clFillAreaSelect('cl-hub-area', '', '');
    loadClHubRecent();
    loadClDailyDash();
}
function clHubFacChange() {
    const fac = document.getElementById('cl-hub-fac')?.value || '';
    clFillAreaSelect('cl-hub-area', fac, '');
}

// ---- DAILY DASHBOARD (cl-hub only) ----
let _clDashRows  = [];   // today's daily checklists
let _clPmDashRows = [];  // this month's PM checklists
const _CLDASH_GRIDS = ['cldash-grid'];
const _CLDASH_DATES = ['cldash-date'];

async function loadClDailyDash() {
    const todayBKK = new Date(Date.now() + 7*3600000).toISOString().slice(0,10);
    const yr = todayBKK.slice(0,4), mo = todayBKK.slice(5,7);
    const dateText = `วันที่ ${todayBKK}`;
    _CLDASH_DATES.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = dateText; });
    _CLDASH_GRIDS.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = '<div class="text-center text-gray-400 py-10 col-span-2">กำลังโหลด...</div>'; });
    const refreshBtn = document.getElementById('cldash-refresh');
    if (refreshBtn) { refreshBtn.disabled = true; refreshBtn.textContent = '⏳'; }

    try {
        if (!machineMaster.length) await loadMachineMaster();
        if (!Object.keys(_clPmPlans).length) {
            const p = await clFetch({ action:'getPmPlans', factory:'', area:'' });
            (p.data||[]).forEach(r => _clPmPlans[r.machineId] = r);
        }
        const d = await clFetch({ action:'getChecklists', factory:'', area:'', type:'daily', month:mo, year:yr });
        _clDashRows = (d.data||[]).filter(r => r.date === todayBKK);
    } catch(e) {
        const errHtml = '<div class="text-center text-red-400 py-10 col-span-2 text-sm">โหลดข้อมูลล้มเหลว</div>';
        _CLDASH_GRIDS.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = errHtml; });
        if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '🔄 รีเฟรช'; }
        return;
    }
    if (refreshBtn) { refreshBtn.disabled = false; refreshBtn.textContent = '🔄 รีเฟรช'; }
    renderClDailyDash();
}

function renderClDailyDash() {
    const facs = clFacOptions();
    const noFacHtml = '<div class="text-center text-gray-400 py-10 col-span-2 text-sm">ไม่พบข้อมูลโรงงาน</div>';
    if (!facs.length) {
        _CLDASH_GRIDS.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = noFacHtml; });
        return;
    }

    // build done sets: key = 'fac|shift' → Set<machineId>
    const doneSet = {};
    _clDashRows.forEach(r => {
        const mid   = String(r.machineId || r.machine || '').trim();
        const fac   = String(r.factory  || '').trim();
        const shift = String(r.shift    || '').trim();
        if (!mid || !fac || !shift) return;
        const key = `${fac}|${shift}`;
        if (!doneSet[key]) doneSet[key] = new Set();
        doneSet[key].add(mid);
    });

    const SHIFTS = [{ key:'เช้า', icon:'🌅', label:'กะเช้า' }, { key:'ดึก', icon:'🌙', label:'กะดึก' }];

    const html = facs.map(fac => {
        const allM = clMachinesFor(fac, '').filter(m => {
            const id = String(m.id || m.machineId || m.machine_id || '').trim();
            const plan = _clPmPlans[id] || {};
            return plan.dailyEnabled !== false && plan.dailyEnabled !== 0 && plan.dailyEnabled !== '0';
        });
        const total = allM.length;

        const shiftRows = SHIFTS.map(({ key, icon, label }) => {
            const done = doneSet[`${fac}|${key}`]?.size || 0;
            const pct  = total ? Math.round(done / total * 100) : 0;
            const remaining = total - done;
            const barColor  = pct === 100 ? '#27ae60' : pct > 0 ? '#e67e22' : '#bdc3c7';
            const pctColor  = pct === 100 ? 'text-green-600' : pct > 0 ? 'text-orange-500' : 'text-gray-400';
            return `
            <div class="mb-4 last:mb-0">
                <div class="flex items-center justify-between mb-1.5">
                    <span class="text-sm font-bold text-gray-700">${icon} ${label}</span>
                    <span class="text-sm font-bold ${pctColor}">${done}<span class="font-normal text-gray-400">/${total}</span> เครื่อง</span>
                </div>
                <div class="relative h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div class="h-full rounded-full transition-all duration-700" style="width:${pct}%;background:${barColor}"></div>
                    <span class="absolute inset-0 flex items-center justify-center text-xs font-bold ${pct > 45 ? 'text-white' : 'text-gray-500'}">${pct}%</span>
                </div>
                <div class="flex justify-between mt-1.5 text-xs">
                    <span class="text-green-600 font-semibold">✅ ตรวจแล้ว ${done} เครื่อง</span>
                    <span class="${remaining > 0 ? 'text-red-400' : 'text-gray-300'} font-semibold">⏳ ยังไม่ตรวจ ${remaining} เครื่อง</span>
                </div>
            </div>`;
        }).join('');

        const totalSessions = SHIFTS.length * total;
        const doneSessions  = SHIFTS.reduce((s, { key }) => s + (doneSet[`${fac}|${key}`]?.size || 0), 0);
        const overallPct    = totalSessions ? Math.round(doneSessions / totalSessions * 100) : 0;
        const hdrBg = overallPct === 100 ? 'linear-gradient(135deg,#1a472a,#27ae60)'
                    : overallPct >   0  ? 'linear-gradient(135deg,#7d4500,#e67e22)'
                    :                     'linear-gradient(135deg,#555,#999)';

        return `
        <div class="rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
            <div class="px-6 py-4 flex items-center justify-between" style="background:${hdrBg}">
                <div>
                    <h3 class="font-bold text-white text-lg">🏭 ${fac}</h3>
                    <p class="text-white/70 text-xs mt-0.5">${total} เครื่องมีแผนรายวัน</p>
                </div>
                <div class="text-right">
                    <div class="text-3xl font-black text-white">${overallPct}%</div>
                    <div class="text-white/70 text-xs">รวมทั้ง 2 กะ</div>
                </div>
            </div>
            <div class="p-5 flex-1">${shiftRows}</div>
        </div>`;
    }).join('');

    _CLDASH_GRIDS.forEach(id => { const el = document.getElementById(id); if (el) el.innerHTML = html; });
}

// ---- HOME PAGE COMBINED DASHBOARD ----
async function loadHomeDash() {
    const todayBKK = new Date(Date.now() + 7*3600000).toISOString().slice(0,10);
    const yr = todayBKK.slice(0,4), mo = todayBKK.slice(5,7);
    const dateEl = document.getElementById('home-dash-date');
    if (dateEl) dateEl.textContent = `วันที่ ${todayBKK}`;

    // set loading placeholders
    ['home-f1-daily','home-f2-daily','home-f1-pm','home-f2-pm'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '<div class="text-xs text-gray-400 py-1">กำลังโหลด...</div>';
    });

    try {
        if (!machineMaster.length) await loadMachineMaster();
        if (!Object.keys(_clPmPlans).length) {
            const p = await clFetch({ action:'getPmPlans', factory:'', area:'' });
            (p.data||[]).forEach(r => _clPmPlans[r.machineId] = r);
        }
        const [dailyRes, pmRes] = await Promise.all([
            clFetch({ action:'getChecklists', factory:'', area:'', type:'daily', month:mo, year:yr }),
            clFetch({ action:'getChecklists', factory:'', area:'', type:'pm',   month:mo, year:yr }),
        ]);
        _clDashRows    = (dailyRes.data||[]).filter(r => r.date === todayBKK);
        _clPmDashRows  = pmRes.data || [];
    } catch(e) {
        ['home-f1-daily','home-f2-daily','home-f1-pm','home-f2-pm'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.innerHTML = '<div class="text-xs text-red-400 py-1">โหลดล้มเหลว</div>';
        });
        return;
    }
    renderHomeDash();
}

function renderHomeDash() {
    const todayBKK = new Date(Date.now() + 7*3600000).toISOString().slice(0,10);
    const yr = Number(todayBKK.slice(0,4)), mo = Number(todayBKK.slice(5,7));

    const FACS = [
        { key:'โรงงาน 1', dailyId:'home-f1-daily', pmId:'home-f1-pm' },
        { key:'โรงงาน 2', dailyId:'home-f2-daily', pmId:'home-f2-pm' },
    ];

    // daily done sets: 'fac|shift' → Set<machineId>
    const dailyDone = {};
    _clDashRows.forEach(r => {
        const mid = String(r.machineId||r.machine||'').trim();
        const fac = String(r.factory||'').trim();
        const shift = String(r.shift||'').trim();
        if (!mid||!fac||!shift) return;
        const key = `${fac}|${shift}`;
        if (!dailyDone[key]) dailyDone[key] = new Set();
        dailyDone[key].add(mid);
    });

    // PM done sets: fac → Set<machineId>
    const pmDone = {};
    _clPmDashRows.forEach(r => {
        const mid = String(r.machineId||r.machine||'').trim();
        const fac = String(r.factory||'').trim();
        if (!mid||!fac) return;
        if (!pmDone[fac]) pmDone[fac] = new Set();
        pmDone[fac].add(mid);
    });

    const SHIFTS = [{ k:'เช้า', icon:'🌅' }, { k:'ดึก', icon:'🌙' }];

    FACS.forEach(({ key: fac, dailyId, pmId }) => {
        // ── Daily ──
        const dailyM = clMachinesFor(fac, '').filter(m => {
            const id = String(m.id||m.machineId||m.machine_id||'').trim();
            const plan = _clPmPlans[id] || {};
            return plan.dailyEnabled !== false && plan.dailyEnabled !== 0 && plan.dailyEnabled !== '0';
        });
        const dailyTotal = dailyM.length;
        const dailyHtml = dailyTotal === 0
            ? '<p class="text-xs text-gray-400">ไม่มีเครื่องในแผน</p>'
            : SHIFTS.map(({ k, icon }) => {
                const done = dailyDone[`${fac}|${k}`]?.size || 0;
                const pct  = Math.round(done / dailyTotal * 100);
                const rem  = dailyTotal - done;
                const bar  = pct === 100 ? '#27ae60' : pct > 0 ? '#e67e22' : '#bdc3c7';
                const tc   = pct === 100 ? 'text-green-600' : pct > 0 ? 'text-orange-500' : 'text-gray-400';
                return `<div class="mb-3 last:mb-0">
                    <div class="flex justify-between mb-1 text-xs">
                        <span class="font-bold text-gray-700">${icon} กะ${k}</span>
                        <span class="font-bold ${tc}">${done}/${dailyTotal}</span>
                    </div>
                    <div class="relative h-5 bg-gray-100 rounded-full overflow-hidden">
                        <div class="h-full rounded-full transition-all" style="width:${pct}%;background:${bar}"></div>
                        <span class="absolute inset-0 flex items-center justify-center text-xs font-bold ${pct>45?'text-white':'text-gray-500'}">${pct}%</span>
                    </div>
                    <div class="flex justify-between mt-1 text-xs">
                        <span class="text-green-600">✅ ${done} เครื่อง</span>
                        <span class="${rem>0?'text-red-400':'text-gray-300'}">⏳ ${rem} เครื่อง</span>
                    </div>
                </div>`;
            }).join('');
        const dEl = document.getElementById(dailyId);
        if (dEl) dEl.innerHTML = dailyHtml;

        // ── PM ──
        const pmM = clMachinesFor(fac, '').filter(m => {
            const id = String(m.id||m.machineId||m.machine_id||'').trim();
            return clIsPmDueInMonth(id, yr, mo - 1);
        });
        const pmTotal = pmM.length;
        const pmDoneCount = pmDone[fac]?.size || 0;
        const pmPct = pmTotal ? Math.round(pmDoneCount / pmTotal * 100) : 0;
        const pmRem = pmTotal - pmDoneCount;
        const pmBar = pmPct === 100 ? '#27ae60' : pmPct > 0 ? '#e67e22' : '#bdc3c7';
        const pmTc  = pmPct === 100 ? 'text-green-600' : pmPct > 0 ? 'text-orange-500' : 'text-gray-400';
        const pmHtml = pmTotal === 0
            ? '<p class="text-xs text-gray-400">ไม่มี PM กำหนดเดือนนี้</p>'
            : `<div class="flex justify-between mb-1 text-xs">
                <span class="font-bold text-gray-700">🔧 PM กำหนดเดือนนี้</span>
                <span class="font-bold ${pmTc}">${pmDoneCount}/${pmTotal}</span>
            </div>
            <div class="relative h-5 bg-gray-100 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all" style="width:${pmPct}%;background:${pmBar}"></div>
                <span class="absolute inset-0 flex items-center justify-center text-xs font-bold ${pmPct>45?'text-white':'text-gray-500'}">${pmPct}%</span>
            </div>
            <div class="flex justify-between mt-1 text-xs">
                <span class="text-green-600">✅ เสร็จ ${pmDoneCount} เครื่อง</span>
                <span class="${pmRem>0?'text-red-400':'text-gray-300'}">⏳ ค้าง ${pmRem} เครื่อง</span>
            </div>`;
        const pEl = document.getElementById(pmId);
        if (pEl) pEl.innerHTML = pmHtml;
    });
}

async function loadClHubRecent() {
    const el = document.getElementById('cl-hub-recent');
    if (!el) return;
    el.innerHTML = '<p class="text-gray-400 text-center py-4">กำลังโหลด...</p>';
    try {
        const data = await clFetch({ action:'getChecklists', factory:'', area:'', type:'', month:'', year:'' });
        const all = data.data || [];
        _clChecklists = all.slice(0, 10);
        // update hub stats
        const today = new Date().toISOString().slice(0,10);
        const ym    = today.slice(0,7);
        const todayCt = all.filter(r => r.date === today).length;
        const monthCt = all.filter(r => (r.date||'').startsWith(ym)).length;
        const stToday = document.getElementById('cl-hub-stat-today');
        const stMonth = document.getElementById('cl-hub-stat-month');
        if (stToday) stToday.textContent = `📋 วันนี้: ${todayCt}`;
        if (stMonth) stMonth.textContent = `📊 เดือนนี้: ${monthCt}`;
        renderClHubRecent();
    } catch(e) {
        el.innerHTML = '<p class="text-red-400 text-center py-4">โหลดข้อมูลล้มเหลว</p>';
    }
}
function renderClHubRecent() {
    const el = document.getElementById('cl-hub-recent');
    if (!el) return;
    if (!_clChecklists.length) { el.innerHTML = '<p class="text-gray-400 text-center py-8">ยังไม่มี Checklist</p>'; return; }
    const rows = _clChecklists.map((r, idx) => `
        <tr class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer" onclick="openClDetail(_clChecklists[${idx}])">
            <td class="px-3 py-2 font-mono text-xs text-gray-500">${r.id||'—'}</td>
            <td class="px-3 py-2 text-xs">${r.type==='pm'?'🔧 PM':'📋 Daily'}</td>
            <td class="px-3 py-2 text-xs">${r.date||'—'}</td>
            <td class="px-3 py-2 text-xs">${r.machineName||r.machine||'—'}</td>
            <td class="px-3 py-2">${clResultBadge(r.overallResult)}</td>
        </tr>`).join('');
    el.innerHTML = `<table class="w-full text-sm"><thead><tr class="bg-gray-50"><th class="text-left px-3 py-2 text-xs font-bold text-gray-400">Tracking</th><th class="text-left px-3 py-2 text-xs font-bold text-gray-400">ประเภท</th><th class="text-left px-3 py-2 text-xs font-bold text-gray-400">วันที่</th><th class="text-left px-3 py-2 text-xs font-bold text-gray-400">เครื่องจักร</th><th class="text-left px-3 py-2 text-xs font-bold text-gray-400">ผล</th></tr></thead><tbody>${rows}</tbody></table>`;
}

// ---- QR KIOSK (legacy redirect — ส่งต่อเข้า scan flow แทน) ----
async function enterDailyKiosk(machineId, token) {
    document.body.classList.add('kiosk-mode');
    showLoading('กำลังโหลดฟอร์ม…');
    try {
        if (!machineMaster.length) await loadMachineMaster();
        try { const d = await clFetch({ action:'getDailyDefault' }); _clDailyDefault = d.data?.items || []; } catch(e) {}
        try { const p = await clFetch({ action:'getPmPlans', factory:'', area:'' }); (p.data||[]).forEach(r => _clPmPlans[r.machineId] = r); } catch(e) {}
        const m = machineMaster.find(x => (x.id||x.machineId||x.machine_id||'') === machineId);
        if (!m) {
            hideLoading();
            document.body.innerHTML = '<div style="padding:40px;text-align:center;font-family:sans-serif"><h2 style="color:#c0392b">❌ ไม่พบเครื่องจักรรหัส ' + machineId + '</h2></div>';
            return;
        }
        await goClForm('daily', m.factory||'', m.area||'');
        setTimeout(() => {
            const msel = document.getElementById('clf-machine');
            if (msel) { msel.value = machineId; clfMachineChange(); }
            ['clf-fac','clf-area','clf-machine','clf-date'].forEach(id => {
                const el = document.getElementById(id); if (el) el.disabled = true;
            });
        }, 150);
    } finally { hideLoading(); }
}

// ---- FORM ----
async function goClForm(type, prefillFac, prefillArea) {
    if (!machineMaster.length) await loadMachineMaster();
    // ปลดล็อก clf-* ที่อาจค้าง disabled จากการสแกน QR รอบก่อน
    ['clf-date','clf-fac','clf-area','clf-machine','clf-inspector'].forEach(id => {
        const el = document.getElementById(id); if (el) el.disabled = false;
    });
    const fac  = prefillFac  || document.getElementById('cl-hub-fac')?.value  || '';
    const area = prefillArea || document.getElementById('cl-hub-area')?.value || '';
    document.getElementById('clf-type').value = type; // เซ็ตก่อน switchTab เพื่อให้ updateNavActive ไฮไลต์ถูก
    switchTab('cl-form');
    const lbl = document.getElementById('clf-type-label');
    if (lbl) {
        lbl.textContent = type === 'pm' ? '🔧 PM Checklist' : '✅ ตรวจประจำวัน';
        lbl.className = 'inline-block px-3 py-1.5 rounded-full text-xs font-bold ' +
            (type === 'pm' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700');
    }
    document.getElementById('clf-date').value = new Date().toISOString().slice(0,10);
    clFillFacSelect('clf-fac', fac);
    clfFacChange(area);
    document.getElementById('clf-inspector').value = currentUser.name || '';
    document.getElementById('clf-remark').value = '';
    // กะเช้า/ดึก — แสดงเฉพาะ daily, ตั้งค่า default ตามเวลา
    document.getElementById('clf-shift-wrap').classList.toggle('hidden', type !== 'daily');
    document.querySelectorAll('input[name="clf-shift"]').forEach(r => r.checked = false);
    if (type === 'daily') {
        const hr = new Date().getHours();
        const defShift = (hr >= 6 && hr < 18) ? 'เช้า' : 'ดึก';
        const dr = document.querySelector(`input[name="clf-shift"][value="${defShift}"]`);
        if (dr) dr.checked = true;
    }
    _clfOverallImages = [];
    clfRenderItems();
}
function clfTypeChange() { clfRenderItems(); }
function clfFacChange(preselArea) {
    const fac  = document.getElementById('clf-fac')?.value || '';
    const area = preselArea || '';
    const el   = document.getElementById('clf-area');
    if (!el) return;
    el.innerHTML = '<option value="">-- เลือก Area --</option>';
    clAreaOptions(fac).forEach(a => {
        const o = document.createElement('option');
        o.value = o.textContent = a;
        if (a === area) o.selected = true;
        el.appendChild(o);
    });
    clfAreaChange();
}
function clfAreaChange() {
    const fac  = document.getElementById('clf-fac')?.value  || '';
    const area = document.getElementById('clf-area')?.value || '';
    clFillMachineSelect('clf-machine', fac, area, '');
    clfRenderItems();
}
function clfMachineChange() { clfRenderItems(); }
function clfGetItems() {
    const type      = document.getElementById('clf-type')?.value || 'daily';
    const machineId = document.getElementById('clf-machine')?.value || '';
    if (type === 'daily') {
        const custom = clResolveDailyItems(machineId);
        if (custom) return custom.map(i => ({ ...i }));
        // fallback: _clDailyDefault from DB, then hardcoded CL_DAILY_DEFAULT
        return (_clDailyDefault.length ? _clDailyDefault : CL_DAILY_DEFAULT).map(i => ({ ...i }));
    } else {
        // PM: flatten tree from DB cache
        const plan = _clPmPlans[machineId];
        if (plan && Array.isArray(plan.pmItems) && plan.pmItems.length > 0) {
            const items = [];
            const walk = (node, prefix) => {
                if (!node.children || !node.children.length) {
                    items.push({ id: 'pm_' + prefix.replace(/\./g,'_'), label: prefix + ' ' + (node.label||node.text||'') });
                } else {
                    node.children.forEach((ch, j) => walk(ch, prefix + '.' + (j+1)));
                }
            };
            plan.pmItems.forEach((n,i) => walk(n, String(i+1)));
            return items;
        }
        // fallback to hardcoded defaults
        const items = [];
        CL_PM_DEFAULT.forEach(cat => {
            cat.items.forEach(label => {
                items.push({ id: 'pm_' + label.replace(/\s+/g,'_'), label: `[${cat.sub}] ${label}` });
            });
        });
        return items;
    }
}
function clfRenderItems() {
    const tbody = document.getElementById('clf-items-body');
    const machineId = document.getElementById('clf-machine')?.value || '';
    const type = document.getElementById('clf-type')?.value || 'daily';
    const isDaily = type === 'daily';
    // toggle กล่องรูปถ่ายรวม (daily เท่านั้น)
    const ovBox = document.getElementById('clf-overall-photos');
    if (ovBox) { ovBox.classList.toggle('hidden', !isDaily); if (isDaily) clfOverallRender(); }
    if (!machineId) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-gray-400 py-8">กรุณาเลือกเครื่องจักรและประเภทการตรวจสอบ</td></tr>';
        _clfItemImages = {};
        clfUpdateProgress();
        return;
    }
    _clfItemImages = {};
    const items = clfGetItems();
    tbody.innerHTML = items.map((item, idx) => `
        <tr class="border-b border-gray-100" id="clf-row-${item.id}">
            <td class="px-4 py-2.5 text-gray-400 text-xs">${idx+1}</td>
            <td class="px-4 py-2.5 text-sm">${item.label}</td>
            ${['ok','ng','fix','na'].map(v => `
            <td class="text-center px-2 py-2.5">
                <input type="radio" name="clf_item_${item.id}" value="${v}" onchange="clfUpdateProgress()"
                    class="w-4 h-4 cursor-pointer accent-${v==='ok'?'green':v==='ng'?'red':v==='fix'?'yellow':'gray'}-500">
            </td>`).join('')}
            <td class="text-center px-2 py-2">
                ${isDaily ? '' : `<button type="button" id="clf-img-btn-${item.id}" onclick="clfItemPickImage('${item.id}')"
                    class="text-xs px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100">📷</button>`}
            </td>
            <td class="px-2 py-2">
                <input type="text" id="clf-remark-${item.id}" placeholder="หมายเหตุ..."
                    class="w-full border border-gray-100 rounded px-2 py-1 text-xs focus:outline-none focus:border-gray-300 bg-transparent min-w-[100px]">
            </td>
        </tr>`).join('');
    clfUpdateProgress();
}
function clfItemPickImage(itemId) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = () => {
        const files = [...inp.files];
        if (!files.length) return;
        if (!_clfItemImages[itemId]) _clfItemImages[itemId] = [];
        let pending = files.length;
        files.forEach(f => {
            const r = new FileReader();
            r.onload = () => compressImage(r.result, d => {
                _clfItemImages[itemId].push({ data: d });
                if (--pending === 0) clfUpdateImgBtn(itemId);
            });
            r.readAsDataURL(f);
        });
    };
    inp.click();
}
function clfOverallPick() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.capture = 'environment'; inp.multiple = true;
    inp.onchange = () => {
        const files = [...inp.files]; if (!files.length) return;
        let pending = files.length;
        files.forEach(f => { const r = new FileReader();
            r.onload = () => compressImage(r.result, d => { _clfOverallImages.push(d); if (--pending===0) clfOverallRender(); });
            r.readAsDataURL(f); });
    };
    inp.click();
}
function clfOverallRemove(i) { _clfOverallImages.splice(i,1); clfOverallRender(); }
function clfOverallRender() {
    const wrap = document.getElementById('clf-overall-thumbs');
    const cnt  = document.getElementById('clf-overall-count');
    if (cnt) cnt.textContent = _clfOverallImages.length + ' รูป';
    if (!wrap) return;
    wrap.innerHTML = _clfOverallImages.map((d,i) => `
        <div class="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200">
            <img src="${d}" class="w-full h-full object-cover">
            <button type="button" onclick="clfOverallRemove(${i})" class="absolute top-0 right-0 bg-red-500 text-white text-xs w-5 h-5 leading-5 text-center">✕</button>
        </div>`).join('');
}
function clfUpdateImgBtn(itemId) {
    const btn = document.getElementById('clf-img-btn-' + itemId);
    if (!btn) return;
    const n = (_clfItemImages[itemId]||[]).length;
    btn.textContent = n ? `📷 ${n}` : '📷';
    btn.className = n
        ? 'text-xs px-2 py-1 rounded border border-blue-400 bg-blue-100 text-blue-700 hover:bg-blue-200'
        : 'text-xs px-2 py-1 rounded border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100';
}
function clfUpdateProgress() {
    const items = clfGetItems();
    const answered = items.filter(i => document.querySelector(`input[name="clf_item_${i.id}"]:checked`)).length;
    const total    = items.length;
    const pct      = total ? Math.round(answered/total*100) : 0;
    const bar  = document.getElementById('clf-progress-bar');
    const text = document.getElementById('clf-progress-text');
    const badge = document.getElementById('clf-result-badge');
    if (bar)  bar.style.width = pct + '%';
    if (text) text.textContent = `${answered} / ${total}`;
    if (badge) {
        const ngCount  = items.filter(i => {const r=document.querySelector(`input[name="clf_item_${i.id}"]:checked`);return r&&r.value==='ng';}).length;
        const fixCount = items.filter(i => {const r=document.querySelector(`input[name="clf_item_${i.id}"]:checked`);return r&&r.value==='fix';}).length;
        let result = answered === total ? (ngCount>0?'FAIL':fixCount>0?'FIX':'PASS') : '—';
        if (result === 'PASS') { badge.className='text-xs font-bold px-3 py-1 rounded-full bg-green-100 text-green-700'; badge.textContent='✅ PASS'; }
        else if (result === 'FAIL') { badge.className='text-xs font-bold px-3 py-1 rounded-full bg-red-100 text-red-700'; badge.textContent='❌ FAIL'; }
        else if (result === 'FIX') { badge.className='text-xs font-bold px-3 py-1 rounded-full bg-yellow-100 text-yellow-700'; badge.textContent='🔧 FIX'; }
        else { badge.className='text-xs font-bold px-3 py-1 rounded-full bg-gray-100 text-gray-500'; badge.textContent='—'; }
    }
}
async function saveChecklistForm() {
    const machineId = document.getElementById('clf-machine')?.value || '';
    const inspector = (document.getElementById('clf-inspector')?.value || '').trim();
    const type      = document.getElementById('clf-type')?.value || 'daily';
    if (!machineId) { showToast('กรุณาเลือกเครื่องจักร', 'warn'); return; }
    if (!inspector) { showToast('กรุณากรอกชื่อผู้ตรวจสอบ', 'warn'); return; }
    if (type === 'daily' && !document.querySelector('input[name="clf-shift"]:checked')) { showToast('กรุณาเลือกกะ', 'warn'); return; }
    if (!currentUser.username) { showToast('กรุณาเข้าสู่ระบบก่อนบันทึก', 'warn'); openLogin(); return; }
    if (type === 'daily' && _clfOverallImages.length < 2) { showToast('กรุณาแนบรูปถ่ายรวมอย่างน้อย 2 รูป', 'warn'); return; }
    const items = clfGetItems();
    const answered = items.filter(i => document.querySelector(`input[name="clf_item_${i.id}"]:checked`));
    if (answered.length < items.length) { showToast('กรุณาตอบรายการให้ครบทุกข้อ', 'warn'); return; }
    const ok  = items.filter(i => document.querySelector(`input[name="clf_item_${i.id}"]:checked`)?.value === 'ok').length;
    const ng  = items.filter(i => document.querySelector(`input[name="clf_item_${i.id}"]:checked`)?.value === 'ng').length;
    const fix = items.filter(i => document.querySelector(`input[name="clf_item_${i.id}"]:checked`)?.value === 'fix').length;
    const machine = machineMaster.find(m => m.id === machineId) || {};
    const machineName = machine.name || machine.machineName || machineId;
    const totalImgs = type === 'daily' ? _clfOverallImages.length : Object.values(_clfItemImages).reduce((s, arr) => s + arr.length, 0);
    document.getElementById('clf-confirm-summary').innerHTML =
        `<strong>${type === 'pm' ? '🔧 PM' : '📋 Daily'} Checklist</strong><br>
        เครื่องจักร: <strong>${machineName}</strong><br>
        รายการ: ${items.length} ข้อ &nbsp;
        <span class="text-green-600 font-bold">✅ OK ${ok}</span> /
        <span class="text-red-600 font-bold">❌ NG ${ng}</span> /
        <span class="text-yellow-600 font-bold">🔧 FIX ${fix}</span><br>
        ผลรวม: ${ng>0?'<span class="text-red-600 font-bold">❌ FAIL</span>':fix>0?'<span class="text-yellow-600 font-bold">🔧 FIX</span>':'<span class="text-green-600 font-bold">✅ PASS</span>'}
        ${totalImgs ? `<br>รูปถ่าย: <span class="text-blue-600 font-bold">📷 ${totalImgs} รูป</span>` : ''}`;
    document.getElementById('modal-clf-confirm').classList.remove('hidden');
}
async function saveChecklistConfirm() {
    const inspector = currentUser.name;
    if (!inspector) { showToast('กรุณาเข้าสู่ระบบก่อนบันทึก', 'warn'); return; }
    document.getElementById('modal-clf-confirm').classList.add('hidden');
    const machineId   = document.getElementById('clf-machine')?.value || '';
    const fac         = document.getElementById('clf-fac')?.value || '';
    const area        = document.getElementById('clf-area')?.value || '';
    const type        = document.getElementById('clf-type')?.value || 'daily';
    const date        = document.getElementById('clf-date')?.value || '';
    const remark      = document.getElementById('clf-remark')?.value || '';
    const machine     = machineMaster.find(m => m.id === machineId) || {};
    const machineName = machine.name || machine.machineName || machineId;
    const items = clfGetItems();
    const resultsArr = items.map(i => {
        const r   = document.querySelector(`input[name="clf_item_${i.id}"]:checked`);
        const rem = (document.getElementById('clf-remark-' + i.id)?.value || '').trim();
        const imgs = (_clfItemImages[i.id] || []).map(x => x.data);
        return { id: i.id, label: i.label, result: r ? r.value : 'na', remark: rem, images: imgs };
    });
    // รูปถ่ายรวม (daily only) — ฝังเป็น entry พิเศษใน resultsArr
    if (type === 'daily' && _clfOverallImages.length) {
        resultsArr.push({ id:'__overall__', label:'รูปถ่ายรวม', result:'na', remark:'', images: _clfOverallImages.slice() });
    }
    const ok  = resultsArr.filter(r => r.result === 'ok').length;
    const ng  = resultsArr.filter(r => r.result === 'ng').length;
    const fix = resultsArr.filter(r => r.result === 'fix').length;
    const na  = resultsArr.filter(r => r.result === 'na' && r.id !== '__overall__').length;
    const overallResult = ng > 0 ? 'FAIL' : fix > 0 ? 'FIX' : 'PASS';
    const btn = document.getElementById('clf-save-btn');
    btn.disabled = true; btn.textContent = '⏳ กำลังบันทึก...';
    showLoading('กำลังบันทึก Checklist…');
    try {
        const res = await clPost({
            action:'saveChecklist', type, date,
            shift: (document.querySelector('input[name="clf-shift"]:checked')?.value || '-'),
            factory:fac, area, machineId, machineName, inspector, remark,
            results: resultsArr, ok, ng, fix, na, overallResult,
        });
        if (res.success) {
            showSavedModal(res.tracking || '', 'บันทึก Checklist สำเร็จ', 'เลขที่บันทึก');
        } else {
            showToast('บันทึกล้มเหลว: ' + (res.error||'unknown'), 'error');
        }
    } catch(e) {
        showToast('เชื่อมต่อ GAS ล้มเหลว', 'error');
    } finally {
        hideLoading();
        btn.disabled = false; btn.textContent = '💾 บันทึก Checklist';
    }
}

// ---- LIST ----
let _clListRows = [];   // cache rows after GAS fetch (for filterClListTable + openClDetail)

function filterClListTable() {
    const q = (document.getElementById('cll-machine-q')?.value || '').trim().toLowerCase();
    const tbody = document.getElementById('cll-body');
    if (!tbody || !_clListRows.length) return;
    const visible = q
        ? _clListRows.filter(r =>
            String(r.machineId || r.machine || '').toLowerCase().includes(q) ||
            String(r.machineName || '').toLowerCase().includes(q))
        : _clListRows;
    const countEl = document.getElementById('cll-count');
    if (countEl) countEl.textContent = `${visible.length} / ${_clListRows.length} รายการ`;
    if (!visible.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">ไม่พบข้อมูล</td></tr>';
        return;
    }
    // re-index against _clListRows so openClDetail still works
    tbody.innerHTML = visible.map(r => {
        const idx = _clListRows.indexOf(r);
        return `<tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-2 font-mono text-xs text-gray-500">${r.id||'—'}</td>
            <td class="px-3 py-2 text-xs">${r.type==='pm'?'🔧 PM':'📋 Daily'}</td>
            <td class="px-3 py-2 text-xs">${r.date||'—'}</td>
            <td class="px-3 py-2 text-xs">${r.machineName||r.machine||'—'}</td>
            <td class="px-3 py-2 text-xs">${r.inspector||'—'}</td>
            <td class="px-3 py-2 text-center">${clResultBadge(r.overallResult)}</td>
            <td class="px-3 py-2 text-center"><button onclick="openClDetail(_clListRows[${idx}])" class="text-xs text-blue-500 hover:underline">ดู</button></td>
        </tr>`;
    }).join('');
}

async function initClList() {
    if (!machineMaster.length) await loadMachineMaster();
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    document.getElementById('cll-month').value = ym;
    clFillFacSelect('cll-fac', '');
    cllFacChange();
    loadClList();
}
function cllFacChange() {
    const fac = document.getElementById('cll-fac')?.value || '';
    clFillAreaSelect('cll-area', fac, '');
}
async function loadClList() {
    const tbody = document.getElementById('cll-body');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">กำลังโหลด...</td></tr>';
    const fac   = document.getElementById('cll-fac')?.value || '';
    const area  = document.getElementById('cll-area')?.value || '';
    const type  = document.getElementById('cll-type')?.value || '';
    const month = document.getElementById('cll-month')?.value || '';
    const [year, mon] = month ? month.split('-') : ['', ''];
    const overdue = document.getElementById('cll-overdue')?.value || '';
    try {
        // overdue mode: แสดงเครื่องที่ยังไม่ตรวจแทนรายการที่คีย์แล้ว
        if (overdue) {
            const today = new Date().toISOString().slice(0,10);
            const nowY  = today.slice(0,4); const nowM = today.slice(5,7);
            if (overdue === 'pm') {
                // โหลดผล PM เดือนนี้ แล้วหาเครื่องที่ถึงกำหนดแต่ไม่มีผล
                const doneData = await clFetch({ action:'getChecklists', factory:fac, area, type:'pm', month:nowM, year:nowY });
                const doneIds  = new Set((doneData.data||[]).map(r => r.machineId||r.machine||''));
                const due = clMachinesDueForPm(fac, area, parseInt(nowY), parseInt(nowM)-1)
                    .filter(m => !doneIds.has(m.id||m.machineId||m.machine_id||''));
                if (!due.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">✅ ไม่มีรายการค้าง PM เดือนนี้</td></tr>'; return; }
                tbody.innerHTML = due.map(m => {
                    const id = m.id||m.machineId||m.machine_id||''; const name = m.name||m.machineName||id;
                    return `<tr class="border-b border-gray-100 hover:bg-red-50">
                        <td class="px-4 py-2 font-mono text-xs text-gray-500">—</td>
                        <td class="px-3 py-2 text-xs">🔧 PM</td>
                        <td class="px-3 py-2 text-xs text-red-500 font-bold">⏰ ค้าง</td>
                        <td class="px-3 py-2 text-xs">${name} <span class="text-gray-400">(${id})</span></td>
                        <td class="px-3 py-2 text-xs">—</td>
                        <td class="px-3 py-2 text-center"><span class="text-xs text-red-500 font-bold">ยังไม่ PM</span></td>
                        <td class="px-3 py-2"></td></tr>`;
                }).join('');
            } else {
                // daily overdue: เครื่องที่วันนี้กะนี้ยังไม่ตรวจ
                const shift = overdue === 'daily-morning' ? 'เช้า' : 'ดึก';
                const doneData = await clFetch({ action:'getChecklists', factory:fac, area, type:'daily', month:nowM, year:nowY });
                const doneIds  = new Set((doneData.data||[]).filter(r => r.date===today && r.shift===shift).map(r => r.machineId||r.machine||''));
                const allM = clMachinesFor(fac, area).filter(m => {
                    const plan = _clPmPlans[m.id||m.machineId||m.machine_id||''] || {};
                    return plan.dailyEnabled !== false && plan.dailyEnabled !== 0 && plan.dailyEnabled !== '0';
                });
                const pending = allM.filter(m => !doneIds.has(m.id||m.machineId||m.machine_id||''));
                if (!pending.length) { tbody.innerHTML = `<tr><td colspan="7" class="text-center text-gray-400 py-8">✅ ตรวจครบทุกเครื่องแล้ว (กะ${shift})</td></tr>`; return; }
                tbody.innerHTML = pending.map(m => {
                    const id = m.id||m.machineId||m.machine_id||''; const name = m.name||m.machineName||id;
                    return `<tr class="border-b border-gray-100 hover:bg-orange-50">
                        <td class="px-4 py-2 font-mono text-xs text-gray-500">—</td>
                        <td class="px-3 py-2 text-xs">📋 Daily</td>
                        <td class="px-3 py-2 text-xs text-orange-500 font-bold">${today} (${shift})</td>
                        <td class="px-3 py-2 text-xs">${name} <span class="text-gray-400">(${id})</span></td>
                        <td class="px-3 py-2 text-xs">—</td>
                        <td class="px-3 py-2 text-center"><span class="text-xs text-orange-500 font-bold">ยังไม่ตรวจ</span></td>
                        <td class="px-3 py-2"></td></tr>`;
                }).join('');
            }
            return;
        }
        const data = await clFetch({ action:'getChecklists', factory:fac, area, type, month:mon||'', year:year||'' });
        _clListRows = data.data || [];
        if (!_clListRows.length) { tbody.innerHTML = '<tr><td colspan="7" class="text-center text-gray-400 py-8">ไม่พบข้อมูล</td></tr>'; return; }
        filterClListTable(); // render + apply machine search filter
    } catch(e) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-red-400 py-8">โหลดข้อมูลล้มเหลว</td></tr>';
    }
}

// ---- DETAIL MODAL ----
function openClDetail(r) {
    const m = document.getElementById('modal-cl-detail');
    if (!m) return;
    document.getElementById('mcd-title').textContent = '📋 ' + (r.type==='pm'?'PM Checklist':'Daily Checklist');
    document.getElementById('mcd-tracking').textContent = r.id || '';
    document.getElementById('mcd-date').textContent     = r.date || '—';
    document.getElementById('mcd-shift').textContent    = r.shift || '—';
    document.getElementById('mcd-type').textContent     = r.type==='pm'?'PM':'Daily';
    document.getElementById('mcd-machine').textContent  = r.machineName || r.machine || '—';
    document.getElementById('mcd-inspector').textContent= r.inspector || '—';
    document.getElementById('mcd-result').innerHTML     = clResultBadge(r.overallResult);
    document.getElementById('mcd-ok-count').textContent  = `✅ OK: ${r.ok||0}`;
    document.getElementById('mcd-ng-count').textContent  = `❌ NG: ${r.ng||0}`;
    document.getElementById('mcd-fix-count').textContent = `🔧 FIX: ${r.fix||0}`;
    document.getElementById('mcd-na-count').textContent  = `— N/A: ${r.na||0}`;
    const items = Array.isArray(r.results) ? r.results : [];
    const tbody = document.getElementById('mcd-items-body');
    tbody.innerHTML = items.map(i => {
        const color  = i.result==='ok'?'text-green-600':i.result==='ng'?'text-red-600':i.result==='fix'?'text-yellow-600':'text-gray-400';
        const remHtml = i.remark ? `<div class="text-xs text-gray-400 mt-0.5 italic">${i.remark}</div>` : '';
        const imgIds  = Array.isArray(i.images) ? i.images.filter(Boolean) : [];
        const imgHtml = imgIds.length
            ? `<div class="flex flex-wrap gap-1 mt-1">${imgIds.map(id => `<button onclick="loadClDetailImage('${id}',this)" class="text-xs text-blue-500 hover:underline border border-blue-100 rounded px-1">📷 ดูรูป</button>`).join('')}</div>`
            : '';
        const extraHtml = (remHtml || imgHtml) ? `<div>${remHtml}${imgHtml}</div>` : '';
        return `<tr class="border border-gray-100">
            <td class="px-3 py-1.5 text-xs">${i.label||i.id}${extraHtml}</td>
            <td class="px-3 py-1.5 text-center text-xs font-bold ${color}">${(i.result||'—').toUpperCase()}</td>
            <td class="px-3 py-1.5 text-center text-xs text-gray-400">${imgIds.length ? `📷 ${imgIds.length}` : ''}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="3" class="text-center text-gray-400 py-4">ไม่มีข้อมูลรายการ</td></tr>';
    const remWrap = document.getElementById('mcd-remark-wrap');
    if (r.remark) { document.getElementById('mcd-remark').textContent = r.remark; remWrap.classList.remove('hidden'); }
    else remWrap.classList.add('hidden');
    m.classList.remove('hidden');
}

async function loadClDetailImage(fileId, btn) {
    btn.disabled = true; btn.textContent = '⏳';
    try {
        const d = await clFetch({ action:'getImage', id: fileId });
        if (d.success && d.dataUrl) {
            const img = document.createElement('img');
            img.src = d.dataUrl;
            img.className = 'w-24 h-16 object-cover rounded border border-gray-200 cursor-pointer';
            img.onclick = () => window.open(d.dataUrl, '_blank');
            btn.replaceWith(img);
        } else { btn.textContent = '❌'; }
    } catch(e) { btn.textContent = '❌'; btn.disabled = false; }
}

// ---- SUMMARY ----
async function initClSummary() {
    if (!machineMaster.length) await loadMachineMaster();
    const cy = new Date().getFullYear();
    const ys = document.getElementById('cls-year');
    if (ys && !ys.children.length) {
        for (let y = cy+1; y >= cy-3; y--) {
            const o = document.createElement('option');
            o.value = o.textContent = y;
            if (y === cy) o.selected = true;
            ys.appendChild(o);
        }
    }
    clFillFacSelect('cls-fac', '');
    loadClSummary();
}
async function loadClSummary() {
    const fac   = document.getElementById('cls-fac')?.value  || '';
    const year  = document.getElementById('cls-year')?.value  || String(new Date().getFullYear());
    const month = document.getElementById('cls-month')?.value || '';
    try {
        const data = await clFetch({ action:'getChecklists', factory:fac, area:'', type:'', month, year });
        const rows = data.data || [];
        renderClSummary(rows);
    } catch(e) {
        showToast('โหลดข้อมูล summary ล้มเหลว', 'error');
    }
}
function renderClSummary(rows) {
    const totalItems = rows.reduce((s,r) => s + (parseInt(r.ok)||0) + (parseInt(r.ng)||0) + (parseInt(r.fix)||0) + (parseInt(r.na)||0), 0);
    const totalOk    = rows.reduce((s,r) => s + (parseInt(r.ok)||0), 0);
    const totalNg    = rows.reduce((s,r) => s + (parseInt(r.ng)||0), 0);
    const totalFix   = rows.reduce((s,r) => s + (parseInt(r.fix)||0), 0);
    const passed     = rows.filter(r => r.overallResult === 'PASS').length;
    const compliance = rows.length ? Math.round(passed/rows.length*100) : 0;
    document.getElementById('cls-kpi-compliance').textContent = compliance + '%';
    document.getElementById('cls-kpi-total').textContent      = totalItems.toLocaleString();
    document.getElementById('cls-kpi-ng').textContent         = totalNg.toLocaleString();
    document.getElementById('cls-kpi-fix').textContent        = totalFix.toLocaleString();
    // Monthly breakdown
    const byMonth = {};
    rows.forEach(r => {
        const ym = (r.date||'').slice(0,7);
        if (!byMonth[ym]) byMonth[ym] = { pass:0, fail:0, fix:0 };
        if (r.overallResult === 'PASS') byMonth[ym].pass++;
        else if (r.overallResult === 'FAIL') byMonth[ym].fail++;
        else byMonth[ym].fix++;
    });
    const months = Object.keys(byMonth).sort();
    // chart
    const canvas = document.getElementById('cls-chart');
    if (canvas) {
        if (_clChartObj) { _clChartObj.destroy(); _clChartObj = null; }
        if (months.length && window.Chart) {
            _clChartObj = new window.Chart(canvas.getContext('2d'), {
                type:'bar',
                data: {
                    labels: months,
                    datasets: [
                        { label:'PASS', data: months.map(m=>byMonth[m].pass), backgroundColor:'#27ae60' },
                        { label:'FIX',  data: months.map(m=>byMonth[m].fix),  backgroundColor:'#e67e22' },
                        { label:'FAIL', data: months.map(m=>byMonth[m].fail), backgroundColor:'#c0392b' },
                    ]
                },
                options:{ responsive:true, plugins:{ legend:{ position:'bottom' } }, scales:{ x:{stacked:true}, y:{stacked:true} } }
            });
        } else {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0,0,canvas.width,canvas.height);
        }
    }
    // monthly table
    const tbl = document.getElementById('cls-monthly-table');
    if (!months.length) { tbl.innerHTML = '<p class="text-gray-400 text-center py-4">ยังไม่มีข้อมูล</p>'; return; }
    tbl.innerHTML = `<table class="w-full text-xs border-collapse">
        <thead><tr class="bg-gray-50"><th class="text-left px-2 py-1.5 border border-gray-200">เดือน</th><th class="text-center px-2 py-1.5 border border-gray-200 text-green-600">PASS</th><th class="text-center px-2 py-1.5 border border-gray-200 text-yellow-600">FIX</th><th class="text-center px-2 py-1.5 border border-gray-200 text-red-600">FAIL</th><th class="text-center px-2 py-1.5 border border-gray-200">Compliance</th></tr></thead>
        <tbody>${months.map(m => {
            const t = byMonth[m].pass + byMonth[m].fail + byMonth[m].fix;
            const c = t ? Math.round(byMonth[m].pass/t*100) : 0;
            return `<tr class="border-b border-gray-100"><td class="px-2 py-1.5 border border-gray-100">${m}</td><td class="text-center px-2 py-1.5 border border-gray-100 text-green-600">${byMonth[m].pass}</td><td class="text-center px-2 py-1.5 border border-gray-100 text-yellow-600">${byMonth[m].fix}</td><td class="text-center px-2 py-1.5 border border-gray-100 text-red-600">${byMonth[m].fail}</td><td class="text-center px-2 py-1.5 border border-gray-100 font-bold">${c}%</td></tr>`;
        }).join('')}</tbody></table>`;
}

// ---- CALENDAR ----
let _clCalDayMap = {}; // { day: [machineId, ...] }
let _clCalAllPmDates = {}; // raw getPmDates response for current month
let _clCalResults = {}; // { machineId_YYYY-MM-DD: overallResult }

async function initClCalendar() {
    if (!machineMaster.length) await loadMachineMaster();
    _clCalYear  = new Date().getFullYear();
    _clCalMonth = new Date().getMonth();
    clFillFacSelect('clcal-fac', '');
    clCalFillAreaSelect();
    updateClCalLabel();
    renderClCalendar();
}
function clCalFacChange() {
    clCalFillAreaSelect();
    renderClCalendar();
}
function clCalFillAreaSelect() {
    const fac = document.getElementById('clcal-fac')?.value || '';
    const sel = document.getElementById('clcal-area');
    if (!sel) return;
    sel.innerHTML = '<option value="">ทุก Area</option>';
    clAreaOptions(fac).forEach(a => {
        const o = document.createElement('option');
        o.value = o.textContent = a;
        sel.appendChild(o);
    });
}
function clCalShift(delta) {
    _clCalMonth += delta;
    if (_clCalMonth < 0) { _clCalMonth = 11; _clCalYear--; }
    if (_clCalMonth > 11) { _clCalMonth = 0;  _clCalYear++; }
    updateClCalLabel();
    renderClCalendar();
}
function updateClCalLabel() {
    const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    const el = document.getElementById('clcal-label');
    if (el) el.textContent = thMonths[_clCalMonth] + ' ' + (_clCalYear + 543);
}
async function renderClCalendar() {
    const fac  = document.getElementById('clcal-fac')?.value  || '';
    const area = document.getElementById('clcal-area')?.value || '';
    const machines = clMachinesDueForPm(fac, area, _clCalYear, _clCalMonth);
    const grid = document.getElementById('clcal-grid');
    if (!grid) return;
    const ym = `${_clCalYear}-${String(_clCalMonth+1).padStart(2,'0')}`;

    // load PM dates + checklist results for whole month
    try {
        const pd = await clFetch({ action:'getPmDates', monthKey: ym });
        _clCalAllPmDates = pd.data || {};
    } catch(e) { _clCalAllPmDates = {}; }
    _clCalResults = {};
    try {
        const nowM = String(_clCalMonth+1).padStart(2,'0');
        const cr = await clFetch({ action:'getChecklists', factory:fac, area, type:'pm', month:nowM, year:String(_clCalYear) });
        (cr.data||[]).forEach(r => {
            const mid = r.machineId || r.machine || '';
            if (mid && r.date) _clCalResults[`${mid}_${r.date}`] = r.overallResult;
        });
    } catch(e) {}

    // build dayMap: day -> [machineId,...]
    _clCalDayMap = {};
    machines.forEach(m => {
        const id  = m.id || m.machineId || m.machine_id || '';
        const key = clPmDateKey(id, _clCalYear, _clCalMonth);
        const val = _clCalAllPmDates[key] || '';
        String(val).split(',').map(Number).filter(Boolean).forEach(d => {
            (_clCalDayMap[d] = _clCalDayMap[d] || []).push(id);
        });
    });

    // update count badge
    const setMachines   = new Set(Object.values(_clCalDayMap).flat());
    const totalMachines = machines.length;
    const setCnt   = setMachines.size;
    const unsetCnt = Math.max(0, totalMachines - setCnt);
    const setCntEl   = document.getElementById('clcal-set-count');
    const unsetCntEl = document.getElementById('clcal-unset-count');
    if (setCntEl)   setCntEl.textContent   = setCnt;
    if (unsetCntEl) unsetCntEl.textContent = unsetCnt;

    // hide set-btn for users
    const setBtn = document.getElementById('clcal-set-btn');
    if (setBtn) setBtn.classList.toggle('hidden', !can('cl.edit'));

    // render calendar
    const firstDay    = new Date(_clCalYear, _clCalMonth, 1).getDay();
    const daysInMonth = new Date(_clCalYear, _clCalMonth+1, 0).getDate();
    const todayStr    = new Date().toISOString().slice(0,10);
    let html = '';
    for (let i = 0; i < firstDay; i++) html += '<div></div>';
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr  = `${ym}-${String(d).padStart(2,'0')}`;
        const isToday  = dateStr === todayStr;
        const pmIds    = _clCalDayMap[d] || [];
        const hasPm    = pmIds.length > 0;
        const pmDot    = hasPm ? 'bg-orange-400' : '';
        html += `<div class="relative flex flex-col items-center justify-start rounded-lg p-1 min-h-[2.5rem] cursor-pointer hover:bg-blue-50 ${isToday?'ring-2 ring-green-400 bg-green-50':''}" onclick="clCalClickDay(${d})">
            <span class="text-xs ${isToday?'font-bold text-green-700':''}">${d}</span>
            ${hasPm ? `<span class="text-[9px] font-bold text-orange-600 leading-none">${pmIds.length}</span>` : ''}
            <div class="flex gap-0.5 mt-0.5">${pmDot?`<span class="w-2 h-2 rounded-full ${pmDot}"></span>`:''}</div>
        </div>`;
    }
    grid.innerHTML = html;
}
function clCalClickDay(day) {
    const ids = _clCalDayMap[day] || [];
    const ym  = `${_clCalYear}-${String(_clCalMonth+1).padStart(2,'0')}`;
    const dateStr = `${ym}-${String(day).padStart(2,'0')}`;
    const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    document.getElementById('mcd-title').textContent = `📅 ${day} ${thMonths[_clCalMonth]} ${_clCalYear+543}`;
    const list = document.getElementById('mcd-list');
    if (!ids.length) {
        list.innerHTML = '<p class="text-sm text-gray-400 text-center py-4">ไม่มีเครื่องจักรที่กำหนด PM วันนี้</p>';
    } else {
        const today = new Date().toISOString().slice(0,10);
        list.innerHTML = ids.map(id => {
            const m    = machineMaster.find(x => (x.id||x.machineId||x.machine_id||'') === id) || {};
            const name = m.name || m.machineName || id;
            const res  = _clCalResults[`${id}_${dateStr}`];
            let badge;
            if (res === 'PASS')      badge = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✅ OK</span>';
            else if (res === 'FAIL') badge = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">❌ NG</span>';
            else if (res === 'FIX')  badge = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700">🔧 ซ่อมแล้ว</span>';
            else if (dateStr < today) badge = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-500">⏰ เลยกำหนด</span>';
            else badge = '<span class="text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">🕒 ยังไม่ PM</span>';
            return `<div class="flex items-center justify-between bg-blue-50 rounded-xl px-4 py-2.5 gap-3">
                <div class="flex-1 min-w-0">
                    <p class="text-sm font-bold text-gray-800">${name}</p>
                    <p class="text-xs text-gray-500">${id}</p>
                    <div class="mt-1">${badge}</div>
                </div>
                <button onclick="clCalGoPm('${id}','${dateStr}')" class="px-3 py-1.5 text-xs font-bold bg-blue-600 text-white rounded-lg hover:bg-blue-700 whitespace-nowrap flex-shrink-0">🔧 บันทึก PM</button>
            </div>`;
        }).join('');
    }
    document.getElementById('modal-cl-day').classList.remove('hidden');
}
function clCalGoPm(machineId, dateStr) {
    document.getElementById('modal-cl-day').classList.add('hidden');
    const m    = machineMaster.find(x => (x.id||x.machineId||x.machine_id||'') === machineId) || {};
    const fac  = m.factory || '';
    const area = m.area    || '';
    goClForm('pm', fac, area);
    // prefill after goClForm sets up the form
    setTimeout(() => {
        document.getElementById('clf-date').value = dateStr;
        // fill machine select
        const msel = document.getElementById('clf-machine');
        if (msel) { msel.value = machineId; clfMachineChange(); }
    }, 100);
}
function openClSetDates() {
    if (!can('cl.edit')) return;
    const fac  = document.getElementById('clcal-fac')?.value  || '';
    const area = document.getElementById('clcal-area')?.value || '';
    const machines = clMachinesDueForPm(fac, area, _clCalYear, _clCalMonth);
    const ym = `${_clCalYear}-${String(_clCalMonth+1).padStart(2,'0')}`;
    const thMonths = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
    document.getElementById('mcsd-info').textContent = `${thMonths[_clCalMonth]} ${_clCalYear+543} — ${machines.length} เครื่องจักร`;
    const listEl = document.getElementById('mcsd-machine-list');
    listEl.innerHTML = machines.map(m => {
        const id   = m.id || m.machineId || m.machine_id || '';
        const name = m.name || m.machineName || id;
        const key  = clPmDateKey(id, _clCalYear, _clCalMonth);
        const existing = String(_clCalAllPmDates[key] || '');
        const hasDate  = existing.trim() !== '';
        return `<div class="flex items-center gap-3 p-3 rounded-xl border ${hasDate?'border-blue-200 bg-blue-50':'border-gray-200 bg-gray-50'}">
            <div class="flex-1 min-w-0">
                <p class="text-sm font-bold text-gray-800 truncate">${name}</p>
                <p class="text-xs text-gray-500">${id}</p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
                ${hasDate ? '<span class="text-[10px] font-bold text-blue-600 bg-blue-100 px-2 py-0.5 rounded-full">กำหนดแล้ว</span>' : '<span class="text-[10px] text-gray-400">ยังไม่กำหนด</span>'}
                <input type="text" data-id="${id}" data-orig="${existing}" placeholder="เช่น 5,12,20"
                    value="${existing}"
                    class="mcsd-date-input w-28 border border-gray-300 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-blue-400">
            </div>
        </div>`;
    }).join('');
    document.getElementById('modal-cl-set-dates').classList.remove('hidden');
}
async function saveClPmDates() {
    const inputs  = [...document.querySelectorAll('.mcsd-date-input')];
    const changed = inputs.filter(inp => inp.value.trim() !== (inp.dataset.orig || '').trim());
    // confirm if any existing dates are being changed
    const wasSet  = changed.filter(inp => (inp.dataset.orig||'').trim() !== '');
    if (wasSet.length) {
        const names = wasSet.map(inp => {
            const m = machineMaster.find(x => (x.id||x.machineId||x.machine_id||'') === inp.dataset.id) || {};
            return (m.name || m.machineName || inp.dataset.id) + ` (${inp.dataset.orig} → ${inp.value.trim()||'ล้างออก'})`;
        }).join('\n');
    }
    if (!changed.length) { document.getElementById('modal-cl-set-dates').classList.add('hidden'); return; }
    const dates = {};
    changed.forEach(inp => {
        const id  = inp.dataset.id;
        const key = clPmDateKey(id, _clCalYear, _clCalMonth);
        const val = inp.value.trim().split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n) && n > 0).join(',');
        dates[key] = val;
        // update local cache
        _clCalAllPmDates[key] = val;
        _clPmDates[key] = val ? val.split(',').map(Number) : [];
    });
    showLoading('กำลังบันทึก…');
    try {
        const res = await clPost({ action:'savePmDates', dates });
        if (res.success) showToast('บันทึกวัน PM เรียบร้อย', 'success');
        else showToast('บันทึกล้มเหลว: ' + (res.error||''), 'error');
    } catch(e) { showToast('บันทึกล้มเหลว', 'error'); }
    finally { hideLoading(); }
    document.getElementById('modal-cl-set-dates').classList.add('hidden');
    renderClCalendar();
}

// ---- SCHEDULE ----
async function initClSchedule() {
    if (!machineMaster.length) await loadMachineMaster();
    // pre-load global daily default
    try {
        const d = await clFetch({ action:'getDailyDefault' });
        if (d.success && d.data?.items?.length) _clDailyDefault = d.data.items;
    } catch(e) {}
    clFillFacSelect('clsc-fac', '');
    clScFacChange();
    clScTab('daily');
}
function clScFacChange() {
    const fac = document.getElementById('clsc-fac')?.value || '';
    clFillAreaSelect('clsc-area', fac, '');
    loadClSchedule();
}
function clScTab(tab) {
    _clScCurrentTab = tab;
    document.getElementById('clsc-daily-view').classList.toggle('hidden', tab !== 'daily');
    document.getElementById('clsc-pm-view').classList.toggle('hidden', tab !== 'pm');
    document.getElementById('clsc-tab-daily').className = tab==='daily' ? 'mms-btn mms-btn-green' : 'mms-btn';
    document.getElementById('clsc-tab-pm').className    = tab==='pm'    ? 'mms-btn mms-btn-green' : 'mms-btn';
    renderClSchedule();
}
