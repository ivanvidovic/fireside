// Meetups banner sky. One sky with a time of day: 0 = day, 1 = night. The theme toggle walks it through dusk or
// dawn (about 2.5 s); the banner's text colours follow the sky, so they stay readable the whole way.
// Night is the real sky over Portland looking north, right now: catalogue stars, the Milky Way along its real path,
// the Moon at its real place and phase, the planets, and shooting stars that follow the real meteor showers.
// A fire just below the frame (bottom centre) sends up embers. Day: blue sky, two layers of drifting cloud.
// The cursor moves the air like JM Joints' snow (a push plus a wake of alternating swirls): embers ride it,
// and it drags and curls the near cloud, which settles back afterwards. Scrolling gives depth: stars far, fire near.
import {DEG,LAT,lst,horiz,moon,sun,planets,showers,bvRGB} from './astro.js';

const root=document.documentElement;
const sky=document.querySelector('.sky');
const show=document.querySelector('.show'),strip=document.querySelector('.strip');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const small=()=>innerWidth<600;
const rnd=(a,b)=>a+Math.random()*(b-a);
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=(a,b,x)=>{const t=clamp((x-a)/(b-a),0,1);return t*t*(3-2*t);};
const ease=x=>x*x*(3-2*x);
const isDark=()=>root.dataset.scheme!=='light';

const glCanvas=sky.querySelector('.sky-gl'),fx=sky.querySelector('.sky-fx'),g=fx.getContext('2d');
// a few embers fly in front of the banner text: their own canvas, over the sky's area, above the text (clicks pass through)
const fxF=document.createElement('canvas');fxF.className='sky-front';fxF.setAttribute('aria-hidden','true');sky.after(fxF);
const gF=fxF.getContext('2d');
let W=0,H=0,dpr=1,t=0,K=10;               // K: pixels per degree of sky
let tod=isDark()?1:0,target=tod;
const PAR={stars:.8,fire:.15,far:.6,near:.35,front:-.35};   // front: the embers before the text outrun the page   // how much each layer lags the page when scrolling (1 = fixed in place)
let scrolled=0;

/* ---------------- size ---------------- */
function size(){
  const h=strip.offsetTop+strip.offsetHeight;
  sky.style.height=h+'px';
  W=sky.clientWidth;H=h;dpr=Math.min(2,devicePixelRatio||1);
  K=H/68;                                   // the horizon sits at the bottom; about 68° of sky above it
  // Setting a canvas's size wipes it (the sky canvas is opaque, so it would show black), so sizes are only set when
  // they change, and the sky is redrawn straight away, before the browser shows the wiped canvas.
  const s=small()?.4:.6,fw=Math.round(W*dpr),fh=Math.round(H*dpr),gw=Math.max(1,Math.round(W*s)),gh=Math.max(1,Math.round(H*s));
  let wiped=false;
  if(fx.width!==fw||fx.height!==fh){fx.width=fxF.width=fw;fx.height=fxF.height=fh;wiped=true;}
  fxF.style.height=h+'px';
  if(glCanvas.width!==gw||glCanvas.height!==gh){glCanvas.width=gw;glCanvas.height=gh;wiped=true;}
  if(gl){gl.viewport(0,0,glCanvas.width,glCanvas.height);fluidSize();}
  place(true);dirty=true;
  if(wiped&&started)redraw();else wake();
}

/* ---------------- the real sky: catalogue stars, planets, moon ---------------- */
// Stars to magnitude 7.5 (HYG database, CC BY-SA 4.0; see assets/sky/README.txt). Naked-eye stars (to 6) are drawn
// one by one, shimmering; the fainter dust of stars is drawn to its own layer whenever the sky has turned a little.
let catalog=null,faintCat=[],starPts=[],planetPts=[],moonPt=null,L=0,lastPlace=0;
const faintLayer=document.createElement('canvas'),fg=faintLayer.getContext('2d');
fetch(new URL('../assets/sky/stars.json',import.meta.url)).then(r=>r.json()).then(a=>{
  const cat=[],faint=[];
  for(let i=0;i+4<=a.length;i+=4){   // flat: RA×100, Dec×100 (degrees), magnitude×100, B−V×100
    const ra=a[i]/100*DEG,dec=a[i+1]/100*DEG,mag=a[i+2]/100,bv=a[i+3]/100;
    if(mag<=6)cat.push({ra,dec,mag,rgb:bvRGB(bv),ph:Math.random()*6.3,f1:rnd(.6,1.8),f2:rnd(2,4.5)});else faint.push({ra,dec,mag,rgb:bvRGB(bv)});
  }
  catalog=cat;faintCat=faint;place(true);dirty=true;wake();
}).catch(()=>{});
const toScreen=(alt,az)=>{let a=az;if(a>Math.PI)a-=2*Math.PI;return [W/2+a/DEG*K,H-alt/DEG*K];};
function place(force){
  const now=Date.now();if(!force&&now-lastPlace<2000)return;lastPlace=now;L=lst(now);
  starPts=[];
  if(catalog)for(const s of catalog){
    const [alt,az]=horiz(s.ra,s.dec,L);if(alt<-.01)continue;
    const [x,y]=toScreen(alt,az);if(x<-10||x>W+10||y<-10)continue;
    // near the horizon, starlight passes through more air: dimmer, and it twinkles harder
    starPts.push({x,y,s,ext:smooth(0,12,alt/DEG)});
  }
  // the faint dust of stars: tiny, dim, drawn once per turn of the sky
  faintLayer.width=fx.width;faintLayer.height=fx.height;fg.setTransform(dpr,0,0,dpr,0,0);
  const px=1/dpr;
  for(const s of faintCat){
    const [alt,az]=horiz(s.ra,s.dec,L);if(alt<.02)continue;
    const [x,y]=toScreen(alt,az);if(x<0||x>W||y<0)continue;
    const a=(.34-(s.mag-6)*.14)*smooth(0,15,alt/DEG);if(a<=.02)continue;
    fg.fillStyle=`rgba(${s.rgb[0]},${s.rgb[1]},${s.rgb[2]},${a.toFixed(3)})`;fg.fillRect(x,y,px*1.4,px*1.4);
  }
  planetPts=planets(now).map(p=>{const [alt,az]=horiz(p.ra,p.dec,L);return alt>0?{xy:toScreen(alt,az),p}:null;}).filter(Boolean);
  const m=moon(now);let [alt,az]=horiz(m.ra,m.dec,L);alt-=.95*DEG*Math.cos(alt);   // the Moon is close: parallax lowers it ~1°
  const sn=sun(now),[sAlt,sAz]=horiz(sn.ra,sn.dec,L);
  // which way its lit side faces on screen: toward the Sun along the sky
  const dir=(a1,z1,a2,z2)=>{const p=toScreen(a1,z1),q=toScreen(a1+(a2-a1)*.01,z1+(((z2-z1+3*Math.PI)%(2*Math.PI))-Math.PI)*.01);return Math.atan2(q[1]-p[1],q[0]-p[0]);};
  moonPt={xy:toScreen(alt,az),alt,illum:m.illum,lit:dir(alt,az,sAlt,sAz),up:alt>-.01};
  moonLight=moonPt.up?m.illum*clamp(Math.sin(alt)*2,0,1):0;   // moonlight fills the whole sky, in view or not
}
let moonLight=0;
// How bright the sky is behind the stars: full daylight 1, a dark night 0, plus moonlight (more near the Moon).
// A star shows when it's brighter than that: the faintest visible magnitude follows the sky continuously,
// so at dusk the brightest appear first and every star keeps brightening as the sky darkens.
function skyB(x,y){
  let B=Math.pow(1-ease(tod),3)+moonLight*.00008;
  if(moonPt&&moonPt.up){const d=Math.hypot(x-moonPt.xy[0],y-moonPt.xy[1]);B+=moonLight*.004*Math.exp(-d/(Math.max(5,.26*K*3)*8));}
  return B;
}
const limMag=B=>6.4-2.5*Math.log10(1+B*14500);
function drawStars(dt){
  if(ease(tod)<.3)return;
  const off=scrolled*PAR.stars,lim0=limMag(skyB(-1e5,-1e5)),night=smooth(.3,.6,ease(tod));
  g.save();g.translate(0,off);
  // the faint ones only show on a properly dark sky
  const fa=smooth(5.2,6.6,lim0);if(fa>0){g.globalAlpha=fa;g.drawImage(faintLayer,0,0,W,H);g.globalAlpha=1;}
  for(const p of starPts){
    const s=p.s;
    // fainter stars need a darker sky: they come out last at dusk and fade first in moonlight
    const mag=s.mag+(1-p.ext)*1.2,lim=moonPt&&moonPt.up?limMag(skyB(p.x,p.y)):lim0;   // low stars dim through more air
    if(mag>lim)continue;
    let a=Math.pow(clamp((lim-mag)/2.4,0,1),1.15)*clamp(1.3-s.mag*.15,.24,1);
    if(a<.02)continue;
    // every star shimmers a little; low ones more
    const tw=reduced?1:1+(.09+.22*(1-p.ext))*Math.sin(t*s.f2+s.ph)+.05*Math.sin(t*s.f1*2.3+s.ph*2);
    a=clamp(a*tw,0,1);
    const r=Math.max(.45,1.75-s.mag*.24),[cr,cg,cb]=s.rgb;
    g.fillStyle=`rgba(${cr},${cg},${cb},${a.toFixed(3)})`;
    if(r<.9)g.fillRect(p.x-r,p.y-r,r*2,r*2);else{g.beginPath();g.arc(p.x,p.y,r,0,6.283);g.fill();}
  }
  for(const q of planetPts){   // planets: steady points of light, star-sized
    const r=Math.max(.9,1.9-q.p.mag*.22),a=Math.min(1,.85+(-q.p.mag)*.05)*clamp((lim0-q.p.mag)/2.4,0,1);if(a<=0)continue;
    g.fillStyle=`rgba(${q.p.rgb[0]},${q.p.rgb[1]},${q.p.rgb[2]},${a.toFixed(3)})`;g.beginPath();g.arc(q.xy[0],q.xy[1],r,0,6.283);g.fill();
  }
  if(moonPt&&moonPt.up)drawMoon(smooth(.35,.75,ease(tod)));
  g.restore();
}
function drawMoon(night){
  // drawn at about 3× its true size so the phase reads
  const [x,y]=moonPt.xy,R=Math.max(5,.26*K*3),k=moonPt.illum,a=night;
  if(x<-R||x>W+R||y<-R)return;
  g.save();g.translate(x,y);g.rotate(moonPt.lit);
  g.fillStyle=`rgba(150,160,185,${(.12*a).toFixed(3)})`;g.beginPath();g.arc(0,0,R,0,6.283);g.fill();   // earthshine
  // lit part: the half facing the Sun, closed by the terminator (an ellipse)
  g.fillStyle=`rgba(246,242,228,${a.toFixed(3)})`;g.beginPath();
  g.arc(0,0,R,-Math.PI/2,Math.PI/2,false);
  g.ellipse(0,0,Math.abs(1-2*k)*R,R,0,Math.PI/2,-Math.PI/2,k<.5);
  g.fill();g.restore();
}

/* ---------------- shooting stars ---------------- */
const meteors=[];let nextMeteor=rnd(8,30);
function launch(x,y,ang,speed,len,bright){
  if(meteors.length>=5)return;
  meteors.push({x,y,vx:Math.cos(ang)*speed,vy:Math.sin(ang)*speed,len,bright,age:0,life:rnd(.45,1.1),flare:Math.random()<.3?rnd(.3,.7):-1,trail:[]});
}
function randomLaunch(x,y){   // a click or tap: any direction, but heading away from the nearest edge
  const ex=x<W/2?1:-1,ey=y<H/2?.6:-.6;let ang=Math.atan2(ey+rnd(-.9,.9),ex*rnd(.3,1.2));
  launch(x,y-scrolled*PAR.stars,ang,rnd(420,1300),rnd(50,260),rnd(.6,1));
}
function stepMeteors(dt){
  const night=smooth(.7,1,ease(tod));
  if(night>.5&&!reduced&&starPts.length){
    nextMeteor-=dt;
    if(nextMeteor<=0){
      // the background rate, plus the active showers; shower meteors fly away from their real radiant
      const act=showers(Date.now()).map(s=>{const [alt,az]=horiz(s.ra,s.dec,L);return {...s,alt,az};}).filter(s=>s.alt>0);
      const boost=act.reduce((n,s)=>n+s.rate*Math.sin(s.alt),0);
      nextMeteor=rnd(18,55)/(1+Math.min(5,boost/25));
      const pick=act.length&&Math.random()<boost/(boost+12)?act[Math.floor(Math.random()*act.length)]:null;
      const x=rnd(W*.1,W*.9),y=rnd(H*.08,H*.55);let ang;
      if(pick){const [rx,ry]=toScreen(pick.alt,pick.az);ang=Math.atan2(y-ry,x-rx);}else ang=rnd(.15,.9)*Math.PI*(Math.random()<.5?1:-1)+(Math.random()<.5?0:Math.PI);
      launch(x,y,ang,rnd(500,1100),rnd(60,220)*(Math.random()<.1?1.8:1),rnd(.5,1));
    }
  }
  g.save();g.translate(0,scrolled*PAR.stars);g.lineCap='round';
  for(let i=meteors.length-1;i>=0;i--){
    const m=meteors[i];m.age+=dt;const a=m.age/m.life;
    if(a>=1.6){meteors.splice(i,1);continue;}
    if(a<1){m.x+=m.vx*dt;m.y+=m.vy*dt;m.trail.push([m.x,m.y,m.age]);}
    const sp=Math.hypot(m.vx,m.vy),ux=m.vx/sp,uy=m.vy/sp;
    let b=a<1?Math.sin(Math.PI*a)*m.bright:0;if(m.flare>0&&Math.abs(a-m.flare)<.08)b=Math.min(1,b*1.8);
    b*=night;
    // the glowing train it leaves behind, fading over about a second
    for(let j=1;j<m.trail.length;j++){const [x0,y0,t0]=m.trail[j-1],[x1,y1]=m.trail[j],f=Math.max(0,1-(m.age-t0)/1.1)*.18*m.bright*night;
      if(f<.01)continue;g.strokeStyle=`rgba(190,210,255,${f.toFixed(3)})`;g.lineWidth=.8;g.beginPath();g.moveTo(x0,y0);g.lineTo(x1,y1);g.stroke();}
    if(b<.01)continue;
    const tail=m.len*Math.min(1,a*3),grd=g.createLinearGradient(m.x-ux*tail,m.y-uy*tail,m.x,m.y);
    grd.addColorStop(0,'rgba(180,204,239,0)');grd.addColorStop(.75,`rgba(205,222,250,${(b*.35).toFixed(3)})`);grd.addColorStop(1,`rgba(248,250,255,${b.toFixed(3)})`);
    g.strokeStyle=grd;g.lineWidth=1.4;g.beginPath();g.moveTo(m.x-ux*tail,m.y-uy*tail);g.lineTo(m.x,m.y);g.stroke();
    g.fillStyle=`rgba(255,255,255,${(b*.5).toFixed(3)})`;g.beginPath();g.arc(m.x,m.y,1.6,0,6.283);g.fill();
  }
  g.restore();
}
show.addEventListener('click',e=>{
  if(e.target.closest('a,button')||tod<.7||reduced)return;
  const r=sky.getBoundingClientRect();randomLaunch(e.clientX-r.left,e.clientY-r.top);wake();
});

/* ---------------- air: the cursor pushes it and sheds swirls (ported from JM Joints' snow) ---------------- */
const ptr={x:-999,y:-999,vx:0,vy:0,t:0,trail:0,flip:1};
const eddies=[];
let skyRect={left:0,top:0};
function moveThrough(x,y){
  const now=performance.now(),dt=Math.max(8,now-ptr.t)/1000;
  if(ptr.t&&now-ptr.t<120){
    const vx=(x-ptr.x)/dt,vy=(y-ptr.y)/dt;
    ptr.vx=ptr.vx*.4+vx*.6;ptr.vy=ptr.vy*.4+vy*.6;
    const sp=Math.hypot(ptr.vx,ptr.vy);ptr.trail+=Math.hypot(x-ptr.x,y-ptr.y);
    if(sp>70&&ptr.trail>55){
      ptr.trail=0;ptr.flip=-ptr.flip;
      const rc=rnd(60,110),nx=-ptr.vy/sp,ny=ptr.vx/sp,side=ptr.flip*rc*rnd(.3,.6);
      eddies.push({x:x+nx*side,y:y+ny*side,g:ptr.flip*Math.min(sp,2400)*rc*rnd(1.6,2.4),rc,age:0,life:rnd(1.3,1.9)});
      if(eddies.length>32)eddies.shift();
    }
  }
  ptr.x=x;ptr.y=y;ptr.t=now;wake();
}
addEventListener('pointermove',e=>{
  if(e.pointerType!=='mouse'){ptr.t=0;return;}            // touch scrolls; it doesn't stir the air
  moveThrough(e.clientX-skyRect.left,e.clientY-skyRect.top);
},{passive:true});
function vortex(v,x,y,out){   // Lamb-Oseen vortex with a soft outer edge, swelling then dying away
  const dx=x-v.x,dy=y-v.y,r2=dx*dx+dy*dy,reach=v.rc*3.2;if(r2>reach*reach)return;
  const a=v.age/v.life,fade=Math.min(1,a*5)*(1-a)*(1-a),c2=v.rc*v.rc,edge=1-r2/(reach*reach),soft=edge*edge;
  const k=soft*(v.g*fade/(2*Math.PI))*(1-Math.exp(-r2/c2))/Math.max(r2,1);
  out[0]+=-dy*k;out[1]+=dx*k;
}
const A=[0,0];
// the banner's slides: when one slides to the next, its moving edge pushes the air like a hand
const slidesEl=show.querySelector('.slides'),edge={x:0,vx:0,tx:null,trail:0,flip:1,on:false};
function stepEdge(dt){
  const m=new DOMMatrixReadOnly(getComputedStyle(slidesEl).transform),tx=m.m41,w=show.clientWidth||1;
  if(edge.tx===null){edge.tx=tx;return;}
  const d=tx-edge.tx;edge.tx=tx;
  edge.vx=dt>0?d/dt:0;edge.on=Math.abs(edge.vx)>30;
  if(!edge.on)return;
  edge.x=((tx%w)+w)%w;edge.trail+=Math.abs(d);
  if(edge.trail>60&&Math.abs(edge.vx)>200){   // its wake: swirls shed along the edge
    edge.trail=0;
    for(let k=0;k<2;k++){edge.flip=-edge.flip;const rc=rnd(70,120);
      eddies.push({x:edge.x-Math.sign(edge.vx)*rc*rnd(.3,.7),y:rnd(H*.1,H*.95),g:edge.flip*Math.min(Math.abs(edge.vx),2400)*rc*rnd(1.4,2),rc,age:0,life:rnd(1.2,1.8)});}
    while(eddies.length>32)eddies.shift();
  }
}
function air(x,y){   // screen coordinates (relative to the sky)
  A[0]=0;A[1]=0;
  for(const v of eddies)vortex(v,x,y,A);
  if(edge.on){const dx=Math.abs(x-edge.x),R=170;if(dx<R){const f=1-dx/R;A[0]+=edge.vx*f*f*f*.7;}}
  const dx=x-ptr.x,dy=y-ptr.y,d2=dx*dx+dy*dy,R=280;
  if(d2<R*R){const f=1-d2/(R*R),w=f*f*f;A[0]+=ptr.vx*w*.8;A[1]+=ptr.vy*w*.8;}
  return A;
}

/* ---------------- the fire: embers, with the odd burst, swirl and breeze ---------------- */
let embers=[],spawnAcc=0,glowBoost=0,nextBurst=rnd(12,40),breeze=0,breezeTo=0,nextBreeze=rnd(20,50),breezeHold=0;
const glowSprite=(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),r=x.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'rgba(255,190,110,.9)');r.addColorStop(.25,'rgba(255,120,40,.35)');r.addColorStop(1,'rgba(255,80,20,0)');x.fillStyle=r;x.fillRect(0,0,64,64);return c;})();
function heat(T){   // white-yellow when fresh, through orange and deep red as it cools
  const k=[[1,[255,244,214]],[.75,[255,196,96]],[.5,[255,128,40]],[.25,[214,62,18]],[0,[110,18,8]]];
  for(let i=0;i<k.length-1;i++){const [t0,c0]=k[i],[t1,c1]=k[i+1];if(T>=t1){const f=(T-t1)/(t0-t1);return c1.map((v,j)=>Math.round(v+(c0[j]-v)*f));}}
  return k[k.length-1][1];
}
function newEmber(burst){
  const hero=Math.random()<.07,s=hero?rnd(2,3.2):Math.pow(Math.random(),1.6)*1.8+.6,life=rnd(3.2,7.5)*(hero?.85:1);
  const e={x:W/2+(Math.random()+Math.random()+Math.random()-1.5)*W*(burst?.24:.16),y:H+rnd(4,30),vx:rnd(-12,12)*(burst?3:1),vy:burst?rnd(-280,-160):rnd(-80,-40),
    T:1,life,age:0,size:s,hero,lift:rnd(.7,1.3)*(hero?1.35:1)*(burst?1.25:1),
    drag:rnd(1.4,3)/(.6+s*.35),seed:Math.random()*100,f1:rnd(6,14),f2:rnd(2,5),front:Math.random()<1/8};
  if(e.front)e.size*=1.5;   // closer: a little bigger (and softer, when drawn)
  // now and then one gets caught in a little eddy and spirals for a moment before rejoining the rise
  if(Math.random()<.08)e.sw={at:rnd(.4,life*.5),dur:rnd(.5,1.2),rate:rnd(5,9)*(Math.random()<.5?-1:1),amp:rnd(45,90),ph:Math.random()*6.3};
  return e;
}
// where the banner and strip text sit, in the sky's coordinates (for the front embers to fade over)
let textEls=[],textAt=-1e9;
function textRects(){
  // the slides are built after this file runs, so the list is gathered as it goes (once a second)
  if(performance.now()-textAt>1000){textAt=performance.now();textEls=[...document.querySelectorAll('.show h1,.show .title,.show .tagline,.show .label,.show .ev-line,.show .cta,.show .ds,.strip .strip-bar,.strip .db')];}
  const out=[];
  for(const el of textEls){const r=el.getBoundingClientRect();if(r.width&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth)
    out.push([r.left-skyRect.left,r.top-skyRect.top,r.right-skyRect.left,r.bottom-skyRect.top]);}
  return out;
}
function overText(rects,x,y){   // 1 inside any text box, easing to 0 within 24px of it
  let m=0;for(const [l,tp,rt,b] of rects){const dx=Math.max(l-x,0,x-rt),dy=Math.max(tp-y,0,y-b);m=Math.max(m,1-smooth(0,24,Math.hypot(dx,dy)));if(m>=1)break;}
  return m;
}
function stepEmbers(dt){
  const night=smooth(.65,1,ease(tod));
  if(!reduced&&night>.3){
    // someone tends the fire: the glow swells and a burst goes up
    nextBurst-=dt;if(nextBurst<=0){nextBurst=rnd(20,60);glowBoost=1;const n=Math.round(rnd(25,40)*(small()?.5:1));for(let i=0;i<n;i++)embers.push(newEmber(true));}
    // the odd gentle breeze leans the whole column for a few seconds
    nextBreeze-=dt;if(nextBreeze<=0){if(breezeTo===0){breezeTo=rnd(25,45)*(Math.random()<.5?-1:1);nextBreeze=rnd(3,5);}else{breezeTo=0;nextBreeze=rnd(25,70);}}
  }
  glowBoost*=Math.exp(-dt/1.4);breeze+=(breezeTo-breeze)*(1-Math.exp(-dt/1.2));
  const want=(small()?40:85)*night;
  if(!reduced&&want>1){spawnAcc+=dt*want/5;while(spawnAcc>=1){spawnAcc--;embers.push(newEmber(false));}}
  // scrolling: the embers behind lag the page (further away); the ones in front outrun it (closer)
  const off=scrolled*PAR.fire,offF=scrolled*PAR.front,keep=[];
  for(const e of embers){
    e.age+=dt;e.T-=dt/e.life;if(e.T<=0||e.y+(e.front?offF:0)<-40)continue;
    const a=air(e.x,e.y+(e.front?offF:off)),carry=1.45-e.size*.22;
    const turb=Math.sin(e.y*.012+t*1.3+e.seed)*26+Math.sin(e.y*.031-t*2.1+e.seed*3)*11+Math.sin(t*.7+e.seed*.5)*8;
    let tx=a[0]*carry+turb+breeze*(1.2-e.size*.2),ty=a[1]*carry-(35+120*e.T)*e.lift;
    if(e.sw){const u=(e.age-e.sw.at)/e.sw.dur;if(u>0&&u<1){const env=Math.sin(Math.PI*u),th=e.sw.rate*(e.age-e.sw.at)+e.sw.ph;tx+=Math.cos(th)*e.sw.amp*env;ty+=Math.sin(th)*e.sw.amp*env;}}
    const k=1-Math.exp(-dt*(e.sw&&e.age>e.sw.at&&e.age<e.sw.at+e.sw.dur?e.drag*2.2:e.drag));e.vx+=(tx-e.vx)*k;e.vy+=(ty-e.vy)*k;
    e.x+=e.vx*dt;e.y+=e.vy*dt;keep.push(e);
  }
  embers=keep;
  const text=night>.01&&embers.some(e=>e.front)?textRects():[];
  for(const [c,o] of [[g,off],[gF,offF]]){c.save();c.translate(0,o);c.globalCompositeOperation='lighter';c.lineCap='round';}
  for(const e of embers){
    const c=e.front?gF:g,o=e.front?offF:off;
    const fl=.72+.28*(.5+.5*Math.sin(t*e.f1+e.seed))*(.5+.5*Math.sin(t*e.f2+e.seed*2));
    let alpha=Math.min(1,e.age*3)*smooth(0,.22,e.T)*fl*night;
    if(e.front&&alpha>=.01)alpha*=1-.7*overText(text,e.x,e.y+o);   // fades where it crosses the text, so it stays readable
    if(alpha<.01)continue;
    const [r,gg,b]=heat(e.T),sp=Math.hypot(e.vx,e.vy),len=Math.min(22,sp*.035);
    c.strokeStyle=c.fillStyle=`rgba(${r},${gg},${b},${(e.front?alpha*.85:alpha).toFixed(3)})`;
    if(len>1.2){c.lineWidth=e.size;c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x-e.vx/sp*len,e.y-e.vy/sp*len);c.stroke();}
    else{c.beginPath();c.arc(e.x,e.y,e.size*.6,0,6.283);c.fill();}
    if(e.front||e.hero||e.T>.8){const gs=e.size*(e.hero?7:e.front?6:4.5);c.globalAlpha=alpha*(e.hero?.55:e.front?.4:.25)*(e.front?1:e.T);c.drawImage(glowSprite,e.x-gs,e.y-gs,gs*2,gs*2);c.globalAlpha=1;}
  }
  g.restore();gF.restore();
}

/* ---------------- the near clouds' motion: a real fluid ---------------- */
// The air over the near clouds is simulated on the GPU (incompressible: advect, then remove divergence with a
// pressure solve). Fast cursor movement pushes it; the air then flows around and away from the push on its own.
// The cloud is material carried by that air: a map records where each bit of cloud came from, so the full-detail
// clouds are drawn moved, stretched where the flow pulls them apart (and thinner there), and they ease back to
// their natural shape once the air is calm. A slide change is a slight breeze. No forced swirls.
let FL=null;   // fluid state (null: no float render targets on this device; clouds stay still)
const SIM_PX=24,MAP_PX=6;   // coarse air: the cursor moves the cloud in broad, chunky masses, never fine curls
// Eased limits, so continuous scrubbing never turns the cloud liquid or streaky (all tunable):
const AIR_MAX=260,      // 1. px/s: the air's speed eases toward this ceiling
      PUSH_FADE=.7,     // 2. how much a push weakens where the air is already moving (0 none, 1 fully)
      TRAVEL_MAX=350,    // 3. px: how far any part of the cloud can be carried, eased
      STRETCH_MIN=.4,   //    and how far it can be pulled thin
      PUSH_R=.035,PUSH_K=.15;
const SLIDE_K=7,SLIDE_DELAY=.08,SLIDE_LEN=3.8;
// the carousel speeding back to the first slide: a steadier, stronger wind that carries the clouds further
const GUST_K=2*SLIDE_K,GUST_HOLD=.7,GUST_LEN=5,GUST_TRAVEL=700;   // push, full-strength time (s), settle (s), travel limit (px)
let travelMax=TRAVEL_MAX;   // slide change: breeze strength, its delay, and how long it lasts (s)   // the push: its breadth, and its strength
function fluidInit(){
  const ext=gl.getExtension('OES_texture_half_float'),lin=gl.getExtension('OES_texture_half_float_linear');
  if(!ext||!lin)return;
  const HF=ext.HALF_FLOAT_OES;
  const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){console.error(gl.getShaderInfoLog(s));return null;}return s;};
  const VS='attribute vec2 a;varying vec2 vUv;void main(){vUv=a*.5+.5;gl_Position=vec4(a,0.,1.);}';
  const mk=(fs,names)=>{const v=sh(gl.VERTEX_SHADER,VS),f=sh(gl.FRAGMENT_SHADER,'precision highp float;varying vec2 vUv;'+fs);if(!v||!f)return null;
    const p=gl.createProgram();gl.attachShader(p,v);gl.attachShader(p,f);gl.linkProgram(p);
    if(!gl.getProgramParameter(p,gl.LINK_STATUS))return null;const u={};for(const n of names)u[n]=gl.getUniformLocation(p,n);return {p,u,a:gl.getAttribLocation(p,'a')};};
  const P={
    // carry a field along the velocity (semi-Lagrangian), with dissipation
    advect:mk(`uniform sampler2D uVel,uSrc;uniform vec2 uTexel;uniform float uDt,uDiss;
      void main(){vec2 v=texture2D(uVel,vUv).xy;gl_FragColor=texture2D(uSrc,vUv-v*uDt*uTexel)*uDiss;}`,['uVel','uSrc','uTexel','uDt','uDiss']),
    // add a soft push of air around a point
    splat:mk(`uniform sampler2D uSrc;uniform vec2 uPt,uForce,uAspect;uniform float uR,uVmax,uFade;
      void main(){vec2 d=(vUv-uPt)*uAspect;float w=exp(-dot(d,d)/uR);vec2 cur=texture2D(uSrc,vUv).xy;
        w*=1.-uFade*smoothstep(0.,uVmax,length(cur));   // already-moving air takes less of the push
        gl_FragColor=vec4(cur+uForce*w,0.,1.);}`,['uSrc','uPt','uForce','uAspect','uR','uVmax','uFade']),
    div:mk(`uniform sampler2D uVel;uniform vec2 uTexel;
      void main(){float l=texture2D(uVel,vUv-vec2(uTexel.x,0.)).x,r=texture2D(uVel,vUv+vec2(uTexel.x,0.)).x,
        b=texture2D(uVel,vUv-vec2(0.,uTexel.y)).y,t=texture2D(uVel,vUv+vec2(0.,uTexel.y)).y;gl_FragColor=vec4(.5*(r-l+t-b),0.,0.,1.);}`,['uVel','uTexel']),
    jacobi:mk(`uniform sampler2D uP,uDiv;uniform vec2 uTexel;
      void main(){float l=texture2D(uP,vUv-vec2(uTexel.x,0.)).x,r=texture2D(uP,vUv+vec2(uTexel.x,0.)).x,
        b=texture2D(uP,vUv-vec2(0.,uTexel.y)).x,t=texture2D(uP,vUv+vec2(0.,uTexel.y)).x,d=texture2D(uDiv,vUv).x;gl_FragColor=vec4((l+r+b+t-d)*.25,0.,0.,1.);}`,['uP','uDiv','uTexel']),
    grad:mk(`uniform sampler2D uP,uVel;uniform vec2 uTexel;uniform float uVmax;
      void main(){float l=texture2D(uP,vUv-vec2(uTexel.x,0.)).x,r=texture2D(uP,vUv+vec2(uTexel.x,0.)).x,
        b=texture2D(uP,vUv-vec2(0.,uTexel.y)).x,t=texture2D(uP,vUv+vec2(0.,uTexel.y)).x;
        vec2 v=texture2D(uVel,vUv).xy-.5*vec2(r-l,t-b);float s=length(v);
        if(s>1e-4){float x=min(2.*s/uVmax,20.);v*=uVmax*((exp(x)-1.)/(exp(x)+1.))/s;}   // eased ceiling on the air's speed
        gl_FragColor=vec4(v,0.,1.);}`,['uP','uVel','uTexel','uVmax']),
    // the cloud map: how far each bit of cloud has been carried from where it belongs (in pixels).
    // It travels with the clouds' own drift, grows with the flow, and relaxes back toward zero.
    map:mk(`uniform sampler2D uVel,uMap;uniform vec2 uMapTexel,uVelScale;uniform float uDt,uRelax,uDrift,uMax;
      void main(){vec2 v=texture2D(uVel,vUv).xy;vec2 vp=v*uVelScale;   // cells/s → px/s
        vec2 back=vUv-(vp+vec2(uDrift,0.))*uDt*uMapTexel;
        vec2 m=texture2D(uMap,back).xy-vp*uDt;float s=length(m);
        if(s>1e-3){float x=min(2.*s/uMax,20.);m*=uMax*((exp(x)-1.)/(exp(x)+1.))/s;}   // eased limit on how far cloud is carried
        gl_FragColor=vec4(m*uRelax,0.,1.);}`,['uVel','uMap','uMapTexel','uVelScale','uDt','uRelax','uDrift','uMax']),
    scale:mk(`uniform sampler2D uSrc;uniform float uK;void main(){gl_FragColor=texture2D(uSrc,vUv)*uK;}`,['uSrc','uK']),
  };
  if(Object.values(P).some(x=>!x))return;
  const target=(w,h)=>{const t=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,t);
    gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,w,h,0,gl.RGBA,HF,null);
    for(const [k,v] of [[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR],[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE]])gl.texParameteri(gl.TEXTURE_2D,k,v);
    const f=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,f);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,t,0);
    const ok=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE;
    gl.viewport(0,0,w,h);gl.clearColor(0,0,0,1);gl.clear(gl.COLOR_BUFFER_BIT);gl.bindFramebuffer(gl.FRAMEBUFFER,null);return ok?{t,f,w,h}:null;};
  const pair=(w,h)=>{const a=target(w,h),b=target(w,h);return a&&b?{r:a,w:b,swap(){[this.r,this.w]=[this.w,this.r];}}:null;};
  FL={P,pair,target,quiet:0};
}
function fluidSize(){
  if(!FL)return;
  const sw=Math.max(8,Math.round(W/SIM_PX)),sh=Math.max(8,Math.round(H/SIM_PX)),mw=Math.max(8,Math.round(W/MAP_PX)),mh=Math.max(8,Math.round(H/MAP_PX));
  if(FL.vel&&FL.vel.r.w===sw&&FL.vel.r.h===sh&&FL.map.r.w===mw&&FL.map.r.h===mh)return;
  const old={vel:FL.vel,prs:FL.prs,div:FL.div,map:FL.map};
  FL.vel=FL.pair(sw,sh);FL.prs=FL.pair(sw,sh);FL.div=FL.target(sw,sh);FL.map=FL.pair(mw,mh);
  if(!FL.vel||!FL.prs||!FL.div||!FL.map){FL=null;return;}
  // carry the moving air and the moved cloud over to the new size, so a resize doesn't snap the clouds back
  const copy=(from,to)=>{if(from)pass(FL.P.scale,to.r,b=>{b('uSrc',from.r);gl.uniform1f(FL.P.scale.u.uK,1);});};
  copy(old.vel,FL.vel);copy(old.map,FL.map);
  // and free the old buffers
  const free=x=>{if(x){gl.deleteTexture(x.t);gl.deleteFramebuffer(x.f);}};
  for(const k of ['vel','prs','map'])if(old[k]){free(old[k].r);free(old[k].w);}
  free(old.div);
}
function pass(prog,dst,set){
  gl.useProgram(prog.p);gl.bindFramebuffer(gl.FRAMEBUFFER,dst.f);gl.viewport(0,0,dst.w,dst.h);
  gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(prog.a);gl.vertexAttribPointer(prog.a,2,gl.FLOAT,false,0,0);
  let unit=0;set((name,tex)=>{gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tex.t);gl.uniform1i(prog.u[name],unit++);});
  gl.drawArrays(gl.TRIANGLES,0,3);
}
let lastEdgeOn=false,energy=0,slideBreeze=null;
function stepClouds(dt){
  if(!FL||!FL.vel||tod>.9)return;
  const {P,vel,prs,div,map}=FL,sw=vel.r.w,sh=vel.r.h,off=scrolled*PAR.near,texel=[1/sw,1/sh];
  const forces=[];
  // the cursor's gust: only fast movement, in its direction (cells/s), centred where it is on the near layer
  const sp=Math.hypot(ptr.vx,ptr.vy);
  if(sp>320&&ptr.x>-500){const k=(sp-320)/sp/SIM_PX*PUSH_K;forces.push([ptr.x/W,1-(ptr.y-off)/H,ptr.vx*k,-ptr.vy*k,PUSH_R]);}
  // a slide change: a little after it starts, a soft breeze builds across the sky in its direction and slowly
  // dies away (about 2.5 s), so the clouds drift a short way, unhurried, then settle
  if(edge.on&&!lastEdgeOn&&!(slideBreeze&&slideBreeze.gust)){slideBreeze={dir:Math.sign(edge.vx),t:-SLIDE_DELAY};}
  lastEdgeOn=edge.on;
  if(slideBreeze&&slideBreeze.gust){
    // the rewind: full strength while the slides rush back, then a long settle
    slideBreeze.t+=dt;const t=slideBreeze.t,u=(t-GUST_HOLD)/GUST_LEN;
    if(u>=1)slideBreeze=null;else if(t>0){const env=smooth(0,.12,t)*(u>0?Math.pow(1-u,3.5):1),f=slideBreeze.dir*GUST_K*env*dt;
      for(const [x,y] of [[.25,.3],[.75,.3],[.25,.75],[.75,.75]])forces.push([x,y,f,0,.12]);}}
  else if(slideBreeze){slideBreeze.t+=dt;const u=slideBreeze.t/SLIDE_LEN;
    if(u>=1)slideBreeze=null;else if(u>0){const env=smooth(0,.035,u)*Math.pow(1-u,3.5),   // takes off at once, then a long, slow settle
      f=slideBreeze.dir*SLIDE_K*env*dt;
      for(const [x,y] of [[.25,.3],[.75,.3],[.25,.75],[.75,.75]])forces.push([x,y,f,0,.12]);}}
  // the travel limit opens up for the rewind wind and eases back after, so the clouds settle home
  travelMax+=((slideBreeze&&slideBreeze.gust?GUST_TRAVEL:TRAVEL_MAX)-travelMax)*(1-Math.exp(-dt/(slideBreeze&&slideBreeze.gust?.3:2.5)));
  if(forces.length)energy=1;else energy*=Math.exp(-dt/2.5);
  if(energy<.0005&&FL.quiet>4)return;   // fully calm and settled: nothing to simulate
  FL.quiet=forces.length?0:FL.quiet+dt;
  const aspect=[W/H,1];
  // air: carry itself, slowly calm down
  pass(P.advect,vel.w,b=>{b('uVel',vel.r);b('uSrc',vel.r);gl.uniform2f(P.advect.u.uTexel,...texel);gl.uniform1f(P.advect.u.uDt,dt);gl.uniform1f(P.advect.u.uDiss,Math.exp(-dt/.7));});vel.swap();
  for(const [x,y,fx,fy,r] of forces){pass(P.splat,vel.w,b=>{b('uSrc',vel.r);gl.uniform2f(P.splat.u.uPt,x,y);gl.uniform2f(P.splat.u.uForce,fx,fy);gl.uniform2f(P.splat.u.uAspect,...aspect);gl.uniform1f(P.splat.u.uR,r);gl.uniform1f(P.splat.u.uVmax,AIR_MAX/SIM_PX);gl.uniform1f(P.splat.u.uFade,PUSH_FADE);});vel.swap();}
  // make it incompressible: pushed air has to flow around
  pass(P.div,div,b=>{b('uVel',vel.r);gl.uniform2f(P.div.u.uTexel,...texel);});
  pass(P.scale,prs.w,b=>{b('uSrc',prs.r);gl.uniform1f(P.scale.u.uK,.8);});prs.swap();
  for(let i=0;i<20;i++){pass(P.jacobi,prs.w,b=>{b('uP',prs.r);b('uDiv',div);gl.uniform2f(P.jacobi.u.uTexel,...texel);});prs.swap();}
  pass(P.grad,vel.w,b=>{b('uP',prs.r);b('uVel',vel.r);gl.uniform2f(P.grad.u.uTexel,...texel);gl.uniform1f(P.grad.u.uVmax,AIR_MAX/SIM_PX);});vel.swap();
  // the cloud: carried by the air, drifting with itself, relaxing back to its own shape
  pass(P.map,map.w,b=>{b('uVel',vel.r);b('uMap',map.r);gl.uniform2f(P.map.u.uMapTexel,1/W,1/H);gl.uniform2f(P.map.u.uVelScale,SIM_PX,SIM_PX);
    gl.uniform1f(P.map.u.uDt,dt);gl.uniform1f(P.map.u.uRelax,Math.exp(-dt/4.5));gl.uniform1f(P.map.u.uDrift,reduced?0:-.018*380);gl.uniform1f(P.map.u.uMax,travelMax);});map.swap();
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);
}

/* ---------------- sky, Milky Way and clouds (WebGL) ---------------- */
let gl=null,prog=null,U={},quad=null,qloc=0;
const SEED=[Math.random()*400,Math.random()*400];   // a new sky of clouds on every visit
const FS=`precision highp float;
uniform vec2 uRes,uCss;uniform float uT,uTod,uGlow,uK,uLat,uLst,uStarOff,uFireOff,uFarOff,uNearOff,uMoonLight;
uniform vec3 uMoon;uniform sampler2D uMap;uniform float uHasMap,uStretchMin;uniform vec2 uSeed;
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n2(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return v;}
vec3 hex(float r,float g,float b){return vec3(r,g,b)/255.;}
vec3 key(float e,vec3 a,vec3 b,vec3 c,vec3 d,vec3 f){
  if(e<.35)return mix(a,b,e/.35);if(e<.55)return mix(b,c,(e-.35)/.2);if(e<.75)return mix(c,d,(e-.55)/.2);return mix(d,f,(e-.75)/.25);}
float density(vec2 q,float t){q+=uSeed;vec2 w=vec2(fbm(q*.7+vec2(t*.006,0.)),fbm(q*.7+vec2(5.2,1.3)-vec2(t*.004,0.)));return fbm(q+1.6*w+vec2(t*.018,0.));}
// the Milky Way, from the real direction of this pixel: alt/az over Portland → RA/Dec → galactic coordinates
float milky(vec2 p,out float lc){
  float az=(p.x-uCss.x*.5)/uK,alt=(uCss.y-(p.y-uStarOff))/uK;lc=0.;
  if(alt<-.02)return 0.;
  float sd=sin(uLat)*sin(alt)+cos(uLat)*cos(alt)*cos(az),dec=asin(clamp(sd,-1.,1.));
  float H=atan(-sin(az)*cos(alt),cos(uLat)*sin(alt)-sin(uLat)*cos(alt)*cos(az)),ra=uLst-H;
  vec3 e=vec3(cos(dec)*cos(ra),cos(dec)*sin(ra),sin(dec));
  vec3 gv=vec3(dot(vec3(-.0548755604,-.8734370902,-.4838350155),e),dot(vec3(.4941094279,-.4448296300,.7469822445),e),dot(vec3(-.8676661490,-.1980763734,.4559837762),e));
  float l=atan(gv.y,gv.x),b=asin(clamp(gv.z,-1.,1.));lc=l;
  float w=.12+.06*exp(-l*l/.8);
  float core=exp(-pow(b/w,2.)),along=.4+.6*exp(-l*l/.7)+.25*exp(-pow((l-1.4)/.45,2.));
  vec2 tp=vec2(gv.x*5.+gv.y*3.,gv.z*20.);
  float tex=.5+.8*fbm(tp*1.3)+.25*fbm(tp*5.);
  float dust=smoothstep(.45,.72,fbm(vec2(gv.x*7.+gv.y*4.,gv.z*34.)+3.))*exp(-pow((b-.015)/.05,2.));   // dark dust lanes
  return core*along*tex*(1.-.5*dust);
}
void main(){
  vec2 uv=gl_FragCoord.xy/uRes;vec2 p=vec2(uv.x,1.-uv.y)*uCss;float e=uTod,h=uv.y;
  // day → golden hour → sunset → dusk → night (night colours after a dark-site photo: near-black blue over a grey-teal haze)
  vec3 Z=key(e,hex(93.,151.,214.),hex(104.,132.,182.),hex(66.,63.,124.),hex(20.,24.,50.),hex(5.,8.,15.));
  vec3 Hc=key(e,hex(207.,226.,241.),hex(243.,210.,162.),hex(243.,150.,108.),hex(62.,52.,86.),hex(30.,38.,48.));
  vec3 col=mix(Hc,Z,pow(clamp(h,0.,1.),.6));
  float band=exp(-pow((e-.55)/.12,2.));col=mix(col,hex(192.,103.,154.),band*.35*exp(-pow((h-.3)/.22,2.)));
  float night=smoothstep(.6,1.,e);
  col+=hex(70.,90.,130.)*uMoonLight*.12*night;   // moonlight lifts the whole sky a little
  float lc;float mw=milky(p,lc);
  vec3 mwc=mix(hex(150.,160.,180.),hex(215.,205.,185.),exp(-lc*lc/.6));
  col+=mwc*mw*.34*night*(1.-.55*uMoonLight);
  if(uMoon.z>0.){vec2 dm=p-uMoon.xy;col+=hex(200.,205.,225.)*exp(-length(dm)/(uMoon.z*7.))*.22*uMoonLight*night;}   // the Moon's halo
  // the fire just below the frame, bottom centre: an amber glow, like town light on a horizon
  vec2 fd=(p-vec2(uCss.x*.5,uCss.y*1.02+uFireOff))/vec2(uCss.x*.42,uCss.y*.55);
  col+=hex(255.,136.,52.)*exp(-dot(fd,fd)*2.)*.34*night*uGlow;
  // clouds: a far layer and a near one; the near one is the one the cursor moves
  vec2 pf=p-vec2(0.,uFarOff);float df=density(pf/700.+vec2(9.,3.),uT*.6);
  float cf=smoothstep(.5,.8,df)*(.3+.7*smoothstep(.1,.7,h))*.55;
  // near layer: the simulated cloud (js), with fine detail on its edges; lit from its own shape
  // near layer: the same soft clouds, carried by the simulated air. The map holds how far each bit was carried
  // (pixels, y up); where the flow pulled the cloud apart it is stretched, and thinner.
  vec2 pn=p-vec2(0.,uNearOff);vec2 muv=vec2(pn.x/uCss.x,1.-pn.y/uCss.y);
  vec2 m=texture2D(uMap,muv).xy*uHasMap;vec2 src=pn+vec2(m.x,-m.y);
  float stretch=1.;
  if(uHasMap>0.){vec2 e=vec2(3./uCss.x,3./uCss.y);
    vec2 mx=texture2D(uMap,muv+vec2(e.x,0.)).xy-texture2D(uMap,muv-vec2(e.x,0.)).xy,my=texture2D(uMap,muv+vec2(0.,e.y)).xy-texture2D(uMap,muv-vec2(0.,e.y)).xy;
    float a=1.+mx.x/6.,b=mx.y/6.,c=my.x/6.,dd=1.+my.y/6.;stretch=clamp(abs(a*dd-b*c),uStretchMin,1.);}
  vec2 q=src/380.;
  float d=density(q,uT),dl=density(q+vec2(-.06,.07),uT);
  float cov=smoothstep(.44,.8,d)*(.35+.65*smoothstep(0.,.55,h))*pow(stretch,.8);
  float fade=1.-smoothstep(.62,.86,e);
  float lit=clamp(.62+(d-dl)*3.2,0.,1.);
  vec3 litC=key(e,hex(255.,255.,255.),hex(255.,226.,186.),hex(255.,176.,140.),hex(92.,76.,118.),hex(30.,36.,62.));
  vec3 shC=key(e,hex(178.,196.,218.),hex(170.,140.,160.),hex(124.,90.,138.),hex(42.,40.,72.),hex(14.,18.,40.));
  col=mix(col,mix(shC,litC,.75),cf*fade*.8);
  col=mix(col,mix(shC,litC,lit),cov*.92*fade);
  col+=(h21(gl_FragCoord.xy+uT)-.5)/255.;
  gl_FragColor=vec4(col,1.);
}`;
function initGL(){
  try{gl=glCanvas.getContext('webgl',{antialias:false,alpha:false,premultipliedAlpha:false,powerPreference:'low-power'});}catch{gl=null;}
  if(!gl)return;
  const sh=(type,src)=>{const s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))console.error(gl.getShaderInfoLog(s));return s;};
  prog=gl.createProgram();
  gl.attachShader(prog,sh(gl.VERTEX_SHADER,'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}'));
  gl.attachShader(prog,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(prog);
  if(!gl.getProgramParameter(prog,gl.LINK_STATUS)){console.error(gl.getProgramInfoLog(prog));gl=null;return;}
  gl.useProgram(prog);
  quad=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  qloc=gl.getAttribLocation(prog,'a');gl.enableVertexAttribArray(qloc);gl.vertexAttribPointer(qloc,2,gl.FLOAT,false,0,0);
  for(const n of ['uRes','uCss','uT','uTod','uGlow','uK','uLat','uLst','uStarOff','uFireOff','uFarOff','uNearOff','uMoonLight','uMoon','uMap','uHasMap','uStretchMin','uSeed'])U[n]=gl.getUniformLocation(prog,n);
  gl.uniform1i(U.uMap,0);fluidInit();
}
function drawSkyGL(fireGlow){
  if(!gl)return;
  gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,glCanvas.width,glCanvas.height);   // always draw the sky to the whole canvas
  gl.useProgram(prog);gl.bindBuffer(gl.ARRAY_BUFFER,quad);gl.enableVertexAttribArray(qloc);gl.vertexAttribPointer(qloc,2,gl.FLOAT,false,0,0);
  gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,FL&&FL.map?FL.map.r.t:null);gl.uniform1f(U.uHasMap,FL&&FL.map?1:0);gl.uniform1f(U.uStretchMin,STRETCH_MIN);gl.uniform2f(U.uSeed,SEED[0],SEED[1]);
  gl.uniform2f(U.uRes,glCanvas.width,glCanvas.height);gl.uniform2f(U.uCss,W,H);
  gl.uniform1f(U.uT,reduced?40:t);gl.uniform1f(U.uTod,ease(tod));gl.uniform1f(U.uGlow,fireGlow);
  gl.uniform1f(U.uK,K/DEG);gl.uniform1f(U.uLat,LAT);gl.uniform1f(U.uLst,L);
  gl.uniform1f(U.uStarOff,scrolled*PAR.stars);gl.uniform1f(U.uFireOff,scrolled*PAR.fire);gl.uniform1f(U.uFarOff,scrolled*PAR.far);gl.uniform1f(U.uNearOff,scrolled*PAR.near);
  gl.uniform1f(U.uMoonLight,moonLight);
  const m=moonPt&&moonPt.up?[moonPt.xy[0],moonPt.xy[1]+scrolled*PAR.stars,Math.max(5,.26*K*3)]:[0,0,0];gl.uniform3f(U.uMoon,m[0],m[1],m[2]);
  gl.drawArrays(gl.TRIANGLES,0,3);
}

/* ---------------- banner text follows the sky ---------------- */
// The rest of the page switches in half a second; the banner's own colours ride the dusk/dawn instead,
// flipping around the middle of it, so the text never sits dark-on-dark or light-on-light.
// One colour for everything in the sky banner: the site's off-black by day, its off-white at night.
// The Details button is glass: milky by day, smoky at night, blurring the sky behind it.
let inkSet=-1;
function inks(){
  const f=Math.round(smooth(.32,.62,ease(tod))*40)/40;if(f===inkSet)return;inkSet=f;
  const c=`color-mix(in srgb,#ececea ${f*100}%,#1b1b1b)`,st=show.style;
  for(const k of ['ink','muted','accent'])st.setProperty('--'+k,c);
  st.setProperty('--rule-strong',`color-mix(in srgb,${c} 30%,transparent)`);
  st.setProperty('--glass',`color-mix(in srgb,rgba(14,16,24,.34) ${f*100}%,rgba(255,255,255,.34))`);
  st.setProperty('--glass-hover',`color-mix(in srgb,rgba(14,16,24,.5) ${f*100}%,rgba(255,255,255,.52))`);
}

/* ---------------- loop ---------------- */
let visible=true,raf=0,last=performance.now(),drawn=false,dirty=true,started=false;
function frame(now){
  raf=0;started=true;
  const dt=Math.min(.05,(now-last)/1000);last=now;t+=dt;
  const r=sky.getBoundingClientRect();skyRect={left:r.left,top:r.top};scrolled=Math.max(0,-r.top);
  const rate=1/(reduced?.5:2.5);if(tod!==target)tod=target>tod?Math.min(target,tod+dt*rate):Math.max(target,tod-dt*rate);
  for(const v of eddies)v.age+=dt;while(eddies.length&&eddies[0].age>eddies[0].life)eddies.shift();
  ptr.vx*=Math.exp(-dt*6);ptr.vy*=Math.exp(-dt*6);   // a still cursor stops pushing
  stepEdge(dt);place(false);inks();stepClouds(dt);
  const fireGlow=(reduced?1:.82+.1*Math.sin(t*1.7)+.06*Math.sin(t*4.3+1.3)+.04*Math.sin(t*9.1))*(1+.55*glowBoost);
  drawSkyGL(fireGlow);
  g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,W,H);gF.setTransform(dpr,0,0,dpr,0,0);gF.clearRect(0,0,W,H);
  drawStars(dt);stepMeteors(dt);stepEmbers(dt);
  if(!drawn&&(catalog||t>1.5)){drawn=true;sky.classList.add('ready');}
  dirty=false;wake();
}
function redraw(){   // draw now, in place of the frame already queued
  if(!visible||document.hidden){wake();return;}
  if(raf){cancelAnimationFrame(raf);raf=0;}
  frame(performance.now());
}
function wake(){
  if(raf||!visible||document.hidden)return;
  if(reduced&&!dirty&&tod===target&&!meteors.length)return;
  raf=requestAnimationFrame(frame);
}
new IntersectionObserver(([en])=>{visible=en.isIntersecting;if(visible){last=performance.now();wake();}}).observe(sky);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){last=performance.now();wake();}});
addEventListener('scroll',()=>{dirty=true;wake();},{passive:true});
// the carousel speeding back to the first slide (js/meetups.js): the fire is stoked harder than its own tending,
// and a steadier wind carries the clouds further
addEventListener('fireside:stoke',()=>{
  if(reduced)return;
  glowBoost=1.6;const n=Math.round(rnd(25,40)*1.5*(small()?.5:1));for(let i=0;i<n;i++)embers.push(newEmber(true));
  slideBreeze={dir:1,t:-SLIDE_DELAY,gust:true};energy=1;dirty=true;wake();
});
addEventListener('fireside:theme',()=>{target=isDark()?1:0;if(!drawn)tod=target;wake();});
setInterval(()=>{dirty=true;wake();},60000);   // with reduced motion, keep the sky turning once a minute

initGL();
new ResizeObserver(size).observe(show);new ResizeObserver(size).observe(strip);
size();
