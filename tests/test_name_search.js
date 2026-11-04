const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const pinyinPro = require('pinyin-pro');

function loadSearch(withPinyin = true) {
  const window = withPinyin ? { pinyinPro } : {};
  const document = {
    currentScript: null,
    addEventListener() {},
    createElement() { return {}; },
    querySelectorAll() { return []; },
    head: { appendChild() {} },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/js/name-search.js'), 'utf8'), { window, document, Event });
  return window.CrewNameSearch;
}

const search = loadSearch();
const cases = [
  ['张三', '张', true], ['张三', '三', true], ['张三', '李', false],
  ['张三', '  ＺＨＡＮＧＳＡＮ　', true], ['张三', 'zs', true],
  ['张三', 'zhangs', true], ['张三', 'zsan', true], ['张三', '张san', true],
  ['张三', 'zhang三', true], ['张三', 'ha', false], ['张三', 'an', false],
  ['张小三', 'zs', false], ['世看', 'shi k', true], ['世看', 's a', false],
  ['吕小明', 'lvxm', true], ['吕小明', 'lü xiao', true],
  ['吕小明', 'lǚxiǎomíng', true], ['吕小明', 'lu:xm', true],
  ['单田芳', 'shantf', true], ['单田芳', 'dantf', true],
  ['重庆项目', 'chongqing', true], ['重庆项目', 'cqxm', true],
  ['欧阳娜娜', 'oynn', true], ['西安项目', "xi'an", true],
  ['西安项目', 'xi’an', true], ['设计项目', ' sheji ', true],
  ['ABC-2026', 'ａｂｃ－２０２６', true], ['王 小明', '王小明', true],
  ['品牌·策划', 'ppch', true], ['设计（上海）', 'sjsh', true],
  ['张-小三', 'zs', false],
  [null, '张', false], [0, '0', true], ['张三', '　', true],
];
for (const [value, query, expected] of cases) {
  assert.equal(search.matchesName(value, query), expected, `${value} / ${query}`);
}

for (const [query, fields, expected] of [
  ['设计 张三', ['张三', '品牌设计'], true],
  ['sheji zs', ['张三', '品牌设计'], true],
  ['张三 bucunzaide', ['张三', '品牌设计'], false],
  ['ＡＢＣ－２０２６　上海', ['上海客户', 'ABC-2026', '设计项目'], true],
  ['张 san', ['张', '三'], true],
  ['zhangsan', ['张', '三'], false],
  ['user+tag@example.com', ['User+Tag@Example.com'], true],
  ['amp', ['A & B'], false],
  ['  ', [null, undefined], true],
]) {
  assert.equal(search.matchesText(query, fields), expected, `${JSON.stringify(fields)} / ${query}`);
}

// Text matching must remain usable when the lazy pinyin script is unavailable.
const plain = loadSearch(false);
assert.equal(plain.matchesText('张三 设计', ['张三', '品牌设计']), true);
assert.equal(plain.matchesName('ＡＢＣ', 'abc'), true);
assert.equal(plain.matchesName('张三', 'zs'), false);

// Every input uses the same IME lifecycle, including engines that omit the final input event.
const input = new EventTarget();
input.value = '';
let queries = [];
search.bindInput(input, value => queries.push(value));
input.dispatchEvent(new Event('compositionstart'));
input.value = 'zhang';
input.dispatchEvent(new Event('input'));
assert.deepEqual(queries, []);
input.value = '张';
input.dispatchEvent(new Event('compositionend'));
assert.deepEqual(queries, ['张']);
input.value = '';
input.dispatchEvent(new Event('input'));
assert.deepEqual(queries, ['张', '']);
// Rebinding a retained DOM input replaces the old listener rather than duplicating it.
search.bindInput(input, value => queries.push('new:' + value));
input.value = '三';
input.dispatchEvent(new Event('input'));
assert.deepEqual(queries, ['张', '', 'new:三']);

console.log(`Chinese search: ${cases.length} name cases, cross-field, fallback and IME checks passed.`);
