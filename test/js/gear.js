// Gear page: the live 3D shirt on the banner stage, the size slider, and checkout.
import {CONFIG} from './config.js';
import {theme} from './common.js';
import {drawEmber} from './ember.js';

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
  const slider=installSizeSlider(form);installSizeMagic(form);
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

/* ---------------- size chosen: embers and a wake-up ---------------- */
// Embers burst off the pill where it lands (the same embers as the Meetups fire, js/ember.js), and the
// Pre-order button wakes with one sweep of light. A new choice restarts the sweep. Off with reduced motion.
function installSizeMagic(form){
  if(reduced)return;
  const el=form.querySelector('.slider'),buy=form.querySelector('.buy'),radios=[...form.querySelectorAll('input[name=size]')];
  const rnd=(a,b)=>a+Math.random()*(b-a);
  let wakeTimer=0;
  // embers: one canvas over the order area, alive only while sparks are in the air
  const cv=document.createElement('canvas');cv.className='size-sparks';cv.setAttribute('aria-hidden','true');document.body.append(cv);
  const g=cv.getContext('2d');let sparks=[],raf=0,last=0,box=null;
  const UP=240,SIDE=170,DOWN=90;   // room round the slider for the sparks to burst and rise into
  function place(){
    const r=el.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1),was=box;
    // kept inside the page's width: a canvas poking past the edge would widen the page (phones then zoom out)
    const vw=document.documentElement.clientWidth,x0=Math.max(0,r.left-SIDE),x1=Math.min(vw,r.right+SIDE);
    box={left:x0+scrollX,top:r.top+scrollY-UP,w:x1-x0,h:UP+r.height+DOWN,dpr};
    Object.assign(cv.style,{left:box.left+'px',top:box.top+'px',width:box.w+'px',height:box.h+'px'});
    cv.width=Math.round(box.w*dpr);cv.height=Math.round(box.h*dpr);
    if(was)for(const e of sparks){e.x+=was.left-box.left;e.y+=was.top-box.top;}   // sparks in the air keep their place on the page
  }
  // The burst: embers leave from all round the pill's outline, pushed outward, then each curves into its own
  // rise (own speed, lean and wobble, a third of them curling for a moment) and dies at its own point.
  function spark(px,py,pw,ph){
    const r=ph/2,straight=Math.max(0,pw-ph),per=2*straight+2*Math.PI*r;
    for(let i=0,n=Math.round(rnd(18,26));i<n;i++){
      // a random point on the outline of the pill (a stadium), and the way out from it
      let d=Math.random()*per,x,y,nx,ny;
      if(d<straight){x=px-straight/2+d;y=py-r;nx=0;ny=-1;}
      else if((d-=straight)<Math.PI*r){const a=-Math.PI/2+d/r;nx=Math.cos(a);ny=Math.sin(a);x=px+straight/2+nx*r;y=py+ny*r;}
      else if((d-=Math.PI*r)<straight){x=px+straight/2-d;y=py+r;nx=0;ny=1;}
      else{d-=straight;const a=Math.PI/2+d/r;nx=Math.cos(a);ny=Math.sin(a);x=px-straight/2+nx*r;y=py+ny*r;}
      const hero=Math.random()<.1,size=hero?rnd(2,2.8):Math.pow(Math.random(),1.6)*1.6+.6,out=rnd(90,260);
      const lazy=Math.random()<.15,flick=Math.random()<.1;
      const e={x,y,vx:nx*out+rnd(-20,20),vy:ny*out+rnd(-20,20),T:1,age:-rnd(0,.12),size,hero,
        life:flick?rnd(.4,.7):lazy?rnd(.8,1.6):rnd(.6,2.8),
        rise:lazy?rnd(5,15):rnd(20,95),lean:rnd(-28,28),push:rnd(2.5,5),drag:rnd(1.2,2.6)/(.6+size*.35),
        wa:rnd(6,18),wf:rnd(.02,.06),ws:rnd(.8,2.4),seed:Math.random()*100,f1:rnd(6,14),f2:rnd(2,5)};
      if(Math.random()<.33)e.sw={at:rnd(.2,.9),dur:rnd(.4,1),rate:rnd(5,10)*(Math.random()<.5?-1:1),amp:rnd(25,70),ph:Math.random()*6.3};
      sparks.push(e);
    }
    if(!raf){last=performance.now();raf=requestAnimationFrame(step);}
  }
  function step(now){
    const dt=Math.min(.05,(now-last)/1000),t=now/1000;last=now;
    const light=document.documentElement.dataset.scheme==='light';
    g.setTransform(box.dpr,0,0,box.dpr,0,0);g.clearRect(0,0,box.w,box.h);
    g.globalCompositeOperation=light?'source-over':'lighter';g.lineCap='round';
    const keep=[];
    for(const e of sparks){
      e.age+=dt;if(e.age<0){keep.push(e);continue;}   // not out yet
      e.T-=dt/e.life;if(e.T<=0||e.y<-20)continue;
      // after the outward push, each settles into its own rise, lean and wobble (and maybe a brief curl)
      const wob=Math.sin(e.y*e.wf+t*e.ws+e.seed)*e.wa+Math.sin(t*e.ws*1.7+e.seed*3)*e.wa*.4;
      let tx=e.lean+wob,ty=-(e.rise*(.4+.6*e.T)+15);
      if(e.sw){const u=(e.age-e.sw.at)/e.sw.dur;if(u>0&&u<1){const env=Math.sin(Math.PI*u),th=e.sw.rate*(e.age-e.sw.at)+e.sw.ph;tx+=Math.cos(th)*e.sw.amp*env;ty+=Math.sin(th)*e.sw.amp*env;}}
      const k=1-Math.exp(-dt*(e.age<.35?e.push:e.drag));e.vx+=(tx-e.vx)*k;e.vy+=(ty-e.vy)*k;e.x+=e.vx*dt;e.y+=e.vy*dt;
      const fl=.72+.28*(.5+.5*Math.sin(t*e.f1+e.seed))*(.5+.5*Math.sin(t*e.f2+e.seed*2));
      const a=Math.min(1,e.age*8)*Math.min(1,e.T/.3)*fl;
      if(a>.01)drawEmber(g,e,a,light?.6:1,light?.45:0);   // on a light page they start orange, or they'd vanish
      keep.push(e);
    }
    sparks=keep;
    raf=sparks.length?requestAnimationFrame(step):0;
    if(!raf)g.clearRect(0,0,box.w,box.h);
  }
  form.addEventListener('change',e=>{
    const i=radios.indexOf(e.target);if(i<0)return;
    clearTimeout(wakeTimer);buy.classList.remove('wake');
    const ticks=[...el.querySelectorAll('.tick')];if(!ticks[i])return;
    place();
    // where the pill lands: centred on the chosen notch
    const tr=ticks[i].getBoundingClientRect(),hr=el.querySelector('.handle').getBoundingClientRect();
    spark(tr.left+tr.width/2+scrollX-box.left,hr.top+hr.height/2+scrollY-box.top,hr.width,hr.height);
    // then the button wakes
    wakeTimer=setTimeout(()=>{buy.classList.remove('wake');void buy.offsetWidth;buy.classList.add('wake');setTimeout(()=>buy.classList.remove('wake'),900);},260);
  });
  addEventListener('resize',()=>{if(raf)place();});
}

/* ---------------- shirt framing ---------------- */
// The canvas sits inside the stage and scrolls with the page; it is framed once per resize.
// The shirt itself (collar to hem) sets the framing, as large as fits: desktop, from just under
// the header down to the hint above the banner's divider; phones, the stage above the text.
// The banner clips everything below its divider, so the shadow may be cut there.
// Measured at rest in ORB's square framing box S: collar .149·S, hem .917·S, width about .62·S.
const COLLAR=.149,HEM=.917,WIDE=.66,GAP_TOP=16,GAP_BOTTOM=64;
const banner=stage.closest('.banner'),header=document.querySelector('.top');
const isPhone=()=>matchMedia('(max-width:899px) and (orientation:portrait),(max-width:899px) and (min-height:501px)').matches;   // stacked layout (tablets, upright phones); sideways phones go side by side
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
