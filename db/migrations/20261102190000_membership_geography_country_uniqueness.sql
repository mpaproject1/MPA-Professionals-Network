create unique index if not exists membership_geography_country_iso3_uq
 on membership_geography_unit(version_id,country_iso3)
 where unit_level='country' and country_iso3 is not null;
create unique index if not exists membership_geography_country_m49_uq
 on membership_geography_unit(version_id,country_m49)
 where unit_level='country' and country_m49 is not null;
