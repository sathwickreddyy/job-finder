import { describe, expect, it } from "vitest";
import { docxPathSchema, fitInputSchema } from "@/features/resumes/fit/service";

const body = {
  target: {
    url: "https://careers.example.invalid/1",
    company: "Example",
    title: "Engineer",
    description: "Build things.",
  },
  assessments: [],
};

describe("editable DOCX path", () => {
  it("accepts an absolute .docx path", () => {
    expect(docxPathSchema.parse(" /Users/x/Resume.docx ")).toBe("/Users/x/Resume.docx");
  });

  it("refuses relative, non-docx and empty paths", () => {
    for (const value of ["Resume.docx", "/x/Resume.pdf", ""])
      expect(docxPathSchema.safeParse(value).success).toBe(false);
  });

  it("is optional on a fit record", () => {
    expect(fitInputSchema.parse(body).docxPath).toBeUndefined();
    expect(fitInputSchema.parse({ ...body, docxPath: "/a/b.docx" }).docxPath).toBe("/a/b.docx");
  });
});
