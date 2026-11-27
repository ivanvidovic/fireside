// Parses Fireside's public Luma iCal feed into events: date, end, url, title, location, geo, venue, note, host.
// Shared by the Cloudflare Worker (live) and the daily snapshot script (backup).
// Logic follows Terence's refresh_fireside_meetups.py.
export const FEED='https://api.luma.com/ics/get?entity=calendar&id=cal-VGeJwDUCMWPecSg';
const EVENT_URL=/https:\/\/(?:luma\.com|lu\.ma)\/[A-Za-z0-9_-]+(?=$|[?#\s\\])/;

// Wall-clock time in an IANA zone -> UTC instant, using only Intl.
function zonedToUtc(y,mo,d,h,mi,s,zone){
  const guess=Date.UTC(y,mo-1,d,h,mi,s);
  const offsetAt=t=>{
    const parts=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(t)).map(p=>[p.type,p.value]));
    return Date.UTC(+parts.year,+parts.month-1,+parts.day,+parts.hour,+parts.minute,+parts.second)-t;
  };
  let t=guess-offsetAt(guess);t=guess-offsetAt(t);return t;
}
function eventStart(field,value){
  let m;
  if((m=/^(\d{4})(\d{2})(\d{2})$/.exec(value)))return {allDay:true,iso:`${m[1]}-${m[2]}-${m[3]}`};
  if((m=/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/.exec(value))){
    const [,y,mo,d,h,mi,s,z]=m.map((v,i)=>i&&i<7?+v:v);
    if(z==='Z')return {iso:new Date(Date.UTC(y,mo-1,d,h,mi,s)).toISOString()};
    const zone=/(?:^|;)TZID="?([^";]+)"?/.exec(field);
    if(zone)return {iso:new Date(zonedToUtc(y,mo,d,h,mi,s,zone[1])).toISOString()};
  }
  return null;
}
const unescape=t=>t.replace(/\\n/gi,'\n').replace(/\\,/g,',').replace(/\;/g,';').replace(/\\\\/g,'\\');
const oneLine=t=>unescape(t).replace(/\s*\n\s*/g,' ').trim();

// Luma's DESCRIPTION reads: "Get up-to-date information at: <url>\n\nAddress:\n<venue>\n<notes…>\n<city, state>\n<country>\n\nHosted by <names>"
function describe(text){
  const lines=unescape(text).split('\n').map(l=>l.trim());
  const out={};
  const host=lines.find(l=>/^Hosted by /i.test(l));if(host)out.host=host.replace(/^Hosted by /i,'');
  const a=lines.findIndex(l=>/^Address:?$/i.test(l));
  if(a>=0){
    const block=[];for(let i=a+1;i<lines.length&&lines[i];i++)block.push(lines[i]);
    if(block.length)out.venue=block[0];
    const notes=block.slice(1,Math.max(1,block.length-2));      // drop city + country lines
    if(notes.length)out.note=notes.join(' ');
  }
  return out;
}

export function parseLuma(calendar,now=new Date()){
  const text=calendar.replace(/\r?\n[ \t]/g,'').trim();
  if(!text.startsWith('BEGIN:VCALENDAR')||!text.endsWith('END:VCALENDAR'))throw new Error('Luma did not return an iCalendar feed');
  const cutoff=new Date(now.getTime()-36*3600e3);
  const events=[];
  for(const [,block] of text.matchAll(/BEGIN:VEVENT\r?\n([\s\S]*?)\r?\nEND:VEVENT/g)){
    const fields={};
    for(const line of block.split(/\r?\n/)){const i=line.indexOf(':');if(i>0)fields[line.slice(0,i)]=line.slice(i+1);}
    if(fields.STATUS==='CANCELLED')continue;
    const link=EVENT_URL.exec(fields.URL||'')||EVENT_URL.exec(fields.DESCRIPTION||'');
    const key=name=>Object.keys(fields).find(k=>k.split(';')[0]===name);
    const startKey=key('DTSTART'),endKey=key('DTEND');
    if(!link||!startKey)continue;
    let start,end;try{start=eventStart(startKey,fields[startKey]);end=endKey?eventStart(endKey,fields[endKey]):null;}catch{start=null;}
    if(!start)continue;
    const when=start.allDay?new Date(start.iso+'T23:59:59Z'):new Date(end?.iso||start.iso);
    if(when<cutoff)continue;
    const ev={date:start.iso,url:link[0],title:oneLine(fields.SUMMARY||'Fireside meetup')};
    if(end&&!end.allDay)ev.end=end.iso;
    if(fields.LOCATION)ev.location=oneLine(fields.LOCATION);
    const geo=/^(-?\d+(?:\.\d+)?);(-?\d+(?:\.\d+)?)$/.exec(fields.GEO||'');if(geo)ev.geo=[+geo[1],+geo[2]];
    Object.assign(ev,describe(fields.DESCRIPTION||''));
    if(!ev.host){const o=key('ORGANIZER'),cn=o&&/CN="?([^";:]+)"?/.exec(o);if(cn)ev.host=cn[1];}
    events.push(ev);
  }
  events.sort((a,b)=>a.date.localeCompare(b.date));
  return {updatedAt:now.toISOString(),events};
}

// Each event's cover image. Luma's calendar feed has no images, but every event's own page carries its cover
// (an images.lumacdn.com/…/event-covers/… file). This reads the first one on each upcoming event's page and asks
// Luma's image server for a copy sized for the site. Not an official Luma feature: if their pages change and no
// cover is found, the event simply has no image and the site shows its placeholder.
const COVER=/event-covers\/[A-Za-z0-9_\-\/]+\.(?:png|jpe?g|webp|gif|avif)/i;
export async function addCovers(data,fetchPage=fetch){
  await Promise.all(data.events.slice(0,6).map(async ev=>{
    try{
      const r=await fetchPage(ev.url,{headers:{'Accept':'text/html','User-Agent':'fireside.technology meetups'}});
      if(!r.ok)return;
      const m=COVER.exec(await r.text());
      if(m)ev.image=`https://images.lumacdn.com/cdn-cgi/image/format=auto,fit=scale-down,quality=80,width=1400/${m[0]}`;
    }catch{}
  }));
  return data;
}
