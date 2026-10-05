import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, open } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from './db-tools/node_modules/pg/lib/index.js';
import { runDatabaseTests } from '../../scripts/db-behavior-tests.mjs';
const root = path.resolve('.');
const binary = path.join(root, 'artifacts/audit-fixes/db-tools/node_modules/@embedded-postgres/windows-x64/native/bin');
const data = await mkdtemp(path.join(root, 'artifacts/audit-fixes/pg-data-'));
const run = (exe, args) => new Promise((resolve, reject) => {
  const child = spawn(path.join(binary, exe), args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x);
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(output)));
});
await run('initdb.exe', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '-E', 'UTF8']);
const server = createServer(); await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port; await new Promise(resolve => server.close(resolve));
const log = await open(path.join(data, 'server.log'), 'w');
const child = spawn(path.join(binary, 'postgres.exe'), ['-D', data, '-h', '127.0.0.1', '-p', String(port), '-c', 'wal_level=logical'], { windowsHide: true, stdio: ['ignore', log.fd, log.fd] });
const exited = new Promise(resolve => child.on('exit', resolve));
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    const client = new pg.Client({ connectionString: `postgres://postgres@127.0.0.1:${port}/postgres` });
    try { await client.connect(); await client.query('create database audit_tests'); ready = true; break; }
    catch (error) { if (attempt === 99) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
    finally { await client.end(); }
  }
  if (!ready) throw new Error('Postgres did not become ready');
  console.log('PostgreSQL 17.10, fresh local database, auth.uid fixture; no production connection.');
  await runDatabaseTests({ Client: pg.Client, connectionString: `postgres://postgres@127.0.0.1:${port}/audit_tests` });
} finally {
  await run('pg_ctl.exe', ['-D', data, '-m', 'fast', '-w', 'stop']);
  await exited; await log.close();
}
