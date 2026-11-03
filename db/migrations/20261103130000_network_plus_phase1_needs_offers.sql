-- Network-Plus Phase 1: governed Needs & Offers taxonomy and persistent guided drafts.
-- Extend the single canonical network_plus_service_listing model; do not create a second directory/listing table.
create table if not exists network_plus_listing_taxonomy (
  code text primary key check (code ~ '^[a-z][a-z0-9_]{1,79}$'),
  parent_code text references network_plus_listing_taxonomy(code) on delete restrict,
  label text not null check (length(trim(label)) between 2 and 100),
  description text not null default '',
  listing_kinds text[] not null default array['need','offer','product_profile','service_profile']::text[],
  field_schema jsonb not null default '[]'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  taxonomy_version integer not null default 1 check (taxonomy_version>0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (jsonb_typeof(field_schema)='array'),
  check (cardinality(listing_kinds)>0 and listing_kinds <@ array['need','offer','product_profile','service_profile']::text[])
);
create index if not exists ix_network_plus_listing_taxonomy_parent
  on network_plus_listing_taxonomy(parent_code,sort_order) where active=true;

insert into network_plus_listing_taxonomy(code,parent_code,label,description,listing_kinds,field_schema,sort_order) values
('professional_services',null,'Professional services','Specialist and independent professional services.',array['need','offer','service_profile']::text[],'[{"code":"service_scope","label":"Service scope","type":"multiselect","options":["advisory","implementation","review","ongoing_support"],"required":true},{"code":"delivery_mode","label":"Delivery","type":"select","options":["remote","onsite","hybrid"],"required":true},{"code":"credentials","label":"Relevant credentials","type":"tags","required":false}]'::jsonb,10),
('consulting',null,'Consulting & advisory','Strategy, management, research and specialist advice.',array['need','offer','service_profile']::text[],'[{"code":"advisory_area","label":"Advisory area","type":"select","options":["strategy","operations","finance","marketing","human_resources","research","governance","other"],"required":true},{"code":"engagement_format","label":"Engagement format","type":"select","options":["one_off","short_term","ongoing"],"required":false}]'::jsonb,20),
('technology',null,'Technology & digital','Software, IT, data, cybersecurity and digital transformation.',array['need','offer','service_profile']::text[],'[{"code":"technology_area","label":"Technology area","type":"multiselect","options":["software","web","mobile","data","ai","cybersecurity","cloud","networking","digital_transformation"],"required":true},{"code":"stack","label":"Tools or technologies","type":"tags","required":false}]'::jsonb,30),
('design',null,'Design & creative','Brand, product, visual, UX and creative production.',array['need','offer','service_profile']::text[],'[{"code":"design_area","label":"Design area","type":"multiselect","options":["brand","graphic","product","ux_ui","architecture","industrial","photography","video"],"required":true},{"code":"deliverable","label":"Expected deliverable","type":"text","required":false}]'::jsonb,40),
('education',null,'Education & training','Learning, instruction, coaching and professional development.',array['need','offer','service_profile']::text[],'[{"code":"learning_area","label":"Learning area","type":"select","options":["school","higher_education","vocational","professional_development","language","digital_skills","other"],"required":true},{"code":"level","label":"Learner level","type":"select","options":["beginner","intermediate","advanced","all"],"required":false}]'::jsonb,50),
('healthcare',null,'Health & wellbeing','Healthcare and wellbeing services subject to applicable professional regulation.',array['need','offer','service_profile']::text[],'[{"code":"health_area","label":"Service area","type":"select","options":["clinical","public_health","mental_wellbeing","occupational_health","other"],"required":true},{"code":"licence_required","label":"Regulated licence required","type":"boolean","required":true}]'::jsonb,60),
('legal',null,'Legal & regulatory','Legal, compliance, audit and regulated advisory.',array['need','offer','service_profile']::text[],'[{"code":"legal_area","label":"Specialism","type":"select","options":["corporate","contracts","tax","employment","regulatory","intellectual_property","other"],"required":true},{"code":"jurisdiction","label":"Jurisdiction","type":"text","required":false}]'::jsonb,70),
('finance',null,'Finance & funding','Accounting, finance, investment readiness and funding connections.',array['need','offer','service_profile']::text[],'[{"code":"finance_area","label":"Finance area","type":"select","options":["accounting","audit","tax","financial_planning","investment_readiness","funding","other"],"required":true},{"code":"funding_stage","label":"Funding stage","type":"select","options":["idea","startup","growth","expansion","not_applicable"],"required":false}]'::jsonb,80),
('construction',null,'Construction & engineering','Construction, engineering, architecture and infrastructure.',array['need','offer','service_profile']::text[],'[{"code":"discipline","label":"Discipline","type":"select","options":["civil","structural","electrical","mechanical","architecture","quantity_surveying","project_management","other"],"required":true},{"code":"project_stage","label":"Project stage","type":"select","options":["planning","design","procurement","execution","operations"],"required":false}]'::jsonb,90),
('products_supply',null,'Products & supply','Physical products, materials, equipment and supplier discovery.',array['need','offer','product_profile']::text[],'[{"code":"product_type","label":"Product type","type":"select","options":["raw_material","equipment","finished_goods","agricultural","industrial","technology","other"],"required":true},{"code":"unit","label":"Unit of measure","type":"select","options":["piece","kg","tonne","litre","metre","set","batch","other"],"required":false},{"code":"minimum_quantity","label":"Minimum quantity","type":"number","required":false}]'::jsonb,100),
('business_services',null,'Business services','Operations, logistics, HR, marketing and business support.',array['need','offer','service_profile']::text[],'[{"code":"business_area","label":"Business area","type":"select","options":["operations","logistics","human_resources","marketing","procurement","facilities","customer_support","other"],"required":true},{"code":"business_stage","label":"Business stage","type":"select","options":["idea","startup","established","expansion","all"],"required":false}]'::jsonb,110),
('creative_media',null,'Creative & media production','Publishing, media, communications and content production.',array['need','offer','service_profile']::text[],'[{"code":"media_type","label":"Media type","type":"select","options":["writing","publishing","audio","video","communications","events","other"],"required":true}]'::jsonb,120),
('facilities_operations',null,'Facilities & operations','Facilities, maintenance, cleaning, security and operational support.',array['need','offer','service_profile']::text[],'[{"code":"operations_area","label":"Operations area","type":"select","options":["maintenance","cleaning","security","property","equipment","other"],"required":true}]'::jsonb,130),
('agriculture_food',null,'Agriculture & food','Agriculture, food production, processing and related supply.',array['need','offer','product_profile','service_profile']::text[],'[{"code":"agri_area","label":"Area","type":"select","options":["inputs","production","processing","storage","distribution","food_service","other"],"required":true},{"code":"seasonal","label":"Seasonal availability","type":"boolean","required":false}]'::jsonb,140),
('transport_logistics',null,'Transport & logistics','Transport, freight, warehousing and distribution.',array['need','offer','service_profile']::text[],'[{"code":"logistics_area","label":"Service type","type":"select","options":["transport","freight","warehousing","distribution","last_mile","other"],"required":true}]'::jsonb,150),
('specialist_regulatory',null,'Specialist & regulated services','Specialist professional services requiring additional qualifications or approvals.',array['need','offer','service_profile']::text[],'[{"code":"specialism","label":"Specialism","type":"text","required":true},{"code":"regulatory_scope","label":"Regulatory scope","type":"text","required":true}]'::jsonb,160)
on conflict(code) do update set label=excluded.label,description=excluded.description,listing_kinds=excluded.listing_kinds,field_schema=excluded.field_schema,sort_order=excluded.sort_order,active=true,updated_at=now();

insert into network_plus_listing_taxonomy(code,parent_code,label,description,listing_kinds,field_schema,sort_order) values
('trade',null,'Trade & distribution','Wholesale, retail supply and distribution.',array['need','offer','product_profile']::text[],'[]'::jsonb,165),
('manufacturing',null,'Manufacturing','Production, fabrication and industrial manufacturing.',array['need','offer','product_profile','service_profile']::text[],'[]'::jsonb,170),
('other',null,'Other professional opportunity','A moderated category for supported opportunities not yet represented in the taxonomy.',array['need','offer','product_profile','service_profile']::text[],'[]'::jsonb,999)
on conflict(code) do update set label=excluded.label,description=excluded.description,listing_kinds=excluded.listing_kinds,field_schema=excluded.field_schema,sort_order=excluded.sort_order,active=true,updated_at=now();

insert into network_plus_listing_taxonomy(code,parent_code,label,description,listing_kinds,field_schema,sort_order) values
('software_development','technology','Software development','Application and software engineering.',array['need','offer','service_profile']::text[],'[{"code":"platform","label":"Platform","type":"multiselect","options":["web","mobile","desktop","api","embedded"],"required":true}]'::jsonb,10),
('data_analytics','technology','Data & analytics','Data engineering, analytics and reporting.',array['need','offer','service_profile']::text[],'[{"code":"data_need","label":"Data focus","type":"multiselect","options":["engineering","analytics","visualization","governance","ai_ml"],"required":true}]'::jsonb,20),
('office_equipment','products_supply','Office & business equipment','Office and operational equipment.',array['need','offer','product_profile']::text[],'[{"code":"condition","label":"Condition","type":"select","options":["new","used","refurbished","not_applicable"],"required":true}]'::jsonb,10),
('agricultural_inputs','agriculture_food','Agricultural inputs','Seeds, fertilizer, tools and inputs.',array['need','offer','product_profile']::text[],'[{"code":"input_type","label":"Input type","type":"select","options":["seed","fertilizer","equipment","feed","other"],"required":true}]'::jsonb,10),
('training_delivery','education','Training delivery','Structured courses and professional training.',array['need','offer','service_profile']::text[],'[{"code":"training_mode","label":"Training mode","type":"select","options":["in_person","remote","hybrid"],"required":true}]'::jsonb,10)
on conflict(code) do update set parent_code=excluded.parent_code,label=excluded.label,description=excluded.description,listing_kinds=excluded.listing_kinds,field_schema=excluded.field_schema,sort_order=excluded.sort_order,active=true,updated_at=now();

alter table network_plus_service_listing
  add column if not exists listing_kind text not null default 'service_profile',
  add column if not exists subcategory_code text references network_plus_listing_taxonomy(code) on delete restrict,
  add column if not exists structured_attributes jsonb not null default '{}'::jsonb,
  add column if not exists taxonomy_version integer not null default 1,
  add column if not exists wizard_step integer not null default 1,
  add column if not exists draft_saved_at timestamptz;
alter table network_plus_service_listing
  drop constraint if exists network_plus_service_listing_title_check,
  drop constraint if exists network_plus_service_listing_summary_check,
  drop constraint if exists network_plus_service_listing_description_check,
  drop constraint if exists network_plus_service_listing_service_category_check;
alter table network_plus_service_listing
  alter column title drop not null,
  alter column summary drop not null,
  alter column description drop not null,
  alter column service_category drop not null;
alter table network_plus_service_listing
  add constraint network_plus_listing_kind_check check (listing_kind in ('need','offer','product_profile','service_profile')),
  add constraint network_plus_listing_attributes_object check (jsonb_typeof(structured_attributes)='object'),
  add constraint network_plus_listing_wizard_step_check check (wizard_step between 1 and 8),
  add constraint network_plus_listing_taxonomy_version_check check (taxonomy_version>0),
  add constraint network_plus_listing_category_fk foreign key(service_category) references network_plus_listing_taxonomy(code) on delete restrict;
update network_plus_service_listing set listing_kind='service_profile',wizard_step=7,draft_saved_at=coalesce(draft_saved_at,updated_at)
where status='draft' and wizard_step=1;
update network_plus_service_listing set wizard_step=8 where status<>'draft';
alter table network_plus_service_listing
  add column if not exists remote_available boolean not null default false,
  add column if not exists service_radius_km integer,
  add column if not exists availability_status text not null default 'accepting_requests',
  add column if not exists lead_time_days integer,
  add column if not exists active_work_limit integer,
  add column if not exists timezone text,
  add column if not exists next_available_at timestamptz,
  add column if not exists target_audience text[] not null default '{}'::text[],
  add column if not exists secondary_tags text[] not null default '{}'::text[],
  add column if not exists pricing_details jsonb not null default '{}'::jsonb;
update network_plus_service_listing set remote_available=true where delivery_mode='remote' and remote_available=false;

alter table network_plus_service_listing
  drop constraint if exists network_plus_service_listing_pricing_model_check,
  add constraint network_plus_listing_pricing_model_check check (pricing_model in ('free','fixed','hourly','unit','range','quote','subscription','not_applicable')),
  add constraint network_plus_listing_pricing_details_object check (jsonb_typeof(pricing_details)='object'),
  add constraint network_plus_listing_availability_status_check check (availability_status in ('accepting_requests','limited','paused','unavailable')),
  add constraint network_plus_listing_service_radius_check check (service_radius_km is null or service_radius_km between 1 and 1000),
  add constraint network_plus_listing_lead_time_check check (lead_time_days is null or lead_time_days between 0 and 3650),
  add constraint network_plus_listing_active_work_limit_check check (active_work_limit is null or active_work_limit between 1 and 100000),
  add constraint network_plus_listing_audience_segments_check check (target_audience <@ array['individuals','smes','nonprofits','public_institutions','startups','all']::text[]);

create table if not exists network_plus_service_listing_geography (
  listing_id uuid not null references network_plus_service_listing(id) on delete cascade,
  geography_version_id uuid not null references membership_geography_version(id) on delete restrict,
  geography_unit_id uuid not null,
  created_by uuid references app_user(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(listing_id,geography_unit_id),
  foreign key(geography_version_id,geography_unit_id) references membership_geography_unit(version_id,id) on delete restrict
);
create index if not exists ix_network_plus_listing_geography_unit on network_plus_service_listing_geography(geography_unit_id,listing_id);
create index if not exists ix_network_plus_listing_directory
  on network_plus_service_listing(listing_kind,service_category,subcategory_code,status,published_at desc);
create index if not exists ix_network_plus_listing_drafts
  on network_plus_service_listing(business_id,created_by,draft_saved_at desc) where status='draft';
comment on table network_plus_listing_taxonomy is
  'Governed, versioned Needs & Offers taxonomy. Category-specific fields are structured metadata, not free-text classification.';
comment on column network_plus_service_listing.listing_kind is
  'need, offer, product_profile or service_profile. All remain in the canonical listing table; catalog profiles are discovery-only.';
comment on column network_plus_service_listing.structured_attributes is
  'Category-specific controlled fields used for discovery and reporting. Does not contain private contact details.';
comment on column network_plus_service_listing.wizard_step is
  'Persistent guided-wizard position for a draft; draft listing row is the single durable draft record.';

comment on table network_plus_service_listing_geography is 'Structured service-area references to the published, versioned membership geography hierarchy; never stores private residence addresses.';
comment on column network_plus_service_listing.remote_available is 'Explicit remote availability; not inferred from location text.';
comment on column network_plus_service_listing.target_audience is 'Controlled audience segments distinct from member/organization access visibility.';
comment on column network_plus_service_listing.pricing_details is 'Structured range, unit, subscription, tax and fee disclosure details; no payment or checkout state.';
