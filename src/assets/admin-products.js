(()=>{'use strict';
 const $=id=>document.getElementById(id),form=$('catalog-product-form');if(!form)return;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 let items=[];
 const msg=(id,value,ok=false)=>{const el=$(id);el.textContent=value;el.className='message'+(ok?' ok':'');};
 async function api(method='GET',body){const r=await fetch('/api/manage?action=products',{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});const data=await r.json();if(!r.ok)throw Error(data.message||'تعذّر حفظ بيانات المنتج');return data;}
 function render(){
  $('catalog-admin-rows').innerHTML=items.map(p=>'<tr><td><strong>'+esc(p.name)+'</strong><small style="display:block">'+esc(p.spec)+'</small></td><td>'+(p.category==='offset'?'أوفست':'هدايا دعائية')+'</td><td>'+p.packQty+' '+esc(p.unit)+'</td><td>'+(p.price===null?'غير معتمد':Number(p.price).toLocaleString('ar-SA')+' ر.س')+'</td><td>'+(p.active?'معروض':'مخفي')+'</td><td><button class="ghost" type="button" data-edit-product="'+esc(p.id)+'">تعديل</button></td></tr>').join('')||'<tr><td colspan="6">لا توجد منتجات.</td></tr>';
  $('catalog-admin-rows').querySelectorAll('[data-edit-product]').forEach(b=>b.onclick=()=>edit(b.dataset.editProduct));
 }
 function reset(){form.reset();form.elements.namedItem('id').value='';$('catalog-editor-title').textContent='إضافة منتج جديد';$('catalog-pack').value='100';msg('catalog-save-message','');}
 function edit(id){
  const p=items.find(x=>x.id===id);if(!p)return;
  form.elements.namedItem('id').value=p.id;
  for(const k of ['category','name','spec','unit','packQty','notes'])form.elements.namedItem(k).value=p[k]??'';
  form.elements.namedItem('price').value=p.price===null?'':p.price;
  form.elements.namedItem('active').checked=p.active;
  $('catalog-editor-title').textContent='تعديل: '+p.name;
  form.scrollIntoView({behavior:'smooth',block:'start'});form.elements.namedItem('name').focus();
 }
 async function load(){try{const data=await api();items=data.items;render();msg('catalog-admin-message',items.length+' منتج، منها '+items.filter(p=>p.price===null).length+' بانتظار اعتماد السعر.',true);}catch(e){msg('catalog-admin-message',e.message);}}
 form.addEventListener('reset',()=>setTimeout(reset,0));
 $('catalog-new-product').onclick=()=>{reset();form.scrollIntoView({behavior:'smooth'});form.elements.namedItem('name').focus();};
 $('catalog-refresh').onclick=load;
 form.onsubmit=async e=>{
  e.preventDefault();const b=e.submitter;b.disabled=true;
  const o=Object.fromEntries(new FormData(form).entries()),id=o.id;
  const body={...o,price:o.price===''?null:Number(o.price),packQty:Number(o.packQty),active:form.elements.namedItem('active').checked};
  if(!id)delete body.id;
  try{await api(id?'PUT':'POST',body);await load();reset();msg('catalog-save-message','تم حفظ المنتج بنجاح. ستظهر الأسعار المعتمدة للمصممين.',true);}
  catch(error){msg('catalog-save-message',error.message);}
  finally{b.disabled=false;}
 };
 load();
})();