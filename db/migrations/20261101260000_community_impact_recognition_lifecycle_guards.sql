-- Recognition duplicate prevention and lifecycle guard.
drop index if exists uq_community_impact_member_open_nomination;
drop index if exists uq_community_impact_nonmember_open_nomination;
create unique index uq_community_impact_member_open_nomination
 on community_impact_recognition_nomination(program_id,nominee_user_id)
 where nominee_type='member' and status in('submitted','under_review','clarification_requested','approved');
create unique index uq_community_impact_nonmember_open_nomination
 on community_impact_recognition_nomination(program_id,lower(nominee_email))
 where nominee_type='non_member' and status in('submitted','under_review','clarification_requested','approved');
create or replace function community_impact_recognition_nomination_guard() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Recognition nominations are retained; withdraw rather than delete'; end if;
 if NEW.id is distinct from OLD.id or NEW.program_id is distinct from OLD.program_id or NEW.nominator_user_id is distinct from OLD.nominator_user_id or NEW.nominee_user_id is distinct from OLD.nominee_user_id or NEW.nominee_type is distinct from OLD.nominee_type or NEW.nominee_name is distinct from OLD.nominee_name or NEW.nominee_email is distinct from OLD.nominee_email or NEW.contribution_summary is distinct from OLD.contribution_summary or NEW.evidence_references is distinct from OLD.evidence_references or NEW.related_claim_id is distinct from OLD.related_claim_id or NEW.created_at is distinct from OLD.created_at then raise exception 'Recognition nomination provenance is immutable'; end if;
 if NEW.status is distinct from OLD.status and not (
  (OLD.status='submitted' and NEW.status in('under_review','withdrawn')) or
  (OLD.status='under_review' and NEW.status in('clarification_requested','approved','declined')) or
  (OLD.status='clarification_requested' and NEW.status in('under_review','withdrawn'))
 ) then raise exception 'Invalid recognition nomination status transition'; end if;
 if NEW.assigned_reviewer_id is distinct from OLD.assigned_reviewer_id and NEW.status<>'under_review' then raise exception 'Recognition reviewer assignment requires under-review state'; end if;
 return NEW;
end; $$;
drop trigger if exists trg_community_impact_recognition_nomination_guard on community_impact_recognition_nomination;
create trigger trg_community_impact_recognition_nomination_guard before update or delete on community_impact_recognition_nomination for each row execute function community_impact_recognition_nomination_guard();
