import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createXlsx } from "../src/platform/xlsx.js";

const M49_URL="https://unstats.un.org/unsd/methodology/m49/overview/";
const COLUMNS=["unit_code","label","unit_level","parent_code","country_iso3","country_m49","source_name","source_version","effective_from","effective_to","active","metadata"];
const retrievedAt=new Date().toISOString().slice(0,10);
const regions=[
 ["ET-REG-AFAR","Afar","region"],
 ["ET-REG-AMHARA","Amhara","region"],
 ["ET-REG-BENISHANGUL-GUMUZ","Benishangul-Gumuz","region"],
 ["ET-REG-SOUTH-ETHIOPIA","South Ethiopia","region"],
 ["ET-REG-GAMBELLA","Gambella","region"],
 ["ET-REG-HARARI","Harari","region"],
 ["ET-REG-CENTRAL-ETHIOPIA","Central Ethiopia","region"],
 ["ET-REG-OROMIA","Oromia","region"],
 ["ET-REG-SIDAMA","Sidama","region"],
 ["ET-REG-SOMALI","Somali","region"],
 ["ET-REG-TIGRAY","Tigray","region"],
 ["ET-REG-SOUTHWEST-ETHIOPIA","Southwest Ethiopia Peoples","region"],
 ["ET-FED-ADDIS-ABABA","Addis Ababa","federal_city"],
 ["ET-FED-DIRE-DAWA","Dire Dawa","federal_city"]
];
function decodeHtml(value){
 return String(value||"").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&#(\d+);/g,(_,code)=>String.fromCodePoint(Number(code))).replace(/&#x([0-9a-f]+);/gi,(_,code)=>String.fromCodePoint(parseInt(code,16))).replace(/\s+/g," ").trim();
}
function parseM49(html){
 const tables=[...html.matchAll(/<table\b[\s\S]*?<\/table>/gi)].map(match=>match[0]);
 const table=tables.find(value=>/Country or Area/i.test(value)&&/ISO-alpha3 Code/i.test(value));
 if(!table)throw new Error("Could not locate the English UN M49 country/area table.");
 const rawRows=[...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match=>[...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell=>decodeHtml(cell[1])));
 const header=rawRows.find(row=>row.some(cell=>cell.toLowerCase()==="country or area"));
 if(!header)throw new Error("UN M49 table headers could not be identified.");
 const indexes={name:header.findIndex(cell=>cell.toLowerCase()==="country or area"),m49:header.findIndex(cell=>cell.toLowerCase()==="m49 code"),iso3:header.findIndex(cell=>cell.toLowerCase()==="iso-alpha3 code")};
 if(Object.values(indexes).some(index=>index<0))throw new Error("UN M49 country, M49 and ISO-alpha3 columns are required.");
 const rows=new Map();
 for(const cells of rawRows){
  const label=cells[indexes.name],m49=cells[indexes.m49],iso3=(cells[indexes.iso3]||"").toUpperCase();
  if(!label||!/^[0-9]{3}$/.test(m49||"")||!/^[A-Z]{3}$/.test(iso3))continue;
  if(rows.has(iso3))throw new Error("Duplicate ISO-alpha3 code in UN M49 source: "+iso3);
  rows.set(iso3,{unit_code:iso3,label,unit_level:"country",parent_code:"",country_iso3:iso3,country_m49:m49,source_name:"United Nations Statistics Division — M49",source_version:"Retrieved "+retrievedAt,effective_from:"",effective_to:"",active:"true",metadata:JSON.stringify({classification:"UN M49 country or area",residenceSelectable:m49!=="010",sourceUrl:M49_URL})});
 }
 if(!rows.has("ETH"))throw new Error("UN M49 country/area table did not contain Ethiopia (ETH).");
 return [...rows.values()].sort((a,b)=>a.label.localeCompare(b.label));
}
async function main(){
 const response=await fetch(M49_URL,{headers:{"user-agent":"MPA-membership-geography-reference-generator/1.0"}});
 if(!response.ok)throw new Error("UN M49 download failed with HTTP "+response.status);
 const html=await response.text(),countries=parseM49(html);
 const rows=[...countries];
 for(const [code,label,level] of regions)rows.push({unit_code:code,label,unit_level:level,parent_code:"ETH",country_iso3:"",country_m49:"",source_name:"Permanent Committee on Geographical Names (PCGN), as cited by UK Home Office CPIN",source_version:"UK Home Office CPIN September 2025 (updated 29 October 2026); cited PCGN reference September 2024",effective_from:"",effective_to:"",active:"true",metadata:JSON.stringify({sourceUrl:"https://www.gov.uk/government/publications/ethiopia-country-policy-and-information-notes/country-policy-and-information-note-internal-relocation-ethiopia-september-2025-accessible",classification:"Ethiopian region or chartered city",codeSystem:"MPA internal stable identifier; not an official Ethiopian government code"})});
 const buffer=createXlsx(rows,COLUMNS),output=resolve(process.argv[2]||"artifacts/member-geography-reference.xlsx");
 await mkdir(dirname(output),{recursive:true});await writeFile(output,buffer);
 const manifest={source:M49_URL,retrievedAt,countryOrAreaCount:countries.length,ethiopiaRegionCount:regions.filter(([, ,level])=>level==="region").length,ethiopiaCharteredCityCount:regions.filter(([, ,level])=>level==="federal_city").length,ethiopiaRegionAndCityCount:regions.length,lowerAdministrativeLevelsIncluded:0,ethiopiaCodeSystem:"MPA internal stable identifiers; not official Ethiopian government codes",sourceUrls:[M49_URL,"https://www.gov.uk/government/publications/ethiopia-country-policy-and-information-notes/country-policy-and-information-note-internal-relocation-ethiopia-september-2025-accessible"],rows:rows.length,output};
 await writeFile(output.replace(/\.xlsx$/i,".manifest.json"),JSON.stringify(manifest,null,2)+"\n");
 process.stdout.write(JSON.stringify(manifest)+"\n");
}
main().catch(error=>{process.stderr.write((error.stack||error.message)+"\n");process.exitCode=1;});
