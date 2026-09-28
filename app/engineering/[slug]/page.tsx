import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArticleHeader } from "@/components/engineering/ArticleHeader";
import { ArticleNav } from "@/components/engineering/ArticleNav";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";
import {
  articles,
  getAdjacentArticles,
  getArticle,
} from "@/lib/content/engineering";
import { siteConfig } from "@/lib/site/config";

export const dynamicParams = false;

export function generateStaticParams() {
  return articles.map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({
  params,
}: PageProps<"/engineering/[slug]">): Promise<Metadata> {
  const article = getArticle((await params).slug);

  if (!article) {
    return {};
  }

  return {
    title: `${article.title} · ${siteConfig.name}`,
    description: article.description,
  };
}

export default async function ArticlePage({
  params,
}: PageProps<"/engineering/[slug]">) {
  const { slug } = await params;
  const article = getArticle(slug);

  if (!article) {
    notFound();
  }

  const { Content } = article;

  return (
    <article aria-labelledby="article-heading">
      <ArticleHeader article={article} />
      <Section className="border-t border-border">
        <Container>
          <div className="max-w-narrow min-w-0 space-y-6">
            <Content />
          </div>
        </Container>
      </Section>
      <ArticleNav {...getAdjacentArticles(slug)} />
    </article>
  );
}
