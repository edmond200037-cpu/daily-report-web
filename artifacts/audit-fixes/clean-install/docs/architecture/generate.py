"""Rebuild the source-backed architecture diagram (Python standard library only)."""
from pathlib import Path
import xml.etree.ElementTree as E

OUT = Path(__file__).parent
doc = E.Element('mxfile', host='drawio')
page = E.SubElement(doc, 'diagram', id='system', name='系統架構')
model = E.SubElement(page, 'mxGraphModel', page='1', pageWidth='1500', pageHeight='1130', background='#ffffff')
root = E.SubElement(model, 'root')
E.SubElement(root, 'mxCell', id='0')
E.SubElement(root, 'mxCell', id='1', parent='0')

def box(id, text, x, y, w, h, color='#dae8fc', source='', parent='1', extra=''):
    c = E.SubElement(root, 'mxCell', id=id, value=text, vertex='1', parent=parent,
        style=f'rounded=1;whiteSpace=wrap;html=1;fontFamily=Microsoft JhengHei;fontSize=17;spacing=12;fillColor={color};strokeColor=#64748b;{extra}')
    if source: c.set('data-source', source)
    E.SubElement(c, 'mxGeometry', x=str(x), y=str(y), width=str(w), height=str(h), attrib={'as':'geometry'})

def edge(a,b,label='',extra=''):
    c = E.SubElement(root,'mxCell',id=f'{a}-{b}',source=a,target=b,value=label,edge='1',parent='1',style='edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;fontFamily=Microsoft JhengHei;fontSize=14;labelBackgroundColor=#ffffff;strokeColor=#475569;'+extra)
    E.SubElement(c,'mxGeometry',relative='1',attrib={'as':'geometry'})

box('title','施工日報與水位管理｜現行系統架構',30,15,1440,55,'#ffffff',extra='strokeColor=none;fontSize=28;fontStyle=1;')
box('pipeline','GitHub Actions\nnpm ci → test → build\nVite + TypeScript → dist',40,100,390,110,'#f1f5f9','.github/workflows/deploy.yml')
box('hosting','GitHub Pages\n提供 HTML / JS / CSS / PWA 資源',540,100,390,110,'#f1f5f9','.github/workflows/deploy.yml')
box('sw','Service Worker / Workbox\n導航：網路優先，離線回退\n預快取 App Shell；提示更新',1040,100,390,110,'#fff2cc','src/service-worker.ts;vite.config.ts')
box('browser','使用者裝置 / 瀏覽器｜業務處理與資料留在本機',30,260,1410,780,'#f8fafc',extra='swimlane;startSize=42;container=1;pointerEvents=0;fontStyle=1;')
box('shell','UI 殼層與 Hash 路由 · src/main.ts\n日報 / 歷史 / 水位 / 記憶審核 / 設定\n原生 DOM 與事件處理',465,65,450,105,source='src/main.ts',parent='browser')
box('daily','日報模組 · src/daily\nDailyController：600ms 草稿儲存\n驗證 → 輸出模型 → 文字 formatter',40,250,390,115,source='src/daily/daily-controller.ts',parent='browser')
box('settings','設定與記憶管理\n工種管理 / 候選審核\nsrc/settings + main.ts',495,250,390,115,source='src/settings;src/main.ts',parent='browser')
box('water','水位模組 · src/water-level\n動態載入 controller.js\nparser / calculator / formatter',950,250,390,115,source='src/water-level/controller.js;src/main.ts:401',parent='browser')
box('dailyrepo','日報 Repository\n草稿 / 定稿 / 記憶 / 備份\nsrc/data/daily-repository.ts',190,440,540,100,'#d5e8d4','src/data/daily-repository.ts',parent='browser')
box('waterrepo','水位 Repository\n井位 / 量測 / 重算 / 三天保留\nsrc/water-level/repository.js',950,440,390,100,'#d5e8d4','src/water-level/repository.js',parent='browser')
box('db','唯一 IndexedDB 入口 · src/data/db.js\nconstruction-daily-report · schema v9\n日報草稿 / 七天定稿 / 主檔與候選 / 設定 / 水位 / 相容資料表',190,625,1150,105,'#d5e8d4','src/data/db.js',parent='browser',extra='shape=cylinder3;size=12;')
box('note','輸入 / 輸出：日報與水位文字 → 剪貼簿；記憶 JSON ↔ 檔案（不含日報與水位）\n架構邊界：無業務後端或遠端資料庫；Service Worker 快取與 IndexedDB 分離。',40,1060,1400,65,'#ffffff',extra='strokeColor=none;fontSize=16;')
edge('pipeline','hosting','發布')
edge('hosting','sw','靜態資源')
edge('hosting','shell','載入應用')
edge('shell','daily','日報')
edge('shell','settings','設定')
edge('shell','water','import()')
edge('daily','dailyrepo','讀寫草稿')
edge('settings','dailyrepo','主檔 / 備份')
edge('water','waterrepo','讀寫量測')
edge('dailyrepo','db','IndexedDB API')
edge('waterrepo','db','共用資料入口')
E.indent(doc)
E.ElementTree(doc).write(OUT/'system-architecture.drawio',encoding='utf-8',xml_declaration=True)
print(OUT/'system-architecture.drawio')
