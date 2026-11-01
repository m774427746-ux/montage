import { test } from 'node:test';
import assert from 'node:assert/strict';
process.env.TEAM_CODE='local-test-team';
process.env.ADMIN_KEY='local-test-admin';
process.env.KV_REST_API_URL='https://redis.test';
process.env.KV_REST_API_TOKEN='local-test-token';
const store=new Map(),hashes=new Map();
globalThis.fetch=async(url,options)=>{
 assert.equal(url,'https://redis.test/pipeline');assert.equal(options.headers.Authorization,'Bearer local-test-token');
 const results=JSON.parse(options.body).map(([cmd,...a])=>{
  let result;
  if(cmd==='GET')result=store.get(a[0])??null;
  else if(cmd==='SET'){store.set(a[0],a[1]);result='OK';}
  else if(cmd==='DEL')result=store.delete(a[0])?1:0;
  else if(cmd==='INCR'){result=Number(store.get(a[0])||0)+1;store.set(a[0],result);}
  else if(cmd==='EXPIRE')result=1;
  else if(cmd==='HVALS')result=[...(hashes.get(a[0])||new Map()).values()];
  else if(cmd==='HDEL')result=hashes.get(a[0])?.delete(a[1])?1:0;
  else if(cmd==='EVAL'){let map=hashes.get(a[2]);if(!map){map=new Map();hashes.set(a[2],map);}if(map.size>=100&&!map.has(a[3]))result=0;else {map.set(a[3],a[4]);result=1;}}
  else if(cmd==='SMEMBERS'||cmd==='HGETALL')result=[];
  else throw Error('Unexpected Redis command: '+cmd);
  return {result};
 });
 return {ok:true,json:async()=>results};
};
const {default:login}=await import('../api/login.js');
const {default:manage}=await import('../api/manage.js');
const {default:favorites}=await import('../api/favorites.js');
const {default:prices}=await import('../api/prices.js');
const {default:stats}=await import('../api/stats.js');
const {default:signup}=await import('../api/signup.js');
const {default:middleware}=await import('../middleware.js');
const {calculateQuote}=await import('../api/_pricing.js');
async function call(handler,{method='GET',body,cookie='',action='session'}={}){
 const res={code:200,headers:{},setHeader(k,v){this.headers[k]=v;},status(v){this.code=v;return this;},json(v){this.body=v;return this;}};
 await handler({method,body,headers:{cookie},query:{action}},res);return res;
}
let team='',admin='';
test('unified login validates role passwords and issues random protected sessions',async()=>{
 for(const body of ['null','[]','{'])assert.equal((await call(login,{method:'POST',body})).code,401);
 for(const password of ['','wrong'])assert.equal((await call(login,{method:'POST',body:{role:'team',password}})).code,401);
 for(const role of ['team','admin']){
  const r=await call(login,{method:'POST',body:{role,password:role==='admin'?process.env.ADMIN_KEY:process.env.TEAM_CODE}});
  assert.equal(r.code,200);assert.match(r.headers['Set-Cookie'],/HttpOnly; Secure; SameSite=Strict/);
  const cookie=r.headers['Set-Cookie'].split(';')[0];if(role==='admin')admin=cookie;else team=cookie;
  assert.equal((await call(manage,{cookie,action:'session'})).body.role,role);
 }
});
test('admin enters designer area directly; team cannot enter admin or change official settings',async()=>{
 const request=(url,cookie)=>new Request('https://test.invalid'+url,{headers:{cookie}});
 assert.equal((await middleware(request('/',admin))).headers.get('x-middleware-next'),'1');
 assert.equal((await middleware(request('/admin',admin))).headers.get('x-middleware-next'),'1');
 assert.equal((await middleware(request('/admin',team))).status,307);
 assert.equal((await middleware(request('/','asb_session='+ 'f'.repeat(64)))).status,307);
 assert.equal((await call(manage,{cookie:team,action:'settings'})).code,403);
 assert.equal((await call(stats,{cookie:team})).code,401);
 assert.equal((await call(signup,{method:'POST',body:{email:'test@example.com'}})).code,401);
 assert.equal((await call(prices,{method:'PUT',cookie:team,body:{prices:[]}})).code,401);
});
test('shared favorites persist across sessions and reject unexpected fields',async()=>{
 const item={id:'test-favorite',name:'بطاقات',tab:'sheets',fields:{'sh-w':'9','sh-h':'5','sh-rot':true}};
 assert.equal((await call(favorites,{method:'POST',cookie:team,body:item})).code,200);
 assert.deepEqual((await call(favorites,{cookie:admin})).body.items,[item]);
 assert.equal((await call(favorites,{method:'POST',cookie:team,body:{...item,fields:{password:'x'}}})).code,400);
 assert.equal((await call(favorites,{method:'DELETE',cookie:team,body:{id:item.id}})).code,200);
 assert.deepEqual((await call(favorites,{cookie:team})).body.items,[]);
});
test('profit margin is from selling price; underpricing and forged official rates are blocked',()=>{
 const policy={minMargin:20,maxMargin:70,defaultMargin:35,funMessages:true};
 const flexible={name:'أكريليك',unit:'cm2',cost:.8,retail:1,individual:2,designerCanEdit:true};
 const body={id:'2',qty:100,width:10,height:15,margin:20};
 let r=calculateQuote(body,flexible,policy);assert.equal(r.ok,true);assert.equal(r.rate,1);assert.equal(r.total,15000);assert.equal(r.margin,20);
 assert.equal(calculateQuote({...body,margin:19},flexible,policy).ok,false);
 assert.equal(calculateQuote({...body,margin:71},flexible,policy).ok,false);
 assert.equal(calculateQuote({...body,customRate:.9},flexible,policy).ok,false);
 assert.equal(calculateQuote({...body,customRate:.5},flexible,policy).error,'loss');
 const rounded=calculateQuote({...body,qty:3,width:1,height:1,margin:20},{...flexible,cost:.01},policy);assert.equal(rounded.ok,true);assert.ok((rounded.total-.03)/rounded.total*100>=20);
 assert.equal(calculateQuote({...body,customRate:9},flexible,policy).ok,false);
 assert.equal(calculateQuote(body,{...flexible,cost:null},policy).error,'cost_missing');
 assert.equal(calculateQuote({...body,customRate:.1},{...flexible,designerCanEdit:false},policy).rate,1);
 assert.equal(calculateQuote({...body,qty:-1},flexible,policy).ok,false);
 assert.equal(calculateQuote({...body,circle:true},flexible,policy).total,10000);
});
test('only admin saves price/cost/permissions; designers never receive cost',async()=>{
 const item={id:'2',retail:1,individual:2,cost:.8,designerCanEdit:true};
 assert.equal((await call(prices,{cookie:admin,method:'PUT',body:{prices:[item]}})).code,200);
 const publicPrices=await call(prices,{cookie:team});assert.equal('cost' in publicPrices.body.prices.items[0],false);
 const data=await call(manage,{cookie:team,action:'catalog'});assert.equal('cost' in data.body.items[0],false);
 const quote=await call(manage,{cookie:team,action:'quote',method:'POST',body:{id:'2',qty:10,width:10,height:15,margin:20}});
 assert.equal(quote.code,200);assert.equal(quote.body.total,1500);
 assert.equal((await call(manage,{cookie:team,action:'quote',method:'POST',body:{id:'2',qty:10,width:10,height:15,margin:10}})).code,422);
});
test('policy range is validated on server',async()=>{
 assert.equal((await call(manage,{cookie:admin,action:'settings',method:'PUT',body:{minMargin:40,maxMargin:20,defaultMargin:30,funMessages:true}})).code,400);
 assert.equal((await call(manage,{cookie:team,action:'settings',method:'PUT',body:{minMargin:0,maxMargin:94,defaultMargin:0,funMessages:true}})).code,403);
});
test('changing team password hashes it, revokes old sessions and preserves admin access',async()=>{
 const body={role:'team',current:process.env.ADMIN_KEY,password:'new-local-team-pass',confirm:'new-local-team-pass'};
 assert.equal((await call(manage,{cookie:admin,action:'password',method:'POST',body:{...body,current:'wrong'}})).code,401);
 assert.equal((await call(manage,{cookie:admin,action:'password',method:'POST',body})).code,200);
 assert.equal(store.get('montage:auth:team').includes(body.password),false);
 assert.equal((await call(manage,{cookie:team})).code,401);
 assert.equal((await call(manage,{cookie:admin})).code,200);
 assert.equal((await call(login,{method:'POST',body:{role:'team',password:process.env.TEAM_CODE}})).code,401);
 const r=await call(login,{method:'POST',body:{role:'team',password:body.password}});assert.equal(r.code,200);
 team=r.headers['Set-Cookie'].split(';')[0];
});
test('admin password change rotates current session and logout revokes it server-side',async()=>{
 const r=await call(manage,{cookie:admin,action:'password',method:'POST',body:{role:'admin',current:process.env.ADMIN_KEY,password:'new-local-admin-pass',confirm:'new-local-admin-pass'}});
 assert.equal(r.code,200);assert.equal((await call(manage,{cookie:admin})).code,401);
 admin=r.headers['Set-Cookie'].split(';')[0];assert.equal((await call(manage,{cookie:admin})).code,200);
 assert.equal((await call(manage,{cookie:admin,action:'logout',method:'POST'})).code,200);
 assert.equal((await call(manage,{cookie:admin})).code,401);
});
