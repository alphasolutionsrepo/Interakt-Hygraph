import type { Metadata } from "next";
import { ProductGrid } from "@/components/ProductCard";
import { PageHeader } from "@/components/Prose";
import { getProducts } from "@/hygraph/queries";

export const metadata: Metadata = {
  title: "All products",
  description: "The full Meridian range of apparel and outdoor equipment.",
};

export default async function ProductsPage() {
  const products = await getProducts();

  return (
    <div>
      <PageHeader
        eyebrow="Shop"
        title="All products"
        lede={`${products.length} items across footwear, shells, insulation, base layers, packs and sleep systems.`}
      />
      <ProductGrid products={products} />
    </div>
  );
}
