import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseXlsxRows } from "../src/platform/xlsx.js";

const file=resolve(process.argv[2]||"artifacts/member-geography-reference.xlsx");
const required=["unit_code","label","unit_level","parent_code","country_iso3","country_m49","source_name","source_version","active","metadata"];
const workbook=parseXlsxRows(await readFile(file));
for(const column of required)assert.ok(workbook.headers.includes(column),"Missing required geography workbook column: "+column);
assert.ok(workbook.rows.length>100,"UN M49 workbook unexpectedly contains too few country/area rows.");
const byCode=new Map(),iso3Codes=new Set(),m49Codes=new Set();
for(const row of workbook.rows){
 const code=String(row.unit_code||"").trim().toUpperCase();
 assert.ok(code,"Every geography row needs a stable unit code.");
 assert.ok(!byCode.has(code),"Duplicate geography unit code: "+code);
 byCode.set(code,row);
 assert.ok(String(row.label||"").trim(),"Every geography row needs a label.");
 assert.ok(String(row.source_name||"").trim(),"Every geography row needs source_name.");
 assert.ok(String(row.source_version||"").trim(),"Every geography row needs source_version.");
 const metadata=typeof row.metadata==="string"?JSON.parse(row.metadata):row.metadata;
 assert.ok(metadata&&typeof metadata==="object"&&!Array.isArray(metadata),"Invalid metadata for "+code);
 assert.match(String(metadata.sourceUrl||""),/^https:\/\//i,"Every row needs an HTTPS source URL: "+code);
 if(row.unit_level==="country"){
  assert.match(String(row.country_iso3||""),/^[A-Z]{3}$/,"Country row has invalid ISO-alpha3: "+code);
  assert.match(String(row.country_m49||""),/^[0-9]{3}$/,"Country row has invalid M49 code: "+code);
  assert.ok(!iso3Codes.has(String(row.country_iso3)),"Duplicate country ISO-alpha3 code: "+row.country_iso3);
  assert.ok(!m49Codes.has(String(row.country_m49)),"Duplicate UN M49 code: "+row.country_m49);
  iso3Codes.add(String(row.country_iso3));m49Codes.add(String(row.country_m49));
  assert.equal(String(row.parent_code||""),"","Country rows cannot have parents.");
 }else{
  assert.equal(String(row.parent_code||""),"ETH","Only Ethiopia level-one records may be added by this reference generator.");
  assert.equal(String(row.country_iso3||""),"");
  assert.equal(String(row.country_m49||""),"");
  assert.ok(byCode.has("ETH")||workbook.rows.some(candidate=>candidate.unit_code==="ETH"),"Ethiopia parent must be present.");
  assert.ok(["region","federal_city"].includes(row.unit_level),"Unverified lower administrative levels must not be generated.");
  assert.match(String(metadata.codeSystem||""),/MPA internal stable identifier/i,"Ethiopian level-one codes must be explicitly labelled as MPA internal codes, not official government codes.");
 }
}
assert.ok(byCode.has("ETH"),"The workbook must contain Ethiopia (ETH).");
const levelOne=workbook.rows.filter(row=>row.parent_code==="ETH");
assert.equal(levelOne.length,14,"Expected the sourced 12 Ethiopian regions and two chartered cities.");
assert.equal(levelOne.filter(row=>row.unit_level==="region").length,12);
assert.equal(levelOne.filter(row=>row.unit_level==="federal_city").length,2);
const manifest={file,rows:workbook.rows.length,countries:workbook.rows.filter(row=>row.unit_level==="country").length,ethiopiaRegions:12,ethiopiaCharteredCities:2,lowerAdministrativeLevelsIncluded:0,sourceUrls:[...new Set(workbook.rows.map(row=>(typeof row.metadata==="string"?JSON.parse(row.metadata):row.metadata).sourceUrl))]};
process.stdout.write(JSON.stringify(manifest,null,2)+"\n");
