import type { CliRenderer } from "@opentui/core";
import { useRenderer } from "@opentui/react";
import { createContext, useContext } from "react";

/**
 * Context to signal we're in test/headless mode where renderer may not be available.
 * When TestModeContext is true, useSafeRenderer returns null instead of throwing.
 */
export const TestModeContext = createContext<boolean>(false);

/**
 * Hook that safely gets the renderer, returning null in test mode.
 * Use this instead of useRenderer() directly when the component needs to work
 * in both production (real renderer) and test/headless mode (no renderer).
 */
export function useSafeRenderer(): CliRenderer | null {
  const isTestMode = useContext(TestModeContext);

  if (isTestMode) {
    return null;
  }

  return useRenderer();
}
