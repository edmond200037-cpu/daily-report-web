import { type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import zhTW from '@astryxdesign/core/locales/zh-TW.json';
import { Theme } from '@astryxdesign/core/theme';
import { themes, defaultThemeSlug } from '../astryx-themes';
import { astryxOverrides } from './astryx-locale';
import { app } from './state';
let root: Root | undefined;
export function mountContent(children: ReactNode) {
  app.removeAttribute('data-legacy-ui');
  root ??= createRoot(app);
  root.render(<InternationalizationProvider locale="zh-TW" messages={{ 'zh-TW': zhTW }} overrides={astryxOverrides}><Theme theme={themes[defaultThemeSlug]}>{children}</Theme></InternationalizationProvider>);
}
export function unmountContent() {
  root?.unmount();
  root = undefined;
  app.dataset.legacyUi = '';
}
