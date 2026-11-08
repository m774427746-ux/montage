import {pipeline} from '../api/_redis.js';
import {session,parseBody} from '../api/_session.js';
import {productsData} from './managed-products.js';

const PREFIX='montage:ubc:v1:',COUNTER='montage:ubc:v1:counter',INDEX='montage:ubc:v1:index';
const statuses=new Set(['unassigned','linked','printed','cancelled','unlinked']);
export const codeFor=n=>'UBC'+String(n).padStart(6,'0');
export const validCode=s=>typeof s==='string'&&/^UBC[0-9]{6,12}$/.test(s);
const parseRecord=(raw)=>{if(!raw)return null;try{const p=JSON.parse(raw);return p&&validCode(p.code)&&statuses.has(p.status)?p:null;}catch{return null;}};
const publicRecord=(rec,products)=>{const p=rec.productId?products.find(item=>item.id===rec.productId):null;return {...rec,product:p?{id:p.id,sku:p.sku,name:p.name,category:p.category,spec:p.spec,unit:p.unit,packQty:p.packQty,price:p.price,active:p.active}:null};};
const getRecord=async code=>parseRecord((await pipeline([['GET',PREFIX+code]]))[0]);

// EVAL protects state changes from racing writers and prevents duplicate product assignment.
const LUA=`local key=KEYS[1]
local raw=redis.call('GET',key)
if not raw then return 'MISSING' end
local item=cjson.decode(raw)
if tonumber(item.version or 0) ~= tonumber(ARGV[1]) then return 'STALE' end
local nextStatus=ARGV[2]
if item.status=='cancelled' then return 'CANCELLED' end
if nextStatus=='linked' then
  if item.productId and item.productId~=cjson.null and item.productId~='' then return 'ALREADY_LINKED' end
  item.productId=ARGV[3]
elseif nextStatus=='unlinked' then
  if not item.productId or item.productId==cjson.null or item.productId=='' then return 'NOT_LINKED' end
  item.productId=cjson.null
elseif nextStatus=='printed' then
  if item.status=='printed' then return 'NO_CHANGE' end
elseif nextStatus=='cancelled' then
  item.productId=cjson.null
else return 'BAD_STATUS' end
item.status=nextStatus
item.version=tonumber(item.version or 0)+1
item.updatedAt=ARGV[4]
item.updatedBy=ARGV[5]
redis.call('SET',key,cjson.encode(item))
return cjson.encode(item)
`;
export async function changeRecord(code,{version,status,productId,user}){
 const [raw]=await pipeline([['EVAL',LUA,1,PREFIX+code,String(version),status,productId||'',new Date().toISOString(),user.role]]);
 if(typeof raw!=='string'||!raw.startsWith('{'))throw Error(({MISSING:'الباركود غير موجود.',STALE:'تم تعديل الباركود في جلسة أخرى؛ حدّث البيانات أولًا.',CANCELLED:'الباركود ملغي ولا يمكن استخدامه.',ALREADY_LINKED:'الباركود مربوط مسبقًا؛ فك الارتباط أولًا.',NOT_LINKED:'الباركود غير مربوط.',NO_CHANGE:'تم وضع علامة مطبوع بالفعل.',BAD_STATUS:'حالة غير مدعومة.'})[raw]||'تعذّر حفظ حالة الباركود.');
 return parseRecord(raw);
}
export async function ubcHandler(req,res){
 res.setHeader('Cache-Control','no-store');
 try{
  const user=await session(req);if(!user)return res.status(401).json({ok:false,message:'سجّل الدخول أولًا.'});
  const method=req.method,body=parseBody(req);
  if(method==='GET'){
   const code=String(req.query?.code||'').trim().toUpperCase();
   if(code){
    if(!validCode(code))return res.status(400).json({ok:false,message:'رقم الباركود غير صالح.'});
    const item=await getRecord(code);
    if(!item)return res.status(404).json({ok:false,message:'الباركود غير موجود في سجلات النظام.'});
    const products=await productsData();
    return res.status(200).json({ok:true,item:publicRecord(item,products)});
   }
   const [codes]=await pipeline([['LRANGE',INDEX,0,199]]);
   const items=codes?.length?(await pipeline(codes.map(c=>['GET',PREFIX+c]))).map(parseRecord).filter(Boolean):[];
   return res.status(200).json({ok:true,items:items.reverse()});
  }
  if(method!=='POST')return res.status(405).json({ok:false,message:'الطريقة غير مدعومة.'});
  const action=body.action;
  if(action==='generate'){
   const count=body.count;
   if(!Number.isInteger(count)||count<1||count>100)return res.status(400).json({ok:false,message:'اختر عددًا من 1 إلى 100 باركود.'});
   const [end]=await pipeline([['INCRBY',COUNTER,count]]);
   const now=new Date().toISOString(),items=Array.from({length:count},(_,i)=>({
    code:codeFor(end-count+i+1),status:'unassigned',productId:null,version:0,createdAt:now,updatedAt:now,createdBy:user.role,updatedBy:user.role
   }));
   // The sequence is allocated atomically and never recycled, even if a storage operation fails.
   await pipeline(items.flatMap(item=>[['SET',PREFIX+item.code,JSON.stringify(item)],['LPUSH',INDEX,item.code]]));
   await pipeline([['LTRIM',INDEX,0,4999]]);
   return res.status(201).json({ok:true,items});
  }
  if(action==='transition'){
   const code=String(body.code||'').trim().toUpperCase(),status=body.status,version=body.version;
   if(!validCode(code)||!['linked','unlinked','printed','cancelled'].includes(status)||!Number.isInteger(version)||version<0)return res.status(400).json({ok:false,message:'بيانات ربط الباركود غير صالحة.'});
   if(status==='cancelled'&&user.role!=='admin')return res.status(403).json({ok:false,message:'إلغاء الباركود للإدارة فقط.'});
   let productId='';
   if(status==='linked'){
    productId=String(body.productId||'');
    const products=await productsData(),product=products.find(p=>p.id===productId&&p.active);
    if(!product)return res.status(400).json({ok:false,message:'اختر منتجًا موجودًا ونشطًا أولًا.'});
   }
   const item=await changeRecord(code,{status,version,productId,user});
   return res.status(200).json({ok:true,item});
  }
  return res.status(400).json({ok:false,message:'العملية غير مدعومة.'});
 }catch(e){return res.status(400).json({ok:false,message:e.message||'تعذر حفظ الباركود.'});}
}
