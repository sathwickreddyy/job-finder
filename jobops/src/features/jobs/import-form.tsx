"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { Button, Field, Panel } from "@/components/ui";
import { previewJobs, commitJobs, type ImportState } from "./actions";
const example = JSON.stringify(
  [
    {
      company: "Example Labs",
      title: "Senior Backend Engineer",
      location: "Bengaluru",
      url: "https://example.com/careers/backend",
      source: "COMPANY_CAREERS",
      postedAt: "2026-09-30",
      experienceMin: 4,
      experienceMax: 7,
      description: "Build Python services with PostgreSQL and Kafka.",
      notes: "",
    },
  ],
  null,
  2,
);
export function ImportForm() {
  const [text, setText] = useState("");
  const [format, setFormat] = useState("json");
  const [preview, validate, pending] = useActionState<ImportState, FormData>(previewJobs, {});
  const [result, commit, saving] = useActionState<ImportState, FormData>(commitJobs, {});
  const [validatedText, setValidatedText] = useState("");
  const valid = preview.preview?.valid && validatedText === text + format;
  return (
    <div className="stack">
      <Panel>
        <form
          action={validate}
          onSubmit={() => setValidatedText(text + format)}
          className="space-y-4"
        >
          <Field label="Import format" name="format">
            <select
              id="format"
              name="format"
              value={format}
              onChange={(e) => setFormat(e.target.value)}
            >
              <option value="json">JSON array</option>
              <option value="csv">CSV with headers</option>
            </select>
          </Field>
          <Field
            label="Job records"
            name="records"
            hint="Maximum 500 rows / 2 MB. JSON is recommended for computer-use operators."
          >
            <textarea
              id="records"
              name="records"
              rows={14}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
              spellCheck={false}
              placeholder={example}
            />
          </Field>
          {preview.error && (
            <p role="alert" className="error">
              {preview.error}
            </p>
          )}
          <div className="actions">
            <Button disabled={pending}>{pending ? "Validating…" : "Validate and preview"}</Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFormat("json");
                setText(example);
              }}
            >
              Use example JSON
            </Button>
          </div>
        </form>
      </Panel>
      {preview.preview && (
        <Panel title="Import preview">
          <p className="mb-4 text-muted-foreground">
            Nothing has been written yet. Review row errors and duplicates before importing.
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Company / role</th>
                  <th>Action</th>
                  <th>Validation</th>
                </tr>
              </thead>
              <tbody>
                {preview.preview.rows.map((r) => (
                  <tr key={r.row}>
                    <td>{r.row}</td>
                    <td>{r.data ? `${r.data.company} — ${r.data.title}` : "Invalid record"}</td>
                    <td>
                      {r.existingId ? (
                        <Link href={`/jobs/${r.existingId}`}>Existing job</Link>
                      ) : r.duplicateOf ? (
                        `Duplicate of row ${r.duplicateOf}`
                      ) : (
                        "New job"
                      )}
                    </td>
                    <td>
                      {r.errors.length ? (
                        <span className="text-red-400">{r.errors.join("; ")}</span>
                      ) : (
                        "Valid"
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <form action={commit} className="mt-5 space-y-4">
            <input type="hidden" name="records" value={text} />
            <input type="hidden" name="format" value={format} />
            <Field label="Duplicate strategy" name="strategy">
              <select id="strategy" name="strategy">
                <option value="skip">Skip existing and duplicate jobs</option>
                <option value="merge">Merge metadata and preserve new description snapshots</option>
              </select>
            </Field>
            {!valid && (
              <p className="text-amber-400">
                Correct errors or revalidate edited records before importing.
              </p>
            )}
            <Button disabled={!valid || saving}>
              {saving ? "Importing…" : "Import validated jobs"}
            </Button>
          </form>
        </Panel>
      )}
      {result.error && (
        <p role="alert" className="error">
          {result.error}
        </p>
      )}
      {result.summary && (
        <Panel title="Import complete">
          <p role="status">{result.success}</p>
          <Link className="button mt-4" href="/jobs">
            Review jobs
          </Link>
        </Panel>
      )}
      <details>
        <summary>JSON schema and CSV headers</summary>
        <pre>{example}</pre>
        <p className="mt-3 text-muted-foreground">
          CSV headers:
          company,title,location,url,source,postedAt,experienceMin,experienceMax,description,notes.
          Put commas and line breaks inside quoted fields.
        </p>
      </details>
    </div>
  );
}
