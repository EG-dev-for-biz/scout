import { css } from "@emotion/react";
import React from "react";

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <div css={css({ fontSize: "16px", fontWeight: "600", color: "#e8e8ec" })}>
      {children}
    </div>
  );
}
