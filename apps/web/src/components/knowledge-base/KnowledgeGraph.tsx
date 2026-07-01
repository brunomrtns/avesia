import { useEffect, useRef, useCallback, useState } from 'react';
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  type SimulationNodeDatum,
} from 'd3-force';

interface KnowledgeGraphProps {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    group: string;
    parentId?: string | null;
    path?: string;
    sourceCount?: number;
    fileType?: string;
    community?: number | null;
    description?: string | null;
  }>;
  edges: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    strength: number;
  }>;
  onNodeSelect: (nodeId: string, nodeType: string) => void;
  selectedNodeId: string | null;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
}

// ── Neural Calm palette for graph ──────────────────────────────────────────
// Warm clinical colors that match the design system identity.
const TYPE_COLORS: Record<string, string> = {
  topic: 'hsl(172, 70%, 42%)',      // primary teal
  concept: 'hsl(190, 65%, 45%)',    // lighter teal
  document: 'hsl(38, 85%, 58%)',    // accent amber
  PERSON: 'hsl(340, 60%, 55%)',     // warm rose
  METHOD: 'hsl(38, 85%, 58%)',      // amber
  DISORDER: 'hsl(152, 60%, 45%)',   // sage
  TECHNIQUE: 'hsl(200, 70%, 50%)',  // sky
  PLACE: 'hsl(80, 50%, 50%)',       // olive
  TERM: 'hsl(200, 6%, 55%)',        // neutral
};

const EDGE_COLORS: Record<string, string> = {
  RELATED_TO: 'hsl(200, 6%, 40%)',
  DERIVED_FROM: 'hsl(190, 50%, 45%)',
  IS_A: 'hsl(152, 50%, 42%)',
  PART_OF: 'hsl(200, 60%, 48%)',
  CONTRADICTS: 'hsl(0, 60%, 52%)',
  SUPPORTS: 'hsl(152, 55%, 45%)',
  MENTIONS: 'hsl(200, 6%, 45%)',
};

// Community palette — warm, harmonious with the design system
const COMMUNITY_PALETTE = [
  'hsl(172, 70%, 42%)',  // teal
  'hsl(38, 85%, 58%)',   // amber
  'hsl(152, 60%, 45%)',  // sage
  'hsl(200, 70%, 50%)',  // sky
  'hsl(340, 55%, 55%)',  // rose
  'hsl(280, 50%, 55%)',  // violet
  'hsl(80, 45%, 50%)',   // olive
  'hsl(20, 70%, 55%)',   // orange
  'hsl(170, 50%, 48%)',  // cyan-teal
  'hsl(50, 70%, 55%)',   // gold
  'hsl(320, 45%, 52%)',  // pink
  'hsl(190, 55%, 48%)',  // light teal
];

function communityColor(community: number | null | undefined): string | null {
  if (community === null || community === undefined) return null;
  return COMMUNITY_PALETTE[community % COMMUNITY_PALETTE.length] ?? 'hsl(190, 55%, 48%)';
}

export function KnowledgeGraph({ nodes, edges, onNodeSelect, selectedNodeId }: KnowledgeGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const simRef = useRef<ReturnType<typeof forceSimulation<SimNode>> | null>(null);

  const updateDimensions = useCallback(() => {
    if (containerRef.current) {
      setDimensions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    }
  }, []);

  useEffect(() => {
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [updateDimensions]);

  useEffect(() => {
    simRef.current?.stop();
    simRef.current = null;

    if (nodes.length === 0) return;

    const simNodes: SimNode[] = nodes.map((n) => ({ id: n.id }));
    const validLinks: Array<{ source: string; target: string }> = edges
      .filter((e) => nodes.some((n) => n.id === e.source) && nodes.some((n) => n.id === e.target))
      .map((e) => ({ source: e.source, target: e.target }));

    const sim = forceSimulation(simNodes)
      .force('charge', forceManyBody().strength(-280))
      .force('link', forceLink<SimNode, { source: string; target: string }>(validLinks).id((d: SimNode) => d.id).distance(90))
      .force('center', forceCenter(dimensions.width / 2, dimensions.height / 2))
      .force('collide', forceCollide(38));

    sim.on('tick', () => {
      const g = svgRef.current?.querySelector('g.graph-content');
      if (!g) return;

      const linkEls = g.querySelectorAll<SVGLineElement>('.edge');
      const linkForce = sim.force('link');
      if (linkForce) {
        const links = (linkForce as unknown as { links(): Array<{ source: SimulationNodeDatum; target: SimulationNodeDatum }> }).links();
        links.forEach((lnk, i) => {
          if (linkEls[i]) {
            linkEls[i].setAttribute('x1', String(lnk.source.x ?? 0));
            linkEls[i].setAttribute('y1', String(lnk.source.y ?? 0));
            linkEls[i].setAttribute('x2', String(lnk.target.x ?? 0));
            linkEls[i].setAttribute('y2', String(lnk.target.y ?? 0));
          }
        });
      }

      const nodeEls = g.querySelectorAll<SVGGElement>('.node');
      sim.nodes().forEach((node, i) => {
        if (nodeEls[i]) {
          nodeEls[i].setAttribute('transform', `translate(${node.x ?? 0},${node.y ?? 0})`);
        }
      });
    });

    simRef.current = sim;
    return () => { sim.stop(); };
  }, [nodes, edges, dimensions]);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[500px] w-full overflow-hidden rounded-lg border border-border bg-background mesh-bg-dense"
    >
      {/* Ambient glow — top */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-glow opacity-40" />

      <svg ref={svgRef} width={dimensions.width} height={dimensions.height} className="relative w-full h-full">
        <defs>
          {/* Glow filter for selected nodes */}
          <filter id="node-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* Subtle glow for all nodes */}
          <filter id="node-soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g className="graph-content">
          {/* Edges — neural connection lines */}
          {edges.map((edge) => {
            const isHighlighted = hoveredNode === edge.source || hoveredNode === edge.target;
            return (
              <line
                key={edge.id}
                className="edge"
                stroke={EDGE_COLORS[edge.type] ?? 'hsl(200, 6%, 40%)'}
                strokeWidth={isHighlighted ? 2 : 1}
                strokeOpacity={isHighlighted ? 0.8 : 0.35}
                strokeDasharray={edge.type === 'CONTRADICTS' ? '4,4' : 'none'}
                style={{ transition: 'stroke-opacity 0.2s, stroke-width 0.2s' }}
              />
            );
          })}

          {/* Nodes — neural nodes with glow */}
          {nodes.map((node) => {
            const commColor = node.type === 'concept' ? communityColor(node.community) : null;
            const color = commColor ?? TYPE_COLORS[node.type] ?? TYPE_COLORS[node.group] ?? 'hsl(200, 6%, 55%)';
            const isSelected = selectedNodeId === node.id;
            const isHovered = hoveredNode === node.id;
            const isDimmed = hoveredNode !== null && !isHovered && !edges.some(
              (e) => (e.source === hoveredNode && e.target === node.id) || (e.target === hoveredNode && e.source === node.id),
            );
            const r = node.type === 'document' ? 7 : node.type === 'concept' && node.sourceCount
              ? Math.min(28, 10 + node.sourceCount * 2.5) : 12;

            return (
              <g
                key={node.id}
                className="node"
                style={{
                  cursor: 'pointer',
                  opacity: isDimmed ? 0.3 : 1,
                  transition: 'opacity 0.2s',
                }}
                onClick={() => onNodeSelect(node.id, node.type)}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Ambient glow circle — always present */}
                <circle
                  r={r + 4}
                  fill={color}
                  fillOpacity={0.08}
                  style={{ transition: 'fill-opacity 0.2s' }}
                />
                {/* Main node */}
                <circle
                  r={r}
                  fill={color}
                  fillOpacity={isSelected ? 1 : isHovered ? 0.9 : 0.75}
                  stroke={isSelected ? 'hsl(0, 0%, 100%)' : isHovered ? color : 'transparent'}
                  strokeWidth={isSelected ? 2 : isHovered ? 1.5 : 0}
                  filter={isSelected ? 'url(#node-glow)' : 'url(#node-soft-glow)'}
                  style={{ transition: 'fill-opacity 0.2s, stroke 0.2s' }}
                />
                {/* Label */}
                <text
                  textAnchor="middle"
                  dy={r + 14}
                  fill={isSelected ? 'hsl(0, 0%, 100%)' : 'hsl(200, 6%, 65%)'}
                  fontSize={node.type === 'document' ? 9 : 10}
                  fontWeight={isSelected ? 600 : 400}
                  style={{ pointerEvents: 'none', transition: 'fill 0.2s' }}
                >
                  {node.label.length > 18 ? `${node.label.slice(0, 16)}..` : node.label}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Empty state — neural themed */}
      {nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center">
          {/* Animated neural node */}
          <svg viewBox="0 0 60 60" className="h-16 w-16">
            <circle cx="30" cy="30" r="6" fill="hsl(var(--primary))" opacity="0.8">
              <animate attributeName="r" values="5;7;5" dur="3s" repeatCount="indefinite" />
            </circle>
            <circle cx="30" cy="30" r="12" fill="none" stroke="hsl(var(--primary))" strokeWidth="1" opacity="0.3">
              <animate attributeName="r" values="10;16;10" dur="3s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.3;0;0.3" dur="3s" repeatCount="indefinite" />
            </circle>
          </svg>
          <div>
            <p className="text-sm font-medium text-foreground-secondary">Nenhum conhecimento indexado</p>
            <p className="mt-1 text-xs text-foreground-muted">Faça upload de documentos para construir sua base</p>
          </div>
        </div>
      )}

      {/* Legend — refined, minimal */}
      <div className="absolute bottom-3 left-3 flex flex-wrap gap-3 rounded-md border border-border-subtle bg-surface/80 px-3 py-2 backdrop-blur-sm">
        <span className="flex items-center gap-1.5 text-[10px] text-foreground-secondary">
          <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS.topic }} /> Tópicos
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-foreground-secondary">
          <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS.concept }} /> Conceitos
        </span>
        <span className="flex items-center gap-1.5 text-[10px] text-foreground-secondary">
          <span className="h-2 w-2 rounded-full" style={{ background: TYPE_COLORS.document }} /> Documentos
        </span>
      </div>

      {/* Node count — subtle, top right */}
      {nodes.length > 0 && (
        <div className="absolute right-3 top-3 flex items-center gap-1.5 rounded-md border border-border-subtle bg-surface/80 px-2.5 py-1.5 backdrop-blur-sm">
          <div className="h-1.5 w-1.5 rounded-full bg-primary animate-ai-pulse" />
          <span className="font-mono text-[10px] tabular-nums text-foreground-secondary">
            {nodes.length} nós · {edges.length} conexões
          </span>
        </div>
      )}
    </div>
  );
}
