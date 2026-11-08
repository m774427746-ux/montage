import ExcelJS from 'exceljs';
import { randomUUID } from 'node:crypto';
import { configured,pipeline } from './_redis.js';
import { session,parseBody } from './_session.js';
import { catalog } from './_pricing.js';
import { supplierCatalog,supplierKey,offerKey } from './_suppliers.js';

// XLSX is read and written only on the server after administrator authentication.
// Import is additive: rows missing from an uploaded workbook are never deleted.
const COLUMNS={
 prices:['id','name','unit','cost','retail','individual','designerCanEdit'],
 suppliers:['id','name','source'],
 offers:['id','supplierId','supplierName','productKey','category','name','spec','unit','packageSpec','price','vatPercent','source','unitNote']
};
const str=(v,max=160)=>typeof v==='string'?v.trim().slice(0,max):String(v??'').trim().slice(0,max);
const price=(v,nullable=false)=>{if(v===''||v===null||v===undefined){if(nullable)return null;throw Error('سعر مطلوب فارغ.');}const n=Number(v);if(!Number.isFinite(n)||n<0||n>=1000000)throw Error('سعر غير صالح: '+v);return n;};
const textValue=cell=>{const v=cell.value;if(v===null||v===undefined)return '';if(typeof v==='object')throw Error('لا يُسمح بالصيغ أو الروابط أو الخلايا المركبة في ملف الاستيراد.');return v;};
function readSheet(book,name,headers,limit=1200){
 const ws=book.getWorksheet(name);if(!ws)throw Error('الورقة المطلوبة غير موجودة: '+name);
 if(ws.rowCount>limit+1)throw Error('عدد الصفوف أكبر من الحد المسموح في '+name);
 for(let i=0;i<headers.length;i++)if(str(textValue(ws.getRow(1).getCell(i+1)))!==headers[i])throw Error('عناوين الأعمدة تغيّرت في '+name+'. نزّل نسخة جديدة من الملف.');
 const data=[];
 for(let index=2;index<=ws.rowCount;index++){
  const row=ws.getRow(index);const record=Object.fromEntries(headers.map((h,i)=>[h,textValue(row.getCell(i+1))]));
  if(Object.values(record).every(v=>v===''||v===null||v===undefined))continue;
  record._row=index;data.push(record);
 }
 return data;
}
function addSheet(book,name,headers,rows){
 const ws=book.addWorksheet(name,{views:[{state:'frozen',ySplit:1}]});
 ws.addRow(headers);ws.getRow(1).font={bold:true};
 for(const row of rows)ws.addRow(headers.map(h=>row[h]??''));
 ws.columns=headers.map(h=>({header:h,key:h,width:Math.max(16,Math.min(32,h.length+12))}));
 ws.autoFilter={from:{row:1,column:1},to:{row:Math.max(1,ws.rowCount),column:headers.length}};
}
async function exportBook(type){
 const wb=new ExcelJS.Workbook();wb.creator='Montage / Asbarix';
 if(type==='prices'){
  const data=await catalog();
  addSheet(wb,'Prices',COLUMNS.prices,data.items.map(({id,name,unit,cost,retail,individual,designerCanEdit})=>({id,name,unit,cost,retail,individual,designerCanEdit})));
 }else{
  const data=await supplierCatalog(),byId=new Map(data.suppliers.map(s=>[s.id,s.name]));
  addSheet(wb,'Suppliers',COLUMNS.suppliers,data.suppliers.map(({id,name,source})=>({id,name,source})));
  addSheet(wb,'Offers',COLUMNS.offers,data.offers.map(o=>({id:o.id,supplierId:o.supplierId,supplierName:byId.get(o.supplierId)||'',productKey:o.productKey,category:o.category,name:o.name,spec:o.spec,unit:o.unit,packageSpec:o.packageSpec,price:o.price,vatPercent:o.vat*100,source:o.source,unitNote:o.unitNote})));
 }
 return Buffer.from(await wb.xlsx.writeBuffer());
}
function validatePrices(wb,existing){
 const rows=readSheet(wb,'Prices',COLUMNS.prices,600);
 if(!rows.length)throw Error('ملف الأسعار فارغ.');
 const known=new Map(existing.items.map(x=>[x.id,x])),seen=new Set();
 const data=rows.map(r=>{
  const id=str(r.id,20),original=known.get(id);
  if(!original||seen.has(id))throw Error('معرف صنف مجهول أو مكرر في الصف '+r._row);
  if(str(r.name)!==original.name||str(r.unit)!==original.unit)throw Error('لا تغيّر اسم الصنف أو الوحدة في الصف '+r._row);
  seen.add(id);
  const b=r.designerCanEdit,editable=b===true||b===1||/^true|yes|نعم|1$/i.test(str(b));
  if(!(b===false||b===0||b===true||b===1||/^(true|false|yes|no|نعم|لا|0|1)$/i.test(str(b))))throw Error('صلاحية تعديل السعر غير صحيحة في الصف '+r._row);
  return {id,cost:price(r.cost,true),retail:price(r.retail,true),individual:price(r.individual,true),designerCanEdit:editable};
 });
 // Keep existing entries not present in the upload so partial workbooks cannot erase prices.
 for(const x of existing.items)if(!seen.has(x.id))data.push({id:x.id,cost:x.cost,retail:x.retail,individual:x.individual,designerCanEdit:x.designerCanEdit});
 return {rows:rows.length,items:data};
}
function validateSuppliers(wb,current){
 const sr=readSheet(wb,'Suppliers',COLUMNS.suppliers,400),or=readSheet(wb,'Offers',COLUMNS.offers,1500);
 if(!sr.length||!or.length)throw Error('ملف الموردين يحتاج ورقتي Suppliers وOffers وفيهما بيانات.');
 const suppliers=new Map(current.suppliers.map(s=>[s.id,s])),names=new Map(current.suppliers.map(s=>[s.name.toLocaleLowerCase('ar'),s.id]));
 const created=[],supplierSeen=new Set();
 for(const r of sr){
  const name=str(r.name,80),oldId=str(r.id,80);if(!name)throw Error('اسم مورد فارغ في الصف '+r._row);
  const id=oldId||(names.get(name.toLocaleLowerCase('ar'))||randomUUID());
  if(supplierSeen.has(id))throw Error('مورد مكرر في الصف '+r._row);
  if(id==='creative'&&name!=='كريتيف')throw Error('لا يمكن تغيير هوية المورد الافتراضي.');
  if(oldId&&!suppliers.has(oldId))throw Error('معرف مورد غير معروف في الصف '+r._row+'؛ اترك المعرف فارغًا للمورد الجديد.');
  if(suppliers.has(id)&&suppliers.get(id).name!==name)throw Error('تغيير أسماء الموردين الموجودين يتطلب تعديلًا داخل الإدارة.');
  supplierSeen.add(id);names.set(name.toLocaleLowerCase('ar'),id);
  if(!suppliers.has(id)){const s={id,name,source:str(r.source),updated:new Date().toISOString().slice(0,10)};created.push(s);suppliers.set(id,s);}
 }
 const known=new Map(current.offers.map(o=>[o.id,o])),seen=new Set(),offers=[];
 for(const r of or){
  let supplierId=str(r.supplierId,80);
  if(!supplierId)supplierId=names.get(str(r.supplierName,80).toLocaleLowerCase('ar'));
  if(!suppliers.has(supplierId))throw Error('مورد غير معروف في صف السعر '+r._row+'. أضفه أولًا في ورقة Suppliers.');
  const originalId=str(r.id,100),old=originalId?known.get(originalId):null;
  if(originalId&&!old)throw Error('معرف سعر مجهول في الصف '+r._row+'؛ اتركه فارغًا لإضافة سعر جديد.');
  if(old&&old.supplierId!==supplierId)throw Error('لا يمكن نقل السعر القديم إلى مورد آخر في الصف '+r._row);
  const id=old?.id||randomUUID();if(seen.has(id))throw Error('سعر مكرر في صف '+r._row);seen.add(id);
  const vatPercent=price(r.vatPercent),p=price(r.price);
  if(p<=0||vatPercent>100)throw Error('السعر أو الضريبة غير صحيحين في الصف '+r._row);
  const offer={id,supplierId,productKey:old?.productKey||str(r.productKey,100)||randomUUID(),category:str(r.category,100),name:str(r.name),spec:str(r.spec),unit:str(r.unit,60),packageSpec:str(r.packageSpec),price:p,vat:vatPercent/100,currency:'SAR',source:str(r.source)||'Excel الإدارة',sourcePage:old?.sourcePage??null,updated:new Date().toISOString().slice(0,10),unitNote:str(r.unitNote,300)};
  if(!offer.category||!offer.name||!offer.spec||!offer.unit)throw Error('حقول صنف ناقصة في الصف '+r._row);
  offers.push(offer);
 }
 return {rows:sr.length+or.length,created,offers};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!configured())return res.status(503).json({message:'التخزين المشترك غير مفعّل.'});
 const user=await session(req);if(user?.role!=='admin')return res.status(403).json({message:'استيراد وتصدير Excel للإدارة فقط.'});
 const type=req.query?.type;if(!['prices','suppliers'].includes(type))return res.status(400).json({message:'حدد نوع الملف.'});
 if(!['GET','POST'].includes(req.method))return res.status(405).json({message:'الطريقة غير مدعومة.'});
 try{
  if(req.method==='GET'){
   const bytes=await exportBook(type);
   res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   res.setHeader('Content-Disposition','attachment; filename="montage-'+type+'.xlsx"');
   return res.status(200).send(bytes);
  }
  const {base64}=parseBody(req);if(typeof base64!=='string'||base64.length>2800000||base64.length<100) return res.status(413).json({message:'ملف Excel مفقود أو كبير جدًا (الحد 2 ميجابايت).'});
  const bytes=Buffer.from(base64,'base64');if(bytes.length>2*1024*1024||bytes.length<100)throw Error('حجم ملف Excel غير مسموح.');
  const wb=new ExcelJS.Workbook();await wb.xlsx.load(bytes);
  if(wb.worksheets.length>(type==='prices'?1:2))throw Error('عدد أوراق الملف غير متوقع.');
  if(type==='prices'){
   const rows=validatePrices(wb,await catalog());
   await pipeline([['SET','montage:prices',JSON.stringify({updatedAt:new Date().toISOString(),items:rows.items})]]);
   return res.status(200).json({ok:true,updated:rows.rows});
  }
  const data=validateSuppliers(wb,await supplierCatalog());
  const operations=[...data.created.map(s=>['HSET',supplierKey,s.id,JSON.stringify(s)]),...data.offers.map(o=>['HSET',offerKey,o.id,JSON.stringify(o)])];
  if(operations.length)await pipeline(operations);
  return res.status(200).json({ok:true,updated:data.rows});
 }catch(e){return res.status(400).json({message:'تعذر استيراد الملف: '+(e?.message||'بيانات غير صالحة')});}
}
