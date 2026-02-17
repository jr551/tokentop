import { useCallback, useEffect, useRef, useState } from "react";

export interface ExitAnimationItem<T> {
  item: T;
  isExiting: boolean;
  exitIntensity: number;
}

export interface UseExitAnimationOptions<T> {
  durationMs?: number;
  fps?: number;
  getKey: (item: T) => string;
  /** Absolute number of changed items to trigger a bulk skip (default 10) */
  bulkThreshold?: number;
}

export interface UseExitAnimationResult<T> {
  items: ExitAnimationItem<T>[];
  /** True when a bulk change just happened (skip entrance animations) */
  isBulkChange: boolean;
}

interface ExitingEntry<T> {
  item: T;
  startTime: number;
}

export function useExitAnimation<T>(
  items: T[],
  options: UseExitAnimationOptions<T>,
): UseExitAnimationResult<T> {
  const { durationMs = 500, fps = 30, getKey, bulkThreshold = 10 } = options;
  const prevKeysRef = useRef<Set<string>>(new Set());
  const prevItemsRef = useRef<Map<string, T>>(new Map());
  const exitingRef = useRef<Map<string, ExitingEntry<T>>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, forceUpdate] = useState(0);

  const tick = useCallback(() => {
    const now = Date.now();
    let anyActive = false;

    for (const [key, entry] of exitingRef.current) {
      if (now - entry.startTime >= durationMs) {
        exitingRef.current.delete(key);
      } else {
        anyActive = true;
      }
    }

    forceUpdate((c: number) => c + 1);

    if (anyActive) {
      timerRef.current = setTimeout(tick, 1000 / fps);
    } else {
      timerRef.current = null;
    }
  }, [durationMs, fps]);

  // Diff runs synchronously during render so isBulkChange is available
  // in the same pass that mounts new rows (effects run too late).
  const currentKeys = new Set(items.map(getKey));
  const prevKeys = prevKeysRef.current;

  let removedCount = 0;
  for (const key of prevKeys) {
    if (!currentKeys.has(key)) removedCount++;
  }
  let addedCount = 0;
  for (const key of currentKeys) {
    if (!prevKeys.has(key)) addedCount++;
  }

  const totalAffected = removedCount + addedCount;
  const isBulkChange = prevKeys.size > 0 && totalAffected >= bulkThreshold;

  // Queue exiting items during render so they appear in the same frame
  // they leave `items` — avoids a one-frame gap (flash).
  if (isBulkChange) {
    exitingRef.current.clear();
  } else {
    const prevItems = prevItemsRef.current;
    for (const [key, item] of prevItems) {
      if (!currentKeys.has(key) && !exitingRef.current.has(key)) {
        exitingRef.current.set(key, { item, startTime: Date.now() });
      }
    }
  }

  useEffect(() => {
    if (isBulkChange && timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    } else if (exitingRef.current.size > 0 && timerRef.current === null) {
      timerRef.current = setTimeout(tick, 1000 / fps);
    }

    prevKeysRef.current = currentKeys;
    const newPrevItems = new Map<string, T>();
    for (const item of items) {
      newPrevItems.set(getKey(item), item);
    }
    prevItemsRef.current = newPrevItems;
  }, [items, getKey, tick, fps, isBulkChange, currentKeys]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const now = Date.now();
  const result: ExitAnimationItem<T>[] = [];

  for (const item of items) {
    result.push({ item, isExiting: false, exitIntensity: 1 });
  }

  if (!isBulkChange) {
    for (const [, entry] of exitingRef.current) {
      const elapsed = now - entry.startTime;
      const progress = Math.min(1, elapsed / durationMs);
      const eased = progress ** 2;

      result.push({
        item: entry.item,
        isExiting: true,
        exitIntensity: Math.max(0, 1 - eased),
      });
    }
  }

  return { items: result, isBulkChange };
}
