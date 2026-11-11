export type TradeInput = { name: string; vendor: string; workers: string; tasks: string[] };
/** `trade` is the index in the scenario's trades the entry connects to. */
export type MaterialInput = { type: string; name: string; supplier: string; quantity: string; unit: string; trade: number };
/** `dateOffset` fills the native planned-date field (calendar days after the report); omit to leave it empty. */
export type ContactInput = { trade: string; vendor: string; dateOffset?: number; tasks: string[] };
export type Scenario = {
  id: string;
  /** Fixed report date for calendar edge cases; omitted scenarios use the run's DAILY_E2E_DATE. */
  reportDate?: string;
  trades: TradeInput[];
  materials: MaterialInput[];
  contacts: ContactInput[];
};

const steel = (name: string, quantity: string, trade = 0, supplier = '萬大禾'): MaterialInput => ({ type: '鋼筋', name, supplier, quantity, unit: '噸', trade });

const baseTrades: TradeInput[] = [
  { name: '紮筋工程', vendor: '順立', workers: '40', tasks: ['下層基礎版鋼筋及周邊樑工作筋綁紮'] },
  { name: '鋼筋續接工程', vendor: '萬大禾', workers: '3', tasks: ['正交樑鋼筋續接組接'] },
  { name: '安全支撐工程', vendor: '安暉', workers: '3', tasks: ['中間樁止水條施作'] },
  { name: '植筋工程', vendor: '冠嶺', workers: '4', tasks: ['連續壁公母接頭植筋施作'] },
  { name: '雜工工程', vendor: '藝境', workers: '3', tasks: ['人員及車輛管制', '環境整理', '交通管制', '工區內及周邊環境清掃', '地下室垃圾撿拾', '照明及通風設備調整', '雜草清理'] },
];
const baseContacts: ContactInput[] = [
  { trade: '鋼筋', vendor: '萬大禾', dateOffset: 2, tasks: ['鋼筋進料'] },
  { trade: '水電工程', vendor: '益永', dateOffset: 2, tasks: ['地下室照明設備安裝'] },
];
// Deliberately unsorted. Expected quantities/totals live in manually maintained text files.
const otherSizes = [steel('#11鋼筋', '50.19'), steel('#5鋼筋', '12.62'), steel('#10鋼筋', '7.2'), steel('#6鋼筋', '0.19'), steel('#8鋼筋', '14.89'), steel('#7鋼筋', '2.04')];

export const scenarios: Scenario[] = [
  { id: 'standard', trades: baseTrades, contacts: baseContacts, materials: [otherSizes[0], steel('#4鋼筋', '19.99'), ...otherSizes.slice(1)] },
  // Manual: 7.37 + 12.62 = 19.99; all seven sizes total 107.12 tons.
  { id: 'same-spec-multiple-loads', trades: baseTrades, contacts: baseContacts, materials: [otherSizes[0], steel('#4鋼筋', '7.37'), ...otherSizes.slice(1), steel('#4鋼筋', '12.62')] },

  // 計畫 A：2026-11-10 實際日報原樣。小數合計 15.49；兩家雜工分段；聯絡隔天。
  {
    id: 'plan-a-today',
    reportDate: '2026-11-10',
    trades: [
      // Typing 「、」 in the work input commits the preceding text as its own item; output joins them with 「、」 again.
      { name: '紮筋工程', vendor: '順立', workers: '45', tasks: ['地樑鋼筋', '柱筋及基礎上層版筋綁紮'] },
      { name: '水電工程', vendor: '益瑀', workers: '4', tasks: ['筏基連通管施作'] },
      { name: '雜工工程', vendor: '成保', workers: '2', tasks: ['垃圾分類', '工地物料整理', '地下室垃圾撿拾', '止水帶搬運'] },
      { name: '雜工工程', vendor: '藝境', workers: '1', tasks: ['人員及車輛管制', '環境整理', '交通管制', '工區內及周邊環境清掃'] },
    ],
    // Manual: 0.05+0.04+8.35+0.02+0.03+6.9+0.1 = 15.49.
    materials: [steel('#10鋼筋', '6.9'), steel('#4鋼筋', '0.05'), steel('#8鋼筋', '0.03'), steel('#6鋼筋', '8.35'), steel('#11鋼筋', '0.1'), steel('#5鋼筋', '0.04'), steel('#7鋼筋', '0.02')],
    contacts: [{ trade: '工地消毒', vendor: '明亮', dateOffset: 1, tasks: ['登革熱消毒'] }],
  },
  // 計畫 B：跨月、兩筆聯絡、合計 6.40 須去尾零、樓層寫在工項文字。
  {
    id: 'plan-b-cross-month',
    reportDate: '2026-11-30',
    trades: [
      { name: '模板工程', vendor: '宏達', workers: '18', tasks: ['B2～B1柱模板組立', '地下二層外牆模板封模'] },
      { name: '紮筋工程', vendor: '順立', workers: '32', tasks: ['筏基上層版筋及柱筋綁紮'] },
      { name: '水電工程', vendor: '益瑀', workers: '3', tasks: ['筏基預埋管路配置'] },
      { name: '雜工工程', vendor: '成保', workers: '2', tasks: ['垃圾分類', '工地物料整理'] },
      { name: '雜工工程', vendor: '藝境', workers: '1', tasks: ['人員及車輛管制', '交通管制'] },
    ],
    // Manual: 3.4 + 0.85 + 2.15 = 6.40 → 6.4.
    materials: [steel('#8鋼筋', '3.4', 1), steel('#4鋼筋', '0.85', 1), steel('#5鋼筋', '2.15', 1)],
    contacts: [
      { trade: '混凝土', vendor: '國產', dateOffset: 1, tasks: ['筏基混凝土澆置'] },
      { trade: '試驗', vendor: '台灣檢驗', dateOffset: 2, tasks: ['混凝土圓柱試體取樣'] },
    ],
  },
  // 計畫 C：跨年、兩家供應商交錯輸入、同規格兩車合計為整數。
  {
    id: 'plan-c-cross-year',
    reportDate: '2026-12-31',
    trades: [
      { name: '紮筋工程', vendor: '順立', workers: '28', tasks: ['1F樓版鋼筋綁紮'] },
      { name: '雜工工程', vendor: '成保', workers: '2', tasks: ['環境整理'] },
    ],
    // Manual: 萬大禾 #6 4.12 + 3.88 = 8；萬大禾合計 8 + 1.25 = 9.25；東鋼只有一筆不寫合計。
    materials: [steel('#6鋼筋', '4.12'), steel('#10鋼筋', '5.5', 0, '東鋼'), steel('#7鋼筋', '1.25'), steel('#6鋼筋', '3.88')],
    contacts: [{ trade: '工地消毒', vendor: '明亮', dateOffset: 2, tasks: ['登革熱消毒'] }],
  },
  // 計畫 D：無進料、無聯絡、同工種三家廠商。
  {
    id: 'plan-d-no-materials-no-contacts',
    reportDate: '2026-11-14',
    trades: [
      { name: '安全支撐工程', vendor: '安暉', workers: '6', tasks: ['第二層水平支撐安裝', '中間樁止水條施作'] },
      { name: '植筋工程', vendor: '冠嶺', workers: '4', tasks: ['連續壁公母接頭植筋施作'] },
      { name: '雜工工程', vendor: '成保', workers: '2', tasks: ['垃圾分類', '地下室垃圾撿拾'] },
      { name: '雜工工程', vendor: '藝境', workers: '1', tasks: ['人員及車輛管制'] },
      { name: '雜工工程', vendor: '明亮', workers: '1', tasks: ['工區內及周邊環境清掃'] },
    ],
    materials: [],
    contacts: [],
  },
  // 計畫 E：工作量最大。3 位小數合計 17.600 → 17.6；八項雜工；單筆聯絡內兩個不同預定日。
  {
    id: 'plan-e-long-day',
    reportDate: '2026-11-13',
    trades: [
      { name: '紮筋工程', vendor: '順立', workers: '45', tasks: ['筏基上層版筋綁紮', '柱筋綁紮'] },
      { name: '鋼筋續接工程', vendor: '萬大禾', workers: '3', tasks: ['正交樑鋼筋續接組接'] },
      { name: '模板工程', vendor: '宏達', workers: '20', tasks: ['B2～B1柱模板組立', 'B2外牆模板封模', '模板料吊運'] },
      { name: '水電工程', vendor: '益瑀', workers: '4', tasks: ['筏基連通管施作'] },
      { name: '安全支撐工程', vendor: '安暉', workers: '5', tasks: ['第二層水平支撐安裝'] },
      { name: '雜工工程', vendor: '成保', workers: '2', tasks: ['垃圾分類', '工地物料整理', '地下室垃圾撿拾', '止水帶搬運', '人員及車輛管制', '環境整理', '交通管制', '雜草清理'] },
    ],
    // Manual: 0.125+1.375+2.5+0.008+10.25+3.333+0.009 = 17.600 → 17.6.
    materials: [steel('#8鋼筋', '10.25'), steel('#11鋼筋', '0.009'), steel('#4鋼筋', '0.125'), steel('#10鋼筋', '3.333'), steel('#6鋼筋', '2.5'), steel('#7鋼筋', '0.008'), steel('#5鋼筋', '1.375')],
    contacts: [
      // Dates typed in the task text, planned-date field left empty: each task keeps its own date.
      { trade: '工地消毒', vendor: '明亮', tasks: ['11/14(六)登革熱消毒', '11/16(一)病媒蚊孳生源清除'] },
      { trade: '混凝土', vendor: '國產', dateOffset: 3, tasks: ['筏基混凝土澆置'] },
      { trade: '鋼筋', vendor: '萬大禾', dateOffset: 1, tasks: ['鋼筋進料'] },
    ],
  },
];
