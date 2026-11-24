import { mountContent } from './react-content';
import { appState } from './state';
import { useAppVersion } from './react-store';
import { SettingsHome, MasterSettings, MemoryReview, BackupSettings } from './react-settings';
import { WaterPointsSettings } from './react-water-points';
import { AccountRoute } from './react-account';
function SettingsRoute() {
  useAppVersion();
  const route = appState.renderedRoute;
  if (route?.module === 'account') return <AccountRoute />;
  if (route?.module === 'water-level') return <WaterPointsSettings />;
  if (route?.module === 'daily') return <MasterSettings key={location.hash} />;
  if (route?.page === 'memory') return <MemoryReview />;
  if (route?.page === 'data') return <BackupSettings />;
  return <SettingsHome />;
}
export function mountSettingsPage() { mountContent(<SettingsRoute />); }
