import { session } from './api/_session.js';
export const config={matcher:['/((?!api/|assets/|login|login\\.html).*)']};
export default async function middleware(request){
 const admin=/^\/admin(?:\.html)?\/?$/.test(new URL(request.url).pathname);
 try{
  const identity=await session(request,admin?'admin':undefined);
  if(identity)return new Response(null,{headers:{'x-middleware-next':'1'}});
  return new Response(null,{status:307,headers:{location:'/login'+(admin?'?role=admin':'')}});
 }catch{return new Response('خدمة الدخول غير متاحة مؤقتًا. حاول لاحقًا.',{status:503,headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});}
}
