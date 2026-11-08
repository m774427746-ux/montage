import offsetHandler from '../server/offset.js';
import excelHandler from '../server/admin-excel.js';
import { pipeline } from './_redis.js';
import { session,parseBody,readCookie } from './_session.js';
import { credential,matches,saveCredential,issue } from './_credentials.js';
import { catalog,publicItem,calculateQuote } from './_pricing.js';
const validPolicy=p=>p&&typeof p.funMessages==='boolean'&&[p.minMargin,p.maxMargin,p.defaultMargin].every(x=>typeof x==='number'&&Number.isFinite(x))&&p.minMargin>=0&&p.maxMargin<95&&p.maxMargin>=p.minMargin&&p.defaultMargin>=p.minMargin&&p.defaultMargin<=p.maxMargin;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 const action=req.query?.action||'session';
 if(action==='offset')return offsetHandler(req,res);
 if(action==='excel')return excelHandler(req,res);
 try{
  const identity=await session(req);
  if(!identity)return res.status(401).json({ok:false,message:'سجّل الدخول أولًا.'});
  if(action==='session'&&req.method==='GET')return res.status(200).json({ok:true,role:identity.role});
  if(action==='logout'&&req.method==='POST'){
   const tokens=['asb_admin','asb_session'].map(n=>readCookie(req,n)).filter(t=>/^[a-f0-9]{64}$/.test(t));
   if(tokens.length)await pipeline(tokens.map(t=>['DEL','montage:session:'+t]));
   res.setHeader('Set-Cookie',['asb_admin=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0','asb_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0']);
   return res.status(200).json({ok:true});
  }
  const body=parseBody(req);
  if(action==='catalog'&&req.method==='GET'){
   const data=await catalog();return res.status(200).json({ok:true,...data,items:data.items.map(publicItem)});
  }
  if(action==='quote'&&req.method==='POST'){
   const data=await catalog(),item=data.items.find(x=>x.id===body.id);
   if(!item)return res.status(400).json({ok:false,message:'اختر خامة صحيحة.'});
   const result=calculateQuote(body,item,data.policy);
   return res.status(result.ok?200:422).json(result);
  }
  if(identity.role!=='admin')return res.status(403).json({ok:false,message:'هذا الإعداد للإدارة فقط.'});
  if(action==='settings'&&req.method==='GET')return res.status(200).json({ok:true,...await catalog()});
  if(action==='settings'&&req.method==='PUT'){
   if(!validPolicy(body))return res.status(400).json({ok:false,message:'راجع الحدود: الحد الأدنى ≤ الافتراضي ≤ الأعلى، والأعلى أقل من 95%.'});
   const clean={minMargin:body.minMargin,maxMargin:body.maxMargin,defaultMargin:body.defaultMargin,funMessages:body.funMessages};
   await pipeline([['SET','montage:policy',JSON.stringify(clean)]]);
   return res.status(200).json({ok:true});
  }
  if(action==='password'&&req.method==='POST'){
   const role=body.role;
   if(!['admin','team'].includes(role)||typeof body.password!=='string'||body.password.length<10||body.password.length>128||body.password!==body.confirm)return res.status(400).json({ok:false,message:'استخدم كلمة مرور من 10 إلى 128 حرفًا، وأكّدها بالقيمة نفسها.'});
   if(!matches('admin',body.current,await credential('admin')))return res.status(401).json({ok:false,message:'كلمة مرور الإدارة الحالية غير صحيحة.'});
   const version=await saveCredential(role,body.password);
   if(role==='admin')await issue(res,'admin',version);
   return res.status(200).json({ok:true,message:'تم التغيير وإبطال جلسات القسم القديمة.'});
  }
  return res.status(405).json({ok:false,message:'الطلب غير مدعوم.'});
 }catch{return res.status(503).json({ok:false,message:'تعذّر الاتصال بالحفظ. لم يُؤكّد إتمام العملية؛ حدّث الصفحة قبل إعادة المحاولة.'});}
}
