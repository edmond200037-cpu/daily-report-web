import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';

const root = new URL('../', import.meta.url);
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const users = { owner: uuid(1), owner2: uuid(2), editor: uuid(3), viewer: uuid(4), outsider: uuid(5), removed: uuid(6) };
const site = uuid(100), otherSite = uuid(101);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** This runner only accepts a fresh, explicitly named local audit database. */
export async function runDatabaseTests({ Client, connectionString, initialize = true, repairFile = new URL('supabase/repairs/audit_hardening.sql', root) }) {
  const url = new URL(connectionString);
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.pathname.startsWith('/audit_'), 'Refusing a non-local or non-audit database');
  const admin = new Client({ connectionString }); await admin.connect();
  const clients = [];
  let passed = 0;
  const check = async (name, run) => { await run(); passed++; console.log(`PASS ${name}`); };
  const denied = async (run, code = '42501') => { await assert.rejects(run, error => error.code === code); };
  const login = async (user, role = 'authenticated') => {
    const client = new Client({ connectionString }); await client.connect(); clients.push(client);
    await client.query(`set role ${role}`); await client.query("select set_config('request.jwt.claim.sub',$1,false)", [user ?? '']); return client;
  };
  const rpc = async (client, name, args) => {
    const result = await client.query(`select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`, args);
    return result.rows[0].result;
  };
  const daily = (client, date, changes, mutation = randomUUID(), entity = randomUUID()) => rpc(client, 'apply_daily_field_mutation', [site, mutation, entity, date, JSON.stringify(changes)]);
  const water = (client, changes, mutation = randomUUID()) => rpc(client, 'apply_water_field_mutation', [site, mutation, JSON.stringify(changes)]);
  const trade = (id, name = '模板') => ({ id, tradeTypeId: null, tradeNameSnapshot: name, vendorId: null, vendorNameSnapshot: '甲', workerCount: '2', status: 'draft', sortOrder: 0, workItems: [], materialEntries: [], createdAt: '', updatedAt: '' });
  const work = (id, text) => ({ id, startFloorRaw: '', startFloorNormalized: null, endFloorRaw: '', endFloorNormalized: null, locationId: null, locationTextSnapshot: '', taskId: null, taskTextSnapshot: text, note: '', sortOrder: 0, createdAt: '', updatedAt: '' });
  const upsert = (collection, value, parentId) => ({ op: 'upsert', collection, id: value.id ?? value.pointId, value, ...(parentId ? { parentId } : {}) });

  // A held site lock makes both real connections wait before either first write.
  const concurrent = async (calls) => {
    await admin.query('begin'); await admin.query("select pg_advisory_xact_lock(hashtextextended('audit-site:' || $1,0))", [site]);
    const pending = calls.map(({ run }) => run());
    const settled = Promise.allSettled(pending);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const pids = calls.map(({ client }) => client.processID);
        const { rows } = await admin.query("select count(*)::int as count from pg_stat_activity where pid=any($1::int[]) and wait_event='advisory'", [pids]);
        if (rows[0].count === calls.length) { waiting = true; break; }
        await sleep(10);
      }
      assert.ok(waiting, 'Both connections must reach the advisory-lock barrier');
    } finally { await admin.query('commit'); }
    return settled;
  };

  try {
    if (initialize) {
      const { rows } = await admin.query("select to_regclass('public.sites') as sites"); assert.equal(rows[0].sites, null, 'Database must be empty');
      await admin.query(`
        create role authenticated nologin; create role anon nologin;
        create schema auth; create schema extensions; create table auth.users(id uuid primary key);
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth,public to authenticated,anon;
        grant execute on function auth.uid() to authenticated,anon;
        alter default privileges in schema public grant select,insert,update,delete on tables to authenticated,anon;
        create publication supabase_realtime;
      `);
      for (const file of (await readdir(new URL('supabase/migrations/', root))).filter(file => file.endsWith('.sql')).sort()) {
        await admin.query(await readFile(new URL(`supabase/migrations/${file}`, root), 'utf8'));
      }
      if (repairFile) await admin.query(await readFile(repairFile, 'utf8'));
    }
    await admin.query('insert into auth.users(id) select unnest($1::uuid[])', [Object.values(users)]);
    await admin.query('insert into public.sites(id,name,created_by) values($1,$2,$3),($4,$5,$6)', [site, '測試工地', users.owner, otherSite, '另一工地', users.outsider]);
    for (const [user, role] of [['owner', 'owner'], ['owner2', 'owner'], ['editor', 'editor'], ['viewer', 'viewer']]) await admin.query('insert into public.site_members(site_id,user_id,role) values($1,$2,$3)', [site, users[user], role]);
    await admin.query('insert into public.site_members(site_id,user_id,role) values($1,$2,$3)', [otherSite, users.outsider, 'owner']);
    const sessions = {};
    for (const [name, user] of Object.entries(users)) sessions[name] = await login(user);
    sessions.anon = await login(null, 'anon');

    for (const name of ['owner', 'owner2', 'editor', 'viewer', 'outsider', 'removed', 'anon']) {
      const member = ['owner', 'owner2', 'editor', 'viewer'].includes(name);
      await check(`RLS ${name} only sees accessible sites`, async () => {
        const { rows } = await sessions[name].query('select id from public.sites where id=$1', [site]); assert.equal(rows.length, member ? 1 : 0);
        if (member) { const other = await sessions[name].query('select id from public.sites where id=$1', [otherSite]); assert.equal(other.rows.length, 0); }
      });
      await check(`RPC ${name} read permission`, async () => {
        if (member) await sessions[name].query('select * from public.pull_site_changes($1,0,100)', [site]);
        else await denied(() => sessions[name].query('select * from public.pull_site_changes($1,0,100)', [site]));
      });
      await check(`RPC ${name} edit permission`, async () => {
        const run = () => daily(sessions[name], '2026-10-01', []);
        if (['owner', 'owner2', 'editor'].includes(name)) assert.equal((await run()).status, 'applied'); else await denied(run);
      });
    }
    await check('RLS direct insert is denied even for an editor', async () => {
      await denied(() => sessions.editor.query('insert into public.daily_drafts(id,site_id,report_date,payload,updated_by) values($1,$2,$3,$4,$5)', [randomUUID(), site, '2026-10-02', '{}', users.editor]));
    });
    await check('forbidden cross-site water and membership mutation', async () => {
      await denied(() => rpc(sessions.editor, 'apply_water_field_mutation', [otherSite, randomUUID(), '[]']));
      await denied(() => rpc(sessions.viewer, 'update_site_member_role', [site, users.editor, 'owner']));
    });
    await check('first daily patches from two connections both survive', async () => {
      const a = randomUUID(), b = randomUUID();
      const results = await concurrent([
        { client: sessions.owner, run: () => daily(sessions.owner, '2026-10-05', [upsert('tradeSections', trade(a, '模板'))]) },
        { client: sessions.editor, run: () => daily(sessions.editor, '2026-10-05', [upsert('tradeSections', trade(b, '鋼筋'))]) },
      ]);
      assert.ok(results.every(result => result.status === 'fulfilled' && result.value.status === 'applied'));
      const { rows } = await admin.query('select payload from public.daily_drafts where site_id=$1 and report_date=$2', [site, '2026-10-05']);
      assert.deepEqual(new Set(rows[0].payload.tradeSections.map(row => row.id)), new Set([a, b]));
    });
    await check('first water patches from two connections both survive', async () => {
      const a = { id: randomUUID(), name: 'A井', normalizedName: 'a井', sortOrder: 0 }, b = { id: randomUUID(), name: 'B井', normalizedName: 'b井', sortOrder: 1 };
      const results = await concurrent([{ client: sessions.owner, run: () => water(sessions.owner, [upsert('points', a)]) }, { client: sessions.editor, run: () => water(sessions.editor, [upsert('points', b)]) }]);
      assert.ok(results.every(result => result.status === 'fulfilled' && result.value.status === 'applied'));
      const { rows } = await admin.query('select payload from public.water_snapshots where site_id=$1', [site]); assert.equal(rows[0].payload.points.length, 2);
    });
    await check('same mutation concurrent replay emits one change', async () => {
      const a = await login(users.editor), b = await login(users.editor), mutation = randomUUID(), entity = randomUUID();
      const results = await concurrent([{ client: a, run: () => daily(a, '2026-10-06', [], mutation, entity) }, { client: b, run: () => daily(b, '2026-10-06', [], mutation, entity) }]);
      assert.ok(results.every(result => result.status === 'fulfilled' && result.value.status === 'applied'));
      assert.ok(results.some(result => result.value.replayed === true));
      const { rows } = await admin.query('select count(*)::int as count from public.site_changes where site_id=$1 and entity_id=$2', [site, entity]); assert.equal(rows[0].count, 1);
    });
    await check('legacy conflict replay retains conflict outcome and payload', async () => {
      const mutation = randomUUID(), entity = randomUUID(), payload = { id: 'current', date: '2026-10-05', tradeSections: [] };
      const args = [site, mutation, entity, 0, JSON.stringify(payload)];
      const first = await rpc(sessions.editor, 'apply_daily_draft_mutation', args), replay = await rpc(sessions.editor, 'apply_daily_draft_mutation', args);
      assert.equal(first.status, 'conflict'); assert.deepEqual(replay, { ...first, replayed: true });
    });
    await check('v1 and v2 first write share the same lock', async () => {
      const id = randomUUID();
      const results = await concurrent([
        { client: sessions.owner, run: () => rpc(sessions.owner, 'apply_daily_draft_mutation', [site, randomUUID(), randomUUID(), 0, JSON.stringify({ id: 'current', date: '2026-10-07', siteNameSnapshot: '舊版', tradeSections: [], contacts: [], supplies: [], standaloneMaterialEntries: [], specialItems: [] })]) },
        { client: sessions.editor, run: () => daily(sessions.editor, '2026-10-07', [upsert('tradeSections', trade(id))]) },
      ]);
      assert.ok(results.every(result => result.status === 'fulfilled'));
      const { rows } = await admin.query('select payload from public.daily_drafts where site_id=$1 and report_date=$2', [site, '2026-10-07']); assert.equal(rows[0].payload.tradeSections[0].id, id);
    });
    await check('deleted IDs stay tombstoned; a new undo identity is visible', async () => {
      const old = randomUUID(), restored = randomUUID();
      await daily(sessions.editor, '2026-10-08', [upsert('tradeSections', trade(old))]);
      await daily(sessions.editor, '2026-10-08', [{ op: 'delete', collection: 'tradeSections', id: old }]);
      await daily(sessions.editor, '2026-10-08', [upsert('tradeSections', trade(old)), upsert('tradeSections', trade(restored))]);
      const { rows } = await admin.query('select payload from public.daily_drafts where site_id=$1 and report_date=$2', [site, '2026-10-08']); assert.deepEqual(rows[0].payload.tradeSections.map(row => row.id), [restored]);
    });
    const invalidChanges = [
      [{ op: 'upsert', collection: 'points', id: 'x\" onmouseover=\"marker', value: { id: 'x\" onmouseover=\"marker', name: 'X' } }],
      [{ op: 'set', collection: '$document', id: 'daily', field: 'date', value: '2000-01-01' }],
      [{ op: 'set', collection: 'unknown', id: randomUUID(), field: 'name', value: 'X' }],
      [{ op: 'upsert', collection: 'tradeSections', id: randomUUID(), value: { id: randomUUID() } }],
      [{ op: 'set', collection: 'tradeSections', id: randomUUID(), field: 'id', value: randomUUID() }],
      [{ op: 'set', collection: 'tradeSections', id: randomUUID(), field: 'workerCount', value: {} }],
      [{ op: 'set', collection: 'contacts', id: randomUUID(), field: 'items', value: [null] }],
      [{ op: 'set', collection: 'contacts', id: randomUUID(), field: 'items', value: [{ id: randomUUID(), content: {} }] }],
      [{ op: 'set', collection: 'tradeSections', id: randomUUID(), field: 'status', value: 'unknown' }],
    ];
    for (const [index, changes] of invalidChanges.entries()) await check(`invalid schema ${index} rejected`, async () => {
      await denied(() => index === 0 ? water(sessions.editor, changes) : daily(sessions.editor, '2026-10-09', changes), '22023');
    });
    await check('oversize payload rejected', async () => { await denied(() => daily(sessions.editor, '2026-10-09', [{ op: 'set', collection: '$document', id: 'daily', field: 'siteNameSnapshot', value: 'x'.repeat(1048577) }]), '22023'); });
    await check('memory conflict replay is preserved', async () => {
      const id = randomUUID(), payload = { id, name: '測試', normalizedName: '測試', status: 'confirmed' };
      const entry = { id, kind: 'trade', parent_id: null, normalized_name: '測試', payload, status: 'confirmed', usage_count: 0, finalized_usage_count: 0 };
      await rpc(sessions.editor, 'apply_memory_entry_mutation', [site, randomUUID(), 0, JSON.stringify(entry)]);
      const args = [site, randomUUID(), 0, JSON.stringify(entry)];
      const first = await rpc(sessions.editor, 'apply_memory_entry_mutation', args), replay = await rpc(sessions.editor, 'apply_memory_entry_mutation', args);
      assert.equal(first.status, 'conflict'); assert.deepEqual(replay, { ...first, replayed: true });
    });
    await check('approved or rejected requests cannot overwrite existing members', async () => {
      const approved = randomUUID(), rejected = randomUUID(), pending = randomUUID();
      await admin.query('insert into public.join_requests(id,site_id,user_id,status) values($1,$2,$3,$4),($5,$2,$6,$7),($8,$2,$9,$10)', [approved, site, users.owner, 'approved', rejected, users.removed, 'rejected', pending, users.owner2, 'pending']);
      await rpc(sessions.owner, 'approve_site_member', [approved, 'editor']);
      await rpc(sessions.owner, 'approve_site_member', [rejected, 'viewer']);
      await rpc(sessions.owner, 'approve_site_member', [pending, 'editor']);
      const { rows } = await admin.query('select user_id,role from public.site_members where site_id=$1', [site]);
      assert.equal(rows.find(row => row.user_id === users.owner).role, 'owner'); assert.equal(rows.find(row => row.user_id === users.owner2).role, 'owner'); assert.equal(rows.some(row => row.user_id === users.removed), false);
    });
    await check('parallel owner demotion/removal retains a last owner', async () => {
      const results = await concurrent([{ client: sessions.owner, run: () => rpc(sessions.owner, 'update_site_member_role', [site, users.owner, 'editor']) }, { client: sessions.owner2, run: () => rpc(sessions.owner2, 'remove_site_member', [site, users.owner2]) }]);
      assert.equal(results.filter(result => result.status === 'rejected' && result.reason.code === '23514').length, 1);
      const { rows } = await admin.query("select count(*)::int as count from public.site_members where site_id=$1 and role='owner'", [site]); assert.equal(rows[0].count, 1);
    });
    await check('revoked member loses read and mutation access', async () => {
      await admin.query('delete from public.site_members where site_id=$1 and user_id=$2', [site, users.editor]);
      assert.equal((await sessions.editor.query('select id from public.sites where id=$1', [site])).rows.length, 0);
      await denied(() => daily(sessions.editor, '2026-10-10', []));
    });
    console.log(`Database behavior checks: ${passed} passed`);
    return passed;
  } finally { await Promise.allSettled(clients.map(client => client.end())); await admin.end(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const { default: pg } = await import(process.env.AUDIT_PG_MODULE || new URL('./db-tests/node_modules/pg/lib/index.js', import.meta.url));
  await runDatabaseTests({ Client: pg.Client, connectionString: process.env.AUDIT_DATABASE_URL });
}
