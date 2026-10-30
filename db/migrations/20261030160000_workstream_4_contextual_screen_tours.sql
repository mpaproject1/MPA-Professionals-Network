-- Workstream 4: replace stale tours with current semantic, non-blocking walkthroughs.
-- Old routes/selectors are disabled until their rendered screens are audited.
update ui_guide_tour
set active=false,updated_at=now()
where guide_key not in ('global-navigation','member-workspace','membership-application','membership-payment');

insert into ui_guide_tour(guide_key,route_pattern,title,description,steps,active,sort_order)
values
('global-navigation','*','Getting around MPA','A short orientation to the shared navigation and help controls. The page remains usable while this guide is open.','[
 {"target":"[data-guide-target=\"brand-home\"]","title":"Return to MPA home","text":"Select the MPA brand at any time to return to the network home page."},
 {"target":"[data-guide-target=\"main-navigation\"]","title":"Move between workspaces","text":"Use the visible desktop or mobile navigation to open the areas available to your account."},
 {"title":"Restart this guide","text":"Use the Guide control to restart this walkthrough whenever you need a reminder. Use the separate Ask MPA assistant for questions or human support."}
]'::jsonb,true,10),
('member-workspace','/members','Your MPA workspace','Follow the current account status, membership progress and next action. Progress is based on service records, not page visits.','[
 {"target":"[data-guide-target=\"workspace-overview\"]","title":"Your current position","text":"This summary shows the next recommended action and server-confirmed account and application status."},
 {"target":"[data-guide-target=\"workspace-progress\"]","title":"Membership progress","text":"Each stage reflects the status returned by MPA. Missing information is not treated as completed."},
 {"target":"[data-guide-target=\"workspace-shortcuts\"]","title":"Open a workspace","text":"Use these shortcuts to continue to membership, jobs, learning and other available workflows."},
 {"target":"[data-guide-target=\"workspace-help\"]","title":"Get guidance or support","text":"Choose Show me around to restart this tour, or use Get help to contact MPA. Ask MPA remains a separate support assistant."}
]'::jsonb,true,20),
('membership-application','/membership','Membership application and status','Understand the membership plan, submitted application and the separate payment and review stages.','[
 {"target":"[data-guide-target=\"membership-overview\"]","title":"Understand membership status","text":"This screen distinguishes an application, a current membership and a renewal. A submitted application is not an active membership."},
 {"target":"[data-guide-target=\"membership-application\"]","title":"Review your application or plan","text":"Continue an existing application instead of creating a duplicate, or compare an available plan before applying. The service controls eligibility and status transitions."},
 {"title":"Return to this guide","text":"Use the Guide control to restart this walkthrough. Payment evidence and membership approval remain separate decisions."}
]'::jsonb,true,30),
('membership-payment','/membership/payment','Membership payment and receipt','Follow the configured payment instructions and check the recorded payment status. Payment does not itself activate membership.','[
 {"target":"[data-guide-target=\"payment-overview\"]","title":"Payment is a separate step","text":"The application and membership decision remain separate from payment verification. Do not pay again while an existing payment is pending."},
 {"target":"[data-guide-target=\"payment-application\"]","title":"Choose your application","text":"Select the application whose saved fee and payment status you are reviewing. The service supplies the amount and currency."},
 {"target":"[data-guide-target=\"payment-submit\"]","title":"Submit only the configured evidence","text":"Follow the selected method instructions. Receipt requirements depend on the configured method; the service confirms the submission and finance verifies it."}
]'::jsonb,true,40)
on conflict(guide_key) do update set
 route_pattern=excluded.route_pattern,title=excluded.title,description=excluded.description,
 steps=excluded.steps,active=excluded.active,sort_order=excluded.sort_order,updated_at=now();
