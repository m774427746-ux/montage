(()=>{
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=v=>String(v).normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/استيكر/g,'ستيكر').replace(/ملم|مم/g,'mm').replace(/٫/g,'.').replace(/\s+/g,' ').trim();
const money=v=>Number(v).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
let data={suppliers:[],offers:[],canEdit:false}, supplier='creative', selected=new Set(), visible=[];
const supplierName=id=>data.suppliers.find(s=>s.id===id)?.name||id;
function message(id,text,ok=false){$(id).textContent=text;$(id).className='message'+(ok?' ok':'');}
async function api(method='GET',body){
 const response=await fetch('/api/suppliers',{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const result=await response.json();
 if(response.status===401){location.replace('/login?role=team');throw Error('انتهت الجلسة.');}
 if(!response.ok)throw Error(result.message||'تعذّر تحميل القائمة.');
 return result;
}
function cards(){
 $('supplier-cards').innerHTML=[{id:'',name:'كل الموردين'},...data.suppliers].map(s=>'<button class="supplier-card" type="button" data-supplier="'+esc(s.id)+'" aria-pressed="'+(supplier===s.id)+'"><strong>'+esc(s.name)+'</strong><small>'+data.offers.filter(o=>!s.id||o.supplierId===s.id).length+' منتج</small><small>'+esc(s.updated||'مقارنة جميع القوائم')+'</small></button>').join('');
 $('supplier-cards').querySelectorAll('button').forEach(b=>b.onclick=()=>{supplier=b.dataset.supplier;cards();render();});
}
function render(){
 const q=norm($('search').value),cat=$('category').value;
 visible=data.offers.filter(o=>(!supplier||o.supplierId===supplier)&&(!cat||o.category===cat)&&(!q||norm([o.name,o.spec,o.category,o.unit,supplierName(o.supplierId)].join(' ')).includes(q)));
 visible.sort($('sort').value==='price'?(a,b)=>a.total-b.total:(a,b)=>a.category.localeCompare(b.category,'ar')||a.name.localeCompare(b.name,'ar'));
 $('count').textContent=visible.length+' منتج · '+(supplier?supplierName(supplier):'كل الموردين');
 $('export').disabled=!visible.length;
 $('rows').innerHTML=visible.map(o=>'<tr><td><input type="checkbox" data-select="'+esc(o.id)+'" aria-label="مقارنة '+esc(o.name+' '+o.spec+' '+supplierName(o.supplierId))+'" '+(selected.has(o.id)?'checked':'')+'></td><td><a class="ghost comparison-link" href="/product-pricing?id='+encodeURIComponent(o.id)+'">تسعير الكمية</a><strong>'+esc(o.name)+'</strong><span class="cell-note">'+esc(supplierName(o.supplierId)+' · '+o.category)+'</span></td><td><bdi>'+esc(o.spec)+'</bdi><span class="cell-note">'+esc(o.unit+(o.packageSpec?' · '+o.packageSpec:''))+'</span><span class="cell-note">'+esc(o.unitNote)+'</span></td><td class="num">'+money(o.price)+'</td><td class="num">'+money(o.tax)+'<span class="cell-note">'+Math.round(o.vat*10000)/100+'%</span></td><td class="num price-total">'+money(o.total)+'</td><td>'+esc(o.updated)+'<span class="cell-note">'+esc(o.source)+(o.sourcePage?' · ص '+o.sourcePage:'')+'</span></td>'+(data.canEdit?'<td><div class="row-actions"><button type="button" class="ghost" data-edit="'+esc(o.id)+'">تعديل</button><button type="button" class="ghost" data-match="'+esc(o.id)+'">سعر مورد آخر</button></div></td>':'')+'</tr>').join('')||'<tr><td colspan="8">لا توجد نتائج. جرّب تغيير المورد أو التصنيف أو البحث.</td></tr>';
 $('rows').querySelectorAll('[data-select]').forEach(n=>n.onchange=()=>{
  if(n.checked&&selected.size>=4){n.checked=false;message('status','المقارنة متاحة لأربعة منتجات. أزل منتجًا لإضافة آخر.');return;}
  if(n.checked)selected.add(n.dataset.select);else selected.delete(n.dataset.select);
  message('status','');compare();
 });
 $('rows').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>fillOffer(b.dataset.edit,true));
 $('rows').querySelectorAll('[data-match]').forEach(b=>b.onclick=()=>fillOffer(b.dataset.match,false));
 compare();
}
function compare(){
 const offers=[...selected].map(id=>data.offers.find(o=>o.id===id)).filter(Boolean),first=offers[0];
 const match=offers.length>1&&offers.every(o=>o.productKey===first.productKey&&norm(o.spec)===norm(first.spec)&&norm(o.unit)===norm(first.unit)&&o.packageSpec&&norm(o.packageSpec)===norm(first.packageSpec)&&!o.unitNote);
 const multiple=new Set(offers.map(o=>o.supplierId)).size>1;
 const min=match&&multiple?Math.min(...offers.map(o=>o.total)):null;
 $('comparison-note').textContent=!offers.length?'حدد منتجين إلى أربعة منتجات من الجدول. يمكن تغيير المورد دون فقد الاختيارات.':offers.length===1?'أضف سعرًا آخر للمقارنة. اختر «كل الموردين» لعرض القوائم الأخرى.':!multiple?'المنتجات المحددة من المورد نفسه. أضف سعر مورد آخر للمقارنة بين الموردين.':match?'المواصفات ووحدة البيع وحجمها متطابقة. الفرق محسوب على السعر شامل الضريبة.':'عرض جنبًا إلى جنب فقط: يوجد اختلاف أو نقص في مواصفات المنتج أو وحدة البيع أو حجمها. تأكد منها قبل اختيار المورد.';
 $('comparison-cards').innerHTML=offers.map(o=>'<article class="comparison-card '+(min!==null&&o.total===min?'lowest':'')+'"><h3>'+esc(supplierName(o.supplierId))+'</h3><strong>'+esc(o.name)+'</strong><dl><dt>المواصفات</dt><dd><bdi>'+esc(o.spec)+'</bdi></dd><dt>وحدة البيع وحجمها</dt><dd>'+esc(o.unit)+' · '+esc(o.packageSpec||'الحجم / الطول يحتاج تأكيدًا')+'</dd><dt>قبل الضريبة + الضريبة</dt><dd class="num">'+money(o.price)+' + '+money(o.tax)+'</dd><dt>شامل الضريبة (ر.س)</dt><dd class="total num">'+money(o.total)+'</dd><dt>المصدر والتحديث</dt><dd>'+esc(o.source)+' · '+esc(o.updated)+(o.sourcePage?' · ص '+o.sourcePage:'')+'</dd></dl><p class="hint">'+esc(o.unitNote||'')+'</p>'+(min!==null?'<p>'+(o.total===min?'الأقل سعرًا للوحدة المطابقة':'الفرق عن الأقل: '+money(o.total-min)+' ر.س ('+money((o.total-min)/min*100)+'%)')+'</p>':'')+'<button type="button" class="ghost" data-remove="'+esc(o.id)+'">إزالة من المقارنة</button></article>').join('');
 $('comparison-cards').querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{selected.delete(b.dataset.remove);render();});
}
function editorOptions(){
 $('offer-supplier').innerHTML=data.suppliers.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.name)+'</option>').join('');
 $('reference').innerHTML='<option value="">منتج جديد غير مرتبط</option>'+data.offers.map(o=>'<option value="'+esc(o.id)+'">'+esc(o.name+' — '+o.spec+' — '+supplierName(o.supplierId))+'</option>').join('');
 const categories=[...new Set(data.offers.map(o=>o.category))].sort((a,b)=>a.localeCompare(b,'ar'));
 const old=$('category').value;
 $('category').innerHTML='<option value="">كل التصنيفات</option>'+categories.map(c=>'<option>'+esc(c)+'</option>').join('');
 if(categories.includes(old))$('category').value=old;
 $('category-list').innerHTML=categories.map(c=>'<option value="'+esc(c)+'">').join('');
}
function resetOffer(){
 $('offer-form').reset();$('offer-id').value='';$('offer-supplier').disabled=false;$('reference').disabled=false;
 $('offer-name').readOnly=false;$('offer-category').readOnly=false;message('offer-message','');
}
function copyReference(o){
 if(!o){$('offer-name').readOnly=false;$('offer-category').readOnly=false;return;}
 for(const [field,key] of [['name','name'],['category','category'],['spec','spec'],['unit','unit'],['package','packageSpec'],['note','unitNote']])$('offer-'+field).value=o[key]||'';
 $('offer-name').readOnly=true;$('offer-category').readOnly=true;
}
function fillOffer(id,editing){
 const o=data.offers.find(o=>o.id===id);resetOffer();copyReference(o);
 $('reference').value=o.id;
 if(editing){
  $('offer-id').value=o.id;$('offer-supplier').value=o.supplierId;$('offer-supplier').disabled=true;$('reference').disabled=true;
  $('offer-price').value=o.price;$('offer-vat').value=o.vat*100;$('offer-source').value=o.source;
 }else{
  const other=data.suppliers.find(s=>s.id!==o.supplierId);
  $('offer-supplier').value=other?.id||o.supplierId;
  message('offer-message',other?'أدخل سعر المورد الآخر وتأكد من المواصفات ووحدة البيع.':'أضف المورد الجديد أولًا من نموذج «إضافة مورد جديد».');
 }
 $('offer-details').open=true;$('offer-details').scrollIntoView({behavior:'smooth',block:'start'});
}
async function load(){
 message('status','جارٍ تحميل الموردين…');
 try{
  data=await api();selected=new Set([...selected].filter(id=>data.offers.some(o=>o.id===id)));
  $('management').hidden=!data.canEdit;if($('admin-link'))$('admin-link').hidden=!data.canEdit;$('actions-head').hidden=!data.canEdit;
  editorOptions();cards();render();message('status','');
 }catch(e){message('status',e.message);throw e;}
}
$('search').value=new URLSearchParams(location.search).get('search')||'';
$('search').oninput=render;$('category').onchange=render;$('sort').onchange=render;
$('refresh').onclick=()=>load().catch(()=>{});
$('clear-comparison').onclick=()=>{selected.clear();render();};
$('reference').onchange=()=>copyReference(data.offers.find(o=>o.id===$('reference').value));
$('reset-offer').onclick=resetOffer;
$('supplier-form').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 try{const result=await api('POST',{action:'supplier',name:$('supplier-name').value,kind:$('supplier-kind').value,source:$('supplier-source').value});await load();$('supplier-form').reset();$('offer-supplier').value=result.supplier.id;message('supplier-message','تم حفظ المورد. أضف أسعاره من النموذج التالي.',true);}
 catch(error){message('supplier-message',error.message);}finally{button.disabled=false;}
};
$('offer-form').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;
 const body={action:'offer',id:$('offer-id').value,supplierId:$('offer-supplier').value,referenceId:$('reference').value,name:$('offer-name').value,category:$('offer-category').value,spec:$('offer-spec').value,unit:$('offer-unit').value,packageSpec:$('offer-package').value,price:Number($('offer-price').value),vat:Number($('offer-vat').value)/100,source:$('offer-source').value,unitNote:$('offer-note').value};
 try{await api(body.id?'PUT':'POST',body);await load();resetOffer();message('offer-message','تم حفظ السعر وإتاحته للفريق.',true);}
 catch(error){message('offer-message',error.message);}finally{button.disabled=false;}
};
$('export').onclick=()=>{
 const rows=[['المورد','التصنيف','الصنف','المواصفات','وحدة البيع','حجم الوحدة','قبل الضريبة','الضريبة','شامل الضريبة','التحديث','المصدر','صفحة المصدر','ملاحظات'],...visible.map(o=>[supplierName(o.supplierId),o.category,o.name,o.spec,o.unit,o.packageSpec,o.price,o.tax,o.total,o.updated,o.source,o.sourcePage||'',o.unitNote])];
 const safe=v=>/^[\s]*[=+@-]/.test(String(v))?"'"+v:v;
 const csv='\uFEFF'+rows.map(row=>row.map(v=>'"'+String(safe(v??'')).replaceAll('"','""')+'"').join(',')).join('\r\n');
 const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='supplier-prices.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};
load().catch(()=>{});
})();