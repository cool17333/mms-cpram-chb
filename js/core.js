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
function saveSettings() {
    if (userRole !== 'admin') { showToast('⚠️ ต้องเข้าสู่ระบบเป็น Admin เพื่อแก้ไข URL', 'error'); return; }
    GAS_URL = document.getElementById('gas-url-input').value.trim();
    localStorage.setItem('gas_url', GAS_URL);
    closeSettings();
    showToast('✅ บันทึก URL เรียบร้อย', 'success');
}

// ============================================================
// ROLES / LOGIN  (User → Engineer → Admin)
//   เช็ครหัสฝั่ง GAS, เก็บ role+รหัสไว้เฉพาะ session (รีโหลด = ออกจากระบบ)
// ============================================================
let userRole  = 'user';   // 'user' | 'engineer' | 'admin'
let sessionPw = '';       // ส่งไปกับ op ที่ server ต้องตรวจ (delete)

function roleLabel(r) {
    return r === 'admin' ? 'Administrator' : r === 'engineer' ? 'Engineer' : 'User (ทั่วไป)';
}

async function doLogin() {
    const pw = (document.getElementById('login-pw')?.value || document.getElementById('more-login-pw')?.value || '').trim();
    if (!pw) return;
    if (!GAS_URL) { showToast('⚠️ ตั้งค่า Web App URL ก่อน', 'error'); return; }
    try {
        const res  = await fetch(`${GAS_URL}?action=login&pw=${encodeURIComponent(pw)}`);
        const json = await res.json();
        if (!json.success) {
            const msg = /unknown action/i.test(json.error || '')
                ? '⚠️ GAS ยังไม่ได้อัปเดต — กรุณา redeploy เวอร์ชันใหม่'
                : '❌ รหัสผ่านไม่ถูกต้อง';
            showToast(msg, 'error'); return;
        }
        userRole = json.role; sessionPw = pw;
        document.getElementById('login-pw').value = '';
        if (document.getElementById('more-login-pw')) document.getElementById('more-login-pw').value = '';
        closeMoreSheet();
        applyRole();
        showToast(`✅ เข้าสู่ระบบเป็น ${roleLabel(userRole)}`, 'success');
    } catch (err) {
        showToast('❌ เข้าสู่ระบบไม่สำเร็จ: ' + err.message, 'error');
    }
}

function doLogout() {
    userRole = 'user'; sessionPw = '';
    applyRole();
    showToast('ออกจากระบบแล้ว', 'info');
}

// ปรับ UI ตามบทบาท: Manual Create (eng/admin) + ปุ่มแก้ไข/ลบในรายการ
function applyRole() {
    const isAdmin = userRole === 'admin';
    document.getElementById('role-display').textContent = roleLabel(userRole);
    document.getElementById('login-row').classList.toggle('hidden', userRole !== 'user');
    document.getElementById('logout-btn').classList.toggle('hidden', userRole === 'user');
    // Manual Report + QR BD card ใน bd-hub (เฉพาะ engineer/admin)
    document.getElementById('bdhub-card-manual')?.classList.toggle('hidden', userRole === 'user');
    document.getElementById('bdhub-card-qr')?.classList.toggle('hidden', userRole === 'user');
    // แก้ URL ได้เฉพาะ Admin
    const urlInput = document.getElementById('gas-url-input');
    if (urlInput) urlInput.disabled = !isAdmin;
    document.getElementById('btn-save-url')?.classList.toggle('hidden', !isAdmin);
    document.getElementById('url-lock-hint')?.classList.toggle('hidden', isAdmin);
    // Log card — Admin only
    document.getElementById('hub-card-log')?.classList.toggle('hidden', !isAdmin);
    if (_lastRecords.length) applyRecordFilter();   // re-render ปุ่มตาม role
    updateNavRole();
}

