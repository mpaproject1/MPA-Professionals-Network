import "./../src/platform/load-env.js";
import {dispatchCommunityCampaignPublicPush,runDueCommunityCampaignSlots} from "../src/platform/community-campaigns.js";
import {getPool} from "../src/platform/db.js";
const pool=getPool();
try{const result=await runDueCommunityCampaignSlots();const publicPush=await dispatchCommunityCampaignPublicPush(Number(process.env.WEB_PUSH_BATCH_SIZE)||50);console.log(JSON.stringify({job:"community-campaign-scheduler",...result,publicPush}));}
catch(error){console.error(JSON.stringify({job:"community-campaign-scheduler",code:error?.code||"SCHEDULER_FAILED"}));process.exitCode=1;}
finally{await pool.end();}
