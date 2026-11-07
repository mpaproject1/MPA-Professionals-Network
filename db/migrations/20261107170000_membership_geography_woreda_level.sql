-- Add an explicit Woreda level rather than mislabelling Ethiopian woredas as generic districts.
alter table membership_geography_unit drop constraint if exists membership_geography_unit_unit_level_check;
alter table membership_geography_unit add constraint membership_geography_unit_unit_level_check
 check(unit_level in ('country','region','federal_city','zone','sub_city','district','town','woreda'));
create or replace function membership_geography_validate_parent() returns trigger language plpgsql as $$
declare parent_level text; parent_country text;
begin
 if new.unit_level='country' then if new.parent_id is not null then raise exception 'Country geography units cannot have a parent'; end if;return new;end if;
 select unit_level,coalesce(country_iso3,'ETH') into parent_level,parent_country from membership_geography_unit where id=new.parent_id and version_id=new.version_id;
 if parent_level is null then raise exception 'Geography parent must exist in the same version';end if;
 if new.unit_level in ('region','federal_city') and parent_level='country' then
  if parent_country<>'ETH' then raise exception 'Ethiopian administrative units must belong to Ethiopia';end if;
 elsif new.unit_level='zone' and parent_level='region' then null;
 elsif new.unit_level='sub_city' and parent_level='federal_city' then null;
 elsif new.unit_level in ('district','woreda','town') and parent_level in ('zone','sub_city') then null;
 else raise exception 'Invalid geography hierarchy: % cannot be a child of %',new.unit_level,parent_level;end if;
 return new;
end $$;
create or replace function member_residence_validate_hierarchy() returns trigger language plpgsql as $$
declare c record;a1 record;a2 record;a3 record;v_status text;
begin
 if new.geography_version_id is null then raise exception 'A published geography version is required';end if;
 select status into v_status from membership_geography_version where id=new.geography_version_id;
 if v_status<>'published' then raise exception 'Member residence must use a published geography version';end if;
 select unit_level,country_iso3,version_id into c from membership_geography_unit where id=new.country_unit_id;
 if c.unit_level<>'country' or c.version_id<>new.geography_version_id then raise exception 'Select a country from the active geography version';end if;
 if new.residence_type='ethiopia' then
  if c.country_iso3<>'ETH' then raise exception 'Ethiopian residence must use Ethiopia as the country';end if;
  select unit_level,parent_id,version_id into a1 from membership_geography_unit where id=new.admin_level_1_id;
  if a1.unit_level not in ('region','federal_city') or a1.parent_id<>new.country_unit_id or a1.version_id<>new.geography_version_id then raise exception 'Select an Ethiopian region or federal city';end if;
  if new.admin_level_2_id is not null then
   select unit_level,parent_id,version_id into a2 from membership_geography_unit where id=new.admin_level_2_id;
   if a1.unit_level='region' and a2.unit_level<>'zone' then raise exception 'A region must be followed by a zone';end if;
   if a1.unit_level='federal_city' and a2.unit_level<>'sub_city' then raise exception 'A federal city must be followed by a sub-city or city division';end if;
   if a2.parent_id<>new.admin_level_1_id or a2.version_id<>new.geography_version_id then raise exception 'The selected zone or city division does not belong to the selected region or federal city';end if;
  end if;
  if new.admin_level_3_id is not null then
   if new.admin_level_2_id is null then raise exception 'Select a zone or city division before a district, woreda or town';end if;
   select unit_level,parent_id,version_id into a3 from membership_geography_unit where id=new.admin_level_3_id;
   if a3.unit_level not in ('district','town','woreda') or a3.parent_id<>new.admin_level_2_id or a3.version_id<>new.geography_version_id then raise exception 'The selected district, woreda or town does not belong to the selected zone or city division';end if;
  end if;
 else if c.country_iso3='ETH' then raise exception 'Choose Diaspora only when residence is outside Ethiopia';end if;end if;
 return new;
end $$;