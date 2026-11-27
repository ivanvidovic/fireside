// Gear page: the live 3D shirt on the banner stage, the size slider, and checkout.
import {CONFIG} from './config.js';
import {theme} from './common.js';

const root=document.documentElement;
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobileMemory=navigator.userAgentData?.mobile===true||/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const mobile=Math.min(innerWidth,innerHeight)<760||navigator.maxTouchPoints>0;
const asset=p=>new URL('../'+p,import.meta.url).href;
const canvas=document.getElementById('shirt'),stage=document.querySelector('.shirt-stage');
let shirt=null;

/* ---------------- order ---------------- */
(function order(){
  const form=document.getElementById('buy'),links=document.getElementById('checkout-links'),status=document.getElementById('buy-status');
  // The fallback links are the single source of the Stripe URLs.
  const urls=new Map([...links.querySelectorAll('a[data-size]')].map(a=>[a.dataset.size,a.href]));
  const size=()=>new FormData(form).get('size');
  links.hidden=true;form.hidden=false;form.noValidate=true;   // the slider nudge replaces the browser's bubble
  const slider=installSizeSlider(form);
  const buy=form.querySelector('.buy');
  const ready=()=>buy.setAttribute('aria-disabled',size()?'false':'true');
  form.addEventListener('change',()=>{status.textContent='';ready();});ready();
  form.addEventListener('submit',e=>{
    e.preventDefault();const url=urls.get(size());
    if(url){location.assign(url);return;}
    if(size()){status.textContent=`${size()} checkout isn’t open yet.`;return;}   // a size with no Stripe link yet
    status.textContent='Choose a size first.';slider.nudge();form.querySelector('input').focus({preventScroll:true});
  });
})();

/* ---------------- size slider ---------------- */
// An analog control with one detent per size. The radios remain the real input: the slider
// writes to them, and keyboard changes on them move the slider.
function installSizeSlider(form){
  // Evenly spaced positions, S at the far left through 2XL at the far right. Before a size is
  // chosen the pill rests on S, wider, reading "Size →"; the first grab turns it into S.
  const el=form.querySelector('.slider'),handle=el.querySelector('.handle'),label=handle.querySelector('.handle-label');
  const radios=[...form.querySelectorAll('input[name=size]')],SIZES=radios.map(r=>r.value),N=SIZES.length;
  const HW=88,IW=128;                           // pill width showing a size / showing "Size →"
  const ticks=SIZES.map(()=>{const t=document.createElement('span');t.className='tick';el.append(t);return t;});
  let W=0,pos=0,vel=0,target=0,sel=-1,dragging=false,grab=0,startX=0,lastNear=-1,touch=false,raf=0;
  const step=()=>(W-HW)/(N-1);
  const notch=i=>HW/2+i*step();
  const rest=()=>IW/2;                          // the idle pill's left edge sits at the start of the line
  const nearest=x=>Math.max(0,Math.min(N-1,Math.round((x-HW/2)/step())));
  const idle=()=>sel<0&&!dragging;
  function layout(){
    W=el.clientWidth;const d=devicePixelRatio||1,x0=el.getBoundingClientRect().left;
    ticks.forEach((t,i)=>{t.style.left=Math.round((x0+notch(i))*d)/d-x0+'px';});   // whole device pixels: every notch the same weight
    pos=target=sel<0?rest():notch(sel);paint();
  }
  function paint(){
    const w=idle()?IW:HW;
    handle.style.width=w+'px';
    handle.style.transform=`translateX(${pos-w/2}px)`;
    const show=dragging?nearest(pos):sel;
    label.textContent=show>=0?SIZES[show]:'Size';
    handle.classList.toggle('on',show>=0);
  }
  function animate(){
    cancelAnimationFrame(raf);
    let last=performance.now();
    const tickFn=now=>{
      const dt=Math.min(.032,(now-last)/1000);last=now;
      if(reduced){pos=target;vel=0;}
      else{const k=dragging?900:260,c=2*Math.sqrt(k)*(dragging?1:.62);vel+=((target-pos)*k-vel*c)*dt;pos+=vel*dt;}
      paint();
      if(dragging||Math.abs(target-pos)>.2||Math.abs(vel)>.2)raf=requestAnimationFrame(tickFn);else{pos=target;paint();}
    };
    raf=requestAnimationFrame(tickFn);
  }
  function choose(i){
    sel=i;target=notch(i);
    if(!radios[i].checked){radios[i].checked=true;radios[i].dispatchEvent(new Event('change',{bubbles:true}));}
    animate();
  }
  function follow(px){
    let x=Math.max(HW/2,Math.min(W-HW/2,px-grab));
    const n=notch(nearest(x)),d=x-n;x=n+d*(1-.35*Math.exp(-(d*d)/(2*14*14)));   // gentle pull into each detent
    target=x;
    const k=nearest(x);if(k!==lastNear){lastNear=k;if(!reduced)navigator.vibrate?.(6);}
  }
  el.addEventListener('pointerdown',e=>{
    if(e.button>0)return;
    e.preventDefault();el.setPointerCapture(e.pointerId);
    touch=e.pointerType==='touch';startX=e.clientX;
    const r=el.getBoundingClientRect(),px=e.clientX-r.left,onHandle=!!e.target.closest('.handle');
    if(sel<0&&onHandle){pos=Math.min(pos,notch(0));}          // first grab: the pill becomes S, on the S position
    grab=onHandle?px-pos:0;lastNear=nearest(pos);
    if(!touch){dragging=true;root.classList.add('holding');follow(px);paint();animate();}
  });
  el.addEventListener('pointermove',e=>{
    if(!el.hasPointerCapture(e.pointerId))return;
    const r=el.getBoundingClientRect(),px=e.clientX-r.left;
    // Touch waits for a sideways intent so vertical swipes still scroll the page.
    if(touch&&!dragging){if(Math.abs(e.clientX-startX)<6)return;dragging=true;root.classList.add('holding');animate();}
    follow(px);
  });
  const release=(e,cancelled)=>{
    if(!el.hasPointerCapture(e.pointerId)&&!dragging)return;
    const r=el.getBoundingClientRect(),px=e.clientX-r.left,wasDragging=dragging;
    dragging=false;root.classList.remove('holding');
    if(cancelled){if(sel<0){target=rest();animate();}else choose(sel);return;}
    choose(wasDragging?nearest(target):nearest(Math.max(HW/2,Math.min(W-HW/2,px))));   // where it was let go; a tap jumps to that size
  };
  el.addEventListener('pointerup',e=>release(e,false));
  el.addEventListener('pointercancel',e=>release(e,true));
  radios.forEach((r,i)=>r.addEventListener('change',()=>{if(!dragging&&sel!==i){sel=i;target=notch(i);animate();}}));
  // Keyboard: with nothing chosen, the first arrow press picks S; after that arrows step through sizes.
  form.querySelector('.sizes').addEventListener('keydown',e=>{
    if(sel<0&&/^Arrow/.test(e.key)){e.preventDefault();radios[0].focus();choose(0);}
  });
  new ResizeObserver(layout).observe(el);addEventListener('resize',layout);layout();   // window resize can move it without resizing it
  // Until a size is picked, the pill nudges toward the sizes every few seconds while in view.
  // It stops for good once the slider is touched. Off with reduced motion.
  let touched=false,inView=false;
  el.addEventListener('pointerdown',()=>{touched=true;},{capture:true});
  function nudge(){
    if(reduced||dragging||sel>=0)return;
    target=rest()+22;animate();
    setTimeout(()=>{if(!dragging&&sel<0){target=rest();animate();}},170);
  }
  if(!reduced){
    new IntersectionObserver(es=>{inView=es.some(e=>e.isIntersecting);}).observe(el);
    const idleTimer=setInterval(()=>{
      if(touched||sel>=0){clearInterval(idleTimer);return;}
      if(inView&&!document.hidden)nudge();
    },4200);
  }
  return {nudge};
}

/* ---------------- shirt framing ---------------- */
// The canvas sits inside the stage and scrolls with the page; it is framed once per resize.
// The shirt itself (collar to hem) sets the framing, as large as fits: desktop, from just under
// the header down to the hint above the banner's divider; phones, the stage above the text.
// The banner clips everything below its divider, so the shadow may be cut there.
// Measured at rest in ORB's square framing box S: collar .149·S, hem .917·S, width about .62·S.
const COLLAR=.149,HEM=.917,WIDE=.66,GAP_TOP=16,GAP_BOTTOM=64;
const banner=stage.closest('.banner'),header=document.querySelector('.top');
const isPhone=()=>matchMedia('(max-width:899px)').matches;   // stacked layout (tablets and phones)
const isSmall=()=>matchMedia('(max-width:599px)').matches;   // phones: whole shirt, cropped above the text
// Starting zoom: phones show the whole shirt; wider layouts start closer, on the full back print.
const startZoom=()=>isSmall()?1:isPhone()?1.4:1.9;
const colGap=()=>parseFloat(getComputedStyle(banner).columnGap)||0;
let zoom=1,shirtLayout='';
function frame(){
  // Crossing a breakpoint (desktop / tablet / phone) resets to that layout's starting zoom.
  const L=isSmall()?'phone':isPhone()?'tablet':'desktop';
  if(shirt&&L!==shirtLayout){zoom=shirt.setZoom(startZoom(),true);shirtLayout=L;}
  const W=innerWidth,H=innerHeight,sr=stage.getBoundingClientRect(),br=banner.getBoundingClientRect(),sw=sr.width;
  const bTop=br.top-sr.top,bBottom=br.bottom-sr.top;                 // banner edges, stage coordinates
  const rTop=bTop+header.offsetHeight+GAP_TOP;
  const rBottom=isPhone()?sr.height:bBottom-GAP_BOTTOM;
  const S=Math.min((rBottom-rTop)/(HEM-COLLAR),(isPhone()?sw:sw+48)/WIDE);
  const top=rTop+((rBottom-rTop)-(HEM-COLLAR)*S)/2-COLLAR*S;          // box top, stage coordinates
  const left=-sr.left,ctop=(bTop+bBottom)/2-H/2;                        // canvas origin, stage coordinates
  // Phones and tablet: runs under the text glass and stops at the divider, where that glass is solid.
  // Desktop: runs on under the Pre-order glass and stops at that section's end.
  const sec=document.querySelector('.order-sec').getBoundingClientRect(),secBottom=sec.bottom-sr.top;
  Object.assign(canvas.style,{left:left+'px',top:ctop+'px',width:W+'px',height:H+'px',
    clipPath:`inset(0 0 ${Math.max(0,ctop+H-(isPhone()?bBottom:secBottom))}px 0)`});
  shirt?.setFrame((sw/2-left)/W,(top+S/2-ctop)/H,H/S);
}
frame();addEventListener('resize',frame);
new ResizeObserver(frame).observe(banner);

/* ---------------- shirt ---------------- */
function webglAvailable(){try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'));}catch{return false;}}
if(!webglAvailable())root.classList.add('no-webgl');
else{
  // Start downloading the print now, in parallel with the 3D code (the model itself is preloaded in the page head).
  const artworkFetch=fetch(asset(mobileMemory?'assets/shirt/artwork-half.webp':'assets/shirt/artwork.webp'));
  import('./shirt.js').then(({createShirt})=>{
    shirt=createShirt({canvas,mobile,mobileMemory,reduced,power:CONFIG.lightPower,
      assets:{glb:asset('assets/shirt/shirt.glb'),artwork:artworkFetch},
      onError:e=>console.error('[shirt]',e)});
    frame();
    shirt.setPreset(CONFIG.lighting[theme()]);
    addEventListener('fireside:theme',e=>shirt.setPreset(CONFIG.lighting[e.detail.theme],e.detail.animate));
    installControls();
    // Fade the shirt in only after its first real frame is drawn.
    shirt.ready.then(()=>requestAnimationFrame(()=>requestAnimationFrame(()=>root.classList.add('live'))))
      .catch(()=>root.classList.add('no-webgl'));
    requestAnimationFrame(loop);
  }).catch(e=>{console.error(e);root.classList.add('no-webgl');});
}
let last=performance.now();
function loop(t){
  requestAnimationFrame(loop);
  const dt=Math.min(.05,(t-last)/1000);last=t;
  if(!shirt||document.hidden)return;
  // Only draw while the banner is on screen.
  const r=banner.getBoundingClientRect();
  if(r.bottom<0||r.top>innerHeight)return;
  shirt.tick(dt);
}

/* ---------------- controls (ORB interaction) ---------------- */
function installControls(){
  // Orbit only: drag (with ORB's inertia), arrow keys, and page scroll. No zoom.
  let pointerId=null,lastX=0,lastY=0,lastT=0;
  const interacted=()=>root.classList.add('interacted');
  stage.addEventListener('pointerdown',e=>{
    if(e.button>0||pointerId!==null)return;
    pointerId=e.pointerId;lastX=e.clientX;lastY=e.clientY;lastT=performance.now();
    shirt.beginOrbit();stage.setPointerCapture(e.pointerId);stage.classList.add('dragging');root.classList.add('holding');
  });
  stage.addEventListener('pointermove',e=>{
    if(e.pointerId!==pointerId)return;
    const now=performance.now(),dt=(now-lastT)/1000,dx=e.clientX-lastX,dy=e.clientY-lastY;
    // Touch: vertical movement belongs to page scrolling; horizontal rotates.
    shirt.orbitInput(-dx*.008,e.pointerType==='touch'?0:-dy*.006,dt);
    lastX=e.clientX;lastY=e.clientY;lastT=now;if(Math.abs(dx)>2)interacted();
  });
  const end=e=>{if(e.pointerId!==pointerId)return;pointerId=null;shirt.endOrbit();stage.classList.remove('dragging');root.classList.remove('holding');};
  stage.addEventListener('pointerup',end);stage.addEventListener('pointercancel',end);
  stage.addEventListener('lostpointercapture',end);
  stage.addEventListener('keydown',e=>{
    const k={ArrowLeft:[-.14,0],ArrowRight:[.14,0],ArrowUp:[0,.10],ArrowDown:[0,-.10]}[e.key];
    if(!k)return;e.preventDefault();shirt.orbitInput(k[0],-k[1],.08);interacted();
  });
  // Mouse wheel over the shirt zooms (elsewhere it scrolls the page); pinch zooms on touch.
  let pinch=0;
  const setZoom=z=>{zoom=shirt.setZoom(z);};
  stage.addEventListener('wheel',e=>{
    e.preventDefault();
    const d=e.deltaMode===1?e.deltaY*16:e.deltaY;
    setZoom(zoom*Math.exp(-d*(e.ctrlKey?.008:.0012)));interacted();
  },{passive:false});
  stage.addEventListener('touchmove',e=>{
    if(e.touches.length!==2)return;e.preventDefault();
    const dist=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);
    if(pinch)setZoom(zoom*dist/pinch);pinch=dist;interacted();
  },{passive:false});
  stage.addEventListener('touchend',()=>{pinch=0;});
  // Scrolling turns the shirt; the same input feeds ORB's cloth inertia.
  if(!reduced){
    let lastScroll=scrollY,lastScrollT=performance.now(),scrollTimer=0,scrolling=false;
    addEventListener('scroll',()=>{
      if(pointerId!==null){lastScroll=scrollY;return;}
      const now=performance.now(),dy=scrollY-lastScroll;lastScroll=scrollY;
      if(!dy)return;
      if(!scrolling){scrolling=true;shirt.beginOrbit();}
      shirt.orbitInput(-dy*.003,0,(now-lastScrollT)/1000);lastScrollT=now;
      clearTimeout(scrollTimer);scrollTimer=setTimeout(()=>{scrolling=false;shirt.endOrbit();},140);
    },{passive:true});
  }
}
