/* Asbarix UBC: numbered, initially unassigned Code39 labels. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const labels={unassigned:'غير مربوط',linked:'مربوط',printed:'مطبوع',cancelled:'ملغي',unlinked:'مفكوك الربط'};
const valid=s=>/^UBC[0-9]{6,12}$/.test(String(s||'').trim().toUpperCase());
const code=s=>String(s||'').trim().toUpperCase();
const $api=async(method,body,query='')=>{
 const r=await fetch('/api/manage?action=ubc'+query,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const d=await r.json().catch(()=>({message:'استجابة الخادم غير صالحة.'}));if(!r.ok)throw Error(d.message||'تعذر تنفيذ العملية.');return d;
};
const productsApi=async(method,body)=>{
 const r=await fetch('/api/manage?action=products',{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const d=await r.json().catch(()=>({message:'استجابة المنتجات غير صالحة.'}));if(!r.ok)throw Error(d.message||'تعذر حفظ المنتج.');return d;
};
const overlay=document.createElement('div');overlay.id='ubc-overlay';overlay.className='ubc-overlay';overlay.hidden=true;
overlay.innerHTML='<div class="ubc-backdrop" data-ubc-close></div><section class="ubc-dialog" role="dialog" aria-modal="true" aria-labelledby="ubc-heading"><header class="ubc-heading"><div><small>ASBARIX · LABEL STUDIO</small><h2 id="ubc-heading">باركودات المنتجات</h2></div><button type="button" class="ubc-close" data-ubc-close aria-label="إغلاق">✕</button></header><nav class="ubc-tabs"><button type="button" data-ubc-tab="generate" aria-pressed="true">توليد وطباعة</button><button type="button" data-ubc-tab="lookup" aria-pressed="false">مسح وربط</button><button type="button" data-ubc-tab="history" aria-pressed="false">سجل الباركودات</button></nav><div id="ubc-generate" class="ubc-section"><p class="ubc-help">أرقام UBC تسلسلية ومجهولة حتى تربطها بمنتج. كل صفحة A4 تضم عشرة ملصقات بخط قص مستدير منفصل عن الباركود.</p><form id="ubc-batch-form" class="ubc-horizontal"><label>كم باركود تريد؟ <input id="ubc-quantity" type="number" min="1" max="100" step="1" value="10" required></label><button type="submit" class="ubc-primary">توليد وحفظ الباركودات</button></form><div id="ubc-batch-result" hidden><p id="ubc-batch-info" role="status"></p><div class="ubc-buttons"><button id="ubc-svg" type="button">تحميل SVG بخطوط القص</button><button id="ubc-pdf" type="button" class="ubc-primary">طباعة / حفظ PDF واحد A4</button></div><div class="ubc-preview" id="ubc-preview"></div><p class="ubc-help">لون حدود القص أرجواني داخل مجموعة CUT_LINES مستقلة في SVG، وباقي الرسومات في PRINT_ART. تأكد من مقاس الطباعة 100% بدون ملاءمة الصفحة.</p></div></div><div id="ubc-lookup" class="ubc-section" hidden><form id="ubc-code-form" class="ubc-horizontal"><label>رقم الباركود<input id="ubc-code" autocomplete="off" placeholder="UBC000001" required></label><button type="submit" class="ubc-primary">فتح الباركود</button></form><div id="ubc-record" hidden><div id="ubc-record-head"></div><div id="ubc-record-editor"></div></div></div><div id="ubc-history" class="ubc-section" hidden><button id="ubc-refresh" type="button">تحديث السجل</button><div id="ubc-history-content" class="ubc-history-content"></div></div><p class="ubc-status" id="ubc-status" role="status" aria-live="polite"></p></section>';
document.body.append(overlay);
let batch=[],record=null,products=[],focusBefore=null,activeTab='generate';
const info=(msg,kind='')=>{const el=$('ubc-status');el.textContent=msg;el.dataset.kind=kind;};
const optionProduct=p=>'<option value="'+esc(p.id)+'">'+esc(p.sku+' · '+p.name)+'</option>';
function setTab(tab){activeTab=tab;overlay.querySelectorAll('[data-ubc-tab]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.ubcTab===tab)));['generate','lookup','history'].forEach(t=>{ $('ubc-'+t).hidden=t!==tab;});}
function open(tab='generate'){
 focusBefore=document.activeElement;overlay.hidden=false;setTab(tab);info('');if(tab==='history')loadHistory();
 if(tab==='lookup')$('ubc-code').focus();else $('ubc-quantity').focus();
}
function close(){overlay.hidden=true;focusBefore?.focus?.();}
overlay.querySelectorAll('[data-ubc-close]').forEach(b=>b.addEventListener('click',close));
overlay.querySelectorAll('[data-ubc-tab]').forEach(b=>b.addEventListener('click',()=>{setTab(b.dataset.ubcTab);if(b.dataset.ubcTab==='history')loadHistory();}));
overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();}});
// A4 210x297mm, 2 columns x 5 rows; each 87x46mm, 4mm corner radius.
const W=210,H=297,CELL_W=87,CELL_H=46,X=[13,110],Y0=20,YSTEP=53;
const slicePages=items=>Array.from({length:Math.ceil(items.length/10)},(_,i)=>items.slice(i*10,(i+1)*10));
function sheet(items){
 if(!items.length||items.length>10)throw Error('كل ورقة SVG تحتوي على 1 إلى 10 باركودات.');
 if(!window.MontageBarcode)throw Error('لم يتم تحميل مكتبة Code39.');
 let artwork='',cut='';
 items.forEach((item,i)=>{
  if(!valid(item.code))throw Error('الباركود غير صالح.');
  const x=X[i%2],y=Y0+Math.floor(i/2)*YSTEP;
  // Preserve quiet zones from the Code39 viewBox. A nested SVG gives a real vector barcode.
  const svg=window.MontageBarcode.encode(item.code);
  const view=svg.match(/viewBox="([^"]+)"/)?.[1];
  const inner=svg.replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'');
  if(!view)throw Error('تعذر إنشاء رسوم الباركود.');
  artwork+='<svg x="'+(x+4)+'" y="'+(y+6)+'" width="'+(CELL_W-8)+'" height="'+(CELL_H-12)+'" viewBox="'+view+'" preserveAspectRatio="xMidYMid meet">'+inner+'</svg>';
  cut+='<rect x="'+x+'" y="'+y+'" width="'+CELL_W+'" height="'+CELL_H+'" rx="4" ry="4"/>';
 });
 return '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="210mm" height="297mm" viewBox="0 0 210 297"><title>ASBARIX UBC · A4 · Code39</title><g id="PRINT_ART">'+artwork+'</g><g id="CUT_LINES" fill="none" stroke="#ff00ff" stroke-width="0.2">'+cut+'</g></svg>';
}
function composedSvg(items){
 const pages=slicePages(items);if(!pages.length)throw Error('لم تُنشأ باركودات.');
 if(pages.length===1)return sheet(pages[0]);
 // One scalable SVG file containing successive A4 pages, vertically aligned. PDF is recommended for printing.
 const content=pages.map((page,i)=>'<g transform="translate(0 '+i*297+')">'+sheet(page).replace(/^<svg[^>]*>/,'').replace(/<\/svg>\s*$/,'').replace('id="PRINT_ART"','id="PRINT_ART_'+i+'"').replace('id="CUT_LINES"','id="CUT_LINES_'+i+'"')+'</g>').join('');
 return '<svg xmlns="http://www.w3.org/2000/svg" width="210mm" height="'+297*pages.length+'mm" viewBox="0 0 210 '+297*pages.length+'"><title>ASBARIX · '+pages.length+' A4 sheets</title>'+content+'</svg>';
}
function download(content,name,type){
 const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function printPdf(items){
 const sheets=slicePages(items);if(!sheets.length)return;
 const windowRef=window.open('','_blank');
 if(!windowRef){info('اسمح بفتح النافذة المنبثقة ثم حاول مرة أخرى، أو استخدم تحميل SVG.','error');return;}
 const pages=sheets.map(page=>'<section class="page">'+sheet(page)+'</section>').join('');
 windowRef.document.open();windowRef.document.write('<!doctype html><html lang="ar"><head><meta charset="utf-8"><title>ASBARIX - UBC Labels</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;padding:0}.page{width:210mm;height:297mm;break-after:page;page-break-after:always;overflow:hidden}.page:last-child{break-after:auto;page-break-after:auto}.page svg{display:block;width:210mm;height:297mm}@media screen{body{background:#ddd}.page{margin:10px auto;background:#fff;box-shadow:0 0 12px #999}}</style></head><body>'+pages+'</body></html>');windowRef.document.close();
 // Let document/layout finish before opening the browser print-to-PDF dialog.
 let started=false;
 const doPrint=()=>{if(started||windowRef.closed)return;started=true;windowRef.focus();windowRef.print();};
 windowRef.onload=doPrint;
 setTimeout(doPrint,700);
 info('اختر «حفظ كـ PDF» من نافذة الطباعة؛ سيتم إنشاء ملف واحد بعدد صفحات A4 المناسب.','success');
}
function displayBatch(){
 if(!batch.length)return;
 $('ubc-batch-result').hidden=false;
 $('ubc-batch-info').textContent='تم حفظ '+batch.length+' باركود متسلسل: '+batch[0].code+' — '+batch[batch.length-1].code+' · '+slicePages(batch).length+' صفحة A4.';
 $('ubc-preview').innerHTML=sheet(batch.slice(0,10));
}
$('ubc-batch-form').onsubmit=async e=>{
 e.preventDefault();const count=Number($('ubc-quantity').value),button=e.submitter;button.disabled=true;info('جارٍ إصدار الأرقام وحفظها…');
 try{if(!Number.isInteger(count)||count<1||count>100)throw Error('اختر عددًا صحيحًا بين 1 و100.');const data=await $api('POST',{action:'generate',count});batch=data.items;displayBatch();info('تم توليد الأرقام وحفظها، ويمكن طباعتها وربطها لاحقًا.','success');}
 catch(err){info(err.message,'error');}finally{button.disabled=false;}
};
$('ubc-svg').onclick=()=>{try{download(composedSvg(batch),'ASBARIX-UBC-'+batch[0].code+'-'+batch[batch.length-1].code+'.svg','image/svg+xml;charset=utf-8');info('تم تجهيز ملف SVG واحد، مع مجموعة CUT_LINES قابلة للفصل.','success');}catch(e){info(e.message,'error');}};
$('ubc-pdf').onclick=()=>printPdf(batch);
async function loadProducts(){const data=await productsApi('GET');products=data.items||[];return products;}
function formForUnassigned(){
 return '<p class="ubc-help">هذا الباركود غير مربوط. اختر منتجًا موجودًا أو أدخل بيانات منتج جديد في النموذج أدناه.</p><div class="ubc-choice"><label><input type="radio" name="ubc-mode" value="existing" checked> ربط بمنتج موجود</label><label><input type="radio" name="ubc-mode" value="new"> إضافة منتج جديد وربطه</label></div><form id="ubc-link-form"><div id="ubc-existing"><label>اختر المنتج<select name="productId" id="ubc-existing-product" required><option value="">اختر منتجًا…</option>'+products.filter(p=>p.active).map(optionProduct).join('')+'</select></label></div><div id="ubc-new" hidden><div class="ubc-form-grid"><label>القسم<select name="category"><option value="gifts">الهدايا الدعائية والدروع</option><option value="offset">منتجات الأوفست الجاهزة</option></select></label><label>اسم المنتج<input name="name" maxlength="100" placeholder="اسم المنتج" required disabled></label><label>المواصفات<textarea name="spec" maxlength="300" rows="2" placeholder="الخامة والمقاس والألوان" required disabled></textarea></label><label>وحدة القياس<input name="unit" maxlength="24" placeholder="قطعة / درع / كوب" required disabled></label><label>كمية الباقة<input name="packQty" type="number" min="1" max="10000000" value="1" required disabled></label><label>ملاحظات<textarea name="notes" maxlength="500" rows="2" disabled></textarea></label></div><p class="ubc-help">يُنشأ المنتج دون سعر بيع. تسعيره وإدارة الموردين تبقى للإدارة.</p></div><button type="submit" class="ubc-primary">حفظ وربط الباركود</button></form>';
}
function stateActions(item){
 const actions=[];
 if(item.productId)actions.push('<button data-ubc-action="unlinked">فك الربط</button>');
 if(item.status!=='printed')actions.push('<button data-ubc-action="printed">تحديد كمطبوع</button>');
 if(item.status!=='cancelled')actions.push('<button data-ubc-action="cancelled" class="ubc-danger">إلغاء الباركود (الإدارة)</button>');
 return '<div class="ubc-buttons">'+actions.join('')+'</div>';
}
function renderRecord(){
 if(!record)return;
 $('ubc-record').hidden=false;
 const target=record.product;
 $('ubc-record-head').innerHTML='<div class="ubc-record-summary"><strong>'+esc(record.code)+'</strong><span class="ubc-pill">'+esc(labels[record.status]||record.status)+'</span></div>'+(target?'<p>المنتج المرتبط: <strong>'+esc(target.sku+' · '+target.name)+'</strong></p>':'<p>لم يرتبط بمنتج بعد.</p>')+'<p class="ubc-help">الإصدار: '+record.version+' · آخر تحديث: '+esc(record.updatedAt||'—')+'</p>';
 if(record.status==='cancelled'){$('ubc-record-editor').innerHTML='<p class="ubc-help">الباركود ملغي ولا يمكن إعادة استخدامه.</p>';return;}
 if(!record.productId){
  $('ubc-record-editor').innerHTML=formForUnassigned();
  const form=$('ubc-link-form');
  function swap(){
   const isNew=form.querySelector('[name="ubc-mode"]:checked').value==='new';
   $('ubc-existing').hidden=isNew;$('ubc-new').hidden=!isNew;
   $('ubc-existing-product').disabled=isNew;
   $('ubc-new').querySelectorAll('input,select,textarea').forEach(el=>el.disabled=!isNew);
  }
  form.querySelectorAll('[name="ubc-mode"]').forEach(r=>r.onchange=swap);swap();
  const stateBox=document.createElement('div');stateBox.innerHTML=stateActions(record);$('ubc-record-editor').append(stateBox);
  stateBox.querySelectorAll('[data-ubc-action]').forEach(b=>b.onclick=()=>transition(b.dataset.ubcAction,b));
  form.onsubmit=async e=>{
   e.preventDefault();const button=e.submitter;button.disabled=true;info('جارٍ حفظ الربط…');
   try{
    const isNew=form.querySelector('[name="ubc-mode"]:checked').value==='new';
    let productId;
    if(isNew){
     const fields=Object.fromEntries(new FormData(form).entries());
     const product={category:fields.category,name:fields.name,spec:fields.spec,unit:fields.unit,packQty:Number(fields.packQty),price:null,notes:fields.notes||'',active:true,supplierOfferIds:[]};
     const created=await productsApi('POST',product);productId=created.item.id;
     products.push(created.item);
    }else productId=$('ubc-existing-product').value;
    if(!productId)throw Error('اختر منتجًا موجودًا أولًا.');
    const result=await $api('POST',{action:'transition',code:record.code,status:'linked',version:record.version,productId});
    record={...result.item,product:products.find(p=>p.id===productId)||null};renderRecord();info('تم ربط الباركود بالمنتج بنجاح.','success');
   }catch(err){info(err.message,'error');}
   finally{button.disabled=false;}
  };
 }else{
  $('ubc-record-editor').innerHTML=stateActions(record);
  $('ubc-record-editor').querySelectorAll('[data-ubc-action]').forEach(b=>b.onclick=()=>transition(b.dataset.ubcAction,b));
 }
}
async function transition(status,button){
 if(status==='cancelled'&&!confirm('هل تريد إلغاء الباركود نهائيًا؟ لا يمكن إعادة استخدام الرقم.'))return;
 if(status==='unlinked'&&!confirm('هل تريد فك ربط الباركود بالمنتج؟'))return;
 button.disabled=true;info('جارٍ تحديث الحالة…');
 try{
  const data=await $api('POST',{action:'transition',code:record.code,status,version:record.version});
  record={...data.item,product:null};if(data.item.productId){record.product=products.find(p=>p.id===data.item.productId)||null;}if(!record.productId)await loadProducts();
  renderRecord();info('تم تحديث حالة الباركود.','success');
 }catch(e){info(e.message,'error');}finally{button.disabled=false;}
}
async function lookup(value){
 const barcode=code(value);
 setTab('lookup');$('ubc-code').value=barcode;$('ubc-record').hidden=true;info('جارٍ البحث…');
 try{
  if(!valid(barcode))throw Error('أدخل رمزًا صحيحًا مثل UBC000001.');
  const [data]=await Promise.all([$api('GET',null,'&code='+encodeURIComponent(barcode)),loadProducts()]);
  record=data.item;renderRecord();info('تم تحميل بيانات الباركود.','success');
 }catch(err){record=null;info(err.message,'error');}
}
$('ubc-code-form').onsubmit=e=>{e.preventDefault();lookup($('ubc-code').value);};
async function openCode(value){open('lookup');await lookup(value);}
async function loadHistory(){
 $('ubc-history-content').textContent='جارٍ التحميل…';
 try{
  const data=await $api('GET');
  $('ubc-history-content').innerHTML='<div class="ubc-history-rows">'+(data.items||[]).map(p=>'<button type="button" data-ubc-code="'+esc(p.code)+'"><strong>'+esc(p.code)+'</strong><span>'+esc(labels[p.status]||p.status)+'</span></button>').join('')+'</div>'||'<p>لا توجد باركودات بعد.</p>';
  $('ubc-history-content').querySelectorAll('[data-ubc-code]').forEach(b=>b.onclick=()=>lookup(b.dataset.ubcCode));
 }catch(e){$('ubc-history-content').textContent=e.message;}
}
$('ubc-refresh').onclick=loadHistory;
const launcher=document.createElement('button');launcher.type='button';launcher.className='ubc-launcher';launcher.textContent='▥ توليد باركودات A4';launcher.onclick=()=>open();
const header=document.querySelector('header.top .brandrow')||document.querySelector('.admin-navigation')||document.querySelector('.admin-head');
if(header)header.append(launcher);
window.AsbarixUBC={open,close,openCode,lookup,sheet,composedSvg,labels};
})();
