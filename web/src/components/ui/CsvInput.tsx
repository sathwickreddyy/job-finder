import { useEffect, useState } from "react";
import { Input } from "./Input";

/**
 * An Input that edits a list-of-strings as a comma-separated string.
 *
 * Stores the raw typed string locally; only parses and forwards to the
 * parent on blur or Enter. That way typing "Senior Software Engineer,
 * Backend" doesn't collapse the first comma mid-word on every keystroke.
 *
 * When the external value prop changes (e.g. data re-fetched from the
 * server, user switches rows), the local draft re-syncs.
 */
export function CsvInput({
  value,
  onCommit,
  placeholder,
  disabled,
}: {
  value: string[];
  onCommit: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const serialized = (value ?? []).join(", ");
  const [draft, setDraft] = useState(serialized);

  // Re-sync on external value changes (fetch refresh, row switch).
  useEffect(() => {
    setDraft(serialized);
  }, [serialized]);

  function commit() {
    const parsed = draft
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (JSON.stringify(parsed) !== JSON.stringify(value ?? [])) {
      onCommit(parsed);
    }
  }

  return (
    <Input
      value={draft}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
        }
      }}
    />
  );
}
