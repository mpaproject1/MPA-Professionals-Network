-- Policy effective timestamps may only be set at the independently approved activation boundary.
create or replace function community_impact_score_policy_immutable() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Community Impact score policy history cannot be deleted'; end if;
 if NEW.id is distinct from OLD.id or NEW.version is distinct from OLD.version or NEW.schema_version is distinct from OLD.schema_version or NEW.policy_hash is distinct from OLD.policy_hash or NEW.policy is distinct from OLD.policy or NEW.created_by is distinct from OLD.created_by or NEW.created_at is distinct from OLD.created_at or NEW.rationale is distinct from OLD.rationale or NEW.change_summary is distinct from OLD.change_summary then raise exception 'Score policy content is immutable; create a new version'; end if;
 if OLD.status='in_review' and NEW.status not in('in_review','approved') then raise exception 'A policy under review can only remain in review or be approved'; end if;
 if OLD.status='active' and NEW.status not in('active','superseded','revoked') then raise exception 'Invalid active score policy transition'; end if;
 if OLD.status='approved' and NEW.status not in('approved','active','revoked') then raise exception 'Only an approved score policy can become active'; end if;
 if OLD.status in('superseded','revoked') and NEW.status is distinct from OLD.status then raise exception 'Superseded or revoked score policies cannot be reactivated'; end if;
 if (NEW.approved_by is distinct from OLD.approved_by or NEW.approved_at is distinct from OLD.approved_at or NEW.approval_reference is distinct from OLD.approval_reference) and not (OLD.status='in_review' and NEW.status='approved') then raise exception 'Score policy approval metadata is immutable after approval'; end if;
 if NEW.effective_at is distinct from OLD.effective_at and not (OLD.status='approved' and NEW.status='active') then raise exception 'Policy effective time can only be set during approved activation'; end if;
 if (NEW.evaluation_only is distinct from OLD.evaluation_only or NEW.public_score_enabled is distinct from OLD.public_score_enabled) and not (OLD.status='approved' and NEW.status='active') then raise exception 'Publication mode can only be set during approved policy activation'; end if;
 return NEW;
end; $$;
