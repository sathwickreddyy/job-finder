import type { ApiCall } from "@/services/mail/providers/usage";

/** Consecutive identical requests as one log row, such as 25 message reads. */
export type CallGroup = {
  at: string;
  label: string;
  request: string;
  count: number;
  units: number;
  /** "200", or "200 ×24 · 404" when they differed. */
  statuses: string;
  /** From the first request's start to the last one's end. */
  ms: number;
  reason?: string;
  waitedMs?: number;
};

export function groupCalls(calls: ApiCall[]): CallGroup[] {
  const groups: (CallGroup & { codes: Map<number, number>; end: number })[] = [];
  for (const call of calls) {
    const start = Date.parse(call.at);
    const last = groups.at(-1);
    if (
      last &&
      !last.reason &&
      !call.reason &&
      last.label === call.label &&
      last.request === call.request
    ) {
      last.count++;
      last.units += call.units;
      last.codes.set(call.status, (last.codes.get(call.status) ?? 0) + 1);
      last.end = Math.max(last.end, start + call.ms);
      continue;
    }
    groups.push({
      at: call.at,
      label: call.label,
      request: call.request,
      count: 1,
      units: call.units,
      statuses: "",
      ms: 0,
      ...(call.reason ? { reason: call.reason } : {}),
      ...(call.waitedMs !== undefined ? { waitedMs: call.waitedMs } : {}),
      codes: new Map([[call.status, 1]]),
      end: start + call.ms,
    });
  }
  return groups.map(({ codes, end, ...group }) => ({
    ...group,
    statuses: [...codes]
      .map(
        ([code, count]) =>
          `${code || "No response"}${count > 1 && codes.size > 1 ? ` ×${count}` : ""}`,
      )
      .join(" · "),
    ms: end - Date.parse(group.at),
  }));
}

/** "850 ms", "4.2 s", "1 min 5 s". */
export function duration(ms: number) {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`;
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)} min${seconds % 60 ? ` ${seconds % 60} s` : ""}`;
}
