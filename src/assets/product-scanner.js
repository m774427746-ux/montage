(()=>{'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const price=n=>Number(n).toLocaleString('ar-SA',{minimumFractionDigits:2,maximumFractionDigits:2})+' ر.س';
const scan=document.createElement('div');scan.className='montage-scanner';scan.id='montage-scanner';scan.hidden=true;
scan.innerHTML='<div class="scan-shade" data-scan-close></div><section class="scan-dialog" role="dialog" aria-modal="true" aria-labelledby="scan-title"><header><h2 id="scan-title">مسح باركود منتج</h2><button type="button" class="scan-close" data-scan-close aria-label="إغلاق">✕</button></header><p class="scan-intro">امسح باركود الهدية الدعائية، أو أدخل رقم أي منتج. يمكنك استخدام قارئ باركود USB في حقل البحث.</p><div class="scan-toolbar"><button type="button" id="scan-camera-start" class="scan-primary">فتح الكاميرا</button><button type="button" id="scan-camera-stop" class="scan-secondary" hidden>إيقاف الكاميرا</button></div><div id="scan-video-container" hidden><video id="scan-video" autoplay muted playsinline aria-label="معاينة الكاميرا لمسح الباركود"></video><div class="scan-video-frame"></div></div><form id="scan-lookup-form"><label for="scan-value">رقم المنتج أو الباركود</label><div class="scan-input-row"><input id="scan-value" autocomplete="off" inputmode="text" placeholder="مثال: GFT000016 أو 000016" required><button type="submit" class="scan-primary">عرض المنتج</button></div></form><p id="scan-message" role="status" aria-live="polite" class="scan-message"></p><article id="scan-product-card" class="scan-product-card" hidden></article></section>';
document.body.append(scan);
// The scanner owns its launcher independently of optional calculator/catalog code.
const launcher=document.createElement('button');
launcher.type='button';launcher.id='montage-scan-launcher';launcher.className='global-back';
launcher.textContent='▥ مسح باركود';
launcher.setAttribute('aria-label','مسح باركود منتج أو البحث برقم المنتج');
const header=document.querySelector('header.top .brandrow')||document.querySelector('header.top');
if(header)header.append(launcher);
launcher.addEventListener('click',()=>open());
const $=id=>document.getElementById(id),message=(s)=>{$('scan-message').textContent=s;};
let stream=null,detector=null,frame=null,active=false,focusBefore=null,current=null,scanning=false,productCache=[];
const normalize=s=>String(s??'').trim().toUpperCase().replace(/[٠-٩۰-۹]/g,d=>{const n='٠١٢٣٤٥٦٧٨٩'.indexOf(d);return String(n>=0?n:'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));}).replace(/\s+/g,'');
function find(value){
 const q=normalize(value);if(!q)return null;
 const records=window.MontageCatalog?.getProducts?.()||productCache;
 return records.find(p=>normalize(p.barcode)===q||normalize(p.sku)===q)||null;
}
function textFor(p){
 const supplierNames=(p.suppliers||[]).map(s=>s.supplierName).filter(Boolean).join('، ');
 const approved=typeof p.price==='number'&&p.price>0;
 return ['مونتاج — معلومات المنتج','رقم المنتج: '+p.sku,...(p.barcode?['الباركود: '+p.barcode]:[]),'الاسم: '+p.name,'القسم: '+(p.category==='gifts'?'الهدايا الدعائية':'منتجات الأوفست'),'المواصفات: '+p.spec,'وحدة البيع: '+p.unit,'كمية الباقة: '+p.packQty,approved?'سعر الباقة: '+price(p.price):'السعر: لم يُعتمد',approved?'سعر الحبة: '+price(p.price/p.packQty):'',supplierNames?'الموردون: '+supplierNames:'',p.notes?'ملاحظات: '+p.notes:''].filter(Boolean).join('\n');
}
function showProduct(p){
 stopCamera();current=p;$('scan-video-container').hidden=true;
 const approved=typeof p.price==='number'&&p.price>0;
 const names=(p.suppliers||[]).map(x=>x.supplierName).filter(Boolean);
 const card=$('scan-product-card');card.hidden=false;
 card.innerHTML='<div class="scan-card-kicker">'+(p.category==='gifts'?'هدية دعائية':'منتج أوفست')+' · رقم <b>'+esc(p.sku)+'</b></div><h3>'+esc(p.name)+'</h3><p class="scan-spec">'+esc(p.spec)+'</p><div class="scan-data"><div><span>الكمية بالباقة</span><strong>'+esc(p.packQty)+' '+esc(p.unit)+'</strong></div><div><span>السعر المعتمد</span><strong>'+(approved?price(p.price):'لم يُعتمد بعد')+'</strong></div></div>'+(p.barcode?'<div class="scan-code"><span>الباركود: '+esc(p.barcode)+'</span><div id="scan-barcode-visual"></div></div>':'')+(names.length?'<p class="scan-suppliers">الموردون: '+esc(names.join('، '))+'</p>':'')+(p.notes?'<details><summary>ملاحظات المنتج</summary><p>'+esc(p.notes)+'</p></details>':'')+'<div class="scan-actions"><button type="button" class="scan-primary" id="scan-copy">نسخ معلومات المنتج</button><button type="button" class="scan-secondary" id="scan-more">عرضه في الكتالوج</button></div>';
 if(p.barcode&&window.MontageBarcode) $('scan-barcode-visual').innerHTML=window.MontageBarcode.encode(p.barcode);
 $('scan-copy').onclick=async()=>{const content=textFor(p);try{await navigator.clipboard.writeText(content);message('تم نسخ معلومات المنتج.');}catch{const field=document.createElement('textarea');field.value=content;field.style.cssText='position:fixed;opacity:0;left:-9999px';document.body.append(field);field.select();let copied=false;try{copied=document.execCommand('copy');}catch{}field.remove();message(copied?'تم نسخ معلومات المنتج.':'تعذّر النسخ التلقائي. استخدم متصفحًا يدعم النسخ أو جرّب مرة أخرى.');}};
 $('scan-more').onclick=()=>{const category=p.category==='gifts'?'gifts':'offset-products';close();document.querySelector('[data-tab="'+category+'"]')?.click();const element=[...document.querySelectorAll('[data-product]')].find(e=>e.dataset.product===p.id);element?.scrollIntoView({behavior:'smooth',block:'center'});};
 message('تم العثور على المنتج.');
}
function lookup(value){
 if(!window.MontageCatalog&&!productCache.length){message('المنتجات لم تُحمّل بعد؛ تحقق من تسجيل الدخول أو أعد فتح الماسح.');return;}
 const p=find(value);
 if(!p){$('scan-product-card').hidden=true;current=null;message('لم نجد منتجًا بهذا الرقم أو الباركود. راجع الرقم أو أضفه من الإدارة.');return;}
 showProduct(p);
}
function stopCamera(){
 active=false;
 if(frame!==null){cancelAnimationFrame(frame);frame=null;}
 if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
 const video=$('scan-video');video.pause();video.srcObject=null;
 $('scan-camera-stop').hidden=true;$('scan-camera-start').hidden=false;
}
async function checkFrame(){
 if(!active||!detector||scanning)return;
 scanning=true;
 try{
  const video=$('scan-video');
  if(video.readyState>=2){
   const found=await detector.detect(video);
   if(found.length){
    const code=found.find(x=>find(x.rawValue))||found[0];
    if(code){$('scan-value').value=code.rawValue;lookup(code.rawValue);if(current)return;}
   }
  }
 }catch{message('تعذر قراءة الإطار. يمكنك إدخال الرمز يدويًا.');}
 finally{scanning=false;if(active)frame=requestAnimationFrame(checkFrame);}
}
async function startCamera(){
 if(!navigator.mediaDevices?.getUserMedia){message('الكاميرا غير مدعومة بهذا المتصفح. استخدم قارئ USB أو أدخل الرقم يدويًا.');return;}
 if(typeof BarcodeDetector==='undefined'){message('متصفحك لا يدعم قراءة الباركود بالكاميرا حاليًا. جرّب Chrome على Android، أو استخدم قارئ USB/الإدخال اليدوي.');return;}
 try{
  const formats=await BarcodeDetector.getSupportedFormats();
  if(!formats.includes('code_39')){message('المتصفح لا يدعم باركود Code 39. استخدم قارئ USB أو الإدخال اليدوي.');return;}
  detector=new BarcodeDetector({formats:['code_39']});
  stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
  const video=$('scan-video');video.srcObject=stream;await video.play();
  $('scan-video-container').hidden=false;$('scan-camera-stop').hidden=false;$('scan-camera-start').hidden=true;
  active=true;message('وجّه الكاميرا إلى الخطوط السوداء للباركود.');frame=requestAnimationFrame(checkFrame);
 }catch(error){stopCamera();message(error?.name==='NotAllowedError'?'تم رفض إذن الكاميرا. فعّل الإذن من المتصفح أو أدخل الرقم يدويًا.':'تعذر تشغيل الكاميرا. تأكد من HTTPS والأذونات، أو استخدم الإدخال اليدوي.');}
}
async function open(){
 focusBefore=document.activeElement;scan.hidden=false;document.body.classList.add('scan-modal-open');$('scan-product-card').hidden=true;current=null;message('');$('scan-value').value='';$('scan-value').focus();
 if(!window.MontageCatalog){
  message('جارٍ تحميل المنتجات…');
  try{const response=await fetch('/api/manage?action=products',{credentials:'same-origin'});const data=await response.json();if(!response.ok)throw Error(data.message||'لم تُحمّل المنتجات');productCache=data.items||[];message('امسح الباركود أو أدخل رقم المنتج.');}
  catch(error){message('تعذّر تحميل المنتجات: '+error.message+'. تحقق من تسجيل الدخول.');}
 }
}
function close(){stopCamera();scan.hidden=true;document.body.classList.remove('scan-modal-open');focusBefore?.focus?.();}
$('scan-lookup-form').addEventListener('submit',e=>{e.preventDefault();lookup($('scan-value').value);});
$('scan-camera-start').onclick=startCamera;$('scan-camera-stop').onclick=()=>{stopCamera();message('توقفت الكاميرا؛ يمكنك إدخال الرقم يدويًا.');};
scan.querySelectorAll('[data-scan-close]').forEach(el=>el.onclick=close);
scan.addEventListener('keydown',e=>{
 if(e.key==='Escape'){e.preventDefault();close();return;}
 if(e.key==='Tab'){
  const controls=[...scan.querySelectorAll('button,input')].filter(el=>!el.closest('[hidden]')&&!el.hidden&&!el.disabled);
  const i=controls.indexOf(document.activeElement);
  if(e.shiftKey&&i===0){e.preventDefault();controls[controls.length-1]?.focus();}
  if(!e.shiftKey&&i===controls.length-1){e.preventDefault();controls[0]?.focus();}
 }
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&active)stopCamera();});
window.MontageScanner={open,close,lookup,find,textFor};
})();
