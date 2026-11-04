import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes,randomUUID} from 'node:crypto';
process.env.KV_REST_API_URL='https://redis.test';process.env.KV_REST_API_TOKEN='test';process.env.PRODUCTION_SYNC_SECRET='test-only-'.repeat(5);
const store=new Map(),orders=new Map();
globalThis.fetch=async(url,options)=>({ok:true,json:async()=>JSON.parse(options.body).map(([cmd,...a])=>{
 let result=null;
 if(cmd==='GET')result=store.get(a[0])||null;
 if(cmd==='SET'){if(a.includes('NX')&&store.has(a[0]))result=null;else{store.set(a[0],a[1]);result='OK';}}
 if(cmd==='HVALS')result=[...orders.values()];
 if(cmd==='EVAL'){const old=orders.get(a[3]);if(!old||JSON.parse(old).version<Number(a[4]))orders.set(a[3],a[5]);result=1;}
 return {result};
})});
const {default:handler}=await import('../api/production.js');
async function call({body,headers={},method='POST'}={}){const res={code:200,setHeader(){},status(n){this.code=n;return this;},json(d){this.data=d;return this;}};await handler({method,headers,body},res);return res;}
function signed(body){const time=String(Date.now()),nonce=randomBytes(16).toString('hex');return {body,headers:{'x-production-time':time,'x-production-nonce':nonce,'x-production-signature':createHmac('sha256',process.env.PRODUCTION_SYNC_SECRET).update(time+'.'+nonce+'.'+JSON.stringify(body)).digest('hex')}};}
const event={id:randomUUID(),number:'1',customer:'Synthetic',machine:'canon',status:'new',version:1,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),designer:'Test',operator:null,total:null,pricingError:'cost_missing'};
test('cloud production rejects unsigned writes and unauthorized reads',async()=>{assert.equal((await call({body:{events:[event]}})).code,401);assert.equal((await call({method:'GET'})).code,401);});
test('cloud projection accepts signed allowlisted metadata, rejects replays and never regresses',async()=>{
 const request=signed({events:[event]});assert.equal((await call(request)).code,200);assert.equal((await call(request)).code,409);
 assert.equal((await call(signed({events:[{...event,version:2,status:'received'}]}))).code,200);
 assert.equal((await call(signed({events:[event]}))).code,200);assert.equal(JSON.parse(orders.get(event.id)).version,2);
 assert.equal((await call(signed({events:[{...event,fileContents:'forbidden'}]}))).code,400);
 const changed=signed({events:[event]});changed.body={events:[]};assert.equal((await call(changed)).code,401);
});
