// ============================================================================
//  Web — ResizableSplit
//
//  A horizontal split panel with a draggable divider. Used in the Session Room
//  to let the user resize the transcript and copilot panels.
//
//  - Default: 50/50
//  - Min: 25% per panel
//  - Max: 75% per panel
//  - Persists the ratio in localStorage
//  - Double-click divider resets to 50/50
// ============================================================================

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

interface ResizableSplitProps {
  left: ReactNode;
  right: ReactNode;
  storageKey?: string;
  minPct?: number;
  maxPct?: number;
}

export function ResizableSplit({
  left,
  right,
  storageKey = 'avesia:session-split',
  minPct = 25,
  maxPct = 75,
}: ResizableSplitProps): React.JSX.Element {
  const [leftPct, setLeftPct] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  // Load saved ratio
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const val = Number(saved);
      if (!Number.isNaN(val) && val >= minPct && val <= maxPct) {
        setLeftPct(val);
      }
    }
  }, [storageKey, minPct, maxPct]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      setLeftPct(Math.max(minPct, Math.min(maxPct, pct)));
    };

    const handleMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        localStorage.setItem(storageKey, String(leftPct));
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [leftPct, storageKey, minPct, maxPct]);

  const handleDoubleClick = useCallback(() => {
    setLeftPct(50);
    localStorage.setItem(storageKey, '50');
  }, [storageKey]);

  return (
    <div ref={containerRef} className="flex flex-1 gap-0 overflow-hidden min-h-0">
      {/* Left panel */}
      <div style={{ width: `${leftPct}%` }} className="min-w-0 h-full">
        {left}
      </div>

      {/* Divider */}
      <div
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        className="group relative flex w-1.5 shrink-0 cursor-col-resize items-center justify-center transition-colors hover:bg-primary/20"
        title="Arraste para redimensionar • Duplo clique para resetar"
      >
        <div className="h-12 w-0.5 rounded-full bg-border transition-colors group-hover:bg-primary/50" />
      </div>

      {/* Right panel */}
      <div style={{ width: `${100 - leftPct}%` }} className="min-w-0 h-full">
        {right}
      </div>
    </div>
  );
}
