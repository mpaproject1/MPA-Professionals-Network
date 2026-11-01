import "./../src/platform/load-env.js";
import {getPool} from "../src/platform/db.js";
import {runDueCommunityCampaignSlots} from "../src/platform/community-campaigns.js";
const pool=getPool();
try{const result=await runDueCommunityCampaignSlots();console.log(JSON.stringify({job:"community-campaign-scheduler",...result}));}
catch(error){console.error(JSON.stringify({job:"community-campaign-scheduler",code:error?.code||"SCHEDULER_FAILED"}));process.exitCode=1;}
finally{await pool.end();}
