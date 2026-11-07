import {getPool} from "../platform/db.js";
import {createInAppNotification} from "../platform/notifications.js";

export function dueMentorshipReminderKinds(secondsRemaining){
 const seconds=Number(secondsRemaining);
 if(!Number.isFinite(seconds)||seconds<=0)return [];
 if(seconds<=60*60)return ["one_hour"];
 if(seconds<=24*60*60)return ["one_day"];
 return [];
}

/**
 * Enqueue idempotent reminders for mutually confirmed upcoming sessions.
 * The existing web-push dispatch cron invokes this scheduler before delivery.
 */
export async function runDueMentorshipSessionReminders(){
 const db=getPool();
 const rows=(await db.query(`
  select s.id,s.mentorship_id,s.scheduled_start_at,m.mentor_user_id,m.mentee_user_id,
         extract(epoch from (s.scheduled_start_at-now()))::int seconds_remaining
  from mentorship_session s
  join mentorship m on m.id=s.mentorship_id
  where s.status='scheduled' and s.coordination_status='accepted'
    and m.status in ('active','paused') and s.scheduled_start_at>now()
    and s.scheduled_start_at<=now()+interval '24 hours'
  order by s.scheduled_start_at asc
 `)).rows;
 let enqueued=0;
 for(const session of rows){
  const kinds=dueMentorshipReminderKinds(session.seconds_remaining);
  for(const kind of kinds){
   for(const participantId of [session.mentor_user_id,session.mentee_user_id]){
    const notification=await createInAppNotification(db,participantId,"mentorship.session_reminder","mentorship_session",session.id,{
     title:kind==="one_hour"?"Mentorship session in one hour":"Mentorship session coming up",
     message:kind==="one_hour"?"Your confirmed mentorship session starts within an hour. Open your workspace to review the agenda and meeting details.":"Your confirmed mentorship session is coming up within 24 hours. Review the agenda and meeting details in your mentorship workspace.",
     nextAction:"Prepare for the confirmed session and review any agreed objectives.",
     actionUrl:"/mentorship",actionRequired:true,priority:"normal",
     dedupeKey:"mentorship-session-reminder:"+session.id+":"+new Date(session.scheduled_start_at).toISOString()+":"+kind+":"+participantId,
     category:"mentorship"
    });
    if(notification)enqueued++;
   }
  }
 }
 return {sessionsChecked:rows.length,notificationsEnqueued:enqueued};
}
