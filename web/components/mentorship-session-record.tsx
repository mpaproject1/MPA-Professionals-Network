"use client";
import {useEffect,useState} from "react";
import {api} from "../lib/api";
import {FormFeedback} from "./form-feedback";

type ChecklistItem={label:string;completed:boolean};
type ActionItem={description:string;dueAt?:string|null;completed:boolean};
type Session={id:string;status:string;coordination_status?:string;preparation_checklist?:ChecklistItem[];agreed_actions?:ActionItem[];outcome_summary?:string|null;session_timezone?:string|null};
export function MentorshipSessionRecord({session,token}:{session:Session;token:string}){
 const [checklist,setChecklist]=useState<ChecklistItem[]>(session.preparation_checklist||[]);
 const [actions,setActions]=useState<ActionItem[]>(session.agreed_actions||[]);
 const [outcome,setOutcome]=useState(session.outcome_summary||"");
 const [timezone,setTimezone]=useState(session.session_timezone||"Africa/Addis_Ababa");
 const [newPrep,setNewPrep]=useState("");
 const [newAction,setNewAction]=useState("");
 const [newActionDue,setNewActionDue]=useState("");
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [saved,setSaved]=useState(false);
 useEffect(()=>{setChecklist(session.preparation_checklist||[]);setActions(session.agreed_actions||[]);setOutcome(session.outcome_summary||"");setTimezone(session.session_timezone||"Africa/Addis_Ababa");},[session.id,session.preparation_checklist,session.agreed_actions,session.outcome_summary,session.session_timezone]);
 function addPrep(){const label=newPrep.trim();if(!label)return;if(checklist.length>=20){setError("A session can have up to 20 preparation items.");return;}setChecklist(current=>[...current,{label,completed:false}]);setNewPrep("");setSaved(false);}
 function addFollowUp(){const description=newAction.trim();if(!description)return;if(actions.length>=20){setError("A session can have up to 20 follow-up actions.");return;}setActions(current=>[...current,{description,dueAt:newActionDue?new Date(newActionDue).toISOString():null,completed:false}]);setNewAction("");setNewActionDue("");setSaved(false);}
 async function save(){if(saving)return;setSaving(true);setError("");setSaved(false);try{const result=await api<{preparation_checklist:ChecklistItem[];agreed_actions:ActionItem[];outcome_summary:string|null;session_timezone:string}>(`/api/v1/mentorship/sessions/${encodeURIComponent(session.id)}/details`,{method:"PATCH",body:JSON.stringify({preparationChecklist:checklist,agreedActions:actions,outcomeSummary:outcome,sessionTimezone:timezone})},token);setChecklist(result.preparation_checklist||checklist);setActions(result.agreed_actions||actions);setOutcome(result.outcome_summary||"");setTimezone(result.session_timezone||timezone);setSaved(true);}catch(cause){setError(cause instanceof Error?cause.message:"Session preparation and follow-up could not be saved.");}finally{setSaving(false);}}
 return <details className="case-row" style={{marginTop:8}}><summary className="text-link">Preparation, follow-up and session record</summary><div className="grid" style={{gap:10,marginTop:10}}>
  {error?<FormFeedback kind="error" message={error}/>:null}{saved?<p className="muted" role="status">Session record saved.</p>:null}
  <label>Session timezone<input value={timezone} onChange={e=>{setTimezone(e.target.value);setSaved(false);}} placeholder="Africa/Addis_Ababa"/></label>
  <section className="grid" style={{gap:6}}><b>Preparation checklist</b>{checklist.map((item,index)=><label key={index} className="row" style={{gap:8,alignItems:"center"}}><input type="checkbox" checked={item.completed} onChange={e=>{setChecklist(current=>current.map((value,i)=>i===index?{...value,completed:e.target.checked}:value));setSaved(false);}}/><span>{item.label}</span><button className="btn btn-ghost" type="button" onClick={()=>{setChecklist(current=>current.filter((_,i)=>i!==index));setSaved(false);}}>Remove</button></label>)}<div className="row" style={{gap:6,flexWrap:"wrap"}}><input aria-label="New preparation checklist item" value={newPrep} maxLength={240} onChange={e=>setNewPrep(e.target.value)} placeholder="Add a preparation item"/><button className="btn btn-ghost" type="button" onClick={addPrep}>Add</button></div></section>
  <section className="grid" style={{gap:6}}><b>Agreed follow-up actions</b>{actions.map((item,index)=><div className="row" key={index} style={{gap:8,flexWrap:"wrap",alignItems:"center"}}><label className="row" style={{gap:8,flex:1}}><input type="checkbox" checked={item.completed} onChange={e=>{setActions(current=>current.map((value,i)=>i===index?{...value,completed:e.target.checked}:value));setSaved(false);}}/><span>{item.description}</span></label><span className="muted">{item.dueAt?"Due "+new Date(item.dueAt).toLocaleDateString():"No due date"}</span><button className="btn btn-ghost" type="button" onClick={()=>{setActions(current=>current.filter((_,i)=>i!==index));setSaved(false);}}>Remove</button></div>)}<input aria-label="New follow-up action" value={newAction} maxLength={300} onChange={e=>setNewAction(e.target.value)} placeholder="Action agreed by participants"/><label>Action due date (optional)<input type="date" value={newActionDue} onChange={e=>setNewActionDue(e.target.value)}/></label><button className="btn btn-ghost" type="button" onClick={addFollowUp}>Add follow-up action</button></section>
  <label>Session outcome / brief record<textarea rows={3} maxLength={2000} value={outcome} onChange={e=>{setOutcome(e.target.value);setSaved(false);}} placeholder="Record the outcome and key learning from this session."/></label>
  <button className="btn btn-primary" type="button" onClick={()=>void save()} disabled={saving}>{saving?"Saving…":"Save session record"}</button>
 </div></details>;
}
