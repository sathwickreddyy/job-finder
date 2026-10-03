import { expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

it("stores connections per provider and email, and the receiving inbox", () => {
  expect(schema).toHaveProperty("mailConnections");
  const config = getTableConfig(schema.mailConnections);
  expect(config.name).toBe("mail_connections");
  expect(config.columns.map((column) => column.name)).toEqual(
    expect.arrayContaining([
      "provider",
      "email",
      "last_refreshed_at",
      "last_refreshed_count",
      "last_error",
    ]),
  );
  expect(
    config.indexes.find((index) => index.config.name === "mail_connections_provider_email_idx")
      ?.config.unique,
  ).toBe(true);
  expect(config.checks.map((check) => check.name)).toContain("mail_connections_provider");
  expect(
    getTableConfig(schema.mailMessages).columns.find((column) => column.name === "account_email")
      ?.notNull,
  ).toBe(false);
  expect("gmailConnections" in schema).toBe(false);
});
