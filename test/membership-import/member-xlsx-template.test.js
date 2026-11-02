import assert from "node:assert/strict";
import test from "node:test";
import { memberImportXlsxTemplate } from "../../src/membership/admin-bulk.js";
import { parseXlsxRows } from "../../src/platform/xlsx.js";

const admin={sub:"system-admin",roles:["system_admin"],permissions:[]};

test("member Excel template keeps mandatory member and payment fields and includes optional profile fields",()=>{
 const {headers,rows}=parseXlsxRows(memberImportXlsxTemplate(admin));
 for(const field of ["full_name","email","phone","gender","membership_type","product_code","amount_paid","status","registered_date","membership_number","start_date","end_date","approved_membership","approval_reference"])assert.ok(headers.includes(field),field+" must be in the workbook");
 for(const field of ["education_background","location_or_address","qualification","field_of_study","department","volunteer_pledge","volunteer_services","volunteer_hours_per_week","residence_type","country_iso3","region_or_federal_city","zone_or_sub_city","district_or_town","street_address"])assert.ok(headers.includes(field),field+" must be an optional workbook column");
 assert.equal(rows.length,0);
});
