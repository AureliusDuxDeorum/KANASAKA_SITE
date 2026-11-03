import { createRequire } from 'node:module';
import { serve } from './srv.mjs';
const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const server = await serve(8792);
const BASE = 'http://localhost:8792';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('kanasaka-cookie-ack', '1'); } catch (e) {} window.__csp = []; document.addEventListener('securitypolicyviolation', e => window.__csp.push(e.violatedDirective)); });
const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(String(e)));
await p.route('**/api/**', r => r.fulfill({ status: 401, contentType: 'application/json', body: '{}' }));
await p.goto(BASE + '/'); await p.waitForTimeout(1500);
const showTop = await p.evaluate(() => document.querySelector('.showcase').getBoundingClientRect().top + scrollY);
await p.evaluate(y => scrollTo(0, y - 100), showTop); await p.waitForTimeout(500);
const info = await p.evaluate(() => { const t = document.querySelector('.showcase-track'); const a = t.getAnimations()[0]; return { js: document.querySelector('.showcase').classList.contains('showcase--js'), n: t.getAnimations().length, name: a.animationName, dur: a.effect.getComputedTiming().duration, group: document.querySelector('.showcase-group').getBoundingClientRect().width, rate: a.playbackRate }; });
console.log('setup:', JSON.stringify(info));
const probe = () => p.evaluate(() => { const t = document.querySelector('.showcase-track'); const a = t.getAnimations()[0]; const m = new DOMMatrix(getComputedStyle(t).transform).m41; return { x: m, rate: a.playbackRate, ct: a.currentTime, state: a.playState }; });
async function speed(ms = 600) { const a = await probe(); const t0 = Date.now(); await p.waitForTimeout(ms); const c = await probe(); return (c.x - a.x) / ((Date.now() - t0) / 1000); }
const expected = -info.group / (info.dur / 1000);
console.log('expected drift px/s:', expected.toFixed(1), '| measured:', (await speed()).toFixed(1));

// hover -> eases to stop within ~0.6s
const box = await p.locator('.showcase').boundingBox();
await p.mouse.move(box.x + 300, box.y + 80);
const rates = []; for (let i = 0; i < 9; i++) { await p.waitForTimeout(100); rates.push(+(await probe()).rate.toFixed(2)); }
console.log('hover rate ramp (100ms steps):', rates.join(' '));
console.log('stopped speed px/s:', (await speed(500)).toFixed(2));
// wheel: up => content moves left (x decreases), down => right
async function wheel(dy) { const a = await probe(); await p.mouse.wheel(0, dy); await p.waitForTimeout(500); const c = await probe(); return c.x - a.x; }
console.log('wheel up  (dy=-300) dx:', (await wheel(-300)).toFixed(1), '(expect negative: content left)');
console.log('wheel down(dy=+300) dx:', (await wheel(300)).toFixed(1), '(expect positive)');
console.log('after wheel, still stopped:', (await speed(400)).toFixed(2), 'px/s');
// wrap: many wheel-downs across the loop start
for (let i = 0; i < 40; i++) { await p.mouse.wheel(0, 400); await p.waitForTimeout(30); }
await p.waitForTimeout(600); const w = await probe(); console.log('after big wheel-down: x =', w.x.toFixed(0), 'ct =', Math.round(w.ct), 'within loop:', w.ct >= 0 && w.ct < info.dur);
for (let i = 0; i < 80; i++) { await p.mouse.wheel(0, -400); await p.waitForTimeout(30); }
await p.waitForTimeout(600); const w2 = await probe(); console.log('after big wheel-up:   x =', w2.x.toFixed(0), 'ct =', Math.round(w2.ct), 'within loop:', w2.ct >= 0 && w2.ct < info.dur, '| x in [-group,0]:', w2.x <= 0 && w2.x >= -info.group - 1);
// leave -> back to full speed in ~0.5s
await p.mouse.move(5, 5);
const up = []; for (let i = 0; i < 8; i++) { await p.waitForTimeout(100); up.push(+(await probe()).rate.toFixed(2)); }
console.log('leave rate ramp:', up.join(' '));
console.log('speed after leave px/s:', (await speed()).toFixed(1));
// focus pauses
await p.focus('a.showcase-hit'); await p.waitForTimeout(900); console.log('focused rate:', (await probe()).rate);
await p.evaluate(() => document.activeElement.blur()); await p.waitForTimeout(800); console.log('blurred rate:', (await probe()).rate);
// seam: sample transform densely across a wrap by jumping near the end
await p.evaluate(() => { const a = document.querySelector('.showcase-track').getAnimations()[0]; a.currentTime = a.effect.getComputedTiming().duration - 300; });
const seam = []; for (let i = 0; i < 12; i++) { seam.push(Math.round((await probe()).x)); await p.waitForTimeout(60); }
console.log('seam x samples:', seam.join(' '), '(jumps back by ~one group at wrap = identical content)');
// offscreen pauses
await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500); console.log('offscreen state:', (await probe()).state);
await p.evaluate(y => scrollTo(0, y - 100), showTop); await p.waitForTimeout(500); console.log('back on screen state:', (await probe()).state);
// touch pointer ignored
console.log('csp violations:', JSON.stringify(await p.evaluate(() => window.__csp)), '| errors:', errs.length ? errs : 'none');
// click hitbox
await p.locator('a.showcase-hit').first().click({ force: true }); await p.waitForTimeout(500); console.log('click KS_Link ->', new URL(p.url()).pathname);
await b.close(); server.close();
