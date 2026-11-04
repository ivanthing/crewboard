const { test, expect } = require('@playwright/test');
const { loadState, restoreAdminSession, goToPage } = require('./helpers');

async function createRecord(page, path, data) {
  const response = await page.request.post('/api/' + path, {
    headers: { Authorization: 'Bearer ' + loadState().token }, data,
  });
  expect(response.ok()).toBeTruthy();
  return (await response.json()).id;
}

async function startComposition(input, value) {
  await input.evaluate((el, text) => {
    el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }));
    el.value = text;
    // Some engines report isComposing=false; compositionstart must still guard filtering.
    el.dispatchEvent(new InputEvent('input', { bubbles: true }));
  }, value);
}

async function endComposition(input, value) {
  await input.evaluate((el, text) => {
    el.value = text;
    el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: text }));
  }, value);
}

test('人员选择与人员管理支持全拼、缩写和逐级输入过滤', async ({ page }) => {
  const state = loadState();
  const name = '拼音测试员';
  const created = await page.request.post('/api/resources', {
    headers: { Authorization: 'Bearer ' + state.token },
    data: { name, team: '搜索测试' },
  });
  expect(created.ok()).toBeTruthy();
  const resourceId = (await created.json()).id;

  await restoreAdminSession(page);
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
  await restoreAdminSession(page);
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

  await restoreAdminSession(page);
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

test('人员管理跨姓名、团队、职位和联系方式组合搜索，存档使用相同规则', async ({ page }) => {
  const name = '吕中文搜索';
  const headers = { Authorization: 'Bearer ' + loadState().token };
  const created = await page.request.post('/api/auth/enterprises/bulk-create', {
    headers,
    data: { members: [{ name, team: '华东设计', title: '设计师', email: 'lv.search@example.test', phone: '13900139001' }] },
  });
  expect(created.ok()).toBeTruthy();
  expect((await created.json()).errors).toEqual([]);
  const resources = await page.request.get('/api/resources', { headers });
  const id = (await resources.json()).find(r => r.name === name).id;
  await restoreAdminSession(page);
  await goToPage(page, 'resources');
  const search = page.locator('#resource-search');
  const row = page.locator(`#resource-list tr[data-id="${id}"]`);
  for (const query of ['lvzwss', '华东 lv', 'shejishi lü', 'ＬＶ.search＠example.test', '１３９００１３９００１', '设计 1390013']) {
    await search.fill(query);
    await expect(row).toBeVisible();
    await expect(search).toBeFocused();
  }
  await startComposition(search, '不存在');
  await expect(row).toBeVisible();
  await endComposition(search, '不存在');
  await expect(row).toHaveCount(0);
  await search.fill('');
  await expect(row).toBeVisible();
  // Mobile width keeps the search and result table inside the viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await search.fill('华东 lv');
  expect(await page.locator('.main-content').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/search-resource-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  const archived = await page.request.patch(`/api/resources/${id}/archive`, {
    headers: { Authorization: 'Bearer ' + loadState().token },
  });
  expect(archived.ok()).toBeTruthy();
  await page.reload();
  await page.locator('#resource-tab-archived').click();
  await page.locator('#resource-search').fill('sheji lv');
  await expect(row).toBeVisible();
});

test('项目、客户备注和存档支持跨字段关键词，中文选字不触发过滤', async ({ page }) => {
  const clientName = '上海搜索客户';
  const projectName = '品牌搜索项目';
  const clientId = await createRecord(page, 'clients', { name: clientName, details: '年度合作' });
  await createRecord(page, 'projects', { name: projectName, code: 'CN-2026', client_id: clientId });
  await restoreAdminSession(page);
  await goToPage(page, 'projects');
  const search = page.locator('#pc-search');
  const project = page.locator('.pc-name-text').filter({ hasText: projectName });
  await search.fill('上海 ＣＮ－２０２６ pinpai');
  await expect(project).toBeVisible();
  await startComposition(search, '不存在');
  await expect(project).toBeVisible();
  await endComposition(search, '不存在');
  await expect(project).toHaveCount(0);
  await search.fill('');
  await expect(project).toBeVisible();
  await page.locator('#tab-clients').click();
  await search.fill('niandu 上海');
  await expect(page.locator('.pc-name-text').filter({ hasText: clientName })).toBeVisible();
  const archived = await page.request.patch(`/api/clients/${clientId}/archive`, {
    headers: { Authorization: 'Bearer ' + loadState().token },
  });
  expect(archived.ok()).toBeTruthy();
  await page.reload();
  await page.locator('#tab-archived').click();
  await search.fill('上海 CN-2026');
  await expect(project).toBeVisible();
  await search.fill('上海 年度');
  await expect(page.locator('.pc-name-text').filter({ hasText: clientName })).toBeVisible();
});

test('预订和休假人员搜索包含团队，选字回车不误选，项目可组合客户和编号', async ({ page }) => {
  const id = await createRecord(page, 'resources', { name: '单搜索员', team: '华南搜索组', role: '策划' });
  const otherId = await createRecord(page, 'resources', { name: '无关同组员', team: '华南搜索组', role: '开发' });
  const clientId = await createRecord(page, 'clients', { name: '北京组合客户' });
  const projectId = await createRecord(page, 'projects', { name: '视觉组合项目', client_id: clientId, code: 'BJ-2026' });
  await restoreAdminSession(page);
  await page.locator('#btn-add-booking').click();
  const search = page.locator('#bk-resource-search');
  await search.click();
  const option = page.locator(`#bk-resource-dropdown .ms-option[data-id="${id}"]`);
  await search.fill('huanan shan');
  await expect(option).toBeVisible();
  await expect(page.locator(`#bk-resource-dropdown .ms-option[data-id="${otherId}"]`)).toBeHidden();
  await search.press('ArrowDown');
  await startComposition(search, '错误候选');
  await search.press('Enter');
  await expect(page.locator('#bk-resource-selected .ms-chip')).toHaveCount(0);
  await expect(option).toBeVisible();
  await endComposition(search, '华南 策划');
  await expect(option).toBeVisible();
  await page.locator('#bk-resource-dropdown .ms-team-select-all[data-team="华南搜索组"]').click();
  await expect(page.locator(`#bk-resource-selected .ms-chip[data-id="${id}"]`)).toBeVisible();
  await expect(page.locator(`#bk-resource-selected .ms-chip[data-id="${otherId}"]`)).toHaveCount(0);
  await search.fill('不存在');
  await expect(page.locator('#bk-resource-dropdown .ms-empty')).toBeVisible();
  await search.fill('');
  await expect(option).toBeVisible();
  await expect(page.locator(`#bk-resource-selected .ms-chip[data-id="${id}"]`)).toBeVisible();
  // Clicking the already-focused input must keep the picker open.
  await search.click();
  await expect(option).toBeVisible();
  const projectSearch = page.locator('#bk-project-search');
  await projectSearch.fill('ＢＪ－２０２６ 北京 shijue');
  const projectOption = page.locator(`#bk-project-dropdown .ms-option[data-id="${projectId}"]`);
  await expect(projectOption).toBeVisible();
  await startComposition(projectSearch, '错误候选');
  await expect(projectOption).toBeVisible();
  await endComposition(projectSearch, '视觉 BJ-2026');
  await projectSearch.press('ArrowDown');
  await projectSearch.press('Enter');
  await expect(page.locator('#bk-project')).toHaveValue(String(projectId));
  await expect(projectSearch).toHaveValue('');
  await page.locator('.bk-tab[data-tab="timeoff"]').click();
  const leaveSearch = page.locator('#to-resource-search');
  await leaveSearch.fill('huanan cehua');
  await expect(page.locator(`#to-resource-dropdown .ms-option[data-id="${id}"]`)).toBeVisible();
  await leaveSearch.press('ArrowDown');
  await leaveSearch.press('Enter');
  await expect(page.locator(`#to-resource-selected .ms-chip[data-id="${id}"]`)).toBeVisible();
});

test('拼音库加载失败时中文可用，再次输入能重试并刷新结果', async ({ page }) => {
  const id = await createRecord(page, 'resources', { name: '重试搜索人员', team: '离线搜索组' });
  let allowPinyin = false;
  let requests = 0;
  await page.route('**/vendor/pinyin-pro/**', route => {
    requests++;
    return allowPinyin ? route.continue() : route.abort();
  });
  await restoreAdminSession(page);
  await goToPage(page, 'resources');
  const search = page.locator('#resource-search');
  await search.focus();
  await expect.poll(() => requests).toBeGreaterThan(0);
  await search.fill('重试 离线');
  await expect(page.locator(`#resource-list tr[data-id="${id}"]`)).toBeVisible();
  expect(await page.evaluate(() => !!window.pinyinPro)).toBe(false);
  allowPinyin = true;
  await search.fill('chongshi lixian');
  await expect(page.locator(`#resource-list tr[data-id="${id}"]`)).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!window.pinyinPro)).toBe(true);
});

test('拼音延迟加载后刷新失焦的搜索结果，不重新打开已关闭的选择器', async ({ page }) => {
  const id = await createRecord(page, 'resources', { name: '延迟搜索员' });
  let release;
  const ready = new Promise(resolve => { release = resolve; });
  await page.route('**/vendor/pinyin-pro/**', async route => { await ready; await route.continue(); });
  await restoreAdminSession(page);
  await page.locator('#btn-add-booking').click();
  const search = page.locator('#bk-resource-search');
  await search.fill('yanchi');
  await expect(page.locator('#bk-resource-dropdown .ms-empty')).toBeVisible();
  await page.locator('#modal-title').click();
  await expect(page.locator('#bk-resource-dropdown')).toBeHidden();
  release();
  await expect.poll(() => page.evaluate(() => !!window.pinyinPro)).toBe(true);
  await expect(page.locator('#bk-resource-dropdown')).toBeHidden();
  await search.focus();
  await expect(page.locator(`#bk-resource-dropdown .ms-option[data-id="${id}"]`)).toBeVisible();
});
