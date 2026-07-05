import { AlertTriangle } from 'lucide-react';

import { cn } from '@/lib/utils';

interface AIDisclaimerProps {
  readonly variant?: 'inline' | 'banner' | 'footer';
  readonly className?: string;
  readonly text?: string;
}

const DEFAULT_TEXT =
  'As respostas da IA são ferramentas de apoio e podem conter erros. Revise antes de utilizar em decisões clínicas.';

/**
 * Discreet AI disclaimer component.
 * - `inline`: small text with icon, for placing near AI outputs
 * - `banner`: subtle banner at the top of AI panels
 * - `footer`: minimal footer text for dialogs
 */
export function AIDisclaimer({
  variant = 'inline',
  className,
  text = DEFAULT_TEXT,
}: AIDisclaimerProps): React.ReactNode {
  if (variant === 'footer') {
    return (
      <p className={cn('text-xs text-foreground-muted', className)}>
        {text}
      </p>
    );
  }

  if (variant === 'banner') {
    return (
      <div
        className={cn(
          'flex items-center gap-2 rounded-md border border-warning/15 bg-warning/5 px-3 py-2',
          className,
        )}
      >
        <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
        <p className="text-xs text-foreground-secondary">{text}</p>
      </div>
    );
  }

  // inline (default)
  return (
    <div className={cn('flex items-start gap-1.5', className)}>
      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-foreground-muted" />
      <p className="text-xs text-foreground-muted">{text}</p>
    </div>
  );
}
