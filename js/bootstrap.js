// ============================================================
// INIT
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    // ป้ายเวอร์ชันมุมล่างขวาของหน้า (ไม่ติดไปกับ export)
    const verTag = document.createElement('div');
    verTag.className = 'no-export';
    verTag.textContent = EXPORT_VER;
    verTag.style.cssText = 'position:fixed;bottom:4px;right:8px;font-size:11px;color:#9ca3af;z-index:50;pointer-events:none';
    document.body.appendChild(verTag);

    initAutoResize();
    initPDFCards();
    addDeviceRow();
    addPartRow();
    resetWhyTree();
    setFormStage('report');  // ฟอร์มเริ่มต้น = แจ้งใหม่ (ย่อ)
    initVisitorPerms();      // เริ่มเป็น Visitor — permissions.js จัดการ UI

    // เปิดแอปมาที่หน้าเลือกเมนู (Hub) หรือ scan flow ถ้ามี URL param
    const _qp = new URLSearchParams(location.search);
    const _scanMode = _qp.get('mode');
    const _scanId   = _qp.get('m');
    // mode=scan → scan choice popup (new QR scheme)
    // mode=daily / mode=bd-report → backward compat → ส่งเข้า scan flow
    const _isScan = _scanId && (_scanMode === 'scan' || _scanMode === 'daily' || _scanMode === 'bd-report');
    if (!_isScan) {
        switchTab('home');
        initHubDatetime();
    }
    loadMachines().then(() => {
        initHubStats();
        refreshDashboard(); // fire-and-forget — ไม่ block loadHomeDash
        loadHomeDash();     // ยิงพร้อมกัน ไม่รอ getAll
        if (_isScan) {
            const _preselect = _scanMode === 'bd-report' ? 'bd' : _scanMode === 'daily' ? 'daily' : '';
            enterScan(_scanId, _preselect);
        }
    });

    // Year options (current ± 2)
    const cy = new Date().getFullYear();
    const ys = document.getElementById('sum-year');
    for (let y = cy + 1; y >= cy - 2; y--) {
        const o = document.createElement('option');
        o.value = o.textContent = y;
        if (y === cy) o.selected = true;
        ys.appendChild(o);
    }
});

