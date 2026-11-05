const num=(v,min,max)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
export const pricingKey='montage:product-pricing:v1';
export const basis=o=>JSON.stringify([o.name,o.spec,o.unit,o.packageSpec]);
export function provisionalProfile(offer){
 if(!offer.id.startsWith('creative-vinyl-')||offer.unit!=='رول')return null;
 const width=Number(offer.spec.match(/^([0-9.]+)\s*m$/)?.[1]);
 if(!width||(offer.packageSpec&&offer.packageSpec!==width+' × 50 m'))return null;
 return {mode:'roll',stockWidthCm:width*100,stockLengthCm:5000,packQty:1,setupCost:0,costPerPiece:0,costPerM2:0,wastePct:0,gapMm:0,confirmed:true,basis:basis(offer)};
}
export function validateProfile(p){
 if(!p||!['unit','sheet','roll'].includes(p.mode)||p.confirmed!==true)return false;
 if(!num(p.setupCost,0,1e7)||!num(p.costPerPiece,0,1e6)||!num(p.costPerM2,0,1e6)||!num(p.wastePct,0,100)||!num(p.gapMm,0,100))return false;
 return p.mode==='unit'?p.costPerM2===0&&Number.isInteger(p.packQty)&&p.packQty>=1&&p.packQty<=1e6:num(p.stockWidthCm,.1,1000)&&num(p.stockLengthCm,.1,100000);
}
export function calculateProductQuote(body,offer,p,policy){
 const fail=(error,message)=>({ok:false,error,message});
 if(!p||!validateProfile(p)||p.basis!==basis(offer))return fail('cost_missing','يلزم اعتماد بيانات وحدة الشراء وتكاليف الإنتاج لهذا الصنف من الإدارة أولًا.');
 const qty=body.qty,margin=body.margin===undefined?policy.maxMargin:body.margin;
 if(!Number.isInteger(qty)||qty<1||qty>1e6)return fail('quantity','أدخل كمية صحيحة من 1 إلى مليون.');
 if(!num(policy.minMargin,0,94)||!num(policy.maxMargin,policy.minMargin,94)||!num(margin,policy.minMargin,policy.maxMargin))return fail('margin_limit','الهامش خارج حدود الإدارة. لا يمكن التخفيض دون الحد الأدنى.');
 if(!num(offer.price,.01,1e8)||!num(offer.vat,0,1))return fail('cost_missing','سعر المورد غير صالح.');
 const plannedQty=Math.ceil(qty*(1+p.wastePct/100)-1e-9);
 let packs,capacity,areaM2=0,layout=null;
 if(p.mode==='unit'){capacity=p.packQty;packs=Math.ceil(plannedQty/capacity);}
 else {
  const w=body.widthCm,h=body.heightCm,gap=p.gapMm/10,W=p.stockWidthCm,L=p.stockLengthCm;
  if(!num(w,.01,1000)||!num(h,.01,1000))return fail('dimensions','أدخل عرض الحبة وطولها بالسنتيمتر.');
  const options=[[w,h],[h,w]].map(([width,height])=>{
   const across=Math.floor((W+gap+1e-9)/(width+gap)),rows=Math.floor((L+gap+1e-9)/(height+gap)),n=across*rows;
   if(!n)return null;
   const units=Math.ceil(plannedQty/n),full=Math.floor(plannedQty/n),rest=plannedQty%n;
   const tailRows=rest?Math.ceil(rest/across):0;
   const usedLength=full*L+(tailRows?tailRows*height+(tailRows-1)*gap:0);
   return {width,height,across,rows,capacity:n,packs:units,areaM2:p.mode==='sheet'?units*W*L/1e4:usedLength*W/1e4};
  }).filter(Boolean).sort((a,b)=>a.packs-b.packs||a.areaM2-b.areaM2);
  if(!options.length)return fail('does_not_fit','مقاس الحبة أكبر من وحدة الخامة المعتمدة.');
  layout=options[0];capacity=layout.capacity;packs=layout.packs;areaM2=layout.areaM2;
 }
 const purchaseTax=Math.round(offer.price*offer.vat*100+1e-9)/100;
 const chargedUnits=p.mode==='roll'?areaM2/(p.stockWidthCm*p.stockLengthCm/1e4):packs;
 const materialCost=chargedUnits*Math.round((offer.price+purchaseTax)*100)/100;
 const productionCost=p.setupCost+plannedQty*p.costPerPiece+areaM2*p.costPerM2;
 const cost=Math.ceil((materialCost+productionCost)*100-1e-8)/100;
 const total=Math.ceil(cost/(1-margin/100)*100-1e-8)/100;
 if(!Number.isFinite(total)||total>1e12)return fail('amount_limit','الكمية أو التكاليف كبيرة جدًا.');
 const profit=Math.round((total-cost)*100)/100;
 return {ok:true,name:offer.name,qty,plannedQty,packs,capacity,mode:p.mode,layout,areaM2:Number(areaM2.toFixed(6)),materialCost:Number(materialCost.toFixed(2)),productionCost:Number(productionCost.toFixed(2)),cost,total,minimumTotal:Math.ceil(cost/(1-policy.minMargin/100)*100-1e-8)/100,profit,per:Number((total/qty).toFixed(6)),margin,actualMargin:Number((profit/total*100).toFixed(4)),chargedUnits:Number(chargedUnits.toFixed(8)),costBasis:p.mode==='roll'?'used_roll_length':'full_purchase_units',saleVatIncluded:false};
}
