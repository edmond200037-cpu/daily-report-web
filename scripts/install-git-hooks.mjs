import { spawnSync } from 'node:child_process';

const current = spawnSync('git', ['config', '--get', 'core.hooksPath'], { encoding: 'utf8' });
if (current.status !== 0 && current.status !== 1) {
  process.stderr.write(current.stderr || '無法讀取 Git hook 設定。\n');
  process.exit(current.status ?? 1);
}
const existing = current.stdout.trim();
if (existing && existing !== '.githooks') {
  console.error(`已有 hooksPath：${existing}。請先整合現有 hook，避免覆蓋。`);
  process.exit(1);
}
const result = spawnSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log('已啟用 pre-push：測試與正式建置失敗時停止推送。');
