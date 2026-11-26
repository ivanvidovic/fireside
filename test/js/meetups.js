// Meetups page: slideshow (tagline, then a card per upcoming meetup), a strip of days, and event details.
// Everything comes from Luma (live Worker, falling back to the daily snapshot).
import {CONFIG} from './config.js';
import {glitchStep,glitchState,glitchTick,seeded,GX,GY} from './glitch.js';
import {revealBox} from './reveal.js';
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
  // testing: the made-up events, not Luma (config.js: sampleMeetups)
  if(CONFIG.sampleMeetups){try{return await getJSON(new URL('../'+CONFIG.meetupsSample,import.meta.url).href,3500);}catch{return null;}}
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
    // a month with no day yet ("2027-02"): shown as that month with the day TBA; it never marks a day in the strip
    if(/^\d{4}-\d{2}$/.test(e.date)){const t=Date.parse(e.date+'-01T00:00:00Z'),m=new Date(t);m.setUTCMonth(m.getUTCMonth()+1);
      return {...e,month:true,allDay:true,t,endT:null,key:null,until:m.getTime()};}
    const allDay=/^\d{4}-\d{2}-\d{2}$/.test(e.date),t=Date.parse(allDay?e.date+'T00:00:00Z':e.date);
    const endT=e.end?Date.parse(e.end):null;
    return {...e,allDay,t,endT,key:allDay?e.date:localKey(t),until:allDay?t+864e5:(endT||t+3*36e5)};
  })
  .filter(e=>Number.isFinite(e.t)&&e.until>now).sort((a,b)=>a.t-b.t);
const next=events.find(e=>!e.month);   // the next meetup with a date

/* ---------------- slideshow: tagline, then a card per upcoming meetup ---------------- */
const show=$('#show'),slides=$('#slides'),dotsEl=$('#dots'),tpl=$('#ev-tpl');
const venue=e=>e.venue||(e.location||'').split(',')[0];
function card(e,i){
  const n=tpl.content.firstElementChild.cloneNode(true),q=s=>n.querySelector(s);
  if(e){
    const d=e.month?new Date(e.t):keyDate(e.key);
    q('.ev-label').textContent=i===0?'Next meetup':'Upcoming';
    q('.ev-title').textContent=e.title;
    q('.ev-line').textContent=e.month?'Time & Place to be Announced':[span(e),venue(e)].filter(Boolean).join(' · ');
    const cta=q('.ev-cta');
    if(e===next){cta.querySelector('span').textContent='Details';cta.querySelector('i').textContent='↓';}
    else if(e.month){cta.href=LUMA;cta.target='_blank';cta.rel='noopener';cta.querySelector('span').textContent='Get notified on Luma';cta.querySelector('i').textContent='↗';}   // no date to RSVP to yet
    else{cta.href=e.url;cta.target='_blank';cta.rel='noopener';cta.querySelector('span').textContent='RSVP on Luma';cta.querySelector('i').textContent='↗';}
    q('.ds-mon').textContent=UTC({month:'short'}).format(d);
    if(e.month){const day=q('.ds-day');day.classList.add('tba');day.setAttribute('aria-label','TBA');day.innerHTML=TBA_SVG;
      q('.long').textContent='Portland';q('.short').textContent='PDX';}
    else{q('.ds-day').textContent=String(d.getUTCDate()).padStart(2,'0');
      q('.long').textContent=UTC({weekday:'long'}).format(d);q('.short').textContent=UTC({weekday:'short'}).format(d);}
  }else{
    q('.ev-label').textContent='Next meetup';q('.ev-title').textContent='To be announced';
    q('.ev-line').textContent='New dates land on Luma first.';
    const cta=q('.ev-cta');cta.href=LUMA;cta.target='_blank';cta.rel='noopener';
    cta.querySelector('span').textContent='Get notified on Luma';cta.querySelector('i').textContent='↗';
    q('.ds-mon').textContent='Next';const day=q('.ds-day');day.classList.add('tba');day.setAttribute('aria-label','TBA');day.innerHTML=TBA_SVG;
    q('.long').textContent='Portland';q('.short').textContent='PDX';
  }
  return n;
}
// "TBA" in the date's place: the pixel font's T, B and A redrawn narrower on its own grid (same cell, same 19-cell height,
// same 2-cell strokes), so three letters fit the box of a two-digit date at full size.
const TBA_SVG='<svg viewBox="0 0 32 19" aria-hidden="true"><path d="M0 0h10v1h-10zM0 1h10v1h-10zM4 2h2v1h-2zM4 3h2v1h-2zM4 4h2v1h-2zM4 5h2v1h-2zM4 6h2v1h-2zM4 7h2v1h-2zM4 8h2v1h-2zM4 9h2v1h-2zM4 10h2v1h-2zM4 11h2v1h-2zM4 12h2v1h-2zM4 13h2v1h-2zM4 14h2v1h-2zM4 15h2v1h-2zM4 16h2v1h-2zM4 17h2v1h-2zM4 18h2v1h-2zM12 0h4v1h-4zM12 1h6v1h-6zM12 2h2v1h-2zM16 2h2v1h-2zM12 3h2v1h-2zM17 3h2v1h-2zM12 4h2v1h-2zM17 4h2v1h-2zM12 5h2v1h-2zM17 5h2v1h-2zM12 6h2v1h-2zM16 6h2v1h-2zM12 7h2v1h-2zM16 7h2v1h-2zM12 8h4v1h-4zM12 9h6v1h-6zM12 10h2v1h-2zM16 10h3v1h-3zM12 11h2v1h-2zM17 11h3v1h-3zM12 12h2v1h-2zM18 12h2v1h-2zM12 13h2v1h-2zM18 13h2v1h-2zM12 14h2v1h-2zM18 14h2v1h-2zM12 15h2v1h-2zM17 15h3v1h-3zM12 16h2v1h-2zM16 16h3v1h-3zM12 17h6v1h-6zM12 18h4v1h-4zM26 0h2v1h-2zM26 1h2v1h-2zM26 2h2v1h-2zM25 3h4v1h-4zM25 4h4v1h-4zM25 5h4v1h-4zM25 6h4v1h-4zM24 7h2v1h-2zM28 7h2v1h-2zM24 8h2v1h-2zM28 8h2v1h-2zM24 9h2v1h-2zM28 9h2v1h-2zM24 10h2v1h-2zM28 10h2v1h-2zM23 11h8v1h-8zM23 12h8v1h-8zM23 13h2v1h-2zM29 13h2v1h-2zM23 14h2v1h-2zM29 14h2v1h-2zM22 15h2v1h-2zM30 15h2v1h-2zM22 16h2v1h-2zM30 16h2v1h-2zM22 17h2v1h-2zM30 17h2v1h-2zM22 18h2v1h-2zM30 18h2v1h-2z"/></svg>';
(events.length?events.slice(0,5):[null]).forEach((e,i)=>slides.append(card(e,i)));
const all=[...slides.children],N=all.length;
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let cur=0;
const dots=all.map((_,i)=>{
  const b=document.createElement('button');b.type='button';b.className='dot';b.append(document.createElement('i'));
  b.setAttribute('aria-label',`Slide ${i+1} of ${N}`);b.addEventListener('click',()=>go(i));dotsEl.append(b);return b;
});
function go(i){
  const from=cur;cur=(i+N)%N;
  // speeding back to the first slide (from the last, or back two or more): stoke the fire, send a wind (js/sky.js)
  if(cur<from&&(from-cur>=2||(from===N-1&&cur===0)))dispatchEvent(new Event('fireside:stoke'));
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
const byDay=new Map();for(const e of events){if(e.key&&!byDay.has(e.key))byDay.set(e.key,e);}
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
  // the event's cover from Luma (or the sample's own image); otherwise a placeholder made for this date
  const img=$('#d-media .d-img'),src=imageURL(e.image);
  if(src){img.src=src;img.alt=`Cover image for ${e.title}`;img.hidden=false;}
  else placeholder($('#d-media'),e.key,`${d.getUTCMonth()+1}/${d.getUTCDate()}`);
  $('#details').hidden=false;
}
// images come from Luma's image server, or are the site's own (sample events)
function imageURL(u){
  if(typeof u!=='string')return null;
  if(/^https:\/\/images\.lumacdn\.com\/[^\s"'<>]+$/.test(u))return u;
  if(/^assets\/[\w\/.-]+\.(?:webp|jpe?g|png|avif)$/.test(u))return new URL('../'+u,import.meta.url).href;
  return null;
}

/* ---------------- placeholder: the date punched out of glass over a broken signal ---------------- */
// When the next meetup has no image: the moving neon glitch from the image load-in fills the box; over it sits a
// frosted glass panel, inset the same on every side so the glitch shows as an even frame however the box is cropped;
// the date is cut out of the glass in the pixel font, so the glitch runs through the letters.
// Dark glass in the dark theme, light glass in the light theme. Reduced motion: the glitch holds still.
const PH_INSET=16;   // the glitch frame's width, px
const PH_THICK=6;   // the card's thickness, px
// The glass tilts toward the pointer like a 3D card (up to TILT degrees): on hover with a mouse, or while pressing
// and dragging on a touch screen. A thin light rim along its edge is brightest nearest the pointer and grows with the
// tilt, and a soft holographic sheen slides across the glass under the pointer, its colours shifting as the card moves. It eases in and settles flat when the pointer leaves or lets go. A plain tap still opens the link; a drag doesn't.
const TILT=12;
/* ---- the CD layer ----
   A CD's tracks are concentric rings of grooves about 1.6 µm apart: a diffraction grating. At each point light from
   the lamp leaves the grooves at an angle that depends on its wavelength; you see a colour there only where the
   light, that point and your eye satisfy the grating equation  d·(o − i)·r̂ = m·λ  for a visible wavelength
   (i: light → point, o: point → eye, r̂: across the grooves). The tracks circle the centre and become the card's own
   rounded outline toward its edges, so the beams radiate out, then meet the edges and wrap the corners. Light along the
   grooves must also line up ((o − i)·t̂ ≈ 0), which narrows it to bands, and because the grooves curve, those bands
   bend, pinch and close into loops as the light or the card moves. Orders 1 and 2. The grooves themselves show
   faintly (about 2.5px apart), strongest inside the band. The light sits above the pointer on hover, or rides the
   wandering idle glint; the viewer is in front of the screen; both are carried into the card's own tilted frame. */
function cdLayer(glass){
  const canvas=document.createElement('canvas');canvas.className='ph-cd';
  const gl=canvas.getContext('webgl',{premultipliedAlpha:true,alpha:true,antialias:false});
  let W=1,H=1,prog=null,U={},markTex=null;
  if(gl){
    const sh=(t,src)=>{const o=gl.createShader(t);gl.shaderSource(o,src);gl.compileShader(o);return gl.getShaderParameter(o,gl.COMPILE_STATUS)?o:null;};
    const v=sh(gl.VERTEX_SHADER,'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}');
    const f=sh(gl.FRAGMENT_SHADER,`precision highp float;
uniform vec2 uRes,uTile;uniform float uAsp,uK,uGroove,uMarkOn;uniform vec3 uL,uV;uniform sampler2D uMark;
// wavelength (nm) to colour, in the proportions of a real disc under a lamp: wide deep red-magenta, green and deep
// blue, with narrow orange-yellow and cyan between, and violet at the end
vec3 spectral(float l){
  if(l<395.||l>700.)return vec3(0.);
  vec3 c;
  if(l<425.)c=mix(vec3(.38,.05,1.),vec3(.06,.12,1.),(l-395.)/30.);
  else if(l<472.)c=vec3(.06,.14,1.);
  else if(l<492.)c=mix(vec3(.06,.14,1.),vec3(0.,.85,1.),(l-472.)/20.);
  else if(l<503.)c=mix(vec3(0.,.85,1.),vec3(.08,1.,.2),(l-492.)/11.);
  else if(l<552.)c=vec3(.08,1.,.2);
  else if(l<566.)c=mix(vec3(.08,1.,.2),vec3(1.,.85,0.),(l-552.)/14.);
  else if(l<584.)c=mix(vec3(1.,.85,0.),vec3(1.,.42,0.),(l-566.)/18.);
  else if(l<602.)c=mix(vec3(1.,.42,0.),vec3(1.,.04,.28),(l-584.)/18.);
  else c=vec3(1.,.04,.28);
  return c*smoothstep(395.,415.,l)*(1.-smoothstep(670.,700.,l));
}
// the tracks: circles at the centre that become the card's own rounded outline toward its edges
// (a superellipse that sharpens outward, so the tracks stay smooth everywhere: no creases from the corners)
float tau(vec2 p){
  vec2 b=vec2(1.,uAsp),q=abs(p)/b+1e-5;float tc=length(p);
  float t0=length(q),w=smoothstep(.15,.95,t0),n=mix(2.,9.,w);
  float ts=pow(pow(q.x,n)+pow(q.y,n),1./n)*b.y;   // rounded-rect-like rings, the card's outline at the edge
  return mix(tc,ts,w);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;vec3 P=vec3(uv.x*2.-1.,(1.-uv.y*2.)*uAsp,0.);   // card units: half its width is 1; y down
  float T=tau(P.xy);if(T<.004||uK<.001){gl_FragColor=vec4(0.);return;}
  float e=.002;vec2 gr=vec2(tau(P.xy+vec2(e,0.))-tau(P.xy-vec2(e,0.)),tau(P.xy+vec2(0.,e))-tau(P.xy-vec2(0.,e)));
  vec2 r=normalize(gr),t=vec2(-r.y,r.x);           // across the tracks, and along them
  vec3 o=normalize(uV-P);
  vec3 spec=vec3(0.);float mirror=0.;
  // the light is a small area, not a point: four samples, averaged, soften the beams' edges
  for(int j=0;j<4;j++){
    vec3 L=uL+vec3(j==0?-.05:j==1?.05:0.,j==2?-.05:j==3?.05:0.,0.);
    vec3 i=normalize(P-L);
    vec2 k=o.xy-i.xy;float s=abs(dot(k,r)),q=dot(k,t);
    float band=exp(-q*q/.0028);                    // lined up along the tracks: narrow beams
    for(int m=1;m<=3;m++){float fm=float(m);spec+=spectral(1600.*s/fm)*band/pow(fm,1.2);}
    mirror+=exp(-dot(k,k)/.002);                   // the plain reflection, as off the disc's silver
  }
  spec*=.25;mirror*=.25;
  float g=.5+.5*sin(T*uGroove);                   // the grooves themselves
  float graze=1.+.6*(1.-o.z);                     // brighter as the card leans away
  vec3 col=spec*mix(.6,1.,g)*graze*1.6;
  col+=vec3(.05)*g*clamp(length(spec)*3.,0.,1.);  // the tracks glint inside the beam
  col+=vec3(.06)*mirror;
  // the watermark catches the beam's light: its logos glow in the beam's colours
  if(uMarkOn>.5){
    vec2 pc=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y)-uRes*.5;   // css px from the card's centre, y down
    float cs=.8387,sn=.5446;                        // cos/sin 33°
    vec2 loc=vec2(cs*pc.x-sn*pc.y,sn*pc.x+cs*pc.y)+uRes*1.1;
    col+=spec*texture2D(uMark,fract(loc/uTile)).a*1.4;
  }
  col/=max(1.,max(col.r,max(col.g,col.b)));       // keep the hue when it's bright: no washing out to white
  col*=uK*smoothstep(0.,.05,T);
  float al=clamp(max(col.r,max(col.g,col.b)),0.,1.);
  gl_FragColor=vec4(col,al);
}`);
    if(v&&f){prog=gl.createProgram();gl.attachShader(prog,v);gl.attachShader(prog,f);gl.linkProgram(prog);
      if(gl.getProgramParameter(prog,gl.LINK_STATUS)){gl.useProgram(prog);
        const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
        const a=gl.getAttribLocation(prog,'a');gl.enableVertexAttribArray(a);gl.vertexAttribPointer(a,2,gl.FLOAT,false,0,0);
        for(const n of ['uRes','uAsp','uK','uGroove','uL','uV','uMark','uTile','uMarkOn'])U[n]=gl.getUniformLocation(prog,n);
        // the watermark's tile, so the bands can light it
        markTex=gl.createTexture();gl.uniform1f(U.uMarkOn,0);
        watermarkTile().then(t=>{if(!t)return;gl.bindTexture(gl.TEXTURE_2D,markTex);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,t[3]);
          for(const [k2,v2] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k2,v2);
          gl.uniform1i(U.uMark,0);gl.uniform2f(U.uTile,t[1],t[2]);gl.uniform1f(U.uMarkOn,1);draw(last);});
      }else prog=null;}
  }
  // CSS rotateX(a) then rotateY(b), as the card is tilted; points go from the screen's frame into the card's
  const toCard=(p,a,b)=>{const ca=Math.cos(a),sa=Math.sin(a),cb=Math.cos(b),sb=Math.sin(b);
    const y1=ca*p[1]+sa*p[2],z1=-sa*p[1]+ca*p[2];   // undo rotateX
    return [cb*p[0]-sb*z1,y1,sb*p[0]+cb*z1];};       // undo rotateY
  let last={x:0,y:0,hx:50,hy:50,hl:0,ang:0,box:null};
  function draw(stt){
    last=stt;if(!prog)return;
    const a=-stt.y*TILT*Math.PI/180,b=stt.x*TILT*Math.PI/180,asp=H/W;
    // the light: above the pointer on hover; at rest it circles just off the card, at the idle glint's angle
    const an=stt.ang*Math.PI/180,idle=[Math.sin(an)*1.5,-Math.cos(an)*1.5*asp,1.1];
    let pl=idle;
    if(stt.box&&stt.hl>0){const bw=stt.box.width,bh=stt.box.height;
      const px=((stt.hx/100*bw-PH_INSET)/W)*2-1,py=(((stt.hy/100*bh-PH_INSET)/H)*2-1)*asp;
      pl=[idle[0]+(px-idle[0])*stt.hl,idle[1]+(py-idle[1])*stt.hl,1.1-.3*stt.hl];}
    const L=toCard(pl,a,b),V=toCard([0,0,3.2],a,b);
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.uniform2f(U.uRes,canvas.width,canvas.height);gl.uniform1f(U.uAsp,asp);gl.uniform1f(U.uK,stt.hl);   // only while the card is hovered or touched
    gl.uniform1f(U.uGroove,W/2/2.5*6.2832);   // a groove every 2.5px
    gl.uniform3f(U.uL,...L);gl.uniform3f(U.uV,...V);
    gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);if(stt.hl>.001){if(markTex){gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,markTex);}gl.drawArrays(gl.TRIANGLES,0,3);}
  }
  return {canvas,size(w,h){W=Math.max(1,w);H=Math.max(1,h);canvas.width=Math.round(W);canvas.height=Math.round(H);draw(last);},draw};
}
// The hidden watermark: small "fireside" wordmarks in a staggered grid, tilted 33°, set into the glass. Invisible at
// rest; the pointer reveals them in a soft circle around it (like a UV torch on a passport), clearer as the card leans.
// They take the same shifting holographic colour as the sheen.
let markTile=null;
function watermarkTile(){
  if(!markTile)markTile=new Promise(res=>{
    const img=new Image();img.onload=()=>{
      const lw=58.5,lh=lw*268.5/849,tw=70,th=30,k=2,c=document.createElement('canvas');c.width=tw*2*k;c.height=th*2*k;const x=c.getContext('2d');
      // staggered rows; the half-offset row wraps round the tile's edges so it repeats seamlessly
      for(const [px,py] of [[0,0],[tw,0],[-tw/2,th],[tw/2,th],[tw*1.5,th]])x.drawImage(img,(px+(tw-lw)/2)*k,(py+(th-lh)/2)*k,lw*k,lh*k);
      res([c.toDataURL(),tw*2,th*2,c]);};
    img.onerror=()=>res(null);img.src=new URL('../assets/logo-wordmark.svg',import.meta.url).href;});
  return markTile;
}
function watermark(el){
  watermarkTile().then(t=>{if(!t)return;el.style.webkitMaskImage=el.style.maskImage=`url(${t[0]})`;el.style.webkitMaskSize=el.style.maskSize=`${t[1]}px ${t[2]}px`;});
}
function tiltCard(box,glass,card,cd){
  let tx=0,ty=0,x=0,y=0,hx=50,hy=50,hl=0,el=0,ang=0,on=false,press=false,visible=false,raf=0,last=0;
  // at rest, the edge's glint wanders round on its own: a speed that changes now and then (up to a lap in ~10 s,
  // either way round), and a slowly drifting colour
  let wAng=Math.random()*360,wv=0,wvT=20,wvAt=0,wHue=Math.random()*360,pAng=0;
  const aim=e=>{const r=box.getBoundingClientRect(),px=Math.min(1,Math.max(0,(e.clientX-r.left)/r.width)),py=Math.min(1,Math.max(0,(e.clientY-r.top)/r.height));
    tx=(px-.5)*2;ty=(py-.5)*2;hx=px*100;hy=py*100;on=true;
    if(Math.hypot(px-.5,py-.5)>.02)pAng=Math.atan2(px-.5,-(py-.5))*180/Math.PI;};   // where the light comes from, clockwise from the top
  const leave=()=>{on=false;tx=ty=0;wAng=ang;};   // the idle glint carries on from wherever the light was
  function step(now){
    raf=0;if(!visible||document.hidden)return;
    const dt=Math.min(.05,(now-(last||now))/1000);last=now;
    if(now>=wvAt){wvT=(Math.random()<.5?-1:1)*(8+Math.random()*28);wvAt=now+2000+Math.random()*4000;}
    wv+=(wvT-wv)*(1-Math.exp(-dt/1.5));wAng+=wv*dt;wHue=(wHue+dt*9)%360;
    const k=1-Math.exp(-dt/.12);x+=(tx-x)*k;y+=(ty-y)*k;
    hl+=((on?1:0)*Math.min(1,Math.hypot(x,y)+.35)-hl)*k;
    el=.2+.8*hl;   // the edge never goes fully dark: idle, it glints at a fifth of its hover strength
    // the light's direction eases toward the pointer while it's there, and toward the wandering glint when not
    const want=on?pAng:wAng,d=((want-ang)%360+540)%360-180;ang+=d*(1-Math.exp(-dt/(on?.08:.25)));
    card.style.transform=`rotateX(${(-y*TILT).toFixed(2)}deg) rotateY(${(x*TILT).toFixed(2)}deg) scale(${(1+.025*hl).toFixed(4)})`;   // lifts a touch toward you
    const st=glass.style;
    st.setProperty('--hx',hx+'%');st.setProperty('--hy',hy+'%');st.setProperty('--hl',hl.toFixed(3));st.setProperty('--el',el.toFixed(3));
    st.setProperty('--ang',ang.toFixed(1)+'deg');st.setProperty('--gx',(x*60+50).toFixed(1)+'%');
    // the foil's colour shifts as the card moves (with where the pointer is and how far the card leans); at rest it drifts
    const hue=((hx*1.6+hy*1.1+(x-y)*70)*hl+wHue*(1-hl)+360)%360;st.setProperty('--hue',hue.toFixed(1)+'deg');
    // the watermark answers the light its own way: its colour runs the other way round the wheel, and it flashes in
    // and out as the card passes through certain angles, like a real hologram
    st.setProperty('--mhue',((510-hue*1.7)%360+360)%360+'deg');
    st.setProperty('--mk',(.25+.75*Math.abs(Math.sin(x*2.6+y*1.9+.6))).toFixed(3));
    cd.draw({x,y,hx,hy,hl,ang,box:box.getBoundingClientRect()});
    raf=requestAnimationFrame(step);
  }
  const run=()=>{if(!raf&&visible)raf=requestAnimationFrame(t=>{last=t;step(t);});};
  new IntersectionObserver(([en])=>{visible=en.isIntersecting;run();}).observe(box);
  document.addEventListener('visibilitychange',run);
  // a mouse tilts it by hovering, and can also press and drag it like a finger: the card keeps following the
  // pointer even past its edge until it's let go. Clicks and taps work as the link always does.
  box.addEventListener('pointermove',e=>{if(e.pointerType==='mouse'||press)aim(e);});
  box.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'&&!press)leave();});
  box.addEventListener('pointerdown',e=>{
    if(e.button>0)return;press=true;aim(e);
    if(e.pointerType==='mouse'){try{box.setPointerCapture(e.pointerId);}catch{}}
  });
  for(const ev of ['pointerup','pointercancel'])box.addEventListener(ev,e=>{
    if(!press)return;press=false;
    if(e.pointerType==='mouse'){
      const r=box.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)leave();}   // still over it: back to hovering
    else leave();
  });
  box.draggable=false;box.addEventListener('dragstart',e=>e.preventDefault());   // the link itself never gets dragged
}
function placeholder(box,key,label){
  box.classList.add('rv-hold');   // hidden until its load-in
  const c=document.createElement('canvas');c.className='ph-sig';c.setAttribute('aria-hidden','true');
  const glass=document.createElement('div');glass.className='ph-glass';glass.setAttribute('aria-hidden','true');
  const edge=document.createElement('div');edge.className='ph-edge';
  const glare=document.createElement('div');glare.className='ph-glare';
  const mark=document.createElement('div');mark.className='ph-mark';mark.append(document.createElement('i'));
  // the glass's own frosting: a blurred, tinted copy of the signal drawn here (the browser's backdrop blur breaks
  // into unblurred strips once the panel tilts in 3D)
  const frost=document.createElement('canvas');frost.className='ph-frost';const fg=frost.getContext('2d');
  const tint=document.createElement('div');tint.className='ph-tint';   // the glass's colour: fades with the page on a theme switch
  const rim=document.createElement('div');rim.className='ph-rim';   // the edge's soft inward glow
  const cd=cdLayer(glass);   // the CD-like rainbow: real diffraction off fine circular grooves
  glass.append(frost,tint,cd.canvas,mark,glare,rim,edge);   // frosting, the hidden watermark, a moving glare, the edge glow, the numbers' lit rims
  watermark(mark.firstChild);
  // the card has real thickness: thin slices stacked behind the glass, each 1px further back, so its side shows when it tilts
  const card=document.createElement('div');card.className='ph-card';card.setAttribute('aria-hidden','true');
  const slabs=[];for(let i=PH_THICK;i>=1;i--){const sl=document.createElement('div');sl.className='ph-slab';sl.style.transform=`translateZ(${-i}px)`;slabs.push(sl);}
  card.append(...slabs,glass);
  box.append(c,card);
  const g=c.getContext('2d');let st=null,visible=false,raf=0,revealed=false;
  function frosting(){
    if(!st||!frost.width)return;
    fg.filter='blur(4px) saturate(1.15)';fg.drawImage(c,-4,-4,frost.width+8,frost.height+8);fg.filter='none';
  }
  function layout(){
    const W=box.clientWidth,H=box.clientHeight;if(!W||!H)return;
    // the signal, on a coarse grid scaled up
    const gw=Math.max(8,Math.round(W/GX)),gh=Math.max(6,Math.round(H/GY));
    if(!st||st.w!==gw||st.h!==gh){c.width=gw;c.height=gh;st=glitchState(gw,gh,seeded(key));st.g=g;glitchStep(st,true);}
    // the frosting covers the whole box (a quarter resolution, blurred 4px there: about 16px on screen), sitting
    // behind the glass exactly where the signal is
    cd.size(W-2*PH_INSET,H-2*PH_INSET);
    frost.width=Math.max(4,Math.round(W/4));frost.height=Math.max(4,Math.round(H/4));
    Object.assign(frost.style,{left:-PH_INSET+'px',top:-PH_INSET+'px',width:W+'px',height:H+'px'});frosting();
    // the glass, with the date cut out of it: a mask drawn with the pixel font
    const gwid=W-2*PH_INSET,ghei=H-2*PH_INSET;if(gwid<=0||ghei<=0)return;
    const dpr=Math.min(2,devicePixelRatio||1),m=document.createElement('canvas');m.width=Math.round(gwid*dpr);m.height=Math.round(ghei*dpr);
    const x=m.getContext('2d');x.font='400 100px "Geist Pixel"';
    const px=Math.min(m.width*.8/x.measureText(label).width*100,m.height*.56/.722);   // large, with room around it
    x.fillStyle='#000';x.fillRect(0,0,m.width,m.height);
    x.globalCompositeOperation='destination-out';x.font=`400 ${px}px "Geist Pixel"`;x.textAlign='center';x.textBaseline='alphabetic';
    x.fillText(label,m.width/2,m.height/2+px*.722/2);
    const url=`url(${m.toDataURL()})`;
    for(const el of [glass,...slabs])el.style.webkitMaskImage=el.style.maskImage=url;   // the date goes right through the card
    // the rim around the cut-out letters: a thin outline on the glass side of each edge
    const e=document.createElement('canvas');e.width=m.width;e.height=m.height;const ex=e.getContext('2d');
    ex.font=`400 ${px}px "Geist Pixel"`;ex.textAlign='center';ex.textBaseline='alphabetic';ex.lineJoin='miter';
    const by=m.height/2+px*.722/2;
    // the same treatment as the card's outer edge: a 0.75px line right at the edge, and a glow at 30% running 18px
    // onto the glass, falling off fast then gently (stacked strokes, each adding its step of the falloff)
    ex.strokeStyle='#000';ex.globalCompositeOperation='lighter';
    const fall=[[18,0],[15,.02],[11,.07],[7,.16],[4,.3],[2,.55],[0,1]];
    for(let i=1;i<fall.length;i++){const [d,a]=fall[i],[,a0]=fall[i-1];ex.globalAlpha=(a-a0)*.3;ex.lineWidth=Math.max(1,2*fall[i-1][0]*dpr);ex.strokeText(label,m.width/2,by);}
    ex.globalAlpha=1;ex.globalCompositeOperation='source-over';ex.lineWidth=1.5*dpr;ex.strokeText(label,m.width/2,by);
    ex.globalCompositeOperation='destination-out';ex.fillText(label,m.width/2,m.height/2+px*.722/2);
    edge.style.webkitMaskImage=edge.style.maskImage=`url(${e.toDataURL()})`;
    if(!revealed){revealed=true;revealBox(box,picture(W,H,m));}   // it loads in like the photos
  }
  // what the panel looks like, flat, for the load-in: the signal, and the frosted glass with the date cut out of it
  function picture(W,H,m){
    const p=document.createElement('canvas');p.width=W;p.height=H;const x=p.getContext('2d');
    x.imageSmoothingEnabled=false;x.drawImage(c,0,0,W,H);
    const gl2=document.createElement('canvas');gl2.width=W;gl2.height=H;const y=gl2.getContext('2d');
    y.beginPath();y.roundRect(PH_INSET,PH_INSET,W-2*PH_INSET,H-2*PH_INSET,28);y.clip();
    y.drawImage(frost,0,0,W,H);
    y.fillStyle=getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()||'#1a1a1a';y.globalAlpha=.62;y.fillRect(0,0,W,H);y.globalAlpha=1;
    y.globalCompositeOperation='destination-in';y.drawImage(m,PH_INSET,PH_INSET,W-2*PH_INSET,H-2*PH_INSET);   // the date cut out
    x.drawImage(gl2,0,0);return p;
  }
  function tick(now){
    raf=0;if(!visible||document.hidden||!st)return;
    if(glitchTick(st,now))frosting();   // its own pace: calm stretches, fits, freezes
    raf=requestAnimationFrame(tick);
  }
  const wake=()=>{if(!raf&&visible&&!reducedMotion)raf=requestAnimationFrame(tick);};
  if(!reducedMotion)tiltCard(box,glass,card,cd);
  (document.fonts?document.fonts.load('400 100px "Geist Pixel"'):Promise.resolve()).catch(()=>{}).then(()=>{
    layout();new ResizeObserver(layout).observe(box);
    new IntersectionObserver(([en])=>{visible=en.isIntersecting;wake();}).observe(box);
    document.addEventListener('visibilitychange',wake);
  });
}
renderDetails(next);
