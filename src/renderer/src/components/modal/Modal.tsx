import React, { useEffect, useState } from "react";
import { css, keyframes } from "@emotion/react";

type ModalType = {
  children?: React.ReactNode;
  onClose?: () => void;
  isOpen?: boolean;
  isScroll?: boolean;
};

const fadeInBackground = keyframes`
  from { backdrop-filter: brightness(100%) }
  to { backdrop-filter: brightness(60%) }
`;
const fadeOutBackground = keyframes`
  from { backdrop-filter: brightness(60%) }
  to { backdrop-filter: brightness(100%) }
`;
const fadeIn = keyframes`
  from { transform: translateY(-10px); opacity: 0.4; }
  to { transform: translateY(0px); opacity: 1; }
`;
const fadeOut = keyframes`
  from { transform: translateY(0px); opacity: 1; }
  to { transform: translateY(-10px); opacity: 0; }
`;

export function Modal({ children, onClose, isOpen, isScroll = false }: ModalType) {
  const [open, setOpen] = useState(false);
  const [fadeAnim, setFadeAnim] = useState(`${fadeIn} 0.3s forwards`);
  const [bgAnim, setBgAnim] = useState(`${fadeInBackground} 0.3s forwards`);

  const handleClose = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.id !== "modal") return;
    setFadeAnim(`${fadeOut} 0.3s forwards`);
    setBgAnim(`${fadeOutBackground} 0.3s forwards`);
    setTimeout(() => {
      onClose?.();
      setOpen(false);
    }, 280);
  };

  useEffect(() => {
    if (isOpen) {
      setOpen(true);
      setFadeAnim(`${fadeIn} 0.3s forwards`);
      setBgAnim(`${fadeInBackground} 0.3s forwards`);
    } else {
      setFadeAnim(`${fadeOut} 0.3s forwards`);
      setBgAnim(`${fadeOutBackground} 0.3s forwards`);
      const t = setTimeout(() => {
        onClose?.();
        setOpen(false);
      }, 280);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  if (!open) return null;

  return (
    <div
      onClick={handleClose}
      id="modal"
      css={css({
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        width: "100%",
        height: "100%",
        position: "fixed",
        top: 0,
        left: 0,
        animation: bgAnim,
        zIndex: 3000,
      })}
    >
      <div
        css={css({
          width: "100%",
          maxWidth: "480px",
          height: isScroll ? "70vh" : "auto",
          margin: "2rem",
          padding: "1.6rem",
          backgroundColor: "#1e1e22",
          borderRadius: "12px",
          border: "1px solid #2a2a2e",
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          overflow: "auto",
          animation: fadeAnim,
          color: "#e8e8ec",
        })}
      >
        {children}
      </div>
    </div>
  );
}
