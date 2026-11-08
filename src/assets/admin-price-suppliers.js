(()=>{
 const $=id=>document.getElementById(id),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const normalize=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/استيكر|استكر/g,'ستيكر').trim();
 let offers=[],suppliers=new Map();
 function render(){
  const q=normalize($('price-supplier-search').value),matches=offers.filter(o=>!q||normalize([o.name,o.spec,o.unit,o.category,suppliers.get(o.supplierId)].join(' ')).includes(q)).slice(0,100);
  $('price-supplier-rows').innerHTML=matches.map(o=>'<tr><td>'+esc(suppliers.get(o.supplierId)||o.supplierId)+'</td><td>'+esc(o.name)+'</td><td>'+esc(o.spec)+'</td><td>'+esc(o.unit+(o.packageSpec?' · '+o.packageSpec:''))+'</td><td>'+Number(o.total).toFixed(2)+' ر.س</td><td>'+esc(o.source||'إدخال الإدارة')+'</td></tr>').join('')||'<tr><td colspan="6">لا يوجد سعر مطابق لهذا البحث. جرّب اسمًا آخر أو افتح جميع الموردين.</td></tr>';
  $('price-supplier-message').textContent=matches.length+' نتيجة (الحد الأقصى للعرض 100).';
 }
 $('price-supplier-search').oninput=render;
 // Supply entries come from the same persistent catalog used by the supplier management screen.
 fetch('/api/suppliers').then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.message||'تعذّر تحميل الأسعار');suppliers=new Map(d.suppliers.map(s=>[s.id,s.name]));offers=d.offers;render();const rows=$('material-rows');const bind=()=>rows.querySelectorAll('tr[data-id]').forEach(tr=>{if(tr.dataset.supplierLookup)return;tr.dataset.supplierLookup='1';const b=document.createElement('button');b.type='button';b.className='ghost';b.textContent='عرض الموردين';b.style.cssText='display:block;margin-top:6px';b.onclick=()=>{$('price-supplier-search').value=tr.firstChild.textContent;render();$('price-supplier-search').scrollIntoView({behavior:'smooth',block:'center'});};tr.firstChild.appendChild(b);});bind();new MutationObserver(bind).observe(rows,{childList:true});}).catch(e=>$('price-supplier-message').textContent=e.message);
})();