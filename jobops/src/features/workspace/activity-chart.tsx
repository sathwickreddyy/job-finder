"use client";
import { useState } from "react";
import type { WorkspaceData } from "./read";
export function ActivityChart({ data }: { data: WorkspaceData }) {
  const [metric, setMetric] = useState("saved");
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(data.today));
  const end = new Date(`${date}T00:00:00+05:30`).valueOf() + 86400000;
  const display = new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
  });
  const dates =
    metric === "saved"
      ? data.openings.map((job) => job.createdAt)
      : data.applications.flatMap((app) => (app.appliedAt ? [app.appliedAt] : []));
  const series = Array.from({ length: 4 }, (_, index) => {
    const start = end - (4 - index) * 7 * 86400000;
    return {
      label: display.format(start),
      value: dates.filter(
        (value) =>
          new Date(value).valueOf() >= start && new Date(value).valueOf() < start + 7 * 86400000,
      ).length,
    };
  });
  const max = Math.max(1, ...series.map((item) => item.value));
  const title = metric === "saved" ? "Saved openings" : "Applications sent";
  return (
    <div className="rounded-card border border-border bg-card p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Activity over 4 weeks</h3>
          <p className="mt-1 text-xs text-muted-foreground">Week starting · India time</p>
        </div>
        <select
          aria-label="Activity to display"
          className="!w-auto !bg-card"
          value={metric}
          onChange={(event) => setMetric(event.target.value)}
        >
          <option value="saved">Saved openings</option>
          <option value="applied">Applications sent</option>
        </select>
      </div>
      <figure>
        <svg
          viewBox="0 0 480 180"
          className="w-full text-primary"
          role="img"
          aria-label={`${title} per week: ${series.map((item) => `${item.label}: ${item.value}`).join(", ")}`}
        >
          {[35, 90, 145].map((y) => (
            <line
              key={y}
              x1="20"
              x2="465"
              y1={y}
              y2={y}
              className="stroke-border"
              strokeDasharray="3 5"
            />
          ))}
          {series.map((item, index) => (
            <g key={item.label}>
              <rect
                x={42 + index * 120}
                y={145 - (item.value / max) * 110}
                width="36"
                height={(item.value / max) * 110}
                rx="5"
                fill="currentColor"
              />
              <text
                x={60 + index * 120}
                y={Math.max(20, 131 - (item.value / max) * 110)}
                textAnchor="middle"
                className="fill-foreground text-[13px]"
              >
                {item.value}
              </text>
              <text
                x={60 + index * 120}
                y="170"
                textAnchor="middle"
                className="fill-muted-foreground text-[12px]"
              >
                {item.label}
              </text>
            </g>
          ))}
        </svg>
        <figcaption className="mt-3 text-sm text-muted-foreground">
          {series.every((item) => !item.value)
            ? "No recorded activity yet. Your graph will fill as you save and apply."
            : "Based on your recorded activity in JobOps."}
        </figcaption>
      </figure>
    </div>
  );
}
