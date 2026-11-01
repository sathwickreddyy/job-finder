import { AsyncLocalStorage } from "node:async_hooks";
import type { ProviderId } from "./types";

/** One request JobOps sent to a mail provider, as the fetch dialog shows it. */
export type ApiCall = {
  at: string;
  label: string;
  /** Method and path with the exact query; message ids and paging cursors are elided. */
  request: string;
  /** Gmail quota units, or one per Microsoft Graph request. */
  units: number;
  /** 0 when the request never got a response. */
  status: number;
  ms: number;
  /** Why the provider refused, such as "rateLimitExceeded: too many requests at once". */
  reason?: string;
  /** How long JobOps waited before sending it again. */
  waitedMs?: number;
};
export type Cooldown = { until: string; reason: string };
/** Per inbox in settings: today's totals and ten-second buckets for the provider's window. */
export type StoredUsage = {
  day: string;
  units: number;
  calls: number;
  rateLimited: number;
  buckets: Record<string, number>;
  cooldown?: Cooldown;
  /** The gap JobOps keeps between requests since the provider last refused one. */
  spacingMs?: number;
};
export type UsageSummary = {
  unit: string;
  limit: number;
  window: string;
  /** Units counted inside the provider's window, ending now. */
  recent: number;
  today: number;
  callsToday: number;
  rateLimitedToday: number;
  cooldown: Cooldown | null;
  spacingMs: number;
};
export type Refusal = { reason: string; retryAt?: number; daily?: boolean };

/**
 * Gmail: 15,000 quota units per user per minute, list and read 5 units each. Graph: 10,000
 * requests per mailbox per 10 minutes. Both are the providers' published per-user limits.
 */
export const providerLimits: Record<
  ProviderId,
  { label: string; unit: string; limit: number; windowMs: number; window: string }
> = {
  GMAIL: { label: "Gmail", unit: "quota units", limit: 15_000, windowMs: 60_000, window: "minute" },
  OUTLOOK: {
    label: "Outlook",
    unit: "requests",
    limit: 10_000,
    windowMs: 600_000,
    window: "10 minutes",
  },
};
export const usageKey = (connectionId: string) => `mailUsage:${connectionId}`;
const backoff = [2_000, 5_000, 10_000];
/** A wait longer than this pauses the inbox instead of holding the step open. */
const longestWait = 20_000;
const stepWaitBudget = 30_000;
const defaultPause = 2 * 60_000;
const dailyPause = 60 * 60_000;
/** A refusal doubles the gap between requests (from 250 ms up to 2 s); 25 answered in a row shrink it. */
const slowest = 2_000;
const recoverAfter = 25;
/** Tests replace `sleep` so retries don't wait in real time. */
export const pacing = {
  sleep: (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
};

const indiaDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" });
const indiaTime = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "Asia/Kolkata",
});
const bucketOf = (at: string) => `${at.slice(0, 18)}0`;

export class RateLimitError extends Error {
  constructor(
    readonly provider: ProviderId,
    readonly cooldown: Cooldown,
  ) {
    super(
      `${providerLimits[provider].label} rate limit reached (${cooldown.reason}). Paused until ${indiaTime.format(new Date(cooldown.until))}; fetch again after that to continue where it stopped.`,
    );
  }
}

type Meter = {
  provider: ProviderId;
  stored: StoredUsage | undefined;
  calls: ApiCall[];
  cooldown?: Cooldown;
  waitedMs: number;
  spacingMs: number;
  nextSlot: number;
  answered: number;
};
const meters = new AsyncLocalStorage<Meter>();

/** Meter every provider request `work` makes; the connection lock wraps each inbox's work in one. */
export function metered<T>(
  provider: ProviderId,
  stored: StoredUsage | undefined,
  work: () => Promise<T>,
) {
  return meters.run(
    {
      provider,
      stored,
      calls: [],
      waitedMs: 0,
      spacingMs: stored?.spacingMs ?? 0,
      nextSlot: 0,
      answered: 0,
    },
    work,
  );
}

/** Requests made so far under the current meter. */
export const meteredCalls = (): ApiCall[] => [...(meters.getStore()?.calls ?? [])];

/** The pause in force for the current inbox, if any. */
export function activeCooldown(now = Date.now()): Cooldown | undefined {
  const meter = meters.getStore();
  const cooldown = meter?.cooldown ?? meter?.stored?.cooldown;
  return cooldown && Date.parse(cooldown.until) > now ? cooldown : undefined;
}

/** Stored usage with `calls` added; buckets older than the longest provider window drop off. */
export function foldUsage(
  stored: StoredUsage | undefined,
  calls: ApiCall[],
  cooldown: Cooldown | undefined,
  now: Date,
  spacingMs = stored?.spacingMs ?? 0,
): StoredUsage {
  const day = indiaDay.format(now);
  const today = stored?.day === day ? stored : undefined;
  const buckets = { ...stored?.buckets };
  for (const call of calls)
    buckets[bucketOf(call.at)] = (buckets[bucketOf(call.at)] ?? 0) + call.units;
  const oldest =
    now.getTime() - Math.max(...Object.values(providerLimits).map((row) => row.windowMs));
  for (const key of Object.keys(buckets))
    if (Date.parse(`${key}Z`) < oldest - 10_000) delete buckets[key];
  const current = cooldown ?? stored?.cooldown;
  return {
    day,
    units: (today?.units ?? 0) + calls.reduce((sum, call) => sum + call.units, 0),
    calls: (today?.calls ?? 0) + calls.length,
    rateLimited: (today?.rateLimited ?? 0) + calls.filter((call) => call.reason).length,
    buckets,
    ...(current && Date.parse(current.until) > now.getTime() ? { cooldown: current } : {}),
    ...(spacingMs ? { spacingMs } : {}),
  };
}

export function summarize(
  provider: ProviderId,
  usage: StoredUsage | undefined,
  now: Date,
): UsageSummary {
  const limits = providerLimits[provider];
  const today = usage?.day === indiaDay.format(now) ? usage : undefined;
  const from = now.getTime() - limits.windowMs;
  return {
    unit: limits.unit,
    limit: limits.limit,
    window: limits.window,
    recent: Object.entries(usage?.buckets ?? {})
      .filter(([key]) => Date.parse(`${key}Z`) + 10_000 > from)
      .reduce((sum, [, units]) => sum + units, 0),
    today: today?.units ?? 0,
    callsToday: today?.calls ?? 0,
    rateLimitedToday: today?.rateLimited ?? 0,
    cooldown:
      usage?.cooldown && Date.parse(usage.cooldown.until) > now.getTime() ? usage.cooldown : null,
    spacingMs: usage?.spacingMs ?? 0,
  };
}

/** The current inbox's usage including this step's requests. */
export function meteredSummary(now = new Date()): UsageSummary | null {
  const meter = meters.getStore();
  return meter
    ? summarize(
        meter.provider,
        foldUsage(meter.stored, meter.calls, meter.cooldown, now, meter.spacingMs),
        now,
      )
    : null;
}

/** What to store after the work, or null when nothing was sent and no pause began. */
export function pendingUsage(now = new Date()): StoredUsage | null {
  const meter = meters.getStore();
  if (!meter || (!meter.calls.length && !meter.cooldown)) return null;
  return foldUsage(meter.stored, meter.calls, meter.cooldown, now, meter.spacingMs);
}

function retryAfter(header: string | null, now: number) {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return now + Math.max(0, seconds) * 1000;
  const at = Date.parse(header);
  return Number.isFinite(at) ? at : undefined;
}

/** Hold a request until its turn when the inbox is being paced; parallel reads queue up. */
async function takeTurn(meter: Meter | undefined) {
  if (!meter?.spacingMs) return;
  const now = Date.now();
  const turn = Math.max(now, meter.nextSlot);
  meter.nextSlot = turn + meter.spacingMs;
  if (turn > now) await pacing.sleep(turn - now);
}

/** A request outside retries, such as renewing access, still shows in the log. */
export async function timedFetch(
  url: string,
  init: RequestInit,
  call: Pick<ApiCall, "label" | "request" | "units">,
) {
  const started = Date.now();
  const record = (status: number) =>
    meters.getStore()?.calls.push({
      ...call,
      at: new Date(started).toISOString(),
      status,
      ms: Date.now() - started,
    });
  try {
    const response = await fetch(url, init);
    record(response.status);
    return response;
  } catch (error) {
    record(0);
    throw error;
  }
}

/**
 * Send a provider request, retrying a rate limit up to three times after the provider's
 * Retry-After (or 2, 5 and 10 seconds). A longer wait pauses the inbox: until then, every
 * request for it fails at once without reaching the provider.
 */
export async function meteredFetch(
  provider: ProviderId,
  url: string,
  init: RequestInit,
  call: Pick<ApiCall, "label" | "request" | "units">,
  refusalOf: (response: Response) => Promise<Refusal | null>,
): Promise<Response> {
  const meter = meters.getStore();
  for (let attempt = 0; ; attempt++) {
    const paused = activeCooldown();
    if (paused) throw new RateLimitError(provider, paused);
    // A retry has already waited; a first attempt takes its turn in the pace.
    if (attempt === 0) await takeTurn(meter);
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      meter?.calls.push({ ...call, at: new Date(started).toISOString(), status: 0, ms: 0 });
      throw error;
    }
    const record: ApiCall = {
      ...call,
      at: new Date(started).toISOString(),
      status: response.status,
      ms: Date.now() - started,
    };
    const refusal = response.ok ? null : await refusalOf(response.clone());
    if (!refusal) {
      meter?.calls.push(record);
      if (meter?.spacingMs && ++meter.answered >= recoverAfter) {
        meter.answered = 0;
        meter.spacingMs = meter.spacingMs < 200 ? 0 : Math.round(meter.spacingMs * 0.75);
      }
      return response;
    }
    if (meter) {
      meter.answered = 0;
      meter.spacingMs = Math.min(slowest, Math.max(250, meter.spacingMs * 2));
      meter.nextSlot = Date.now() + meter.spacingMs;
    }
    const now = Date.now();
    const retryAt = retryAfter(response.headers.get("retry-after"), now) ?? refusal.retryAt;
    const wait = retryAt !== undefined ? Math.max(0, retryAt - now) : (backoff[attempt] ?? 0);
    const waited = meter?.waitedMs ?? 0;
    if (
      !refusal.daily &&
      attempt < backoff.length &&
      wait <= longestWait &&
      waited + wait <= stepWaitBudget
    ) {
      meter?.calls.push({ ...record, reason: refusal.reason, waitedMs: wait });
      if (meter) meter.waitedMs += wait;
      await pacing.sleep(wait);
      continue;
    }
    const cooldown: Cooldown = {
      until: new Date(
        retryAt !== undefined && retryAt > now
          ? retryAt
          : now + (refusal.daily ? dailyPause : defaultPause),
      ).toISOString(),
      reason: refusal.reason,
    };
    if (meter) meter.cooldown = cooldown;
    meter?.calls.push({ ...record, reason: refusal.reason });
    throw new RateLimitError(provider, cooldown);
  }
}
