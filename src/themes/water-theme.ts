import { defineTheme } from '@astryxdesign/core/theme';
import { sitePaperTheme } from './site-paper/site-paper.js';

export const waterTheme = defineTheme({
  extends: sitePaperTheme,
  name: 'site-water',
  tokens: {
    '--color-accent': 'var(--color-info)',
    '--color-text-accent': 'var(--color-info)',
    '--color-icon-accent': 'var(--color-info)',
    '--color-accent-muted': 'var(--color-background-green)',
    '--color-on-accent': 'var(--color-background-surface)',
  },
});
