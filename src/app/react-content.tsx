import { type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import zhTW from '@astryxdesign/core/locales/zh-TW.json';
import { Theme } from '@astryxdesign/core/theme';
import { themes, defaultThemeSlug } from '../astryx-themes';
import { astryxOverrides } from './astryx-locale';
import { app } from './state';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { LayerProvider } from '@astryxdesign/core/Layer';
import { PwaUpdateNotice } from './react-pwa';
let root: Root | undefined;
export function mountContent(children: ReactNode) {
  app.removeAttribute('data-legacy-ui');
  root ??= createRoot(app);
  root.render(<InternationalizationProvider locale="zh-TW" messages={{ 'zh-TW': zhTW }} overrides={astryxOverrides}><Theme theme={themes[defaultThemeSlug]}><LayerProvider toast={{ position: 'topEnd', inset: { top: 96 } }}><PwaUpdateNotice />{children}</LayerProvider></Theme></InternationalizationProvider>);
}
export function unmountContent() {
  root?.unmount();
  root = undefined;
  app.dataset.legacyUi = '';
}
export function mountError(summary: string) {
  mountContent(<VStack padding={4} gap={4}><Heading level={1}>無法開啟工作內容</Heading><Text role="alert">{summary}</Text><Button label="返回施工日報" href="#daily" size="lg" /><Button label="重新載入" size="lg" onClick={() => location.reload()} /></VStack>);
}
