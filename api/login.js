import { createHash } from 'node:crypto';
import { configured,pipeline } from './_redis.js';
import { parseBody } from './_session.js';
import { credential,matches,issue } from './_credentials.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false});
 if(!configured())return res.status(503).json({ok:false,message:'الدخول غير متاح مؤقتًا. تواصل مع الإدارة.'});
 const body=parseBody(req),role=body.role==='admin'?'admin':'team',password=body.password??body.code;
 try{
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim(),bucket=Math.floor(Date.now()/600000);
  const limitKey='montage:login:'+createHash('sha256').update(ip+'|'+role+'|'+bucket).digest('hex');
  const [attempts]=await pipeline([['INCR',limitKey],['EXPIRE',limitKey,660]]);
  if(attempts>20)return res.status(429).json({ok:false,message:'محاولات كثيرة. خذ استراحة وجرّب بعد 10 دقائق.'});
  const saved=await credential(role);
  if(!matches(role,password,saved))return res.status(401).json({ok:false,message:'كلمة المرور غير صحيحة. جرّب مرة أخرى.'});
  await issue(res,role,saved?.version);
  return res.status(200).json({ok:true,role,redirect:role==='admin'?'/admin':'/'});
 }catch{return res.status(503).json({ok:false,message:'تعذّر الاتصال بخدمة الدخول. حاول لاحقًا.'});}
}
