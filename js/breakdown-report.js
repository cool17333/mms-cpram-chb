// ============================================================
// TRACKING NUMBER (เลข Tracking Breakdown)
// ============================================================
let currentTracking = '';

// รูปแบบ BD-YYYYMMDD-HHMMSS (เลขวินาทีกันชนกัน — พอสำหรับทีมเดียว)
function genTracking() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `BD-${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function showTracking() {
    const no = document.getElementById('tracking-no');
    document.getElementById('tracking-display').classList.remove('hidden');
    if (currentTracking) {
        no.textContent = currentTracking;
        no.className = 'text-orange-300 font-mono tracking-wider';
    } else {
        no.textContent = 'ระบบจะออกเลขอัตโนมัติเมื่อบันทึก';
        no.className = 'text-gray-400 italic font-normal';
    }
}

// ============================================================
// PAGE NAVIGATION (Home → เลือกเมนู)
// ============================================================
const PAGE_TITLE = {
    home:           '',
    'bd-hub':       '🚨 ระบบแจ้งปัญหาเครื่องจักร',
    form:           '🚨 แจ้ง Breakdown',
    records:        '📋 รายการ Breakdown',
    summary:        '📊 สรุปข้อมูล Breakdown',
    'asset-hub':    '📋 ระบบทะเบียน — ภาพรวม',
    machines:       '🗂️ ระบบ Machine List',
    checklist:      '✅ ระบบ Check List',
    log:            '📋 Log ระบบ (Admin)',
    'cl-hub':       '✅ ระบบ Check List',
    'cl-form':      '📋 บันทึก Checklist',
    'cl-list':      '📁 ประวัติ Checklist',
    'cl-summary':   '📊 สรุป / KPI',
    'cl-calendar':  '📅 ปฏิทิน PM',
    'cl-schedule':  '🔧 รายละเอียดตรวจสอบ',
    'cl-status':    '✅ สถานะการตรวจ',
    'oee':          '📊 ระบบ TPM — สรุป OEE',
    'mcrank':       '📊 ระบบ TPM — Ranking เครื่องจักร',
    'tpm-hub':      '📈 ระบบ TPM',
};

// โหมดฟอร์ม: 'report' = กรอกน้อย / 'full' = กรอกครบ
let formMode  = 'report';
// ขั้นงาน: 'report'=แจ้งใหม่ 'accept'=รับงาน 'close'=ปิดงาน/แก้ไข 'manual'=Manual Create
let formStage = 'report';

function setFormMode(mode) {
    formMode = mode;
    const full = mode === 'full';
    document.querySelectorAll('.stage-fix').forEach(el => el.classList.toggle('hidden', !full));
}

// แปลง ISO datetime → "yyyy-MM-dd HH:mm น." สำหรับ accept modal (จอ ไม่ใช่ export)
function fmtDateTimeTH(iso) {
    if (!iso) return '—';
    const [d, t = ''] = String(iso).split('T');
    const hhmm = t.slice(0, 5);
    return hhmm ? `${d} ${hhmm} น.` : d;
}

// ล็อกช่องเวลาเริ่ม BD (ตอนปิดงานห้ามแก้)
function setBdStartLocked(locked) {
    ['bd-start-date', 'bd-start-time'].forEach(id => {
        const el = document.getElementById(id); if (!el) return;
        el.disabled = locked;
        el.classList.toggle('bg-gray-100', locked);
        el.classList.toggle('cursor-not-allowed', locked);
    });
}

// ล็อกช่องเวลาเสร็จ BD (ซ่อมสำเร็จกรอกแล้ว ขั้น edit/whyedit ห้ามแก้)
function setBdEndLocked(locked) {
    ['bd-end-date', 'bd-end-time'].forEach(id => {
        const el = document.getElementById(id); if (!el) return;
        el.disabled = locked;
        el.classList.toggle('bg-gray-100', locked);
        el.classList.toggle('cursor-not-allowed', locked);
    });
}

const STAGE_NAV = { report:'🚨 แจ้ง Breakdown', edit:'✏️ แก้ไข / ปิดงาน Report', whyedit:'🌳 แก้ Why-Why / มาตรการ / รูป', manual:'✍️ Manual Create' };

// โหมดแก้ Why-Why หลังปิดงาน: ปลดล็อกเฉพาะ Why-Why + มาตรการแก้ไข + มาตรการป้องกัน + รูปก่อน/หลัง
function lockExceptWhy(on) {
    const rc = document.getElementById('report-content');
    const editable = el =>
        el.closest('#why-section') ||
        el.id === 'inp-corrective' || el.id === 'inp-preventive' ||
        el.closest('#photo-box-before') || el.closest('#photo-box-after') ||
        el.closest('#thumbs-before')   || el.closest('#thumbs-after');
    rc.querySelectorAll('input, textarea, select, button').forEach(el => {
        el.disabled = (on && !editable(el));
    });
}

// จำกัดตัวเลือกสถานะมุมขวาบนตามขั้นงาน
function setStatusOptions(allowed) {
    // ใช้ hidden อย่างเดียว (disabled จะทำให้ค่าที่เลือกอยู่หลุดตอน export งานที่ปิดแล้ว)
    [...document.querySelectorAll('#status-select option')].forEach(o => {
        o.hidden = !allowed.includes(o.value);
    });
}

// จัดฟอร์มตามขั้นงาน: layout + ล็อก + ตัวเลือกสถานะ + ปุ่ม footer
function setFormStage(stage) {
    formStage = stage;
    lockExceptWhy(false);   // เปิดทุกช่องก่อน แล้วค่อยล็อกตามขั้น
    document.getElementById('close-missing').classList.add('hidden');
    setFormMode(stage === 'report' ? 'report' : 'full');
    setBdStartLocked(stage === 'edit' || stage === 'whyedit');   // ห้ามแก้เวลาเริ่ม
    setBdEndLocked(stage === 'edit' || stage === 'whyedit');     // ห้ามแก้เวลาเสร็จ (ซ่อมสำเร็จกรอกแล้ว)

    // ล็อกข้อมูลที่ User แจ้งไว้ (ชื่อเครื่อง, โรงงาน, พื้นที่) ห้ามแก้ตอน edit/whyedit
    if (stage === 'edit' || stage === 'whyedit') {
        ['machine-name', 'factory-select', 'area-select'].forEach(id => {
            const el = document.getElementById(id); if (!el) return;
            el.disabled = true;
            el.classList.add('bg-gray-100', 'cursor-not-allowed');
        });
    }

    const sSel = document.getElementById('status-select');
    if (stage === 'report') {
        setStatusOptions(['report']); setStatusLocked(true);
    } else if (stage === 'edit') {
        setStatusOptions(['wip', 'wait', 'repaired']);
        setStatusLocked(false);
        if (sSel.value === 'report') sSel.value = 'wip';
        updateStatus(sSel);
    } else if (stage === 'whyedit') {
        setStatusOptions(['done']); updateStatus(sSel);   // สถานะคงเป็น "เสร็จสิ้น" (จะถูกล็อกด้านล่าง)
    } else { // manual
        setStatusOptions(['report', 'wip', 'wait', 'repaired', 'done']); setStatusLocked(false);
    }

    showTracking();
    document.getElementById('tracking-display').classList.toggle('hidden', stage === 'report');

    const ids = ['btn-export','btn-report','btn-save-edit','btn-close-job','btn-manual-save','btn-savewhy','btn-cancel-edit'];
    ids.forEach(id => document.getElementById(id).classList.add('hidden'));
    const show = id => document.getElementById(id).classList.remove('hidden');
    if (stage === 'report')       show('btn-report');
    else if (stage === 'edit')    { show('btn-save-edit'); show('btn-close-job'); show('btn-cancel-edit'); }
    else if (stage === 'whyedit') { show('btn-savewhy'); show('btn-cancel-edit'); }
    else if (stage === 'manual')  { show('btn-manual-save'); show('btn-cancel-edit'); }

    if (stage === 'whyedit') lockExceptWhy(true);   // ล็อกทุกช่องยกเว้น Why-Why

    document.getElementById('nav-title').textContent = STAGE_NAV[stage] || '';
}

function quickStatus(v) {
    const sSel = document.getElementById('status-select');
    sSel.disabled = false; sSel.value = v; updateStatus(sSel);
}

function saveEdit() { showAddDataConfirm(); }   // แก้ไข Report — บันทึกด้วยสถานะ wip/wait ที่เลือก

// บันทึกแก้ไขเฉพาะ Why-Why หลังปิดงาน (สถานะคงเป็น เสร็จสิ้น) — ต้องยืนยันชื่อผู้แก้
function saveWhyOnly() { showAddDataConfirm(); }

// ปิดงาน — ต้องกรอกครบ (ยกเว้น Why-Why) ถึงจะปิดได้
function closeJob() {
    const d = collectFormData();
    // problem จริง = locked lines + บรรทัดใหม่ (hidden inp-problem ว่างเสมอ)
    d.problem = [ _problemLocked, (document.getElementById('inp-problem-new')?.value || '').trim() ]
                .filter(Boolean).join('\n');
    const need = [
        ['machineId','รหัสเครื่องจักร'], ['machineName','ชื่อเครื่องจักร'],
        ['factory','โรงงาน'], ['area','พื้นที่'], ['line','ไลน์การผลิต'],
        ['bdStart','เวลาเริ่ม'], ['bdEnd','เวลาเสร็จสิ้น'], ['bdType','ประเภท Breakdown'],
        ['eventType','ประเภทเหตุการณ์ (Breakdown/Adjustment)'],
        ['problem','ปัญหา/อาการ'], ['device','อุปกรณ์ที่เกิดปัญหา'],
        ['corrective','มาตรการแก้ไข'], ['preventive','มาตรการป้องกัน'],
    ];
    const miss = need.filter(([k]) => !String(d[k] || '').trim()).map(([, l]) => l);
    if (d.bdStart && d.bdEnd && new Date(d.bdEnd) < new Date(d.bdStart)) miss.push('เวลาเสร็จต้องหลังเวลาเริ่ม');

    const panel = document.getElementById('close-missing');
    if (miss.length) {
        document.getElementById('close-missing-list').innerHTML = miss.map(x => `<li>${x}</li>`).join('');
        panel.classList.remove('hidden');
        showToast('⚠️ ปิดงานไม่ได้ — ยังกรอกไม่ครบ', 'error');
        return;
    }
    panel.classList.add('hidden');
    quickStatus('done');
    showAddDataConfirm();
}

function closeTrackingModal() {
    document.getElementById('tracking-modal').classList.add('hidden');
    goHome();
}

// ปิดแท็บ; ถ้าปิดไม่ได้ (แท็บที่ผู้ใช้เปิดเอง/จาก QR) → แสดงหน้าจบเต็มจอ
function closeAppOrFallback() {
    document.getElementById('tracking-modal')?.classList.add('hidden');
    window.close();
    setTimeout(() => document.getElementById('app-done-screen')?.classList.remove('hidden'), 300);
}

// helper กลาง: เปิด tracking-modal พร้อม title/label ที่กำหนดเอง (ใช้ร่วมกับ BD + Checklist)
function showSavedModal(number, title, label) {
    const t = document.getElementById('tracking-modal-title');
    const l = document.getElementById('tracking-modal-label');
    const n = document.getElementById('tracking-modal-no');
    if (t) t.textContent = title || 'บันทึกสำเร็จ';
    if (l) l.textContent = label || 'เลขอ้างอิง';
    if (n) n.textContent = number || '';
    document.getElementById('tracking-modal').classList.remove('hidden');
}

// ============================================================
// รับงาน (Engineer / Admin)
// ============================================================
let _acceptItem = null;

function acceptRecord(item) {
    if (!can('bd.accept')) {
        showToast('⚠️ ไม่มีสิทธิ์รับงาน', 'error'); return;
    }
    _acceptItem = item;
    document.getElementById('accept-tracking-display').textContent =
        (item.tracking || '') + (item.machineName ? ' — ' + item.machineName : '');
    const _byu = document.getElementById('accept-byuser'); if (_byu) _byu.textContent = currentUser.name || '—';
    const esc = s => String(s||'').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    document.getElementById('accept-detail').innerHTML = `
      <div class="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm space-y-1.5">
        <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">เครื่องจักร</span><span class="col-span-2 font-bold">${esc(item.machineName)} <span class="text-gray-400 font-normal text-xs">${esc(item.machineId)}</span></span></div>
        <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">โรงงาน/พื้นที่</span><span class="col-span-2">${esc(item.factory)} / ${esc(item.area)}</span></div>
        <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">เวลาเริ่ม</span><span class="col-span-2">${esc(fmtDateTimeTH(item.bdStart))}</span></div>
        <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">ประเภท</span><span class="col-span-2">${esc(item.bdType)||'—'}</span></div>
        <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">ปัญหาที่พบ</span><span class="col-span-2 text-gray-800 whitespace-pre-line">${esc(item.problem)||'—'}</span></div>
        <div class="grid grid-cols-3 gap-1"><span class="text-gray-500">ผู้แจ้ง</span><span class="col-span-2 font-bold text-blue-700">${esc(item.byName)||'—'}</span></div>
        ${item.device?`<div class="grid grid-cols-3 gap-1"><span class="text-gray-500">อุปกรณ์</span><span class="col-span-2">${esc(item.device)}</span></div>`:''}
      </div>
      <div id="accept-photo-wrap" class="mt-3 hidden">
        <p class="text-xs text-gray-500 mb-1">รูปที่แจ้ง</p>
        <img id="accept-photo" class="w-full max-h-56 object-contain rounded-lg border border-gray-200 bg-gray-50">
      </div>`;
    const firstImg = String(item.imgBefore||'').split('|').map(s=>s.trim()).filter(Boolean)[0];
    if (firstImg && GAS_URL) {
        showLoading('กำลังโหลดรูป…');
        fetch(`${GAS_URL}?action=getImage&id=${encodeURIComponent(firstImg)}`)
            .then(r => r.json())
            .then(j => { if (j && j.success && j.dataUrl) {
                document.getElementById('accept-photo').src = j.dataUrl;
                document.getElementById('accept-photo-wrap').classList.remove('hidden');
            }})
            .catch(()=>{})
            .finally(() => hideLoading());
    }
    document.getElementById('accept-modal').classList.remove('hidden');
}

function closeAcceptModal() {
    document.getElementById('accept-modal').classList.add('hidden');
    _acceptItem = null;
}

async function confirmAccept() {
    const acceptedBy = currentUser.name;
    if (!acceptedBy) { showToast('⚠️ กรุณาเข้าสู่ระบบก่อนรับงาน', 'error'); openLogin(); return; }
    if (!_acceptItem) return;
    const item = _acceptItem;
    closeAcceptModal();
    try {
        await fetch(GAS_URL, {
            method: 'POST', mode: 'no-cors',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'accept',
                sheetName: item.sheetName,
                rowIndex:  item.rowIndex,
                tracking:  item.tracking,
                acceptedBy,
                username: currentUser.username, pin: currentUser.pin,
            }),
        });
        showToast('✅ รับงานเรียบร้อย — ' + acceptedBy, 'success');
        setTimeout(() => { switchTab('records'); checkRecordsSetup(); }, 700);
    } catch (err) {
        showToast('❌ เกิดข้อผิดพลาด: ' + err.message, 'error');
    }
}

// ============================================================
// ซ่อมสำเร็จ — บันทึก bdEnd + เปลี่ยนสถานะ (quick action จาก records)
// ============================================================
let _repairItem = null;
let _repairAfterImgs = [];   // [{data}] รูปหลังแก้ไขที่จะส่งไป GAS

function repairAddAfter(ev) {
    const files = [...ev.target.files];
    ev.target.value = '';
    files.forEach(f => {
        const r = new FileReader();
        r.onload = () => compressImage(r.result, d => { _repairAfterImgs.push({ data: d }); renderRepairAfter(); });
        r.readAsDataURL(f);
    });
}
function renderRepairAfter() {
    const box = document.getElementById('repair-after-thumbs');
    if (!box) return;
    box.innerHTML = _repairAfterImgs.map((im, i) =>
        `<div class="relative w-16 h-12 rounded-lg overflow-hidden border border-gray-200">
            <img src="${im.data}" class="w-full h-full object-cover">
            <button type="button" onclick="repairRmAfter(${i})" class="absolute top-0 right-0 bg-black/60 text-white w-4 h-4 text-xs leading-none rounded-bl">×</button>
        </div>`).join('');
}
function repairRmAfter(i) { _repairAfterImgs.splice(i, 1); renderRepairAfter(); }

function repairCompleteRecord(item) {
    if (!can('bd.editdoc')) { showToast('⚠️ ไม่มีสิทธิ์', 'error'); return; }
    _repairItem = item;
    _repairAfterImgs = [];
    renderRepairAfter();
    const corr = document.getElementById('repair-corrective');
    if (corr) corr.value = '';
    document.getElementById('repair-tracking-display').textContent =
        (item.tracking || '') + (item.machineName ? ' — ' + item.machineName : '');
    const bu = document.getElementById('repair-byuser');
    if (bu) bu.textContent = currentUser.name || '—';
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    document.getElementById('repair-end-date').value =
        `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
    document.getElementById('repair-end-time').value =
        `${pad(now.getHours())}:${pad(now.getMinutes())}`;
    document.getElementById('repair-complete-modal').classList.remove('hidden');
}

function closeRepairCompleteModal() {
    document.getElementById('repair-complete-modal').classList.add('hidden');
    _repairItem = null;
    _repairAfterImgs = [];
}

async function confirmRepairComplete() {
    if (!_repairItem) return;
    const date = document.getElementById('repair-end-date').value;
    const time = document.getElementById('repair-end-time').value;
    if (!date || !time) { showToast('⚠️ กรุณาระบุวันที่และเวลาซ่อมเสร็จ', 'error'); return; }
    const corrective = (document.getElementById('repair-corrective')?.value || '').trim();
    if (!corrective) { showToast('⚠️ กรุณาระบุมาตรการแก้ไข (Corrective)', 'error'); return; }
    if (!_repairAfterImgs.length) { showToast('⚠️ กรุณาแนบรูปหลังแก้ไขอย่างน้อย 1 รูป', 'error'); return; }
    const item = _repairItem;
    const imgAfter = _repairAfterImgs.map(im => im.data).join('|');
    closeRepairCompleteModal();
    showLoading('กำลังบันทึก…');
    try {
        const res = await fetch(GAS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain;charset=utf-8' },
            body: JSON.stringify({
                action: 'repairComplete',
                sheetName: item.sheetName,
                rowIndex:  item.rowIndex,
                tracking:  item.tracking,
                bdEnd:     `${date}T${time}`,
                bdStart:   item.bdStart || '',
                corrective,
                imgAfter,
                byName:    currentUser.name,
                username:  currentUser.username, pin: currentUser.pin,
            }),
        });
        const json = await res.json();
        if (json && json.success) {
            showToast('🔨 บันทึกซ่อมสำเร็จเรียบร้อย', 'success');
            setTimeout(() => loadRecords(), 700);
        } else {
            showToast('❌ บันทึกไม่สำเร็จ: ' + (json?.error || ''), 'error');
        }
    } catch (err) {
        showToast('❌ เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

// ============================================================
// REPORT POPUP — แจ้ง Breakdown แบบ pop up (ไม่อิงฟอร์มเต็ม)
// ============================================================
let machineList = [];   // master เครื่องจักร (รหัส→ชื่อ) จากแท็บ _Machines

// โหลด master เครื่องจักรจาก GAS → เติม datalist (ชื่อ สำหรับ popup, รหัส สำหรับฟอร์มเต็ม)
async function loadMachines() {
    if (!GAS_URL) return;
    try {
        const res  = await fetch(`${GAS_URL}?action=getMachines`);
        const json = await res.json();
        machineList = json.data || [];
        // populate machineMaster ด้วย endpoint เดียวกัน ป้องกัน loadHomeDash ยิง getMachines ซ้ำ
        machineMaster = machineList.map(m => ({ id:m.id||'', name:m.name||'', factory:m.factory||'', area:m.area||'', line:m.line||'', editedBy:m.editedBy||'', editedAt:m.editedAt||'' }));
        refilterMachineIdHints();
        const nameDl = document.getElementById('machine-name-list');
        if (nameDl) nameDl.innerHTML = [...new Set(machineList.map(m => m.name).filter(Boolean))].map(n => `<option value="${esc(n)}"></option>`).join('');
    } catch (e) { /* เงียบ — กรอกเองได้ */ }
}

// กรอง machineList ตามโรงงาน+พื้นที่ที่เลือกในฟอร์มเต็ม
function machinesForCurrentScope() {
    const fSel  = document.getElementById('factory-select');
    const fText = fSel?.options[fSel.selectedIndex]?.text || '';
    const fOk   = fText && !fText.includes('--');
    const area  = document.getElementById('area-select')?.value || '';
    return machineList.filter(m =>
        (!fOk  || m.factory === fText) &&
        (!area || m.area    === area));
}

// เติม datalist รหัสตาม scope ปัจจุบัน — ไม่ล้างฟิลด์ (ปลอดภัยเรียกได้ทุกที่รวมถึง loadMachines)
function refilterMachineIdHints() {
    const dl = document.getElementById('machine-id-list');
    if (!dl) return;
    const esc   = s => String(s || '').replace(/"/g, '&quot;');
    const scope = machinesForCurrentScope();
    dl.innerHTML = scope.slice(0, 5).map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
}
// ล้างรหัส/ชื่อ/สาย — เรียกเฉพาะตอน user เปลี่ยนโรงงาน/พื้นที่เอง
function clearMachineIdFields() {
    ['inp-machine-id', 'machine-name', 'inp-line'].forEach(id => {
        const el = document.getElementById(id); if (el) el.value = '';
    });
}

// ฟอร์มเต็ม (รับงาน/ปิดงาน): พิมพ์/เลือกรหัส → hint 5 ตัว + autofill ชื่อเครื่อง (อิงโรงงาน+พื้นที่)
function onMachineIdLookup() {
    const q     = document.getElementById('inp-machine-id').value.trim().toLowerCase();
    const scope = machinesForCurrentScope();
    const dl    = document.getElementById('machine-id-list');
    if (dl) {
        const esc   = s => String(s || '').replace(/"/g, '&quot;');
        const match = q ? scope.filter(x => String(x.id).toLowerCase().includes(q) || String(x.name).toLowerCase().includes(q)) : scope;
        dl.innerHTML = match.slice(0, 5).map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('');
    }
    const m = scope.find(x => String(x.id).toLowerCase() === q);
    if (!m) return;
    const nameEl = document.getElementById('machine-name'); if (nameEl && m.name) nameEl.value = m.name;
    const lineEl = document.getElementById('inp-line');     if (lineEl && m.line) lineEl.value = m.line;
}

function openReportPopup() {
    window._scanEventType = 'Breakdown';   // default — scan flow จะ override ทีหลัง
    // re-enable fields ที่อาจถูก lock จาก QR scan
    ['rm-machine','rm-factory','rm-area','rm-line','rm-date','rm-time','rm-machine-id'].forEach(id => {
        const el = document.getElementById(id); if (el) el.disabled = false;
    });
    const mid = document.getElementById('rm-machine-id'); if (mid) mid.value = '';
    document.getElementById('rm-machineid-wrap')?.classList.add('hidden');
    document.getElementById('rm-qr-notice')?.classList.add('hidden');
    document.getElementById('rm-factory').value = '';
    rmUpdateArea();
    ['rm-machine','rm-line','rm-date','rm-time','rm-problem'].forEach(id => document.getElementById(id).value = '');
    imgList.before = []; imgList.after = [];
    document.getElementById('rm-preview').classList.add('hidden');
    document.getElementById('rm-photo-hint').classList.remove('hidden');
    const titleEl = document.getElementById('rm-modal-title');
    const btnEl   = document.getElementById('rm-submit');
    if (titleEl) titleEl.textContent = '🚨 แจ้ง Breakdown';
    if (btnEl) {
        btnEl.textContent = '🚨 แจ้ง Breakdown';
        btnEl.classList.add('bg-red-500','hover:bg-red-600');
        btnEl.classList.remove('bg-orange-500','hover:bg-orange-600');
    }
    document.getElementById('rm-header')?.classList.add('bg-red-600');
    document.getElementById('rm-header')?.classList.remove('bg-orange-500');
    document.getElementById('report-modal').classList.remove('hidden');
    loadMachines();   // รีเฟรช master ทุกครั้งที่เปิด
}

function _applyReportEventType(et) {
    window._scanEventType = et;
    const isAdj = et === 'Adjustment';
    const t = document.getElementById('rm-modal-title');
    const b = document.getElementById('rm-submit');
    const h = document.getElementById('rm-header');
    if (t) t.textContent = isAdj ? '🔧 แจ้งซ่อม (Adjustment)' : '🚨 แจ้ง Breakdown';
    if (b) {
        b.textContent = isAdj ? '🔧 แจ้งซ่อม' : '🚨 แจ้ง Breakdown';
        b.classList.toggle('bg-orange-500', isAdj);   b.classList.toggle('hover:bg-orange-600', isAdj);
        b.classList.toggle('bg-red-500', !isAdj);      b.classList.toggle('hover:bg-red-600', !isAdj);
    }
    if (h) { h.classList.toggle('bg-orange-500', isAdj); h.classList.toggle('bg-red-600', !isAdj); }
}

function openReportPopupType(eventType) {
    openReportPopup();
    _applyReportEventType(eventType || 'Breakdown');
}

function closeReportModal() {
    // re-enable ก่อน hide — กันกรณี QR scan ล็อก field ค้างไว้
    ['rm-machine','rm-factory','rm-area','rm-line','rm-date','rm-time','rm-machine-id'].forEach(id => {
        const el = document.getElementById(id); if (el) el.disabled = false;
    });
    document.getElementById('rm-qr-notice')?.classList.add('hidden');
    document.getElementById('report-modal').classList.add('hidden');
}

function rmUpdateArea() {
    const f = document.getElementById('rm-factory').value;
    const sel = document.getElementById('rm-area');
    if (!f) { sel.innerHTML = '<option value="">-- เลือกโรงงานก่อน --</option>'; return; }
    sel.innerHTML = '<option value="">-- เลือกพื้นที่ --</option>';
    (AREA_MAP[f] || []).forEach(a => { const o = document.createElement('option'); o.value = o.textContent = a; sel.appendChild(o); });
}

function rmSetImage(event) {
    const file = event.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => compressImage(reader.result, d => {
        imgList.before = [{ data: d, id: '' }];
        const img = document.getElementById('rm-preview');
        img.src = d; img.classList.remove('hidden');
        document.getElementById('rm-photo-hint').classList.add('hidden');
    });
    reader.readAsDataURL(file);
    event.target.value = '';
}

async function submitReportPopup() {
    const fSel = document.getElementById('rm-factory');
    const factory = fSel.options[fSel.selectedIndex]?.text || '';
    const area    = document.getElementById('rm-area').value;
    const machine = document.getElementById('rm-machine').value.trim();
    const line    = document.getElementById('rm-line').value.trim();
    const date    = document.getElementById('rm-date').value;
    const time    = document.getElementById('rm-time').value;
    const problem = document.getElementById('rm-problem').value.trim();
    const byName  = currentUser.name;

    if (!machine)    return showToast('⚠️ กรุณาระบุชื่อเครื่องจักร', 'error');
    if (!fSel.value) return showToast('⚠️ กรุณาเลือกโรงงาน', 'error');
    if (!area)       return showToast('⚠️ กรุณาเลือกพื้นที่', 'error');
    if (!date)       return showToast('⚠️ กรุณาระบุวันที่เริ่ม', 'error');
    if (!time)       return showToast('⚠️ กรุณาระบุเวลาเริ่ม', 'error');
    if (!problem)    return showToast('⚠️ กรุณาระบุปัญหา/อาการ', 'error');
    if (!imgList.before.length) return showToast('⚠️ กรุณาแนบรูปอย่างน้อย 1 รูป', 'error');
    if (!byName)     { showToast('⚠️ กรุณาเข้าสู่ระบบก่อนแจ้ง', 'error'); openLogin(); return; }
    if (!GAS_URL)    return showToast('⚠️ ยังไม่ได้ตั้งค่า Web App URL', 'error');

    const data = {
        timestamp: new Date().toISOString(), tracking: '',
        machineName: machine, factory, area, machineId: (document.getElementById('rm-machine-id')?.value || ''), line,
        status: 'รอรับงาน', bdStart: `${date}T${time || '00:00'}`, bdEnd: '', downtimeMin: 0,
        bdType: '', eventType: window._scanEventType || 'Breakdown',
        problem, device: '', whys: [''],
        corrective: '', preventive: '', parts: [], byName, action: 'create',
        imgBefore: imgsToStr('before'), imgAfter: '',   // รูปก่อน (จาก popup) → อัปขึ้น Drive
    };

    const btn = document.getElementById('rm-submit');
    btn.disabled = true; btn.textContent = '⏳ กำลังบันทึก...';
    try {
        const res  = await fetch(GAS_URL, { method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(data) });
        const json = await res.json();
        if (json && json.success) {
            closeReportModal();
            showSavedModal(json.tracking || '', 'แจ้ง Breakdown สำเร็จ', 'เลข Tracking Breakdown');
        } else {
            showToast('❌ แจ้งไม่สำเร็จ: ' + (json && json.error || 'ไม่ทราบสาเหตุ'), 'error');
        }
    } catch (err) {
        showToast('❌ เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
        btn.disabled = false; btn.textContent = '🚨 แจ้ง Breakdown';
    }
}

const BD_SUB_PANELS = new Set(['form', 'records', 'summary']);
const CL_SUB_PANELS = new Set(['cl-form', 'cl-list', 'cl-summary', 'cl-calendar', 'cl-schedule', 'cl-status']);

// ===== NAV helpers =====
function openMoreSheet() {
    document.getElementById('more-overlay').style.display = 'block';
    document.getElementById('more-sheet').classList.add('open');
}
function closeMoreSheet() {
    document.getElementById('more-overlay').style.display = 'none';
    document.getElementById('more-sheet').classList.remove('open');
}
function clToggleNavGroup(grp) {
    document.getElementById('grp-' + grp)?.classList.toggle('open');
}
function updateNavActive(panel) {
    document.querySelectorAll('.sidebar-item[id^="sn-"]').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bnav-tab[id^="bn-"]').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.sidebar-subitem').forEach(el => el.classList.remove('active'));
    const isSubPanel = BD_SUB_PANELS.has(panel) || CL_SUB_PANELS.has(panel);
    // bottom nav
    const bnMap = {
        'home':'bn-home',
        'bd-hub':'bn-bd','form':'bn-bd','records':'bn-bd','summary':'bn-bd',
        'machines':'bn-mach', 'asset-hub':'bn-mach', 'spare':'bn-mach',
        'cl-hub':'bn-cl','cl-form':'bn-cl','cl-list':'bn-cl','cl-summary':'bn-cl','cl-calendar':'bn-cl','cl-schedule':'bn-cl','cl-status':'bn-cl',
        'log':'bn-more', 'oee':'bn-more', 'mcrank':'bn-more', 'tpm-hub':'bn-more',
    };
    document.getElementById(bnMap[panel])?.classList.add('active');
    // sidebar: single items (standalone เท่านั้น — group header จัดการใน grpMap)
    const snMap = { 'home':'sn-home', 'log':'sn-log' };
    if (snMap[panel]) document.getElementById(snMap[panel])?.classList.add('active');
    // sidebar: group + sub-item
    const grpMap = {
        'bd-hub':      ['bd','sni-bd-hub'],
        'form':        ['bd','sni-bd-form'],
        'records':     ['bd','sni-bd-records'],
        'summary':     ['bd','sni-bd-summary'],
        'cl-hub':      ['cl','sni-cl-hub'],
        'cl-form':     ['cl', document.getElementById('clf-type')?.value === 'pm' ? 'sni-cl-pm' : 'sni-cl-daily'],
        'cl-list':     ['cl','sni-cl-list'],
        'cl-summary':  ['cl','sni-cl-summary'],
        'cl-calendar': ['cl','sni-cl-calendar'],
        'cl-schedule': ['cl','sni-cl-schedule'],
        'cl-status':   ['cl','sni-cl-status'],
        'tpm-hub':     ['tpm','sni-tpm-hub'],
        'oee':         ['tpm','sni-tpm-oee'],
        'mcrank':      ['tpm','sni-tpm-rank'],
        'asset-hub':   ['asset','sni-asset-hub'],
        'machines':    ['asset','sni-asset-mach'],
        'spare':       ['asset','sni-asset-spare'],
    };
    const gi = grpMap[panel];
    // Accordion: หุบ group อื่นทุกครั้งที่เปลี่ยนระบบ
    ['bd', 'tpm', 'cl', 'asset'].forEach(g => {
        if (!gi || g !== gi[0]) document.getElementById('grp-' + g)?.classList.remove('open');
    });
    if (gi) {
        document.getElementById('grp-' + gi[0])?.classList.add('open');
        document.getElementById('sn-' + gi[0])?.classList.add('active');
        document.getElementById(gi[1])?.classList.add('active');
    }
    document.getElementById('sidebar-subnav')?.classList.toggle('hidden', !isSubPanel);
}
function updateNavRole() {
    // applyPermissions() (permissions.js) จัดการ UI login/logout/role-display แล้ว
    document.getElementById('sidebar-admin-section')?.classList.toggle('hidden', !can('ua.log'));
    document.getElementById('more-log-item')?.classList.toggle('hidden', !can('ua.log'));
}
// ========================

function switchTab(name) {
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + name)?.classList.add('active');

    document.getElementById('nav-title')?.classList && (document.getElementById('nav-title').textContent = PAGE_TITLE[name] || '');
    document.getElementById('btn-home')?.classList.toggle('hidden', name === 'home');
    document.getElementById('btn-back')?.classList.toggle('hidden', !BD_SUB_PANELS.has(name) && !CL_SUB_PANELS.has(name));
    updateNavActive(name);

    if (name === 'summary') checkSummarySetup();
    if (name === 'home' && machineMaster.length) loadHomeDash(); // ไม่ยิงตอน init (machineMaster ยังว่าง)
    if (name === 'records') checkRecordsSetup();
    if (name === 'cl-hub') initClHub();
    if (name === 'cl-list') initClList();
    if (name === 'cl-summary') initClSummary();
    if (name === 'cl-calendar') initClCalendar();
    if (name === 'cl-schedule') initClSchedule();
    if (name === 'cl-status') initClStatus();
    if (name === 'ua') { uaSwitch?.('users'); }
    if (name === 'oee') initOeePanel?.();
    if (name === 'mcrank') initMcRankPanel();
    if (name === 'tpm-hub') updateTpmHubStats();
    if (name === 'asset-hub') renderAssetHub();
    window.scrollTo(0, 0);
}

// กลับหน้าเลือกเมนู (เหมือนเปิดแอปใหม่) — ล้างฟอร์มเสมอ
function goHome() {
    cancelEdit();
    switchTab('home');
    refreshDashboard();
}

function goBack() {
    const active = document.querySelector('.tab-panel.active');
    const id = active ? active.id.replace('panel-', '') : '';
    if (CL_SUB_PANELS.has(id)) { switchTab('cl-hub'); }
    else { goBdHub(); }
}

function goBdHub() {
    switchTab('bd-hub');
    // อัปเดต stats ใน bd-hub header จาก cache
    if (_lastRecords.length) {
        const now  = new Date();
        const ym   = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
        const wip  = _lastRecords.filter(r => r.status === 'wip').length;
        const month = _lastRecords.filter(r => (r.date||'').startsWith(ym) && r.status !== 'cancel').length;
        const elW = document.getElementById('bdhub-stat-wip');
        const elM = document.getElementById('bdhub-stat-month');
        if (elW) elW.textContent = `🔧 WIP: ${wip}`;
        if (elM) elM.textContent = `📋 เดือนนี้: ${month}`;
    }
}

function goChecklist() {
    switchTab('cl-hub');
}

function goTpmHub() {
    switchTab('tpm-hub');
    updateTpmHubStats();
}

// อัปเดต stat chips ใน TPM hub จาก cache (_mcrOverview) — ไม่ยิง fetch ใหม่
function updateTpmHubStats() {
    const ov   = (typeof _mcrOverview !== 'undefined') ? _mcrOverview : null;
    const tot  = ov && ov.total ? ov.total : null;
    const done = ov && ov.statusCounts ? (ov.statusCounts.complete || 0) : null;
    const elR  = document.getElementById('tpmhub-stat-ranked');
    const elT  = document.getElementById('tpmhub-stat-total');
    if (elR) elR.textContent = '📊 ประเมินแล้ว: ' + (done !== null ? done : '—');
    if (elT) elT.textContent = '🏭 เครื่องจักร: ' + (tot !== null ? tot : (typeof machineMaster !== 'undefined' ? machineMaster.length : '—'));
}

// ============================================================
// LOG VIEWER (Admin)
// ============================================================
let _allBdLog = [];      // raw BD log rows from GAS
let _logMcData = [];     // machine list with editedBy
let _logCurrentTab = 'bd';

function goLog() {
    if (!can('ua.log')) { showToast('⚠️ ไม่มีสิทธิ์ดู Log ระบบ', 'error'); return; }
    switchTab('log');
    switchLogTab('bd');
    loadAllLog();
}

function switchLogTab(tab) {
    _logCurrentTab = tab;
    document.getElementById('log-panel-bd').classList.toggle('hidden', tab !== 'bd');
    document.getElementById('log-panel-machines').classList.toggle('hidden', tab !== 'machines');
    document.getElementById('log-panel-cl').classList.toggle('hidden', tab !== 'cl');
    ['bd','machines','cl'].forEach(t => {
        const btn = document.getElementById('log-tab-' + t);
        if (btn) btn.className = 'log-tab-btn px-5 py-2 rounded-lg text-sm font-bold transition-all ' +
            (tab === t ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-800');
    });
    if (tab === 'machines') { renderMcLog(); renderMcLogHistory(); }
    if (tab === 'cl') renderClLog();
}
const CL_LOG_KEYS = ['Checklist','Daily','PM items','แผน PM','Copy','Default'];
const MC_REG_KEYS = ['เพิ่มทะเบียน','แก้ไขทะเบียน','ลบทะเบียน'];
function _logTracking(row) { return String(Array.isArray(row) ? (row[1]||'') : (row.tracking||row[1]||'')); }
function _logAction(row)   { return String(Array.isArray(row) ? (row[2]||'') : (row.action||row[2]||'')); }
function isBdLog(row)  { return _logTracking(row).startsWith('BD-'); }
function isClLog(row)  {
    if (_logTracking(row).startsWith('CL-')) return true;
    const act = _logAction(row);
    return CL_LOG_KEYS.some(k => act.includes(k));
}
function isMcLog(row)  {
    const act = _logAction(row);
    return _logTracking(row) === '-' && MC_REG_KEYS.some(k => act.includes(k));
}

function renderClLog() {
    const q  = (document.getElementById('log-cl-search')?.value   || '').trim().toLowerCase();
    const tq = (document.getElementById('log-cl-tracking')?.value || '').trim().toLowerCase();
    const tbody = document.getElementById('log-cl-tbody');
    const empty = document.getElementById('log-cl-empty');
    if (!tbody) return;
    const allCl = (_allBdLog || []).filter(isClLog);
    const rows = allCl.filter(r => {
        const tracking = String(r.tracking||'').toLowerCase();
        const act = String(r.action||'').toLowerCase();
        const by  = String(r.byName||'').toLowerCase();
        if (tq && !tracking.includes(tq)) return false;
        if (q  && !act.includes(q) && !by.includes(q) && !tracking.includes(q)) return false;
        return true;
    });
    const countEl = document.getElementById('log-cl-count');
    if (countEl) countEl.textContent = `${rows.length} / ${allCl.length} รายการ`;
    empty.classList.toggle('hidden', rows.length > 0);
    tbody.innerHTML = rows.map(r => {
        const time     = String(r.time||'').replace('T',' ').slice(0,16) || '—';
        const tracking = r.tracking || '—';
        const act      = String(r.action||'—');
        const by       = String(r.byName||'—');
        return `<tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">${time}</td>
            <td class="px-4 py-2.5"><span class="text-xs font-bold text-teal-600">${tracking}</span></td>
            <td class="px-4 py-2.5 text-sm">${act}</td>
            <td class="px-4 py-2.5 text-sm text-gray-600">${by}</td>
        </tr>`;
    }).join('') || '<tr><td colspan="4" class="text-center py-8 text-gray-400 text-sm">ไม่พบรายการ</td></tr>';
}

async function loadAllLog() {
    if (!GAS_URL) return;
    // Load BD log
    setVisible('log-bd-loading', true);
    setVisible('log-bd-empty', false);
    document.getElementById('log-bd-tbody').innerHTML = '';
    try {
        const res  = await fetch(`${GAS_URL}?action=getLog`);
        const json = await res.json();
        _allBdLog  = json.data || [];
    } catch (e) {
        showToast('❌ โหลด Log ไม่สำเร็จ: ' + e.message, 'error');
        _allBdLog = [];
    }
    setVisible('log-bd-loading', false);
    renderBdLog();

    // Load machine list for machine tab
    if (!machineMaster.length) {
        try {
            const res  = await fetch(`${GAS_URL}?action=getMachines`);
            const json = await res.json();
            machineMaster = (json.data || []).map(m => ({
                id: m.id||'', name: m.name||'', factory: m.factory||'', area: m.area||'',
                line: m.line||'', editedBy: m.editedBy||'', editedAt: m.editedAt||''
            }));
        } catch (_) {}
    }
    _logMcData = machineMaster.filter(m => m.editedBy);
    if (_logCurrentTab === 'machines') { renderMcLog(); renderMcLogHistory(); }
    if (_logCurrentTab === 'cl') renderClLog();
}

const ACTION_LABELS = {
    create: { label: 'สร้าง',   cls: 'bg-blue-100 text-blue-700' },
    accept: { label: 'รับงาน',  cls: 'bg-orange-100 text-orange-700' },
    update: { label: 'อัปเดต', cls: 'bg-yellow-100 text-yellow-700' },
    close:  { label: 'ปิดงาน',  cls: 'bg-green-100 text-green-700' },
    cancel: { label: 'ยกเลิก',  cls: 'bg-red-100 text-red-600' },
    delete: { label: 'ลบ',      cls: 'bg-gray-200 text-gray-600' },
};

function renderBdLog() {
    const q     = (document.getElementById('log-bd-search')?.value || '').trim().toLowerCase();
    const act   = (document.getElementById('log-bd-action')?.value || '').toLowerCase();
    const tbody = document.getElementById('log-bd-tbody');
    const emptyEl = document.getElementById('log-bd-empty');

    const allBd = _allBdLog.filter(isBdLog);
    const rows = allBd.filter(r => {
        const matchAct = !act || String(r.action||'').toLowerCase().includes(act);
        const matchQ   = !q  ||
            String(r.tracking||'').toLowerCase().includes(q) ||
            String(r.byName||'').toLowerCase().includes(q)   ||
            String(r.status||'').toLowerCase().includes(q)   ||
            String(r.action||'').toLowerCase().includes(q);
        return matchAct && matchQ;
    });

    document.getElementById('log-bd-count').textContent = `${rows.length} / ${allBd.length} รายการ`;

    if (!rows.length) {
        tbody.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }
    emptyEl.classList.add('hidden');

    tbody.innerHTML = rows.map(r => {
        const actKey = String(r.action||'').toLowerCase();
        const actInfo = ACTION_LABELS[actKey] || { label: r.action||'—', cls: 'bg-gray-100 text-gray-600' };
        const timeStr = r.time ? String(r.time).replace('T', ' ').slice(0, 16) : '—';
        return `<tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
            <td class="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">${timeStr}</td>
            <td class="px-4 py-2.5"><span class="text-xs font-bold text-blue-600">${r.tracking||'—'}</span></td>
            <td class="px-4 py-2.5"><span class="inline-block text-xs font-bold px-2 py-0.5 rounded-full ${actInfo.cls}">${actInfo.label}</span></td>
            <td class="px-4 py-2.5 text-sm text-gray-700">${r.byName||'—'}</td>
            <td class="px-4 py-2.5 text-xs text-gray-500">${r.status||'—'}</td>
        </tr>`;
    }).join('');
}

function renderMcLog() {
    const q       = (document.getElementById('log-mc-search')?.value || '').trim().toLowerCase();
    const factory = document.getElementById('log-mc-factory')?.value || '';
    const tbody   = document.getElementById('log-mc-tbody');
    const emptyEl = document.getElementById('log-mc-empty');

    // Sort: most recently edited first
    const sorted = [..._logMcData].sort((a, b) => {
        if (!a.editedAt && !b.editedAt) return 0;
        if (!a.editedAt) return 1;
        if (!b.editedAt) return -1;
        return b.editedAt.localeCompare(a.editedAt);
    });

    const rows = sorted.filter(m => {
        const matchFac = !factory || m.factory === factory;
        const matchQ   = !q ||
            String(m.id||'').toLowerCase().includes(q) ||
            String(m.name||'').toLowerCase().includes(q) ||
            String(m.editedBy||'').toLowerCase().includes(q);
        return matchFac && matchQ;
    });

    document.getElementById('log-mc-count').textContent = `${rows.length} / ${_logMcData.length} รายการ`;

    if (!rows.length) {
        tbody.innerHTML = '';
        emptyEl.classList.remove('hidden');
        return;
    }
    emptyEl.classList.add('hidden');

    tbody.innerHTML = rows.map(m => {
        const dateStr = m.editedAt
            ? new Date(m.editedAt).toLocaleString('th-TH', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })
            : '—';
        return `<tr class="border-b border-gray-100 hover:bg-gray-50 transition-colors">
            <td class="px-4 py-2.5"><span class="inline-block bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded">${m.id||'—'}</span></td>
            <td class="px-4 py-2.5 text-sm font-medium text-gray-800">${m.name||'—'}</td>
            <td class="px-4 py-2.5 text-xs text-gray-600">${m.factory||'—'}</td>
            <td class="px-4 py-2.5 text-xs text-gray-600">${m.area||'—'}</td>
            <td class="px-4 py-2.5 text-sm text-gray-700 font-medium">${m.editedBy||'—'}</td>
            <td class="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">${dateStr}</td>
        </tr>`;
    }).join('');
}

function renderMcLogHistory() {
    const tbody = document.getElementById('log-mc-hist-tbody');
    const empty = document.getElementById('log-mc-hist-empty');
    if (!tbody) return;
    const rows = (_allBdLog || []).filter(isMcLog).sort((a, b) =>
        String(b.time||'').localeCompare(String(a.time||''))
    );
    const countEl = document.getElementById('log-mc-hist-count');
    if (countEl) countEl.textContent = `${rows.length} รายการ`;
    if (!rows.length) {
        tbody.innerHTML = '';
        if (empty) empty.classList.remove('hidden');
        return;
    }
    if (empty) empty.classList.add('hidden');
    const ACT_CLS = { 'เพิ่มทะเบียน':'bg-blue-100 text-blue-700', 'แก้ไขทะเบียน':'bg-yellow-100 text-yellow-700', 'ลบทะเบียน':'bg-red-100 text-red-600' };
    tbody.innerHTML = rows.map(r => {
        const time = String(r.time||'').replace('T',' ').slice(0,16) || '—';
        const act  = String(r.action||'—');
        const by   = String(r.byName||'—');
        const cls  = ACT_CLS[act] || 'bg-gray-100 text-gray-600';
        return `<tr class="border-b border-gray-100 hover:bg-gray-50">
            <td class="px-4 py-2.5 text-xs text-gray-500 whitespace-nowrap">${time}</td>
            <td class="px-4 py-2.5"><span class="inline-block text-xs font-bold px-2 py-0.5 rounded-full ${cls}">${act}</span></td>
            <td class="px-4 py-2.5 text-sm text-gray-700">${by}</td>
        </tr>`;
    }).join('');
}

