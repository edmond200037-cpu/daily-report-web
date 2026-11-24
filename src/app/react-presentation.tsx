import type { ReactNode } from 'react';
import { InternationalizationProvider } from '@astryxdesign/core/i18n';
import zhTW from '@astryxdesign/core/locales/zh-TW.json';
import { Theme } from '@astryxdesign/core/theme';
import { AppShell } from '@astryxdesign/core/AppShell';
import { TabList, Tab } from '@astryxdesign/core/TabList';
import { Layout, LayoutContent, LayoutFooter } from '@astryxdesign/core/Layout';
import { VStack } from '@astryxdesign/core/VStack';
import { Heading } from '@astryxdesign/core/Heading';
import { Text } from '@astryxdesign/core/Text';
import { Button } from '@astryxdesign/core/Button';
import { List, ListItem } from '@astryxdesign/core/List';
import type { FinalizedDailyReport } from '../domain/daily';
import { themes, defaultThemeSlug } from '../astryx-themes';

// Frame follows shell-top-nav: navigation above one centered content region.
export function WorkspaceFrame({ selected, children, footer }: { selected: string; children: ReactNode; footer?: ReactNode }) {
  return <InternationalizationProvider locale="zh-TW" messages={{ 'zh-TW': zhTW }}><Theme theme={themes[defaultThemeSlug]}>
    <AppShell height="auto" variant="surface" topNav={
      <TabList value={selected} onChange={(value) => { location.hash = value; }} layout="fill" size="lg" role="navigation" hasDivider>
        <Tab value="daily" label="施工日報" href="#daily" />
        <Tab value="water-level" label="水位變化" href="#water-level" />
        <Tab value="settings" label="設定" href="#settings" />
      </TabList>
    }>
      <Layout height="auto" contentWidth="60rem" content={<LayoutContent>{children}</LayoutContent>}
        footer={footer ? <LayoutFooter hasDivider label="日報檢查與複製">{footer}</LayoutFooter> : undefined} />
    </AppShell>
  </Theme></InternationalizationProvider>;
}

export function ReportHistoryList({ reports }: { reports: FinalizedDailyReport[] }) {
  return <VStack padding={4} gap={4}>
    <Heading level={1}>近 7 天日報</Heading>
    <Button label="返回日報" href="#daily" size="lg" />
    <List hasDividers>{reports.map((report) => <ListItem key={report.id}
      label={`${report.siteNameSnapshot}｜${report.date}`} description={<VStack gap={3}>
        <Text>定稿：{new Date(report.finalizedAt).toLocaleString('zh-TW')}</Text>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', font: 'inherit' }}>{report.outputText}</pre>
        <Button label="再次複製" size="lg" clickAction={() => navigator.clipboard.writeText(report.outputText)} />
      </VStack>} />)}</List>
    {!reports.length && <Text>近 7 天尚無已定稿日報。</Text>}
    <Text>日報定稿後保留 7 天，超過期限會自動清除。</Text>
  </VStack>;
}
