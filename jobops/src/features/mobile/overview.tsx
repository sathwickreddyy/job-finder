import Link from "next/link";
import { ArrowUpRight, ChevronRight, Mail } from "lucide-react";
import type { MobileAnalytics } from "./analytics";
import { AnalyticsView } from "./analytics-view";
import { AttentionFeed } from "./attention-feed";
import type { AttentionMail } from "./read";

export function MobileOverview({
  analytics,
  attention,
}: {
  analytics: MobileAnalytics;
  attention: AttentionMail;
}) {
  return (
    <div className="space-y-6 md:hidden" data-testid="mobile-overview">
      <header>
        <p className="m-0 text-xs text-muted-foreground">
          {new Intl.DateTimeFormat("en-IN", {
            weekday: "long",
            day: "numeric",
            month: "long",
            timeZone: "Asia/Kolkata",
          }).format(new Date(analytics.today))}
        </p>
        <h1 className="m-0 mt-1 text-[28px] font-semibold leading-tight tracking-tight">
          Your search, today
        </h1>
      </header>
      <Link
        href="/mail"
        className="flex min-h-16 items-center gap-3 rounded-2xl bg-selected px-4 py-3 text-selected-foreground hover:bg-muted hover:no-underline"
      >
        <Mail size={21} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">
            {attention.openCount
              ? `${attention.openCount} ${attention.openCount === 1 ? "email needs" : "emails need"} you`
              : "You’re all caught up"}
          </span>
          <span className="block text-xs opacity-80">
            {attention.openCount ? "Open your attention queue" : "No mail needs your attention"}
          </span>
        </span>
        <ChevronRight size={18} aria-hidden />
      </Link>
      <AnalyticsView data={analytics} />
      <section aria-labelledby="mobile-attention-title">
        <h2 id="mobile-attention-title" className="m-0 mb-4 text-base font-semibold">
          Needs your attention{" "}
          <span className="ml-1 text-muted-foreground">{attention.openCount}</span>
        </h2>
        <AttentionFeed data={attention} compact />
        {attention.openCount > 2 && (
          <Link
            href="/mail"
            className="mt-3 inline-flex min-h-11 items-center rounded-full px-3 text-sm font-medium text-link"
          >
            View all attention mail
            <ChevronRight size={16} aria-hidden />
          </Link>
        )}
      </section>
      <Link
        href="/applications"
        className="flex min-h-12 items-center justify-center gap-2 rounded-full bg-secondary px-4 text-sm font-medium text-secondary-foreground hover:bg-muted hover:no-underline"
      >
        View applications
        <ArrowUpRight size={16} aria-hidden />
      </Link>
    </div>
  );
}
