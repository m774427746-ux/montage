import {randomUUID} from 'node:crypto';
import {pipeline} from '../api/_redis.js';
import {session,parseBody} from '../api/_session.js';
const KEY='montage:managed-products:v1';
// Demos have NO sale price. No demo quote is ever represented as approved.
export const examples=[
 {id:'demo-invoice-books',category:'offset',name:'دفاتر فواتير — 100 دفتر',spec:'100 دفتر فواتير، كل دفتر 50 ورقة، ترقيم وتسلسل؛ المقاس والألوان حسب الطلب',unit:'دفتر',packQty:100,price:null,notes:'التسعير يشمل الطباعة فقط إذا اعتمدت الإدارة تفاصيل الورق والتجليد؛ المثال غير مسعّر.',active:true},
 {id:'demo-cups-4oz',category:'offset',name:'أكواب ورقية 4 أونص — طبقتين',spec:'طباعة لون واحد، طبقتان، مقاس 4 أونص؛ كمية التجهيز حسب طلب العميل',unit:'كوب',packQty:1000,price:null,notes:'تأكد من التوريد ونوعية الكرتون، سعر الطباعة والتغليف قبل اعتماد السعر.',active:true},
 {id:'demo-business-cards',category:'offset',name:'كروت عمل مطبوعة',spec:'كرت 9 × 5 سم، وجهين 4 ألوان، ورق 350 جرام',unit:'كرت',packQty:1000,price:null,notes:'اللمعة والقص والتشطيب ليست مشمولة قبل اعتماد التكلفة.',active:true},
 {id:'demo-promotional-mug',category:'gifts',name:'كوب دعائي مطبوع',spec:'كوب سيراميك، طباعة شعار ملون',unit:'كوب',packQty:36,price:null,notes:'اللون والتغليف وطريقة الطباعة تحدد عند تأكيد الطلب.',active:true},
 {id:'demo-promotional-pens',category:'gifts',name:'أقلام دعائية بشعار',spec:'قلم بلاستيك، شعار لون واحد',unit:'قلم',packQty:100,price:null,notes:'تأكد من نوع الحبر والتغليف والكمية.',active:true},
 {id:'demo-promotional-flags',category:'gifts',name:'أعلام دعائية',spec:'علم قماش 30 × 45 سم، طباعة ملونة، عصا اختيارية',unit:'علم',packQty:50,price:null,notes:'نوع القماش والعصا والتجهيز والتركيب حسب اعتماد الإدارة.',active:true}
];
const string=(v,n)=>typeof v==='string'?v.trim().slice(0,n):'';
const money=v=>v===null||v===''||v===undefined?null:(typeof v==='number'&&Number.isFinite(v)&&v>0&&v<1e7?v:NaN);
const validate=(raw,old)=>{
 const category=string(raw.category,20),name=string(raw.name,100),spec=string(raw.spec,300),unit=string(raw.unit,24),notes=string(raw.notes,500);
 const packQty=Number(raw.packQty),price=money(raw.price);
 if(!['offset','gifts'].includes(category)||!name||!spec||!unit||!Number.isInteger(packQty)||packQty<1||packQty>10000000||Number.isNaN(price)||typeof raw.active!=='boolean')throw Error('راجع الاسم والمواصفات والكمية والسعر وحالة المنتج.');
 return {id:old?.id||randomUUID(),category,name,spec,unit,notes,packQty,price,active:raw.active};
};
export async function productsData(){
 const [raw]=await pipeline([['GET',KEY]]);
 if(!raw)return examples.map(x=>({...x}));
 const items=JSON.parse(raw);
 if(!Array.isArray(items))throw Error('بيانات الكتالوج غير صالحة.');
 return items;
}
export async function productsHandler(req,res){
 res.setHeader('Cache-Control','no-store');
 try {
  const user=await session(req);if(!user)return res.status(401).json({message:'سجّل الدخول أولًا.'});
  if(req.method==='GET'){
   const items=await productsData();
   return res.status(200).json({ok:true,canEdit:user.role==='admin',items:items.filter(x=>user.role==='admin'||x.active).map(x=>({...x,priceStatus:x.price===null?'غير معتمد':'معتمد من الإدارة'}))});
  }
  if(user.role!=='admin')return res.status(403).json({message:'تعديل المنتجات والأسعار للإدارة فقط.'});
  if(!['POST','PUT'].includes(req.method))return res.status(405).json({message:'الطريقة غير مدعومة.'});
  const body=parseBody(req),items=await productsData(),old=body.id?items.find(x=>x.id===body.id):null;
  if(req.method==='PUT'&&!old)return res.status(404).json({message:'المنتج غير موجود.'});
  if(items.length>=300&&req.method==='POST')return res.status(400).json({message:'تم بلوغ الحد الأعلى للمنتجات.'});
  const clean=validate(body,old);
  const updated=old?items.map(x=>x.id===old.id?clean:x):[...items,clean];
  await pipeline([['SET',KEY,JSON.stringify(updated)]]);
  return res.status(old?200:201).json({ok:true,item:clean});
 }catch(e){return res.status(400).json({message:e.message||'تعذّر حفظ المنتج.'});}
}
