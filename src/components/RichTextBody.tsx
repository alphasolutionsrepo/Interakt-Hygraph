import { RichText } from "@graphcms/rich-text-react-renderer";
import type { RichTextContent } from "@graphcms/rich-text-types";

/**
 * Renders a Hygraph Rich Text field.
 *
 * Note the read/write asymmetry: reads come back as { raw, html, markdown, text }
 * and it is the `raw` AST that goes to the renderer. (Writes take the bare AST
 * with no `raw` wrapper — see scripts/lib/richtext.ts.)
 */
export function RichTextBody({ content }: { content: { raw: unknown } | null }) {
  if (!content?.raw) return null;

  return (
    <div className="space-y-5">
      <RichText
        content={content.raw as RichTextContent}
        renderers={{
          h2: ({ children }) => (
            <h2 className="mt-10 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="mt-8 text-lg font-semibold text-stone-900 dark:text-stone-100">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="leading-7 text-stone-700 dark:text-stone-300">{children}</p>
          ),
          bold: ({ children }) => (
            <strong className="font-semibold text-stone-900 dark:text-stone-100">{children}</strong>
          ),
          ul: ({ children }) => (
            <ul className="ml-5 list-disc space-y-2 text-stone-700 dark:text-stone-300">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="ml-5 list-decimal space-y-2 text-stone-700 dark:text-stone-300">{children}</ol>
          ),
          li: ({ children }) => <li className="leading-7 pl-1">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-emerald-600 pl-4 italic text-stone-600 dark:text-stone-400">
              {children}
            </blockquote>
          ),
          a: ({ children, href }) => (
            <a href={href} className="text-emerald-700 underline underline-offset-2 dark:text-emerald-400">
              {children}
            </a>
          ),
        }}
      />
    </div>
  );
}
