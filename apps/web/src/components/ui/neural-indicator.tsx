// ============================================================================
//  Avesia — NeuralIndicator (v2 — Pulse Wave)
//
//  A refined AI activity indicator. Instead of orbiting particles that look
//  like a "stuck bug", this uses a smooth concentric pulse wave — like a
//  heartbeat or sonar — that clearly communicates "alive and thinking."
//
//  Three states:
//  - idle: gentle breathing glow (ambient presence)
//  - active: steady pulse wave (AI is on, listening)
//  - processing: rapid pulse + shimmer ring (AI is working)
// ============================================================================

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

type NeuralState = 'idle' | 'active' | 'processing';

interface NeuralIndicatorProps {
  state?: NeuralState;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_PX = {
  sm: 20,
  md: 32,
  lg: 48,
};

export function NeuralIndicator({
  state = 'idle',
  size = 'md',
  className,
}: NeuralIndicatorProps): React.JSX.Element {
  const px = SIZE_PX[size];
  const isProcessing = state === 'processing';
  const isActive = state === 'active' || isProcessing;

  return (
    <div
      className={cn('relative flex items-center justify-center', className)}
      style={{ width: px, height: px }}
    >
      {/* Concentric pulse waves — the signature animation */}
      {isActive &&
        [0, 1].map((ring) => (
          <motion.div
            key={ring}
            className="absolute rounded-full border border-primary/40"
            initial={{ scale: 0.3, opacity: 0 }}
            animate={{ scale: 1.4, opacity: [0, 0.5, 0] }}
            transition={{
              duration: isProcessing ? 1.4 : 2.2,
              repeat: Infinity,
              delay: ring * (isProcessing ? 0.5 : 0.8),
              ease: [0.4, 0, 0.2, 1],
            }}
            style={{ width: px, height: px }}
          />
        ))}

      {/* Shimmer ring — only when processing (extra intensity) */}
      {isProcessing && (
        <motion.div
          className="absolute rounded-full"
          style={{
            width: px,
            height: px,
            background: `conic-gradient(from 0deg, transparent, hsl(var(--primary) / 0.3), transparent)`,
          }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* Core node — always present, breathing */}
      <motion.div
        className="relative rounded-full bg-primary"
        style={{
          width: px * 0.3,
          height: px * 0.3,
          boxShadow: isActive
            ? `0 0 ${px * 0.3}px hsl(var(--primary) / 0.5)`
            : `0 0 ${px * 0.15}px hsl(var(--primary) / 0.3)`,
        }}
        animate={{
          scale: isProcessing ? [1, 1.25, 1] : [1, 1.1, 1],
          opacity: [0.85, 1, 0.85],
        }}
        transition={{
          duration: isProcessing ? 1 : 2.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}
