ALTER TABLE "blacklist"."staff_role_requests" ADD COLUMN "security_version" integer;
-- Review: old requests lack a trustworthy captured version; retire them instead of inferring approval authority.
UPDATE blacklist.staff_role_requests SET state='cancelled' WHERE state='pending';
UPDATE blacklist.staff_role_requests r SET security_version=s.security_version FROM blacklist.account_security_state s WHERE r.target_user_id=s.user_id;
ALTER TABLE blacklist.staff_role_requests ALTER COLUMN security_version SET NOT NULL;
