-- PearsonQuickBooks nonpersistent security regression test.
-- Run with SQL editor privileges on a dedicated nonproduction database if possible.
-- Entire fixture and mutations are rolled back; verify no records remain.
-- Exercises two unrelated confirmed users, workspace RLS, owner/member visibility,
-- privileged RPC permission checks and optimistic revision control.
BEGIN;
INSERT INTO auth.users(id,email,email_confirmed_at,raw_user_meta_data)
VALUES
 ('10000000-0000-4000-8000-000000000001','pq-qa-a@example.invalid',now(),'{"full_name":"QA A"}'::jsonb),
 ('20000000-0000-4000-8000-000000000002','pq-qa-b@example.invalid',now(),'{"full_name":"QA B"}'::jsonb);
INSERT INTO public.workspaces(id,owner_id,name,data)
VALUES
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','QA Company A','{"business":{"name":"QA Company A"},"customers":[],"items":[],"documents":[],"expenses":[]}'::jsonb),
 ('40000000-0000-4000-8000-000000000004','20000000-0000-4000-8000-000000000002','QA Company B','{"business":{"name":"QA Company B"},"customers":[],"items":[],"documents":[],"expenses":[]}'::jsonb);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $$
BEGIN
 IF (SELECT count(*) FROM public.workspaces) <> 1 THEN RAISE EXCEPTION 'A can see other businesses'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE name='QA Company A') THEN RAISE EXCEPTION 'A cannot see own business'; END IF;
 IF (SELECT count(*) FROM public.workspace_members) <> 1 THEN RAISE EXCEPTION 'A can see other memberships'; END IF;
 IF EXISTS (SELECT 1 FROM public.profiles WHERE display_name='QA B') THEN RAISE EXCEPTION 'A can see B profile'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
DO $$
DECLARE err text;
BEGIN
 IF (SELECT count(*) FROM public.workspaces) <> 1 THEN RAISE EXCEPTION 'B can see other businesses'; END IF;
 IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE name='QA Company B') THEN RAISE EXCEPTION 'B cannot see own business'; END IF;
 IF (SELECT count(*) FROM public.workspace_members) <> 1 THEN RAISE EXCEPTION 'B can see other memberships'; END IF;
 BEGIN
  PERFORM public.commit_workspace('30000000-0000-4000-8000-000000000003',0,'{"business":{"name":"Hacked"},"customers":[],"items":[],"documents":[],"expenses":[]}'::jsonb);
  RAISE EXCEPTION 'TEST_FAILED_UNAUTHORIZED_WRITE_SUCCEEDED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  IF err <> 'Not permitted' THEN RAISE EXCEPTION 'Unexpected cross-tenant write outcome: %',err; END IF;
 END;
 BEGIN
  PERFORM public.create_workspace_invite('30000000-0000-4000-8000-000000000003','attacker@example.invalid','admin');
  RAISE EXCEPTION 'TEST_FAILED_UNAUTHORIZED_INVITE_SUCCEEDED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  IF err <> 'Not permitted' THEN RAISE EXCEPTION 'Unexpected cross-tenant invite outcome: %',err; END IF;
 END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
DO $$
DECLARE n bigint;err text;
BEGIN
 n := public.commit_workspace('30000000-0000-4000-8000-000000000003',0,'{"business":{"name":"QA Company A"},"customers":[],"items":[],"documents":[],"expenses":[]}'::jsonb);
 IF n <> 1 THEN RAISE EXCEPTION 'Revision did not advance to 1: %',n; END IF;
 BEGIN
  PERFORM public.commit_workspace('30000000-0000-4000-8000-000000000003',0,'{"business":{"name":"QA Company A"},"customers":[],"items":[],"documents":[],"expenses":[]}'::jsonb);
  RAISE EXCEPTION 'TEST_FAILED_STALE_WRITE_SUCCEEDED';
 EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS err=MESSAGE_TEXT;
  IF err <> 'STALE_WRITE' THEN RAISE EXCEPTION 'Unexpected revision conflict outcome: %',err; END IF;
 END;
END $$;
ROLLBACK;
