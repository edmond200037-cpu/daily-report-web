export const trades = [
  { name: '紮筋工程', vendor: '順立', workers: '40', tasks: ['下層基礎版鋼筋及周邊樑工作筋綁紮'] },
  { name: '鋼筋續接工程', vendor: '萬大禾', workers: '3', tasks: ['正交樑鋼筋續接組接'] },
  { name: '安全支撐工程', vendor: '安暉', workers: '3', tasks: ['中間樁止水條施作'] },
  { name: '植筋工程', vendor: '冠嶺', workers: '4', tasks: ['連續壁公母接頭植筋施作'] },
  { name: '雜工工程', vendor: '藝境', workers: '3', tasks: ['人員及車輛管制', '環境整理', '交通管制', '工區內及周邊環境清掃', '地下室垃圾撿拾', '照明及通風設備調整', '雜草清理'] },
];
export const contacts = [
  { trade: '鋼筋', vendor: '萬大禾', task: '鋼筋進料' },
  { trade: '水電工程', vendor: '益永', task: '地下室照明設備安裝' },
];
// Deliberately unsorted. Expected quantities/totals live in manually maintained text files.
const otherSizes = [
  { name: '#11鋼筋', quantity: '50.19' }, { name: '#5鋼筋', quantity: '12.62' },
  { name: '#10鋼筋', quantity: '7.2' }, { name: '#6鋼筋', quantity: '0.19' },
  { name: '#8鋼筋', quantity: '14.89' }, { name: '#7鋼筋', quantity: '2.04' },
];
export const scenarios = [
  { id: 'standard', materials: [otherSizes[0], { name: '#4鋼筋', quantity: '19.99' }, ...otherSizes.slice(1)] },
  // Manual: 7.37 + 12.62 = 19.99; all seven sizes total 107.12 tons.
  { id: 'same-spec-multiple-loads', materials: [otherSizes[0], { name: '#4鋼筋', quantity: '7.37' }, ...otherSizes.slice(1), { name: '#4鋼筋', quantity: '12.62' }] },
];
export type Scenario = typeof scenarios[number];
