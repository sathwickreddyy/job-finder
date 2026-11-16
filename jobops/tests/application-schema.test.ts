import { describe, expect, it } from "vitest";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import {
  applicationRounds,
  applications,
  closeReasonEnum,
  interviewQuestions,
  questionOutcomeEnum,
  queueSnoozes,
  roundKindEnum,
  roundOutcomeEnum,
} from "@/db/schema";
import { outcomeDetailsSchema } from "@/features/applications/outcome-input";
import { roundKinds as researchKinds } from "@/features/companies/metrics";
import { roundKinds } from "@/lib/round-kinds";

describe("application tracking schema", () => {
  it("shares one round vocabulary between research and applications", () => {
    expect(researchKinds).toBe(roundKinds);
    expect(roundKindEnum.enumValues).toEqual([...roundKinds]);
  });

  it("defines round outcomes and close reasons", () => {
    expect(roundOutcomeEnum.enumValues).toEqual(["SCHEDULED", "PASSED", "FAILED", "CANCELLED"]);
    expect(closeReasonEnum.enumValues).toEqual([
      "REJECTED",
      "NO_REPLY",
      "WITHDREW",
      "ACCEPTED",
      "DECLINED",
    ]);
  });

  it("allows at most one booked round per application", () => {
    const booked = getTableConfig(applicationRounds).indexes.find(
      (index) => index.config.name === "application_rounds_one_booked_idx",
    );
    expect(booked?.config.unique).toBe(true);
    expect(booked?.config.columns.map((column) => ("name" in column ? column.name : null))).toEqual(
      ["application_id"],
    );
    expect(booked?.config.where).toBeDefined();
    expect(new PgDialect().sqlToQuery(booked!.config.where!).sql).toBe(
      '"application_rounds"."outcome" = \'SCHEDULED\'',
    );
  });

  it("adds follow-up notes, close reasons and snoozes", () => {
    expect(getTableConfig(applications).columns.map((column) => column.name)).toEqual(
      expect.arrayContaining(["closed_reason", "next_action_note"]),
    );
    expect(getTableConfig(queueSnoozes).columns.map((column) => column.name)).toEqual([
      "item_key",
      "until",
      "created_at",
    ]);
  });
  it("adds HR as the last round kind and the question outcome enum", () => {
    expect(roundKinds.at(-1)).toBe("HR");
    expect(questionOutcomeEnum.enumValues).toEqual([
      "SOLVED_CODE",
      "SOLVED_ALOUD",
      "PARTIAL",
      "STUCK",
    ]);
  });

  it("keeps interview questions under their round", () => {
    const config = getTableConfig(interviewQuestions);
    expect(config.foreignKeys[0].reference().foreignTable).toBe(applicationRounds);
    expect(config.foreignKeys[0].onDelete).toBe("cascade");
    expect(config.columns.map((c) => c.name)).toContain("review_source");
  });

  it("stores who interviewed in a round, up to 200 characters", () => {
    expect(getTableConfig(applicationRounds).columns.map((column) => column.name)).toContain(
      "interviewer",
    );
    expect(outcomeDetailsSchema.parse({ interviewer: "Mohammad Zabi" })).toEqual({
      interviewer: "Mohammad Zabi",
    });
    expect(outcomeDetailsSchema.safeParse({ interviewer: "x".repeat(201) }).success).toBe(false);
  });
});
