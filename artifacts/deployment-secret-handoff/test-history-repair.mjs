import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, open, readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import pg from '../audit-fixes/db-tools/node_modules/pg/lib/index.js';
const report = JSON.parse(await readFile(process.argv[2], 'utf8'));
const binary = path.resolve('artifacts/audit-fixes/db-tools/node_modules/@embedded-postgres/windows-x64/native/bin');
const data = await mkdtemp(path.resolve('artifacts/audit-fixes/pg-data-history-'));
const run = (exe, args) => new Promise((resolve, reject) => {
  const child = spawn(path.join(binary, exe), args, { windowsHide: true, stdio: ['ignore','pipe','pipe'] });
  let output = ''; child.stdout.on('data', x => output += x); child.stderr.on('data', x => output += x);
  child.on('error', reject); child.on('exit', code => code === 0 ? resolve(output) : reject(new Error(output)));
});
await run('initdb.exe', ['-D',data,'-U','postgres','-A','trust','--no-locale','-E','UTF8']);
const probe = createServer(); await new Promise(resolve => probe.listen(0,'127.0.0.1',resolve));
const port = probe.address().port; await new Promise(resolve => probe.close(resolve));
const log = await open(path.join(data,'server.log'),'w');
const server = spawn(path.join(binary,'postgres.exe'), ['-D',data,'-h','127.0.0.1','-p',String(port),'-c','wal_level=logical'], { windowsHide:true, stdio:['ignore',log.fd,log.fd] });
const exited = new Promise(resolve => server.on('exit',resolve));
let db;
try {
  for (let attempt=0;attempt<100;attempt++) {
    const admin = new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'postgres'});
    try { await admin.connect(); await admin.query('create database audit_history'); break; }
    catch(error) { if(attempt===99)throw error; await new Promise(resolve=>setTimeout(resolve,100)); }
    finally { await admin.end(); }
  }
  db = new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'audit_history'}); await db.connect();
  await db.query(`create role authenticated nologin; create role anon nologin;
    create schema auth; create schema extensions; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth,public to authenticated,anon;
    alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;
    alter default privileges in schema public grant execute on functions to anon;
    create publication supabase_realtime;`);
  for(const file of (await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql') && f.slice(0,12)<='202609230002').sort()) await db.query(await readFile(`supabase/migrations/${file}`,'utf8'));
  await db.query(report.functions.find(f=>f.name==='apply_memory_entry_mutation').definition);
  await db.query('revoke all on function public.apply_memory_entry_mutation(uuid,uuid,bigint,jsonb) from anon;');
  await db.query(`create schema supabase_migrations; create table supabase_migrations.schema_migrations(version text primary key,name text,statements text[]);
    insert into supabase_migrations.schema_migrations(version,name) select '20260921000'||x,'fixture' from generate_series(1,6) x;`);
  const repair = await readFile('supabase/repairs/reconcile-deployment-history.sql','utf8');
  const original = report.functions.find(f=>f.name==='apply_daily_field_mutation').definition;
  await db.query(original);
  // The original CRLF source and server-rendered definition are normalized by guards.
  await db.query(report.functions.find(f=>f.name==='collaboration_apply_array').definition.replace('p_items := coalesce','p_items :=  coalesce'));
  await assert.rejects(db.query(repair),/Function changed/); await db.query('rollback');
  assert.equal((await db.query("select count(*)::int as n from supabase_migrations.schema_migrations where version like '20260923%'")).rows[0].n,0);
  await db.query(report.functions.find(f=>f.name==='collaboration_apply_array').definition);
  console.log('PASS changed function blocks repair and preserves history');

  const id='00000000-0000-4000-8000-000000000001'; const site='00000000-0000-4000-8000-000000000002';
  const entry='00000000-0000-4000-8000-000000000003';
  await db.query('insert into auth.users values($1);',[id]);
  await db.query("insert into public.sites(id,name,created_by) values($1,'fixture',$2)",[site,id]);
  const payload={stores:{trade_types:[{id:entry,normalizedName:'fixture',status:'confirmed'}]}};
  await db.query('insert into public.memory_snapshots(site_id,payload,revision,updated_by) values($1,$2,1,$3)',[site,payload,id]);
  await db.query("insert into public.memory_entries(id,site_id,kind,normalized_name,payload,status,updated_by) values($1,$2,'trade','fixture',$3,'confirmed',$4)",[entry,site,payload.stores.trade_types[0],id]);
  await assert.rejects(db.query(repair),/Snapshot import ledger mismatch/); await db.query('rollback');
  console.log('PASS missing import ledger blocks repair');
  await db.query('insert into public.memory_snapshot_migrations(site_id,snapshot_revision,source_count,migrated_count,content_hash) values($1,1,1,1,md5(jsonb_build_object($2::text,$3::jsonb)::text))',[site,entry,payload.stores.trade_types[0]]);
  const before=await db.query('select id,payload,usage_count,revision from public.memory_entries order by id');
  await db.query(repair);
  assert.equal((await db.query("select count(*)::int as n from supabase_migrations.schema_migrations where version like '20260923%'")).rows[0].n,2);
  assert.deepEqual((await db.query('select id,payload,usage_count,revision from public.memory_entries order by id')).rows,before.rows);
  for(const signature of ['apply_daily_field_mutation(uuid,uuid,uuid,date,jsonb)','apply_water_field_mutation(uuid,uuid,jsonb)','apply_memory_entry_mutation(uuid,uuid,bigint,jsonb)']) {
    const result=(await db.query("select has_function_privilege('anon',$1,'EXECUTE') as anon,has_function_privilege('authenticated',$1,'EXECUTE') as member",[`public.${signature}`])).rows[0];
    assert.equal(result.anon,false); assert.equal(result.member,true);
  }
  console.log('PASS correct ledger repairs two versions, preserves application records and member access, removes anonymous write access');
  await db.query(repair);
  console.log('PASS repeat repair is idempotent');
  await db.query('alter table auth.users add column email text, add column email_confirmed_at timestamptz, add column encrypted_password text');
  const adminId='7aebdb1c-ddfc-4258-a8b2-fb5a5ff90df7'; const checkerId='8f8f33e9-ef79-4c73-bea7-2e178e2169dc';
  await db.query("insert into auth.users(id,email,email_confirmed_at,encrypted_password) values($1,'com2990518@gmail.com',now(),'fixture'),($2,'chitienlagan@gmail.com',now(),'fixture')",[adminId,checkerId]);
  const setup=await readFile('supabase/repairs/provision-deployment-check-site.sql','utf8');
  const firstSetup=await db.query(setup);
  const setupRows=firstSetup.at(-1).rows;
  assert.equal(setupRows[0].status,'deployment_check_site_ready');
  const checkSite=setupRows[0].SUPABASE_SYNC_CHECK_SITE_ID;
  assert.deepEqual((await db.query('select user_id,role from public.site_members where site_id=$1 order by role',[checkSite])).rows,[{user_id:checkerId,role:'editor'},{user_id:adminId,role:'owner'}]);
  assert.equal((await db.query('select count(*)::int as n from public.site_members where user_id=$1',[checkerId])).rows[0].n,1);
  await db.query(setup);
  assert.equal((await db.query('select count(*)::int as n from public.sites where id=$1',[checkSite])).rows[0].n,1);
  console.log('PASS checker receives editor access only to one empty test site; repeated setup reuses same site');
  await db.query("update public.site_members set role='owner' where site_id=$1 and user_id=$2",[checkSite,checkerId]);
  await assert.rejects(db.query(setup),/Existing roles differ/); await db.query('rollback');
  assert.equal((await db.query('select role from public.site_members where site_id=$1 and user_id=$2',[checkSite,checkerId])).rows[0].role,'owner');
  console.log('PASS unexpected existing role is not overwritten');
  await db.query("update public.site_members set role='editor' where site_id=$1 and user_id=$2",[checkSite,checkerId]);
  await db.query("insert into public.site_members(site_id,user_id,role) values($1,$2,'viewer')",[site,checkerId]);
  await assert.rejects(db.query(setup),/already belongs to another site/); await db.query('rollback');
  console.log('PASS checker with other-site access is rejected for review');
} finally {
  await db?.end(); await run('pg_ctl.exe',['-D',data,'-m','fast','-w','stop']); await exited; await log.close();
}
