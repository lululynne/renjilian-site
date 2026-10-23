/* Shared mechanical lookup. No network, identity, storage, or semantic inference. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RJ_AINOTES_SEARCH = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var PUNCT = /[\s\-_.·•・\/\\|,，。、:：;；!！?？'"‘’“”`()（）\[\]【】{}「」『』<>《》+&]+/g;
  function norm(s) { return String(s == null ? '' : s).normalize('NFKC').toLowerCase().replace(/\s+/g, ' ').trim(); }
  function compact(s) { return norm(s).replace(PUNCT, ''); }
  var COLL = (function () { try { if (Intl.Collator.supportedLocalesOf(['zh-CN']).length) return new Intl.Collator('zh-CN', { sensitivity: 'base', numeric: true }); } catch (_) {} return null; })();
  var PY_L = 'ABCDEFGHJKLMNOPQRSTWXYZ', PY_B = '阿八嚓哒妸发旮哈讥咔垃痳拏噢妑七呥扨它穵夕丫帀';
  function letterOf(zh) {
    var c = norm(zh).charAt(0);
    if (/[a-z]/.test(c)) return c.toUpperCase();
    if (COLL && /[一-鿿]/.test(c)) for (var i = PY_B.length - 1; i >= 0; i--) if (COLL.compare(c, PY_B[i]) >= 0) return PY_L[i];
    return '#';
  }
  function baseCompare(a, b) {
    if (a._letter !== b._letter) { if (a._letter === '#') return 1; if (b._letter === '#') return -1; return a._letter < b._letter ? -1 : 1; }
    var c = COLL ? COLL.compare(a.zh, b.zh) : (norm(a.zh) < norm(b.zh) ? -1 : norm(a.zh) > norm(b.zh) ? 1 : 0);
    return c || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  var TAG_GROUPS = [
    ['类型', ['概念', '公司', '产品', '模型', '人物', '事件', '智能体', '基准', '数据集']],
    ['话题', ['计费', '编程', '设计', '写作与办公', '建站', '生图', '语音', '记忆', '陪伴', '人机恋相关', '图像生成', '芯片', '算力', '购物', '生命科学', '具身智能', '研发']],
    ['形态', ['终端', '桌面', '网页', '插件', '云端', '开源', '开放权重', '机器人', '可穿戴设备']],
    ['地区', ['国产', '国内可用']],
    ['厂商', ['OpenAI', 'Anthropic', 'Google', '亚马逊', '微软', 'AMD', 'Black Forest Labs', 'SemiAnalysis', '上海人工智能实验室']]
  ];
  // Definitions/aliases inherit the 2026-09-30 input standard; later UI tags are explicit additions.
  var TAG_INFO = {
    '概念': ['一个通用的术语', ['术语', '名词']], '公司': ['一家公司或组织', ['厂商', '机构']],
    '产品': ['一个软件、平台或服务', ['软件', '平台', '工具', 'App']], '模型': ['某个具体的AI模型', ['大模型', 'LLM']],
    '人物': ['一个公开人物', ['人']], '事件': ['发布会、政策变动这类有日期的事', ['发布', '公告']],
    '计费': ['价格、额度、订阅、点数', ['价格', '额度', '订阅', '套餐']], '编程': ['写代码相关', ['开发', '代码', '程序员']],
    '设计': ['设计相关', ['美术', '视觉', '平面', 'UI', '海报', '设计工具', '设计师']],
    '写作与办公': ['写字、笔记、文档、表格', ['办公', '笔记', '文档']], '建站': ['做网站、做App', ['网站', '网页', 'App 开发']],
    '生图': ['生成图片、视频', ['画图', 'AI 绘画', '视频生成']], '语音': ['听和说', ['TTS', '转写']],
    '记忆': ['AI的记忆与检索', ['长期记忆', '向量']], '终端': ['命令行、黑窗口', ['命令行', 'CLI']],
    '桌面': ['装在电脑上的软件', ['客户端', '桌面 App']], '网页': ['浏览器里用', ['网页版', '在线']],
    '插件': ['装在别的软件里', ['扩展', 'Extension']], '云端': ['在别人机房里跑', ['云', '托管']],
    '开源': ['源代码公开', ['开放源码']], '陪伴': ['AI伴侣、陪聊', ['伴侣', '陪聊', 'AI 女友', 'AI 男友']],
    '人机恋相关': ['对人机恋读者有直接影响', ['机友', '机机']], '国产': ['中国公司做的', ['国内厂商']],
    '国内可用': ['在中国大陆不翻墙能直接用', ['大陆可用']],
    'OpenAI': ['跟OpenAI相关', ['ChatGPT', 'GPT']], 'Anthropic': ['跟Anthropic相关', ['Claude']], 'Google': ['跟谷歌相关', ['Gemini']],
    '智能体': ['智能体与任务执行系统', ['agent']], '基准': ['评测方法与基准测试', ['benchmark']], '数据集': ['用于训练、评测或研究的数据集合', ['dataset']],
    '图像生成': ['图像生成相关', []], '芯片': ['计算芯片与加速器', []], '算力': ['计算资源与计算能力', []], '购物': ['购物相关工具与能力', []],
    '生命科学': ['生命科学相关应用与研究', []], '具身智能': ['与实体环境交互的智能系统', []], '研发': ['研究与开发相关', []],
    '开放权重': ['公开模型权重，许可条件见各条目', []], '机器人': ['机器人相关设备或技术', []], '可穿戴设备': ['可穿戴的计算或交互设备', []],
    '亚马逊': ['跟亚马逊相关', ['Amazon']], '微软': ['跟微软相关', ['Microsoft']], 'AMD': ['跟AMD相关', []],
    'Black Forest Labs': ['跟Black Forest Labs相关', []], 'SemiAnalysis': ['跟SemiAnalysis相关', []], '上海人工智能实验室': ['跟上海人工智能实验室相关', []]
  };
  function pair(t) { return { n: norm(t), c: compact(t) }; }
  function prepEntry(e, searchText) {
    e._nm = [pair(e.zh), pair(e.en || '')];
    e._al = (e.aliases || []).map(function (a) { return Object.assign({ raw: a }, pair(a)); });
    e._tx = [e.brief || '', e.line || ''].concat(searchText ? searchText(e) : []).map(pair);
    e._names = e._nm.concat(e._al); e._letter = letterOf(e.zh); return e;
  }
  function hit(p, t) { return p.n.indexOf(t.n) !== -1 || (t.c.length >= 2 && p.c.indexOf(t.c) !== -1); }
  function termsOf(q) { return norm(q).split(' ').filter(Boolean).map(pair); }
  function everyTerm(pairs, terms) { return terms.every(function (t) { return pairs.some(function (p) { return hit(p, t); }); }); }
  function rankOf(e, terms, W) {
    var names = e._names, i;
    for (i = 0; i < names.length; i++) if (names[i].n === W.n || (W.c && names[i].c === W.c)) return 0;
    for (i = 0; i < names.length; i++) if (names[i].n.indexOf(W.n) === 0 || (W.c && names[i].c.indexOf(W.c) === 0)) return 1;
    return everyTerm(names, terms) ? 2 : 3;
  }
  function difficultyGroups(e) {
    var prose = typeof e.difficulty === 'string' ? e.difficulty.trim() : '';
    if (!prose) return [];
    if (/普通(?:人|用户|消费者)(?:能上手|可(?:上手|用|从))|网页试用较易/.test(prose)) return /本地.*配置/.test(prose) ? ['普通人能上手', '需要配置'] : ['普通人能上手'];
    if (/^(?:机器人研发)?专业/.test(prose)) return ['专业使用'];
    if (/配置|开发者工具/.test(prose)) return ['需要配置'];
    return ['待核'];
  }
  return { norm: norm, compact: compact, letterOf: letterOf, baseCompare: baseCompare, TAG_GROUPS: TAG_GROUPS, TAG_INFO: TAG_INFO, difficultyGroups: difficultyGroups,
    prepEntry: prepEntry, hit: hit, termsOf: termsOf, everyTerm: everyTerm, rankOf: rankOf };
});
