-- Extend the existing governed audience constraints without weakening any
-- existing audience values. The same policy is stored on live templates and
-- immutable template versions.
do $$
declare
  target record;
begin
  for target in
    select c.conname, c.conrelid::regclass as relation_name,
           pg_get_expr(c.conbin, c.conrelid) as check_expression
    from pg_constraint c
    where c.contype = 'c'
      and c.conrelid in ('public.email_notification_template'::regclass,
                         'public.email_template_version'::regclass)
      and pg_get_expr(c.conbin, c.conrelid) ilike '%audience%'
  loop
    execute format('alter table %s drop constraint %I', target.relation_name, target.conname);
    execute format(
      'alter table %s add constraint %I check ((%s) or audience = %L)',
      target.relation_name,
      target.conname,
      target.check_expression,
      'support_manager'
    );
  end loop;
end $$;

-- The delivery dispatcher records retry scheduling and provider failures.
-- Preserve the existing audit outcome vocabulary and add the two outcomes
-- already emitted by the dispatcher.
do $$
declare
  existing_check text;
begin
  select pg_get_expr(c.conbin, c.conrelid)
    into existing_check
  from pg_constraint c
  where c.conrelid = 'public.audit_log'::regclass
    and c.conname = 'audit_log_outcome_check'
    and c.contype = 'c';

  if existing_check is null then
    raise exception 'Expected audit_log_outcome_check was not found; refusing to replace an unknown audit policy';
  end if;

  alter table public.audit_log drop constraint audit_log_outcome_check;
  execute format(
    'alter table public.audit_log add constraint audit_log_outcome_check check ((%s) or outcome in (%L, %L))',
    existing_check,
    'failure',
    'retry_scheduled'
  );
end $$;

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
