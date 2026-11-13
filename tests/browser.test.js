// Browser tests of index.html with a fake Android bridge.  Run: cd tests && npm test
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const os = require('os');
// the app's assets over a tiny local web server: headless Chromium forgets file:// localStorage across reloads (the phone's WebView does not)
const ASSETS = path.resolve(__dirname, '../app/src/main/assets');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json' };
const server = require('http').createServer((req, res) => {
  const f = path.join(ASSETS, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(ASSETS) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
}).listen(47821, '127.0.0.1');
server.unref();
const PAGE = process.env.TEST_FILE_URL ? 'file://' + ASSETS + '/index.html' : 'http://127.0.0.1:47821/index.html';
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
  // the river discharge API is never reached for real (page routes in a test override this)
  // and the first-start welcome counts as seen, unless a test asks for it with { welcome: true }
  b.newContext = async (o = {}) => { const { welcome, ...rest } = o; const c = await rawNew({ reducedMotion: 'reduce', ...rest }); c.setDefaultTimeout(6000);
    await c.route('https://flood-api.open-meteo.com/**', r => r.abort());
    if (!welcome) await c.addInitScript(() => { try { localStorage.setItem('fogasnaplo.welcome', '1'); } catch (e) {} });
    return c; };
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
  // a syntax error anywhere stops the whole app script: say so first, plainly
  ok(await p.evaluate(() => typeof window.__fnBack === 'function' && typeof window.__fnZipDone === 'function'), 'az app szkriptje hiba nélkül betöltődött');
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
  ok(await p.locator('#sheet .vhead h3').isVisible() && await p.locator('#sheet input, #sheet textarea, #sheet select').count() === 0, 'fogásra koppintva megtekintő kártya nyílik (nem szerkesztő)');
  await p.locator('#sheet .btn-main', { hasText: 'Szerkesztés' }).click(); await p.waitForTimeout(150);
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
    ok(t.includes('ebből 5 elvitt') && (await q.locator('#catchList').textContent()).includes('elengedve'), 'lista: ' + t);
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
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.stack));
    const Y = new Date().getFullYear(), now = new Date();
    const hours = Array.from({ length: 24 * 8 }, (_, k) => { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() - 24 + k);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') + 'T' + String(d.getHours()).padStart(2, '0') + ':00'; });
    const H = { time: hours, temperature_2m: hours.map(() => 18), pressure_msl: hours.map((_, k) => 1020 - k * 0.1), wind_speed_10m: hours.map(() => 8),
      wind_direction_10m: hours.map(() => 0), wind_gusts_10m: hours.map(() => 15), cloud_cover: hours.map(() => 80), weather_code: hours.map(() => 3),
      precipitation: hours.map((_, k) => k % 7 === 0 ? 0.6 : 0), precipitation_probability: hours.map(() => 10) };
    const days = Array.from({ length: 8 }, (_, k) => { const d = new Date(now); d.setDate(d.getDate() - 1 + k);
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); });
    const D = { time: days, weather_code: days.map(() => 61), temperature_2m_max: days.map((_, k) => 15 + k), temperature_2m_min: days.map(() => 6),
      precipitation_sum: days.map(() => 2.4), precipitation_probability_max: days.map(() => 70), wind_speed_10m_max: days.map(() => 21),
      wind_gusts_10m_max: days.map(() => 40), wind_direction_10m_dominant: days.map(() => 270), sunrise: days.map(d => d + 'T06:58'), sunset: days.map(d => d + 'T17:44') };
    await q.addInitScript(({ Y, H, D }) => {
      window.__gps = 0;
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() { window.__gps++; } };
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }],
        catches: [{ id: 'g1', sp: 's1', at: new Date().toISOString(), y: Y, t: true, gps: { lat: 46.2557, lng: 20.1575 } }] }));
      localStorage.setItem('fogasnaplo.today', JSON.stringify({ fetched: Date.now(), lat: 46.253, lng: 20.148, h: H, d: D }));
    }, { Y, H, D });
    await q.route('https://geocoding-api.open-meteo.com/**', r => r.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ results: [{ name: 'Csongrád', latitude: 46.71, longitude: 20.14, admin1: 'Csongrád-Csanád', country: 'Magyarország', country_code: 'HU' }] }) }));
    let wxUrl = '';
    await q.route('https://api.open-meteo.com/**', r => { if (r.request().url().includes('daily=')) wxUrl = r.request().url(); r.fulfill({ contentType: 'application/json', body: JSON.stringify({ hourly: H, daily: D }) }); });
    await q.goto(PAGE); await q.waitForTimeout(600);
    ok((await q.locator('#wxPlaceBtn').innerText()).includes('Szeged') && await q.evaluate(() => window.__gps) === 0, 'időjárás: alapból Szeged, a GPS-t nem kéri');
    ok(await q.locator('#today .hours .hr').count() === 25 && (await q.locator('#today .hours .hr').first().innerText()).includes('Most'), 'időjárás: óránkénti sáv a következő 24 órára');
    const facts = await q.locator('#today .facts').first().innerText(), arc = await q.locator('#today svg.sun-arc').textContent();
    ok(arc.includes('06:58') && arc.includes('17:44') && arc.includes('Nappal') && facts.includes('Eső 2,4 mm') && facts.includes('Szél max 21 km/h'), 'időjárás: napív (napkelte, napnyugta), eső, szél');
    ok(await q.locator('#today .hours .hr').first().evaluate(e => e.classList.contains('now')), 'időjárás: a „Most” óra kiemelve');
    const maRow = q.locator('#today .days .day').first(), lbl = (await q.locator('#today .score .lbl').innerText()).toLowerCase();
    ok(await maRow.isVisible() && (await maRow.innerText()).includes('Ma') && await maRow.evaluate(e => e.classList.contains('today') && e.classList.contains('on')), 'napsáv: a „Ma” elöl, kiemelve és kiválasztva');
    ok((await q.locator('#today .selday .d-lv').innerText()).toLowerCase() === lbl && (await maRow.getAttribute('aria-label')).toLowerCase().includes(lbl), 'értékelés: a fejléc és a „Ma” ugyanazt írja');
    ok(await q.locator('#today .days .day').count() === 7 && await q.locator('#today svg.spark').count() === 0, 'napsáv: 7 nap, alapból nincs légnyomás-görbe');
    await q.locator('#today .days .day').nth(1).click();
    ok((await q.locator('#today .wx-sub').first().textContent()).startsWith('Holnap') && (await q.locator('#today .hours .hr').first().innerText()).includes('04:00'), 'napra koppintva annak az órái látszanak');
    ok(await q.locator('#today .day.today').count() === 1 && !(await q.locator('#today .day.today').evaluate(e => e.classList.contains('on'))) && (await q.locator('#today .day.on').getAttribute('aria-label')).startsWith('Holnap'), 'másik nap: kiválasztva, a „Ma” jelölése megmarad');
    await q.locator('#today .today-more').click();
    ok(await q.locator('#today svg.spark').count() === 1 && await q.locator('#today .days .day').count() === 7 && (await q.locator('#today .today-more').innerText()).includes('Kevesebb'), 'Részletek: 7 nap és a légnyomás-görbe');
    const eve = (await q.locator('#today .win').nth(1).innerText()).match(/(\d\d):(\d\d)–(\d\d):(\d\d)/), mins = eve && (eve[3] * 60 + +eve[4]) - (eve[1] * 60 + +eve[2]);
    ok(eve && eve[1] + ':' + eve[2] === '17:44' && mins >= 25 && mins <= 45, 'esti rablás: napnyugtától kb. fél óra (' + (eve && eve[0]) + ')');
    ok(await q.locator('#today .wx-explain').count() === 1 && (await q.locator('#today .wx-explain').textContent()).includes('hektopascal'), 'Részletek: magyarázat az értékelésről és a hPa-ról');
    await q.locator('#wxPlaceBtn').click();
    await q.locator('#today .wxsearch input').fill('Csongrád'); await q.locator('#today .wxsearch button').click(); await q.waitForTimeout(300);
    await q.locator('#today .wxopt', { hasText: 'Csongrád' }).first().click(); await q.waitForTimeout(400);
    ok((await q.locator('#wxPlaceBtn').innerText()).includes('Csongrád') && wxUrl.includes('latitude=46.710') && await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.wxplace')).name) === 'Csongrád', 'kézi hely: keresés után arra frissül, és megjegyzi');
    for (const w of [360, 412]) { await q.setViewportSize({ width: w, height: 800 }); await q.waitForTimeout(100);
      ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'időjárás: nincs vízszintes túlcsordulás ' + w + ' px-en'); }
    await q.setViewportSize({ width: 390, height: 844 });
    ok(await q.locator('details.more:not(.wx-explain)').count() === 2, 'Mentés és szabályok: hosszú szöveg lenyitható részben');

    await q.locator('.tabbar button[data-tab="stats"]').click(); await q.waitForTimeout(150);
    ok(await q.locator('#kpis .kpi').count() === 3 && await q.locator('#statsEmpty').isHidden(), 'statisztika: 3 összefoglaló csempe, nincs üres állapot');

    await q.locator('.tabbar button[data-tab="map"]').click(); await q.waitForTimeout(800);
    ok(await q.locator('#bigMap .pin.gps').count() === 1 && (await q.locator('#mapHint').innerText()).includes('GPS'), 'térkép: GPS-es fogás kék jelölővel látszik');
    await q.route('https://tile.openstreetmap.org/**', r => r.abort()); await q.evaluate(() => window.dispatchEvent(new Event('resize')));
    await q.locator('#bigMap .leaflet-control-zoom-in').click(); await q.waitForTimeout(600);
    ok(await q.locator('#bigMap .map-offline').isVisible(), 'térkép internet nélkül: jelzi, miért üres a háttér');

    await q.locator('.tabbar button[data-tab="list"]').click(); await q.locator('.citem').first().click(); await q.waitForTimeout(150);
    await q.locator('#sheet .btn-main', { hasText: 'Szerkesztés' }).click();
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
    await q.locator('#sheet .btn-main', { hasText: 'Szerkesztés' }).click();
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
    await q.waitForTimeout(400); await q.reload(); await q.waitForTimeout(200);
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
  // catch card, several photos + video, share card
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await q.addInitScript(({ PX }) => {
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Csuka' }], catches: [{ id: 'm1', sp: 's1', at: new Date().toISOString(), y: new Date().getFullYear(), t: true, l: 62,
        lure: 'Gumihal', note: 'Akadó mellől', place: { name: 'Holt-Tisza', lat: 46.3, lng: 20.1 }, photo: { src: 'file:///data/photos/p1.jpg', thumb: 'file:///data/thumbs/t1.jpg' } }] }));
      let n = 1; window.__m = { deleted: [], share: null };
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, readThumb() { return PX; }, readPhoto() { return PX; },
        deletePhoto(u) { window.__m.deleted.push(u); }, shareImage(u, t) { window.__m.share = { u, t }; },
        pickPhoto(src) { setTimeout(() => window.__fnPhoto(src === 'video' ? { src: 'file:///data/photos/v1.mp4', thumb: 'file:///data/thumbs/v1.jpg', video: true, dur: 12000 }
          : { src: 'file:///data/photos/p' + (++n) + '.jpg', thumb: 'file:///data/thumbs/t' + n + '.jpg' })); } };
    }, { PX });
    await q.goto(PAGE); await q.waitForTimeout(300);
    const st = () => q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')).catches[0]);
    await q.locator('.tabbar button[data-tab="list"]').click(); await q.locator('.citem').first().click(); await q.waitForTimeout(150);
    const info = await q.locator('#sheet .vinfo').innerText();
    ok((await q.locator('#sheet .vhead').innerText()).includes('62 cm') && info.includes('Gumihal') && info.includes('Holt-Tisza') && info.includes('Akadó mellől') && await q.locator('#sheet .vslide').count() === 1, 'megtekintő: régi fotó, méret, csali, hely, megjegyzés');
    await q.locator('#sheet .btn-main', { hasText: 'Szerkesztés' }).click(); await q.waitForTimeout(100);
    await q.locator('#sheet .media-add button', { hasText: 'Videó' }).click(); await q.waitForTimeout(100);
    await q.locator('#sheet .media-add button', { hasText: 'Fotó' }).click(); await q.waitForTimeout(100);
    ok(await q.locator('#sheet .mtile').count() === 3 && (await q.locator('#sheet .mtile.vid .mbadge').innerText()).includes('0:12'), 'szerkesztő: több fotó és videó (hossz a jelvényen)');
    await q.locator('#sheet .btn-main', { hasText: 'Mentés' }).click(); await q.waitForTimeout(150);
    let c = await st();
    ok(c.media.length === 3 && c.media[1].video && c.photo.src.endsWith('p1.jpg') && await q.locator('#sheet .vslide').count() === 3 && await q.locator('#sheet .vslide video').count() === 1 && await q.locator('#sheet .vdots i').count() === 3,
      'mentés után vissza a kártyára: 3 elem lapozva, videó lejátszóval; a régi „photo” mező az első fotó marad');
    await q.locator('#sheet .btn-main', { hasText: 'Szerkesztés' }).click();
    await q.locator('#sheet .mtile .xbtn').first().click(); await q.locator('#sheet .btn-main', { hasText: 'Mentés' }).click(); await q.waitForTimeout(150);
    c = await st();
    ok(c.media.length === 2 && c.photo.src.endsWith('p2.jpg') && (await q.evaluate(() => window.__m.deleted)).includes('file:///data/photos/p1.jpg'), 'eltávolított fotó: fájl törölve, a „photo” a következő fotó');
    await q.locator('#sheet .btn-main', { hasText: 'Szerkesztés' }).click();
    await q.locator('#sheet .media-add button', { hasText: 'Fotó' }).click(); await q.waitForTimeout(100);
    await q.locator('#sheet .btn-ghost', { hasText: 'Mégse' }).click(); await q.waitForTimeout(100);
    ok((await st()).media.length === 2 && (await q.evaluate(() => window.__m.deleted)).includes('file:///data/photos/p3.jpg') && await q.locator('#sheet .vhead').isVisible(), 'Mégse: az új fotó fájlja törlődik, vissza a kártyára');
    await q.locator('#sheet .btn-ghost', { hasText: 'Megosztás' }).click(); await q.waitForTimeout(600);
    const sh = await q.evaluate(() => window.__m.share);
    ok(sh && sh.u.startsWith('data:image/jpeg') && sh.u.length > 5000 && sh.t.includes('Csuka') && sh.t.includes('62 cm'), 'megosztás: fogáskártya kép + szöveg');
    ok(await q.evaluate(() => window.__fnBack()) && await q.locator('#sheetWrap').isHidden(), 'vissza gomb: bezárja a kártyát');
    ok((await q.locator('.citem .mcount').textContent()) === '2', 'listában: a bélyegképen a darabszám');
    await q.locator('.tabbar button[data-tab="stats"]').click(); await q.waitForTimeout(150);
    const yc = await q.locator('#yearCard').innerText();
    ok(await q.locator('#yearCard').isVisible() && yc.includes('Az idei éved') && yc.includes('Csuka, 62 cm'), 'statisztika: év összefoglaló kártya (rekorddal)');
    await q.evaluate(() => { window.__m.share = null; }); await q.locator('#yearCard .hero-go').click(); await q.waitForTimeout(800);
    const ys = await q.evaluate(() => window.__m.share);
    ok(ys && ys.u.startsWith('data:image/jpeg') && ys.t.includes('1 hal') && ys.t.includes('Csuka, 62 cm'), 'évösszefoglaló: sztori-kép megosztása');
    await ctx.close();
  }
  // old catches without weather (and without a place) get it from the archive, near the weather place
  {
    const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const Y = new Date().getFullYear() - 1;
    await q.addInitScript(({ Y }) => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }],
      catches: [{ id: 'o1', sp: 's1', at: new Date(Y, 4, 21, 19, 20).toISOString(), y: Y, t: true }, { id: 'o2', sp: 's1', at: new Date(Y, 7, 15, 12).toISOString(), y: Y, t: false }] })), { Y });
    const urls = [];
    await q.route('https://archive-api.open-meteo.com/**', r => { const u = new URL(r.request().url()); urls.push(u);
      const s = u.searchParams.get('start_date'), e = u.searchParams.get('end_date'), time = [];
      for (const d of [s, e]) for (let h = 0; h < 24; h++) time.push(d + 'T' + String(h).padStart(2, '0') + ':00');
      const n = time.length, f = v => Array(n).fill(v);
      r.fulfill({ contentType: 'application/json', body: JSON.stringify({ hourly: { time, temperature_2m: f(19), pressure_msl: time.map((_, k) => 1016 - k * 0.3), wind_speed_10m: f(8),
        wind_direction_10m: f(140), wind_gusts_10m: f(15), cloud_cover: f(60), weather_code: f(3), precipitation: f(0) } }) }); });
    await q.route('https://api.open-meteo.com/**', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(2500);
    const cs = (await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')))).catches;
    ok(cs.every(c => c.wx && c.wx.p && c.wx.dp != null && c.wx.near === 'Szeged környéki') && urls.length === 2 && urls.every(u => u.searchParams.get('latitude').startsWith('46.2')),
      'régi, hely nélküli fogások: archív időjárás Szeged környékéről (' + urls.length + ' kérés)');
    ok(cs.find(c => c.id === 'o2').wx.noon === true, 'idő nélküli fogás: déli adat');
    await ctx.close();
  }
  // quick log button, and the season's species share and lure ranking
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const Y = new Date().getFullYear(), at = (m, d) => new Date(Y, m, d, 10).toISOString();
    const catches = [
      { id: 'b1', sp: 's1', at: at(4, 3), y: Y, t: true, l: 40, lure: 'Wobbler' }, { id: 'b2', sp: 's1', at: at(4, 9), y: Y, t: true, l: 50, lure: 'Wobbler' },
      { id: 'b3', sp: 's1', at: at(5, 2), y: Y, t: true, l: 60, lure: 'Wobbler' }, { id: 'c1', sp: 's2', at: at(5, 5), y: Y, t: true, l: 80, lure: 'Spintail' }];
    await q.addInitScript(({ catches }) => {
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }, { id: 's2', name: 'Csuka' }], catches }));
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, pickPhoto() {} };
    }, { catches });
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(400);
    await q.locator('.tabbar button[data-tab="stats"]').click(); await q.waitForTimeout(200);
    const sp = await q.locator('#speciesList').innerText();
    ok(sp.includes('Balin') && sp.includes('3 db · 75%') && sp.includes('Csuka') && sp.includes('1 db · 25%'), 'statisztika: halfajonkénti megoszlás darabbal és %-kal');
    const lr = await q.locator('#lures .lure-row').first().innerText();
    ok(lr.includes('Wobbler') && lr.includes('3 fogás') && lr.includes('Balin · 60 cm'), 'csali-rangsor: a legtöbb fogású csali legnagyobb hala is látszik');
    await q.locator('.tabbar button[data-tab="home"]').click(); await q.waitForTimeout(200);
    ok(await q.locator('#fab').isVisible(), 'gyors rögzítés: a gomb látszik');
    await q.locator('#fab').click(); await q.waitForTimeout(200);
    ok(await q.locator('#quick .pill').count() === 9 && await q.locator('#quick .pill.species').count() === 5, 'gyors rögzítés: 4 csali és 5 halfaj gomb');
    await q.locator('#quick .pill', { hasText: 'Spintail' }).click();
    await q.locator('#quick .pill', { hasText: 'Harcsa' }).click(); await q.waitForTimeout(300);
    const st = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    const nc = st.catches.find(c => c.sp && st.species.find(x => x.id === c.sp && x.name === 'Harcsa'));
    ok(st.species.some(x => x.name === 'Harcsa') && nc && nc.lure === 'Spintail', 'gyors rögzítés: hiányzó halfaj felkerül, a fogás a választott csalival mentődik');
    ok(await q.locator('#sheet h3').innerText().then(t => t.includes('Harcsa rögzítve')), 'gyors rögzítés: a részletek szerkesztő azonnal nyílik');
    await q.locator('#sheet .sheet-actions .btn-ghost').click(); await q.waitForTimeout(100);
    ok(await q.locator('#fab').isVisible() && await q.locator('#sheetWrap').isHidden(), 'gyors rögzítés: a szerkesztő bezárása után a kezdőlap látszik');
    await ctx.close();
  }
  // Kap-ás Kihívások: streak, XP and level, badges, one-time announcements
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const now = Date.now(), ago = d => new Date(now - d * 864e5).toISOString(), Y = new Date().getFullYear();
    const catches = [{ id: 'g1', sp: 's1', at: ago(0), y: new Date(ago(0)).getFullYear(), t: true, l: 50, kept: false },
      { id: 'g2', sp: 's1', at: ago(7), y: new Date(ago(7)).getFullYear(), t: true }, { id: 'g3', sp: 's1', at: ago(14), y: new Date(ago(14)).getFullYear(), t: true }];
    await q.addInitScript(({ catches }) => {
      if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
        localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }], catches })); }
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, pickPhoto() {} };
    }, { catches });
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(1300);
    ok(await q.locator('#toast').isHidden(), 'kihívások: első indításkor nincs XP-értesítés (a meglévő fogások csendben számítanak)');
    ok(await q.evaluate(() => !!JSON.parse(localStorage.getItem('fogasnaplo.kihivasok')).xp), 'kihívások: a már bejelentett állás külön kulcsban, a napló nem változik');
    await q.locator('.tabbar button[data-tab="stats"]').click(); await q.waitForTimeout(200);
    const g = await q.locator('#gameSec').innerText();
    const xp = +(await q.locator('#gameSec .gm-level .gm-num').innerText());
    ok(xp >= 80 && /Novícius Pergető|Kezdő Pergető/.test(g), 'kihívások: XP és szint (' + xp + ' XP)');
    ok((await q.locator('#gameSec .gm-streak .gm-num').innerText()) === '3' && g.includes('Leghosszabb: 3 hét'), 'kihívások: 3 hetes sorozat egymást követő hetekből');
    ok(await q.locator('#gameSec .gm-quest').count() === 3, 'kihívások: 3 heti küldetés');
    const balin = q.locator('#gameSec .gm-badge', { hasText: 'Balin' }), rel = q.locator('#gameSec .gm-badge', { hasText: 'Fogd és engedd' });
    ok(await balin.evaluate(e => e.classList.contains('t1')) && await rel.evaluate(e => e.classList.contains('t1')) && await q.locator('#gameSec .gm-badge.locked', { hasText: 'Harcsa' }).count() === 1,
      'kihívások: Balin és fogd-és-engedd bronz, Harcsa még zárva');
    await q.locator('#fab').click(); await q.locator('#quick .pill', { hasText: 'Spintail' }).click(); await q.locator('#quick .pill', { hasText: 'Harcsa' }).click();
    await q.waitForTimeout(1200);
    const t = await q.locator('#toast').innerText();
    ok(/\+\d+ XP/.test(t) && t.includes('Új jelvény: Harcsa') && t.includes('Új jelvény: Spintail'), 'kihívások: új fogás után XP és új jelvények értesítése (' + t + ')');
    await ctx.close();
  }
  // feedback email with device diagnostics
  {
    const ctx = await b.newContext({ viewport: { width: 412, height: 915 }, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) TestAgent/1.0', deviceScaleFactor: 2.5 });
    const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => {
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }],
        catches: [{ id: 'f1', sp: 's1', at: new Date().toISOString(), y: new Date().getFullYear(), t: true, note: 'TITOKHELY-123', place: { name: 'Titkos-holtág', lat: 46.123456, lng: 20.654321 } }] }));
      window.__fb = null;
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, pickPhoto() {}, appVersion() { return '1.8-abc1234 (1042)'; }, isTestBuild() { return true; },
        sendFeedback(to, subject, body) { window.__fb = { to, subject, body }; } };
    });
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(300);
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.waitForTimeout(200);
    ok(await q.locator('#feedbackBtn').isVisible(), 'visszajelzés: a gomb látszik a Beállításokban');
    await q.locator('#feedbackBtn').click(); await q.waitForTimeout(150);
    const fb = await q.evaluate(() => window.__fb);
    ok(fb && fb.subject.includes('1.8-abc1234 (1042)'), 'visszajelzés: a tárgyban az app verziója és a build-azonosító');
    ok(fb && /Verzió: 1\.8-abc1234 \(1042\) \(tesztverzió\)/.test(fb.body) && fb.body.includes('Képernyő: ') && fb.body.includes('ablak 412×915') && fb.body.includes('TestAgent/1.0') && fb.body.includes('Telefon: '),
      'visszajelzés: verzió, képernyőméret, felbontás és a telefon azonosítója a levélben');
    ok(fb && fb.body.includes('1 fogás, 1 halfaj') && !fb.body.includes('TITOKHELY') && !fb.body.includes('Titkos') && !fb.body.includes('46.123'), 'visszajelzés: csak darabszám megy ki, a napló, a hely és a megjegyzés nem');
    await ctx.close();
  }
  // error log in the feedback e-mail: JS errors and native crash notes, last 20, no log data (this page's errors are on purpose)
  {
    const ctx = await b.newContext(); const q = await ctx.newPage();
    await q.addInitScript(() => {
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }], catches: [{ id: 'f1', sp: 's1', at: new Date().toISOString(), y: 2026, note: 'TITOKHELY-123' }] }));
      window.__fb = null; window.__crash = '2026-11-12 18:03 NullPointerException: x @ MainActivity.onCreate:120\n';
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, takeCrashes() { const c = window.__crash; window.__crash = ''; return c; },
        sendFeedback(to, subject, body) { window.__fb = body; } };
    });
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(300);
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.locator('#feedbackBtn').click(); await q.waitForTimeout(100);
    let fb = await q.evaluate(() => window.__fb);
    ok(fb.includes('Hibák (utolsó 1)') && fb.includes('Natív: 2026-11-12 18:03 NullPointerException'), 'hibanapló: a natív összeomlás a következő indításkor bekerül a levélbe');
    for (let i = 0; i < 3; i++) await q.evaluate(() => setTimeout(() => { throw new Error('próba-hiba'); }));
    await q.evaluate(() => { Promise.reject(new Error('elutasított ígéret')); });
    for (let i = 0; i < 25; i++) await q.evaluate(i => setTimeout(() => { throw new Error('sok-' + i); }), i);
    await q.waitForTimeout(300);
    const log = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.errlog')));
    ok(log.length === 20 && log[log.length - 1].m.includes('sok-24'), 'hibanapló: legfeljebb az utolsó 20 hiba marad');
    await q.evaluate(() => localStorage.setItem('fogasnaplo.errlog', '[]'));
    for (let i = 0; i < 3; i++) await q.evaluate(() => setTimeout(() => { throw new Error('próba-hiba'); }));
    await q.evaluate(() => { Promise.reject(new Error('elutasított ígéret')); });
    await q.waitForTimeout(200);
    await q.locator('#feedbackBtn').click(); await q.waitForTimeout(100);
    fb = await q.evaluate(() => window.__fb);
    ok(/×3 .*próba-hiba/.test(fb) && fb.includes('Promise: elutasított ígéret') && !fb.includes('TITOKHELY'), 'hibanapló: ismétlődő hiba egy sorban (×3), elutasított ígéret is, napló adat nincs benne');
    await ctx.close();
  }
  // lure box and the day's lure plan
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const lures = [{ id: 'l1', name: 'Popper pikkely', type: 'popper', color: 'natur', size: 8 }, { id: 'l2', name: 'VIB ezüst', type: 'vib', color: 'ezust', size: 5 },
      { id: 'l3', name: 'Spintail kék', type: 'spintail', color: 'ezust', size: 5 }, { id: 'l4', name: 'Minnow 11', type: 'minnow', color: 'natur', size: 11 },
      { id: 'l5', name: 'Körforgó 3', type: 'korforgo', color: 'fluo', size: 6 }];
    const Y = new Date().getFullYear();
    await q.addInitScript(({ lures, Y }) => {
      if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }, { id: 's2', name: 'Süllő' }],
        catches: [{ id: 'k1', sp: 's2', at: new Date(Y, 0, 5, 18).toISOString(), y: Y, t: true, lure: 'Spintail kék' }, { id: 'k2', sp: 's2', at: new Date(Y, 0, 9, 18).toISOString(), y: Y, t: true, lure: 'Spintail kék' }], lures }));
      localStorage.setItem('fogasnaplo.terv', JSON.stringify({ sp: ['s1', 's2'], day: 0, parts: ['alkony', 'ejjel'] }));
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, pickPhoto() {} };
    }, { lures, Y });
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(400);
    ok(await q.locator('#plan .plan-res').count() === 2 && await q.locator('#plan .plan-res').first().innerText().then(t => t.includes('Balin')), 'csaliajánló: a kiválasztott két halra külön lista');
    const sullo = q.locator('#plan .plan-res', { hasText: 'Süllő' });
    const items = await sullo.locator('.plan-item b').allInnerTexts();
    ok(items.length === 3 && !items.includes('Popper pikkely'), 'csaliajánló: süllőre 3 csali, popper nincs köztük (' + items.join(', ') + ')');
    ok(items[0] === 'Spintail kék' && (await sullo.locator('.plan-item').first().innerText()).includes('A naplód szerint ezzel már 2 süllő jött'), 'csaliajánló: amivel már fogtál, az kerül előre, és ezt meg is írja');
    ok((await sullo.locator('.plan-miss').innerText()).includes('Gumihal') && (await sullo.locator('.plan-miss').innerText()).includes('sötét'), 'csaliajánló: szól, hogy süllőre gumihal és éjszakára sötét csali hiányzik a dobozból');
    ok((await q.locator('#plan').innerText()).includes('helyi horgászrend'), 'csaliajánló: éjszakánál figyelmeztet a helyi szabályra');
    await q.locator('#plan .plan-row', { hasText: 'Napszak' }).locator('.pill', { hasText: 'Éjszaka' }).click(); await q.waitForTimeout(100);
    ok(await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.terv')).parts.join()) === 'alkony', 'csaliajánló: a napszak-választás megmarad');
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.waitForTimeout(150);
    ok((await q.locator('#lureBoxTitle').innerText()).includes('(5)'), 'csalitár: a Beállításokban a csalik listája');
    await q.locator('#lureName').fill('Gumihal 10 cm'); await q.locator('#lureType').selectOption('gumi'); await q.locator('#lureColor').selectOption('fluo'); await q.locator('#lureSize').fill('10');
    await q.locator('#lureForm button').click(); await q.waitForTimeout(100);
    let st = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    ok(st.lures.length === 6 && st.lures[5].type === 'gumi' && st.lures[5].size === 10 && st.catches.length === 2, 'csalitár: új csali felvéve, a napló többi része érintetlen');
    await q.locator('#lureBoxList .myrow', { hasText: 'Popper pikkely' }).locator('.del').click(); await q.waitForTimeout(100);
    ok((await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')).lures.length)) === 5, 'csalitár: törlés');
    await q.locator('#toast button').click(); await q.waitForTimeout(100);
    ok((await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')).lures.map(l => l.name).join())) .startsWith('Popper pikkely'), 'csalitár: a törlés visszavonható, a helyére kerül');
    await q.locator('.tabbar button[data-tab="home"]').click(); await q.waitForTimeout(150);
    ok(!(await q.locator('#plan .plan-res', { hasText: 'Süllő' }).innerText()).includes('Gumihal 8–10'), 'csaliajánló: gumihal után már nem jelzi hiányként');
    await q.locator('.tabbar button[data-tab="list"]').click(); await q.locator('.citem').first().click(); await q.locator('#sheet .btn-main', { hasText: 'Szerkesztés' }).click();
    ok(await q.locator('#sheet .chip', { hasText: 'Gumihal 10 cm' }).count() === 1, 'csalitár: a szerkesztő csali-gombjai között ott vannak a saját csalik');
    await q.locator('#sheet .sheet-actions .btn-ghost').click(); await q.waitForTimeout(100); await q.evaluate(() => window.__fnBack());
    // a backup file with a lure box merges into it
    const f = path.join(os.tmpdir(), 'kapas-csalitar-teszt.json');
    fs.writeFileSync(f, JSON.stringify({ app: 'fogasnaplo', version: 2, species: [], catches: [], lures: [{ id: 'x1', name: 'Stickbait 9', type: 'stick', color: 'ezust' }, { id: 'zz', name: 'VIB ezüst', type: 'vib' }] }));
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.locator('#importFile').setInputFiles(f); await q.waitForTimeout(300);
    ok((await q.locator('#importAsk').innerText()).includes('1 új csali'), 'mentésből: a csalitár is betölthető (azonos nevűt nem duplikál)');
    await q.locator('#importAsk .btn-main').click(); await q.waitForTimeout(100);
    st = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    ok(st.lures.length === 7 && st.lures.some(l => l.name === 'Stickbait 9'), 'mentésből: a csali bekerült');
    await ctx.close();
  }
  // lure pictures: taken in the lure box, shown in the plan, kept by the file sweep, saved as files on restore
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    await q.addInitScript(({ PX }) => {
      if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1');
        localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Süllő' }], catches: [{ id: 'c1', sp: 's1', at: new Date().toISOString(), y: new Date().getFullYear() }],
          lures: [{ id: 'v1', name: 'VIB sárga', type: 'vib', color: 'fluo' }] }));
        localStorage.setItem('fogasnaplo.terv', JSON.stringify({ sp: ['s1'], day: 0, parts: ['ejjel'] })); }
      window.__lp = { cleanup: null, saved: 0 };
      window.FogasnaploAndroid = { getLocation() {}, cleanup(j) { window.__lp.cleanup = JSON.parse(j); },
        saveThumb(d) { window.__lp.saved++; return 'file:///data/thumbs/imp' + window.__lp.saved + '.jpg'; },
        pickPhoto() { setTimeout(() => window.__fnPhoto({ src: 'file:///data/photos/lure1.jpg', thumb: 'file:///data/thumbs/lure1.jpg' })); } };
    }, { PX });
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(300);
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.waitForTimeout(100);
    await q.locator('#lureBoxList .lthumb-btn').first().click();
    await q.locator('#lureBoxList .lphoto-menu button', { hasText: 'Fotó' }).first().click(); await q.waitForTimeout(150);
    let st = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    ok(st.lures[0].photo && st.lures[0].photo.src === 'file:///data/photos/lure1.jpg' && st.catches.length === 1 && await q.locator('#sheetWrap').isHidden(),
      'csalifotó: a kép a csalihoz kerül, nem nyit szerkesztőt');
    ok(await q.locator('#lureBoxList .lthumb img').count() === 1, 'csalifotó: a csalitárban látszik');
    await q.locator('.tabbar button[data-tab="home"]').click(); await q.waitForTimeout(150);
    ok(await q.locator('#plan .plan-item .plan-img img').count() === 1, 'csalifotó: az ajánlásban is látszik');
    await q.waitForTimeout(400); await q.reload(); await q.waitForFunction(() => window.__lp && window.__lp.cleanup, null, { timeout: 5000 }).catch(() => {});
    const keep = await q.evaluate(() => window.__lp.cleanup);
    ok(keep && keep.includes('file:///data/photos/lure1.jpg') && keep.includes('file:///data/thumbs/lure1.jpg'), 'csalifotó: a fájltakarítás megtartja' + (keep ? '' : ' (nem futott le)'));
    const f = path.join(os.tmpdir(), 'kapas-csalifoto-teszt.json');
    fs.writeFileSync(f, JSON.stringify({ app: 'fogasnaplo', version: 2, species: [], catches: [], lures: [{ id: 'n1', name: 'Új minnow', type: 'minnow', photo: { thumb: PX } }] }));
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.locator('#importFile').setInputFiles(f); await q.waitForTimeout(300);
    await q.locator('#importAsk .btn-main').click(); await q.waitForTimeout(100);
    st = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    const nl = st.lures.find(l => l.name === 'Új minnow');
    ok(nl && nl.photo && nl.photo.thumb.startsWith('file:') && !JSON.stringify(st).includes('base64'), 'mentésből: a csalifotó fájlba kerül, nem base64-ként a naplóba');
    await ctx.close();
  }
  // seasons: four colourways, each light and dark
  {
    const open = async (opts, init) => { const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, reducedMotion: 'reduce', ...opts }); const q = await ctx.newPage();
      q.on('pageerror', e => errs.push(e.message)); if (init.clock) await q.clock.setFixedTime(new Date(init.clock));
      await q.addInitScript(i => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }], catches: [] }));
        if (i.season) localStorage.setItem('fogasnaplo.season', i.season); if (i.theme) localStorage.setItem('fogasnaplo.theme', i.theme); }, init);
      await q.route('https://**/*', r => r.abort()); await q.goto(PAGE); await q.waitForTimeout(250); return { ctx, q }; };
    const bgOf = q => q.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    let { ctx, q } = await open({}, { clock: '2026-01-15T12:00:00' });
    ok(await q.evaluate(() => document.documentElement.dataset.season) === 'tel', 'évszak: januárban magától tél');
    await ctx.close(); ({ ctx, q } = await open({}, { clock: '2026-07-01T12:00:00' }));
    ok(await q.evaluate(() => document.documentElement.dataset.season) === 'nyar', 'évszak: júliusban magától nyár');
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.waitForTimeout(100);
    ok((await q.locator('#seasonPills .pill.on').innerText()).includes('Automatikus (nyár)'), 'évszak: a Beállításokban automatikus, a mostani évszakkal');
    const before = await bgOf(q), fab = () => q.evaluate(() => getComputedStyle(document.querySelector('#fab')).backgroundColor);
    const fabSummer = await fab();
    await q.locator('#seasonPills .pill', { hasText: 'Tél' }).click(); await q.waitForTimeout(150);
    ok(await q.evaluate(() => document.documentElement.dataset.season + '|' + localStorage.getItem('fogasnaplo.season')) === 'tel|tel' && await bgOf(q) !== before, 'évszak: kézzel télre váltva megmarad, a színek változnak');
    ok(await fab() !== fabSummer, 'évszak: a Tailwind-réteg (lebegő gomb) is az évszak színét kapja');
    await q.waitForTimeout(400); await q.reload(); await q.waitForFunction(() => document.documentElement.dataset.season === 'tel', null, { timeout: 3000 }).catch(() => {});
    ok(await q.evaluate(() => document.documentElement.dataset.season) === 'tel', 'évszak: újraindítás után is tél (a választás felülírja a naptárt)');
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.locator('#seasonPills .pill', { hasText: 'Automatikus' }).click(); await q.waitForTimeout(150);
    ok(await q.evaluate(() => document.documentElement.dataset.season + '|' + localStorage.getItem('fogasnaplo.season')) === 'nyar|null', 'évszak: az Automatikus visszaállítja a naptár szerintit');
    await ctx.close();
    const seen = new Set();
    for (const season of ['tavasz', 'nyar', 'osz', 'tel']) for (const theme of ['dark', 'light']) {
      ({ ctx, q } = await open({}, { season, theme }));
      seen.add(await bgOf(q));
      const okLayout = await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.dataset.theme);
      if (okLayout !== theme) ok(false, 'évszak ' + season + ' / ' + theme + ': elrendezés vagy téma hibás');
      await ctx.close();
    }
    ok(seen.size === 8, 'évszak: 4 évszak × világos/sötét = 8 különböző színvilág (' + seen.size + ')');
  }
  // test build: update banner
  {
    const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [], catches: [] })); window.__u = { inst: 0 };
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {},
        checkUpdate() { setTimeout(() => { window.__fnUpdate({ versionCode: 1042, versionName: 'abc1234', notes: 'Zsálya színvilág' });
          setTimeout(() => window.__fnUpdateState({ state: 'downloaded' }), 800); }); },
        installUpdate() { window.__u.inst++; setTimeout(() => window.__fnUpdateState({ state: 'installing' })); } }; });
    await q.goto(PAGE); await q.waitForTimeout(2900);
    ok(await q.locator('#updBar').isVisible() && (await q.locator('#updBar').innerText()).includes('letöltése'), 'tesztverzió: új verziónál magától letölt, a sáv jelzi');
    await q.waitForTimeout(900);
    const ub = await q.locator('#updBar').innerText();
    ok(ub.includes('Zsálya színvilág') && ub.includes('magától frissül') && await q.locator('#updBar .btn-main').isVisible(), 'letöltve: kilépéskor magától frissül, „Frissítés most” gomb');
    await q.locator('#updBar .btn-main').click(); await q.waitForTimeout(100);
    ok((await q.evaluate(() => window.__u.inst)) === 1 && (await q.locator('#updBar').innerText()).includes('telepítése'), '„Frissítés most”: azonnal telepít');
    await ctx.close();
  }
  // test build: the new build has another signing key -> explain the one-time reinstall instead of a raw error
  {
    const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [], catches: [] })); window.__u = { zip: 0 };
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, backupFolder() { return ''; },
        zipToFolder() {}, saveZip() { window.__u.zip++; }, checkUpdate() { setTimeout(() => window.__fnUpdateState({ state: 'resign', notes: 'x' })); } }; });
    await q.goto(PAGE); await q.waitForTimeout(2800);
    const t = await q.locator('#updBar').innerText();
    ok(await q.locator('#updBar').isVisible() && t.includes('új aláíró kulccsal') && t.includes('Visszaállítás') && !t.includes('INSTALL_FAILED'),
      'tesztverzió: kulcsváltásnál érthető újratelepítési lépések, nem nyers hibakód');
    await q.locator('#updBar .btn-main').click(); await q.waitForTimeout(100);
    ok((await q.evaluate(() => window.__u.zip)) === 1, 'kulcsváltás: a sáv „Mentés most” gombja ZIP-mentést indít');
    ok(await q.locator('#updBar .btn-ghost').innerText() === 'Letöltés', 'kulcsváltás: „Letöltés” gomb az új tesztapphoz');
    await ctx.close();
  }
  // data safety: the log mirrored to a file (Android), rescued from it, backup nudge
  {
    const sp = [{ id: 's1', name: 'Balin' }];
    const mk = (n, rev) => ({ species: sp, catches: Array.from({ length: n }, (_, i) => ({ id: 'm' + i, sp: 's1', at: '2026-05-0' + (i + 1) + 'T10:00:00.000Z', y: 2026, t: true })), ...(rev ? { rev } : {}) });
    const bridge = mirror => `window.__m = { writes: [] }; window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {},
      readLog() { return ${JSON.stringify(JSON.stringify(mirror))}; }, writeLog(j) { window.__m.writes.push(j); return true; } };`;
    // 1) localStorage empty (reinstall restored only the file, or the WebView lost it) -> the file comes back
    let ctx = await b.newContext(); let q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(bridge(mk(3, 500)));
    await q.goto(PAGE); await q.waitForTimeout(900);
    let d = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    ok(d && d.catches.length === 3, 'adatbiztonság: üres localStorage-nál a belső másolatból tölt vissza (3 fogás)');
    ok((await q.locator('#toast').innerText()).includes('belső másolat'), 'adatbiztonság: szól, hogy a belső másolatból töltötte vissza');
    await ctx.close();
    // 2) the file is newer than localStorage (a save that did not fit) -> the file wins; older file -> localStorage wins
    for (const [lr, mr, want] of [[100, 200, 2], [300, 200, 1]]) {
      ctx = await b.newContext(); q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
      await q.addInitScript(([l, m]) => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', 1); localStorage.setItem('fogasnaplo.v1', l); } }, [JSON.stringify(mk(1, lr)), '']);
      await q.addInitScript(bridge(mk(2, mr)));
      await q.goto(PAGE); await q.waitForTimeout(600);
      d = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
      ok(d.catches.length === want, `adatbiztonság: ${lr < mr ? 'újabb belső másolat nyer' : 'régebbi belső másolatot nem tölt vissza'} (${d.catches.length})`);
      await ctx.close();
    }
    // 3) every save stamps rev and writes the file (debounced); a full localStorage writes it at once and says so
    ctx = await b.newContext(); q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(bridge({ species: [], catches: [] }));
    await q.addInitScript(() => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }], catches: [] })));
    await q.goto(PAGE); await q.waitForTimeout(2300);
    const w0 = await q.evaluate(() => window.__m.writes.length);
    ok(w0 === 1, 'adatbiztonság: régi naplóról induláskor egyszer elkészül a belső másolat');
    await q.locator('.row .plus').first().click(); await q.waitForTimeout(700); await q.evaluate(() => window.__fnBack && window.__fnBack());
    const last = await q.evaluate(() => JSON.parse(window.__m.writes[window.__m.writes.length - 1]));
    ok(last.catches.length === 1 && last.rev > 0, 'adatbiztonság: fogásrögzítéskor a belső másolat is frissül (rev bélyeggel)');
    await q.evaluate(() => { const o = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'fogasnaplo.v1') throw new Error('QuotaExceededError'); return o.call(this, k, v); }; });
    const before = await q.evaluate(() => window.__m.writes.length);
    await q.locator('.tabbar button[data-tab="home"]').click(); await q.locator('.row .plus').first().click(); await q.waitForTimeout(150);
    ok((await q.evaluate(() => window.__m.writes.length)) > before && (await q.locator('#saveWarn').innerText()).includes('tartalék'),
      'adatbiztonság: megtelt tárhelynél azonnal a belső másolatba ment, és ezt írja ki');
    await ctx.close();
    // 4) the nudge: 3+ catches and no copy off the phone -> Kezdőlap card; "Később" hides it; a backup folder makes it go away
    ctx = await b.newContext(); q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(l => localStorage.setItem('fogasnaplo.v1', l), JSON.stringify(mk(4)));
    await q.goto(PAGE); await q.waitForTimeout(400);
    ok(await q.locator('#bkNudge').isVisible() && (await q.locator('#bkNudge').innerText()).includes('4 fogásod csak ezen a telefonon'), 'mentés-emlékeztető: 3+ fogásnál, mentés nélkül a Kezdőlapon');
    await q.locator('#bkNudge .no').click(); await q.waitForTimeout(100);
    ok(!(await q.locator('#bkNudge').isVisible()) && (await q.evaluate(() => +localStorage.getItem('fogasnaplo.bknudge') > Date.now())), 'mentés-emlékeztető: „Később” 14 napra elrejti');
    await ctx.close();
    ctx = await b.newContext(); q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(l => { localStorage.setItem('fogasnaplo.v1', l); localStorage.setItem('fogasnaplo.autobackup', JSON.stringify({ ts: Date.now() - 864e5, name: 'x.zip', photos: 0 }));
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, zipToFolder() {}, backupFolder() { return 'Drive/Kapás'; } }; }, JSON.stringify(mk(4)));
    await q.goto(PAGE); await q.waitForTimeout(400);
    ok(!(await q.locator('#bkNudge').isVisible()), 'mentés-emlékeztető: heti mentés mappába -> nincs figyelmeztetés');
    await ctx.close();
    // 5) a brand-new (empty) log offers the restore right on the Kezdőlap
    ctx = await b.newContext(); q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.goto(PAGE); await q.waitForTimeout(300);
    ok(await q.locator('.restore-offer').isVisible(), 'üres napló: a Kezdőlap felajánlja a visszaállítást mentésből');
    await ctx.close();
  }
  // Google-account backup: the newest photos (no videos) go to the native side, the settings say how many fit
  {
    const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const Y = new Date().getFullYear(), f = n => 'file:///data/files/photos/' + n;
    const cs = [
      { id: 'a', sp: 's1', at: new Date(Y, 3, 1).toISOString(), y: Y, photo: { src: f('old.jpg'), thumb: '' } },
      { id: 'b', sp: 's1', at: new Date(Y, 6, 1).toISOString(), y: Y, media: [{ src: f('new1.jpg'), thumb: '' }, { src: f('clip.mp4'), thumb: '', video: true }, { src: f('new2.jpg'), thumb: '' }], photo: { src: f('new1.jpg'), thumb: '' } }];
    await q.addInitScript(cs => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }], catches: cs,
        lures: [{ id: 'l1', name: 'Spintail', type: 'spintail', photo: { src: 'file:///data/files/photos/lure.jpg', thumb: '' } }] }));
      window.__bk = null; window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {},
        syncBackupPhotos(j) { window.__bk = JSON.parse(j); setTimeout(() => window.__fnBkPhotos({ n: 3, total: 4, bytes: 3.2 * 1048576 })); } }; }, cs);
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForFunction(() => window.__bk, null, { timeout: 8000 }).catch(() => {});
    const list = await q.evaluate(() => window.__bk);
    ok(JSON.stringify(list) === JSON.stringify([f('new1.jpg'), f('new2.jpg'), f('old.jpg'), 'file:///data/files/photos/lure.jpg']),
      'Google-mentés: a fotók a legújabbtól visszafelé, videó nélkül, a csalifotóval (' + JSON.stringify(list) + ')');
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.waitForTimeout(100);
    const t = await q.locator('#gbkInfo').innerText();
    ok(t.includes('legújabb 3 fotó a 4-ból') && t.includes('25 MB'), 'Google-mentés: a Beállítások kiírja, hány fotó fért bele');
    await ctx.close();
  }
  // fishing trips: start, live card, catches inside, ongoing notification, end summary, trips without a catch, statistics, backup
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const Y = new Date().getFullYear();
    await q.addInitScript(Y => { if (sessionStorage.getItem('seed')) return; sessionStorage.setItem('seed', 1);
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }, { id: 's2', name: 'Süllő' }],
        catches: [{ id: 'old', sp: 's1', at: new Date(Y, 0, 3, 9).toISOString(), y: Y, place: { name: 'Bertalan híd', lat: 46.25, lng: 20.15 } }] })); }, Y);
    await q.addInitScript(() => { window.__t = { notif: [], asked: 0 }; window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {},
      setTripNotification(j) { window.__t.notif.push(j); }, canNotify() { return false; }, askNotifyPermission() { window.__t.asked++; } }; });
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(300);
    ok((await q.locator('#tripSec .trip-start').innerText()).includes('Horgászat indítása'), 'horgászat: a Kezdőlapon indító sor');
    await q.locator('#tripSec .trip-start').click(); await q.waitForTimeout(100);
    const sh = (await q.locator('#tripSheet').innerText()).replace(/\s+/g, ' ');
    ok(sh.includes('Bertalan híd') && sh.includes('Jelenlegi helyem') && await q.locator('#tripSheet .pill.on', { hasText: 'Bertalan híd' }).count() === 1, 'horgászat: a legutóbbi hely előre kiválasztva');
    await q.locator('#tripSheet .btn-main').click(); await q.waitForTimeout(200);
    let d = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    ok(d.trips.length === 1 && !d.trips[0].end && d.trips[0].place.name === 'Bertalan híd' && d.trips[0].sp.join() === 's1,s2', 'horgászat: elindul, hellyel és célhalakkal');
    ok(await q.locator('#tripSec.live .trip-clock').innerText() === '0:00' && (await q.locator('#tripSec').innerText()).includes('Még nincs fogás'), 'horgászat: élő kártya órával');
    let n = JSON.parse(await q.evaluate(() => window.__t.notif[window.__t.notif.length - 1]));
    ok(n.title === 'Horgászat · Bertalan híd' && n.sp.map(x => x.name).join() === 'Balin,Süllő' && n.start > 0 && await q.evaluate(() => window.__t.asked) === 1,
      'horgászat: állandó értesítés stopperrel és „+ hal” gombokkal (engedélyt kér, ha nincs)');
    await q.locator('#tripSec .trip-add .pill', { hasText: '+ Süllő' }).click(); await q.waitForTimeout(150);
    await q.evaluate(() => window.__fnBack()); await q.waitForTimeout(100);
    ok((await q.locator('#tripSec').innerText()).includes('1 fogás · Süllő 1'), 'horgászat: a fogás a horgászathoz számít');
    n = JSON.parse(await q.evaluate(() => window.__t.notif[window.__t.notif.length - 1]));
    ok(n.text === '1 fogás · Süllő 1', 'horgászat: az értesítés is frissül');
    await q.evaluate(() => window.__fnTripEnd()); await q.waitForTimeout(100);
    const es = (await q.locator('#tripSheet').innerText()).replace(/\s+/g, ' ');
    ok(es.includes('Horgászat vége') && es.includes('1 fogás') && es.includes('Süllő'), 'horgászat: az értesítés „Befejezés” gombja az összefoglalót nyitja');
    await q.locator('#tripSheet textarea').fill('zavaros víz'); await q.locator('#tripSheet .btn-main').click(); await q.waitForTimeout(150);
    d = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    ok(d.trips[0].end && d.trips[0].note === 'zavaros víz' && await q.evaluate(() => window.__t.notif[window.__t.notif.length - 1]) === '' && await q.locator('#tripSec .trip-start').count() === 1,
      'horgászat: befejezve, megjegyzéssel; az értesítés eltűnik');
    // a trip without a catch, then the statistics
    await q.locator('#tripSec .trip-start').click(); await q.locator('#tripSheet .pill', { hasText: 'Hely nélkül' }).click(); await q.locator('#tripSheet .btn-main').click(); await q.waitForTimeout(100);
    await q.locator('#tripSec .trip-end').click(); await q.waitForTimeout(100);
    ok((await q.locator('#tripSheet').innerText()).includes('Fogás nélküli alkalom'), 'horgászat: fogás nélküli alkalom is menthető, biztató szöveggel');
    await q.locator('#tripSheet .btn-main').click(); await q.waitForTimeout(100);
    await q.locator('.tabbar button[data-tab="stats"]').click(); await q.waitForTimeout(150);
    const st = (await q.locator('#tripStatSec').innerText()).replace(/\s+/g, ' ');
    ok(st.includes('2 horgászat') && st.includes('50% sikeres') && st.includes('1 alkalom fogás nélkül') && await q.locator('#tripStats .trip-row').count() === 2 && await q.locator('#tripStats .trip-row.blank').count() === 1,
      'horgászat: statisztika (alkalmak, siker %, fogás nélküliek, legutóbbiak)');
    await q.locator('#tripStats .trip-row').last().click(); await q.waitForTimeout(100);
    ok(await q.locator('#tripSheet textarea').inputValue() === 'zavaros víz' && (await q.locator('#tripSheet').innerText()).includes('Süllő'), 'horgászat: a korábbi horgászat megnyitható, a fogásaival és a megjegyzésével');
    await q.evaluate(() => window.__fnBack());
    ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'horgászat: nincs vízszintes túlcsordulás');
    await ctx.close();
    // a backup brings finished trips back (and never a running one)
    const c2 = await b.newContext(); const q2 = await c2.newPage(); q2.on('pageerror', e => errs.push(e.message));
    await q2.route('https://**/*', r => r.abort());
    await q2.goto(PAGE); await q2.waitForTimeout(200);
    const f = path.join(TMP, 'trips.json');
    fs.writeFileSync(f, JSON.stringify({ app: 'fogasnaplo', version: 2, species: [{ id: 's1', name: 'Balin' }], catches: [], trips: [
      { id: 't1', start: '2026-05-01T05:00:00.000Z', end: '2026-05-01T08:00:00.000Z', place: { name: 'Holt-Maros', lat: 46.2, lng: 20.3 }, sp: ['s1'] },
      { id: 't2', start: '2026-05-02T05:00:00.000Z' }] }));
    await q2.locator('.tabbar button[data-tab="more"]').click(); await q2.locator('#importFile').setInputFiles(f); await q2.waitForTimeout(300);
    ok((await q2.locator('#importAsk').innerText()).includes('1 horgászat'), 'horgászat: a visszaállítás a befejezett horgászatot hozza, a futót nem');
    await c2.close();
  }
  // feel: haptics, record celebration, swipe on the catch list, skeleton while the forecast loads
  {
    const mk = async opts => { const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, ...opts }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
      const Y = new Date().getFullYear();
      await q.addInitScript(Y => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1); localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }],
        catches: [{ id: 'a', sp: 's1', at: new Date(Y, 4, 2, 9).toISOString(), y: Y, l: 40 }, { id: 'b', sp: 's1', at: new Date(Y, 4, 3, 9).toISOString(), y: Y, l: 45 }] })); }
        window.__h = []; window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, haptic(k) { window.__h.push(k); } }; }, Y);
      await q.route('https://**/*', r => r.abort()); await q.goto(PAGE); await q.waitForTimeout(250); return { ctx, q }; };
    let { ctx, q } = await mk({});
    await q.locator('#list .row .plus').first().click(); await q.waitForTimeout(150);
    ok((await q.evaluate(() => window.__h)).join() === 'confirm', 'rezgés: gyors fogásnál egy rövid jelzés');
    await q.locator('#edL').fill('52');
    await q.locator('#sheet .btn-main', { hasText: 'Mentés' }).click(); await q.waitForTimeout(250);
    const rec = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')).catches.find(c => c.l === 52));
    ok(rec && (await q.evaluate(() => window.__h)).includes('success') && (await q.locator('#toast').innerText()).includes('Új rekord! Balin, 52 cm') && await q.locator('canvas.confetti').count() === 0,
      'ünneplés: rekordnál dupla rezgés és „Új rekord!”; csökkentett mozgásnál konfetti nélkül');
    // swipe: left deletes (with undo), a short drag does nothing, right opens the editor
    await q.locator('.tabbar button[data-tab="list"]').click(); await q.waitForTimeout(150);
    const drag = async (sel, dx) => { const bx = await q.locator(sel).boundingBox(); const y = bx.y + bx.height / 2, x = bx.x + bx.width / 2;
      await q.mouse.move(x, y); await q.mouse.down(); for (let i = 1; i <= 6; i++) await q.mouse.move(x + dx * i / 6, y + 1); await q.mouse.up(); await q.waitForTimeout(150); };
    const count = () => q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')).catches.length);
    const n0 = await count();
    await drag('#catchList .swipe >> nth=0', -40);
    ok(await count() === n0 && await q.locator('#sheetWrap').isHidden(), 'húzás: rövid húzás nem csinál semmit (és nem nyit)');
    await drag('#catchList .swipe >> nth=0', -130);
    ok(await count() === n0 - 1 && (await q.locator('#toast').innerText()).includes('törölve') && (await q.evaluate(() => window.__h)).includes('reject'), 'húzás: balra húzva törlés, visszavonással és rezgéssel');
    await q.locator('#toast button').click(); await q.waitForTimeout(150);
    ok(await count() === n0, 'húzás: a törlés visszavonható');
    await drag('#catchList .swipe >> nth=0', 130);
    ok(await q.locator('#sheetWrap').isVisible() && (await q.locator('#sheet').innerText()).includes('Mentés'), 'húzás: jobbra húzva a szerkesztő nyílik');
    await q.evaluate(() => window.__fnBack()); await q.waitForTimeout(100);
    await q.locator('#catchList .citem').first().click(); await q.waitForTimeout(150);
    ok(await q.locator('#sheetWrap').isVisible(), 'húzás: a sima koppintás továbbra is a fogás kártyáját nyitja');
    await ctx.close();
    // with motion: the confetti canvas appears and goes away by itself
    ({ ctx, q } = await mk({ reducedMotion: 'no-preference' }));
    await q.locator('.tabbar button[data-tab="list"]').click(); await q.locator('#catchList .citem').first().click(); await q.waitForTimeout(150);
    await q.locator('#sheet .btn-main', { hasText: 'Szerkesztés' }).click(); await q.waitForTimeout(150);
    await q.locator('#edL').fill('60');
    await q.locator('#sheet .btn-main', { hasText: 'Mentés' }).click(); await q.waitForTimeout(200);
    const had = await q.locator('canvas.confetti').count(); await q.waitForTimeout(1700);
    ok(had === 1 && await q.locator('canvas.confetti').count() === 0, 'ünneplés: konfetti, ami magától eltűnik');
    await ctx.close();
    // skeleton while the forecast is on its way
    const c3 = await b.newContext(); const q3 = await c3.newPage(); q3.on('pageerror', e => errs.push(e.message));
    await q3.addInitScript(() => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }], catches: [] })));
    await q3.route('https://api.open-meteo.com/**', () => {}); await q3.route('https://flood-api.open-meteo.com/**', r => r.abort());
    await q3.goto(PAGE); await q3.waitForTimeout(500);
    ok(await q3.locator('#today .today.skel .sk').count() === 4 && await q3.locator('#today .today.skel').getAttribute('aria-busy') === 'true', 'töltés: az előrejelzés helyén váz, nem csak szöveg');
    await c3.close();
  }
  // editing a lure in the lure box; a new name carried over to the earlier catches (or not)
  {
    const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', 1);
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }],
        catches: [{ id: 'a', sp: 's1', at: '2026-05-01T10:00:00.000Z', y: 2026, lure: 'Spintail' }, { id: 'b', sp: 's1', at: '2026-05-02T10:00:00.000Z', y: 2026, lure: 'spintail' }],
        lures: [{ id: 'l1', name: 'Spintail', type: 'spintail', color: 'ezust', size: 5 }, { id: 'l2', name: 'Popper', type: 'popper' }] })); });
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(250);
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.waitForTimeout(100);
    await q.locator('#lureBoxList .lure-edit-btn').first().click(); await q.waitForTimeout(100);
    ok(await q.locator('#lureBoxList .lure-edit').count() === 1 && (await q.locator('#lureBoxList .lure-carry').innerText()).includes('2 korábbi fogásnál'), 'csali szerkesztése: a névre koppintva szerkesztő nyílik, a korábbi fogások számával');
    await q.locator('#lureEditName').fill('Popper'); await q.locator('#lureBoxList .lure-edit .btn-main').click(); await q.waitForTimeout(100);
    ok((await q.locator('#toast').innerText()).includes('Ilyen nevű csali már van'), 'csali szerkesztése: foglalt névre nem menti');
    await q.locator('#lureEditName').fill('Spintail kék'); await q.locator('#lureBoxList .lure-edit select').nth(1).selectOption('sotet');
    await q.locator('#lureBoxList .lure-edit input[type="number"]').fill('6.5'); await q.locator('#lureBoxList .lure-edit .btn-main').click(); await q.waitForTimeout(150);
    let d = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    let l1 = d.lures.find(l => l.id === 'l1');
    ok(l1.name === 'Spintail kék' && l1.color === 'sotet' && l1.size === 6.5 && l1.type === 'spintail' && d.catches.every(c => c.lure === 'Spintail kék'), 'csali szerkesztése: név, szín, méret mentve, a korábbi fogásoknál is átírva');
    await q.locator('#lureBoxList .lure-edit-btn').first().click(); await q.locator('#lureEditName').fill('Spintail 2'); await q.locator('#lureBoxList .lure-carry input').uncheck();
    await q.locator('#lureBoxList .lure-edit select').nth(1).selectOption(''); await q.locator('#lureBoxList .lure-edit .btn-main').click(); await q.waitForTimeout(150);
    d = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1'))); l1 = d.lures.find(l => l.id === 'l1');
    ok(l1.name === 'Spintail 2' && !('color' in l1) && d.catches.every(c => c.lure === 'Spintail kék'), 'csali szerkesztése: kikapcsolva a fogások nem változnak; a szín törölhető');
    await ctx.close();
  }
  // first start: species + water, Google backup, reminders; skippable; never for an existing log
  {
    let ctx = await b.newContext({ welcome: true, viewport: { width: 360, height: 760 } }); let q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => { window.__w = []; window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, setReminders() {},
      googleAccount() { return '{}'; }, googleSignIn() { window.__w.push('google'); setTimeout(() => window.__fnDrive({ state: 'out' })); },
      enableNotifications() { window.__w.push('notify'); setTimeout(() => window.__fnNotify({})); } }; });
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(300);
    ok(await q.locator('#welcomeWrap').isVisible() && (await q.locator('#welcome h3').innerText()) === 'Üdv a Kapásban!' && await q.locator('#welcome .w-dots i').count() === 3,
      'üdvözlő: új naplónál megjelenik, 3 lépés');
    ok((await q.locator('#welcome .w-actions .btn-main').innerText()) === 'Kihagyom', 'üdvözlő: hal nélkül „Kihagyom”');
    await q.locator('#welcome .pill', { hasText: /^Balin$/ }).click(); await q.locator('#welcome .pill', { hasText: /^Süllő$/ }).click();
    await q.locator('#welcome .pill', { hasText: 'Tisza / Tisza-tó' }).click();
    ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'üdvözlő: 360 px-en nincs vízszintes túlcsordulás');
    await q.locator('#welcome .w-actions .btn-main').click(); await q.waitForTimeout(100);
    let d = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    ok(d.species.map(s => s.name).join() === 'Balin,Süllő' && await q.evaluate(() => localStorage.getItem('fogasnaplo.region')) === 'tisza', 'üdvözlő: a választott halfajok és a víz elmentve');
    ok((await q.locator('#welcome h3').innerText()).includes('Ne vesszen el') && (await q.locator('#welcome').innerText()).includes('Google Drive'), 'üdvözlő: 2. lépés a Google-mentés');
    await q.locator('#welcome .btn-ghost', { hasText: 'Most nem' }).click(); await q.waitForTimeout(100);
    ok((await q.locator('#welcome').innerText()).includes('Balin, Süllő'), 'üdvözlő: 3. lépés az értesítések, a választott halakkal');
    await q.locator('#welcome .btn-main').click(); await q.waitForTimeout(200);
    ok((await q.evaluate(() => window.__w)).join() === 'notify' && await q.locator('#welcomeWrap').isHidden() && await q.evaluate(() => localStorage.getItem('fogasnaplo.welcome')) === '1',
      'üdvözlő: az értesítés bekapcsolása után bezárul, és többet nem jön elő');
    ok(await q.locator('#list .row').count() === 2, 'üdvözlő: a Kezdőlapon ott a két választott hal');
    await q.waitForTimeout(400); await q.reload(); await q.waitForTimeout(300);
    ok(await q.locator('#welcomeWrap').isHidden(), 'üdvözlő: újraindítás után sem jelenik meg');
    await ctx.close();
    // an existing log never sees it; the back button skips a step
    ctx = await b.newContext({ welcome: true }); q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Csuka' }], catches: [] })));
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(300);
    ok(await q.locator('#welcomeWrap').isHidden(), 'üdvözlő: meglévő naplónál nem jelenik meg');
    await ctx.close();
    ctx = await b.newContext({ welcome: true }); q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(300);
    ok(await q.locator('#welcome .w-dots i').count() === 1, 'üdvözlő: böngészőben (Google és értesítés nélkül) csak az első lépés');
    ok(await q.evaluate(() => window.__fnBack()) && await q.locator('#welcomeWrap').isHidden(), 'üdvözlő: a Vissza gomb továbblép / bezár');
    await ctx.close();
  }
  // Google account + Drive backup: sign in, state, restore on a new phone, sign out (fake bridge stands in for MainActivity/DriveSync)
  {
    const mkBridge = () => `window.__g = { acct: JSON.parse(sessionStorage.getItem('acct') || '{}'), calls: [] };
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, zipToFolder() {}, backupFolder() { return ''; }, pickBackupFolder() {},
        googleAccount() { return JSON.stringify(window.__g.acct); },
        googleSignIn() { window.__g.calls.push('in'); window.__g.acct = { email: 'horgasz@example.com', name: 'Horgász' }; sessionStorage.setItem('acct', JSON.stringify(window.__g.acct));
          setTimeout(() => window.__fnDrive({ state: 'in', email: 'horgasz@example.com', name: 'Horgász' })); },
        driveSync(v) { window.__g.calls.push('sync:' + v); setTimeout(() => { window.__fnDrive({ state: 'syncing', done: 1, total: 3 });
          setTimeout(() => window.__fnDrive({ state: 'synced', up: 3, total: 3, waiting: v ? 0 : 1, ts: Date.now() }), 100); }); },
        driveRestore() { window.__g.calls.push('restore'); setTimeout(() => { window.__fnDrive({ state: 'restoring', done: 0, total: 2 });
          window.__fnZipIn({ drive: true, photos: 'file:///p/', thumbs: 'file:///t/', json: JSON.stringify({ species: [{ id: 's1', name: 'Balin' }],
            catches: [{ id: 'd1', sp: 's1', at: '2026-05-21T15:20:00.000Z', y: 2026, media: [{ src: 'file:///old/photos/a.jpg', thumb: 'file:///old/thumbs/a.jpg' }, { src: 'file:///old/photos/v.mp4', thumb: 'file:///old/thumbs/v.jpg', video: true }] }] }) });
          window.__fnDrive({ state: 'restored', files: 4, missing: 0 }); }, 50); },
        googleSignOut() { window.__g.calls.push('out'); window.__g.acct = {}; sessionStorage.removeItem('acct'); setTimeout(() => window.__fnDrive({ state: 'out' })); } };`;
    // a new phone: empty log -> the Kezdőlap offers Google; signing in restores straight away (the merge still asks)
    let ctx = await b.newContext(); let q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message)); q.on('dialog', d => d.accept());
    await q.addInitScript(mkBridge());
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(300);
    const offer = q.locator('.restore-offer .btn-main');
    ok(await offer.isVisible() && (await offer.innerText()) === 'Bejelentkezés Google-fiókkal', 'Google: üres naplónál a Kezdőlap Google-bejelentkezést kínál');
    await offer.click(); await q.waitForTimeout(400);
    ok((await q.evaluate(() => window.__g.calls)).join() === 'in,restore' && await q.locator('#importAsk').isVisible() && (await q.locator('#importAsk').innerText()).includes('1 új fogás'),
      'Google: új telefonon a bejelentkezés után a Drive-ról tölt vissza, és megerősítést kér');
    await q.locator('#importAsk .btn-main').click(); await q.waitForTimeout(1800);
    const d = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    ok(d.catches.length === 1 && d.catches[0].media[0].src === 'file:///p/a.jpg' && d.catches[0].media[1].src === 'file:///p/v.mp4' && d.catches[0].media[1].video,
      'Google: a visszatöltött fotók és videók az új telefon mappáira mutatnak');
    ok((await q.evaluate(() => window.__g.calls)).some(c => c.startsWith('sync:')), 'Google: összefésülés után ez a telefon is ment a Drive-ra');
    const g = (await q.locator('#gAcct').innerText()).replace(/\s+/g, ' ');
    ok(g.includes('Horgász') && g.includes('horgasz@example.com') && g.includes('Minden fent van a Drive-on (3/3 fájl)') && g.includes('1 videó wifire vár'), 'Google: a Beállítások mutatja a fiókot és a mentés állását');
    await q.locator('#gAcct .g-opt input').check(); await q.waitForTimeout(300);
    ok((await q.evaluate(() => window.__g.calls)).includes('sync:true') && !(await q.locator('#gAcct').innerText()).includes('wifire vár'), 'Google: „Videók mobilneten is” bekapcsolva feltölti a videót');
    await q.locator('#gAcct button', { hasText: 'Kijelentkezés' }).click(); await q.waitForTimeout(200);
    ok((await q.locator('#gAcct').innerText()).includes('Bejelentkezés Google-fiókkal'), 'Google: kijelentkezés után újra a bejelentkezés gomb látszik');
    await ctx.close();
    // the Drive holds a log and this phone has none / another phone wrote a newer one: offer the restore, never overwrite
    ctx = await b.newContext(); q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    await q.addInitScript(() => { sessionStorage.setItem('acct', JSON.stringify({ email: 'h@example.com' }));
      localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }], catches: [{ id: 'x', sp: 's1', at: new Date().toISOString(), y: 2026 }] })); });
    await q.addInitScript(mkBridge());
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(300);
    await q.evaluate(() => window.__fnDrive({ state: 'remote', catches: 16, newer: true }));
    await q.locator('.tabbar button[data-tab="more"]').click(); await q.waitForTimeout(100);
    const t = await q.locator('#gAcct').innerText();
    ok(t.includes('másik telefonról újabb mentés van (16 fogás)') && (await q.locator('#gAcct .btn-main').innerText()) === 'Visszaállítás a Drive-ról', 'Google: másik telefon újabb mentését nem írja felül, összefésülést kínál');
    await q.evaluate(() => window.__fnDrive({ state: 'error', error: 'A Google-bejelentkezés ehhez az apphoz még nincs beállítva (a fejlesztő Google Cloud-beállítása hiányzik).' }));
    ok((await q.locator('#gAcct').innerText()).includes('még nincs beállítva'), 'Google: érthető hibaüzenet, ha a Google Cloud-beállítás hiányzik');
    ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Google: nincs vízszintes túlcsordulás');
    await ctx.close();
  }
  // river discharge: today's trend on the weather card and in the score, each catch's river, and "Mintázataid"
  {
    const now = new Date(), Y = now.getFullYear(), fmt = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    const hours = Array.from({ length: 24 * 8 }, (_, k) => { const d = new Date(now); d.setMinutes(0, 0, 0); d.setHours(d.getHours() - 24 + k); return fmt(d) + 'T' + String(d.getHours()).padStart(2, '0') + ':00'; });
    const H = { time: hours, temperature_2m: hours.map(() => 18), pressure_msl: hours.map(() => 1015), wind_speed_10m: hours.map(() => 8), wind_direction_10m: hours.map(() => 0),
      wind_gusts_10m: hours.map(() => 15), cloud_cover: hours.map(() => 20), weather_code: hours.map(() => 1), precipitation: hours.map(() => 0), precipitation_probability: hours.map(() => 0) };
    const days = Array.from({ length: 8 }, (_, k) => { const d = new Date(now); d.setDate(d.getDate() - 1 + k); return fmt(d); });
    const D = { time: days, weather_code: days.map(() => 1), temperature_2m_max: days.map(() => 18), temperature_2m_min: days.map(() => 8), precipitation_sum: days.map(() => 0),
      precipitation_probability_max: days.map(() => 0), wind_speed_10m_max: days.map(() => 10), wind_gusts_10m_max: days.map(() => 20), wind_direction_10m_dominant: days.map(() => 0),
      sunrise: days.map(d => d + 'T06:58'), sunset: days.map(d => d + 'T16:20') };
    const wdays = Array.from({ length: 15 }, (_, k) => { const d = new Date(now); d.setDate(d.getDate() - 7 + k); return fmt(d); });
    const run = async (q7) => {
      const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
      await q.addInitScript(({ H, D, W }) => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [], catches: [] }));
        localStorage.setItem('fogasnaplo.today', JSON.stringify({ fetched: Date.now(), lat: 46.253, lng: 20.148, h: H, d: D }));
        localStorage.setItem('fogasnaplo.water', JSON.stringify(W)); localStorage.setItem('fogasnaplo.todayOpen', '1'); },
        { H, D, W: { fetched: Date.now(), lat: 46.253, lng: 20.148, time: wdays, q: q7 } });
      await q.route('https://api.open-meteo.com/**', r => r.abort());
      await q.goto(PAGE); await q.waitForTimeout(500);
      const r = { facts: await q.locator('#today .facts').first().innerText(), reasons: await q.locator('#today .reasons').first().innerText(),
        lv: await q.locator('#today .score .dots i.on').count(), ex: await q.locator('#today .wx-explain').textContent() };
      await ctx.close(); return r;
    };
    // the home-screen widget gets the next days' ratings, the evening window, the "+ fish" species and the running trip
    {
      const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
      await q.addInitScript(({ H, D }) => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }, { id: 's2', name: 'Süllő' }],
          catches: [{ id: 'x', sp: 's2', at: new Date(Date.now() - 864e5 * 3).toISOString(), y: new Date().getFullYear() }] }));
        localStorage.setItem('fogasnaplo.today', JSON.stringify({ fetched: Date.now(), lat: 46.253, lng: 20.148, h: H, d: D }));
        window.__wg = []; window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, setWidget(j) { window.__wg.push(j); } }; }, { H, D });
      await q.route('https://**/*', r => r.abort());
      await q.goto(PAGE); await q.waitForTimeout(400);
      let w = JSON.parse(await q.evaluate(() => window.__wg[window.__wg.length - 1]));
      const td = fmt(new Date());
      ok(w.place === 'Szeged' && w.days.length >= 6 && w.days[0].d === td && w.days[0].lv >= 1 && w.days[0].label && /^Esti rablás 16:20–16:\d\d$/.test(w.days[0].win),
        'widget: a következő napok értékelése és az esti rablás ideje (' + JSON.stringify(w.days[0]) + ')');
      ok(w.sp.map(x => x.name).join() === 'Süllő,Balin' && w.trip === null, 'widget: a két „+ hal” gomb a leggyakoribb halakra, horgászat nélkül');
      await q.evaluate(() => window.__fnTripStart()); await q.waitForTimeout(100);
      ok(await q.locator('#tripWrap').isVisible(), 'widget: a „Horgászat” gomb az indító lapot nyitja');
      await q.locator('#tripSheet .btn-main').click(); await q.waitForTimeout(150);
      w = JSON.parse(await q.evaluate(() => window.__wg[window.__wg.length - 1]));
      ok(w.trip && w.trip.start > 0 && w.trip.n === 0, 'widget: futó horgászatnál a kezdés ideje (stopperhez) és a fogásszám');
      const calls = await q.evaluate(() => window.__wg.length);
      await q.evaluate(() => window.render && 0); await q.locator('.tabbar button[data-tab="stats"]').click(); await q.locator('.tabbar button[data-tab="home"]').click(); await q.waitForTimeout(100);
      ok(await q.evaluate(() => window.__wg.length) === calls, 'widget: csak változáskor frissül (fülváltásra nem)');
      await ctx.close();
    }
    // smart notifications: good days only, at the chosen hour, with reasons, window and lure; the streak saver; a trip keeps the streak
    {
      const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
      const lastWeek = new Date(); lastWeek.setDate(lastWeek.getDate() - 7);
      await q.addInitScript(({ H, D, lw }) => { if (!sessionStorage.getItem('s')) { sessionStorage.setItem('s', 1);
          localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }], lures: [{ id: 'l1', name: 'Spintail kék', type: 'spintail', color: 'ezust', size: 5 }],
            catches: [{ id: 'x', sp: 's1', at: lw, y: new Date(lw).getFullYear() }] })); }
        localStorage.setItem('fogasnaplo.today', JSON.stringify({ fetched: Date.now(), lat: 46.253, lng: 20.148, h: H, d: D }));
        window.__rm = []; window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, setReminders(j) { window.__rm.push(j); }, canNotify() { return true; } }; },
        { H, D, lw: lastWeek.toISOString() });
      await q.route('https://**/*', r => r.abort());
      await q.goto(PAGE); await q.waitForTimeout(300);
      ok((await q.evaluate(() => window.__rm.length ? JSON.parse(window.__rm[window.__rm.length - 1]).length : 0)) === 0, 'okos értesítés: alapból kikapcsolva, nem ütemez');
      await q.locator('.tabbar button[data-tab="more"]').click(); await q.locator('#smartBox .switch').click(); await q.waitForTimeout(150);
      let ev = JSON.parse(await q.evaluate(() => window.__rm[window.__rm.length - 1]));
      const good = ev.filter(e => e.title.includes('horgászidő'));
      const days = new Set(good.map(e => new Date(e.at).toDateString()));
      ok(good.length >= 2 && good.length <= 4 && days.size === good.length && good.every(e => new Date(e.at).getHours() === 15 && e.at - Date.now() < 3.3 * 864e5),
        'okos értesítés: jó napokra, naponta legfeljebb egy, 15 órakor, legfeljebb 3 nappal előre (' + good.length + ')');
      ok(good[0].title.includes('nagyon jó horgászidő · Szeged') && /Esti rablás 16:20–16:\d\d\./.test(good[0].text) && good[0].text.includes('Ajánlott csali (balin): Spintail kék') && !/, [A-ZÁÉÍÓÖŐÚÜŰ]/.test(good[0].text),
        'okos értesítés: okokkal, esti rablással és a csalitár legjobb csalijával (' + good[0].text + ')');
      await q.locator('#smartBox .pill', { hasText: 'Reggel 7' }).click(); await q.waitForTimeout(100);
      ev = JSON.parse(await q.evaluate(() => window.__rm[window.__rm.length - 1]));
      ok(ev.filter(e => e.title.includes('horgászidő')).every(e => new Date(e.at).getHours() === 7) && ev.some(e => e.title.startsWith('Ma nagyon jó')), 'okos értesítés: a választott időpontban (reggel „Ma …”)');
      const sun = new Date(); sun.setDate(sun.getDate() + ((7 - sun.getDay()) % 7)); sun.setHours(17, 0, 0, 0);
      const st = ev.find(e => e.title.includes('hetes sorozatod'));
      ok(sun <= new Date() ? !st : (st && new Date(st.at).getDay() === 0 && new Date(st.at).getHours() === 17 && st.title.includes('1 hetes')), 'okos értesítés: sorozat-mentő vasárnap 17-kor, ha a héten még nem horgásztál');
      ok((await q.locator('#smartBox').innerText()).includes('Következő:'), 'okos értesítés: a Beállítások mutatja a következőt');
      // a trip without a catch keeps the weekly streak alive
      await q.locator('.tabbar button[data-tab="home"]').click(); await q.locator('#tripSec .trip-start').click(); await q.locator('#tripSheet .btn-main').click(); await q.waitForTimeout(100);
      await q.locator('#tripSec .trip-end').click(); await q.locator('#tripSheet .btn-main').click(); await q.waitForTimeout(100);
      await q.locator('.tabbar button[data-tab="stats"]').click(); await q.waitForTimeout(100);
      ok((await q.locator('#gameSec').innerText()).includes('ezen a héten is horgásztál'), 'sorozat: egy fogás nélküli horgászat is tartja a heti sorozatot');
      ev = JSON.parse(await q.evaluate(() => window.__rm[window.__rm.length - 1]));
      ok(!ev.some(e => e.title.includes('hetes sorozatod')), 'sorozat-mentő: horgászat után már nem szól');
      await ctx.close();
    }
    // the optional always-on card (PinnedCard): off by default, a switch in Beállítások → Értesítések, kept in step on every start
    {
      const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
      await q.addInitScript(() => { window.__pin = []; window.__asked = 0; window.__can = false;
        window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, setReminders() {}, setWidget() {},
          setPinned(on) { window.__pin.push(on); }, canNotify() { return window.__can; }, askNotifyPermission() { window.__asked++; } }; });
      await q.route('https://**/*', r => r.abort());
      await q.goto(PAGE); await q.waitForTimeout(200);
      ok((await q.evaluate(() => window.__pin)).join() === 'false', 'állandó kártya: alapból kikapcsolva, induláskor szinkronizál');
      await q.locator('.tabbar button[data-tab="more"]').click();
      ok(await q.locator('#pinBox').isVisible() && (await q.locator('#pinBox .switch').getAttribute('aria-checked')) === 'false', 'állandó kártya: kapcsoló a Beállításokban');
      await q.locator('#pinBox .switch').click(); await q.waitForTimeout(100);
      ok((await q.evaluate(() => [window.__pin.at(-1), window.__asked, localStorage.getItem('fogasnaplo.pinned')])).join() === 'true,1,1',
        'állandó kártya: bekapcsolás engedélyt kér és a natív részt élesíti');
      ok((await q.locator('#pinBox').innerText()).includes('le vannak tiltva'), 'állandó kártya: letiltott értesítésnél figyelmeztet');
      await q.evaluate(() => { window.__can = true; }); await q.waitForTimeout(400);
      await q.reload(); await q.waitForTimeout(200);
      ok((await q.evaluate(() => window.__pin)).join() === 'true', 'állandó kártya: újraindítás után is bekapcsolva marad');
      await q.locator('.tabbar button[data-tab="more"]').click(); await q.locator('#pinBox .switch').click(); await q.waitForTimeout(100);
      ok((await q.evaluate(() => [window.__pin.at(-1), localStorage.getItem('fogasnaplo.pinned')])).join() === 'false,', 'állandó kártya: kikapcsolható');
      await ctx.close();
      const q2 = await b.newPage(); await q2.goto(PAGE); await q2.locator('.tabbar button[data-tab="more"]').click();
      ok(await q2.locator('#pinBox').isHidden(), 'állandó kártya: böngészőben (híd nélkül) nem látszik'); await q2.close();
    }
    // Helyeim + Ma neked: spots from catches and trips, each with its own forecast (one request), the best one for today
    {
      const ctx = await b.newContext({ viewport: { width: 390, height: 844 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
      const Y = new Date().getFullYear(), at = (d, h) => new Date(Y, 4, d, h).toISOString();
      const HM = { name: 'Holt-Maros', lat: 46.2, lng: 20.3 }, BH = { name: 'Bertalan híd', lat: 46.25, lng: 20.15 };
      const cs = [{ id: 'm1', sp: 's1', at: at(2, 18), y: Y, place: HM, lure: 'Spintail' }, { id: 'm2', sp: 's1', at: at(5, 18), y: Y, place: HM, lure: 'Spintail' },
        { id: 'm3', sp: 's1', at: at(9, 18), y: Y, place: HM, lure: 'Spintail' }, { id: 'b1', sp: 's2', at: at(3, 7), y: Y, place: BH }, { id: 'b2', sp: 's2', at: at(6, 7), y: Y, place: BH },
        { id: 'x1', sp: 's1', at: at(7, 9), y: Y, place: { name: 'Egyszeri hely', lat: 47, lng: 19 } }];
      await q.addInitScript(cs => { if (sessionStorage.getItem('s')) return; sessionStorage.setItem('s', 1);
        localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }, { id: 's2', name: 'Süllő' }], catches: cs,
          trips: [{ id: 't1', start: new Date(Date.now() - 864e5 * 3).toISOString(), end: new Date(Date.now() - 864e5 * 3 + 3 * 36e5).toISOString(), place: { name: 'Holt-Maros', lat: 46.2, lng: 20.3 } }] })); }, cs);
      const Hof = dp => ({ ...H, pressure_msl: hours.map((_, k) => 1015 + k * dp), cloud_cover: hours.map(() => 70) });
      let multi = '';
      await q.route('https://api.open-meteo.com/**', r => { const u = r.request().url();
        if (/latitude=[^&]*%2C|latitude=[^&]*,/.test(u)) { multi = u; r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ hourly: Hof(-0.3), daily: D }, { hourly: Hof(1.2), daily: D }]) }); }
        else r.fulfill({ contentType: 'application/json', body: JSON.stringify({ hourly: H, daily: D }) }); });
      await q.goto(PAGE); await q.waitForTimeout(600);
      ok(/latitude=46\.200(,|%2C)46\.250/.test(multi), 'helyeim: a két visszatérő hely időjárása egy kérésben (az egyszeri hely nem hely)');
      const fy = (await q.locator('#forYou').innerText()).replace(/\s+/g, ' ');
      ok(await q.locator('#forYouSec').isVisible() && fy.startsWith('Ma Holt-Maros') && fy.includes('óra') && fy.includes('Bertalan híd ('),
        'ma neked: a ma legjobb helyed, a legjobb órákkal, a többi hely röviden (' + fy.slice(0, 120) + ')');
      await q.locator('#forYou .btn-main').click(); await q.waitForTimeout(100);
      ok(await q.locator('#tripSheet .pill.on', { hasText: 'Holt-Maros' }).count() === 1, 'ma neked: „Horgászat indítása itt” a hellyel előre kiválasztva');
      await q.evaluate(() => window.__fnBack());
      await q.locator('.tabbar button[data-tab="map"]').click(); await q.waitForTimeout(400);
      const cards = q.locator('#spots .spot');
      const c1 = (await cards.first().innerText()).replace(/\s+/g, ' ');
      ok(await cards.count() === 2 && c1.startsWith('Holt-Maros') && c1.includes('3 fogás') && c1.includes('siker 0/1') && c1.includes('Legjobb csali: Spintail (3)') && /Ma \d+–\d+ óra/.test(c1),
        'helyeim: kártyánként a mai értékelés, legjobb órák, fogások, siker, legjobb csali (' + c1 + ')');
      ok(await cards.first().locator('.spot-lv').count() === 1 && await cards.nth(1).locator('.spot-lv').count() === 1, 'helyeim: mindkét helynek saját mai értékelése');
      ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'helyeim: nincs vízszintes túlcsordulás');
      await ctx.close();
    }
    const flat = await run(wdays.map(() => 130)), rising = await run(wdays.map((_, k) => k < 4 ? 100 : k < 7 ? 100 + (k - 3) * 40 : 260));
    ok(flat.facts.includes('Víz 130 m³/s') && flat.facts.includes('stagnál'), 'vízhozam: a mai nap kártyáján a folyó vízhozama és iránya (' + flat.facts.replace(/\n/g, ' ') + ')');
    ok(flat.reasons.includes('Stagnáló víz') && rising.reasons.includes('Gyorsan áradó víz'), 'vízhozam: az értékelés indoklásában szerepel');
    ok(flat.lv > rising.lv, `vízhozam: gyorsan áradó víznél gyengébb a horgászidő (${flat.lv} > ${rising.lv})`);
    ok(flat.ex.includes('vízhozam') && flat.ex.includes('gyorsan árad'), 'vízhozam: a magyarázat leírja, mit jelent és hogyan pontoz');
    const small = await run(wdays.map(() => 4));
    ok(!small.facts.includes('m³/s') && !small.reasons.includes('m³/s'), 'vízhozam: ahol nincs igazi folyó (kis érték), nem mutat és nem pontoz');

    // a catch gets its river from the archive; viewer shows it; patterns appear with 5+ catches
    const ctx = await b.newContext(); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const at = i => new Date(Y, 4, 10 + i, 17, 30).toISOString();
    const cs = Array.from({ length: 6 }, (_, i) => ({ id: 'w' + i, sp: 's1', at: at(i), y: Y, t: true, place: { name: 'Bertalan híd', lat: 46.25, lng: 20.15 },
      wx: { key: 'x', temp: 20, p: 1015, dp: 0.2, ws: 8, wd: 0, cc: 20, code: 1, rain: 0 } }));
    await q.addInitScript(cs => localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }], catches: cs })), cs);
    const asked = [];
    await q.route('https://flood-api.open-meteo.com/**', r => { const u = new URL(r.request().url()); asked.push(u);
      const cells = Array.from({ length: 9 }, (_, k) => ({ daily: { time: ['a', 'b', 'c', 'd'], river_discharge: k === 7 ? [400, 360, 330, 300] : [5, 6, 7, 8] } }));
      r.fulfill({ contentType: 'application/json', body: JSON.stringify(cells) }); });
    await q.route('https://api.open-meteo.com/**', r => r.abort()); await q.route('https://archive-api.open-meteo.com/**', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(2600);
    const d = await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')));
    const w0 = d.catches.find(c => c.id === 'w0').water;
    ok(w0 && w0.q === 300 && w0.k === 'down' && w0.pct === -25 && asked.some(u => u.searchParams.get('end_date') && u.searchParams.get('latitude').split(',').length === 9),
      'vízhozam: a fogás napjára az archívumból, a környék legnagyobb folyója (3 napos irány)');
    await q.locator('.tabbar button[data-tab="list"]').click(); await q.locator('.citem').first().click(); await q.waitForTimeout(150);
    ok((await q.locator('#sheet').innerText()).includes('300 m³/s, apad (-25% / 3 nap)'), 'vízhozam: a fogás kártyáján látszik');
    await q.evaluate(() => window.__fnBack());
    await q.locator('.tabbar button[data-tab="stats"]').click(); await q.waitForTimeout(150);
    const pt = (await q.locator('#patSec').innerText()).replace(/\s+/g, ' ');
    ok(await q.locator('#patSec').isVisible() && pt.includes('Balin · 6 fogás') && pt.includes('6/6 stabil légnyomásnál') && pt.includes('6/6 apadó víznél') && pt.includes('nappal'),
      'mintázataid: fajonként a közös körülmények, darabszámmal (' + pt.replace(/\n/g, ' | ') + ')');
    ok(!pt.includes('Minden fogás'), 'mintázataid: egy fajnál nincs külön „Minden fogás” sor');
    await ctx.close();
  }
  // the official catch log: kept fish by day, place (water code), species; unmarked catches; copy; hand-in reminder
  {
    const ctx = await b.newContext({ viewport: { width: 360, height: 800 } }); const q = await ctx.newPage(); q.on('pageerror', e => errs.push(e.message));
    const Y = new Date().getFullYear(), at = (m, d, h) => new Date(Y, m, d, h || 10).toISOString();
    const pl = { name: 'Bertalan híd', lat: 46.25, lng: 20.15 };
    const cs = [
      { id: 'k1', sp: 's1', at: at(4, 21, 17), y: Y, t: true, l: 48, w: 1.2, kept: true, place: pl },
      { id: 'k2', sp: 's1', at: at(4, 21, 18), y: Y, t: true, l: 45, kept: true, place: pl },
      { id: 'k3', sp: 's2', at: at(5, 2, 19), y: Y, t: true, l: 50, w: 1.5, kept: true },
      { id: 'r1', sp: 's1', at: at(5, 4), y: Y, kept: false, place: pl },
      { id: 'u1', sp: 's1', at: at(6, 1), y: Y, l: 40 }, { id: 'u2', sp: 's2', at: at(6, 2), y: Y }];
    await q.addInitScript(cs => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [{ id: 's1', name: 'Balin' }, { id: 's2', name: 'Süllő' }], catches: cs }));
      localStorage.setItem('fogasnaplo.notify', '1'); window.__x = { clip: null, rem: null };
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, copyText(l, t) { window.__x.clip = t; return true; }, setReminders(j) { window.__x.rem = j; } }; }, cs);
    await q.route('https://**/*', r => r.abort());
    await q.goto(PAGE); await q.waitForTimeout(300);
    await q.locator('.tabbar button[data-tab="stats"]').click(); await q.waitForTimeout(150);
    const sec = q.locator('#offSec'), txt = async () => (await sec.innerText()).replace(/\s+/g, ' ');
    let t = await txt();
    ok(await sec.isVisible() && t.includes('2 fogásnál nincs megadva, elvitted-e'), 'fogási napló: a jelöletlen fogásokat külön kéri megjelölni');
    const rows = q.locator('#offSec .off-tab tr');
    ok(await rows.count() === 3, 'fogási napló: csak az elvitt halak, naponta, helyenként, fajonként egy sor (' + (await rows.count() - 1) + ')');
    ok((await rows.nth(1).innerText()).replace(/\s+/g, ' ').includes('Balin 2 1,2+?') && t.includes('1 elvitt halnál nincs súly'), 'fogási napló: összevont darab és súly, a hiányzó súlyt jelzi');
    ok(t.includes('Hiányzó víztérkód') && await q.locator('#offSec .off-vrow').count() === 2, 'fogási napló: helyenként egyszer kéri a víztérkódot (hely nélkül is)');
    await q.locator('#offSec .off-vrow input').first().fill('06-123'); await q.locator('#offSec .off-vrow input').first().dispatchEvent('change'); await q.waitForTimeout(100);
    ok((await rows.nth(1).innerText()).includes('06-123') && (await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.vtk'))['Bertalan híd'])) === '06-123', 'fogási napló: a víztérkód megmarad, és a sorokban látszik');
    await q.locator('#offSec .off-q').first().locator('button', { hasText: 'Elvittem' }).click(); await q.waitForTimeout(150);
    t = await txt();
    ok(t.includes('1 fogásnál nincs megadva') && await rows.count() === 4 && (await q.evaluate(() => JSON.parse(localStorage.getItem('fogasnaplo.v1')).catches.find(c => c.id === 'u1').kept)) === true, 'fogási napló: „Elvittem” után bekerül a naplóba');
    ok(t.includes('Összesen: Balin 3 db (1,2 kg), Süllő 1 db (1,5 kg)') && t.includes('Horgásznap elvitt hallal: 3'), 'fogási napló: összesítő fajonként és a horgásznapok száma');
    await q.locator('#offSec button', { hasText: 'Összesítő másolása' }).click(); await q.waitForTimeout(100);
    const clip = await q.evaluate(() => window.__x.clip);
    ok(clip && clip.includes(Y + '. évi fogási napló') && clip.includes('05.21. | 06-123 | Balin | 2 | 1,2 + 1 db súly nélkül') && clip.includes('? (Hely nélkül)'), 'fogási napló: az összesítő vágólapra kerül, soronként');
    ok(t.includes((Y + 1) + '. február 28-ig'), 'fogási napló: kiírja a leadási határidőt');
    const rem = JSON.parse(await q.evaluate(() => window.__x.rem) || '[]').filter(r => r.title.startsWith('Fogási napló'));
    ok(rem.length === 2 && rem.every(r => new Date(r.at).getMonth() === 1 && new Date(r.at).getFullYear() === Y + 1) && rem[0].text.includes(Y + '. évi'), 'fogási napló: értesítés a leadás előtt egy héttel és előző nap');
    ok(await q.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'fogási napló: 360 px-en nincs vízszintes túlcsordulás');
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
      ok(await q.evaluate(() => getComputedStyle(document.querySelector('.total .n')).color.match(/\d+/g).slice(0, 3).every(v => +v >= 230)), `${W}px, ${scheme}: a hős-kártya száma világos (krémfehér)`);
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
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, appVersion() { return '1.8 (1012)'; }, backupFolder() { return ''; }, zipToFolder() {}, saveZip() {}, restoreZip() {}, pickBackupFolder() {} }; });
    await a.goto(PAGE); await a.waitForTimeout(300);
    await a.locator('.tabbar button[data-tab="more"]').click();
    ok((await a.locator('#verLine').innerText()) === '1.8 (1012)', 'Beállítások: az app verziója látszik');
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
