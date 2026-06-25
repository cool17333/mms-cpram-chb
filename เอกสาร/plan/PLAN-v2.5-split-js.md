# แยก index.html JS → ไฟล์ .js ตาม feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** แตก `<script>` ก้อนเดียว (5,219 บรรทัด) ใน `index.html` ออกเป็น 9 ไฟล์ `.js` ตาม feature เพื่อให้หลายคนแก้คนละ feature ได้โดยไม่ merge conflict กัน — **โดยพฤติกรรมแอปเหมือนเดิม 100%**

**Architecture:** ตัด `<script>` body เป็น 9 slice แบบ contiguous (เรียงตามลำดับเดิมเป๊ะ) ที่ขอบเขต `// ====` section divider, เซฟเป็นไฟล์ใน `js/`, แล้วแทน `<script>` เดิมด้วย `<script src>` 9 แท็กเรียงตามลำดับเดิม. ใช้ **classic script (ไม่ใช่ ES module)** เพราะมี inline `onclick=` 246 จุดที่ต้องการให้ฟังก์ชันเป็น global. เพราะลำดับโหลด = ลำดับ source เดิม → top-level execution order เหมือนเดิมทุกประการ → behavior เหมือนเดิม

**Tech Stack:** HTML + vanilla JS (global functions), classic `<script src>`, ไม่มี build step, ไม่มี test framework — verify ด้วย `node --check` + byte-identical diff + preview runtime smoke test

**ข้อจำกัด/กติกาที่ต้องรู้ก่อนเริ่ม:**
- ❌ **ห้ามใช้ `type="module"`** — inline `onclick=` 246 จุดเรียกฟังก์ชันแบบ global, module scope จะทำให้พังทั้งหมด
- ✅ **ลำดับ `<script src>` ต้องตรงกับลำดับ source เดิม** (core → ... → checklist-status) — ห้ามสลับ เพราะ top-level `const`/`let` บางตัว init ทันทีตอนโหลด
- ✅ push ขึ้น remote `mms` เท่านั้น (ไม่ยุ่ง `breakdown-report`)
- ✅ ไม่แตะ `gas_code.gs` — ไม่ต้อง redeploy GAS
- ⚠️ บทเรียนจาก [[freeze-equals-syntax-error]]: syntax error จุดเดียว = แอปค้างทั้งตัว → ทุกไฟล์ต้องผ่าน `node --check` ก่อน commit

---

## File Structure

ทุกไฟล์ใหม่อยู่ใน `js/` (สร้างใหม่). ขอบเขตอ้างอิงเลขบรรทัดของ `index.html` **เวอร์ชันปัจจุบัน (commit 7576ff3)**. ทุกจุดตัดอยู่บนบรรทัด `// ====` divider ที่เปิด section ใหม่ = ตัดระหว่างฟังก์ชันเสมอ.

| # | ไฟล์ | บรรทัด (index.html เดิม) | เนื้อหา (section) | ~บรรทัด |
|---|------|------------------------|-------------------|--------|
| 1 | `js/core.js` | 2647–2752 | SETTINGS (GAS URL), ROLES/LOGIN | 106 |
| 2 | `js/machines.js` | 2753–3201 | MACHINE REGISTRY + IMPORT | 449 |
| 3 | `js/breakdown-report.js` | 3202–3940 | TRACKING, PAGE NAV*, รับงาน, REPORT POPUP, LOG VIEWER | 739 |
| 4 | `js/breakdown-form.js` | 3941–4938 | HUB stats, TOAST, FACTORY/AREA combo, STATUS, DOWNTIME, WHY-WHY, DEVICE, PARTS, PHOTOS, GALLERY, COLLECT, ADD-DATA CONFIRM, EDIT MODE | 998 |
| 5 | `js/records-summary.js` | 4939–5252 | RECORDS, SUMMARY | 314 |
| 6 | `js/export.js` | 5253–5882 | PDF PICKER, EXPORT ENGINE, AUTO-RESIZE | 630 |
| 7 | `js/bootstrap.js` | 5883–5929 | INIT (DOMContentLoaded) | 47 |
| 8 | `js/checklist-core.js` | 5930–7196 | CHECKLIST: helpers, hub, dashboards, home dash, kiosk, form, list, detail, summary, calendar, schedule | 1267 |
| 9 | `js/checklist-status.js` | 7197–7865 | CHECKLIST STATUS page, PM-tree editor, BD-QR, daily-QR, copy modal | 669 |

รวม 5,219 บรรทัด = body เดิม (2647–7865) เป๊ะ.

> *PAGE NAV (`switchTab`, `goHome`, `goBdHub`…) เป็น infra ที่ใช้ร่วม แต่ตำแหน่ง source อยู่ในช่วง breakdown-report.js — ยอมรับได้เพราะแทบไม่มีใครแก้, และเป้าหมายคือแยก hot area (Breakdown vs Checklist) ออกจากกัน ซึ่งทำได้แล้ว. การจัดระเบียบละเอียดกว่านี้เก็บไว้ทำรอบหลังได้.*

**`index.html` หลังแก้:** บรรทัด 8–13 (CDN: Tailwind/Chart.js/html2canvas/jspdf/qrcode/xlsx) คงเดิมใน `<head>`. แทนบล็อก `<script>…</script>` (เดิม 2646–7866) ด้วย 9 `<script src>` แท็กเรียงตาม #1→#9.

---

## Task 1: เตรียม — snapshot ต้นฉบับ + สร้างโฟลเดอร์

**Files:**
- Create: `js/` (โฟลเดอร์)
- Snapshot: `/tmp/index-original.html` (สำเนา pristine ไว้ verify)

- [ ] **Step 1: ยืนยัน working tree ของ index.html สะอาด (committed)**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && git status --short index.html
```
Expected: ไม่มี output (index.html committed แล้วที่ 7576ff3, ไม่มี local change)

- [ ] **Step 2: snapshot ต้นฉบับไว้เทียบทีหลัง**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && cp index.html /tmp/index-original.html && wc -l /tmp/index-original.html
```
Expected: `7868 /tmp/index-original.html`

- [ ] **Step 3: สร้างโฟลเดอร์ js/**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && mkdir -p js && ls -d js
```
Expected: `js`

---

## Task 2: extract ทั้ง 9 ไฟล์จาก index.html ต้นฉบับ

**Files:** Create ทั้ง 9 ไฟล์ใน `js/`

> หมายเหตุ: ทุก `sed` อ่านจาก `index.html` ที่**ยังไม่ถูกแก้** (รื้อ `<script>` block ทีหลังใน Task 5) → ทุก range อ้างอิงเลขบรรทัดเดิมเสมอ ไม่มีปัญหา line shift.

- [ ] **Step 1: extract core.js**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && sed -n '2647,2752p' index.html > js/core.js
```

- [ ] **Step 2: extract machines.js**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && sed -n '2753,3201p' index.html > js/machines.js
```

- [ ] **Step 3: extract breakdown-report.js**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && sed -n '3202,3940p' index.html > js/breakdown-report.js
```

- [ ] **Step 4: extract breakdown-form.js**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && sed -n '3941,4938p' index.html > js/breakdown-form.js
```

- [ ] **Step 5: extract records-summary.js**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && sed -n '4939,5252p' index.html > js/records-summary.js
```

- [ ] **Step 6: extract export.js**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && sed -n '5253,5882p' index.html > js/export.js
```

- [ ] **Step 7: extract bootstrap.js**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && sed -n '5883,5929p' index.html > js/bootstrap.js
```

- [ ] **Step 8: extract checklist-core.js**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && sed -n '5930,7196p' index.html > js/checklist-core.js
```

- [ ] **Step 9: extract checklist-status.js**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && sed -n '7197,7865p' index.html > js/checklist-status.js
```

---

## Task 3: ตรวจ syntax ทุกไฟล์ (node --check)

**Files:** ทั้ง 9 ไฟล์ใน `js/`

> ⚠️ จุดสำคัญที่สุด — ถ้าไฟล์ไหนถูกตัดกลางฟังก์ชัน/วงเล็บไม่ครบ จะ fail ตรงนี้ (กันอาการ [[freeze-equals-syntax-error]]).
> หมายเหตุ: แต่ละไฟล์เป็น "ชิ้นส่วน" — ฟังก์ชันที่เรียก global จากไฟล์อื่นจะ **ไม่** error ตอน `node --check` เพราะ `--check` แค่ parse ไม่ได้ resolve reference. ดังนั้นไฟล์ที่ผ่าน = วงเล็บ/ไวยากรณ์ครบในตัวเอง (ซึ่งคือสิ่งที่ต้องการพิสูจน์).

- [ ] **Step 1: รัน node --check ทุกไฟล์รวด**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && for f in js/core.js js/machines.js js/breakdown-report.js js/breakdown-form.js js/records-summary.js js/export.js js/bootstrap.js js/checklist-core.js js/checklist-status.js; do node --check "$f" && echo "OK: $f" || echo "FAIL: $f"; done
```
Expected: 9 บรรทัด `OK: js/…` ทั้งหมด, ไม่มี `FAIL` และไม่มี SyntaxError

ถ้ามี `FAIL` ที่ไฟล์ใด: แปลว่าจุดตัด (range ใน Task 2) ตกกลางฟังก์ชัน — เลื่อนขอบเขตให้ตรง `// ====` divider ที่ใกล้ที่สุด (ตัดระหว่างฟังก์ชัน) แล้ว extract ไฟล์นั้น + ไฟล์ติดกันใหม่ ให้ range ยังต่อกันสนิท แล้วรัน Step 1 ซ้ำ

---

## Task 4: พิสูจน์ความครบถ้วน — concat แล้ว diff กับต้นฉบับ (byte-identical)

**Files:** ทั้ง 9 ไฟล์ + `/tmp/index-original.html`

> นี่คือ "safety anchor" — ถ้า concat ของ 9 ไฟล์ (เรียงตามลำดับโหลด) == body เดิมเป๊ะทุก byte → พิสูจน์ได้ว่า **ไม่มีบรรทัดหาย/ซ้ำ/สลับ** เลย. รวมกับ Task 3 (syntax ผ่าน) = โค้ดที่รวมกลับ identical กับของเดิมที่ทำงานได้อยู่แล้ว.

- [ ] **Step 1: concat 9 ไฟล์ตามลำดับโหลด → /tmp/recombined.js**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && cat js/core.js js/machines.js js/breakdown-report.js js/breakdown-form.js js/records-summary.js js/export.js js/bootstrap.js js/checklist-core.js js/checklist-status.js > /tmp/recombined.js && wc -l /tmp/recombined.js
```
Expected: `5219 /tmp/recombined.js`

- [ ] **Step 2: ดึง body เดิม (2647–7865) จาก snapshot → /tmp/original-body.js**

Run:
```bash
sed -n '2647,7865p' /tmp/index-original.html > /tmp/original-body.js && wc -l /tmp/original-body.js
```
Expected: `5219 /tmp/original-body.js`

- [ ] **Step 3: diff — ต้องว่างเปล่า (เหมือนกันทุก byte)**

Run:
```bash
diff /tmp/original-body.js /tmp/recombined.js && echo "IDENTICAL ✅"
```
Expected: `IDENTICAL ✅` (diff ไม่มี output = เหมือนกันทุกบรรทัด)

ถ้า diff มี output: range ใน Task 2 ไม่ tile กันสนิท (มี gap/overlap) — ดูเลขบรรทัดที่ diff ชี้ แล้วแก้ range ให้ต่อกันเป๊ะ (ไฟล์ N จบที่บรรทัดก่อนหน้าไฟล์ N+1 เริ่ม) แล้ว extract + รัน Task 4 ซ้ำ

---

## Task 5: รื้อ `<script>` block เดิม → ใส่ 9 `<script src>` แท็ก

**Files:**
- Modify: `index.html` (แทนบล็อก `<script>…</script>` เดิม บรรทัด 2646–7866)

- [ ] **Step 1: แทนบล็อก `<script>` ทั้งก้อนด้วย script-src 9 แท็ก**

ใช้ Edit tool: `old_string` = บรรทัด 2646 `<script>` ถึง 2650 (ต้นบล็อก เลือกพอให้ unique), แต่เนื่องจากบล็อกยาวมาก ให้ทำเป็น 2 ส่วน:

(ก) ลบเนื้อ script: หาบรรทัดเปิด `<script>` (2646) — แทนทั้งช่วงจนถึง `</script>` (7866) ด้วยข้อความด้านล่าง. เพราะ Edit ต้อง match ทั้งก้อน ให้ใช้คำสั่ง sed แทน (เชื่อถือได้กับไฟล์ใหญ่):

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && { sed -n '1,2645p' index.html; cat <<'EOF'
<script src="js/core.js"></script>
<script src="js/machines.js"></script>
<script src="js/breakdown-report.js"></script>
<script src="js/breakdown-form.js"></script>
<script src="js/records-summary.js"></script>
<script src="js/export.js"></script>
<script src="js/bootstrap.js"></script>
<script src="js/checklist-core.js"></script>
<script src="js/checklist-status.js"></script>
EOF
sed -n '7867,$p' index.html; } > /tmp/index-new.html && mv /tmp/index-new.html index.html && echo "REWIRED"
```
Expected: `REWIRED`

(บรรทัด 1–2645 = `<head>` + HTML ทั้งหมดก่อน script, แทรก 9 แท็ก, แล้วต่อด้วย 7867–จบ = `</body></html>`)

- [ ] **Step 2: ยืนยันโครงสร้าง index.html ใหม่**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && grep -nE "<script" index.html | grep "js/" && echo "---" && grep -c "<script>" index.html
```
Expected: เห็น 9 บรรทัด `<script src="js/…">` และ `grep -c "<script>"` = `0` (ไม่มี inline `<script>` เปล่าหลงเหลือ)

---

## Task 6: verify runtime จริงใน preview

**Files:** ไม่แก้ — แค่รัน/ตรวจ

> เป้า: พิสูจน์ว่าหลังแยกไฟล์แล้ว ฟังก์ชันยัง global, GAS ยังยิง, dashboard ยัง render (อาการตรงข้ามกับ [[freeze-equals-syntax-error]]).

- [ ] **Step 1: เริ่ม preview server (ถ้ายังไม่รัน)**

ใช้ preview_start ชื่อ `Timebase Condition` (config มีอยู่แล้วใน `.claude/launch.json`, serve ที่ port 3456)

- [ ] **Step 2: reload แล้วเช็คว่าฟังก์ชันถูกประกาศครบ**

ใช้ preview_eval:
```js
(function(){ location.reload(); return 'reloading'; })()
```
รอ ~3 วิ แล้ว preview_eval:
```js
({
  switchTab: typeof window.switchTab,
  loadMachines: typeof window.loadMachines,
  buildPptSlide: typeof window.buildPptSlide,
  enterBdKiosk: typeof window.enterBdKiosk,
  saveClCopy: typeof window.saveClCopy
})
```
Expected: ทุกค่าเป็น `"function"` (ถ้ามี `"undefined"` = ไฟล์ใดไฟล์หนึ่งโหลดไม่ได้/พัง → ดู console + network 404)

- [ ] **Step 3: เช็ค console error + 404 ของไฟล์ js**

ใช้ preview_console_logs (level: error) → Expected: ไม่มี error
ใช้ preview_network (filter: failed) → Expected: ไม่มี `js/*.js` ที่ 404 (ถ้า 404 = path ผิด/ไฟล์ไม่อยู่ใน js/)

- [ ] **Step 4: เช็ค GAS ยิง + dashboard มีข้อมูล**

ใช้ preview_eval:
```js
({
  hubMachines: document.getElementById('hub-count-machines')?.textContent,
  f1total: document.getElementById('dash-f1-total')?.textContent,
  homeF1daily: document.getElementById('home-f1-daily')?.innerHTML?.slice(0,40)
})
```
Expected: `hubMachines` เป็นตัวเลข (เช่น "476") ไม่ใช่ "—", `f1total` เป็นตัวเลข, `homeF1daily` ไม่ใช่ "กำลังโหลด..." ค้าง

- [ ] **Step 5: screenshot ยืนยันหน้า home render ครบ**

ใช้ preview_screenshot → Expected: เห็น dashboard Factory 1/2 มี donut + ตัวเลข เหมือนก่อนแยกไฟล์

---

## Task 7: commit + push ขึ้น mms

**Files:** `index.html` + `js/*.js` ใหม่ทั้ง 9

- [ ] **Step 1: stage + commit**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && git add index.html js/ && git commit -m "refactor: แยก <script> เดียว (5219 บรรทัด) → js/ 9 ไฟล์ตาม feature

- core / machines / breakdown-report / breakdown-form / records-summary
  / export / bootstrap / checklist-core / checklist-status
- classic <script src> เรียงตามลำดับเดิม (ไม่ใช่ module — มี inline onclick 246 จุด)
- verify: node --check ผ่านทุกไฟล์ + concat byte-identical กับ body เดิม + preview runtime smoke ผ่าน
- พฤติกรรมเหมือนเดิม 100% (ไม่แตะ logic, ไม่แตะ gas_code.gs)"
```

- [ ] **Step 2: push ขึ้น mms (remote ที่ถูกต้อง)**

Run:
```bash
cd "C:/Work/CPRam/Project/Timebase Condition" && git push mms main
```
Expected: push สำเร็จขึ้น `mms-cpram-chb`

---

## หลังจากนี้ (นอก scope แต่ควรรู้)

- **แก้ feature ไหน → ไปไฟล์นั้น** เช่น แก้ Checklist → `js/checklist-core.js` / `js/checklist-status.js`; แก้ Export → `js/export.js`. ลด conflict ตามเป้า
- **ยังต้อง `node --check js/<ไฟล์>.js` ก่อน commit ทุกครั้ง** ([[freeze-equals-syntax-error]]) — แต่ตอนนี้พังแค่ไฟล์เดียวไม่ลามทั้งแอป (ไฟล์อื่นยังโหลดได้)
- **CSS ยังอยู่ใน `<style>` ใน index.html** (บรรทัด 14–201) — ไม่แตะรอบนี้ (styling แทบไม่ conflict). ถ้าจะแยกภายหลัง → `css/styles.css` + `<link rel="stylesheet">`
- ถ้าทำงานพร้อมกันจริง → แต่ละคนแตก branch (`feature/xxx`) แล้ว merge; ตอนนี้ conflict จะเหลือเฉพาะถ้าแก้ไฟล์เดียวกันจริงๆ

---

## Self-Review (ผู้เขียนแผนตรวจเอง)

**1. Spec coverage:** เป้าหมาย "แยกไฟล์ตาม feature เพื่อลด conflict" → Task 2 สร้าง 9 ไฟล์ตาม feature ✓. "behavior เหมือนเดิม" → Task 4 (byte-identical) + Task 6 (runtime) ✓. "ไม่ยุ่ง breakdown-report/gas" → Task 7 push mms, ไม่แตะ gas_code.gs ✓.

**2. Placeholder scan:** ทุก step มีคำสั่งจริง + expected output จริง, ไม่มี TBD/TODO ✓.

**3. Range tiling consistency:** 2647–2752 | 2753–3201 | 3202–3940 | 3941–4938 | 4939–5252 | 5253–5882 | 5883–5929 | 5930–7196 | 7197–7865 — ต่อกันสนิท ไม่มี gap/overlap, รวม = 5219 = body เดิม (2647–7865) ✓. ทุกจุดเริ่มตรง `// ====` divider (จาก grep: 2753, 3202, 3941, 4939, 5253, 5883, 5930, 7197) ✓. ลำดับ `<script src>` (Task 5) = ลำดับ concat (Task 4) = ลำดับ source ✓.
