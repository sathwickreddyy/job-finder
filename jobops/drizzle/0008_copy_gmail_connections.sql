-- Drizzle runs pending migrations in one transaction. Hold these locks through copy/drop;
-- the drop migration independently rechecks preservation for separately applied migrations.
DO $$
BEGIN
  LOCK TABLE "gmail_connections", "mail_connections", "settings" IN ACCESS EXCLUSIVE MODE;

  -- Matching IDs AND provider/email must agree on every legacy field. Never hide a
  -- primary-key/email collision behind ON CONFLICT DO NOTHING and then drop its source.
  IF EXISTS (
    SELECT 1 FROM "gmail_connections" g JOIN "mail_connections" m
      ON m."id" = g."id" OR (m."provider" = 'GMAIL' AND m."email" = g."email")
    WHERE ROW(m."id", m."provider", m."email", m."encrypted_access_token",
      m."encrypted_refresh_token", m."token_expires_at", m."last_synced_at", m."created_at", m."updated_at")
      IS DISTINCT FROM ROW(g."id", 'GMAIL'::text, g."email", g."encrypted_access_token",
      g."encrypted_refresh_token", g."token_expires_at", g."last_synced_at", g."created_at", g."updated_at")
  ) THEN
    RAISE EXCEPTION 'Gmail connection copy conflicts with an existing mail connection; migration aborted';
  END IF;

  IF EXISTS (
    SELECT 1 FROM "settings" g JOIN "settings" m
      ON m."key" = 'mailCursor:' || substring(g."key" from 13)
    WHERE g."key" LIKE 'gmailCursor:%' AND m."value" IS DISTINCT FROM g."value"
  ) THEN
    RAISE EXCEPTION 'Gmail cursor copy conflicts with an existing mail cursor; migration aborted';
  END IF;

  INSERT INTO "mail_connections" ("id", "provider", "email", "encrypted_access_token",
    "encrypted_refresh_token", "token_expires_at", "last_synced_at", "created_at", "updated_at")
  SELECT g."id", 'GMAIL', g."email", g."encrypted_access_token", g."encrypted_refresh_token",
    g."token_expires_at", g."last_synced_at", g."created_at", g."updated_at"
  FROM "gmail_connections" g
  WHERE NOT EXISTS (SELECT 1 FROM "mail_connections" m WHERE m."id" = g."id");

  INSERT INTO "settings" ("key", "value", "updated_at")
  SELECT 'mailCursor:' || substring(g."key" from 13), g."value", g."updated_at"
  FROM "settings" g
  WHERE g."key" LIKE 'gmailCursor:%'
    AND NOT EXISTS (SELECT 1 FROM "settings" m
      WHERE m."key" = 'mailCursor:' || substring(g."key" from 13));

  -- Check every cursor before removing its old key, including orphan legacy cursors.
  IF EXISTS (
    SELECT 1 FROM "settings" g LEFT JOIN "settings" m
      ON m."key" = 'mailCursor:' || substring(g."key" from 13)
    WHERE g."key" LIKE 'gmailCursor:%' AND (m."key" IS NULL OR m."value" IS DISTINCT FROM g."value")
  ) THEN
    RAISE EXCEPTION 'Gmail cursor copy is incomplete; migration aborted';
  END IF;
  DELETE FROM "settings" WHERE "key" LIKE 'gmailCursor:%';
END $$;
