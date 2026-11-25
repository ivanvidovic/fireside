// Images load in like an old download: the spot shows the image's average colour (set in the HTML at build time),
// then the picture arrives in rows, top to bottom, in three passes: chunky blocks, finer blocks, then the real image.
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

function play(img){
  if(reduced){img.classList.add('rv-fade');img.classList.remove('rv-wait');return;}
  const w=img.clientWidth,h=img.clientHeight;if(!w||!h){img.classList.remove('rv-wait');return;}
  const dpr=Math.min(2,devicePixelRatio||1),c=document.createElement('canvas');
  c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);c.className='rv-canvas';
  Object.assign(c.style,{left:img.offsetLeft+'px',top:img.offsetTop+'px',width:w+'px',height:h+'px'});
  img.before(c);   // under the image: the real picture scans in over the blocks
  const statik=getComputedStyle(img).position==='static';if(statik)img.style.position='relative';
  const g=c.getContext('2d'),box=coverBox(img,w,h);
  g.fillStyle=getComputedStyle(img).backgroundColor;g.fillRect(0,0,c.width,c.height);   // the average colour, as before
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
    else{img.style.clipPath='';img.style.background='';if(statik)img.style.position='';c.remove();}
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
  io.observe(img);
}
