import { withTransaction } from "../platform/db.js";

const SUPPORT_ROLES = new Set(["supporting_staff", "system_admin"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CASE_TYPES = new Set(["service", "mentorship", "organization_mentorship"]);
const CASE_STATUSES = new Set(["draft", "requested", "accepted", "declined", "in_progress", "completed", "cancelled", "disputed", "active", "paused"]);

function fail(status, message, code = "SUPPORT_CASE_ERROR") {
  const cause = new Error(message);
  cause.statusCode = status;
  cause.code = code;
  return cause;
}

async function requireSupport(db, actorId) {
  const roles = (await db.query(
    "select r.role_code from app_user_role ur join app_role r on r.id=ur.role_id where ur.user_id=$1",
    [actorId],
  )).rows.map((row) => row.role_code);
  if (!roles.some((role) => SUPPORT_ROLES.has(role))) {
    throw fail(403, "Authorized MPA Support Desk access is required.", "FORBIDDEN");
  }
}

async function participantDetails(db, userId) {
  const row = (await db.query(
    "select u.id,u.account_reference,u.email,u.status account_status,u.created_at account_created_at," +
    "case when p.id is null then null else jsonb_build_object('firstName',p.first_name,'middleName',p.middle_name,'lastName',p.last_name,'displayName',p.display_name,'phone',p.phone) end person," +
    "case when pp.id is null then null else jsonb_build_object('headline',pp.headline,'bio',pp.bio,'visibility',pp.visibility,'completionPercent',pp.completion_percent,'educationSummary',pp.education_summary,'qualifications',pp.qualifications,'skills',pp.skills,'languages',pp.languages,'certifications',pp.certifications,'portfolioUrl',pp.portfolio_url) end professional_profile," +
    "coalesce((select jsonb_agg(jsonb_build_object('membershipNumber',mr.membership_number,'status',mr.status,'startDate',mr.start_date,'endDate',mr.end_date,'productName',mp.name) order by mr.created_at desc) from membership_record mr left join membership_product mp on mp.id=mr.membership_product_id where mr.user_id=u.id),'[]'::jsonb) membership_records " +
    "from app_user u left join person p on p.user_id=u.id left join professional_profile pp on pp.person_id=p.id where u.id=$1",
    [userId],
  )).rows[0];
  if (!row) throw fail(404, "A participant account linked to this case could not be found.", "PARTICIPANT_NOT_FOUND");
  return {
    userId: row.id,
    accountReference: row.account_reference,
    email: row.email,
    accountStatus: row.account_status,
    accountCreatedAt: row.account_created_at,
    person: row.person,
    professionalProfile: row.professional_profile,
    membershipRecords: row.membership_records,
  };
}

async function auditCaseAccess(db, actorId, caseType, caseId, requestId, reason, participantIds) {
  await db.query(
    "insert into audit_log(actor_user_id,action,resource_type,resource_id,request_id,outcome,metadata) values($1,'support.case_detail_accessed',$2,$3,$4,'success',$5)",
    [
      actorId,
      caseType === "service" ? "service_request" : caseType === "organization_mentorship" ? "organization_mentorship_request" : "mentorship",
      caseId,
      requestId || null,
      JSON.stringify({ reason, participantUserIds: participantIds }),
    ],
  );
}

export async function listSupportCases(actorId, filters = {}, requestId = null) {
  const caseType = String(filters.type || "all");
  const status = String(filters.status || "").trim();
  const search = String(filters.q || "").trim().slice(0, 120);
  const limit = Math.min(Math.max(Number(filters.limit) || 25, 1), 100);
  const offset = Math.min(Math.max(Number(filters.offset) || 0, 0), 100000);
  if (!["all", ...CASE_TYPES].includes(caseType)) throw fail(400, "Choose service requests, individual mentorship or organization mentorship programme cases.", "INVALID_CASE_TYPE");
  if (status && !CASE_STATUSES.has(status)) throw fail(400, "Unsupported case status filter.", "INVALID_CASE_STATUS");

  return withTransaction(async (db) => {
    await requireSupport(db, actorId);
    const result = await db.query(
      "select cases.*,count(*) over()::int total_count from (" +
      "select 'service'::text case_type,sr.id,sr.status,sr.created_at,sl.title case_title,requester.display_name participant_one_name,provider.display_name participant_two_name,org.display_name organization_name " +
      "from service_request sr join service_listing sl on sl.id=sr.service_listing_id left join person requester on requester.user_id=sr.requester_user_id left join person provider on provider.user_id=sr.provider_user_id left join organization org on org.id=sl.organization_id where ($1='all' or $1='service') " +
      "union all " +
      "select 'mentorship'::text case_type,m.id,m.status,m.created_at,'Mentorship relationship'::text case_title,mentor.display_name participant_one_name,mentee.display_name participant_two_name,null::text organization_name " +
      "from mentorship m left join person mentor on mentor.user_id=m.mentor_user_id left join person mentee on mentee.user_id=m.mentee_user_id where ($1='all' or $1='mentorship') " +
      "union all " +
      "select 'organization_mentorship'::text case_type,r.id,r.status,r.created_at,x.title case_title,requester.display_name participant_one_name,org.display_name participant_two_name,org.display_name organization_name " +
      "from organization_mentorship_request r join organization_mentorship_offer x on x.id=r.offer_id join organization org on org.id=x.organization_id left join person requester on requester.user_id=r.requester_user_id where ($1='all' or $1='organization_mentorship') " +
      ") cases where ($2='' or cases.status=$2) and ($3='' or cases.id::text ilike '%'||$3||'%' or lower(coalesce(cases.case_title,'')) like '%'||lower($3)||'%' or lower(coalesce(cases.participant_one_name,'')) like '%'||lower($3)||'%' or lower(coalesce(cases.participant_two_name,'')) like '%'||lower($3)||'%' or lower(coalesce(cases.organization_name,'')) like '%'||lower($3)||'%') " +
      "order by cases.created_at desc,cases.id desc limit $4 offset $5",
      [caseType, status, search, limit, offset],
    );
    const totalCount = result.rows.length ? Number(result.rows[0].total_count) : 0;
    const items = result.rows.map(({ total_count, ...item }) => item);
    await db.query(
      "insert into audit_log(actor_user_id,action,resource_type,request_id,outcome,metadata) values($1,'support.case_search','support_case_search',$2,'success',$3)",
      [actorId, requestId || null, JSON.stringify({ type: caseType, status: status || null, queryProvided: Boolean(search), limit, offset, resultCount: items.length })],
    );
    return { items, totalCount, limit, offset };
  });
}

export async function openSupportCase(actorId, caseType, caseId, input = {}, requestId = null) {
  if (!CASE_TYPES.has(caseType)) throw fail(400, "Choose a service or mentorship case.", "INVALID_CASE_TYPE");
  if (!UUID_PATTERN.test(String(caseId || ""))) throw fail(400, "A valid case reference is required.", "INVALID_CASE_ID");
  const reason = String(input.reason || "").trim();
  if (reason.length < 8 || reason.length > 500) {
    throw fail(400, "Enter an access reason between 8 and 500 characters.", "ACCESS_REASON_REQUIRED");
  }

  return withTransaction(async (db) => {
    await requireSupport(db, actorId);
    let caseRecord;
    let participantIds;
    let participants;
    let history;

    if (caseType === "service") {
      const request = (await db.query(
        "select sr.*,sl.title listing_title,sl.service_category listing_service_category,sl.delivery_mode listing_delivery_mode,sl.location_label listing_location_label,sl.organization_id listing_organization_id,org.display_name organization_name " +
        "from service_request sr join service_listing sl on sl.id=sr.service_listing_id left join organization org on org.id=sl.organization_id where sr.id=$1",
        [caseId],
      )).rows[0];
      if (!request) throw fail(404, "Service request not found.", "NOT_FOUND");
      participantIds = [...new Set([request.requester_user_id, request.provider_user_id])];
      participants = await Promise.all([
        participantDetails(db, request.requester_user_id).then((person) => ({ role: "requester", ...person })),
        participantDetails(db, request.provider_user_id).then((person) => ({ role: "provider", ...person })),
      ]);
      caseRecord = {
        request,
        listing: {
          id: request.service_listing_id,
          title: request.listing_title,
          category: request.listing_service_category,
          deliveryMode: request.listing_delivery_mode,
          locationLabel: request.listing_location_label,
          organizationId: request.listing_organization_id,
          organizationName: request.organization_name,
        },
      };
      const [statusEvents, agreements, updates, deliveries, feedback] = await Promise.all([
        db.query("select * from service_request_event where request_id=$1 order by created_at asc", [caseId]),
        db.query("select * from service_request_agreement where request_id=$1 order by terms_version asc", [caseId]),
        db.query("select * from service_request_update where request_id=$1 order by created_at asc", [caseId]),
        db.query("select * from service_request_delivery where request_id=$1 order by created_at asc", [caseId]),
        db.query("select * from service_request_feedback where request_id=$1 order by created_at asc", [caseId]),
      ]);
      history = {
        statusEvents: statusEvents.rows,
        agreements: agreements.rows,
        updates: updates.rows,
        deliveries: deliveries.rows,
        feedback: feedback.rows,
      };
    } else if (caseType === "mentorship") {
      const relationship = (await db.query(
        "select m.*,mr.status request_status,mr.goals request_goals,mr.topics request_topics,mr.preferred_modes request_preferred_modes,mr.preferred_languages request_preferred_languages,mr.preferred_days request_preferred_days,mr.share_with_eligible_mentors,mm.status match_status,mm.mentee_consent_status,mm.mentee_response_note,mm.proposed_at match_proposed_at,mm.responded_at match_responded_at " +
        "from mentorship m join mentorship_request mr on mr.id=m.request_id left join mentorship_match mm on mm.request_id=m.request_id where m.id=$1",
        [caseId],
      )).rows[0];
      if (!relationship) throw fail(404, "Mentorship relationship not found.", "NOT_FOUND");
      participantIds = [...new Set([relationship.mentor_user_id, relationship.mentee_user_id])];
      participants = await Promise.all([
        participantDetails(db, relationship.mentor_user_id).then((person) => ({ role: "mentor", ...person })),
        participantDetails(db, relationship.mentee_user_id).then((person) => ({ role: "mentee", ...person })),
      ]);
      caseRecord = { relationship };
      const [sessions, scheduleChanges, goals, events, feedback, participantReports] = await Promise.all([
        db.query("select * from mentorship_session where mentorship_id=$1 order by scheduled_start_at asc", [caseId]),
        db.query("select cp.* from mentorship_session_change_proposal cp join mentorship_session s on s.id=cp.session_id where s.mentorship_id=$1 order by cp.created_at asc", [caseId]),
        db.query("select * from mentorship_goal where mentorship_id=$1 order by target_date nulls last,created_at asc", [caseId]),
        db.query("select * from mentorship_event where mentorship_id=$1 order by created_at asc", [caseId]),
        db.query("select * from mentorship_feedback where mentorship_id=$1 order by created_at asc", [caseId]),
        db.query("select * from mentorship_participant_report where mentorship_id=$1 order by created_at asc", [caseId]),
      ]);
      history = {
        sessions: sessions.rows,
        scheduleChanges: scheduleChanges.rows,
        goals: goals.rows,
        events: events.rows,
        feedback: feedback.rows,
        participantReports: participantReports.rows,
      };
    } else {
      const request = (await db.query(
        "select r.*,x.title offer_title,x.description offer_description,x.expertise offer_expertise,x.languages offer_languages,x.delivery_mode offer_delivery_mode,x.visibility offer_visibility,x.status offer_status,x.moderation_status offer_moderation_status,x.organization_id,org.display_name organization_name,org.verification_status organization_verification_status " +
        "from organization_mentorship_request r join organization_mentorship_offer x on x.id=r.offer_id join organization org on org.id=x.organization_id where r.id=$1",
        [caseId],
      )).rows[0];
      if (!request) throw fail(404, "Organization mentorship request not found.", "NOT_FOUND");
      const team = (await db.query(
        "select user_id,role_code from organization_membership where organization_id=$1 and status='active' and role_code=any($2::text[]) order by role_code,user_id",
        [request.organization_id, ["owner", "administrator", "project_manager"]],
      )).rows;
      participantIds = [...new Set([request.requester_user_id, ...team.map((member) => member.user_id)])];
      participants = [
        { role: "requester", ...await participantDetails(db, request.requester_user_id) },
        ...await Promise.all(team.map(async (member) => ({ role: "organization_team_member", organizationRole: member.role_code, ...await participantDetails(db, member.user_id) }))),
      ];
      caseRecord = {
        request,
        offer: { id: request.offer_id, title: request.offer_title, description: request.offer_description, expertise: request.offer_expertise, languages: request.offer_languages, deliveryMode: request.offer_delivery_mode, visibility: request.offer_visibility, status: request.offer_status, moderationStatus: request.offer_moderation_status },
        organization: { id: request.organization_id, name: request.organization_name, verificationStatus: request.organization_verification_status },
      };
      const auditEvents = await db.query(
        "select occurred_at,actor_user_id,action,outcome,metadata from audit_log where resource_type='organization_mentorship_request' and resource_id=$1 order by occurred_at asc",
        [caseId],
      );
      history = { auditEvents: auditEvents.rows };
    }

    await auditCaseAccess(db, actorId, caseType, caseId, requestId, reason, participantIds);
    return {
      caseType,
      caseId,
      caseRecord,
      participants,
      history,
      accessReason: reason,
      accessedAt: new Date().toISOString(),
    };
  });
}
