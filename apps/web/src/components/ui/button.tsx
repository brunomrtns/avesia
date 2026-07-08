import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '@/lib/utils';

// ── Neural Calm Button ────────────────────────────────────────────────────
// Refined with: warm depth, hairline borders, subtle inner light,
// press feedback, and a gradient variant that uses the clinical teal.
// The gradient variant has a shine sweep on hover for a premium CTA feel.
// No generic library look — every variant has personality.

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all duration-200 ease-out-expo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 active:scale-[0.97] relative overflow-hidden',
  {
    variants: {
      variant: {
        // Primary — clinical teal with warm glow on hover
        default:
          'bg-primary text-primary-foreground shadow-sm hover:shadow-glow hover:brightness-110',
        // Destructive — muted, not aggressive
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive-hover hover:shadow-[0_0_24px_-8px_hsl(var(--destructive)/0.4)]',
        // Outline — hairline border, transparent, warm hover
        outline:
          'border border-border bg-transparent hover:bg-surface-elevated hover:border-border-hover text-foreground',
        // Secondary — subtle surface
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/70 border border-border-subtle',
        // Ghost — minimal, just warmth on hover
        ghost:
          'hover:bg-surface-elevated/60 hover:text-foreground text-foreground-secondary',
        // Link — clinical teal
        link:
          'text-primary underline-offset-4 hover:underline hover:text-primary-hover',
        // Gradient — the signature CTA, clinical teal gradient + shine sweep
        gradient:
          'bg-gradient-primary text-white shadow-sm hover:shadow-glow hover:brightness-110 before:absolute before:inset-0 before:translate-x-[-150%] before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent before:transition-transform before:duration-700 before:ease-out-expo hover:before:translate-x-[150%]',
        // Accent — warm amber for human-focused actions
        accent:
          'bg-accent text-accent-foreground shadow-sm hover:shadow-glow-accent hover:brightness-110',
        // Neural — special AI action button with inner glow
        neural:
          'bg-surface-elevated text-primary border border-primary/20 shadow-sm hover:border-primary/40 hover:shadow-glow hover:bg-surface-overlay inner-glow-primary',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-11 rounded-lg px-8 text-base',
        icon: 'h-9 w-9',
        'icon-sm': 'h-7 w-7',
        'icon-lg': 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { buttonVariants };
