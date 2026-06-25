# CLAUDE.md — MMS (CPRAM Chonburi)

Machine Management System — เว็บแอปจัดการเครื่องจักร โรงงาน CPRAM ชลบุรี
3 ระบบ: **Breakdown report** · **Daily/PM Checklist** · **ทะเบียนเครื่องจักร**

## สถาปัตยกรรม
- **`index.html`** — โครง HTML + CSS (`<style>`) ทั้งหมด แล้วโหลด `js/` 9 ไฟล์ท้าย `<body>`
- **`js/` 9 ไฟล์** — JavaScript ทั้งหมด เป็น **classic `<script src>` ไม่ใช่ ES module**
- **`gas_code.gs`** — backend = Google Apps Script Web App (แอปยิง `fetch(GAS_URL)` ตรง ไม่มี server กลาง)
- ไม่มี build step / test framework — verify ด้วย `node --check` + preview (`localhost:3456`)
- CDN ใน `<head>`: Tailwind, Chart.js, html2canvas, jspdf, qrcode, xlsx

## ⛔ กฎเหล็ก (ห้ามพลาด)

### 1. Push ขึ้น `mms` เท่านั้น
- work repo = `mms` = `cool17333/mms-cpram-chb` → **`git push mms main` เสมอ**
- ถ้ามี remote `origin` = `breakdown-report` → **frozen v1 ห้ามแตะ ห้าม push เด็ดขาด**
- **ห้าม `git push` เปล่าๆ** (เครื่องต้นฉบับ track `origin` ผิด จะยิงผิด repo) — ระบุ `mms main` เสมอ
- clone ใหม่: `git remote rename origin mms` เพื่อให้คำสั่งเหมือนกันทุกเครื่อง

### 2. `node --check` ก่อน commit ทุกครั้งที่แก้ `js/`
```bash
node --check js/<ไฟล์ที่แก้>.js
```
- SyntaxError จุดเดียว = ไฟล์นั้นทั้งไฟล์ไม่ถูก execute → ฟังก์ชันหาย ปุ่มกดไม่ได้ ("แอปค้าง")
- เสี่ยงสุดหลังแก้ template literal / rewrite ฟังก์ชัน
- (หลังแยกไฟล์แล้ว พังแค่ไฟล์เดียว ไม่ลามทั้งแอป — แต่ยังต้องเช็ค)

### 3. ห้ามเปลี่ยน `js/` เป็น ES module
- มี inline `onclick=` ~246 จุด → ฟังก์ชันต้องเป็น **global**
- ลำดับ `<script src>` ต้อง = ลำดับเดิม (`core` → … → `checklist-status`) ห้ามสลับ

### 4. แก้ `gas_code.gs` = ต้อง redeploy
- แก้แล้วต้อง **redeploy GAS Web App** ไม่งั้น client เห็นโค้ดเก่า
- อาการ "แก้แล้วหาย / refresh แล้วกลับเป็นเดิม" มักเป็น GAS ยังไม่ redeploy ไม่ใช่บั๊ก client

## โครงสร้าง `js/` (แก้ feature ไหน → ไปไฟล์นั้น)
| ไฟล์ | feature |
|------|---------|
| `core.js` | GAS config, role/login |
| `machines.js` | ทะเบียนเครื่องจักร + import Excel |
| `breakdown-report.js` | BD tracking, page nav, รับงาน, report popup, log |
| `breakdown-form.js` | ฟอร์มแจ้ง BD, why-why, รูป, downtime, edit |
| `records-summary.js` | records + summary |
| `export.js` | PDF/PNG export engine |
| `bootstrap.js` | INIT (DOMContentLoaded) |
| `checklist-core.js` | checklist หลัก (form/list/calendar/PM/schedule) |
| `checklist-status.js` | status page, QR kiosk, copy modal |

> หลายคนแก้พร้อมกัน → แยก feature คนละไฟล์ ลด merge conflict (เหตุผลที่แยกไฟล์)

## โฟลเดอร์ `เอกสาร/`
เอกสาร / ข้อมูล / UI อ้างอิง — **ไม่ใช่โปรแกรม**. gitignore ทั้งหมด **ยกเว้น `plan/`** (แผนงาน PLAN-*.md)
- ⚠️ `เอกสาร/data/useracc.xlsx`, `เอกสาร/note/Deployment ID.txt` = **sensitive ห้าม commit** (repo เป็น public)

## Workflow ประจำวัน
```bash
git pull mms main                 # ก่อนเริ่มเสมอ — ดึงงานล่าสุด
# ...แก้โค้ด + node --check js/<ไฟล์>.js...
git add -A
git commit -m "..."
git push mms main
```

## Preview
`npx serve -p 3456 .` (config: `.claude/launch.json`) → เปิด `http://localhost:3456`

## การสื่อสาร / convention
- ตอบเป็น **ภาษาไทย**
- convention ทีม: ใช้ **Opus วางแผน/review**, สลับ **Sonnet ตอนแก้โค้ดจริง**
