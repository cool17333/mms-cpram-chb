# PLAN — OEE + Machine Ranking + MTTR/MTBF (Reliability Dashboard)

> **For executor:** ใช้ Sonnet execute ทีละ Phase. **มี GAS — ต้อง redeploy** (Phase A เพิ่ม sheet + 3 endpoints). `node --check js/oee.js` ก่อน commit. ⚠️ bump version ใช้ **Edit/sed ห้าม PowerShell Set-Content** ([[powershell-setcontent-breaks-utf8]]).

**Goal:** Dashboard วิเคราะห์ความน่าเชื่อถือเครื่องจักร — (1) **MTTR/MTBF** + (2) **Ranking** จัดอันดับเครื่อง (downtime/failures/MTBF) + (3) **OEE** โดยเริ่ม **Availability** จากข้อมูลที่มี วาง Performance/Quality เป็นโครงรอข้อมูลผลผลิต (เฟส 2)

**Architecture:** GAS เพิ่มชั้น aggregation (`getReliabilityMetrics`) อ่าน BD records ข้ามชีตรายเดือน → คำนวณ metric ต่อเครื่อง คืน JSON สรุป (ไม่ส่ง raw rows ทั้งก้อนมา client). Planned time เก็บ **per-machine** ใน sheet `_MachineConfig` (opt-in) → Availability/MTBF คำนวณ **เฉพาะเครื่องที่ตั้งค่า**. Frontend = ไฟล์ใหม่ `oee.js` + 1 panel (ไม่ยุ่ง feature เดิม ตามคอนเวนชันแยกไฟล์)

**Tech stack:** classic `<script src>` + Chart.js (โหลดอยู่แล้วใน `<head>`) + GAS

**Branch:** `feature/oee-ranking` (แตกจาก main)

---

## Decisions (ยืนยัน user 2026-06-27)

| ประเด็น | เลือก |
|---|---|
| ขอบเขต OEE | **เฟส** — Availability + MTTR/MTBF/Ranking ก่อน (ข้อมูลมี), Performance/Quality รอข้อมูลผลผลิต (Phase F future) |
| Planned time | **คีย์รายเครื่อง** (`_MachineConfig`) — คำนวณ Availability/MTBF เฉพาะเครื่องที่ตั้งค่า, เครื่องอื่นโชว์ MTTR/failures/downtime |
| ที่คำนวณ | **GAS aggregation** (ข้ามชีตรายเดือน) คืน JSON สรุป — foundation ที่ Ranking + OEE ใช้ร่วม |

---

## บริบทระบบเดิม (verified)

- BD record = `HEADERS` 33 คอลัมน์ ([gas_code.gs:182](../../gas_code.gs)). index ที่ใช้:
  | idx | field | ใช้ทำ |
  |---|---|---|
  | 0 | วันที่บันทึก (Date) | filter ช่วงเวลา |
  | 1 | ชื่อเครื่องจักร | display name |
  | 2 | โรงงาน | filter factory (เทียบค่าตรงจาก row — เลี่ยงบั๊กชื่อโรงงาน [[v2.9-plan]]) |
  | 4 | รหัสเครื่องจักร | **key จัดกลุ่ม** |
  | 9 | Downtime (นาที) | Σ downtime |
  | 31 | ประเภทเหตุการณ์ | ตัด `Adjustment` นับเฉพาะ `Breakdown` |
  | 32 | เหตุผลยกเลิก | ถ้ามีค่า = งานยกเลิก → ตัดทิ้ง |
- ชีต BD รายเดือน ตั้งชื่อ `<factoryCode>_<yyyy-MM>` ([gas_code.gs:879](../../gas_code.gs)) → ตรวจด้วย regex `/_\d{4}-\d{2}$/`
- `doGet(e)` ใช้ `e.parameter.action/factory/...` ([gas_code.gs:1070](../../gas_code.gs)); `jsonOut()`, `userCan()`, `ss.getSheets()` มีอยู่แล้ว
- Downtime คำนวณตอน repairComplete (col 9 = นาที) — มีจริง ✅

---

## สูตร (Phase 1 — เฟสปัจจุบัน)

ต่อเครื่อง m ในช่วง [from,to], `days` = จำนวนวันในช่วง:
```
N    = failures        = จำนวน record (eventType=Breakdown, ไม่ยกเลิก)
DT   = downtime รวม (นาที) = Σ col9
PPT  = planned time (นาที) = plannedMinPerDay(m) × days     # เฉพาะเครื่องที่ตั้งค่า; ไม่ตั้ง → null
MTTR = DT / N                                                # เวลาเฉลี่ยซ่อม/ครั้ง (มีเสมอถ้า N>0)
Availability = (PPT − DT) / PPT          (clamp 0..1)        # เฉพาะมี PPT
MTBF = (PPT − DT) / N                     = uptime/failures   # เฉพาะมี PPT
OEE  = Availability × Performance × Quality                  # P,Q = null ตอนนี้ → โชว์ Availability + "รอข้อมูล"
```
> เครื่องไม่ตั้ง PPT → `availability=null, mtbf=null` (โชว์ "—") แต่ยังมี MTTR/failures/downtime → จัด Ranking ได้

---

## ⛔ Phase A: GAS — config sheet + 3 endpoints (ต้อง redeploy)

**Files:** Modify `gas_code.gs`

- [ ] **A1: config sheet + readers** — วางใกล้ส่วน USER/helper (เช่นหลัง `ensureAccessLog` ~บรรทัด 110)

```js
// ============================================================
// MACHINE CONFIG (OEE/Reliability) — planned time ต่อเครื่อง (opt-in)
// ============================================================
function ensureMachineConfig_(ss) {
  var sh = ss.getSheetByName('_MachineConfig');
  if (!sh) {
    sh = ss.insertSheet('_MachineConfig');
    sh.getRange(1,1,1,4).setValues([['machineCode','plannedMinPerDay','idealCycleSec','note']])
      .setBackground('#16a085').setFontColor('#fff').setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return sh;
}
function readMachineConfig_(ss) {
  var sh = ensureMachineConfig_(ss), m = {};
  var v = sh.getDataRange().getValues();
  for (var i = 1; i < v.length; i++) {
    var c = String(v[i][0]||'').trim();
    if (c) m[c] = { planned: Number(v[i][1])||0, cycle: Number(v[i][2])||0, note: String(v[i][3]||'') };
  }
  return m;
}
```

- [ ] **A2: getReliabilityMetrics (GET)** — วางใน `doGet` ถัดจาก block `getPendingUsers` (~บรรทัด 1041)

```js
    if (action === 'getReliabilityMetrics') {
      var ssR = SpreadsheetApp.openById(SPREADSHEET_ID);
      var fromD = e.parameter.from ? new Date(e.parameter.from) : new Date('2000-01-01');
      var toD   = e.parameter.to   ? new Date(e.parameter.to + 'T23:59:59') : new Date();
      var facF  = (e.parameter.factory || '').trim();            // '' = ทุกโรงงาน
      var cfg   = readMachineConfig_(ssR);
      var days  = Math.max(1, Math.round((toD - fromD)/86400000) + 1);
      var agg   = {};
      ssR.getSheets().forEach(function(sh){
        if (!/_\d{4}-\d{2}$/.test(sh.getName()) || sh.getLastRow() < 2) return;  // เฉพาะชีต BD รายเดือน
        var rows = sh.getDataRange().getValues();
        for (var i = 1; i < rows.length; i++) {
          var r = rows[i];
          var d = r[0] instanceof Date ? r[0] : new Date(r[0]);
          if (isNaN(d) || d < fromD || d > toD) continue;
          if (String(r[31] || 'Breakdown') !== 'Breakdown') continue;   // ตัด Adjustment
          if (String(r[32] || '').trim()) continue;                      // ตัดงานยกเลิก
          if (facF && String(r[2] || '').trim() !== facF) continue;      // filter factory (เทียบตรง)
          var code = String(r[4] || '').trim() || String(r[1] || '').trim();
          if (!code) continue;
          if (!agg[code]) agg[code] = { code:code, name:String(r[1]||''), factory:String(r[2]||''), fail:0, dt:0 };
          agg[code].fail += 1;
          agg[code].dt   += Number(r[9]) || 0;
        }
      });
      var out = Object.keys(agg).map(function(code){
        var a = agg[code], c = cfg[code];
        var ppm  = c && c.planned > 0 ? c.planned * days : null;
        var mttr = a.fail ? a.dt / a.fail : 0;
        var avail = (ppm != null) ? Math.max(0, (ppm - a.dt) / ppm) : null;
        var mtbf  = (ppm != null && a.fail) ? (ppm - a.dt) / a.fail : null;
        return {
          code:a.code, name:a.name, factory:a.factory,
          failures:a.fail, downtimeMin:Math.round(a.dt), mttrMin:Math.round(mttr),
          mtbfMin: mtbf != null ? Math.round(mtbf) : null,
          availability: avail != null ? Math.round(avail*1000)/10 : null,   // %
          hasConfig: ppm != null
        };
      });
      return jsonOut({ success:true, days:days, data:out });
    }
```

- [ ] **A3: getMachineConfig (GET) + setMachineConfig (POST)** — GET ใน `doGet`; POST ใน `doPost` (perm `mc.edit` — reuse ไม่ re-seed)

```js
    // doGet:
    if (action === 'getMachineConfig') {
      var ssC = SpreadsheetApp.openById(SPREADSHEET_ID);
      var cm  = readMachineConfig_(ssC);
      var arr = Object.keys(cm).map(function(k){ return { machineCode:k, plannedMinPerDay:cm[k].planned, idealCycleSec:cm[k].cycle, note:cm[k].note }; });
      return jsonOut({ success:true, data:arr });
    }
```
```js
    // doPost (วางใกล้ addUser/setPermission):
    if (data.action === 'setMachineConfig') {
      if (!userCan(ss, data.username, data.pin, 'mc.edit'))
        return jsonOut({ success:false, error:'ต้องมีสิทธิ์ mc.edit' });
      var code = String(data.machineCode||'').trim();
      if (!code) return jsonOut({ success:false, error:'ไม่ระบุรหัสเครื่อง' });
      var sh = ensureMachineConfig_(ss), v = sh.getDataRange().getValues(), found = -1;
      for (var i = 1; i < v.length; i++) if (String(v[i][0]).trim() === code) { found = i+1; break; }
      var row = [code, Number(data.plannedMinPerDay)||0, Number(data.idealCycleSec)||0, String(data.note||'')];
      if (found > 0) sh.getRange(found,1,1,4).setValues([row]);
      else sh.appendRow(row);
      writeAccessLog(ss, data.username, 'setMachineConfig', code + ' planned=' + row[1]);
      return jsonOut({ success:true });
    }
```

- [ ] **A4: redeploy GAS Web App** (Manage deployments → Edit → New version → Deploy) — **ห้ามข้าม**

---

## Phase B: Frontend — Reliability/Ranking page

**Files:** Modify `index.html`; Create `js/oee.js`

- [ ] **B1: nav + panel + script tag** — เพิ่มเมนู (ใกล้ระบบอื่น), panel `panel-oee`, และ `<script src="js/oee.js?v=2.13">` (ลำดับท้ายๆ ก่อน bootstrap). โครง panel:

```html
<div id="panel-oee" class="tab-panel p-4 md:p-6">
  <div class="max-w-6xl mx-auto">
    <div class="flex items-center gap-3 mb-4"><span class="text-2xl">📊</span>
      <h2 class="text-xl font-bold text-gray-800">OEE & Ranking เครื่องจักร</h2></div>
    <!-- filters -->
    <div class="flex flex-wrap gap-2 items-end mb-4">
      <div><label class="text-xs text-gray-500">ตั้งแต่</label><input id="oee-from" type="date" class="block border rounded-lg px-3 py-1.5 text-sm"></div>
      <div><label class="text-xs text-gray-500">ถึง</label><input id="oee-to" type="date" class="block border rounded-lg px-3 py-1.5 text-sm"></div>
      <select id="oee-factory" class="border rounded-lg px-3 py-1.5 text-sm"><option value="">ทุกโรงงาน</option></select>
      <select id="oee-sort" onchange="renderOeeTable()" class="border rounded-lg px-3 py-1.5 text-sm">
        <option value="downtimeMin">เรียง: Downtime มากสุด</option>
        <option value="failures">เรียง: จำนวนเสียมากสุด</option>
        <option value="mttrMin">เรียง: MTTR มากสุด</option>
        <option value="mtbfMin">เรียง: MTBF น้อยสุด</option>
        <option value="availability">เรียง: Availability น้อยสุด</option>
      </select>
      <button onclick="loadOee()" class="px-4 py-1.5 text-white text-sm font-bold rounded-lg" style="background:var(--mms-red)">🔄 คำนวณ</button>
      <button data-perm="mc.edit" onclick="openOeeConfig()" class="hidden px-4 py-1.5 text-sm font-bold rounded-lg border">⚙️ ตั้งเวลาเดินเครื่อง</button>
    </div>
    <div id="oee-cards" class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4"></div>   <!-- KPI การ์ดรวม -->
    <div class="bg-white rounded-xl border overflow-x-auto">
      <table class="w-full text-sm"><thead class="bg-gray-50 text-gray-500 text-xs"><tr>
        <th class="px-3 py-2 text-left">#</th><th class="px-3 py-2 text-left">เครื่องจักร</th>
        <th class="px-3 py-2 text-right">ครั้งเสีย</th><th class="px-3 py-2 text-right">Downtime</th>
        <th class="px-3 py-2 text-right">MTTR</th><th class="px-3 py-2 text-right">MTBF</th>
        <th class="px-3 py-2 text-right">Availability</th></tr></thead>
        <tbody id="oee-tbody"></tbody></table>
    </div>
  </div>
</div>
```

- [ ] **B2: `js/oee.js`** — load + render + sort

```js
// ============================================================
// OEE / RELIABILITY / RANKING  (Phase 1: Availability + MTTR/MTBF)
// ============================================================
let _oeeData = [];

function fmtMin(m){ if(m==null) return '—'; if(m<60) return m+' น'; const h=Math.floor(m/60); return h+' ชม '+(m%60)+' น'; }

async function loadOee(){
  if(!GAS_URL){ showToast('⚠️ ตั้งค่า GAS URL ก่อน','error'); return; }
  const from=document.getElementById('oee-from').value, to=document.getElementById('oee-to').value;
  const fac=document.getElementById('oee-factory').value;
  showLoading('กำลังคำนวณ…');
  try{
    const q=new URLSearchParams({action:'getReliabilityMetrics',from,to,factory:fac});
    const res=await fetch(`${GAS_URL}?${q}`); const json=await res.json();
    _oeeData=json.data||[]; renderOeeCards(); renderOeeTable();
  }catch(e){ showToast('❌ '+e.message,'error'); } finally{ hideLoading(); }
}

function renderOeeCards(){
  const totFail=_oeeData.reduce((a,x)=>a+x.failures,0);
  const totDt=_oeeData.reduce((a,x)=>a+x.downtimeMin,0);
  const av=_oeeData.filter(x=>x.availability!=null);
  const avgAv=av.length?(av.reduce((a,x)=>a+x.availability,0)/av.length).toFixed(1):'—';
  const card=(t,v,c)=>`<div class="bg-white rounded-xl border p-4"><p class="text-xs text-gray-500">${t}</p><p class="text-2xl font-bold" style="color:${c}">${v}</p></div>`;
  document.getElementById('oee-cards').innerHTML=
    card('เครื่องที่เสีย',_oeeData.length,'#1f2937')+
    card('ครั้งเสียรวม',totFail,'#c0392b')+
    card('Downtime รวม',fmtMin(totDt),'#e67e22')+
    card('Availability เฉลี่ย',avgAv+(avgAv!=='—'?'%':''),'#16a085');
}

function renderOeeTable(){
  const key=document.getElementById('oee-sort').value;
  const asc=(key==='mtbfMin'||key==='availability');   // น้อย→มาก สำหรับ 2 ตัวนี้ (แย่สุดอยู่บน)
  const arr=[..._oeeData].sort((a,b)=>{
    const av=a[key]??(asc?Infinity:-1), bv=b[key]??(asc?Infinity:-1);
    return asc?av-bv:bv-av;
  });
  const tb=document.getElementById('oee-tbody');
  tb.innerHTML=arr.length?arr.map((x,i)=>`<tr class="border-t hover:bg-gray-50">
    <td class="px-3 py-2 font-bold ${i<3?'text-red-600':'text-gray-400'}">${i+1}</td>
    <td class="px-3 py-2"><div class="font-medium">${x.name||x.code}</div><div class="text-xs text-gray-400">${x.code} · ${x.factory}</div></td>
    <td class="px-3 py-2 text-right font-bold">${x.failures}</td>
    <td class="px-3 py-2 text-right">${fmtMin(x.downtimeMin)}</td>
    <td class="px-3 py-2 text-right">${fmtMin(x.mttrMin)}</td>
    <td class="px-3 py-2 text-right">${fmtMin(x.mtbfMin)}</td>
    <td class="px-3 py-2 text-right">${x.availability!=null?`<span class="font-bold ${x.availability<85?'text-red-600':'text-green-600'}">${x.availability}%</span>`:'<span class="text-gray-300">—</span>'}</td>
  </tr>`).join(''):'<tr><td colspan="7" class="px-3 py-10 text-center text-gray-400">ไม่มีข้อมูลในช่วงนี้</td></tr>';
}
```

- [ ] **B3:** ตั้ง default date range (ต้นเดือน→วันนี้) ใน bootstrap/เปิด panel + เติม factory options จากที่มี
- [ ] **B4: verify** — `node --check js/oee.js`

---

## Phase C: ตั้งเวลาเดินเครื่อง (per-machine config UI)

**Files:** Modify `index.html`, `js/oee.js`

- [ ] **C1: modal `oee-config-modal`** — เลือกเครื่อง (รหัส) + กรอก `plannedMinPerDay` (เช่น 2 กะ×8ชม.=960) + note; ปุ่มบันทึก
- [ ] **C2: `openOeeConfig()` / `saveOeeConfig()`** — GET `getMachineConfig` โชว์ค่าปัจจุบัน, POST `setMachineConfig {machineCode, plannedMinPerDay, idealCycleSec, note, username, pin}`
- [ ] **C3:** หลังบันทึก → `loadOee()` ใหม่ (Availability/MTBF ของเครื่องนั้นโผล่)
- [ ] **C4: verify** — `node --check js/oee.js`

---

## Phase D: OEE display (Availability ตอนนี้ + โครง P/Q)

- [ ] **D1:** ในแถว/การ์ด เพิ่มคอลัมน์ OEE: ถ้า `availability!=null` โชว์ `OEE = Av × P × Q` โดย P,Q = `—` + badge "รอข้อมูลผลผลิต (เฟส 2)"; ฟังก์ชันคำนวณเขียนเผื่อ P,Q ไว้ (drop-in เมื่อมีข้อมูล)
- [ ] **D2:** กราฟ Ranking (Chart.js bar — โหลดอยู่แล้ว) top-10 downtime/availability

---

## Phase E: bump + test + PR

- [ ] **E1:** bump `?v=2.12.x` → `?v=2.13` ทุก `<script src>` (รวม oee.js ใหม่) — **Edit/sed เท่านั้น** ([[powershell-setcontent-breaks-utf8]])
- [ ] **E2:** `node --check js/oee.js`
- [ ] **E3: test** (preview + GAS redeploy แล้ว): เลือกช่วงเวลา → ranking ขึ้น, MTTR/failures/downtime ถูก, ตั้ง planned time เครื่องนึง → Availability/MTBF เครื่องนั้นโผล่ เครื่องอื่น "—", เรียงได้ทุกคอลัมน์, filter โรงงานถูก
- [ ] **E4:** commit + push `feature/oee-ranking` → PR → **redeploy GAS แล้ว merge**

---

## Phase F (อนาคต — ไม่ทำตอนนี้): Production data → OEE เต็มรูป

> เฟส 2 ที่ user เลือกเลื่อนไว้ — ทำเมื่อมีข้อมูลผลผลิต

- เพิ่มฟอร์ม/sheet บันทึกต่อเครื่อง-กะ-วัน: `จำนวนผลิต (Total Count)`, `ของดี (Good)`, `ของเสีย (Defect)`, `เวลาเดินจริง`
- `idealCycleSec` ใน `_MachineConfig` (มีคอลัมน์รอแล้ว) → **Performance** = (idealCycle×TotalCount)/Runtime
- **Quality** = Good/Total → `getReliabilityMetrics` คืน P,Q เพิ่ม → OEE เต็ม drop-in (โครงคำนวณ D1 รองรับแล้ว)
- ทางเลือกข้อมูล: ฟอร์มกรอกใน MMS / import SAP-MES-Excel (ตัดสินใจตอนนั้น)

---

## Notes / Gotchas / Security

- **REDEPLOY GATE = Phase A** — endpoint ใหม่ ไม่ redeploy = "Unknown action"
- **filter factory เทียบค่าตรงจาก row col[2]** ไม่ใช่ prefix ชื่อชีต — เลี่ยงบั๊กชื่อโรงงาน "โรงงาน 1" vs "Factory 1" ([[v2.9-plan]])
- **เครื่องไม่ตั้ง planned time** → Availability/MTBF = `null` (โชว์ "—") **ตั้งใจ** (ตามที่ user เลือก คำนวณเฉพาะเครื่องที่กำหนด) — ยังจัด Ranking ด้วย downtime/failures/MTTR ได้
- **นับ failure** = eventType `Breakdown` เท่านั้น (ตัด `Adjustment` col31) + ตัดงานยกเลิก (col32 มีค่า) — ระวัง definition นี้ตรงกับที่ทีมเข้าใจ "การเสีย"
- **MTBF ฐาน = planned time** (uptime/failures) ไม่ใช่ calendar — ต้องตั้ง planned time ก่อนถึงมีค่า
- **perf:** aggregation อ่านทุกชีตรายเดือน — ถ้าข้อมูลหลายปี ช่วงกว้างอาจช้า (6-min limit). ระยะแรกโอเค; ถ้าช้า → จำกัดช่วง/cache `CacheService` ผลลัพธ์ราย factory+เดือน
- **reuse perm** `mc.edit` (ตั้ง config) — ไม่เพิ่ม perm code ใหม่ ไม่ re-seed `_Permissions`. ดู metrics = เปิดเหมือน getUsers (read-only สรุป ไม่มี PII)
- **foundation ร่วม** — `getReliabilityMetrics` คือชั้นเดียวที่ Ranking (ตอนนี้) + OEE (เฟส 2) ใช้ → สูตร downtime/availability อยู่ที่เดียว ไม่เขียนซ้ำ (เหตุผลที่รวม 2 ระบบเป็นแผนเดียว)
- frontend ไฟล์ใหม่ `oee.js` แยกเดี่ยว — ไม่กระทบ feature เดิม, conflict เฉพาะ index.html (nav/panel/script tag)
