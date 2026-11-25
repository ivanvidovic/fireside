// The real sky over Portland: sidereal time, the Sun, the Moon (position and phase), the naked-eye planets,
// and the major meteor showers. Low-precision formulas (Meeus; JPL's approximate Keplerian elements):
// the Moon to a fraction of a degree, the planets well within a degree. Plenty for the eye.
export const DEG=Math.PI/180;
export const LAT=45.52*DEG,LON=-122.68;        // Portland, Oregon
const wrap=a=>((a%360)+360)%360;
export const days=ms=>ms/86400000+2440587.5-2451545.0;   // days since J2000
export const lst=ms=>wrap(280.46061837+360.98564736629*days(ms)+LON)*DEG;
const EPS=23.4393*DEG;
export function eclToEq(lam,beta){   // radians
  const sl=Math.sin(lam),cl=Math.cos(lam),sb=Math.sin(beta),cb=Math.cos(beta),se=Math.sin(EPS),ce=Math.cos(EPS);
  return [Math.atan2(sl*ce*cb-sb*se,cl*cb),Math.asin(sb*ce+cb*se*sl)];
}
export function horiz(ra,dec,L){   // → [alt, az from north, east positive]
  const H=L-ra,sd=Math.sin(dec),cd=Math.cos(dec),ch=Math.cos(H);
  return [Math.asin(Math.sin(LAT)*sd+Math.cos(LAT)*cd*ch),Math.atan2(-Math.sin(H)*cd,Math.cos(LAT)*sd-Math.sin(LAT)*cd*ch)];
}
export function sun(ms){
  const d=days(ms),M=wrap(357.529+.98560028*d)*DEG,lam=wrap(280.459+.98564736*d+1.915*Math.sin(M)*1+.020*Math.sin(2*M))*DEG;
  const [ra,dec]=eclToEq(lam,0);return {ra,dec,lam,r:1.00014-.01671*Math.cos(M)};
}
export function moon(ms){
  const d=days(ms),r=x=>wrap(x)*DEG;
  const L=r(218.316+13.176396*d),Mm=r(134.963+13.064993*d),F=r(93.272+13.229350*d),D=r(297.850+12.190749*d),M=r(357.529+.98560028*d);
  const lam=L+DEG*(6.289*Math.sin(Mm)-1.274*Math.sin(2*D-Mm)+.658*Math.sin(2*D)-.186*Math.sin(M)-.059*Math.sin(2*D-2*Mm)
    -.057*Math.sin(2*D-M-Mm)+.053*Math.sin(2*D+Mm)+.046*Math.sin(2*D-M)+.041*Math.sin(Mm-M)-.035*Math.sin(D)-.031*Math.sin(Mm+M));
  const beta=DEG*(5.128*Math.sin(F)+.281*Math.sin(Mm+F)+.278*Math.sin(Mm-F)+.173*Math.sin(2*D-F));
  const [ra,dec]=eclToEq(lam,beta),s=sun(ms);
  const elong=Math.acos(Math.cos(beta)*Math.cos(lam-s.lam));
  return {ra,dec,illum:(1-Math.cos(elong))/2,waxing:wrap((lam-s.lam)/DEG)<180};
}
// JPL approximate elements (J2000, per century): a, e, I, L, long.peri, long.node
const EL={
  mercury:[.38709927,.20563593,7.00497902,252.25032350,77.45779628,48.33076593, .00000037,.00001906,-.00594749,149472.67411175,.16047689,-.12534081],
  venus:[.72333566,.00677672,3.39467605,181.97909950,131.60246718,76.67984255, .00000390,-.00004107,-.00078890,58517.81538729,.00268329,-.27769418],
  earth:[1.00000261,.01671123,-.00001531,100.46457166,102.93768193,0, .00000562,-.00004392,-.01294668,35999.37244981,.32327364,0],
  mars:[1.52371034,.09339410,1.84969142,-4.55343205,-23.94362959,49.55953891, .00001847,.00007882,-.00813131,19140.30268499,.44441088,-.29257343],
  jupiter:[5.20288700,.04838624,1.30439695,34.39644051,14.72847983,100.47390909, -.00011607,-.00013253,-.00183714,3034.74612775,.21252668,.20469106],
  saturn:[9.53667594,.05386179,2.48599187,49.95424423,92.59887831,113.66242448, -.00125060,-.00050991,.00193609,1222.49362201,-.41897216,-.28867794]};
function helio(name,T){
  const e0=EL[name],v=i=>e0[i]+e0[i+6]*T;
  const a=v(0),e=v(1),I=v(2)*DEG,L=v(3),wb=v(4),O=v(5)*DEG,w=wb*DEG-O;
  let M=wrap(L-wb)*DEG;if(M>Math.PI)M-=2*Math.PI;
  let E=M+e*Math.sin(M);for(let k=0;k<6;k++)E-=(E-e*Math.sin(E)-M)/(1-e*Math.cos(E));
  const x=a*(Math.cos(E)-e),y=a*Math.sqrt(1-e*e)*Math.sin(E);
  const cw=Math.cos(w),sw=Math.sin(w),cO=Math.cos(O),sO=Math.sin(O),cI=Math.cos(I),sI=Math.sin(I);
  return [(cw*cO-sw*sO*cI)*x+(-sw*cO-cw*sO*cI)*y,(cw*sO+sw*cO*cI)*x+(-sw*sO+cw*cO*cI)*y,(sw*sI)*x+(cw*sI)*y];
}
// colour and a typical brightness for each (they vary through the year; close enough for a point of light)
const LOOK={mercury:[[230,222,205],0],venus:[[255,250,232],-4.2],mars:[[255,190,150],.6],jupiter:[[255,244,222],-2.2],saturn:[[250,232,190],.6]};
export function planets(ms){
  const T=days(ms)/36525,E=helio('earth',T);
  return Object.keys(LOOK).map(n=>{
    const p=helio(n,T),x=p[0]-E[0],y=p[1]-E[1],z=p[2]-E[2];
    const [ra,dec]=eclToEq(Math.atan2(y,x),Math.atan2(z,Math.hypot(x,y)));
    return {ra,dec,rgb:LOOK[n][0],mag:LOOK[n][1]};
  });
}
// Major annual showers: peak (month, day), half-width of activity in days, radiant (RA°, Dec°), peak rate (ZHR).
const SHOWERS=[[1,3,1.2,230,49,110],[4,22,1.5,271,34,18],[5,6,4,338,-1,50],[8,12,4,48,58,100],[10,8,1,262,54,10],
  [10,21,4,95,16,20],[11,5,8,52,15,5],[11,17,2,152,22,15],[12,14,2.2,112,33,150],[12,22,1.5,217,76,10]];
export function showers(ms){
  const now=new Date(ms),y=now.getUTCFullYear();
  return SHOWERS.map(([m,d,w,ra,dec,zhr])=>{
    let dd=Infinity;for(const yy of [y-1,y,y+1])dd=Math.min(dd,Math.abs(ms-Date.UTC(yy,m-1,d))/864e5);
    return {ra:ra*DEG,dec:dec*DEG,rate:zhr*Math.exp(-(dd*dd)/(2*w*w))};
  }).filter(s=>s.rate>1);
}
// B−V colour index → star colour
export function bvRGB(bv){
  const t=Math.max(-.4,Math.min(2,bv));
  if(t<0)return [170+t*-60|0,195+t*-40|0,255];
  if(t<.4)return [215+t*100|0,225+t*60|0,255-t*40|0];
  if(t<1)return [255,250-(t-.4)*60|0,235-(t-.4)*130|0];
  return [255,214-(t-1)*50|0,157-(t-1)*60|0];
}
