import { readFileSync } from 'node:fs';
import { pipeline } from './_redis.js';
const source=JSON.parse(readFileSync(new URL('../src/data/supplier-prices.json',import.meta.url),'utf8'));
export const supplierKey='montage:suppliers:v1', offerKey='montage:supplier-offers:v1';
const pageFor=(id,i)=>({forex:7,foam:7,zincore:7,corrugated:7,'led-strip':8,'led-module':9,neon:11,wires:12,letters3d:12,solder:13,bending:13,'print-acc':23,rods:24}[id]|| (id==='power'?(i<17?10:11):id==='vinyl'?(i<20?14:i<36||i>=41&&i<47?15:i<61?16:17):id==='banner'?(i<9?17:18):id==='display'?(i<26?19:20):id==='adhesive'?(i<20?21:22):id==='hardware'?(i<20?25:26):null));
function unitFor(g,it) {
 if(g.sheet||['sandwich','forex','foam','zincore','corrugated'].includes(g.id))return {unit:'لوح',packageSpec:'',unitNote:'تأكد من طول اللوح وعرضه لدى المورد.'};
 if(['vinyl','banner'].includes(g.id))return {unit:'رول',packageSpec:'',unitNote:'المذكور عرض الرول فقط؛ طوله غير مذكور في القائمة.'};
 if(g.id==='rods')return {unit:'عامود',packageSpec:'',unitNote:'طول العامود غير مذكور.'};
 if(g.id==='led-strip')return {unit:'لفة',packageSpec:it.name.includes('50')?'50 m':'',unitNote:'راجع طول اللفة قبل المقارنة.'};
 if(g.id==='led-module')return {unit:'حسب القائمة',packageSpec:'',unitNote:'تأكد من كون السعر للحبة أو العبوة؛ القائمة تتضمن 100 حبة لبعض الموديلات.'};
 if(g.id==='neon')return {unit:'لفة',packageSpec:'5 m',unitNote:''};
 if(g.id==='wires'||g.id==='letters3d')return {unit:'لفة',packageSpec:it.spec,unitNote:''};
 if(g.id==='adhesive')return {unit:'عبوة / لفة',packageSpec:it.spec==='—'?'':it.spec,unitNote:'تحقق من نوع العبوة والمقاس عند مقارنة منتج بديل.'};
 if(g.id==='print-acc'&&/كيس/.test(it.name))return {unit:'كيس',packageSpec:it.name.match(/\d+ حبة/)?.[0]||'',unitNote:''};
 return {unit:'قطعة',packageSpec:it.spec==='—'?'':it.spec,unitNote:''};
}
export const creative={id:'creative',name:'كريتيف',updated:source.updated,source:'new price list creative.pdf',note:'قائمة أغسطس 2026. ضريبة 15% مضافة وفق إعداد التسعير المعتمد في الموقع.'};
export const baseOffers=source.groups.flatMap(g=>g.items.map((it,i)=>({
 id:'creative-'+g.id+'-'+i,supplierId:'creative',productKey:g.id+'-'+i,category:g.title.replace(' (سعر الرول)','').replace(' (سعر الحبة)',''),
 name:it.name,spec:it.spec,price:it.price,vat:source.vat,currency:'SAR',updated:source.updated,source:creative.source,sourcePage:pageFor(g.id,i),
 ...unitFor(g,it)
})));
// Preserve source rows, but do not rank ambiguous duplicate descriptions.
for(const o of baseOffers){
 if(baseOffers.some(other=>other.id!==o.id&&other.name===o.name&&other.spec===o.spec&&other.price!==o.price))o.unitNote='الوصف والمقاس مكرران بأسعار مختلفة في قائمة المورد؛ تأكد من الخيار المطلوب. '+o.unitNote;
}
export const amounts=(price,vat)=>{const tax=Math.round(price*vat*100+1e-9)/100;return {tax,total:Math.round((price+tax)*100+1e-9)/100};};
export async function supplierCatalog(){
 const [suppliers,offers]=await pipeline([['HVALS',supplierKey],['HVALS',offerKey]]);
 const all=new Map(baseOffers.map(o=>[o.id,o]));
 for(const raw of offers||[]){const o=JSON.parse(raw);all.set(o.id,o);}
 return {suppliers:[creative,...(suppliers||[]).map(JSON.parse)],offers:[...all.values()].map(o=>({...o,...amounts(o.price,o.vat)}))};
}
