"use client";

import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightActiveLine,
  keymap,
  placeholder as placeholderExtension,
} from "@codemirror/view";
import {
  HighlightStyle,
  bracketMatching,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from "@codemirror/commands";
import { searchKeymap } from "@codemirror/search";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { tags as t } from "@lezer/highlight";

/*
 * Markdown source editor, ported from sde-prep-platform's shared MarkdownEditor.
 * Colours come from the JobOps theme tokens, so it follows light and dark mode
 * without a separate CodeMirror theme. Fenced code blocks get their own language
 * highlighting (```python, ```java ...).
 */
const highlight = HighlightStyle.define([
  { tag: t.heading, color: "var(--foreground)", fontWeight: "650" },
  { tag: t.strong, fontWeight: "650" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: [t.link, t.url], color: "var(--link)" },
  { tag: [t.monospace], color: "var(--teal)" },
  { tag: [t.processingInstruction, t.contentSeparator, t.list, t.quote], color: "var(--muted-foreground)" },
  { tag: t.keyword, color: "var(--purple)" },
  { tag: [t.string, t.special(t.string)], color: "var(--teal)" },
  { tag: [t.number, t.bool, t.null], color: "var(--amber)" },
  { tag: [t.comment, t.lineComment, t.blockComment], color: "var(--muted-foreground)", fontStyle: "italic" },
  { tag: [t.function(t.variableName), t.definition(t.variableName)], color: "var(--link)" },
]);

const surface = EditorView.theme({
  "&": { height: "100%", backgroundColor: "transparent", color: "var(--foreground)", fontSize: "13px" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineHeight: "1.65",
    overflow: "auto",
  },
  ".cm-content": { caretColor: "var(--primary)", padding: "12px 0" },
  ".cm-line": { padding: "0 14px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--primary)" },
  ".cm-activeLine": { backgroundColor: "color-mix(in srgb, var(--primary) 7%, transparent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "color-mix(in srgb, var(--primary) 28%, transparent) !important",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)" },
});

export function MarkdownEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
  className,
  autoFocus = false,
}: {
  value: string;
  onChange: (next: string) => void;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(value);
  const change = useRef(onChange);
  useEffect(() => {
    change.current = onChange;
  }, [onChange]);
  useEffect(() => {
    latest.current = value;
  }, [value]);

  // Mount once; later value changes are pushed in below so history and selection survive.
  useEffect(() => {
    if (!host.current) return;
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: latest.current,
        extensions: [
          history(),
          drawSelection(),
          dropCursor(),
          highlightActiveLine(),
          bracketMatching(),
          closeBrackets(),
          indentOnInput(),
          indentUnit.of("  "),
          EditorState.tabSize.of(2),
          markdown({ base: markdownLanguage, codeLanguages: languages }),
          syntaxHighlighting(highlight),
          surface,
          EditorView.lineWrapping,
          placeholderExtension(placeholder ?? ""),
          keymap.of([{ key: "Tab", run: indentMore, shift: indentLess }]),
          keymap.of([...closeBracketsKeymap, ...defaultKeymap, ...searchKeymap, ...historyKeymap]),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel, spellcheck: "true" }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            const next = update.state.doc.toString();
            if (next !== latest.current) change.current(next);
          }),
        ],
      }),
    });
    // Tab indents inside the editor; Escape then Tab still leaves it for keyboard users.
    editor.setTabFocusMode(false);
    view.current = editor;
    if (autoFocus) {
      editor.dispatch({ selection: { anchor: editor.state.doc.length } });
      editor.focus();
    }
    return () => {
      editor.destroy();
      view.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (!editor || editor.state.doc.toString() === value) return;
    editor.dispatch({ changes: { from: 0, to: editor.state.doc.length, insert: value } });
  }, [value]);

  return <div ref={host} className={className} />;
}
