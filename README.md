# MMS — CPRAM Chonburi

Machine Management System — เว็บแอปจัดการเครื่องจักร โรงงาน CPRAM ชลบุรี

🔗 **Production:** https://cool17333.github.io/mms-cpram-chb/

## 3 ระบบ
- **Breakdown report** — แจ้ง / ติดตามเครื่องเสีย + report PDF
- **Daily / PM Checklist** — ตรวจเครื่องประจำวัน + QR kiosk
- **ทะเบียนเครื่องจักร** — ข้อมูลเครื่องทั้งหมด + import Excel

## โครงสร้าง
| ไฟล์ | หน้าที่ |
|------|--------|
| `index.html` | HTML + CSS ทั้งหมด |
| `js/` | JavaScript 9 ไฟล์ตาม feature (classic `<script src>`) |
| `gas_code.gs` | backend = Google Apps Script Web App |

> กฎ dev / workflow (branch → PR → main) ดูที่ [CLAUDE.md](CLAUDE.md)

## รัน local
```bash
npx serve -p 3456 .
# เปิด http://localhost:3456
```
