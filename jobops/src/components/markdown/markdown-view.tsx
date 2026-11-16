import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { cn } from "@/lib/utils";

/*
 * Rendered Markdown with tables, task lists and highlighted code fences.
 * HTML in the source is escaped (no rehype-raw), so pasted notes cannot run script.
 * Typography lives in the `.md-view` block in globals.css.
 */
export function MarkdownView({
  source,
  className,
  components,
}: {
  source: string;
  className?: string;
  components?: Components;
}) {
  if (!source.trim()) return null;
  return (
    <div className={cn("md-view", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false }]]}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
