// ============================================================
// RECORDS — LOAD & RENDER
// ============================================================
function updateRecArea() {
    const fac = document.getElementById('rec-factory').value;
    const sel = document.getElementById('rec-area');
    sel.innerHTML = '<option value="">ทั้งหมด</option>';
    const key = fac.replace('โรงงาน ','');
    (AREA_MAP[key] || []).forEach(a => {
        const o = document.createElement('option'); o.value = o.textContent = a; sel.appendChild(o);
    });
}

let _lastRecords = [];   // เก็บผลโหลดล่าสุด ไว้กรองสดด้วยรหัสเครื่องจักรโดยไม่ต้องโหลดใหม่
let _dashRecords = [];   // ข้อมูล BD ทั้งหมด (ไม่มี filter) — สำหรับ Dashboard เท่านั้น

async function loadRecords() {
    if (!GAS_URL) { openSettings(); return; }

    const factory   = document.getElementById('rec-factory').value;
    const area      = document.getElementById('rec-area').value;
    const status    = document.getElementById('rec-status').value;
    const month     = document.getElementById('rec-month').value;
    const machineId = document.getElementById('rec-machine-id').value.trim();

    setVisible('rec-no-url',    false);
    setVisible('rec-loading',   true);
    setVisible('rec-table-wrap',false);
    setVisible('rec-empty',     false);
    showLoading('กำลังโหลดรายการ Breakdown…');
    try {
        const params = new URLSearchParams({ action:'getAll', factory, area, status, month, machineId });
        const res  = await fetch(`${GAS_URL}?${params}`);
        const json = await res.json();

        setVisible('rec-loading', false);
        if (!json.success || !json.data?.length) { _lastRecords = []; setVisible('rec-empty', true); return; }

        _lastRecords = json.data;
        applyRecordFilter();
    } catch (err) {
        setVisible('rec-loading', false);
        showToast('❌ โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    } finally { hideLoading(); }
}

// กรองรายการที่โหลดมาแล้วด้วยรหัสเครื่องจักร + สถานะ — ทำงานทันทีฝั่ง browser
function applyRecordFilter() {
    const q   = (document.getElementById('rec-machine-id')?.value || '').trim().toLowerCase();
    const tk  = (document.getElementById('rec-tracking')?.value || '').trim().toLowerCase();
    const st  = document.getElementById('rec-status')?.value || '';
    const stValues = st ? st.split('|') : [];   // "รับงานแล้ว|กำลังดำเนินการแก้ไข" → รวม legacy เข้าฟิลเตอร์เดียว
    const et  = document.getElementById('rec-event-type')?.value || '';
    const rows = _lastRecords.filter(r =>
        (!q  || String(r.machineId || '').toLowerCase().includes(q)) &&
        (!tk || String(r.tracking  || '').toLowerCase().includes(tk)) &&
        (!stValues.length || stValues.includes(r.status)) &&
        (!et || r.eventType === et)
    );

    if (!rows.length) {
        document.getElementById('rec-tbody').innerHTML = '';
        document.getElementById('rec-count').textContent = '';
        setVisible('rec-table-wrap', false);
        setVisible('rec-empty', true);
        return;
    }
    setVisible('rec-empty', false);
    renderRecordsTable(rows);
}

const STATUS_BADGE = {
    'รอรับงาน':             'bg-amber-100 text-amber-700',
    'แจ้ง Breakdown':       'bg-amber-100 text-amber-700',
    'รับงานแล้ว':           'bg-blue-100 text-blue-700',
    'กำลังดำเนินการแก้ไข':  'bg-orange-100 text-orange-700',
    'รออะไหล่':             'bg-yellow-100 text-yellow-700',
    'ซ่อมสำเร็จ':           'bg-teal-100 text-teal-700',
    'ดำเนินการเสร็จสิ้น':   'bg-green-100 text-green-700',
    'ยกเลิกงาน':            'bg-gray-100 text-gray-400',
};

// normalize วันที่ทุก format → YYYY-MM-DD (ISO / Thai dd/MM/yyyy / JS Date string เช่น "Wed Jan 07 2026")
function fmtRecordDate(v) {
    if (!v) return '—';
    v = String(v);
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);          // ISO
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})/);            // Thai dd/MM/yyyy
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    const d = new Date(v);                                // JS Date string / อื่นๆ
    if (!isNaN(d)) {
        const p = n => String(n).padStart(2,'0');
        return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
    }
    return v.slice(0,10);
}

function renderRecordsTable(rows) {
    const tbody = document.getElementById('rec-tbody');
    document.getElementById('rec-count').textContent = `${rows.length} รายการ`;
    tbody.innerHTML = rows.map((r) => {
        const dt   = r.downtimeMin ? `${Math.floor(r.downtimeMin/60)}ชม.${r.downtimeMin%60}น.` : '—';
        const date = fmtRecordDate(r.timestamp);
        const badge= STATUS_BADGE[r.status] || 'bg-gray-100 text-gray-600';
        const isCancelled = r.status === 'ยกเลิกงาน';
        const isWaiting   = r.status === 'รอรับงาน' || r.status === 'แจ้ง Breakdown';
        const isAccepted  = r.status === 'รับงานแล้ว';
        const isPending   = !isCancelled && !isWaiting && r.status !== 'ดำเนินการเสร็จสิ้น';
        const isDone      = !isCancelled && r.status === 'ดำเนินการเสร็จสิ้น';
        const j = JSON.stringify(r).replace(/'/g,"&#39;");
        const isAdmin    = can('bd.manual');
        const canEdit    = can('bd.editdoc');
        const canAccept  = can('bd.accept');
        const hasWhy  = Array.isArray(r.whys) ? r.whys.some(w => String(w).trim()) : false;
        const canPDF  = isDone && can('bd.export');
        const etBadge = r.eventType === 'Breakdown'  ? 'bg-red-100 text-red-700'  :
                        r.eventType === 'Adjustment' ? 'bg-blue-100 text-blue-700' : '';
        const etHtml  = r.eventType
            ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold ${etBadge}">${r.eventType}</span>`
            : '';
        const bdHtml  = r.bdType ? `<div class="text-gray-400 text-[10px] mt-0.5">${r.bdType}</div>` : '';
        return `<tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors${isCancelled?' opacity-60':''}">
            <td class="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">${date}${r.tracking?`<br><span class="text-gray-400 font-mono text-[10px]">${r.tracking}</span>`:''}</td>
            <td class="px-4 py-3 font-bold text-gray-900 text-sm">${r.machineName||'—'}${r.machineId?`<br><span class="text-gray-400 font-normal text-xs">${r.machineId}</span>`:''}</td>
            <td class="px-4 py-3 text-xs text-gray-600">${r.factory||''}<br><span class="text-gray-400">${r.area||''}</span></td>
            <td class="px-4 py-3 text-center">
                <span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold ${badge}">${statusLabel(r.status)||'—'}</span>
            </td>
            <td class="px-4 py-3 text-center text-sm font-bold text-orange-600">${dt}</td>
            <td class="px-4 py-3 text-center">${etHtml}${bdHtml}${!etHtml&&!bdHtml?'<span class="text-gray-400 text-xs">—</span>':''}</td>
            <td class="px-4 py-3 text-center">
                <div class="flex gap-1 justify-center flex-wrap">
                    ${(canAccept && isWaiting) ? `<button onclick='acceptRecord(${j})'
                        class="text-xs font-bold px-2 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors">✅ รับงาน</button>` : ''}
                    ${(canEdit && isAccepted) ? `<button onclick='repairCompleteRecord(${j})'
                        class="text-xs font-bold px-2 py-1 rounded-lg bg-teal-100 hover:bg-teal-200 text-teal-700 transition-colors">🔨 ซ่อมสำเร็จ</button>` : ''}
                    ${(canEdit && isPending) ? `<button onclick='openEditMode(${j})'
                        class="text-xs font-bold px-2 py-1 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-700 transition-colors">✏️ แก้ไข</button>` : ''}
                    ${(canEdit && isDone) ? `<button onclick='editWhyOnly(${j})'
                        class="text-xs font-bold px-2 py-1 rounded-lg bg-emerald-100 hover:bg-emerald-200 text-emerald-700 transition-colors">🌳 Why-Why</button>` : ''}
                    ${isAdmin ? `<button onclick='openLog(${JSON.stringify(r.tracking||"")})'
                        class="text-xs font-bold px-2 py-1 rounded-lg bg-blue-100 hover:bg-blue-200 text-blue-700 transition-colors">🕑 Log</button>` : ''}
                    ${canPDF ? `<button onclick='exportRowPDF(${j})'
                        class="text-xs font-bold px-2 py-1 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors">📄 PDF</button>` : ''}
                    ${(isAdmin && !isCancelled) ? `<button onclick='cancelRecord(${j})'
                        class="text-xs font-bold px-2 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 transition-colors">🚫 ยกเลิก</button>` : ''}
                </div>
            </td>
        </tr>`;
    }).join('');
    setVisible('rec-table-wrap', true);
}

// ============================================================
// SUMMARY — LOAD & RENDER
// ============================================================
let chartMonthly = null;
let chartType = null;

const MONTHS_TH = ['ม.ค.','ก.พ.','มี.ค.','เม.ย.','พ.ค.','มิ.ย.','ก.ค.','ส.ค.','ก.ย.','ต.ค.','พ.ย.','ธ.ค.'];
const BD_TYPES   = ['Mechanical','Electrical','Pneumatic / Hydraulic','Software / Control','อื่นๆ (Other)'];

async function loadSummary() {
    if (!GAS_URL) { openSettings(); return; }

    const year    = document.getElementById('sum-year').value;
    const factory = document.getElementById('sum-factory').value;
    const area    = document.getElementById('sum-area').value;

    setVisible('sum-loading', true);
    setVisible('sum-kpis', false);
    setVisible('sum-charts', false);
    setVisible('sum-tables', false);
    setVisible('sum-empty', false);
    showLoading('กำลังโหลดข้อมูลสรุป…');
    try {
        const url  = `${GAS_URL}?action=getData&year=${year}&factory=${encodeURIComponent(factory)}&area=${encodeURIComponent(area)}`;
        const res  = await fetch(url);
        const json = await res.json();

        setVisible('sum-loading', false);

        if (!json.success || !json.data?.length) {
            setVisible('sum-empty', true);
            return;
        }

        renderSummary(json.data, year, factory, area);

    } catch (err) {
        setVisible('sum-loading', false);
        showToast('❌ โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
        console.error(err);
    } finally { hideLoading(); }
}

function setVisible(id, show) {
    const el = document.getElementById(id);
    if (!el) return;
    show ? el.classList.remove('hidden') : el.classList.add('hidden');
}

function renderSummary(rows, year, factory, area) {
    // KPIs
    const totalCount   = rows.length;
    const totalDtMin   = rows.reduce((s, r) => s + (r.downtimeMin || 0), 0);
    const avgDtMin     = totalCount ? totalDtMin / totalCount : 0;
    const waitingCount = rows.filter(r => r.status === 'รออะไหล่').length;

    document.getElementById('kpi-count').textContent    = totalCount;
    document.getElementById('kpi-total-dt').textContent = (totalDtMin / 60).toFixed(1);
    document.getElementById('kpi-avg-dt').textContent   = (avgDtMin / 60).toFixed(1);
    document.getElementById('kpi-waiting').textContent  = waitingCount;
    setVisible('sum-kpis', true);

    // Group by month (1-12)
    const byMonth = Array.from({ length: 12 }, () => ({ count: 0, dtMin: 0, types: {} }));
    rows.forEach(r => {
        const m = parseInt((r.month || '').split('-')[1] || '0') - 1;
        if (m < 0 || m > 11) return;
        byMonth[m].count++;
        byMonth[m].dtMin += r.downtimeMin || 0;
        const t = r.bdType || 'อื่นๆ (Other)';
        byMonth[m].types[t] = (byMonth[m].types[t] || 0) + 1;
    });

    // Monthly bar chart
    const counts = byMonth.map(m => m.count);
    const dtHours = byMonth.map(m => +(m.dtMin / 60).toFixed(1));

    if (chartMonthly) chartMonthly.destroy();
    chartMonthly = new Chart(document.getElementById('chart-monthly'), {
        type: 'bar',
        data: {
            labels: MONTHS_TH,
            datasets: [
                { label: 'จำนวน BD (ครั้ง)', data: counts, backgroundColor: '#f97316', borderRadius: 6, yAxisID: 'y' },
                { label: 'Downtime (ชม.)',    data: dtHours, backgroundColor: '#93c5fd', borderRadius: 6, yAxisID: 'y1', type: 'line', borderColor: '#3b82f6', tension: 0.3, fill: false, pointRadius: 4 },
            ],
        },
        options: {
            responsive: true,
            plugins: { legend: { labels: { font: { family: 'Prompt', size: 11 } } } },
            scales: {
                y:  { beginAtZero: true, title: { display: true, text: 'ครั้ง' } },
                y1: { beginAtZero: true, position: 'right', title: { display: true, text: 'ชม.' }, grid: { drawOnChartArea: false } },
            },
        },
    });

    // Type donut chart
    const typeCounts = BD_TYPES.map(t => rows.filter(r => r.bdType === t).length);
    const typeColors = ['#f97316','#3b82f6','#10b981','#8b5cf6','#6b7280'];

    if (chartType) chartType.destroy();
    chartType = new Chart(document.getElementById('chart-type'), {
        type: 'doughnut',
        data: {
            labels: BD_TYPES.map(t => t.replace(' / Hydraulic','').replace(' / Control','')),
            datasets: [{ data: typeCounts, backgroundColor: typeColors, borderWidth: 2 }],
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Prompt', size: 10 }, boxWidth: 12 } },
            },
        },
    });

    setVisible('sum-charts', true);

    // Monthly table
    const tb = document.getElementById('monthly-tbody');
    tb.innerHTML = '';
    byMonth.forEach((m, i) => {
        if (m.count === 0) { tb.appendChild(emptyMonthRow(i)); return; }
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-100 hover:bg-gray-50';
        tr.innerHTML = `
            <td class="px-4 py-2.5 font-medium text-gray-700">${MONTHS_TH[i]} ${year}</td>
            <td class="px-4 py-2.5 text-center font-bold text-gray-900">${m.count}</td>
            <td class="px-4 py-2.5 text-center text-orange-600 font-bold">${(m.dtMin/60).toFixed(1)}</td>
            <td class="px-4 py-2.5 text-center text-gray-600">${m.count ? (m.dtMin/60/m.count).toFixed(1) : '—'}</td>
            ${BD_TYPES.map(t => `<td class="px-4 py-2.5 text-center text-gray-600">${m.types[t]||0}</td>`).join('')}`;
        tb.appendChild(tr);
    });

    // Total row
    document.getElementById('monthly-tfoot').innerHTML = `
        <tr class="border-t-2 border-gray-300 bg-gray-100">
            <td class="px-4 py-2.5 font-bold text-gray-900">รวมทั้งปี</td>
            <td class="px-4 py-2.5 text-center font-bold text-gray-900">${totalCount}</td>
            <td class="px-4 py-2.5 text-center font-bold text-orange-600">${(totalDtMin/60).toFixed(1)}</td>
            <td class="px-4 py-2.5 text-center font-bold text-gray-700">${(avgDtMin/60).toFixed(1)}</td>
            ${BD_TYPES.map(t => `<td class="px-4 py-2.5 text-center font-bold text-gray-700">${rows.filter(r=>r.bdType===t).length}</td>`).join('')}
        </tr>`;

    // Area breakdown table
    const areas = [...new Set(rows.map(r => r.area).filter(Boolean))].sort();
    const months = MONTHS_TH.map((m, i) => ({ label: m, idx: i })).filter(m => byMonth[m.idx].count > 0);

    document.getElementById('area-table-head').innerHTML =
        `<th class="px-4 py-3 text-left">พื้นที่</th>` +
        months.map(m => `<th class="px-4 py-3 text-center">${m.label}</th>`).join('') +
        `<th class="px-4 py-3 text-center">รวม BD</th><th class="px-4 py-3 text-center">รวม DT (ชม.)</th>`;

    const atb = document.getElementById('area-tbody');
    atb.innerHTML = '';
    areas.forEach(a => {
        const aRows = rows.filter(r => r.area === a);
        const aDt = aRows.reduce((s, r) => s + (r.downtimeMin || 0), 0);
        const tr = document.createElement('tr');
        tr.className = 'border-b border-gray-100 hover:bg-gray-50';
        tr.innerHTML =
            `<td class="px-4 py-2.5 font-medium text-gray-700">${a}</td>` +
            months.map(m => {
                const c = aRows.filter(r => parseInt((r.month||'').split('-')[1]||0)-1 === m.idx).length;
                return `<td class="px-4 py-2.5 text-center ${c ? 'font-bold text-gray-900' : 'text-gray-300'}">${c||'—'}</td>`;
            }).join('') +
            `<td class="px-4 py-2.5 text-center font-bold text-gray-900">${aRows.length}</td>` +
            `<td class="px-4 py-2.5 text-center font-bold text-orange-500">${(aDt/60).toFixed(1)}</td>`;
        atb.appendChild(tr);
    });

    setVisible('sum-tables', true);
}

function emptyMonthRow(i) {
    const tr = document.createElement('tr');
    tr.className = 'border-b border-gray-100';
    tr.innerHTML = `<td class="px-4 py-2 text-gray-300 text-sm">${MONTHS_TH[i]}</td>${Array(8).fill('<td class="px-4 py-2 text-center text-gray-200 text-sm">—</td>').join('')}`;
    return tr;
}

