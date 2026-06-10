import { memo, useEffect, useRef } from "react";
import type { Viz } from "@viz-js/viz";
import DOMPurify from "dompurify";
import type { VisualPayload } from "../types";

interface Props {
  visual: VisualPayload;
  viz: Viz | null;
  altLabel?: string;
}

function VisualRenderer({ visual, viz, altLabel = "OS diagram" }: Props) {
  const svgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visual.kind !== "graphviz" || !svgRef.current) return;

    if (!viz) {
      svgRef.current.textContent = "Loading diagram…";
      return;
    }

    try {
      const svgString = viz.renderString(visual.data, { format: "svg" });
      const clean = DOMPurify.sanitize(svgString, {
        USE_PROFILES: { svg: true },
        ADD_ATTR: ["xmlns"],
      });
      svgRef.current.innerHTML = clean;
    } catch {
      svgRef.current.textContent = "[Diagram unavailable]";
    }
  }, [visual, viz]);

  if (visual.kind === "matplotlib") {
    return (
      <img
        src={`data:image/png;base64,${visual.data}`}
        alt={altLabel}
        style={{
          maxWidth: "100%",
          borderRadius: 8,
          marginTop: 12,
          display: "block",
        }}
      />
    );
  }

  // Graphviz — render into div; show skeleton if viz not yet loaded
  return (
    <div
      ref={svgRef}
      role="img"
      aria-label={viz ? altLabel : "Loading diagram…"}
      style={{
        marginTop: 12,
        overflowX: "auto",
        minHeight: viz ? undefined : 80,
        background: viz ? undefined : "#f4f4f4",
        borderRadius: 6,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        color: "var(--color-muted)",
        fontSize: 13,
      }}
    />
  );
}

export default memo(VisualRenderer);
