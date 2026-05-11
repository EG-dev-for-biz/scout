import { css } from "@emotion/react";
import React from "react";

export function Column({
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
      css={css({ display: "flex", flexDirection: "column", gap: gap || "0" })}
      style={style}
    >
      {children}
    </div>
  );
}
