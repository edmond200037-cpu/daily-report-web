/** Detect known manually installed schemas before CLI can replay their DDL. */
export async function checkMigrationHistory(client) {
  const markers = [
    ['202609230001', 'public.collaboration_tombstones'],
    ['202609230002', 'public.memory_learning_events'],
  ];
  const relations = (await client.query('select name,to_regclass(name)::text as present from unnest($1::text[]) as names(name)', [['supabase_migrations.schema_migrations', ...markers.map(([, name]) => name)]])).rows;
  const exists = new Set(relations.filter(row => row.present).map(row => row.name));
  const versions = exists.has('supabase_migrations.schema_migrations') ? new Set((await client.query('select version from supabase_migrations.schema_migrations')).rows.map(row => row.version)) : new Set();
  const drift = markers.filter(([version, name]) => exists.has(name) && !versions.has(version));
  if (drift.length) throw new Error(`正式 schema 已存在但 migration 未登記：${drift.map(([version]) => version).join('、')}。請先比對原始 migration 與實際定義後整理 history；不自動重播或標記。`);
}
