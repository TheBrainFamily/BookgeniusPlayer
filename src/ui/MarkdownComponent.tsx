/* ------------------------------------------------------------------ *
 *  LLMAnswerViewer.tsx                                               *
 *                                                                    *
 *  Drop into your project – it only needs the two helpers you        *
 *  already have:  getCurrentLocation()  and  goToParagraph().        *
 * ------------------------------------------------------------------ */

import React, { useEffect, useMemo, useRef } from "react";
import type { ComponentPropsWithoutRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { motion } from "motion/react";
import { getCurrentLocation } from "@/helpers/paragraphsNavigation";
import { goToParagraph } from "@/helpers/paragraphsNavigation";
import { locateQuotes } from "./utils/locateQuotes";
import { normalise } from "./utils/normalise";
import { extractQuotes } from "./utils/extractQuotes";
/* ------------------------------------------------------------------ *
 *  Types                                                             *
 * ------------------------------------------------------------------ */
export interface ParagraphInfo {
  chapter: number;
  index: number;
  raw: string;
  norm: string;
}

export interface QuoteHit {
  quote: string;
  chapter: number;
  index: number;
  score: number;
}

/* ------------------------------------------------------------------ *
 *  Utility functions                                                 *
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 *  Paragraph cache (DOM → memory)                                    *
 * ------------------------------------------------------------------ */
const buildParagraphCache = (): ParagraphInfo[] => {
  const nodes = document.querySelectorAll<HTMLElement>("section[data-chapter] [data-index]");
  return Array.from(nodes).map((p) => {
    const chapter = parseInt((p.closest("section[data-chapter]") as HTMLElement).dataset.chapter || "0", 10);
    const index = parseInt(p.dataset.index || "0", 10);
    const raw =
      p.textContent
        ?.replace(/[\n\r]/g, " ")
        .replace(/\s+/g, " ")
        .trim() || "";
    return { chapter, index, raw, norm: normalise(raw) };
  });
};

/* ------------------------------------------------------------------ *
 *  Quote → paragraph matching                                        *
 * ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ *
 *  Inject inline footnotes                                           *
 * ------------------------------------------------------------------ */
const inlineFootnotes = (md: string, hits: QuoteHit[]) => {
  let footnoted = md;
  hits.forEach((h, idx) => {
    // Escape RegExp specials in the quote text
    const safe = h.quote.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    const tag = `<sup class="quote-ref" data-ch="${h.chapter}" data-para="${h.index}">[${idx}]</sup>`;
    const re = new RegExp(safe);
    footnoted = footnoted.replace(re, `${h.quote}${tag}`);
  });
  return footnoted;
};

/* ------------------------------------------------------------------ *
 *  DeepResearchMarkdown – updated                                    *
 * ------------------------------------------------------------------ */
type DMProps = { text: string; className?: string };

const DeepResearchMarkdown: React.FC<DMProps> = ({ text, className = "" }) => {
  const ref = useRef<HTMLElement>(null);

  /* click handler for footnotes */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const sup = (e.target as HTMLElement).closest(".quote-ref") as HTMLElement | null;
      if (!sup) return;

      const chapter = Number(sup.dataset.ch);
      const paragraph = Number(sup.dataset.para);

      // global helper you already have
      goToParagraph({ currentChapter: chapter, currentParagraph: paragraph });
    };

    const el = ref.current;
    el?.addEventListener("click", handler);
    return () => el?.removeEventListener("click", handler);
  }, []);

  type ListItemProps = ComponentPropsWithoutRef<"li"> & {
    /** `true` when the parent list is an `<ol>` instead of `<ul>` */
    ordered?: boolean;
  };

  type CodeProps = ComponentPropsWithoutRef<"code"> & {
    /** MDX sets `inline` for back-tick snippets (`code`) rather than fenced blocks */
    inline?: boolean;
  };

  const components = {
    h1: (props: ComponentPropsWithoutRef<"h1">) => <h1 {...props} className="mt-12 mb-6 text-3xl font-extrabold border-b border-white pb-3 tracking-tight first:mt-0" />,
    h2: (props: ComponentPropsWithoutRef<"h2">) => <h2 {...props} className="mt-10 mb-4 text-2xl font-semibold border-l-4 border-primary pl-4 first:mt-0" />,
    h3: (props: ComponentPropsWithoutRef<"h3">) => <h3 {...props} className="mt-8 mb-3 text-xl font-medium text-white first:mt-0" />,
    p: (props: ComponentPropsWithoutRef<"p">) => <p {...props} className="my-4 leading-relaxed text-white/90 max-w-none prose-p:leading-normal" />,
    ul: (props: ComponentPropsWithoutRef<"ul">) => <ul {...props} className="list-disc ml-6 space-y-1" />,
    ol: (props: ComponentPropsWithoutRef<"ol">) => <ol {...props} className="list-decimal ml-6 space-y-1" />,
    strong: (props: ComponentPropsWithoutRef<"strong">) => <strong {...props} className="font-semibold text-white" />,
    em: (props: ComponentPropsWithoutRef<"em">) => <em {...props} className="italic text-white/80" />,
    blockquote: (props: ComponentPropsWithoutRef<"blockquote">) => <blockquote {...props} className="border-l-4 border-primary/80 italic pl-5 my-4 text-white/70" />,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    li: ({ ordered, ...props }: ListItemProps) => <li {...props} className="pl-1 marker:font-semibold" />,
    code: ({ inline, children, ...props }: CodeProps) => {
      if (inline) {
        return (
          <code {...props} className="px-1 py-0.5 rounded bg-gray-100 text-pink-600 font-mono text-sm">
            {children}
          </code>
        );
      }
      return (
        <pre {...props} className="rounded-lg p-4 bg-gray-100 overflow-x-auto text-sm leading-snug">
          <code className="language-ts">{children}</code>
        </pre>
      );
    },
  };

  return (
    <motion.article
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className={"prose prose-neutral max-w-none lg:prose-lg xl:prose-xl dark:prose-invert mx-auto" + (className ? ` ${className}` : "")}
    >
      <ReactMarkdown
        children={text}
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]} // enable raw <sup> HTML
        components={components}
      />
    </motion.article>
  );
};

/* ------------------------------------------------------------------ *
 *  Main exported component                                           *
 * ------------------------------------------------------------------ */
type ViewerProps = { answerMarkdown: string };

export const LLMAnswerViewer: React.FC<ViewerProps> = ({ answerMarkdown }) => {
  console.log("RUNNING LLM ANSWER");
  /* 1. build paragraph cache once */
  const paragraphs = useMemo(buildParagraphCache, []);

  /* 2. extract & match when the answer changes */
  const processed = useMemo(() => {
    const quotes = extractQuotes(answerMarkdown);
    console.log("QUOTES", quotes);
    if (!quotes.length) return answerMarkdown;

    const current = getCurrentLocation();
    console.log("CURRENT", current);
    const hits = locateQuotes(quotes, paragraphs, current);
    console.log("HITS", hits);
    return inlineFootnotes(answerMarkdown, hits);
  }, [answerMarkdown, paragraphs]);

  /* 3. render */
  return <DeepResearchMarkdown text={processed} />;
};

/* ------------------------------------------------------------------ *
 *  Usage
 * ------------------------------------------------------------------ *
 *   <LLMAnswerViewer answerMarkdown={rawLLMAnswer} />
 * ------------------------------------------------------------------ */
