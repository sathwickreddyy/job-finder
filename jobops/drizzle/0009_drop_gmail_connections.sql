-- Recheck under locks immediately before DROP: this also protects deployments that
-- applied the copy separately and received a legacy write between migration steps.
DO $$
BEGIN
  LOCK TABLE "gmail_connections", "mail_connections", "settings" IN ACCESS EXCLUSIVE MODE;
  IF EXISTS (
    SELECT 1 FROM "gmail_connections" g LEFT JOIN "mail_connections" m ON m."id" = g."id"
    WHERE m."id" IS NULL OR ROW(m."provider", m."email", m."encrypted_access_token",
      m."encrypted_refresh_token", m."token_expires_at", m."last_synced_at", m."created_at", m."updated_at")
      IS DISTINCT FROM ROW('GMAIL'::text, g."email", g."encrypted_access_token",
      g."encrypted_refresh_token", g."token_expires_at", g."last_synced_at", g."created_at", g."updated_at")
  ) THEN
    RAISE EXCEPTION 'Gmail connection preservation check failed; old table retained';
  END IF;
  IF EXISTS (SELECT 1 FROM "settings" WHERE "key" LIKE 'gmailCursor:%') THEN
    RAISE EXCEPTION 'Unmoved Gmail cursors remain; old table retained';
  END IF;
  DROP TABLE "gmail_connections";
END $$;
