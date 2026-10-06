const { chromium } = require('C:/Users/com29/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
(async () => {
const browser = await chromium.launch({headless:true, executablePath:"C:/Program Files/Google/Chrome/Application/chrome.exe"});
const page = await browser.newPage({ viewport: {width:390,height:844}, serviceWorkers:'block' });
await page.route('http://localhost/**', async route => {
 const fs = require('node:fs'); const path = require('node:path');
 const name = new URL(route.request().url()).pathname;
 const file = path.resolve('artifacts/contact-ui-alignment/local', name === '/' ? 'index.html' : name.slice(1));
 const type = file.endsWith('.js') ? 'application/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.html') ? 'text/html' : 'application/octet-stream';
 await route.fulfill({status:200,contentType:type,body:fs.readFileSync(file)});
});
page.on('pageerror', e => console.log('PAGE ERROR', e.message));
await page.goto('http://localhost/#daily');
await page.waitForSelector('[data-daily-tab="contacts"]');

await page.evaluate(async () => {
 const db = await new Promise((resolve,reject) => {const r=indexedDB.open('construction-daily-report'); r.onsuccess=()=>resolve(r.result); r.onerror=()=>reject(r.error);});
 const tx=db.transaction(['trade_types','trade_vendors','memory_partitions'],'readwrite');
 tx.objectStore('memory_partitions').delete('local');
 const memory={usageCount:1,finalizedUsageCount:0,lastUsedAt:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),status:'confirmed'};
 tx.objectStore('trade_types').put({...memory,id:'demo-trade',name:'鷹架工程',normalizedName:'鷹架工程'});
 tx.objectStore('trade_vendors').put({...memory,id:'demo-vendor',name:'元昌',normalizedName:'元昌',tradeTypeId:'demo-trade'});
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)}); db.close();
});
await page.reload(); await page.waitForSelector('[data-daily-tab="contacts"]');
await page.locator('[data-daily-tab="contacts"]').click();
await page.locator('[data-daily-action="add-contact"]').click();
await page.locator('[data-daily-action="select-trade"]').click();
await page.locator('#contact-vendor').fill('元昌');
await page.locator('[data-contact-date]').fill('2026-10-07');
for(const name of ['上下設備施作','鷹架巡檢','工作平台調整']) {
 await page.locator('#contact-task').fill(name); await page.locator('#contact-task').press('Enter');
}
await page.locator('#contact-task').blur();
const later=page.getByRole('button',{name:'稍後',exact:true}); if(await later.count()) await later.click();
await page.locator('[data-contact-gesture]').first().evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-150));
for(const width of [360,390,1280]) {
 await page.setViewportSize({width,height:844});
 await page.evaluate(()=>window.scrollTo(0,0));
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)) throw Error('Editor overflow '+width);
 await page.screenshot({path:`artifacts/contact-ui-alignment/contact-editor-${width}.png`,fullPage:true});
}
await page.setViewportSize({width:390,height:844});
await page.locator('[data-contact-gesture]').first().evaluate(el=>window.scrollTo(0,el.getBoundingClientRect().top+scrollY-150));
const text = () => page.locator('[data-contact-task-content]').evaluateAll(nodes=>nodes.map(n=>n.value));
console.log('Before reorder', await text());
const grips=page.locator('[data-contact-gesture]');
const first=await grips.first().boundingBox(); const last=await grips.last().boundingBox();
console.log('grips',first,last);
await page.mouse.move(first.x+20,first.y+20); await page.mouse.down(); await page.waitForTimeout(450);
await page.mouse.move(last.x+20,last.y+last.height+3,{steps:8}); await page.mouse.up();
await page.waitForTimeout(100); console.log('After reorder', await text());
if(!(await text())[2].includes('上下設備施作')) throw Error('Contact reorder failed');
await page.locator('[data-contact-gesture]').first().focus(); await page.keyboard.press('Delete');
if(await page.locator('[data-contact-task-content]').count()!==2) throw Error('Delete failed');
await page.locator('.work-gesture-undo button').click();
if(await page.locator('[data-contact-task-content]').count()!==3) throw Error('Undo failed');
const row=await page.locator('[data-contact-task-content]').first().boundingBox();
await page.mouse.move(row.x+row.width-10,row.y+20);await page.mouse.down();await page.mouse.move(row.x+row.width-100,row.y+20,{steps:6});await page.mouse.up();
if(await page.locator('[data-contact-task-content]').count()!==2) throw Error('Swipe deletion failed');
await page.locator('.work-gesture-undo button').click();
await page.locator('[data-contact-task-content]').first().fill('預定10/07(三)巡檢修正');
await page.locator('[data-daily-action="keep-contact"]').click();
await page.locator('[data-daily-action="toggle-contact"]').click();
if(!(await text())[0].includes('巡檢修正')) throw Error('Draft lost');
await page.locator('[data-daily-action="save-contact"]').click();
await page.waitForSelector('.contact-row-summary');
for(const width of [360,390,1280]) {
 await page.setViewportSize({width,height:844});
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 if(overflow) throw Error('Horizontal overflow at '+width);
 await page.screenshot({path:`artifacts/contact-ui-alignment/contact-summary-${width}.png`,fullPage:true});
}
await page.locator('[data-daily-action="toggle-contact"]').click();
await page.locator('[data-daily-action="save-contact-next"]').click();
await page.waitForSelector('[data-daily-action="select-trade"]');
console.log('PASS: create, edit, draft collapse, reorder, delete, undo, swipe, save, save-next, 360/390/1280 overflow');

await page.locator('[data-daily-action="close-trade-picker"]').click();
await page.locator('[data-daily-tab="engineering"]').click();
await page.locator('[data-daily-action="add-trade"]').click();
await page.locator('[data-daily-action="select-trade"]').click();
await page.locator('[data-daily-field="workerCount"]').fill('3');
for(const task of ['搭設','加固']) { await page.locator('[data-continuous-work]').fill(task);await page.locator('[data-work-commit]').click(); await page.waitForTimeout(150); }
await page.locator('[data-work-gesture]').first().focus();await page.keyboard.press('Delete');
await page.waitForTimeout(150);
if(await page.locator('[data-inline-work]').count()!==1) throw Error('Construction delete regression');
await page.locator('.work-gesture-undo button').click();
await page.waitForTimeout(150);
if(await page.locator('[data-inline-work]').count()!==2) throw Error('Construction undo regression');
await page.locator('[data-daily-action="keep-trade"]').click();
await page.screenshot({path:'artifacts/contact-ui-alignment/construction-reference-390.png',fullPage:true});
console.log('PASS: construction shared gesture regression');
await browser.close();
})();


