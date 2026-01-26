import type { ReactNode } from 'react';
import { RGBA } from '@opentui/core';

/** Standardized z-index tiers for overlay layering */
export const Z_INDEX = {
  HUD: 10,
  MODAL: 50,
  MODAL_HIGH: 100,
  TOAST: 200,
} as const;

/** 50% black overlay for modal dimming */
export const OVERLAY_BG = RGBA.fromValues(0.0, 0.0, 0.0, 0.5);

interface ModalBackdropProps {
  children: ReactNode;
  zIndex?: number;
  onBackdropClick?: () => void;
}

export function ModalBackdrop({ 
  children, 
  zIndex = Z_INDEX.MODAL,
  onBackdropClick,
}: ModalBackdropProps) {
  return (
    <box
      position="absolute"
      left={0}
      top={0}
      width="100%"
      height="100%"
      justifyContent="center"
      alignItems="center"
      zIndex={zIndex}
      backgroundColor={OVERLAY_BG}
      {...(onBackdropClick ? { onClick: onBackdropClick } : {})}
    >
      {children}
    </box>
  );
}
