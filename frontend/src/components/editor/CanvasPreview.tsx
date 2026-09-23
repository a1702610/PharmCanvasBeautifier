import { useEffect, useMemo, useRef, type MouseEvent } from "react";
import "../../render/preview.css";
import { sanitizePreviewHtml } from "../../render/sanitize";

interface Props {
  html: string;
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function CanvasPreview({ html, activeIndex, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const safe = useMemo(() => sanitizePreviewHtml(html), [html]);

  useEffect(() => {
    const groups = ref.current?.querySelectorAll<HTMLElement>(".dp-panel-group") ?? [];
    groups.forEach((group, i) => group.classList.toggle("is-active", i === activeIndex));
  }, [safe, activeIndex]);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const heading = (e.target as HTMLElement).closest(".dp-panel-heading");
    if (!heading || !ref.current) return;
    const groups = Array.from(ref.current.querySelectorAll(".dp-panel-group"));
    const index = groups.indexOf(heading.parentElement as Element);
    if (index >= 0) onSelect(index);
  }

  return <div ref={ref} className="canvas-preview" onClick={handleClick} dangerouslySetInnerHTML={{ __html: safe }} />;
}
