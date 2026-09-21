/**
 * Markdown subset -> Hygraph Rich Text (Slate) AST.
 *
 * Hygraph's write format is the bare AST: { children: [...] }. The `raw`/`html`/
 * `markdown`/`text` shape only comes back on reads — feeding a read value back
 * into a mutation is the single most common Hygraph error.
 *
 * We hand-roll the converter rather than pulling in a markdown-to-slate package
 * because Hygraph nests lists as
 *   bulleted-list > list-item > list-item-child > paragraph
 * which is a non-standard double-wrap that generic libraries get wrong.
 *
 * Supported: ## / ### headings, paragraphs, - bullets, 1. numbered lists,
 * > block quotes, and inline **bold**.
 */

export type TextNode = {
  text: string;
  bold?: boolean;
};

export type ElementNode = {
  type: string;
  children: (ElementNode | TextNode)[];
};

export type RichTextAst = {
  children: ElementNode[];
};

/** Splits a line into text nodes, honouring **bold** runs. */
function inline(line: string): TextNode[] {
  const nodes: TextNode[] = [];
  const pattern = /\*\*([^*]+)\*\*/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(line)) !== null) {
    if (match.index > cursor) {
      nodes.push({ text: line.slice(cursor, match.index) });
    }
    nodes.push({ text: match[1], bold: true });
    cursor = match.index + match[0].length;
  }

  if (cursor < line.length) {
    nodes.push({ text: line.slice(cursor) });
  }

  // A Slate element must always carry at least one text node.
  return nodes.length > 0 ? nodes : [{ text: "" }];
}

function listItem(line: string): ElementNode {
  return {
    type: "list-item",
    children: [
      {
        type: "list-item-child",
        children: [{ type: "paragraph", children: inline(line) }],
      },
    ],
  };
}

/**
 * Converts an array of markdown-ish lines into a Hygraph Rich Text AST.
 * Each entry in `lines` is one block; consecutive list entries are merged
 * into a single list element.
 */
export function md(lines: string[]): RichTextAst {
  const children: ElementNode[] = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    if (line.startsWith("### ")) {
      children.push({ type: "heading-three", children: inline(line.slice(4)) });
      continue;
    }

    if (line.startsWith("## ")) {
      children.push({ type: "heading-two", children: inline(line.slice(3)) });
      continue;
    }

    if (line.startsWith("> ")) {
      children.push({
        type: "block-quote",
        children: [{ type: "paragraph", children: inline(line.slice(2)) }],
      });
      continue;
    }

    if (line.startsWith("- ")) {
      const last = children[children.length - 1];
      const item = listItem(line.slice(2));
      if (last && last.type === "bulleted-list") {
        last.children.push(item);
      } else {
        children.push({ type: "bulleted-list", children: [item] });
      }
      continue;
    }

    const numbered = /^\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      const last = children[children.length - 1];
      const item = listItem(numbered[1]);
      if (last && last.type === "numbered-list") {
        last.children.push(item);
      } else {
        children.push({ type: "numbered-list", children: [item] });
      }
      continue;
    }

    children.push({ type: "paragraph", children: inline(line) });
  }

  return { children };
}

/**
 * Flattens the same markdown subset to plain text.
 * Used for excerpts now, and for Interakt indexing in phase 2 — indexed as a
 * tree, rich text serialises to "[object Object]" and the embedding is garbage.
 */
export function plainText(lines: string[]): string {
  return lines
    .map((line) =>
      line
        .trim()
        .replace(/^#{2,3}\s+/, "")
        .replace(/^[->]\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .replace(/\*\*/g, ""),
    )
    .filter(Boolean)
    .join("\n\n");
}
