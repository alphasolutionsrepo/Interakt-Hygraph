/**
 * Field mappings for the two indexes, in Interakt's own export envelope.
 *
 * These import via the index Fields screen, which beats hand-configuring ~25
 * fields twice — and, more importantly, it is the only way to pin the choices
 * that Interakt's own inference gets wrong for this content:
 *
 *  - `title` and `description` are under 100 characters, so inference would make
 *    them `keyword` (unanalysed) instead of `text`.
 *  - `body` must be the single `isVectorSource`; inference never sets it.
 *  - `uniqueId` defaults to mode `default` + generator `uuid`, which mints a new
 *    id on every ingest and duplicates the entire corpus on the second run. It
 *    is mapped by `reference` to our own namespaced `uniqueId` instead.
 */

import type { InferredType } from "./infer";

export type FieldMapping = {
  fieldName: string;
  fieldType: InferredType;
  displayName: string;
  isSystemField?: boolean;
  isRequired?: boolean;
  mapping: {
    mode: "source" | "reference" | "default";
    sourceField: string | null;
    transform: "none" | "trim" | "lowercase" | "uppercase" | "trim_lowercase";
    sourceFromField?: string;
  };
  attributes: {
    isSearchable: boolean;
    isFacetable: boolean;
    includeInResponse: boolean;
    boostValue: number;
    isVectorSource: boolean;
  };
  providerFieldSettings?: Record<string, unknown>;
};

export type IndexMappingFile = {
  _version: 1;
  _indexName: string;
  _searchProvider: "elasticsearch";
  fields: FieldMapping[];
};

type FieldSpec = {
  name: string;
  type: InferredType;
  label: string;
  searchable?: boolean;
  facetable?: boolean;
  boost?: number;
  vector?: boolean;
  autocomplete?: boolean;
};

function field(spec: FieldSpec): FieldMapping {
  return {
    fieldName: spec.name,
    fieldType: spec.type,
    displayName: spec.label,
    mapping: { mode: "source", sourceField: spec.name, transform: "none" },
    attributes: {
      isSearchable: spec.searchable ?? false,
      isFacetable: spec.facetable ?? false,
      includeInResponse: true,
      boostValue: spec.boost ?? 1,
      isVectorSource: spec.vector ?? false,
    },
    ...(spec.autocomplete ? { providerFieldSettings: { isAutocomplete: true } } : {}),
  };
}

/** uniqueId is a system field; `reference` points it at our own value. */
const UNIQUE_ID: FieldMapping = {
  fieldName: "uniqueId",
  fieldType: "keyword",
  displayName: "Unique ID",
  isSystemField: true,
  isRequired: true,
  mapping: {
    mode: "reference",
    sourceField: null,
    transform: "none",
    sourceFromField: "uniqueId",
  },
  attributes: {
    isSearchable: false,
    isFacetable: false,
    includeInResponse: true,
    boostValue: 0.1,
    isVectorSource: false,
  },
};

/** Shared by both indexes — the field names displayConfig binds roles to. */
const SPINE: FieldSpec[] = [
  { name: "docType", type: "keyword", label: "Type", facetable: true },
  { name: "docTypeLabel", type: "keyword", label: "Content type", facetable: true, boost: 1 },
  { name: "title", type: "text", label: "Title", searchable: true, boost: 9, autocomplete: true },
  { name: "description", type: "text", label: "Description", searchable: true, boost: 5 },
  { name: "body", type: "text", label: "Body", searchable: true, boost: 3, vector: true },
  { name: "url", type: "url", label: "URL" },
  { name: "imageUrl", type: "image_url", label: "Image" },
  { name: "imageAlt", type: "keyword", label: "Image alt text" },
  { name: "tags", type: "array", label: "Tags", searchable: true, facetable: true, boost: 2 },
  { name: "updatedAt", type: "datetime", label: "Updated" },
  { name: "publishedAt", type: "datetime", label: "Published" },
];

const PRODUCT_FIELDS: FieldSpec[] = [
  { name: "brand", type: "keyword", label: "Brand", searchable: true, facetable: true, boost: 7 },
  { name: "productLine", type: "keyword", label: "Product line", searchable: true, facetable: true, boost: 6 },
  { name: "variantName", type: "keyword", label: "Variant", searchable: true, boost: 2 },
  { name: "sku", type: "keyword", label: "SKU", searchable: true, boost: 6 },
  { name: "price", type: "number", label: "Price", facetable: true },
  { name: "currency", type: "keyword", label: "Currency" },
  { name: "inStock", type: "boolean", label: "In stock", facetable: true },
  { name: "rating", type: "number", label: "Rating", facetable: true },
  { name: "reviewCount", type: "number", label: "Review count" },
  { name: "material", type: "text", label: "Material", searchable: true, boost: 3 },
  { name: "categories", type: "array", label: "Category", searchable: true, facetable: true, boost: 4 },
  { name: "size", type: "keyword", label: "Size", facetable: true },
  { name: "color", type: "keyword", label: "Colour", facetable: true },
];

const CONTENT_FIELDS: FieldSpec[] = [
  { name: "contentType", type: "keyword", label: "Topic", searchable: true, facetable: true, boost: 4 },
  { name: "author", type: "keyword", label: "Author", searchable: true, facetable: true, boost: 3 },
  { name: "authorTitle", type: "keyword", label: "Author role" },
  { name: "readingTime", type: "number", label: "Reading time" },
  { name: "relatedProducts", type: "array", label: "Related products", searchable: true, boost: 3 },
];

export const PRODUCT_INDEX_NAME = "hygraph-product";
export const CONTENT_INDEX_NAME = "hygraph-content";

export function productMapping(): IndexMappingFile {
  return {
    _version: 1,
    _indexName: PRODUCT_INDEX_NAME,
    _searchProvider: "elasticsearch",
    fields: [UNIQUE_ID, ...[...SPINE, ...PRODUCT_FIELDS].map(field)],
  };
}

export function contentMapping(): IndexMappingFile {
  return {
    _version: 1,
    _indexName: CONTENT_INDEX_NAME,
    _searchProvider: "elasticsearch",
    fields: [UNIQUE_ID, ...[...SPINE, ...CONTENT_FIELDS].map(field)],
  };
}

/** fieldName -> intended type, for comparing against Interakt's inference. */
export function intendedTypes(mapping: IndexMappingFile): Record<string, InferredType> {
  return Object.fromEntries(mapping.fields.map((f) => [f.fieldName, f.fieldType]));
}
