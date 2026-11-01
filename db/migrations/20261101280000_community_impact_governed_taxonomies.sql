-- MPA-governed Community Impact dictionaries use the existing versioned Reference Portfolio engine.
ALTER TABLE reference_dataset DROP CONSTRAINT IF EXISTS reference_dataset_domain_check;
ALTER TABLE reference_dataset ADD CONSTRAINT reference_dataset_domain_check CHECK (domain IN (
 'geography','occupation','industry','education_level','qualification_type','field_of_study',
 'membership','verification','nationality','language','institution','experience_range','community_impact'
)) NOT VALID;

INSERT INTO reference_dataset(dataset_key,name,description,domain,source_type,source_name,status)
VALUES
 ('community_impact_contribution_categories','Community Impact contribution categories','Admin-governed categories used by claims, assessments, score reporting and recognition. Codes are permanent identifiers.','community_impact','mpa_governed','MPA','active'),
 ('community_impact_contribution_types','Community Impact contribution types','Admin-governed contribution activity types.','community_impact','mpa_governed','MPA','active'),
 ('community_impact_contributor_roles','Community Impact contributor roles','Admin-governed contributor role classifications.','community_impact','mpa_governed','MPA','active'),
 ('community_impact_evidence_types','Community Impact evidence types','Admin-governed evidence classifications including external media links.','community_impact','mpa_governed','MPA','active')
ON CONFLICT(dataset_key) DO NOTHING;

WITH datasets AS (
 SELECT d.id,d.dataset_key FROM reference_dataset d
 WHERE d.dataset_key IN ('community_impact_contribution_categories','community_impact_contribution_types','community_impact_contributor_roles','community_impact_evidence_types')
 AND NOT EXISTS(SELECT 1 FROM reference_dataset_version v WHERE v.dataset_id=d.id AND v.status='published')
), versions AS (
 INSERT INTO reference_dataset_version(dataset_id,version_label,status,import_method,notes,published_at)
 SELECT id,'initial-governed-baseline','published','manual','Initial values migrated from existing Community Impact source-code taxonomy. Administrators manage future versions in Reference Portfolio.',now() FROM datasets
 ON CONFLICT(dataset_id,version_label) DO NOTHING
 RETURNING id,dataset_id
)
INSERT INTO reference_item(dataset_version_id,code,label,description,sort_order,active)
SELECT v.id,x.code,x.label,x.description,x.sort_order,true
FROM versions v JOIN reference_dataset d ON d.id=v.dataset_id
JOIN LATERAL (VALUES
 ('community_impact_contribution_categories','EDUCATION_SKILLS','Education and skills','Teaching, training, scholarships and education access.',10),
 ('community_impact_contribution_categories','COMMUNITY_CARE','Community care','Relief, community support and wellbeing.',20),
 ('community_impact_contribution_categories','DIGITAL_INCLUSION','Digital inclusion','Digital literacy and technology access.',30),
 ('community_impact_contribution_categories','ENVIRONMENT_SUSTAINABILITY','Environment and sustainability','Conservation, climate and environmental stewardship.',40),
 ('community_impact_contribution_categories','LIVELIHOODS_ECONOMIC_OPPORTUNITY','Livelihoods and economic opportunity','Employability, livelihoods and enterprise support.',50),
 ('community_impact_contribution_categories','ACCESSIBILITY_INCLUSION','Accessibility and inclusion','Accessible services and inclusion.',60),
 ('community_impact_contribution_categories','MENTORSHIP_KNOWLEDGE_SHARING','Mentorship and knowledge sharing','Mentoring, coaching and knowledge transfer.',70),
 ('community_impact_contribution_categories','PROFESSIONAL_PRO_BONO_SERVICES','Professional and pro-bono services','Donated professional expertise and services.',80),
 ('community_impact_contribution_categories','EMPLOYMENT_REFERRALS','Employment and referrals','Verified employment referrals and opportunity access.',90),
 ('community_impact_contribution_categories','PARTNERSHIPS_ORGANIZATIONAL_CAPACITY','Partnerships and organizational capacity','Partnerships and institutional strengthening.',100),
 ('community_impact_contribution_categories','OTHER_REVIEW_REQUIRED','Other (review required)','Unclassified contribution requiring reviewer categorization.',110),
 ('community_impact_contribution_types','INITIATIVE_PARTICIPATION','Initiative participation','Participation in an approved community initiative.',10),
 ('community_impact_contribution_types','PROJECT_DELIVERY','Project delivery','Delivery of a project or defined work package.',20),
 ('community_impact_contribution_types','MENTORING','Mentoring','Mentorship or coaching activity.',30),
 ('community_impact_contribution_types','PROFESSIONAL_SERVICE','Professional service','Professional or pro-bono service delivery.',40),
 ('community_impact_contribution_types','REFERRAL','Referral','Employment or other verified referral.',50),
 ('community_impact_contribution_types','PARTNERSHIP','Partnership','Verified partnership or collaboration.',60),
 ('community_impact_contribution_types','KNOWLEDGE_RESOURCE','Knowledge resource','Knowledge resource, training material or publication.',70),
 ('community_impact_contribution_types','OTHER','Other','Other contribution type requiring reviewer assessment.',80),
 ('community_impact_contributor_roles','LEAD','Lead','Accountable lead contributor.',10),
 ('community_impact_contributor_roles','CO_LEAD','Co-lead','Shared project or initiative leadership.',20),
 ('community_impact_contributor_roles','CONTRIBUTOR','Contributor','Direct contributor.',30),
 ('community_impact_contributor_roles','MENTOR','Mentor','Mentor or coach.',40),
 ('community_impact_contributor_roles','REVIEWER_ORGANIZER','Reviewer / organizer','Organizer or reviewer role.',50),
 ('community_impact_contributor_roles','PARTNER_ORGANIZATION','Partner organization','Organization contributing as a partner.',60),
 ('community_impact_contributor_roles','OTHER','Other','Other role requiring reviewer assessment.',70),
 ('community_impact_evidence_types','DOCUMENT','Document','Report, letter, certificate or other document.',10),
 ('community_impact_evidence_types','IMAGE','Image','Photographic evidence.',20),
 ('community_impact_evidence_types','ATTESTATION','Attestation','Third-party confirmation or attestation.',30),
 ('community_impact_evidence_types','METRIC_SOURCE','Metric source','Source material supporting reported metrics.',40),
 ('community_impact_evidence_types','VIDEO','Video link','External video evidence link.',50),
 ('community_impact_evidence_types','URL','Web link','External web evidence link.',60),
 ('community_impact_evidence_types','OTHER','Other','Other evidence classification.',70)
) AS x(dataset_key,code,label,description,sort_order) ON x.dataset_key=d.dataset_key
ON CONFLICT(dataset_version_id,code) DO NOTHING;
