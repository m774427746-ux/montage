(()=>{
const ids=['sh-kpis','st-kpis','ac-kpis'];
const mq=matchMedia('(max-width:900px)');
const bar=document.createElement('button');bar.type='button';bar.className='calc-summary';bar.setAttribute('aria-label','عرض نتيجة الحساب');
document.body.append(bar);
let target=null,ticking=false;
const active=()=>ids.map(i=>document.getElementById(i)).find(el=>el&&el.offsetParent!==null&&el.querySelector('.kpi'));
function update(){
 const el=active();target=el;
 if(!mq.matches||!el){bar.classList.remove('show');document.body.classList.remove('has-calc-summary');return;}
 const items=[...el.querySelectorAll('.kpi')].slice(0,2);
 bar.innerHTML=items.map(k=>`<span class="cs-item"><span class="cs-l">${k.querySelector('.l')?.textContent||''}</span><span class="cs-v">${k.querySelector('.v')?.textContent||''}</span></span>`).join('')+'<span class="cs-go">النتائج ↓</span>';
 const r=el.getBoundingClientRect();const visible=r.top<innerHeight*.75&&r.bottom>0;const show=!visible;bar.classList.toggle('show',show);document.body.classList.toggle('has-calc-summary',show);
}
const mo=new MutationObserver(update);
ids.forEach(i=>{const el=document.getElementById(i);if(el){mo.observe(el,{childList:true,subtree:true,characterData:true});}});
addEventListener('scroll',()=>{if(ticking)return;ticking=true;setTimeout(()=>{ticking=false;update();},60);},{passive:true});
document.addEventListener('click',()=>setTimeout(update,50));
mq.addEventListener?.('change',update);
bar.addEventListener('click',()=>target?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'auto':'smooth',block:'start'}));
update();
})();
