// The site-paper theme. `astryx experimental theme editor` wrote this file once and never changes it again.
// The checked settings live in site-paper.settings.json and the generated site-paper.settings.ts;
// change them with `astryx experimental theme editor set site-paper ...`. Add your own changes below: they win over the settings.
import {defineTheme} from '@astryxdesign/core/theme';
import {sitePaperSettings} from './site-paper.settings';

export const sitePaperTheme = defineTheme({
  extends: sitePaperSettings,
  name: 'site-paper',
  tokens: {
    '--color-info': ['#183531', '#a4d4c8'],
  },
});
