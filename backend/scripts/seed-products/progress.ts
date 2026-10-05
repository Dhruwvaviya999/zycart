/**
 * A progress bar on a terminal, and quarter-way lines anywhere else — CI logs
 * and piped output would otherwise fill with carriage returns.
 */
export function createProgress(label: string, total: number) {
  const interactive = Boolean(process.stdout.isTTY);
  const started = Date.now();
  let lastQuarter = -1;

  const render = (done: number) => {
    const ratio = total === 0 ? 1 : Math.min(1, done / total);
    const percent = Math.round(ratio * 100);

    if (interactive) {
      const width = 28;
      const filled = Math.round(ratio * width);
      process.stdout.write(
        `\r  ${label.padEnd(12)} [${'█'.repeat(filled)}${'░'.repeat(width - filled)}] ${String(percent).padStart(3)}%  ${done}/${total}`,
      );
      return;
    }

    const quarter = Math.floor(ratio * 4);
    if (quarter > lastQuarter) {
      lastQuarter = quarter;
      console.log(`  ${label.padEnd(12)} ${String(percent).padStart(3)}%  ${done}/${total}`);
    }
  };

  return {
    update: render,
    finish(done = total) {
      render(done);
      if (interactive) process.stdout.write(`  (${((Date.now() - started) / 1000).toFixed(1)}s)\n`);
    },
  };
}
