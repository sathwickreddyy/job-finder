import { describe, expect, it } from "vitest";
import { strToU8, zipSync } from "fflate";
import { masterChanges, readMasterDocx } from "@/features/resumes/master/document";

const docx = (body: string) =>
  Buffer.from(
    zipSync({
      "[Content_Types].xml": strToU8(
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
      ),
      "word/document.xml": strToU8(
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`,
      ),
    }),
  );

describe("master DOCX source", () => {
  it("keeps ordered paragraphs, hyperlink text, tables and bullets, excluding deleted wording", () => {
    const blocks = readMasterDocx(
      docx(
        '<w:p><w:r><w:t>EXPERIENCE</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t>Built </w:t></w:r><w:hyperlink><w:r><w:t>services &amp; tools</w:t></w:r></w:hyperlink><w:del><w:r><w:delText>incorrect claim</w:delText></w:r></w:del></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Project detail</w:t><w:tab/><w:t>2026</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
      ),
      "master.docx",
    );
    expect(blocks).toEqual([
      { kind: "heading", text: "EXPERIENCE" },
      { kind: "bullet", text: "Built services & tools" },
      { kind: "paragraph", text: "Project detail\t2026" },
    ]);
  });

  it("rejects arbitrary ZIP files, empty documents and entity declarations", () => {
    expect(() =>
      readMasterDocx(Buffer.from(zipSync({ "notes.txt": strToU8("hello") })), "x.docx"),
    ).toThrow(/DOCX/);
    expect(() => readMasterDocx(docx(""), "x.docx")).toThrow(/text/);
    const malicious = Buffer.from(
      zipSync({
        "word/document.xml": strToU8(
          '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><w:document/>',
        ),
      }),
    );
    expect(() => readMasterDocx(malicious, "x.docx")).toThrow();
    expect(() => readMasterDocx(docx("<w:p><w:r><w:t>Hello</w:t></w:r></w:p>"), "x.pdf")).toThrow(
      /DOCX/,
    );
  });

  it("refuses large inflated XML before parsing it", () => {
    expect(() =>
      readMasterDocx(docx(`<w:p><w:r><w:t>${"x".repeat(2_100_000)}</w:t></w:r></w:p>`), "x.docx"),
    ).toThrow(/large/);
  });
  it("bounds nested descendants inside a paragraph as well as the outer document", () => {
    const nested =
      "<w:p>" + "<w:r>".repeat(200) + "<w:t>Text</w:t>" + "</w:r>".repeat(200) + "</w:p>";
    expect(() => readMasterDocx(docx(nested), "nested.docx")).toThrow(/structure.*large|complex/);
  });
});

describe("master ledger", () => {
  const p = (text: string) => ({ kind: "paragraph" as const, text });
  it("records actual additions/removals, not reordering", () => {
    expect(masterChanges([p("A"), p("B")], [p("B"), p("A")])).toEqual({ added: [], removed: [] });
    expect(masterChanges([p("Old"), p("Keep")], [p("Keep"), p("New")])).toEqual({
      added: [p("New")],
      removed: [p("Old")],
    });
  });
  it("counts duplicate lines so removing one copy is still recorded", () => {
    expect(masterChanges([p("A"), p("A")], [p("A")])).toEqual({ added: [], removed: [p("A")] });
  });
});
