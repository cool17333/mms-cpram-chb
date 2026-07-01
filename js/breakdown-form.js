// ============================================================
// REPORT DOC HEADER — dynamic ตาม eventType (7E)
// ============================================================
function setReportDocHeader(et) {
    const isAdj = et === 'Adjustment';
    const t1 = document.getElementById('report-doc-title');
    const t2 = document.getElementById('report-whyimg-title');
    if (t1) t1.textContent = isAdj ? '🔧 Adjustment Report — Machine · CPRAM CHB' : '🔴 Breakdown Report — Machine · CPRAM CHB';
    if (t2) t2.textContent = isAdj ? '● ADJUSTMENT REPORT — รูปภาพประกอบ WHY-WHY' : '● BREAKDOWN REPORT — รูปภาพประกอบ WHY-WHY';
}

// ============================================================
// HUB v2.0 — datetime ticker + quick stats
// ============================================================
function initHubDatetime() {
    const el = document.getElementById('hub-datetime');
    if (!el) return;
    const fmt = () => {
        const d = new Date();
        const days = ['อาทิตย์','จันทร์','อังคาร','พุธ','พฤหัสบดี','ศุกร์','เสาร์'];
        const pad  = n => String(n).padStart(2,'0');
        el.textContent = `วัน${days[d.getDay()]}ที่ ${d.getDate()}/${d.getMonth()+1}/${d.getFullYear()+543}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} น.`;
    };
    fmt();
    setInterval(fmt, 1000);
}

async function refreshDashboard() {
    if (!GAS_URL) return;
    const chip = document.getElementById('dash-refresh-btn');
    if (chip) { chip.disabled = true; chip.textContent = '⏳'; }
    try {
        const r = await fetch(`${GAS_URL}?action=getAll`);
        const j = await r.json();
        if (j.success && Array.isArray(j.data)) _dashRecords = j.data;
    } catch(e) {}
    if (chip) { chip.disabled = false; chip.textContent = '🔄 รีเฟรช'; }
    initHubStats();
    if (typeof renderHomeDash === 'function') renderHomeDash(); // อัปเดต BD cards บนหน้าแรกโดยไม่รีโหลด CL
}

function initHubStats() {
    const mc = machineList.length;
    if (mc) {
        document.getElementById('hub-stat-machines').textContent = `🔧 เครื่องจักร: ${mc}`;
        document.getElementById('hub-count-machines').textContent = mc;
    }
    if (_dashRecords.length) {
        const now  = new Date();
        const ym   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        const month = _dashRecords.filter(r => (r.date||'').startsWith(ym) && r.status !== 'cancel');
        const ACTIVE = new Set(['รอรับงาน','แจ้ง Breakdown','รับงานแล้ว','กำลังดำเนินการแก้ไข','กำลังดำเนินการ','รออะไหล่','ซ่อมสำเร็จ','wip']);
        const wip = _dashRecords.filter(r => ACTIVE.has(r.status));
        document.getElementById('hub-count-bd').textContent  = month.length;
        document.getElementById('hub-count-wip').textContent = wip.length;
    }
    // 2-factory dashboard — machine master stores "โรงงาน 1"/"โรงงาน 2"; records may store "1"/"2" or full name
    function normFac(v) { v = String(v||'').trim(); return v === '1' ? 'โรงงาน 1' : v === '2' ? 'โรงงาน 2' : v; }
    function facStats(facFull) {
        const machines = machineList.filter(m => normFac(m.factory) === facFull);
        const total    = machines.length;
        const ACTIVE   = new Set(['รอรับงาน','แจ้ง Breakdown','รับงานแล้ว','กำลังดำเนินการแก้ไข','กำลังดำเนินการ','รออะไหล่','ซ่อมสำเร็จ','wip']);
        const bdIds    = new Set(
            _dashRecords.filter(r => normFac(r.factory) === facFull && ACTIVE.has(r.status))
                        .map(r => r.machineId || r.machineName).filter(Boolean));
        const bd = bdIds.size;
        return { run: Math.max(0, total - bd), bd };
    }
    const f1 = facStats('โรงงาน 1'), f2 = facStats('โรงงาน 2');
    const setEl = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setEl('dash-f1-run', f1.run); setEl('dash-f1-bd', f1.bd);
    setEl('dash-f2-run', f2.run); setEl('dash-f2-bd', f2.bd);
    setEl('dash-f1-total', f1.run + f1.bd);
    setEl('dash-f2-total', f2.run + f2.bd);
    renderFacDonut('dash-chart-f1', f1.run, f1.bd);
    renderFacDonut('dash-chart-f2', f2.run, f2.bd);
}

let _dashCharts = {};
function renderFacDonut(canvasId, run, bd) {
    if (_dashCharts[canvasId]) { _dashCharts[canvasId].destroy(); delete _dashCharts[canvasId]; }
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return;
    const total = run + bd;
    const isEmpty = total === 0;
    _dashCharts[canvasId] = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: ['กำลังใช้งาน', 'Breakdown'],
            datasets: [{
                data: isEmpty ? [1] : [run, bd],
                backgroundColor: isEmpty ? ['#e5e7eb'] : ['#27ae60', '#c0392b'],
                borderWidth: 0,
                hoverOffset: isEmpty ? 0 : 6,
            }]
        },
        options: {
            cutout: '68%',
            animation: { duration: 600 },
            plugins: { legend: { display: false }, tooltip: { enabled: !isEmpty } },
        }
    });
}

// แจ้ง Breakdown ใหม่ → ฟอร์มย่อ (อาการ+รูป) ขั้น report
function goReport() {
    clearEditState();
    resetFormFields();
    currentTracking = '';
    switchTab('form');
    setFormStage('report');
}

// Manual Create → ฟอร์มเต็ม เลือกสถานะได้ (ค่าเริ่มต้น = เสร็จสิ้น)
function goManualCreate() {
    clearEditState();
    resetFormFields();
    currentTracking = '';
    switchTab('form');
    setFormStage('manual');
    const sSel = document.getElementById('status-select');
    sSel.value = 'done'; updateStatus(sSel);
}

function goRecords() {
    switchTab('records');
    if (GAS_URL) loadRecords();        // โหลดรายการทั้งหมดให้อัตโนมัติ
}

function goSummary() {
    switchTab('summary');
}

function clearEditState() { editMode = false; editRowIndex = null; editSheetName = null; }

// ---- ปัญหาที่พบ: locked lines + new entry ----
let _problemLocked = '';
function renderProblemLocked() {
    const box = document.getElementById('problem-locked');
    if (!box) return;
    if (!_problemLocked) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = _problemLocked.split('\n').filter(Boolean).map(line =>
        `<div class="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 select-none whitespace-pre-wrap">${line.replace(/</g,'&lt;')}</div>`
    ).join('');
}
function problemStageLabel() {
    if (formStage === 'report')  return 'แจ้ง Breakdown';
    if (formStage === 'manual')  return 'สร้างเอกสาร';
    if (formStage === 'whyedit') return 'แก้ไข Why-Why';
    return 'แก้ไขเอกสาร';
}
function composeProblem(byName) {
    const fresh = (document.getElementById('inp-problem-new')?.value || '').trim();
    return [_problemLocked, fresh].filter(Boolean).join('\n');
}

// ล้างค่าฟิลด์ทั้งหมดให้เป็นฟอร์มเปล่า
function resetFormFields() {
    ['machine-name','inp-machine-id','inp-line','inp-corrective','inp-preventive']
        .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    _problemLocked = ''; renderProblemLocked();
    const pn = document.getElementById('inp-problem-new'); if (pn) pn.value = '';
    setBdStartLocked(false);
    setDT('bd-start', ''); setDT('bd-end', '');
    const fSel = document.getElementById('factory-select'); if (fSel) fSel.value = '';
    updateAreaOptions();
    const tSel = document.getElementById('inp-bd-type'); if (tSel) tSel.selectedIndex = 0;

    document.getElementById('device-list').innerHTML = ''; addDeviceRow();
    document.getElementById('parts-tbody').innerHTML = ''; addPartRow();
    resetWhyTree();
    resetImages();
    calcDowntime();
}

function checkSummarySetup() {
    document.getElementById('sum-no-url').classList.toggle('hidden', !!GAS_URL);
}

function checkRecordsSetup() {
    document.getElementById('rec-no-url').classList.toggle('hidden', !!GAS_URL);
}

// ============================================================
// TOAST NOTIFICATION
// ============================================================
let toastTimer;
let _loadingCount = 0;
function showLoading(msg) {
  _loadingCount++;
  const t = document.getElementById('loading-text'); if (t && msg) t.textContent = msg;
  document.getElementById('loading-overlay')?.classList.remove('hidden');
}
function hideLoading(force) {
  _loadingCount = force ? 0 : Math.max(0, _loadingCount - 1);
  if (_loadingCount === 0) document.getElementById('loading-overlay')?.classList.add('hidden');
}
function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const inner = document.getElementById('toast-inner');
    const colors = {
        success: 'bg-gray-900 text-white',
        error:   'bg-red-600 text-white',
        info:    'bg-blue-600 text-white',
    };
    inner.className = 'px-6 py-3 rounded-full font-bold text-sm shadow-xl ' + (colors[type] || colors.success);
    inner.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

// ============================================================
// FACTORY / AREA COMBO (FORM)
// ============================================================
const AREA_MAP = {
    '1': ['Frozen ดิบ', 'Frozen สุก', 'Chill ดิบ', 'Chill สุก'],
    '2': ['Sandwich', 'Frozen Dough', 'Preparation'],
};
const AREA_MAP_KEY = { 'โรงงาน1': AREA_MAP['1'], 'โรงงาน2': AREA_MAP['2'] };

function updateAreaOptions() {
    const factory = document.getElementById('factory-select').value;
    const sel = document.getElementById('area-select');
    sel.innerHTML = '';
    if (!factory) { sel.innerHTML = '<option value="">-- เลือกโรงงานก่อน --</option>'; refilterMachineIdHints(); return; }
    sel.innerHTML = '<option value="">-- เลือกพื้นที่ --</option>';
    (AREA_MAP[factory] || []).forEach(a => {
        const o = document.createElement('option');
        o.value = o.textContent = a;
        sel.appendChild(o);
    });
    refilterMachineIdHints();
}

// SUMMARY AREA FILTER
function updateSumArea() {
    const factory = document.getElementById('sum-factory').value;
    const sel = document.getElementById('sum-area');
    sel.innerHTML = '<option value="">ทั้งหมด</option>';
    (AREA_MAP_KEY[factory] || []).forEach(a => {
        const o = document.createElement('option');
        o.value = o.textContent = a;
        sel.appendChild(o);
    });
}

// ============================================================
// STATUS BADGE
// ============================================================
const STATUS_CFG = {
    report:   { label:'รอรับงาน',              cls:'border-amber-400 bg-amber-900/30',   color:'#fbbf24', icon:'⏳' },
    wip:      { label:'กำลังดำเนินการแก้ไข',   cls:'border-orange-400 bg-orange-900/30', color:'#fb923c', icon:'🔧' },
    wait:     { label:'รออะไหล่',              cls:'border-yellow-400 bg-yellow-900/30', color:'#facc15', icon:'🔩' },
    repaired: { label:'ซ่อมสำเร็จ',            cls:'border-teal-400 bg-teal-900/30',     color:'#2dd4bf', icon:'🔨' },
    done:     { label:'ดำเนินการเสร็จสิ้น',    cls:'border-green-400 bg-green-900/30',   color:'#4ade80', icon:'✅' },
};

function updateStatus(sel) {
    const container = document.getElementById('status-container');
    const c = STATUS_CFG[sel.value] || STATUS_CFG.report;
    container.className = `flex items-center gap-2 border-2 ${c.cls} rounded-full pl-4 pr-3 py-2.5 self-start md:self-auto`;
    sel.style.color = c.color;
}

// แจ้งใหม่ → ล็อกสถานะไว้ที่ "แจ้ง Breakdown" / แก้ไข → ปลดล็อกให้เปลี่ยนได้
function setStatusLocked(locked) {
    const sSel = document.getElementById('status-select');
    if (!sSel) return;
    if (locked) sSel.value = 'report';
    sSel.disabled = locked;
    updateStatus(sSel);
    document.getElementById('status-lock')?.classList.toggle('hidden', !locked);
    document.getElementById('status-caret')?.classList.toggle('hidden', locked);
}

// ============================================================
// DOWNTIME CALCULATOR
// ============================================================
// ---- เวลาแบบ 24 ชม. (date + HH:MM) ----
function fmtTimeInput(el) {                       // ขณะพิมพ์: ใส่ : อัตโนมัติ
    let v = el.value.replace(/[^0-9]/g, '').slice(0, 4);
    if (v.length >= 3) v = v.slice(0, 2) + ':' + v.slice(2);
    el.value = v;
}
function normTime(el) {                           // ออกจากช่อง: ปรับเป็น HH:MM (00-23:00-59)
    let v = el.value.replace(/[^0-9]/g, '');
    if (!v) { el.value = ''; return; }
    v = v.padStart(4, '0').slice(0, 4);
    const hh = Math.min(23, parseInt(v.slice(0, 2), 10));
    const mm = Math.min(59, parseInt(v.slice(2), 10));
    el.value = String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}
function getDT(prefix) {                          // รวม date + time → ISO
    const d = document.getElementById(prefix + '-date').value;
    const t = document.getElementById(prefix + '-time').value;
    if (!d || !/^\d{2}:\d{2}$/.test(t)) return '';
    return d + 'T' + t;
}
function setDT(prefix, iso) {                      // แยก ISO → date + time
    const dEl = document.getElementById(prefix + '-date');
    const tEl = document.getElementById(prefix + '-time');
    if (!dEl || !tEl) return;
    if (!iso) { dEl.value = ''; tEl.value = ''; return; }
    const [d, t] = String(iso).split('T');
    dEl.value = d || '';
    tEl.value = (t || '').slice(0, 5);
}

function calcDowntime() {
    const s = getDT('bd-start');
    const e = getDT('bd-end');
    const d = document.getElementById('downtime-display');
    const box = d.parentElement;
    const setWarn = warn => {
        box.className = 'flex items-center rounded-lg px-3 py-2 h-[2.375rem] border-2 ' +
            (warn ? 'bg-red-50 border-red-400' : 'bg-orange-50 border-orange-300');
        d.className = (warn ? 'text-red-600' : 'text-orange-700') + ' font-bold text-sm w-full text-center tracking-wide';
    };
    if (!s || !e) { d.textContent = '— ชม. — นาที'; setWarn(false); return; }
    const diff = new Date(e) - new Date(s);
    if (diff < 0) { d.textContent = '⚠️ เวลาเสร็จก่อนเวลาเริ่ม'; setWarn(true); return; }
    const h = Math.floor(diff / 3600000), m = Math.floor((diff % 3600000) / 60000);
    const over = diff > 24 * 3600000;   // > 24 ชม. = เตือน (อาจคีย์ผิด)
    d.textContent = `${h} ชม. ${m} นาที` + (over ? '  ⚠️ เกิน 24 ชม.' : '');
    setWarn(over);
}

// ============================================================
// WHY-WHY TREE  (โครงสร้างแบบรากต้นไม้)
//   node = { text, children: [] }
//   level >= 5 → ถือเป็น "รากเหง้าของปัญหา" (Root Cause) สีแดง
// ============================================================
let whyTree = [];

function _newWhy() { return { text: '', children: [], images: [] }; }

function addWhyImages(node) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
    inp.onchange = () => {
        const files = [...inp.files];
        if (!files.length) return;
        let pending = files.length;
        files.forEach(f => {
            const r = new FileReader();
            r.onload = () => {
                compressImage(r.result, d => {
                    (node.images = node.images || []).push({ data: d, id: '' });
                    if (--pending === 0) renderWhyTree();
                });
            };
            r.readAsDataURL(f);
        });
    };
    inp.click();
}

function removeWhyImage(node, idx) {
    node.images.splice(idx, 1);
    renderWhyTree();
}

function addRootWhy() { whyTree.push(_newWhy()); renderWhyTree(); }
function addChildWhy(node) { node.children.push(_newWhy()); renderWhyTree(); }

function removeWhyNode(node) {
    const rm = (list) => {
        const i = list.indexOf(node);
        if (i >= 0) { list.splice(i, 1); return true; }
        return list.some(n => rm(n.children));
    };
    rm(whyTree);
    if (!whyTree.length) whyTree.push(_newWhy());
    renderWhyTree();
}

function resetWhyTree() { whyTree = [_newWhy()]; renderWhyTree(); }

function renderWhyTree() {
    const c = document.getElementById('why-tree');
    if (!c) return;
    c.innerHTML = '';
    whyTree.forEach((node, i) => c.appendChild(_renderWhyNode(node, String(i + 1))));
}

function _renderWhyNode(node, label) {
    const level  = label.split('.').length;
    const isRoot = level >= 5;                         // 5 Whys → รากเหง้า
    const badge  = isRoot ? 'bg-red-100 text-red-700 border border-red-200'
                          : 'bg-blue-100 text-blue-700 border border-blue-200';
    const inpCls = isRoot ? 'border-red-200 bg-red-50/60 placeholder-red-300'
                          : 'border-gray-200 bg-white';
    const ph     = isRoot ? 'รากเหง้าของปัญหา (Root Cause)?' : 'ระบุสาเหตุ...';

    const container = document.createElement('div');

    const nImg = node.images?.length || 0;
    const row = document.createElement('div');
    row.className = 'flex items-center gap-2 mb-1.5';
    row.innerHTML = `
        <span class="shrink-0 text-xs font-bold px-2.5 py-1.5 rounded-lg ${badge}" style="white-space:nowrap">Why ${label}</span>
        <input type="text" class="why-node-input flex-1 min-w-0 border ${inpCls} rounded-lg px-3 py-2 text-sm outline-none focus:border-orange-400 transition-colors" placeholder="${ph}">
        <button type="button" class="img-btn no-print shrink-0 h-8 px-2 flex items-center gap-1 rounded-lg ${nImg ? 'bg-blue-100 text-blue-700' : 'bg-blue-50 text-blue-500'} hover:bg-blue-100 border border-blue-200 text-xs font-bold" title="เพิ่มรูปประกอบ" style="white-space:nowrap">📷${nImg ? ' ' + nImg : ''}</button>
        <button type="button" class="add-btn no-print shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-green-50 hover:bg-green-100 text-green-600 border border-green-200 font-bold text-lg leading-none" title="เพิ่มสาเหตุย่อย">+</button>
        <button type="button" class="del-btn no-print shrink-0 w-8 h-8 flex items-center justify-center rounded-lg bg-red-50 hover:bg-red-100 text-red-500 border border-red-200" title="ลบ">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>
        </button>`;
    const input = row.querySelector('.why-node-input');
    input.value = node.text || '';
    input.addEventListener('input', e => { node.text = e.target.value; });
    row.querySelector('.img-btn').onclick = () => addWhyImages(node);
    row.querySelector('.add-btn').onclick = () => addChildWhy(node);
    row.querySelector('.del-btn').onclick = () => removeWhyNode(node);
    container.appendChild(row);

    // แถบรูปย่อของ node (เห็นเฉพาะตอนกรอก ไม่ออกใน export — รูปจริงไปอยู่หน้า 2)
    if (nImg) {
        const tr = document.createElement('div');
        tr.className = 'no-print flex flex-wrap gap-1.5 mb-2';
        tr.style.marginLeft = '8px';
        node.images.forEach((im, i) => {
            const cell = document.createElement('div');
            cell.className = 'relative w-16 h-12 rounded-lg overflow-hidden border border-gray-200';
            cell.innerHTML = `
                <img src="${im.data}" class="w-full h-full object-cover">
                <button type="button" class="absolute top-0 right-0 bg-black/60 hover:bg-red-600 text-white w-4 h-4 flex items-center justify-center text-xs leading-none rounded-bl">×</button>`;
            cell.querySelector('button').onclick = () => removeWhyImage(node, i);
            tr.appendChild(cell);
        });
        container.appendChild(tr);
    }

    // สาเหตุย่อย — เยื้องเข้า + เส้นประเชื่อม
    if (node.children.length) {
        const childWrap = document.createElement('div');
        childWrap.style.cssText = 'margin-left:16px;padding-left:16px;border-left:2px dashed #cbd5e1';
        node.children.forEach((ch, j) => childWrap.appendChild(_renderWhyNode(ch, label + '.' + (j + 1))));
        container.appendChild(childWrap);
    }
    return container;
}

// ---- serialize / parse สำหรับเก็บใน Google Sheet ----
function serializeWhyTree() {
    const lines = [];
    const walk = (node, label) => {
        lines.push(label + '\t' + (node.text || '').replace(/[\r\n]+/g, ' ').trim());
        node.children.forEach((ch, j) => walk(ch, label + '.' + (j + 1)));
    };
    whyTree.forEach((n, i) => walk(n, String(i + 1)));
    return lines.filter(l => l.split('\t')[1]).length ? lines.join('\n') : '';
}

// รวมรูป Why-Why เป็น { path: [id/dataURL] } สำหรับบันทึก (id เดิม / dataURL ใหม่)
function buildWhyImages() {
    const out = {};
    const walk = (node, label) => {
        if (node.images && node.images.length) out[label] = node.images.map(im => im.id || im.data);
        node.children.forEach((ch, j) => walk(ch, label + '.' + (j + 1)));
    };
    whyTree.forEach((n, i) => walk(n, String(i + 1)));
    return out;
}

// โหลดรูป Why-Why จาก Drive (JSON { path:[id] }) → ผูกกลับเข้า tree ตาม path
async function loadWhyImages(jsonStr) {
    let map; try { map = JSON.parse(jsonStr || '{}'); } catch (e) { return; }
    if (!map || !Object.keys(map).length) return;
    const nodeByLabel = {};
    const walk = (node, label) => { nodeByLabel[label] = node; node.children.forEach((ch, j) => walk(ch, label + '.' + (j + 1))); };
    whyTree.forEach((n, i) => walk(n, String(i + 1)));
    await Promise.all(Object.keys(map).map(async label => {
        const node = nodeByLabel[label]; if (!node) return;
        const results = await Promise.allSettled(map[label].map(async id => {
            const res  = await fetch(`${GAS_URL}?action=getImage&id=${encodeURIComponent(id)}`);
            const json = await res.json();
            return (json && json.success && json.dataUrl) ? { data: json.dataUrl, id } : null;
        }));
        node.images = results.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    }));
    renderWhyTree();
}

function parseWhyTree(text) {
    const lines = (text || '').split('\n').filter(l => l.trim());
    const roots = [], map = {};
    lines.forEach(line => {
        const tab   = line.indexOf('\t');
        const label = (tab >= 0 ? line.slice(0, tab) : line).trim();
        const txt   = tab >= 0 ? line.slice(tab + 1) : '';
        const node  = { text: txt, children: [], images: [] };
        map[label]  = node;
        const parts = label.split('.');
        if (parts.length === 1) roots.push(node);
        else {
            const parent = map[parts.slice(0, -1).join('.')];
            (parent ? parent.children : roots).push(node);
        }
    });
    return roots.length ? roots : [_newWhy()];
}

// ============================================================
// DEVICE LIST
// ============================================================
function addDeviceRow(value = '') {
    const list = document.getElementById('device-list');
    const idx  = list.children.length + 1;
    const row  = document.createElement('div');
    row.className = 'flex items-center gap-2';
    row.innerHTML = `
        <span class="text-xs text-gray-400 font-bold w-5 text-right shrink-0">${idx}</span>
        <input type="text" value="${value}"
               class="flex-1 border border-gray-300 rounded-lg px-3 py-1.5 text-sm outline-none focus:border-orange-500 transition-colors"
               placeholder="ชื่ออุปกรณ์ / ชิ้นส่วนที่เสียหาย...">
        <button type="button" onclick="removeDeviceRow(this)"
                class="text-gray-300 hover:text-red-500 transition-colors font-bold text-lg leading-none">×</button>`;
    list.appendChild(row);
    row.querySelector('input').focus();
}

function removeDeviceRow(btn) {
    const list = document.getElementById('device-list');
    btn.closest('div').remove();
    // reindex
    [...list.children].forEach((r, i) => {
        r.querySelector('span').textContent = i + 1;
    });
    if (list.children.length === 0) addDeviceRow();
}

function collectDevices() {
    return [...document.querySelectorAll('#device-list input')]
        .map(i => i.value.trim())
        .filter(Boolean)
        .join(' | ');
}

// ============================================================
// SPARE PARTS TABLE
// ============================================================
function createPartRow(index) {
    const tr = document.createElement('tr');
    tr.className = 'part-row border-b border-gray-100 transition-colors';
    tr.innerHTML = `
        <td class="px-3 py-2 text-center text-gray-400 font-bold text-sm part-num">${index}</td>
        <td class="px-4 py-2"><input type="text" list="spare-hint" onchange="onPartNamePick(this)" class="w-full bg-transparent outline-none text-gray-800 font-medium text-sm px-1" placeholder="ชื่ออะไหล่..."></td>
        <td class="px-3 py-2"><input type="text" class="w-full bg-transparent outline-none text-gray-600 text-center text-sm px-1" placeholder="-"></td>
        <td class="px-3 py-2"><input type="number" min="0" class="w-full bg-transparent outline-none text-gray-900 text-center font-bold text-sm px-1 border-b-2 border-gray-200 focus:border-orange-500 transition-colors" placeholder="0"></td>
        <td class="px-3 py-2"><input type="text" class="w-full bg-transparent outline-none text-gray-600 text-center text-sm px-1" placeholder="ชิ้น"></td>
        <td class="px-3 py-2"><input type="text" class="w-full bg-transparent outline-none text-gray-600 text-sm px-1" placeholder="หมายเหตุ..."></td>
        <td class="no-print px-3 py-2 text-center">
            <button onclick="removePartRow(this)" class="text-gray-300 hover:text-red-500 transition-colors p-1 rounded hover:bg-red-50">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
            </button>
        </td>`;
    return tr;
}
function addPartRow() {
    const tb = document.getElementById('parts-tbody');
    tb.appendChild(createPartRow(tb.querySelectorAll('tr').length + 1));
}
function removePartRow(btn) {
    btn.closest('tr').remove();
    document.querySelectorAll('.part-num').forEach((el, i) => el.textContent = i + 1);
}

// ============================================================
// PHOTOS — ก่อน/หลังแก้ไข (รูปเดียวต่อช่อง)
// ============================================================
// รูปหลายรูปต่อข้าง — [{data:dataURL, id:fileId}] ; รูปแรก (index 0) = รูปที่โชว์ในกรอบ
const imgList = { before: [], after: [] };
let _imgLoadPromise = Promise.resolve();           // รอโหลดรูปจาก Drive ก่อน export

// ย่อรูปก่อนเก็บ — การันตี ≤maxKB (default 250KB); ลด quality ก่อน จากนั้นลดขนาดภาพ
function compressImage(dataUrl, cb, maxKB) {
    maxKB = maxKB || 250;
    const img = new Image();
    img.onload = () => {
        let w = img.width, h = img.height;
        const MAX = 1280;
        if (w > MAX || h > MAX) { const s = MAX / Math.max(w, h); w = Math.round(w * s); h = Math.round(h * s); }
        const limit = maxKB * 1024;
        const sizeOf = u => Math.round((u.length - (u.indexOf(',') + 1)) * 0.75);
        const render = (ww, hh, q) => {
            const c = document.createElement('canvas'); c.width = ww; c.height = hh;
            c.getContext('2d').drawImage(img, 0, 0, ww, hh);
            return c.toDataURL('image/jpeg', q);
        };
        try {
            let q = 0.72, out = render(w, h, q);
            while (sizeOf(out) > limit && q > 0.35) { q -= 0.1; out = render(w, h, q); }
            let guard = 0;
            while (sizeOf(out) > limit && guard++ < 6) {
                w = Math.round(w * 0.85); h = Math.round(h * 0.85);
                q = 0.6; out = render(w, h, q);
                while (sizeOf(out) > limit && q > 0.35) { q -= 0.1; out = render(w, h, q); }
            }
            cb(out);
        } catch (e) { cb(dataUrl); }
    };
    img.onerror = () => cb(dataUrl);
    img.src = dataUrl;
}

function addImage(event, side) {
    const files = [...event.target.files];
    if (!files.length) return;
    files.forEach(file => {
        const reader = new FileReader();
        reader.onload = () => compressImage(reader.result, d => { imgList[side].push({ data: d, id: '' }); renderImageSide(side); });
        reader.readAsDataURL(file);
    });
    event.target.value = '';   // เผื่อเลือกไฟล์เดิมซ้ำ
}

function setPrimary(side, idx) {
    if (idx <= 0 || idx >= imgList[side].length) return;
    const [it] = imgList[side].splice(idx, 1);
    imgList[side].unshift(it);
    renderImageSide(side);
}

function delImage(side, idx) {
    imgList[side].splice(idx, 1);
    renderImageSide(side);
}

// โหลดรูปทั้งหมดของข้างหนึ่งจาก Drive (id คั่นด้วย |) ตามลำดับ
async function loadImagesForSide(idsStr, side) {
    const ids = String(idsStr || '').split('|').map(s => s.trim()).filter(Boolean);
    const results = await Promise.allSettled(ids.map(async id => {
        const res  = await fetch(`${GAS_URL}?action=getImage&id=${encodeURIComponent(id)}`);
        const json = await res.json();
        return (json && json.success && json.dataUrl) ? { data: json.dataUrl, id } : null;
    }));
    results.forEach(r => { if (r.status === 'fulfilled' && r.value) imgList[side].push(r.value); });
    renderImageSide(side);
}

function renderImageSide(side) {
    const list = imgList[side];
    const img    = document.getElementById('preview-' + side);
    const prompt = document.getElementById('prompt-' + side);
    if (list.length) { img.src = list[0].data; img.classList.remove('hidden'); prompt?.classList.add('hidden'); }
    else             { img.src = ''; img.classList.add('hidden'); prompt?.classList.remove('hidden'); }

    const tw = document.getElementById('thumbs-' + side);
    if (tw) tw.innerHTML = list.map((it, i) => `
        <div class="relative w-12 h-12 rounded border-2 ${i === 0 ? 'border-orange-500' : 'border-gray-200'} overflow-hidden cursor-pointer"
             onclick="setPrimary('${side}',${i})" title="${i === 0 ? 'รูปที่โชว์ในรายงาน' : 'คลิกเพื่อตั้งเป็นรูปโชว์'}">
            <img src="${it.data}" class="w-full h-full object-cover">
            ${i === 0 ? '<span class="absolute bottom-0 inset-x-0 bg-orange-500 text-white text-[8px] text-center leading-tight">โชว์</span>' : ''}
            <button onclick="event.stopPropagation();delImage('${side}',${i})" class="absolute top-0 right-0 bg-black/50 hover:bg-red-600 text-white text-[10px] leading-none w-4 h-4 rounded-bl">×</button>
        </div>`).join('');
}

function resetImages() {
    imgList.before = []; imgList.after = [];
    renderImageSide('before'); renderImageSide('after');
}

// รวมรูปทุกข้างเป็น string id|id (สำหรับส่งบันทึก)
function imgsToStr(side) { return imgList[side].map(x => x.id || x.data).join('|'); }

// ============================================================
// GALLERY PAGE — รูปประกอบ Why-Why (หน้า 2 ของ export)
// ============================================================
function hasWhyImages() {
    const walk = n => (n.images?.length || 0) > 0 || n.children.some(walk);
    return whyTree.some(walk);
}

function hasGalleryContent() {
    return imgList.before.length || imgList.after.length || hasWhyImages();
}

function buildGallery(mode = 'pdf') {
    document.getElementById('gallery-title').textContent =
        document.getElementById('machine-name')?.value?.trim() || 'ชื่อเครื่องจักร...';

    const wrap = document.getElementById('gallery-wrap');
    wrap.style.cssText = 'padding:32px;display:flex;flex-direction:column;gap:20px';
    wrap.innerHTML = '';

    const cols = mode === 'png' ? 3 : 2;
    // pdf: ปรับคอลัมน์อัตโนมัติให้กรอบสั้นลง → ทุกรูปของ Why อยู่หน้าเดียวกัน
    const secCols = (n) => mode === 'pdf' ? (n <= 2 ? 2 : n <= 6 ? 3 : 4) : cols;

    const mkImgCell = (src) => {
        const d = document.createElement('div');
        d.className = 'rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm';
        d.style.cssText = 'align-self:start';
        d.innerHTML = `<img src="${src}" style="display:block;width:100%;height:auto">`;
        return d;
    };

    const mkFrame = (color, badgeText, detailText) => {
        const frame = document.createElement('div');
        frame.className = 'gal-sec';
        frame.style.cssText =
            `border:2px dashed ${color.border};border-radius:12px;background:${color.bg};padding:18px`;
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:14px';
        head.innerHTML =
            `<span style="white-space:nowrap;font-size:13px;font-weight:700;padding:5px 12px;border-radius:8px;` +
            `background:${color.badgeBg};color:${color.badgeTx};border:1px solid ${color.badgeBd}">${badgeText}</span>` +
            (detailText ? `<span style="font-size:14px;font-weight:600;color:#1f2937">${detailText.replace(/</g,'&lt;')}</span>` : '');
        frame.appendChild(head);
        return frame;
    };

    const RED   = { border:'#fca5a5', bg:'#fef2f2', badgeBg:'#dc2626', badgeTx:'#ffffff', badgeBd:'#dc2626' };
    const GREEN = { border:'#86efac', bg:'#f0fdf4', badgeBg:'#16a34a', badgeTx:'#ffffff', badgeBd:'#16a34a' };

    // ---- รูปก่อน/หลังแก้ไข (ครบทุกรูป — มาก่อน why-why) ----
    if (imgList.before.length || imgList.after.length) {
        const row = document.createElement('div');
        row.className = 'gal-sec';
        row.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start';
        const half = (color, badge, list) => {
            const f = mkFrame(color, badge, '');
            f.classList.remove('gal-sec');           // row เป็น section เดียว
            if (list.length) list.forEach((it, i) => { const cell = mkImgCell(it.data); if (i) cell.style.marginTop = '12px'; f.appendChild(cell); });
            else f.insertAdjacentHTML('beforeend', '<p style="text-align:center;color:#9ca3af;font-size:13px;padding:24px">— ไม่มีรูป —</p>');
            return f;
        };
        row.appendChild(half(RED,   'ก่อนแก้ไข', imgList.before));
        row.appendChild(half(GREEN, 'หลังแก้ไข', imgList.after));
        wrap.appendChild(row);
    }

    // ---- รูปประกอบ why-why (label + รายละเอียด + รูปทั้งหมด) ----
    const sections = [];
    const walk = (node, label) => {
        if (node.images?.length) sections.push({ label, text: node.text || '', images: node.images, isRoot: label.split('.').length >= 5 });
        node.children.forEach((ch, j) => walk(ch, label + '.' + (j + 1)));
    };
    whyTree.forEach((n, i) => walk(n, String(i + 1)));

    sections.forEach(sec => {
        const color = sec.isRoot
            ? { border:'#fca5a5', bg:'#fef2f2', badgeBg:'#fee2e2', badgeTx:'#b91c1c', badgeBd:'#fecaca' }
            : { border:'#93c5fd', bg:'#eff6ff', badgeBg:'#dbeafe', badgeTx:'#1d4ed8', badgeBd:'#bfdbfe' };
        const frame = mkFrame(color, 'Why ' + sec.label, sec.text);
        const grid = document.createElement('div');
        grid.style.cssText = `display:grid;grid-template-columns:repeat(${secCols(sec.images.length)},minmax(0,1fr));gap:14px`;
        sec.images.forEach(im => grid.appendChild(mkImgCell(im.data)));
        frame.appendChild(grid);
        wrap.appendChild(frame);
    });
}

// ============================================================
// COLLECT FORM DATA
// ============================================================
function collectFormData() {
    const factory = document.getElementById('factory-select');
    const area    = document.getElementById('area-select');
    const statusSel = document.querySelector('#status-container select');
    const statusMap = { report:'รอรับงาน', wip:'กำลังดำเนินการแก้ไข', wait:'รออะไหล่', done:'ดำเนินการเสร็จสิ้น' };

    const bdStart = getDT('bd-start');
    const bdEnd   = getDT('bd-end');
    const downtimeMin = (bdStart && bdEnd)
        ? Math.max(0, Math.floor((new Date(bdEnd) - new Date(bdStart)) / 60000))
        : 0;

    const whys = [serializeWhyTree()];   // tree → string เดียว เก็บใน column Why 1

    const parts = [...document.querySelectorAll('#parts-tbody tr')].map(tr => {
        const c = tr.querySelectorAll('input');
        return { name: c[0]?.value||'', partNo: c[1]?.value||'', qty: c[2]?.value||'', unit: c[3]?.value||'', remark: c[4]?.value||'' };
    });

    const g = id => (document.getElementById(id)?.value||'').trim();

    return {
        timestamp:   new Date().toISOString(),
        tracking:    currentTracking,
        machineName: g('machine-name'),
        factory:     factory.options[factory.selectedIndex]?.text || '',
        area:        area.options[area.selectedIndex]?.text || '',
        machineId:   g('inp-machine-id'),
        line:        g('inp-line'),
        status:      statusMap[statusSel?.value] || '',
        bdStart,
        bdEnd,
        downtimeMin,
        bdType:      document.getElementById('inp-bd-type')?.value || '',
        eventType:   document.getElementById('inp-event-type')?.value || '',
        problem:     g('inp-problem'),
        device:      collectDevices(),
        whys,
        corrective:  g('inp-corrective'),
        preventive:  g('inp-preventive'),
        parts,
        imgBefore:   imgsToStr('before'),   // id|id (รูปแรก=โชว์)
        imgAfter:    imgsToStr('after'),
        whyImages:   JSON.stringify(buildWhyImages()),   // รูป Why-Why → Drive
    };
}

// ============================================================
// ADD DATA CONFIRM FLOW
// ============================================================
function showAddDataConfirm() {
    if (!GAS_URL) {
        openSettings();
        showToast('⚠️ กรุณาตั้งค่า Web App URL ก่อนบันทึกข้อมูล', 'error');
        return;
    }
    const d = collectFormData();
    if (!d.machineName) { showToast('⚠️ กรุณาระบุชื่อเครื่องจักร', 'error'); return; }
    if (!d.factory)     { showToast('⚠️ กรุณาเลือกโรงงาน', 'error'); return; }
    if (!d.bdStart)     { showToast('⚠️ กรุณาระบุเวลาเริ่ม Breakdown', 'error'); return; }
    const freshProblem = (document.getElementById('inp-problem-new')?.value || '').trim();
    if (formStage === 'report' && !freshProblem) { showToast('⚠️ กรุณาระบุอาการ (ปัญหาที่พบ)', 'error'); return; }
    if (formStage === 'manual' && !d.eventType) { showToast('⚠️ กรุณาเลือกประเภทเหตุการณ์ (Breakdown/Adjustment)', 'error'); return; }

    const h  = Math.floor(d.downtimeMin / 60);
    const m  = d.downtimeMin % 60;
    const dtText = d.downtimeMin ? `${h} ชม. ${m} นาที` : '—';

    const badge   = STATUS_BADGE[d.status] || 'bg-gray-100 text-gray-600';
    const closing = (formStage === 'edit' && d.status === 'ดำเนินการเสร็จสิ้น');   // กดปิดงาน
    const title = formStage === 'report'  ? '📤 ยืนยันการแจ้ง Breakdown'
                : formStage === 'manual'  ? '✍️ ยืนยันสร้างเอกสาร (Manual)'
                : formStage === 'whyedit' ? '🌳 ยืนยันแก้ไข Why-Why'
                : closing ? '✅ ยืนยันปิดงาน' : '✏️ ยืนยันแก้ไข Report';
    const btnLb = formStage === 'report' ? 'ยืนยันการแจ้ง' : closing ? 'ยืนยันปิดงาน' : 'ยืนยันบันทึก';
    const nameL = formStage === 'report' ? 'ผู้แจ้ง' : formStage === 'whyedit' ? 'ผู้แก้ไข' : 'ผู้ดำเนินการ';

    document.getElementById('confirm-title').textContent     = title;
    document.getElementById('confirm-btn-label').textContent = btnLb;
    document.getElementById('confirm-name-label').textContent = nameL;

    const isEditStage = (formStage === 'edit' || formStage === 'whyedit');
    document.getElementById('confirm-summary').innerHTML = `
        ${isEditStage ? '<div class="mb-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 font-bold">⚠️ กำลังแก้ไขรายการเดิม — ตรวจสอบสถานะให้ถูกต้องก่อนยืนยัน</div>' : ''}
        <div class="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs items-center">
            <span class="text-gray-500 font-bold">เลข Tracking</span>  <span class="font-mono font-bold text-orange-600">${currentTracking || 'ออกเลขอัตโนมัติเมื่อบันทึก'}</span>
            <span class="text-gray-500 font-bold">เครื่องจักร</span>   <span class="font-bold text-gray-900">${d.machineName}</span>
            <span class="text-gray-500 font-bold">โรงงาน</span>        <span>${d.factory}</span>
            <span class="text-gray-500 font-bold">พื้นที่</span>         <span>${d.area || '—'}</span>
            <span class="text-gray-500 font-bold">เวลาเริ่ม</span>      <span>${d.bdStart.replace('T',' ')}</span>
            <span class="text-gray-500 font-bold">เวลาเสร็จ</span>      <span>${d.bdEnd ? d.bdEnd.replace('T',' ') : '—'}</span>
            <span class="text-gray-500 font-bold">Downtime</span>       <span class="font-bold text-orange-500">${dtText}</span>
            <span class="text-gray-500 font-bold">ประเภท Breakdown</span> <span>${d.bdType || '—'}</span>
            ${d.eventType ? `<span class="text-gray-500 font-bold">ประเภทเหตุการณ์</span><span class="font-bold ${d.eventType==='Breakdown'?'text-red-600':'text-blue-600'}">${d.eventType}</span>` : ''}
            <span class="text-gray-500 font-bold">สถานะ</span>          <span><span class="inline-block px-2 py-0.5 rounded-full font-bold ${badge}">${d.status}</span></span>
        </div>
        ${d.problem ? `<div class="mt-3 pt-3 border-t border-gray-200 text-xs text-gray-600"><span class="font-bold">ปัญหา: </span>${d.problem.slice(0,120)}${d.problem.length>120?'…':''}</div>` : ''}`;

    document.getElementById('confirm-modal').classList.remove('hidden');
}

function closeConfirm() {
    document.getElementById('confirm-modal').classList.add('hidden');
}

async function confirmAddData() {
    const byName = currentUser.name;
    if (!byName) { showToast('⚠️ กรุณาเข้าสู่ระบบก่อนบันทึก', 'error'); openLogin(); return; }

    const btn = document.getElementById('confirm-ok-btn');
    btn.disabled = true;
    btn.innerHTML = '<span class="animate-spin">⏳</span> กำลังบันทึก...';
    showLoading('กำลังบันทึกข้อมูล…');

    const isEdit = !!(editMode && editRowIndex);
    const data = { ...collectFormData(), byName, action: isEdit ? 'update' : 'create' };
    data.problem = composeProblem(byName);

    try {
        if (isEdit) {
            // อัปเดตแถวเดิม (รับงาน / แก้ไข / ปิดงาน)
            await fetch(GAS_URL, {
                method: 'POST', mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...data, action: 'update', rowIndex: editRowIndex, sheetName: editSheetName }),
            });
            closeConfirm();
            const msg = formStage === 'whyedit' ? '✅ บันทึก Why-Why แล้ว'
                      : (data.status === 'ดำเนินการเสร็จสิ้น') ? '✅ ปิดงานเรียบร้อย' : '✅ บันทึกการแก้ไขแล้ว';
            cancelEdit();
            goRecords();                 // กลับหน้ารายการ + รีโหลด
            showToast(msg, 'success');
        } else {
            // บันทึกใหม่ — server ออกเลขรันให้ แล้วอ่านกลับมาแสดง
            // ใช้ text/plain (simple request) → อ่าน response ได้ ไม่ติด CORS preflight
            const res  = await fetch(GAS_URL, {
                method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify(data),
            });
            const json = await res.json();
            closeConfirm();
            if (json && json.success) {
                if (json.tracking) currentTracking = json.tracking;
                if (formStage === 'report') {
                    // แสดง popup เลข Tracking + ข้อความให้ capture ส่งต่อผู้รับงาน
                    document.getElementById('tracking-modal-no').textContent = currentTracking || '';
                    document.getElementById('tracking-modal').classList.remove('hidden');
                } else {
                    showToast(`✅ บันทึกสำเร็จ → ${currentTracking || ''}`, 'success');
                }
            } else {
                showToast('❌ บันทึกไม่สำเร็จ: ' + (json && json.error || 'ไม่ทราบสาเหตุ'), 'error');
            }
        }
    } catch (err) {
        showToast('❌ เกิดข้อผิดพลาด: ' + err.message, 'error');
        console.error(err);
    } finally {
        hideLoading();
        btn.disabled = false;
        btn.innerHTML = `<span>✅</span> <span id="confirm-btn-label">${editMode ? 'อัปเดตข้อมูล' : 'บันทึกเข้า Google Sheet'}</span>`;
    }
}

// ============================================================
// EDIT MODE
// ============================================================
let editMode      = false;
let editRowIndex  = null;
let editSheetName = null;

function editWhyOnly(item) { openEditMode(item, 'whyedit'); }   // แก้ Why-Why หลังปิดงาน

function openEditMode(item, stage = 'edit') {
    if (stage === 'edit' && (item.status === 'รอรับงาน' || item.status === 'แจ้ง Breakdown')) {
        showToast('⚠️ ต้องรับงานก่อนถึงจะแก้ไขได้', 'error'); return;
    }
    editMode      = true;
    editRowIndex  = item.rowIndex;
    editSheetName = item.sheetName;
    loadMachines();   // เตรียม datalist รหัสเครื่องจักร (อิงทะเบียน) ให้ช่างเลือก
    currentTracking = item.tracking || genTracking();   // เก็บเลขเดิม (ของเก่าไม่มี → ออกใหม่)

    // fill form
    const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
    set('machine-name',   item.machineName);
    set('inp-machine-id', item.machineId);
    set('inp-line',       item.line);
    setDT('bd-start',     item.bdStart);
    setDT('bd-end',       item.bdEnd);
    _problemLocked = item.problem || ''; renderProblemLocked();
    const pn = document.getElementById('inp-problem-new'); if (pn) pn.value = '';
    set('inp-corrective', item.corrective);
    set('inp-preventive', item.preventive);

    // factory + area
    const fSel = document.getElementById('factory-select');
    [...fSel.options].forEach(o => { if (o.text === item.factory) o.selected = true; });
    updateAreaOptions();
    setTimeout(() => {
        const aSel = document.getElementById('area-select');
        [...aSel.options].forEach(o => { if (o.value === item.area || o.text === item.area) o.selected = true; });
    }, 50);

    // status — แก้ไขได้ (ปลดล็อก) รองรับค่าเก่า 'กำลังดำเนินการ' ด้วย
    const statusRevMap = {
        'รอรับงาน':'report', 'แจ้ง Breakdown':'report',
        'รับงานแล้ว':'wip', 'กำลังดำเนินการแก้ไข':'wip', 'กำลังดำเนินการ':'wip',
        'รออะไหล่':'wait', 'ซ่อมสำเร็จ':'repaired', 'ดำเนินการเสร็จสิ้น':'done',
    };
    const sSel = document.getElementById('status-select');
    if (sSel) { sSel.disabled = false; sSel.value = statusRevMap[item.status] || 'report'; updateStatus(sSel); }

    // bdType + eventType
    const typeSel = document.getElementById('inp-bd-type');
    if (typeSel) typeSel.value = item.bdType || '';
    const etSel = document.getElementById('inp-event-type');
    if (etSel) etSel.value = item.eventType || '';
    setReportDocHeader(item.eventType || 'Breakdown');

    // devices
    const dList = document.getElementById('device-list');
    dList.innerHTML = '';
    (item.device || '').split(' | ').filter(Boolean).forEach(d => addDeviceRow(d));
    if (!dList.children.length) addDeviceRow();

    // whys (tree) — รองรับทั้ง format ใหม่ (tree) และเก่า (flat)
    const rawWhys = item.whys || [];
    if (rawWhys.length && /^\d+(\.\d+)*\t/.test(rawWhys[0])) {
        whyTree = parseWhyTree(rawWhys[0]);                       // format ใหม่
    } else {
        whyTree = rawWhys.filter(Boolean).map(t => ({ text: t, children: [], images: [] }));  // format เก่า
        if (!whyTree.length) whyTree = [_newWhy()];
    }
    renderWhyTree();

    // ดึงรูปก่อน/หลังจาก Drive (ถ้ามี) — เก็บ promise ไว้ให้ export รอ
    resetImages();
    _imgLoadPromise = Promise.all([
        loadImagesForSide(item.imgBefore, 'before'),
        loadImagesForSide(item.imgAfter,  'after'),
        loadWhyImages(item.whyImages),
    ]);

    // restore ตารางอะไหล่ (R5 — แก้บั๊ก openEditMode ไม่คืน parts)
    const ptb = document.getElementById('parts-tbody');
    ptb.innerHTML = '';
    const pArr = parsePartsField(item.parts);
    if (pArr.length) {
        pArr.forEach((p, i) => {
            const tr = createPartRow(i + 1);
            const c  = tr.querySelectorAll('input');
            c[0].value=p.name||''; c[1].value=p.partNo||''; c[2].value=p.qty||''; c[3].value=p.unit||''; c[4].value=p.remark||'';
            ptb.appendChild(tr);
        });
    } else { addPartRow(); }

    calcDowntime();

    switchTab('form');
    setFormStage(stage);
    showTracking();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(stage === 'whyedit'
        ? '🌳 แก้ไขได้เฉพาะ Why-Why — กดบันทึกแล้วยืนยันชื่อผู้แก้ไข'
        : '✏️ แก้ไข Report — กดปุ่มแก้ไขเพื่อบันทึก / ปิดงานเมื่อกรอกครบ', 'info');
}

function cancelEdit() {
    clearEditState();
    resetFormFields();
    currentTracking = '';
    setFormStage('report');
}

// ============================================================
// SPARE PARTS HINT — datalist + auto-fill (B1/B2)
// ============================================================
// parse คอลัมน์ parts: JSON ใหม่ หรือ legacy string เก่า
function parsePartsField(v) {
    if (!v) return [];
    const s = String(v).trim();
    if (s[0] === '[') { try { return JSON.parse(s); } catch(e){} }
    // legacy "name (partNo) xqty unit | ..." → best-effort (remark เก่าไม่มี)
    return s.split(' | ').filter(Boolean).map(seg => {
        const m = seg.match(/^(.*?)(?:\s*\(([^)]*)\))?\s*x(\S+)\s*(.*)$/);
        return m ? { name:(m[1]||'').trim(), partNo:(m[2]||'').trim(), qty:(m[3]||'').trim(), unit:(m[4]||'').trim(), remark:'' }
                 : { name:seg.trim(), partNo:'', qty:'', unit:'', remark:'' };
    });
}

let SPARE_CACHE = [];
async function loadSpareCache() {
    if (!GAS_URL) return;
    try {
        const r = await fetch(GAS_URL + '?action=spareList');
        const j = await r.json();
        SPARE_CACHE = j.success ? (j.data || []) : [];
        fillSpareHint();
    } catch(e){}
}
function fillSpareHint() {
    const dl = document.getElementById('spare-hint'); if (!dl) return;
    dl.innerHTML = SPARE_CACHE.map(p => {
        const tag = p.type === 'SUPPLIER' ? '(Supplier) ' + (p.supplier||'') : '(Store) ' + (p.location||'');
        const pn  = p.partNo ? '[' + p.partNo + '] ' : '';
        return `<option value="${String(p.name||'').replace(/"/g,'&quot;')}">${pn}${tag}</option>`;
    }).join('');
}
function onPartNamePick(inp) {
    const hit = SPARE_CACHE.find(p => (p.name||'') === inp.value);
    if (!hit) return;
    const c = inp.closest('tr').querySelectorAll('input');
    if (hit.partNo && !c[1].value) c[1].value = hit.partNo;
}

