-- Ensure every organization workflow email uses an explicitly governed audience.
insert into email_notification_template(template_code,display_name,audience,subject_template,text_template,html_template)
values
 ('organization.registration_received','Organization registration received','organization_representative','Organization registration received: {{organizationName}}','Hello {{firstName}},\n\nYour organization registration has been received. Reference: {{registrationReference}}. Status: {{status}}. Next action: {{nextAction}}.','<p>Hello {{firstName}},</p><p>Your organization registration for <strong>{{organizationName}}</strong> has been received.</p><p>Reference: {{registrationReference}}<br/>Status: {{status}}<br/>Next action: {{nextAction}}</p>'),
 ('organization.review_queue_item','Organization review queue item','reviewer','Review required: {{organizationName}}','Hello {{firstName}},\n\nAn organization or vacancy review item requires attention. Reference: {{registrationReference}}. Status: {{status}}. Next action: {{nextAction}}.','<p>Hello {{firstName}},</p><p>An organization or vacancy review item requires attention.</p><p>Organization: {{organizationName}}<br/>Reference: {{registrationReference}}<br/>Status: {{status}}<br/>Next action: {{nextAction}}</p>'),
 ('organization.review_update','Organization verification update','organization_representative','Organization verification update: {{organizationName}}','Hello {{firstName}},\n\nThere is an update to your organization verification. Reference: {{registrationReference}}. Status: {{status}}. Next action: {{nextAction}}.','<p>Hello {{firstName}},</p><p>There is an update to your organization verification for <strong>{{organizationName}}</strong>.</p><p>Reference: {{registrationReference}}<br/>Status: {{status}}<br/>Next action: {{nextAction}}</p>')
on conflict(template_code) do nothing;

insert into email_template_version(template_code,version_number,display_name,audience,subject_template,text_template,html_template,enabled)
select t.template_code,1,t.display_name,t.audience,t.subject_template,t.text_template,t.html_template,t.enabled
from email_notification_template t
where t.template_code in ('organization.registration_received','organization.review_queue_item','organization.review_update')
  and not exists(select 1 from email_template_version v where v.template_code=t.template_code);
