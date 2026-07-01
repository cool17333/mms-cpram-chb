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
            // แสดง/ซ่อน ratio row + content row ตาม format
            const isPng = card.dataset.fmt === 'ppt';
            const ratioRow = document.getElementById('png-ratio-row');
            if (ratioRow) ratioRow.classList.toggle('hidden', !isPng);
            const contentRow = document.getElementById('png-content-row');
            if (contentRow) contentRow.classList.toggle('hidden', !isPng);
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
const EXPORT_VER = 'v2.10';

// แปลงวันเวลาทุก format → "dd-MM-yyyy HH:mm น." สำหรับ export (PNG header + PDF timeline)
function fmtExportDateTime(v) {
    if (!v) return '—';
    v = String(v);
    let m = v.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);   // ISO
    if (m) return `${m[3]}-${m[2]}-${m[1]} ${m[4]}:${m[5]} น.`;
    m = v.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);       // log dd/MM/yyyy
    if (m) return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]} น.`;
    return v;
}

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
async function _captureNode(node, capW, onMeasure, capH) {
    const shiftEm = await _measureH2cShift();   // วัดก่อนแตะ DOM (cache ครั้งเดียวต่อ session)
    const parent      = node.parentNode;
    const placeholder = document.createComment('cap-ph');
    parent.insertBefore(placeholder, node);

    const prevStyle = node.getAttribute('style') || '';
    const prevClass = node.className;
    node.classList.remove('overflow-hidden');
    node.classList.add('capture-fix');
    node.style.cssText = `width:${capW}px;max-width:${capW}px;margin:0;border-radius:0;box-shadow:none;display:block`
        + (capH ? `;height:${capH}px;overflow:hidden` : '');   // PNG slide: คืน height ที่ถูก strip → เนื้อหายืดเต็ม ไม่เหลือขาว

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
        const fullH = capH || wrapper.scrollHeight;   // capH ล็อกความสูงตายตัว (PNG slide)
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
    const rootTag = isLeaf ? `<span style="font-size:9px;background:#dc2626;color:#fff;border-radius:4px;padding:0 6px 6px;margin-left:6px;display:inline-flex;align-items:center;line-height:1;vertical-align:middle">Root Cause</span>` : '';
    const connector = depth > 0 ? `<div style="width:12px;height:1px;background:#cbd5e1;margin-top:10px;flex-shrink:0"></div>` : '';
    const children  = (node.children || []).map((ch, j) => _buildWhyNodeHtml(ch, `${label}.${j+1}`, depth+1)).join('');
    return `<div style="margin-left:${indent}px;margin-bottom:5px">
        <div style="display:flex;align-items:flex-start;gap:5px">
            ${connector}
            <div style="flex:1">
                <div style="background:${bg};border:1px solid ${border};border-radius:7px;padding:6px 12px;display:flex;align-items:center;gap:8px">
                    <span style="font-size:11px;font-weight:700;color:#94a3b8;flex-shrink:0">WHY ${label}</span>
                    <span style="font-size:14px;color:${txtCol};font-weight:${isLeaf?700:500}">${text.replace(/</g,'&lt;')}${rootTag}</span>
                </div>
                ${children}
            </div>
        </div>
    </div>`;
}

// สร้าง HTML รูปหลักใหญ่ + thumbnails สำหรับ PNG slide
function _pptImgWithThumbs(arr, label, labelBg, labelColor) {
    if (!arr || !arr.length) return `<div style="background:#f3f4f6;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:13px;height:100%">ไม่มีรูป</div>`;
    const main = arr[0].data || arr[0];
    const thumbs = arr.slice(1);
    return `<div style="display:flex;flex-direction:column;gap:4px;height:100%">
        <div style="background:${labelBg};color:${labelColor};font-size:11px;font-weight:700;border-radius:5px;padding:0 10px 12px;text-align:center;flex-shrink:0;display:flex;align-items:center;justify-content:center;line-height:1">${label}</div>
        <div style="flex:1;min-height:0;border-radius:8px;overflow:hidden;background:#ffffff;border:1px solid #f1f5f9;display:flex;align-items:center;justify-content:center">
            <img src="${main}" style="max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain">
        </div>
        ${thumbs.length ? `<div style="display:flex;gap:4px;flex-shrink:0;overflow:hidden">
            ${thumbs.slice(0,4).map(it => `<div style="width:36px;height:28px;border-radius:4px;overflow:hidden;border:1px solid #e5e7eb;flex-shrink:0"><img src="${it.data||it}" style="width:100%;height:100%;object-fit:cover"></div>`).join('')}
            ${thumbs.length > 4 ? `<div style="width:36px;height:28px;border-radius:4px;background:#e5e7eb;display:flex;align-items:center;justify-content:center;font-size:9px;color:#6b7280;flex-shrink:0">+${thumbs.length-4}</div>` : ''}
        </div>` : ''}
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
        'ดำเนินการเสร็จสิ้น':      { bg:'#dcfce7', c:'#16a34a', lbl:'✅ ปิดงานสำเร็จ' },
        'กำลังดำเนินการแก้ไข':     { bg:'#fef3c7', c:'#d97706', lbl:'🔧 กำลังแก้ไข' },   // legacy — merge เข้ากับ รับงานแล้ว
        'รออะไหล่':                 { bg:'#ede9fe', c:'#7c3aed', lbl:'⏳ รออะไหล่' },
        'รอรับงาน':                 { bg:'#fee2e2', c:'#dc2626', lbl:'🚨 แจ้งปัญหาเครื่องจักร' },
        'รับงานแล้ว':               { bg:'#dbeafe', c:'#2563eb', lbl:'📋 กำลังแก้ไข' },
        'ซ่อมสำเร็จ':               { bg:'#ccfbf1', c:'#0f766e', lbl:'🔨 ซ่อมสำเร็จ' },
    };
    const ss = STATUS_STYLE[d.status] || { bg:'#f1f5f9', c:'#64748b', lbl: statusLabel(d.status) || '—' };
    const whyNodes = whyTree.map((n, i) => _buildWhyNodeHtml(n, String(i+1), 0)).filter(Boolean);
    const whyHtml = whyNodes.join('') || '';
    const hasWhy = whyNodes.length > 0;

    // parts table (ยุบถ้าไม่มีข้อมูล)
    const hasParts = d.parts && d.parts.some(p => p.name);
    const partsHtml = hasParts ? `
        <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px 14px;flex-shrink:0;box-shadow:0 1px 3px rgba(0,0,0,.04)">
            <div style="font-size:13px;font-weight:800;color:#7c3aed;margin-bottom:8px">🔩 อะไหล่ที่ใช้</div>
            <table style="width:100%;border-collapse:collapse;font-size:12px">
                <thead><tr style="background:#f1f5f9">
                    <th style="text-align:left;padding:4px 8px;color:#64748b">ชื่ออะไหล่</th>
                    <th style="text-align:center;padding:4px 8px;color:#64748b">Part No.</th>
                    <th style="text-align:center;padding:4px 8px;color:#64748b">จำนวน</th>
                    <th style="text-align:left;padding:4px 8px;color:#64748b">หมายเหตุ</th>
                </tr></thead>
                <tbody>${d.parts.filter(p=>p.name).map(p=>`<tr style="border-top:1px solid #f1f5f9">
                    <td style="padding:4px 8px;font-weight:600;color:#1e293b">${(p.name||'').replace(/</g,'&lt;')}</td>
                    <td style="padding:4px 8px;text-align:center;color:#64748b">${(p.partNo||'—').replace(/</g,'&lt;')}</td>
                    <td style="padding:4px 8px;text-align:center;font-weight:700;color:#1e293b">${p.qty||'—'} ${p.unit||''}</td>
                    <td style="padding:4px 8px;color:#64748b">${(p.remark||'').replace(/</g,'&lt;')}</td>
                </tr>`).join('')}</tbody>
            </table>
        </div>` : '';

    slide.innerHTML = `
    <div style="height:100%;display:flex;flex-direction:column;background:#f1f5f9;box-sizing:border-box;overflow:hidden;font-family:'Prompt',sans-serif">

      <!-- HEADER -->
      <div style="background:linear-gradient(135deg,#1e3a5f 0%,#2563eb 100%);padding:14px 24px;flex-shrink:0">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:14px">
          <div style="flex:1;min-width:0">
            <div style="font-size:10px;color:#93c5fd;font-weight:700;letter-spacing:2px;margin-bottom:3px">${d.eventType === 'Adjustment' ? '🔧 ADJUSTMENT REPORT • MACHINE • CPRAM CHB' : '🔴 BREAKDOWN REPORT • MACHINE • CPRAM CHB'}</div>
            <div style="font-size:24px;font-weight:800;color:#fff;line-height:1.25;margin-bottom:5px;word-break:break-word">${(d.machineName||'—').replace(/</g,'&lt;')}</div>
            <div style="display:flex;gap:12px;font-size:10px;color:#93c5fd;flex-wrap:wrap">
              <span>🔢 Tracking: <strong style="color:#fff">${d.tracking||'—'}</strong></span>
              <span>📍 พื้นที่: <strong style="color:#fff">${(d.area||'—')} (${d.factory||'—'})</strong></span>
              <span>⚙️ Machine ID: <strong style="color:#fff">${d.machineId||'—'}</strong></span>
              <span>🕐 เริ่ม: <strong style="color:#fff">${fmtExportDateTime(d.bdStart)}</strong></span>
              <span>🏁 เสร็จ: <strong style="color:#fff">${fmtExportDateTime(d.bdEnd)}</strong></span>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0">
            <div style="background:${ss.bg};color:${ss.c};border-radius:20px;padding:0 12px 8px;font-size:11px;font-weight:700;display:inline-flex;align-items:center;line-height:1">${ss.lbl}</div>
            ${d.downtimeMin ? `<div style="background:#fef2f2;color:#dc2626;border-radius:20px;padding:0 10px 6px;font-size:10px;font-weight:700;display:inline-flex;align-items:center;line-height:1">⚠️ Downtime: ${dtStr}${over24 ? ' ⚠️เกิน 24 ชม.' : ''}</div>` : ''}
          </div>
        </div>
      </div>

      <!-- BODY: บน = ข้อมูล+มาตรการ+อะไหล่ / รูปภาพ (สูงตามเนื้อหาจริง) — ล่าง = Why-Why (ดูดพื้นที่ที่เหลือ กันเปล่าเปลือง) -->
      <div style="flex:1;display:flex;flex-direction:column;gap:10px;padding:10px 14px;min-height:0;overflow:hidden">

        <!-- TOP: ${hasWhy ? 'สูงตามเนื้อหา (ไม่มี Why-Why ดูดที่เหลือ)' : 'ไม่มี Why-Why → เต็มพื้นที่'} -->
        <div style="${hasWhy ? 'flex-shrink:0;' : 'flex:1;min-height:0;'}display:grid;grid-template-columns:1.1fr 0.9fr;gap:10px;overflow:hidden">

          <!-- TOP-LEFT: ข้อมูล + มาตรการ + อะไหล่ (แต่ละการ์ดสูงตามเนื้อหาของตัวเอง) -->
          <div style="display:flex;flex-direction:column;gap:10px;overflow:hidden">

            <!-- Card: ข้อมูลปัญหา -->
            <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
              <div style="font-size:13px;font-weight:800;color:#d97706;margin-bottom:8px">ℹ️ ข้อมูลปัญหาและตำแหน่ง</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
                <div>
                  <div style="font-size:10px;color:#94a3b8;font-weight:600;margin-bottom:2px">ตำแหน่ง / สาย (LINE)</div>
                  <div style="font-size:15px;font-weight:700;color:#1e293b">${(d.line||'—').replace(/</g,'&lt;')}</div>
                </div>
                <div>
                  <div style="font-size:10px;color:#94a3b8;font-weight:600;margin-bottom:2px">ประเภท BREAKDOWN</div>
                  <div style="font-size:15px;font-weight:700;color:#1e293b">${(d.bdType||'—').replace(/</g,'&lt;')}</div>
                </div>
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;justify-content:center">
                  <div style="font-size:11px;font-weight:700;color:#dc2626;margin-bottom:4px">🔴 ปัญหาที่พบ (PROBLEM)</div>
                  <div style="font-size:14px;color:#dc2626;font-weight:600;white-space:pre-wrap;line-height:1.4">${(d.problem||'—').replace(/</g,'&lt;')}</div>
                </div>
                <div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;justify-content:center">
                  <div style="font-size:11px;font-weight:700;color:#d97706;margin-bottom:4px">⚙️ อุปกรณ์ที่เกิดปัญหา</div>
                  <div style="font-size:14px;color:#92400e;font-weight:600;white-space:pre-wrap;line-height:1.4">${(d.device||'—').replace(/</g,'&lt;')}</div>
                </div>
              </div>
            </div>

            <!-- Card: มาตรการ -->
            <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px 14px;box-shadow:0 1px 3px rgba(0,0,0,.04)">
              <div style="font-size:13px;font-weight:800;color:#374151;margin-bottom:8px">📋 แผนมาตรการแก้ไขและป้องกัน</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                <div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;justify-content:center">
                  <div style="font-size:11px;font-weight:700;color:#ea580c;margin-bottom:4px">🔧 มาตรการแก้ไข (Corrective)</div>
                  <div style="font-size:14px;color:#431407;white-space:pre-wrap;line-height:1.4">${(d.corrective||'—').replace(/</g,'&lt;')}</div>
                </div>
                <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:10px 12px;display:flex;flex-direction:column;justify-content:center">
                  <div style="font-size:11px;font-weight:700;color:#16a34a;margin-bottom:4px">🛡️ มาตรการป้องกัน (Preventive)</div>
                  <div style="font-size:14px;color:#14532d;white-space:pre-wrap;line-height:1.4">${(d.preventive||'—').replace(/</g,'&lt;')}</div>
                </div>
              </div>
            </div>

            ${partsHtml}
          </div>

          <!-- TOP-RIGHT: รูปภาพ — ยืดเต็มความสูงแถว (grid stretch อัตโนมัติ เท่ากับความสูง TOP-LEFT) -->
          <div style="display:flex;flex-direction:column;gap:8px;overflow:hidden">
            <div style="background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px 14px;flex:1;min-height:0;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(0,0,0,.04)">
              <div style="font-size:13px;font-weight:800;color:#2563eb;margin-bottom:8px;flex-shrink:0">📷 รูปภาพสภาพอุปกรณ์ ก่อน-หลัง ดำเนินการ</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:1;min-height:0">
                <div style="min-height:0">${_pptImgWithThumbs(imgList.before,'ก่อนแก้ไข','#fee2e2','#dc2626')}</div>
                <div style="min-height:0">${_pptImgWithThumbs(imgList.after,'หลังแก้ไข','#dcfce7','#16a34a')}</div>
              </div>
            </div>
          </div>

        </div>

        ${hasWhy ? `<!-- BOTTOM: Why-Why ดูดพื้นที่ที่เหลือทั้งหมด (ไม่บังคับสัดส่วนตายตัว) -->
        <div style="flex:1;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:12px 14px;min-height:0;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 1px 3px rgba(0,0,0,.04)">
          <div style="font-size:13px;font-weight:800;color:#1e3a5f;margin-bottom:8px;flex-shrink:0">🌿 การวิเคราะห์แบบรากต้นไม้ (Why-Why Tree Analysis)</div>
          <div style="flex:1;min-height:0;overflow:hidden">${whyHtml}</div>
        </div>` : ''}

      </div>
    </div>`;
}

// F9: แปลง log row → ชื่อเหตุการณ์ภาษาไทย
// GAS เก็บ action เป็น Thai string ยาว (เช่น 'แจ้ง Breakdown (สร้างใหม่)', 'รับงาน — ชื่อคน')
function timelineLabel(row) {
    const raw = String(row.action || '');
    const a   = raw.toLowerCase();
    const s   = row.status || '';
    if (a === 'submit'        || raw.startsWith('แจ้ง'))        return '📝 แจ้ง Breakdown';
    if (a === 'accept'        || raw.startsWith('รับงาน'))       return '📋 รับงาน';
    if (a === 'repaircomplete'|| raw.startsWith('ซ่อมสำเร็จ'))  return '🔨 ซ่อมเสร็จสิ้น';
    if (a === 'update')                                           return '🔄 อัปเดต';
    if (a === 'close')                                            return '✅ ยืนยันปิดงาน';
    if (raw.startsWith('แก้ไข'))
        return s === 'ดำเนินการเสร็จสิ้น' ? '✅ ยืนยันปิดงาน' : '✏️ แก้ไขเอกสาร';
    if (raw.startsWith('ยกเลิก'))                                return '❌ ยกเลิกงาน';
    if (raw.startsWith('ลบ'))                                    return '🗑️ ลบเอกสาร';
    return raw.split(/\s*[—→|([—–]/)[0].trim() || '—';
}

async function exportPDF(fmt = 'portrait') {
    if (typeof html2canvas === 'undefined') { alert('ไม่พบไลบรารี html2canvas'); return; }
    try { await _imgLoadPromise; } catch (_) {}   // รอรูปจาก Drive โหลดเสร็จก่อน

    const btn    = document.getElementById('btn-export');
    const loader = document.getElementById('loading-text');
    const name   = document.getElementById('machine-name')?.value?.trim() || 'Breakdown';
    const isPNG  = (fmt === 'ppt');
    // F5: filename = evt_tracking
    const d0  = collectFormData();
    const evt = (d0.eventType === 'Adjustment') ? 'ADJ' : 'BD';
    const trk = (typeof currentTracking !== 'undefined' && currentTracking) || d0.tracking || name;
    const base = `${evt}_${trk}`;
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
            const cv = await _captureNode(slide, pW, null, pH);   // F7: lock height
            slide.style.left = '-99999px';
            _download(cv.toDataURL('image/png'), `${base}.png`);   // F5
            // F6: export gallery only when user selected "ทั้งหมด"
            const pngContent = document.querySelector('input[name="png-content"]:checked')?.value || 'report';
            if (pngContent === 'all' && withGallery) {
                buildGallery('png');
                const gal = document.getElementById('photo-gallery');
                gal.style.display = 'block';
                const galCanvas = await _captureNode(gal, CAP_W);
                gal.style.display = 'none';
                await new Promise(r => setTimeout(r, 300));
                _download(galCanvas.toDataURL('image/png'), `${base}_รูปภาพ.png`);   // F5
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

            // วาง canvas โดยใช้ cursor เดียวกับ gallery: เต็มความกว้าง วางต่อถ้าพื้นที่พอ
            const placeCanvas = (cv) => {
                const renderH = availW * cv.height / cv.width;
                const img = cv.toDataURL('image/jpeg', 0.85);
                if (renderH > availH) {                        // สูงเกิน 1 หน้า → ย่อพอดีหน้าเดี่ยว
                    if (cursorY !== null) pdf.addPage('a4', 'portrait');
                    const dH = availH, dW = dH * cv.width / cv.height;
                    pdf.addImage(img, 'JPEG', (pageW - dW) / 2, M, dW, dH);
                    cursorY = botY;
                    return;
                }
                if (cursorY === null) {                        // หน้าแรก
                    cursorY = M;
                } else if (cursorY + GAP + renderH > botY) {  // ที่ไม่พอ → หน้าใหม่
                    pdf.addPage('a4', 'portrait');
                    cursorY = M;
                } else {
                    cursorY += GAP;
                }
                pdf.addImage(img, 'JPEG', M, cursorY, availW, renderH);
                cursorY += renderH;
            };

            placeCanvas(mainCanvas);

            // F9: Timeline page — fetch log แล้ว render ตาราง
            if (trk && typeof GAS_URL !== 'undefined') {
                try {
                    const logResp = await fetch(`${GAS_URL}?action=getLog&tracking=${encodeURIComponent(trk)}`);
                    const logJson = await logResp.json().catch(() => ({}));
                    const logs = Array.isArray(logJson.data) ? [...logJson.data].reverse() : [];
                    if (logs.length) {
                        const tlWrap = document.createElement('div');
                        tlWrap.style.cssText = `width:${CAP_W}px;background:#ffffff;padding:24px 32px;box-sizing:border-box;font-family:'Prompt',sans-serif`;
                        const esc = s => String(s || '').replace(/</g, '&lt;');
                        tlWrap.innerHTML = `
                            <div style="font-size:16px;font-weight:800;color:#1e3a5f;margin-bottom:16px">📋 Timeline — ${esc(d0.machineName)} (${esc(trk)})</div>
                            <table style="width:100%;border-collapse:collapse;font-size:12px">
                                <thead><tr style="background:#f1f5f9">
                                    <th style="text-align:left;padding:8px 10px;color:#64748b;font-weight:700;border-bottom:2px solid #e2e8f0">เหตุการณ์</th>
                                    <th style="text-align:left;padding:8px 10px;color:#64748b;font-weight:700;border-bottom:2px solid #e2e8f0">ชื่อผู้ดำเนินการ</th>
                                    <th style="text-align:left;padding:8px 10px;color:#64748b;font-weight:700;border-bottom:2px solid #e2e8f0">เวลา</th>
                                    <th style="text-align:left;padding:8px 10px;color:#64748b;font-weight:700;border-bottom:2px solid #e2e8f0">หมายเหตุ</th>
                                </tr></thead>
                                <tbody>${logs.map((row, i) => `<tr style="background:${i % 2 === 0 ? '#ffffff' : '#f8fafc'};border-bottom:1px solid #f1f5f9">
                                    <td style="padding:7px 10px;font-weight:600;color:#1e293b">${esc(timelineLabel(row))}</td>
                                    <td style="padding:7px 10px;color:#64748b">${esc(row.byName || row.by || row.user || '')}</td>
                                    <td style="padding:7px 10px;color:#374151;white-space:nowrap">${esc(fmtExportDateTime(row.timestamp || row.time || ''))}</td>
                                    <td style="padding:7px 10px;color:#64748b">${esc(row.note || row.remark || '')}</td>
                                </tr>`).join('')}</tbody>
                            </table>`;
                        document.body.appendChild(tlWrap);
                        const tlCanvas = await _captureNode(tlWrap, CAP_W);
                        tlWrap.remove();
                        placeCanvas(tlCanvas);
                    }
                } catch (_) { /* skip timeline if fetch fails */ }
            }

            if (withGallery) {
                buildGallery('pdf');
                const gal = document.getElementById('photo-gallery');
                gal.style.display = 'block';
                for (const sec of gal.querySelectorAll('.gal-sec')) await addSection(sec);
                gal.style.display = 'none';
            }

            _download(pdf.output('datauristring'), `${base}.pdf`);   // F5
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

