(()=>{
 const form=document.getElementById('offset-form');if(!form)return;
 const status=document.getElementById('offset-status'),out=document.getElementById('offset-result');
 const kpi=(label,value)=>'<div class="kpi"><span class="l">'+label+'</span><strong class="v">'+value+'</strong></div>';
 const fmt=(n,digits=2)=>Number(n).toLocaleString('ar-SA',{minimumFractionDigits:0,maximumFractionDigits:digits});
 form.addEventListener('submit',async e=>{
  e.preventDefault();out.replaceChildren();status.textContent='جارٍ حساب الأفرخ والتكلفة…';
  const body=Object.fromEntries(new FormData(form).entries());
  try{
   const response=await fetch('/api/offset',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}),data=await response.json();
   if(!response.ok&&response.status!==422)throw Error(data.message||'تعذّر حساب الأوفست.');
   if(data.ups){
    const primary=kpi('القطع في الفرخ',fmt(data.ups,0))+
      (data.estimatedPrice===null?kpi('حالة السعر','بانتظار الاعتماد'):
       kpi('سعر الحبة / الوحدة',fmt(data.unitPrice,4)+' ر.س')+kpi('سعر الطلب',fmt(data.estimatedPrice)+' ر.س'));
    const details='<details class="calculator-more"><summary>المزيد: عدد الأفرخ والهدر والألوان</summary><div class="kpis">'+
      kpi('التوزيع',data.orientation)+kpi('أفرخ دون هدر',fmt(data.needed,0))+
      kpi('الأفرخ مع الهدر',fmt(data.printed,0))+kpi('ألواح الألوان',fmt(data.plates,0))+
      kpi('نسبة الهدر',fmt(data.wastePct)+'%')+'</div><p class="hint">تأكد من اتجاه الورق وسحب الماكينة والقص قبل الإنتاج.</p></details>';
    out.innerHTML=primary+details;
   }
   status.textContent=(data.message||'')+(data.remark?' '+data.remark:'');
  }catch(e){status.textContent=e.message;}
 });
})();