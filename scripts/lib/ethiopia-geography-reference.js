const SOURCE_NAME = "Open Admin Data — Ethiopia Administrative Divisions";
const SOURCE_VERSION = "2026-09-08 (commit 418739e33760bf79661f3914e2d8c9cf33248437)";
const SOURCE_LICENSE = "CC-BY-4.0";
const SOURCE_COMMIT = "418739e33760bf79661f3914e2d8c9cf33248437";
const REGION_MAP = Object.freeze({
  ET01:{code:"ET-REG-TIGRAY",level:"region"},ET02:{code:"ET-REG-AFAR",level:"region"},
  ET03:{code:"ET-REG-AMHARA",level:"region"},ET04:{code:"ET-REG-OROMIA",level:"region"},
  ET05:{code:"ET-REG-SOMALI",level:"region"},ET06:{code:"ET-REG-BENISHANGUL-GUMUZ",level:"region"},
  ET07:{code:"ET-REG-CENTRAL-ETHIOPIA",level:"region"},ET08:{code:"ET-REG-SOUTH-ETHIOPIA",level:"region"},
  ET11:{code:"ET-REG-SOUTHWEST-ETHIOPIA",level:"region"},ET12:{code:"ET-REG-GAMBELLA",level:"region"},
  ET13:{code:"ET-REG-HARARI",level:"region"},ET16:{code:"ET-REG-SIDAMA",level:"region"},
  ET14:{code:"ET-FED-ADDIS-ABABA",level:"federal_city"},ET15:{code:"ET-FED-DIRE-DAWA",level:"federal_city"}
});
const ADDIS="ET14",DIRE_DAWA="ET15",CONTESTED="ET99";
function sourceMetadata(record,sourceUrl,sourceLevel,administrativeLabel){
 return {sourceUrl,sourceDataset:"Ethiopia Administrative Divisions",sourceRepository:"Jafermenza/ethiopia-administrative-divisions",sourceAttribution:"Open Admin Data (upstream dataset)",sourceLicense:SOURCE_LICENSE,sourceCommit:SOURCE_COMMIT,
  sourceId:String(record.id),sourceParentId:record.parent?.id||null,sourceLevel,administrativeLabel,
  localLabel:record.name?.local||record.name?.en||"",slug:record.name?.slug||"",
  coordinates:record.geo?.lat&&record.geo?.lon?{latitude:String(record.geo.lat),longitude:String(record.geo.lon),crs:"WGS84"}:null};
}
function makeRow(record,unitCode,unitLevel,parentCode,sourceUrl,sourceLevel,administrativeLabel,label){
 return {unit_code:unitCode,label:label||record.name?.en||record.name?.local||"",unit_level:unitLevel,parent_code:parentCode,
  country_iso3:"",country_m49:"",source_name:SOURCE_NAME,source_version:SOURCE_VERSION,effective_from:"",effective_to:"",
  active:"true",metadata:JSON.stringify(sourceMetadata(record,sourceUrl,sourceLevel,administrativeLabel))};
}
export function buildEthiopiaAdministrativeRows({regions,zones,woredas,sourceUrls={}}){
 if(![regions,zones,woredas].every(Array.isArray))throw new Error("Ethiopia regions, zones and woredas must all be source arrays.");
 const regionById=new Map(regions.map(r=>[String(r.id),r])),zoneById=new Map(zones.map(r=>[String(r.id),r]));
 const regionRows=[],zoneRows=[],woredaRows=[],addisCode=REGION_MAP[ADDIS].code,direCode=REGION_MAP[DIRE_DAWA].code;
 const regionUrl=sourceUrls.regions||"https://github.com/Jafermenza/ethiopia-administrative-divisions/blob/"+SOURCE_COMMIT+"/data/all-region.json";
 const zoneUrl=sourceUrls.zones||"https://github.com/Jafermenza/ethiopia-administrative-divisions/blob/"+SOURCE_COMMIT+"/data/all-zone.json";
 const woredaUrl=sourceUrls.woredas||"https://github.com/Jafermenza/ethiopia-administrative-divisions/blob/"+SOURCE_COMMIT+"/data/all-woreda.json";
 for(const [sourceId,mapping] of Object.entries(REGION_MAP)){
  const record=regionById.get(sourceId);if(!record)throw new Error("The Ethiopia source is missing required region/city record "+sourceId+".");
  regionRows.push(makeRow(record,mapping.code,mapping.level,"ETH",regionUrl,1,mapping.level==="federal_city"?"Chartered City":"Regional State",record.name?.en||record.name?.local));
 }
 for(const zone of zones){
  const parentId=String(zone.parent?.id||"");if(parentId===CONTESTED)continue;
  if(!regionById.has(parentId)||!REGION_MAP[parentId])throw new Error("Zone "+zone.id+" has an unrecognized source region parent "+parentId+".");
  if(parentId===ADDIS)continue;
  if(parentId===DIRE_DAWA){zoneRows.push(makeRow(zone,String(zone.id),"sub_city",direCode,zoneUrl,2,"City division (source zone)"));continue;}
  if(REGION_MAP[parentId].level!=="region")throw new Error("Non-regional source parent "+parentId+" cannot own a regular zone.");
  zoneRows.push(makeRow(zone,String(zone.id),"zone",REGION_MAP[parentId].code,zoneUrl,2,"Zone"));
 }
 for(const woreda of woredas){
  const parentZone=zoneById.get(String(woreda.parent?.id||""));if(!parentZone)throw new Error("Woreda "+woreda.id+" has a missing source zone parent.");
  const regionId=String(parentZone.parent?.id||"");if(regionId===CONTESTED)continue;
  if(regionId===ADDIS){
   const label=woreda.name?.en||woreda.name?.local||"";
   if(!/sub\s*city/i.test(label))throw new Error("Addis Ababa source child is not explicitly identified as a sub-city: "+woreda.id+" ("+label+").");
   woredaRows.push(makeRow(woreda,String(woreda.id),"sub_city",addisCode,woredaUrl,3,"Sub-city (source woreda record)",label));continue;
  }
  if(regionId===DIRE_DAWA){woredaRows.push(makeRow(woreda,String(woreda.id),"woreda",String(parentZone.id),woredaUrl,3,"Woreda"));continue;}
  if(!REGION_MAP[regionId]||REGION_MAP[regionId].level!=="region")throw new Error("Woreda "+woreda.id+" belongs to an unsupported source region "+regionId+".");
  woredaRows.push(makeRow(woreda,String(woreda.id),"woreda",String(parentZone.id),woredaUrl,3,"Woreda"));
 }
 const addis=woredaRows.filter(r=>r.unit_level==="sub_city"&&r.parent_code===addisCode);
 const dire=zoneRows.filter(r=>r.unit_level==="sub_city"&&r.parent_code===direCode);
 if(addis.length!==11)throw new Error("Expected 11 explicitly named Addis Ababa sub-cities; found "+addis.length+".");
 if(dire.length!==2)throw new Error("Expected Dire Dawa urban and rural city divisions; found "+dire.length+".");
 return [...regionRows,...zoneRows,...woredaRows];
}
export const ETHIOPIA_SOURCE_EXPECTED_COUNTS=Object.freeze({regions:15,zones:107,woredas:1148,includedRegions:12,includedFederalCities:2,includedZones:101,includedSubCities:13,includedWoredas:1119,excludedContestedZones:3,excludedContestedWoredas:18,excludedContestedRegion:1});
export {SOURCE_NAME,SOURCE_VERSION,SOURCE_LICENSE,SOURCE_COMMIT};