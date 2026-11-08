(()=>{
 const f=document.getElementById('offset-form');if(!f)return;
 const status=document.getElementById('offset-status'),result=document.getElementById('offset-result');
 const card=(title,value)=>'<div class="kpi"><span class="l">'+title+'</span><strong class="v">'+value+'</strong></div>';
 f.addEventListener('submit',async e=>{
  e.preventDefault();result.replaceChildren();status.textContent='جارٍ حساب استغلال الأفرخ والسعر…';
  const data=Object.fromEntries(new FormData(f).entries());
  try{
   const r=await fetch('/api/offset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)}),d=await r.json();
   if(!r.ok&&r.status!==422)throw Error(d.message||'تعذر الحساب.');
   if(d.ups)result.innerHTML=card('عدد القطع في الفرخ',d.ups)+card('اتجاه التوزيع',d.orientation)+card('أفرخ قبل الهدر',d.needed)+card('الأفرخ مع الهدر',d.printed)+card('ألواح الألوان/الزنك',d.plates)+(d.estimatedPrice===null?'':card('السعر التقديري (ر.س)',Number(d.estimatedPrice).toFixed(2))+card('سعر الحبة (ر.س)',Number(d.unitPrice).toFixed(4)));
   status.textContent=(d.message||'')+(d.remark?' '+d.remark:'');
  }catch(err){status.textContent=err.message;}
 });
})();