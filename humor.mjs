import { validateMemeCatalog } from './meme-catalog.mjs';

const byId = (id) => document.getElementById(id);
const publicBase = 'https://renji.love/';
const make = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const action = (text, onClick) => {
  const button = make('button', text, 'humor-action'); button.type = 'button';
  button.addEventListener('click', onClick); return button;
};
const download = (row) => {
  const link = make('a', row.kind === 'video' ? '下载原视频' : '下载原图', 'humor-action');
  link.href = row.original.path; link.download = row.original.path.split('/').at(-1); return link;
};
const web = (row) => publicBase + 'humor.html#' + row.id;
const nav = document.querySelector('nav.boards');
const navHint = () => { byId('navHint').hidden = nav.scrollWidth <= nav.clientWidth; };
window.addEventListener('resize', navHint); navHint();
nav.addEventListener('focusin', (event) => {
  const link = event.target.closest('a');
  if (!link) return;
  const box = link.getBoundingClientRect(), frame = nav.getBoundingClientRect();
  if (box.left < frame.left + 16) nav.scrollLeft += box.left - frame.left - 16;
  else if (box.right > frame.right - 16) nav.scrollLeft += box.right - frame.right + 16;
});
async function json(path) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(path, { credentials: 'omit', cache: 'no-cache', signal: controller.signal });
    if (!response.ok) throw new Error('HTTP ' + response.status);
    return await response.json();
  } finally { clearTimeout(timer); }
}

let catalog, currentSeries = '', currentSeason = '', currentKind = '';
const dialog = byId('imageDialog');
function openImage(row) {
  byId('dialogTitle').textContent = row.title;
  const media = make('img'); media.src = row.original.path; media.alt = row.alt;
  media.width = row.original.width; media.height = row.original.height;
  const container = byId('dialogMedia');
  container.replaceChildren(media);
  media.addEventListener('error', () => {
    if (container.firstElementChild !== media) return;
    container.replaceChildren(make('p', '原图暂时未载入。可以关闭后重试，或使用下方下载链接。'));
  }, { once: true });
  byId('dialogMeaning').textContent = row.meaning;
  const link = byId('dialogDownload'); link.href = row.original.path; link.download = row.original.path.split('/').at(-1);
  dialog.showModal();
}
byId('dialogClose').addEventListener('click', () => dialog.close());
dialog.addEventListener('close', () => byId('dialogMedia').replaceChildren());

async function copyImage(row, status) {
  if (!navigator.clipboard?.write || typeof ClipboardItem !== 'function') {
    status.textContent = '当前浏览器不能复制图片。请下载原图，或打开大图后长按保存。'; return;
  }
  status.textContent = '正在复制PNG预览。';
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {
    const image = fetch(row.preview.path, { credentials: 'omit', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error('Image unavailable');
      const blob = await response.blob();
      if (blob.type !== 'image/png' || blob.size !== row.preview.bytes) throw new Error('Image incomplete');
      const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
      const hash = [...digest].map((v) => v.toString(16).padStart(2, '0')).join('');
      if (hash !== row.preview.sha256) throw new Error('Image changed');
      return blob;
    });
    void image.catch(() => {}); // Permission may fail before ClipboardItem consumes the fetch.
    // Hand the Promise to ClipboardItem during the click gesture (including Safari).
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': image })]);
    status.textContent = '已复制PNG预览。需要完整尺寸时请下载原图。';
  } catch { status.textContent = '图片没有复制成功。请下载原图，或打开大图后长按保存。'; }
  finally { clearTimeout(timer); controller.abort(); }
}
function manualMeaning(row, status, message) {
  const link = make('a', '这张图的链接'); link.href = '#' + row.id;
  status.replaceChildren(make('span', message + ' 可选择梗义文字复制，或长按'), link, make('span', '复制链接。'));
}
async function copyMeaning(row, status) {
  if (!navigator.clipboard?.writeText) { manualMeaning(row, status, '当前浏览器不能自动复制。'); return; }
  try { await navigator.clipboard.writeText(row.title + '\n' + row.meaning + '\n' + web(row)); status.textContent = '已复制梗义和这张图的链接。'; }
  catch { manualMeaning(row, status, '文字没有复制成功。'); }
}
function card(row) {
  const article = make('article', undefined, 'humor-card'); article.id = row.id; article.tabIndex = -1;
  let media;
  const error = make('div', undefined, 'humor-image-error'); error.hidden = true;
  if (row.kind === 'video') {
    media = make('video'); media.controls = true; media.preload = 'metadata'; media.playsInline = true;
    media.src = row.original.path; media.poster = row.preview.path; media.setAttribute('aria-label', row.alt);
    article.append(media);
  } else {
    const open = make('button', undefined, 'humor-media-open'); open.type = 'button';
    open.setAttribute('aria-label', '放大原图：' + row.alt);
    media = make('img'); media.src = row.preview.path; media.alt = ''; media.loading = 'lazy';
    media.srcset = row.preview.path + ' ' + row.preview.width + 'w, ' + row.original.path + ' ' + row.original.width + 'w';
    media.sizes = '(max-width:760px) calc(100vw - 32px), (max-width:1180px) calc((100vw - 88px)/2), 546px';
    media.width = row.original.width; media.height = row.original.height;
    open.append(media); open.addEventListener('click', () => openImage(row)); article.append(open);
  }
  error.append(make('p', row.kind === 'video' ? '视频暂时未载入。梗义和原片下载仍在下面。' : '图片暂时未载入。梗义和原图下载仍在下面。'));
  error.append(action('重试载入', () => {
    error.hidden = true; media.hidden = false;
    if (row.kind === 'image') media.parentElement.hidden = false;
    if (row.kind === 'image') media.removeAttribute('srcset');
    media.src = row.original.path + '?retry=' + Date.now();
    if (row.kind === 'video') media.load();
  }));
  media.addEventListener('error', () => { error.hidden = false; media.hidden = true; if (row.kind === 'image') media.parentElement.hidden = true; });
  article.append(error);
  article.append(make('h4', row.title));
  article.append(make('p', row.context === 'fiction' ? 'AI生成 · 虚构场景' : '社区玩笑', 'humor-context'));
  article.append(make('p', row.meaning));
  article.append(make('p', row.credit + '；收录于 ' + row.at, 'humor-meta'));
  if (row.sources.length) {
    const sources = make('div', undefined, 'humor-source-links');
    for (const source of row.sources) { const link = make('a', source.name); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link); }
    article.append(sources);
  }
  const status = make('p', '', 'humor-card-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
  const actions = make('div', undefined, 'humor-actions');
  actions.append(download(row), action('复制预览图', () => copyImage(row, status)), action('复制梗义和链接', () => copyMeaning(row, status)));
  article.append(actions, status); return article;
}
function updateQuery() {
  const url = new URL(location.href); url.search = ''; url.hash = '';
  if (currentSeries) url.searchParams.set('series', currentSeries);
  if (currentSeason) url.searchParams.set('season', currentSeason);
  if (currentKind) url.searchParams.set('kind', currentKind);
  history.replaceState(null, '', url);
}
function render() {
  const rows = catalog.items.filter((row) => (!currentSeries || row.series === currentSeries)
    && (!currentSeason || String(row.season) === currentSeason) && (!currentKind || row.kind === currentKind));
  byId('memeGrid').replaceChildren(...rows.map(card));
  byId('memeStatus').textContent = rows.length ? '共 ' + rows.length + ' 条，点图可放大。' : '这个范围还没有收录。选择“全部梗图”可回到现有内容。';
  for (const button of byId('seriesFilters').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.series === currentSeries));
  const series = catalog.series.find((row) => row.id === currentSeries);
  byId('galleryTitle').textContent = series?.title || '看图，也把梗带走';
  byId('seriesCaption').textContent = series ? '关于新功能、验证与账号的社区玩笑。季按收录组织，素材保留各自日期。' : '点开看原图，下面有梗义和来源。';
  byId('seasonLabel').hidden = !series;
  byId('catalogDate').textContent = '目录核对：' + catalog.updated_at + '。新素材核对后补入，旧素材保留原始收录日期。';
}
function seasons() {
  const values = [...new Set(catalog.items.filter((row) => row.series === currentSeries).map((row) => row.season))].sort((a, b) => a - b);
  const select = byId('seasonFilter'); select.replaceChildren(new Option('全部季', ''));
  for (const value of values) select.add(new Option('第' + value + '季', String(value)));
  if (!values.map(String).includes(currentSeason)) currentSeason = '';
  select.value = currentSeason;
}
function chooseSeries(value) {
  if (!catalog) return;
  currentSeries = value; currentSeason = '';
  if (!value) { currentKind = ''; byId('kindFilter').value = ''; }
  seasons(); updateQuery(); render();
}
byId('seriesFilters').querySelector('button').addEventListener('click', () => chooseSeries(''));
byId('seasonFilter').addEventListener('change', (event) => { if (!catalog) return; currentSeason = event.target.value; updateQuery(); render(); });
byId('kindFilter').addEventListener('change', (event) => { if (!catalog) return; currentKind = event.target.value; updateQuery(); render(); });
function disableFilters(disabled) { for (const field of document.querySelectorAll('#seriesFilters button,.humor-selects select')) field.disabled = disabled; }
function revealHash() {
  if (!catalog || !location.hash) return;
  let id; try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  if (!catalog.items.some((row) => row.id === id)) return;
  if (!byId(id)) { currentSeries = ''; currentSeason = ''; currentKind = ''; byId('kindFilter').value = ''; seasons(); render(); }
  requestAnimationFrame(() => { const target = byId(id); target.scrollIntoView({ block: 'start' }); target.focus({ preventScroll: true }); });
}
window.addEventListener('hashchange', revealHash);
async function loadMemes() {
  byId('memeRetry').hidden = true; byId('memeStatus').textContent = '正在打开梗图。';
  disableFilters(true);
  try {
    catalog = validateMemeCatalog(await json('data/memes.json'));
    byId('seriesFilters').querySelectorAll('button[data-dynamic]').forEach((button) => button.remove());
    for (const row of catalog.series) { const button = action(row.title, () => chooseSeries(row.id)); button.dataset.series = row.id; button.dataset.dynamic = 'true'; button.setAttribute('aria-pressed', 'false'); byId('seriesFilters').append(button); }
    const query = new URLSearchParams(location.search);
    currentSeries = catalog.series.some((row) => row.id === query.get('series')) ? query.get('series') : '';
    currentSeason = query.get('season') || ''; currentKind = ['image', 'video'].includes(query.get('kind')) ? query.get('kind') : '';
    byId('kindFilter').value = currentKind; seasons(); render(); disableFilters(false); revealHash();
  } catch {
    catalog = null; byId('memeGrid').replaceChildren(); byId('catalogDate').textContent = '';
    byId('memeStatus').textContent = '梗图目录暂时没有读到。可以重新读取，或稍后再来。'; byId('memeRetry').hidden = false;
  }
}
byId('memeRetry').addEventListener('click', loadMemes);

const reduced = matchMedia('(prefers-reduced-motion: reduce)'); let paused = reduced.matches;
function motion() {
  byId('ledTrack').classList.toggle('is-paused', paused || reduced.matches);
  byId('ledPause').textContent = reduced.matches ? '已静止显示' : paused ? '开始滚动' : '暂停滚动';
  byId('ledPause').disabled = reduced.matches;
}
byId('ledPause').addEventListener('click', () => { paused = !paused; motion(); });
reduced.addEventListener('change', motion);
async function loadLed() {
  byId('ledRetry').hidden = true;
  try {
    const data = await json('data/bark.json');
    if (data.schema_version !== 1 || !Array.isArray(data.items) || !data.items.length || data.items.length > 100) throw new Error('Incomplete archive');
    const valid = data.items.every((row) => ['title', 'speaker', 'at', 'paraphrase', 'comment'].every((key) => typeof row[key] === 'string' && row[key].length <= 1000)
      && Array.isArray(row.sources) && row.sources.every((s) => typeof s.name === 'string' && typeof s.url === 'string' && /^https:\/\//.test(s.url)));
    if (!valid) throw new Error('Incomplete archive');
    const records = [], strip = make('div'); let letters = 0;
    for (const row of data.items) {
      const words = typeof row.quote === 'string' && row.quote ? row.quote : row.paraphrase;
      const excerpt = words.length > 160 ? words.slice(0, 160) + '…' : words;
      const line = row.speaker + (row.quote_basis === 'reported' ? '（报道所引）：' : '：') + excerpt;
      strip.append(make('span', line, 'humor-led-line')); letters += line.length;
      const li = make('li'); li.append(make('h4', row.title), make('p', row.speaker + '，' + row.at), make('p', row.paraphrase), make('p', '本站的玩笑：' + row.comment));
      if (row.quote) { const quote = make('blockquote', row.quote); quote.prepend(make('span', row.quote_basis === 'original' ? '原话：' : '报道所引：')); li.append(quote); }
      const sources = make('div', undefined, 'humor-source-links');
      for (const source of row.sources) { const link = make('a', source.name); link.href = source.url; link.target = '_blank'; link.rel = 'noopener noreferrer'; sources.append(link); }
      li.append(sources); records.push(li);
    }
    byId('ledRecords').replaceChildren(...records);
    byId('ledTrack').replaceChildren(strip, strip.cloneNode(true));
    byId('ledTrack').style.animationDuration = Math.max(60, Math.ceil(letters / 3)) + 's';
    byId('ledStatus').hidden = true; byId('ledViewport').hidden = false; byId('ledArchive').hidden = false; byId('ledPause').hidden = false; motion();
  } catch {
    byId('ledStatus').hidden = false; byId('ledStatus').textContent = '怪话暂时没有读到；梗图仍可继续看。'; byId('ledRetry').hidden = false;
    byId('ledViewport').hidden = true; byId('ledArchive').hidden = true; byId('ledPause').hidden = true;
  }
}
byId('ledRetry').addEventListener('click', loadLed);
loadMemes(); loadLed();
