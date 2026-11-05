(()=>{
const key='asbarix-onboarding-pricing-v2';
const dialog=document.createElement('dialog');dialog.className='onboarding';dialog.setAttribute('aria-labelledby','onboarding-title');
dialog.innerHTML='<h2 id="onboarding-title">أهلًا بك في مساحة الفريق</h2><ol><li><strong>أسعار البيع:</strong> افتح «أسعار البيع والحد الأدنى» للأسعار المرفقة. اختر المقاس والباقة؛ الكمية غير المكتملة تُحتسب باقة كاملة. خانة الربح تبقى غير محسوبة حتى تعتمد الإدارة التكلفة، وحالة الضريبة في الملف غير محددة.</li><li><strong>اختر الصنف:</strong> افتح الموردين، ابحث عن الاستيكر أو الفلين أو المنتج المطلوب، واضغط «تسعير الكمية».</li><li><strong>أدخل الكمية والمقاس:</strong> مثل 1000 حبة بمقاس 5 × 5 سم. السعر يتحدث تلقائيًا من تكلفة المورد وبيانات الإنتاج.</li><li><strong>الربح تلقائي:</strong> يبدأ بأعلى هامش تسمح به الإدارة. افتح سهم «تعديل الربح» لإظهار شريط السحب وتقليله حتى الحد الأدنى.</li><li><strong>راجع حالة العرض:</strong> تقدير الخامة لا يشمل الطباعة والقص غير المعتمدين. نسخ العرض يتاح بعد اعتماد التكاليف من الإدارة.</li></ol><p>يمكنك إعادة هذه التعليمات من زر «طريقة الاستخدام».</p><div class="bar"><a href="/suppliers">فتح الموردين</a><button class="primary" type="button" id="onboarding-done">فهمت، ابدأ</button></div>';
document.body.append(dialog);
function show(){if(!dialog.open)dialog.showModal();}
let triggers=[...document.querySelectorAll('[data-help]')];
if(!triggers.length){const button=document.createElement('button');button.type='button';button.className='help-trigger';button.textContent='طريقة الاستخدام';document.body.append(button);triggers=[button];}
triggers.forEach(button=>button.addEventListener('click',show));
function remember(){try{localStorage.setItem(key,'seen');}catch{}}
dialog.querySelector('button').onclick=()=>{remember();dialog.close();};
dialog.addEventListener('cancel',remember);
try{if(localStorage.getItem(key)!=='seen')show();}catch{show();}
})();