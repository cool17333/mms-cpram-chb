// ==================== ASSET HUB ====================
function goAssetHub() { switchTab('asset-hub'); }

async function renderAssetHub() {
    // reload ถ้า machineMaster ว่าง หรือไม่มี field rank (loadMachines ตอนเปิดแอปตัด rank ทิ้ง)
    if (!machineMaster.length || !machineMaster.some(m => 'rank' in m)) await loadMachineMaster();
    if (typeof _spData === 'undefined' || !_spData.length) { if (typeof spareLoad === 'function') await spareLoad(); }

    // เครื่องจักร: นับ rank แยกโรงงาน
    const RANKS = ['A','B','C','D'];
    const facs  = [...new Set(machineMaster.map(m => m.factory).filter(Boolean))].sort();
    const mcColor = { A:'#c0392b', B:'#e67e22', C:'#f1c40f', D:'#27ae60' };
    const mcRows = facs.map(f => {
        const inFac = machineMaster.filter(m => m.factory === f);
        const cnt = r => inFac.filter(m => String(m.rank||'').toUpperCase() === r).length;
        const none = inFac.filter(m => !RANKS.includes(String(m.rank||'').toUpperCase())).length;
        return { f, A:cnt('A'), B:cnt('B'), C:cnt('C'), D:cnt('D'), none, total:inFac.length };
    });
    document.getElementById('assethub-mc-table').innerHTML =
        '<table class="w-full text-sm"><thead><tr class="text-gray-500 border-b">' +
        '<th class="text-left py-1">โรงงาน</th>' +
        RANKS.map(r => `<th class="text-center" style="color:${mcColor[r]}">${r}</th>`).join('') +
        '<th class="text-center text-gray-400">ยังไม่ฯ</th><th class="text-right">รวม</th></tr></thead><tbody>' +
        mcRows.map(x =>
            `<tr class="border-b border-gray-50"><td class="py-1 font-bold">${x.f}</td>` +
            RANKS.map(r => `<td class="text-center">${x[r] || '-'}</td>`).join('') +
            `<td class="text-center text-gray-400">${x.none || '-'}</td><td class="text-right font-bold">${x.total}</td></tr>`
        ).join('') +
        '</tbody></table>';

    // อะไหล่: นับตามประเภท
    const sp = (typeof _spData !== 'undefined') ? _spData : [];
    const store = sp.filter(p => (p.type || 'STORE') !== 'SUPPLIER').length;
    const supp  = sp.filter(p => p.type === 'SUPPLIER').length;
    document.getElementById('assethub-sp-table').innerHTML =
        `<div class="flex gap-3">
           <div class="flex-1 rounded-xl p-3 text-center" style="background:#dbeafe"><div class="text-2xl font-black text-blue-700">${store}</div><div class="text-xs text-blue-600 font-bold">Store</div></div>
           <div class="flex-1 rounded-xl p-3 text-center" style="background:#ede9fe"><div class="text-2xl font-black text-purple-700">${supp}</div><div class="text-xs text-purple-600 font-bold">Supplier</div></div>
           <div class="flex-1 rounded-xl p-3 text-center" style="background:#f3f4f6"><div class="text-2xl font-black text-gray-700">${sp.length}</div><div class="text-xs text-gray-500 font-bold">รวม</div></div>
         </div>`;

    const eM = document.getElementById('assethub-stat-mc'); if (eM) eM.textContent = '🏭 เครื่องจักร: ' + machineMaster.length;
    const eS = document.getElementById('assethub-stat-sp'); if (eS) eS.textContent = '🔩 อะไหล่: ' + sp.length;
}
