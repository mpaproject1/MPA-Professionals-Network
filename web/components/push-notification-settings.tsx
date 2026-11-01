"use client";

import {BellOff, BellRing, ShieldCheck} from "lucide-react";
import {useEffect, useState} from "react";
import {ApiError,api} from "../lib/api";

type PushStatus={configured:boolean;enabled:boolean;activeDevices:number};
type PublicKeyResult={enabled:boolean;publicKey:string|null};
function encodeKey(value:ArrayBuffer){return btoa(String.fromCharCode(...new Uint8Array(value))).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");}
function decodeKey(value:string){const padded=value.replace(/-/g,"+").replace(/_/g,"/")+"===".slice((value.length+3)%4);return Uint8Array.from(atob(padded),char=>char.charCodeAt(0));}

export function PushNotificationSettings({token}:{token:string}){
 const [status,setStatus]=useState<PushStatus|null>(null),[deviceEnabled,setDeviceEnabled]=useState(false);
 const [permission,setPermission]=useState<NotificationPermission|"unsupported">("default");
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const supported=typeof window!=="undefined"&&window.isSecureContext&&"serviceWorker" in navigator&&"PushManager" in window&&"Notification" in window;
 useEffect(()=>{
  let cancelled=false;
  if(typeof window!=="undefined"&&"Notification" in window)setPermission(Notification.permission);else setPermission("unsupported");
  api<PushStatus>("/api/v1/notifications/push/status",{},token).then(value=>{if(!cancelled)setStatus(value)}).catch(e=>{if(!cancelled)setError(e instanceof ApiError?e.message:"Push notification status could not be loaded.")});
  if("serviceWorker" in navigator)void navigator.serviceWorker.getRegistration("/").then(registration=>registration?.pushManager.getSubscription()).then(subscription=>{if(!cancelled)setDeviceEnabled(Boolean(subscription))}).catch(()=>{});
  return()=>{cancelled=true};
 },[token]);
 async function enable(){
  if(!supported){setError("Push notifications are not supported in this browser or require a secure HTTPS connection.");return;}
  setBusy(true);setError("");setNotice("");
  try{
   const config=await api<PublicKeyResult>("/api/v1/notifications/push/public-key",{},token);
   if(!config.enabled||!config.publicKey)throw new Error("MPA push delivery is not configured on the server yet.");
   const result=await Notification.requestPermission();
   setPermission(result);
   if(result!=="granted")throw new Error(result==="denied"?"Notifications are blocked in your browser settings. Change the site permission there before trying again.":"Notification permission was not granted.");
   const registration=await navigator.serviceWorker.register("/sw.js",{scope:"/"});
   const ready=await navigator.serviceWorker.ready;
   const manager=ready.pushManager||registration.pushManager;
   let subscription=await manager.getSubscription();
   if(!subscription)subscription=await manager.subscribe({userVisibleOnly:true,applicationServerKey:decodeKey(config.publicKey) as BufferSource});
   const p256dh=subscription.getKey("p256dh"),auth=subscription.getKey("auth");
   if(!p256dh||!auth)throw new Error("The browser did not provide the encryption keys required for secure push delivery.");
   const saved=await api<PushStatus>("/api/v1/notifications/push/subscriptions",{method:"POST",body:JSON.stringify({endpoint:subscription.endpoint,expirationTime:subscription.expirationTime,keys:{p256dh:encodeKey(p256dh),auth:encodeKey(auth)}})},token);
   setStatus(saved);setDeviceEnabled(true);setNotice("Push notifications are enabled on this device. You can change this permission in your browser settings.");
  }catch(e){setError(e instanceof ApiError?e.message:e instanceof Error?e.message:"Push notifications could not be enabled.");}
  finally{setBusy(false);}
 }
 async function disable(){
  setBusy(true);setError("");setNotice("");
  try{
   const registration=await navigator.serviceWorker.getRegistration("/");
   const subscription=await registration?.pushManager.getSubscription();
   if(subscription){
    await api<PushStatus>("/api/v1/notifications/push/subscriptions",{method:"DELETE",body:JSON.stringify({endpoint:subscription.endpoint})},token);
    await subscription.unsubscribe();
   }
   const current=await api<PushStatus>("/api/v1/notifications/push/status",{},token);
   setStatus(current);setDeviceEnabled(false);setNotice("Push notifications were turned off for this device.");
  }catch(e){setError(e instanceof ApiError?e.message:"Push notifications could not be disabled.");}
  finally{setBusy(false);}
 }
 return <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" aria-labelledby="push-settings-title">
  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
   <div className="flex items-start gap-3">
    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[var(--bg)]"><BellRing size={19}/></span>
    <div><h2 id="push-settings-title" className="font-semibold">Phone and browser notifications</h2>
     <p className="mt-1 max-w-2xl text-sm text-[var(--muted)]">Receive private, general MPA update alerts when the portal is not open. Your lock screen will not show member names, application details or other private record information.</p>
     <p className="mt-1 text-xs text-[var(--muted)]">Works on supported HTTPS browsers and installed web apps. Sound and vibration depend on your device settings; this is not an alarm that can override silent mode or Do Not Disturb.</p>
    </div>
   </div>
   {deviceEnabled?<button type="button" className="btn btn-secondary inline-flex items-center justify-center gap-2" disabled={busy} onClick={()=>void disable()}><BellOff size={16}/>{busy?"Updating…":"Turn off this device"}</button>:<button type="button" className="btn btn-primary inline-flex items-center justify-center gap-2" disabled={busy||!supported||status?.configured===false} onClick={()=>void enable()}><BellRing size={16}/>{busy?"Enabling…":"Enable push"}</button>}
  </div>
  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
   <span>{status?.enabled?"Enabled on "+status.activeDevices+" device"+(status.activeDevices===1?"":"s"):status?.configured===false?"Server push delivery is not configured yet":supported?"Available on this device":"Not supported in this browser or connection"}</span>
   <span>Browser permission: {permission==="unsupported"?"unsupported":permission}</span>
  </div>
  {error?<p role="alert" className="mt-3 text-sm text-red-700">{error}</p>:null}
  {notice?<p role="status" className="mt-3 text-sm text-[var(--muted)]">{notice}</p>:null}
  <div className="mt-3 flex items-start gap-2 text-xs text-[var(--muted)]"><ShieldCheck size={14} className="mt-0.5 shrink-0"/><span>Only this signed-in account can register or revoke its device subscription. You can disable browser permission at any time.</span></div>
 </section>;
}
