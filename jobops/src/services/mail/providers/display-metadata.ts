/** Provider display metadata matches the importer limit without discarding valid mail. */
export function recipientPreview(value: string) {
  return value.length > 1000 ? `${value.slice(0, 999)}…` : value;
}
