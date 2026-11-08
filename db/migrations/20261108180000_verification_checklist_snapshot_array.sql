-- Ensure verification checklist snapshots default to a JSON array.
ALTER TABLE public.verification_case
  ALTER COLUMN checklist_version_snapshot
  SET DEFAULT '[]'::jsonb;
