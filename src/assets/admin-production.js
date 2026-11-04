(()=>{
 const panel=document.getElementById('production');if(!panel)return;
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const labels={new:'جديد',received:'تم الاستلام',running:'قيد التنفيذ',completed:'مكتمل',archived:'مؤرشف'};let orders=[];
 function render(){
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date());
  const day=o=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Riyadh'}).format(new Date(o.createdAt));
  const counts=[['طلبات اليوم',orders.filter(o=>day(o)===today).length],...Object.entries(labels).map(([s,label])=>[label,orders.filter(o=>o.status===s).length]),['تحتاج متابعة',orders.filter(o=>o.pricingError||(['new','received','running'].includes(o.status)&&Date.now()-Date.parse(o.updatedAt)>86400000)).length]];
  document.getElementById('production-kpis').innerHTML=counts.map(([k,v])=>`<div class="kpi"><strong>${v}</strong><span>${k}</span></div>`).join('');
  const machines=new Map();for(const o of orders)machines.set(o.machine,(machines.get(o.machine)||0)+1);
  document.getElementById('production-machines').textContent=[...machines].map(([m,n])=>`${m}: ${n}`).join(' · ');
  const query=document.getElementById('production-search').value.trim().toLowerCase(),status=document.getElementById('production-status').value;
  document.getElementById('production-rows').innerHTML=orders.filter(o=>(!status||o.status===status)&&(!query||[o.number,o.customer,o.machine,day(o)].some(v=>String(v).toLowerCase().includes(query)))).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)).map(o=>`<tr><td>#${esc(o.number)}</td><td>${esc(o.customer)}</td><td>${esc(o.machine)}</td><td>${esc(labels[o.status])}</td><td>${esc(o.designer)}</td><td>${esc(o.operator||'—')}</td><td>${o.total===null?'غير محدد':esc(o.total)+' ر.س'}${o.pricingError?' · بيانات التسعير ناقصة':''}</td><td>${esc(new Date(o.updatedAt).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'}))}</td></tr>`).join('')||'<tr><td colspan="8">لا توجد طلبات مطابقة.</td></tr>';
 }
 async function load(){if(panel.hidden)return;const state=document.getElementById('production-message');try{const r=await fetch('/api/production'),d=await r.json();if(!r.ok)throw Error(r.status===401?'يلزم تسجيل دخول الإدارة.':'تعذّر تحميل بيانات الإنتاج.');orders=d.orders;state.textContent=d.lastSync?'آخر اتصال بالسيرفر المحلي: '+new Date(d.lastSync).toLocaleString('ar-SA',{timeZone:'Asia/Riyadh'})+(Date.now()-Date.parse(d.lastSync)>120000?' — البيانات قديمة؛ تحقق من اتصال السيرفر.':''):'لم تتم مزامنة السيرفر المحلي بعد. لا توجد بيانات إنتاج مؤكدة.';render();}catch(e){state.textContent=e.message;}}
 document.getElementById('production-refresh').onclick=load;document.getElementById('production-search').oninput=render;document.getElementById('production-status').onchange=render;
 document.getElementById('tab-production').addEventListener('click',()=>setTimeout(load,0));window.addEventListener('hashchange',load);setInterval(load,30000);setTimeout(load,1000);
})();
