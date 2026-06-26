// ============================================================
// QR SCAN — popup เลือก 3 อย่างหลัง scan (ก้อน B)
// URL scheme: ?mode=scan&m={machineId}
// Backward-compat: mode=daily / mode=bd-report → redirect เข้า scan flow
// ============================================================
let _scanMachineId  = '';
let _scanPreselect  = '';   // 'daily' | 'bd' | 'adj' | ''

function enterScan(machineId, preselect) {
    _scanMachineId = machineId || '';
    _scanPreselect = preselect || '';
    if (!currentUser.username) {
        // ยังไม่ login → เปิด login modal แล้ว callback
        window._afterLoginCallback = function() { showScanChoice(_scanMachineId, _scanPreselect); };
        openLogin();
    } else {
        showScanChoice(_scanMachineId, _scanPreselect);
    }
}

function showScanChoice(machineId, preselect) {
    const machine = (typeof machineMaster !== 'undefined' ? machineMaster : [])
        .find(m => (m.id || m.machineId || m.machine_id || '') === machineId) || {};
    const machineName = machine.name || machine.machineName || machineId || '—';
    const factory     = machine.factory || '';
    const area        = machine.area || '';

    const modal = document.getElementById('scan-choice-modal');
    if (modal) {
        document.getElementById('scan-machine-name').textContent = machineName;
        document.getElementById('scan-machine-sub').textContent  = [factory, area].filter(Boolean).join(' / ');
        modal.classList.remove('hidden');
        // ถ้ามี preselect → auto-click
        if (preselect === 'daily') { modal.classList.add('hidden'); _scanGo('daily', machineId, machine); return; }
        if (preselect === 'bd')    { modal.classList.add('hidden'); _scanGo('bd',    machineId, machine); return; }
    } else {
        // fallback ถ้ายังไม่ได้เพิ่ม modal ใน HTML
        const choice = prompt(`เครื่อง: ${machineName}\n\nเลือก:\n1 = Checklist รายวัน\n2 = แจ้ง Breakdown\n3 = แจ้งซ่อม (Adjustment)`, '1');
        if (!choice) return;
        const map = { '1':'daily', '2':'bd', '3':'adj' };
        _scanGo(map[choice.trim()] || 'daily', machineId, machine);
    }
}

function closeScanModal() {
    document.getElementById('scan-choice-modal')?.classList.add('hidden');
}

function scanChoose(type) {
    closeScanModal();
    const machine = (typeof machineMaster !== 'undefined' ? machineMaster : [])
        .find(m => (m.id || m.machineId || m.machine_id || '') === _scanMachineId) || {};
    _scanGo(type, _scanMachineId, machine);
}

function _scanGo(type, machineId, machine) {
    const factory     = machine.factory || '';
    const area        = machine.area    || '';
    const machineName = machine.name || machine.machineName || machineId || '';
    const byName      = currentUser.name || '';

    if (type === 'daily') {
        if (typeof switchTab === 'function') switchTab('cl-form');
        setTimeout(() => {
            const fDate = document.getElementById('clf-date');
            const fFac  = document.getElementById('clf-fac');      // แก้บั๊ก: เดิมอ้าง clf-factory
            const fArea = document.getElementById('clf-area');
            const fMach = document.getElementById('clf-machine');
            const fInsp = document.getElementById('clf-inspector');
            if (fDate) fDate.value = new Date().toISOString().slice(0,10);
            if (fFac  && factory)   { fFac.value  = factory;  fFac.dispatchEvent(new Event('change')); }
            if (fInsp && byName)      fInsp.value = byName;
            setTimeout(() => { if (fArea && area) { fArea.value = area; fArea.dispatchEvent(new Event('change')); } }, 350);
            setTimeout(() => {
                if (fMach && machineId) { fMach.value = machineId; fMach.dispatchEvent(new Event('change')); }
                ['clf-date','clf-fac','clf-area','clf-machine','clf-inspector'].forEach(id => {
                    const el = document.getElementById(id); if (el) el.disabled = true;
                });
            }, 750);
        }, 200);

    } else if (type === 'bd' || type === 'adj') {
        const eventType = type === 'adj' ? 'Adjustment' : 'Breakdown';
        if (typeof openReportPopup === 'function') openReportPopup();
        setTimeout(() => {
            const facDigit = String(factory).match(/\d/)?.[0] || '';   // "โรงงาน 1" → "1"
            const fFac  = document.getElementById('rm-factory');
            const fArea = document.getElementById('rm-area');
            const fMach = document.getElementById('rm-machine');
            const fDate = document.getElementById('rm-date');
            const fMid  = document.getElementById('rm-machine-id');
            if (fFac && facDigit) { fFac.value = facDigit; fFac.dispatchEvent(new Event('change')); }
            if (fMach) fMach.value = machineName;
            if (fDate) fDate.value = new Date().toISOString().slice(0,10);
            if (fMid && machineId) { fMid.value = machineId; document.getElementById('rm-machineid-wrap')?.classList.remove('hidden'); }
            setTimeout(() => { if (fArea && area) fArea.value = area; lockScanFields(); }, 350);
            if (typeof _applyReportEventType === 'function') _applyReportEventType(eventType);
            const notice = document.getElementById('rm-qr-notice');
            const ntext  = document.getElementById('rm-qr-notice-text');
            if (notice) notice.classList.remove('hidden');
            if (ntext)  ntext.textContent = `สแกน QR — ${machineName} · เหตุการณ์: ${eventType==='Adjustment'?'แจ้งซ่อม (Adjustment)':'Breakdown'}`;
        }, 250);
    }
}

function lockScanFields() {
    ['rm-machine','rm-factory','rm-area','rm-date','rm-machine-id'].forEach(id => {
        const el = document.getElementById(id); if (el) el.disabled = true;
    });
}

// ---- QR Picker modal ----
function openQrPicker() {
    const list = typeof machineMaster !== 'undefined' ? machineMaster : [];
    const box  = document.getElementById('qr-pick-list');
    if (!list.length) { showToast('⚠️ ยังไม่มีข้อมูลเครื่องจักร', 'warn'); return; }
    const esc = s => String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    box.innerHTML = list.map(m => {
        const id = m.id || m.machineId || m.machine_id || '';
        if (!id) return '';
        return `<label class="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-50 cursor-pointer text-sm">
            <input type="checkbox" class="qr-pick-cb w-4 h-4" value="${esc(id)}" onchange="qrPickerCount()">
            <span class="font-bold text-gray-800">${esc(m.name||id)}</span>
            <span class="text-gray-400 text-xs">${esc(id)}</span>
            <span class="ml-auto text-gray-400 text-xs">${esc(m.factory||'')} ${esc(m.area||'')}</span>
        </label>`;
    }).join('');
    document.getElementById('qr-pick-all').checked = false;
    qrPickerCount();
    document.getElementById('qr-picker-modal').classList.remove('hidden');
}
function closeQrPicker() { document.getElementById('qr-picker-modal').classList.add('hidden'); }
function qrPickerToggleAll(cb) {
    document.querySelectorAll('.qr-pick-cb').forEach(x => { x.checked = cb.checked; });
    qrPickerCount();
}
function qrPickerCount() {
    const n = document.querySelectorAll('.qr-pick-cb:checked').length;
    document.getElementById('qr-pick-count').textContent = `เลือก ${n} เครื่อง`;
}
function qrPickerGenerate() {
    const ids = [...document.querySelectorAll('.qr-pick-cb:checked')].map(x => x.value);
    if (!ids.length) { showToast('⚠️ เลือกเครื่องอย่างน้อย 1 เครื่อง', 'warn'); return; }
    const size = parseFloat(document.getElementById('qr-pick-size').value) || 40;
    closeQrPicker();
    generateMachineQrPdf(ids, size);
}

// ---- QR generate (ย้ายจาก checklist-status → machines) ----
function qrDataUrl(text, pxSize) {
    const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    const count = qr.getModuleCount();
    const cell  = Math.max(2, Math.floor(pxSize / count));
    const dim   = cell * count;
    const cv = document.createElement('canvas'); cv.width = cv.height = dim;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0,0,dim,dim); ctx.fillStyle = '#000';
    for (let r=0;r<count;r++) for (let c=0;c<count;c++) if (qr.isDark(r,c)) ctx.fillRect(c*cell,r*cell,cell,cell);
    return cv.toDataURL('image/png');
}

function generateMachineQrPdf(ids, sizeMm) {
    if (!ids || !ids.length) { showToast('เลือกเครื่องอย่างน้อย 1 เครื่อง', 'warn'); return; }
    sizeMm = Math.min(100, Math.max(15, parseFloat(sizeMm) || 40));
    const base = location.origin + location.pathname;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ unit:'mm', format:'a4', orientation:'portrait' });
    const PAGE_W=210, PAGE_H=297, MARGIN=10, LABEL_H=11, GAP=6;
    const cellW = sizeMm + GAP;
    const cellH = sizeMm + LABEL_H + GAP;
    const cols  = Math.max(1, Math.floor((PAGE_W - 2*MARGIN + GAP) / cellW));
    const rows  = Math.max(1, Math.floor((PAGE_H - 2*MARGIN + GAP) / cellH));
    const perPage = cols * rows;
    const machines = typeof machineMaster !== 'undefined' ? machineMaster : [];
    ids.forEach((id, i) => {
        if (i > 0 && i % perPage === 0) pdf.addPage();
        const idx = i % perPage; const r = Math.floor(idx/cols), c = idx % cols;
        const x = MARGIN + c*cellW, y = MARGIN + r*cellH;
        const m    = machines.find(z => (z.id||z.machineId||z.machine_id||'')===id) || {};
        const name = m.name || m.machineName || id;
        const url  = `${base}?mode=scan&m=${encodeURIComponent(id)}`;
        pdf.addImage(qrDataUrl(url, Math.round(sizeMm*8)), 'PNG', x, y, sizeMm, sizeMm);
        pdf.setFontSize(8); pdf.setTextColor(0);
        pdf.text(String(id), x + sizeMm/2, y + sizeMm + 4, { align:'center', maxWidth: cellW });
        pdf.setFontSize(6); pdf.setTextColor(80);
        pdf.text(String(name).slice(0,32), x + sizeMm/2, y + sizeMm + 8, { align:'center', maxWidth: cellW });
        pdf.setFontSize(5); pdf.setTextColor(150);
        pdf.text('Scan → เลือก Checklist / Breakdown / แจ้งซ่อม', x + sizeMm/2, y + sizeMm + 11.5, { align:'center' });
        pdf.setTextColor(0);
    });
    pdf.save(`QR_Machines_${ids.length}เครื่อง.pdf`);
}
