-- Increment 5 append-only governance event guards and one-way score policy lifecycle.
create or replace function community_impact_score_reject_history_mutation() returns trigger language plpgsql as $$ begin raise exception 'Community Impact score governance history is append-only'; end; $$;
drop trigger if exists trg_community_impact_score_policy_event_immutable on community_impact_score_policy_event;
create trigger trg_community_impact_score_policy_event_immutable before update or delete on community_impact_score_policy_event for each row execute function community_impact_score_reject_history_mutation();
drop trigger if exists trg_community_impact_score_recalculation_immutable on community_impact_score_recalculation;
create trigger trg_community_impact_score_recalculation_immutable before update or delete on community_impact_score_recalculation for each row execute function community_impact_score_reject_history_mutation();
drop trigger if exists trg_community_impact_score_adjustment_event_immutable on community_impact_score_adjustment_event;
create trigger trg_community_impact_score_adjustment_event_immutable before update or delete on community_impact_score_adjustment_event for each row execute function community_impact_score_reject_history_mutation();
drop trigger if exists trg_community_impact_score_source_link_event_immutable on community_impact_score_source_link_event;
create trigger trg_community_impact_score_source_link_event_immutable before update or delete on community_impact_score_source_link_event for each row execute function community_impact_score_reject_history_mutation();

create or replace function community_impact_score_policy_immutable() returns trigger language plpgsql as $$
begin
 if TG_OP='DELETE' then raise exception 'Community Impact score policy history cannot be deleted'; end if;
 if NEW.id is distinct from OLD.id or NEW.version is distinct from OLD.version or NEW.schema_version is distinct from OLD.schema_version or NEW.policy_hash is distinct from OLD.policy_hash or NEW.policy is distinct from OLD.policy or NEW.created_by is distinct from OLD.created_by or NEW.created_at is distinct from OLD.created_at or NEW.rationale is distinct from OLD.rationale or NEW.change_summary is distinct from OLD.change_summary then raise exception 'Score policy content is immutable; create a new version'; end if;
 if OLD.status='active' and NEW.status not in('active','superseded','revoked') then raise exception 'Invalid active score policy transition'; end if;
 if OLD.status='approved' and NEW.status not in('approved','active','revoked') then raise exception 'Only an approved score policy can become active'; end if;
 if OLD.status in('superseded','revoked') and NEW.status is distinct from OLD.status then raise exception 'Superseded or revoked score policies cannot be reactivated'; end if;
 if (NEW.evaluation_only is distinct from OLD.evaluation_only or NEW.public_score_enabled is distinct from OLD.public_score_enabled) and not (OLD.status='approved' and NEW.status='active') then raise exception 'Publication mode can only be set during approved policy activation'; end if;
 return NEW;
end; $$;
