import { createHash } from "node:crypto";

const PREFIX=Object.freeze({service:"SRV",mentorship:"MEN",job:"JOB",membership:"MEM",organization:"ORG"});
const YEAR_FALLBACK="00";

/**
 * Stable display-only reference for records without a stored public reference.
 * Stored references are always authoritative and are never reformatted.
 */
export function displayReference({type,id,createdAt,trackingReference=null,publicReference=null,membershipNumber=null}={}){
  if(trackingReference)return String(trackingReference);
  if(publicReference)return String(publicReference);
  if(membershipNumber)return String(membershipNumber);
  const prefix=PREFIX[type];
  if(!prefix||!id)throw new TypeError("A supported record type and stable record identifier are required.");
  const date=createdAt?new Date(createdAt):null;
  const year=date&&!Number.isNaN(date.getTime())?String(date.getUTCFullYear()).slice(-2):YEAR_FALLBACK;
  const digest=createHash("sha256").update(prefix+"\0"+String(id)).digest("hex").slice(0,12).toUpperCase();
  return `MPA-${prefix}-${year}-${digest}`;
}
