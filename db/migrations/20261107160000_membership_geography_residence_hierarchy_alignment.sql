-- Keep the database hierarchy aligned with the member-residence selector contract.
-- Level 3 towns/districts must sit beneath a Zone or Sub-city (level 2).
-- Direct Region/Federal City -> Town links cannot be represented by member_residence.
create or replace function membership_geography_validate_parent() returns trigger language plpgsql as $$
declare parent_level text; parent_country text;
begin
  if new.unit_level='country' then
    if new.parent_id is not null then raise exception 'Country geography units cannot have a parent'; end if;
    return new;
  end if;
  select unit_level,coalesce(country_iso3,'ETH') into parent_level,parent_country
    from membership_geography_unit where id=new.parent_id and version_id=new.version_id;
  if parent_level is null then raise exception 'Geography parent must exist in the same version'; end if;
  if new.unit_level in ('region','federal_city') and parent_level='country' then
    if parent_country <> 'ETH' then raise exception 'Ethiopian administrative units must belong to Ethiopia'; end if;
  elsif new.unit_level='zone' and parent_level='region' then null;
  elsif new.unit_level='sub_city' and parent_level='federal_city' then null;
  elsif new.unit_level='district' and parent_level in ('zone','sub_city') then null;
  elsif new.unit_level='town' and parent_level in ('zone','sub_city') then null;
  else
    raise exception 'Invalid geography hierarchy: % cannot be a child of %',new.unit_level,parent_level;
  end if;
  return new;
end $$;
