import { expect, test } from "@playwright/test";
const offlineProject={
 id:"b15a2d90-32ef-4c30-9a7d-0fdd7a0e7a61",source:"offline_staff_record",
 title:"Community digital learning programme",category:"digital_inclusion",
 summary:"Practical digital skills delivered through community workshops.",
 publicStory:"MPA volunteers and local partners delivered accessible digital learning sessions for community groups, with follow-up learning materials and practical support.",
 completedAt:"2026-09-20T00:00:00.000Z",locationLabel:"Addis Ababa, Ethiopia",deliveryMode:"in_person",
 beneficiaryCount:84,beneficiaryDefinition:"learners reached",
 outcomeMetrics:[{label:"Learners completing the course",value:"72",unit:"people"}],
 imageUrls:["https://media.example.org/community-learning.jpg"],
 imageAltText:["Community learning workshop with computers arranged for participants"],
 videoUrls:["https://youtu.be/abcdefghijk"]
};
const portfolio={data:{items:[offlineProject],minimumReportableGroupSize:5,measurementNote:"Offline projects are staff-entered and independently approved. Beneficiary figures are reported separately from platform member participation."}};
const emptyInitiatives={data:{items:[],page:{limit:30,offset:0,total:0,hasMore:false}}};
async function mockPortfolio(page){await page.route("**/api/v1/public/serve-community/completed-projects",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(portfolio)}));await page.route("**/api/v1/serve-community/initiatives**",route=>route.fulfill({status:200,contentType:"application/json",body:JSON.stringify(emptyInitiatives)}));}
test.describe("Staff-entered offline completed project portfolio",()=>{
 test("About page renders the approved project story, photograph, video and separately labelled measures",async({page})=>{await mockPortfolio(page);await page.goto("/about");await expect(page.getByRole("heading",{name:"Completed Projects"})).toBeVisible();await expect(page.getByRole("heading",{name:offlineProject.title})).toBeVisible();await expect(page.getByRole("img",{name:offlineProject.imageAltText[0]})).toBeVisible();await expect(page.getByRole("link",{name:/Watch project video/i})).toHaveAttribute("href",offlineProject.videoUrls[0]);await expect(page.getByText("84")).toBeVisible();await expect(page.getByText("72 people")).toBeVisible();await expect(page.getByText(/beneficiary figures are reported separately/i)).toBeVisible();await expect(page.getByText(/members with completed participation records/i)).toHaveCount(0)});
 test("Serve-Community Completed Projects reuses the same public feed and remains mobile-safe",async({page})=>{await mockPortfolio(page);await page.setViewportSize({width:390,height:844});await page.goto("/serve-community");await expect(page.getByRole("heading",{name:"Completed Projects"})).toBeVisible();await expect(page.getByRole("heading",{name:offlineProject.title})).toBeVisible();await expect(page.getByRole("img",{name:offlineProject.imageAltText[0]})).toBeVisible();await expect(page.getByRole("link",{name:/Watch project video/i})).toHaveAttribute("href",offlineProject.videoUrls[0]);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)});
});
