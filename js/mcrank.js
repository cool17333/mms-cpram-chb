// ============================================================
// MACHINE CRITICALITY RANKING — collaborative TPM A/B/C/D
// ============================================================

// ---- Constants (verified from CPRAM CHB2 Ranking R1.3) ----
const DEFAULT_CRITERIA = [
  { id:1,  group:'คุณภาพ', name:'อัตราของเสีย',
    tiers:[{score:5,label:'มากกว่า 1.0%'},{score:4,label:'ต่ำกว่า 1.0%'},{score:3,label:'ต่ำกว่า 0.5%'},{score:2,label:'ต่ำกว่า 0.3%'},{score:1,label:'ต่ำกว่า 0.1%'}] },
  { id:2,  group:'คุณภาพ', name:'ค่าเสียหายสำหรับผลผลิตที่เสียต่อ 1 หน่วยการผลิต (ชุดการผลิต)',
    tiers:[{score:5,label:'มากกว่า 172 บ.'},{score:4,label:'ไม่เกิน 138 บ.'},{score:3,label:'ไม่เกิน 103 บ.'},{score:2,label:'ไม่เกิน 69 บ.'},{score:1,label:'ไม่เกิน 35 บ.'}] },
  { id:3,  group:'คุณภาพ', name:'ผลกระทบต่อคุณภาพของผลิตผลสำเร็จรูปสุดท้ายที่เกิดจากเครื่องจักรนี้ชำรุด',
    tiers:[{score:10,label:'ผลกระทบต่อไลน์ผลิต'},{score:8,label:'ผลกระทบต่อไลน์ผลิตบางส่วน'},{score:6,label:'ผลกระทบต่อแผนก'},{score:4,label:'ผลกระทบต่อจุดงาน'},{score:2,label:'ไม่มีผลกระทบ'}] },
  { id:4,  group:'ผลผลิต', name:'อัตราการใช้เครื่องจักร',
    tiers:[{score:5,label:'มากกว่า 80 %'},{score:4,label:'มากกว่า 70 %'},{score:3,label:'มากกว่า 60 %'},{score:2,label:'มากกว่า 50 %'},{score:1,label:'ต่ำกว่า 50 %'}] },
  { id:5,  group:'ผลผลิต', name:'ระดับการมีเครื่องจักรสำรอง เมื่อมีการ BREAK DOWN',
    tiers:[{score:5,label:'พอเดินได้แต่ผลผลิตตก'},{score:4,label:'ขอยืมจากแผนกอื่นได้ชั่วคราว'},{score:3,label:'มีเครื่องสำรองแต่ต้องดัดแปลง'},{score:2,label:'มีเครื่องอื่นเดินแทนได้ในแผนก'},{score:1,label:'มีเครื่องสำรองเดินได้ทันที'}] },
  { id:6,  group:'ผลผลิต', name:'ผลิตผลที่ต้องผลิตเฉพาะที่เครื่องจักรนี้ โดยไม่สามารถผลิตที่อื่นได้',
    tiers:[{score:5,label:'มากกว่า 80 %'},{score:4,label:'ผลิตที่เครื่องอื่นได้โดยจัดการดัดแปลงเครื่อง'},{score:3,label:'ผลิตที่เครื่องอื่นได้โดยดัดแปลงเครื่องเล็กน้อย'},{score:2,label:'ผลิตที่เครื่องอื่นได้ โดยจัดแผนการผลิตใหม่'},{score:1,label:'ผลิตที่อื่นได้ทันทีที่ต้องการ'}] },
  { id:7,  group:'ผลผลิต', name:'ผลกระทบเมื่อ BREAKDOWN',
    tiers:[{score:10,label:'ทั้งไลน์ผลิต'},{score:8,label:'ไลน์ผลิตบางส่วน'},{score:6,label:'แผนก'},{score:4,label:'จุดงาน'},{score:2,label:'ไม่มีผลกระทบ'}] },
  { id:8,  group:'การซ่อมบำรุง', name:'อัตราในการเกิด MINOR STOPPAGE (หยุดไม่เกิน 5 นาที)',
    tiers:[{score:5,label:'ภายใน 30 นาที'},{score:4,label:'ภายใน 1 ชม.'},{score:3,label:'ภายใน 2 ชม.'},{score:2,label:'ภายใน 1 วัน'},{score:1,label:'มากกว่า 1 วัน'}] },
  { id:9,  group:'การซ่อมบำรุง', name:'อัตราการเกิด BREAKDOWN / ปี',
    tiers:[{score:5,label:'มากกว่า 4 ครั้ง'},{score:4,label:'มากกว่า 3 ครั้ง'},{score:3,label:'มากกว่า 2 ครั้ง'},{score:2,label:'มากกว่า 1 ครั้ง'},{score:1,label:'ไม่ถึง 1 ครั้ง'}] },
  { id:10, group:'การซ่อมบำรุง', name:'จำนวนวันที่หยุดเพื่อการซ่อมแซม / ปี',
    tiers:[{score:5,label:'มากกว่า 3 วัน'},{score:4,label:'ไม่ถึง 3 วัน'},{score:3,label:'ไม่ถึง 2 วัน'},{score:2,label:'ไม่ถึง 1 วัน'},{score:1,label:'ไม่ถึง 1/2 วัน'}] },
  { id:11, group:'การซ่อมบำรุง', name:'ค่าซ่อมบำรุงเครื่องจักร (อะไหล่+ค่าแรง) / ปี',
    tiers:[{score:5,label:'มากกว่า 50000 บ.'},{score:4,label:'มากกว่า 40000 บ.'},{score:3,label:'มากกว่า 20000 บ.'},{score:2,label:'มากกว่า 10000 บ.'},{score:1,label:'ต่ำกว่า 10000 บ.'}] },
  { id:12, group:'การซ่อมบำรุง', name:'เวลาที่ใช้ในการซ่อมแต่ละครั้ง',
    tiers:[{score:5,label:'มากกว่า 1/2 วัน'},{score:4,label:'ต่ำกว่า 1/2 วัน'},{score:3,label:'มากกว่า 1 ชม.'},{score:2,label:'มากกว่า 1/2 ชม.'},{score:1,label:'ต่ำกว่า 1/2 ชม.'}] },
  { id:13, group:'ความปลอดภัย', name:'สภาวะหรือความรุนแรงในด้านความปลอดภัย เมื่อเครื่องจักร BREAKDOWN',
    tiers:[{score:10,label:'อันตรายถึงชีวิต'},{score:8,label:'จำเป็นต้องมีเครื่องป้องกัน'},{score:6,label:'จำเป็นต้องอพยพออกจากห้องนั้น'},{score:4,label:'จำเป็นต้องหยุดการทำงาน'},{score:2,label:'ไม่มีผลต่อด้านความปลอดภัย'}] },
  { id:14, group:'ความปลอดภัย', name:'ระดับในการตรวจเช็คประจำวัน',
    tiers:[{score:5,label:'ตรวจเช็คอย่างสม่ำเสมอตลอดเวลาทั้งวัน'},{score:4,label:'ตรวจเช็คในบางครั้ง ระหว่างเดินเครื่อง'},{score:3,label:'ตรวจเฉพาะก่อนและเริ่มเดินเครื่อง'},{score:2,label:'ตรวจเฉพาะตามเวลาที่กำหนด'},{score:1,label:'ไม่มีการตรวจ'}] },
  { id:15, group:'อื่นๆ', name:'จำนวนปีหลังจากวันที่ติดตั้ง',
    tiers:[{score:5,label:'เกินกว่า 15 ปี'},{score:4,label:'เกินกว่า 10 ปี'},{score:3,label:'เกินกว่า 8 ปี'},{score:2,label:'เกินกว่า 5 ปี'},{score:1,label:'ไม่เกิน 5 ปี'}] },
];
const RANK_FACTOR = 1.11;
const RANK_COLOR  = { A:'#c0392b', B:'#e67e22', C:'#f1c40f', D:'#27ae60' };
const SECTION_LEVEL = { 'คุณภาพ':'QA','ผลผลิต':'Production','การซ่อมบำรุง':'Engineer','ความปลอดภัย':'Safety','อื่นๆ':'*' };
const MC_SECTIONS_ORDER = ['คุณภาพ','ผลผลิต','การซ่อมบำรุง','ความปลอดภัย','อื่นๆ'];

function calcRank(scores) {
    var raw = DEFAULT_CRITERIA.reduce(function(a, c) { return a + (Number(scores[c.id])||0); }, 0);
    var f   = Math.round(raw * RANK_FACTOR * 100) / 100;
    return { rawSum: raw, finalScore: f, rank: f >= 81 ? 'A' : f >= 61 ? 'B' : f >= 41 ? 'C' : 'D' };
}

function canReviewSection(user, section) {
    if (!user || !user.level) return false;
    if (user.level === 'Administrator') return true;        // admin เซ็นได้ทุกหมวด
    var req = SECTION_LEVEL[section];
    if (!req) return false;
    if (req === '*') return user.level !== 'Visitor';        // 'อื่นๆ' = ใครก็ได้ที่ login
    return user.level === req;   // QA→คุณภาพ, Production→ผลผลิต, Engineer→ซ่อมบำรุง, Safety→ปลอดภัย
}

function criteriaByGroup(group) {
    return DEFAULT_CRITERIA.filter(function(c) { return c.group === group; });
}

// ---- State ----
var _mcrData      = [];   // array of ranking rows from GAS
var _mcrAreaDescs = {};   // { criterionId: { score: label } } override for current area
var _mcrOverview  = null;
var _mcrYear      = String(new Date().getFullYear());
var _mcrChart     = null;
var _mcrFormRow   = null; // current machine row being assessed
var _mcrApprovals = {};   // { area: {sections:{sec:{by,at}}, status} } ปีปัจจุบัน

// ---- Panel init ----
function initMcRankPanel() {
    var yearEl = document.getElementById('mcr-year');
    if (yearEl && !yearEl.value) yearEl.value = _mcrYear;
    if (!_mcrData.length && !_mcrOverview) {
        loadMcRankOverview();
    }
}

// ============================================================
// C: DASHBOARD
// ============================================================

async function loadFormApprovals() {
    if (!GAS_URL) return;
    try {
        var res  = await fetch(GAS_URL + '?action=getFormApprovals&year=' + encodeURIComponent(_mcrYear));
        var json = await res.json();
        _mcrApprovals = json.success ? (json.data || {}) : {};
    } catch(e) { _mcrApprovals = {}; }
}
function isAreaFormApproved(area) {
    var a = _mcrApprovals[String(area||'').trim()];
    return !!(a && a.status === 'approved');
}

async function loadMcRankOverview() {
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า GAS URL ก่อน','error'); return; }
    var year    = (document.getElementById('mcr-year')?.value || _mcrYear).trim();
    var factory = document.getElementById('mcr-factory')?.value || '';
    _mcrYear = year;
    showLoading('กำลังโหลด…');
    try {
        var [ovRes, listRes] = await Promise.all([
            fetch(GAS_URL + '?action=getRankingOverview&year=' + encodeURIComponent(year)),
            fetch(GAS_URL + '?action=getMachineRankings&year=' + encodeURIComponent(year) + (factory ? '&factory=' + encodeURIComponent(factory) : ''))
        ]);
        var ov   = await ovRes.json();
        var list = await listRes.json();
        if (!ov.success)   throw new Error(ov.error || 'ไม่สำเร็จ');
        if (!list.success) throw new Error(list.error || 'ไม่สำเร็จ');
        _mcrOverview = ov;
        _mcrData     = list.data || [];
        await loadFormApprovals();
        renderMcRankKPIs();
        renderMcRankSectionProgress();
        renderMcRankChart();
        mcrPopulateAreaFilter();
        renderMcRankTable();
        renderMcApprovalDash();
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

function renderMcRankKPIs() {
    var el = document.getElementById('mcr-kpi-cards');
    if (!el) return;
    var facF = document.getElementById('mcr-factory')?.value || '';
    var machines = (typeof machineMaster !== 'undefined' ? machineMaster : []).filter(function(m){
        return !facF || m.factory === facF;
    });
    var registryTotal = machines.length;
    var byCode = {};
    _mcrData.forEach(function(r){ byCode[String(r.machineCode||'').trim().toLowerCase()] = r; });
    var assessed = 0;
    machines.forEach(function(m){
        var r = byCode[String(m.id||'').trim().toLowerCase()];
        if (r && (r.status === 'complete' || r.status === 'partial')) assessed++;
    });
    var pending = registryTotal - assessed;
    var pct = registryTotal ? Math.round(assessed / registryTotal * 100) : 0;
    function card(t, v, c) {
        return '<div class="bg-white rounded-xl border p-4 text-center">' +
               '<p class="text-xs text-gray-400 mb-1">' + t + '</p>' +
               '<p class="text-2xl font-bold" style="color:' + c + '">' + v + '</p></div>';
    }
    el.innerHTML = card('เครื่องจักรทั้งหมด (ทะเบียน)', registryTotal, '#1f2937') +
                   card('ประเมินแล้ว', assessed, '#16a085') +
                   card('รอประเมิน', pending, '#e67e22') +
                   card('ความคืบหน้า', pct + '%', pct >= 80 ? '#16a085' : '#e67e22');
}

function renderMcRankSectionProgress() {
    var el = document.getElementById('mcr-section-progress');
    if (!el || !_mcrOverview) return;
    var ov  = _mcrOverview;
    var tot = ov.total || 0;
    var sec = ov.sections || {};
    el.innerHTML = MC_SECTIONS_ORDER.map(function(name) {
        var done = sec[name] || 0;
        var pct  = tot ? Math.round(done/tot*100) : 0;
        return '<div class="flex items-center gap-3">' +
               '<div class="text-xs text-gray-600 w-28 shrink-0">' + name + '</div>' +
               '<div class="flex-1 bg-gray-100 rounded-full h-2"><div class="h-2 rounded-full transition-all" style="width:' + pct + '%;background:#2475b0"></div></div>' +
               '<div class="text-xs text-gray-500 w-16 text-right">' + done + '/' + tot + '</div></div>';
    }).join('');
}

function renderMcRankChart() {
    var canvasId = 'mcr-rank-chart';
    if (!document.getElementById(canvasId)) return;
    if (_mcrChart) { _mcrChart.destroy(); _mcrChart = null; }
    var ov = _mcrOverview;
    if (!ov) return;
    var dist = ov.rankDist || {};
    var ctx = document.getElementById(canvasId).getContext('2d');
    _mcrChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['A (สำคัญมาก)','B (สำคัญ)','C (ปานกลาง)','D (ต่ำ)'],
            datasets: [{ data: [dist.A||0, dist.B||0, dist.C||0, dist.D||0],
                         backgroundColor: ['#c0392b','#e67e22','#f1c40f','#27ae60'], borderWidth: 2 }]
        },
        options: { responsive: true, cutout:'60%', plugins: { legend: { position:'bottom', labels:{ font:{size:11} } } } }
    });
}

function renderMcRankTable() {
    var tb = document.getElementById('mcr-tbody');
    if (!tb) return;
    var facF  = document.getElementById('mcr-factory')?.value || '';
    var areaF = document.getElementById('mcr-area')?.value || '';
    var stF   = document.getElementById('mcr-status')?.value || '';
    var rankF = document.getElementById('mcr-rank')?.value || '';
    // index record ที่ประเมินแล้ว ตามรหัสเครื่อง
    var byCode = {};
    _mcrData.forEach(function(r){ byCode[String(r.machineCode||'').trim().toLowerCase()] = r; });
    // ทุกเครื่องในทะเบียน (filter โรงงาน/พื้นที่) แล้ว merge กับ record
    var machines = (typeof machineMaster !== 'undefined' ? machineMaster : []).filter(function(m){
        return (!facF || m.factory === facF) && (!areaF || m.area === areaF);
    });
    var list = machines.map(function(m){
        var r = byCode[String(m.id||'').trim().toLowerCase()];
        var assessed = !!(r && (r.status === 'complete' || r.status === 'partial'));
        return { machineCode:m.id, machineName:m.name, factory:m.factory, area:m.area,
                 rank: r ? r.rank : '', finalScore: r ? r.finalScore : '',
                 status: r ? r.status : 'not-assessed', sections: r ? r.sections : {}, assessed:assessed };
    }).filter(function(r){
        if (rankF && r.rank !== rankF) return false;
        if (!stF) return true;
        if (stF === 'assessed')     return r.assessed;
        if (stF === 'not-assessed') return !r.assessed;
        return r.status === stF;   // complete / partial
    });
    if (!list.length) {
        tb.innerHTML = '<tr><td colspan="7" class="px-4 py-10 text-center text-gray-400">ไม่มีเครื่องจักรตามเงื่อนไข (เลือกโรงงาน/พื้นที่)</td></tr>';
        return;
    }
    tb.innerHTML = list.map(function(r) {
        var rankBadge = r.rank
            ? '<span class="inline-block px-2 py-0.5 rounded font-bold text-white text-xs" style="background:' + (RANK_COLOR[r.rank]||'#666') + '">' + r.rank + '</span>'
            : '<span class="text-gray-300 text-xs">—</span>';
        var statusBadge = {
            'complete':     '<span class="text-xs font-bold text-green-600">✓ ครบ</span>',
            'partial':      '<span class="text-xs font-bold text-orange-500">⏳ บางส่วน</span>',
            'not-started':  '<span class="text-xs text-gray-400">ยังไม่เริ่ม</span>',
            'not-assessed': '<span class="text-xs text-gray-400">ยังไม่ประเมิน</span>',
        }[r.status] || '<span class="text-xs text-gray-400">ยังไม่ประเมิน</span>';
        var secDots = MC_SECTIONS_ORDER.map(function(sec) {
            var signed = r.sections && r.sections[sec] && r.sections[sec].by;
            return '<span title="' + sec + ': ' + (signed ? r.sections[sec].by : 'รอ') + '" style="color:' + (signed?'#16a085':'#d1d5db') + '">●</span>';
        }).join('');
        var safeCode = String(r.machineCode||'').replace(/'/g,'');
        return '<tr class="border-t hover:bg-gray-50">' +
            '<td class="px-3 py-2 font-mono text-xs">' + r.machineCode + '</td>' +
            '<td class="px-3 py-2 text-sm">' + (r.machineName||'') + '<div class="text-xs text-gray-400">' + (r.factory||'') + ' · ' + (r.area||'') + '</div></td>' +
            '<td class="px-3 py-2 text-center tracking-widest text-base">' + secDots + '</td>' +
            '<td class="px-3 py-2 text-center">' + rankBadge + '</td>' +
            '<td class="px-3 py-2 text-center">' + (r.finalScore || '—') + '</td>' +
            '<td class="px-3 py-2 text-center">' + statusBadge + '</td>' +
            (!can('tpm.rank')
              ? '<td class="px-3 py-2 text-center"><span class="text-xs text-gray-300">—</span></td>'
              : isAreaFormApproved(r.area)
                ? '<td class="px-3 py-2 text-center"><button onclick="openMcRankForm(\'' + safeCode + '\')" class="text-xs font-bold text-blue-600 hover:text-blue-800 underline">ประเมิน</button></td>'
                : '<td class="px-3 py-2 text-center"><span class="text-xs text-gray-400" title="พื้นที่นี้ยังไม่อนุมัติฟอร์ม">🔒 รออนุมัติฟอร์ม</span></td>') +
            '</tr>';
    }).join('');
}

function mcrFilterChanged() { renderMcRankTable(); }

// v2.27: populate ตัวเลือกพื้นที่ (mcr-area) ตามโรงงาน — เลือกพื้นที่ได้ต่อเมื่อเลือกโรงงานแล้ว
function mcrPopulateAreaFilter() {
    var sel = document.getElementById('mcr-area');
    if (!sel) return;
    var fac = document.getElementById('mcr-factory')?.value || '';
    if (!fac) {
        sel.disabled = true;
        sel.innerHTML = '<option value="">เลือกโรงงานก่อน</option>';
        return;
    }
    var cur = sel.value;
    var areas = {};
    (typeof machineMaster !== 'undefined' ? machineMaster : []).forEach(function(m){
        if (m.factory !== fac) return;
        if (m.area) areas[m.area] = true;
    });
    sel.disabled = false;
    sel.innerHTML = '<option value="">ทุก Area</option>' + Object.keys(areas).sort().map(function(a){
        return '<option' + (a === cur ? ' selected' : '') + '>' + a + '</option>';
    }).join('');
}

// ============================================================
// B: ASSESSMENT FORM
// ============================================================

var _mcrFormData = null;   // ranking row data for current machine

async function openMcRankForm(machineCode) {
    if (!machineCode) {
        // เปิด form ใหม่ — ต้องเลือกเครื่อง
        document.getElementById('mcr-form-machine').value = '';
        document.getElementById('mcr-form-year').value    = _mcrYear;
        document.getElementById('mcr-form-name').value    = '';
        document.getElementById('mcr-form-factory').value = '';
        document.getElementById('mcr-form-area').value    = '';
        _mcrFormData = null;
        renderMcRankForm();
        document.getElementById('mcr-assess-modal').classList.remove('hidden');
        return;
    }
    // load existing row
    showLoading('กำลังโหลด…');
    try {
        var res  = await fetch(GAS_URL + '?action=getMachineRankings&year=' + encodeURIComponent(_mcrYear));
        var json = await res.json();
        if (!json.success) throw new Error(json.error || 'ไม่สำเร็จ');
        var row = (json.data||[]).find(function(r) { return r.machineCode === machineCode; });
        _mcrFormData = row || null;
        // เติมข้อมูลเครื่องจากทะเบียน
        var machines = typeof machineMaster !== 'undefined' ? machineMaster : [];
        var mc = machines.find(function(m){ return m.id === machineCode; });
        // gate: เช็ค area ว่าอนุมัติฟอร์มแล้วหรือยัง
        var area = (row && row.area) || (mc && mc.area) || '';
        if (area && !isAreaFormApproved(area)) {
            showToast('🔒 พื้นที่ "' + area + '" ยังไม่อนุมัติฟอร์มประจำปี', 'error');
            hideLoading();
            return;
        }
        document.getElementById('mcr-form-machine').value  = machineCode;
        document.getElementById('mcr-form-year').value     = _mcrYear;
        document.getElementById('mcr-form-name').value     = (row && row.machineName) || (mc && mc.name) || '';
        document.getElementById('mcr-form-factory').value  = (row && row.factory) || (mc && mc.factory) || '';
        document.getElementById('mcr-form-area').value     = (row && row.area) || (mc && mc.area) || '';
        // โหลด area descriptions
        var area = (row && row.area) || (mc && mc.area) || '';
        if (area) {
            var dRes  = await fetch(GAS_URL + '?action=getAreaDescriptions&area=' + encodeURIComponent(area) + '&year=' + encodeURIComponent(_mcrYear));
            var dJson = await dRes.json();
            _mcrAreaDescs = dJson.success ? (dJson.data || {}) : {};
        } else {
            _mcrAreaDescs = {};
        }
        renderMcRankForm();
        document.getElementById('mcr-assess-modal').classList.remove('hidden');
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

function closeMcRankForm() {
    document.getElementById('mcr-assess-modal').classList.add('hidden');
}

function getLabelForTier(criterionId, score) {
    var override = _mcrAreaDescs[String(criterionId)];
    if (override && override[String(score)] != null) return override[String(score)];
    var crit = DEFAULT_CRITERIA.find(function(c){ return c.id === criterionId; });
    if (!crit) return '';
    var tier = crit.tiers.find(function(t){ return t.score === score; });
    return tier ? tier.label : '';
}

function renderMcRankForm() {
    var el = document.getElementById('mcr-form-body');
    if (!el) return;
    var row = _mcrFormData;

    // แสดง rank ถ้า complete
    var rankHtml = '';
    if (row && row.status === 'complete' && row.rank) {
        rankHtml = '<div class="mb-4 p-3 rounded-xl text-center border-2" style="border-color:' + (RANK_COLOR[row.rank]||'#666') + '">' +
            '<p class="text-xs text-gray-500">ผลการประเมิน</p>' +
            '<p class="text-4xl font-black" style="color:' + (RANK_COLOR[row.rank]||'#666') + '">' + row.rank + '</p>' +
            '<p class="text-sm text-gray-600">คะแนน ' + row.finalScore + ' (raw ' + row.rawSum + ')</p></div>';
    } else if (row && row.status === 'partial') {
        var signedCount = MC_SECTIONS_ORDER.filter(function(s){ return row.sections && row.sections[s] && row.sections[s].by; }).length;
        rankHtml = '<div class="mb-4 p-3 rounded-xl bg-orange-50 border border-orange-200 text-center">' +
            '<p class="text-xs text-orange-600 font-bold">รอครบ 5 หัวข้อ (' + signedCount + '/5 เสร็จแล้ว)</p></div>';
    }

    // render แต่ละหมวด
    var sectionsHtml = MC_SECTIONS_ORDER.map(function(secName) {
        var crits     = criteriaByGroup(secName);
        var signed    = row && row.sections && row.sections[secName] && row.sections[secName].by;
        var reviewer  = signed ? (row.sections[secName].by + ' · ' + row.sections[secName].at) : '';
        var canEdit   = canReviewSection(currentUser, secName);
        var isLocked  = !canEdit;

        var reviewerBy = signed ? row.sections[secName].by : '';
        var reviewerAt = signed ? row.sections[secName].at : '';
        var sectionHdr = '<div class="mb-3">' +
            '<div class="flex items-center justify-between flex-wrap gap-1">' +
            '<div class="flex items-center gap-2 flex-wrap">' +
              '<p class="font-bold text-gray-700">' + secName + '</p>' +
              (signed
                ? '<span class="text-xs text-green-800 bg-green-100 rounded-lg px-2 py-0.5">👤 ผู้ประเมิน: <b>' + reviewerBy + '</b> · 📅 ' + reviewerAt + '</span>'
                : '') +
            '</div>' +
            (signed
                ? '<span class="text-xs text-green-600 font-bold">✓ เซ็นแล้ว</span>'
                : (isLocked
                    ? '<span class="text-xs text-gray-400">รอทีม ' + (SECTION_LEVEL[secName]||'') + '</span>'
                    : '<span class="text-xs text-orange-500 font-bold">รอการเซ็น</span>')
            ) +
            '</div>' +
            '</div>';

        var rows = crits.map(function(c) {
            var existingScore = row && row.scores && row.scores[c.id] != null ? row.scores[c.id] : null;
            if (isLocked || (signed && !canEdit)) {
                // read-only
                var dispLabel = existingScore != null ? getLabelForTier(c.id, existingScore) : '—';
                return '<div class="py-1.5 border-b border-gray-50">' +
                    '<p class="text-xs text-gray-700 mb-0.5">' + c.id + '. ' + c.name + '</p>' +
                    '<p class="text-xs text-gray-400">' + (existingScore != null ? existingScore + ' คะแนน — ' + dispLabel : '—') + '</p></div>';
            }
            // editable dropdown
            var opts = c.tiers.map(function(t) {
                var lbl = getLabelForTier(c.id, t.score);
                return '<option value="' + t.score + '"' + (existingScore === t.score ? ' selected' : '') + '>' + t.score + ' — ' + lbl + '</option>';
            }).join('');
            return '<div class="py-1.5 border-b border-gray-50">' +
                '<p class="text-xs text-gray-700 mb-0.5">' + c.id + '. ' + c.name + '</p>' +
                '<select id="mcr-s' + c.id + '" class="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs">' +
                '<option value="">— เลือกคะแนน —</option>' + opts + '</select></div>';
        }).join('');

        var btn = (!isLocked && canEdit)
            ? '<div class="mt-2 flex justify-end"><button onclick="saveMcRankSection(\'' + secName + '\')" class="px-4 py-1.5 text-white text-xs font-bold rounded-lg" style="background:#2475b0">✅ เซ็น & บันทึกหัวข้อนี้</button></div>'
            : '';

        return '<div class="mb-5 p-3 rounded-xl border ' + (signed ? 'border-green-200 bg-green-50' : (isLocked ? 'border-gray-100 bg-gray-50' : 'border-blue-200 bg-blue-50')) + '">' +
            sectionHdr + rows + btn + '</div>';
    }).join('');

    el.innerHTML = rankHtml + sectionsHtml;
}

async function saveMcRankSection(section) {
    var code    = (document.getElementById('mcr-form-machine')?.value || '').trim();
    var year    = (document.getElementById('mcr-form-year')?.value || _mcrYear).trim();
    var name    = (document.getElementById('mcr-form-name')?.value || '').trim();
    var factory = (document.getElementById('mcr-form-factory')?.value || '').trim();
    var area    = (document.getElementById('mcr-form-area')?.value || '').trim();
    if (!code) { showToast('⚠️ ระบุรหัสเครื่องจักร', 'error'); return; }
    var crits  = criteriaByGroup(section);
    var scores = {};
    var missing = false;
    crits.forEach(function(c) {
        var el = document.getElementById('mcr-s' + c.id);
        if (!el) return;
        var v = el.value;
        if (!v) { missing = true; return; }
        scores[c.id] = Number(v);
    });
    if (missing) { showToast('⚠️ กรอกคะแนนให้ครบทุกข้อในหัวข้อ ' + section, 'error'); return; }
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า GAS URL ก่อน', 'error'); return; }
    showLoading('กำลังบันทึก…');
    try {
        var body = JSON.stringify({
            action: 'setRankingSection',
            machineCode: code, year: year, machineName: name, factory: factory, area: area,
            section: section, scores: scores,
            username: currentUser.username, pin: currentUser.pin,
        });
        var res  = await fetch(GAS_URL, { method:'POST', body: body });
        var json = await res.json();
        if (!json.success) throw new Error(json.error || 'ไม่สำเร็จ');
        showToast('✅ บันทึกหัวข้อ ' + section + ' แล้ว' + (json.rank ? ' → Rank ' + json.rank : ''), 'success');
        // อัปเดต form data
        var res2  = await fetch(GAS_URL + '?action=getMachineRankings&year=' + encodeURIComponent(year));
        var json2 = await res2.json();
        if (json2.success) {
            _mcrFormData = (json2.data||[]).find(function(r){ return r.machineCode === code; }) || null;
        }
        renderMcRankForm();
        // refresh dashboard
        _mcrData     = json2.success ? (json2.data||[]) : _mcrData;
        renderMcRankTable();
    } catch(e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

// (RUBRIC EDITOR ลบ v2.20 — แก้ description ย้ายเข้า flow อนุมัติรายหมวด: approveFormSection)

// ============================================================
// FORM APPROVAL — อนุมัติฟอร์มประเมินรายพื้นที่รายปี
// ============================================================

function getDistinctAreas(factory) {
    var machines = typeof machineMaster !== 'undefined' ? machineMaster : [];
    var set = {};
    machines.forEach(function(m) {
        if (factory && m.factory !== factory) return;
        if (m.area) set[m.area] = (m.factory || '');
    });
    return Object.keys(set).sort().map(function(a) { return { area: a, factory: set[a] }; });
}

// v2.20: dashboard อนุมัติฟอร์ม (ในหน้า Ranking) — แทน panel-mcapprove เดิม, ใช้ filter mcr-factory
function renderMcApprovalDash() {
    var tb = document.getElementById('mcr-approval-tbody');
    if (!tb) return;
    var fac   = document.getElementById('mcr-factory')?.value || '';
    var areas = getDistinctAreas(fac);
    var sumEl = document.getElementById('mcr-approval-summary');
    if (!areas.length) {
        tb.innerHTML = '<tr><td colspan="4" class="px-4 py-8 text-center text-gray-400">ไม่มีพื้นที่ในทะเบียนเครื่อง</td></tr>';
        if (sumEl) sumEl.textContent = '';
        return;
    }
    var approved = 0;
    tb.innerHTML = areas.map(function(a) {
        var ap = _mcrApprovals[a.area];
        if (ap && ap.status === 'approved') approved++;
        var dots = MC_SECTIONS_ORDER.map(function(sec) {
            var s = ap && ap.sections && ap.sections[sec] && ap.sections[sec].by;
            return '<span title="' + sec + (s ? ': ' + ap.sections[sec].by : ': รอ') + '" style="color:' + (s ? '#16a085' : '#d1d5db') + '">●</span>';
        }).join('');
        var stBadge = (ap && ap.status === 'approved')
            ? '<span class="text-xs font-bold text-green-600">✓ อนุมัติแล้ว</span>'
            : (ap && ap.status === 'partial' ? '<span class="text-xs font-bold text-orange-500">⏳ บางส่วน</span>' : '<span class="text-xs text-gray-400">ยังไม่เริ่ม</span>');
        var safe = String(a.area).replace(/'/g, '');
        return '<tr class="border-t hover:bg-gray-50">' +
            '<td class="px-3 py-2 text-sm">' + a.area + '<div class="text-xs text-gray-400">' + (a.factory || '') + '</div></td>' +
            '<td class="px-3 py-2 text-center tracking-widest text-base">' + dots + '</td>' +
            '<td class="px-3 py-2 text-center">' + stBadge + '</td>' +
            (can('tpm.approve')
              ? '<td class="px-3 py-2 text-center"><button onclick="openFormApproval(\'' + safe + '\')" class="text-xs font-bold text-blue-600 hover:text-blue-800 underline">ดูฟอร์ม + อนุมัติ/แก้</button></td>'
              : '<td class="px-3 py-2 text-center"><span class="text-xs text-gray-300">—</span></td>') +
            '</tr>';
    }).join('');
    if (sumEl) sumEl.textContent = 'อนุมัติแล้ว ' + approved + '/' + areas.length + ' พื้นที่';
    // v2.27 (D2): อนุมัติครบทุกพื้นที่ → หุบ, ยังไม่ครบ → กาง
    var apBox   = document.getElementById('mcr-approval-collapse');
    var apCaret = document.getElementById('mcr-approval-caret');
    var allApproved = areas.length > 0 && approved === areas.length;
    if (apBox)   apBox.classList.toggle('hidden', allApproved);
    if (apCaret) apCaret.style.transform = allApproved ? 'rotate(-90deg)' : '';
}

// v2.27: หุบ/กาง dashboard อนุมัติฟอร์ม
function toggleMcApprovalDash() {
    var box   = document.getElementById('mcr-approval-collapse');
    var caret = document.getElementById('mcr-approval-caret');
    if (!box) return;
    var hidden = box.classList.toggle('hidden');
    if (caret) caret.style.transform = hidden ? 'rotate(-90deg)' : '';
}

var _mcApprovalArea = null;
async function openFormApproval(area) {
    _mcApprovalArea = area;
    try {
        var dRes  = await fetch(GAS_URL + '?action=getAreaDescriptions&area=' + encodeURIComponent(area) + '&year=' + encodeURIComponent(_mcrYear));
        var dJson = await dRes.json();
        _mcrAreaDescs = dJson.success ? (dJson.data || {}) : {};
    } catch(e) { _mcrAreaDescs = {}; }
    var aEl = document.getElementById('mcfa-area');
    if (aEl) aEl.textContent = area;
    renderFormApprovalBody(area);
    document.getElementById('mcfa-modal').classList.remove('hidden');
}
function closeFormApproval() { document.getElementById('mcfa-modal').classList.add('hidden'); }

function renderFormApprovalBody(area) {
    var el = document.getElementById('mcfa-body');
    if (!el) return;
    var ap = _mcrApprovals[area] || { sections: {} };
    el.innerHTML = MC_SECTIONS_ORDER.map(function(secName) {
        var crits    = criteriaByGroup(secName);
        var signed   = ap.sections && ap.sections[secName] && ap.sections[secName].by;
        var canEdit  = canReviewSection(currentUser, secName);
        var canSign  = canEdit && !signed;            // ทีมตัวเอง + ยังไม่เซ็น → อนุมัติได้ (canReviewSection)
        var editable = canSign && can('tpm.desc');    // + สิทธิ์ tpm.desc → แก้คำอธิบาย (input) ได้
        var critHtml = crits.map(function(c) {
            var tiers = c.tiers.map(function(t) {
                var cur = getLabelForTier(c.id, t.score);
                if (editable) {
                    return '<div class="flex items-center gap-2 py-0.5">' +
                        '<span class="shrink-0 text-xs font-bold text-gray-500 w-7">' + t.score + '</span>' +
                        '<input type="text" id="mcfad-' + c.id + '-' + t.score + '" value="' + String(cur).replace(/"/g,'&quot;') + '"' +
                        ' placeholder="' + String(t.label).replace(/"/g,'&quot;') + '"' +
                        ' class="flex-1 border border-gray-200 rounded px-2 py-0.5 text-xs"></div>';
                }
                return '<div class="text-[11px] text-gray-400">' + t.score + ' — ' + cur + '</div>';
            }).join('');
            return '<div class="py-1.5 border-b border-gray-50"><p class="text-xs font-bold text-gray-700">' + c.id + '. ' + c.name + '</p>' +
                   '<div class="mt-0.5">' + tiers + '</div></div>';
        }).join('');
        var hdr = '<div class="flex items-center justify-between mb-1"><p class="font-bold text-gray-700">' + secName + '</p>' +
            (signed ? '<span class="text-xs text-green-600 font-bold">✓ อนุมัติโดย ' + ap.sections[secName].by + ' · ' + ap.sections[secName].at + '</span>'
                    : (canSign ? '<span class="text-xs text-orange-500 font-bold">' + (editable ? 'แก้คำอธิบายได้ก่อนอนุมัติ' : 'พร้อมอนุมัติ') + '</span>'
                               : '<span class="text-xs text-gray-400">รอทีม ' + (SECTION_LEVEL[secName] || '') + '</span>')) + '</div>';
        var btn = canSign
            ? '<div class="mt-2 flex justify-end"><button onclick="approveFormSection(\'' + secName + '\')" class="px-4 py-1.5 text-white text-xs font-bold rounded-lg" style="background:#2475b0">' + (editable ? '💾 บันทึกคำอธิบาย & อนุมัติ' : '✅ อนุมัติหัวข้อนี้') + '</button></div>'
            : '';
        return '<div class="mb-4 p-3 rounded-xl border ' + (signed ? 'border-green-200 bg-green-50' : (canSign ? 'border-blue-200 bg-blue-50' : 'border-gray-100 bg-gray-50')) + '">' + hdr + critHtml + btn + '</div>';
    }).join('');
}

async function approveFormSection(section) {
    if (!_mcApprovalArea) return;
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า GAS URL ก่อน', 'error'); return; }
    if (!currentUser || !currentUser.username) { showToast('⚠️ เข้าสู่ระบบก่อน', 'error'); return; }
    var crits = criteriaByGroup(section);
    // 1) เก็บคำอธิบายที่แก้ของหัวข้อนี้
    var items = [];
    crits.forEach(function(c) {
        c.tiers.forEach(function(t) {
            var inp = document.getElementById('mcfad-' + c.id + '-' + t.score);
            if (inp) items.push({ criterionId: c.id, score: t.score, label: inp.value });
        });
    });
    showLoading('กำลังบันทึก & อนุมัติ…');
    try {
        // 2) save descriptions (รายปี รายหัวข้อ) — ถ้าไม่มี input (ไม่ได้แก้) ก็ข้าม
        if (items.length) {
            var r1 = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
                action:'setAreaDescriptions', area:_mcApprovalArea, year:_mcrYear, items:items,
                username:currentUser.username, pin:currentUser.pin }) });
            var j1 = await r1.json();
            if (!j1.success) throw new Error(j1.error || 'บันทึกคำอธิบายไม่สำเร็จ');
        }
        // 3) sign approval หัวข้อนี้
        var r2 = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'setFormApproval', area:_mcApprovalArea, year:_mcrYear, section:section,
            username:currentUser.username, pin:currentUser.pin }) });
        var j2 = await r2.json();
        if (!j2.success) throw new Error(j2.error || 'อนุมัติไม่สำเร็จ');
        showToast('✅ บันทึก & อนุมัติหัวข้อ ' + section + ' แล้ว' + (j2.status === 'approved' ? ' — พื้นที่นี้พร้อมประเมิน' : ''), 'success');
        // 4) reload descriptions (รายปี) + approvals + dashboard
        var dRes = await fetch(GAS_URL + '?action=getAreaDescriptions&area=' + encodeURIComponent(_mcApprovalArea) + '&year=' + encodeURIComponent(_mcrYear));
        var dJson = await dRes.json();
        _mcrAreaDescs = dJson.success ? (dJson.data || {}) : {};
        await loadFormApprovals();
        renderFormApprovalBody(_mcApprovalArea);
        renderMcApprovalDash();
        renderMcRankTable();
    } catch(e) { showToast('❌ ' + e.message, 'error'); }
    finally { hideLoading(); }
}
