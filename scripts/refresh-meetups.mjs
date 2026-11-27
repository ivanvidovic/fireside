// Daily backup snapshot of Fireside's Luma calendar (run by GitHub Actions).
// Usage: node scripts/refresh-meetups.mjs <output.json>
// If Luma is unreachable, the existing snapshot is kept and the deploy continues.
import {writeFile} from 'node:fs/promises';
import {FEED,parseLuma,addCovers} from '../worker/luma-ics.js';
const out=process.argv[2]||'data/meetups.json';
try{
  const r=await fetch(FEED,{headers:{'Accept':'text/calendar, */*','User-Agent':'fireside.technology snapshot'}});
  if(!r.ok)throw new Error('Luma responded '+r.status);
  const data=await addCovers(parseLuma(await r.text()));
  await writeFile(out,JSON.stringify(data)+'\n');
  console.log(`Synced ${data.events.length} meetups to ${out}`);
}catch(e){console.warn('Meetup snapshot not refreshed:',e.message);}
