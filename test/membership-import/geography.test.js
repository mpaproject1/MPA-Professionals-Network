import assert from "node:assert/strict";
import test from "node:test";
import {
  memberGeographyImportTemplate,
  previewMemberGeographyImport,
} from "../../src/membership/geography.js";
import { parseXlsxRows } from "../../src/platform/xlsx.js";

const admin={sub:"system-admin",roles:["system_admin"],permissions:[]};
const member={sub:"member-user",roles:["member"],permissions:[]};
const requestId="00000000-0000-4000-8000-000000000001";

test("geography reference workbook exposes a versioned parent-child import contract",()=>{
 const workbook=memberGeographyImportTemplate(admin);
 const {headers,rows}=parseXlsxRows(workbook);
 assert.deepEqual(headers,["unit_code","label","unit_level","parent_code","country_iso3","country_m49","source_name","source_version","effective_from","effective_to","active","metadata"]);
 assert.equal(rows.length,0);
});

test("ordinary members cannot preview administrative geography imports",async()=>{
 await assert.rejects(previewMemberGeographyImport(member,{xlsxBase64:"invalid"},requestId),error=>error.statusCode===403&&error.code==="FORBIDDEN");
});
