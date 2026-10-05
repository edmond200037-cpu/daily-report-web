import { spawnSync } from 'node:child_process';
import { copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The CLI owns the timestamp; do not invent a filename or apply production SQL.
const root = fileURLToPath(new URL('../', import.meta.url));
const directory = new URL('../supabase/migrations/', import.meta.url);
const before = new Set(readdirSync(directory));
const run = spawnSync(process.env.SUPABASE_CLI || 'supabase', ['migration', 'new', 'audit_hardening'], { cwd: root, stdio: 'inherit', windowsHide: true });
if (run.error || run.status !== 0) throw run.error || new Error('Supabase CLI 無法建立 migration；修復 SQL 保留在 supabase/repairs。');
const created = readdirSync(directory).filter(name => !before.has(name) && /^\d+_audit_hardening\.sql$/.test(name));
if (created.length !== 1) throw new Error('無法唯一辨識 CLI 建立的 migration。');
copyFileSync(new URL('../supabase/repairs/audit_hardening.sql', import.meta.url), new URL(created[0], directory));
console.log(`Prepared supabase/migrations/${created[0]}; 尚未套用資料庫。`);
