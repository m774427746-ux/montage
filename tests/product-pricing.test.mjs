import {test} from 'node:test';
import assert from 'node:assert/strict';
import {basis,provisionalProfile,calculateProductQuote,validateProfile} from '../api/_product-pricing.js';
const offer={id:'creative-vinyl-0',name:'ستيكر أبيض مطفي',spec:'1.07 m',unit:'رول',packageSpec:'',price:161,vat:.15};
const policy={minMargin:20,maxMargin:70};
const profile=provisionalProfile(offer);
test('1000 stickers use 2.4 metres of a 50 metre roll and default to maximum margin',()=>{
 const q=calculateProductQuote({qty:1000,widthCm:5,heightCm:5},offer,profile,policy);
 assert.equal(q.ok,true);assert.equal(q.layout.across,21);assert.equal(q.areaM2,2.568);assert.equal(q.chargedUnits,.048);
 assert.equal(q.materialCost,8.89);assert.equal(q.cost,8.89);assert.equal(q.total,29.64);assert.equal(q.profit,20.75);assert.equal(q.margin,70);
});
test('production, setup and waste are included before margin and reduced margins remain protected',()=>{
 const p={...profile,costPerPiece:.2,costPerM2:10,setupCost:15,wastePct:5,gapMm:2};
 const q=calculateProductQuote({qty:1000,widthCm:5,heightCm:5,margin:20},offer,p,policy);
 assert.equal(q.plannedQty,1050);assert.ok(q.cost>225);assert.ok(q.profit/q.total>=.2-1e-9);
 for(const margin of [19,71,-20,NaN,null])assert.equal(calculateProductQuote({qty:1000,widthCm:5,heightCm:5,margin},offer,p,policy).error,'margin_limit');
});
test('rotation fits narrow stock, oversized pieces and invalid quantities are rejected',()=>{
 const p={...profile,stockWidthCm:10,stockLengthCm:100};
 const q=calculateProductQuote({qty:10,widthCm:20,heightCm:5},offer,p,policy);assert.equal(q.ok,true);assert.equal(q.layout.width,5);
 assert.equal(calculateProductQuote({qty:10,widthCm:20,heightCm:200},offer,p,policy).error,'does_not_fit');
 for(const qty of [0,-1,1.5,'1000',1000001])assert.equal(calculateProductQuote({qty,widthCm:5,heightCm:5},offer,p,policy).error,'quantity');
});
test('sheets and packs charge full purchase units and missing or changed cost profiles cannot quote',()=>{
 const p={...profile,mode:'unit',packQty:100,setupCost:0,costPerPiece:0,costPerM2:0};
 assert.equal(calculateProductQuote({qty:101},offer,p,policy).materialCost,370.3);
 const sheet={...p,mode:'sheet',stockWidthCm:10,stockLengthCm:10};
 assert.equal(calculateProductQuote({qty:5,widthCm:5,heightCm:5},offer,sheet,policy).packs,2);
 assert.equal(calculateProductQuote({qty:10},offer,null,policy).error,'cost_missing');
 assert.equal(calculateProductQuote({qty:10},{...offer,spec:'1.52 m'},p,policy).error,'cost_missing');
 assert.equal(validateProfile({...p,setupCost:null}),false);assert.equal(validateProfile({...p,confirmed:false}),false);
});
test('material consumption scales across multiple rolls without understating the required rows',()=>{
 const q=calculateProductQuote({qty:21001,widthCm:5,heightCm:5},offer,profile,policy);
 assert.equal(q.packs,2);assert.equal(q.areaM2,53.5535);assert.equal(q.chargedUnits,1.001);
 assert.ok(q.actualMargin>=70);
});
