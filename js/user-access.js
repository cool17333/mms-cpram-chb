// ============================================================
// USER ACCESS MANAGEMENT — panel-ua
// ============================================================
const PERM_LABEL = {
    'bd.view':'ดูรายการ Breakdown (View)','bd.export':'ส่งออก Breakdown (Export)',
    'bd.report':'แจ้ง Breakdown (Report)','bd.accept':'รับงาน (Accept)',
    'bd.editdoc':'แก้ไขเอกสาร BD (Edit)','bd.close':'ปิดงาน (Close)',
    'bd.whywhy':'วิเคราะห์ Why-Why','bd.manual':'สร้างย้อนหลัง (Manual)','bd.cancel':'ยกเลิกงาน (Cancel)',
    'mc.view':'ดูทะเบียนเครื่องจักร (View)','mc.edit':'แก้ไขเครื่องจักร (Edit)',
    'mc.delete':'ลบเครื่องจักร (Delete)','mc.add':'เพิ่มเครื่องจักร (Add)',
    'mc.import':'นำเข้า Excel (Import)','mc.backup':'สำรองข้อมูล (Backup)','mc.restore':'กู้คืนข้อมูล (Restore)',
    'cl.view':'ดู Checklist (View)','cl.history':'ประวัติ Checklist (History)',
    'cl.status':'สถานะการตรวจ (Status)','cl.export':'ส่งออก Checklist (Export)',
    'cl.daily':'ตรวจรายวัน (Daily)','cl.pm':'ตรวจ PM (PM)','cl.edit':'แก้ไขรายการตรวจ (Edit)','cl.calendar':'ปฏิทิน PM (Calendar)',
    'ua.add':'เพิ่มผู้ใช้ (Add user)','ua.del':'ลบผู้ใช้ (Delete user)','ua.level':'เปลี่ยน Level (Set level)',
    'ua.perm':'แก้สิทธิ์ (Edit perm)','ua.log':'ดู Log ระบบ (View log)',
};

let _uaUsers   = [];
let _uaPending = null;   // { userId, action } สำหรับ reset-pin modal

// ---- Sub-tab switch ----
function uaSwitch(pane) {
    ['users','pending','perms','log'].forEach(p => {
        document.getElementById('ua-pane-' + p)?.classList.toggle('hidden', p !== pane);
        document.querySelector(`.ua-subtab[data-ua="${p}"]`)?.classList.toggle('active', p === pane);
    });
    if (pane === 'users')   loadUaUsers();
    if (pane === 'pending') loadUaPending();
    if (pane === 'perms')   renderPermMatrix();
    if (pane === 'log')     loadUaLog();
}

// ---- Load users ----
async function loadUaUsers() {
    if (!GAS_URL) { document.getElementById('ua-user-tbody').innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">⚠️ ยังไม่ได้ตั้งค่า GAS URL</td></tr>'; return; }
    if (typeof showLoading === 'function') showLoading('กำลังโหลดผู้ใช้…');
    try {
        const res  = await fetch(`${GAS_URL}?action=getUsers`);
        const json = await res.json();
        _uaUsers = json.data || [];
        renderUaUsers();
        refreshPendingBadge();
    } catch (e) {
        document.getElementById('ua-user-tbody').innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-red-400">❌ โหลดไม่สำเร็จ: ' + e.message + '</td></tr>';
    } finally {
        if (typeof hideLoading === 'function') hideLoading();
    }
}

function renderUaUsers() {
    const tbody  = document.getElementById('ua-user-tbody');
    const canDel = can('ua.del');
    const canLvl = can('ua.level');
    const fName = (document.getElementById('ua-filter-name')?.value || '').trim().toLowerCase();
    const fLvl  = document.getElementById('ua-filter-level')?.value || '';
    const list  = _uaUsers.filter(u =>
        (!fName || (u.name||'').toLowerCase().includes(fName) || (u.username||'').toLowerCase().includes(fName)) &&
        (!fLvl  || u.level === fLvl));
    if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="px-4 py-10 text-center text-gray-400">' + (_uaUsers.length ? 'ไม่พบผู้ใช้ตามเงื่อนไข' : 'ไม่พบข้อมูลผู้ใช้') + '</td></tr>';
        return;
    }
    tbody.innerHTML = list.map(u => {
        const active  = u.active === true || u.active === 'TRUE' || u.active === 'true';
        const lvlCls  = 'ua-level-badge ua-level-' + (u.level || 'Visitor');
        const statusBadge = active
            ? '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">ใช้งาน</span>'
            : '<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-500">ระงับ</span>';
        const deptDisplay = u.department
            ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">${u.department}</span>`
            : '<span class="text-gray-300 text-xs">—</span>';
        const safeId   = String(u.id).replace(/'/g, '');
        const safeName = String(u.name || '').replace(/'/g, '');
        const safeDept = String(u.department || '').replace(/'/g, '');
        const actions = [];
        if (canLvl) {
            actions.push(`<button onclick="uaOpenSetLevel('${safeId}','${u.level}')" class="text-xs font-bold text-blue-600 hover:text-blue-800 underline">เปลี่ยน Level</button>`);
            actions.push(`<button onclick="uaOpenSetDept('${safeId}','${safeDept}')" class="text-xs font-bold text-indigo-600 hover:text-indigo-800 underline">แผนก</button>`);
            actions.push(`<button onclick="uaOpenResetPin('${safeId}','${safeName}')" class="text-xs font-bold text-orange-600 hover:text-orange-800 underline">รีเซ็ต PIN</button>`);
            actions.push(`<button onclick="uaToggleActive('${safeId}',${!active})" class="text-xs font-bold ${active ? 'text-gray-500 hover:text-red-600' : 'text-green-600 hover:text-green-800'} underline">${active ? 'ระงับ' : 'เปิดใช้'}</button>`);
        }
        if (canDel && u.username !== 'admin') {
            actions.push(`<button onclick="uaDeleteUser('${safeId}','${safeName}')" class="text-xs font-bold text-red-600 hover:text-red-800 underline">ลบ</button>`);
        }
        return `<tr class="border-t border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-3 font-medium text-gray-800">${u.name || '—'}</td>
            <td class="px-4 py-3 font-mono text-gray-600 text-xs">${u.username || '—'}</td>
            <td class="px-4 py-3"><span class="${lvlCls}">${u.level || '—'}</span></td>
            <td class="px-4 py-3">${deptDisplay}</td>
            <td class="px-4 py-3 text-center">${statusBadge}</td>
            <td class="px-4 py-3 text-center flex gap-3 justify-center flex-wrap">${actions.join('') || '—'}</td>
        </tr>`;
    }).join('');
}

// ---- Add user modal ----
function openAddUserModal() {
    ['au-fname','au-lname','au-user','au-pin'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const deptEl = document.getElementById('au-dept'); if (deptEl) deptEl.value = '';
    document.getElementById('add-user-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('au-fname')?.focus(), 80);
}
function closeAddUserModal() { document.getElementById('add-user-modal').classList.add('hidden'); }

async function submitAddUser() {
    const fname = (document.getElementById('au-fname')?.value || '').trim();
    const lname = (document.getElementById('au-lname')?.value || '').trim();
    const uname = (document.getElementById('au-user')?.value  || '').trim();
    const pin   = (document.getElementById('au-pin')?.value   || '').trim();
    const level = document.getElementById('au-level')?.value  || 'Visitor';
    const dept  = document.getElementById('au-dept')?.value   || '';
    if (!fname || !lname || !uname || !pin) { showToast('⚠️ กรอกข้อมูลให้ครบ', 'error'); return; }
    if (pin.length < 8 || pin.length > 12) { showToast('⚠️ Password ต้อง 8–12 ตัว', 'error'); return; }
    const name = `${fname} ${lname}`.trim();
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'addUser', username: currentUser.username, pin: currentUser.pin,
            newUser: { name, username: uname, pin, level, department: dept }
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        closeAddUserModal();
        showToast('✅ เพิ่มผู้ใช้ ' + name + ' สำเร็จ', 'success');
        loadUaUsers();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ---- Pending requests (คำขอใช้งาน) ----
let _uaPendingList = [];
let _uaApproveId   = null;

async function loadUaPending() {
    const tb = document.getElementById('ua-pending-tbody');
    if (!GAS_URL) { if (tb) tb.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-gray-400">⚠️ ยังไม่ได้ตั้งค่า GAS URL</td></tr>'; return; }
    if (typeof showLoading === 'function') showLoading('กำลังโหลดคำขอ…');
    try {
        const res  = await fetch(`${GAS_URL}?action=getPendingUsers`);
        const json = await res.json();
        _uaPendingList = json.data || [];
        renderUaPending();
        updatePendingBadge();
    } catch (e) {
        if (tb) tb.innerHTML = '<tr><td colspan="5" class="px-4 py-6 text-center text-red-400">❌ โหลดไม่สำเร็จ: ' + e.message + '</td></tr>';
    } finally { if (typeof hideLoading === 'function') hideLoading(); }
}

function renderUaPending() {
    const tb = document.getElementById('ua-pending-tbody');
    if (!tb) return;
    const canAdd = can('ua.add');
    if (!_uaPendingList.length) {
        tb.innerHTML = '<tr><td colspan="6" class="px-4 py-10 text-center text-gray-400">ไม่มีคำขอที่รออนุมัติ</td></tr>';
        return;
    }
    tb.innerHTML = _uaPendingList.map(p => {
        const lvlCls  = 'ua-level-badge ua-level-' + (p.level || 'Visitor');
        const uname   = String(p.username || '').replace(/'/g, '');
        const deptDisplay = p.department
            ? `<span class="inline-block px-2 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-700">${p.department}</span>`
            : '<span class="text-gray-300 text-xs">—</span>';
        const actions = canAdd
            ? `<button onclick="uaOpenApprove('${p.id}')" class="text-xs font-bold text-green-600 hover:text-green-800 underline">อนุมัติ</button>
               <button onclick="uaRejectPending('${p.id}','${uname}')" class="text-xs font-bold text-red-600 hover:text-red-800 underline">ปฏิเสธ</button>`
            : '—';
        return `<tr class="border-t border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-3 font-medium text-gray-800">${p.name || '—'}</td>
            <td class="px-4 py-3 font-mono text-gray-600 text-xs">${p.username || '—'}</td>
            <td class="px-4 py-3"><span class="${lvlCls}">${p.level || '—'}</span></td>
            <td class="px-4 py-3">${deptDisplay}</td>
            <td class="px-4 py-3 text-xs text-gray-500">${p.requestedAt || '—'}</td>
            <td class="px-4 py-3 text-center flex gap-3 justify-center flex-wrap">${actions}</td>
        </tr>`;
    }).join('');
}

function updatePendingBadge() {
    const badge = document.getElementById('ua-pending-badge');
    if (!badge) return;
    const n = _uaPendingList.length;
    badge.textContent = n;
    badge.classList.toggle('hidden', n === 0);
}

async function refreshPendingBadge() {
    if (!GAS_URL || !can('ua.add')) return;
    try {
        const res  = await fetch(`${GAS_URL}?action=getPendingUsers`);
        const json = await res.json();
        _uaPendingList = json.data || [];
        updatePendingBadge();
    } catch (e) {}
}

function uaOpenApprove(pendingId) {
    const p = _uaPendingList.find(x => String(x.id) === String(pendingId));
    if (!p) return;
    _uaApproveId = pendingId;
    document.getElementById('ap-name').textContent = p.name || '';
    document.getElementById('ap-user').textContent = p.username || '';
    document.getElementById('ap-level').value = p.level || 'Visitor';
    document.getElementById('approve-modal').classList.remove('hidden');
}
function closeApproveModal() { document.getElementById('approve-modal').classList.add('hidden'); _uaApproveId = null; }

async function uaConfirmApprove() {
    if (!_uaApproveId) return;
    const level = document.getElementById('ap-level')?.value || 'Visitor';
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'approveUser', username: currentUser.username, pin: currentUser.pin,
            pendingId: _uaApproveId, level
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        closeApproveModal();
        showToast('✅ อนุมัติแล้ว — ดึงเข้าระบบเรียบร้อย', 'success');
        loadUaPending();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

async function uaRejectPending(pendingId, uname) {
    if (!confirm(`ปฏิเสธคำขอของ "${uname}"?`)) return;
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'rejectUser', username: currentUser.username, pin: currentUser.pin, pendingId
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        showToast('ปฏิเสธคำขอแล้ว', 'info');
        loadUaPending();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ---- Set level ----
function uaOpenSetLevel(userId, currentLevel) {
    const levels = ['Visitor','Production','Technician','Engineer','Supervisor','Administrator'];
    const opts   = levels.map(l => `<option${l === currentLevel ? ' selected' : ''}>${l}</option>`).join('');
    const sel    = `<select id="ua-setlevel-sel" class="border border-gray-300 rounded-lg px-3 py-1.5 text-sm">${opts}</select>`;
    if (!confirm('เปลี่ยน Level — เลือกใหม่แล้วกด OK\n\n(กด OK เพื่อเปิด dialog ถัดไป)')) return;
    const newLevel = prompt('เลือก Level ใหม่:\n' + levels.join(' / '), currentLevel);
    if (!newLevel || !levels.includes(newLevel) || newLevel === currentLevel) return;
    uaSetLevel(userId, newLevel);
}

async function uaSetLevel(userId, level) {
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'setUserLevel', username: currentUser.username, pin: currentUser.pin, userId, level
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        showToast('✅ เปลี่ยน Level สำเร็จ', 'success');
        loadUaUsers();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ---- Reset PIN modal ----
function uaOpenResetPin(userId, name) {
    _uaPending = { userId };
    document.getElementById('reset-pin-name').textContent = name;
    document.getElementById('new-pin-val').value = '';
    document.getElementById('reset-pin-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('new-pin-val')?.focus(), 80);
}
function closeResetPinModal() { document.getElementById('reset-pin-modal').classList.add('hidden'); _uaPending = null; }

async function submitResetPin() {
    if (!_uaPending) return;
    const newPin = (document.getElementById('new-pin-val')?.value || '').trim();
    if (newPin.length < 8 || newPin.length > 12) { showToast('⚠️ Password ต้อง 8–12 ตัว', 'error'); return; }
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'resetUserPin', username: currentUser.username, pin: currentUser.pin,
            userId: _uaPending.userId, newPin
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        closeResetPinModal();
        showToast('✅ รีเซ็ต PIN สำเร็จ', 'success');
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ---- Toggle active ----
async function uaToggleActive(userId, active) {
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'toggleUserActive', username: currentUser.username, pin: currentUser.pin, userId, active
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        showToast(active ? '✅ เปิดใช้งานแล้ว' : '✅ ระงับบัญชีแล้ว', 'success');
        loadUaUsers();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ---- Delete user ----
async function uaDeleteUser(userId, name) {
    if (!confirm(`ยืนยันลบผู้ใช้ "${name}"?\nไม่สามารถกู้คืนได้`)) return;
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'deleteUser', username: currentUser.username, pin: currentUser.pin, userId
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        showToast('✅ ลบผู้ใช้ ' + name + ' แล้ว', 'success');
        loadUaUsers();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ---- Set department ----
function uaOpenSetDept(userId, currentDept) {
    const depts = ['','QA','Production','Engineer','Safety','อื่นๆ'];
    const labels = ['— ไม่ระบุ —','QA','Production','Engineer','Safety','อื่นๆ'];
    const newDept = prompt('เลือกแผนก:\n' + depts.map((d,i) => (i===0?labels[i]:d)).join(' / '), currentDept || '');
    if (newDept === null) return;
    if (depts.indexOf(newDept) < 0) { showToast('⚠️ แผนกไม่ถูกต้อง', 'error'); return; }
    uaSetDept(userId, newDept);
}

async function uaSetDept(userId, department) {
    try {
        const res  = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action:'setUserDept', username: currentUser.username, pin: currentUser.pin, userId, department
        })});
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'ไม่สำเร็จ'), 'error'); return; }
        showToast('✅ อัปเดตแผนกสำเร็จ', 'success');
        loadUaUsers();
    } catch (e) { showToast('❌ ' + e.message, 'error'); }
}

// ---- Permission matrix ----
async function renderPermMatrix() {
    const el = document.getElementById('ua-perm-matrix');
    if (!GAS_URL) { el.innerHTML = '<p class="text-gray-400 py-6">⚠️ ยังไม่ได้ตั้งค่า GAS URL</p>'; return; }
    el.innerHTML = '<p class="text-gray-400 py-6 text-center animate-pulse">⏳ กำลังโหลด...</p>';
    try {
        const res  = await fetch(`${GAS_URL}?action=getPermissions`);
        const json = await res.json();
        const matrix = json.data || {};
        const roles  = ['Visitor','Production','Technician','Engineer','Supervisor','Administrator'];
        const groups = [
            { label:'🚨 Breakdown', codes:['bd.view','bd.export','bd.report','bd.accept','bd.editdoc','bd.close','bd.whywhy','bd.manual','bd.cancel'] },
            { label:'🗂️ ทะเบียนเครื่องจักร', codes:['mc.view','mc.edit','mc.delete','mc.add','mc.import','mc.backup','mc.restore'] },
            { label:'✅ Checklist', codes:['cl.view','cl.history','cl.status','cl.export','cl.daily','cl.pm','cl.edit','cl.calendar'] },
            { label:'👥 User Access', codes:['ua.add','ua.del','ua.level','ua.perm','ua.log'] },
        ];
        const canEdit = can('ua.perm');
        const shortRole = r => r === 'Administrator' ? 'Admin' : r === 'Production' ? 'Prod' : r === 'Technician' ? 'Tech' : r === 'Supervisor' ? 'Super' : r === 'Engineer' ? 'Eng' : 'Visit';
        let html = `<table class="w-full text-xs border-collapse bg-white rounded-xl overflow-hidden shadow-sm border border-gray-200">
            <thead><tr class="bg-gray-50">
                <th class="px-3 py-2 text-left text-gray-500 font-bold uppercase tracking-wider">Permission${canEdit ? ' <span class="text-[10px] text-orange-400 font-normal normal-case">(คลิกเพื่อแก้)</span>' : ''}</th>
                ${roles.map(r => `<th class="px-2 py-2 text-center font-bold text-gray-600">${shortRole(r)}</th>`).join('')}
            </tr></thead><tbody>`;
        groups.forEach(g => {
            html += `<tr class="bg-gray-50/60"><td colspan="${roles.length+1}" class="px-3 py-1.5 font-bold text-gray-600 text-xs">${g.label}</td></tr>`;
            g.codes.forEach(code => {
                html += `<tr class="border-t border-gray-100 hover:bg-gray-50">
                    <td class="px-3 py-2 text-gray-700">${PERM_LABEL[code] || code}<div class="text-[10px] text-gray-300 font-mono">${code}</div></td>
                    ${roles.map(r => {
                        const ok = !!(matrix[r] && matrix[r][code]);
                        if (canEdit) {
                            return `<td class="px-2 py-2 text-center"><button onclick="setPermissionToggle('${r}','${code}',${ok?1:0})" class="w-7 h-7 rounded-full text-xs font-bold transition-all ${ok ? 'bg-green-500 hover:bg-green-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-400'}" title="${ok ? 'คลิกถอนสิทธิ์' : 'คลิกให้สิทธิ์'}">${ok ? '✓' : '—'}</button></td>`;
                        }
                        return `<td class="px-2 py-2 text-center">${ok ? '<span class="text-green-500 font-bold">✓</span>' : '<span class="text-gray-200">—</span>'}</td>`;
                    }).join('')}
                </tr>`;
            });
        });
        html += '</tbody></table>';
        el.innerHTML = html;
    } catch (e) { el.innerHTML = '<p class="text-red-400 py-6 text-center">❌ โหลดไม่สำเร็จ: ' + e.message + '</p>'; }
}

// ---- Permission toggle ----
async function setPermission(role, code, allow) {
    if (!GAS_URL) { showToast('⚠️ ยังไม่ได้ตั้งค่า GAS URL', 'warn'); return false; }
    try {
        const res = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'setPermission',
                username: currentUser.username,
                pin: currentUser.pin,
                role, perm_code: code, allow: allow ? 1 : 0
            })
        });
        const json = await res.json();
        if (!json.success) { showToast('❌ ' + (json.error || 'แก้สิทธิ์ไม่สำเร็จ'), 'error'); return false; }
        return true;
    } catch (e) { showToast('❌ Network error: ' + e.message, 'error'); return false; }
}

async function setPermissionToggle(role, code, currentVal) {
    const newVal = currentVal ? 0 : 1;
    const label = PERM_LABEL[code] || code;
    const verb = newVal ? 'ให้สิทธิ์' : 'ถอนสิทธิ์';
    showToast(`⏳ ${verb}: ${role} — ${label}`, 'info');
    const ok = await setPermission(role, code, newVal);
    if (ok) {
        showToast(`✅ ${verb}สำเร็จ`, 'success');
        renderPermMatrix();
    }
}

// ---- Access log ----
async function loadUaLog() {
    const el = document.getElementById('ua-log-body');
    if (!GAS_URL) { el.innerHTML = '<p class="text-gray-400 py-6">⚠️ ยังไม่ได้ตั้งค่า GAS URL</p>'; return; }
    el.innerHTML = '<p class="text-gray-400 py-4 text-center animate-pulse">⏳ กำลังโหลด...</p>';
    try {
        const res  = await fetch(`${GAS_URL}?action=getAccessLog`);
        const json = await res.json();
        const rows = json.data || [];
        if (!rows.length) { el.innerHTML = '<p class="text-gray-400 py-6 text-center">ยังไม่มีประวัติ</p>'; return; }
        el.innerHTML = rows.map(r => `
            <div class="bg-white rounded-xl border border-gray-200 px-4 py-3 text-sm">
                <div class="flex items-center justify-between gap-2">
                    <span class="font-bold text-gray-800">${r.action || '—'}</span>
                    <span class="text-xs text-gray-400">${r.time || ''}</span>
                </div>
                <div class="text-xs text-gray-500 mt-0.5">${r.detail || ''}</div>
                <div class="text-xs text-gray-400 mt-0.5">โดย: <b>${r.username || '—'}</b></div>
            </div>`).join('');
    } catch (e) { el.innerHTML = '<p class="text-red-400 py-6 text-center">❌ ' + e.message + '</p>'; }
}
