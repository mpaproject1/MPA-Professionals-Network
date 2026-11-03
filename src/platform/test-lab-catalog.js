// Canonical Test Lab persona and acceptance-scenario catalogue.
// Role codes intentionally reuse installed application roles; no privileged role is invented.
export const TEST_LAB_PERSONAS = [
  {
    "persona": "Member — incomplete profile",
    "role": "member",
    "name": [
      "Amina",
      "Yusuf"
    ],
    "personaKey": "P01"
  },
  {
    "persona": "Member — pending membership",
    "role": "member",
    "name": [
      "Bilal",
      "Ahmed"
    ],
    "personaKey": "P02"
  },
  {
    "persona": "Active member — verification pending",
    "role": "member",
    "name": [
      "Hana",
      "Mohammed"
    ],
    "personaKey": "P03"
  },
  {
    "persona": "Verified professional / mentor",
    "role": "member",
    "name": [
      "Yusuf",
      "Ibrahim"
    ],
    "personaKey": "P04"
  },
  {
    "persona": "Member — job seeker / applicant",
    "role": "member",
    "name": [
      "Mekdes",
      "Tesfaye"
    ],
    "personaKey": "P05"
  },
  {
    "persona": "Member — employer representative",
    "role": "member",
    "name": [
      "Dawit",
      "Kebede"
    ],
    "personaKey": "P06"
  },
  {
    "persona": "Member — service requester",
    "role": "member",
    "name": [
      "Sara",
      "Abebe"
    ],
    "personaKey": "P07"
  },
  {
    "persona": "Member — pro bono service provider",
    "role": "member",
    "name": [
      "Nahom",
      "Girma"
    ],
    "personaKey": "P08"
  },
  {
    "persona": "Member — mentorship applicant",
    "role": "member",
    "name": [
      "Liya",
      "Bekele"
    ],
    "personaKey": "P09"
  },
  {
    "persona": "Member — community initiative proposer",
    "role": "member",
    "name": [
      "Abel",
      "Tadesse"
    ],
    "personaKey": "P10"
  },
  {
    "persona": "Member — volunteer participant",
    "role": "member",
    "name": [
      "Rahel",
      "Demissie"
    ],
    "personaKey": "P11"
  },
  {
    "persona": "Member — offline project reporter",
    "role": "member",
    "name": [
      "Kalkidan",
      "Worku"
    ],
    "personaKey": "P12"
  },
  {
    "persona": "Member — donation contributor",
    "role": "member",
    "name": [
      "Sami",
      "Hussein"
    ],
    "personaKey": "P13"
  },
  {
    "persona": "Member — organization owner",
    "role": "member",
    "name": [
      "Selam",
      "Mulu"
    ],
    "personaKey": "P14"
  },
  {
    "persona": "Membership reviewer — queue triage",
    "role": "reviewer",
    "name": [
      "Mariam",
      "Abdi"
    ],
    "personaKey": "P15"
  },
  {
    "persona": "Membership reviewer — correction decision",
    "role": "reviewer",
    "name": [
      "Yonas",
      "Alemu"
    ],
    "personaKey": "P16"
  },
  {
    "persona": "Verification reviewer — evidence assessor",
    "role": "verification_reviewer",
    "name": [
      "Ahmed",
      "Nur"
    ],
    "personaKey": "P17"
  },
  {
    "persona": "Verification reviewer — organization assessor",
    "role": "verification_reviewer",
    "name": [
      "Hirut",
      "Getachew"
    ],
    "personaKey": "P18"
  },
  {
    "persona": "Verification reviewer — appeal evidence assessor",
    "role": "verification_reviewer",
    "name": [
      "Desta",
      "Fikru"
    ],
    "personaKey": "P19"
  },
  {
    "persona": "Independent appeal reviewer",
    "role": "appeal_reviewer",
    "name": [
      "Fatima",
      "Hassan"
    ],
    "personaKey": "P20"
  },
  {
    "persona": "Finance officer — payment verification",
    "role": "finance_officer",
    "name": [
      "Ibrahim",
      "Suleiman"
    ],
    "personaKey": "P21"
  },
  {
    "persona": "Support staff — notification delivery observer",
    "role": "supporting_staff",
    "name": [
      "Samira",
      "Ali"
    ],
    "personaKey": "P22"
  }
];

export const TEST_LAB_SCENARIOS = [
  {
    "id": "TL-001",
    "module": "Identity & access",
    "title": "Sign in as incomplete-profile member",
    "actorRole": "member",
    "reviewerRole": "member",
    "expected": "Authenticated session; profile completion remains outstanding",
    "evidence": "Session and profile completion panel",
    "personaKey": "P01"
  },
  {
    "id": "TL-002",
    "module": "Membership",
    "title": "Submit Basic membership application",
    "actorRole": "member",
    "reviewerRole": "reviewer",
    "expected": "Application submitted once with immutable fee and terms snapshots",
    "evidence": "Tracking reference and submitted status",
    "personaKey": "P02"
  },
  {
    "id": "TL-003",
    "module": "Membership review",
    "title": "Request membership application correction",
    "actorRole": "reviewer",
    "reviewerRole": "member",
    "expected": "Correction request and review history persisted",
    "evidence": "Decision, requested fields and audit event",
    "personaKey": "P15"
  },
  {
    "id": "TL-004",
    "module": "Membership correction",
    "title": "Respond to membership correction",
    "actorRole": "member",
    "reviewerRole": "reviewer",
    "expected": "Application returns to submitted with member response",
    "evidence": "Correction response and application status",
    "personaKey": "P02"
  },
  {
    "id": "TL-005",
    "module": "Membership payment",
    "title": "Submit manual cash payment against saved fee",
    "actorRole": "member",
    "reviewerRole": "finance_officer",
    "expected": "Payment pending and linked to application",
    "evidence": "Payment reference, amount, currency and status",
    "personaKey": "P05"
  },
  {
    "id": "TL-006",
    "module": "Payment verification",
    "title": "Finance verifies membership payment",
    "actorRole": "finance_officer",
    "reviewerRole": "member",
    "expected": "Payment succeeds through membership service and is reconciled",
    "evidence": "Verification, reconciliation and audit event",
    "personaKey": "P21"
  },
  {
    "id": "TL-007",
    "module": "Payment failure",
    "title": "Finance rejects submitted payment",
    "actorRole": "finance_officer",
    "reviewerRole": "member",
    "expected": "Payment failed; application not activated",
    "evidence": "Failed payment status and reason",
    "personaKey": "P21"
  },
  {
    "id": "TL-008",
    "module": "Payment correction",
    "title": "Finance requests payment evidence correction",
    "actorRole": "finance_officer",
    "reviewerRole": "member",
    "expected": "Payment remains pending with recorded verification decision",
    "evidence": "Correction decision and reviewer note",
    "personaKey": "P21"
  },
  {
    "id": "TL-009",
    "module": "Payment reversal",
    "title": "Refund successful synthetic payment",
    "actorRole": "finance_officer",
    "reviewerRole": "member",
    "expected": "Payment refunded; reversal recorded and access guarded",
    "evidence": "Reversal record, reason and audit event",
    "personaKey": "P21"
  },
  {
    "id": "TL-010",
    "module": "Verification",
    "title": "Submit professional verification evidence",
    "actorRole": "member",
    "reviewerRole": "verification_reviewer",
    "expected": "Case and private evidence scoped to authorized reviewers",
    "evidence": "Verification case and evidence metadata",
    "personaKey": "P03"
  },
  {
    "id": "TL-011",
    "module": "Organization",
    "title": "Submit organization for verification",
    "actorRole": "member",
    "reviewerRole": "verification_reviewer",
    "expected": "Organization and evidence linked",
    "evidence": "Organization case and evidence",
    "personaKey": "P14"
  },
  {
    "id": "TL-012",
    "module": "Jobs",
    "title": "Submit synthetic vacancy",
    "actorRole": "member",
    "reviewerRole": "reviewer",
    "expected": "Vacancy enters moderation, not public publication",
    "evidence": "Job record and moderation status",
    "personaKey": "P06"
  },
  {
    "id": "TL-013",
    "module": "Jobs",
    "title": "Save and submit job application",
    "actorRole": "member",
    "reviewerRole": "member",
    "expected": "Applicant-owned draft and submission persist",
    "evidence": "Application status and applicant history",
    "personaKey": "P05"
  },
  {
    "id": "TL-014",
    "module": "Services",
    "title": "Publish pro bono service listing",
    "actorRole": "member",
    "reviewerRole": "member",
    "expected": "Provider listing persists with audience and status",
    "evidence": "Listing details and visibility",
    "personaKey": "P08"
  },
  {
    "id": "TL-015",
    "module": "Services",
    "title": "Request and fulfil listed service",
    "actorRole": "member",
    "reviewerRole": "member",
    "expected": "Request lifecycle and provider response auditable",
    "evidence": "Request state and event history",
    "personaKey": "P07"
  },
  {
    "id": "TL-016",
    "module": "Mentorship",
    "title": "Create mentor profile and availability",
    "actorRole": "member",
    "reviewerRole": "member",
    "expected": "Mentor profile and availability discoverable",
    "evidence": "Mentor profile and availability",
    "personaKey": "P04"
  },
  {
    "id": "TL-017",
    "module": "Mentorship",
    "title": "Submit mentorship request and progress matching",
    "actorRole": "member",
    "reviewerRole": "member",
    "expected": "Request persisted with consent and matching status",
    "evidence": "Request, consent and status history",
    "personaKey": "P09"
  },
  {
    "id": "TL-018",
    "module": "Community initiatives",
    "title": "Propose and submit initiative",
    "actorRole": "member",
    "reviewerRole": "reviewer",
    "expected": "Initiative enters review with submission event",
    "evidence": "Initiative record and event history",
    "personaKey": "P10"
  },
  {
    "id": "TL-019",
    "module": "Community participation",
    "title": "Apply with explicit participation consent",
    "actorRole": "member",
    "reviewerRole": "member",
    "expected": "Participation and scoped consent evidence recorded",
    "evidence": "Participation and consent events",
    "personaKey": "P11"
  },
  {
    "id": "TL-020",
    "module": "Offline projects",
    "title": "Submit completed offline project and evidence",
    "actorRole": "member",
    "reviewerRole": "reviewer",
    "expected": "Project enters review; no real beneficiary claims",
    "evidence": "Project, evidence and event history",
    "personaKey": "P12"
  },
  {
    "id": "TL-021",
    "module": "Finance donations",
    "title": "Record synthetic donation receipt",
    "actorRole": "finance_officer",
    "reviewerRole": "finance_officer",
    "expected": "Receipt recorded but unverified pending separate decision",
    "evidence": "Receipt number, evidence and status",
    "personaKey": "P21"
  },
  {
    "id": "TL-022",
    "module": "Notifications & governance",
    "title": "Inspect captured email/push and audit events",
    "actorRole": "supporting_staff",
    "reviewerRole": "system_admin",
    "expected": "No external delivery; captured events portfolio-scoped",
    "evidence": "Delivery ledger and audit trail",
    "personaKey": "P22"
  }
];
