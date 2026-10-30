"use client";

import { useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui";
import { cn } from "@/lib/utils";
import { AsideCompany, FocusedCompany, TabsCompany } from "./company";
import { companies, type MailEntry } from "./data";
import { ChipRowOption, DockedOption, SuggestedOption } from "./handling";
import { Segmented } from "./primitives";
import { CompactRail, MixRail, TwoLineRail } from "./rail";
import { DotTags, MixTags, PillTags } from "./tags";
import { LedgerTimeline, SpineTimeline, ThreadTimeline } from "./timelines";

const styles = `
@keyframes tl-pop { from { opacity: 0; transform: translateY(3px); } }
@keyframes tl-ping { 0% { transform: scale(1); opacity: .55; } 100% { transform: scale(2.6); opacity: 0; } }
@keyframes tl-sheet { from { transform: translateX(24px); opacity: 0; } }
.tl-pop { animation: tl-pop 200ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
.tl-ping { animation: tl-ping 1.4s cubic-bezier(0.2, 0, 0, 1) 3 both; }
.tl-sheet { animation: tl-sheet 260ms cubic-bezier(0.05, 0.7, 0.1, 1) both; }
@media (prefers-reduced-motion: reduce) { .tl-pop, .tl-ping, .tl-sheet { animation: none; } .tl-ping { opacity: 0; } }
`;

const company = (key: string) => companies.find((item) => item.key === key)!;
const openMail = (key: string, id: string) =>
  company(key).entries.find((entry): entry is MailEntry => entry.id === id)!;

const companySamples = [
  { value: "northstar", label: "Northstar, two roles" },
  { value: "tessellate", label: "Tessellate, offer" },
  { value: "lumen", label: "Lumen, waiting" },
];
const mailSamples = [
  { value: "northstar:n-5", label: "Interview request" },
  { value: "tessellate:t-6", label: "Offer letter" },
  { value: "orbit:o-4", label: "OA reminder" },
];

type Option = { letter: string; name: string; note: string; render: (sample: string) => ReactNode };
type Section = {
  id: string;
  title: string;
  description: string;
  samples?: { value: string; label: string }[];
  /** Options render at the width they will have in the product. */
  width?: string;
  options: Option[];
};
const mailSample = (sample: string) => {
  const [key, id] = sample.split(":");
  return openMail(key, id);
};

const sections: Section[] = [
  {
    id: "timeline",
    title: "The company timeline",
    description:
      "One component for Mail and the company page. It interleaves what you did with every email from that company, whatever the role. Open emails, try the role chips and record an outcome.",
    samples: companySamples,
    width: "max-w-3xl",
    options: [
      {
        letter: "A",
        name: "Spine, oldest first",
        note: "Dates in a left gutter and a line through every step, so the company reads as one story. New mail glows on the line and opens with its chips.",
        render: (sample) => <SpineTimeline company={company(sample)} />,
      },
      {
        letter: "B",
        name: "Day ledger, newest first",
        note: "Grouped by day with the newest on top, one dense row per entry, like an inbox. Rows open in place; new mail shows its chips without opening.",
        render: (sample) => <LedgerTimeline company={company(sample)} />,
      },
      {
        letter: "C",
        name: "Two-sided thread",
        note: "Your steps on the right, their emails on the left, like a conversation. Ends with how long you have been waiting on them.",
        render: (sample) => <ThreadTimeline company={company(sample)} />,
      },
    ],
  },
  {
    id: "handling",
    title: "Handling a new email",
    description:
      "Outcome chips are decided: the email suggests one, a click records it with the email as its source, and Just info only clears attention. This picks how the chips sit on the email.",
    samples: mailSamples,
    width: "max-w-2xl",
    options: [
      {
        letter: "A",
        name: "Chip row",
        note: "Every outcome as a chip under the email, the suggested one first with its reason. Chips that need a time open a one-line form.",
        render: (sample) => <ChipRowOption mail={mailSample(sample)} />,
      },
      {
        letter: "B",
        name: "One suggested button",
        note: "The suggestion is a single clear button. Other outcomes wait behind Something else, so a routine email takes one click.",
        render: (sample) => <SuggestedOption mail={mailSample(sample)} />,
      },
      {
        letter: "C",
        name: "Docked bar",
        note: "The email scrolls and the chips stay docked at the bottom of the pane, which also suits a phone.",
        render: (sample) => <DockedOption mail={mailSample(sample)} />,
      },
    ],
  },
  {
    id: "tags",
    width: "max-w-3xl",
    title: "Tag colours and filters",
    description:
      "Blue opportunity, yellow application and interview, green offer, red rejected, grey other. This picks how strongly the colour shows and how filtering works.",
    options: [
      {
        letter: "A",
        name: "Dot and words",
        note: "A small dot beside quiet text. Filters combine, so you can show offers and rejections together.",
        render: () => <DotTags />,
      },
      {
        letter: "B",
        name: "Tonal pills",
        note: "The whole label carries the colour, as on the current page. One tag at a time.",
        render: () => <PillTags />,
      },
      {
        letter: "C",
        name: "Mix bar and stripes",
        note: "One bar shows the mix of mail at a glance; press a band to filter. Each email has a coloured edge.",
        render: () => <MixTags />,
      },
    ],
  },
  {
    id: "rail",
    title: "Mail rail",
    description:
      "One row per company in Needs you, Waiting on them, Closed and Needs a home is decided. This picks the row. Search looks through fetched mail; try “assessment” or “Priya”.",
    options: [
      {
        letter: "A",
        name: "Two lines",
        note: "The latest signal under each name, and the due day or quiet days on the right.",
        render: () => <TwoLineRail />,
      },
      {
        letter: "B",
        name: "Compact",
        note: "One line per company with a monogram tinted by its latest email. More companies fit; the selected row shows its signal.",
        render: () => <CompactRail />,
      },
      {
        letter: "C",
        name: "Mail mix",
        note: "Two lines with a small bar of each company's tags, so offers and rejections stand out in the list.",
        render: () => <MixRail />,
      },
    ],
  },
  {
    id: "company",
    title: "Company page",
    description:
      "The company page shows the same timeline. This picks where it sits next to compensation and interview research, which stay as they are today.",
    samples: companySamples,
    options: [
      {
        letter: "A",
        name: "Timeline first, research in tabs",
        note: "Timeline becomes the first tab and replaces Your progress. Compensation, Interviews and About stay as tabs.",
        render: (sample) => <TabsCompany company={company(sample)} />,
      },
      {
        letter: "B",
        name: "Timeline with facts beside it",
        note: "No tabs for the essentials: roles, pay and the interview loop stay in view beside the timeline on a wide screen, and above it on a phone.",
        render: (sample) => <AsideCompany company={company(sample)} />,
      },
      {
        letter: "C",
        name: "Mail's pane on its own",
        note: "The page is exactly Mail's timeline pane for this company. Research opens in a side sheet.",
        render: (sample) => <FocusedCompany company={company(sample)} />,
      },
    ],
  },
];

type Picks = Record<string, string | undefined>;
const PICKS_KEY = "jobops-timeline-picks";
function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(PICKS_KEY, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(PICKS_KEY, callback);
  };
}
function read() {
  try {
    return localStorage.getItem(PICKS_KEY) ?? "{}";
  } catch {
    return "{}";
  }
}
function usePicks() {
  const picks = JSON.parse(useSyncExternalStore(subscribe, read, () => "{}")) as Picks;
  function choose(section: string, letter: string) {
    const next = { ...picks, [section]: picks[section] === letter ? undefined : letter };
    try {
      localStorage.setItem(PICKS_KEY, JSON.stringify(next));
    } catch {
      /* Picks stay until the next render only. */
    }
    window.dispatchEvent(new Event(PICKS_KEY));
  }
  return { picks, choose };
}

function GallerySection({
  section,
  picks,
  choose,
}: {
  section: Section;
  picks: Picks;
  choose: (section: string, letter: string) => void;
}) {
  const [sample, setSample] = useState(section.samples?.[0].value ?? "");
  return (
    <section id={section.id} className="scroll-mt-6 space-y-6">
      <div className="flex max-w-2xl flex-col gap-3">
        <h2 className="m-0 text-2xl font-semibold tracking-tight">{section.title}</h2>
        <p className="m-0 text-muted-foreground">{section.description}</p>
        {section.samples && (
          <Segmented label="Sample" value={sample} options={section.samples} onChange={setSample} />
        )}
      </div>
      {section.options.map((option) => {
        const chosen = picks[section.id] === option.letter;
        return (
          <div
            key={option.letter}
            className={cn(
              "rounded-[2rem] border-2 p-3 transition-[border-color] sm:p-5",
              chosen ? "border-primary" : "border-dashed border-border",
            )}
          >
            <div className="mb-4 flex flex-wrap items-center gap-3 px-1">
              <span className="grid size-8 place-items-center rounded-full bg-secondary text-sm font-semibold">
                {option.letter}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 font-semibold">{option.name}</p>
                <p className="m-0 text-sm text-muted-foreground">{option.note}</p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={chosen ? "default" : "outline"}
                aria-pressed={chosen}
                onClick={() => choose(section.id, option.letter)}
                className="h-9 px-4"
              >
                {chosen && <Check size={15} aria-hidden />}
                {chosen ? "Chosen" : "Choose this"}
              </Button>
            </div>
            <div key={sample} className={section.width}>
              {option.render(sample)}
            </div>
          </div>
        );
      })}
    </section>
  );
}

export function TimelineGallery() {
  const { picks, choose } = usePicks();
  const [copied, setCopied] = useState(false);
  const summary = sections
    .map((section) => `${section.title}: ${picks[section.id] ?? "not chosen"}`)
    .join(", ");
  async function copy() {
    await navigator.clipboard.writeText(`Mail and company timeline picks: ${summary}`);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }
  return (
    <div className="space-y-16 pb-32">
      <style>{styles}</style>
      <header className="max-w-2xl space-y-4">
        <h1 className="m-0 text-3xl font-semibold tracking-tight sm:text-4xl">
          Mail and company timelines
        </h1>
        <p className="m-0 text-muted-foreground">
          Sample mail pinned to Sat 31 Oct 2026, 10:30 am. Everything is live: open emails, record
          outcomes, filter tags and search the rail. Choose one option per section, then copy your
          picks.
        </p>
        <nav aria-label="Sections" className="flex flex-wrap gap-2">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm text-foreground ring-1 ring-border hover:bg-muted hover:no-underline"
            >
              {picks[section.id] && <Check aria-hidden size={14} className="text-link" />}
              {section.title}
            </a>
          ))}
        </nav>
      </header>
      {sections.map((section) => (
        <GallerySection key={section.id} section={section} picks={picks} choose={choose} />
      ))}
      <div className="fixed inset-x-0 bottom-5 z-30 flex justify-center px-4">
        <div className="flex max-w-full items-center gap-3 rounded-full bg-popover py-2 pr-2 pl-5 shadow-surface ring-1 ring-border">
          <span className="truncate text-sm text-muted-foreground">
            {sections.filter((section) => picks[section.id]).length} of {sections.length} chosen
          </span>
          <Button type="button" size="sm" className="h-9 rounded-full px-4" onClick={copy}>
            {copied ? <Check size={15} aria-hidden /> : <Copy size={15} aria-hidden />}
            {copied ? "Copied" : "Copy picks"}
          </Button>
        </div>
      </div>
    </div>
  );
}
