// ============================================================
// OEE / RELIABILITY / RANKING  (Phase 1: Availability + MTTR/MTBF)
// ============================================================

let _oeeData = [];
let _oeeChart = null;

function fmtMin(m) {
    if (m == null || m === '') return '—';
    m = Math.round(m);
    if (m < 60) return m + ' น';
    var h = Math.floor(m / 60);
    return h + ' ชม ' + (m % 60) + ' น';
}

// B3: ตั้ง default date range ต้นเดือน→วันนี้ + reset table
function initOeePanel() {
    var today = new Date();
    var firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    var fmt = function(d) {
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return d.getFullYear() + '-' + m + '-' + day;
    };
    var fromEl = document.getElementById('oee-from');
    var toEl   = document.getElementById('oee-to');
    if (fromEl && !fromEl.value) fromEl.value = fmt(firstDay);
    if (toEl   && !toEl.value)   toEl.value   = fmt(today);
    if (!_oeeData.length) {
        document.getElementById('oee-cards').innerHTML = '';
        document.getElementById('oee-tbody').innerHTML =
            '<tr><td colspan="8" class="px-3 py-10 text-center text-gray-400">กดปุ่ม 🔄 คำนวณ เพื่อดูข้อมูล</td></tr>';
    }
    _applyPermOeeBtn();
}

function _applyPermOeeBtn() {
    var btn = document.querySelector('#panel-oee button[data-perm="mc.edit"]');
    if (!btn) return;
    if (typeof can === 'function' && can('mc.edit')) btn.classList.remove('hidden');
    else btn.classList.add('hidden');
}

// B2: โหลดข้อมูลจาก GAS
async function loadOee() {
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า GAS URL ก่อน', 'error'); return; }
    var from    = document.getElementById('oee-from').value;
    var to      = document.getElementById('oee-to').value;
    var factory = document.getElementById('oee-factory').value;
    showLoading('กำลังคำนวณ…');
    try {
        var q   = new URLSearchParams({ action: 'getReliabilityMetrics', from: from, to: to, factory: factory });
        var res = await fetch(GAS_URL + '?' + q);
        var json = await res.json();
        if (!json.success) throw new Error(json.error || 'GAS error');
        _oeeData = json.data || [];
        renderOeeCards();
        renderOeeTable();
        renderOeeChart();
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}

// B2: KPI การ์ดรวม
function renderOeeCards() {
    var totFail = _oeeData.reduce(function(a, x) { return a + x.failures; }, 0);
    var totDt   = _oeeData.reduce(function(a, x) { return a + x.downtimeMin; }, 0);
    var av      = _oeeData.filter(function(x) { return x.availability != null; });
    var avgAv   = av.length ? (av.reduce(function(a, x) { return a + x.availability; }, 0) / av.length).toFixed(1) : null;
    function card(t, v, c) {
        return '<div class="bg-white rounded-xl border p-4"><p class="text-xs text-gray-500">' + t + '</p>' +
               '<p class="text-2xl font-bold" style="color:' + c + '">' + v + '</p></div>';
    }
    document.getElementById('oee-cards').innerHTML =
        card('เครื่องที่เสีย (เครื่อง)', _oeeData.length, '#1f2937') +
        card('ครั้งเสียรวม', totFail, '#c0392b') +
        card('Downtime รวม', fmtMin(totDt), '#e67e22') +
        card('Availability เฉลี่ย', avgAv != null ? avgAv + '%' : '— (ไม่มี config)', '#16a085');
}

// B2: ตารางจัดอันดับ
function renderOeeTable() {
    var key = document.getElementById('oee-sort').value;
    var asc = (key === 'mtbfMin' || key === 'availability');   // น้อย→มาก = แย่สุดอยู่บน
    var arr = _oeeData.slice().sort(function(a, b) {
        var av = a[key] != null ? a[key] : (asc ? Infinity : -1);
        var bv = b[key] != null ? b[key] : (asc ? Infinity : -1);
        return asc ? av - bv : bv - av;
    });
    var tb = document.getElementById('oee-tbody');
    if (!arr.length) {
        tb.innerHTML = '<tr><td colspan="8" class="px-3 py-10 text-center text-gray-400">ไม่มีข้อมูลในช่วงนี้</td></tr>';
        return;
    }
    tb.innerHTML = arr.map(function(x, i) {
        var avCell = x.availability != null
            ? '<span class="font-bold ' + (x.availability < 85 ? 'text-red-600' : 'text-green-600') + '">' + x.availability + '%</span>'
            : '<span class="text-gray-300">—</span>';
        // D1: OEE = Av × P × Q (P,Q รอข้อมูลผลผลิต เฟส 2)
        var oeeCell = x.availability != null
            ? '<span class="text-xs text-gray-400" title="P × Q รอข้อมูลผลผลิต (เฟส 2)">' + x.availability + '% × — × —</span>'
            : '<span class="text-gray-300">—</span>';
        return '<tr class="border-t hover:bg-gray-50">' +
            '<td class="px-3 py-2 font-bold ' + (i < 3 ? 'text-red-600' : 'text-gray-400') + '">' + (i + 1) + '</td>' +
            '<td class="px-3 py-2"><div class="font-medium">' + (x.name || x.code) + '</div>' +
            '<div class="text-xs text-gray-400">' + x.code + ' · ' + x.factory + '</div></td>' +
            '<td class="px-3 py-2 text-right font-bold">' + x.failures + '</td>' +
            '<td class="px-3 py-2 text-right">' + fmtMin(x.downtimeMin) + '</td>' +
            '<td class="px-3 py-2 text-right">' + fmtMin(x.mttrMin) + '</td>' +
            '<td class="px-3 py-2 text-right">' + fmtMin(x.mtbfMin) + '</td>' +
            '<td class="px-3 py-2 text-right">' + avCell + '</td>' +
            '<td class="px-3 py-2 text-right text-xs">' + oeeCell + '</td>' +
            '</tr>';
    }).join('');
}

// D2: Chart.js bar — top-10 downtime
function renderOeeChart() {
    var canvasId = 'oee-chart';
    var panel = document.getElementById('panel-oee');
    if (!panel) return;

    // สร้าง canvas ถ้ายังไม่มี
    if (!document.getElementById(canvasId)) {
        var wrap = document.createElement('div');
        wrap.className = 'bg-white rounded-xl border p-4 mb-4';
        wrap.innerHTML = '<p class="text-xs font-bold text-gray-500 mb-3 uppercase tracking-wider">Top 10 — Downtime รวม (นาที)</p>' +
                         '<canvas id="' + canvasId + '" height="220"></canvas>';
        var cardsEl = document.getElementById('oee-cards');
        cardsEl.parentNode.insertBefore(wrap, cardsEl.nextSibling);
    }

    if (_oeeChart) { _oeeChart.destroy(); _oeeChart = null; }

    var top10 = _oeeData.slice().sort(function(a, b) { return b.downtimeMin - a.downtimeMin; }).slice(0, 10);
    if (!top10.length) return;

    var ctx = document.getElementById(canvasId).getContext('2d');
    _oeeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: top10.map(function(x) { return x.name || x.code; }),
            datasets: [{
                label: 'Downtime (นาที)',
                data: top10.map(function(x) { return x.downtimeMin; }),
                backgroundColor: top10.map(function(_, i) { return i < 3 ? '#c0392b' : '#e67e22'; }),
                borderRadius: 6,
            }]
        },
        options: {
            responsive: true,
            plugins: { legend: { display: false } },
            scales: {
                y: { beginAtZero: true, ticks: { font: { size: 11 } } },
                x: { ticks: { font: { size: 11 }, maxRotation: 30 } }
            }
        }
    });
}

// ============================================================
// C: MACHINE CONFIG MODAL
// ============================================================

async function openOeeConfig() {
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า GAS URL ก่อน', 'error'); return; }
    // เติม datalist จากเครื่องที่เคยเสีย (_oeeData) + ดึง config ที่ตั้งไว้
    var dl = document.getElementById('oee-machine-list');
    if (dl) {
        dl.innerHTML = _oeeData.map(function(x) {
            return '<option value="' + x.code + '">' + (x.name || x.code) + '</option>';
        }).join('');
    }
    document.getElementById('oee-cfg-code').value    = '';
    document.getElementById('oee-cfg-planned').value = '';
    document.getElementById('oee-cfg-note').value    = '';

    // โหลด config ที่ตั้งไว้แล้วมาแสดง
    try {
        var res  = await fetch(GAS_URL + '?action=getMachineConfig');
        var json = await res.json();
        var listEl = document.getElementById('oee-cfg-list');
        if (json.success && json.data && json.data.length && listEl) {
            listEl.classList.remove('hidden');
            listEl.innerHTML = '<p class="font-bold text-gray-600 mb-1">ตั้งค่าแล้ว:</p>' +
                json.data.map(function(c) {
                    return '<div class="flex justify-between cursor-pointer hover:bg-gray-100 px-1 py-0.5 rounded" onclick="oeeConfigSelect(\'' + c.machineCode + '\',' + c.plannedMinPerDay + ',\'' + (c.note||'') + '\')">' +
                        '<span class="font-mono">' + c.machineCode + '</span>' +
                        '<span>' + c.plannedMinPerDay + ' น/วัน' + (c.note ? ' — ' + c.note : '') + '</span></div>';
                }).join('');
        } else if (listEl) {
            listEl.classList.add('hidden');
        }
    } catch (e) { /* ไม่แสดง config list ก็ยังใช้งานได้ */ }

    document.getElementById('oee-config-modal').classList.remove('hidden');
}

function oeeConfigSelect(code, planned, note) {
    document.getElementById('oee-cfg-code').value    = code;
    document.getElementById('oee-cfg-planned').value = planned;
    document.getElementById('oee-cfg-note').value    = note;
}

function closeOeeConfig() {
    document.getElementById('oee-config-modal').classList.add('hidden');
}

async function saveOeeConfig() {
    var code    = (document.getElementById('oee-cfg-code').value || '').trim();
    var planned = parseInt(document.getElementById('oee-cfg-planned').value, 10);
    var note    = document.getElementById('oee-cfg-note').value || '';
    if (!code)          { showToast('⚠️ ระบุรหัสเครื่องจักร', 'error'); return; }
    if (!planned || planned < 1) { showToast('⚠️ ระบุเวลาเดินเครื่อง (นาที/วัน)', 'error'); return; }
    if (!GAS_URL)       { showToast('⚠️ ตั้งค่า GAS URL ก่อน', 'error'); return; }
    showLoading('กำลังบันทึก…');
    try {
        var body  = JSON.stringify({
            action: 'setMachineConfig',
            machineCode: code,
            plannedMinPerDay: planned,
            idealCycleSec: 0,
            note: note,
            username: currentUser.username,
            pin: currentUser.pin,
        });
        var res  = await fetch(GAS_URL, { method: 'POST', body: body });
        var json = await res.json();
        if (!json.success) throw new Error(json.error || 'GAS error');
        showToast('✅ บันทึกแล้ว — กด 🔄 คำนวณเพื่ออัปเดต Availability', 'success');
        closeOeeConfig();
        loadOee();
    } catch (e) {
        showToast('❌ ' + e.message, 'error');
    } finally {
        hideLoading();
    }
}
