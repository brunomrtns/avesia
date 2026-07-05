import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  ArrowLeft,
  BookOpen,
  Calendar,
  HelpCircle,
  Lock,
  Plug,
  Rocket,
  Search,
  Sparkles,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import {
  HELP_CATEGORIES,
  searchHelpArticles,
  type HelpArticle,
  type HelpCategory,
} from '@/lib/help-articles';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MarkdownRenderer } from '@/components/session-room/MarkdownRenderer';
import { cn } from '@/lib/utils';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Rocket,
  Users,
  Calendar,
  BookOpen,
  Sparkles,
  Lock,
  Wrench,
  Plug,
};

export function HelpPage(): React.ReactNode {
  const { orgSlug, articleId } = useParams<{ orgSlug: string; articleId?: string }>();
  const [query, setQuery] = useState('');

  const searchResults = useMemo(() => {
    if (!query.trim()) return null;
    return searchHelpArticles(query);
  }, [query]);

  // ── Article view ──────────────────────────────────────────────────────
  if (articleId) {
    return <HelpArticleView orgSlug={orgSlug!} articleId={articleId} />;
  }

  // ── List view ─────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="mb-3 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10">
            <HelpCircle className="h-7 w-7 text-primary" />
          </div>
        </div>
        <h1 className="font-clinical text-3xl font-bold text-foreground">Central de Ajuda</h1>
        <p className="mt-2 text-foreground-secondary">
          Encontre respostas, aprenda a usar cada recurso e resolva problemas comuns.
        </p>
      </div>

      {/* Search */}
      <div className="relative mx-auto mb-10 max-w-xl">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground-muted" />
        <Input
          placeholder="Buscar na documentação..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Search results */}
      {searchResults !== null ? (
        <div>
          <h2 className="mb-4 text-sm font-medium text-foreground-secondary">
            {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} para "{query}"
          </h2>
          {searchResults.length === 0 ? (
            <div className="rounded-lg border border-border bg-surface p-8 text-center text-foreground-muted">
              Nenhum artigo encontrado. Tente outros termos.
            </div>
          ) : (
            <div className="space-y-2">
              {searchResults.map((article) => (
                <ArticleCard key={article.id} orgSlug={orgSlug!} article={article} compact />
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Categories */
        <div className="space-y-8">
          {HELP_CATEGORIES.map((category) => (
            <CategorySection key={category.id} orgSlug={orgSlug!} category={category} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Category section ─────────────────────────────────────────────────────

function CategorySection({
  orgSlug,
  category,
}: {
  orgSlug: string;
  category: HelpCategory;
}): React.ReactNode {
  const Icon = CATEGORY_ICONS[category.icon] ?? BookOpen;
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div>
          <h2 className="font-clinical text-lg font-semibold text-foreground">{category.title}</h2>
          <p className="text-xs text-foreground-muted">{category.description}</p>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {category.articles.map((article) => (
          <ArticleCard key={article.id} orgSlug={orgSlug} article={article} />
        ))}
      </div>
    </div>
  );
}

// ── Article card ─────────────────────────────────────────────────────────

function ArticleCard({
  orgSlug,
  article,
  compact,
}: {
  orgSlug: string;
  article: HelpArticle;
  compact?: boolean;
}): React.ReactNode {
  return (
    <Link to={`/${orgSlug}/help/${article.id}`}>
      <Card
        className={cn(
          'group cursor-pointer transition-all hover:border-primary/30 hover:bg-surface-elevated/50',
          compact && 'py-3',
        )}
      >
        <CardContent className={cn('p-4', compact && 'py-0')}>
          <h3 className="text-sm font-medium text-foreground group-hover:text-primary">
            {article.title}
          </h3>
          {!compact && (
            <p className="mt-1 line-clamp-2 text-xs text-foreground-secondary">{article.excerpt}</p>
          )}
          {!compact && (
            <div className="mt-2 flex flex-wrap gap-1">
              {article.tags.slice(0, 3).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-[10px]">
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

// ── Article view ─────────────────────────────────────────────────────────

function HelpArticleView({
  orgSlug,
  articleId,
}: {
  orgSlug: string;
  articleId: string;
}): React.ReactNode {
  // Find article and its category
  let foundArticle: HelpArticle | null = null;
  let foundCategory: HelpCategory | null = null;
  for (const cat of HELP_CATEGORIES) {
    const a = cat.articles.find((art) => art.id === articleId);
    if (a) {
      foundArticle = a;
      foundCategory = cat;
      break;
    }
  }

  if (!foundArticle || !foundCategory) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <HelpCircle className="mx-auto mb-4 h-12 w-12 text-foreground-muted" />
        <h1 className="font-clinical text-xl font-semibold">Artigo não encontrado</h1>
        <p className="mt-2 text-foreground-secondary">
          O artigo que você procura não existe ou foi removido.
        </p>
        <Link to={`/${orgSlug}/help`}>
          <Button variant="outline" className="mt-4">
            <ArrowLeft className="h-4 w-4" />
            Voltar para a Central de Ajuda
          </Button>
        </Link>
      </div>
    );
  }

  // Find related articles (same category, excluding current)
  const related = foundCategory.articles.filter((a) => a.id !== articleId).slice(0, 3);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      {/* Breadcrumb */}
      <div className="mb-6 flex items-center gap-2 text-sm text-foreground-muted">
        <Link to={`/${orgSlug}/help`} className="hover:text-foreground">
          Central de Ajuda
        </Link>
        <span>/</span>
        <span className="text-foreground-secondary">{foundCategory.title}</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {/* Header */}
        <h1 className="font-clinical text-3xl font-bold text-foreground">{foundArticle.title}</h1>
        <p className="mt-2 text-foreground-secondary">{foundArticle.excerpt}</p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {foundArticle.tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="text-[10px]">
              {tag}
            </Badge>
          ))}
        </div>

        {/* Body */}
        <ScrollArea className="mt-6">
          <article className="prose prose-sm prose-invert max-w-none pb-8 font-clinical">
            <MarkdownRenderer content={foundArticle.body} />
          </article>
        </ScrollArea>

        {/* Related */}
        {related.length > 0 && (
          <div className="mt-8 border-t border-border pt-6">
            <h2 className="mb-3 text-sm font-medium text-foreground-secondary">Artigos relacionados</h2>
            <div className="grid gap-2 sm:grid-cols-3">
              {related.map((a) => (
                <Link
                  key={a.id}
                  to={`/${orgSlug}/help/${a.id}`}
                  className="group rounded-lg border border-border bg-surface p-3 transition-all hover:border-primary/30 hover:bg-surface-elevated/50"
                >
                  <h3 className="text-xs font-medium text-foreground group-hover:text-primary">
                    {a.title}
                  </h3>
                  <p className="mt-1 line-clamp-2 text-[11px] text-foreground-muted">{a.excerpt}</p>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Back link */}
        <div className="mt-8">
          <Link to={`/${orgSlug}/help`}>
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4" />
              Voltar para a Central de Ajuda
            </Button>
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
