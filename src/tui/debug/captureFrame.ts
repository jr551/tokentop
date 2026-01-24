/**
 * Frame Capture Utilities for TUI Debugging
 * 
 * Provides functions to capture the current terminal render buffer as text,
 * enabling AI-assisted debugging of visual issues.
 * 
 * @see docs/debugging.md for comprehensive usage guide
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { CliRenderer } from '@opentui/core';
import { PATHS } from '@/storage/paths.ts';

/** Metadata stored alongside each frame capture */
export interface FrameMetadata {
  timestamp: string;
  label: string;
  width: number;
  height: number;
  frameIndex?: number;
  burstId?: string;
}

/** Result from a frame capture operation */
export interface CaptureResult {
  framePath: string;
  metadataPath: string;
  metadata: FrameMetadata;
}

/** Configuration for burst recording */
export interface BurstConfig {
  /** Number of frames to capture */
  frameCount: number;
  /** Minimum interval between captures in ms (to avoid duplicates) */
  minInterval?: number;
}

/**
 * Get the frames output directory
 */
export function getFramesDir(): string {
  return path.join(PATHS.data.logs, 'frames');
}

/**
 * Capture the current render buffer as a text string.
 * This captures exactly what is displayed in the terminal.
 * 
 * @param renderer - The CliRenderer instance
 * @returns The current frame as a text string with line breaks
 */
export function captureFrameText(renderer: CliRenderer): string {
  const bytes = renderer.currentRenderBuffer.getRealCharBytes(true);
  return new TextDecoder().decode(bytes);
}

/**
 * Generate a timestamp-based filename prefix
 */
function generateTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

/**
 * Capture the current frame and write to files.
 * 
 * Creates two files:
 * - frame-{timestamp}-{label}.txt - The raw frame text
 * - frame-{timestamp}-{label}.json - Metadata (dimensions, timestamp, etc.)
 * 
 * @param renderer - The CliRenderer instance
 * @param label - Optional label for the capture (default: "manual")
 * @returns Information about the captured files
 */
export async function captureFrameToFile(
  renderer: CliRenderer,
  label = 'manual'
): Promise<CaptureResult> {
  const dir = getFramesDir();
  await fs.mkdir(dir, { recursive: true });

  const ts = generateTimestamp();
  const baseName = `frame-${ts}-${label}`;
  
  const frame = captureFrameText(renderer);
  const metadata: FrameMetadata = {
    timestamp: new Date().toISOString(),
    label,
    width: renderer.width,
    height: renderer.height,
  };

  const framePath = path.join(dir, `${baseName}.txt`);
  const metadataPath = path.join(dir, `${baseName}.json`);

  await Promise.all([
    fs.writeFile(framePath, frame, 'utf-8'),
    fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8'),
  ]);

  return { framePath, metadataPath, metadata };
}

/**
 * Burst recorder for capturing multiple sequential frames.
 * Useful for debugging dynamic/animated issues.
 */
export class BurstRecorder {
  private renderer: CliRenderer;
  private config: Required<BurstConfig>;
  private burstId: string;
  private framesCaptured: number = 0;
  private lastCaptureTime: number = 0;
  private isRecording: boolean = false;
  private cleanupFn: (() => void) | null = null;
  private resolvePromise: ((results: CaptureResult[]) => void) | null = null;
  private capturedFrames: CaptureResult[] = [];

  constructor(renderer: CliRenderer, config: BurstConfig) {
    this.renderer = renderer;
    this.config = {
      frameCount: config.frameCount,
      minInterval: config.minInterval ?? 100, // Default 100ms between frames
    };
    this.burstId = generateTimestamp();
  }

  /**
   * Start recording frames. Returns a promise that resolves when
   * the burst is complete (all frames captured).
   */
  async start(): Promise<CaptureResult[]> {
    if (this.isRecording) {
      throw new Error('Burst recording already in progress');
    }

    this.isRecording = true;
    this.framesCaptured = 0;
    this.capturedFrames = [];

    // Set up post-process hook to capture after each render
    const postProcessFn = async () => {
      if (!this.isRecording) return;

      const now = Date.now();
      if (now - this.lastCaptureTime < this.config.minInterval) {
        return; // Skip if too soon
      }

      this.lastCaptureTime = now;
      
      try {
        const result = await this.captureFrame();
        this.capturedFrames.push(result);
        this.framesCaptured++;

        if (this.framesCaptured >= this.config.frameCount) {
          this.stop();
        }
      } catch {
        // Silently continue on capture errors
      }
    };

    // Add the post-process function
    this.renderer.addPostProcessFn(postProcessFn);
    this.cleanupFn = () => {
      this.renderer.removePostProcessFn(postProcessFn);
    };

    return new Promise((resolve) => {
      this.resolvePromise = resolve;
    });
  }

  /**
   * Stop recording and return captured frames.
   */
  stop(): CaptureResult[] {
    if (!this.isRecording) {
      return this.capturedFrames;
    }

    this.isRecording = false;
    
    if (this.cleanupFn) {
      this.cleanupFn();
      this.cleanupFn = null;
    }

    if (this.resolvePromise) {
      this.resolvePromise(this.capturedFrames);
      this.resolvePromise = null;
    }

    return this.capturedFrames;
  }

  /**
   * Check if currently recording
   */
  get recording(): boolean {
    return this.isRecording;
  }

  /**
   * Get progress info
   */
  get progress(): { captured: number; total: number } {
    return {
      captured: this.framesCaptured,
      total: this.config.frameCount,
    };
  }

  private async captureFrame(): Promise<CaptureResult> {
    const dir = path.join(getFramesDir(), `burst-${this.burstId}`);
    await fs.mkdir(dir, { recursive: true });

    const frameNum = String(this.framesCaptured + 1).padStart(4, '0');
    const baseName = `frame-${frameNum}`;
    
    const frame = captureFrameText(this.renderer);
    const metadata: FrameMetadata = {
      timestamp: new Date().toISOString(),
      label: 'burst',
      width: this.renderer.width,
      height: this.renderer.height,
      frameIndex: this.framesCaptured + 1,
      burstId: this.burstId,
    };

    const framePath = path.join(dir, `${baseName}.txt`);
    const metadataPath = path.join(dir, `${baseName}.json`);

    await Promise.all([
      fs.writeFile(framePath, frame, 'utf-8'),
      fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8'),
    ]);

    return { framePath, metadataPath, metadata };
  }
}

/**
 * Create a burst recorder for capturing multiple frames.
 * 
 * @example
 * ```ts
 * const recorder = createBurstRecorder(renderer, { frameCount: 5 });
 * const frames = await recorder.start();
 * console.log(`Captured ${frames.length} frames`);
 * ```
 */
export function createBurstRecorder(
  renderer: CliRenderer,
  config: BurstConfig
): BurstRecorder {
  return new BurstRecorder(renderer, config);
}
