import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createXlsx } from "../src/platform/xlsx.js";
import { buildEthiopiaAdministrativeRows,ETHIOPIA_SOURCE_EXPECTED_COUNTS,SOURCE_VERSION as ETHIOPIA_SOURCE_VERSION,SOURCE_COMMIT } from "./lib/ethiopia-geography-reference.js";
const M49_URL="https://unstats.un.org/unsd/methodology/m49/overview/";
const ETHIOPIA_REPO="https://github.com/Jafermenza/ethiopia-administrative-divisions";
const ETHIOPIA_RAW="https://raw.githubusercontent.com/Jafermenza/ethiopia-administrative-divisions/"+SOURCE_COMMIT+"/data/";
const COLUMNS=["unit_code","label","unit_level","parent_code","country_iso3","country_m49","source_name","source_version","effective_from","effective_to","active","metadata"];
const retrievedAt=new Date().toISOString().slice(0,10);
function decodeHtml(value){return String(value||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code,16))).replace(/\s+/g," ").trim();}
function parseM49(html){
 const tables=[...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(m=>m[0]),table=tables.find(v=>/Country or Area/i.test(v)&&/ISO-alpha3 Code/i.test(v));
 if(!table)throw new Error("Could not locate the English UN M49 country/area table.");
 const raw=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(m=>[...m[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c=>decodeHtml(c[1])));
 const header=raw.find(r=>r.some(c=>c.toLowerCase()==="country or area"));if(!header)throw new Error("UN M49 table headers could not be identified.");
 const ix={name:header.findIndex(c=>c.toLowerCase()==="country or area"),m49:header.findIndex(c=>c.toLowerCase()==="m49 code"),iso3:header.findIndex(c=>c.toLowerCase()==="iso-alpha3 code")};
 if(Object.values(ix).some(i=>i<0))throw new Error("UN M49 country, M49 and ISO-alpha3 columns are required.");
 const rows=new Map();
 for(const cells of raw){const label=cells[ix.name],m49=cells[ix.m49],iso3=(cells[ix.iso3]||"").toUpperCase();if(!label||!/^[0-9]{3}$/.test(m49||"")||!/^[A-Z]{3}$/.test(iso3))continue;if(rows.has(iso3))throw new Error("Duplicate ISO-alpha3 code in UN M49 source: "+iso3);
  rows.set(iso3,{unit_code:iso3,label,unit_level:"country",parent_code:"",country_iso3:iso3,country_m49:m49,source_name:"United Nations Statistics Division — M49",source_version:"Retrieved "+retrievedAt,effective_from:"",effective_to:"",active:"true",metadata:JSON.stringify({classification:"UN M49 country or area",residenceSelectable:m49!=="010",sourceUrl:M49_URL})});}
 if(!rows.has("ETH"))throw new Error("UN M49 country/area table did not contain Ethiopia (ETH).");return [...rows.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
async function fetchJson(url,label){const response=await fetch(url,{headers:{"user-agent":"MPA-membership-geography-reference-generator/2.0"}});if(!response.ok)throw new Error(label+" download failed with HTTP "+response.status+" from "+url);try{return await response.json();}catch(e){throw new Error(label+" response was not valid JSON: "+e.message);}}
async function main(){
 const m49=await fetch(M49_URL,{headers:{"user-agent":"MPA-membership-geography-reference-generator/2.0"}});if(!m49.ok)throw new Error("UN M49 download failed with HTTP "+m49.status);
 const countries=parseM49(await m49.text());
 const [regions,zones,woredas]=await Promise.all([fetchJson(ETHIOPIA_RAW+"all-region.json","Ethiopia region dataset"),fetchJson(ETHIOPIA_RAW+"all-zone.json","Ethiopia zone dataset"),fetchJson(ETHIOPIA_RAW+"all-woreda.json","Ethiopia woreda dataset")]);
 const expected=ETHIOPIA_SOURCE_EXPECTED_COUNTS;
 if(regions.length!==expected.regions||zones.length!==expected.zones||woredas.length!==expected.woredas)throw new Error("Pinned Ethiopia source counts changed; stop for source review. Received regions/zones/woredas: "+regions.length+"/"+zones.length+"/"+woredas.length);
 const ethiopiaRows=buildEthiopiaAdministrativeRows({regions,zones,woredas,sourceUrls:{regions:ETHIOPIA_REPO+"/blob/"+SOURCE_COMMIT+"/data/all-region.json",zones:ETHIOPIA_REPO+"/blob/"+SOURCE_COMMIT+"/data/all-zone.json",woredas:ETHIOPIA_REPO+"/blob/"+SOURCE_COMMIT+"/data/all-woreda.json"}});
 const count=level=>ethiopiaRows.filter(r=>r.unit_level===level).length,actual={regions:count("region"),federalCities:count("federal_city"),zones:count("zone"),subCities:count("sub_city"),woredas:count("woreda")};
 if(actual.regions!==expected.includedRegions||actual.federalCities!==expected.includedFederalCities||actual.zones!==expected.includedZones||actual.subCities!==expected.includedSubCities||actual.woredas!==expected.includedWoredas)throw new Error("Mapped Ethiopian hierarchy counts do not match reviewed source contract: "+JSON.stringify(actual));
 const rows=[...countries,...ethiopiaRows],output=resolve(process.argv[2]||"artifacts/member-geography-reference.xlsx");await mkdir(dirname(output),{recursive:true});await writeFile(output,createXlsx(rows,COLUMNS));
 const manifest={generatedAt:retrievedAt,countryOrAreaCount:countries.length,ethiopiaSource:{repository:ETHIOPIA_REPO,commit:SOURCE_COMMIT,version:ETHIOPIA_SOURCE_VERSION,license:"CC-BY-4.0",sourceCounts:{regions:regions.length,zones:zones.length,woredas:woredas.length},includedCounts:actual,excluded:{contestedRegion:1,contestedZones:3,contestedWoredas:18,syntheticAddisGroupingZone:1},sourceUrls:[M49_URL,ETHIOPIA_REPO+"/tree/"+SOURCE_COMMIT]},ethiopiaCodeSystem:"Existing MPA internal stable identifiers for 12 regional states and two chartered cities; source identifiers retained for zones, sub-cities and woredas",lowerAdministrativeLevelsIncluded:actual.zones+actual.subCities+actual.woredas,rows:rows.length,output};
 await writeFile(output.replace(/\.xlsx$/i,".manifest.json"),JSON.stringify(manifest,null,2)+"\n");process.stdout.write(JSON.stringify(manifest)+"\n");
}
main().catch(e=>{process.stderr.write((e.stack||e.message)+"\n");process.exitCode=1;});