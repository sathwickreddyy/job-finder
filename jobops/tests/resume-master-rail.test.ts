import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumeRail } from "@/features/resumes/workspace/rail";
import type { GalleryFamily, GalleryFile } from "@/features/resumes/view-types";

const file = (id: string, patch: Partial<GalleryFile> = {}): GalleryFile => ({
  id,
  familyId: "family",
  familyName: "General",
  label: id,
  filename: `${id}.pdf`,
  uploaded: id === "source" ? "2026-11-02" : "2026-11-03",
  size: "20 KB",
  isDefault: false,
  textExtracted: true,
  changeNotes: "",
  assessmentCount: 0,
  uses: [],
  ...patch,
});
const render = (files: GalleryFile[]) =>
  renderToStaticMarkup(
    createElement(ResumeRail, {
      families: [{ id: "family", name: "General", files }] as GalleryFamily[],
      selectedId: "source",
      variant: "lineage",
      linkBase: "/resumes?",
    }),
  );

describe("master pinned above the file timeline", () => {
  it("pins an explicit master above the dated application rows without a timeline dot or date", () => {
    const html = render([file("application"), file("source", { isMaster: true })]);
    expect(html).toContain('aria-label="Master résumé"');
    expect(html.indexOf('aria-label="Master résumé"')).toBeLessThan(html.indexOf("<ol"));
    expect(html).not.toContain("2026-11-02");
    expect(html).toContain("2026-11-03");
    expect(html).toContain('href="/resumes?file=application"');
  });
  it("does not mistake an ordinary default application PDF for a master", () => {
    expect(render([file("application", { isDefault: true })])).not.toContain(
      'aria-label="Master résumé"',
    );
  });
});
