import { randomUUID } from 'node:crypto';
import { configured,pipeline } from './_redis.js';
import { session,parseBody } from './_session.js';
import { supplierCatalog,supplierKey,offerKey } from './_suppliers.js';
const clean=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):'';
const number=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST','PUT'].includes(req.method)){res.setHeader('Allow','GET, POST, PUT');return res.status(405).json({message:'الطلب غير مدعوم.'});}
 if(!configured())return res.status(503).json({message:'خدمة الحفظ غير متاحة.'});
 try{
  const user=await session(req);if(!user)return res.status(401).json({message:'سجّل الدخول أولًا.'});
  if(req.method!=='GET'&&user.role!=='admin')return res.status(403).json({message:'إضافة الموردين وتعديل الأسعار للإدارة فقط.'});
  const data=await supplierCatalog();
  if(req.method==='GET')return res.status(200).json({ok:true,canEdit:user.role==='admin',...data});
  const body=parseBody(req);
  if(body.action==='supplier'&&req.method==='POST'){
   const name=clean(body.name,80);if(!name)return res.status(400).json({message:'اكتب اسم المورد.'});
   if(data.suppliers.some(s=>s.name===name))return res.status(409).json({message:'هذا المورد موجود بالفعل.'});
   // materials: raw inputs for the sticker/acrylic calculators. ready: finished goods priced per pack for offset/gift products.
   const kind=body.kind==='materials'?'materials':'ready';
   const supplier={id:randomUUID(),name,kind,updated:new Date().toISOString().slice(0,10),source:clean(body.source)};
   await pipeline([['HSET',supplierKey,supplier.id,JSON.stringify(supplier)]]);
   return res.status(201).json({ok:true,supplier});
  }
  if(body.action!=='offer')return res.status(400).json({message:'اختر عملية صحيحة.'});
  const existing=req.method==='PUT'?data.offers.find(o=>o.id===body.id):null;
  if(req.method==='PUT'&&!existing)return res.status(404).json({message:'السعر غير موجود.'});
  if(!data.suppliers.some(s=>s.id===body.supplierId)||!number(body.price,0.01,99999999)||!number(body.vat,0,1))
   return res.status(400).json({message:'راجع المورد والسعر ونسبة الضريبة.'});
  if(existing&&body.supplierId!==existing.supplierId)return res.status(400).json({message:'لا يمكن نقل السعر إلى مورد آخر.'});
  const reference=body.referenceId?data.offers.find(o=>o.id===body.referenceId):null;
  if(body.referenceId&&!reference)return res.status(400).json({message:'المنتج المرجعي غير موجود.'});
  const offer={
   id:existing?.id||randomUUID(),supplierId:body.supplierId,
   productKey:reference?.productKey||existing?.productKey||randomUUID(),
   category:reference?.category||clean(body.category,100),name:reference?.name||clean(body.name),
   spec:clean(body.spec),unit:clean(body.unit,60),packageSpec:clean(body.packageSpec),
   price:body.price,vat:body.vat,currency:'SAR',source:clean(body.source)||'إدخال الإدارة',
   sourcePage:null,updated:new Date().toISOString().slice(0,10),unitNote:clean(body.unitNote,300)
  };
  if(!offer.name||!offer.category||!offer.spec||!offer.unit)return res.status(400).json({message:'أكمل الصنف والتصنيف والمواصفات ووحدة البيع.'});
  await pipeline([['HSET',offerKey,offer.id,JSON.stringify(offer)]]);
  return res.status(existing?200:201).json({ok:true,offer});
 }catch{return res.status(503).json({message:'تعذّر الاتصال بالحفظ. حدّث القائمة قبل إعادة المحاولة.'});}
}
