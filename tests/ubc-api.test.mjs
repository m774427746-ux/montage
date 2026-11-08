import assert from 'node:assert/strict';
process.env.KV_REST_API_URL='https://fake-redis-for-tests.invalid';
process.env.KV_REST_API_TOKEN='test-token';
const store=new Map(),lists=new Map(),hashes=new Map();
const sessionToken='a'.repeat(64);
store.set('montage:session:'+sessionToken,JSON.stringify({role:'team',expires:Date.now()+600000,version:'initial'}));
globalThis.fetch=async (url,options)=>{
 assert(String(url).endsWith('/pipeline'));
 const batch=JSON.parse(options.body);
 const result=batch.map(([cmd,...args])=>{
  let out;
  switch(cmd){
   case 'GET':out=store.get(args[0])??null;break;
   case 'SET':store.set(args[0],args[1]);out='OK';break;
   case 'INCRBY':{out=Number(store.get(args[0])||0)+Number(args[1]);store.set(args[0],String(out));break;}
   case 'LPUSH':{const x=lists.get(args[0])||[];x.unshift(args[1]);lists.set(args[0],x);out=x.length;break;}
   case 'LRANGE':{const a=lists.get(args[0])||[];out=a.slice(Number(args[1]),Number(args[2])+1);break;}
   case 'LTRIM':{const a=lists.get(args[0])||[];lists.set(args[0],a.slice(Number(args[1]),Number(args[2])+1));out='OK';break;}
   case 'HVALS':out=Object.values(hashes.get(args[0])||{});break;
   case 'EVAL':{
    const [script,keyCount,key,version,status,productId,now,role]=args;
    assert.equal(keyCount,1);assert(script.includes('ALREADY_LINKED'));
    const raw=store.get(key);if(!raw){out='MISSING';break;}
    const item=JSON.parse(raw);
    if(item.version!==Number(version)){out='STALE';break;}
    if(item.status==='cancelled'){out='CANCELLED';break;}
    if(status==='linked'){if(item.productId){out='ALREADY_LINKED';break;}item.productId=productId;}
    else if(status==='unlinked'){if(!item.productId){out='NOT_LINKED';break;}item.productId=null;}
    else if(status==='cancelled')item.productId=null;
    else if(status==='printed'){if(item.status==='printed'){out='NO_CHANGE';break;}}
    else {out='BAD_STATUS';break;}
    item.status=status;item.version++;item.updatedAt=now;item.updatedBy=role;
    out=JSON.stringify(item);store.set(key,out);break;
   }
   default:throw Error('Unexpected redis command '+cmd);
  }
  return {result:out};
 });
 return {ok:true,json:async()=>result};
};
const {ubcHandler}=await import('../server/unassigned-barcodes.js');
const req=(method,body,query={})=>({method,body,query,headers:{cookie:'asb_session='+sessionToken}});
async function invoke(request){
 const out={code:200,data:null};const res={setHeader(){},status(n){out.code=n;return this;},json(data){out.data=data;return this;}};
 await ubcHandler(request,res);return out;
}
let result=await invoke(req('POST',{action:'generate',count:10}));
assert.equal(result.code,201);assert.equal(result.data.items.length,10);
assert.equal(result.data.items[0].code,'UBC000001');assert.equal(result.data.items[9].code,'UBC000010');
result=await invoke(req('POST',{action:'generate',count:2}));
assert.equal(result.code,201);assert.equal(result.data.items[0].code,'UBC000011');
result=await invoke(req('GET',{}, {code:'UBC000001'}));
assert.equal(result.data.item.status,'unassigned');assert.equal(result.data.item.product,null);
result=await invoke(req('POST',{action:'transition',code:'UBC000001',status:'linked',productId:'demo-invoice-books',version:0}));
assert.equal(result.code,200);assert.equal(result.data.item.productId,'demo-invoice-books');
result=await invoke(req('POST',{action:'transition',code:'UBC000001',status:'linked',productId:'demo-business-cards',version:0}));
assert.equal(result.code,400);assert.match(result.data.message,/جلسة أخرى/);
result=await invoke(req('GET',{}, {code:'UBC000001'}));
assert.equal(result.data.item.product.sku,'000001');assert.equal(result.data.item.product.supplierOfferIds,undefined);
result=await invoke(req('POST',{action:'transition',code:'UBC000001',status:'unlinked',version:1}));
assert.equal(result.code,200);assert.equal(result.data.item.status,'unlinked');
result=await invoke(req('POST',{action:'transition',code:'UBC000001',status:'printed',version:2}));
assert.equal(result.code,200);assert.equal(result.data.item.status,'printed');
result=await invoke(req('POST',{action:'transition',code:'UBC000001',status:'cancelled',version:3}));
assert.equal(result.code,403);
result=await invoke(req('POST',{action:'generate',count:101}));
assert.equal(result.code,400);
console.log('UBC authenticated generation, linked/unlinked/printed transitions and role restrictions passed (mock Redis)');
