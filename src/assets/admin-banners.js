(()=>{'use strict';
 const $=id=>document.getElementById(id);
 if(!$('banner-save'))return;
 const msg=(v,good=false)=>{$('banner-message').textContent=v;$('banner-message').className='message'+(good?' ok':'');};
 async function load(){
  const r=await fetch('/api/manage?action=banner-extras',{credentials:'same-origin'}),d=await r.json();
  if(!r.ok){msg(d.message||'تعذّر تحميل الأسعار.');return;}
  $('banner-iron').value=d.ironPerBanner??'';$('banner-install').value=d.installPerM2??'';
 }
 $('banner-save').onclick=async()=>{
  const val=id=>$(id).value===''?null:Number($(id).value);
  const r=await fetch('/api/manage?action=banner-extras',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({ironPerBanner:val('banner-iron'),installPerM2:val('banner-install')})});
  const d=await r.json();
  msg(r.ok?'تم حفظ أسعار الحديد والتركيب.':(d.message||'تعذّر الحفظ.'),r.ok);
 };
 load();
})();
