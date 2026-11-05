export function retailQuote(item,body,policy,cost){
 const qty=body.qty;
 if(!Number.isInteger(qty)||qty<1||qty>1e6)return {ok:false,message:'أدخل كمية صحيحة من 1 إلى مليون.'};
 const packs=Math.ceil(qty/item.packQty),chargedQty=packs*item.packQty;
 const known=typeof cost==='number'&&Number.isFinite(cost)&&cost>0;
 const listed=typeof item.minimum==='number'?item.minimum*packs:null;
 if(listed===null&&!known)return {ok:false,message:'السعر غير محدد في الملف. يلزم اعتماد التكلفة من الإدارة.'};
 const ceil=n=>Math.ceil(n*100-1e-8)/100;
 if(!Number.isFinite(policy.minMargin)||!Number.isFinite(policy.maxMargin)||policy.minMargin<0||policy.maxMargin<policy.minMargin||policy.maxMargin>=95)return {ok:false,message:'حدود الربح غير صالحة.'};
 const totalCost=known?ceil(cost*packs):null;
 const minimum=ceil(Math.max(listed||0,known?totalCost/(1-policy.minMargin/100):0));
 const maximum=known?Math.max(minimum,ceil(totalCost/(1-policy.maxMargin/100))):minimum;
 const discount=body.discount===undefined?0:body.discount;
 if(typeof discount!=='number'||!Number.isFinite(discount)||discount<0||discount>100)return {ok:false,message:'التخفيض خارج النطاق.'};
 const total=ceil(maximum-(maximum-minimum)*discount/100);
 if(total>1e12)return {ok:false,message:'الإجمالي أكبر من الحد المسموح.'};
 return {ok:true,qty,chargedQty,packs,minimum,maximum,total,cost:totalCost,profit:known?Math.round((total-totalCost)*100)/100:null,per:total/chargedQty,costReady:known,taxStatus:'غير محدد في الملف'};
}
