import { strFromU8, unzipSync } from "fflate";
import { XMLParser, XMLValidator } from "fast-xml-parser";

export type MasterBlock = { kind: "heading" | "paragraph" | "bullet"; text: string };
type XmlNode = Record<string, unknown>;
const local = (name: string) => name.split(":").at(-1)!;
const children = (value: unknown): XmlNode[] => (Array.isArray(value) ? value : []);

/** Read only bounded document XML; never expand external entities or render DOCX HTML. */
export function readMasterDocx(bytes: Buffer, filename: string): MasterBlock[] {
  if (!/\.docx$/i.test(filename) || !bytes.length || bytes.length > 10 * 1024 * 1024)
    throw new Error("Choose a nonempty DOCX file up to 10 MiB.");
  let xml: string;
  try {
    const files = unzipSync(bytes, {
      filter: (file) => {
        if (
          (file.name === "word/document.xml" && file.originalSize > 2_000_000) ||
          (file.name === "[Content_Types].xml" && file.originalSize > 65_536)
        )
          throw new Error("DOCX document text is too large.");
        return file.name === "word/document.xml" || file.name === "[Content_Types].xml";
      },
    });
    if (!files["word/document.xml"] || !files["[Content_Types].xml"])
      throw new Error("Choose a valid DOCX document.");
    if (
      !strFromU8(files["[Content_Types].xml"]).includes(
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml",
      )
    )
      throw new Error("Choose a valid DOCX document.");
    xml = strFromU8(files["word/document.xml"]);
    if (xml.length > 2_000_000) throw new Error("DOCX document text is too large.");
  } catch (error) {
    if (error instanceof Error && /large|valid DOCX/.test(error.message)) throw error;
    throw new Error("This DOCX is damaged or encrypted. Save an ordinary DOCX and retry.");
  }
  let nodes: XmlNode[];
  try {
    if (/<!\s*(?:DOCTYPE|ENTITY)/i.test(xml) || XMLValidator.validate(xml) !== true)
      throw new Error("Invalid XML");
    nodes = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: true,
      trimValues: false,
      parseTagValue: false,
    }).parse(xml);
  } catch {
    throw new Error("DOCX document structure is too complex or contains invalid XML.");
  }
  // Bound every descendant, including the run/property trees inside paragraphs.
  const pending = nodes.map((node) => ({ node, depth: 0 }));
  let total = 0;
  while (pending.length) {
    const { node, depth } = pending.pop()!;
    if (depth > 100 || ++total > 100_000) throw new Error("DOCX document structure is too large.");
    for (const value of Object.values(node))
      for (const child of children(value)) pending.push({ node: child, depth: depth + 1 });
  }
  let count = 0;
  const visible = (nodes: XmlNode[]): string =>
    nodes
      .map((node) =>
        Object.entries(node)
          .map(([tag, value]) => {
            const name = local(tag);
            if (name === "del" || name === "delText" || name === "instrText") return "";
            if (name === "t")
              return children(value)
                .map((n) => String(n["#text"] ?? ""))
                .join("");
            if (name === "#text") return "";
            if (name === "tab") return "\t";
            if (name === "br" || name === "cr") return "\n";
            return visible(children(value));
          })
          .join(""),
      )
      .join("");
  const has = (nodes: XmlNode[], name: string): boolean =>
    nodes.some((n) =>
      Object.entries(n).some(([k, v]) => local(k) === name || has(children(v), name)),
    );
  const blocks: MasterBlock[] = [];
  const walk = (nodes: XmlNode[], depth = 0) => {
    if (depth > 100 || ++count > 100_000) throw new Error("DOCX document structure is too large.");
    for (const node of nodes)
      for (const [tag, value] of Object.entries(node)) {
        const name = local(tag);
        if (name === "del") continue;
        if (name === "p") {
          const content = children(value);
          const text = visible(content).trim();
          if (text)
            blocks.push({
              text,
              kind: has(content, "numPr")
                ? "bullet"
                : /^[A-Z][A-Z &/\-]{3,79}$/.test(text)
                  ? "heading"
                  : "paragraph",
            });
        } else walk(children(value), depth + 1);
      }
  };
  walk(nodes);
  if (!blocks.length) throw new Error("The DOCX has no readable document text.");
  return blocks;
}

/** Compare paragraph content as a multiset, so moving a paragraph is not a deletion. */
export function masterChanges(before: MasterBlock[], after: MasterBlock[]) {
  const difference = (a: MasterBlock[], b: MasterBlock[]) => {
    const counts = new Map<string, number>();
    b.forEach((block) => counts.set(block.text, (counts.get(block.text) ?? 0) + 1));
    return a.filter((block) => {
      const remaining = counts.get(block.text) ?? 0;
      if (remaining) {
        counts.set(block.text, remaining - 1);
        return false;
      }
      return true;
    });
  };
  return { added: difference(after, before), removed: difference(before, after) };
}
