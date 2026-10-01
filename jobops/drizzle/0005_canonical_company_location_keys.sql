-- Encode the complete location tuple without ambiguous separators. This retains
-- each starter location's ID, source, verification and observation dates.
UPDATE company_locations
SET location_key = '[' || to_json(lower(city))::text || ',' || to_json(lower(state))::text || ',' || to_json(lower(country))::text || ']'
WHERE location_key = lower(city) || '|' || lower(state) || '|' || lower(country);
