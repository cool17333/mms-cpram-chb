// ============================================================
// SETTINGS — Google Apps Script
// ============================================================
const DEFAULT_GAS_URL = 'https://script.google.com/macros/s/AKfycbyEwH14qponRSrzTaBjF_ixNyL_qti7EXA6WCLYp8k5KzIs1VjQMlxFY_8Zdx8eFCRmkA/exec';
// URL เก่าที่เลิกใช้ — ถ้าเครื่องไหนเคยบันทึกไว้ จะล้างทิ้งอัตโนมัติให้ใช้ default ใหม่
const OLD_GAS_URLS = [
    'https://script.google.com/macros/s/AKfycbwI_GPtgmDwEN55_LCQxeScZd1whjDo-mHW2WTQGfs-estHqCCPGzEIY1zV-7kcyGv3QA/exec',
    'https://script.google.com/macros/s/AKfycbwgIYTDjLQbz4vDwKETE8Ve4iO68Q4_4RpRgj7m8vAcwHzrZX5f5CqjMm5DImrsr-Uf/exec',
    'https://script.google.com/macros/s/AKfycbxrGn-BZiRJd13FMivyx1X74naNTNgziQ5AGxIeZnTlC2c0zkJKDZRiqhAir4z7nNBj/exec',
    'https://script.google.com/macros/s/AKfycbwT8usxUrtvB2qJ9GHxn9nROeF-VEtVY_NFMnjhE1Z_8SdVabfd4UqoNys96YCYA28l/exec',
    'https://script.google.com/macros/s/AKfycby7U16rMXa3Dp64vYTFREvk2Nue_iy297easac9DZmhda6aGiouTCV-PWfgc3uJB0lL/exec',
    'https://script.google.com/macros/s/AKfycbxVoQtqPXKZyfnFDHbX9pitVa6qU2hxTworUIeZiV7IOlhMeLsfWXgTNxohyfO5eQFO/exec',
    'https://script.google.com/macros/s/AKfycbzvi02nKQ6tHgnVPIHUAyNeEuptq_12YqJes_XAqzpNxOzPT5Mm35EBnp5kLzDjtnRjuA/exec',
    'https://script.google.com/macros/s/AKfycby_z4DpDsOp6XaB9Olhwks5AbpF42-07ytH8eFahDEKm_nAxVAGGw5JcmMwjs-BOIEw/exec',
];
(function migrateGasUrl() {
    const saved = localStorage.getItem('gas_url');
    if (saved && OLD_GAS_URLS.includes(saved)) localStorage.removeItem('gas_url');
})();
let GAS_URL = localStorage.getItem('gas_url') || DEFAULT_GAS_URL;

// คืนค่า URL เริ่มต้น (ทางหนีจากการล็อก — ไม่ต้องเป็น Admin)
function resetGasUrl() {
    localStorage.removeItem('gas_url');
    GAS_URL = DEFAULT_GAS_URL;
    const inp = document.getElementById('gas-url-input');
    if (inp) inp.value = GAS_URL;
    showToast('↺ คืนค่า URL เริ่มต้นแล้ว', 'success');
}

function openSettings() {
    document.getElementById('gas-url-input').value = GAS_URL;
    document.getElementById('settings-modal').classList.remove('hidden');
}
function closeSettings() {
    document.getElementById('settings-modal').classList.add('hidden');
}

function openLogin() {
    document.getElementById('login-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('lm-user')?.focus(), 80);
}
function closeLogin() {
    document.getElementById('login-modal').classList.add('hidden');
    const u = document.getElementById('lm-user'); if (u) u.value = '';
    const p = document.getElementById('lm-pin');  if (p) p.value = '';
}

// ---- Register (ขอใช้งาน — สาธารณะ) ----
function openRegister() {
    closeLogin();
    ['rg-fname','rg-lname','rg-user','rg-pin'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const lv = document.getElementById('rg-level'); if (lv) lv.value = 'Visitor';
    document.getElementById('register-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('rg-fname')?.focus(), 80);
}
function closeRegister() { document.getElementById('register-modal').classList.add('hidden'); }

async function submitRegister() {
    const fname = (document.getElementById('rg-fname')?.value || '').trim();
    const lname = (document.getElementById('rg-lname')?.value || '').trim();
    const uname = (document.getElementById('rg-user')?.value  || '').trim();
    const pin   = (document.getElementById('rg-pin')?.value   || '').trim();
    const level = document.getElementById('rg-level')?.value  || 'Visitor';
    if (!fname || !lname || !uname || !pin) { showToast('⚠️ กรอกข้อมูลให้ครบ', 'error'); return; }
    if (!/^[A-Za-z0-9_.]+$/.test(uname)) { showToast('⚠️ Username ใช้ a-z 0-9 _ . (ห้ามเว้นวรรค)', 'error'); return; }
    if (pin.length < 8 || pin.length > 12) { showToast('⚠️ Password ต้อง 8–12 ตัว', 'error'); return; }
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า Web App URL ก่อน', 'error'); return; }
    showLoading('กำลังส่งคำขอ…');
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'registerUser',
            newUser: { name: `${fname} ${lname}`.trim(), username: uname, pin, level }
        })});
        const json = await res.json();
        if (!json.success) { showToast(/unknown action/i.test(json.error||'') ? '⚠️ GAS ยังไม่ได้ redeploy' : '❌ ' + (json.error||'ส่งคำขอไม่สำเร็จ'), 'error'); return; }
        closeRegister();
        showToast('✅ ส่งคำขอแล้ว — รออนุมัติจากผู้ดูแลระบบ', 'success');
    } catch (e) {
        showToast('❌ ส่งคำขอไม่สำเร็จ: ' + e.message, 'error');
    } finally { hideLoading(); }
}

function saveSettings() {
    if (!can('ua.perm')) { showToast('⚠️ ต้องมีสิทธิ์ Administrator เพื่อแก้ไข URL', 'error'); return; }
    GAS_URL = document.getElementById('gas-url-input').value.trim();
    localStorage.setItem('gas_url', GAS_URL);
    closeSettings();
    showToast('✅ บันทึก URL เรียบร้อย', 'success');
}

// ============================================================
// ROLES / LOGIN — v2.6 ใช้ permissions.js (currentUser, can, applyPermissions)
// ============================================================
// backwards compat shims — ไฟล์อื่นที่ยังอ่าน userRole/sessionPw
Object.defineProperty(window, 'userRole',  { get: () => currentUser.level, set: () => {} });
Object.defineProperty(window, 'sessionPw', { get: () => currentUser.pin,   set: () => {} });

async function doLogin() {
    const username = (document.getElementById('lm-user')?.value || '').trim();
    const pin      = (document.getElementById('lm-pin')?.value  || '').trim();
    if (!username || !pin) { showToast('⚠️ กรอก Username และ PIN', 'error'); return; }
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า Web App URL ก่อน', 'error'); return; }
    showLoading('กำลังเข้าสู่ระบบ…');
    try {
        const res  = await fetch(`${GAS_URL}?action=login&user=${encodeURIComponent(username)}&pin=${encodeURIComponent(pin)}`);
        const json = await res.json();
        if (!json.success) {
            showToast(/unknown action/i.test(json.error||'') ? '⚠️ GAS ยังไม่ได้ redeploy' : `❌ ${json.error||'เข้าสู่ระบบไม่สำเร็จ'}`, 'error');
            return;
        }
        currentUser = { username, name: json.name, level: json.level, perms: new Set(json.perms||[]), pin };
        closeLogin();
        if (typeof closeMoreSheet === 'function') closeMoreSheet();
        applyPermissions();
        showToast(`✅ เข้าสู่ระบบเป็น ${json.name} (${json.level})`, 'success');
        if (typeof window._afterLoginCallback === 'function') {
            const cb = window._afterLoginCallback;
            window._afterLoginCallback = null;
            cb();
        }
    } catch (err) {
        showToast('❌ เข้าสู่ระบบไม่สำเร็จ: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

function doLogout() {
    initVisitorPerms();
    showToast('ออกจากระบบแล้ว', 'info');
}

function applyRole() { applyPermissions(); }   // backwards compat — เรียกจาก bootstrap.js

