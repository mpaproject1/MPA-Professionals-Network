import { getPool } from "./db.js";

export async function captureTestDelivery({channel,recipient=null,eventCode,payload={},portfolioId=null}){
 if(process.env.TEST_DELIVERY_MODE!=="capture"||process.env.NODE_ENV==="production")return false;
 const db=getPool();
 let owner=portfolioId;
 if(!owner&&recipient)owner=(await db.query("select portfolio_id from test_portfolio_account where lower(email)=lower($1) limit 1",[String(recipient)])).rows[0]?.portfolio_id||null;
 await db.query("insert into test_delivery_capture(portfolio_id,channel,recipient,event_code,payload) values($1,$2,$3,$4,$5)",[owner,channel,recipient,eventCode,payload]);
 return true;
}
