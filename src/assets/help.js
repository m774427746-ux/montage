// Short guidance: a one-line explanation under the tab bar for the open tab, and tooltips on the main buttons.
(()=>{
'use strict';
const TAB_HELP={
 sheets:'حاسبة الأوراق: اكتب مقاس القطعة والكمية، وتطلع لك عدد القطع في الورقة وعدد الأوراق المطلوبة.',
 stickers:'حاسبة الاستيكرات: احسب المساحة على الرول، أو خذ سعر بيع جاهز من البطاقة الذهبية. الربح يبدأ +10%، وسهم «زيادة الربح» يعدّله.',
 acrylic:'حاسبة الأكريليك: اختر المقاس والسماكة لمعرفة عدد القطع في اللوح والتكلفة.',
 banners:'حاسبة البنرات: اكتب العرض والطول، واختر الخدمة (طباعة، تركيب، حديد وتركيب)، وحرّك شريط الربح عند الحاجة.',
 suppliers:'الأسعار والموردون: أسعار شراء الخامات ومقارنتها بين الموردين.',
 'offset-products':'منتجات الأوفست: اختر المنتج والباقة، أو خذ سعر بيع جاهز من البطاقة الذهبية.',
 gifts:'الهدايا الدعائية: أكواب وأقلام ودروع وغيرها. اختر الصنف والكمية لمعرفة السعر.',
 cups:'قوالب الأكواب: اختر مقاس الكوب ونزّل القالب بالمقاس الفعلي.'
};
const BUTTON_HELP=[
 ['الأسعار والموردون','يفتح تبويب أسعار الشراء والمقارنة بين الموردين'],
 ['الفريق والإدارة','تبديل الحساب بين الفريق والإدارة'],
 ['خروج','تسجيل الخروج من المساحة'],
 ['مسح باركود','امسح باركود منتج لعرض بياناته وسعره'],
 ['توليد باركودات','ينشئ صفحة A4 من الباركودات للطباعة'],
 ['رجوع','يرجع للصفحة السابقة'],
 ['طريقة الاستخدام','يفتح شرح خطوات الاستخدام'],
 ['تحديث الأسعار','يعيد تحميل أحدث الأسعار'],
 ['تصدير النتائج','ينزّل النتائج الظاهرة كملف CSV']
];
function tabs(){
 const bar=document.querySelector('.tabbar .tabs');if(!bar)return;
 let help=document.getElementById('tab-help');
 if(!help){help=document.createElement('p');help.id='tab-help';help.className='tab-help';help.setAttribute('aria-live','polite');bar.after(help);}
 const buttons=[...bar.querySelectorAll('[data-tab]')];
 buttons.forEach(b=>{const t=TAB_HELP[b.dataset.tab];if(t){b.title=t;b.setAttribute('aria-description',t);}});
 const update=()=>{const active=buttons.find(b=>b.getAttribute('aria-selected')==='true');help.textContent=TAB_HELP[active?.dataset.tab]||'';};
 new MutationObserver(update).observe(bar,{subtree:true,attributes:true,attributeFilter:['aria-selected']});
 update();
}
function buttons(){
 document.querySelectorAll('button, a').forEach(el=>{
  if(el.title||el.closest('.tabs'))return;
  const text=el.textContent.replace(/\s+/g,' ').trim();
  const hit=BUTTON_HELP.find(([k])=>text.includes(k));
  if(hit){el.title=hit[1];el.setAttribute('aria-description',hit[1]);}
 });
}
function init(){tabs();buttons();setTimeout(buttons,1500);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
