# SPEC — ระบบ User Access (CMMS)

> Design spec จาก brainstorming (อนุมัติ 2026-06-25). ใช้คู่กับ implementation plan ที่ writing-plans จะสร้างต่อ (`PLAN-v2.6-user-access.md`).

**Goal:** เปลี่ยนจากระบบ 3 roles + รหัสรวมต่อ role → ระบบ **user รายคน 6 levels × 29 สิทธิ์** มีหน้าจัดการผู้ใช้ + audit log โดยบังคับสิทธิ์ทั้ง frontend และ GAS

**ชื่อโปรแกรม:** เปลี่ยน **MMS → CMMS (Computerized Maintenance Management System)** (repo `mms-cpram-chb` คงเดิม เปลี่ยนแค่ชื่อที่แสดง)

---

## Decisions (locked)

| # | เรื่อง | ตัดสิน |
|---|------|--------|
| 1 | Auth model | **User รายคน** — username + PIN, กำหนด Level ให้แต่ละคน |
| 2 | PIN storage | **Hash** — SHA-256(salt + pin), salt สุ่มต่อ user (ไม่เก็บ plaintext) |
| 3 | Matrix storage | **Data-driven ใน Google Sheet** — Admin แก้ค่าใน sheet ได้ ไม่ต้อง deploy; ยังไม่ทำ in-app editor |
| 4 | Enforcement | **Frontend ซ่อน UI ทั้ง 29** + **GAS บังคับเฉพาะ op เขียน/ลบ/จัดการ user** |
| 5 | ชื่อโปรแกรม | MMS → **CMMS** |

---

## Roles & Permissions (matrix อ้างอิง Book1.xlsx)

6 levels (ไม่ login = **Visitor**): Visitor → Production → Technician → Engineer → Supervisor → Administrator

> ⚠️ **ไม่ใช่ลำดับขั้นตรงๆ** — Daily Checklist มีแค่ Production+Admin, PM มีแค่ Technician/Engineer/Admin → เก็บเป็น matrix จริง (role→เซ็ตสิทธิ์) ห้ามใช้ "level ≥ N"

| กลุ่ม | สิทธิ์ | Visitor | Production | Technician | Engineer | Supervisor | Admin |
|------|-------|:--:|:--:|:--:|:--:|:--:|:--:|
| **BD** | bd.view ดูสรุป · bd.export | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| | bd.report แจ้ง Breakdown | | ✓ | ✓ | ✓ | ✓ | ✓ |
| | bd.accept รับงาน · bd.editdoc แก้ไขเอกสาร | | | ✓ | ✓ | ✓ | ✓ |
| | bd.close ปิดงาน · bd.whywhy · bd.manual | | | | ✓ | ✓ | ✓ |
| | bd.cancel ยกเลิก | | | | | ✓ | ✓ |
| **เครื่อง** | mc.view ดูรายละเอียด | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| | mc.edit · mc.delete · mc.add · mc.import · mc.backup · mc.restore | | | | ✓ | ✓ | ✓ |
| **Checklist** | cl.view · cl.history · cl.status · cl.export | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| | cl.daily บันทึก Daily | | ✓ | | | | ✓ |
| | cl.pm บันทึก PM | | | ✓ | ✓ | | ✓ |
| | cl.edit แก้ไขรายละเอียด · cl.calendar ปฏิทิน PM | | | | ✓ | ✓ | ✓ |
| **User Access** | ua.add · ua.del · ua.level · ua.perm · ua.log | | | | | | ✓ |

**29 perm codes:**
```
BD(9):   bd.view bd.export bd.report bd.accept bd.editdoc bd.close bd.whywhy bd.manual bd.cancel
เครื่อง(7): mc.view mc.edit mc.delete mc.add mc.import mc.backup mc.restore
CL(8):   cl.view cl.history cl.status cl.export cl.daily cl.pm cl.edit cl.calendar
UA(5):   ua.add ua.del ua.level ua.perm ua.log
```

---

## Data model — 3 sheets ใหม่ใน GAS spreadsheet

**`Users`**
| คอลัมน์ | ชนิด | หมายเหตุ |
|--------|------|---------|
| id | string | uid สุ่ม |
| name | string | ชื่อแสดง |
| username | string | unique, ใช้ login |
| pin_hash | string | SHA-256 hex ของ `salt + pin` |
| salt | string | สุ่มต่อ user |
| level | string | 1 ใน 6 roles |
| active | bool | ปิดใช้งานได้โดยไม่ลบ |
| createdAt / createdBy | string | audit |

**`Permissions`** (long format ~174 แถว = 6 roles × 29)
| role | perm_code | allow |
|------|-----------|-------|
| Administrator | bd.cancel | 1 |
| Production | cl.daily | 1 |
| ... | ... | 0/1 |

**`AccessLog`**
| timestamp | username | action | detail |
|-----------|----------|--------|--------|
| ISO | somchai | bd.close | งาน #1234 |

---

## Architecture

### Login flow
1. ผู้ใช้กรอก `username + PIN` → `clFetch(action=login, user, pin)`
2. GAS: หา user ใน `Users` (active) → `SHA-256(salt+pin) === pin_hash` ? → คืน `{success, name, level, perms:[...]}` (perms = อ่านจาก `Permissions` ของ role นั้น)
3. Frontend เก็บ `currentUser{username, level, perms:Set}` (session เท่านั้น — reload = ออก, เหมือนเดิม)
4. ไม่ login = Visitor (perms ของ Visitor ดึงตอน init)

### Frontend permission engine — `js/permissions.js` (ไฟล์ใหม่)
- `currentUser = { username, name, level, perms: Set }`
- `can(code)` → `currentUser.perms.has(code)`
- `applyPermissions()` — แทน `applyRole()` เดิม: วน element ที่มี `data-perm="..."` แล้ว `hidden` ถ้า `!can()`; + toggle ปุ่ม/เมนูเฉพาะจุดที่ไม่ได้ใช้ data-perm
- ใส่ลำดับ `<script src>` ต่อจาก `core.js` (ต้องมาก่อนไฟล์ที่เรียก `can()`)

### GAS enforcement — `gas_code.gs`
- helper `userCan(user, pin, perm)` → ตรวจ login + role มี perm นั้นไหม
- ใส่ใน write/sensitive actions แทน/เสริม `ROLE_PW` เดิม: report, accept, close, cancel, editdoc, machine CRUD/import/backup/restore, checklist save/edit, user CRUD
- read actions (view/summary/status/export) **ไม่ต้องตรวจ** (ลด overhead)
- เขียน `AccessLog` ทุก write ที่สำเร็จ
- 🔴 แก้ GAS = **redeploy**

### User Management UI (Admin)
- หน้าใหม่ใน sidebar "จัดการผู้ใช้" (เห็นเฉพาะมี `ua.*`)
- ตาราง users + badge Level + เพิ่ม/แก้ไข/ลบ (modal) + toggle active
- ปุ่ม "ดู Log" → อ่าน `AccessLog`
- endpoints: `getUsers / addUser / updateUser / deleteUser / setLevel / getAccessLog`

---

## Security
- **PIN hash**: เก็บ `SHA-256(salt+pin)` + salt ต่อ user → sheet หลุดก็ไม่เห็น PIN ตรงๆ. GAS ใช้ `Utilities.computeDigest(SHA_256, salt+pin)`
- ⚠️ PIN 4 หลัก = อ่อนต่อ brute-force → future hardening: ล็อกหลังผิด N ครั้ง / PIN ยาวขึ้น (เก็บไว้ P4)
- **GAS enforce** ปิดช่อง bypass (ยิง GAS ตรงไม่ผ่าน UI)
- ✅ ของเดิม `ROLE_PW` อยู่ใน `gas_code.gs` ที่เป็น **public repo = รหัสหลุด** → ระบบใหม่ย้ายไป `Users` sheet (private) = ดีขึ้น; ลบ `ROLE_PW` ออกหลัง migrate เสร็จ

---

## Phasing (5 เฟส — แต่ละเฟสใช้งานได้จริง)

| เฟส | งาน | redeploy GAS |
|----|-----|:---:|
| **P0** GAS foundation | สร้าง 3 sheets + seed matrix(Book1) + seed users + `login(user,pin)` + `userCan` + `getUsers/getPermissions` | ✅ |
| **P1** Frontend engine + rename | `js/permissions.js` (`can`/`applyPermissions`) + login UI ใหม่ (user+PIN) + ใส่ `data-perm` 29 จุด + **rename MMS→CMMS** (header/title/sidebar) | |
| **P2** GAS enforcement | ใส่ `userCan` ใน write actions + เขียน `AccessLog` | ✅ |
| **P3** User Mgmt UI | หน้าจัดการผู้ใช้ (CRUD + Level) + Log viewer | ✅ (endpoints) |
| **P4** (ภายหลัง) | in-app permission editor ("ตั้งค่า Permission") + PIN lockout/ยาวขึ้น | |

> **Rename MMS→CMMS** รวมใน P1 (frontend แตะ header/sidebar อยู่แล้ว) — หรือแยกเป็น quick PR ก่อนก็ได้

---

## Out of scope (รอบนี้)
- In-app permission matrix editor (เลื่อนไป P4 — รอบนี้แก้ใน Google Sheet)
- PIN reset self-service (รอบแรกให้ Admin reset ผ่านหน้า User Mgmt)
- เปลี่ยนชื่อ repo (`mms-cpram-chb` คงเดิม)

---

## Self-review
- ครบทุก decision (auth/PIN/matrix/enforce/rename) ✓
- 29 perm codes map ครบ 4 กลุ่ม ✓
- matrix ตรง Book1.xlsx (Daily=Prod+Admin, PM=Tech+Eng+Admin, cancel=Super+Admin, UA=Admin) ✓
- ทุกเฟสมี GAS redeploy gate ระบุชัด ✓
- ไม่มี placeholder/TBD ✓
