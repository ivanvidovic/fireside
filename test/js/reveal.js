// Images load in like an old download: until the picture is in, its spot shows a broken GPU signal (below); then the
// picture arrives in rows, top to bottom, in three passes: chunky blocks, finer blocks, then the real image.
// The average colour (set in the HTML at build time) stays as the fallback.
// Once per image, the first time it scrolls into view. Reduced motion: a plain fade.
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
const PAL=[[255,0,170],[255,40,120],[0,240,255],[140,255,40],[40,120,255],[255,190,0],[190,80,255],[0,255,170]];
const GX=2,GY=3,TICK=1000/12;   // grid cell in css px (wide, short: rows read as scanlines); step time (ms)
const rnd=(a,b)=>a+Math.random()*(b-a);
function glitchRow(st,y){
  const {w,buf}=st,o=y*w,zone=st.zone(y);
  if(y>0&&Math.random()<.45){               // carry the row above, nudged: streaks hold together in bands
    const dx=Math.floor(rnd(-3,4));for(let x=0;x<w;x++)buf[o+x]=buf[o-w+((x-dx+w)%w)];return;}
  for(let x=0;x<w;x++)buf[o+x]=0xff0a0605;   // near-black
  if(Math.random()<.1)return;                // a dead line
  let x=Math.floor(rnd(-.2,.3)*w);
  while(x<w){
    const len=Math.max(2,Math.floor(-Math.log(1-Math.random())*w*rnd(.15,.6))),pat=Math.random();
    const c=PAL[(zone+(Math.random()<.7?0:Math.random()<.5?1:-1)+PAL.length)%PAL.length],b=rnd(.55,1.15);
    for(let i=0;i<len&&x+i<w;i++){
      if(x+i<0)continue;
      if(pat>.72&&((i>>(pat>.9?0:1))&1))continue;   // dashed, or beaded
      const k=b*rnd(.82,1.1);
      buf[o+x+i]=0xff000000|(Math.min(255,c[2]*k)<<16)|(Math.min(255,c[1]*k)<<8)|Math.min(255,c[0]*k);
    }
    x+=len+Math.floor(-Math.log(1-Math.random())*w*rnd(.02,.2));
  }
}
function glitchStep(st,first){
  const {w,h,buf}=st;
  st.drift+=rnd(-.4,.9);                                    // the colour bands creep down the frame
  const rows=first?h:Math.ceil(h*rnd(.08,.3));
  for(let i=0;i<rows;i++)glitchRow(st,first?i:Math.floor(Math.random()*h));
  for(let n=Math.floor(rnd(0,4));n--;){                    // rows smear sideways
    const y=Math.floor(Math.random()*h),dx=Math.floor(rnd(-8,8)),row=buf.slice(y*w,(y+1)*w);
    for(let x=0;x<w;x++)buf[y*w+x]=row[(x-dx+w)%w];
  }
  if(Math.random()<.35){                                    // a tear: a band jumps sideways, or repeats from elsewhere
    const bh=Math.floor(rnd(2,Math.max(3,h*.12))),y0=Math.floor(Math.random()*(h-bh)),dx=Math.floor(rnd(-.25,.25)*w);
    const src=Math.random()<.5?y0:Math.floor(Math.random()*(h-bh)),band=buf.slice(src*w,(src+bh)*w);
    for(let y=0;y<bh;y++)for(let x=0;x<w;x++)buf[(y0+y)*w+x]=band[y*w+(x-dx+w*4)%w];
  }
  for(let n=Math.floor(rnd(1,6));n--;){                    // bursts of sparkling noise
    const cw=Math.floor(rnd(4,Math.max(5,w*.08))),chh=Math.floor(rnd(1,3)),x0=Math.floor(Math.random()*(w-cw)),y0=Math.floor(Math.random()*(h-chh));
    for(let y=0;y<chh;y++)for(let x=0;x<cw;x++)if(Math.random()<.7){
      const c=PAL[Math.floor(Math.random()*PAL.length)],k=rnd(.6,1.3);
      buf[(y0+y)*w+x0+x]=0xff000000|(Math.min(255,c[2]*k)<<16)|(Math.min(255,c[1]*k)<<8)|Math.min(255,c[0]*k);
    }
  }
  st.g.putImageData(st.img,0,0);
}
function glitchSize(img){
  const st=img._gl;if(!st)return;
  const W=img.clientWidth,H=img.clientHeight;if(!W||!H)return;
  Object.assign(st.c.style,{left:img.offsetLeft+'px',top:img.offsetTop+'px',width:W+'px',height:H+'px'});
  const w=Math.max(8,Math.round(W/GX)),h=Math.max(6,Math.round(H/GY));
  if(st.w===w&&st.h===h)return;
  st.w=st.c.width=w;st.h=st.c.height=h;st.img=st.g.createImageData(w,h);st.buf=new Uint32Array(st.img.data.buffer);
  glitchStep(st,true);
}
function glitchStart(img){
  if(img._gl||img._done||!img.clientWidth)return;
  const c=document.createElement('canvas');c.className='rv-canvas rv-glitch';c.setAttribute('aria-hidden','true');
  const seed=Math.random()*100,st={c,g:c.getContext('2d'),w:0,h:0,drift:0,on:true,last:0,raf:0};
  // which part of the palette each row leans to: slow, wandering bands
  st.zone=y=>Math.floor((Math.sin((y+st.drift)/st.h*2.3+seed)+Math.sin((y+st.drift)/st.h*5.9+seed*1.7)*.35+1.35)/2.7*PAL.length)%PAL.length;
  img._gl=st;img._avg=img._avg||getComputedStyle(img).backgroundColor;img.style.backgroundColor='transparent';
  img.before(c);glitchSize(img);
  st.ro=new ResizeObserver(()=>glitchSize(img));st.ro.observe(img);
  if(reduced)return;
  const tick=now=>{st.raf=0;if(!st.on||!img._gl)return;
    if(now-st.last>=TICK*rnd(.6,1.6)){st.last=now;glitchStep(st,false);}   // uneven steps: a struggling signal
    st.raf=requestAnimationFrame(tick);};
  st.raf=requestAnimationFrame(tick);
}
function glitchPause(img,on){const st=img._gl;if(!st)return;st.on=on;if(on&&!st.raf&&!reduced)st.raf=requestAnimationFrame(function t(now){st.raf=0;if(!st.on||!img._gl)return;if(now-st.last>=TICK*rnd(.6,1.6)){st.last=now;glitchStep(st,false);}st.raf=requestAnimationFrame(t);});}
function glitchEnd(img){const st=img._gl;if(!st)return;img._gl=null;st.on=false;cancelAnimationFrame(st.raf);st.ro.disconnect();st.c.remove();}
const gio=new IntersectionObserver(es=>{for(const e of es){
  if(e.isIntersecting){if(e.target._gl)glitchPause(e.target,true);else glitchStart(e.target);}else glitchPause(e.target,false);
}},{rootMargin:'200px 0px'});

function play(img){
  img._done=true;
  if(reduced){img.classList.add('rv-fade');img.classList.remove('rv-wait');setTimeout(()=>{glitchEnd(img);img.style.backgroundColor='';},400);gio.unobserve(img);return;}
  gio.unobserve(img);
  const w=img.clientWidth,h=img.clientHeight;if(!w||!h){glitchEnd(img);img.style.backgroundColor='';img.classList.remove('rv-wait');return;}
  const dpr=Math.min(2,devicePixelRatio||1),c=document.createElement('canvas');
  c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.className='rv-canvas';
  Object.assign(c.style,{left:img.offsetLeft+'px',top:img.offsetTop+'px',width:w+'px',height:h+'px'});
  img.before(c);   // under the image: the real picture scans in over the blocks
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
  (function step(now){
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
    else{img.style.clipPath='';img.style.background='';if(statik)img.style.position='';c.remove();glitchEnd(img);}
  })(t0);
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
    const go=()=>img.decode().catch(()=>{}).then(()=>setTimeout(()=>play(img),Math.max(0,slot-performance.now())));
    img.complete?go():img.addEventListener('load',go,{once:true});
  }
},{rootMargin:'0px 0px -10% 0px'});

for(const img of document.querySelectorAll('main img')){
  img.classList.add('rv-wait');
  if(img.parentElement&&getComputedStyle(img.parentElement).position==='static')img.parentElement.style.position='relative';
  io.observe(img);gio.observe(img);
}
