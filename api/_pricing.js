import { readFileSync } from 'node:fs';
import { pipeline } from './_redis.js';
export const materials=JSON.parse(readFileSync(new URL('../src/assets/materials.json',import.meta.url),'utf8'));
export const defaultPolicy={minMargin:20,maxMargin:70,defaultMargin:35,funMessages:true};
export async function catalog(){
 const [prices,policy]=await pipeline([['GET','montage:prices'],['GET','montage:policy']]);
 const saved=prices?JSON.parse(prices):null;
 return {items:materials.map(m=>{const s=saved?.items?.find(x=>x.id===m.id)||{};return {...m,retail:m.rate,individual:null,cost:null,designerCanEdit:false,...s};}),policy:{...defaultPolicy,...(policy?JSON.parse(policy):{})},updatedAt:saved?.updatedAt||null};
}
export const publicItem=({cost,...item})=>item;
export function calculateQuote(body,item,policy){
 const qty=Number(body.qty),w=Number(body.width),h=body.circle?w:Number(body.height);
 if(!Number.isInteger(qty)||qty<1||qty>1000000||(item.unit==='cm2'&&(!Number.isFinite(w)||!Number.isFinite(h)||w<=0||h<=0||w>400||h>400)))return {ok:false,error:'invalid_dimensions',message:'راجع المقاس بالسنتيمتر والكمية قبل الحساب.'};
 if(item.cost===null||!Number.isFinite(item.cost)||item.cost<0)return {ok:false,error:'cost_missing',message:'الإدارة لم تعتمد تكلفة هذه الخامة بعد. اطلب استكمالها قبل التسعير.'};
 const editable=item.designerCanEdit===true;
 let rate;
 if(editable){
  const margin=Number(body.margin);
  if(!Number.isFinite(margin)||margin<policy.minMargin||margin>policy.maxMargin)return {ok:false,error:'margin_limit',message:policy.funMessages?'الماكينة تشتغل… بس الربح أخذ إجازة 😅 التزم بحدود الربح المعتمدة.':'نسبة الربح خارج الحدود التي حددتها الإدارة.'};
  rate=body.customRate!==undefined?Number(body.customRate):item.cost/(1-margin/100);
 }else rate=body.client==='individual'?(item.individual??(item.retail===null?null:item.retail*2)):item.retail;
 if(rate===null||!Number.isFinite(rate)||rate<=0)return {ok:false,error:'price_missing',message:'سعر هذه الخامة غير معتمد بعد. تواصل مع الإدارة.'};
 // Round upwards so a displayed/sent rate cannot fall below the required margin.
 rate=Math.ceil(rate*1000000-1e-9)/1000000;
 const actualMargin=(rate-item.cost)/rate*100;
 if(actualMargin<0)return {ok:false,error:'loss',message:policy.funMessages?'السعر أقل من التكلفة… كذا أنت خسران، والعميل أخذ الربح مع الطلب 😅':'السعر أقل من التكلفة. لا يمكن اعتماد عرض بخسارة.'};
 if(actualMargin+1e-7<policy.minMargin||(editable&&actualMargin>policy.maxMargin+1e-7))return {ok:false,error:'margin_limit',message:policy.funMessages?'لا تبيع الربح مع الطلب هدية 😅 السعر خارج حدود الإدارة.':'السعر خارج حدود الربح المعتمدة.'};
 const area=item.unit==='cm2'?w*h:1,totalCost=item.cost*area*qty;
 const total=Math.ceil(rate*area*qty*100-1e-8)/100,per=total/qty;
 const finalMargin=(total-totalCost)/total*100;
 if(editable&&finalMargin>policy.maxMargin+1e-7)return {ok:false,error:'rounding_limit',message:'تقريب المبلغ للهللة يتجاوز حد الربح لهذه الكمية. زِد الكمية أو خفّض النسبة قليلًا.'};
 return {ok:true,name:item.name,unit:item.unit,rate,per:Number(per.toFixed(6)),total,margin:Number(finalMargin.toFixed(2)),qty,width:w,height:h,editable};
}
