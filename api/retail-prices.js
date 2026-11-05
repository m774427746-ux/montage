import {readFileSync} from 'node:fs';
import {session,parseBody} from './_session.js';
import {pipeline} from './_redis.js';
import {catalog} from './_pricing.js';
import {retailQuote} from './_retail-pricing.js';
const source=JSON.parse(readFileSync(new URL('../src/data/retail-prices.json',import.meta.url),'utf8'));
const key='montage:retail-costs:v1';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST','PUT'].includes(req.method))return res.status(405).json({message:'الطلب غير مدعوم.'});
 try{
 const user=await session(req);if(!user)return res.status(401).json({message:'سجل الدخول أولًا.'});
 if(req.method==='GET')return res.status(200).json({...source,canEdit:user.role==='admin'});
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
 return res.status(result.ok?200:422).json(result);
 }catch{return res.status(503).json({message:'تعذر تحميل التسعير المعتمد.'});}
}
