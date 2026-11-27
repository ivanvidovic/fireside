// Shared by every page: theme toggle, film grain, header glass.
const root=document.documentElement;

/* ---------------- theme ---------------- */
const themeButton=document.querySelector('.theme-toggle');
export const theme=()=>root.dataset.scheme==='light'?'light':'dark';
function syncTheme(animate){
  const t=theme();
  themeButton.setAttribute('aria-label',t==='dark'?'Switch to light mode':'Switch to dark mode');
  document.querySelector('meta[name=theme-color]').content=t==='dark'?'#1a1a1a':'#e9e8e5';
  dispatchEvent(new CustomEvent('fireside:theme',{detail:{theme:t,animate}}));
}
// The palette fades on the root (CSS @property), so the whole page changes on one clock.
// Element transitions stay off meanwhile so nothing lags behind on its own timer.
let swapTimer=0;
themeButton.addEventListener('click',()=>{
  root.classList.add('theme-swap');clearTimeout(swapTimer);
  root.dataset.scheme=theme()==='dark'?'light':'dark';
  try{localStorage.setItem('fireside:theme',root.dataset.scheme);}catch{}
  syncTheme(false);
  swapTimer=setTimeout(()=>root.classList.remove('theme-swap'),550);
});
syncTheme(false);

/* ---------------- grain ---------------- */
// One static, seamless noise tile, softened slightly; the page layer repeats it.
(function grain(){
  const S=256,tile=document.createElement('canvas');tile.width=tile.height=S;
  const tx=tile.getContext('2d'),img=tx.createImageData(S,S);
  for(let i=0;i<img.data.length;i+=4){const v=Math.random()*255|0;img.data[i]=img.data[i+1]=img.data[i+2]=v;img.data[i+3]=255;}
  tx.putImageData(img,0,0);
  // Blur a 3x3 repeat and keep the center, so the softening wraps across tile edges.
  const big=document.createElement('canvas');big.width=big.height=S*3;const bx=big.getContext('2d');
  bx.filter='blur(0.35px)';for(let y=0;y<3;y++)for(let x=0;x<3;x++)bx.drawImage(tile,x*S,y*S);
  tx.clearRect(0,0,S,S);tx.drawImage(big,S,S,S,S,0,0,S,S);
  tile.toBlob(b=>{if(b)root.style.setProperty('--grain-img',`url(${URL.createObjectURL(b)})`);});
})();

/* ---------------- nav ---------------- */
// One line at the icons' stroke weight. Hovering draws its bottom stretch left to right (the underline); the current
// page has the whole line, a pill round icon and label (a circle round the icon on phones). After a nav click, the
// page you land on starts its pill as the underline and carries it on, right and up round the end, back across the
// top and round to where it started. Opened any other way, the pill is simply there.
const SW=20*1.6/24,NS='http://www.w3.org/2000/svg';
const navPhone=matchMedia('(max-width:899px)');
const pills=[...document.querySelectorAll('.text-link')].map(a=>{
  const svg=document.createElementNS(NS,'svg'),path=document.createElementNS(NS,'path');
  svg.setAttribute('class','pill');svg.setAttribute('aria-hidden','true');svg.append(path);a.append(svg);
  // only a click to the other page draws the pill on arrival; clicking the page you're on just reloads it as is
  a.addEventListener('click',()=>{if(a.getAttribute('aria-current')==='page')return;try{sessionStorage.setItem('fireside:pill','1');}catch{}});
  return {a,path};
});
function shapePill({a,path}){
  const w=a.offsetWidth,h=a.offsetHeight;if(!w||!h)return;
  let d,u,L;
  if(navPhone.matches){
    // circle round the icon, 6px clear of it; starts at the left end of a 20px stretch along its bottom
    const cx=w/2,cy=h/2,r=16-SW/2,ha=Math.asin(Math.min(1,10/r)),a0=Math.PI/2+ha;   // angle of the start (y down)
    const sx=cx+r*Math.cos(a0),sy=cy+r*Math.sin(a0);
    // two half circles, in the direction that moves right along the bottom first
    d=`M${sx} ${sy}A${r} ${r} 0 0 0 ${2*cx-sx} ${2*cy-sy}A${r} ${r} 0 0 0 ${sx} ${sy}`;
    u=2*ha*r;L=2*Math.PI*r;
  }else{
    // pill 3px in from the top and bottom of the link; the flat bottom (the underline) runs 10px in from each side
    const top=3+SW/2,bot=h-3-SW/2,r=(bot-top)/2,x0=10,x1=w-10;
    d=`M${x0} ${bot}H${x1}A${r} ${r} 0 0 0 ${x1} ${top}H${x0}A${r} ${r} 0 0 0 ${x0} ${bot}Z`;
    u=x1-x0;L=2*(x1-x0)+2*Math.PI*r;
  }
  // reshaping changes the line's length; without this, the change itself would animate (on load, the other item
  // drew and undrew its whole pill)
  path.classList.add('still');
  path.setAttribute('d',d);
  path.style.setProperty('--L',L+'px');path.style.setProperty('--u',(L-u)+'px');
  path.getBoundingClientRect();
  requestAnimationFrame(()=>requestAnimationFrame(()=>path.classList.remove('still')));
}
const shapeAll=()=>pills.forEach(shapePill);
shapeAll();addEventListener('resize',shapeAll);navPhone.addEventListener('change',shapeAll);
document.fonts?.ready.then(shapeAll);   // the label's width settles once the font is in
(function arrive(){
  let flag=null;try{flag=sessionStorage.getItem('fireside:pill');sessionStorage.removeItem('fireside:pill');}catch{}
  const cur=pills.find(p=>p.a.getAttribute('aria-current')==='page');
  if(!flag||!cur||matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const st=cur.path.style;
  st.transition='none';st.strokeDashoffset='var(--u)';cur.path.getBoundingClientRect();
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    st.transition='stroke-dashoffset .45s var(--ease)';st.strokeDashoffset='0px';
    setTimeout(()=>{st.transition='';st.strokeDashoffset='';},500);
  }));
})();

/* ---------------- footer year ---------------- */
for(const el of document.querySelectorAll('.year'))el.textContent=new Date().getFullYear();

/* ---------------- contact ---------------- */
// Every "Contact Us" link (a.contact) shares this. The address is kept in two parts and only
// joined when a link is activated, so it never appears whole in the HTML or the shipped JS.
// A click opens the email app and copies the address. If no app opens (the page keeps focus),
// a small menu offers webmail compose windows; the address is never shown on the page.
const CONTACT={user:'fireside',domain:['friendsof','world']};
const address=()=>CONTACT.user+String.fromCharCode(64)+CONTACT.domain.join('.');
const copy=t=>navigator.clipboard?.writeText(t).catch(()=>{});
const WEBMAIL=[['Gmail','https://mail.google.com/mail/?view=cm&fs=1&to='],['Outlook','https://outlook.live.com/mail/0/deeplink/compose?to='],['Yahoo','https://compose.mail.yahoo.com/?to=']];
let menu=null,menuFor=null;
function closeMenu(refocus){if(!menu)return;menu.remove();menu=null;if(refocus)menuFor?.focus();menuFor=null;}
function openMenu(a){
  closeMenu();menuFor=a;menu=document.createElement('span');
  menu.className='contact-menu';menu.setAttribute('role','group');menu.setAttribute('aria-label','Email options');
  for(const [name,url] of WEBMAIL){
    const b=document.createElement('button');b.type='button';b.textContent=name;
    b.onclick=()=>{window.open(url+encodeURIComponent(address()),'_blank','noopener');closeMenu();};menu.append(b);
  }
  const c=document.createElement('button');c.type='button';c.textContent='Copy address';
  c.onclick=()=>{copy(address());c.textContent='Copied';setTimeout(()=>closeMenu(true),1200);};menu.append(c);
  document.body.append(menu);
  const r=a.getBoundingClientRect(),m=menu.getBoundingClientRect(),pad=8;
  const x=Math.max(pad,Math.min(innerWidth-m.width-pad,r.left+r.width/2-m.width/2));
  const y=r.top-m.height-8>pad?r.top-m.height-8:r.bottom+8;
  menu.style.left=x+'px';menu.style.top=y+'px';
  menu.querySelector('button').focus({preventScroll:true});
}
document.addEventListener('click',e=>{
  const a=e.target.closest?.('a.contact');
  if(!a){if(menu&&!menu.contains(e.target))closeMenu();return;}
  e.preventDefault();closeMenu();
  const to=address();copy(to);
  let left=false;const away=()=>{left=true;};
  addEventListener('blur',away);document.addEventListener('visibilitychange',away);
  location.href='mailto:'+to;
  setTimeout(()=>{
    removeEventListener('blur',away);document.removeEventListener('visibilitychange',away);
    if(!left&&document.hasFocus())openMenu(a);
  },1000);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeMenu(true);});
addEventListener('scroll',()=>closeMenu(),{passive:true});
addEventListener('resize',()=>closeMenu());

import './reveal.js';
