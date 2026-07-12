// Einmaliges Geocoding der Amtsgerichte (companies.sector='Amtsgericht') ->
// companies.lat/lon. Basis für den geocode-akten Fallback "Amtsgericht-Standort".
// Nominatim, 1 Anfrage/Sekunde (Policy). Idempotent (nur lat IS NULL).
import { readFileSync } from "node:fs";
const env = Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));
const DB = env.SUPABASE_URL || "https://ujiiaqvwpnniaasdhyrb.supabase.co";
const SRK = env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SRK, Authorization: `Bearer ${SRK}` };
const LAND = { BW:"Baden-Württemberg", BY:"Bayern", BE:"Berlin", BB:"Brandenburg", HB:"Bremen", HH:"Hamburg", HE:"Hessen", MV:"Mecklenburg-Vorpommern", NI:"Niedersachsen", NW:"Nordrhein-Westfalen", RP:"Rheinland-Pfalz", SL:"Saarland", SN:"Sachsen", ST:"Sachsen-Anhalt", SH:"Schleswig-Holstein", TH:"Thüringen" };
const sleep = (ms) => new Promise(r=>setTimeout(r,ms));

async function geocode(q) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=de&addressdetails=1`;
  try { const r = await fetch(url,{headers:{"User-Agent":"persiusufer-crm/1.0","Accept-Language":"de"}}); if(!r.ok) return null; const a = await r.json(); if(!Array.isArray(a)||!a.length) return null; return {lat:parseFloat(a[0].lat), lon:parseFloat(a[0].lon), state:a[0].address?.state||null}; } catch { return null; }
}

const courts = [];
for (let off=0;;off+=1000){ const r=await fetch(`${DB}/rest/v1/companies?select=id,name,state_abbr&sector=eq.Amtsgericht&lat=is.null&limit=1000&offset=${off}`,{headers:H}); const rows=await r.json(); if(!Array.isArray(rows)||!rows.length) break; courts.push(...rows); if(rows.length<1000) break; }
console.log(`${courts.length} Gerichte ohne Koordinaten.`);

let ok=0, miss=0, i=0;
for (const c of courts) {
  const city = (c.name||"").replace(/^Amtsgericht\s+/,"").replace(/\s+Zweigstelle.*/,"").replace(/\s*-Vollstreckungsgericht-.*/i,"").trim();
  const land = LAND[c.state_abbr] || "";
  const g = await geocode(`Amtsgericht ${city}, ${land}, Deutschland`) || await geocode(`${city}, ${land}, Deutschland`);
  await sleep(1100);
  if (g) {
    await fetch(`${DB}/rest/v1/companies?id=eq.${c.id}`,{method:"PATCH",headers:{...H,"Content-Type":"application/json",Prefer:"return=minimal"},body:JSON.stringify({lat:g.lat,lon:g.lon,geocoded_at:new Date().toISOString()})});
    ok++;
  } else miss++;
  if (++i % 50 === 0) console.log(`  ... ${i}/${courts.length} (ok ${ok}, miss ${miss})`);
}
console.log(`FERTIG: geocoded ${ok}, ohne Treffer ${miss}`);
