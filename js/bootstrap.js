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
    applyRole();             // เริ่มเป็น User → ซ่อน Manual Create/แก้ไข/ลบ

    // เปิดแอปมาที่หน้าเลือกเมนู (Hub) หรือ QR Kiosk ถ้ามี URL param
    const _qp = new URLSearchParams(location.search);
    if (_qp.get('mode') === 'daily' && _qp.get('m')) {
        enterDailyKiosk(_qp.get('m'), _qp.get('t') || '');
    } else {
        switchTab('home');
        initHubDatetime();
    }
    loadMachines().then(() => {
        initHubStats();
        refreshDashboard(); // fire-and-forget — ไม่ block loadHomeDash
        loadHomeDash();     // ยิงพร้อมกัน ไม่รอ getAll
        if (_qp.get('mode') === 'bd-report' && _qp.get('m')) {
            enterBdKiosk(_qp.get('m'), _qp.get('t') || '');
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

