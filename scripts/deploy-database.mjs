import { spawnSync } from 'node:child_process';
import pg from './db-tests/node_modules/pg/lib/index.js';
import { checkMigrationHistory } from './sync-migration-preflight.mjs';

const databaseUrl = process.env.SUPABASE_DB_URL;
if (!databaseUrl) throw new Error('缺少 SUPABASE_DB_URL；停止前端發布，未修改資料庫。');
const client = new pg.Client({ connectionString: databaseUrl });
try {
  await client.connect();
  await client.query('begin read only');
  await checkMigrationHistory(client);
  await client.query('commit');
} catch (error) {
  await client.query('rollback').catch(() => {});
  const message = String(error?.message ?? '').split(databaseUrl).join('[DB URL]').replace(/postgres(?:ql)?:\/\/\S+/gi, '[DB URL]');
  throw new Error(`資料庫發布預檢未通過：${message}`);
} finally { await client.end(); }
const run = (dryRun) => {
  const args = ['db', 'push', '--db-url', databaseUrl, '--skip-vault', '--yes', ...(dryRun ? ['--dry-run'] : [])];
  const result = spawnSync(process.env.SUPABASE_CLI || 'supabase', args, { encoding: 'utf8', windowsHide: true, env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1', SUPABASE_NO_UPDATE_NOTIFIER: '1' } });
  // The connection string is a secret, including when a child prints an error.
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.split(databaseUrl).join('[DB URL]').replace(/postgres(?:ql)?:\/\/\S+/gi, '[DB URL]');
  process.stdout.write(output);
  if (result.error || result.status !== 0) throw new Error('資料庫 migration 未完成；停止前端發布，請核對 schema 與 migration history。');
};
run(true);
run(false);
