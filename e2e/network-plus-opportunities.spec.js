import { expect, test } from "@playwright/test";

const business={id:"np-business-1",display_name:"Verified Digital Studio",business_kind:"individual",verification_status:"verified",moderation_status:"approved",publication_status:"published"};
const taxonomy=[
 {code:"technology",parent_code:null,label:"Technology & digital",description:"Software, IT and data.",listing_kinds:["need","offer","service_profile"],field_schema:[{code:"technology_area",label:"Technology area",type:"multiselect",options:["software","data","ai"],required:true}]},
 {code:"software_development",parent_code:"technology",label:"Software development",description:"Application engineering.",listing_kinds:["need","offer","service_profile"],field_schema:[{code:"platform",label:"Platform",type:"multiselect",options:["web","mobile","api"],required:true}]},
 {code:"products_supply",parent_code:null,label:"Products & supply",description:"Products and materials.",listing_kinds:["need","offer","product_profile"],field_schema:[{code:"product_type",label:"Product type",type:"select",options:["equipment","raw_material"],required:true}]}
];
const listing={id:"np-listing-1",business_id:business.id,business_name:business.display_name,title:"Data engineering support",summary:"Experienced team available for data engineering and analytics.",description:"A verified professional offer for data engineering, analytics and implementation.",category_code:"technology",subcategory_code:"software_development",listing_kind:"offer",structured_attributes:{technology_area:["data"],platform:["web"]},wizard_step:7,status:"published",audience:"both",delivery_mode:"hybrid",location_label:"Addis Ababa",pricing_model:"quote",published_at:"2026-11-03T10:00:00Z"};

async function mockOpportunityMall(page,{drafts=[],items=[listing]}={}){
 await page.addInitScript(()=>window.sessionStorage.setItem("mpa-session-token","e2e-opportunity-session"));
 await page.route("**/api/v1/me",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{user_id:"e2e-user",roles:["member"]}})}));
 await page.route("**/api/v1/organizations",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})}));
 await page.route("**/api/v1/notifications?*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{counts:{unread:0}}})}));
 await page.route("**/api/v1/network-plus/access",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{eligible:true,access:{member:true,organization:false},nextAction:"Choose discovery."}})}));
 await page.route("**/api/v1/network-plus/listing-taxonomy",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:taxonomy})}));
 await page.route("**/api/v1/network-plus/geography-reference",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{version:null,countries:[],regions:[],federalCities:[],children:[]}})}));
 await page.route("**/api/v1/network-plus/my/businesses",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[business]})}));
 await page.route("**/api/v1/network-plus/my/listings",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:drafts})}));
 await page.route("**/api/v1/network-plus/listings*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{items,limit:20,offset:0,total:items.length,hasMore:false}})}));
}

test("professional opportunity mall searches verified Needs, Offers and discovery-only profiles",async({page})=>{
 await mockOpportunityMall(page);await page.setViewportSize({width:1440,height:900});await page.goto("/network-plus/opportunities");
 await expect(page.getByRole("heading",{name:"Needs & Offers"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Explore the opportunity mall"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Data engineering support"})).toBeVisible();
 await expect(page.getByText("Professional connection listing")).toBeVisible();
 await page.getByLabel("Listing type").selectOption("offer");await page.getByLabel("Category").selectOption("technology");await page.getByLabel("Search opportunities").fill("Data engineering");
 await expect(page.getByRole("heading",{name:"Data engineering support"})).toBeVisible();
 await page.getByRole("button",{name:"View details"}).click();
 await expect(page.getByRole("dialog",{name:"Opportunity details"})).toBeVisible();
 await expect(page.getByText(/does not process orders, payments or delivery/i)).toBeVisible();
});

test("guided listing wizard autosaves category-specific fields and submits for moderation",async({page})=>{
 let draft={...listing,id:"np-draft-1",status:"draft",title:null,summary:null,description:null,category_code:null,subcategory_code:null,structured_attributes:{},wizard_step:1};
 let lastSaved=null,submitted=false;
 await mockOpportunityMall(page,{drafts:[]});
 await page.route("**/api/v1/network-plus/businesses/np-business-1/listings/drafts",async route=>{expect(route.request().headers()["x-idempotency-key"]).toBeTruthy();await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({data:draft})});});
 await page.route("**/api/v1/network-plus/services/np-draft-1/draft",async route=>{lastSaved=route.request().postDataJSON();draft={...draft,...lastSaved};await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:draft})});});
 await page.route("**/api/v1/network-plus/services/np-draft-1/submit",async route=>{submitted=true;await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{...draft,status:"pending_review"}})});});
 await page.goto("/network-plus/opportunities");await page.getByRole("button",{name:"Create listing"}).click();
 await page.getByRole("button",{name:/I offer/}).first().click();await page.getByRole("button",{name:"Start private draft"}).click();
 await expect(page.getByText("Step 1 of 8")).toBeVisible();await page.getByRole("button",{name:"Continue"}).click();
 await page.getByRole("button",{name:"Technology & digital"}).click();await page.getByRole("button",{name:"Continue"}).click();
 await page.getByLabel("Listing title").fill("Data engineering support");
 await page.getByLabel("Short summary").fill("Experienced team available for data engineering and analytics.");
 await page.getByLabel("Description").fill("A professional team can design and implement data pipelines, analytics and reporting for organizations.");
 await page.getByRole("button",{name:"Continue"}).click();
 await page.getByLabel("More specific category").selectOption("software_development");
 await page.getByLabel("Technology area").selectOption(["data"]);await page.getByLabel("Platform").selectOption(["web"]);
 await page.getByRole("button",{name:"Continue"}).click();await page.getByRole("button",{name:"Continue"}).click();await page.getByRole("button",{name:"Continue"}).click();await page.getByRole("button",{name:"Continue"}).click();
 await expect(page.getByRole("heading",{name:"Ready to submit?"})).toBeVisible();
 await page.getByRole("button",{name:"Submit for independent moderation"}).click();
 await expect.poll(()=>submitted).toBe(true);await expect(page.getByRole("heading",{name:"My listings"})).toBeVisible();
 expect(lastSaved.listingKind).toBe("offer");expect(lastSaved.structuredAttributes.technology_area).toEqual(["data"]);expect(lastSaved.structuredAttributes.platform).toEqual(["web"]);expect(lastSaved.wizardStep).toBe(8);
});

test("saved drafts resume at the persisted wizard step with category-specific answers",async({page})=>{
 const draft={...listing,id:"np-resume-1",status:"draft",wizard_step:4,draft_saved_at:"2026-11-03T10:00:00Z"};
 await mockOpportunityMall(page,{drafts:[draft]});
 await page.route("**/api/v1/network-plus/services/np-resume-1/draft",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:draft})}));
 await page.goto("/network-plus/opportunities");await page.getByRole("button",{name:"My listings"}).click();
 await page.getByRole("button",{name:"Resume draft"}).click();
 await expect(page.getByText("Step 4 of 8")).toBeVisible();
 await expect(page.getByLabel("More specific category")).toHaveValue("software_development");
 await expect(page.getByLabel("Technology area")).toHaveValue(["data"]);await expect(page.getByLabel("Platform")).toHaveValue(["web"]);
});

test("opportunity mall remains usable on narrow mobile screens",async({page})=>{
 await mockOpportunityMall(page);await page.setViewportSize({width:390,height:844});await page.goto("/network-plus/opportunities");
 await expect(page.getByRole("heading",{name:"Needs & Offers"})).toBeVisible();
 await expect(page.getByRole("heading",{name:"Data engineering support"})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
