ALTER TABLE "blacklist"."staff_webauthn_challenges" DROP CONSTRAINT "challenge_binding_valid";--> statement-breakpoint
ALTER TABLE "blacklist"."email_change_requests" ADD COLUMN "old_email" text;--> statement-breakpoint
ALTER TABLE "blacklist"."identity_tokens" ADD COLUMN "terminal_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_webauthn_challenges" ADD CONSTRAINT "staff_webauthn_challenges_token_id_identity_tokens_id_fk" FOREIGN KEY ("token_id") REFERENCES "blacklist"."identity_tokens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "blacklist"."staff_webauthn_challenges" ADD CONSTRAINT "challenge_binding_valid" CHECK (("blacklist"."staff_webauthn_challenges"."purpose" = 'enroll' and (("blacklist"."staff_webauthn_challenges"."flow_id" is not null and "blacklist"."staff_webauthn_challenges"."invitation_id" is not null and "blacklist"."staff_webauthn_challenges"."user_id" is null) or ("blacklist"."staff_webauthn_challenges"."flow_id" is null and "blacklist"."staff_webauthn_challenges"."user_id" is not null and "blacklist"."staff_webauthn_challenges"."session_id" is not null))) or ("blacklist"."staff_webauthn_challenges"."purpose" <> 'enroll' and "blacklist"."staff_webauthn_challenges"."user_id" is not null));
-- Review: backfill before making the newly added private snapshot mandatory.
UPDATE blacklist.email_change_requests r SET old_email=u.email FROM blacklist.auth_users u WHERE r.user_id=u.id AND r.old_email IS NULL;
ALTER TABLE blacklist.email_change_requests ALTER COLUMN old_email SET NOT NULL;
