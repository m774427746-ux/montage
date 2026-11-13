// Ready sale prices (the attached price list) inside each tool tab, with an optional profit increase.
// Containers: <div class="ready-prices" data-group="stickers|banners|offset|gifts"></div>
// The banner calculator (#banner-calc) maps size + service to the list's per-square-metre banner items.
(()=>{
'use strict';
const GROUPS={
 stickers:['ستيكر sticker'],
 banners:['بنر banner','فلكس','ستاند أب رول','كانفاس','بوب أب'],
 offset:['ورق','منتجات ورقية وأخرى','ملف','بروشات','شهادة شكر','تعليقة ID','بطاقة ID','اختام','أختام','تصاميم','أخرى'],
 gifts:['أكواب','تي شيرت','تيشيرتات','ميداليات','كابات','أقلام','أكياس قماش','أكياس قماس','خدادية','بروش','دروع','درع','درع خشبي','لوحة مكتب خشب','دروع كريلك']
};
const TITLES={stickers:'أسعار الاستيكرات الجاهزة',banners:'أسعار البنرات واللوحات الجاهزة',offset:'أسعار المطبوعات الجاهزة',gifts:'أسعار الهدايا الجاهزة'};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';
const norm=s=>String(s).replace(/[أإآ]/g,'ا').replace(/استيكر|استكر|ستكر/g,'ستيكر').replace(/\s+/g,' ').trim();
let items=null,loading=null,increaseMax=50;

function load(){
 if(!loading)loading=fetch('/api/retail-prices',{credentials:'same-origin'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.message||'تعذّر تحميل الأسعار.');items=d.items||[];increaseMax=d.increaseMax||50;return items;});
 return loading;
}
async function quote(id,qty,increase){
 const r=await fetch('/api/retail-prices',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,qty,discount:100,increase})});
 const d=await r.json();if(!r.ok)throw Error(d.message||'تعذّر حساب السعر.');return d;
}
// Shared "increase profit" slider markup.
// Compact and folded by default: starts at +10%, the arrow reveals the slider.
const DEFAULT_INCREASE=10;
const sliderHtml=(id)=>`<details class="rp-profit"><summary title="اضغط لتعديل زيادة الربح"><span class="rp-profit-label">زيادة الربح</span><output id="${id}-out">${DEFAULT_INCREASE}%</output><span class="rp-chev" aria-hidden="true"></span></summary><div class="rp-profit-body"><input id="${id}" type="range" min="0" max="${increaseMax}" step="1" value="${DEFAULT_INCREASE}" aria-label="زيادة الربح بالنسبة المئوية"><div class="rp-scale" aria-hidden="true"><span>0%</span><span>${increaseMax}%</span></div><small>سعر القائمة هو الحد الأدنى، والشريط يرفع سعر البيع فوقه.</small></div></details>`;
const resultHtml=(d,unitWord)=>`<div class="rp-result"><div><span>سعر البيع</span><strong>${money(d.total)}</strong></div><div><span>سعر ${unitWord}</span><strong>${money(d.per)}</strong></div><div><span>الربح الإضافي</span><strong>${money(d.extra||0)}</strong></div></div>`+(d.chargedQty/d.packs>1?`<p class="rp-note">يُحتسب ${d.packs} باقة كاملة (${d.chargedQty} حبة).</p>`:'');

function mountList(box){
 const group=box.dataset.group,uid='rp-'+group;
 box.innerHTML=`<details class="rp-card" open><summary><span class="rp-badge">جاهز للبيع</span>${TITLES[group]||'أسعار جاهزة'}<small>اختر الصنف والكمية، ويطلع لك سعر البيع مباشرة.</small></summary>
 <div class="rp-grid"><div class="rp-field"><label for="${uid}-q">ابحث</label><input id="${uid}-q" type="search" placeholder="اكتب جزءًا من اسم الصنف"></div>
 <div class="rp-field rp-wide"><label for="${uid}-item">الصنف</label><select id="${uid}-item"></select></div>
 <div class="rp-field"><label for="${uid}-qty">الكمية</label><input id="${uid}-qty" type="number" min="1" step="1" value="1" inputmode="numeric"></div></div>
 ${sliderHtml(uid+'-inc')}<div class="rp-out" id="${uid}-out" role="status" aria-live="polite"><p class="rp-note">جارٍ تحميل الأسعار…</p></div></details>`;
 const $=s=>box.querySelector('#'+uid+s);let seq=0,timer;
 const list=()=>{const q=norm($('-q').value);const cats=GROUPS[group]||[];const sel=$('-item'),prev=sel.value;
  const rows=items.filter(i=>cats.includes(i.category)&&(!q||norm(i.name).includes(q)));
  sel.innerHTML=rows.map(i=>`<option value="${esc(i.id)}">${esc(i.name)}${i.minimum===null?' — السعر غير محدد':' — '+money(i.minimum)}${i.packQty>1?' / '+i.packQty+' حبة':''}</option>`).join('')||'<option value="">لا توجد نتائج</option>';
  if(rows.some(i=>i.id===prev))sel.value=prev;else{const it=rows[0];if(it)$('-qty').value=it.packQty||1;}
  run();};
 const run=()=>{const id=$('-item').value,s=++seq;clearTimeout(timer);$('-inc-out').textContent=$('-inc').value+'%';
  if(!id){$('-out').innerHTML='<p class="rp-note">اختر صنفًا.</p>';return;}
  timer=setTimeout(async()=>{try{const d=await quote(id,Number($('-qty').value),Number($('-inc').value));if(s!==seq)return;$('-out').innerHTML=resultHtml(d,'الوحدة');}catch(e){if(s===seq)$('-out').innerHTML='<p class="rp-note rp-warn">'+esc(e.message)+'</p>';}},180);};
 $('-q').addEventListener('input',list);$('-item').addEventListener('change',()=>{const it=items.find(i=>i.id===$('-item').value);if(it)$('-qty').value=it.packQty||1;run();});
 $('-qty').addEventListener('input',run);$('-inc').addEventListener('input',run);
 load().then(list).catch(e=>{$('-out').innerHTML='<p class="rp-note rp-warn">'+esc(e.message)+'</p>';});
}

// Banner calculator: per-square-metre banner items from the list. Iron always comes with installation in the list.
const BANNER_ITEMS={print:{plain:'list-1',design:'list-3'},install:{plain:'list-8',design:'list-6'},iron:{plain:'list-7',design:'list-5'}};
function mountBanner(root){
 const $=id=>root.querySelector('#'+id);let seq=0,timer;
 const run=()=>{const w=Number($('bn-w').value),h=Number($('bn-h').value),s=++seq;clearTimeout(timer);$('bn-inc-out').textContent=$('bn-inc').value+'%';
  if(!(w>0&&h>0&&w<=1000&&h<=1000)){$('bn-out').innerHTML='<p class="rp-note rp-warn">اكتب العرض والطول بالسنتيمتر (حتى 1000 سم).</p>';return;}
  const area=Math.max(1,Math.ceil(w*h/10000)),qty=Math.max(1,Number($('bn-count').value)||1);
  const id=BANNER_ITEMS[$('bn-service').value][$('bn-design').checked?'design':'plain'];
  timer=setTimeout(async()=>{try{const d=await quote(id,area*qty,Number($('bn-inc').value));if(s!==seq)return;
   $('bn-out').innerHTML=`<p class="rp-note">المساحة ${area} م² لكل بنر${qty>1?' × '+qty+' بنرات':''} (تُقرّب للمتر المربع الكامل).</p>`+resultHtml(d,'المتر');}
   catch(e){if(s===seq)$('bn-out').innerHTML='<p class="rp-note rp-warn">'+esc(e.message)+'</p>';}},180);};
 for(const id of ['bn-w','bn-h','bn-count','bn-inc'])$(id).addEventListener('input',run);
 for(const id of ['bn-service','bn-design'])$(id).addEventListener('change',run);
 load().then(run).catch(e=>{$('bn-out').innerHTML='<p class="rp-note rp-warn">'+esc(e.message)+'</p>';});
}

function init(){
 const bn=document.getElementById('banner-calc');
 if(bn){bn.querySelector('.rp-profit-slot').outerHTML=sliderHtml('bn-inc');mountBanner(bn);}
 document.querySelectorAll('.ready-prices[data-group]').forEach(mountList);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
