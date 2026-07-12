// Einmalig: setzt cover_bild_path / bilder_paths aus dem zvg-bilder-Storage für
// Akten, deren Bilder zwar geladen wurden (Match-Enrichment), aber die Spalten
// nie gesetzt wurden (#7-Bug). Reiner Storage-Read + PATCH, kein Download.
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const DB = env.SUPABASE_URL || "https://ujiiaqvwpnniaasdhyrb.supabase.co";
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SRK, Authorization: `Bearer ${SRK}` };

// Kandidaten: zvg.com-Quelle, noch kein cover_bild_path.
const akten = [];
for (let off=0;;off+=1000){
  const r = await fetch(`${DB}/rest/v1/zvg_akte?select=zid&cover_bild_path=is.null&quellen=cs.%7Bzvg.com%7D&limit=1000&offset=${off}`,{headers:H});
  const rows = await r.json(); if(!Array.isArray(rows)||!rows.length) break; akten.push(...rows.map(a=>a.zid)); if(rows.length<1000) break;
}
console.log(`${akten.length} Kandidaten (zvg.com-Quelle, ohne cover).`);

async function list(zid){
  const r = await fetch(`${DB}/storage/v1/object/list/zvg-bilder`,{method:"POST",headers:{...H,"Content-Type":"application/json"},body:JSON.stringify({prefix:`${zid}/`,limit:100})});
  const a = await r.json(); return Array.isArray(a) ? a.map(x=>x.name) : [];
}

let set=0, ohne=0, i=0;
for (const zid of akten){
  const names = await list(zid);
  const cover = names.includes("cover.jpg") ? `${zid}/cover.jpg` : null;
  const gallery = names.filter(n=>/^gallery_\d+\.jpg$/.test(n)).sort((a,b)=>parseInt(a.match(/\d+/))-parseInt(b.match(/\d+/))).map(n=>`${zid}/${n}`);
  if (!cover && !gallery.length){ ohne++; }
  else {
    const patch = {};
    if (cover) patch.cover_bild_path = cover;
    if (gallery.length) patch.bilder_paths = gallery;
    await fetch(`${DB}/rest/v1/zvg_akte?zid=eq.${zid}`,{method:"PATCH",headers:{...H,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify(patch)});
    set++;
  }
  if (++i % 25 === 0) console.log(`  ... ${i}/${akten.length} (gesetzt ${set}, ohne Bilder ${ohne})`);
}
console.log(`FERTIG: Bilder gesetzt bei ${set}, ohne Bilder im Storage ${ohne}`);
