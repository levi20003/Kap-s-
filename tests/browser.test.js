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
  // kept / released and the daily limit (fresh page, normal storage)
  {
    const ctx2 = await b.newContext(); const q = await ctx2.newPage(); q.on('pageerror', e => errs.push(e.message));
    const now = Date.now(), at = k => new Date(now - k * 60000).toISOString(), Y = new Date().getFullYear();
    await q.addInitScript(({ at5, Y }) => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Csuka' }, { id: 's2', name: 'Süllő' }],
      catches: at5.map((a, i) => ({ id: 'k' + i, sp: i < 3 ? 's1' : 's2', at: a, y: Y, t: true, kept: true })) })), { at5: [1, 2, 3, 4, 5].map(at), Y });
    await q.goto(PAGE); await q.waitForTimeout(400);
    ok((await q.locator('#totalSide').innerText()).includes('Ma elvitt: 5/5'), 'Számláló: „Ma elvitt: 5/5 db”');
    await q.locator('.tabbar button[data-tab="list"]').click();
    await q.locator('#addLater').click();
    await q.locator('#edSp').selectOption('s1');
    await q.locator('#sheet .chip', { hasText: 'Elvittem' }).click();
    ok((await q.locator('#sheet .note.warn').innerText()).includes('Fajonként napi 3'), 'negyedik csuka: fajonkénti figyelmeztetés');
    await q.locator('#edSp').selectOption('s2');
    ok((await q.locator('#sheet .note.warn').innerText()).includes('Összesen napi 5'), 'hatodik hal: összesített figyelmeztetés');
    await q.locator('#sheet .chip', { hasText: 'Visszaengedtem' }).click();
    ok(await q.locator('#sheet .note.warn').count() === 0, 'visszaengedett halra nincs figyelmeztetés');
    await q.locator('#sheet .btn-main').click();
    const t = await q.locator('#listTitle').textContent();
    ok(t.includes('ebből 5 elvitt') && (await q.locator('#catchList').innerText()).includes('visszaengedve'), 'lista: ' + t);
    await ctx2.close();
  }
  // backup with photos: folder setup, weekly auto backup, zip restore
  {
    const mk = async (opts) => {
      const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
      await q.addInitScript(({ seed, opts }) => {
        localStorage.setItem('fogasnaplo.v1', JSON.stringify(seed));
        if (opts.lastTs) localStorage.setItem('fogasnaplo.autobackup', JSON.stringify({ ts: opts.lastTs, name: 'x.zip', photos: 1 }));
        let folder = opts.folder || ''; window.__z = { calls: [], saved: null };
        window.FogasnaploAndroid = {
          saveThumb() { return ''; }, readThumb() { return ''; }, deletePhoto() {}, cleanup() {}, getLocation() {}, pickPhoto() {}, saveBackup() {},
          backupFolder() { return folder; }, clearBackupFolder() { folder = ''; },
          pickBackupFolder() { folder = 'Drive/Fogások'; setTimeout(() => window.__fnBackupFolder({ name: folder })); },
          zipToFolder(json, name, auto) { window.__z.calls.push({ name, auto, n: JSON.parse(json).catches.length });
            setTimeout(() => window.__fnZipDone(opts.fail ? { error: 'A mentési mappa nem érhető el.', auto } : { ok: true, name, photos: 2, auto })); },
          saveZip(json, name) { window.__z.saved = name; },
          restoreZip() { setTimeout(() => window.__fnZipIn({ json: JSON.stringify(opts.zip), photos: 'file:///new/files/photos/', thumbs: 'file:///new/files/thumbs/' })); }
        };
      }, { seed, opts });
      await q.goto(PAGE); await q.waitForTimeout(1200); return { ctx, q };
    };
    let { ctx, q } = await mk({});
    ok((await q.locator('#autoBk').innerText()).includes('Mappa kiválasztása'), 'mentés: mappa még nincs, választó gomb látszik');
    await q.locator('#autoBk .btn-main').click(); await q.waitForTimeout(200);
    let z = await q.evaluate(() => window.__z);
    ok(z.calls.length === 1 && z.calls[0].auto === false && z.calls[0].n === 3, 'mappaválasztás után azonnal ment');
    ok((await q.locator('#autoBk').innerText()).includes('Utoljára'), 'állapot: „Hetente automatikus mentés ide … Utoljára”');
    await q.locator('#zipBtn').click();
    ok((await q.evaluate(() => window.__z.saved)) && (await q.evaluate(() => window.__z.saved)).endsWith('.zip'), 'Mentés fotókkal (ZIP) gomb');
    await ctx.close();

    ({ ctx, q } = await mk({ folder: 'Drive', lastTs: Date.now() - 8 * 864e5 }));
    z = await q.evaluate(() => window.__z);
    ok(z.calls.length === 1 && z.calls[0].auto === true, '8 napja volt mentés: induláskor automatikusan ment');
    await ctx.close();
    ({ ctx, q } = await mk({ folder: 'Drive', lastTs: Date.now() - 2 * 864e5 }));
    ok((await q.evaluate(() => window.__z.calls.length)) === 0, '2 napja volt mentés: nem ment újra');
    await ctx.close();
    ({ ctx, q } = await mk({ folder: 'Drive', fail: true }));
    ok(await q.locator('#autoBk .err').count() === 1, 'sikertelen automatikus mentés: hibaüzenet látszik');
    await ctx.close();

    ({ ctx, q } = await mk({ zip: { species: [{ id: 's1', name: 'Csuka' }], catches: [{ id: 'z1', sp: 's1', at: '2026-05-01T08:00:00.000Z', y: 2026,
      photo: { src: 'file:///old/phone/files/photos/abc-1.jpg', thumb: 'file:///old/phone/files/thumbs/abc-t.jpg' } }] } }));
    await q.locator('#zipInBtn').click(); await q.waitForTimeout(200);
    ok((await q.locator('#importAsk').innerText()).includes('1 új fogás'), 'ZIP-visszatöltés: megerősítést kér');
    await q.locator('#importAsk .btn-main').click();
    const zc = (await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')))).catches.find(c => c.id === 'z1');
    ok(zc && zc.photo.src === 'file:///new/files/photos/abc-1.jpg' && zc.photo.thumb === 'file:///new/files/thumbs/abc-t.jpg', 'ZIP-visszatöltés: fotók az új telefon mappájára mutatnak');
    await ctx.close();
  }
  // statistics: per month, per species, search
  {
    const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const Y = new Date().getFullYear();
    const cs = Array.from({ length: 12 }, (_, i) => ({ id: 'm' + i, sp: i % 3 ? 's1' : 's2', at: new Date(Y, i < 7 ? 4 : 8, 3 + i, 10).toISOString(), y: Y, t: true,
      lure: i % 2 ? 'Wobbler' : 'Gumihal', place: { name: i < 4 ? 'Holt-Tisza' : 'Maros', lat: 46.2, lng: 20.1 }, note: i === 9 ? 'hidegfront után' : undefined }));
    await q.addInitScript(cs => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Csuka' }, { id: 's2', name: 'Süllő' }], catches: cs })), cs);
    await q.goto(PAGE); await q.waitForTimeout(400);
    await q.locator('.tabbar button[data-tab="list"]').click(); await q.waitForTimeout(150);
    ok((await q.locator('#monthStats').innerText()).includes('májusban (7)'), 'havonta: legtöbb fogás májusban (7)');
    ok((await q.locator('#bestStats').innerText()).includes('Csuka · 8 fogás'), 'fajonként: Csuka · 8 fogás');
    await q.locator('.months button').nth(8).click();
    ok((await q.locator('#listTitle').textContent()) === 'Idei fogások (5)', 'hónapra koppintva szűr (szeptember: 5)');
    await q.locator('#catchSearch').fill('hidegfront');
    ok((await q.locator('#listTitle').textContent()) === 'Idei fogások (1)', 'keresés a megjegyzésben');
    await q.locator('#catchSearch').fill('holt-tisza');
    ok(await q.locator('#catchList .empty').count() === 1, 'nincs találat: üzenet (szeptemberben nem volt Holt-Tisza)');
    await q.locator('.months button').nth(8).click();
    ok((await q.locator('#listTitle').textContent()) === 'Idei fogások (4)', 'hónapszűrő törlése, keresés marad: Holt-Tisza 4');
    await ctx.close();
  }
  // closed-season reminders and home-screen shortcuts
  {
    const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.clock.setFixedTime(new Date('2027-01-20T10:00:00'));
    await q.addInitScript(() => {
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Csuka' }, { id: 's2', name: 'Domolykó' }, { id: 's3', name: 'Jászkeszeg' }, { id: 's4', name: 'Balin' }, { id: 's5', name: 'Menyhal' }],
        catches: [1, 2, 3].map(i => ({ id: 'b' + i, sp: 's4', at: '2026-06-0' + i + 'T08:00:00.000Z', y: 2026 })).concat([{ id: 'j1', sp: 's3', at: '2026-07-01T08:00:00.000Z', y: 2026 }]) }));
      window.__n = { rem: null, sc: null };
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {},
        setReminders(j) { window.__n.rem = JSON.parse(j); }, setShortcuts(j) { window.__n.sc = JSON.parse(j); },
        enableNotifications() { setTimeout(() => window.__fnNotify({})); } };
    });
    await q.goto(PAGE); await q.waitForTimeout(400);
    let n = await q.evaluate(() => window.__n);
    ok(n.rem && n.rem.length === 0, 'értesítés alapból ki: üres lista megy az Androidnak');
    ok(n.sc && n.sc.map(x => x.name).join() === 'Balin,Jászkeszeg,Csuka,Domolykó', 'parancsikonok: a 4 leggyakoribb faj (' + (n.sc || []).map(x => x.name).join(', ') + ')');
    await q.locator('#notifyBox .btn-main').click(); await q.waitForTimeout(150);
    n = await q.evaluate(() => window.__n);
    const first = n.rem[0], d = new Date(first.at);
    ok(first.title === 'Holnaptól tilalom: Csuka' && d.getMonth() === 0 && d.getDate() === 31 && d.getHours() === 18, 'első értesítés: jan. 31. 18:00, „Holnaptól tilalom: Csuka”');
    ok(first.text.includes('márc. 31-ig'), 'szöveg a tilalom végével: ' + first.text);
    ok(n.rem.some(r => r.title === 'Holnaptól tilalom: Domolykó, Jászkeszeg'), 'azonos napi kezdés egy értesítésben összevonva');
    ok(n.rem.some(r => r.title === 'Újra fogható: Csuka' && new Date(r.at).getMonth() === 3 && new Date(r.at).getDate() === 1), 'tilalom vége: ápr. 1. reggel „Újra fogható: Csuka”');
    ok(!n.rem.some(r => r.title.includes('Menyhal')), 'tilalom nélküli fajra nincs értesítés');
    ok((await q.locator('#notifyBox').innerText()).includes('Következő: jan. 31.'), 'állapot: következő értesítés látszik');
    await q.evaluate(() => window.__fnQuick({ sp: 's1' })); await q.waitForTimeout(200);
    const st = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')).catches.filter(c => c.sp === 's1').length);
    ok(st === 1 && (await q.locator('#sheet h3').innerText()).toLowerCase().includes('csuka rögzítve'), 'parancsikon: új csukafogás és megnyílt a szerkesztő');
    await ctx.close();
  }
  // field-test fixes: GPS catches on the map, picker starts at the catch, compact forecast, folded statistics
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const Y = new Date().getFullYear(), now = new Date();
    const hours = Array.from({ length: 49 }, (_, k) => { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() - 24 + k);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':00'; });
    const H = { time: hours, temperature_2m: hours.map(() => 18), pressure_msl: hours.map((_, k) => 1020 - k * 0.1), wind_speed_10m: hours.map(() => 8),
      wind_direction_10m: hours.map(() => 0), cloud_cover: hours.map(() => 80), weather_code: hours.map(() => 3), precipitation_probability: hours.map(() => 10) };
    await q.addInitScript(({ Y, H }) => {
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }],
        catches: [{ id: 'g1', sp: 's1', at: new Date().toISOString(), y: Y, t: true, gps: { lat: 46.2557, lng: 20.1575 } }] }));
      localStorage.setItem('fogasnaplo.home', JSON.stringify({ lat: 46.2557, lng: 20.1575, ts: Date.now() }));
      localStorage.setItem('fogasnaplo.today', JSON.stringify({ fetched: Date.now(), lat: 46.2557, lng: 20.1575, h: H }));
    }, { Y, H });
    await q.goto(PAGE); await q.waitForTimeout(600);
    ok(await q.locator('#today .today-more').count() === 1 && await q.locator('#today svg.spark').count() === 0, 'előrejelzés alapból kompakt (nincs görbe, van „Részletek”)');
    await q.locator('#today .today-more').click();
    ok(await q.locator('#today svg.spark').count() === 1 && (await q.locator('#today .today-more').innerText()).includes('Kevesebb'), 'Részletek: kinyílik a teljes előrejelzés');
    ok(await q.locator('details.more').count() === 2, 'Mentés és szabályok: hosszú szöveg lenyitható részben');

    await q.locator('.tabbar button[data-tab="list"]').click(); await q.waitForTimeout(150);
    ok(await q.locator('#statsBox').isHidden() && (await q.locator('#statsNote').innerText()).includes('1 fogás alapján'), 'statisztika 1 fogásnál összecsukva');
    await q.locator('#statsToggle').click();
    ok(await q.locator('#statsBox').isVisible(), 'statisztika lenyitható');
    await q.locator('#statsToggle').click();

    await q.locator('.tabbar button[data-tab="map"]').click(); await q.waitForTimeout(800);
    ok(await q.locator('#bigMap .pin.gps').count() === 1 && (await q.locator('#mapHint').innerText()).includes('GPS'), 'térkép: GPS-es fogás kék jelölővel látszik');

    await q.locator('.tabbar button[data-tab="list"]').click(); await q.locator('.citem').first().click(); await q.waitForTimeout(150);
    await q.locator('#sheet button', { hasText: 'Hely megadása' }).click(); await q.waitForTimeout(500);
    ok((await q.locator('#pickHint').innerText()).includes('rögzítéskori helyed'), 'helyválasztó: a rögzítéskori GPS-hely előre kijelölve');
    ok(await q.evaluate(() => document.querySelector('#pickMap').querySelectorAll('.pin').length) === 1, 'helyválasztó: jelölő a GPS-helyen');
    await q.locator('#pickDone').click(); await q.locator('#sheet .btn-main').click(); await q.waitForTimeout(150);
    const pl = (await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')))).catches[0].place;
    ok(pl && Math.abs(pl.lat - 46.2557) < 1e-4, 'Kész után a hely elmentve a GPS-pontra');
    await ctx.close();
  }
  {
    // no GPS, no home: the picker starts zoomed out, a tap there only zooms in
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Csuka' }], catches: [{ id: 'n1', sp: 's1', at: new Date().toISOString(), y: new Date().getFullYear() }] })));
    await q.goto(PAGE); await q.waitForTimeout(300);
    await q.locator('.tabbar button[data-tab="list"]').click(); await q.locator('.citem').first().click();
    await q.locator('#sheet button', { hasText: 'Hely megadása' }).click(); await q.waitForTimeout(500);
    const box = await q.locator('#pickMap').boundingBox(); await q.mouse.click(box.x + box.width / 2, box.y + box.height / 2); await q.waitForTimeout(400);
    ok((await q.locator('#pickHint').innerText()).includes('Ránagyítottam') && await q.locator('#pickMap .pin').count() === 0, 'országos nézetben koppintás: ránagyít, nem tesz le jelölőt');
    await ctx.close();
  }
  ok(errs.length === 0, 'nincs JS-hiba' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); console.log(fails ? fails + ' HIBA' : 'MIND RENDBEN'); process.exit(fails ? 1 : 0);
})();
