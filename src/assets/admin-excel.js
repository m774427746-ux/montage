(()=>{
 const $=id=>document.getElementById(id);
 const msg=(id,text,ok=false)=>{const x=$(id);x.textContent=text;x.className='message'+(ok?' ok':'');};
 async function req(url,options={}){const r=await fetch(url,options);if(!r.ok){let d={};try{d=await r.json();}catch{}throw Error(d.message||'تعذّر إكمال العملية.');}return r;}
 async function rates(){
  try{const d=await (await req('/api/offset')).json();for(const [k,v] of Object.entries(d.rates))if($('offset-rates-form').elements.namedItem(k))$('offset-rates-form').elements.namedItem(k).value=v;}
  catch(e){msg('offset-rates-message',e.message);}
 }
 if($('offset-rates-form')) $('offset-rates-form').onsubmit=async e=>{
  e.preventDefault();const btn=e.submitter;btn.disabled=true;
  try{const rates=Object.fromEntries([...new FormData(e.currentTarget)].map(([k,v])=>[k,Number(v)]));await req('/api/offset',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({rates})});msg('offset-rates-message','تم حفظ الأسعار وأصبحت حاسبة الأوفست تعتمدها.',true);}
  catch(error){msg('offset-rates-message',error.message);}finally{btn.disabled=false;}
 };
 document.querySelectorAll('[data-xlsx-export]').forEach(b=>b.onclick=async()=>{
  b.disabled=true;try{const type=b.dataset.xlsxExport,r=await req('/api/admin-excel?type='+type),blob=await r.blob(),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=type==='prices'?'montage-prices.xlsx':'montage-suppliers.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);msg('excel-message','تم تنزيل ملف '+(type==='prices'?'الأسعار':'الموردين')+'.',true);}
  catch(e){msg('excel-message',e.message);}finally{b.disabled=false;}
 });
 $('excel-import').onclick=async()=>{
  const file=$('excel-file').files?.[0],type=$('excel-type').value;
  if(!file||!file.name.toLowerCase().endsWith('.xlsx')){msg('excel-message','اختر ملف Excel بصيغة XLSX.');return;}
  if(file.size>2*1024*1024){msg('excel-message','الملف أكبر من الحد المسموح (2 ميجابايت).');return;}
  const btn=$('excel-import');btn.disabled=true;msg('excel-message','جارٍ فحص الملف وتحديث قاعدة البيانات…');
  try{
   const base64=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(Error('تعذرت قراءة الملف.'));reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.readAsDataURL(file);});
   const d=await (await req('/api/admin-excel?type='+type,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base64})})).json();
   msg('excel-message','تم حفظ '+d.updated+' صف وتحديث البيانات المشتركة. حدّث صفحات الأسعار لعرضها.',true);
  }catch(e){msg('excel-message','لم يطبّق الاستيراد: '+e.message);}finally{btn.disabled=false;}
 };
 if($('offset-rates-form'))rates();
})();