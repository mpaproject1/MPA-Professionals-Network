# Community contribution notification campaign — product and content plan

**Status:** Product proposal and editorial draft for PR #18. No campaign is active; all 30 messages are drafts for review. No push notification, schedule, migration, or production change is enabled by this document.

## 1. Purpose

Create a respectful, recurring MPA community-contribution campaign that invites members and non-members to take practical steps that strengthen their communities. The campaign should encourage people to:

- Propose or join a community initiative.
- Share professional and practical knowledge.
- Mentor students, graduates and early-career professionals.
- Offer pro bono or discounted professional services where appropriate.
- Help connect people to opportunities, resources and trusted support.
- Participate in community problem-solving and knowledge exchange.

The tone must be encouraging, dignified, inclusive and action-oriented—not guilt-based, coercive, or a substitute for essential account/payment notices. Membership must never be presented as a prerequisite for basic community goodwill or volunteering.

## 2. Recurring schedule

Default schedule, using the IANA timezone **Africa/Addis_Ababa** (UTC+03:00):

| Slot | Local schedule | Intent |
|---|---|---|
| Friday afternoon | Friday, 15:00 | Reflect, give, volunteer, share a service or launch an initiative |
| Sunday morning | Sunday, 09:00 | Start the week with learning, mentoring, collaboration and practical action |

- Run twice weekly, one campaign message per slot.
- Rotate the 30 approved messages in sequence: 15 weeks at two sends per week. On completion, the administrator may restart, reorder or replace the sequence.
- Times are local wall-clock times in Africa/Addis_Ababa, not a fixed UTC offset stored in code. The scheduler must use timezone-aware recurrence.
- Admin can change day/time, pause, resume, set a start/end date, skip a slot, or select a different approved message.
- A slot is not sent if no eligible approved message is assigned, the campaign is paused, or delivery is suppressed by user preferences.

## 3. Audience and delivery

### Audience segments
- **Members:** active members and other member account states only where the selected action is available to them.
- **Non-members / community visitors:** people who explicitly opt in to community updates; keep the call to action public and do not imply membership is required to contribute.
- **All opted-in community subscribers:** optional combined segment, with preview showing audience counts before approval.

Do not infer religious identity, professional status, membership status, or consent from device data. Targeting is based only on account state and explicit notification preferences.

### Delivery channels
1. **In-app notification inbox:** persist the campaign notification in the same notification centre used by ordinary app notifications.
2. **Web Push:** deliver to subscribed browsers/devices through the installed PWA/service worker, so it can appear in the operating system notification panel where the browser/platform supports it.
3. **Optional email:** a later, separately configurable channel; not part of the initial scope.

Push delivery requires explicit browser/device permission and a valid push subscription. A notification appearing in the in-app inbox does not mean the device has granted push permission. Non-members can receive web push only after visiting the public site and explicitly opting in; otherwise they cannot be reached through browser push.

### Keep campaign messages distinct from operational notices
Use separate notification categories, such as `community_campaign`, `membership`, `payment`, `application`, `mentorship`, and `system`. Campaign preferences must not disable essential payment, security, application or membership-status notices. Conversely, operational notices must never be used as a back door to send promotional campaign content.

## 4. Admin-side workflow

Add a **Community Engagement Campaigns** area under the admin notification/communications workspace.

### Draft and approval lifecycle
`draft → submitted_for_review → approved → scheduled → sending → sent`

Additional states: `rejected`, `paused`, `cancelled`, `failed`, and `archived`.

- Content authors can create/edit drafts and preview the rendered mobile notification.
- An authorized approver reviews the Qur'an reference, hadith wording/source/grade, audience, action destination and final copy. The author should not approve their own content where a second authorized reviewer is available.
- Only approved, versioned content can be scheduled.
- Editing approved content creates a new draft version and invalidates its prior approval; already-sent history remains immutable.
- Scheduling is a separate action from approval. Approval alone never triggers delivery.
- Require an explicit confirmation screen before activating or resuming a campaign.
- Provide a pause/kill switch that prevents future sends immediately.

### Message editor fields
- Internal title and campaign name.
- Notification title and body (short title, concise preview, full expanded body).
- Qur'an excerpt, surah/ayah reference and translation attribution/version.
- Hadith excerpt, collection, hadith number, direct Sunnah.com URL and displayed grading/source note.
- Action label and validated internal/public route.
- Audience segment, language, category, priority and optional expiry.
- Editorial owner, reviewer, approval timestamp and immutable content version.
- Schedule slot, timezone, campaign start/end, and selected message/rotation position.

### Admin monitoring
Show next send time, last send, audience estimate, opted-in subscriptions, delivered/failed counts, retries, duplicate suppression, click-throughs and opt-outs. Keep per-device subscription endpoints private; never expose them in campaign reports.

## 5. Mobile notification and UX requirements

- Reuse the existing PWA notification infrastructure and service worker; do not create a parallel notification system.
- Notification payload should include a short title/body, category, stable notification ID, action URL and optional expiry. Do not include sensitive member, payment, application or mentoring details in push payloads.
- Clicking/tapping the notification opens the exact approved action destination, then the app can mark the inbox item as read.
- If the user is signed out, public actions remain public; protected actions lead to sign-in and then return to the intended destination.
- Ask for push permission contextually after explaining the value; do not trigger the browser permission prompt on first page load.
- Respect browser/device permission, user opt-out, quiet hours (if configured), subscription expiration and notification preferences.
- Use accessible text, concise preview copy, and a full expanded message in the inbox. Do not depend on emoji to convey meaning.
- Provide an unsubscribe/manage-preferences action in the inbox and public subscription management route.
- Retry transient delivery failures with bounded backoff. Permanent invalid subscriptions are deactivated. Use an idempotency key per campaign slot, recipient and content version to prevent duplicate sends.

## 6. Editorial and religious-source safeguards

- Qur'an excerpts must include surah and ayah and be checked against an approved translation before publication. The excerpts below are short English renderings; the final editor should confirm wording against the translation selected by MPA.
- Hadith excerpts below are short quotations or close concise renderings. Each item links to the exact Sunnah.com record. The initial set prioritizes Sahih al-Bukhari and Sahih Muslim. Where a Sunan Ibn Majah narration is used, the Sunnah.com record's displayed Darussalam grade is explicitly noted as Sahih.
- Do not describe a hadith as “authentic” unless its collection/grade is stated and the linked record has been checked. Do not silently upgrade a narration's grade.
- Never invent prophetic sayings, combine separate narrations into one quotation, or attribute MPA's campaign wording to the Prophet ﷺ.
- Keep the religious quotation separate from the MPA invitation. A call to action is the association's invitation, not a religious ruling.
- Before production approval, an authorized religious/editorial reviewer should verify all Qur'an translation wording and hadith references/grades. The prepared set is an editorial proposal, not a fatwa.

## 7. Prepared message library — 30 primary drafts

Each draft includes a notification title, message, Qur'an reminder, hadith reminder, and action destination. Keep the title and body concise in the OS panel; the inbox detail view can display the full references.

### 01 — A small act can open a door
**Audience:** All opted-in community subscribers  
**Notification:** *One useful act this week*  
**Message:** A stronger community is built through practical acts, not good intentions alone. Could you give one hour, share one useful skill, or help solve one local problem this week? Start with an action that matches your time and ability.  
**Qur'an:** “Cooperate in righteousness and piety.” — Qur'an 5:2  
**Hadith:** “Allah helps the servant as long as the servant helps their brother.” — Sahih Muslim 2699. [Source](https://sunnah.com/muslim:2699)  
**Action:** Explore community initiatives — `/serve-community`

### 02 — Share what you have learned
**Audience:** Members and opted-in non-members  
**Notification:** *Your knowledge can travel further*  
**Message:** A lesson learned through years of study or work may save someone else months of uncertainty. Share a practical lesson, host a short knowledge session, or contribute a resource that others can use.  
**Qur'an:** “My Lord, increase me in knowledge.” — Qur'an 20:114  
**Hadith:** The Prophet ﷺ praised those who learn the Qur'an and teach it. — Sahih al-Bukhari 5027. [Source](https://sunnah.com/bukhari:5027)  
**Action:** Join knowledge-sharing and mentoring — `/mentorship`

### 03 — Mentor one emerging professional
**Audience:** Members and opted-in non-members  
**Notification:** *Be the guidance you once needed*  
**Message:** A thoughtful conversation can help a student or early-career professional see a path forward. Offer a mentoring conversation, review a CV, or help someone prepare for a professional challenge.  
**Qur'an:** “And speak to people good words.” — Qur'an 2:83  
**Hadith:** The Prophet ﷺ taught that seeking a path of knowledge is a path made easier toward Paradise. — Sahih Muslim 2699. [Source](https://sunnah.com/muslim:2699)  
**Action:** Explore mentoring opportunities — `/mentorship`

### 04 — Offer a professional hour
**Audience:** Professionals and community subscribers  
**Notification:** *Could you give one hour?*  
**Message:** Your professional experience may help a community group make a safer, clearer or more sustainable decision. Consider offering one pro bono consultation in your area of expertise, with a clear scope and realistic time commitment.  
**Qur'an:** “Do good; indeed, Allah loves the doers of good.” — Qur'an 2:195  
**Hadith:** “The upper hand is better than the lower hand.” — Sahih al-Bukhari 1427. [Source](https://sunnah.com/bukhari:1427)  
**Action:** Offer a community service — `/serve-community`

### 05 — Build something together
**Audience:** All opted-in community subscribers  
**Notification:** *Bring one idea to the table*  
**Message:** Is there a challenge in your neighbourhood, profession or community that people could address together? Share a specific idea, the people it could help, and one achievable first step. Collaboration turns ideas into service.  
**Qur'an:** “Consult them in the matter.” — Qur'an 3:159  
**Hadith:** A believer supports another believer like parts of a building supporting one another. — Sahih Muslim 2585. [Source](https://sunnah.com/muslim:2585)  
**Action:** Propose or join an initiative — `/serve-community`

### 06 — Help make a difficult task easier
**Audience:** All opted-in community subscribers  
**Notification:** *Make the next step easier*  
**Message:** Someone may be navigating an unfamiliar process, a job search, a study decision or a community service. Offer a clear explanation, a useful introduction or a practical checklist. Small help can remove a real barrier.  
**Qur'an:** “Allah intends for you ease and does not intend hardship for you.” — Qur'an 2:185  
**Hadith:** “Make things easy and do not make them difficult.” — Sahih al-Bukhari 6125. [Source](https://sunnah.com/bukhari:6125)  
**Action:** Find a way to contribute — `/serve-community`

### 07 — Look after the people nearby
**Audience:** All opted-in community subscribers  
**Notification:** *Notice who may need support*  
**Message:** Community care begins close to home. Check whether a neighbour, student, older person or local group needs a practical hand. Listen first, respect dignity and offer help without making someone’s circumstances public.  
**Qur'an:** Qur'an 4:36 calls for kindness to parents, relatives, orphans, people in need and neighbours.  
**Hadith:** Gabriel repeatedly advised the Prophet ﷺ to treat neighbours kindly. — Sahih al-Bukhari 6014. [Source](https://sunnah.com/bukhari:6014)  
**Action:** Explore local community service — `/serve-community`

### 08 — Give useful feedback
**Audience:** Members and opted-in non-members  
**Notification:** *Help an idea become workable*  
**Message:** If a community initiative is being planned, thoughtful feedback can make it more useful and realistic. Share a constructive suggestion, identify a risk respectfully, or help the team measure whether the initiative is helping.  
**Qur'an:** “Help one another in righteousness and piety.” — Qur'an 5:2  
**Hadith:** “Speak what is good or remain silent.” — Sahih al-Bukhari 6018. [Source](https://sunnah.com/bukhari:6018)  
**Action:** Explore current initiatives — `/serve-community`

### 09 — Teach one practical skill
**Audience:** Members and opted-in non-members  
**Notification:** *Pass on one practical skill*  
**Message:** Could you teach a useful skill in a short session—digital literacy, financial basics, communication, research, safety, or a professional tool? Keep it practical, welcoming and accessible to beginners.  
**Qur'an:** “Are those who know equal to those who do not know?” — Qur'an 39:9  
**Hadith:** The Prophet ﷺ praised learning and teaching beneficial knowledge. — Sahih al-Bukhari 5027. [Source](https://sunnah.com/bukhari:5027)  
**Action:** Share knowledge or mentor — `/mentorship`

### 10 — Make room for a new voice
**Audience:** Members and opted-in non-members  
**Notification:** *Invite someone into the conversation*  
**Message:** Strong communities make room for emerging voices. Invite a student, graduate, young professional or community volunteer to contribute an idea, ask a question or take part in a learning session.  
**Qur'an:** “And consult them in the matter.” — Qur'an 3:159  
**Hadith:** The believers support one another like a building whose parts strengthen each other. — Sahih Muslim 2585. [Source](https://sunnah.com/muslim:2585)  
**Action:** Explore mentoring and participation — `/mentorship`

### 11 — Support a job seeker
**Audience:** Members and opted-in non-members  
**Notification:** *Help someone move toward work*  
**Message:** A useful referral, a CV review or a realistic interview practice session may help someone take their next step. Share opportunities responsibly and never promise an outcome you cannot control.  
**Qur'an:** “And do good; indeed, Allah loves the doers of good.” — Qur'an 2:195  
**Hadith:** Allah helps a servant who helps another. — Sahih Muslim 2699. [Source](https://sunnah.com/muslim:2699)  
**Action:** Explore opportunities and professional support — `/jobs`

### 12 — Volunteer with care
**Audience:** All opted-in community subscribers  
**Notification:** *Choose a commitment you can keep*  
**Message:** Sustainable volunteering starts with an honest commitment. Choose a task that fits your time, skills and capacity, agree on expectations, and communicate early if your availability changes. Reliability is itself a service.  
**Qur'an:** “Allah does not burden a soul beyond its capacity.” — Qur'an 2:286  
**Hadith:** “Make things easy and do not make them difficult.” — Sahih al-Bukhari 6125. [Source](https://sunnah.com/bukhari:6125)  
**Action:** Find a suitable volunteer activity — `/serve-community`

### 13 — Contribute to a shared solution
**Audience:** All opted-in community subscribers  
**Notification:** *Your perspective matters*  
**Message:** Community challenges often need different perspectives: technical, educational, legal, health, business, creative and lived experience. Offer your perspective respectfully and help the group move from discussion to a practical next step.  
**Qur'an:** “And their affairs are conducted by consultation among them.” — Qur'an 42:38  
**Hadith:** A believer strengthens another believer, like the parts of a building. — Sahih Muslim 2585. [Source](https://sunnah.com/muslim:2585)  
**Action:** Join or propose an initiative — `/serve-community`

### 14 — Make service accessible
**Audience:** All opted-in community subscribers  
**Notification:** *A welcoming first step matters*  
**Message:** Help make community participation easier for people with different schedules, experience and abilities. Explain the task clearly, welcome questions, and avoid creating unnecessary barriers for someone who wants to help.  
**Qur'an:** “Allah intends for you ease.” — Qur'an 2:185  
**Hadith:** “Allah is Gentle and loves gentleness.” — Sunan Ibn Majah 3688 (graded Sahih by Darussalam on Sunnah.com). [Source](https://sunnah.com/ibnmajah:3688)  
**Action:** Explore ways to participate — `/serve-community`

### 15 — Begin with one good word
**Audience:** All opted-in community subscribers  
**Notification:** *Encourage someone today*  
**Message:** A respectful message of encouragement, a useful introduction or a sincere thank-you can strengthen someone’s confidence. Reach out to a person contributing quietly and let them know their effort is valued.  
**Qur'an:** “Speak to people good words.” — Qur'an 2:83  
**Hadith:** The Prophet ﷺ taught: “Speak what is good or remain silent.” — Sahih al-Bukhari 6018. [Source](https://sunnah.com/bukhari:6018)  
**Action:** Connect through the community — `/members`

### 16 — Remove one obstacle
**Audience:** All opted-in community subscribers  
**Notification:** *What can you make easier?*  
**Message:** Look for one obstacle that prevents people from learning, working or accessing a service. Could you explain a process, improve a resource, make an introduction or help remove a practical barrier?  
**Qur'an:** “Whoever saves one life, it is as if they saved all mankind.” — Qur'an 5:32 (reflect on the value of protecting life; do not use this verse to overstate the scale of a routine service).  
**Hadith:** The Prophet ﷺ encouraged removing harmful things from the road. — Sunan Ibn Majah 3681 (graded Sahih by Darussalam on Sunnah.com). [Source](https://sunnah.com/ibnmajah:3681)  
**Action:** Find a practical service opportunity — `/serve-community`

### 17 — Share a resource
**Audience:** Members and opted-in non-members  
**Notification:** *A useful resource can help many*  
**Message:** Do you know a reliable guide, learning resource, public service or professional tool that could help others? Share it with a short explanation of who it is useful for and any limitations people should know.  
**Qur'an:** “Cooperate in righteousness and piety.” — Qur'an 5:2  
**Hadith:** The Prophet ﷺ praised beneficial knowledge that continues to benefit people. — Sahih Muslim 2699. [Source](https://sunnah.com/muslim:2699)  
**Action:** Share knowledge with the community — `/mentorship`

### 18 — Be a bridge between people
**Audience:** Members and opted-in non-members  
**Notification:** *Connect people to possibilities*  
**Message:** You may know someone with a skill and another person who needs it. With permission, make a thoughtful introduction between a learner, mentor, volunteer or initiative team. Protect privacy and let both people choose whether to connect.  
**Qur'an:** “And cooperate in righteousness and piety.” — Qur'an 5:2  
**Hadith:** Allah helps the servant who helps their brother. — Sahih Muslim 2699. [Source](https://sunnah.com/muslim:2699)  
**Action:** Explore the MPA community network — `/members`

### 19 — Offer a pro bono review
**Audience:** Professionals and community subscribers  
**Notification:** *Put your expertise to community use*  
**Message:** A community organisation may need a short review of a budget, design, policy, website, legal process or project plan. If you are qualified, offer a clearly scoped pro bono review and state what is outside your expertise.  
**Qur'an:** “Allah commands justice and good conduct.” — Qur'an 16:90  
**Hadith:** Establishing justice between people is described as charity. — Sahih al-Bukhari 2707. [Source](https://sunnah.com/bukhari:2707)  
**Action:** Offer professional service — `/serve-community`

### 20 — Make collaboration stronger
**Audience:** All opted-in community subscribers  
**Notification:** *Strengthen the team around you*  
**Message:** A good team shares responsibility, communicates clearly and respects each contributor. If you are part of an initiative, ask what support is needed, agree on a small task and help the team complete it.  
**Qur'an:** “And hold firmly together to the rope of Allah and do not become divided.” — Qur'an 3:103  
**Hadith:** “A believer is like a building, each part strengthening the other.” — Sahih Muslim 2585. [Source](https://sunnah.com/muslim:2585)  
**Action:** Join a community initiative — `/serve-community`

### 21 — Help someone learn with confidence
**Audience:** Members and opted-in non-members  
**Notification:** *Make learning feel possible*  
**Message:** Encourage a learner by listening to their goal, helping them identify the next step and sharing feedback with kindness. Mentoring is not about having every answer; it is about helping someone learn to find answers.  
**Qur'an:** “Say: My Lord, increase me in knowledge.” — Qur'an 20:114  
**Hadith:** The Prophet ﷺ praised those who learn and teach. — Sahih al-Bukhari 5027. [Source](https://sunnah.com/bukhari:5027)  
**Action:** Become a mentor or find one — `/mentorship`

### 22 — Give without diminishing dignity
**Audience:** All opted-in community subscribers  
**Notification:** *Let help preserve dignity*  
**Message:** When offering support, ask what is useful, protect privacy and respect the recipient’s choices. Effective community service helps people retain agency; it does not turn their needs into public stories or publicity.  
**Qur'an:** Qur'an 2:263 teaches that kind words and forgiveness are better than charity followed by hurt.  
**Hadith:** The Prophet ﷺ taught that Allah helps the servant who helps another. — Sahih Muslim 2699. [Source](https://sunnah.com/muslim:2699)  
**Action:** Explore respectful community service — `/serve-community`

### 23 — Support your neighbours
**Audience:** All opted-in community subscribers  
**Notification:** *Community begins nearby*  
**Message:** Think of one practical way to support people around you: share a useful contact, help someone access a service, offer a learning opportunity or contribute to a local initiative. Keep the offer sincere and respectful.  
**Qur'an:** Qur'an 4:36 calls for kindness to neighbours and people in need.  
**Hadith:** The Prophet ﷺ said that Gabriel continued advising him about neighbours. — Sahih al-Bukhari 6014. [Source](https://sunnah.com/bukhari:6014)  
**Action:** Find a community contribution — `/serve-community`

### 24 — Make your experience useful
**Audience:** Professionals and community subscribers  
**Notification:** *Your experience can guide a next step*  
**Message:** What do you know now that you wish you had known earlier? Turn that lesson into a short guide, discussion or mentoring session. Practical experience becomes more valuable when it is shared responsibly.  
**Qur'an:** “Are those who know equal to those who do not know?” — Qur'an 39:9  
**Hadith:** The Prophet ﷺ praised beneficial knowledge that continues after a person's death. — Sahih Muslim 2699. [Source](https://sunnah.com/muslim:2699)  
**Action:** Share your knowledge — `/mentorship`

### 25 — Choose fairness in your work
**Audience:** All opted-in community subscribers  
**Notification:** *Let fairness shape your contribution*  
**Message:** Whether you are reviewing a proposal, recommending a candidate or allocating volunteer work, act fairly and explain decisions clearly. Trust grows when people are treated with consistency and respect.  
**Qur'an:** “Stand firm for justice, as witnesses for Allah.” — Qur'an 4:135  
**Hadith:** “Establishing justice between people is charity.” — Sahih al-Bukhari 2707. [Source](https://sunnah.com/bukhari:2707)  
**Action:** Contribute to a fairer community — `/serve-community`

### 26 — Welcome a first-time volunteer
**Audience:** All opted-in community subscribers  
**Notification:** *Help someone take their first step*  
**Message:** Remember how it feels to join something new. Explain the purpose, introduce the team, describe the task and make space for questions. A welcoming first experience can help someone contribute with confidence.  
**Qur'an:** “And speak to people good words.” — Qur'an 2:83  
**Hadith:** “Make things easy and do not make them difficult.” — Sahih al-Bukhari 6125. [Source](https://sunnah.com/bukhari:6125)  
**Action:** Join or support a volunteer activity — `/serve-community`

### 27 — Share an opportunity responsibly
**Audience:** Members and opted-in non-members  
**Notification:** *Pass along a genuine opportunity*  
**Message:** If you share a job, scholarship, training or volunteering opportunity, check that the information is current and the source is trustworthy. Include eligibility and deadlines, and never promise selection or employment.  
**Qur'an:** “And cooperate in righteousness and piety.” — Qur'an 5:2  
**Hadith:** Allah helps a servant who helps another. — Sahih Muslim 2699. [Source](https://sunnah.com/muslim:2699)  
**Action:** Explore and share opportunities — `/jobs`

### 28 — Turn reflection into action
**Audience:** All opted-in community subscribers  
**Notification:** *One intention, one practical step*  
**Message:** Choose one community need you care about and write down a small action you can complete this week. Invite one other person if collaboration would help. Keep the commitment realistic, measurable and respectful.  
**Qur'an:** “And say, ‘Do [as you will], for Allah will see your deeds…’” — Qur'an 9:105 (short excerpt; retain the verse context in the full reference).  
**Hadith:** The Prophet ﷺ taught that every day offers an opportunity for charity through good action. — Sahih al-Bukhari 2707. [Source](https://sunnah.com/bukhari:2707)  
**Action:** Take a first step in community service — `/serve-community`

### 29 — Keep kindness gentle
**Audience:** All opted-in community subscribers  
**Notification:** *Make your help gentle and respectful*  
**Message:** The way we help matters. Listen without judgement, offer options rather than pressure, and respect a person's decision. Kindness and gentleness help make community participation safer and more welcoming.  
**Qur'an:** “So by mercy from Allah, you were gentle with them.” — Qur'an 3:159  
**Hadith:** “Allah is Gentle and loves gentleness.” — Sunan Ibn Majah 3688 (graded Sahih by Darussalam on Sunnah.com). [Source](https://sunnah.com/ibnmajah:3688)  
**Action:** Explore a way to serve — `/serve-community`

### 30 — Continue the good together
**Audience:** All opted-in community subscribers  
**Notification:** *Keep the good moving forward*  
**Message:** Thank you to everyone who has shared knowledge, mentored, volunteered, offered a professional service or supported an initiative. What is one contribution you can continue, improve or invite someone else to join?  
**Qur'an:** “Whoever does an atom’s weight of good will see it.” — Qur'an 99:7  
**Hadith:** The Prophet ﷺ described ongoing charity and beneficial knowledge among the deeds whose benefit continues. — Sahih Muslim 2699. [Source](https://sunnah.com/muslim:2699)  
**Action:** Continue contributing to the community — `/serve-community`

## 8. Action destination contract

Initial destinations should be resolved against actual application routes during implementation. The editor must validate that an action URL is an allowed same-origin route (or an explicitly allow-listed public MPA URL); do not accept arbitrary external destinations.

Proposed route mapping:
- Initiative discovery/proposal and pro bono offers: `/serve-community`
- Mentoring and knowledge exchange: `/mentorship`
- Professional/job opportunities: `/jobs`
- Member community/network discovery: `/members`
- Public non-member participation: public-facing `/serve-community` route; if sign-in is needed, preserve the intended destination after authentication.

If any listed route is not publicly accessible or does not expose the stated action, the implementation must either make the relevant landing/action available with proper authorization or change the CTA to a verified existing route. Do not ship dead links or pretend an action is available.

## 9. Implementation proposal for the next phase

This PR increment is the **product specification and editorial library only**. After this plan is reviewed and approved, implement in a separate focused phase:

1. Inspect and reuse the existing notification, web-push subscription, service-worker and admin permission infrastructure.
2. Add additive schema for campaign, message versions, approvals, schedules, recipient delivery ledger and audit events; do not mix campaign records with transactional notifications.
3. Add admin campaign CRUD, preview, approval, schedule, pause/resume and delivery monitoring.
4. Add the timezone-aware scheduler and idempotent recipient fan-out, with per-user preference and push-subscription checks.
5. Add the community campaign category to the app inbox and service worker click-through handling.
6. Add public opt-in and preference management for non-members; authenticated members manage campaign preferences from notification settings.
7. Add tests for author/approver separation, unapproved-content suppression, timezone boundaries, duplicate prevention, opt-outs, invalid subscriptions, retries, route allow-listing, push payload privacy and audience eligibility.
8. Validate the complete journey on desktop and mobile browsers, including installed PWA behaviour and notification permission denied/granted states.

### Acceptance criteria
- Exactly two configurable weekly campaign slots default to Friday 15:00 and Sunday 09:00 Africa/Addis_Ababa.
- Thirty drafts are stored as editable, versioned content; none is automatically approved.
- Only approved versions can be scheduled or sent.
- A content edit after approval requires reapproval.
- A campaign send creates one inbox notification per eligible recipient and at most one push delivery attempt per subscription for that slot/content version.
- Campaign opt-out does not suppress payment, security, application or membership operational notices.
- Push is delivered only to opted-in, permission-granted, valid subscriptions.
- Non-member push requires explicit public-site opt-in.
- Every notification click opens a verified action destination; protected actions return users to the destination after sign-in.
- Admin can see scheduled, sent, failed and skipped slots, with auditable reason codes.
- No notification is sent by default until an authorized administrator explicitly activates the approved schedule.

## 10. Source register for editorial review

The following Sunnah.com records were used for the short hadith excerpts and source labels in this draft:

- [Sahih Muslim 2699](https://sunnah.com/muslim:2699) — helping others, relieving hardship and seeking beneficial knowledge.
- [Sahih Muslim 2585](https://sunnah.com/muslim:2585) — believers supporting one another.
- [Sahih al-Bukhari 5027](https://sunnah.com/bukhari:5027) — learning and teaching the Qur'an.
- [Sahih al-Bukhari 1427](https://sunnah.com/bukhari:1427) — giving and the upper hand.
- [Sahih al-Bukhari 2707](https://sunnah.com/bukhari:2707) — charity through justice between people.
- [Sahih al-Bukhari 6125](https://sunnah.com/bukhari:6125) — making things easy.
- [Sahih al-Bukhari 6014](https://sunnah.com/bukhari:6014) — kindness to neighbours.
- [Sahih al-Bukhari 6018](https://sunnah.com/bukhari:6018) — avoiding harm to neighbours and speaking good.
- [Sunan Ibn Majah 3688](https://sunnah.com/ibnmajah:3688) — gentleness; Sunnah.com displays the grade Sahih (Darussalam).
- [Sunan Ibn Majah 3681](https://sunnah.com/ibnmajah:3681) — removing harm from the path; Sunnah.com displays the grade Sahih (Darussalam).

Qur'an verse references are included in each draft. MPA must select and record the approved English translation and verify every excerpt against it before any message is approved for publication.
