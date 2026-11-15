// Google sign-in and Drive backup screens: every state and flow at 320–800 px, light and dark. Run: cd tests && node login.test.js [screenshot-dir]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ASSETS = path.resolve(__dirname, '../app/src/main/assets');
const T = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
require('http').createServer((q, r) => { const f = path.join(ASSETS, decodeURIComponent(new URL(q.url, 'http://x').pathname));
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); return; }
  r.writeHead(200, { 'Content-Type': T[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(r); }).listen(47826, '127.0.0.1').unref();
const OUT = process.argv[2] || ''; // a folder for screenshots (optional)
let fails = 0, n = 0; const ok = (c, m) => { n++; if (!c) { fails++; console.log('FAIL ' + m); } };
const LOG = { species: [{ id: 's1', name: 'Balin' }], catches: [{ id: 'c1', sp: 's1', at: '2026-09-01T17:00:00.000Z', y: 2026 }] };
(async () => {
  const b = await chromium.launch();
  for (const width of [320, 360, 412, 600, 800]) for (const theme of ['light', 'dark']) {
    const tag = width + '/' + theme;
    const ctx = await b.newContext({ reducedMotion: 'reduce', viewport: { width, height: 900 } });
    await ctx.route('**/*', r => r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
    p.on('dialog', d => d.accept());
    await p.addInitScript(({ log, theme }) => {
      if (!sessionStorage.s) { sessionStorage.s = 1; localStorage.setItem('fogasnaplo.v1', JSON.stringify(log)); localStorage.setItem('fogasnaplo.welcome', '1'); localStorage.setItem('fogasnaplo.theme', theme); }
      // the bridge: an account in sessionStorage (like the native prefs), every call recorded
      window.__calls = [];
      const acct = () => sessionStorage.acct || '';
      window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, setReminders() {}, setWidget() {},
        googleAccount() { return acct() ? JSON.stringify(JSON.parse(acct())) : '{}'; },
        googleSignIn() { window.__calls.push('signIn'); }, driveSync(v) { window.__calls.push('sync:' + v); }, driveRestore() { window.__calls.push('restore'); },
        googleSignOut() { window.__calls.push('signOut'); sessionStorage.acct = ''; setTimeout(() => window.__fnDrive({ state: 'out' })); } };
    }, { log: LOG, theme });
    await p.goto('http://127.0.0.1:47826/index.html'); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('.tabbar button[data-tab="more"]').click()); await p.waitForTimeout(200);
    const box = p.locator('#gAcct');
    const check = async (name, want, buttons) => {
      await p.waitForTimeout(80);
      const txt = (await box.textContent()) || '';
      ok(await box.isVisible(), `${tag} ${name}: látszik`);
      ok(want.every(w => txt.includes(w)), `${tag} ${name}: szöveg (${want.join(' | ')}) ← ${txt.slice(0, 160)}`);
      const labels = await box.locator('button').evaluateAll(bs => bs.map(b => b.textContent.trim() + (b.disabled ? '(tiltva)' : '')));
      ok(JSON.stringify(labels) === JSON.stringify(buttons), `${tag} ${name}: gombok ${JSON.stringify(labels)} ≠ ${JSON.stringify(buttons)}`);
      ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag} ${name}: nincs vízszintes túlcsordulás`);
      const outside = await box.locator('button, p, label').evaluateAll(es => es.filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.left < 0 || r.right > innerWidth + 0.5); }).length);
      ok(outside === 0, `${tag} ${name}: minden elem a képernyőn belül`);
      const tiny = await box.locator('button').evaluateAll(bs => bs.filter(b => { const r = b.getBoundingClientRect(); return r.height < 40; }).map(b => b.textContent.trim()));
      ok(tiny.length === 0, `${tag} ${name}: a gombok legalább 40 px magasak (${tiny.join(', ')})`);
      if (OUT && (width === 360 || width === 800)) { await box.scrollIntoViewIfNeeded(); await box.screenshot({ path: `${OUT}/${width}-${theme}-${name}.png` }); }
    };
    const calls = () => p.evaluate(() => window.__calls.splice(0));
    const signIn = async (email, name) => { await p.evaluate(({ email, name }) => { sessionStorage.acct = JSON.stringify({ email, name }); window.__fnDrive({ state: 'in', email, name }); }, { email, name }); };
    // 1. signed out
    await check('kijelentkezve', ['Mentés a Google-fiókodba'], ['Bejelentkezés Google-fiókkal']);
    await box.locator('button', { hasText: 'Bejelentkezés Google-fiókkal' }).click();
    ok((await calls()).join() === 'signIn', `${tag} bejelentkezés gomb: a natív fiókválasztót hívja`);
    // 2. picker closed (Vissza): stays signed out, no error shown
    await p.evaluate(() => window.__fnDrive({ state: 'out' }));
    await check('mégse', ['Mentés a Google-fiókodba'], ['Bejelentkezés Google-fiókkal']);
    // 3. not set up (DEVELOPER_ERROR 10), no Play services, no internet
    for (const [k, e] of [['nincs-beallitva', 'A Google-bejelentkezés ehhez az apphoz még nincs beállítva (a fejlesztő Google Cloud-beállítása hiányzik).'],
      ['nincs-play', 'Ezen a telefonon nincs (vagy elavult) a Google Play-szolgáltatás, ezért a Google-bejelentkezés nem működik. A mappás mentés igen.'],
      ['nincs-net', 'Nincs internet. Próbáld újra, ha lesz kapcsolat.']]) {
      await p.evaluate(e => window.__fnDrive({ state: 'error', error: e }), e);
      await check(k, [e.slice(0, 40)], ['Bejelentkezés Google-fiókkal']);
    }
    // 4. signed in, this phone has a log → backs up at once
    await signIn('horgasz.teszt@gmail.com', 'Horgász Teszt'); const c1 = await calls();
    ok(c1.includes('sync:false') && !c1.includes('restore'), `${tag} bejelentkezés után (van napló): mentés indul, nem visszaállítás (${c1})`);
    await check('bejelentkezve', ['Horgász Teszt', 'horgasz.teszt@gmail.com', 'Az első mentés hamarosan indul.'], ['Mentés most', 'Visszaállítás a Drive-ról', 'Kijelentkezés']);
    await p.evaluate(() => window.__fnDrive({ state: 'syncing', done: 3, total: 12 }));
    await check('feltoltes', ['Feltöltés a Drive-ra… 3/12 fájl'], ['Mentés most(tiltva)', 'Visszaállítás a Drive-ról(tiltva)', 'Kijelentkezés']);
    await p.evaluate(() => window.__fnDrive({ state: 'synced', up: 12, total: 12, waiting: 1, ts: Date.now() }));
    await check('kesz', ['Minden fent van a Drive-on (12/12 fájl)', '1 videó wifire vár'], ['Mentés most', 'Visszaállítás a Drive-ról', 'Kijelentkezés']);
    await box.locator('button', { hasText: 'Mentés most' }).click(); ok((await calls()).join() === 'sync:false', `${tag} Mentés most: szinkron`);
    await box.locator('input[type=checkbox]').check(); ok((await calls()).join() === 'sync:true', `${tag} videó mobilneten: bekapcsolva újra szinkronizál`);
    await box.locator('input[type=checkbox]').uncheck(); await calls();
    // 5. a very long name and address must wrap, not overflow
    await signIn('nagyon.hosszu.email.cim.a.tesztelesrol@gmail.com', 'Szentgyörgyvölgyi-Kiskunfélegyházi Bartholomeusz Ferdinánd'); await calls();
    await check('hosszu-nev', ['Szentgyörgyvölgyi'], ['Mentés most', 'Visszaállítás a Drive-ról', 'Kijelentkezés']);
    // 6. another phone's newer backup → restore, no overwrite
    await p.evaluate(() => window.__fnDrive({ state: 'remote', catches: 40, newer: true }));
    await check('masik-telefon', ['másik telefonról újabb mentés van (40 fogás)'], ['Visszaállítás a Drive-ról', 'Kijelentkezés']);
    await box.locator('button', { hasText: 'Visszaállítás a Drive-ról' }).click(); ok((await calls()).join() === 'restore', `${tag} visszaállítás gomb`);
    await check('letoltes', ['Letöltés a Drive-ról…'], ['Visszaállítás a Drive-ról(tiltva)', 'Kijelentkezés']);
    await p.evaluate(() => window.__fnDrive({ state: 'restoring', done: 5, total: 20 }));
    await check('letoltes-2', ['Letöltés a Drive-ról… 5/20 fájl'], ['Visszaállítás a Drive-ról(tiltva)', 'Kijelentkezés']);
    await p.evaluate(() => window.__fnDrive({ state: 'restored', files: 18, missing: 2 }));
    await check('visszaallitva', ['2 fájl nem volt meg a Drive-on'], ['Mentés most', 'Visszaállítás a Drive-ról', 'Kijelentkezés']);
    // 7. Google asks to sign in again (weekly in Testing) → one button; the picker closed → still signed in
    await p.evaluate(() => window.__fnDrive({ state: 'needsLogin' }));
    await check('ujra-kell', ['A Google újra kéri a bejelentkezést.'], ['Bejelentkezés', 'Visszaállítás a Drive-ról', 'Kijelentkezés']);
    await box.locator('button', { hasText: /^Bejelentkezés$/ }).click(); ok((await calls()).join() === 'signIn', `${tag} újra bejelentkezés gomb`);
    await p.evaluate(() => window.__fnDrive({ state: 'needsLogin' })); // what the native side now answers to a cancelled picker
    await check('ujra-mégse', ['A Google újra kéri a bejelentkezést.', 'Szentgyörgyvölgyi'], ['Bejelentkezés', 'Visszaállítás a Drive-ról', 'Kijelentkezés']);
    // 8. full Drive, API off: readable message, buttons stay
    await p.evaluate(() => window.__fnDrive({ state: 'error', error: 'Megtelt a Google Drive-od, nem fér fel több fájl.' }));
    await check('megtelt', ['Megtelt a Google Drive-od'], ['Mentés most', 'Visszaállítás a Drive-ról', 'Kijelentkezés']);
    // 9. sign out (confirm) → back to the start
    await box.locator('button', { hasText: 'Kijelentkezés' }).click(); await p.waitForTimeout(150);
    ok((await calls()).join() === 'signOut', `${tag} kijelentkezés: megerősítés után a natív kijelentkezés`);
    await check('kijelentkezes-utan', ['Mentés a Google-fiókodba'], ['Bejelentkezés Google-fiókkal']);
    // 10. a new phone: empty log + sign in → restore first, never an upload of the empty log
    await p.evaluate(() => { localStorage.setItem('fogasnaplo.v1', JSON.stringify({ species: [], catches: [] })); }); await p.reload(); await p.waitForTimeout(400);
    await p.evaluate(() => document.querySelector('.tabbar button[data-tab="more"]').click()); await calls();
    await signIn('uj.telefon@gmail.com', 'Új Telefon'); const c2 = await calls();
    ok(c2.includes('restore') && !c2.some(c => c.startsWith('sync')), `${tag} új telefon (üres napló): visszaállítás, nem mentés (${c2})`);
    ok(errs.length === 0, `${tag} JS-hibák: ${errs.join(' | ')}`);
    await ctx.close();
  }
  // the first-start welcome's Google step, at the smallest width
  const ctx = await b.newContext({ reducedMotion: 'reduce', viewport: { width: 320, height: 640 } });
  await ctx.route('**/*', r => r.request().url().startsWith('http://127.0.0.1') ? r.continue() : r.abort());
  const p = await ctx.newPage();
  await p.addInitScript(() => { window.__calls = []; window.FogasnaploAndroid = { saveThumb() { return ''; }, cleanup() {}, getLocation() {}, setReminders() {},
    googleAccount() { return '{}'; }, googleSignIn() { window.__calls.push('signIn'); }, driveSync() {}, driveRestore() { window.__calls.push('restore'); }, canNotify() { return true; } }; });
  await p.goto('http://127.0.0.1:47826/index.html'); await p.waitForTimeout(500);
  const w = p.locator('#welcomeWrap');
  ok(await w.isVisible(), '320 üdvözlő: megjelenik üres naplónál');
  await w.locator('button', { hasText: /Tovább|Kihagyom/ }).first().click(); await p.waitForTimeout(150);
  const g = w.locator('button', { hasText: 'Bejelentkezés Google-fiókkal' });
  ok(await g.isVisible(), '320 üdvözlő: 2. lépés Google-bejelentkezés gombbal');
  ok(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '320 üdvözlő: nincs túlcsordulás');
  if (OUT) await w.screenshot({ path: OUT + '/320-udvozlo-google.png' });
  await g.click(); ok((await p.evaluate(() => window.__calls)).includes('signIn'), '320 üdvözlő: a gomb a fiókválasztót hívja');
  await p.evaluate(() => window.__fnDrive({ state: 'in', email: 'a@gmail.com', name: 'A' })); await p.waitForTimeout(200);
  ok(await w.isHidden() && (await p.evaluate(() => window.__calls)).includes('restore'), '320 üdvözlő: bejelentkezés után bezárul és visszaállítást indít');
  await ctx.close(); await b.close();
  console.log(`Bejelentkezés: ${n} ellenőrzés, ${fails} hiba`); process.exit(fails ? 1 : 0);
})();
