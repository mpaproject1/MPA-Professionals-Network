-- Keep escalation email aligned with the exact support-manager recipient query.
insert into email_notification_template(template_code,display_name,audience,subject_template,text_template,html_template)
values ('support.inquiry_escalated','Support inquiry escalated','support_manager',
 'Support inquiry escalated: {{publicReference}}',
 'Hello {{firstName}},\n\nA support inquiry requires manager attention. Reference: {{publicReference}}. Priority: {{priority}}. Status: {{status}}. {{message}}\n\nNext action: {{nextAction}}\n{{actionUrl}}',
 '<p>Hello {{firstName}},</p><p>A support inquiry requires manager attention.</p><p>Reference: {{publicReference}}</p><p>Priority: {{priority}}</p><p>Status: {{status}}</p><p>{{message}}</p><p>Next action: {{nextAction}}</p><p><a href="{{actionUrl}}">Review support inquiry</a></p>')
on conflict(template_code) do nothing;
insert into email_template_version(template_code,version_number,display_name,audience,subject_template,text_template,html_template,enabled)
select t.template_code,1,t.display_name,t.audience,t.subject_template,t.text_template,t.html_template,t.enabled
from email_notification_template t
where t.template_code='support.inquiry_escalated'
and not exists(select 1 from email_template_version v where v.template_code=t.template_code);
