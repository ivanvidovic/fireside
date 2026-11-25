// Meetups page: slideshow (tagline, then a card per upcoming meetup), a strip of days, and event details.
// Everything comes from Luma (live Worker, falling back to the daily snapshot).
import {CONFIG} from './config.js';
import './common.js';
import './sky.js';

const LUMA='https://luma.com/FiresideCreativeTech';
const URL_OK=/^https:\/\/(?:luma\.com|lu\.ma)\/[\w-]+$/;
const ZONE='America/Los_Angeles';
const fmt=o=>new Intl.DateTimeFormat('en-US',{timeZone:ZONE,...o});
const keyFmt=new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const localKey=t=>keyFmt.format(new Date(t));
const UTC=o=>new Intl.DateTimeFormat('en-US',{timeZone:'UTC',...o});
const keyDate=k=>new Date(k+'T00:00:00Z');
const $=s=>document.querySelector(s);

async function getJSON(url,ms){
  const c=new AbortController(),t=setTimeout(()=>c.abort(),ms);
  try{const r=await fetch(url,{signal:c.signal,cache:'no-cache'});if(!r.ok)throw new Error(r.status);return await r.json();}
  finally{clearTimeout(t);}
}
async function load(){
  if(CONFIG.meetupsEndpoint){try{return await getJSON(CONFIG.meetupsEndpoint,3500);}catch{}}
  try{return await getJSON(new URL('../'+CONFIG.meetupsSnapshot,import.meta.url).href,3500);}catch{}
  return null;
}
// "7 PM", "7:30 PM"; ranges share the meridiem when they can: "7–10 PM".
const clock=t=>fmt({hour:'numeric',minute:'2-digit'}).format(new Date(t)).replace(':00','');
function span(e){
  if(e.allDay)return 'All day';
  const a=clock(e.t);if(!e.endT)return a;
  const b=clock(e.endT),am=a.slice(-2),bm=b.slice(-2);
  return am===bm?`${a.slice(0,-3)}–${b}`:`${a}–${b}`;
}

const data=await load();
const now=Date.now(),today=localKey(now);
const events=(data&&Array.isArray(data.events)?data.events:[])
  .filter(e=>e&&typeof e.title==='string'&&typeof e.date==='string'&&URL_OK.test(e.url))
  .map(e=>{
    const allDay=/^\d{4}-\d{2}-\d{2}$/.test(e.date),t=Date.parse(allDay?e.date+'T00:00:00Z':e.date);
    const endT=e.end?Date.parse(e.end):null;
    return {...e,allDay,t,endT,key:allDay?e.date:localKey(t),until:allDay?t+864e5:(endT||t+3*36e5)};
  })
  .filter(e=>Number.isFinite(e.t)&&e.until>now).sort((a,b)=>a.t-b.t);
const next=events[0];

/* ---------------- slideshow: tagline, then a card per upcoming meetup ---------------- */
const show=$('#show'),slides=$('#slides'),dotsEl=$('#dots'),tpl=$('#ev-tpl');
const venue=e=>e.venue||(e.location||'').split(',')[0];
function card(e,i){
  const n=tpl.content.firstElementChild.cloneNode(true),q=s=>n.querySelector(s);
  if(e){
    const d=keyDate(e.key);
    q('.ev-label').textContent=i===0?'Next meetup':'Upcoming';
    q('.ev-title').textContent=e.title;
    q('.ev-line').textContent=[span(e),venue(e)].filter(Boolean).join(' · ');
    const cta=q('.ev-cta');
    if(i===0){cta.querySelector('span').textContent='Details';cta.querySelector('i').textContent='↓';}
    else{cta.href=e.url;cta.target='_blank';cta.rel='noopener';cta.querySelector('span').textContent='RSVP on Luma';cta.querySelector('i').textContent='↗';}
    q('.ds-mon').textContent=UTC({month:'short'}).format(d);
    q('.ds-day').textContent=String(d.getUTCDate()).padStart(2,'0');
    q('.long').textContent=UTC({weekday:'long'}).format(d);q('.short').textContent=UTC({weekday:'short'}).format(d);
  }else{
    q('.ev-label').textContent='Next meetup';q('.ev-title').textContent='To be announced';
    q('.ev-line').textContent='New dates land on Luma first.';
    const cta=q('.ev-cta');cta.href=LUMA;cta.target='_blank';cta.rel='noopener';
    cta.querySelector('span').textContent='Follow on Luma';cta.querySelector('i').textContent='↗';
    q('.ds-mon').textContent='Next';const day=q('.ds-day');day.textContent='TBA';day.classList.add('tba');
    q('.long').textContent='Portland';q('.short').textContent='PDX';
  }
  return n;
}
(events.length?events.slice(0,5):[null]).forEach((e,i)=>slides.append(card(e,i)));
const all=[...slides.children],N=all.length;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let cur=0;
const dots=all.map((_,i)=>{
  const b=document.createElement('button');b.type='button';b.className='dot';b.append(document.createElement('i'));
  b.setAttribute('aria-label',`Slide ${i+1} of ${N}`);b.addEventListener('click',()=>go(i));dotsEl.append(b);return b;
});
function go(i){
  cur=(i+N)%N;
  slides.style.transform=`translateX(${-cur*100}%)`;
  all.forEach((el,k)=>{el.inert=k!==cur;el.setAttribute('aria-label',`${k+1} of ${N}`);});
  dots.forEach((d,k)=>{d.classList.toggle('on',k===cur);d.setAttribute('aria-current',k===cur?'true':'false');
    const f=d.firstChild;f.style.animation='none';void f.offsetWidth;f.style.animation='';});
}
dots.forEach(d=>d.firstChild.addEventListener('animationend',()=>go(cur+1)));
if(reducedMotion)show.classList.add('still');
// Pause while hovered, touched, focused inside, or off screen.
const pause=new Set(),sync=()=>show.classList.toggle('paused',pause.size>0);
show.addEventListener('pointerenter',e=>{if(e.pointerType==='mouse'){pause.add('hover');sync();}});
show.addEventListener('pointerleave',()=>{pause.delete('hover');sync();});
show.addEventListener('focusin',()=>{pause.add('focus');sync();});
show.addEventListener('focusout',()=>{pause.delete('focus');sync();});
new IntersectionObserver(es=>{es[0].isIntersecting?pause.delete('off'):pause.add('off');sync();}).observe(show);
// Swipe on touch screens.
let sx=null,sy=0;
slides.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'){sx=e.clientX;sy=e.clientY;pause.add('touch');sync();}});
addEventListener('pointerup',e=>{
  if(sx===null)return;const dx=e.clientX-sx,dy=e.clientY-sy;sx=null;pause.delete('touch');sync();
  if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))go(cur+(dx<0?1:-1));
});
show.addEventListener('keydown',e=>{if(e.key==='ArrowRight')go(cur+1);else if(e.key==='ArrowLeft')go(cur-1);});
go(0);

/* ---------------- strip: 14 days from today, longer if the next meetup is further out ---------------- */
const byDay=new Map();for(const e of events){if(!byDay.has(e.key))byDay.set(e.key,e);}
const start=keyDate(today);
const reach=next?Math.round((keyDate(next.key)-start)/864e5)+1:0;
const count=Math.min(120,Math.max(14,reach));
const row=$('#dayrow');
for(let i=0;i<count;i++){
  const d=new Date(start);d.setUTCDate(start.getUTCDate()+i);
  const key=d.toISOString().slice(0,10),e=byDay.get(key);
  const li=document.createElement('li');li.className='db'+(i===0?' today':'')+(e?' ev':'');
  const inner=document.createElement(e?'a':'div');
  if(e){inner.href=e.url;inner.target='_blank';inner.rel='noopener';inner.setAttribute('aria-label',`${UTC({weekday:'long',month:'long',day:'numeric'}).format(d)} · ${e.title}`);}
  else inner.setAttribute('aria-hidden','true');
  for(const [cls,text] of [['w',UTC({weekday:'narrow'}).format(d)],['n',String(d.getUTCDate())],['m',i===0||d.getUTCDate()===1?UTC({month:'short'}).format(d):'']]){
    const s=document.createElement('span');s.className=cls;s.textContent=text;inner.append(s);
  }
  li.append(inner);row.append(li);
}
if(count>14){
  // More days than fit: no scrollbar. Arrows step one day; the wheel and click-and-drag scroll it too.
  const prev=$('.rowarrow.prev'),nextB=$('.rowarrow.next');
  const day=()=>row.firstElementChild.getBoundingClientRect().width;
  const sync=()=>{
    const atStart=row.scrollLeft<=1,atEnd=row.scrollLeft+row.clientWidth>=row.scrollWidth-1;
    prev.hidden=atStart;nextB.hidden=atEnd;
    row.classList.toggle('fade-l',!atStart);row.classList.toggle('fade-r',!atEnd);
  };
  const step=d=>{const w=day(),i=Math.round(row.scrollLeft/w)+d;row.scrollTo({left:i*w,behavior:'smooth'});};
  prev.addEventListener('click',()=>step(-1));nextB.addEventListener('click',()=>step(1));
  row.addEventListener('scroll',sync,{passive:true});new ResizeObserver(sync).observe(row);sync();
  // Vertical wheel scrolls the strip sideways until it reaches an end, then the page takes over.
  row.addEventListener('wheel',e=>{
    if(Math.abs(e.deltaX)>Math.abs(e.deltaY))return;
    const max=row.scrollWidth-row.clientWidth,to=Math.max(0,Math.min(max,row.scrollLeft+e.deltaY));
    if(to===row.scrollLeft)return;
    e.preventDefault();row.scrollLeft=to;
  },{passive:false});
  // Click-and-drag with a mouse (touch already scrolls natively). A drag never opens a link.
  let dragX=null,startLeft=0,moved=false;
  row.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse'||e.button!==0)return;dragX=e.clientX;startLeft=row.scrollLeft;moved=false;});
  addEventListener('pointermove',e=>{
    if(dragX===null)return;const dx=e.clientX-dragX;
    if(!moved&&Math.abs(dx)>4){moved=true;row.classList.add('dragging');}
    if(moved)row.scrollLeft=startLeft-dx;
  });
  addEventListener('pointerup',()=>{if(dragX===null)return;dragX=null;row.classList.remove('dragging');});
  row.addEventListener('click',e=>{if(moved){e.preventDefault();moved=false;}},true);
  row.addEventListener('dragstart',e=>e.preventDefault());
}
$('#strip-status').textContent=!data?'Meetups are listed on Luma.':'';

/* ---------------- details: always the next meetup ---------------- */
function renderDetails(e){
  if(!e)return;
  const d=keyDate(e.key);
  const rows=[['When',`${UTC({weekday:'long',month:'long',day:'numeric'}).format(d)} · ${span(e)}`]];
  if(e.location)rows.push(['Where',e.location.replace(/,\s*(USA|United States)$/,''),
    e.geo?`https://www.google.com/maps/search/?api=1&query=${e.geo[0]},${e.geo[1]}`:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.location)}`]);
  if(e.note)rows.push(['Entrance',e.note]);
  if(e.host)rows.push(['Host',e.host]);
  $('#d-list').replaceChildren(...rows.map(([k,v,href])=>{
    const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');
    dt.textContent=k;dd.textContent=v;
    if(href){const a=document.createElement('a');a.href=href;a.target='_blank';a.rel='noopener';a.textContent='Map ↗';dd.append(' · ',a);}
    div.append(dt,dd);return div;
  }));
  $('#d-title').textContent=e.title;
  $('#d-rsvp').href=$('#d-media').href=e.url;   // the image goes where the RSVP button goes
  // an image made for this meetup (matched by its date in the page); otherwise the placeholder
  const img=$('#d-media .d-img'),mine=!!img&&img.dataset.for===e.key;
  if(img)img.hidden=!mine;$('#d-media .placeholder').hidden=mine;
  $('#details').hidden=false;
}
renderDetails(next);
