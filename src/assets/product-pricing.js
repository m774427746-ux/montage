(()=>{
'use strict';
const $=id=>document.getElementById(id),id=new URLSearchParams(location.search).get('id');
let data,quote,timer,sequence=0;
const money=(n,d=2)=>Number(n).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:d});
function invalidate(text='جارٍ حساب السعر…'){
 quote=null;$('product-total').textContent='—';$('product-per').textContent='—';$('product-profit').textContent='—';$('product-breakdown').textContent='';$('copy-product-quote').disabled=true;$('product-quote-text').value='';$('quote-status').textContent=text;
}
async function api(method='GET',body){
 const response=await fetch('/api/product-quote'+(method==='GET'?'?id='+encodeURIComponent(id):''),{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify({id,...body})}:{})});
 const result=await response.json();
 if(response.status===401){location.replace('/login?role=team');throw Error('انتهت الجلسة.');}
 if(!response.ok)throw Error(result.message||'تعذّر حساب السعر.');
 return result;
}
function modeFields(){
 const unit=$('cost-mode').value==='unit';
 document.querySelectorAll('.geometry').forEach(n=>n.hidden=unit);
 for(const n of [$('stock-width'),$('stock-length')]){n.required=!unit;n.disabled=unit;}
 $('pack-field').hidden=!unit;$('pack-qty').required=unit;$('pack-qty').disabled=!unit;
}
function configure(){
 const p=data.profile||{};
 $('product-name').textContent=data.offer.name;
 $('product-spec').textContent=data.offer.spec+' · '+data.offer.unit+' · سعر المورد '+money(data.offer.total)+' ر.س شامل ضريبة الشراء';
 $('basis-note').textContent=data.provisional?'طول رول الاستيكر 50 مترًا حسب اعتمادك. هذا تقدير للخامة مع الربح فقط؛ يلزم اعتماد الطباعة والقص والتالف من الإدارة قبل نسخ عرض نهائي.':data.ready?'التسعير محمي حسب التكاليف المعتمدة. الخامة بالرول تُحسب على الطول المستخدم، والألواح والعبوات كوحدات شراء كاملة. الربح الفعلي يعتمد على اكتمال التكاليف ودقة التنفيذ.':'بيانات وحدة الشراء والإنتاج غير معتمدة لهذا الصنف. أكملها من حساب الإدارة ليظهر الإجمالي تلقائيًا.';
 $('dimensions').hidden=p.mode==='unit';$('piece-width').disabled=p.mode==='unit';$('piece-height').disabled=p.mode==='unit';
 $('product-margin').min=data.policy.minMargin;$('product-margin').max=data.policy.maxMargin;$('product-margin').value=data.policy.maxMargin;
 $('margin-label').textContent=data.policy.maxMargin+'%';
 $('margin-limits').textContent='يبدأ تلقائيًا عند '+data.policy.maxMargin+'%، ولا يقل عن '+data.policy.minMargin+'%. الهامش نسبة من سعر البيع.';
 $('cost-management').hidden=!data.canEdit;
 $('cost-mode').value=p.mode||'unit';
 const mapping={'stock-width':'stockWidthCm','stock-length':'stockLengthCm','pack-qty':'packQty','setup-cost':'setupCost','piece-cost':'costPerPiece','area-cost':'costPerM2','waste-pct':'wastePct','gap-mm':'gapMm'};
 for(const [input,key] of Object.entries(mapping))$(input).value=p[key]??'';
 if(data.provisional)for(const input of ['setup-cost','piece-cost','area-cost','waste-pct','gap-mm'])$(input).value='';
 $('cost-confirmed').checked=data.ready;modeFields();
 $('pricing-content').hidden=false;$('pricing-status').textContent='';
 schedule();
}
function schedule(){
 const seq=++sequence;clearTimeout(timer);
 $('margin-label').textContent=$('product-margin').value+'%';invalidate();
 if(!data?.profile){invalidate('اعتماد التكلفة مطلوب قبل التسعير.');return;}
 if(!$('quantity-form').checkValidity()){invalidate('راجع الكمية والمقاس.');return;}
 timer=setTimeout(()=>calculate(seq),200);
}
async function calculate(seq){
 try{
  const result=await api('POST',{qty:Number($('product-qty').value),widthCm:Number($('piece-width').value),heightCm:Number($('piece-height').value),margin:Number($('product-margin').value)});
  if(seq!==sequence)return;
  quote=result;
  $('quote-kind').textContent=result.provisional?'تقدير الخامة مع الربح فقط':'الإجمالي مع الربح';
  $('profit-caption').textContent=result.provisional?'ربح تقديري قبل الإنتاج':'الربح حسب التكاليف المعتمدة';
  $('product-total').textContent=money(result.total);$('product-per').textContent=money(result.per,6);$('product-profit').textContent=money(result.profit);
  $('product-breakdown').textContent='أقل سعر حسب التكاليف المدخلة: '+money(result.minimumTotal)+' ر.س · الخامة: '+money(result.materialCost)+' ر.س · الإنتاج والتجهيز: '+money(result.productionCost)+' ر.س · '+result.plannedQty+' حبة بعد التالف'+(result.mode==='roll'?' · طول مستخدم: '+money(result.areaM2/(data.profile.stockWidthCm/100),4)+' م': ' · وحدات شراء: '+result.packs)+' · الهامش '+result.margin+'%.';
  $('quote-status').textContent=result.provisional?'أضف تكاليف الطباعة والقص والتالف لاعتماد العرض.':'السعر ضمن حدود الربح المعتمدة، قبل ضريبة البيع.';
  $('copy-product-quote').disabled=result.provisional;
  if(!result.provisional)$('product-quote-text').value='أسبار\n'+result.name+'\n'+result.qty+' حبة'+(result.mode==='unit'?'':' · '+$('piece-width').value+' × '+$('piece-height').value+' سم')+'\nمتوسط الحبة: '+money(result.per,6)+' ر.س\nالإجمالي المعتمد: '+money(result.total)+' ر.س\nقبل ضريبة البيع. الإجمالي هو المعتمد؛ سعر الحبة متوسط تقريبي.';
 }catch(error){if(seq===sequence)invalidate(error.message);}
}
['product-qty','piece-width','piece-height','product-margin'].forEach(key=>$(key).addEventListener('input',schedule));
$('quantity-form').onsubmit=e=>{e.preventDefault();schedule();};
$('reset-margin').onclick=()=>{$('product-margin').value=data.policy.maxMargin;schedule();};
$('cost-mode').onchange=modeFields;
$('cost-form').onsubmit=async e=>{
 e.preventDefault();const button=e.submitter;button.disabled=true;++sequence;clearTimeout(timer);invalidate('جارٍ اعتماد التكلفة…');
 const val=key=>$(key).value===''?null:Number($(key).value);
 try{
  await api('PUT',{profile:{mode:$('cost-mode').value,stockWidthCm:val('stock-width'),stockLengthCm:val('stock-length'),packQty:val('pack-qty'),setupCost:val('setup-cost'),costPerPiece:val('piece-cost'),costPerM2:val('area-cost'),wastePct:val('waste-pct'),gapMm:val('gap-mm'),confirmed:$('cost-confirmed').checked}});
  data=await api();configure();$('cost-status').textContent='تم اعتماد التكلفة. أصبحت التسعيرة متاحة للفريق.';
 }catch(error){$('cost-status').textContent=error.message;invalidate('تعذّر تأكيد تحديث التكلفة. حدّث الصفحة قبل إصدار عرض.');}
 finally{button.disabled=false;}
};
$('copy-product-quote').onclick=async()=>{
 if(!quote||quote.provisional)return;
 try{await navigator.clipboard.writeText($('product-quote-text').value);$('quote-status').textContent='تم نسخ عرض السعر.';}
 catch{$('product-quote-text').hidden=false;$('product-quote-text').select();$('quote-status').textContent='انسخ العرض من مربع النص.';}
};
if(!id){$('pricing-status').textContent='اختر صنفًا من صفحة الموردين واضغط «تسعير الكمية».';return;}
api().then(result=>{data=result;configure();}).catch(error=>{$('pricing-status').textContent=error.message;});
})();