import { $ } from 'bun';
import { platform } from 'os';

/**
 * Custom clipboard implementation with platform-specific fallbacks.
 *
 * NOTE: OpenTUI 0.1.76+ has native OSC 52 clipboard support via a private
 * `Clipboard` class on the renderer (renderer.copyToClipboardOSC52). However,
 * we keep our own implementation because:
 *   1. The renderer's clipboard is a private property — not part of the public API.
 *   2. Our implementation handles tmux/screen DCS passthrough for OSC 52.
 *   3. We provide platform-specific fallbacks (osascript on macOS, xclip/xsel/
 *      wl-copy on Linux, PowerShell on Windows) for terminals that don't support
 *      OSC 52, giving broader cross-platform coverage.
 *
 * If OpenTUI exposes a public clipboard API in the future, revisit this.
 */

/**
 * Writes text to clipboard via OSC 52 escape sequence.
 * This allows clipboard operations to work over SSH by having
 * the terminal emulator handle the clipboard locally.
 */
function writeOsc52(text: string): void {
  if (!process.stdout.isTTY) return;
  const base64 = Buffer.from(text).toString('base64');
  const osc52 = `\x1b]52;c;${base64}\x07`;
  // tmux and screen require DCS passthrough wrapping
  const passthrough = process.env['TMUX'] || process.env['STY'];
  const sequence = passthrough ? `\x1bPtmux;\x1b${osc52}\x1b\\` : osc52;
  process.stdout.write(sequence);
}

let copyMethod: ((text: string) => Promise<void>) | null = null;

function getCopyMethod(): (text: string) => Promise<void> {
  if (copyMethod) return copyMethod;

  const os = platform();

  if (os === 'darwin' && Bun.which('osascript')) {
    copyMethod = async (text: string) => {
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      await $`osascript -e 'set the clipboard to "${escaped}"'`.nothrow().quiet();
    };
    return copyMethod;
  }

  if (os === 'linux') {
    if (process.env['WAYLAND_DISPLAY'] && Bun.which('wl-copy')) {
      copyMethod = async (text: string) => {
        const proc = Bun.spawn(['wl-copy'], { stdin: 'pipe', stdout: 'ignore', stderr: 'ignore' });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
      return copyMethod;
    }
    if (Bun.which('xclip')) {
      copyMethod = async (text: string) => {
        const proc = Bun.spawn(['xclip', '-selection', 'clipboard'], {
          stdin: 'pipe',
          stdout: 'ignore',
          stderr: 'ignore',
        });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
      return copyMethod;
    }
    if (Bun.which('xsel')) {
      copyMethod = async (text: string) => {
        const proc = Bun.spawn(['xsel', '--clipboard', '--input'], {
          stdin: 'pipe',
          stdout: 'ignore',
          stderr: 'ignore',
        });
        proc.stdin.write(text);
        proc.stdin.end();
        await proc.exited.catch(() => {});
      };
      return copyMethod;
    }
  }

  if (os === 'win32') {
    copyMethod = async (text: string) => {
      const proc = Bun.spawn(
        [
          'powershell.exe',
          '-NonInteractive',
          '-NoProfile',
          '-Command',
          '[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())',
        ],
        {
          stdin: 'pipe',
          stdout: 'ignore',
          stderr: 'ignore',
        }
      );
      proc.stdin.write(text);
      proc.stdin.end();
      await proc.exited.catch(() => {});
    };
    return copyMethod;
  }

  // Fallback - OSC52 only
  copyMethod = async () => {};
  return copyMethod;
}

export async function copyToClipboard(text: string): Promise<void> {
  writeOsc52(text);
  await getCopyMethod()(text);
}
