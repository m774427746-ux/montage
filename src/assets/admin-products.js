(()=>{'use strict';
 const $=id=>document.getElementById(id),form=$('catalog-product-form');if(!form)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cash=v=>Number(v).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';
 let items=[],supplierOffers=[],supplierNames=new Map(),selected=new Set();
 const msg=(id,v,good=false)=>{let el=$(id);el.textContent=v;el.className='message'+(good?' ok':'');};
 async function api(method='GET',body){const r=await fetch('/api/manage?action=products',{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const d=await r.json();if(!r.ok)throw Error(d.message||'تعذر حفظ بيانات المنتج');return d;}
 function summary(){
  $('catalog-count').textContent=items.length;
  $('catalog-unpriced').textContent=items.filter(p=>p.price===null).length;
  $('catalog-gifts').textContent=items.filter(p=>p.category==='gifts').length;
  $('catalog-linked').textContent=items.filter(p=>p.supplierOfferIds?.length).length;
 }
 function list(){
  const q=$('catalog-search').value.trim().toLowerCase(),filter=$('catalog-filter').value;
  const visible=items.filter(p=>(!q||[p.sku,p.name,p.spec,p.unit].some(v=>String(v||'').toLowerCase().includes(q)))&&(!filter||p.category===filter||(filter==='unpriced'&&p.price===null)));
  $('catalog-admin-rows').innerHTML=visible.map(p=>{
    const barcode=p.category==='gifts'&&p.barcode;
    return '<tr><td class="catalog-sku"><strong>'+esc(p.sku)+'</strong>'+(barcode?'<button class="ghost barcode-action" type="button" data-print-barcode="'+esc(p.id)+'" title="تحميل باركود SVG">▥ باركود</button>':'<small>رقم فقط</small>')+'</td><td><strong>'+esc(p.name)+'</strong><small class="catalog-muted">'+esc(p.spec)+'</small></td><td>'+(p.category==='offset'?'أوفست':'هدايا دعائية')+'</td><td>'+p.packQty+' '+esc(p.unit)+'</td><td>'+(p.price===null?'غير معتمد':cash(p.price))+'</td><td>'+(p.active?'معروض':'مخفي')+'</td><td><button class="ghost" type="button" data-edit-product="'+esc(p.id)+'">✎ تعديل</button></td></tr>';
  }).join('')||'<tr><td colspan="7">لا توجد منتجات مطابقة.</td></tr>';
  $('catalog-admin-rows').querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>edit(b.dataset.editProduct));
  $('catalog-admin-rows').querySelectorAll('[data-print-barcode]').forEach(b=>b.onclick=()=>{const p=items.find(x=>x.id===b.dataset.printBarcode);if(p?.barcode)window.MontageBarcode.download(p.barcode);});
 }
 function options(){
  const select=$('catalog-supplier-choose'),prev=select.value;
  select.innerHTML='<option value="">اختر سعر أحد الموردين…</option>'+supplierOffers.map(o=>'<option value="'+esc(o.id)+'">'+esc(supplierNames.get(o.supplierId)||o.supplierId)+' · '+esc(o.name)+' · '+esc(o.spec)+' · '+cash(o.total)+'</option>').join('');
  if(supplierOffers.some(o=>o.id===prev))select.value=prev;
 }
 function drawLinks(){
  const target=$('catalog-supplier-links');
  target.innerHTML=[...selected].map(id=>{
    const o=supplierOffers.find(x=>x.id===id);
    if(!o)return '';
    return '<div class="catalog-supplier-row"><div><strong>'+esc(supplierNames.get(o.supplierId)||o.supplierId)+'</strong><small>'+esc(o.name)+' · '+esc(o.spec)+' · '+cash(o.total)+'</small></div><button type="button" class="ghost" data-remove-offer="'+esc(id)+'">إزالة</button></div>';
  }).join('')||'<p class="hint">لا توجد عروض موردين مرتبطة بهذا المنتج بعد.</p>';
  target.querySelectorAll('[data-remove-offer]').forEach(b=>b.onclick=()=>{selected.delete(b.dataset.removeOffer);drawLinks();});
 }
 function reset(){form.reset();$('catalog-price-preview').textContent='';form.elements.namedItem('id').value='';$('catalog-editor-title').textContent='إضافة منتج جديد';$('catalog-number').textContent='الرقم التالي سيصدر تلقائيًا عند الحفظ';$('catalog-category').disabled=false;$('catalog-pack').value='100';selected.clear();drawLinks();msg('catalog-save-message','');}
 function edit(id){
  const p=items.find(x=>x.id===id);if(!p)return;
  form.elements.namedItem('id').value=p.id;
  for(const k of ['category','name','spec','unit','packQty','notes'])form.elements.namedItem(k).value=p[k]??'';
  form.elements.namedItem('price').value=(p.manualPrice??p.price)===null||(p.manualPrice??p.price)===undefined?'':(p.manualPrice??p.price);
  form.elements.namedItem('priceMode').value=p.priceMode==='supplier'?'supplier':'manual';
  form.elements.namedItem('marginPct').value=p.marginPct??'';
  $('catalog-price-preview').textContent=p.supplierCost==null?'لا يوجد سعر مورد مرتبط بعد.':'أقل سعر مورد: '+cash(p.supplierCost)+' · السعر المقترح بهامش '+p.appliedMargin+'%: '+cash(p.suggestedPrice);
  form.elements.namedItem('active').checked=p.active;
  $('catalog-category').disabled=true;
  selected=new Set(p.supplierOfferIds||[]);drawLinks();
  $('catalog-editor-title').textContent='تعديل: '+p.name;
  $('catalog-number').textContent='الرقم الثابت: '+p.sku+(p.barcode?' · باركود: '+p.barcode:' · بدون باركود');
  form.scrollIntoView({behavior:'smooth',block:'start'});form.elements.namedItem('name').focus();
 }
 async function load(){
  try{const data=await api();items=data.items;summary();list();msg('catalog-admin-message',items.length+' منتج مسجّل. الرقم التسلسلي يُحجز عند الحفظ ولا يُعاد استخدامه.',true);}
  catch(e){msg('catalog-admin-message',e.message);}
 }
 async function loadOffers(){
  try{
   const r=await fetch('/api/suppliers',{credentials:'same-origin'}),d=await r.json();if(!r.ok)throw Error(d.message||'تعذر قراءة الموردين');
   supplierOffers=d.offers||[];supplierNames=new Map((d.suppliers||[]).map(x=>[x.id,x.name]));options();drawLinks();
  }catch(e){msg('catalog-admin-message','الموردون غير متاحين: '+e.message);}
 }
 $('catalog-search').addEventListener('input',list);$('catalog-filter').addEventListener('change',list);
 $('catalog-add-supplier').onclick=()=>{const id=$('catalog-supplier-choose').value;if(id){selected.add(id);drawLinks();}};
 $('catalog-new-product').onclick=()=>{reset();form.scrollIntoView({behavior:'smooth'});form.elements.namedItem('name').focus();};
 $('catalog-refresh').onclick=()=>{load();loadOffers();};
 form.querySelector('[type="reset"]')?.addEventListener('click',e=>{e.preventDefault();reset();});
 form.onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  const f=Object.fromEntries(new FormData(form).entries()),id=f.id;
  const body={...f,category:form.elements.namedItem('category').value,price:f.price===''?null:Number(f.price),packQty:Number(f.packQty),active:form.elements.namedItem('active').checked,supplierOfferIds:[...selected]};
  if(!id)delete body.id;
  try{
   const data=await api(id?'PUT':'POST',body);
   await load();reset();
   msg('catalog-save-message','تم الحفظ. رقم المنتج: '+data.item.sku+(data.item.barcode?' · باركود: '+data.item.barcode:''),true);
  }catch(err){msg('catalog-save-message',err.message);}
  finally{b.disabled=false;}
 };
 drawLinks();load();loadOffers();
})();