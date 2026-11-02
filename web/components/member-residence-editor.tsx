"use client";

import { useEffect, useMemo, useState } from "react";
import { MapPinned, Save } from "lucide-react";
import { ApiError, api } from "../lib/api";
import { useUiStore } from "../lib/store";
import { Card } from "./ui";
import { OperationStatus } from "./operation-status";

type Unit={id:string;unit_code:string;label:string;unit_level:string;parent_id:string|null;country_iso3:string|null;country_m49:string|null};
type Reference={version:{version_label:string;source_name:string;source_version:string}|null;countries:Unit[];regions:Unit[];federalCities:Unit[];children:Unit[]};
type Residence={residence_type:"ethiopia"|"diaspora";country_code:string;admin_level_1_code?:string|null;admin_level_2_code?:string|null;admin_level_3_code?:string|null;diaspora_area?:string|null;street_address?:string|null;locality_note?:string|null};
const emptyReference:Reference={version:null,countries:[],regions:[],federalCities:[],children:[]};
export function MemberResidenceEditor(){
 const token=useUiStore(state=>state.token);
 const [reference,setReference]=useState<Reference>(emptyReference);
 const [type,setType]=useState<"ethiopia"|"diaspora">("ethiopia");
 const [country,setCountry]=useState("ETH");
 const [level1,setLevel1]=useState("");
 const [level2,setLevel2]=useState("");
 const [level3,setLevel3]=useState("");
 const [area,setArea]=useState("");
 const [street,setStreet]=useState("");
 const [locality,setLocality]=useState("");
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 useEffect(()=>{let active=true;if(!token){setLoading(false);return;}void Promise.all([api<Reference>("/api/v1/member-geography/reference",{},token),api<Residence|null>("/api/v1/me/residence",{},token)]).then(([refs,residence])=>{if(!active)return;setReference(refs||emptyReference);if(residence){setType(residence.residence_type);setCountry(residence.country_code||"ETH");setLevel1(residence.admin_level_1_code||"");setLevel2(residence.admin_level_2_code||"");setLevel3(residence.admin_level_3_code||"");setArea(residence.diaspora_area||"");setStreet(residence.street_address||"");setLocality(residence.locality_note||"");}}).catch(cause=>{if(active)setError(cause instanceof ApiError?cause.message:"Residence information could not be loaded.");}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[token]);
 const level1Options=type==="ethiopia"?[...reference.regions,...reference.federalCities]:[];
 const level2Options=useMemo(()=>reference.children.filter(unit=>unit.parent_id===level1&&((reference.regions.some(x=>x.unit_code===level1)&&unit.unit_level==="zone")||(reference.federalCities.some(x=>x.unit_code===level1)&&unit.unit_level==="sub_city"))),[reference,level1]);
 const level3Options=useMemo(()=>reference.children.filter(unit=>unit.parent_id===level2&&["district","town"].includes(unit.unit_level)),[reference,level2]);
 async function save(){if(!token)return;setSaving(true);setError("");setNotice("");try{await api("/api/v1/me/residence",{method:"PATCH",body:JSON.stringify({residenceType:type,countryCode:type==="ethiopia"?"ETH":country,adminLevel1Code:level1||null,adminLevel2Code:level2||null,adminLevel3Code:level3||null,diasporaArea:area,streetAddress:street,localityNote:locality})},token);setNotice("Residence information saved.");}catch(cause){setError(cause instanceof ApiError?cause.message:"Residence information could not be saved.");}finally{setSaving(false);}}
 if(loading)return <Card><OperationStatus state="loading" title="Loading residence" detail="Loading the published member geography reference data."/></Card>;
 return <Card>
  <div className="panel-heading"><div><h2>Residence</h2><p>Choose the country or area where you currently live. Street address is optional and is not shown in geographic summaries.</p></div><MapPinned size={19}/></div>
  {!reference.version?<OperationStatus state="info" title="Location reference data is not published yet" detail="You can complete this section after MPA imports and publishes the country and Ethiopian administrative reference workbook."/>:<>
   <div className="form-grid">
    <label>Residence type<select value={type} onChange={event=>{const next=event.target.value as "ethiopia"|"diaspora";setType(next);setCountry(next==="ethiopia"?"ETH":"");setLevel1("");setLevel2("");setLevel3("");}}><option value="ethiopia">Ethiopia</option><option value="diaspora">Diaspora</option></select></label>
    {type==="diaspora"&&<label>Country<select value={country} onChange={event=>setCountry(event.target.value)}><option value="">Choose country or area</option>{reference.countries.filter(item=>item.country_iso3!=="ETH").map(item=><option key={item.id} value={item.country_iso3||item.unit_code}>{item.label}</option>)}</select></label>}
    {type==="ethiopia"&&<label>Region or Federal City<select value={level1} onChange={event=>{setLevel1(event.target.value);setLevel2("");setLevel3("");}}><option value="">Choose Region or Federal City</option>{level1Options.map(item=><option key={item.id} value={item.unit_code}>{item.label}{item.unit_level==="federal_city"?" · Federal City":" · Region"}</option>)}</select></label>}
    {type==="ethiopia"&&level1&&<label>{reference.regions.some(item=>item.unit_code===level1)?"Zone":"Sub-city"}<select value={level2} onChange={event=>{setLevel2(event.target.value);setLevel3("");}}><option value="">Choose {reference.regions.some(item=>item.unit_code===level1)?"zone":"sub-city"} (optional)</option>{level2Options.map(item=><option key={item.id} value={item.unit_code}>{item.label}</option>)}</select></label>}
    {type==="ethiopia"&&level2&&<label>District or Town<select value={level3} onChange={event=>setLevel3(event.target.value)}><option value="">Choose district or town (optional)</option>{level3Options.map(item=><option key={item.id} value={item.unit_code}>{item.label}{item.unit_level==="town"?" · Town":" · District"}</option>)}</select></label>}
    {type==="diaspora"&&<label>Area of residence (optional)<input value={area} onChange={event=>setArea(event.target.value)} placeholder="State, province, city or local area"/></label>}
    {type==="ethiopia"&&<label>Specific street address (optional)<input value={street} onChange={event=>setStreet(event.target.value)} placeholder="Street, building or neighbourhood"/></label>}
    <label>Additional locality detail (optional)<input value={locality} onChange={event=>setLocality(event.target.value)} placeholder="Additional area description"/></label>
   </div>
   <div className="row-actions"><button className="btn btn-primary" type="button" disabled={saving||!country||(type==="ethiopia"&&!level1)} onClick={()=>void save()}><Save size={16}/>{saving?"Saving…":"Save residence"}</button></div>
  </>}
  {error&&<p role="alert" className="form-error">{error}</p>}{notice&&<p role="status" className="form-success">{notice}</p>}
  {reference.version&&<p className="muted">Reference version: {reference.version.version_label} · {reference.version.source_name} · {reference.version.source_version}</p>}
 </Card>;
}
