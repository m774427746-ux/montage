// Show / hide toggle for password fields. Stays in the chosen state until the user presses the button again.
document.querySelectorAll('[data-reveal]').forEach(button=>{
 const input=document.getElementById(button.dataset.reveal);
 const set=(visible)=>{input.type=visible?'text':'password';button.textContent=visible?'إخفاء':'إظهار';button.setAttribute('aria-pressed',String(visible));button.setAttribute('aria-label',visible?'إخفاء كلمة المرور':'إظهار كلمة المرور');};
 set(false);
 button.addEventListener('click',()=>{set(input.type==='password');input.focus();});
});
