// Supplier price list (admin only): VAT-inclusive prices, per-cm² cost for acrylic sheets,
// and cost suggestions inside the materials table.
(()=>{
const $=id=>document.getElementById(id);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const toLatin=s=>String(s).replace(/[٠-٩]/g,d=>'٠١٢٣٤٥٦٧٨٩'.indexOf(d)).replace(/٫/g,'.');
let data=null, rows=[];

function withVat(price,vat){const v=Math.round(price*vat*100+1e-9)/100;return {vat:v,total:Math.round((price+v)*100+1e-9)/100};}
function prepare(d){
  const area=d.sheetCm[0]*d.sheetCm[1];
  rows=d.groups.flatMap(g=>g.items.map(it=>{const t=withVat(it.price,d.vat);const thick=g.sheet?parseFloat(toLatin(it.spec)):null;
    return {...it,group:g.id,groupTitle:g.title,family:g.family,sheet:g.sheet,vat:t.vat,total:t.total,thick,perCm2:g.sheet?t.total/area:null};}));
}
function render(){
  const q=toLatin($('sp-search').value.trim()), cat=$('sp-cat').value;
  const list=rows.filter(r=>(!cat||r.group===cat)&&(!q||toLatin(r.name+' '+r.spec+' '+r.groupTitle).includes(q)));
  let html='', last='';
  for(const r of list){
    if(r.group!==last){last=r.group;html+='<tr class="sp-group"><th colspan="6" scope="colgroup">'+esc(r.groupTitle)+'</th></tr>';}
    html+='<tr><td>'+esc(r.name)+'</td><td class="sp-num">'+esc(r.spec)+'</td><td class="sp-num">'+money(r.price)+'</td><td class="sp-num">'+money(r.vat)+'</td><td class="sp-num"><b>'+money(r.total)+'</b></td><td class="sp-num">'+(r.perCm2===null?'—':r.perCm2.toFixed(6))+'</td></tr>';
  }
  $('sp-rows').innerHTML=html||'<tr><td colspan="6">لا توجد أصناف مطابقة.</td></tr>';
  $('sp-count').textContent=list.length+' صنف';
}
function exportCsv(){
  const head=['التصنيف','الصنف','المواصفات','السعر قبل الضريبة','الضريبة 15%','السعر شامل الضريبة','تكلفة سم² شامل الضريبة'];
  const safe=v=>/^[=+@-]/.test(String(v))?"'"+v:v;
  const text='﻿'+[head,...rows.map(r=>[r.groupTitle,r.name,r.spec,r.price.toFixed(2),r.vat.toFixed(2),r.total.toFixed(2),r.perCm2===null?'':r.perCm2.toFixed(6)])].map(row=>row.map(v=>'"'+String(safe(v)).replaceAll('"','""')+'"').join(',')).join('\n');
  const url=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');
  a.href=url;a.download='supplier-prices-vat.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

/* Cost suggestions in the materials table (acrylic sold per cm²) */
function familyOf(name){ if(/شفاف/.test(name))return ['clear']; if(/ملون/.test(name))return ['colored','tinted']; if(/مراي/.test(name))return ['mirror']; return null; }
function enhanceMaterials(){
  if(!rows.length)return;
  document.querySelectorAll('#material-rows tr[data-id]').forEach(tr=>{
    if(tr.dataset.sp)return; tr.dataset.sp='1';
    const name=tr.firstChild?.textContent||'', cost=tr.querySelector('input[data-key="cost"]');
    if(!cost||!/(اكريلك|أكريليك|اكريليك)/.test(name)||!/سم²/.test(tr.children[1]?.textContent||''))return;
    const m=toLatin(name).match(/(\d+(?:\.\d+)?)\s*ملم/), fam=familyOf(name);
    const opts=rows.filter(r=>r.sheet&&(!fam||fam.includes(r.family))&&(!m||Math.abs(r.thick-parseFloat(m[1]))<1e-9));
    if(!opts.length)return;
    const sel=document.createElement('select'); sel.className='sp-suggest'; sel.setAttribute('aria-label','اقتراح تكلفة '+name+' من قائمة الموردين');
    sel.innerHTML='<option value="">من قائمة الموردين…</option>'+opts.map(r=>'<option value="'+r.perCm2.toFixed(6)+'">'+esc(r.name+' '+r.spec+' — '+r.perCm2.toFixed(6))+'</option>').join('');
    sel.onchange=()=>{ if(!sel.value)return; cost.value=sel.value; cost.dispatchEvent(new Event('input',{bubbles:true})); cost.classList.add('sp-filled');
      const msg=$('materials-message'); msg.textContent='تمت تعبئة التكلفة من قائمة الموردين (شامل الضريبة، لوح '+data.sheetCm.join('×')+' سم). اضغط «اعتماد الأسعار والصلاحيات» للحفظ.'; msg.className='message ok'; };
    cost.parentElement.appendChild(sel);
  });
}

async function init(){
  try{
    const r=await fetch('/api/supplier-prices'); const d=await r.json();
    if(!r.ok) throw Error(d.message||'تعذّر تحميل قائمة الأسعار.');
    data=d; prepare(d);
    $('sp-cat').innerHTML='<option value="">كل التصنيفات</option>'+d.groups.map(g=>'<option value="'+esc(g.id)+'">'+esc(g.title)+'</option>').join('');
    $('sp-kpis').innerHTML=[[rows.length,'صنف'],[d.groups.length,'تصنيف'],[Math.round(d.vat*100)+'%','ضريبة القيمة المضافة'],[esc(d.updated),'تاريخ القائمة']].map(([v,l])=>'<div class="kpi"><strong>'+v+'</strong><span>'+l+'</span></div>').join('');
    $('sp-sheet').textContent='\u2066'+d.sheetCm.join(' × ')+'\u2069';
    render(); enhanceMaterials();
    new MutationObserver(enhanceMaterials).observe($('material-rows'),{childList:true});
    $('sp-search').oninput=render; $('sp-cat').onchange=render; $('sp-export').onclick=exportCsv;
    $('sp-message').textContent='';
  }catch(e){ $('sp-message').textContent=e.message; }
}
init();
})();
