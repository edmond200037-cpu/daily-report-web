import { useEffect, useState } from 'react';
import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import { loadPoints, savePoint, deletePoint } from '../water-level/repository.js';
import { confirmAction } from './react-confirm';
import { SettingsFrame } from './react-settings';
import { isReadOnlySite } from './sync-runtime';
type Point = { id: string; name: string };
export function WaterPointsSettings() {
  const [points, setPoints] = useState<Point[]>([]);
  const [editing, setEditing] = useState<Point | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let active = true; void loadPoints().then((rows: Point[]) => { if (active) setPoints(rows); }).catch((reason: unknown) => { if (active) setError(String(reason)); }); return () => { active = false; }; }, []);
  const run = async (write: () => Promise<unknown>) => {
    if (isReadOnlySite()) return;
    setBusy(true); setError('');
    try { await write(); setPoints(await loadPoints()); setEditing(null); window.dispatchEvent(new Event('local-data-saved')); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '井位儲存失敗，請重試。'); }
    finally { setBusy(false); }
  };
  const edit = (point: Point) => { setEditing(point); setName(point.name); };
  return <SettingsFrame title="水位井位">
    <Text>刪除井位只影響後續輸入；既有歷史紀錄保留名稱快照。</Text>
    {error && <Text role="alert">{error}</Text>}
    <Button label="新增井位" size="lg" isDisabled={busy || isReadOnlySite()} onClick={() => edit({ id: '', name: '' })} />
    {editing && <form onSubmit={(event) => { event.preventDefault(); void run(() => savePoint(name, editing.id || undefined)); }}><VStack gap={3}>
      <TextInput label="井位名稱" size="lg" value={name} onChange={setName} hasAutoFocus isRequired isDisabled={busy} />
      <Button label="儲存" size="lg" type="submit" isDisabled={busy} /><Button label="取消" size="lg" isDisabled={busy} onClick={() => setEditing(null)} />
      {editing.id && <Button label="刪除井位" size="lg" variant="destructive" isDisabled={busy} clickAction={async () => { if (await confirmAction('刪除井位只影響後續輸入，不會刪除歷史讀值。確定刪除？')) await run(() => deletePoint(editing.id)); }} />}
    </VStack></form>}
    <List hasDividers>{points.map((point) => <ListItem key={point.id} label={point.name} endContent={<Button label={`編輯${point.name}`} size="lg" isDisabled={busy || isReadOnlySite()} onClick={() => edit(point)} />} />)}</List>
    {!points.length && <Text>尚無井位。</Text>}
  </SettingsFrame>;
}
