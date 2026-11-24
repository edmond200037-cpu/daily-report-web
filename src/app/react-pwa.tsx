import { VStack } from '@astryxdesign/core/VStack';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { appState } from './state';
import { useAppVersion } from './react-store';
export function PwaUpdateNotice() {
  useAppVersion();
  const state = appState.pwaUpdateState;
  if (!state || state === 'idle') return null;
  const content = {
    available: ['已有新版施工日報', '新版已在背景下載完成。更新不會刪除本機日報資料。'],
    applying: ['正在儲存資料並套用新版', '請勿關閉頁面。日報、記憶與水位資料正在安全儲存。'],
    waiting: ['新版仍在等待套用', '資料已安全儲存，可重新嘗試，或關閉其他已開啟的施工日報分頁後再更新。'],
    success: ['已更新至新版', '本機日報與記憶資料已保留。'],
    error: ['更新失敗，資料已保留', '請稍後重新嘗試更新。'],
  }[state];
  return <VStack padding={4} gap={3} as="aside" role="status"><Text>{content[0]}</Text><Text>{content[1]}</Text>
    {state !== 'applying' && <Button label={state === 'available' ? '稍後' : '關閉更新通知'} size="lg" data-app-action="dismiss-pwa-update" />}
    {['available', 'waiting', 'error'].includes(state) && <Button label={state === 'available' ? '立即更新' : '重新嘗試更新'} size="lg" data-app-action="apply-pwa-update" />}
  </VStack>;
}
