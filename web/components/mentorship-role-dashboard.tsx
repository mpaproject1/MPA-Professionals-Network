"use client";
import {ArrowRight,CalendarClock,ClipboardCheck,Flag,MessageSquareText} from "lucide-react";
import Link from "next/link";
import {Badge,Card} from "./ui";

type Match={id:string;status:string;match_role?:"mentor"|"mentee";mentee_name:string;mentor_name?:string;mentee_consent_status?:string;goals?:string};
type Relationship={id:string;mentor_user_id:string;mentee_user_id:string;mentor_name:string;mentee_name:string;goals:string;status:string};
type Goal={id:string;title:string;status:string;target_date?:string|null};
type Session={id:string;status:string;scheduled_start_at:string;scheduled_end_at:string;agenda?:string|null;coordination_status?:string;proposed_by?:string|null;agreed_actions?:{description:string;dueAt?:string|null;completed:boolean}[]};
type Feedback={id:string;comments?:string|null;created_at:string;reviewer_user_id?:string;target_role?:string};
type LearningProgress={id:string;mentorship_id:string;title:string;due_at?:string|null;mentor_user_id:string;mentee_user_id:string;submission_status?:string|null;submission_id?:string|null};
type Details={goals:Goal[];sessions:Session[];feedback:Feedback[]};
export function MentorshipRoleDashboard({role,currentUserId,matches,relationships,details,learningProgress,maxActiveMentees}:{role:"mentor"|"mentee";currentUserId:string;matches:Match[];relationships:Relationship[];details:Record<string,Details>;learningProgress:LearningProgress[];maxActiveMentees?:number}){
 const now=Date.now();
 const pendingMatches=matches.filter(item=>role==="mentor"?(item.match_role==="mentor"&&item.status==="proposed"):(item.match_role==="mentee"&&item.status==="accepted"&&item.mentee_consent_status==="pending"));
 const sessions=relationships.flatMap(relationship=>(details[relationship.id]?.sessions||[]).map(session=>({relationship,session})));
 const pendingSession=sessions.filter(({session})=>session.coordination_status==="proposed"&&session.proposed_by!==currentUserId);
 const upcoming=sessions.filter(({session})=>session.coordination_status==="accepted"&&session.status==="scheduled"&&new Date(session.scheduled_start_at).getTime()>=now).sort((a,b)=>new Date(a.session.scheduled_start_at).getTime()-new Date(b.session.scheduled_start_at).getTime());
 const overdue=relationships.flatMap(relationship=>(details[relationship.id]?.goals||[]).filter(goal=>goal.target_date&&new Date(goal.target_date).getTime()<now&&!["achieved","not_achieved","cancelled"].includes(goal.status)).map(goal=>({relationship,goal})));
 const reviewCount=relationships.reduce((sum,relationship)=>sum+(details[relationship.id]?.feedback||[]).filter(item=>item.comments).length,0);
 const workAwaitingReview=learningProgress.filter(item=>item.mentor_user_id===currentUserId&&item.submission_status==="submitted");
 const assignmentsOutstanding=learningProgress.filter(item=>item.mentee_user_id===currentUserId&&item.submission_status!=="accepted");
 const followUps=sessions.flatMap(({relationship,session})=>(session.agreed_actions||[]).filter(action=>!action.completed).map(action=>({relationship,session,action}))); 
 const latestFeedback=relationships.flatMap(relationship=>(details[relationship.id]?.feedback||[]).filter(item=>item.comments&&item.reviewer_user_id!==currentUserId).map(item=>({relationship,item}))).sort((a,b)=>new Date(b.item.created_at).getTime()-new Date(a.item.created_at).getTime())[0];
 const nextAction=pendingMatches.length?role==="mentor"?"Respond to a mentorship invitation":"Review your proposed mentor":pendingSession.length?"Confirm or decline a proposed session":role==="mentor"&&workAwaitingReview.length?"Review a mentee submission":role==="mentee"&&assignmentsOutstanding.length?"Complete an assigned learning activity":followUps.length?"Complete an agreed follow-up action":overdue.length?"Review an overdue development goal":upcoming.length?"Prepare for your next confirmed session":relationships.length?"Continue your agreed development plan":role==="mentor"?"Complete your mentor profile and availability":"Define your professional development objective";
 return <section className="grid" aria-label={role==="mentor"?"Mentor dashboard":"Mentee development dashboard"} style={{gap:12,margin:"14px 0"}}>
  <div className="row" style={{justifyContent:"space-between",alignItems:"center",flexWrap:"wrap"}}><div><div className="eyebrow">{role==="mentor"?"MENTOR WORKSPACE":"MENTEE WORKSPACE"}</div><h2 className="h2">{role==="mentor"?"Your mentoring operations":"Your development overview"}</h2></div><Badge>{relationships.filter(item=>item.status==="active").length} active relationship{relationships.filter(item=>item.status==="active").length===1?"":"s"}</Badge></div>
  <div className="grid grid-3" style={{gap:10}}>
   <Card><div className="muted">{role==="mentor"?"Active mentees":"Current mentor"}</div><div style={{fontSize:22,fontWeight:750,marginTop:6}}>{role==="mentor"?relationships.filter(item=>item.mentor_user_id===currentUserId&&item.status==="active").length:relationships.find(item=>item.mentee_user_id===currentUserId&&item.status==="active")?.mentor_name||"Not matched yet"}</div></Card>
   <Card><div className="muted">Upcoming sessions</div><div style={{fontSize:22,fontWeight:750,marginTop:6}}>{upcoming.length}</div><small className="muted">{upcoming[0]?new Date(upcoming[0].session.scheduled_start_at).toLocaleString():"No confirmed appointment"}</small></Card>
   <Card><div className="muted">{role==="mentor"?"Pending invitations":"Pending match decisions"}</div><div style={{fontSize:22,fontWeight:750,marginTop:6}}>{pendingMatches.length}</div></Card>
   {role==="mentor"?<Card><div className="muted">Available capacity</div><div style={{fontSize:22,fontWeight:750,marginTop:6}}>{maxActiveMentees===undefined?"—":Math.max(0,Number(maxActiveMentees)-relationships.filter(item=>item.mentor_user_id===currentUserId&&["active","paused"].includes(item.status)).length)}</div><small className="muted">Open mentee places against your saved limit</small></Card>:null}
  </div>
  <Card><div className="row" style={{gap:8,alignItems:"center"}}><Flag size={17}/><div><b>Next best action</b><p className="muted">{nextAction}</p></div><span style={{flex:1}}/><Link className="text-link" href={pendingMatches.length?"#mentorship-invitations":pendingSession.length?"#mentorship-sessions":overdue.length?"#mentorship-learning-goals":upcoming.length?"#mentorship-session-hub-title":"#active-mentorships"}>Open <ArrowRight size={14}/></Link></div></Card>
  <div className="grid grid-2" style={{gap:10}}>
   <Card><div className="row" style={{gap:8}}><ClipboardCheck size={17}/><b>Action queue</b></div>
    {pendingMatches.length===0&&pendingSession.length===0&&workAwaitingReview.length===0&&assignmentsOutstanding.length===0&&followUps.length===0&&overdue.length===0?<p className="muted">No pending decisions, review tasks or overdue goals are recorded.</p>:<div className="grid" style={{gap:8,marginTop:8}}>
     {pendingMatches.map(item=><div className="case-row" key={item.id}><Badge>Needs response</Badge><b>{role==="mentor"?"Mentorship invitation":"Mentor proposal"}</b><p className="muted">{item.goals||"Review the match details in your workspace."}</p><Link className="text-link" href="#mentorship-invitations">Review match →</Link></div>)}
     {workAwaitingReview.map(item=><div className="case-row" key={item.id}><Badge>Review required</Badge><b>{item.title}</b><p className="muted">A mentee submission is awaiting your review.</p><Link className="text-link" href="#mentorship-learning-goals">Review learning work →</Link></div>)}
     {assignmentsOutstanding.map(item=><div className="case-row" key={item.id}><Badge>Learning task</Badge><b>{item.title}</b><p className="muted">{item.due_at?"Due "+new Date(item.due_at).toLocaleDateString():"No due date"}</p><Link className="text-link" href="#mentorship-learning-goals">Open assignment →</Link></div>)}
     {pendingSession.map(({relationship,session})=><div className="case-row" key={session.id}><Badge>Needs response</Badge><b>Confirm a session</b><p className="muted">{relationship.mentor_user_id===currentUserId?relationship.mentee_name:relationship.mentor_name} · {new Date(session.scheduled_start_at).toLocaleString()}</p><Link className="text-link" href="#mentorship-sessions">Open session →</Link></div>)}
     {followUps.map(({relationship,action})=><div className="case-row" key={action.description}><Badge>Follow-up</Badge><b>{action.description}</b><p className="muted">{relationship.mentor_user_id===currentUserId?relationship.mentee_name:relationship.mentor_name} · Agreed action</p><Link className="text-link" href="#mentorship-sessions">Open session record →</Link></div>)}
     {overdue.map(({relationship,goal})=><div className="case-row" key={goal.id}><Badge>Overdue goal</Badge><b>{goal.title}</b><p className="muted">{relationship.mentor_user_id===currentUserId?relationship.mentee_name:relationship.mentor_name} · Due {new Date(goal.target_date!).toLocaleDateString()}</p><Link className="text-link" href="#mentorship-learning-goals">Review progress →</Link></div>)}
    </div>}
   </Card>
   <Card><div className="row" style={{gap:8}}><CalendarClock size={17}/><b>Upcoming and follow-through</b></div>
    {upcoming.slice(0,3).map(({relationship,session})=><div className="case-row" key={session.id}><b>{session.agenda||"Mentorship session"}</b><p className="muted">{new Date(session.scheduled_start_at).toLocaleString()} · {relationship.mentor_user_id===currentUserId?relationship.mentee_name:relationship.mentor_name}</p><Link className="text-link" href="#mentorship-session-hub-title">Prepare for session →</Link></div>)}
    {upcoming.length===0?<p className="muted">No upcoming confirmed sessions. A proposal is not treated as a confirmed appointment.</p>:null}
    <div className="row" style={{gap:8,marginTop:8}}><MessageSquareText size={16}/><span className="muted">{reviewCount} feedback record{reviewCount===1?"":"s"} saved across your relationships</span></div>
    <div className="case-row" style={{marginTop:8}}><b>Latest feedback</b>{latestFeedback?<><p>{latestFeedback.item.comments}</p><p className="muted">{latestFeedback.relationship.mentor_user_id===currentUserId?latestFeedback.relationship.mentee_name:latestFeedback.relationship.mentor_name} · {new Date(latestFeedback.item.created_at).toLocaleDateString()}</p></>:<p className="muted">No feedback from the other participant has been recorded yet.</p>}</div>
   </Card>
  </div>
  {role==="mentee"&&<Card><b>My development journey</b>{relationships.filter(item=>item.mentee_user_id===currentUserId).map(item=><div key={item.id} className="case-row"><p>{item.goals||"Your mentor will help you agree a development objective."}</p><p className="muted">{(details[item.id]?.goals||[]).filter(goal=>goal.status==="achieved").length} of {(details[item.id]?.goals||[]).length} goals achieved</p></div>)}<Link className="text-link" href="#mentorship-learning-goals">Open goals and learning →</Link></Card>}
 </section>;
}
