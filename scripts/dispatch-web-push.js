import "./../src/platform/load-env.js";
import {getPool} from "../src/platform/db.js";
import {dispatchPendingPushNotifications} from "../src/platform/web-push.js";
import {runDueMentorshipSessionReminders} from "../src/services-mentorship/reminders.js";

const pool=getPool();
try{
 const reminders=await runDueMentorshipSessionReminders();
 const result=await dispatchPendingPushNotifications(Number(process.env.WEB_PUSH_BATCH_SIZE)||50);
 console.log(JSON.stringify({job:"web-push-dispatch",mentorshipReminders:reminders,...result}));
 if(result.failed>0)process.exitCode=1;
}catch(error){
 console.error(JSON.stringify({job:"web-push-dispatch",error:error?.code||"DISPATCH_FAILED"}));
 process.exitCode=1;
}finally{
 await pool.end();
}
