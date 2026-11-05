import { session,parseBody } from './_session.js';
import { pipeline } from './_redis.js';
import { supplierCatalog } from './_suppliers.js';
import { catalog } from './_pricing.js';
import { basis,pricingKey,validateProfile,calculateProductQuote,provisionalProfile } from './_product-pricing.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST','PUT'].includes(req.method))return res.status(405).json({message:'الطلب غير مدعوم.'});
 try{
  const user=await session(req);if(!user)return res.status(401).json({message:'سجّل الدخول أولًا.'});
  if(req.method==='PUT'&&user.role!=='admin')return res.status(403).json({message:'اعتماد التكلفة للإدارة فقط.'});
  const body=parseBody(req),id=req.method==='GET'?req.query?.id:body.id;
  const data=await supplierCatalog(),offer=data.offers.find(o=>o.id===id);
  if(!offer)return res.status(404).json({message:'اختر صنفًا من قائمة الموردين.'});
  const {policy}=await catalog();
  const [raw]=await pipeline([['HGET',pricingKey,offer.id]]);
  const saved=raw?JSON.parse(raw):null,ready=validateProfile(saved)&&saved.basis===basis(offer);
  const profile=ready?saved:provisionalProfile(offer);
  if(req.method==='GET')return res.status(200).json({ok:true,offer,policy,profile,ready,provisional:!ready&&Boolean(profile),canEdit:user.role==='admin'});
  if(req.method==='PUT'){
   const p=body.profile;
   if(!validateProfile(p))return res.status(400).json({message:'أكمل مقاس وحدة الشراء والتكاليف، وأكّد مراجعتها. يمكن إدخال صفر لتكلفة غير مطبقة.'});
   const clean={mode:p.mode,stockWidthCm:p.stockWidthCm,stockLengthCm:p.stockLengthCm,packQty:p.packQty,setupCost:p.setupCost,costPerPiece:p.costPerPiece,costPerM2:p.costPerM2,wastePct:p.wastePct,gapMm:p.gapMm,confirmed:true,basis:basis(offer),updatedAt:new Date().toISOString()};
   await pipeline([['HSET',pricingKey,offer.id,JSON.stringify(clean)]]);
   return res.status(200).json({ok:true});
  }
  const result=calculateProductQuote(body,offer,profile,policy);
  return res.status(result.ok?200:422).json({...result,provisional:!ready});
 }catch{return res.status(503).json({message:'تعذّر التحقق من التكلفة. لم يُعتمد عرض السعر.'});}
}
