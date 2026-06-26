// ============================================================
// PDF PICKER + EXPORT
// ============================================================
let _pdfPickerForRow = null; // ใช้เมื่อ export จาก records tab

function _setExportBtnLabel(fmt) {
    const lbl = document.getElementById('btn-do-export-label');
    if (lbl) lbl.textContent = (fmt === 'ppt') ? 'Export PNG' : 'Export PDF';
}

// Aspect ratio dimensions for PNG export
const PPT_RATIO_DIMS = {
    '16:9': [1600, 900],
    '4:3':  [1600, 1200],
    'a4l':  [1600, Math.round(1600 * 210 / 297)],   // ≈ 1131
};
function _getSelectedRatio() {
    const v = document.querySelector('input[name="png-ratio"]:checked')?.value || '16:9';
    return PPT_RATIO_DIMS[v] || PPT_RATIO_DIMS['16:9'];
}
function _updateRatioOpts() {
    document.querySelectorAll('.ratio-opt').forEach(lbl => {
        const radio = lbl.querySelector('input');
        const inner = lbl.querySelector('.ratio-opt-inner');
        const sel   = radio.checked;
        inner.classList.toggle('border-orange-500', sel);
        inner.classList.toggle('bg-orange-50',      sel);
        inner.classList.toggle('border-gray-200',   !sel);
    });
}

function showPDFPicker(itemForRow) {
    _pdfPickerForRow = itemForRow || null;
    // reset → default portrait (PDF)
    document.querySelectorAll('.pdf-fmt-card').forEach(card => {
        const val = card.dataset.fmt;
        const inner = card.querySelector('.pdf-card-inner');
        inner.classList.toggle('border-orange-500', val === 'portrait');
        inner.classList.toggle('border-gray-200',   val !== 'portrait');
        inner.classList.toggle('bg-orange-50',      val === 'portrait');
        card.querySelector('input').checked = (val === 'portrait');
    });
    // reset ratio → 16:9, hide ratio row (เริ่มต้นเลือก PDF)
    const ratioRow = document.getElementById('png-ratio-row');
    if (ratioRow) ratioRow.classList.add('hidden');
    const def = document.querySelector('input[name="png-ratio"][value="16:9"]');
    if (def) { def.checked = true; _updateRatioOpts(); }
    _setExportBtnLabel('portrait');
    document.getElementById('pdf-picker-modal').classList.remove('hidden');
}

function closePDFPicker() {
    document.getElementById('pdf-picker-modal').classList.add('hidden');
    _pdfPickerForRow = null;
}

function initPDFCards() {
    document.querySelectorAll('.pdf-fmt-card').forEach(card => {
        card.addEventListener('click', () => {
            document.querySelectorAll('.pdf-fmt-card').forEach(c => {
                const inner = c.querySelector('.pdf-card-inner');
                inner.classList.remove('border-orange-500', 'bg-orange-50');
                inner.classList.add('border-gray-200');
                c.querySelector('input').checked = false;
            });
            const inner = card.querySelector('.pdf-card-inner');
            inner.classList.add('border-orange-500', 'bg-orange-50');
            inner.classList.remove('border-gray-200');
            card.querySelector('input').checked = true;
            _setExportBtnLabel(card.dataset.fmt);
            // แสดง/ซ่อน ratio row ตาม format
            const ratioRow = document.getElementById('png-ratio-row');
            if (ratioRow) ratioRow.classList.toggle('hidden', card.dataset.fmt !== 'ppt');
        });
    });
    // ratio opt click handler
    document.querySelectorAll('.ratio-opt').forEach(lbl => {
        lbl.addEventListener('click', () => {
            document.querySelectorAll('input[name="png-ratio"]').forEach(r => r.checked = false);
            lbl.querySelector('input').checked = true;
            _updateRatioOpts();
        });
    });
}

function showExportOverlay() { document.getElementById('export-overlay').classList.remove('hidden'); }
function hideExportOverlay() { document.getElementById('export-overlay').classList.add('hidden'); }

async function doExportPDF() {
    const rowItem = _pdfPickerForRow;   // บันทึกก่อน closePDFPicker จะ null ทิ้ง
    closePDFPicker();
    const fmt = document.querySelector('input[name="pdf-fmt"]:checked')?.value || 'landscape';
    showExportOverlay();   // บังจอทันที — ผู้ใช้ไม่เห็นหน้าฟอร์มเด้งขึ้นมา
    try {
        if (rowItem) {
            openEditMode(rowItem, 'whyedit');   // สลับหน้า + เติมข้อมูล (อยู่ใต้ overlay)
            lockExceptWhy(false);               // ปลด disabled — background ไม่เทาใน PDF
            await new Promise(r => setTimeout(r, 800));   // รอรูป Drive + font โหลด
        }
        await exportPDF(fmt);
    } finally {
        if (rowItem) { cancelEdit(); switchTab('records'); }   // กลับหน้ารายการ (ใต้ overlay)
        hideExportOverlay();   // ค่อยเปิดเผย → เห็นหน้ารายการสะอาด ไม่มีหน้าฟอร์มแฟลช
    }
}

function exportRowPDF(item) {
    showPDFPicker(item);
}

function _download(href, filename) {
    const a = Object.assign(document.createElement('a'),
                { href, download: filename, style: 'display:none' });
    document.body.appendChild(a);
    a.click();
    setTimeout(() => a.remove(), 200);
}

// เวอร์ชันโค้ด export — โชว์มุมล่างขวาของไฟล์ + หน้าเว็บ ไว้เช็คปัญหา cache รุ่นเก่า
const EXPORT_VER = 'v2.9.1';

// html2canvas วาดข้อความฟอนต์ Prompt จมลง ~0.45em (ทุก span/ป้าย/ปุ่ม)
// → วัดค่าจริงบนเครื่องนี้ครั้งเดียวด้วย probe เล็กๆ แล้วใช้ชดเชยตอน capture จริง
let _h2cShiftEm;
async function _measureH2cShift() {
    if (_h2cShiftEm !== undefined) return _h2cShiftEm;
    try { if (document.fonts?.ready) await document.fonts.ready; } catch (_) {}
    const TXT = 'Hgjpq กฎูแฤ';
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:300px;height:40px;display:flex;' +
        'align-items:center;padding-left:20px;background:#ffffff;color:#000000;' +
        'font:500 20px Prompt,sans-serif;z-index:2147483646';
    probe.textContent = TXT;
    document.body.appendChild(probe);
    let cap;
    try { cap = await html2canvas(probe, { scale: 2, logging: false, backgroundColor: '#ffffff' }); }
    catch (_) { probe.remove(); return (_h2cShiftEm = 0); }
    probe.remove();
    const inkCenter = (cv) => {
        const px = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height);
        let t = -1, b = -1;
        for (let y = 0; y < cv.height; y++) {
            let d = 0;
            for (let x = 0; x < cv.width; x++) {
                const i = (y * cv.width + x) * 4;
                if (px.data[i] < 120 && px.data[i+1] < 120 && px.data[i+2] < 120) d++;
            }
            if (d > 1) { if (t < 0) t = y; b = y; }
        }
        return t < 0 ? null : (t + b) / 2;
    };
    // อ้างอิง: วาดสตริงเดียวกันเองด้วยสูตร strut (ตรงกับที่ browser แสดงบนจอ)
    const ref = document.createElement('canvas');
    ref.width = cap.width; ref.height = cap.height;
    const rx = ref.getContext('2d');
    rx.fillStyle = '#ffffff'; rx.fillRect(0, 0, ref.width, ref.height);
    rx.fillStyle = '#000000'; rx.font = '500 40px Prompt, sans-serif';
    const fm = rx.measureText(TXT);
    rx.textBaseline = 'alphabetic';
    rx.fillText(TXT, 40, ref.height / 2 + ((fm.fontBoundingBoxAscent ?? 30) - (fm.fontBoundingBoxDescent ?? 10)) / 2);
    const a = inkCenter(cap), b = inkCenter(ref);
    _h2cShiftEm = (a === null || b === null) ? 0 : (a - b) / 40;   // 40px = ขนาดฟอนต์ใน capture (scale 2)
    return _h2cShiftEm;
}

// ย้าย node ไป wrapper ที่ (0,0) → ตัด mx-auto/padding (ไม่ขาดซ้าย)
//   ซ่อน .no-export, foreignObjectRendering → ภาษาไทยไม่เพี้ยน
//   คืน canvas ของเนื้อหา node นั้น
async function _captureNode(node, capW, onMeasure) {
    const shiftEm = await _measureH2cShift();   // วัดก่อนแตะ DOM (cache ครั้งเดียวต่อ session)
    const parent      = node.parentNode;
    const placeholder = document.createComment('cap-ph');
    parent.insertBefore(placeholder, node);

    const prevStyle = node.getAttribute('style') || '';
    const prevClass = node.className;
    node.classList.remove('overflow-hidden');
    node.classList.add('capture-fix');
    node.style.cssText = `width:${capW}px;max-width:${capW}px;margin:0;border-radius:0;box-shadow:none;display:block`;

    // ซ่อน element ที่ไม่ต้องการใน export
    // ซ่อนปุ่มแก้ไข/เพิ่ม-ลบ ทั้งหมด (รวมทุก <button>) → รายงานสะอาด
    const hidden = [...node.querySelectorAll('.no-export, .no-print, button')].map(e => {
        const d = e.style.display; e.style.display = 'none'; return [e, d];
    });

    const wrapper = document.createElement('div');
    wrapper.style.cssText =
        `position:fixed;top:0;left:0;z-index:2147483646;background:#ffffff;width:${capW}px;padding:0;margin:0`;
    wrapper.appendChild(node);
    document.body.appendChild(wrapper);

    // html2canvas วาดข้อความใน input ตำแหน่งเพี้ยน (เลื่อนลง — ต่างกันตามเครื่อง/zoom/ฟอนต์)
    // → สลับเป็น <div> เปล่า (กรอบ+พื้นหลังเท่าตัวจริง) ให้ html2canvas วาดเฉพาะกล่อง
    //   แล้ววาดข้อความลง canvas เองทีหลังด้วย fillText → ตำแหน่งกึ่งกลางเป๊ะทุกเครื่อง
    const swapped  = [];
    const overlays = [];
    node.querySelectorAll('input:not([type=file]), textarea, select').forEach(el => {
        if (el.offsetWidth === 0 && el.offsetHeight === 0) return; // ซ่อนอยู่ — ข้าม
        const isSelect   = el.tagName === 'SELECT';
        const isTextarea = el.tagName === 'TEXTAREA';
        const val = isSelect ? (el.options[el.selectedIndex]?.text || '') : el.value;
        const cs  = getComputedStyle(el);
        const div = document.createElement('div');
        // ขนาดเท่า element จริงเป๊ะ → กรอบใน export ตรงกับ UI
        div.style.cssText =
            `box-sizing:border-box;width:${el.offsetWidth}px;` +
            (isTextarea ? `min-height:${el.offsetHeight}px;` : `height:${el.offsetHeight}px;`) +
            `padding:${cs.padding};border:${cs.borderWidth} ${cs.borderStyle} ${cs.borderColor};` +
            `border-radius:${cs.borderRadius};background:${cs.backgroundColor};`;
        el.parentNode.insertBefore(div, el);
        const prevDisp = el.style.display;
        el.style.display = 'none';
        swapped.push([el, div, prevDisp]);
        overlays.push({
            div, isTextarea,
            text:  val || el.placeholder || '',
            color: val ? cs.color : '#9ca3af',
            font:  `${cs.fontStyle} ${cs.fontWeight} ${parseFloat(cs.fontSize)}px ${cs.fontFamily}`,
            lineH: parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.5,
            align: cs.textAlign,
            padL: parseFloat(cs.paddingLeft), padR: parseFloat(cs.paddingRight),
            padT: parseFloat(cs.paddingTop),
        });
    });

    // วาดข้อความของช่องที่สลับไว้ ลงบน canvas โดยตรง (scale 2)
    const _drawFieldText = (canvas) => {
        const ctx = canvas.getContext('2d'), S = 2;
        overlays.forEach(o => {
            if (!o.text) return;
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0); // html2canvas ทิ้ง scale(2) ค้างไว้ใน context
            ctx.beginPath();
            ctx.rect(o.x * S, o.y * S, o.w * S, o.h * S);
            ctx.clip();
            ctx.fillStyle = o.color;
            ctx.font = o.font.replace(/(\d+(?:\.\d+)?)px/, (m, n) => (parseFloat(n) * S) + 'px');
            // จัดกึ่งกลางแนวตั้งแบบเดียวกับ browser เป๊ะ: วาง baseline ที่
            // center + (fontAscent - fontDescent)/2  (สูตร strut centering ของ CSS)
            const fm = ctx.measureText('Mg');
            const baseOff = ((fm.fontBoundingBoxAscent ?? 0) - (fm.fontBoundingBoxDescent ?? 0)) / 2;
            ctx.textBaseline = baseOff ? 'alphabetic' : 'middle';
            if (o.isTextarea) {
                // ตัดบรรทัดเอง (ไทยตัดกลางคำได้ / อังกฤษพยายามตัดที่ช่องว่าง)
                ctx.textAlign = 'left';
                const maxW = (o.w - o.padL - o.padR) * S;
                const lines = [];
                o.text.split('\n').forEach(par => {
                    let line = '';
                    for (const ch of par) {
                        if (line && ctx.measureText(line + ch).width > maxW) {
                            const sp = ch !== ' ' ? line.lastIndexOf(' ') : -1;
                            if (sp > 0) { lines.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }
                            else        { lines.push(line); line = ch === ' ' ? '' : ch; }
                        } else line += ch;
                    }
                    lines.push(line);
                });
                lines.forEach((ln, i) => ctx.fillText(ln,
                    (o.x + o.padL) * S,
                    (o.y + o.padT + o.lineH / 2 + i * o.lineH) * S + baseOff));
            } else {
                let tx;
                if (o.align === 'center')                      { ctx.textAlign = 'center'; tx = (o.x + o.w / 2) * S; }
                else if (o.align === 'right' || o.align === 'end') { ctx.textAlign = 'right';  tx = (o.x + o.w - o.padR) * S; }
                else                                           { ctx.textAlign = 'left';   tx = (o.x + o.padL) * S; }
                ctx.fillText(o.text, tx, (o.y + o.h / 2) * S + baseOff);
            }
            ctx.restore();
        });
        // ประทับเวอร์ชันมุมล่างขวา (จางๆ) — ไว้ตรวจว่าไฟล์มาจากโค้ดรุ่นไหน
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.font = '18px sans-serif'; ctx.fillStyle = '#c8c8c8';
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        ctx.fillText(EXPORT_VER, canvas.width - 8, canvas.height - 6);
        ctx.restore();
        return canvas;
    };

    try {
        // รอ layout settle — ใช้ setTimeout ควบคู่ เพราะ rAF ไม่ fire ถ้าแท็บถูกซ่อน
        await new Promise(r => {
            let done = false;
            const go = () => { if (!done) { done = true; r(); } };
            requestAnimationFrame(() => requestAnimationFrame(go));
            setTimeout(go, 250);
        });
        if (onMeasure) onMeasure(wrapper);   // วัด geometry ขณะ layout จริง
        // เก็บพิกัดกล่องข้อความ (เทียบ wrapper) ไว้วาดข้อความทับทีหลัง
        const wRect = wrapper.getBoundingClientRect();
        overlays.forEach(o => {
            const r = o.div.getBoundingClientRect();
            o.x = r.left - wRect.left; o.y = r.top - wRect.top;
            o.w = r.width;             o.h = r.height;
        });
        const fullH = wrapper.scrollHeight;
        // ชดเชยข้อความจม: patch fillText ยกขึ้น shiftEm เฉพาะช่วงที่ html2canvas วาด
        // (คืน patch ก่อน _drawFieldText — ข้อความช่องกรอกใช้พิกัดตรงอยู่แล้ว)
        const origFillText = CanvasRenderingContext2D.prototype.fillText;
        const needShift = Math.abs(shiftEm) > 0.04;
        if (needShift) {
            CanvasRenderingContext2D.prototype.fillText = function (t, x, y, ...rest) {
                const m = /(\d+(?:\.\d+)?)px/.exec(this.font);
                return origFillText.call(this, t, x, m ? y - shiftEm * parseFloat(m[1]) : y, ...rest);
            };
        }
        let canvas;
        try {
            // normal mode (foreignObjectRendering:false): ภาษาไทยถูกต้อง
            canvas = await html2canvas(wrapper, {
                scale: 2, useCORS: true, backgroundColor: '#ffffff',
                foreignObjectRendering: false, logging: false,
                width: capW, height: fullH, windowWidth: capW, windowHeight: fullH,
                scrollX: 0, scrollY: 0, x: 0, y: 0,
            });
        } finally {
            if (needShift) CanvasRenderingContext2D.prototype.fillText = origFillText;
        }
        return _drawFieldText(canvas);
    } finally {
        swapped.forEach(([el, div, d]) => { div.remove(); el.style.display = d; });
        parent.insertBefore(node, placeholder);
        placeholder.remove();
        wrapper.remove();
        node.className = prevClass;
        node.setAttribute('style', prevStyle);
        hidden.forEach(([e, d]) => { e.style.display = d; });
    }
}

// ===================================================================
// EXPORT ENGINE
//   portrait → PDF (หน้า 1 = ฟอร์ม, หน้า 2 = รูปภาพทั้งหมด ถ้ามีหลายรูป)
//   ppt      → PNG (ไฟล์หลัก + ไฟล์รูปภาพ ถ้ามีหลายรูป)
// ===================================================================
function _pptImg(arr) {
    const d = (arr && arr[0] && (arr[0].data || arr[0])) || '';
    return d ? `<img src="${d}" style="width:100%;height:100%;object-fit:contain;background:#f3f4f6;border-radius:8px">` : '<div style="width:100%;height:100%;background:#f3f4f6;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px">ไม่มีรูป</div>';
}
function _pptCell(label, val) {
    return `<div style="flex:1;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px">
        <div style="font-size:11px;color:#9ca3af">${label}</div>
        <div style="font-size:16px;font-weight:700;color:#1f2937">${val}</div></div>`;
}
function _pptBox(label, val) {
    return `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:10px 14px;overflow:hidden">
        <div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px">${label}</div>
        <div style="font-size:13px;color:#374151;white-space:pre-wrap;line-height:1.4">${(val||'—').replace(/</g,'&lt;')}</div></div>`;
}
function _buildWhyNodeHtml(node, label, depth) {
    const text = (node.text || '').trim();
    if (!text) return '';
    const isLeaf = !node.children || node.children.length === 0;
    const indent  = depth * 20;
    const bg      = isLeaf ? '#fef2f2' : depth === 0 ? '#eff6ff' : '#f8fafc';
    const border  = isLeaf ? '#fecaca' : depth === 0 ? '#bfdbfe' : '#e2e8f0';
    const txtCol  = isLeaf ? '#dc2626' : depth === 0 ? '#1e3a5f' : '#374151';
    const rootTag = isLeaf ? `<span style="font-size:9px;background:#dc2626;color:#fff;border-radius:4px;padding:1px 6px;margin-left:6px;vertical-align:middle">Root Cause</span>` : '';
    const connector = depth > 0 ? `<div style="width:12px;height:1px;background:#cbd5e1;margin-top:10px;flex-shrink:0"></div>` : '';
    const children  = (node.children || []).map((ch, j) => _buildWhyNodeHtml(ch, `${label}.${j+1}`, depth+1)).join('');
    return `<div style="margin-left:${indent}px;margin-bottom:5px">
        <div style="display:flex;align-items:flex-start;gap:5px">
            ${connector}
            <div style="flex:1">
                <div style="background:${bg};border:1px solid ${border};border-radius:7px;padding:5px 10px;display:flex;align-items:center;gap:8px">
                    <span style="font-size:10px;font-weight:700;color:#94a3b8;flex-shrink:0">WHY ${label}</span>
                    <span style="font-size:12px;color:${txtCol};font-weight:${isLeaf?700:500}">${text.replace(/</g,'&lt;')}${rootTag}</span>
                </div>
                ${children}
            </div>
        </div>
    </div>`;
}

function buildPptSlide(slideW = 1600, slideH = 900) {
    const slide = document.getElementById('ppt-slide');
    slide.style.width  = slideW + 'px';
    slide.style.height = slideH + 'px';
    const d = collectFormData();
    d.problem = [ _problemLocked, (document.getElementById('inp-problem-new')?.value||'').trim() ].filter(Boolean).join('\n');
    const h  = Math.floor(d.downtimeMin / 60), mn = d.downtimeMin % 60;
    const dtStr   = d.downtimeMin ? `${h} ชม. ${mn} นาที` : '—';
    const over24  = d.downtimeMin > 24 * 60;
    const STATUS_STYLE = {
        'ดำเนินการเสร็จสิ้น':      { bg:'#dcfce7', c:'#16a34a', lbl:'✅ ดำเนินการเสร็จสิ้น' },
        'กำลังดำเนินการแก้ไข':     { bg:'#fef3c7', c:'#d97706', lbl:'🔧 กำลังดำเนินการ' },
        'รออะไหล่':                 { bg:'#ede9fe', c:'#7c3aed', lbl:'⏳ รออะไหล่' },
        'รอรับงาน':                 { bg:'#fee2e2', c:'#dc2626', lbl:'🚨 รอรับงาน' },
        'รับงานแล้ว':               { bg:'#dbeafe', c:'#2563eb', lbl:'📋 รับงานแล้ว' },
    };
    const ss = STATUS_STYLE[d.status] || { bg:'#f1f5f9', c:'#64748b', lbl: d.status || '—' };
    const whyHtml = whyTree.map((n, i) => _buildWhyNodeHtml(n, String(i+1), 0)).join('') || '<span style="color:#94a3b8;font-size:12px">ยังไม่มีข้อมูล Why-Why</span>';

    slide.innerHTML = `
    <div style="height:100%;display:flex;flex-direction:column;background:#f1f5f9;box-sizing:border-box;overflow:hidden;font-family:'Prompt',sans-serif">

      <!-- HEADER -->
      <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:16px 28px;flex-shrink:0">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;color:#93c5fd;font-weight:700;letter-spacing:2px;margin-bottom:3px">${d.eventType === 'Adjustment' ? '🔧 ADJUSTMENT REPORT • MACHINE • CPRAM CHB' : '🔴 BREAKDOWN REPORT • MACHINE • CPRAM CHB'}</div>
            <div style="font-size:26px;font-weight:800;color:#fff;line-height:1.2;margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${(d.machineName||'—').replace(/</g,'&lt;')}</div>
            <div style="display:flex;gap:16px;font-size:11px;color:#93c5fd;flex-wrap:wrap">
              <span>🔢 Tracking ID: <strong style="color:#fff">${d.tracking||'—'}</strong></span>
              <span>📍 พื้นที่: <strong style="color:#fff">${(d.area||'—')} (${d.factory||'—'})</strong></span>
              <span>⚙️ Machine ID: <strong style="color:#fff">${d.machineId||'—'}</strong></span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;flex-shrink:0">
            <div style="background:${ss.bg};color:${ss.c};border-radius:20px;padding:5px 14px;font-size:12px;font-weight:700">${ss.lbl}</div>
            ${d.downtimeMin ? `<div style="background:#fef2f2;color:#dc2626;border-radius:20px;padding:4px 12px;font-size:11px;font-weight:700;display:flex;align-items:center;gap:6px">
              ⚠️ Downtime: ${dtStr}
              ${over24 ? `<span style="background:#dc2626;color:#fff;border-radius:8px;padding:1px 7px;font-size:9px">เกิน 24 ชม.</span>` : ''}
            </div>` : ''}
          </div>
        </div>
      </div>

      <!-- BODY -->
      <div style="flex:1;display:grid;grid-template-columns:1.1fr 0.9fr;gap:10px;padding:10px 14px;min-height:0;overflow:hidden">

        <!-- LEFT COL -->
        <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow:hidden">

          <!-- Card: ข้อมูลปัญหา -->
          <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px 14px;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,.04)">
            <div style="font-size:11px;font-weight:800;color:#d97706;margin-bottom:8px;letter-spacing:.3px">ℹ️ ข้อมูลปัญหาและตำแหน่ง</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px">
              <div>
                <div style="font-size:9px;color:#94a3b8;font-weight:600;margin-bottom:2px">ตำแหน่ง / สาย (LINE)</div>
                <div style="font-size:13px;font-weight:700;color:#1e293b">${(d.line||'—').replace(/</g,'&lt;')}</div>
              </div>
              <div>
                <div style="font-size:9px;color:#94a3b8;font-weight:600;margin-bottom:2px">ประเภท BREAKDOWN</div>
                <div style="font-size:13px;font-weight:700;color:#1e293b">${(d.bdType||'—').replace(/</g,'&lt;')}</div>
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px">
              <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:7px 10px">
                <div style="font-size:9px;color:#dc2626;font-weight:700;margin-bottom:2px">ปัญหาที่พบ (PROBLEM)</div>
                <div style="font-size:12px;color:#dc2626;font-weight:600;white-space:pre-wrap;line-height:1.4">${(d.problem||'—').replace(/</g,'&lt;')}</div>
              </div>
              <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:7px 10px">
                <div style="font-size:9px;color:#d97706;font-weight:700;margin-bottom:2px">อุปกรณ์ที่เกิดปัญหา</div>
                <div style="font-size:12px;color:#92400e;font-weight:600;white-space:pre-wrap;line-height:1.4">${(d.device||'—').replace(/</g,'&lt;')}</div>
              </div>
            </div>
          </div>

          <!-- Card: Why-Why -->
          <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px 14px;flex:1;min-height:0;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.04)">
            <div style="font-size:11px;font-weight:800;color:#1e3a5f;margin-bottom:8px">🌿 การวิเคราะห์แบบรากต้นไม้ (Why-Why Tree Analysis)</div>
            <div style="overflow:hidden">${whyHtml}</div>
          </div>
        </div>

        <!-- RIGHT COL -->
        <div style="display:flex;flex-direction:column;gap:10px;min-height:0;overflow:hidden">

          <!-- Card: รูปภาพ -->
          <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px 14px;flex:1;min-height:0;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(0,0,0,.04)">
            <div style="font-size:11px;font-weight:800;color:#2563eb;margin-bottom:8px;flex-shrink:0">📷 รูปภาพสภาพอุปกรณ์ ก่อน-หลัง ดำเนินการ</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;flex:1;min-height:0">
              <div style="display:flex;flex-direction:column;gap:4px;min-height:0">
                <div style="background:#fee2e2;color:#dc2626;font-size:9px;font-weight:700;border-radius:5px;padding:2px 8px;text-align:center;flex-shrink:0">ก่อนแก้ไข</div>
                <div style="flex:1;min-height:0">${_pptImg(imgList.before)}</div>
              </div>
              <div style="display:flex;flex-direction:column;gap:4px;min-height:0">
                <div style="background:#dcfce7;color:#16a34a;font-size:9px;font-weight:700;border-radius:5px;padding:2px 8px;text-align:center;flex-shrink:0">หลังแก้ไข</div>
                <div style="flex:1;min-height:0">${_pptImg(imgList.after)}</div>
              </div>
            </div>
          </div>

          <!-- Card: มาตรการ -->
          <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px 14px;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,.04)">
            <div style="font-size:11px;font-weight:800;color:#374151;margin-bottom:8px">📋 แผนมาตรการแก้ไขและป้องกัน</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
              <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:9px;padding:9px 11px">
                <div style="font-size:10px;font-weight:700;color:#ea580c;margin-bottom:4px">🔧 มาตรการแก้ไข (Corrective)</div>
                <div style="font-size:11px;color:#431407;white-space:pre-wrap;line-height:1.5">${(d.corrective||'—').replace(/</g,'&lt;')}</div>
              </div>
              <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:9px;padding:9px 11px">
                <div style="font-size:10px;font-weight:700;color:#16a34a;margin-bottom:4px">🛡️ มาตรการป้องกัน (Preventive)</div>
                <div style="font-size:11px;color:#14532d;white-space:pre-wrap;line-height:1.5">${(d.preventive||'—').replace(/</g,'&lt;')}</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>`;
}

async function exportPDF(fmt = 'portrait') {
    if (typeof html2canvas === 'undefined') { alert('ไม่พบไลบรารี html2canvas'); return; }
    try { await _imgLoadPromise; } catch (_) {}   // รอรูปจาก Drive โหลดเสร็จก่อน

    const btn    = document.getElementById('btn-export');
    const loader = document.getElementById('loading-text');
    const name   = document.getElementById('machine-name')?.value?.trim() || 'Breakdown';
    const isPNG  = (fmt === 'ppt');
    // capture ที่ความกว้างจริงของฟอร์มบนจอ → กรอบ/สัดส่วนใน export ตรงกับ UI เป๊ะ
    // (จอแคบ/มือถือ → fallback ความกว้าง desktop 1150 เพื่อให้รายงานคงรูปแบบเดิม)
    const liveW  = Math.round(document.getElementById('report-content').getBoundingClientRect().width);
    const CAP_W  = Math.max(1150, liveW);
    const withGallery = hasGalleryContent();

    btn.disabled = true; btn.classList.add('opacity-50');
    loader.classList.remove('hidden');
    window.scrollTo(0, 0);

    try { if (document.fonts?.ready) await document.fonts.ready; } catch (_) {}

    try {
        if (isPNG) {
            // ===== PNG — อัตราส่วนตามที่เลือก =====
            const [pW, pH] = _getSelectedRatio();
            buildPptSlide(pW, pH);
            const slide = document.getElementById('ppt-slide');
            slide.style.left = '0';
            const cv = await _captureNode(slide, pW);
            slide.style.left = '-99999px';
            _download(cv.toDataURL('image/png'), `BD_${name}.png`);
            if (withGallery) {
                buildGallery('png');
                const gal = document.getElementById('photo-gallery');
                gal.style.display = 'block';
                const galCanvas = await _captureNode(gal, CAP_W);
                gal.style.display = 'none';
                await new Promise(r => setTimeout(r, 300));
                _download(galCanvas.toDataURL('image/png'), `BD_${name}_รูปภาพ.png`);
            }
        } else {
            // ===== PDF — A4 มาตรฐาน =====
            const mainCanvas = await _captureNode(document.getElementById('report-content'), CAP_W);
            const { jsPDF } = window.jspdf;
            const M = 18;
            const pdf = new jsPDF({ unit:'pt', format:'a4', orientation:'portrait' });
            const pageW = pdf.internal.pageSize.getWidth();   // 595
            const pageH = pdf.internal.pageSize.getHeight();  // 842
            const availW = pageW - M * 2;
            const availH = pageH - M * 2;
            let firstPage = true;

            const addFitOnePage = (canvas) => {
                if (!firstPage) pdf.addPage('a4', 'portrait');
                firstPage = false;
                let dW = availW, dH = dW / (canvas.width / canvas.height);
                if (dH > availH) { dH = availH; dW = dH * (canvas.width / canvas.height); }
                pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', (pageW - dW) / 2, M, dW, dH);
            };

            const addSlice = (canvas, sy, sh, pxPerPt) => {
                if (!firstPage) pdf.addPage('a4', 'portrait');
                firstPage = false;
                const tmp = document.createElement('canvas');
                tmp.width = canvas.width; tmp.height = sh;
                tmp.getContext('2d').drawImage(canvas, 0, sy, canvas.width, sh, 0, 0, canvas.width, sh);
                pdf.addImage(tmp.toDataURL('image/jpeg', 0.85), 'JPEG', M, M, availW, sh / pxPerPt);
            };

            // gallery: ห่อ .gal-sec ใน holder เพื่อไม่ให้ _captureNode เขียนทับ inline style ของกรอบ
            const captureSection = async (sec) => {
                const holder = document.createElement('div');
                holder.style.background = '#ffffff';
                sec.parentNode.insertBefore(holder, sec);
                holder.appendChild(sec);
                const cv = await _captureNode(holder, CAP_W);
                holder.parentNode.insertBefore(sec, holder);
                holder.remove();
                return cv;
            };
            // เรียง section ต่อกันในหน้าเดียวถ้าพื้นที่เหลือพอ ถ้าไม่พอ → ขึ้นหน้าใหม่ (section ไม่ถูกหั่น)
            const GAP   = 16;
            const botY  = M + availH;
            let cursorY = null;   // null = ยังไม่เปิดหน้า gallery
            const placeSection = (cv) => {
                const renderH = availW * cv.height / cv.width;
                const img = cv.toDataURL('image/jpeg', 0.85);
                if (renderH > availH) {                             // สูงเกิน 1 หน้า → ย่อพอดีหน้าเดี่ยว
                    pdf.addPage('a4', 'portrait');
                    const dH = availH, dW = dH * cv.width / cv.height;
                    pdf.addImage(img, 'JPEG', (pageW - dW) / 2, M, dW, dH);
                    cursorY = botY;
                    return;
                }
                if (cursorY === null || cursorY + GAP + renderH > botY) {   // ที่ไม่พอ → หน้าใหม่
                    pdf.addPage('a4', 'portrait');
                    cursorY = M;
                } else {
                    cursorY += GAP;
                }
                pdf.addImage(img, 'JPEG', M, cursorY, availW, renderH);
                cursorY += renderH;
            };
            const addSection = async (sec) => placeSection(await captureSection(sec));

            addFitOnePage(mainCanvas);

            if (withGallery) {
                buildGallery('pdf');
                const gal = document.getElementById('photo-gallery');
                gal.style.display = 'block';
                for (const sec of gal.querySelectorAll('.gal-sec')) await addSection(sec);
                gal.style.display = 'none';
            }

            _download(pdf.output('datauristring'), `BD_${name}.pdf`);
        }
    } catch (err) {
        console.error('[exportPDF]', err);
        alert('เกิดข้อผิดพลาด: ' + (err?.message || String(err)));
    } finally {
        btn.disabled = false; btn.classList.remove('opacity-50');
        loader.classList.add('hidden');
    }
}

// ============================================================
// AUTO-RESIZE TEXTAREAS
// ============================================================
function initAutoResize() {
    document.querySelectorAll('.auto-resize').forEach(ta => {
        ta.addEventListener('input', function() { this.style.height='auto'; this.style.height=this.scrollHeight+'px'; });
    });
}

