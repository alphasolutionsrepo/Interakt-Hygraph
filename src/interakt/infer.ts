/**
 * Interakt's own field-type inference, ported verbatim.
 *
 * Source: backend/src/app/search-indexes/(pages)/[id]/mappings/page.tsx and the
 * identical copy in search-index-fields.service.ts (`createFieldsFromJson`).
 *
 * This exists so the sample generator can tell you, before you paste anything,
 * where Interakt's guess will differ from the mapping we actually want. Two
 * traps it surfaces:
 *
 *  - the 100-character threshold that decides `keyword` vs `text`, which would
 *    otherwise leave `title` unanalysed;
 *  - inference reads **only the first record** of a sample array, so a field
 *    missing from `sample[0]` is never created at all.
 */

export type InferredType =
  | "keyword"
  | "text"
  | "number"
  | "boolean"
  | "date"
  | "datetime"
  | "url"
  | "email"
  | "image_url"
  | "array"
  | "json";

export function inferFieldType(value: unknown): InferredType {
  if (value === null || value === undefined) return "keyword";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";

  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return "datetime";
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return "date";
    if (/^https?:\/\//.test(value)) {
      if (/\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?|$)/i.test(value)) return "image_url";
      return "url";
    }
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return "email";
    return value.length > 100 ? "text" : "keyword";
  }

  if (Array.isArray(value)) {
    if (value.length > 0 && typeof value[0] === "object" && value[0] !== null) return "json";
    return "array";
  }

  if (typeof value === "object") return "json";
  return "keyword";
}

/** What Interakt would create from a pasted sample — first record only. */
export function inferFromSample(sample: Record<string, unknown>[]): Record<string, InferredType> {
  const first = sample[0] ?? {};
  return Object.fromEntries(
    Object.entries(first).map(([key, value]) => [key, inferFieldType(value)]),
  );
}
