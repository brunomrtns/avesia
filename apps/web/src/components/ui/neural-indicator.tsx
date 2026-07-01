// ============================================================================
//  Avesia — NeuralIndicator
//
//  The signature AI activity indicator. A small animated node with orbiting
//  particles that communicates "the AI is present and thinking." Used in:
//  - Sidebar logo (always-on ambient presence)
//  - Session Room header (active processing)
//  - Dashboard AI cards (intelligence signal)
//
//  Three states: idle (gentle breathing), active (orbiting particles),
//  processing (intense neural pulse with expanding rings).
// ============================================================================

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

type NeuralState = 'idle' | 'active' | 'processing';

interface NeuralIndicatorProps {
  state?: NeuralState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CONFIG = {
  sm: { container: 'h-5 w-5', node: 'h-1.5 w-1.5', orbit: 16 },
  md: { container: 'h-8 w-8', node: 'h-2 w-2', orbit: 24 },
  lg: { container: 'h-12 w-12', node: 'h-3 w-3', orbit: 36 },
};

export function NeuralIndicator({
  state = 'idle',
  size = 'md',
  className,
}: NeuralIndicatorProps): React.JSX.Element {
  const config = SIZE_CONFIG[size];

  return (
    <div
      className={cn(
        'relative flex items-center justify-center',
        config.container,
        className,
      )}
    >
      {/* Central node — always present, always breathing */}
      <motion.div
        animate={{
          scale: state === 'processing' ? [1, 1.3, 1] : [1, 1.1, 1],
          opacity: [0.8, 1, 0.8],
        }}
        transition={{
          duration: state === 'processing' ? 1.2 : 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className={cn(
          'rounded-full bg-primary',
          config.node,
          state !== 'idle' && 'shadow-[0_0_8px_hsl(var(--primary-glow)/0.6)]',
        )}
      />

      {/* Orbiting particles — visible when active or processing */}
      {(state === 'active' || state === 'processing') && (
        <>
          {[0, 120, 240].map((angle, i) => (
            <motion.div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-primary/60"
              animate={{
                rotate: 360,
              }}
              transition={{
                duration: state === 'processing' ? 2 : 4,
                repeat: Infinity,
                ease: 'linear',
              }}
              style={{
                transformOrigin: `${config.orbit / 2}px center`,
              }}
              initial={{
                rotate: angle,
              }}
            />
          ))}
        </>
      )}

      {/* Expanding rings — only when processing */}
      {state === 'processing' && (
        <>
          {[0, 0.6].map((delay, i) => (
            <motion.div
              key={i}
              className="absolute rounded-full border border-primary/30"
              initial={{ scale: 0.5, opacity: 0.6 }}
              animate={{ scale: 2, opacity: 0 }}
              transition={{
                duration: 1.8,
                repeat: Infinity,
                delay,
                ease: 'easeOut',
              }}
              style={{
                width: config.orbit,
                height: config.orbit,
              }}
            />
          ))}
        </>
      )}

      {/* Ambient glow — always present */}
      <div
        className="absolute inset-0 rounded-full bg-primary/10 blur-md"
        style={{ opacity: state === 'idle' ? 0.3 : 0.6 }}
      />
    </div>
  );
}
