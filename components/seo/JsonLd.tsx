import { serializeJsonLd, type StructuredData } from "@/lib/seo/structuredData";

/** Structured data for the page, built by `lib/seo/structuredData.ts`. */
export function JsonLd({ data }: { data: StructuredData }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: serializeJsonLd(data) }}
    />
  );
}
