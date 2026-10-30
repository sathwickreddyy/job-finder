/** Inert text only; never render provider HTML or load images/attachments. */
export function plainText(html: string): string {
  return html
    .replace(/<(script|style|head)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<(?:br|\/p|\/div|\/tr|\/li)\b[^>]*>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(
      /&(?:nbsp|amp|lt|gt|quot|apos);/g,
      (value) =>
        ({ "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" })[
          value
        ] ?? value,
    )
    .replace(/&#(x[\da-f]+|\d+);/gi, (_, value: string) => {
      const point = value.toLowerCase().startsWith("x")
        ? parseInt(value.slice(1), 16)
        : Number(value);
      return point >= 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "";
    })
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n/g, "\n\n")
    .trim();
}

export function currentMessageText(text: string) {
  return text
    .split(/\n(?:On .{0,200}wrote:|From: |_{5,}|-{2,}\s*Original Message|>)/i)[0]
    .slice(0, 30000);
}
