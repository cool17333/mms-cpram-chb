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
        // Checklist รายวัน — autofill
        if (typeof switchTab === 'function') switchTab('cl-form');
        setTimeout(() => {
            const fFac  = document.getElementById('clf-factory');
            const fArea = document.getElementById('clf-area');
            const fMach = document.getElementById('clf-machine');
            const fInsp = document.getElementById('clf-inspector');
            if (fFac  && factory)     { fFac.value  = factory;  fFac.dispatchEvent(new Event('change')); }
            if (fArea && area)        { setTimeout(() => { if (fArea) { fArea.value = area; fArea.dispatchEvent(new Event('change')); } }, 300); }
            if (fMach && machineId)   { setTimeout(() => { if (fMach) { fMach.value = machineId; fMach.dispatchEvent(new Event('change')); } }, 600); }
            if (fInsp && byName)       fInsp.value = byName;
        }, 200);

    } else if (type === 'bd' || type === 'adj') {
        const eventType = type === 'adj' ? 'Adjustment' : 'Breakdown';
        // เปิด Report form
        if (typeof openReportPopup === 'function') openReportPopup();
        setTimeout(() => {
            // autofill machine fields
            const fFac  = document.getElementById('rm-factory');
            const fArea = document.getElementById('rm-area');
            const fMach = document.getElementById('rm-machine');
            if (fFac  && factory)   { fFac.value  = factory;  fFac.dispatchEvent(new Event('change')); }
            if (fArea && area)      { setTimeout(() => { if (fArea) { fArea.value = area; fArea.dispatchEvent(new Event('change')); } }, 300); }
            if (fMach && machineId) { setTimeout(() => { if (fMach) { fMach.value = machineId; fMach.dispatchEvent(new Event('change')); } }, 600); }
            // ตั้ง eventType และ bdType field ตามตัวเลือก (แก้ย้อนหลังได้)
            setTimeout(() => {
                const eSel = document.getElementById('inp-event-type');
                if (eSel) eSel.value = eventType;
            }, 800);
        }, 200);
    }
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
