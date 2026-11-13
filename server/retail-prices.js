import {readFileSync} from 'node:fs';
import {session,parseBody} from '../api/_session.js';
import {pipeline} from '../api/_redis.js';
import {catalog} from '../api/_pricing.js';
import {retailQuote} from './_retail-pricing.js';
const source=JSON.parse(readFileSync(new URL('../src/data/retail-prices.json',import.meta.url),'utf8'));
const key='montage:retail-costs:v1';
const INCREASE_MAX=50; // highest profit increase the team may add on top of the listed price, in percent
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST','PUT'].includes(req.method))return res.status(405).json({message:'الطلب غير مدعوم.'});
 try{
 const user=await session(req);if(!user)return res.status(401).json({message:'سجل الدخول أولًا.'});
 // The team sees the ready price list without its source name (the supplier) or any cost.
 if(req.method==='GET')return res.status(200).json(user.role==='admin'?{...source,canEdit:true}:{taxStatus:source.taxStatus,canEdit:false,increaseMax:INCREASE_MAX,items:source.items.map(({source:_s,cost:_c,...item})=>item)});
 const body=parseBody(req),item=source.items.find(i=>i.id===body.id);
 if(!item)return res.status(404).json({message:'الصنف غير موجود.'});
 if(req.method==='PUT'){
 if(user.role!=='admin')return res.status(403).json({message:'اعتماد التكلفة للإدارة فقط.'});
 if(typeof body.cost!=='number'||!Number.isFinite(body.cost)||body.cost<=0||body.cost>1e8||body.confirmed!==true)return res.status(400).json({message:'أدخل التكلفة الإجمالية لوحدة البند كاملة وأكد مراجعتها.'});
 await pipeline([['HSET',key,item.id,JSON.stringify({cost:body.cost,updatedAt:new Date().toISOString()})]]);
 return res.status(200).json({ok:true});
 }
 const [raw]=await pipeline([['HGET',key,item.id]]);const cost=raw?JSON.parse(raw).cost:item.cost;
 const {policy}=await catalog();const result=retailQuote(item,body,policy,cost);
 // Optional profit increase on top of the listed price (0–INCREASE_MAX %). The listed price stays the floor.
 const increase=body.increase===undefined?0:Number(body.increase);
 if(!Number.isFinite(increase)||increase<0||increase>INCREASE_MAX)return res.status(422).json({ok:false,message:'زيادة الربح من 0 إلى '+INCREASE_MAX+'%.'});
 if(result.ok&&increase>0){
  result.total=Math.max(result.total,Math.ceil(result.minimum*(1+increase/100)*100-1e-8)/100);
  result.per=result.total/result.chargedQty;
  if(result.cost!==null)result.profit=Math.round((result.total-result.cost)*100)/100;
 }
 if(result.ok){result.increase=increase;result.extra=Math.round((result.total-result.minimum)*100)/100;if(user.role!=='admin')delete result.cost;}
 return res.status(result.ok?200:422).json(result);
 }catch{return res.status(503).json({message:'تعذر تحميل التسعير المعتمد.'});}
}
