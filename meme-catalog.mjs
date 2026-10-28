// Public meme catalog contract. Site is canonical; the MCP copy must stay byte-identical.
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const text = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
const keys = (v, allowed) => Object.keys(v).every((key) => allowed.includes(key));
const id = (v) => text(v, 64) && idPattern.test(v);
const day = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;

function asset(v, name, preview, kind) {
  if (!object(v) || !keys(v, ['path', 'mime', 'bytes', 'sha256', 'width', 'height'])) return false;
  const extensions = preview ? ['png'] : kind === 'video' ? ['mp4'] : ['png', 'jpg'];
  const prefix = preview ? 'img/memes/previews/' : 'img/memes/';
  const extension = extensions.find((ext) => v.path === prefix + name + '.' + ext);
  const mime = { png: 'image/png', jpg: 'image/jpeg', mp4: 'video/mp4' }[extension];
  const max = preview ? 384 * 1024 : 100 * 1024 * 1024;
  return Boolean(extension) && v.mime === mime && Number.isInteger(v.bytes) && v.bytes > 0 && v.bytes <= max
    && typeof v.sha256 === 'string' && /^[0-9a-f]{64}$/.test(v.sha256)
    && [v.width, v.height].every((n) => Number.isInteger(n) && n > 0 && n <= (preview ? 384 : 20000));
}

export function validateMemeCatalog(value) {
  const fail = (message) => { throw new Error('梗图目录不完整：' + message); };
  if (!object(value) || !keys(value, ['schema_version', 'updated_at', 'series', 'items'])
      || value.schema_version !== 1 || !day(value.updated_at)) fail('版本或日期');
  if (!Array.isArray(value.series) || value.series.length > 20 || !Array.isArray(value.items) || value.items.length > 300) fail('系列或条目');
  const series = new Set();
  for (const row of value.series) {
    if (!object(row) || !keys(row, ['id', 'title']) || !id(row.id) || !text(row.title, 80) || series.has(row.id)) fail('重复或错误的系列');
    series.add(row.id);
  }
  const ids = new Set();
  for (const row of value.items) {
    if (!object(row) || !keys(row, ['id', 'title', 'kind', 'at', 'series', 'season', 'meaning', 'alt', 'credit', 'context', 'sources', 'original', 'preview'])
        || !id(row.id) || ids.has(row.id) || !text(row.title, 100) || !['image', 'video'].includes(row.kind) || !day(row.at)) fail('重复或错误的条目');
    if (row.series === null ? row.season !== null : !series.has(row.series) || !Number.isInteger(row.season) || row.season < 1 || row.season > 99) fail('系列与季');
    if (!text(row.meaning, 1600) || !text(row.alt, 500) || !text(row.credit, 200)
        || !['community-joke', 'fiction'].includes(row.context)) fail('梗义、来源署名或事实标签');
    if (!Array.isArray(row.sources) || row.sources.length > 6) fail('背景来源');
    for (const source of row.sources) {
      let url;
      try { url = new URL(source?.url); } catch { fail('背景链接'); }
      if (!object(source) || !keys(source, ['name', 'url']) || !text(source.name, 100) || !text(source.url, 1500)
          || url.protocol !== 'https:' || url.username || url.password) fail('背景链接');
    }
    if (!asset(row.original, row.id, false, row.kind) || !asset(row.preview, row.id, true, row.kind)) fail('图片或视频文件');
    ids.add(row.id);
  }
  return value;
}
