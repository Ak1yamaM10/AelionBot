// Takes the product screenshots used by the README and the website.
//   pnpm run site:dev                                    (serves tools/product-capture on 127.0.0.1:4173)
//   node website/tools/capture-screens.mjs [--out dir] [--lang en,zh-CN,zh-TW] [--shots workspace,design]
// Every screenshot is the real App rendered against the fictional data in tools/product-capture/scene.ts.
import { chromium } from 'playwright';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const arg = (name, fallback) => {
  const index = process.argv.indexOf('--' + name);
  return index > 0 ? process.argv[index + 1] : fallback;
};
const out = arg('out', 'docs/assets/screenshots'),
  languages = arg('lang', 'en,zh-CN,zh-TW').split(','),
  only = arg('shots', '') ? arg('shots', '').split(',') : undefined,
  origin = arg('origin', 'http://127.0.0.1:4173');

const bot = (page, id) => page.locator(`[data-bot-id="${id}"]`).first().click();
const settle = (page) => page.evaluate(() => document.fonts.ready).then(() => page.waitForTimeout(500));
const settingsPages = {
  profile: 0,
  appearance: 1,
  model: 2,
  design: 3,
  usage: 4,
  memory: 5,
  runtime: 6,
  computer: 7,
  permissions: 8,
  about: 9,
};
const openSettings = async (page, tab) => {
  await page.locator('.sidebar-bottom .sidebar-link').nth(1).click();
  await page.locator('.settings-sidebar').waitFor();
  await page.locator('.settings-sidebar button').nth(settingsPages[tab]).click();
  await page.waitForTimeout(500);
};

/** Shots kept for experiments; they are only taken when named with --shots. */
const EXTRA = new Set(['sessions', 'models', 'memory', 'permissions']);

/** name -> { theme, run(page, lang) } */
const shots = {
  workspace: { run: async () => {} },
  'workspace-dark': { theme: 'dark', scene: 'workspace', run: async () => {} },
  research: {
    run: async (page) => {
      const run = page.locator('[data-run-id="run-research-1"]').first();
      await run.locator('.run-process-toggle').click();
      // Bring the question that started the run into view above its steps.
      await run.evaluate((el) => {
        el.scrollIntoView({ block: 'start' });
        let box = el.parentElement;
        while (box && box.scrollHeight <= box.clientHeight) box = box.parentElement;
        box?.scrollBy(0, -110);
      });
    },
  },
  conversation: { run: (page) => bot(page, 'writing') },
  collaboration: {
    run: async (page) => {
      await page.locator('[data-group-id="launch"]').click();
      await page.locator('.group-message').first().waitFor();
    },
  },
  handoff: {
    run: async (page) => {
      await page.locator('.peer-notice-open').click();
      await page.locator('.peer-message').first().waitFor();
    },
  },
  studio: {
    scene: 'workspace',
    run: async (page) => {
      await page.locator('.attachment-open').first().click();
      await page.locator('.fp-panel').waitFor();
    },
  },
  computer: {
    scene: 'workspace',
    run: async (page) => {
      await page.locator('.computer-panel-settings').click();
      await page.locator('.settings-modal').waitFor();
    },
  },
  design: { run: (page) => bot(page, 'designer') },
  game: {
    run: async (page) => {
      await page.locator('[data-group-id="launch"]').click();
      await page.getByRole('button', { name: /AI games|AI 游戏|AI 遊戲/ }).click();
      await page.getByRole('button', { name: /Resume match|继续对局|繼續對局|返回对局|返回對局/ }).click();
      await page.waitForTimeout(1500);
    },
  },
  profile: {
    scene: 'workspace',
    run: async (page) => {
      await page.locator('.bot-heading').click();
      await page.waitForTimeout(800);
    },
  },
  approval: {
    run: async (page) => {
      await bot(page, 'code');
      await page
        .locator('.interaction-toast button[aria-label], .toast button[aria-label]')
        .first()
        .click({ timeout: 1500 })
        .catch(() => {});
    },
  },
  'design-systems': { scene: 'workspace', run: (page) => openSettings(page, 'design') },
  models: { scene: 'workspace', run: (page) => openSettings(page, 'model') },
  memory: { scene: 'workspace', run: (page) => openSettings(page, 'memory') },
  permissions: { scene: 'workspace', run: (page) => openSettings(page, 'permissions') },
  plugins: {
    scene: 'workspace',
    run: async (page) => {
      await page.locator('.sidebar-bottom .sidebar-link').nth(0).click();
      await page.waitForTimeout(800);
    },
  },
  sessions: {
    scene: 'workspace',
    run: (page) => page.locator('[data-session-id="session-pricing"]').click(),
  },
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.emulateMedia({ reducedMotion: 'reduce' });
mkdirSync(out, { recursive: true });
const taken = [];
for (const lang of languages)
  for (const [name, shot] of Object.entries(shots)) {
    if (only ? !only.includes(name) : EXTRA.has(name)) continue;
    const url = `${origin}/tools/product-capture/?lang=${lang}&shot=${shot.scene || name}${shot.theme ? '&theme=' + shot.theme : ''}`;
    await page.goto(url);
    await page.locator('.app-shell').waitFor({ timeout: 20000 });
    await page.waitForTimeout(600);
    await shot.run(page, lang);
    await settle(page);
    await page.mouse.move(1398, 898);
    await page.screenshot({ path: `${out}/${name}-${lang}.png`, animations: 'disabled' });
    taken.push(`${name}-${lang}`);
  }
await browser.close();
// Record what was captured so a stale or hand-edited image shows up in review.
if (!only) {
  const manifest = {
    source: 'Production App React components with fictional read-only example data',
    applicationVersion: JSON.parse(readFileSync('package.json', 'utf8')).version,
    viewport: { width: 1400, height: 900 },
    modelConnected: false,
    vmConnected: false,
    files: taken.map((name) => {
      const bytes = readFileSync(`${out}/${name}.png`);
      return { name: name + '.png', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }),
  };
  writeFileSync(`${out}/product-capture.json`, JSON.stringify(manifest, null, 2) + '\n');
}
console.log(taken.join('\n'));
