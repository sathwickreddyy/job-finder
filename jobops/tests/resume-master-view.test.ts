import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
import { MasterView } from "@/features/resumes/master/view";
import type { Master } from "@/features/resumes/master/service";

describe("master-only A view", () => {
  it("shows source and historical removals beside it, explicitly excluding corrected facts", () => {
    const common = {
      versionId: "source",
      createdAt: new Date("2026-11-03T04:00:00Z"),
      sourceDate: null,
      storagePath: "",
      sha256: "",
      fileSize: 10,
      originalFilename: "Master.docx",
      pdfStoragePath: null,
      pdfFilename: null,
    };
    const old = {
      ...common,
      id: "old",
      reason: "Source import",
      removedDisposition: "retained",
      blocks: [{ kind: "paragraph" as const, text: "Incorrect earlier claim" }],
    };
    const current = {
      ...common,
      id: "new",
      reason: "Corrected a fact",
      removedDisposition: "incorrect",
      blocks: [{ kind: "paragraph" as const, text: "Confirmed current fact" }],
    };
    const master: Master = { versionId: "source", current, revisions: [current, old] };
    const html = renderToStaticMarkup(
      createElement(MasterView, {
        master,
        familyName: "General",
        preferences: { timezone: "Asia/Kolkata", dateFormat: "ISO" },
        legacyNotes: "Preserved prior note",
      }),
    );
    expect(html).toContain('aria-label="Complete master source"');
    expect(html).toContain('aria-label="Master ledger"');
    expect(html).toContain("Confirmed current fact");
    expect(html).toContain("Incorrect earlier claim");
    expect(html).toContain("Corrected facts — excluded");
    expect(html).not.toContain("Copy wording");
    expect(html).toContain("No PDF export attached to this revision");
    expect(html).not.toContain("Preview PDF");
    expect(html).not.toContain("Keyword check");
    expect(html).not.toContain("Score against a job");
  });
});
