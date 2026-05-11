import { css } from "@emotion/react";
import React, { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isShow?: boolean;
}

const baseStyle = css({
  color: "#e8e8ec",
  backgroundColor: "#1e1e2280",
  backdropFilter: "blur(8px)",
  border: "1px solid #2a2a2e",
  padding: "0.75rem 1.25rem",
  borderRadius: "8px",
  fontWeight: "400",
  fontSize: "13px",
  cursor: "pointer",
  transition: "0.15s",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  ":hover": { backgroundColor: "#2a2a30" },
  ":disabled": { opacity: 0.4, cursor: "not-allowed" },
});

export function NextButton(props: ButtonProps) {
  const { isShow, ...rest } = props;
  return (
    <button
      css={[baseStyle, css({ position: "absolute", zIndex: 9999, right: "2rem", bottom: "2rem", display: isShow ? "flex" : "none" })]}
      {...rest}
    >
      {props.children}
    </button>
  );
}

export function PrevButton(props: ButtonProps) {
  const { isShow, ...rest } = props;
  return (
    <button
      css={[baseStyle, css({ position: "absolute", zIndex: 9999, left: "2rem", bottom: "2rem", display: isShow ? "flex" : "none" })]}
      {...rest}
    >
      {props.children}
    </button>
  );
}

export function Button(props: ButtonProps) {
  const { isShow, ...rest } = props;
  return (
    <button
      css={[baseStyle, css({ display: isShow ? "flex" : "none" })]}
      {...rest}
    >
      {props.children}
    </button>
  );
}
