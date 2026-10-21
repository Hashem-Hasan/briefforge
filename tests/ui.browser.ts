import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { createApp } from '../src/server.js';
test('source links, human edits, review flags, exports, dirty state and bilingual fixtures', async () => {
  const app = createApp();
  await new Promise<void>((resolve) =>
    app.server.listen(0, '127.0.0.1', resolve),
  );
  const origin = `http://127.0.0.1:${(app.server.address() as { port: number }).port}`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 1000 },
    });
    const errors: string[] = [];
    const providerPosts: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('request', (req) => {
      if (req.url().includes('/api/analyze')) providerPosts.push(req.url());
    });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Prepare a scope draft' }).click();
    await page.getByText('LOCAL RULES', { exact: true }).waitFor();
    assert.equal(await page.locator('.requirement').count(), 3);
    assert.equal(
      await page.getByText('Not established', { exact: true }).count(),
      2,
    );
    await page
      .getByRole('button', { name: 'Show source M001', exact: true })
      .first()
      .click();
    await page.locator('.source-messages article.highlighted').waitFor();
    assert.ok(
      (await page.locator('.highlighted').textContent())?.includes(
        'product catalog',
      ),
    );
    await page
      .getByRole('button', { name: 'Edit requirement 1', exact: true })
      .click();
    await page
      .getByLabel('Requirement 1 text', { exact: true })
      .fill('Human revised catalog scope');
    await page
      .getByRole('checkbox', {
        name: 'Mark requirement 1 reviewed',
        exact: true,
      })
      .check();
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Export Markdown', exact: true })
      .click();
    assert.equal((await download).suggestedFilename(), 'project-brief.md');
    await page
      .getByRole('button', { name: 'Edit requirement 1', exact: true })
      .click();
    await page
      .getByRole('checkbox', {
        name: 'Mark requirement 1 reviewed',
        exact: true,
      })
      .uncheck();
    await mkdir('docs/screenshots', { recursive: true });
    for (const width of [375, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => scrollTo(0, 0));
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth + 1,
        ),
        `no overflow at ${width}`,
      );
      if (process.env.SCREENSHOTS === '1')
        await page.screenshot({
          path: `docs/screenshots/${width === 1440 ? 'desktop' : width === 375 ? 'mobile' : 'tablet'}.png`,
          fullPage: true,
        });
    }
    await page
      .getByRole('button', { name: 'Edit conversation', exact: true })
      .click();
    await page
      .getByLabel('One message per line. Speaker labels are optional.')
      .fill('Client: We need a contact form.');
    assert.equal(
      await page
        .getByRole('button', { name: 'Export Markdown', exact: true })
        .isDisabled(),
      true,
    );
    await page
      .getByRole('status')
      .filter({ hasText: 'conversation changed' })
      .waitFor();
    await page
      .getByLabel('Try a synthetic conversation')
      .selectOption('arabic');
    await page
      .getByRole('button', { name: 'Regenerate draft', exact: true })
      .click();
    assert.equal(await page.locator('.requirement').count(), 3);
    assert.ok(
      (await page.locator('.requirement').first().textContent())?.includes(
        'لحجز المواعيد',
      ),
    );
    await page
      .getByLabel('Try a synthetic conversation')
      .selectOption('conflict');
    await page
      .getByRole('button', { name: 'Regenerate draft', exact: true })
      .click();
    assert.equal(
      await page.getByText('Conflicting statements', { exact: true }).count(),
      2,
    );
    assert.deepEqual(errors, []);
    assert.deepEqual(
      providerPosts,
      [],
      'local analysis never calls the provider endpoint',
    );
  } finally {
    await browser.close();
    await app.close();
  }
});
