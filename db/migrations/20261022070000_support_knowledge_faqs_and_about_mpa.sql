-- Seed clear, action-oriented public support answers and an editable About MPA entry.
-- Idempotent by category/title so migration retries do not create duplicate knowledge articles.
-- The official website could not be fetched by the research browser on 2026-10-22.
-- Website-derived MPA identity content is deliberately saved as a draft for staff verification.
insert into support_knowledge_category(slug,name,description,sort_order) values
 ('about-mpa','About MPA','Organization overview, purpose, programs and official public information.',5),
 ('next-steps','Next steps and common questions','Practical instructions for choosing the correct portal journey and getting help.',15)
on conflict(slug) do nothing;

-- ABOUT MPA: draft until an authorized editor verifies the official About page and wording.
insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'About MPA: who we are and what we do',
 ARRAY['What is MPA?','Tell me about Muslim Professionals Association','Who is MPA for?','What does MPA do?','What is the purpose of MPA?']::text[],
 ARRAY['about MPA','Muslim Professionals Association','who we are','mission','vision','purpose','Ethiopia','professional network']::text[],
 'The publicly indexed MPA vacancy information describes the Muslim Professionals Association (MPA) as a non-profit organization based in Addis Ababa, Ethiopia, supporting connections and the growth of Muslim professionals through networking, mentoring and professional development. It also describes a commitment to Islamic principles and community engagement. This summary is awaiting confirmation against MPA’s official About page. For current, approved information, visit https://muslimprofession.org/ and check the official About/organization information before relying on details.',
 'Source to verify: https://muslimprofession.org/ and https://muslimprofession.org/vacancy/. The official site could not be fetched by the research browser on 2026-10-22; draft only, verify the exact legal name, mission, vision, programs and wording before publishing.',
 10,false
from support_knowledge_category c
where c.slug='about-mpa'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='About MPA: who we are and what we do');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'MPA mission, vision and official values',
 ARRAY['What is MPA’s mission?','What is MPA’s vision?','What are MPA’s values?','What principles guide MPA?']::text[],
 ARRAY['mission','vision','values','principles','Islamic integrity','official values']::text[],
 'Please consult MPA’s official website for the current approved mission, vision and values: https://muslimprofession.org/. This knowledge entry is awaiting staff confirmation; the assistant should not guess or present an unapproved summary as MPA’s official wording.',
 'Official source to review: https://muslimprofession.org/. Draft only because the official website could not be fetched by the research browser on 2026-10-22. Replace this answer with the approved wording, source page and review date before publishing.',
 20,false
from support_knowledge_category c
where c.slug='about-mpa'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='MPA mission, vision and official values');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'How do I join MPA or begin membership?',
 ARRAY['How can I join MPA?','How do I become a member?','Where do I start membership?','How do I apply to join the network?']::text[],
 ARRAY['join','membership','apply','member','registration','next step']::text[],
 'Start at https://portal.muslimprofession.org/membership and read the available membership information and next steps. Follow the application prompts and provide accurate information requested by the form. If you cannot find the right option or receive an error, return to this support assistant and describe the page and message you see. Do not send passwords or identity documents in chat.',
 'Portal workflow: /membership. Keep the answer aligned with the current membership page and approval/payment rules; do not promise automatic approval.',
 10,true
from support_knowledge_category c
where c.slug='next-steps'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='How do I join MPA or begin membership?');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'How do I find or request a professional service?',
 ARRAY['How do I find a service?','Where can I browse MPA services?','How do I ask a professional for help?','How can I request a service?']::text[],
 ARRAY['services','professional service','request help','service request','browse services']::text[],
 'Open https://portal.muslimprofession.org/services and browse the published service listings. Open a listing to review its details and use the request or contact action shown there. If your need is not covered by a listing, visit https://portal.muslimprofession.org/service-demand to see reviewed shareable needs or submit a private request where that option is available. A request is not a guarantee that a provider will accept or complete the work.',
 'Portal workflows: /services and /service-demand. Confirm action labels against current UI before changing the answer.',
 20,true
from support_knowledge_category c
where c.slug='next-steps'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='How do I find or request a professional service?');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'How do I find a job and apply?',
 ARRAY['Where are MPA jobs?','How do I apply for a job?','Can I track a job application?','Where do I see job opportunities?']::text[],
 ARRAY['jobs','vacancies','employment','job application','career','application status']::text[],
 'Browse public opportunities at https://portal.muslimprofession.org/jobs. Open the vacancy and follow the application instructions shown on that listing. If you have already applied, sign in and return to the relevant jobs/application area to review any status or next action that is available. If the vacancy directs applicants to an external site or email, follow that specific advert. MPA cannot guarantee an interview, selection or hiring outcome.',
 'Portal workflow: /jobs. For vacancies published on the separate official website, verify the individual advert and its deadline at https://muslimprofession.org/vacancy/.',
 30,true
from support_knowledge_category c
where c.slug='next-steps'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='How do I find a job and apply?');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'How do I ask for mentorship or offer to mentor?',
 ARRAY['How do I find a mentor?','How do I request mentorship?','Can I become a mentor?','Where is the mentorship page?']::text[],
 ARRAY['mentor','mentorship','guidance','career advice','mentee','next step']::text[],
 'Visit https://portal.muslimprofession.org/mentorship. Review the available mentorship information and use the relevant request or profile action shown on the page. Describe your goals clearly and follow any status or next-step guidance displayed after submission. If the page does not offer the option you need, tell support which action you were trying to complete.',
 'Portal workflow: /mentorship. Do not promise a match or a response time unless the current program states one.',
 40,true
from support_knowledge_category c
where c.slug='next-steps'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='How do I ask for mentorship or offer to mentor?');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'How can an organization register or participate?',
 ARRAY['How do I register an organization?','Can my organization join MPA?','How do employers use the network?','Where do I start as an organization?']::text[],
 ARRAY['organization','employer','company','register organization','recruitment','participation']::text[],
 'Start at https://portal.muslimprofession.org/organizations and follow the organization registration or participation option displayed. Provide the requested information and wait for any required review. Access to organization tools depends on the account, review status and assigned permissions. If you are looking for talent or services, you can also browse the public opportunities and services available through the portal.',
 'Portal workflow: /organizations. Do not promise approval or privileged access before the required review.',
 50,true
from support_knowledge_category c
where c.slug='next-steps'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='How can an organization register or participate?');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'How do I share a community need or express interest?',
 ARRAY['How can I share a need?','Where can I find community needs?','How do I express interest in a need?','Is my service request public?']::text[],
 ARRAY['community need','service demand','interest','private request','share a need']::text[],
 'Visit https://portal.muslimprofession.org/service-demand. You can review topics that have been approved for public sharing and use the available action to express interest. If a private request form is offered, submit the details there and check the confirmation or reference provided. Private request details should not be treated as public listings. If you are unsure which option fits, describe the help you need without sharing sensitive personal information.',
 'Portal workflow: /service-demand. Preserve the distinction between public reviewed topics and private intake.',
 60,true
from support_knowledge_category c
where c.slug='next-steps'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='How do I share a community need or express interest?');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'What should I do after submitting an application or request?',
 ARRAY['I submitted a form. What next?','How can I check my status?','Where is my reference number?','I did not receive confirmation.']::text[],
 ARRAY['next step','application status','request status','reference','confirmation','submitted']::text[],
 'First, look for the on-screen confirmation and any reference number shown after submission. Then sign in and return to the same section where you started, such as Membership, Jobs, Mentorship, Services or Service Demand, to review available status and next actions. If the submission failed or no confirmation appeared, do not submit repeatedly if you are unsure whether it succeeded. Contact support with the page name, approximate time and non-sensitive error text. Never send passwords, payment card details or identity documents in this chat.',
 'General portal guidance. Exact status labels and available history vary by workflow; keep the answer aligned with the live product.',
 70,true
from support_knowledge_category c
where c.slug='next-steps'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='What should I do after submitting an application or request?');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'I cannot sign in or find my account',
 ARRAY['I cannot log in','I forgot my password','My account is not working','How do I get account help?']::text[],
 ARRAY['login','sign in','password','account access','forgot password','technical support']::text[],
 'Open https://portal.muslimprofession.org/login and carefully check the email or username you use for the portal. Follow any account recovery option that is actually shown on the page. If you still cannot sign in, use this support assistant to describe the error and the page where it appears. Do not share your password, one-time code, recovery link or identity documents with support chat.',
 'Portal workflow: /login. Do not invent recovery controls that are not present in the current UI.',
 80,true
from support_knowledge_category c
where c.slug='next-steps'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='I cannot sign in or find my account');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'How does MPA protect private information?',
 ARRAY['Is my request public?','Who can see my contact details?','Can I share identity documents in chat?','How is my information handled?']::text[],
 ARRAY['privacy','private information','contact details','identity documents','security','consent']::text[],
 'Only provide information needed for the action you are taking. Public pages show content intended for public discovery; private applications, requests, contact details and supporting evidence should only be available to authorized people through the relevant workflow. Do not send passwords, one-time codes, bank details or identity documents to this assistant. If you request human follow-up, provide contact details only when needed and check the consent option if you want MPA to contact you.',
 'Support bot privacy guidance and portal public/private workflow boundaries. Do not claim a security control beyond the implementation and published policy.',
 90,true
from support_knowledge_category c
where c.slug='privacy'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='How does MPA protect private information?');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'The assistant could not answer my question — what next?',
 ARRAY['The bot does not know the answer','How do I contact a person?','Can support review my question?','I need human help']::text[],
 ARRAY['human support','unanswered question','contact support','help desk','follow up','escalation']::text[],
 'Please restate the question briefly and mention which page you are using. If the answer is still unavailable, the assistant can record the inquiry for the authorized MPA support team. To request a personal follow-up, open “Need a person to follow up?”, provide an email address or phone number if you choose, and check the consent box. You can also include the page name and the exact non-sensitive error message. Do not send passwords or identity documents.',
 'Current public support bot behavior and consent-based follow-up form. Check the admin support inbox for unresolved questions and add approved answers to the knowledge base.',
 100,true
from support_knowledge_category c
where c.slug='general'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='The assistant could not answer my question — what next?');

insert into support_knowledge_article(category_id,title,question_examples,keywords,answer,source_note,sort_order,is_published)
select c.id,
 'Where can I find official MPA vacancies and how do I apply?',
 ARRAY['Where are vacancies published on MPA website?','How do I apply for a vacancy on muslimprofession.org?','What email should I use for an MPA job application?']::text[],
 ARRAY['vacancy','career','job at MPA','hr@muslimprofession.org','official website']::text[],
 'Check the current vacancy page at https://muslimprofession.org/vacancy/ and follow the instructions in the specific advert, including its deadline and required documents. A publicly indexed MPA vacancy notice has listed hr@muslimprofession.org for that particular recruitment process, but contact details and application instructions can change. Verify the current advert before sending an application; do not send recruitment documents to this chatbot.',
 'Source: https://muslimprofession.org/vacancy/ and a publicly indexed MPA vacancy notice. Official website fetch was unavailable on 2026-10-22; draft only until the current vacancy page and contact instructions are manually checked.',
 110,false
from support_knowledge_category c
where c.slug='about-mpa'
and not exists(select 1 from support_knowledge_article a where a.category_id=c.id and a.title='Where can I find official MPA vacancies and how do I apply?');
