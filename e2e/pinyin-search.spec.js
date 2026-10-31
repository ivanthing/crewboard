const { test, expect } = require('@playwright/test');
const { loadState, loginAsAdmin, goToPage } = require('./helpers');

test('人员选择与人员管理支持全拼、缩写和逐级输入过滤', async ({ page }) => {
  const state = loadState();
  const name = '拼音测试员';
  const created = await page.request.post('/api/resources', {
    headers: { Authorization: 'Bearer ' + state.token },
    data: { name, team: '搜索测试' },
  });
  expect(created.ok()).toBeTruthy();
  const resourceId = (await created.json()).id;

  await loginAsAdmin(page);
  await page.goto('/#schedule');
  await expect(page.locator('#page-schedule')).toBeVisible();
  await page.locator('#btn-add-booking').click();
  const resourceSearch = page.locator('#bk-resource-search');
  const resourceOption = page.locator(`#bk-resource-dropdown .ms-option[data-id="${resourceId}"]`);

  await resourceSearch.fill('pinyince');
  await expect(resourceOption).toBeVisible();
  await resourceSearch.fill('pinyinceshiyuan');
  await expect(resourceOption).toBeVisible();
  await resourceSearch.fill('pycsy');
  await expect(resourceOption).toBeVisible();
  await resourceSearch.fill('not-a-person');
  await expect(page.locator('#bk-resource-dropdown .ms-empty')).toBeVisible();
  await expect(page.locator('#bk-resource-dropdown .ms-team-label:visible')).toHaveCount(0);

  await resourceSearch.fill('pinyince');
  await resourceSearch.press('ArrowDown');
  await resourceSearch.press('Enter');
  await expect(page.locator(`#bk-resource-selected .ms-chip[data-id="${resourceId}"]`)).toHaveCount(1);
  await page.locator('#modal-close').click();

  await goToPage(page, 'resources');
  const managementSearch = page.locator('#resource-search');
  await managementSearch.fill('pinyinceshiyuan');
  await expect(page.locator(`#resource-list tr[data-id="${resourceId}"]`)).toBeVisible();
  await expect(page.locator('#resource-list .res-name').filter({ hasText: 'E2E员工' })).toHaveCount(0);
  await expect(page.locator('#resource-search')).toBeFocused();
  await managementSearch.fill('pinyin');
  await managementSearch.evaluate(el => el.setSelectionRange(3, 3));
  await managementSearch.press('x');
  await expect(managementSearch).toHaveValue('pinxyin');
  expect(await managementSearch.evaluate(el => el.selectionStart)).toBe(4);
  await managementSearch.evaluate(el => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    el.value = '拼音';
    el.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }));
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '拼音' }));
  });
  await expect(page.locator(`#resource-list tr[data-id="${resourceId}"]`)).toBeVisible();
  await managementSearch.fill('buzai');
  await expect(page.getByText('没有匹配的人员')).toBeVisible();
});

test('拼音匹配支持混合输入并避免空格导致的错误匹配', async ({ page }) => {
  await loginAsAdmin(page);
  await goToPage(page, 'projects');
  await page.locator('#pc-search').focus();
  await expect.poll(() => page.evaluate(() => !!window.pinyinPro)).toBeTruthy();
  const results = await page.evaluate(() => {
    const match = window.CrewNameSearch.matchesName;
    return ['shi', 'shika', 'shikan', 'sk', 'shi k', '世kan', 's a'].map(q => match('世看', q));
  });
  expect(results).toEqual([true, true, true, true, true, true, false]);
});

test('项目/客户搜索支持拼音，原有中文搜索保持可用', async ({ page }) => {
  const state = loadState();
  const projectName = '拼音项目';
  const clientName = '拼音客户';

  const clientResponse = await page.request.post('/api/clients', {
    headers: { Authorization: 'Bearer ' + state.token },
    data: { name: clientName },
  });
  expect(clientResponse.ok()).toBeTruthy();

  const projectResponse = await page.request.post('/api/projects', {
    headers: { Authorization: 'Bearer ' + state.token },
    data: { name: projectName, client_id: (await clientResponse.json()).id },
  });
  expect(projectResponse.ok()).toBeTruthy();
  const projectId = (await projectResponse.json()).id;

  await loginAsAdmin(page);
  await goToPage(page, 'projects');

  const search = page.locator('#pc-search');
  await search.fill('pinyinxiang');
  await expect(page.locator('.pc-table .pc-name-text').filter({ hasText: projectName })).toBeVisible();
  await search.fill('pinyinkehu');
  await expect(page.locator('.pc-table .pc-name-text').filter({ hasText: projectName })).toBeVisible();
  await search.fill('拼音项目');
  await expect(page.locator('.pc-table .pc-name-text').filter({ hasText: projectName })).toBeVisible();

  await page.goto('/#schedule');
  await page.reload();
  await expect(page.locator('#page-schedule')).toBeVisible();
  await page.locator('#btn-add-booking').click();
  const projectSearch = page.locator('#bk-project-search');
  await projectSearch.fill('pinyinxiang');
  await expect(page.locator(`#bk-project-dropdown .ms-option[data-id="${projectId}"]`)).toBeVisible();
  await projectSearch.fill('pinyinkehu');
  await expect(page.locator(`#bk-project-dropdown .ms-option[data-id="${projectId}"]`)).toBeVisible();
  await projectSearch.fill('not-a-project');
  await expect(page.locator('#bk-project-dropdown .ms-empty')).toBeVisible();
});
