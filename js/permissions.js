// ============================================================
// PERMISSIONS ENGINE
// currentUser เก็บ session เท่านั้น — reload = ออกจากระบบ
// ============================================================
let currentUser = {
    username: '',
    name:     '',
    level:    'Visitor',
    perms:    new Set(),
    pin:      '',
};

function can(code) {
    return currentUser.perms.has(code);
}

// toggle hidden บน elements ที่มี data-perm attribute
function applyPermissions() {
    document.querySelectorAll('[data-perm]').forEach(el => {
        const code = el.getAttribute('data-perm');
        el.classList.toggle('hidden', !can(code));
    });

    // elements ที่ logic ไม่ตรงไปตรงมา — จัดการแยก
    const loggedIn = Boolean(currentUser.username);
    document.getElementById('sidebar-login-btn')?.classList.toggle('hidden', loggedIn);
    document.getElementById('sidebar-logout')?.classList.toggle('hidden', !loggedIn);
    document.getElementById('more-login-btn')?.classList.toggle('hidden', loggedIn);
    document.getElementById('more-logout-btn')?.classList.toggle('hidden', !loggedIn);

    const name = currentUser.name || (loggedIn ? currentUser.level : 'ไม่ได้เข้าสู่ระบบ');
    const el1 = document.getElementById('role-display');
    const el2 = document.getElementById('more-role-display');
    const el3 = document.getElementById('sidebar-role');
    if (el1) el1.textContent = name;
    if (el2) el2.textContent = name;
    if (el3) el3.textContent = name;

    // ua.perm: ควบคุม GAS URL input
    const urlInput = document.getElementById('gas-url-input');
    if (urlInput) urlInput.disabled = !can('ua.perm');
    document.getElementById('url-lock-hint')?.classList.toggle('hidden', can('ua.perm'));

    // sidebar admin section + more-log (ผูกกับ ua.log) — updateNavRole() อยู่ js/breakdown-report.js
    if (typeof updateNavRole === 'function') updateNavRole();

    // ถ้าหน้าที่ค้างอยู่สิทธิ์ไม่ถึง → กลับหน้าหลัก
    const _active = document.querySelector('.tab-panel.active')?.id.replace('panel-', '');
    if (_active && PANEL_PERM[_active] && !can(PANEL_PERM[_active]) && typeof switchTab === 'function') {
        switchTab('home');
    }

    // re-render records ที่ขึ้นกับ role
    if (typeof applyRecordFilter === 'function' && typeof _lastRecords !== 'undefined' && _lastRecords?.length) {
        applyRecordFilter();
    }
}

// แผนผัง panel → permission ที่ต้องมี (redirect ถ้าสิทธิ์ไม่ถึง)
const PANEL_PERM = { ua: 'ua.level', log: 'ua.log' };

// Visitor perms (hardcode — ไม่ต้องเรียก GAS)
const VISITOR_PERMS = ['bd.view','bd.export','mc.view','cl.view','cl.history','cl.status','cl.export','tpm.view'];

function initVisitorPerms() {
    currentUser = { username:'', name:'', level:'Visitor', perms: new Set(VISITOR_PERMS), pin:'' };
    applyPermissions();
}
