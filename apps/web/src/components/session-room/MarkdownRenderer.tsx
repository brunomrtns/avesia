import { memo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownRendererProps {
  content: string;
}

function MarkdownRendererImpl({ content }: MarkdownRendererProps): React.ReactNode {
  if (!content) {
    return (
      <p className="text-sm italic text-foreground-muted">Nenhum insight gerado ainda.</p>
    );
  }

  return (
    <div className="prose-clinical text-sm leading-relaxed text-foreground">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="pb-1 pt-4 text-lg font-bold text-primary first:pt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="pb-1 pt-4 text-base font-bold text-primary first:pt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="border-b border-border pb-1 pt-3 text-sm font-bold text-primary first:pt-0">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="pt-2 text-sm font-semibold text-foreground">{children}</h4>
          ),
          h5: ({ children }) => (
            <h5 className="pt-2 text-sm font-semibold text-foreground-secondary">{children}</h5>
          ),
          h6: ({ children }) => (
            <h6 className="pt-2 text-xs font-semibold uppercase tracking-wide text-foreground-muted">
              {children}
            </h6>
          ),
          p: ({ children }) => <p className="text-foreground-secondary leading-relaxed">{children}</p>,
          ul: ({ children }) => (
            <ul className="list-disc space-y-1 pl-5 text-foreground-secondary">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal space-y-1 pl-5 text-foreground-secondary">{children}</ol>
          ),
          li: ({ children, ...props }) => {
            // Task list items (GFM: - [ ] / - [x])
            const checked = (props as { checked?: boolean | null }).checked;
            if (checked !== null && checked !== undefined) {
              return (
                <li className="flex items-start gap-2 list-none pl-0">
                  <span
                    className={`mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border text-xs ${
                      checked
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-surface text-transparent'
                    }`}
                  >
                    {checked ? '✓' : ''}
                  </span>
                  <span className={checked ? 'text-foreground-muted line-through' : 'text-foreground-secondary'}>
                    {children}
                  </span>
                </li>
              );
            }
            return <li className="leading-relaxed">{children}</li>;
          },
          strong: ({ children }) => (
            <strong className="font-semibold text-foreground">{children}</strong>
          ),
          em: ({ children }) => <em className="italic text-foreground">{children}</em>,
          del: ({ children }) => <del className="text-foreground-muted line-through">{children}</del>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-primary/40 pl-3 italic text-foreground-secondary">
              {children}
            </blockquote>
          ),
          hr: () => <hr className="border-border my-3" />,
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline underline-offset-2 hover:text-primary/80"
            >
              {children}
            </a>
          ),
          code: ({ children, className }) => {
            const isInline = !className;
            if (isInline) {
              return (
                <code className="rounded bg-surface-elevated px-1.5 py-0.5 font-mono text-xs text-primary">
                  {children}
                </code>
              );
            }
            return (
              <code className="block rounded bg-surface-elevated p-3 font-mono text-xs text-foreground-secondary overflow-x-auto">
                {children}
              </code>
            );
          },
          pre: ({ children }) => <pre className="my-2">{children}</pre>,
          table: ({ children }) => (
            <div className="my-3 overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          thead: ({ children }) => <thead className="border-b border-border">{children}</thead>,
          th: ({ children }) => (
            <th className="px-2 py-1 text-left font-semibold text-foreground">{children}</th>
          ),
          td: ({ children }) => (
            <td className="border-t border-border/50 px-2 py-1 text-foreground-secondary">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownRenderer = memo(MarkdownRendererImpl);
