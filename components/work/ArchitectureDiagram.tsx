import { Stagger } from "@/components/motion/Stagger";
import { StaggerItem } from "@/components/motion/StaggerItem";
import { Badge } from "@/components/ui/Badge";
import { cx } from "@/lib/utils/cx";

export type ArchitectureNode = {
  label: string;
  technology?: string;
  description?: string;
  highlight?: boolean;
};

export type ArchitectureLayer = {
  /** Names a layer of parallel nodes, which render as one labelled group. */
  label?: string;
  nodes: readonly ArchitectureNode[];
};

type ArchitectureDiagramProps = {
  caption: string;
  /** Qualifies what the diagram represents, such as "Development architecture". */
  status: string;
  layers: readonly ArchitectureLayer[];
  supporting?: ArchitectureLayer;
};

const columns: Record<number, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
};

/**
 * A top-to-bottom architecture: an `<ol>` of layers, each a list of nodes.
 * Parallel nodes sit side by side from `sm` and stack inside their group
 * below it, so narrow screens get a vertical flow, not a shrunken diagram.
 */
export function ArchitectureDiagram({
  caption,
  status,
  layers,
  supporting,
}: ArchitectureDiagramProps) {
  return (
    <figure className="rounded-container border border-border bg-surface-muted p-card">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <figcaption className="font-mono text-meta text-muted-foreground uppercase">
          {caption}
        </figcaption>
        <Badge>{status}</Badge>
      </div>

      <Stagger as="ol" className="mt-6">
        {layers.map((layer, index) => (
          <StaggerItem
            key={layer.label ?? layer.nodes[0]?.label}
            as="li"
            className="flex flex-col items-center"
          >
            {index > 0 && <Arrow />}
            <Layer layer={layer} />
          </StaggerItem>
        ))}
      </Stagger>

      {supporting && (
        <div className="mt-8 border-t border-border pt-6">
          <Layer layer={supporting} />
        </div>
      )}
    </figure>
  );
}

function Layer({ layer }: { layer: ArchitectureLayer }) {
  const grouped = layer.nodes.length > 1 || layer.label;

  const nodes = (
    <ul
      aria-label={layer.label}
      className={cx(
        "grid w-full gap-3",
        grouped ? columns[layer.nodes.length] : "max-w-xs",
      )}
    >
      {layer.nodes.map((node) => (
        <li key={node.label}>
          <Node node={node} />
        </li>
      ))}
    </ul>
  );

  if (!grouped) {
    return nodes;
  }

  return (
    <div className="w-full rounded-container border border-dashed border-border-strong p-3">
      {layer.label && (
        <p
          aria-hidden="true"
          className="mb-3 font-mono text-meta text-muted-foreground uppercase"
        >
          {layer.label}
        </p>
      )}
      {nodes}
    </div>
  );
}

function Node({ node }: { node: ArchitectureNode }) {
  return (
    <div
      className={cx(
        "h-full rounded-control border bg-surface px-4 py-3 text-center",
        node.highlight ? "border-accent" : "border-border-strong",
      )}
    >
      <p
        className={cx(
          "text-body-sm font-medium",
          node.highlight && "text-accent",
        )}
      >
        {node.label}
      </p>
      {node.technology && (
        <p className="mt-0.5 font-mono text-meta text-muted-foreground uppercase">
          {node.technology}
        </p>
      )}
      {node.description && (
        <p className="mt-1.5 text-caption text-muted-foreground">
          {node.description}
        </p>
      )}
    </div>
  );
}

function Arrow() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 12 28"
      className="h-7 w-3 fill-none stroke-border-strong"
    >
      <path d="M6 0v26M1.5 21.5 6 26l4.5-4.5" />
    </svg>
  );
}
