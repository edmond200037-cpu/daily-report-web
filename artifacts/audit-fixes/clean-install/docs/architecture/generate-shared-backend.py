"""Proposed architecture: editable draw.io and matching schematic PNG (not native export)."""
from pathlib import Path
import math
import xml.etree.ElementTree as E
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent
W,H = 1500,1280
nodes = [
 ('devices', '每人自己的帳號 × 手機 / 電腦\n登入後選擇同一工地', 530,110,440,90,'#DBEAFE'),
 ('ui', '現有 PWA 介面\n施工日報 · 記憶主檔 · 水位',530,260,440,100,'#DBEAFE'),
 ('pages', '保留 GitHub Pages\n提供前端靜態檔案',60,260,350,100,'#F1F5F9'),
 ('auth', '新增 Supabase Auth\n個人登入 / 工作階段\n首次登入須獲准加入工地',1090,260,350,100,'#FEF3C7'),
 ('sync', '新增同步層 Sync Engine\n送出待同步變更 / 拉取雲端更新\n重試去重 / 版本衝突處理',530,450,440,115,'#EDE9FE'),
 ('local', '保留並升級 IndexedDB\n本機資料 + 待同步佇列\n依帳號與工地隔離',60,450,350,115,'#DBEAFE'),
 ('conflict', '版本不一致時\n保留本機與雲端兩份\n使用者確認後再提交',1090,450,350,115,'#FEF3C7'),
 ('api', 'Supabase Data API + RPC\n驗證身分與工地權限\nmutation 去重 / revision CAS / 增量拉取',530,675,440,115,'#DCFCE7'),
 ('membership', '工地成員 + RLS 權限\n管理員 / 編輯者 / 檢視者\n非成員不可讀寫',1090,675,350,115,'#FEF3C7'),
 ('cloud', 'PostgreSQL 共用資料庫\n當日草稿 · 記憶快照 · 水位快照\nsite_id 隔離 · revision · 變更序號',340,900,820,115,'#DCFCE7'),
 ('backup', '備份與保留政策\n管理員匯出完整工地資料\n本機清快取 ≠ 刪除雲端',530,1100,440,100,'#F1F5F9'),
]
# Explicit straight paths keep overview readable and match both outputs.
edges = [
 ('devices','ui',(750,200),(750,260),'操作'),
 ('pages','ui',(410,310),(530,310),'載入'),
 ('ui','auth',(970,310),(1090,310),'登入'),
 ('ui','sync',(750,360),(750,450),'資料操作'),
 ('sync','local',(530,507),(410,507),'本機讀寫'),
 ('sync','conflict',(970,507),(1090,507),'衝突'),
 ('sync','api',(750,565),(750,675),'HTTPS + 登入憑證'),
 ('membership','api',(1090,732),(970,732),'權限檢查'),
 ('api','cloud',(750,790),(750,900),'讀寫 / 交易'),
 ('cloud','backup',(750,1015),(750,1100),'授權匯出'),
]
doc = E.Element('mxfile',host='drawio')
page = E.SubElement(doc,'diagram',id='shared-backend',name='多人共用後端提案')
model = E.SubElement(page,'mxGraphModel',page='1',pageWidth=str(W),pageHeight=str(H),background='#ffffff')
root = E.SubElement(model,'root')
E.SubElement(root,'mxCell',id='0'); E.SubElement(root,'mxCell',id='1',parent='0')
image = Image.new('RGB',(W,H),'white'); draw=ImageDraw.Draw(image)
font=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',22)
small=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',18)
titlefont=ImageFont.truetype('C:/Windows/Fonts/msjh.ttc',32)

def label(text, x,y,w,h, f, fill='#172B4D'):
    bounds=draw.multiline_textbbox((0,0),text,font=f,spacing=8,align='center')
    draw.multiline_text((x+(w-bounds[2])/2,y+(h-(bounds[3]-bounds[1]))/2-bounds[1]),text,font=f,spacing=8,align='center',fill=fill)

allnodes=nodes+[
 ('title','多人共用施工日報｜免費後端架構提案',30,15,1440,65,'#ffffff'),
 ('footer','藍：既有系統改造　紫：新增同步邏輯　綠：Supabase 後端　黃：帳號 / 權限 / 衝突',30,1210,1440,50,'#ffffff')]
for id,text,x,y,w,h,color in allnodes:
    istext=id in ('title','footer')
    style=f'rounded=1;whiteSpace=wrap;html=1;fontFamily=Microsoft JhengHei;fontSize={32 if id=="title" else 18 if id=="footer" else 22};fillColor={color};strokeColor={"none" if istext else "#64748b"};spacing=12;'
    cell=E.SubElement(root,'mxCell',id=id,value=text,vertex='1',parent='1',style=style)
    E.SubElement(cell,'mxGeometry',x=str(x),y=str(y),width=str(w),height=str(h),attrib={'as':'geometry'})
    if not istext: draw.rounded_rectangle((x,y,x+w,y+h),radius=12,fill=color,outline='#64748b',width=2)
    label(text,x,y,w,h,titlefont if id=='title' else small if id=='footer' else font)
for a,b,p,q,text in edges:
    src=next(n for n in nodes if n[0]==a); dst=next(n for n in nodes if n[0]==b)
    sx,sy=(p[0]-src[2])/src[4],(p[1]-src[3])/src[5]
    tx,ty=(q[0]-dst[2])/dst[4],(q[1]-dst[3])/dst[5]
    c=E.SubElement(root,'mxCell',id=a+'-'+b,source=a,target=b,value=text,edge='1',parent='1',style=f'edgeStyle=orthogonalEdgeStyle;rounded=0;html=1;endArrow=block;labelBackgroundColor=#ffffff;fontFamily=Microsoft JhengHei;fontSize=18;exitX={sx};exitY={sy};entryX={tx};entryY={ty};')
    E.SubElement(c,'mxGeometry',relative='1',attrib={'as':'geometry'})
    draw.line((p,q),fill='#475569',width=2)
    angle=math.atan2(q[1]-p[1],q[0]-p[0]); tip=[q,(q[0]-12*math.cos(angle-.4),q[1]-12*math.sin(angle-.4)),(q[0]-12*math.cos(angle+.4),q[1]-12*math.sin(angle+.4))]
    draw.polygon(tip,fill='#475569')
    cx,cy=(p[0]+q[0])/2,(p[1]+q[1])/2
    tw=draw.textbbox((0,0),text,font=small)[2]
    draw.rectangle((cx-tw/2-5,cy-13,cx+tw/2+5,cy+13),fill='white')
    label(text,cx-tw/2,cy-15,tw,30,small)
E.indent(doc)
E.ElementTree(doc).write(OUT/'shared-backend-proposal.drawio',encoding='utf-8',xml_declaration=True)
image.save(OUT/'shared-backend-proposal.png')
print('Created editable draw.io and schematic PNG from the same node and edge model.')
