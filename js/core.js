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

// GAS GET + retry — แก้ "Failed to fetch" transient (redirect googleusercontent / concurrency)
// retry เฉพาะ network error (TypeError). ห้ามใช้กับ POST ที่ mutate (double-apply)
async function gasGetJson(action, params, tries) {
    tries = tries || 3;
    const url = new URL(GAS_URL);
    url.searchParams.set('action', action);
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    let lastErr;
    for (let i = 0; i < tries; i++) {
        try {
            const res = await fetch(url.toString());
            return await res.json();
        } catch (e) {
            lastErr = e;   // Failed to fetch → รอแล้วลองใหม่ (backoff + jitter)
            if (i < tries - 1) await new Promise(r => setTimeout(r, 500 * (i + 1) + Math.random() * 300));
        }
    }
    throw lastErr;   // ครบ tries แล้วยังพัง → โยนให้ caller แสดง toast เดิม
}

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

// ---- Forgot Password (ลืมรหัสผ่าน — สาธารณะ) ----
function openForgotPw() {
    closeLogin();
    ['fp-fname','fp-lname','fp-user'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('forgot-pw-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('fp-fname')?.focus(), 80);
}
function closeForgotPw() { document.getElementById('forgot-pw-modal').classList.add('hidden'); }
function closeForgotPwResult() { document.getElementById('forgot-pw-result-modal').classList.add('hidden'); }
function copyTempPin() {
    const pin = document.getElementById('fp-temp-pin')?.textContent || '';
    if (navigator.clipboard) navigator.clipboard.writeText(pin).then(() => showToast('📋 คัดลอกแล้ว', 'success'));
    else showToast('📋 ' + pin, 'info');
}
async function submitForgotPw() {
    const fname = (document.getElementById('fp-fname')?.value || '').trim();
    const lname = (document.getElementById('fp-lname')?.value || '').trim();
    const uname = (document.getElementById('fp-user')?.value  || '').trim();
    if (!fname || !lname || !uname) { showToast('⚠️ กรอกข้อมูลให้ครบ', 'error'); return; }
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า Web App URL ก่อน', 'error'); return; }
    showLoading('กำลังดำเนินการ…');
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'forgotPassword', username: uname, fname, lname
        })});
        const json = await res.json();
        console.log('[forgotPw] GAS response:', JSON.stringify(json));
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        const pin = json.tempPin != null ? String(json.tempPin) : '';
        if (!pin) { showToast('❌ GAS ไม่ส่ง PIN กลับมา — ดู console (F12) แล้วแจ้ง Admin', 'error'); return; }
        closeForgotPw();
        const pinEl = document.getElementById('fp-temp-pin');
        if (pinEl) pinEl.textContent = pin;
        console.log('[forgotPw] pinEl.textContent after set:', pinEl ? pinEl.textContent : 'element not found');
        document.getElementById('forgot-pw-result-modal').classList.remove('hidden');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
    finally { hideLoading(); }
}

// ---- Register (ขอใช้งาน — สาธารณะ) ----
function openRegister() {
    closeLogin();
    ['rg-fname','rg-lname','rg-user','rg-pin'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const lv = document.getElementById('rg-level'); if (lv) lv.value = 'User';
    document.getElementById('register-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('rg-fname')?.focus(), 80);
}
function closeRegister() { document.getElementById('register-modal').classList.add('hidden'); }

async function submitRegister() {
    const fname = (document.getElementById('rg-fname')?.value || '').trim();
    const lname = (document.getElementById('rg-lname')?.value || '').trim();
    const uname = (document.getElementById('rg-user')?.value  || '').trim();
    const pin   = (document.getElementById('rg-pin')?.value   || '').trim();
    const level = document.getElementById('rg-level')?.value  || 'User';
    if (!fname || !lname || !uname || !pin) { showToast('⚠️ กรอกข้อมูลให้ครบ', 'error'); return; }
    if (!/^[A-Za-z0-9_.]+$/.test(uname)) { showToast('⚠️ Username ใช้ a-z 0-9 _ . (ห้ามเว้นวรรค)', 'error'); return; }
    if (pin.length < 8) { showToast('⚠️ Password ต้องอย่างน้อย 8 ตัว', 'error'); return; }
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

// ---- Force change PIN (บังคับเปลี่ยนหลัง login ด้วย temp PIN / admin reset) ----
let _pendingLogin = null;

function finalizeLogin(u) {
    currentUser = u;
    closeLogin();
    if (typeof closeMoreSheet === 'function') closeMoreSheet();
    applyPermissions();
    if (typeof refreshPendingBadge === 'function') refreshPendingBadge();   // โชว์ badge คำขอบน nav ทันที (guard can('ua.add') ในตัว)
    showToast(`✅ เข้าสู่ระบบเป็น ${u.name} (${u.level})`, 'success');
    if (typeof window._afterLoginCallback === 'function') {
        const cb = window._afterLoginCallback;
        window._afterLoginCallback = null;
        cb();
    }
}

function openForceChangePin() {
    ['fc-new','fc-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    document.getElementById('force-change-pin-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('fc-new')?.focus(), 80);
}

function cancelForceChangePin() {
    _pendingLogin = null;
    document.getElementById('force-change-pin-modal').classList.add('hidden');
    showToast('ยกเลิกการเข้าสู่ระบบ — ต้องเปลี่ยนรหัสผ่านก่อนใช้งาน', 'info');
}

async function submitForceChangePin() {
    if (!_pendingLogin) return;
    const newPin  = (document.getElementById('fc-new')?.value     || '').trim();
    const confirm = (document.getElementById('fc-confirm')?.value || '').trim();
    if (newPin.length < 8) { showToast('⚠️ รหัสผ่านใหม่ต้องอย่างน้อย 8 ตัว', 'error'); return; }
    if (newPin !== confirm)  { showToast('⚠️ รหัสผ่านยืนยันไม่ตรงกัน', 'error'); return; }
    if (newPin === _pendingLogin.pin) { showToast('⚠️ ต้องตั้งรหัสใหม่ที่ต่างจากรหัสชั่วคราว', 'error'); return; }
    showLoading('กำลังเปลี่ยนรหัสผ่าน…');
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'changeOwnPin', username: _pendingLogin.username,
            currentPin: _pendingLogin.pin, newPin
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        document.getElementById('force-change-pin-modal').classList.add('hidden');
        const u = Object.assign({}, _pendingLogin, { pin: newPin });
        _pendingLogin = null;
        finalizeLogin(u);
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
    finally { hideLoading(); }
}

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
        const u = { username, name: json.name, level: json.level, perms: new Set(json.perms||[]), pin };
        if (json.mustChangePin) {
            _pendingLogin = u;
            closeLogin();
            openForceChangePin();
            return;
        }
        finalizeLogin(u);
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

