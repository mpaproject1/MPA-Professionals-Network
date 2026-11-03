-- Explicit audience coverage for the workflow producers audited in membership,
-- organization/jobs and services/mentorship services. Missing templates fail closed.
insert into email_notification_template(template_code,display_name,audience,subject_template,text_template,html_template)
values
 ('professional.workflow_update','Professional workflow update','professional','MPA account update: {{status}}','Hello {{firstName}},\n\nThere is an update to your MPA account. Status: {{status}}. {{message}}\n\nNext action: {{nextAction}}','<p>Hello {{firstName}},</p><p>There is an update to your MPA account.</p><p>Status: {{status}}</p><p>{{message}}</p><p>Next action: {{nextAction}}</p>'),
 ('employer.candidate_update','Employer recruitment update','employer','Recruitment update: {{title}}','Hello {{firstName}},\n\n{{message}}\n\nStatus: {{status}}. Next action: {{nextAction}}','<p>Hello {{firstName}},</p><p>{{message}}</p><p>Status: {{status}}</p><p>Next action: {{nextAction}}</p>'),
 ('employer.offer_approval_required','Employer offer approval required','employer','Job offer approval required','Hello {{firstName}},\n\nA job offer requires your internal approval. {{message}}\n\nNext action: {{nextAction}}','<p>Hello {{firstName}},</p><p>A job offer requires your internal approval.</p><p>{{message}}</p><p>Next action: {{nextAction}}</p>'),
 ('employer.interview_scheduled','Employer interview scheduled','employer','Interview scheduled: {{jobTitle}}','Hello {{firstName}},\n\nAn interview was scheduled in your recruitment workflow. {{message}}\n\nNext action: {{nextAction}}\nTime: {{scheduledStart}} ({{timezone}})','<p>Hello {{firstName}},</p><p>An interview was scheduled in your recruitment workflow.</p><p>{{message}}</p><p>Next action: {{nextAction}}</p><p>Time: {{scheduledStart}} ({{timezone}})</p>'),
 ('employer.interview_response','Employer interview response','employer','Interview response: {{status}}','Hello {{firstName}},\n\n{{message}}\n\nNext action: {{nextAction}}','<p>Hello {{firstName}},</p><p>{{message}}</p><p>Status: {{status}}</p><p>Next action: {{nextAction}}</p>'),
 ('mentor.mentorship_update','Mentor mentorship update','mentor','Mentorship update: {{status}}','Hello {{firstName}},\n\nThere is an update to your mentorship match. Status: {{status}}. {{message}}\n\nNext action: {{nextAction}}','<p>Hello {{firstName}},</p><p>There is an update to your mentorship match.</p><p>Status: {{status}}</p><p>{{message}}</p><p>Next action: {{nextAction}}</p>'),
 ('organization.membership_added','Organization workspace access granted','all','Organization workspace access granted','Hello {{firstName}},\n\nYou were granted access to an organization workspace. {{message}}\n\nNext action: {{nextAction}}','<p>Hello {{firstName}},</p><p>You were granted access to an organization workspace.</p><p>{{message}}</p><p>Next action: {{nextAction}}</p>'),
 ('organization.membership_updated','Organization workspace access updated','all','Organization workspace access updated','Hello {{firstName}},\n\nYour organization workspace access was updated. {{message}}\n\nNext action: {{nextAction}}','<p>Hello {{firstName}},</p><p>Your organization workspace access was updated.</p><p>{{message}}</p><p>Next action: {{nextAction}}</p>')
on conflict(template_code) do nothing;

with expected(template_code,audience) as (values
 ('professional.workflow_update','professional'),
 ('employer.candidate_update','employer'),
 ('employer.offer_approval_required','employer'),
 ('employer.interview_scheduled','employer'),
 ('employer.interview_response','employer'),
 ('mentor.mentorship_update','mentor'),
 ('organization.membership_added','all'),
 ('organization.membership_updated','all')
), changed as (
 update email_notification_template t
 set audience=e.audience,updated_at=now()
 from expected e
 where t.template_code=e.template_code and t.audience is distinct from e.audience
 returning t.*
)
insert into email_template_version(template_code,version_number,display_name,audience,subject_template,text_template,html_template,enabled,changed_by)
select c.template_code,
       coalesce((select max(v.version_number)+1 from email_template_version v where v.template_code=c.template_code),1),
       c.display_name,c.audience,c.subject_template,c.text_template,c.html_template,c.enabled,c.updated_by
from changed c;

insert into email_template_version(template_code,version_number,display_name,audience,subject_template,text_template,html_template,enabled)
select t.template_code,1,t.display_name,t.audience,t.subject_template,t.text_template,t.html_template,t.enabled
from email_notification_template t
where t.template_code in ('professional.workflow_update','employer.candidate_update','employer.offer_approval_required','employer.interview_scheduled','employer.interview_response','mentor.mentorship_update','organization.membership_added','organization.membership_updated')
  and not exists(select 1 from email_template_version v where v.template_code=t.template_code);
