import { expect, test } from "@playwright/test";

async function dismissPrivacyChoices(page) {
  const rejectOptional = page.getByRole("button", { name: "Reject optional" });
  if (await rejectOptional.isVisible().catch(() => false)) await rejectOptional.click();
}

const draft = {
  id: "request-1", intent: "service_request", status: "draft",
  subject: "Website accessibility review", summary: "Request an accessibility review of our public website.",
  requester_user_id: "requester-1", updated_at:"2026-11-03T09:00:00.000Z", isRequester: true, is_requester: true, requester_disposition:"in_progress", isRecipientRepresentative: false,
  participants: [{ user_id: "requester-1", participant_role: "requester", consent_status: "accepted" }],
  events: [{event_code:"request.submitted",to_status:"submitted",metadata:{}},{event_code:"request.disposition_updated",to_status:"draft",metadata:{previousDisposition:"in_progress",disposition:"completed",remark:"Connection made; continuing directly."}}], workspace: null,
};
const submitted = {
  ...draft, status: "submitted", isRequester: false, is_requester: false, isRecipientRepresentative: true, canReview: true, canAccept: true,
  participants: [
    { user_id: "requester-1", participant_role: "requester", consent_status: "accepted" },
    { user_id: "recipient-1", participant_role: "recipient_representative", consent_status: "pending" },
  ],
};

async function mockSession(page) {
  await page.addInitScript(() => window.sessionStorage.setItem("mpa-session-token", "e2e-network-plus-session"));
  await page.route("**/api/v1/me", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{user_id:"e2e-user",roles:["member"]}})}));
  await page.route("**/api/v1/organizations", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})}));
  await page.route("**/api/v1/notifications?*", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{counts:{unread:0}}})}));
  await page.route("**/api/v1/network-plus/access", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{eligible:true,access:{member:true,organization:false},nextAction:"Choose discovery."}})}));
  await page.route("**/api/v1/network-plus/businesses?*", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{items:[]}})}));
  await page.route("**/api/v1/network-plus/services?*", route => route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{items:[]}})}));
}

test.describe("Network-Plus request and collaboration journey",()=>{
  test("creates a draft without submitting or creating an agreement",async({page})=>{
    await mockSession(page);
    let createPayload=null;
    await page.route("**/api/v1/network-plus/requests",async route=>{
      if(route.request().method()==="POST"){createPayload=route.request().postDataJSON();await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({data:draft})});}
      else await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[draft]})});
    });
    await page.route("**/api/v1/network-plus/requests/request-1",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:draft})}));
    await page.setViewportSize({width:390,height:844});
    await page.goto("/network-plus/requests");
    await dismissPrivacyChoices(page);
    await expect(page.getByRole("heading",{name:"Requests that become collaboration only by agreement."})).toBeVisible();
await page.locator("details").filter({hasText:"Start a new connection request"}).locator("summary").click();
        await page.getByLabel("Request type").selectOption("service_request");
    await page.getByLabel("Find a verified member recipient").fill("Recipient");
    await page.route("**/api/v1/talent?q=*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{items:[{user_id:"recipient-1",display_name:"Recipient Professional",professional_title:"Architect"}]}})}));
    await page.getByRole("button",{name:"Search members"}).click();
    await page.getByLabel("Member recipient").selectOption("recipient-1");
    await page.getByLabel("Subject").fill("Website accessibility review");
    await page.getByLabel("Request summary").fill("Request an accessibility review of our public website.");
    await page.getByLabel("Scope").fill("Review the public website against WCAG AA.");
    await page.getByLabel("Deliverables (one per line)").fill("Written audit report");
    await page.getByRole("button",{name:"Save draft"}).click();
    await expect.poll(()=>createPayload?.intent).toBe("service_request");
    expect(createPayload.terms.scope).toContain("WCAG AA");
    await expect(page.getByText(/Draft saved. It is not yet submitted/i)).toBeVisible();
    await expect(page).toHaveURL(/requestId=request-1/);
    await expect(page.getByRole("button",{name:/Website accessibility review/})).toContainText("Draft");
    await page.getByRole("button",{name:"Drafts"}).click();
    await expect(page).toHaveURL(/requestFilter=drafts/);
    await expect(page.getByRole("button",{name:"Drafts"})).toHaveAttribute("aria-pressed","true");
    await page.goBack();
    await expect(page).not.toHaveURL(/requestFilter=/);
    await expect(page.getByRole("button",{name:"Drafts"})).toHaveAttribute("aria-pressed","false");
    await page.goForward();
    await expect(page).toHaveURL(/requestFilter=drafts/);
    await page.getByRole("button",{name:"All"}).click();
    await expect(page.getByRole("heading",{name:"My Requests"})).toBeVisible();
    await expect(page.getByRole("button",{name:"Drafts"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Platform-observed activity"})).toBeVisible();
    await expect(page.getByRole("heading",{name:"Your reported connection outcomes"})).toBeVisible();
    await expect(page.getByText(/has not been sent to the recipient/i)).toBeVisible();
    await expect(page.getByRole("button",{name:"Submit request"})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });

  test("recipient acceptance does not create a workspace until a participant opts in",async({page})=>{
    await mockSession(page);
    let accepted=false,workspaceEnabled=false;
    const current=()=>accepted?{...submitted,status:"accepted",workspace:workspaceEnabled?{id:"workspace-1",purpose:"Accessibility review",scope:"WCAG AA review"}:null}:submitted;
    await page.route("**/api/v1/network-plus/requests",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[current()]})}));
    await page.route("**/api/v1/network-plus/requests/request-1/transitions",async route=>{
      expect(route.request().postDataJSON().status).toBe("accepted");accepted=true;
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:current()})});
    });
    await page.route("**/api/v1/network-plus/requests/request-1/workspace",async route=>{if(route.request().method()==="POST"){workspaceEnabled=true;await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({data:{id:"workspace-1",purpose:"Accessibility review",scope:"WCAG AA review"}})});}else await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{workspace:{id:"workspace-1"},milestones:[],events:[]}})});});
    await page.route("**/api/v1/network-plus/requests/request-1",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:current()})}));
    await page.setViewportSize({width:1280,height:900});
    await page.goto("/network-plus/requests");
    await dismissPrivacyChoices(page);
    await page.getByRole("button",{name:/Website accessibility review/}).click();
    await expect(page.getByRole("button",{name:"Explicitly accept request"})).toBeVisible();
    await expect(page.getByText(/Awaiting the recipient’s explicit decision/i)).toBeVisible();
    await page.getByRole("button",{name:"Explicitly accept request"}).click();
    await expect(page.getByRole("button",{name:"Start optional collaboration workspace"})).toBeVisible();
    await page.getByRole("button",{name:"Start optional collaboration workspace"}).click();
    await page.locator("details").filter({hasText:"Optional shared workspace"}).locator("summary").click();
    await expect(page.getByRole("heading",{name:"Collaboration workspace"})).toBeVisible();
    await expect(page.getByText(/Optional shared workspace enabled/i)).toBeVisible();
  });
  test("routes a business proposal through canonical business ownership without exposing owner identifiers",async({page})=>{
    await mockSession(page);
    await page.route("**/api/v1/network-plus/businesses?*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{items:[{id:"business-1",display_name:"Verified Design Cooperative",business_kind:"cooperative"}]}})}));
    let payload=null;
    await page.route("**/api/v1/network-plus/requests",async route=>{
      if(route.request().method()==="POST"){payload=route.request().postDataJSON();await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({data:{...draft,intent:"partnership_proposal"}})});}
      else await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})});
    });
    await page.route("**/api/v1/network-plus/requests/request-1",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:draft})}));
    await page.goto("/network-plus/requests");
    await dismissPrivacyChoices(page);
await page.locator("details").filter({hasText:"Start a new connection request"}).locator("summary").click();
        await page.getByLabel("Request type").selectOption("partnership_proposal");
    await page.getByLabel("Published business").selectOption("business-1");
    await page.getByLabel("Subject").fill("Community technology partnership");
    await page.getByLabel("Request summary").fill("Propose a structured technology partnership for community services.");
    await page.getByLabel("Purpose").fill("Expand access to reliable digital services.");
    await page.getByLabel("Scope").fill("Plan and deliver a defined pilot programme.");
    await page.getByLabel("Contributions (one per line)").fill("Provide technical expertise");
    await page.getByLabel("Responsibilities (one per line)").fill("Coordinate delivery");
    await page.getByLabel("Outputs (one per line)").fill("Pilot programme and outcome report");
    await page.getByLabel("Timeline").fill("Three-month pilot");
    await page.getByLabel("Authorized representatives (one per line)").fill("Authorized project representative");
    await page.getByRole("button",{name:"Save draft"}).click();
    await expect.poll(()=>payload?.businessId).toBe("business-1");
    expect(payload.recipientUserId).toBeUndefined();
    expect(payload.recipientOrganizationId).toBeUndefined();
    expect(payload.terms.authorizedRepresentatives).toContain("Authorized project representative");
  });

  test("opens a listing-scoped quotation request from an opportunity action",async({page})=>{
    await mockSession(page);
    await page.route("**/api/v1/network-plus/services?*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{items:[{id:"listing-1",business_id:"business-1",business_name:"Verified Supply Co.",title:"Business equipment"}]}})}));
    let payload=null;
    await page.route("**/api/v1/network-plus/requests",async route=>{
      if(route.request().method()==="POST"){payload=route.request().postDataJSON();await route.fulfill({status:201,contentType:"application/json",body:JSON.stringify({data:{...draft,intent:"quote_request",business_id:"business-1",service_listing_id:"listing-1"}})});}
      else await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[]})});
    });
    await page.route("**/api/v1/network-plus/requests/request-1",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{...draft,intent:"quote_request"}})}));
    await page.goto("/network-plus/requests?action=quote_request&listingId=listing-1");
    await dismissPrivacyChoices(page);
await page.locator("details").filter({hasText:"Start a new connection request"}).locator("summary").click();
        await expect(page.getByLabel("Request type")).toHaveValue("quote_request");
    await page.getByRole("button",{name:"Continue"}).click();
    await expect(page.getByLabel("Subject")).toHaveValue("Quote Request · Business equipment");
    await page.getByRole("button",{name:"Continue"}).click();
    await expect(page.getByLabel("Published professional service")).toHaveValue("listing-1");
    await page.getByRole("button",{name:"Continue"}).click();
    await expect(page.getByText("Review your connection request")).toBeVisible();
    await page.getByRole("button",{name:"Save draft"}).click();
    await expect.poll(()=>payload?.intent).toBe("quote_request");
    expect(payload.serviceListingId).toBe("listing-1");
    expect(payload.businessId).toBe("business-1");
  });

  test("accepted lightweight requests show consent and meeting handoff controls",async({page})=>{
    await mockSession(page);
    const accepted={...draft,intent:"meeting_request",status:"accepted",isRequester:true,canHandoff:true,recipient_user_id:"recipient-1",participants:[
      {user_id:"requester-1",participant_role:"requester",consent_status:"accepted"},
      {user_id:"recipient-1",participant_role:"recipient_representative",consent_status:"accepted"},
    ],meetings:[],clarifications:[]};
    await page.route("**/api/v1/network-plus/requests",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[accepted]})}));
    await page.route("**/api/v1/network-plus/requests/request-1",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:accepted})}));
    await page.route("**/api/v1/network-plus/requests/request-1/contact-handoff?*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{requestId:"request-1",fields:[]}})}));
    await page.goto("/network-plus/requests");
    await dismissPrivacyChoices(page);
    await page.getByRole("button",{name:/Website accessibility review/}).click();
    await expect(page.getByText("Contact sharing · field-by-field consent")).toBeVisible();
    await expect(page.getByText("First meeting handoff")).toBeVisible();
    await expect(page.getByLabel("Contact field")).toBeVisible();
    await expect(page.getByLabel("Date and time")).toBeVisible();
  });

  test("recipient can send one private answer to a question request",async({page})=>{
    await mockSession(page);
    const question={...draft,intent:"question",status:"submitted",isRequester:false,isRecipientRepresentative:true,canReview:true,canAccept:true,recipient_response:null,recipient_response_at:null};
    const answered={...question,recipient_response:"Yes, we can support regional distribution through approved local partners.",recipient_response_at:"2026-11-03T06:00:00.000Z"};
    await page.route("**/api/v1/network-plus/requests",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[question]})}));
    await page.route("**/api/v1/network-plus/requests/request-1/answer",async route=>{expect(route.request().method()).toBe("POST");await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{id:"request-1",recipient_response:answered.recipient_response,recipient_response_at:answered.recipient_response_at}})});});
    await page.route("**/api/v1/network-plus/requests/request-1",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:answered})}));
    await page.goto("/network-plus/requests");
    await dismissPrivacyChoices(page);
    await page.getByRole("button",{name:/Website accessibility review/}).click();
    await expect(page.getByText("Answer the question")).toBeVisible();
    await page.getByPlaceholder("Write a concise answer to the requester").fill("Yes, we can support regional distribution through approved local partners.");
    await page.getByRole("button",{name:"Send answer"}).click();
    await expect(page.getByText("Recipient answer")).toBeVisible();
  });


  test("rejects nonexistent and ambiguous local meeting times across DST transitions",async({page})=>{
    await mockSession(page);
    const accepted={...draft,intent:"meeting_request",status:"accepted",isRequester:true,canHandoff:true,recipient_user_id:"recipient-1",participants:[
      {user_id:"requester-1",participant_role:"requester",consent_status:"accepted"},
      {user_id:"recipient-1",participant_role:"recipient_representative",consent_status:"accepted"},
    ],meetings:[],clarifications:[]};
    await page.route("**/api/v1/network-plus/requests",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[accepted]})}));
    await page.route("**/api/v1/network-plus/requests/request-1",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:accepted})}));
    await page.route("**/api/v1/network-plus/requests/request-1/contact-handoff?*",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:{requestId:"request-1",fields:[]}})}));
    await page.goto("/network-plus/requests");
    await dismissPrivacyChoices(page);
    await page.getByRole("button",{name:/Website accessibility review/}).click();
    await page.getByLabel("Timezone").fill("America/New_York");
    await page.getByLabel("Date and time").fill("2026-03-08T02:30");
    await page.getByRole("button",{name:/Propose meeting/}).click();
    await expect(page.getByText(/local time does not exist in the selected timezone/i)).toBeVisible();
    await page.getByLabel("Date and time").fill("2026-11-01T01:30");
    await page.getByRole("button",{name:/Propose meeting/}).click();
    await expect(page.getByText(/local time occurs twice in the selected timezone/i)).toBeVisible();
  });

});


  test("requester records a closure remark, reopens the connection and sees preserved disposition history",async({page})=>{
    await mockSession(page);
    let current={...draft,status:"submitted",isRequester:true,is_requester:true,requester_disposition:"in_progress",requester_disposition_remark:null,events:[]};
    const response=()=>({data:current});
    await page.route("**/api/v1/network-plus/requests",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify({data:[current]})}));
    await page.route("**/api/v1/network-plus/requests/request-1",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(response())}));
    await page.route("**/api/v1/network-plus/requests/request-1/disposition",async route=>{
      const payload=route.request().postDataJSON();
      const previous=current.requester_disposition;
      current={...current,requester_disposition:payload.disposition,requester_disposition_remark:payload.remark,events:[...current.events,{event_code:previous!=="in_progress"&&payload.disposition==="in_progress"?"request.disposition_reopened":"request.disposition_updated",metadata:{previousDisposition:previous,disposition:payload.disposition}}]};
      await route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(response())});
    });
    await page.setViewportSize({width:390,height:844});
    await page.goto("/network-plus/requests");
    await dismissPrivacyChoices(page);
    await page.getByRole("button",{name:/Website accessibility review/}).click();
    await page.getByLabel("Short remark").fill("Contact exchanged; we will continue directly.");
    await page.getByRole("button",{name:"Mark Completed"}).click();
    await expect(page.getByText("Completed",{exact:true}).last()).toBeVisible();
    await expect(page.getByText(/Contact exchanged; we will continue directly/)).toBeVisible();
    await page.getByLabel("Short remark").fill("Reopening to continue the introduction.");
    await page.getByRole("button",{name:"Reopen as In progress"}).click();
    await expect(page.getByText(/Earlier closure history is preserved/)).toBeVisible();
    expect(current.events.some(event=>event.event_code==="request.disposition_reopened")).toBe(true);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  });
