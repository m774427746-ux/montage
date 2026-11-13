import {randomUUID} from 'node:crypto';
import {pipeline} from '../api/_redis.js';
import {session,parseBody} from '../api/_session.js';
import {supplierCatalog} from '../api/_suppliers.js';

const KEY='montage:managed-products:v1', CHANGES='montage:managed-products:edits:v2', SEQUENCE='montage:managed-products:sequence:v2';
const demo=(id,category,name,spec,unit,packQty,notes='تُعتمد الأسعار والمواصفات النهائية من الإدارة.')=>({id:'demo-'+id,category,name,spec,unit,packQty,price:null,notes,active:true,supplierOfferIds:[]});
export const examples=[
demo('invoice-books','offset','دفاتر فواتير — 100 دفتر','100 دفتر × 50 ورقة، نسختان كربونلس، ترقيم متسلسل','دفتر',100),
demo('cups-4oz','offset','أكواب ورقية 4 أونص — طبقتان','4 أونص، طبقتان، طباعة لون واحد','كوب',1000),
demo('business-cards','offset','كروت شخصية','9 × 5 سم، ورق 350 جرام، وجهان 4 ألوان','كرت',1000),
demo('brochures','offset','بروشور مطوي','A4، مطوية ثلاثية، ورق كوشيه 150 جرام','بروشور',1000),
demo('folders','offset','فولدرات ومستندات','A4، جيب داخلي، ورق مقوى 350 جرام','فولدر',500),
demo('envelopes','offset','أظرف مطبوعة','DL، شعار لون واحد، بدون نافذة','ظرف',1000),
demo('paper-bags','offset','أكياس ورقية مطبوعة','25 × 35 × 10 سم، مقبض ورقي، لونان','كيس',500),
demo('menus','offset','منيوهات مطاعم','A4، وجهان، كوشيه 300 جرام مع تغليف','منيو',500),
demo('catalogs','offset','كتالوجات مجلدة','A5، 24 صفحة، تدبيس دبوسين','كتالوج',500),
demo('labels','offset','ملصقات ورقية','5 × 5 سم، 4 ألوان، قص منفصل','ملصق',1000),
demo('invoice-books-3','offset','دفاتر سندات قبض — 100 دفتر','100 دفتر × 50 ورقة، ثلاث نسخ، ترقيم','دفتر',100),
demo('cups-8oz','offset','أكواب ورقية 8 أونص','طبقتان، طباعة لون واحد','كوب',1000),
demo('cups-12oz','offset','أكواب ورقية 12 أونص','طبقتان، طباعة أربعة ألوان','كوب',1000),
demo('certificates','offset','شهادات تقدير','A4، ورق فاخر 250 جرام، وجه واحد','شهادة',500),
demo('tickets','offset','تذاكر فعاليات','ترقيم متسلسل، تخريم، 4 ألوان','تذكرة',1000),
demo('promotional-mug','gifts','كوب سيراميك دعائي','كوب أبيض بطباعة شعار ملون','كوب',36),
demo('promotional-pens','gifts','أقلام بلاستيكية بشعار','شعار لون واحد','قلم',100),
demo('promotional-flags','gifts','أعلام مكتبية','قماش 15 × 22 سم مع قاعدة','علم',50),
demo('acrylic-award','gifts','درع أكريليك مخصص','أكريليك شفاف 5 ملم، طباعة UV أو حفر ليزر','درع',1),
demo('wood-award','gifts','درع خشبي فاخر','قاعدة خشب مع لوحة أكريليك','درع',1),
demo('crystal-award','gifts','درع كريستال','كريستال مع علبة هدايا','درع',1),
demo('metal-pens','gifts','أقلام معدنية دعائية','قلم معدن مع حفر ليزر','قلم',50),
demo('mugs-steel','gifts','أكواب ستانلس حرارية','كوب حراري بطباعة أو حفر شعار','كوب',24),
demo('tote-bags','gifts','حقائب قماش دعائية','حقيبة قطن مع طباعة شعار','حقيبة',50),
demo('lanyards','gifts','حبال بطاقات (لانيارد)','قماش مطبوع مع مشبك','حبل',100),
demo('keychains','gifts','ميداليات مفاتيح','معدن أو أكريليك مع شعار','ميدالية',100),
demo('tshirts','gifts','تيشيرتات دعائية','قماش قطني مع طباعة أمامية','تيشيرت',50),
demo('caps','gifts','قبعات بشعار','تطريز أو طباعة أمامية','قبعة',50),
demo('notebooks','gifts','دفاتر ملاحظات دعائية','A5 مع غلاف مطبوع','دفتر',50),
demo('powerbanks','gifts','باور بانك دعائي','بطارية متنقلة مطبوع عليها شعار','قطعة',20),
demo('usb','gifts','وحدات USB دعائية','ذاكرة USB بشعار','قطعة',50),
demo('desk-flags','gifts','أعلام صغيرة مع طاولة','علم صغير وقاعدة طاولة','علم',50),
demo('gift-boxes','gifts','صناديق هدايا دعائية','صندوق مخصص مع طباعة','صندوق',25),
demo('coasters','gifts','قواعد أكواب','فلين أو أكريليك مع شعار','قطعة',100),
demo('calendars','gifts','تقويم مكتبي','تقويم سنوي مع شعار الشركة','تقويم',100)
].map((x,i)=>({...x,sku:String(i+1).padStart(6,'0')}));
export const initialCount=examples.length;
const clean=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const money=v=>v===null||v===''||v===undefined?null:(typeof v==='number'&&Number.isFinite(v)&&v>0&&v<1e7?v:NaN);
export const barcodeFor=(p)=>p.category==='gifts'?'GFT'+p.sku:null;
export const validate=(raw,old)=>{
 const usage=['stickers','banners'].includes(raw.usage)?raw.usage:null; // which calculator may use this ready product
 const category=clean(raw.category,20),name=clean(raw.name,100),spec=clean(raw.spec,300),unit=clean(raw.unit,24),notes=clean(raw.notes,500),packQty=Number(raw.packQty),price=money(raw.price);
 if(!['offset','gifts'].includes(category)||!name||!spec||!unit||!Number.isInteger(packQty)||packQty<1||packQty>1e7||Number.isNaN(price)||typeof raw.active!=='boolean')throw Error('راجع الاسم والمواصفات والكمية والسعر وحالة المنتج.');
 const ids=raw.supplierOfferIds??old?.supplierOfferIds??[];
 if(!Array.isArray(ids)||ids.length>30||ids.some(x=>typeof x!=='string'||x.length>100)||new Set(ids).size!==ids.length)throw Error('قائمة عروض الموردين غير صالحة.');
 if(old&&category!==old.category)throw Error('لا يمكن تغيير نوع المنتج بعد إصدار رقمه. أنشئ منتجًا جديدًا بدلاً من ذلك.');
 const priceMode=raw.priceMode==='supplier'?'supplier':'manual';
 const marginPct=raw.marginPct===''||raw.marginPct==null?null:Number(raw.marginPct);
 if(marginPct!==null&&(!Number.isFinite(marginPct)||marginPct<0||marginPct>95))throw Error('هامش الربح يكون بين 0 و95%.');
 if(priceMode==='supplier'&&!ids.length)throw Error('اربط سعر مورد واحدًا على الأقل ليُحسب السعر منه.');
 return {id:old?.id||randomUUID(),sku:old?.sku||null,category,name,spec,unit,notes,packQty,price,active:raw.active,supplierOfferIds:ids,priceMode,marginPct,usage};
};
export function combineCatalog(legacy,changes){
 const seen=new Map();
 for(const p of examples)seen.set(p.id,{...p});
 for(const [i,p] of (legacy||[]).entries()){
  const initial=seen.get(p.id);
  seen.set(p.id,{...initial,...p,sku:initial?.sku||p.sku||String(examples.length+i+1).padStart(6,'0'),supplierOfferIds:p.supplierOfferIds||[]});
 }
 for(const p of changes||[])seen.set(p.id,{...seen.get(p.id),...p});
 return [...seen.values()].sort((a,b)=>Number(a.sku)-Number(b.sku));
}
export async function productsData(){
 const [raw,editRaw]=await pipeline([['GET',KEY],['HVALS',CHANGES]]);
 const legacy=raw?JSON.parse(raw):[];
 if(!Array.isArray(legacy))throw Error('الكتالوج القديم غير صالح.');
 const changes=(editRaw||[]).map(x=>JSON.parse(x));
 return combineCatalog(legacy,changes);
}
export async function productsHandler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const user=await session(req);if(!user)return res.status(401).json({message:'سجّل الدخول أولًا.'});
  if(req.method==='GET'){
   const items=await productsData(),supplierData=await supplierCatalog(),offers=supplierData.offers;
   const supplierNames=supplierData.suppliers;
   const map=new Map(offers.map(o=>[o.id,o])),names=new Map(supplierNames.map(s=>[s.id,s.name]));
   const [policyRaw]=await pipeline([['GET','montage:policy']]);
   const defaultMargin=policyRaw?(JSON.parse(policyRaw).defaultMargin??35):35;
   return res.status(200).json({ok:true,canEdit:user.role==='admin',items:items.filter(x=>user.role==='admin'||x.active).map(p=>{
    const linked=(p.supplierOfferIds||[]).map(id=>map.get(id)).filter(Boolean);
    // Cheapest linked supplier price (incl. VAT) → sale price at the applied margin. Cost is shown to admins only.
    const cost=linked.length?Math.min(...linked.map(o=>o.total)):null;
    const margin=p.marginPct??defaultMargin;
    const supplierPrice=cost===null?null:Math.ceil(cost/(1-margin/100)*100-1e-8)/100;
    const effective=p.priceMode==='supplier'?supplierPrice:p.price;
    const adminOnly=user.role==='admin'?{manualPrice:p.price,supplierCost:cost,suggestedPrice:supplierPrice,appliedMargin:margin}:{};
    return {
    ...p,price:effective,barcode:barcodeFor(p),priceStatus:effective===null?'غير معتمد':(p.priceMode==='supplier'?'من سعر المورد':'معتمد من الإدارة'),...adminOnly,
    suppliers:(p.supplierOfferIds||[]).map(id=>map.get(id)).filter(Boolean).map(o=>user.role==='admin'?({id:o.id,supplierId:o.supplierId,supplierName:names.get(o.supplierId)||o.supplierId,price:o.price,total:o.total,unit:o.unit,packageSpec:o.packageSpec,source:o.source}):null).filter(Boolean)
   };})});
  }
  if(user.role!=='admin'&&req.method!=='POST')return res.status(403).json({message:'تعديل المنتجات والأسعار للإدارة فقط.'});
  if(!['POST','PUT'].includes(req.method))return res.status(405).json({message:'الطريقة غير مدعومة.'});
  const body=parseBody(req),items=await productsData(),old=body.id?items.find(x=>x.id===body.id):null;
  if(req.method==='PUT'&&!old)return res.status(404).json({message:'المنتج غير موجود.'});
  if(items.length>=2000&&req.method==='POST')return res.status(400).json({message:'الحد الأعلى 2000 منتج.'});
  if(user.role!=='admin'&&(old||body.id||body.price!==null||body.supplierOfferIds?.length||body.active!==true))
   return res.status(403).json({message:'يمكن للمصمم إنشاء منتجات جديدة غير مسعّرة فقط، دون تعديل الأسعار أو الموردين.'});
  const item=validate(user.role==='admin'?body:{...body,price:null,notes:String(body.notes||'').slice(0,500),active:true,supplierOfferIds:[]},old);
  const catalogData=await supplierCatalog();
  const ids=new Set(catalogData.offers.map(x=>x.id));
  if(item.supplierOfferIds.some(id=>!ids.has(id)))return res.status(400).json({message:'أحد عروض الموردين لم يعد موجودًا.'});
  // Products are priced from ready-goods suppliers (per pack). Raw-material offers are only for the calculators.
  const materialSuppliers=new Set(catalogData.suppliers.filter(s=>s.kind==='materials').map(s=>s.id));
  const materialOffers=new Set(catalogData.offers.filter(o=>materialSuppliers.has(o.supplierId)).map(o=>o.id));
  if(item.supplierOfferIds.some(id=>materialOffers.has(id)))return res.status(400).json({message:'المواد الخام لا تُربط بالمنتجات. اربط سعر مورد المنتجات الجاهزة.'});
  if(!old){
   // SETNX initializes the counter without overwriting any existing allocation.
   await pipeline([['SETNX',SEQUENCE,Math.max(initialCount,...items.map(p=>Number(p.sku)||0))]]);
   const [n]=await pipeline([['INCR',SEQUENCE]]);
   item.sku=String(n).padStart(6,'0');
  }
  await pipeline([['HSET',CHANGES,item.id,JSON.stringify(item)]]);
  return res.status(old?200:201).json({ok:true,item:{...item,barcode:barcodeFor(item)}});
 }catch(e){return res.status(400).json({message:e.message||'تعذر تحديث الكتالوج.'});}
}
