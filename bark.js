(function () {
  "use strict";
  var toggle = document.getElementById("barkToggle"), list = document.getElementById("barkItems");
  var status = document.getElementById("barkStatus"), retry = document.getElementById("barkRetry");
  if (!toggle || !list || !status || !retry) return;
  var opened = false, cached = null, controller = null, sequence = 0;

  function text(tag, className, value) {
    var node = document.createElement(tag); if (className) node.className = className;
    if (value != null) node.textContent = value; return node;
  }
  function https(url) { try { return new URL(url).protocol === "https:"; } catch (_) { return false; } }
  function valid(data) {
    if (!data || data.schema_version !== 1 || !Array.isArray(data.items) || data.items.length < 3 || data.items.length > 100) return false;
    var ids = new Set();
    return data.items.every(function (item) {
      if (!item || typeof item.id !== "string" || !/^bark-[a-z0-9-]+$/.test(item.id) || ids.has(item.id)) return false;
      ids.add(item.id);
      return ["title", "speaker", "at", "paraphrase", "comment"].every(function (key) { return typeof item[key] === "string" && item[key].trim() && item[key].length <= 500; })
        && /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}\+08:00)?$/.test(item.at)
        && typeof item.quote === "string" && item.quote.length <= 400
        && ["original", "reported"].includes(item.quote_basis)
        && Array.isArray(item.sources) && item.sources.length > 0 && item.sources.length <= 6
        && item.sources.every(function (source) { return source && typeof source.name === "string" && source.name.trim() && typeof source.url === "string" && https(source.url); });
    });
  }
  function render(data) {
    list.replaceChildren();
    data.items.forEach(function (item) {
      var article = text("article", "bark-card"); article.id = item.id;
      article.appendChild(text("h3", null, item.title));
      var by = text("p", "bark-by", item.speaker + " · ");
      var time = text("time", null, item.at.slice(0, 10)); time.dateTime = item.at; by.appendChild(time); article.appendChild(by);
      if (item.quote) {
        article.appendChild(text("span", "bark-kind", item.quote_basis === "reported" ? "原话短摘 · 据报道引述" : "原话短摘"));
        article.appendChild(text("blockquote", null, item.quote));
      }
      article.appendChild(text("span", "bark-kind", "准确转述"));
      article.appendChild(text("p", "bark-paraphrase", item.paraphrase));
      article.appendChild(text("span", "bark-kind", "我们的话"));
      article.appendChild(text("p", "bark-comment", item.comment));
      var sources = text("p", "bark-sources");
      item.sources.forEach(function (source) {
        var a = text("a", null, source.name); a.href = source.url; a.target = "_blank"; a.rel = "noopener noreferrer"; sources.appendChild(a);
      });
      article.appendChild(sources); list.appendChild(article);
    });
    status.textContent = "另册收了 " + data.items.length + " 条树皮，不混入年轮硬节点，也不随年轮筛选。";
    status.hidden = false; retry.hidden = true;
  }
  async function load() {
    if (controller) controller.abort();
    var seq = ++sequence, abort = new AbortController(); controller = abort;
    var timer = setTimeout(function () { abort.abort(); }, 10000);
    status.textContent = "正在读这册树皮…"; status.hidden = false; retry.hidden = true;
    try {
      var response = await fetch("data/bark.json", { cache: "no-store", signal: abort.signal });
      if (!response.ok) throw new Error("bark response");
      var data = await response.json();
      if (!valid(data)) throw new Error("bark data");
      if (!opened || sequence !== seq) return;
      cached = data; render(data);
    } catch (_) {
      if (!opened || sequence !== seq) return;
      list.replaceChildren(); status.textContent = "这次暂时读不到树皮，可重新读取；年轮仍能照常查看。"; retry.hidden = false;
    } finally {
      clearTimeout(timer); if (sequence === seq) controller = null;
    }
  }
  toggle.addEventListener("click", function () {
    opened = !opened; toggle.setAttribute("aria-expanded", opened ? "true" : "false"); toggle.textContent = opened ? "树皮：开" : "树皮：关";
    document.getElementById("bark").classList.toggle("is-open", opened);
    list.hidden = !opened;
    if (!opened) {
      ++sequence; if (controller) controller.abort(); controller = null;
      list.replaceChildren(); status.hidden = true; retry.hidden = true;
    } else if (cached) render(cached); else load();
  });
  retry.addEventListener("click", function () { if (opened) load(); });
})();
