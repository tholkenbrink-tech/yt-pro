"use client";

import Image from "next/image";
import type { PlaylistItemPreview } from "@/lib/types";
import { formatDuration } from "@/lib/format";

interface Props {
  items: PlaylistItemPreview[];
  selectedIds: Set<number>;
  onToggle: (index: number) => void;
}

export function PlaylistItemList({ items, selectedIds, onToggle }: Props) {
  return (
    <ul className="divide-y divide-gray-200 dark:divide-gray-800">
      {items.map((item, index) => (
        <li key={`${item.youtubeId}-${index}`} className="flex items-center gap-3 py-2">
          <input
            type="checkbox"
            checked={selectedIds.has(index)}
            onChange={() => onToggle(index)}
            className="h-5 w-5 shrink-0 accent-brand dark:accent-brand-dark"
            aria-label={`${item.title} auswählen`}
          />
          {item.thumbnail && (
            <Image
              src={item.thumbnail}
              alt=""
              width={64}
              height={36}
              unoptimized
              className="h-9 w-16 shrink-0 rounded object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.title}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {formatDuration(item.duration)}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
