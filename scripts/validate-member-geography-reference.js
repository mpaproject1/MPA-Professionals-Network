import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseXlsxRows } from "../src/platform/xlsx.js";
const file=resolve(process.argv[2]||"artifacts/member-geography-reference.xlsx");
const required=["unit_code","label","unit_level","parent_code","country_iso3","country_m49","source_name","source_version","active","metadata"];
const workbook=parseXlsxRows(await readFile(file));for(const c of required)assert.ok(workbook.headers.includes(c),"Missing required geography workbook column: "+c);
assert.ok(workbook.rows.length>100,"UN M49 workbook unexpectedly contains too few country/area rows.");
const byCode=new Map(),iso3=new Set(),m49=new Set(),sourceIds=new Set();
for(const row of workbook.rows){const code=String(row.unit_code||"").trim().toUpperCase();assert.ok(code,"Every geography row needs a stable unit code.");assert.ok(!byCode.has(code),"Duplicate geography unit code: "+code);byCode.set(code,row);assert.ok(String(row.label||"").trim());assert.ok(String(row.source_name||"").trim());assert.ok(String(row.source_version||"").trim());
 const meta=typeof row.metadata==="string"?JSON.parse(row.metadata):row.metadata;assert.ok(meta&&typeof meta==="object"&&!Array.isArray(meta));assert.match(String(meta.sourceUrl||""),/^https:\/\//i);
 if(row.unit_level==="country"){assert.match(String(row.country_iso3||""),/^[A-Z]{3}$/);assert.match(String(row.country_m49||""),/^[0-9]{3}$/);assert.ok(!iso3.has(String(row.country_iso3)));assert.ok(!m49.has(String(row.country_m49)));iso3.add(String(row.country_iso3));m49.add(String(row.country_m49));assert.equal(String(row.parent_code||""),"");}
 else{assert.equal(String(row.country_iso3||""),"");assert.equal(String(row.country_m49||""),"");assert.ok(meta.sourceId,"Ethiopian rows must retain their source identifier: "+code);assert.ok(!sourceIds.has(String(meta.sourceId)),"Duplicate Ethiopian source ID: "+meta.sourceId);sourceIds.add(String(meta.sourceId));}}
assert.ok(byCode.has("ETH"),"The workbook must contain Ethiopia (ETH).");
const ethiopia=workbook.rows.filter(r=>r.unit_level!=="country"&&(String(r.unit_code).startsWith("ET-")||/^ET[0-9]/.test(String(r.unit_code))));
const levelOne=ethiopia.filter(r=>r.parent_code==="ETH");assert.equal(levelOne.filter(r=>r.unit_level==="region").length,12);assert.equal(levelOne.filter(r=>r.unit_level==="federal_city").length,2);
const counts={zone:0,sub_city:0,woreda:0};
for(const row of ethiopia){const parent=byCode.get(String(row.parent_code||""));assert.ok(parent,"Every Ethiopian parent must exist: "+row.unit_code);
 if(["region","federal_city"].includes(row.unit_level))assert.equal(parent.unit_code,"ETH");
 if(row.unit_level==="zone"){assert.equal(parent.unit_level,"region");counts.zone++;}
 if(row.unit_level==="sub_city"){assert.equal(parent.unit_level,"federal_city");counts.sub_city++;}
 if(row.unit_level==="woreda"){assert.ok(["zone","sub_city"].includes(parent.unit_level));counts.woreda++;}
 const meta=typeof row.metadata==="string"?JSON.parse(row.metadata):row.metadata;assert.notEqual(String(meta.sourceParentId||""),"ET99","Contested-source descendants must be excluded.");}
assert.deepEqual(counts,{zone:101,sub_city:13,woreda:1119},"Mapped counts must match the reviewed 2026-09-08 source release.");
assert.equal(ethiopia.filter(r=>r.unit_level==="sub_city"&&String(r.unit_code).startsWith("ET14")).length,11);
assert.equal(ethiopia.filter(r=>r.unit_level==="sub_city"&&String(r.unit_code).startsWith("ET15")).length,2);
assert.ok(!ethiopia.some(r=>String(r.unit_code)==="ET99"||String(r.unit_code).startsWith("ET99")));
const manifest={file,rows:workbook.rows.length,countries:workbook.rows.filter(r=>r.unit_level==="country").length,ethiopia:{regions:12,charteredCities:2,zones:counts.zone,subCities:counts.sub_city,woredas:counts.woreda,excludedContestedRegion:1,excludedContestedZones:3,excludedContestedWoredas:18}};
process.stdout.write(JSON.stringify(manifest,null,2)+"\n");