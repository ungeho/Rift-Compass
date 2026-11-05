// After vite build, run with node --test tools/search-ui.browser.test.mjs.
// Use PLAYWRIGHT_MODULE and CHROME_PATH to reuse an external Playwright/Chrome installation.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";
import { preview } from "vite";

const require = createRequire(import.meta.url);

test("search filters keep their values, disclosure and focus when moved", async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
  const server = await preview({ preview: { host: "127.0.0.1", port: 0 } });
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.CHROME_PATH });
    const base = `http://127.0.0.1:${server.httpServer.address().port}${server.config.base}`;
    const query = "Lv2先行";
    const url = `${base}#/?q=${encodeURIComponent(query)}&lang=ja`;
    for (const colorScheme of ["light", "dark"]) {
      const page = await browser.newPage({ colorScheme, viewport: { width: 390, height: 1000 } });
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("console", message => {
        if (message.type() !== "error") return;
        // Vite preview has no root favicon on this project subpath.
        if (message.location().url.endsWith("/favicon.ico") && message.text().includes("404")) return;
        errors.push(`${message.location().url}: ${message.text()}`);
      });
      const filters = page.getByRole("complementary", { name: "絞り込み", exact: true });
      const details = filters.locator("details");
      const summary = filters.locator("summary");
      const language = filters.getByLabel("言語", { exact: true });
      const search = page.getByRole("searchbox", { name: "知りたいことを日本語または英語で入力" });
      const tabs = page.getByRole("tablist", { name: "検索結果の種類" });
      const resize = async width => {
        await page.setViewportSize({ width, height: 1000 });
        await page.waitForFunction(narrow => Boolean(document.querySelector(".results .filters")) === narrow, width <= 760);
        assert.equal(await filters.count(), 1);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      };
      const isOpen = () => details.evaluate(el => el.open);
      const isFocused = locator => locator.evaluate(el => document.activeElement === el);

      for (const width of [1440, 761, 760, 390]) {
        await page.setViewportSize({ width, height: 1000 });
        await page.goto(base);
        await page.reload();
        assert.equal(await isOpen(), width > 760);
        await page.goto(url);
        await page.reload();
        assert.equal(await isOpen(), width > 760);
        if (width > 760) assert.ok((await filters.boundingBox()).x < (await tabs.boundingBox()).x);
      }
      await page.waitForFunction(q => document.querySelector("#q")?.value === q, query);
      assert.equal(await search.inputValue(), query);
      assert.equal(await isOpen(), false);
      const tabBounds = await tabs.boundingBox();
      assert.ok((await filters.boundingBox()).y >= tabBounds.y + tabBounds.height);
      const selectedTab = tabs.locator('[aria-selected="true"]');
      await selectedTab.focus();
      await page.keyboard.press("Tab");
      assert.equal(await isFocused(summary), true);
      await page.keyboard.press("Enter");
      assert.equal(await filters.getByRole("combobox").count(), 6);
      await language.focus();
      const activeTab = await selectedTab.textContent();
      for (const width of [760, 761, 760, 1440, 390]) {
        await resize(width);
        assert.equal(await isOpen(), true);
        assert.equal(await isFocused(language), true);
        assert.equal(await language.inputValue(), "ja");
        assert.equal(await selectedTab.textContent(), activeTab);
        assert.equal(page.url(), url);
      }
      await summary.press("Enter");
      await resize(761);
      assert.equal(await isOpen(), false);
      assert.equal(await isFocused(summary), true);
      assert.ok((await filters.boundingBox()).x < (await tabs.boundingBox()).x);
      await search.focus();
      await resize(760);
      assert.equal(await isFocused(search), true);
      assert.equal(await isOpen(), false);
      await tabs.getByRole("tab", { name: /知識ノート/ }).click();
      assert.match(await page.getByRole("tabpanel").textContent(), /知識ノート/);
      await tabs.getByRole("tab", { name: /判断材料/ }).click();
      assert.match(await page.getByRole("tabpanel").textContent(), /判断材料/);
      await search.fill("リコール");
      await page.waitForURL(value => new URLSearchParams(value.hash.slice(3)).get("q") === "リコール");
      assert.equal(await language.inputValue(), "ja");
      await page.goto(base + "#/topics");
      await page.goBack();
      await page.waitForFunction(() => document.querySelector("#q")?.value === "リコール");
      assert.equal(await search.inputValue(), "リコール");
      assert.equal(await language.inputValue(), "ja");
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally {
    await browser?.close();
    await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  }
});
