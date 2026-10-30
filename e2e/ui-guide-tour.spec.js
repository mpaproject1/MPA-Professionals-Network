import {expect,test} from "@playwright/test";

const globalGuide=[{id:"tour-global",guide_key:"global-navigation",route_pattern:"*",title:"Getting around MPA",description:"A short orientation.",steps:[
 {target:'[data-guide-target="brand-home"]',title:"Return home",text:"Use the MPA brand to return home."},
 {target:'[data-guide-target="main-navigation"]',title:"Move between workspaces",text:"Use the visible navigation."},
 {target:'[data-guide-target="help-control"]',title:"Restart the guide",text:"Open this guide whenever you need help."}
]}];

test.describe("Accessible contextual screen tours",()=>{
 test("supports progress, Back, Next, Skip, Finish, restart and does not block page controls",async({page})=>{
  await page.route("**/api/v1/experience/guides**",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(globalGuide)}));
  await page.setViewportSize({width:1280,height:800});
  const guidesLoaded=page.waitForResponse(/\/api\/v1\/experience\/guides/);
  await page.goto("/");
  await guidesLoaded;
  const open=page.getByRole("button",{name:"Show me around this screen"});
  await expect(open).toBeVisible();
  await open.click();
  const dialog=page.getByRole("dialog",{name:"Getting around MPA"});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Step 1 of 3");
  await expect(dialog.getByRole("button",{name:"Back"})).toBeDisabled();
  await dialog.getByRole("button",{name:"Next"}).click();
  await expect(dialog).toContainText("Step 2 of 3");
  await dialog.getByRole("button",{name:"Back"}).click();
  await expect(dialog).toContainText("Step 1 of 3");
  const jobLink=page.getByRole("navigation",{name:"Main navigation"}).getByRole("link",{name:"Job Portal"});
  await expect(jobLink).toBeVisible();
  const nextRouteGuide=page.waitForResponse(/\/api\/v1\/experience\/guides/);
  await jobLink.click();
  await nextRouteGuide;
  await expect(page).toHaveURL(/\/jobs$/);
  await expect(page.getByTestId("guide-overlay")).toBeVisible();
  await page.getByRole("button",{name:"Skip"}).click();
  await expect(page.getByTestId("guide-overlay")).toHaveCount(0);
  await page.getByRole("button",{name:"Open MPA support"}).click();
  await expect(page.getByRole("region",{name:"MPA support assistant"})).toBeVisible();
  await page.getByRole("button",{name:"Show me around this screen"}).click();
  await expect(page.getByRole("region",{name:"MPA support assistant"})).toHaveCount(0);
  const tour=page.getByRole("dialog",{name:"Getting around MPA"});
  await tour.getByRole("button",{name:"Next"}).click();
  await tour.getByRole("button",{name:"Next"}).click();
  await expect(tour).toContainText("Step 3 of 3");
  await tour.getByRole("button",{name:"Finish"}).click();
  await expect(page.getByTestId("guide-overlay")).toHaveCount(0);
 });

 test("mobile layout shows an explanation rather than an empty spotlight when a target is unavailable",async({page})=>{
  const paymentGuide=[{id:"tour-payment",guide_key:"membership-payment",route_pattern:"/membership/payment",title:"Membership payment and receipt",description:"Follow payment status.",steps:[
   {target:'[data-guide-target="payment-overview"]',title:"Payment is separate",text:"Payment verification does not activate membership."},
   {target:'[data-guide-target="payment-submit"]',title:"Submit configured evidence",text:"Follow the configured method instructions."}
  ]}];
  await page.route("**/api/v1/experience/guides**",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(paymentGuide)}));
  await page.setViewportSize({width:390,height:844});
  const guidesLoaded=page.waitForResponse(/\/api\/v1\/experience\/guides/);
  await page.goto("/membership/payment");
  await guidesLoaded;
  await page.getByRole("button",{name:"Show me around this screen"}).click();
  const dialog=page.getByRole("dialog",{name:"Membership payment and receipt"});
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("Step 1 of 2");
  await expect(dialog).toContainText("That control is not visible in this layout");
  await expect(dialog.getByRole("button",{name:"Skip"})).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Close tour"})).toBeVisible();
  await dialog.getByRole("button",{name:"Skip"}).click();
  await expect(page.getByTestId("guide-overlay")).toHaveCount(0);
 });
});
