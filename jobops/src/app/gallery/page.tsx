"use client";

import { useState } from "react";

const sections = ["Today", "Jobs", "Applications", "Resumes", "Missions"];
const tasks = [
  { title: "Review shortlisted roles", detail: "Choose the next role to prepare", count: 4 },
  {
    title: "Review application preparation",
    detail: "An operator is waiting for your approval",
    count: 2,
  },
  {
    title: "Inspect portal profiles",
    detail: "Record what changed since your last visit",
    count: 1,
  },
];

export default function GalleryPage() {
  const [nav, setNav] = useState("Today");
  const [nav2, setNav2] = useState("Jobs");
  const [selected, setSelected] = useState(0);
  const [tab, setTab] = useState("Needs review");
  const [step, setStep] = useState(1);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);
  return (
    <>
      <div className="page-header">
        <div>
          <h1>Workspace component gallery</h1>
          <p>
            Live alternatives for a focused daily career workbench. Hover, click, type, and use the
            keyboard.
          </p>
        </div>
        <span className="badge badge-blue">Compact workbench selected</span>
      </div>
      <div className="stack">
        <section>
          <h2>Navigation</h2>
          <div className="grid-2">
            <div className="gallery-choice">
              <div className="gallery-option-name">
                <span>Compact sidebar</span>
                <span className="badge badge-teal">Default</span>
              </div>
              <div className="gallery-nav">
                {sections.map((name) => (
                  <button key={name} aria-pressed={nav === name} onClick={() => setNav(name)}>
                    {name}
                    {name === "Missions" && (
                      <span className="badge" style={{ marginLeft: 20 }}>
                        3
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <p className="cell-subtitle">Current section: {nav}</p>
            </div>
            <div className="gallery-choice">
              <div className="gallery-option-name">Horizontal workspace switcher</div>
              <div className="tabs">
                {sections.map((name) => (
                  <button
                    key={name}
                    className={`tab ${nav2 === name ? "active" : ""}`}
                    onClick={() => setNav2(name)}
                    aria-pressed={nav2 === name}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <h3>{nav2}</h3>
              <p className="muted">A wider canvas for one section at a time.</p>
            </div>
          </div>
        </section>
        <section>
          <h2>Daily review queues</h2>
          <div className="grid-2">
            <div className="gallery-choice">
              <div className="gallery-option-name">
                <span>Compact queue rows</span>
                <span className="badge badge-teal">Default</span>
              </div>
              {tasks.map((task, index) => (
                <div className="queue-row" key={task.title}>
                  <div>
                    <p className="cell-title">{task.title}</p>
                    <p className="cell-subtitle">{task.detail}</p>
                  </div>
                  <button
                    className="queue-count"
                    style={{ color: "var(--foreground)", border: "1px solid var(--border)" }}
                    onClick={() => setSelected(index)}
                    aria-label={`Review ${task.title}`}
                  >
                    {task.count}
                  </button>
                </div>
              ))}
              <p className="cell-subtitle" aria-live="polite">
                Selected: {tasks[selected].title}
              </p>
            </div>
            <div className="gallery-choice">
              <div className="gallery-option-name">Priority cards</div>
              <div className="stack-sm">
                {tasks.slice(0, 2).map((task, index) => (
                  <button
                    key={task.title}
                    className="panel"
                    style={{
                      marginTop: 0,
                      textAlign: "left",
                      borderColor: selected === index ? "var(--primary)" : "var(--border)",
                    }}
                    onClick={() => setSelected(index)}
                  >
                    <div
                      className="actions"
                      style={{ justifyContent: "space-between", marginBottom: 8 }}
                    >
                      <span className="badge badge-amber">Needs review</span>
                      <span className="stat">{task.count}</span>
                    </div>
                    <strong>{task.title}</strong>
                    <p className="cell-subtitle">{task.detail}</p>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section>
          <h2>States and progress</h2>
          <div className="grid-2">
            <div className="gallery-choice">
              <div className="gallery-option-name">
                <span>Review tabs and status labels</span>
                <span className="badge badge-teal">Default</span>
              </div>
              <div className="tabs">
                {["Needs review", "In progress", "Complete"].map((name) => (
                  <button
                    key={name}
                    className={`tab ${tab === name ? "active" : ""}`}
                    onClick={() => setTab(name)}
                    aria-pressed={tab === name}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <span
                className={`badge ${tab === "Complete" ? "badge-teal" : tab === "Needs review" ? "badge-amber" : "badge-blue"}`}
              >
                {tab}
              </span>
              <p className="muted">Visible labels carry the meaning alongside color.</p>
            </div>
            <div className="gallery-choice">
              <div className="gallery-option-name">Mission step sequence</div>
              <div className="stack-sm">
                {["Inspect the job", "Prepare application", "Wait for your approval"].map(
                  (name, index) => (
                    <button
                      key={name}
                      className="button-secondary"
                      style={{
                        justifyContent: "flex-start",
                        borderColor: step === index ? "var(--primary)" : "var(--border)",
                      }}
                      onClick={() => setStep(index)}
                    >
                      <span
                        className={`badge ${index < step ? "badge-teal" : index === step ? "badge-blue" : ""}`}
                      >
                        {index < step ? "✓" : index + 1}
                      </span>
                      {name}
                    </button>
                  ),
                )}
              </div>
            </div>
          </div>
        </section>
        <section>
          <h2>Filters and structured input</h2>
          <div className="grid-2">
            <div className="gallery-choice">
              <div className="gallery-option-name">
                <span>Inline filtering</span>
                <span className="badge badge-teal">Default</span>
              </div>
              <label className="field">
                Find roles
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Company, role, or skill"
                />
              </label>
              <div className="actions" style={{ marginTop: 14 }}>
                {["All", "Shortlisted", "Preparing"].map((name) => (
                  <button
                    className={`button-${tab === name ? "secondary" : "quiet"}`}
                    key={name}
                    onClick={() => setTab(name)}
                    aria-pressed={tab === name}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <p className="cell-subtitle" aria-live="polite">
                {query ? `Searching for “${query}”` : "Search is ready"}
              </p>
            </div>
            <div className="gallery-choice">
              <div className="gallery-option-name">Focused edit panel</div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  setSaved(true);
                }}
                className="stack-sm"
              >
                <label className="field">
                  Standard answer
                  <select onChange={() => setSaved(false)}>
                    <option>UNKNOWN — ask me</option>
                    <option>Yes</option>
                    <option>No</option>
                  </select>
                  <span className="field-hint">
                    Unknown is an intentional value, never an inferred answer.
                  </span>
                </label>
                <label className="field">
                  Notes
                  <textarea placeholder="Record evidence or context" rows={2} />
                </label>
                <div className="actions">
                  <button className="button" type="submit">
                    Save answer
                  </button>
                  {saved && (
                    <span className="badge badge-teal" role="status">
                      Saved in this demo
                    </span>
                  )}
                </div>
              </form>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
