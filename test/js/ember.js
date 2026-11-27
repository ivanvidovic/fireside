// The look of an ember, shared by the Meetups fire (js/sky.js) and the size slider's sparks (js/gear.js),
// so both speak the same visual language: colour cools from white-yellow through orange to deep red,
// fast embers stretch into short streaks, fresh and "hero" embers carry a soft glow.
export function heat(T){
  const k=[[1,[255,244,214]],[.75,[255,196,96]],[.5,[255,128,40]],[.25,[214,62,18]],[0,[110,18,8]]];
  for(let i=0;i<k.length-1;i++){const [t0,c0]=k[i],[t1,c1]=k[i+1];if(T>=t1){const f=(T-t1)/(t0-t1);return c1.map((v,j)=>Math.round(v+(c0[j]-v)*f));}}
  return k[k.length-1][1];
}
let sprite=null;
export function glowSprite(){
  if(sprite)return sprite;
  const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),r=x.createRadialGradient(32,32,0,32,32,32);
  r.addColorStop(0,'rgba(255,190,110,.9)');r.addColorStop(.25,'rgba(255,120,40,.35)');r.addColorStop(1,'rgba(255,80,20,0)');x.fillStyle=r;x.fillRect(0,0,64,64);
  return sprite=c;
}
// One ember: a streak along its motion when fast, a dot when slow, plus its glow.
export function drawEmber(c,e,alpha,glowK=1,cool=0){   // cool: start further down the colour curve (light backgrounds)
  const [r,g,b]=heat(e.T*(1-cool)),sp=Math.hypot(e.vx,e.vy),len=Math.min(22,sp*.035);
  c.strokeStyle=c.fillStyle=`rgba(${r},${g},${b},${alpha.toFixed(3)})`;
  if(len>1.2){c.lineWidth=e.size;c.beginPath();c.moveTo(e.x,e.y);c.lineTo(e.x-e.vx/sp*len,e.y-e.vy/sp*len);c.stroke();}
  else{c.beginPath();c.arc(e.x,e.y,e.size*.6,0,6.283);c.fill();}
  if(e.hero||e.T>.8){const gs=e.size*(e.hero?7:4.5);c.globalAlpha=alpha*(e.hero?.55:.25)*e.T*glowK;c.drawImage(glowSprite(),e.x-gs,e.y-gs,gs*2,gs*2);c.globalAlpha=1;}
}
