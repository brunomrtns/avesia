// ============================================================================
//  Avesia — AIThinkingState
//
//  A premium "AI is thinking" indicator that shows visible reasoning rather
//  than a generic spinner. Displays animated neural nodes with connection
//  lines, communicating that the AI is actively processing information.
//
//  Inspired by:
//  - AI-first "thinking states 2.0" (show steps, not just "loading")
//  - Ambient intelligence (subtle presence, not intrusive)
//  - Material Motion (natural easing, purposeful animation)
// ============================================================================

import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

interface AIThinkingStateProps {
  message?: string;
  steps?: string[];
  className?: string;
}

export function AIThinkingState({
  message = 'IA processando',
  steps,
  className,
}: AIThinkingStateProps): React.JSX.Element {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center space-y-4 text-center py-8',
        className,
      )}
    >
      {/* Neural network visualization — 3 nodes with connecting lines */}
      <div className="relative h-16 w-32">
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 128 64">
          {/* Connection lines */}
          {[0, 1, 2].map((i) => (
            <motion.line
              key={i}
              x1={i === 0 ? 16 : i === 1 ? 64 : 112}
              y1={32}
              x2={i === 0 ? 64 : i === 1 ? 112 : 64}
              y2={32}
              stroke="hsl(var(--primary))"
              strokeWidth={1}
              strokeDasharray="4 4"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: [0, 0.4, 0.2] }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                delay: i * 0.2,
                ease: 'easeInOut',
              }}
            />
          ))}
        </svg>

        {/* Nodes */}
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-primary"
            style={{ left: `${[12.5, 50, 87.5][i]}%` }}
            animate={{
              scale: [1, 1.4, 1],
              opacity: [0.5, 1, 0.5],
              boxShadow: [
                '0 0 0 0 hsl(var(--primary-glow) / 0)',
                '0 0 12px 2px hsl(var(--primary-glow) / 0.4)',
                '0 0 0 0 hsl(var(--primary-glow) / 0)',
              ],
            }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              delay: i * 0.3,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>

      {/* Message */}
      <div className="space-y-1.5">
        <p className="text-sm font-medium text-foreground font-clinical">
          {message}
        </p>
        {steps && steps.length > 0 && (
          <motion.p
            className="text-xs text-foreground-muted"
            animate={{ opacity: [0.4, 0.8, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            {steps.join(' · ')}
          </motion.p>
        )}
      </div>

      {/* Progress dots — subtle, calm */}
      <div className="flex gap-1.5">
        {[0, 1, 2].map((i) => (
          <motion.div
            key={i}
            className="h-1 w-1 rounded-full bg-primary/50"
            animate={{
              opacity: [0.2, 1, 0.2],
              y: [0, -3, 0],
            }}
            transition={{
              duration: 1.2,
              repeat: Infinity,
              delay: i * 0.15,
              ease: 'easeInOut',
            }}
          />
        ))}
      </div>
    </div>
  );
}
