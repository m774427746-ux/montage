// Barcode Code 39 for internal inventory/label use; not an EAN/GS1 registration.
(()=>{'use strict';
const patterns={
'0':'nnnwwnwnn','1':'wnnwnnnnw','2':'nnwwnnnnw','3':'wnwwnnnnn','4':'nnnwwnnnw','5':'wnnwwnnnn','6':'nnwwwnnnn','7':'nnnwnnwnw','8':'wnnwnnwnn','9':'nnwwnnwnn',
'A':'wnnnnwnnw','B':'nnwnnwnnw','C':'wnwnnwnnn','D':'nnnnwwnnw','E':'wnnnwwnnn','F':'nnwnwwnnn','G':'nnnnnwwnw','H':'wnnnnwwnn','I':'nnwnnwwnn','J':'nnnnwwwnn',
'K':'wnnnnnnww','L':'nnwnnnnww','M':'wnwnnnnwn','N':'nnnnwnnww','O':'wnnnwnnwn','P':'nnwnwnnwn','Q':'nnnnnnwww','R':'wnnnnnwwn','S':'nnwnnnwwn','T':'nnnnwnwwn',
'U':'wwnnnnnnw','V':'nwwnnnnnw','W':'wwwnnnnnn','X':'nwnnwnnnw','Y':'wwnnwnnnn','Z':'nwwnwnnnn',
'-':'nwnnnnwnw','.':'wwnnnnwnn',' ':'nwwnnnwnn','$':'nwnwnwnnn','/':'nwnwnnnwn','+':'nwnnnwnwn','%':'nnnwnwnwn','*':'nwnnwnwnn'
};
function encode(value){
 if(typeof value!=='string'||!/^[A-Z0-9 -]{1,30}$/.test(value))throw Error('رقم الباركود غير صالح.');
 const text='*'+value+'*';const narrow=2,wide=5,quiet=18,height=82;
 let x=quiet,rects='';
 for(const symbol of text){
  const seq=patterns[symbol];if(!seq)throw Error('رمز غير مدعوم.');
  for(let i=0;i<9;i++){const w=seq[i]==='w'?wide:narrow;if(i%2===0)rects+='<rect x="'+x+'" y="8" width="'+w+'" height="'+height+'"/>';x+=w;}
  x+=narrow;
 }
 const width=x+quiet;
 return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' 124" width="'+width+'" height="124" role="img" aria-label="باركود '+value+'"><rect width="'+width+'" height="124" fill="#fff"/><g fill="#111">'+rects+'</g><text x="'+width/2+'" y="112" font-family="Arial, sans-serif" text-anchor="middle" font-size="15" letter-spacing="1" fill="#111">'+value+'</text></svg>';
}
function download(value){
 const svg=encode(value),blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='montage-'+value+'.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
window.MontageBarcode={encode,download};
})();