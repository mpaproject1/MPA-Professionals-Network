"use client";
import {ArrowRight,Fingerprint,KeyRound,LogIn,ShieldCheck,UserRoundPlus} from "lucide-react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import {type FormEvent,useState} from "react";
import {EmailVerificationGate} from "../../components/email-verification-gate";
import {Card} from "../../components/ui";
import {ApiError, api} from "../../lib/api";
import {useUiStore} from "../../lib/store";

function fromB64url(value:string):Uint8Array{
 const normalized=value.replace(/-/g,"+").replace(/_/g,"/");
 const binary=atob(normalized+"=".repeat((4-normalized.length%4)%4));
 return Uint8Array.from(binary,char=>char.charCodeAt(0));
}
function toWebAuthnBuffer(value:Uint8Array):ArrayBuffer{return value.slice().buffer as ArrayBuffer;}
function toB64url(value:ArrayBuffer):string{
 const bytes=new Uint8Array(value);let binary="";
 for(const byte of bytes)binary+=String.fromCharCode(byte);
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function serializeAssertion(credential:PublicKeyCredential){
 const response=credential.response as AuthenticatorAssertionResponse;
 return {id:credential.id,rawId:toB64url(credential.rawId),type:credential.type,response:{
  clientDataJSON:toB64url(response.clientDataJSON),authenticatorData:toB64url(response.authenticatorData),
  signature:toB64url(response.signature),userHandle:response.userHandle?toB64url(response.userHandle):null
 }};
}
type PasskeyOptions={publicKey:{challenge:string;rpId:string;timeout:number;userVerification:UserVerificationRequirement;allowCredentials:Array<{type:"public-key";id:string;transports?:AuthenticatorTransport[]}>}};
export default function Login(){
 const router=useRouter();
 const setToken=useUiStore(s=>s.setToken);
 const [email,setEmail]=useState("");
 const [password,setPassword]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 const [passkeyBusy,setPasskeyBusy]=useState(false);
 const [recoveryMode,setRecoveryMode]=useState(false);
 const [verificationRequired,setVerificationRequired]=useState(false);
 const [recoveryCode,setRecoveryCode]=useState("");
 async function finishLogin(token:string,passkeyEnrollmentRequired=false){
   setToken(token);
   if(passkeyEnrollmentRequired){router.replace("/admin/security?enroll=1");return;}
   const requested=new URLSearchParams(window.location.search).get("next");
   const destination=requested?.startsWith("/")&&!requested.startsWith("//")?requested:"/dashboard";
   router.replace(destination);
 }
 async function submit(e:FormEvent){
   e.preventDefault();setBusy(true);setError("");
   try{const r=await api<any>("/api/v1/auth/login",{method:"POST",body:JSON.stringify({email,password})});await finishLogin(r.token,Boolean(r.passkeyEnrollmentRequired));}
  catch(err){if(err instanceof ApiError&&err.code==="EMAIL_VERIFICATION_REQUIRED"){setEmail(email.includes("@")?email:"");setPassword("");setVerificationRequired(true);setError("");}else setError(err instanceof Error?err.message:"We could not sign you in. Please try again.");}
   finally{setBusy(false);}
 }
 if(verificationRequired)return <EmailVerificationGate email={email} message="Your credentials are correct, but your email address is not verified. Request a fresh activation link or verify the latest email before signing in."/>;
 async function signInWithPasskey(){
   setPasskeyBusy(true);setError("");
   try{
     if(!email.includes("@"))throw new Error("Enter the administrator email address to use passkey sign-in.");
     if(!window.isSecureContext||!navigator.credentials||!("PublicKeyCredential" in window))throw new Error("Passkeys require a supported browser and HTTPS (localhost is allowed for development).");
     const options=await api<PasskeyOptions>("/api/v1/auth/passkeys/options",{method:"POST",body:JSON.stringify({email})});
     const publicKey:PublicKeyCredentialRequestOptions={...options.publicKey,challenge:toWebAuthnBuffer(fromB64url(options.publicKey.challenge)),allowCredentials:options.publicKey.allowCredentials.map(item=>({...item,id:toWebAuthnBuffer(fromB64url(item.id))}))};
     const credential=await navigator.credentials.get({publicKey}) as PublicKeyCredential|null;
     if(!credential)throw new Error("Passkey sign-in was cancelled.");
     const result=await api<{token:string}>("/api/v1/auth/passkeys/verify",{method:"POST",body:JSON.stringify({email,credential:serializeAssertion(credential)})});
     await finishLogin(result.token);
   }catch(err){setError(err instanceof Error?err.message:"Passkey sign-in failed.");}
   finally{setPasskeyBusy(false);}
 }
 async function recover(e:FormEvent){
   e.preventDefault();setBusy(true);setError("");
   try{const result=await api<{token:string}>("/api/v1/auth/passkeys/recovery",{method:"POST",body:JSON.stringify({email,code:recoveryCode})});setToken(result.token);router.replace("/admin/security?recovery=1");}
   catch(err){setError(err instanceof Error?err.message:"Recovery could not be completed.");}
   finally{setBusy(false);}
 }
 async function resendVerification(){
   setBusy(true);setError("");
   try{const result=await api<{developmentVerificationUrl?:string}>("/api/v1/auth/email-verification/resend",{method:"POST",body:JSON.stringify({email})});setError(result.developmentVerificationUrl?`Development verification link: ${result.developmentVerificationUrl}`:"If this address needs verification, a new link has been requested. Check your inbox and spam folder.");}
   catch(err){setError(err instanceof Error?err.message:"Could not request a verification link.");}
   finally{setBusy(false);}
 }
 return <main className="auth-page auth-login-page">
  <section className="auth-login-card" aria-labelledby="login-title">
   <div className="auth-login-glow" aria-hidden="true"/>
   <div className="auth-login-brand"><span className="auth-login-mark"><ShieldCheck size={17}/></span><span>MPA <i>·</i> PROFESSIONALS NETWORK</span><span className="auth-login-secure"><span/> SECURE ACCESS</span></div>
   <div className="auth-login-heading"><div className="eyebrow">MEMBER ACCESS</div><h1 id="login-title">{recoveryMode?"Recover access":"Welcome back"}</h1><p>{recoveryMode?"Verify your recovery code to register a replacement administrator passkey.":"Sign in to continue to your MPA workspace."}</p></div>
   <form onSubmit={recoveryMode?recover:submit} className="form-stack auth-login-form" aria-busy={busy||passkeyBusy}>
    <fieldset disabled={busy||passkeyBusy} style={{border:0,padding:0,margin:0,minWidth:0,display:"grid",gap:11}}>
     <label>Email or username<input required type="text" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" placeholder="you@example.org or username"/></label>
     {!recoveryMode&&<>
      <label>Password<input required type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" placeholder="Enter your password"/></label>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="btn btn-primary auth-login-submit" disabled={busy}>{busy?"Signing in…":"Sign in"} <LogIn size={16}/></button>
      <div className="auth-login-tools">
       <button type="button" className="btn btn-ghost" onClick={()=>void signInWithPasskey()} disabled={passkeyBusy||busy||!email.trim()}><Fingerprint size={15}/>{passkeyBusy?"Verifying…":"Passkey"}</button>
       <button type="button" className="btn btn-ghost" onClick={()=>void resendVerification()} disabled={busy||!email.includes("@")}>Resend verification</button>
       <button type="button" className="btn btn-ghost" onClick={()=>{setRecoveryMode(true);setError("");}}>Recovery code</button>
      </div>
     </>}
     {recoveryMode&&<>
      <label>One-time recovery code<input required value={recoveryCode} onChange={e=>setRecoveryCode(e.target.value)} autoComplete="one-time-code" spellCheck={false}/></label>
      {error&&<div className="form-error" role="alert">{error}</div>}
      <button type="submit" className="btn btn-primary auth-login-submit" disabled={busy}>{busy?"Checking code…":"Recover access"} <KeyRound size={16}/></button>
      <button type="button" className="btn btn-ghost" onClick={()=>{setRecoveryMode(false);setError("");}}>Back to sign in</button>
     </>}
    </fieldset>
   </form>
   {!recoveryMode&&<div className="auth-login-register"><span>New to MPA?</span><Link href="/register">Create an account <ArrowRight size={15}/></Link></div>}
   <div className="auth-login-foot"><ShieldCheck size={14}/><span>Protected sign-in · Your private evidence stays private.</span></div>
   <div className="auth-links"><a href="/track">Track application</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div>
  </section>
 </main>;
}
