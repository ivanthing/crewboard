/* ============================================================
   name-search.js — shared Chinese name search helpers
   Supports Chinese text, pinyin, initials, mixed input and keywords
   across fields. Loaded before the page modules.
   pinyin-pro (~145 KB gzipped) is loaded on demand: when a search
   field gains focus, or on the first non-empty query. Until it
   arrives, matching falls back to plain text.
   ============================================================ */
(function (root) {
  'use strict';

  var cache = new Map();
  var MAX_INDEXES = 2000;
  var pinyinApi = root.pinyinPro || null;
  var SEARCH_INPUT = 'input[type="search"], input[id$="-search"], input.ms-search';
  var script = document.currentScript;
  var pinyinSrc = (script && script.getAttribute('data-pinyin-src')) || '/vendor/pinyin-pro/pinyin-pro.min.js';
  var loading = null;

  function ensurePinyin() {
    if (pinyinApi || loading) return;
    loading = document.createElement('script');
    loading.src = pinyinSrc;
    loading.async = true;
    loading.onload = function () {
      pinyinApi = root.pinyinPro || null;
      loading = null;
      if (!pinyinApi) return;
      // Indexes built before the library arrived have no pinyin.
      cache.clear();
      // Refresh pending searches even if the user has moved focus meanwhile.
      document.querySelectorAll(SEARCH_INPUT).forEach(function (input) {
        if (input.value && !input._crewComposing) input.dispatchEvent(new Event('input', { bubbles: true }));
      });
    };
    loading.onerror = function () { loading.remove(); loading = null; };
    document.head.appendChild(loading);
  }

  document.addEventListener('focusin', function (event) {
    if (event.target && event.target.matches && event.target.matches(SEARCH_INPUT)) ensurePinyin();
  });
  document.addEventListener('compositionstart', function (event) { event.target._crewComposing = true; });
  document.addEventListener('compositionend', function (event) { event.target._crewComposing = false; }, true);

  function normalize(value) {
    // Values come from API records or textContent, not HTML markup.
    return String(value == null ? '' : value)
      .normalize('NFKC')
      .toLowerCase()
      .replace(/[\s\u00a0]+/g, ' ')
      .trim();
  }

  function compact(value) {
    return normalize(value).replace(/\s+/g, '');
  }

  function pinyinWords(value) {
    var text = normalize(value);
    if (!text || !pinyinApi || typeof pinyinApi.pinyin !== 'function') return [];
    try {
      return pinyinApi.pinyin(text, {
        toneType: 'none',
        type: 'array',
        surname: 'head',
        nonZh: 'consecutive'
      }).map(normalize).filter(Boolean);
    } catch (err) {
      return [];
    }
  }

  function buildIndex(value) {
    var text = normalize(value);
    if (!text) return { text: '', compact: '', pinyin: '', initials: '', initialWords: '' };
    var words = pinyinWords(text);
    return {
      text: text,
      compact: compact(text),
      pinyinText: compact(text).replace(/[\p{P}\p{S}]/gu, ''),
      pinyin: words.join(''),
      initials: words.map(function (word) { return word.charAt(0); }).join(''),
      initialWords: words.map(function (word) {
        return word.replace(/[^a-z0-9]/g, '').charAt(0);
      }).join('')
    };
  }

  function getIndex(value) {
    var text = normalize(value);
    if (!cache.has(text)) {
      if (cache.size >= MAX_INDEXES) cache.delete(cache.keys().next().value);
      cache.set(text, buildIndex(text));
    }
    return cache.get(text);
  }

  function normalizePinyin(value) {
    return value.replace(/u:|[üǖǘǚǜ]/g, 'v')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/['’]/g, '');
  }

  /** Text substrings; contiguous pinyin syllable prefixes, initials and mixed input. */
  function matchesName(value, query) {
    var q = normalize(query);
    if (!q) return true;
    ensurePinyin();
    var target = getIndex(value);
    if (!target.text) return false;
    if (target.text.indexOf(q) >= 0) return true;

    var qCompact = q.replace(/\s+/g, '');
    if (!qCompact) return true;
    if (target.compact.indexOf(qCompact) >= 0) return true;
    // Space-separated terms may appear in any order, just like list searches.
    if (q.indexOf(' ') >= 0) {
      return q.split(' ').every(function (term) { return matchesName(value, term); });
    }
    if (!pinyinApi || typeof pinyinApi.match !== 'function') return false;
    var pyQuery = normalizePinyin(q);
    if (!/[a-z]/.test(pyQuery) || /[^a-z\u3400-\u9fff]/.test(pyQuery)) return false;
    // Do not match the middle of a syllable ("ha" in "zhang") or skip
    // characters ("zs" in 张小三). match() also handles polyphonic names.
    return !!pinyinApi.match(target.pinyinText, pyQuery, {
      precision: 'start',
      lastPrecision: 'start',
      continuous: true,
      space: 'ignore',
      insensitive: true,
      v: true
    });
  }

  /** Match text across one or more fields, keeping the same pinyin rules. */
  function matchesText(query, values) {
    var q = normalize(query);
    if (!q) return true;
    var list = Array.isArray(values) ? values : [values];
    return q.split(' ').every(function (term) {
      return list.some(function (value) { return matchesName(value, term); });
    });
  }

  /** Rebinding is safe for the personnel search input retained across renders. */
  function bindInput(input, onQuery) {
    if (input._crewSearchCleanup) input._crewSearchCleanup();
    // Management search gets the browser's clear affordance; comboboxes keep
    // their text-input semantics and existing Escape-to-close behavior.
    if (input.type === 'text' && !input.classList.contains('ms-search')) input.type = 'search';
    input.setAttribute && input.setAttribute('autocomplete', 'off');
    input.setAttribute && input.setAttribute('spellcheck', 'false');
    input.setAttribute && input.setAttribute('enterkeyhint', 'search');
    if (input.setAttribute && typeof root.t === 'function') input.setAttribute('title', root.t('common.search_hint'));
    function update(event) {
      if (!event.isComposing && !input._crewComposing) onQuery(input.value);
    }
    function start() { input._crewComposing = true; }
    function end() { input._crewComposing = false; onQuery(input.value); }
    input.addEventListener('input', update);
    input.addEventListener('compositionstart', start);
    input.addEventListener('compositionend', end);
    input._crewSearchCleanup = function () {
      input.removeEventListener('input', update);
      input.removeEventListener('compositionstart', start);
      input.removeEventListener('compositionend', end);
    };
  }

  function pinyinLabel(value) {
    var words = pinyinWords(value);
    return words.length ? words.join(' ') : '';
  }

  root.CrewNameSearch = {
    normalize: normalize,
    compact: compact,
    pinyinWords: pinyinWords,
    buildIndex: buildIndex,
    matchesName: matchesName,
    matchesText: matchesText,
    bindInput: bindInput,
    pinyinLabel: pinyinLabel
  };
})(window);
