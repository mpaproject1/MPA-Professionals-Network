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
 await page.addInitScript(()=>{sessionStorage.setItem("mpa-session-token","membership-card-print-ci-token");window.print=()=>{window.__membershipPrintInvoked=true;};});
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
 expect(await page.evaluate(()=>window.__membershipPrintInvoked)).toBe(true);
 await page.emulateMedia({media:"print"});
 const pdf=await page.pdf({format:"A4",printBackground:true,preferCSSPageSize:true});
 expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
 const directory=await mkdtemp(join(tmpdir(),"mpa-membership-cards-"));
 const pdfPath=join(directory,"membership-cards.pdf");
 try{
  await writeFile(pdfPath,pdf);
  const parser="from pypdf import PdfReader\nimport sys\nr=PdfReader(sys.argv[1])\nprint('PAGES='+str(len(r.pages)))\\nprint('A4='+str(all(abs(float(p.mediabox.width)-595.28)<1 and abs(float(p.mediabox.height)-841.89)<1 for p in r.pages)))\nprint('TEXT='+'\\n'.join((p.extract_text() or '') for p in r.pages))";
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
