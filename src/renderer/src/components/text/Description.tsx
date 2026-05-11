import { css } from "@emotion/react";
import React from "react";

export function Description({ children }: { children: React.ReactNode }) {
  return (
    <div css={css({ fontSize: "12px", fontWeight: "300", color: "#8f8f9c" })}>
      {children}
    </div>
  );
}
