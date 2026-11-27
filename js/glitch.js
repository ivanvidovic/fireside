// The broken GPU signal, shared by the image load-in (js/reveal.js) and the meetup placeholder (js/meetups.js).
// Neon on the site's black: streaks smeared along rows (hairline to chunky), colour bands that drift down the frame,
// sparkling noise and tears, plus the block damage a failing GPU puts on screen: macroblocks knocked out of place or
// filled wrong, stuck columns, tiled texture garbage, checker and dither, regions dropping to a coarse resolution,
// and staircased bands. Each glitch has its own "stress" that wanders on its own timing: calm stretches (slow, few
// changes), fits (fast, heavy damage) and the odd freeze where the signal sticks, then jolts back.
// R is the random source: Math.random for something new every time, or a seeded one to repeat a frame.
export const GX=2,GY=1;   // grid cell in css px: 1px rows, so the thinnest lines are hairlines
const BG=0xff1a1a1a;      // the site's black (the dark theme's background), in both themes
export const PAL=[[255,0,170],[255,40,120],[0,240,255],[140,255,40],[40,120,255],[255,190,0],[190,80,255],[0,255,170]];
const col=(c,k)=>(0xff000000|(Math.min(255,c[2]*k)<<16)|(Math.min(255,c[1]*k)<<8)|Math.min(255,c[0]*k))>>>0;

// one band of rows: a row of streaks, carried down for the band's height with small nudges (hairline to chunky)
function band(st,y0,hgt){
  const {w,h,buf,R}=st,rnd=(a,b)=>a+R()*(b-a),zone=st.zone(y0),o=y0*w;
  for(let x=0;x<w;x++)buf[o+x]=BG;
  if(R()>.45){   // plenty of dead space: nearly half the bands stay black
    let x=Math.floor(rnd(-.2,.4)*w);
    while(x<w){
      const len=Math.max(2,Math.floor(-Math.log(1-R())*w*rnd(.15,.6))),pat=R();
      const c=PAL[(zone+(R()<.7?0:R()<.5?1:-1)+PAL.length)%PAL.length],b=rnd(.55,1.15);
      for(let i=0;i<len&&x+i<w;i++){
        if(x+i<0)continue;
        if(pat>.72&&((i>>(pat>.9?0:1))&1))continue;   // dashed, or beaded
        buf[o+x+i]=col(c,b*rnd(.82,1.1));
      }
      x+=len+Math.floor(-Math.log(1-R())*w*rnd(.05,.35));
    }
  }
  for(let y=y0+1;y<Math.min(h,y0+hgt);y++){   // the rest of the band: the row above, nudged now and then
    const dx=R()<.25?Math.floor(rnd(-2,3)):0,s=(y-1)*w,d=y*w;
    for(let x=0;x<w;x++)buf[d+x]=buf[s+((x-dx+w)%w)];
  }
}
// a band height in rows: mostly hairlines and thin lines, sometimes chunky
function bandH(R){const r=R();return Math.max(1,Math.round((r<.3?1:r<.65?2+R()*3:r<.9?5+R()*6:11+R()*6)/GY));}

/* ---- the block damage ---- */
const blk=R=>[4,8,16,32][Math.floor(R()*4)];   // block size, css px
function region(st,bw,bh){const {w,h,R}=st,x=Math.floor(R()*Math.max(1,w-bw)),y=Math.floor(R()*Math.max(1,h-bh));return [x,y,Math.min(bw,w-x),Math.min(bh,h-y)];}
function macroblocks(st){   // square blocks shifted, filled with one wrong colour, or repeating a neighbour
  const {w,buf,R}=st,b=blk(R),bx=Math.max(1,Math.round(b/GX)),by=Math.max(1,Math.round(b/GY));
  const [x0,y0,rw,rh]=region(st,bx*Math.ceil(1+R()*6),by*Math.ceil(1+R()*3));
  for(let y=y0;y<y0+rh;y+=by)for(let x=x0;x<x0+rw;x+=bx){
    const mode=R();if(mode<.35)continue;
    const fill=mode<.6?col(PAL[Math.floor(R()*PAL.length)],.5+R()*.7):0;
    const sx=mode<.8?Math.floor((R()-.5)*bx*4):-bx,sy=mode<.8?Math.floor((R()-.5)*by*2):0;
    for(let yy=y;yy<Math.min(y+by,y0+rh);yy++)for(let xx=x;xx<Math.min(x+bx,x0+rw);xx++)
      buf[yy*w+xx]=fill||buf[Math.min(st.h-1,Math.max(0,yy+sy))*w+((xx+sx+w)%w)];
  }
}
function stuckColumns(st){   // thin vertical lines running down the frame, kept for a while
  const {R}=st;
  if(st.cols.length<6&&R()<.6)st.cols.push({x:Math.floor(R()*st.w),wd:1+Math.floor(R()*2),c:col(PAL[Math.floor(R()*PAL.length)],.6+R()*.6),
    y0:R()<.5?0:Math.floor(R()*st.h*.5),y1:R()<.5?st.h:Math.floor(st.h*(.5+R()*.5)),life:Math.floor(4+R()*30),dash:R()<.4});
}
function drawColumns(st){
  const {w,buf}=st;st.cols=st.cols.filter(c=>c.life-->0);
  for(const c of st.cols)for(let y=c.y0;y<c.y1;y++){if(c.dash&&(y>>2)&1)continue;for(let i=0;i<c.wd;i++)buf[y*w+Math.min(w-1,c.x+i)]=c.c;}
}
function garbage(st){   // a small tile of pattern repeated across a region, like corrupted memory
  const {w,buf,R}=st,tw=2+Math.floor(R()*8),th=2+Math.floor(R()*12),tile=[];
  const a=PAL[Math.floor(R()*PAL.length)],b=PAL[Math.floor(R()*PAL.length)];
  for(let i=0;i<tw*th;i++){const r=R();tile.push(r<.4?BG:col(r<.7?a:b,.5+R()*.7));}
  const [x0,y0,rw,rh]=region(st,Math.floor(w*(.08+R()*.35)),Math.floor(st.h*(.03+R()*.15)));
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)buf[(y0+y)*w+x0+x]=tile[(y%th)*tw+(x%tw)];
}
function dither(st){   // alternating pixels in two colours
  const {w,buf,R}=st,cell=R()<.6?1:2,a=col(PAL[Math.floor(R()*PAL.length)],.5+R()*.6),b=R()<.5?BG:col(PAL[Math.floor(R()*PAL.length)],.5+R()*.6);
  const [x0,y0,rw,rh]=region(st,Math.floor(w*(.05+R()*.25)),Math.floor(st.h*(.02+R()*.1)));
  for(let y=0;y<rh;y++)for(let x=0;x<rw;x++)buf[(y0+y)*w+x0+x]=((Math.floor(x/cell)+Math.floor(y/cell))&1)?a:b;
}
function lowRes(st){   // a region suddenly drawn at a much coarser block size
  const {w,buf,R}=st,c=[8,12,16,24,32][Math.floor(R()*5)],cx=Math.max(1,Math.round(c/GX)),cy=Math.max(1,Math.round(c/GY));
  const [x0,y0,rw,rh]=region(st,Math.floor(w*(.1+R()*.4)),Math.floor(st.h*(.05+R()*.2)));
  for(let y=y0;y<y0+rh;y+=cy)for(let x=x0;x<x0+rw;x+=cx){const v=buf[y*w+x];
    for(let yy=y;yy<Math.min(y+cy,y0+rh);yy++)for(let xx=x;xx<Math.min(x+cx,x0+rw);xx++)buf[yy*w+xx]=v;}
}
function staircase(st){   // a band of block rows, each shifted a little further than the one above
  const {w,buf,R}=st,by=Math.max(1,Math.round(blk(R)/GY)),n=2+Math.floor(R()*6),step=Math.floor((R()<.5?-1:1)*(2+R()*w*.04));
  const y0=Math.floor(R()*Math.max(1,st.h-by*n));
  for(let k=0;k<n;k++){const dx=step*(k+1);
    for(let y=y0+k*by;y<Math.min(st.h,y0+(k+1)*by);y++){const row=buf.slice(y*w,(y+1)*w);for(let x=0;x<w;x++)buf[y*w+x]=row[((x-dx)%w+w)%w];}}
}
const DAMAGE=[macroblocks,stuckColumns,garbage,dither,lowRes,staircase];

export function glitchStep(st,first){
  const {w,h,buf,R}=st,rnd=(a,b)=>a+R()*(b-a),s=st.stress;
  st.drift+=rnd(-.4,.9)*(1+s*2);                            // the colour bands creep down the frame
  if(first){for(let y=0;y<h;){const bh=bandH(R);band(st,y,bh);y+=bh;}}
  else{
    // calm: a few bands change; in a fit, most of the frame
    const want=h*rnd(.03,.08)*(1+s*2.5);
    for(let n=0;n<want;){const bh=bandH(R),y=Math.floor(R()*h);band(st,y,bh);n+=bh;}
  }
  for(let n=Math.floor(rnd(0,1.5+s*3));n--;){               // rows smear sideways
    const y=Math.floor(R()*h),dx=Math.floor(rnd(-8,8)*(1+s*2)),row=buf.slice(y*w,(y+1)*w);
    for(let x=0;x<w;x++)buf[y*w+x]=row[((x-dx)%w+w)%w];
  }
  if(R()<.1+s*.3){                                         // a tear: a band jumps sideways, or repeats from elsewhere
    const bh=Math.floor(rnd(2,Math.max(3,h*.12))),y0=Math.floor(R()*(h-bh)),dx=Math.floor(rnd(-.25,.25)*w);
    const src=R()<.5?y0:Math.floor(R()*(h-bh)),b=buf.slice(src*w,(src+bh)*w);
    for(let y=0;y<bh;y++)for(let x=0;x<w;x++)buf[(y0+y)*w+x]=b[y*w+((x-dx)%w+w)%w];
  }
  for(let n=Math.floor(rnd(0,2+s*3));n--;){                 // bursts of sparkling noise
    const cw=Math.floor(rnd(4,Math.max(5,w*.08))),ch=Math.floor(rnd(1,4)),x0=Math.floor(R()*(w-cw)),y0=Math.floor(R()*(h-ch));
    for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)if(R()<.7)buf[(y0+y)*w+x0+x]=col(PAL[Math.floor(R()*PAL.length)],rnd(.6,1.3));
  }
  // block damage: now and then when calm, plenty in a fit
  for(let n=Math.floor(rnd(0,.6+s*2.5));n--;)DAMAGE[Math.floor(R()*DAMAGE.length)](st);
  if(first)for(let n=2;n--;)DAMAGE[Math.floor(R()*DAMAGE.length)](st);
  drawColumns(st);
  if(st.g)st.g.putImageData(st.img,0,0);
}

// Call every animation frame: decides, from this glitch's own wandering stress, whether it changes now.
// Returns true when it drew.
export function glitchTick(st,now){
  const R=Math.random;
  if(now>=st.moodAt){   // a new mood: calm, rising, a fit, or (rarely) a freeze
    // mostly quiet; busy spells are rarer and shorter
    const r=R(),busy=r>=.92;st.target=r<.7?R()*.15:busy?.6+R()*.3:.2+R()*.3;st.moodAt=now+(busy?400+R()*1200:1200+R()*4000);
    if(R()<.15)st.frozenTill=now+400+R()*1400;
  }
  st.stress+=(st.target-st.stress)*.08;
  if(now<st.frozenTill)return false;            // stuck
  if(now<st.nextAt)return false;
  const jolt=st.frozenTill&&now-st.frozenTill<60;  // just unstuck: a jolt
  if(jolt)st.stress=Math.max(st.stress,.6);
  st.nextAt=now+(380-300*st.stress)*(.5+R());   // quiet ≈ 2–4 changes a second, a busy spell ≈ 8–15
  glitchStep(st,false);return true;
}

// a fresh state for a w×h grid (st.img is its pixels; give it st.g, a 2D context, to draw into)
export function glitchState(w,h,R=Math.random){
  const seed=R()*100,st={w,h,R,drift:0,img:new ImageData(w,h),cols:[],stress:R()*.3,target:.2,moodAt:0,nextAt:0,frozenTill:0};
  st.buf=new Uint32Array(st.img.data.buffer);
  // which part of the palette each row leans to: slow, wandering bands
  st.zone=y=>Math.floor((Math.sin((y+st.drift)/st.h*2.3+seed)+Math.sin((y+st.drift)/st.h*5.9+seed*1.7)*.35+1.35)/2.7*PAL.length)%PAL.length;
  return st;
}
// a repeatable random source from a string (e.g. an event's date)
export function seeded(str){let h=2166136261;for(const ch of str)h=Math.imul(h^ch.charCodeAt(0),16777619);
  return ()=>{h+=0x6D2B79F5;let t=h;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
