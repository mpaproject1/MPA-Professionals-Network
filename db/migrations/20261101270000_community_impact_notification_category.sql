-- Community Impact notifications are a first-class preference category.
alter table notification_event drop constraint if exists notification_event_category_valid;
alter table notification_event add constraint notification_event_category_valid
 check(category in('membership','verification','opportunities','recruitment','organizations','mentorship','services','events_learning','community_impact','security','system'));
update notification_event
set category='community_impact'
where event_code like 'community_impact.%' or event_code like 'community-impact.%' or resource_type like 'community_impact%';
