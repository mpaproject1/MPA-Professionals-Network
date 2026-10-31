"use client";
import {AlertTriangle, Home, RefreshCw} from "lucide-react";
import Link from "next/link";
import {useEffect} from "react";
import { SupportAction } from "../components/support-action";
import {Card} from "../components/ui";

export default function ErrorPage({error,reset}:{error:Error & {digest?:string};reset:()=>void}){
  useEffect(()=>{console.error("Portal route failed",error.digest||error.name||"client exception")},[error]);
  return <div className="auth-page"><Card>
    <div className="eyebrow"><AlertTriangle size={15}/> Something went wrong</div>
    <h1 className="h1">This page could not be loaded.</h1>
    <p className="muted">The page could not finish rendering. If you had just submitted a form, check application tracking before submitting it again. Try loading the page again. If the problem continues, contact MPA Support.</p>
    <div className="landing-actions">
      <button type="button" className="btn btn-primary" onClick={()=>reset()}><RefreshCw size={16}/> Try again</button>
      <Link className="btn btn-ghost" href="/"><Home size={16}/> Return home</Link>
      <SupportAction label="Contact MPA Support" />
    </div>
  </Card></div>;
}
