// Browser tests of index.html with a fake Android bridge.  Run: cd tests && npm test
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const os = require('os');
const PAGE = 'file://' + path.resolve(__dirname, '../app/src/main/assets/index.html');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fn-'));
const TH = 'data:image/jpeg;base64,' + 'A'.repeat(4000);
const seed = {species:[{id:'s1',name:'Csuka'},{id:'s2',name:'Süllő'}],
  catches:[
    {id:'c1',sp:'s1',at:new Date(Date.now()-864e5).toISOString(),y:new Date().getFullYear(),t:true,photo:{src:'file:///data/photos/p1.jpg',thumb:TH}},
    {id:'c2',sp:'s1',at:new Date(Date.now()-2*864e5).toISOString(),y:new Date().getFullYear(),t:true,photo:{thumb:TH}},
    {id:'c3',sp:'s2',at:new Date(Date.now()-3*864e5).toISOString(),y:new Date().getFullYear(),t:true}]};
let fails = 0; const ok = (c, m) => { console.log((c ? 'OK   ' : 'FAIL ') + m); if (!c) fails++; };
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext(); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript(({seed}) => {
    if (!localStorage.getItem('fogasnaplo.v1')) localStorage.setItem('fogasnaplo.v1', JSON.stringify(seed));
    const files = {}; let n = 0; window.__log = { deleted: [], cleanup: null, backup: null };
    window.FogasnaploAndroid = {
      saveThumb(d) { const u = 'file:///data/thumbs/t' + (++n) + '.jpg'; files[u] = d; return u; },
      readThumb(u) { return files[u] || ''; },
      deletePhoto(u) { window.__log.deleted.push(u); },
      cleanup(j) { window.__log.cleanup = JSON.parse(j); },
      saveBackup(json) { window.__log.backup = JSON.parse(json); },
      getLocation() {}, pickPhoto() {}
    };
  }, { seed });
  await p.goto(PAGE); await p.waitForTimeout(1500);
  const stored = () => p.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
  let d = await stored();
  ok(d.catches.filter(c => c.photo).every(c => c.photo.thumb.startsWith('file:')), 'előnézetek fájlba költöztek');
  ok(JSON.stringify(d).length < 2000, 'napló mérete kicsi: ' + JSON.stringify(d).length + ' karakter');
  const cl = await p.evaluate(() => window.__log.cleanup);
  ok(cl && cl.includes('file:///data/photos/p1.jpg') && cl.filter(u => u.includes('thumbs')).length === 2, 'takarítás a helyes megtartandó listát kapta');

  // undo on minus (Csuka has 2 catches this year)
  const csukaMinus = p.locator('button.minus[aria-label^="Csuka"]');
  await csukaMinus.click();
  ok((await stored()).catches.length === 2, '− gomb törölt egy fogást');
  ok(await p.locator('#toast button', { hasText: 'Visszavonás' }).isVisible(), 'Visszavonás gomb látszik');
  await p.locator('#toast button').click();
  d = await stored();
  ok(d.catches.length === 3 && d.catches.some(c => c.id === 'c1'), 'visszavonás visszahozta a fogást');
  ok((await p.evaluate(() => window.__log.deleted)).length === 0, 'visszavonáskor a fotó nem törlődött');
  await csukaMinus.click(); await p.waitForTimeout(7000);
  const del = await p.evaluate(() => window.__log.deleted);
  ok(del.includes('file:///data/photos/p1.jpg') && del.some(u => u.includes('thumbs')), 'idő lejárta után fotó és előnézet törölve');
  ok((await stored()).catches.length === 2, 'a törlés végleges maradt');

  // export carries thumbnails as data urls
  await p.locator('#exportBtn').click();
  const bk = await p.evaluate(() => window.__log.backup);
  ok(bk && bk.catches.filter(c => c.photo).every(c => c.photo.thumb && c.photo.thumb.startsWith('data:')), 'mentésfájlban az előnézet beágyazva');

  // import merge: one existing catch (changed locally), one new catch, one new species, one same-name species
  const file = path.join(TMP, 'b.json');
  fs.writeFileSync(file, JSON.stringify({ app: 'fogasnaplo', version: 2,
    species: [{ id: 's1', name: 'Csuka' }, { id: 'x9', name: 'süllő' }, { id: 's7', name: 'Balin' }],
    catches: [{ id: 'c2', sp: 's1', at: seed.catches[1].at, y: 2026, w: 99 },
      { id: 'n1', sp: 's7', at: '2025-06-01T10:00:00.000Z', y: 2025, photo: { thumb: TH } },
      { id: 'n2', sp: 'x9', at: '2025-06-02T10:00:00.000Z', y: 2025 }] }));
  await p.locator('#importFile').setInputFiles(file); await p.waitForTimeout(300);
  const askTxt = await p.locator('#importAsk').innerText();
  ok(askTxt.includes('2 új fogás') && askTxt.includes('1 új halfaj'), 'megerősítés: ' + askTxt.split('\n')[0]);
  ok((await stored()).catches.length === 2, 'megerősítés előtt nem változott semmi');
  await p.locator('#importAsk .btn-main').click();
  d = await stored();
  ok(d.catches.length === 4 && d.species.length === 3, 'összefésülés: 4 fogás, 3 faj');
  ok(!d.catches.find(c => c.id === 'c2').w, 'meglévő fogást nem írt felül');
  ok(d.catches.find(c => c.id === 'n2').sp === 's2', 'azonos nevű fajhoz kötötte (süllő → Süllő)');
  ok(d.catches.find(c => c.id === 'n1').photo.thumb.startsWith('file:'), 'importált előnézet fájlba került');
  await p.locator('#importFile').setInputFiles(file); await p.waitForTimeout(300);
  ok((await p.locator('#backupMsg').innerText()).includes('nincs új fogás'), 'ismételt betöltés: nincs új');

  // storage full warning
  ok(await p.locator('#saveWarn').isHidden(), 'figyelmeztetés alapból rejtve');
  await p.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('QuotaExceeded'); }; });
  await p.locator('#newName').fill('Harcsa'); await p.locator('#addForm button').click();
  ok(await p.locator('#saveWarn').isVisible(), 'tele tárhelynél figyelmeztetés látszik');

  // maps: leaflet is loaded lazily
  ok(!(await p.evaluate(() => !!window.L)), 'térképkönyvtár induláskor nincs betöltve');
  await p.locator('.tabbar button[data-tab="map"]').click(); await p.waitForTimeout(800);
  ok(await p.evaluate(() => !!window.L) && await p.locator('#bigMap.leaflet-container').count() === 1, 'térkép fül: térkép betöltődött');
  await p.locator('.tabbar button[data-tab="list"]').click(); await p.waitForTimeout(200);
  await p.locator('.citem').first().click(); await p.waitForTimeout(200);
  await p.locator('#sheet button', { hasText: 'Hely megadása' }).click(); await p.waitForTimeout(500);
  ok(await p.locator('#picker').isVisible() && await p.locator('#pickMap.leaflet-container').count() === 1, 'helyválasztó térkép megnyílt');
  await p.locator('#pickCancel').click();
  ok(errs.length === 0, 'nincs JS-hiba' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); console.log(fails ? fails + ' HIBA' : 'MIND RENDBEN'); process.exit(fails ? 1 : 0);
})();
