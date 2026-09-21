import Image from "next/image";
import Link from "next/link";
import type { ProductCard as ProductCardData } from "@/hygraph/queries";
import { pathFor } from "@/hygraph/routes";

export function formatPrice(value: number | null) {
  if (value === null) return "";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const image = product.productImage[0];

  return (
    <Link
      href={pathFor("product", product.productSlug)}
      className="group flex flex-col overflow-hidden rounded-lg border border-stone-200 bg-white transition hover:border-stone-400 dark:border-stone-800 dark:bg-stone-950 dark:hover:border-stone-600"
    >
      <div className="relative aspect-4/3 overflow-hidden bg-stone-100 dark:bg-stone-900">
        {image ? (
          <Image
            src={image.url}
            alt={product.productName}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition duration-300 group-hover:scale-105"
          />
        ) : null}
        {product.inStock === false ? (
          <span className="absolute left-2 top-2 rounded bg-stone-900/90 px-2 py-1 text-xs font-medium text-white">
            Out of stock
          </span>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-4">
        {product.brand ? (
          <span className="text-xs uppercase tracking-wide text-stone-500">{product.brand}</span>
        ) : null}
        <h3 className="font-medium leading-snug text-stone-900 dark:text-stone-100">
          {product.productName}
        </h3>
        {product.shortDescription ? (
          <p className="line-clamp-2 text-sm text-stone-600 dark:text-stone-400">
            {product.shortDescription}
          </p>
        ) : null}
        <div className="mt-auto flex items-baseline justify-between pt-3">
          <span className="font-semibold text-stone-900 dark:text-stone-100">
            {formatPrice(product.productPrice)}
          </span>
          {product.rating ? (
            <span className="text-xs text-stone-500">
              {product.rating.toFixed(1)} ({product.reviewCount ?? 0})
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {products.map((product) => (
        <ProductCard key={product.id} product={product} />
      ))}
    </div>
  );
}
