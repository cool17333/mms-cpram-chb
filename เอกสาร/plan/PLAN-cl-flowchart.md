# PLAN — Flowchart รายเครื่องจักร (Checklist/PM Inspection/PM Replacement)

**เป้าหมาย:** หน้าผังรายเครื่อง: node เครื่องจักร → 3 function (Checklist รายวัน / PM Inspection / PM Replacement) → คลิก function ขยายกิ่งเห็นรายการตรวจ/อะไหล่ทุกตัวเป็น node ย่อย + ปุ่มแก้ไขเปิด modal เดิม
**ขอบเขต:** `index.html` + ไฟล์ใหม่ `js/cl-flowchart.js` + glue เล็กน้อย (`breakdown-report.js`, `checklist-status.js`, `pm-replacement.js`) — **frontend ล้วน ไม่แตะ GAS ไม่ redeploy** (ใช้ getter/endpoint เดิมทั้งหมด)
**Executor:** Sonnet (Fable/Opus = plan only)

---

## Decisions confirmed (user 2026-07-02)
| # | หัวข้อ | สรุป |
|---|--------|------|
| D1 | ตำแหน่ง | **หน้าใหม่ใน submenu Check List** ("Flowchart เครื่องจักร", `cl-flow`) **+ ปุ่มลัด 🔀** ในตารางหน้า "รายละเอียดตรวจสอบ" ทั้ง 3 tab → กระโดดมาพร้อมเลือกเครื่องให้เลย |
| D2 | การขยาย | คลิก function node = **toggle เปิด/หุบ — ค้างได้หลาย function พร้อมกัน** (mind-map style) |
| D3 | ความลึก | **ทุกรายการเป็น node ย่อย** (1 node/รายการตรวจ, 1 node/อะไหล่) ตาม mockup |
| D4 | ธีม | **Light ตามธีมแอป** (การ์ดขาว เส้นเทา — ไม่เอา dark canvas) |
| — | การแก้ไข | **reuse modal เดิม** — daily/PM: `openClItemsEditor(mode, id)` · PM Replacement: `pmrOpenBatch(id)` — ไม่สร้าง editor ใหม่ |

## แหล่งข้อมูล (มีครบแล้ว ฝั่ง client)
| กิ่ง | getter | โหลดผ่าน |
|------|--------|----------|
| Checklist รายวัน | `clResolveDailyItems(id)` (custom) + `_clDailyDefault` (default) [checklist-core.js:124] | GET `getDailyDefault` |
| PM Inspection | `clGetPmPlan(id)` → pmFreqMonths/pmStartMonth/pmItems + `clNextPmDate(id)` [checklist-core.js:134-147] | GET `getPmPlans` (factory,area) → `_clPmPlans` |
| PM Replacement | `_pmrByMachine[id]` → [{partLabel, partNo, cycleValue, nextDue, status,...}] | `pmrLoadAll()` (PR#77) |

---

## Phase A — index.html

### A1 — sidebar submenu (หลัง `sni-cl-schedule` ~บรรทัด 302)
```html
<div class="sidebar-subitem" id="sni-cl-flow" onclick="switchTab('cl-flow')">Flowchart เครื่องจักร</div>
```

### A2 — panel ใหม่ `panel-cl-flow` (วางหลัง `</div><!-- end panel-cl-schedule -->` ~บรรทัด 1767)
```html
<div id="panel-cl-flow" class="tab-panel p-4 md:p-6">
<div class="max-w-6xl mx-auto">
    <!-- picker bar: Factory → พื้นที่ → เครื่องจักร (pattern เดียวกับ clsc-*) -->
    <div class="mms-card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div><label ...>Factory</label><select id="clfw-fac" onchange="clFlowFacChange()">...</select></div>
        <div><label ...>พื้นที่</label><select id="clfw-area" onchange="clFlowAreaChange()">...</select></div>
        <div class="flex-1 min-w-48"><label ...>เครื่องจักร</label>
            <select id="clfw-machine" onchange="clFlowRender()" class="w-full ...">
                <option value="">-- เลือกเครื่องจักร --</option>
            </select></div>
        <button onclick="clFlowReload()" class="mms-btn text-sm">🔄 รีเฟรช</button>
    </div>
    <!-- canvas: relative wrapper — SVG เส้นเชื่อมอยู่ล่าง, node เป็น absolute-free flex 3 คอลัมน์ -->
    <div class="mms-card overflow-x-auto">
        <div id="clfw-canvas" class="relative min-h-96 p-6" style="min-width:900px">
            <svg id="clfw-lines" class="absolute inset-0 w-full h-full pointer-events-none"></svg>
            <div id="clfw-nodes" class="relative flex gap-16 items-start"></div>
        </div>
    </div>
</div>
</div><!-- end panel-cl-flow -->
```
> โครงคอลัมน์จริงสร้างใน JS (Phase B) — panel เป็นแค่เปลือก

### A3 — script tag ใหม่ + bump
- เพิ่ม `<script src="js/cl-flowchart.js?v=1.0"></script>` **หลัง** `checklist-status.js` (เรียกฟังก์ชันข้ามไฟล์ตอน runtime เท่านั้น — ลำดับหลังสุดปลอดภัย)
- bump `?v=`: `breakdown-report.js`, `checklist-status.js`, `pm-replacement.js` (ตามที่แก้จริงใน Phase C)

---

## Phase B — ไฟล์ใหม่ `js/cl-flowchart.js` (หัวใจของงาน)

### B1 — state + init
```js
let _clfwMachineId = '';
let _clfwExpanded = { daily:false, pm:false, pmrep:false };   // D2: ค้างหลายอันพร้อมกัน
async function initClFlow() {
    if (!machineMaster.length) await loadMachineMaster();
    // ensure ข้อมูล 3 ระบบ (โหลดเฉพาะที่ยังว่าง — idempotent)
    if (!_clDailyDefault.length) { try { const d = await clFetch({action:'getDailyDefault'}); if (d.success && d.data?.items?.length) _clDailyDefault = d.data.items; } catch(e){} }
    if (!Object.keys(_pmrByMachine).length) await pmrLoadAll();
    if (typeof SPARE_CACHE !== 'undefined' && !SPARE_CACHE.length && typeof loadSpareCache === 'function') await loadSpareCache();  // ให้ pmrOpenBatch จาก flow มี datalist
    clFillFacSelect('clfw-fac', '');
    clFlowFacChange();
    if (_clfwMachineId) { /* มาจากปุ่มลัด — set select + render */ }
}
```
- `clFlowFacChange`/`clFlowAreaChange`: เติม area (`clFillAreaSelect`) + เติม machine select จาก `clMachinesFor(fac,area)`
- **โหลด `_clPmPlans` ของเครื่องที่เลือก**: ตอนเลือกเครื่อง ถ้า `!_clPmPlans[id]` → `clFetch({action:'getPmPlans', factory:m.factory, area:m.area})` merge เข้า `_clPmPlans` (pattern เดียวกับ `loadClSchedule`)

### B2 — entry จากปุ่มลัด
```js
function clFlowOpen(machineId) {
    _clfwMachineId = machineId;
    _clfwExpanded = { daily:false, pm:false, pmrep:false };
    switchTab('cl-flow');   // → initClFlow เห็น _clfwMachineId → set fac/area/machine select ตามเครื่อง แล้ว render
}
```

### B3 — render ผัง `clFlowRender()`
- โครง 3 คอลัมน์ใน `#clfw-nodes` (flex gap-16):
  - **คอลัมน์ 1**: node เครื่องจักร — การ์ดขาว border หนา ชื่อเครื่อง (bold) + รหัส (mono เทา) — id `clfw-node-machine`
  - **คอลัมน์ 2**: 3 function node (id `clfw-node-daily|pm|pmrep`) — คลิกทั้งการ์ด = `clFlowToggle(key)`; ในการ์ด: ชื่อ + badge จำนวน + chevron ▸/▾ + ปุ่ม ✏️ (`event.stopPropagation()`; แสดงตาม perm: daily/pm=`can('cl.edit')`, pmrep=`can('cl.pm')`)
    - daily badge: `(clResolveDailyItems(id)||_clDailyDefault).length` + tag "Custom"/"Default"
    - pm badge: `ทุก X เดือน · N รายการ`
    - pmrep badge: `N อะไหล่` + จุดสถานะ (🔴 X เกิน / 🟠 Y ใกล้)
  - **คอลัมน์ 3**: กลุ่ม detail ต่อ function ที่ expand (แต่ละกลุ่ม id `clfw-детail-daily|pm|pmrep` เรียงแนวตั้งตรงข้าม function node ของตัว):
    - **daily**: 1 node เล็ก/รายการตรวจ (ข้อความ + เลขลำดับ) — ใช้ custom ถ้ามี ไม่งั้น default+tag
    - **pm**: node สรุปหัว (PM ทุก X เดือน · เริ่ม YYYY-MM · ถัดไป `clNextPmDate(id)`) แล้วตาม 1 node/pmItem
    - **pmrep**: 1 node/อะไหล่ — `[partNo] ชื่อ · ทุก X เดือน · ครบกำหนด nextDue` + border-left สีตาม `PMR_STATUS_COLOR[status]`
    - ว่าง → node เทา "ยังไม่มีรายการ — กด ✏️ เพื่อตั้งค่า"
- ปุ่ม ✏️: daily→`openClItemsEditor('per-machine-daily', id)` · pm→`openClItemsEditor('per-machine-pm', id)` · pmrep→`pmrOpenBatch(id)`
- escape ข้อความทุกจุด (`.replace(/</g,'&lt;')`)

### B4 — เส้นเชื่อม SVG `clFlowDrawLines()`
- หลัง render + expand/collapse ทุกครั้ง: วัด `getBoundingClientRect()` ของ node เทียบกับ `#clfw-canvas` แล้ววาด `<path>` แบบข้อศอก (H→V→H, `stroke:#cbd5e1;fill:none;stroke-width:1.5`) จาก machine→function ทุกอัน และ function→detail node ทุกตัวที่ expand
- SVG ต้อง `width/height` = scrollWidth/scrollHeight ของ canvas (กัน clip ตอนกิ่งยาว)
- redraw ตอน `window.resize` (debounce ~150ms) — เก็บ listener ครั้งเดียว
- **จุดเสี่ยงหลักของงานนี้** — วัดตำแหน่งตอน panel ซ่อนไม่ได้ (`display:none` → rect 0,0 — บั๊กที่เคยเจอกับ panel-form) → render+draw ต้องเกิดหลัง switchTab แสดง panel แล้วเท่านั้น

### B5 — toggle + refresh hook
```js
function clFlowToggle(key) { _clfwExpanded[key] = !_clfwExpanded[key]; clFlowRender(); }
function clFlowActive() { return !document.getElementById('panel-cl-flow')?.classList.contains('hidden') && !!_clfwMachineId; }
function clFlowRefreshIfActive() { if (clFlowActive()) clFlowRender(); }
```

---

## Phase C — glue

### C1 — breakdown-report.js (5 จุด — pattern เดิมของทุกหน้า)
- `PAGE_TITLES` (~42): `'cl-flow': '🔀 Flowchart เครื่องจักร'`
- `CL_SUB_PANELS` (~585): เพิ่ม `'cl-flow'`
- bottom-nav map (~609): `'cl-flow':'bn-cl'`
- submenu map (~627): `'cl-flow': ['cl','sni-cl-flow']`
- init hook (~671): `if (name === 'cl-flow') initClFlow();`

### C2 — ปุ่มลัด 🔀 ในตาราง "รายละเอียดตรวจสอบ" 3 tab
- `renderClScDaily` + `renderClScPm` (checklist-status.js) และ `pmrRenderTable` (pm-replacement.js): เพิ่มปุ่มต่อแถว
  `<button onclick="clFlowOpen('${id}')" class="px-2.5 py-1 text-xs font-bold bg-gray-50 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">🔀 Flow</button>`
- ปุ่มดูได้ทุกคน (view-only) — ปุ่มแก้ไขข้างในถูก gate perm อยู่แล้ว

### C3 — refresh หลังแก้ไขจาก modal
- editor ทั้ง 3 ทาง จบด้วยเรียก `renderClSchedule()` อยู่แล้ว (pmrSaveBatch ✓; **executor ตรวจ** `saveClItemsEditor`/save path ของ items editor ว่าจบที่ renderClSchedule จริง) → เติมท้าย `renderClSchedule()` (checklist-status.js:98):
  `if (typeof clFlowRefreshIfActive === 'function') clFlowRefreshIfActive();`
- ถ้า save path ไหนไม่ผ่าน renderClSchedule → เรียก `clFlowRefreshIfActive()` ตรงนั้นแทน

---

## Phase D — Verify (preview; frontend ล้วน ไม่ต้อง login ยิง POST ใดๆ)
1. `node --check` ทุกไฟล์ js ที่แก้ + ไฟล์ใหม่
2. เปิด submenu → หน้า Flowchart โหลด, picker fac→area→เครื่อง ทำงาน
3. เลือกเครื่องจริง → ผังขึ้น: node เครื่อง + 3 function + badge จำนวนตรงข้อมูลจริง (`pmReplaceList`/`getPmPlans` เดิม)
4. คลิก function ×3 → ขยายค้างพร้อมกันได้, คลิกซ้ำหุบ, เส้น SVG ตามทุกครั้ง (ไม่ค้าง/ไม่เพี้ยน), resize หน้าต่าง → เส้น redraw
5. เครื่องไม่มีข้อมูล → node "ยังไม่มีรายการ" ครบ 3 กิ่ง ไม่มี error
6. ปุ่ม ✏️ เปิด modal เดิมถูกตัว (mock `can()` เพื่อทดสอบ UI ได้ — ห้ามกด save จริง) + ปุ่มลัด 🔀 จากตาราง 3 tab กระโดดมาพร้อมเครื่องถูกตัว
7. `preview_console_logs` ไม่มี error ตลอด
8. **ห้ามทดสอบ save จริงบน production** — refresh hook ทดสอบด้วยเรียก `clFlowRefreshIfActive()` ตรงๆ

## Phase E — commit / PR
- branch `feature/cl-flowchart` — PR เดียว ระบุ **frontend ล้วน ไม่ต้อง redeploy**

---

## จุดเสี่ยง / gotcha
- **SVG เส้นเชื่อม = งานหิน**: วัด rect ตอน panel ซ่อน = 0,0 (บั๊กเดิม panel-form) → วาดหลัง panel แสดงเท่านั้น; expand แล้ว canvas สูงขึ้น → ต้องอัป width/height ของ svg ตาม scroll size
- รายการเยอะ (daily 20 ข้อ) → คอลัมน์ 3 ยาว — canvas สูงตามได้ (ไม่ fix height) + `min-width:900px` กัน mobile บีบ
- `pmrOpenBatch` จาก flow ต้องมี `SPARE_CACHE` + `_pmrByMachine` โหลดแล้ว (initClFlow จัดการ) — ไม่งั้น datalist ว่าง
- `_clPmPlans` โหลดราย factory — เครื่องต่าง factory ที่ยังไม่โหลด → badge PM ผิด (default 3 เดือน) → ensure-load ตอนเลือกเครื่อง (B1)
- inline onclick ใน node ที่มี id เครื่องมี quote/พิเศษ — id เครื่องเป็นรหัส (safe) แต่ escape ชื่อ/ข้อความทุกจุด
- อย่าลืม 5 จุด glue ใน breakdown-report.js — ตกจุดใดหน้าจะเปิดไม่ได้/ไฮไลต์เมนูผิด
- PR#77 ยัง**รอ redeploy GAS** — ไม่กระทบงานนี้ (ใช้ GET เดิมล้วน) แต่ห้ามเผลอทดสอบปุ่มบันทึกของ pmrep
