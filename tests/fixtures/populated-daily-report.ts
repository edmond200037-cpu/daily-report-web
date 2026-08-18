import type { DailyReportV3, MaterialEntry, TradeSection, WorkItem } from '../../src/domain/daily';

const stamp = '2026-08-18T08:00:00.000Z';

const workItem = (
  id: string,
  taskTextSnapshot: string,
  sortOrder: number,
  overrides: Partial<WorkItem> = {},
): WorkItem => ({
  id,
  startFloorRaw: '',
  startFloorNormalized: null,
  endFloorRaw: '',
  endFloorNormalized: null,
  locationId: null,
  locationTextSnapshot: '',
  taskId: null,
  taskTextSnapshot,
  note: '',
  sortOrder,
  createdAt: stamp,
  updatedAt: stamp,
  ...overrides,
});

const trade = (
  id: string,
  tradeTypeId: string,
  tradeNameSnapshot: string,
  vendorId: string,
  vendorNameSnapshot: string,
  workerCount: string,
  sortOrder: number,
  workItems: WorkItem[],
): TradeSection => ({
  id,
  tradeTypeId,
  tradeNameSnapshot,
  vendorId,
  vendorNameSnapshot,
  workerCount,
  workItems,
  materialEntries: [],
  status: 'complete',
  sortOrder,
  createdAt: stamp,
  updatedAt: stamp,
});

const material = (
  id: string,
  entryType: 'normal' | 'independent',
  connectedTradeSectionId: string | null,
  materialTypeSnapshot: string,
  itemName: string,
  supplierNameSnapshot: string,
  quantity: string,
  unit: string,
  sortOrder: number,
  specification = '',
  note = '',
): MaterialEntry => ({
  id,
  entryType,
  connectedTradeSectionId,
  materialTypeId: null,
  materialTypeSnapshot,
  itemName,
  supplierId: null,
  supplierNameSnapshot,
  quantity,
  unit,
  specification,
  note,
  sortOrder,
  createdAt: stamp,
  updatedAt: stamp,
});

export const POPULATED_DAILY_OUTPUT = `北區捷運聯開工程：8/18（二）

模板工程：
1.永固營造股份有限公司5工-B2F～B1FA區牆面模板組立；預留機電套管、1F西側樓梯模板調整。
  聯成工程行3工-RF屋突層女兒牆模板放樣。
2.鋼筋-順發材料：SD420W鋼筋2.5噸，D25；第三車次。
3.模板-大興木業：覆膜模板120片，15mm。

防水工程：止水工程有限公司4工-B3F筏基區止水帶安裝。

混凝土-宏昇預拌：350kgf/cm²預拌混凝土18.5方，坍度15cm；下午批次。

-----------
聯絡事項：
鋼筋工程－萬大禾鋼鐵：確認1F至3F門窗開口補強；下午四點前回覆加工進度。

-----------
特殊事項：
塔吊保養期間，南側材料改由施工電梯運送。`;

export function populatedDailyReport(): DailyReportV3 {
  return {
    id: 'current',
    date: '2026-08-18',
    siteId: 'site-north-metro',
    siteNameSnapshot: '北區捷運聯開工程',
    activeTab: 'engineering',
    tradeSections: [
      trade(
        'trade-formwork-a',
        'trade-type-formwork',
        '模板工程',
        'vendor-yong-gu',
        '永固營造股份有限公司',
        '5',
        0,
        [
          workItem('work-formwork-wall', '牆面模板組立', 0, {
            startFloorRaw: 'B2F',
            startFloorNormalized: 'B2F',
            endFloorRaw: 'B1F',
            endFloorNormalized: 'B1F',
            locationTextSnapshot: 'A區',
            note: '預留機電套管',
          }),
          workItem('work-formwork-stair', '樓梯模板調整', 1, {
            startFloorRaw: '1F',
            startFloorNormalized: '1F',
            locationTextSnapshot: '西側',
          }),
        ],
      ),
      trade(
        'trade-formwork-b',
        'trade-type-formwork',
        '模板工程',
        'vendor-lian-cheng',
        '聯成工程行',
        '3',
        1,
        [workItem('work-parapet-layout', '女兒牆模板放樣', 0, {
          startFloorRaw: 'RF',
          startFloorNormalized: 'RF',
          locationTextSnapshot: '屋突層',
        })],
      ),
      trade(
        'trade-waterproofing',
        'trade-type-waterproofing',
        '防水工程',
        'vendor-water-stop',
        '止水工程有限公司',
        '4',
        2,
        [workItem('work-water-stop', '止水帶安裝', 0, {
          startFloorRaw: 'B3F',
          startFloorNormalized: 'B3F',
          locationTextSnapshot: '筏基區',
        })],
      ),
    ],
    standaloneMaterialEntries: [
      material('material-rebar', 'independent', 'trade-formwork-a', '鋼筋', 'SD420W鋼筋', '順發材料', '2.5', '噸', 0, 'D25', '第三車次'),
      material('material-plywood', 'independent', 'trade-formwork-b', '模板', '覆膜模板', '大興木業', '120', '片', 1, '15mm'),
      material('material-concrete', 'normal', null, '混凝土', '350kgf/cm²預拌混凝土', '宏昇預拌', '18.5', '方', 2, '坍度15cm', '下午批次'),
    ],
    supplies: [{
      id: 'supply-concrete',
      type: 'concrete',
      name: '350kgf/cm²預拌混凝土',
      strength: '350kgf/cm²',
      quantity: '18.5',
      unit: '方',
      sortOrder: 0,
      createdAt: stamp,
      updatedAt: stamp,
    }],
    contacts: [{
      id: 'contact-rebar',
      tradeTypeId: 'trade-type-rebar',
      tradeNameSnapshot: '鋼筋工程',
      vendorId: 'vendor-wan-da-he',
      vendorNameSnapshot: '萬大禾鋼鐵',
      items: [
        { id: 'contact-task-openings', content: '確認1F至3F門窗開口補強', sortOrder: 0, createdAt: stamp, updatedAt: stamp },
        { id: 'contact-task-progress', content: '下午四點前回覆加工進度', sortOrder: 1, createdAt: stamp, updatedAt: stamp },
      ],
      sortOrder: 0,
      createdAt: stamp,
      updatedAt: stamp,
    }],
    specialItems: [{
      id: 'special-crane',
      content: '塔吊保養期間，南側材料改由施工電梯運送。',
      sortOrder: 0,
      createdAt: stamp,
      updatedAt: stamp,
    }],
    createdAt: stamp,
    updatedAt: stamp,
  };
}

export function blockedPopulatedDailyReport(): DailyReportV3 {
  const report = populatedDailyReport();
  report.tradeSections[2].status = 'draft';
  report.standaloneMaterialEntries.push(material(
    'material-unlinked',
    'independent',
    null,
    '五金',
    '化學錨栓',
    '北區五金行',
    '24',
    '支',
    3,
  ));
  return report;
}
