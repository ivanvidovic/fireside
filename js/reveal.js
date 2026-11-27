// Images load in like an old download: until the picture is in, its spot shows a broken GPU signal (below); then the
// picture arrives in rows, top to bottom, in three passes: chunky blocks, finer blocks, then the real image.
// The average colour (set in the HTML at build time) stays as the fallback.
// Once per image, the first time it scrolls into view. Reduced motion: a plain fade.
import {glitchStep,glitchState,glitchTick,GX,GY} from './glitch.js';
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;

// Day and night versions: images marked data-day / data-night show the one for the current theme. The page only
// downloads that one; the other set loads quietly once the page is in, so a theme switch is instant. On a switch,
// the shown image crossfades to the other version (the old one, on top, fades out over the new one).
const root=document.documentElement;
const themed=[...document.querySelectorAll('img[data-day]')];
const pick=img=>root.dataset.scheme==='light'?img.dataset.day:img.dataset.night;
for(const img of themed)img.setAttribute('src',pick(img));
addEventListener('fireside:theme',()=>{
  for(const img of themed){
    const next=pick(img);if(img.getAttribute('src')===next)continue;
    if(!img.complete||!img.naturalWidth||img.classList.contains('rv-wait')){img.setAttribute('src',next);continue;}   // not shown yet
    const old=img.cloneNode();old.removeAttribute('loading');old.alt='';old.setAttribute('aria-hidden','true');
    Object.assign(old.style,{position:'absolute',left:img.offsetLeft+'px',top:img.offsetTop+'px',width:img.offsetWidth+'px',height:img.offsetHeight+'px',
      margin:'0',aspectRatio:'auto',pointerEvents:'none'});
    img.after(old);img.setAttribute('src',next);
    img.decode().catch(()=>{}).then(()=>old.animate([{opacity:1},{opacity:0}],{duration:500,easing:'ease'}).finished.then(()=>old.remove()));
  }
});
addEventListener('load',()=>setTimeout(()=>{
  for(const img of themed){const o=new Image();o.decoding='async';o.src=root.dataset.scheme==='light'?img.dataset.night:img.dataset.day;}
},800));
const PASS=.24;   // average seconds per pass; each image, and each of its passes, varies around it
const vary=(v,k)=>v*(1-k+2*k*Math.random());

function coverBox(img,w,h){
  // where the image's pixels land inside its box (object-fit: cover / fill, with its own object-position)
  img.classList.remove('rv-wait');const cs=getComputedStyle(img),fit=cs.objectFit,pos=cs.objectPosition;img.classList.add('rv-wait');
  const nw=img.naturalWidth,nh=img.naturalHeight;
  if(fit!=='cover')return {sx:0,sy:0,sw:nw,sh:nh};
  const s=Math.max(w/nw,h/nh),sw=w/s,sh=h/s;
  const [px,py]=pos.split(' ').map(v=>v.endsWith('%')?parseFloat(v)/100:.5);
  return {sx:(nw-sw)*px,sy:(nh-sh)*py,sw,sh};
}

/* ---------------- the broken signal under a loading image ---------------- */
// Procedural, different every time: neon streaks smeared along rows, bands of colour that drift down the frame,
// bursts of sparkling noise and tearing, all updated in jittery steps (about 12 a second) on a coarse grid scaled up.
// It runs only while the image is near the screen and not yet revealed; the reveal sweeps over it and removes it.
// It never delays anything. Reduced motion: one still frame.
function glitchSize(img){
  const st=img._gl;if(!st)return;
  const W=img.clientWidth,H=img.clientHeight;if(!W||!H)return;
  Object.assign(st.c.style,{left:img.offsetLeft+'px',top:img.offsetTop+'px',width:W+'px',height:H+'px'});
  const w=Math.max(8,Math.round(W/GX)),h=Math.max(6,Math.round(H/GY));
  if(st.w===w&&st.h===h)return;
  st.c.width=w;st.c.height=h;Object.assign(st,glitchState(w,h),{c:st.c,g:st.g,on:st.on,last:st.last,raf:st.raf,ro:st.ro});
  glitchStep(st,true);
}
function glitchStart(img){
  if(img._gl||img._done||!img.clientWidth)return;
  const c=document.createElement('canvas');c.className='rv-canvas rv-glitch';c.setAttribute('aria-hidden','true');
  const st={c,g:c.getContext('2d'),w:0,h:0,on:true,last:0,raf:0};
  img._gl=st;img._avg=img._avg||getComputedStyle(img).backgroundColor;img.style.backgroundColor='transparent';
  img.before(c);glitchSize(img);
  st.ro=new ResizeObserver(()=>glitchSize(img));st.ro.observe(img);
  if(reduced)return;
  const tick=now=>{st.raf=0;if(!st.on||!img._gl)return;
    glitchTick(st,now);   // its own pace: calm stretches, fits, freezes
    st.raf=requestAnimationFrame(tick);};
  st.raf=requestAnimationFrame(tick);
}
function glitchPause(img,on){const st=img._gl;if(!st)return;st.on=on;if(on&&!st.raf&&!reduced)st.raf=requestAnimationFrame(function t(now){st.raf=0;if(!st.on||!img._gl)return;glitchTick(st,now);st.raf=requestAnimationFrame(t);});}
function glitchEnd(img){const st=img._gl;if(!st)return;img._gl=null;st.on=false;cancelAnimationFrame(st.raf);st.ro.disconnect();st.c.remove();}
const gio=new IntersectionObserver(es=>{for(const e of es){
  if(e.isIntersecting){if(e.target._gl)glitchPause(e.target,true);else glitchStart(e.target);}else glitchPause(e.target,false);
}},{rootMargin:'200px 0px'});

// Safety net: if anything is still hiding the image (waiting, part-way clip, the reveal's canvas), show it as is.
function finish(img){
  if(!img.classList.contains('rv-wait')&&!img.style.clipPath&&!img._rvc)return;   // already shown properly
  img._done=true;gio.unobserve(img);glitchEnd(img);
  img._rvc?.remove();img._rvc=null;
  img.classList.remove('rv-wait');img.style.clipPath='';img.style.background='';
}
// Fallback: show the image as is (still loading or not), with no reveal.
function showPlain(img){
  img._done=true;gio.unobserve(img);glitchEnd(img);
  img.classList.remove('rv-wait');img.style.clipPath='';img.style.backgroundColor='';
}
// Still failing after the retry: keep the box at its average colour instead of a broken-image icon.
// A theme switch sets a fresh src, which loads normally if the connection is back.
function gaveUp(img){img.style.backgroundColor='var(--avg)';img.src='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';}
function play(img){
  img._done=true;
  if(reduced){img.classList.add('rv-fade');img.classList.remove('rv-wait');setTimeout(()=>{glitchEnd(img);img.style.backgroundColor='';},400);gio.unobserve(img);return;}
  gio.unobserve(img);
  const w=img.clientWidth,h=img.clientHeight;if(!w||!h){glitchEnd(img);img.style.backgroundColor='';img.classList.remove('rv-wait');return;}
  const dpr=Math.min(2,devicePixelRatio||1),c=document.createElement('canvas');
  c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.className='rv-canvas';
  Object.assign(c.style,{left:img.offsetLeft+'px',top:img.offsetTop+'px',width:w+'px',height:h+'px'});
  img.before(c);img._rvc=c;   // under the image: the real picture scans in over the blocks
  const statik=getComputedStyle(img).position==='static';if(statik)img.style.position='relative';
  const g=c.getContext('2d'),box=coverBox(img,w,h);
  // over the broken signal, the blocks sweep in; without it, they start from the average colour
  if(!img._gl){g.fillStyle=img._avg||getComputedStyle(img).backgroundColor;g.fillRect(0,0,c.width,c.height);}
  img.style.background='transparent';
  // the two low-resolution versions: blocks of about 1/28 and 1/110 of the width
  const levels=[Math.max(10,w/28),Math.max(3,w/110)].map(b=>{
    const cw=Math.max(1,Math.round(w/b)),ch=Math.max(1,Math.round(h/b)),s=document.createElement('canvas');
    s.width=cw;s.height=ch;s.getContext('2d').drawImage(img,box.sx,box.sy,box.sw,box.sh,0,0,cw,ch);return s;
  });
  g.imageSmoothingEnabled=false;
  // this image's own pace: its three passes each a little faster or slower, so no two reveals run the same
  const dur=[vary(PASS,.3),vary(PASS,.3),vary(PASS,.3)],ends=[dur[0],dur[0]+dur[1],dur[0]+dur[1]+dur[2]];
  const t0=performance.now();
  (function step(now){try{
    const t=Math.max(0,(now-t0)/1000),pass=t<ends[0]?0:t<ends[1]?1:t<ends[2]?2:3,f=pass>2?1:Math.min(1,(t-(pass?ends[pass-1]:0))/dur[pass]);
    if(pass<2){
      const s=levels[pass],rows=Math.ceil(f*s.height);   // one block row at a time
      if(rows>0)g.drawImage(s,0,0,s.width,rows,0,0,c.width,rows*c.height/s.height);
    }else if(pass===2){
      if(img.classList.contains('rv-wait')){img.style.clipPath='inset(0 0 100% 0)';img.classList.remove('rv-wait');}
      const rowH=Math.max(2,Math.round(h/90)),shown=Math.ceil(f*h/rowH)*rowH;   // the real image scans in, in thin rows
      img.style.clipPath=`inset(0 0 ${Math.max(0,h-shown)}px 0)`;
    }
    if(pass<3)requestAnimationFrame(step);
    else{img.style.clipPath='';img.style.background='';if(statik)img.style.position='';c.remove();img._rvc=null;glitchEnd(img);}
  }catch{finish(img);}})(t0);
}

// Images that come into view together don't all start at once: each takes the next slot, top to bottom, left to
// right, about STAGGER apart. An image still loading starts when it's in, but never before its slot.
const STAGGER=.14;   // average seconds between starts (each gap varies)
let nextSlot=0;
const io=new IntersectionObserver(es=>{
  const now=performance.now();
  const hits=es.filter(e=>e.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top||a.boundingClientRect.left-b.boundingClientRect.left);
  for(const e of hits){
    io.unobserve(e.target);
    const img=e.target,slot=Math.max(now,nextSlot);nextSlot=slot+vary(STAGGER,.5)*1000;
    const go=()=>{if(img._done)return;Promise.race([img.decode().catch(()=>{}),new Promise(r=>setTimeout(r,1500))]).then(()=>setTimeout(()=>{if(!img._done)try{play(img);}catch{finish(img);}},Math.max(0,slot-performance.now())));};
    if(img.complete&&img.naturalWidth)go();
    else{
      img.addEventListener('load',go,{once:true});
      // A load that fails is retried once; one that never finishes is shown without the reveal, so no box stays empty.
      let retried=false;
      const failed=()=>{if(img._done)return;if(!retried){retried=true;const s=img.getAttribute('src');img.setAttribute('src',s+(s.includes('?')?'&':'?')+'retry=1');}else{showPlain(img);gaveUp(img);}};
      img.addEventListener('error',failed);
      if(img.complete&&!img.naturalWidth)failed();   // already broken before we got here
    }
    // whatever happened (a stalled decode, a reveal cut short, a theme switch mid-reveal), it's fully shown 8s after it came into view
    setTimeout(()=>finish(img),8000);
  }
},{rootMargin:'0px 0px -10% 0px'});

for(const img of document.querySelectorAll('main img')){
  img.classList.add('rv-wait');
  if(img.parentElement&&getComputedStyle(img.parentElement).position==='static')img.parentElement.style.position='relative';
  io.observe(img);gio.observe(img);
}

/* ---------------- the same load-in for a drawn panel (the meetup placeholder) ---------------- */
// For a box whose picture is drawn rather than loaded: src is a canvas of what the box will show. The box stays
// hidden until it scrolls into view and takes its slot; then blocks of src sweep in over the site's black, finer
// blocks, and the real box scans in, in thin rows. Reduced motion: a plain fade.
export function revealBox(el,src){
  el.classList.add('rv-hold');
  const go=()=>{
    if(reduced){el.classList.remove('rv-hold');el.animate([{opacity:0},{opacity:1}],{duration:400,easing:'ease'});return;}
    const w=el.clientWidth,h=el.clientHeight;if(!w||!h){el.classList.remove('rv-hold');return;}
    const dpr=Math.min(2,devicePixelRatio||1),c=document.createElement('canvas');
    c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.className='rv-canvas rv-over';
    Object.assign(c.style,{left:'0',top:'0',width:w+'px',height:h+'px'});
    const g=c.getContext('2d');g.fillStyle='#1a1a1a';g.fillRect(0,0,c.width,c.height);
    el.append(c);el.classList.remove('rv-hold');   // the box is under the cover now
    const levels=[Math.max(10,w/28),Math.max(3,w/110)].map(b=>{
      const cw=Math.max(1,Math.round(w/b)),ch=Math.max(1,Math.round(h/b)),s=document.createElement('canvas');
      s.width=cw;s.height=ch;s.getContext('2d').drawImage(src,0,0,cw,ch);return s;
    });
    g.imageSmoothingEnabled=false;
    const dur=[vary(PASS,.3),vary(PASS,.3),vary(PASS,.3)],ends=[dur[0],dur[0]+dur[1],dur[0]+dur[1]+dur[2]];
    const t0=performance.now();
    (function step(now){
      const t=Math.max(0,(now-t0)/1000),pass=t<ends[0]?0:t<ends[1]?1:t<ends[2]?2:3,f=pass>2?1:Math.min(1,(t-(pass?ends[pass-1]:0))/dur[pass]);
      if(pass<2){const s=levels[pass],rows=Math.ceil(f*s.height);if(rows>0)g.drawImage(s,0,0,s.width,rows,0,0,c.width,rows*c.height/s.height);}
      else if(pass===2){   // the real box scans in: the cover clears in thin rows from the top
        const rowH=Math.max(2,Math.round(h/90))*dpr,shown=Math.ceil(f*c.height/rowH)*rowH;g.clearRect(0,0,c.width,shown);}
      if(pass<3)requestAnimationFrame(step);else c.remove();
    })(t0);
  };
  const io=new IntersectionObserver(es=>{
    if(!es.some(e=>e.isIntersecting))return;io.disconnect();
    const now=performance.now(),slot=Math.max(now,nextSlot);nextSlot=slot+vary(STAGGER,.5)*1000;
    setTimeout(go,Math.max(0,slot-now));
  },{rootMargin:'0px 0px -10% 0px'});
  io.observe(el);
}
