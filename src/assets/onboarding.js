(()=>{
const key='asbarix-onboarding-v3';
const dialog=document.createElement('dialog');dialog.className='onboarding';dialog.setAttribute('aria-labelledby','onboarding-title');
dialog.innerHTML='<button type="button" class="ob-close" aria-label="إغلاق">×</button><h2 id="onboarding-title">أهلًا بك في مساحة الفريق</h2><ol><li><strong>اختر الأداة:</strong> كل أداة في تبويب، والسطر الصغير تحت الشريط يشرح التبويب المفتوح.</li><li><strong>سعر جاهز للبيع:</strong> في الاستيكرات والبنرات والأوفست والهدايا بطاقة ذهبية. اختر الصنف والكمية ويطلع لك سعر البيع، والباقة الناقصة تُحتسب كاملة.</li><li><strong>حاسبة البنرات:</strong> اكتب العرض والطول بالسنتيمتر، واختر الخدمة: طباعة فقط، أو مع التركيب، أو مع الحديد والتركيب.</li><li><strong>الربح:</strong> السعر يبدأ بزيادة 10% فوق سعر القائمة. اضغط السهم بجانب «زيادة الربح» وحرّك الشريط حتى 50%. سعر القائمة هو الحد الأدنى.</li><li><strong>الأسعار والموردون:</strong> أسعار شراء الخامات ومقارنتها بين الموردين.</li></ol><p>تقدر ترجع لهذه التعليمات من زر «طريقة الاستخدام».</p><div class="bar"><a href="/#banners">فتح حاسبة البنرات</a><button class="primary" type="button" id="onboarding-done">فهمت، ابدأ</button></div>';
document.body.append(dialog);
function show(){if(!dialog.open)dialog.showModal();}
let triggers=[...document.querySelectorAll('[data-help]')];
if(!triggers.length){const button=document.createElement('button');button.type='button';button.className='help-trigger';button.setAttribute('aria-label','طريقة الاستخدام');button.innerHTML='<span class="ht-icon" aria-hidden="true">؟</span><span class="ht-text">طريقة الاستخدام</span>';document.body.append(button);triggers=[button];}
triggers.forEach(button=>button.addEventListener('click',show));
function remember(){try{localStorage.setItem(key,'seen');}catch{}}
const done=()=>{remember();dialog.close();};dialog.querySelector('#onboarding-done').onclick=done;dialog.querySelector('.ob-close').onclick=done;dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)done();});
dialog.addEventListener('cancel',remember);
try{if(localStorage.getItem(key)!=='seen')show();}catch{show();}
})();