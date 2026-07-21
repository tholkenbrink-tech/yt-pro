interface Props {
  isAutomatic: boolean;
  sourceName?: string;
}

export function SourceBadge({ isAutomatic, sourceName }: Props) {
  return (
    <span className="inline-flex items-center gap-1 rounded-pill bg-text-muted/15 px-2 py-0.5 text-meta text-text-secondary">
      {isAutomatic ? `Automatisch: ${sourceName ?? "Quelle"}` : "Manuell"}
    </span>
  );
}
