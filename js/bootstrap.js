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
        loadSpareCache();   // โหลด hint ทะเบียนอะไหล่ (breakdown-form.js)
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

    // ---- Enter = ยืนยัน / ESC = ปิด บน modal ยืนยัน ----
    const MODAL_KEYS = [
        { id:'login-modal',            confirm:()=>doLogin(),              close:()=>closeLogin() },
        { id:'register-modal',         confirm:()=>submitRegister(),       close:()=>closeRegister() },
        { id:'forgot-pw-modal',        confirm:()=>submitForgotPw(),       close:()=>closeForgotPw() },
        { id:'force-change-pin-modal', confirm:()=>submitForceChangePin(), close:()=>cancelForceChangePin() },
        { id:'reset-pin-modal',        confirm:()=>submitResetPin(),       close:()=>closeResetPinModal() },
        { id:'add-user-modal',         confirm:()=>submitAddUser(),        close:()=>closeAddUserModal() },
        { id:'approve-modal',          confirm:()=>uaConfirmApprove(),     close:()=>closeApproveModal() },
        { id:'settings-modal',         confirm:()=>saveSettings(),         close:()=>closeSettings() },
        { id:'accept-modal',           confirm:()=>confirmAccept(),        close:()=>closeAcceptModal() },
        { id:'cancel-modal',           confirm:()=>confirmCancel(),        close:()=>closeCancelModal(), enter:false }, // มี textarea เหตุผล → Enter = ขึ้นบรรทัด
        { id:'success-modal',          confirm:()=>closeSuccessModal(),    close:()=>closeSuccessModal() },
    ];
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== 'Escape') return;
        let target = null;   // topmost open (visible ตัวสุดท้ายใน registry)
        for (const m of MODAL_KEYS) {
            const el = document.getElementById(m.id);
            if (el && !el.classList.contains('hidden')) target = m;
        }
        if (!target) return;
        if (e.key === 'Escape') {
            if (target.esc === false) return;
            e.preventDefault(); target.close();
        } else {   // Enter
            if (target.enter === false) return;
            if (e.target && e.target.tagName === 'TEXTAREA') return;   // Enter ใน textarea = ขึ้นบรรทัด
            e.preventDefault(); target.confirm();
        }
    });
});

