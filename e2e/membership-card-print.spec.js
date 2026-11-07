import { execFileSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

const candidates=[
 {membershipNumber:"MPA-2026-11AA22BB",memberName:"Ada Lovelace",membershipType:"Professional",startDate:"2026-01-01",endDate:"2026-12-31"},
 {membershipNumber:"MPA-2026-33CC44DD",memberName:"Grace Hopper",membershipType:"Lifetime",startDate:"2026-02-01",endDate:null}
];
const settings={header_text:"Muslim Professionals Association",subtitle_text:"Membership ID",footer_text:"Verify membership using the QR code",background_style:"geometric",background_start:"#0A3258",background_end:"#174A78",accent_color:"#E5F044",text_color:"#FFFFFF",show_membership_type:true};
const cards=candidates.map(candidate=>({...candidate,status:"active",verificationPath:"/membership/verify?membershipNumber="+encodeURIComponent(candidate.membershipNumber)+"&token="+"a".repeat(43),settings}));

test("bulk membership print produces independently parsed A4 PDF with one eligible card per page",async({page})=>{
 await page.addInitScript(()=>{sessionStorage.setItem("mpa-session-token","membership-card-print-ci-token");localStorage.setItem("mpa-privacy-preferences-v1",JSON.stringify({version:"2026-10-16-v1",necessary:true,analytics:false,personalization:false,updatedAt:new Date().toISOString()}));window.print=()=>{window.__membershipPrintInvoked=true;};});
 await page.route("**/api/v1/admin/membership-cards/eligible**",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({items:candidates,total:candidates.length,limit:100,offset:0,hasMore:false})}));
 await page.route("**/api/v1/admin/membership-cards/print",async route=>{ expect(route.request().method()).toBe("POST"); expect(route.request().postDataJSON().batchReference).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"); await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({recorded:true})}); });
 await page.route("**/api/v1/admin/membership-cards/batch",async route=>{
  expect(route.request().method()).toBe("POST");
  const body=route.request().postDataJSON();
  expect(body.membershipNumbers).toEqual(candidates.map(item=>item.membershipNumber));
  await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({batchReference:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",cards,skipped:[],selectedCount:2,generatedCount:2,skippedCount:0})});
 });
 await page.goto("/admin/membership-cards");
 await expect(page.getByRole("heading",{name:"Single and bulk card printing"})).toBeVisible();
 await page.getByRole("checkbox",{name:"Select Ada Lovelace MPA-2026-11AA22BB"}).check();
 await page.getByRole("checkbox",{name:"Select Grace Hopper MPA-2026-33CC44DD"}).check();
 await expect(page.getByText("2 selected")).toBeVisible();
 await page.getByRole("button",{name:"Prepare 2 cards"}).click();
 await expect(page.getByRole("heading",{name:"Review before printing"})).toBeVisible();
 await expect(page.getByText(/2 eligible cards prepared/)).toBeVisible();
 await page.getByRole("button",{name:"Print / Save PDF"}).click();
 await expect.poll(()=>page.evaluate(()=>window.__membershipPrintInvoked)).toBe(true);
 await page.emulateMedia({media:"print"});
 const pdf=await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true});
 expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
 const directory=await mkdtemp(join(tmpdir(),"mpa-membership-cards-"));
 const pdfPath=join(directory,"membership-cards.pdf");
 try{
  await writeFile(pdfPath,pdf);
  const parserLines = [
    "from pypdf import PdfReader",
    "import sys",
    "r=PdfReader(sys.argv[1])",
    "print('PAGES='+str(len(r.pages)))",
    "print('A4='+str(all(abs(float(p.mediabox.width)-595.28)<1 and abs(float(p.mediabox.height)-841.89)<1 for p in r.pages)))",
    "print('TEXT='+chr(10).join((p.extract_text() or '') for p in r.pages))"
  ];
  const parser=parserLines.join("\n");
  const extracted=execFileSync("python3",["-c",parser,pdfPath],{encoding:"utf8"});
  expect(extracted).toContain("PAGES=2");
  expect(extracted).toContain("A4=True");
  expect(extracted).toContain("Ada Lovelace");
  expect(extracted).toContain("Grace Hopper");
  expect(extracted).toContain("MPA-2026-11AA22BB");
  expect(extracted).toContain("MPA-2026-33CC44DD");
  expect(extracted).toContain("SCAN TO VERIFY");
  expect(extracted).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  expect(extracted).not.toContain("@");
  expect(extracted).not.toMatch(/payment|recovery email|private address/i);
 }finally{await rm(directory,{recursive:true,force:true});}
});


test("single member membership ID PDF is one exact-size card with no portal chrome or extra page",async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem("mpa-session-token","membership-card-single-print-ci-token");
  localStorage.setItem("mpa-privacy-preferences-v1",JSON.stringify({version:"2026-10-16-v1",necessary:true,analytics:false,personalization:false,updatedAt:new Date().toISOString()}));
 });
 const singleCard={membershipNumber:"MPA-2026-77DD88EE",memberName:"Amina Yusuf",membershipType:"Professional",status:"active",startDate:"2026-01-01",endDate:"2026-12-31",verificationPath:"/membership/verify?membershipNumber=MPA-2026-77DD88EE&token="+"b".repeat(43),settings};
 await page.route("**/api/v1/membership/card",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:singleCard})}));
 await page.route("**/api/v1/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{has_active_membership:true,roles:["member"],permissions:[],email:"amina@example.test",display_name:"Amina Yusuf"}})}));
 await page.goto("/membership/card");
 await expect(page.getByRole("heading",{name:"Membership ID"})).toBeVisible();
 await expect(page.getByText("Amina Yusuf")).toBeVisible();
 await page.emulateMedia({media:"print"});
 const pdf=await page.pdf({printBackground:true,preferCSSPageSize:true});
 expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
 const directory=await mkdtemp(join(tmpdir(),"mpa-single-membership-card-"));
 const pdfPath=join(directory,"membership-id.pdf");
 try{
  await writeFile(pdfPath,pdf);
  const parser=[
   "from pypdf import PdfReader",
   "import sys",
   "r=PdfReader(sys.argv[1])",
   "print('PAGES='+str(len(r.pages)))",
   "print('ID_SIZE='+str(all(abs(float(p.mediabox.width)-242.65)<0.5 and abs(float(p.mediabox.height)-153.01)<0.5 for p in r.pages)))",
   "print('TEXT='+chr(10).join((p.extract_text() or '') for p in r.pages))"
  ].join("\n");
  const extracted=execFileSync("python3",["-c",parser,pdfPath],{encoding:"utf8"});
  expect(extracted).toContain("PAGES=1");
  expect(extracted).toContain("ID_SIZE=True");
  expect(extracted).toContain("Amina Yusuf");
  expect(extracted).toContain("MPA-2026-77DD88EE");
  expect(extracted).toContain("SCAN TO VERIFY");
  expect(extracted).not.toContain("OFFICIAL MEMBER CREDENTIAL");
  expect(extracted).not.toContain("Download PDF");
  expect(extracted).not.toContain("Profile & photo");
  expect(extracted).not.toContain("Job Portal");
  expect(extracted).not.toContain("My-Workspace");
  expect(extracted).not.toContain("@");
  expect(extracted).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
 }finally{await rm(directory,{recursive:true,force:true});}
});

test("membership workspace still loads the canonical ID and plan when the separate account summary request fails",async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem("mpa-session-token","membership-workspace-card-fallback-ci-token");
  localStorage.setItem("mpa-privacy-preferences-v1",JSON.stringify({version:"2026-10-16-v1",necessary:true,analytics:false,personalization:false,updatedAt:new Date().toISOString()}));
 });
 const card={membershipNumber:"MPA-2026-99AA11BB",memberName:"Amina Yusuf",membershipType:"Lifetime",status:"active",startDate:"2026-01-01",endDate:null,renewalRequired:false,verificationPath:"/membership/verify?membershipNumber=MPA-2026-99AA11BB&token="+"c".repeat(43),settings};
 await page.route("**/api/v1/membership/products",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})}));
 await page.route("**/api/v1/membership/applications/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})}));
 await page.route("**/api/v1/me",route=>route.fulfill({status:503,contentType:"application/json",body:JSON.stringify({error:{code:"TEMPORARY_FAILURE",message:"Account summary temporarily unavailable."}})}));
 await page.route("**/api/v1/membership/card",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:card})}));
 await page.goto("/membership");
 await expect(page.getByText("Your membership is active")).toBeVisible();
 await expect(page.getByText("MPA-2026-99AA11BB")).toBeVisible();
 await expect(page.getByText("Lifetime",{exact:true})).toBeVisible();
 await expect(page.getByRole("link",{name:/View \/ download membership ID/i})).toBeVisible();
});

test("imported membership awaiting Finance settlement is not shown as inactive or prompted to reapply",async({page})=>{
 await page.addInitScript(()=>{
  sessionStorage.setItem("mpa-session-token","membership-workspace-finance-verification-ci-token");
  localStorage.setItem("mpa-privacy-preferences-v1",JSON.stringify({version:"2026-10-16-v1",necessary:true,analytics:false,personalization:false,updatedAt:new Date().toISOString()}));
 });
 await page.route("**/api/v1/membership/products",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})}));
 await page.route("**/api/v1/membership/applications/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})}));
 await page.route("**/api/v1/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{has_active_membership:false,membership_payment_verification_required:true,roles:["member"],permissions:[],email:"imported@example.test",display_name:"Imported Member"}})}));
 await page.route("**/api/v1/membership/card",route=>route.fulfill({status:409,contentType:"application/json",body:JSON.stringify({error:{code:"MEMBERSHIP_NOT_ELIGIBLE",message:"This membership is payment_verification_required and cannot be used to issue a card."}})}));
 await page.goto("/membership");
 await expect(page.getByRole("heading",{name:"Your imported membership needs Finance verification"})).toBeVisible();
 await expect(page.getByText("Finance verification required",{exact:true})).toBeVisible();
 await expect(page.getByText(/Do not submit a duplicate membership application/)).toBeVisible();
 await expect(page.getByRole("link",{name:"Explore membership plans"})).toHaveCount(0);
 await expect(page.getByRole("heading",{name:"Available membership plans"})).toHaveCount(0);
});
