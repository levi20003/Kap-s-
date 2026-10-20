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
  // reduced motion makes the checks deterministic; the motion tests ask for 'no-preference' themselves
  const rawNew = b.newContext.bind(b);
  b.newContext = async (o = {}) => { const c = await rawNew({ reducedMotion: 'reduce', ...o }); c.setDefaultTimeout(6000); return c; };
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
  await p.locator('.tabbar button[data-tab="more"]').click(); await p.locator('#saveBtn').click();
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
    ok(t.includes('ebből 5 elvitt') && (await q.locator('#catchList').innerText()).includes('elengedve'), 'lista: ' + t);
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
    await q.locator('.tabbar button[data-tab="more"]').click();
    ok((await q.locator('#autoBk').innerText()).includes('Mappa kiválasztása'), 'mentés: mappa még nincs, választó gomb látszik');
    await q.locator('#saveBtn').click();
    ok((await q.evaluate(() => window.__z.saved) || '').endsWith('.zip'), 'Mentés most mappa nélkül: fájlmentés (ZIP) indul');
    await q.locator('#autoBk .btn-ghost').click(); await q.waitForTimeout(200);
    let z = await q.evaluate(() => window.__z);
    ok(z.calls.length === 1 && z.calls[0].auto === false && z.calls[0].n === 3, 'mappaválasztás után azonnal ment');
    ok((await q.locator('#autoBk').innerText()).includes('Utoljára'), 'állapot: „Hetente automatikus mentés ide … Utoljára”');
    await q.locator('#saveBtn').click(); await q.waitForTimeout(200);
    z = await q.evaluate(() => window.__z);
    ok(z.calls.length === 2 && z.calls[1].auto === false, 'Mentés most mappával: egyenesen a mappába ment');
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
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.locator('#restoreBtn').click(); await q.waitForTimeout(200);
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
    await q.locator('.tabbar button[data-tab="stats"]').click(); await q.waitForTimeout(150);
    ok((await q.locator('#monthStats').innerText()).includes('májusban (7)'), 'havonta: legtöbb fogás májusban (7)');
    ok((await q.locator('#bestStats').innerText()).includes('Csuka · 8 fogás'), 'fajonként: Csuka · 8 fogás');
    await q.locator('.months button').nth(8).click();
    ok(await q.locator('#tab-list').isVisible() && (await q.locator('#listTitle').textContent()) === 'Idei fogások (5)', 'hónapra koppintva a Fogások fülre ugrik, szeptemberre szűrve (5)');
    ok((await q.locator('#activeFilters').innerText()).includes('Szeptember'), 'látszik az aktív hónap-szűrő');
    await q.locator('#catchSearch').fill('hidegfront');
    ok((await q.locator('#listTitle').textContent()) === 'Idei fogások (1)', 'keresés a megjegyzésben');
    await q.locator('#catchSearch').fill('holt-tisza');
    ok(await q.locator('#catchList .empty').count() === 1, 'nincs találat: üzenet (szeptemberben nem volt Holt-Tisza)');
    await q.locator('#activeFilters .chip').click();
    ok((await q.locator('#listTitle').textContent()) === 'Idei fogások (4)', 'hónapszűrő törlése a chippel, keresés marad: Holt-Tisza 4');
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
    await q.locator('.tabbar button[data-tab="more"]').click();
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

    await q.locator('.tabbar button[data-tab="stats"]').click(); await q.waitForTimeout(150);
    ok(await q.locator('#kpis .kpi').count() === 3 && await q.locator('#statsEmpty').isHidden(), 'statisztika: 3 összefoglaló csempe, nincs üres állapot');

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
  // theme: light / dark sage, automatic by the phone's mode, or chosen by hand
  {
    const seedT = () => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Csuka' }], catches: [] }));
    let ctx = await b.newContext({ colorScheme: 'light' }); let q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(seedT); await q.goto(PAGE); await q.waitForTimeout(200);
    ok(await q.evaluate(() => document.documentElement.dataset.theme) === 'light', 'böngésző világos módban: világos zsálya');
    ok((await q.locator('#themeBtn').getAttribute('aria-label')) === 'Váltás sötét módra', 'téma-gomb: világosban „Váltás sötét módra”');
    await q.locator('#themeBtn').click();
    ok(await q.evaluate(() => document.documentElement.dataset.theme) === 'dark' && await q.evaluate(() => localStorage.getItem('fogasnaplo.theme')) === 'dark', 'gomb: sötétre vált (a telefon világos, ez felülbírálás), megmarad');
    await q.reload(); await q.waitForTimeout(200);
    ok(await q.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'újraindítás után is sötét (a választás felülírja a rendszert)');
    await q.locator('#themeBtn').click();
    ok(await q.evaluate(() => document.documentElement.dataset.theme) === 'light' && await q.evaluate(() => localStorage.getItem('fogasnaplo.theme')) === null, 'a telefon módjára visszaváltva újra követi a telefont (a választás törlődik)');
    await ctx.close();

    ctx = await b.newContext({ colorScheme: 'dark' }); q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [], catches: [] })); window.__th = [];
      window.FogasnaploAndroid = { isNight() { return false; }, setTheme(l) { window.__th.push(l); }, saveThumb() { return ''; }, cleanup() {}, getLocation() {} }; });
    await q.goto(PAGE); await q.waitForTimeout(200);
    ok(await q.evaluate(() => document.documentElement.dataset.theme) === 'light' && (await q.evaluate(() => window.__th)).slice(-1)[0] === true, 'Android nappali mód: világos téma, a rendszersávok is világosak');
    await q.evaluate(() => window.__fnSysTheme({ night: true }));
    ok(await q.evaluate(() => document.documentElement.dataset.theme) === 'dark' && (await q.evaluate(() => window.__th)).slice(-1)[0] === false, 'telefon sötét módra vált: az app is átvált');
    await ctx.close();
  }
  // test build: update banner
  {
    const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [], catches: [] })); window.__u = { inst: 0 };
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {},
        checkUpdate() { setTimeout(() => window.__fnUpdate({ versionCode: 1042, versionName: 'teszt-abc1234', notes: 'Zsálya színvilág' })); },
        installUpdate() { window.__u.inst++; setTimeout(() => window.__fnUpdateState({ state: 'ready' })); } }; });
    await q.goto(PAGE); await q.waitForTimeout(2900);
    ok(await q.locator('#updBar').isVisible() && (await q.locator('#updBar').innerText()).includes('Zsálya színvilág'), 'tesztverzió: frissítés-sáv megjelenik a változás leírásával');
    await q.locator('#updBar .btn-main').click(); await q.waitForTimeout(100);
    ok((await q.evaluate(() => window.__u.inst)) === 1 && await q.locator('#updBar').isHidden(), 'Frissítés: letöltés indul, megnyílik a telepítő');
    await q.reload(); await q.waitForTimeout(2900);
    await q.locator('#updBar .no').click();
    await q.reload(); await q.waitForTimeout(2900);
    ok(await q.locator('#updBar').isHidden(), '„Később”: erre a verzióra nem kérdez újra');
    await ctx.close();
  }
  // tabs: structure, home content, species management
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const Y = new Date().getFullYear();
    const cs = Array.from({ length: 9 }, (_, i) => ({ id: 't' + i, sp: i % 2 ? 's1' : 's2', at: new Date(Y, 3 + (i % 4), 2 + i, 9).toISOString(), y: Y, t: true, l: 40 + i * 3, lure: 'Wobbler' }));
    await q.addInitScript(cs => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Csuka' }, { id: 's2', name: 'Süllő' }], catches: cs })), cs);
    await q.goto(PAGE); await q.waitForTimeout(300);
    ok(await q.locator('.tabbar button').count() === 5, 'öt fül van');
    for (const t of ['home', 'list', 'stats', 'map', 'more']) {
      await q.locator(`.tabbar button[data-tab="${t}"]`).click(); await q.waitForTimeout(120);
      const vis = await q.evaluate(() => ['home', 'list', 'stats', 'map', 'more'].filter(x => !document.getElementById('tab-' + x).hidden));
      ok(vis.length === 1 && vis[0] === t, `„${t}” fül: csak az az egy tartalom látszik`);
    }
    ok(await q.locator('#yearbar').isHidden(), 'a Beállítások fülön nincs évválasztó');
    await q.locator('.tabbar button[data-tab="home"]').click();
    ok(await q.locator('#yearbar').isVisible(), 'a Kezdőlapon van évválasztó');
    const homeTxt = await q.locator('#tab-home').innerText();
    ok(!homeTxt.includes('Utolsó:') && !homeTxt.includes('Rekord:'), 'a Kezdőlapon nincsenek régebbi fogások részletei');
    ok(await q.locator('#records .rcard').count() === 2 && await q.locator('#records .rcard.gold').count() === 1, 'rekordok: vízszintes sor, az első arany');
    ok(await q.locator('#list .row').count() === 2 && await q.locator('#list .row .plus').count() === 2, 'halfaj-kártyák + gombbal');
    await q.locator('#list .addrow').click();
    ok(await q.locator('#tab-more').isVisible(), '„Halfajok hozzáadása és törlése” a Beállításokra visz');
    await q.locator('#newName').fill('Balin'); await q.locator('#addForm button').click();
    ok(await q.locator('#myList .myrow').count() === 3, 'új halfaj a Beállításokban felvehető');
    await q.locator('#myList .myrow', { hasText: 'Süllő' }).locator('.del').click();
    ok((await q.locator('#myList .confirm').innerText()).includes('rögzített fogása is törlődik'), 'törlés előtt megerősítést kér (a fogások is törlődnek)');
    await q.locator('#myList .confirm .yes').click();
    const left = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    ok(left.species.map(x => x.name).sort().join() === 'Balin,Csuka' && left.catches.every(c => c.sp !== 's2'), 'törölt halfaj és fogásai eltűntek');
    await ctx.close();

    // empty log: the first-run card offers the common species right on the home page
    const c2 = await b.newContext({ viewport: { width: 412, height: 915 } }); const e = await c2.newPage(); e.on('pageerror', x => errs.push(x.message));
    await e.addInitScript(() => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [], catches: [] })));
    await e.goto(PAGE); await e.waitForTimeout(300);
    ok(await e.locator('#list .empty-card .chip').count() >= 5, 'üres naplónál a Kezdőlapon ott vannak a gyakori halfajok');
    await e.locator('#list .empty-card .chip', { hasText: 'Csuka' }).click();
    ok(await e.locator('#list .row').count() === 1 && (await e.locator('#list .row .name').innerText()) === 'Csuka', 'egy koppintással felvehető az első halfaj');
    await e.locator('.tabbar button[data-tab="stats"]').click();
    ok(await e.locator('#statsEmpty').isVisible(), 'üres statisztika: barátságos üzenet');
    await c2.close();
  }
  // layout: nothing wider than the screen, on small and normal phones, in both themes; hero text stays white
  {
    const Y = new Date().getFullYear(), lures = ['Wobbler', 'Gumihal', 'Támolygó'];
    const cs = Array.from({ length: 22 }, (_, i) => ({ id: 'l' + i, sp: ['s1', 's2', 's3'][i % 3], at: new Date(Y, 3 + (i % 6), 2 + i, 7 + i % 10).toISOString(), y: Y, t: true,
      lure: lures[i % 3], l: 38 + i * 2, w: i % 3 === 0 ? 1.2 + i / 10 : undefined, kept: i % 4 === 0 ? true : undefined, place: { name: 'Tisza, Szeged felső', lat: 46.25, lng: 20.15 } }));
    for (const W of [360, 412]) for (const scheme of ['light', 'dark']) {
      const ctx = await b.newContext({ viewport: { width: W, height: 915 }, colorScheme: scheme }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
      await q.addInitScript(cs => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Sebes pisztráng' }, { id: 's2', name: 'Szilvaorrú keszeg' }, { id: 's3', name: 'Balin' }], catches: cs })), cs);
      await q.goto(PAGE); await q.waitForTimeout(300);
      const wide = [];
      for (const t of ['home', 'list', 'stats', 'more']) {
        await q.locator(`.tabbar button[data-tab="${t}"]`).click(); await q.waitForTimeout(100);
        const over = await q.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        if (over > 1) wide.push(t + ' +' + over + 'px');
      }
      ok(wide.length === 0, `${W}px, ${scheme}: nincs vízszintes túlcsordulás` + (wide.length ? ' (' + wide.join(', ') + ')' : ''));
      await q.locator('.tabbar button[data-tab="home"]').click();
      ok(await q.evaluate(() => getComputedStyle(document.querySelector('.total .n')).color) === 'rgb(255, 255, 255)', `${W}px, ${scheme}: a hős-kártya száma fehér`);
      await ctx.close();
    }
  }
  // backup in a plain browser: one button saves a .json, one opens the file picker; version line
  {
    const ctx = await b.newContext({ acceptDownloads: true }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(seedT => localStorage.setItem('fogasnaplo.v1', JSON.stringify(seedT)), seed);
    await q.goto(PAGE); await q.waitForTimeout(300);
    await q.locator('.tabbar button[data-tab="more"]').click();
    ok(await q.locator('#autoBk').isHidden() && (await q.locator('#verLine').innerText()) === 'böngésző', 'böngészőben nincs mappa-mentés, a verzió „böngésző”');
    const [dl] = await Promise.all([q.waitForEvent('download'), q.locator('#saveBtn').click()]);
    ok(/^fogasnaplo-\d{4}-\d{2}-\d{2}\.json$/.test(dl.suggestedFilename()), 'Mentés most: .json letöltés (' + dl.suggestedFilename() + ')');
    const [fc] = await Promise.all([q.waitForEvent('filechooser'), q.locator('#restoreBtn').click()]);
    ok(!!fc, 'Visszaállítás: megnyílik a fájlválasztó');
    await ctx.close();
    const c2 = await b.newContext(); const a = await c2.newPage(); a.on('pageerror', e => errs.push(e.message));
    await a.addInitScript(() => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [], catches: [] }));
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, appVersion() { return '1.6 (1012) · teszt'; }, backupFolder() { return ''; }, zipToFolder() {}, saveZip() {}, restoreZip() {}, pickBackupFolder() {} }; });
    await a.goto(PAGE); await a.waitForTimeout(300);
    await a.locator('.tabbar button[data-tab="more"]').click();
    ok((await a.locator('#verLine').innerText()) === '1.6 (1012) · teszt', 'Beállítások: az app verziója látszik');
    await c2.close();
  }
  // motion: tabs rise in, the total counts up, the theme switch animates and still lands right
  {
    const Y = new Date().getFullYear();
    const cs = Array.from({ length: 12 }, (_, i) => ({ id: 'a' + i, sp: 's1', at: new Date(Y, 4, 2 + i, 9).toISOString(), y: Y, t: true }));
    const ctx = await rawNew({ reducedMotion: 'no-preference', colorScheme: 'light', viewport: { width: 412, height: 915 } }); ctx.setDefaultTimeout(6000);
    const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(cs => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Csuka' }], catches: cs })), cs);
    await q.goto(PAGE); await q.waitForTimeout(150);
    ok(await q.locator('#tab-home.enter').count() === 1, 'induláskor a Kezdőlap kártyái animálva érkeznek');
    await q.waitForTimeout(1700);
    ok(await q.locator('#tab-home.enter').count() === 0 && (await q.locator('#totalN').innerText()) === '12', 'az animáció lefut, a szám megáll a végértéken (12)');
    await q.locator('.tabbar button[data-tab="stats"]').click();
    ok(await q.locator('#tab-stats.enter').count() === 1 && (await q.locator('#tabind').getAttribute('style')).includes('--ti: 2'), 'fülváltáskor belépő animáció, a jelző a 3. fülre csúszik');
    await q.waitForTimeout(1700);
    ok(await q.evaluate(() => getComputedStyle(document.querySelector('#tab-stats section')).opacity) === '1', 'animáció után minden kártya teljesen látszik');
    await q.locator('#themeBtn').click(); await q.waitForTimeout(1100);
    ok(await q.evaluate(() => document.documentElement.dataset.theme) === 'dark', 'animált témaváltás: sötét lett');
    await q.locator('#themeBtn').click(); await q.waitForTimeout(1100);
    ok(await q.evaluate(() => document.documentElement.dataset.theme) === 'light', 'animált témaváltás: vissza világosra');
    await ctx.close();
  }
  ok(errs.length === 0, 'nincs JS-hiba' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await b.close(); console.log(fails ? fails + ' HIBA' : 'MIND RENDBEN'); process.exit(fails ? 1 : 0);
})();
