(() => {
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>Number(n).toLocaleString('ar-SA',{maximumFractionDigits:2});
const money=n=>Number(n).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';
const norm=s=>String(s??'').normalize('NFKC').toLowerCase().replace(/[أإآ]/g,'ا').replace(/[ة]/g,'ه').replace(/استيكر|استكر|ستيكر/g,'ستيكر').replace(/\s+/g,' ').trim();
let products=[],searchOpen=false;
const tools=[
 ['sheets','حاسبة الأفرخ والأوراق','كم قطعة في الفرخ؟ كم فرخ نحتاج؟','أفرخ ورق كروت طباعة'],
 ['stickers','حاسبة الاستيكرات','استيكرات بالمتر، استغلال الرولات','استكر ستكر رول متر'],
 ['acrylic','حاسبة الأكريليك','مساحة وتكلفة الأكريليك','الليزر تكلفة سم²'],
 ['offset-products','منتجات الأوفست الجاهزة','دفاتر فواتير، كروت، أكواب ورقية','طباعة جاهزة'],
 ['gifts','الهدايا الدعائية','أكواب وأقلام وأعلام','هدايا شعارات'],
 ['cups','قوالب الأكواب','ملفات SVG لقوالب الأكواب','قوالب كوب مخروط']
];
const jump=tab=>{
 const button=document.querySelector('[data-tab="'+tab+'"]');
 if(button){button.click();document.querySelector('.tabbar')?.scrollIntoView({behavior:'smooth',block:'start'});}
};
async function load(){
 for(const category of ['offset','gifts']) if($(category==='offset'?'offset-products-items':'gifts-items')){
  const id=category==='offset'?'offset-products-status':'gifts-status';
  $(id).textContent='جارٍ تحميل المنتجات…';
 }
 try{
  const res=await fetch('/api/manage?action=products',{credentials:'same-origin'});
  const data=await res.json();if(!res.ok)throw Error(data.message||'تعذّر تحميل المنتجات');
  products=data.items||[];renderCatalog('offset');renderCatalog('gifts');
  window.MontageCatalog={getProducts:()=>products.slice(),findProduct:(value)=>products.find(p=>p.sku===value||p.barcode===value)};
  document.dispatchEvent(new CustomEvent('montage:catalog-ready'));

  if(searchOpen)renderSearch();
 }catch(e){for(const id of ['offset-products-status','gifts-status'])if($(id))$(id).textContent=e.message;}
}
function card(p){
 const barcode=p.category==='gifts'&&p.barcode;
 const supplierNames=(p.suppliers||[]).map(x=>x.supplierName).filter(Boolean);
 const approved=typeof p.price==='number'&&p.price>0;
 const per=approved?p.price/p.packQty:null;
 return '<article class="montage-product" data-product="'+esc(p.id)+'"><div class="product-meta"><span>'+(p.category==='offset'?'أوفست':'هدية دعائية')+' · '+esc(p.unit)+'</span><strong class="product-sku">رقم '+esc(p.sku)+'</strong></div><h3>'+esc(p.name)+'</h3><p class="product-spec">'+esc(p.spec)+'</p><p class="product-price">'+(approved?money(p.price)+' <small>للباقة من '+num(p.packQty)+' '+esc(p.unit)+'</small>':'السعر بانتظار اعتماد الإدارة')+'</p><div class="product-controls"><label>عدد الباقات <select data-pack="'+esc(p.id)+'">'+[1,2,3,5,10,20,50].map(n=>'<option value="'+n+'">'+num(n)+'</option>').join('')+'</select></label><div data-amount="'+esc(p.id)+'" class="product-total">'+(approved?money(p.price):'—')+'</div></div><details><summary>المواصفات وسعر الوحدة</summary><p>'+esc(p.notes||'يُحدّد التجهيز والمواصفات النهائية حسب طلب العميل.')+'</p><p>الباقة: '+num(p.packQty)+' '+esc(p.unit)+'</p><p>سعر الحبة: '+(approved?money(per):'لم يُعتمد بعد')+'</p><p>السعر لا يشمل خدمات أو ضريبة لم تعتمدها الإدارة ضمن الباقة.</p>'+(supplierNames.length?'<p>الموردون: '+esc(supplierNames.join('، '))+'</p>':'')+'</details>'+(barcode?'<details class="product-barcode"><summary>باركود المنتج</summary><div data-barcode-product="'+esc(p.id)+'"></div><button type="button" class="btn" data-barcode-download="'+esc(p.id)+'">تنزيل باركود SVG</button></details>':'')+'</article>';
}
function renderCatalog(category){
 const prefix=category==='offset'?'offset-products':'gifts',wrap=$(prefix+'-items'),q=norm($(prefix+'-search').value);
 const visible=products.filter(p=>p.category===category&&p.active!==false&&norm([p.sku,p.barcode,p.name,p.spec,p.notes,p.unit].join(' ')).includes(q));
 wrap.innerHTML=visible.map(card).join('')||'<p class="hint">ما لقينا منتجات مطابقة. جرّب كلمة أخرى.</p>';
 $(prefix+'-status').textContent=visible.length+' منتج · الأسعار المعروضة تعتمدها الإدارة فقط';
 wrap.querySelectorAll('[data-barcode-product]').forEach(el=>{
  const p=products.find(x=>x.id===el.dataset.barcodeProduct);
  if(p?.barcode&&window.MontageBarcode)el.innerHTML=window.MontageBarcode.encode(p.barcode);
 });
 wrap.querySelectorAll('[data-barcode-download]').forEach(button=>button.onclick=()=>{
  const p=products.find(x=>x.id===button.dataset.barcodeDownload);
  if(p?.barcode)window.MontageBarcode.download(p.barcode);
 });
 wrap.querySelectorAll('[data-pack]').forEach(select=>select.onchange=()=>{
  const p=products.find(x=>x.id===select.dataset.pack);wrap.querySelector('[data-amount="'+p.id+'"]').textContent=p.price===null?'بانتظار التسعير':money(p.price*Number(select.value));
 });
}
for(const [category,prefix] of [['offset','offset-products'],['gifts','gifts']])$(prefix+'-search')?.addEventListener('input',()=>renderCatalog(category));
const header=document.querySelector('header.top .brandrow')||document.querySelector('header.top');
// Primary navigation: logo always returns to the workspace, and back follows history when safe.
const brandLogo=document.querySelector('header.top .brand .logo');
if(brandLogo){
 const home=document.createElement('a');home.href='/';home.className='brand-home';home.setAttribute('aria-label','العودة إلى الرئيسية');
 brandLogo.replaceWith(home);home.append(brandLogo);
}
const back=document.createElement('button');back.type='button';back.className='global-back';back.textContent='← رجوع';
back.addEventListener('click',()=>{
 if(document.referrer&&new URL(document.referrer).origin===location.origin&&history.length>1)history.back();
 else{const current=location.hash.slice(1);if(current&&current!=='sheets')jump('sheets');else location.href='/';}
});
header.append(back);
const searchButton=document.createElement('button');
searchButton.type='button';searchButton.id='global-search-button';searchButton.className='global-search-button';
searchButton.setAttribute('aria-haspopup','dialog');
searchButton.setAttribute('aria-label','ابحث في كل أدوات مونتاج');
searchButton.innerHTML='<span aria-hidden="true">⌕</span><b>ابحث عن أي أداة أو منتج</b><kbd>Ctrl K</kbd>';
header.append(searchButton);
const overlay=document.createElement('div');overlay.id='montage-search-overlay';overlay.className='montage-search-overlay';overlay.hidden=true;
overlay.innerHTML='<div class="search-backdrop" data-close></div><section role="dialog" aria-modal="true" aria-labelledby="montage-search-title" class="search-dialog"><div class="search-dialog-head"><h2 id="montage-search-title">وش تحتاج تصمم اليوم؟</h2><button type="button" class="search-close" aria-label="إغلاق البحث" data-close>✕</button></div><label for="montage-search-input">ابحث في الأدوات والمنتجات والمقاسات</label><input id="montage-search-input" type="search" autocomplete="off" placeholder="مثال: استيكر 5 سم، أوفست، أكواب، فواتير…"><div id="montage-search-results" role="listbox" aria-label="نتائج البحث"></div><p class="hint">Enter لفتح أول نتيجة · Esc للإغلاق</p></section>';
document.body.append(overlay);
let previousFocus=null;
function openSearch(){previousFocus=document.activeElement;overlay.hidden=false;searchOpen=true;document.body.classList.add('search-is-open');$('montage-search-input').value='';renderSearch();requestAnimationFrame(()=>$('montage-search-input').focus());}
function closeSearch(){overlay.hidden=true;searchOpen=false;document.body.classList.remove('search-is-open');previousFocus?.focus?.();}
function results(){
 const q=norm($('montage-search-input').value);
 const toolMatches=tools.filter(t=>!q||norm(t.join(' ')).includes(q)).map(t=>({title:t[1],description:t[2],tab:t[0]}));
 const matchedProducts=products.filter(p=>!q||norm([p.sku,p.barcode,p.name,p.spec,p.notes,p.unit].join(' ')).includes(q)).slice(0,15).map(p=>({title:p.name,description:p.spec,tab:p.category==='offset'?'offset-products':'gifts',product:p.id}));
 return [...toolMatches,...matchedProducts].slice(0,20);
}
function renderSearch(){
 const list=results();
 $('montage-search-results').innerHTML=list.map((r,i)=>'<button type="button" class="global-search-hit" data-result="'+i+'" role="option"><b>'+esc(r.title)+'</b><small>'+esc(r.description)+'</small></button>').join('')||'<p class="search-empty">ما لقينا نتيجة. جرّب اسم الخامة أو مقاسها.</p>';
 $('montage-search-results').querySelectorAll('[data-result]').forEach(btn=>btn.onclick=()=>activate(list[Number(btn.dataset.result)]));
}
function activate(r){if(!r)return;closeSearch();jump(r.tab);if(r.product){const el=document.querySelector('[data-product="'+r.product+'"]');el?.scrollIntoView({behavior:'smooth',block:'center'});el?.classList.add('found-product');setTimeout(()=>el?.classList.remove('found-product'),1700);}}
searchButton.onclick=openSearch;
overlay.querySelectorAll('[data-close]').forEach(b=>b.onclick=closeSearch);
$('montage-search-input').addEventListener('input',renderSearch);
document.addEventListener('keydown',e=>{
 if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();searchOpen?closeSearch():openSearch();}
 if(!searchOpen)return;
 if(e.key==='Escape'){e.preventDefault();closeSearch();}
 if(e.key==='Enter'){e.preventDefault();activate(results()[0]);}
 if(e.key==='Tab'){const list=[...overlay.querySelectorAll('button,input')];const index=list.indexOf(document.activeElement);if(e.shiftKey&&index===0){e.preventDefault();list[list.length-1].focus();}else if(!e.shiftKey&&index===list.length-1){e.preventDefault();list[0].focus();}}
});
function createSelect(label,options,handler){
 const wrap=document.createElement('label');wrap.className='preset-select';wrap.textContent=label;
 const sel=document.createElement('select');sel.className='sel';
 options.forEach(o=>{const x=document.createElement('option');x.value=String(o.value);x.textContent=o.label;sel.append(x);});
 sel.onchange=()=>handler(sel.value);wrap.append(sel);return wrap;
}
function setInput(id,val){const el=$(id);if(!el)return;el.value=String(val);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
function presets(){
 const sheets=$('sh-presets')?.closest('.side'),stickers=$('st-presets')?.closest('.side'),acrylic=$('ac-w')?.closest('.side');
 if(sheets){
  const items=[['9 × 5 سم',9,5],['A6',10.5,14.8],['A5',14.8,21],['A4',21,29.7],['6 × 6 سم',6,6]];
  sheets.insertBefore(createSelect('مقاسات جاهزة متكررة',items.map((v,i)=>({value:i,label:v[0]})),i=>{setInput('sh-w',items[i][1]);setInput('sh-h',items[i][2]);}),sheets.firstChild);
 }
 if(stickers){
  const items=[['دائري 3 سم',3,3,'circle'],['دائري 5 سم',5,5,'circle'],['دائري 7 سم',7,7,'circle'],['مربع 5 × 5 سم',5,5,'square'],['مستطيل 5 × 8 سم',5,8,'rect'],['مستطيل 10 × 15 سم',10,15,'rect']];
  stickers.insertBefore(createSelect('مقاسات الاستيكر الشائعة',items.map((v,i)=>({value:i,label:v[0]})),i=>{
   const entry=items[i];document.querySelector('#st-shape [data-v="'+entry[3]+'"]')?.click();setInput('st-w',entry[1]);setInput('st-h',entry[2]);
  }),stickers.firstChild);
 }
 if(acrylic){
  const list=[['5 × 7 سم',5,7],['10 × 15 سم',10,15],['15 × 20 سم',15,20],['20 × 30 سم',20,30]];
  acrylic.insertBefore(createSelect('المقاسات الشائعة للأكريليك',list.map((v,i)=>({value:i,label:v[0]})),i=>{setInput('ac-w',list[i][1]);setInput('ac-h',list[i][2]);}),acrylic.firstChild);
 }
 const form=$('offset-form');if(form){
  const presets=[['SRA3 — 32 × 45 سم',320,450],['SRA3 — 33 × 48 سم',330,480],['50 × 70 سم',500,700],['70 × 100 سم',700,1000]];
  const el=createSelect('مقاسات أفرخ الأوفست المتداولة',presets.map((v,i)=>({value:i,label:v[0]})),i=>{
   setOffset('sheetW',presets[i][1]);setOffset('sheetH',presets[i][2]);});
  form.prepend(el);
 }
 function setOffset(name,value){const el=form.elements.namedItem(name);el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));}
}
function details(){
 // Keep important KPIs visible and place technical breakdown behind one consistent disclosure.
 for(const tab of ['sheets','stickers']){
  const root=$('tab-'+tab),main=root?.querySelector('.main');if(!main)continue;
  const sections=[...main.children];
  const firstKpis=main.querySelector('.kpis');
  const more=document.createElement('details');more.className='calculator-more';
  more.innerHTML='<summary>المزيد: المعاينة، تحميل الملفات ومقارنات المقاسات</summary>';
  const header=main.querySelector('.layouthead');
  if(header){const elements=[...main.children];for(const node of elements){if(node===firstKpis||node===more)continue;more.append(node);}main.append(more);}
 }
}
function stickerByMeter(){
 const qty=$('st-qty'),kpis=$('st-kpis'),side=qty?.closest('.side');if(!qty||!kpis||!side)return;
 const wrap=document.createElement('section');wrap.className='meter-control';
 wrap.innerHTML='<div class="meter-tabs" role="group" aria-label="طريقة حساب الاستيكر"><button type="button" data-unit="pieces" aria-pressed="true">بالعدد</button><button type="button" data-unit="meters" aria-pressed="false">بالمتر الطولي</button></div><label id="meter-amount-label" hidden>عدد الأمتار المطلوبة <select class="sel" id="meter-amount">'+[1,2,3,5,10,15,20,25,50,100].map(n=>'<option value="'+n+'">'+n+' متر</option>').join('')+'</select></label><p id="meter-note" role="status" class="hint"></p><div id="meter-summary" class="meter-summary" aria-live="polite"></div>';
 qty.closest('.field').before(wrap);
 let mode='pieces',meters=1;const note=$('meter-note'),summary=$('meter-summary');
 const latin=s=>String(s||'').replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/,/g,'').replace(/[^0-9.]/g,'');
 function update(){
  const first=kpis.querySelector('.kpi'),perMeter=Number(latin(first?.querySelector('.v')?.textContent||''));
  const valid=Number.isFinite(perMeter)&&perMeter>0;
  qty.closest('.field').hidden=mode==='meters';$('meter-amount-label').hidden=mode!=='meters';
  if(!valid){summary.textContent='أدخل مقاسًا صالحًا وعرض الرول أولًا.';return;}
  const count=Math.floor(perMeter*meters);
  if(mode==='meters'&&Number(qty.value)!==Math.max(1,count)){
   // Update only if changed so the existing calculator does not enter a feedback loop.
   setInput('st-qty',Math.max(1,count));
  }
  const rawPrice=$('st-price').value,rate=Number(rawPrice),linear=document.querySelector('#st-pmode [aria-pressed="true"]')?.dataset.v==='lin';
  const priced=rawPrice!==''&&Number.isFinite(rate)&&rate>=0;
  let priceInfo='';
  if(priced&&linear)priceInfo='<span>سعر المتر الطولي: '+money(rate)+' · سعر الحبة تقريبيًا: '+money(rate/perMeter)+'</span>';
  else if(priced)priceInfo='<span>سعر الإدخال: '+money(rate)+' لكل متر مربع. يعرض حساب التوزيع التكلفة حسب عرض الرول.</span>';
  summary.innerHTML='<strong>'+num(perMeter)+' حبة في المتر الطولي</strong><span>'+(mode==='meters'?num(meters)+' متر طولي ≈ '+num(count)+' حبة':'اختر بالمتر لحساب أي طول من الرول')+'</span>'+priceInfo;
  note.textContent=mode==='meters'?'العدد تقريبي وفق توزيع متر كامل؛ راجع طول آخر صف وهوامش القص في المزيد.':'يمكنك التبديل بين الحبات والأمتار في أي وقت.';
 }
 wrap.querySelectorAll('[data-unit]').forEach(btn=>btn.onclick=()=>{
  mode=btn.dataset.unit;wrap.querySelectorAll('[data-unit]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));update();
 });
 $('meter-amount').onchange=e=>{meters=Number(e.target.value);update();};
 let scheduled=false;
 const observer=new MutationObserver(()=>{
  if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;update();});
 });
 observer.observe(kpis,{childList:true});
 $('st-price').addEventListener('input',update);
 update();
}
// Features are isolated: an unsupported control must never block the entire workspace.
for(const feature of [presets,details,stickerByMeter]){
 try{feature();}catch(error){console.warn('Montage optional tool unavailable:',error);}
}
load().catch(error=>console.warn('Catalog loading failed:',error));
})();