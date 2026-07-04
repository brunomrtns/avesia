// ============================================================================
//  Avesia — BrandLogo
//
//  Single source of truth for the app logo (icon + name + tagline).
//  Change the SVG, name, or tagline here and it reflects everywhere:
//  - Sidebar (Layout)
//  - Landing page (LandingPage)
//  - Login page (LoginPage)
//  - Any future surface
//
//  Variants:
//  - "full": icon + name + tagline (sidebar, landing nav)
//  - "compact": icon + name only (login, footer)
//  - "icon": icon only (favicon, collapsed sidebar)
// ============================================================================

import { cn } from '@/lib/utils';

// ── Brand configuration — edit here ────────────────────────────────────────
export const BRAND = {
  name: 'Avesia',
  tagline: 'Clinical Intelligence',
} as const;

// ── Brand icon (SVG) — edit here ────────────────────────────────────────────
// Neural node with connections — represents the Knowledge Graph + AI layer.
function BrandIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 36 36" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Neural connections — faint lines */}
      <line x1="18" y1="8" x2="10" y2="22" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1" />
      <line x1="18" y1="8" x2="26" y2="22" stroke="hsl(var(--primary) / 0.3)" strokeWidth="1" />
      <line x1="10" y1="22" x2="26" y2="22" stroke="hsl(var(--primary) / 0.2)" strokeWidth="1" />
      {/* Nodes */}
      <circle cx="18" cy="8" r="3" fill="hsl(var(--primary))" />
      <circle cx="10" cy="22" r="2.5" fill="hsl(var(--primary) / 0.7)" />
      <circle cx="26" cy="22" r="2.5" fill="hsl(var(--primary) / 0.7)" />
      {/* Glow on central node */}
      <circle cx="18" cy="8" r="5" fill="hsl(var(--primary) / 0.15)">
        <animate attributeName="r" values="4;6;4" dur="3s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.15;0.05;0.15" dur="3s" repeatCount="indefinite" />
      </circle>
    </svg>
  );
}

type BrandVariant = 'full' | 'compact' | 'icon';

interface BrandLogoProps {
  variant?: BrandVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  iconClassName?: string;
}

const ICON_SIZE = {
  sm: 'h-7 w-7',
  md: 'h-8 w-8',
  lg: 'h-10 w-10',
};

const NAME_SIZE = {
  sm: 'text-sm',
  md: 'text-sm',
  lg: 'text-lg',
};

const TAGLINE_SIZE = {
  sm: 'text-[8px]',
  md: 'text-[9px]',
  lg: 'text-[10px]',
};

export function BrandLogo({
  variant = 'full',
  size = 'md',
  className,
  iconClassName,
}: BrandLogoProps): React.JSX.Element {
  if (variant === 'icon') {
    return <BrandIcon className={cn(ICON_SIZE[size], iconClassName)} />;
  }

  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="flex shrink-0 items-center justify-center">
        <BrandIcon className={cn(ICON_SIZE[size], iconClassName)} />
      </div>
      <div className="flex flex-col justify-center overflow-hidden leading-none">
        <h1 className={cn('font-bold tracking-tight text-foreground', NAME_SIZE[size])}>
          {BRAND.name}
        </h1>
        {variant === 'full' && (
          <p className={cn('mt-0.5 font-medium uppercase tracking-wider text-primary/60', TAGLINE_SIZE[size])}>
            {BRAND.tagline}
          </p>
        )}
      </div>
    </div>
  );
}
