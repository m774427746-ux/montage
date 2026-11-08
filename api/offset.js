// Offset lithography quotation: costs and tariff are private to administrators.
import { configured,pipeline } from './_redis.js';
import { session,parseBody } from './_session.js';
export const DEFAULT={paperPerSheet:0,pressPer1000:0,platePerColor:0,setup:0,wastePct:5,marginPct:30};
export function estimate(input,rates){
 const f=(key,min,max)=>{const v=Number(input[key]);if(input[key]===undefined||input[key]===null||input[key]===''||!Number.isFinite(v)||v<min||v>max)throw Error('قيمة غير صحيحة: '+key);return v;};
 const sw=f('sheetW',100,1500),sh=f('sheetH',100,1500),w=f('itemW',1,1500),h=f('itemH',1,1500),qty=f('quantity',1,10000000),margin=f('margin',0,100),bleed=f('bleed',0,20),gap=f('gap',0,50),sides=f('sides',1,2),colors=f('colors',1,4);
 if(!Number.isInteger(qty)||![1,2].includes(sides)||![1,2,4].includes(colors))throw Error('راجع الكمية أو عدد الأوجه أو الألوان.');
 const aw=sw-2*margin,ah=sh-2*margin,pw=w+2*bleed+gap,ph=h+2*bleed+gap;
 if(aw<=0||ah<=0)throw Error('هامش الفرخ أكبر من مساحة الطباعة.');
 const count=(x,y)=>Math.floor((aw+gap)/x)*Math.floor((ah+gap)/y);
 const straight=count(pw,ph),rotated=count(ph,pw),ups=Math.max(straight,rotated);
 if(ups<1)throw Error('المطبوع لا يتسع للفرخ بالمقاسات والهوامش الحالية.');
 const needed=Math.ceil(qty/ups),printed=Math.ceil(needed*(1+rates.wastePct/100)),plates=colors*sides;
 const priceCost=printed*(rates.paperPerSheet+rates.pressPer1000*sides/1000)+plates*rates.platePerColor+rates.setup;
 const cost=Math.ceil(priceCost*100)/100,quote=Math.ceil(cost/(1-rates.marginPct/100)*100)/100;
 return {ups,orientation:rotated>straight?'تدوير 90°':'الاتجاه الأصلي',needed,printed,plates,estimatedPrice:quote,unitPrice:Math.ceil(quote/qty*10000)/10000,priceConfigured:rates.paperPerSheet>0&&rates.pressPer1000>0&&rates.platePerColor>0,wastePct:rates.wastePct,marginPct:rates.marginPct,remark:'التقدير لا يتضمن التشطيب أو النقل أو الضريبة؛ تأكد من مواصفات المطبعة قبل اعتماد العرض.'};
}
const validRates=r=>r&&Object.keys(DEFAULT).every(k=>typeof r[k]==='number'&&Number.isFinite(r[k])&&r[k]>=0&&r[k]<=1000000)&&r.wastePct<=50&&r.marginPct<90;
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!configured())return res.status(503).json({message:'التخزين غير متاح.'});
 try{
 const user=await session(req);if(!user)return res.status(401).json({message:'يلزم تسجيل الدخول.'});
 if(req.method==='PUT'&&user.role!=='admin')return res.status(403).json({message:'إدارة أسعار الأوفست للمدير فقط.'});
 const [raw]=await pipeline([['GET','montage:offset:rates:v1']]);const rates=raw?{...DEFAULT,...JSON.parse(raw)}:DEFAULT;
 if(req.method==='GET'){
  if(user.role!=='admin')return res.status(403).json({message:'أسعار التكلفة مخصصة للإدارة.'});
  return res.status(200).json({ok:true,rates});
 }
 if(req.method==='PUT'){
  const body=parseBody(req),next=body.rates;
  if(!validRates(next))return res.status(400).json({message:'راجع سعر الفرخ والطبعة والألواح والهدر والربح.'});
  await pipeline([['SET','montage:offset:rates:v1',JSON.stringify(next)]]);
  return res.status(200).json({ok:true,rates:next});
 }
 if(req.method==='POST'){
  const result=estimate(parseBody(req),rates);
  if(!result.priceConfigured)return res.status(422).json({message:'لم تعتمد الإدارة أسعار تكلفة الأوفست بعد. يمكن متابعة المقاسات بعد إدخال الأسعار.',...result,estimatedPrice:null,unitPrice:null});
  return res.status(200).json({ok:true,...result});
 }
 res.setHeader('Allow','GET, PUT, POST');return res.status(405).json({message:'طريقة غير مدعومة.'});
 }catch(e){return res.status(400).json({message:e.message||'تعذر الحساب أو الحفظ.'});}
}
