import { css } from "@emotion/react";
import React from "react";

export function Row({
  children,
  gap,
  style,
}: {
  children: React.ReactNode;
  gap?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      css={css({ display: "flex", flexDirection: "row", gap: gap || "0", flexWrap: "wrap" })}
      style={style}
    >
      {children}
    </div>
  );
}
