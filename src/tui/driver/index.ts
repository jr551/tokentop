export {
  createDriver,
  type Driver,
  type DriverOptions,
  type CaptureResult,
  type WaitOptions,
  type StableOptions,
  type KeyModifiers,
} from './driver.ts';

export {
  diffFrames,
  highlightDiff,
  createCharDiff,
  type DiffResult,
  type LineChange,
  type DiffOptions,
} from './diff.ts';

export {
  assertSnapshot,
  listGoldenFiles,
  deleteGoldenFile,
  getGoldenFile,
  type AssertResult,
  type AssertOptions,
  type GoldenFile,
  type GoldenFileInfo,
} from './assertions.ts';

export {
  createRecorder,
  replayRecording,
  saveRecording,
  loadRecording,
  listRecordings,
  deleteRecording,
  type Recorder,
  type Recording,
  type RecordedCommand,
  type RecorderOptions,
  type ReplayOptions,
  type ReplayResult,
} from './recorder.ts';

export {
  createCoverageTracker,
  detectViewFromFrame,
  formatCoverageReport,
  type CoverageTracker,
  type CoverageReport,
  type ViewVisit,
} from './coverage.ts';
