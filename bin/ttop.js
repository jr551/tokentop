#!/usr/bin/env node

// tokentop npm entry point
// Detects runtime and either loads directly (Bun) or re-launches with Bun (Node).
// Standalone binaries at: https://github.com/tokentopapp/tokentop/releases

if (typeof globalThis.Bun !== 'undefined') {
  await import('../src/cli.ts');
} else {
  const { execFileSync } = await import('node:child_process');
  const { fileURLToPath } = await import('node:url');
  const { dirname, join } = await import('node:path');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const cli = join(__dirname, '..', 'src', 'cli.ts');

  try {
    execFileSync('bun', ['run', cli, ...process.argv.slice(2)], {
      stdio: 'inherit',
    });
  } catch (err) {
    // If bun ran but the command itself failed, propagate the exit code
    if (err.status) process.exit(err.status);

    // Bun not found — show install instructions
    console.error(
      [
        '',
        'tokentop requires the Bun runtime (https://bun.sh)',
        '',
        'Install Bun:',
        '  curl -fsSL https://bun.sh/install | bash',
        '',
        'Or download a standalone binary (no Bun needed):',
        '  https://github.com/tokentopapp/tokentop/releases',
        '',
        'Homebrew (macOS/Linux):',
        '  brew install tokentopapp/tap/tokentop',
        '',
        'Scoop (Windows):',
        '  scoop bucket add tokentop https://github.com/tokentopapp/scoop-tokentop',
        '  scoop install tokentop',
        '',
      ].join('\n'),
    );
    process.exit(1);
  }
}
