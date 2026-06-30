// ============================================================
// SPARE PARTS — ทะเบียนอะไหล่ (Store/Supplier)  — ระบบ ②
// ============================================================
let _spData  = [];   // รายการทั้งหมด (โหลดจาก GAS)
let _spEditing = null;   // { partId } หรือ null (เพิ่มใหม่)
let _spImgDataUrl = null;   // dataURL รูปที่เพิ่งเลือก
let _spImpRows = [];         // import state (แยกจาก _impRows ของ machines.js)
let _spImpHeaders = [];
let _spImpColMap  = {};      // { partNo, name, category, location, note }

// ---- โหลด + render ----
async function spareLoad() {
    if (!GAS_URL) return;
    try {
        const r = await fetch(GAS_URL + '?action=spareList');
        const j = await r.json();
        _spData = j.success ? (j.data || []) : [];
    } catch(e) { _spData = []; }
    spareRender();
}

function spareRender() {
    const typeF   = (document.getElementById('spare-filter-type')   || {}).value || '';
    const searchF = ((document.getElementById('spare-filter-search') || {}).value || '').toLowerCase();
    const wrap    = document.getElementById('spare-list-wrap');
    if (!wrap) return;

    const filtered = _spData.filter(p => {
        if (typeF && p.type !== typeF) return false;
        if (searchF) {
            const hay = ((p.name||'') + ' ' + (p.partNo||'') + ' ' + (p.category||'')).toLowerCase();
            if (hay.indexOf(searchF) < 0) return false;
        }
        return true;
    });

    if (!filtered.length) {
        wrap.innerHTML = '<p class="text-gray-400 text-sm text-center py-8">ไม่พบรายการ</p>';
        return;
    }

    const canEdit = can('spare.edit');
    wrap.innerHTML = filtered.map(p => {
        const badge = p.type === 'SUPPLIER'
            ? '<span class="text-xs bg-purple-100 text-purple-700 font-bold px-2 py-0.5 rounded-full">Supplier</span>'
            : '<span class="text-xs bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full">Store</span>';
        const sub = p.type === 'SUPPLIER'
            ? (p.supplier ? '🏭 ' + p.supplier : '')
            : (p.location ? '📦 ' + p.location : '');
        const cat = p.category ? '<span class="text-gray-400">· ' + p.category + '</span>' : '';
        const editBtn = canEdit
            ? `<button onclick="spareOpenEdit(${JSON.stringify(p).replace(/"/g,'&quot;')})"
                       class="text-xs text-blue-500 hover:text-blue-700 font-bold px-2 py-1 rounded hover:bg-blue-50 transition-colors">แก้ไข</button>`
            : '';
        return `<div class="bg-white rounded-xl border border-gray-100 shadow-sm p-4 flex items-center gap-3">
            ${p.imageId ? `<img src="" data-imgid="${p.imageId}" class="sp-thumb w-12 h-12 object-contain rounded-lg border border-gray-100 flex-shrink-0 bg-gray-50">` : '<div class="w-12 h-12 rounded-lg bg-gray-100 flex-shrink-0 flex items-center justify-center text-gray-300 text-xl">🔩</div>'}
            <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-gray-800 text-sm">${p.name || '-'}</span>
                    ${badge}
                </div>
                <p class="text-xs text-gray-500 mt-0.5">${p.partNo ? '[' + p.partNo + '] ' : ''}${sub} ${cat}</p>
                ${p.note ? `<p class="text-xs text-gray-400 mt-0.5">${p.note}</p>` : ''}
            </div>
            ${editBtn}
        </div>`;
    }).join('');

    // โหลดรูป thumbnail (lazy ผ่าน getImage endpoint)
    wrap.querySelectorAll('.sp-thumb[data-imgid]').forEach(async img => {
        const id = img.dataset.imgid; if (!id) return;
        try {
            const r = await fetch(GAS_URL + '?action=getImage&id=' + encodeURIComponent(id));
            const j = await r.json();
            if (j.success && j.data) img.src = j.data;
        } catch(e){}
    });
}

// ---- modal เพิ่ม/แก้ ----
function spareOpenEdit(item) {
    _spEditing    = item || null;
    _spImgDataUrl = null;
    document.getElementById('spare-edit-title').textContent = item ? 'แก้ไขอะไหล่' : 'เพิ่มอะไหล่';
    document.getElementById('sp-type').value     = item ? (item.type || 'STORE') : 'STORE';
    document.getElementById('sp-partno').value   = item ? (item.partNo   || '') : '';
    document.getElementById('sp-name').value     = item ? (item.name     || '') : '';
    document.getElementById('sp-category').value = item ? (item.category || '') : '';
    document.getElementById('sp-location').value = item ? (item.location || '') : '';
    document.getElementById('sp-supplier').value = item ? (item.supplier || '') : '';
    document.getElementById('sp-note').value     = item ? (item.note     || '') : '';
    document.getElementById('sp-img-input').value = '';
    document.getElementById('sp-img-preview').classList.add('hidden');
    spareTypeChange();
    document.getElementById('spare-edit-modal').classList.remove('hidden');
}
function spareCloseEdit() { document.getElementById('spare-edit-modal').classList.add('hidden'); }

function spareTypeChange() {
    const t = document.getElementById('sp-type').value;
    const isSupplier = t === 'SUPPLIER';
    document.getElementById('sp-location-wrap').classList.toggle('hidden',  isSupplier);
    document.getElementById('sp-supplier-wrap').classList.toggle('hidden', !isSupplier);
}

function spareImgPreview(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        _spImgDataUrl = e.target.result;
        const img = document.getElementById('sp-img-preview-img');
        img.src = _spImgDataUrl;
        document.getElementById('sp-img-preview').classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

async function spareSaveEdit() {
    const name = document.getElementById('sp-name').value.trim();
    if (!name) { showToast('กรุณากรอกชื่ออะไหล่', 'error'); return; }
    if (!currentUser || !can('spare.edit')) { showToast('ไม่มีสิทธิ์', 'error'); return; }

    const payload = {
        action:    'spareUpsert',
        username:  currentUser.username,
        pin:       currentUser.pin,
        partId:    _spEditing ? _spEditing.partId : null,
        partNo:    document.getElementById('sp-partno').value.trim(),
        name,
        type:      document.getElementById('sp-type').value,
        category:  document.getElementById('sp-category').value.trim(),
        location:  document.getElementById('sp-location').value.trim(),
        supplier:  document.getElementById('sp-supplier').value.trim(),
        note:      document.getElementById('sp-note').value.trim(),
        imageId:          _spImgDataUrl  || null,
        existingImageId:  _spEditing ? (_spEditing.imageId || '') : '',
    };

    try {
        showToast('กำลังบันทึก...', 'info');
        const r = await fetch(GAS_URL, { method:'POST', body: JSON.stringify(payload) });
        const j = await r.json();
        if (j.success) {
            showToast('บันทึกสำเร็จ ✅', 'success');
            spareCloseEdit();
            await spareLoad();
            loadSpareCache();   // refresh datalist hint
        } else { showToast('เกิดข้อผิดพลาด: ' + (j.error||''), 'error'); }
    } catch(e) { showToast('เชื่อมต่อ GAS ไม่ได้', 'error'); }
}

// ---- import Excel (Store) ----
function spareOpenImport() {
    _spImpRows = []; _spImpHeaders = []; _spImpColMap = {};
    document.getElementById('spare-imp-file').value = '';
    document.getElementById('spare-imp-col-wrap').classList.add('hidden');
    document.getElementById('spare-imp-preview').classList.add('hidden');
    document.getElementById('spare-imp-confirm-btn').classList.add('hidden');
    document.getElementById('spare-import-modal').classList.remove('hidden');
}
function spareCloseImport() { document.getElementById('spare-import-modal').classList.add('hidden'); }

function spImpReadFile(input) {
    const file = input.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = e => {
        const wb  = XLSX.read(new Uint8Array(e.target.result), { type:'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });
        if (raw.length < 2) { showToast('ไฟล์ว่างหรือไม่มีข้อมูล', 'error'); return; }
        _spImpHeaders = raw[0].map(String);
        _spImpRows    = raw.slice(1);
        spImpBuild();
    };
    reader.readAsArrayBuffer(file);
}

const SP_IMP_FIELDS = [
    { key:'partNo',   label:'Part No.' },
    { key:'name',     label:'ชื่ออะไหล่ *' },
    { key:'category', label:'หมวด' },
    { key:'location', label:'ที่จัดเก็บ' },
    { key:'note',     label:'หมายเหตุ' },
];
function spImpBuild() {
    const guess = key => {
        const patterns = { partNo:['part no','partno','รหัส'], name:['name','ชื่อ','อะไหล่'], category:['categ','หมวด'], location:['locat','location','จัดเก็บ','shelf'], note:['note','หมาย'] };
        const pats = patterns[key] || [];
        const idx = _spImpHeaders.findIndex(h => pats.some(p => String(h).toLowerCase().includes(p)));
        return idx >= 0 ? String(idx) : '';
    };
    const wrap = document.getElementById('spare-imp-col-selects');
    wrap.innerHTML = SP_IMP_FIELDS.map(f => {
        const opts = _spImpHeaders.map((h, i) => `<option value="${i}">${h || '(col ' + (i+1) + ')'}</option>`).join('');
        const sel  = guess(f.key);
        return `<div>
            <label class="text-xs text-gray-700 font-bold block mb-1">${f.label}</label>
            <select id="sp-imp-col-${f.key}" class="w-full border border-gray-200 rounded px-2 py-1 text-sm">
                <option value="">— ไม่เลือก —</option>${opts}
            </select>
        </div>`;
    }).join('');
    // auto-select guessed
    SP_IMP_FIELDS.forEach(f => {
        const g = guess(f.key);
        if (g !== '') { const el = document.getElementById('sp-imp-col-' + f.key); if (el) el.value = g; }
    });
    document.getElementById('spare-imp-col-wrap').classList.remove('hidden');
    spImpPreview();
    document.getElementById('spare-imp-confirm-btn').classList.remove('hidden');
}

function spImpPreview() {
    const sample = _spImpRows.slice(0, 5);
    const cols   = SP_IMP_FIELDS.map(f => {
        const el = document.getElementById('sp-imp-col-' + f.key);
        return { label: f.label, idx: el && el.value !== '' ? Number(el.value) : -1 };
    });
    const tbl = document.getElementById('spare-imp-preview-table');
    tbl.innerHTML = `<thead><tr>${cols.map(c => `<th class="border border-gray-200 px-2 py-1 bg-gray-50">${c.label}</th>`).join('')}</tr></thead>
        <tbody>${sample.map(row => `<tr>${cols.map(c => `<td class="border border-gray-200 px-2 py-1">${c.idx >= 0 ? (row[c.idx]||'') : ''}</td>`).join('')}</tr>`).join('')}</tbody>`;
    document.getElementById('spare-imp-preview').classList.remove('hidden');
}

async function spImpConfirm() {
    if (!currentUser || !can('spare.edit')) { showToast('ไม่มีสิทธิ์', 'error'); return; }
    const nameIdx   = Number((document.getElementById('sp-imp-col-name')   ||{}).value ?? -1);
    const partNoIdx = Number((document.getElementById('sp-imp-col-partNo') ||{}).value ?? -1);
    if (nameIdx < 0) { showToast('กรุณาเลือก column ชื่ออะไหล่', 'error'); return; }

    const getCol = (row, idx) => idx >= 0 ? String(row[idx] || '').trim() : '';
    const items = _spImpRows
        .map(row => ({
            partNo:   getCol(row, partNoIdx),
            name:     getCol(row, nameIdx),
            category: getCol(row, Number((document.getElementById('sp-imp-col-category') ||{}).value ?? -1)),
            location: getCol(row, Number((document.getElementById('sp-imp-col-location') ||{}).value ?? -1)),
            note:     getCol(row, Number((document.getElementById('sp-imp-col-note')     ||{}).value ?? -1)),
        }))
        .filter(it => it.name);

    if (!items.length) { showToast('ไม่พบข้อมูลที่จะนำเข้า', 'error'); return; }
    try {
        showToast('กำลังนำเข้า ' + items.length + ' รายการ...', 'info');
        const r = await fetch(GAS_URL, { method:'POST', body: JSON.stringify({
            action: 'spareBulkImport', username: currentUser.username, pin: currentUser.pin, items
        })});
        const j = await r.json();
        if (j.success) {
            showToast('นำเข้าสำเร็จ ' + j.count + ' รายการ ✅', 'success');
            spareCloseImport();
            await spareLoad();
            loadSpareCache();
        } else { showToast('เกิดข้อผิดพลาด: ' + (j.error||''), 'error'); }
    } catch(e) { showToast('เชื่อมต่อ GAS ไม่ได้', 'error'); }
}

// ---- hook switchTab เพื่อโหลดข้อมูลเมื่อเปิด panel ----
document.addEventListener('DOMContentLoaded', () => {
    const _baseSwitchTab = window.switchTab;
    window.switchTab = function(tab) {
        _baseSwitchTab(tab);
        if (tab === 'spare') spareLoad();
    };
});
