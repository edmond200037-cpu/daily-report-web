import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
try {
  const server = await createServer({
    resolve: { preserveSymlinks: true },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
  });
  await server.listen();
  const address = 'http://127.0.0.1:5173/#daily';
  console.log(`\n本機測試站已啟動：${address}\n請保持這個視窗開啟；按 Ctrl+C 停止。\n`);
  if (process.platform === 'win32') {
    const browser = spawn('explorer.exe', [address], { stdio: 'ignore' });
    browser.on('error', () => console.log('請手動開啟上方網址。'));
    browser.unref();
  }
} catch (error) {
  console.error('本機測試站啟動失敗：', error.message);
  process.exitCode = 1;
}
