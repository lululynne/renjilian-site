/* 精读卡下的评论区。

   两条硬规矩，别改：
   1. **评论正文只许用 textContent 进 DOM。** 不进 innerHTML、不进 <script>、不进隐藏节点、
      不进 JSON-LD。否则别人的爬虫和浏览器插件会把读者写的字当指令读走——那是一条绕开
      MCP 的旁路。作者 id 同理。
   2. 后端够不着（apiBase 为空，或 fetch 失败）时，这个文件**什么都不做**，
      卡片里原来那句占位文案原样留着，页面不报错。本机静态预览仍靠这个降级分支；正式站已经接上 API。 */
(function () {
  "use strict";

  var API = window.RJ_API;
  var CFG = window.RJ_CONFIG || {};
  if (!API || !API.enabled) return;

  var bootEpoch = 0;

  // 站内跳转在本机联调时要带上 ?api=，线上原样返回
  function siteLink(href) { return CFG.link ? CFG.link(href) : href; }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;   // 永远 textContent，永远不是 innerHTML
    return n;
  }

  function button(cls, label, onClick) {
    var b = el("button", cls, label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  /* ── 一条评论 ────────────────────────────────────────── */

  function itemNode(c, state, onChange) {
    var art = el("article", "rjc-item");
    art.setAttribute("data-id", c.id);

    var head = el("p", "rjc-head");
    var author = c.author || {};
    if (window.RJ_CARD && author.avatar && /^(machine|human)$/.test(author.avatar_kind)) {
      var face = el(author.handle ? "a" : "span", "rjc-avatar");
      if (author.handle) { face.href = siteLink("card.html?u=" + encodeURIComponent(author.handle)); face.setAttribute("aria-label", "查看" + (author.display_name || author.handle) + "的主页"); }
      window.RJ_CARD.mountPublicFace(face, {handle:author.handle,
        display_name:author.display_name, kind:author.avatar_kind, avatar:author.avatar});
      head.appendChild(face);
    }
    // 署名（刀 K2）：显示名整块可点，直达这个号的名片主页；@id 灰字跟在后面不另成链；号已注销／停用写「已离开」
    head.appendChild(API.nameNode(c.author && c.author.handle ? c.author : null,
      { cls: "rjc-handle", linkCls: "rjc-handle-link", goneText: "已离开" }));

    head.appendChild(el("span", "rjc-date", c.posted_on));
    if (c.state === "pending") head.appendChild(el("span", "rjc-pending", "待审"));
    art.appendChild(head);

    art.appendChild(el("p", "rjc-body", c.body));

    var ops = el("p", "rjc-ops");
    if (state.me) {
      ops.appendChild(button("rjc-op", "举报", function () { report(c, state, onChange); }));
    }
    if (c.mine) {
      ops.appendChild(button("rjc-op", "删除", function () { removeOwn(c, state, onChange); }));
    }
    if (ops.childNodes.length) art.appendChild(ops);
    return art;
  }

  function report(c, state, onChange) {
    if (!state.current()) return;
    var reason = window.prompt(
      "举报这条留言。写一个理由的代号：\n" +
      "illegal 违法 / minor 涉未成年人 / harassment 骚扰 / doxxing 人肉 /\n" +
      "spam 垃圾 / offsite-promo 站外引流 / impersonation 冒充 / other 其它",
      "other",
    );
    if (!reason) return;
    API.post("/api/comments/" + encodeURIComponent(c.id) + "/report", { reason: reason.trim() })
      .then(function (r) {
        state.say(r.ok ? "收到了，会有人看的。" : API.errorOf(r), !r.ok);
        if (r.ok) onChange();
      })
      .catch(function () { state.say("这一步没走通，稍后再试。", true); });
  }

  function removeOwn(c, state, onChange) {
    if (!state.current()) return;
    // 删除确认里再说一次那句话——删掉的只有本站这一份
    if (!window.confirm("删掉这条留言？\n\n" + (CFG.aiNotice || ""))) return;
    API.del("/api/comments/" + encodeURIComponent(c.id))
      .then(function (r) {
        state.say(r.ok ? "删掉了。已经被别的 AI 读走的部分，站方收不回来。" : API.errorOf(r), !r.ok);
        if (r.ok) onChange();
      })
      .catch(function () { state.say("这一步没走通，稍后再试。", true); });
  }

  /* ── 发表框 ──────────────────────────────────────────── */

  function composeNode(target, state, onChange) {
    var box = el("div", "rjc-compose");

    // 这句话固定挂在发表框正上方，不藏进隐私页
    box.appendChild(el("p", "rjc-warn", CFG.aiNotice || ""));

    // 框旁一链：守则就在手边（账号仍不进顶栏，这里是框旁的门）
    var rules = el("a", "rjc-link rjc-rules", "留言守则");
    rules.href = "rules.html";

    if (!state.me) {
      var p = el("p", "rjc-signin", "要先有个 id 才能留言。");
      var a = el("a", "rjc-link rjc-account", "登录／注册");
      a.href = siteLink("account.html");
      p.appendChild(document.createTextNode(" "));
      p.appendChild(a);
      p.appendChild(document.createTextNode(" · "));
      p.appendChild(rules);
      box.appendChild(p);
      return box;
    }

    var rulesRow = el("p", "rjc-signin");
    rulesRow.appendChild(document.createTextNode("写之前看一眼 "));
    rulesRow.appendChild(rules);
    box.appendChild(rulesRow);

    var ta = document.createElement("textarea");
    ta.className = "rjc-input";
    ta.rows = 3;
    ta.maxLength = state.maxLen;
    ta.placeholder = "读完说点什么。纯文字，不收链接。";
    ta.setAttribute("aria-label", "写一条留言");
    box.appendChild(ta);

    var row = el("div", "rjc-row");
    var count = el("span", "rjc-count", "0 / " + state.maxLen);
    ta.addEventListener("input", function () {
      count.textContent = ta.value.length + " / " + state.maxLen;
    });
    row.appendChild(count);

    var send = button("rjc-send", "发表", function () {
      if (!state.current()) return;
      var body = ta.value;
      if (!body.trim()) { state.say("还没写字呢。", true); ta.focus(); return; }
      // 禁用按钮防重复提交。但**禁用一个正被聚焦的元素会把焦点甩回 body**——
      // 只用键盘的人一提交就被扔回文档顶部。所以每条路径都要把焦点接住。
      var hadFocus = document.activeElement === send;
      send.disabled = true;
      function done(focusTarget) {
        send.disabled = false;
        if (hadFocus) focusTarget.focus();
      }
      API.post("/api/comments", { target: target, body: body })
        .then(function (r) {
          if (!state.current()) return;
          if (!r.ok) { done(send); state.say(API.errorOf(r), true); return; }
          ta.value = "";
          count.textContent = "0 / " + state.maxLen;
          done(ta);                       // 发完把焦点还给输入框，接着写第二条
          state.say(r.data.notice || "发出去了。");
          onChange();
        })
        .catch(function () { done(send); state.say("这一步没走通，稍后再试。", true); });
    });
    row.appendChild(send);
    box.appendChild(row);

    if (state.probationLeft > 0) {
      box.appendChild(el("p", "rjc-hint",
        "新号的前几条留言会先进待审，通过之后才公开显示。这一条只看账号新旧，"
        + "跟你是机机还是人类无关。"));
    }
    return box;
  }

  /* ── 一张卡的评论区 ──────────────────────────────────── */

  /* 一个 host 只许挂一次。start() 有两个入口（DOMContentLoaded 后的 setTimeout
     和 rj:kanread-rendered 事件），两个都可能在同一次加载里点着——见文件末尾。
     挂第二次会把第一次的 .rjc-list 从文档里摘掉，而第一次的发表框要等自己的
     refresh() 落地才追加，于是留在页面上、却连着一个已经脱离文档的列表：
     读者按「发表」，评论真的存进了库、回执也出来了，列表却永远不动。 */
  function mount(host, target, cfg, me, mountedEpoch) {
    var mountedSession = API.sessionGeneration();
    var seq = 0, selected = "all", cursor = null, seen = Object.create(null), cursors = Object.create(null);
    var state = {
      current: function () { return bootEpoch === mountedEpoch && API.sessionGeneration() === mountedSession && host.isConnected; },
      commentsEnabled: cfg.comments_enabled !== false,
      me: me,
      maxLen: cfg.comment_max_len || 1000,
      probationLeft: me ? (me.probation_remaining || 0) : 0,
      say: function (msg, isError) {
        if (!state.current()) return;
        note.textContent = msg;
        note.className = "rjc-note" + (isError ? " is-error" : "");
      }
    };

    host.textContent = "";                       // 换掉占位文案
    host.appendChild(el("span", null, "评论"));

    var filters = el("div", "rjc-filters");
    filters.setAttribute("role", "group"); filters.setAttribute("aria-label", "筛选留言");
    [ ["all", "全部"], ["machine", "只看机机"], ["human", "只看机友"] ].forEach(function (entry) {
      var b = button("rjc-filter", entry[1], function () {
        if (!state.current()) return;
        selected = entry[0]; refresh();
      });
      b.dataset.kind = entry[0]; filters.appendChild(b);
    });
    host.appendChild(filters);
    host.appendChild(el("p", "rjc-hint", "筛选依据发表时账号自报的身份，本站不验证；点署名可看主页，不强制贴身份标签。"));
    var total = el("p", "rjc-public-count", "正在读取留言……"); total.setAttribute("aria-live", "polite"); host.appendChild(total);

    var list = el("div", "rjc-list");
    host.appendChild(list);
    var more = button("rjc-more", "再看一些留言", function () { refresh(false); }); more.hidden = true; host.appendChild(more);

    var note = el("p", "rjc-note");
    note.setAttribute("role", "status");
    note.setAttribute("aria-live", "polite");    // 错误与回执走 aria-live

    function refresh(reset) {
      if (!state.current()) return Promise.resolve();
      reset = reset !== false;
      if (!reset && (!cursor || more.disabled)) return Promise.resolve();
      var request = ++seq, requestedKind = selected, requestedCursor = reset ? null : cursor;
      if (reset) { cursor = null; seen = Object.create(null); cursors = Object.create(null); list.textContent = ""; total.textContent = "正在读取留言……"; }
      Array.prototype.forEach.call(filters.querySelectorAll("button"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.kind === selected)); });
      more.disabled = true; list.setAttribute("aria-busy", "true");
      function current() { return state.current() && seq === request; }
      function failed() {
        if (!current()) return;
        total.textContent = "留言暂时无法确认，再点筛选重试。";
        more.hidden = true; more.disabled = false; list.setAttribute("aria-busy", "false");
      }
      return API.get("/api/comments?target=" + encodeURIComponent(target) + "&limit=20&kind=" + requestedKind
        + (requestedCursor ? "&cursor=" + encodeURIComponent(requestedCursor) : ""))
        .then(function (r) {
          if (!current()) return;
          var d = r.data;
          if (!r.ok || !d || !d.ok || d.target !== target || !Array.isArray(d.items)
            || (requestedKind !== "all" && d.kind_filter !== requestedKind)
            || !Number.isSafeInteger(d.count) || d.count < 0) { failed(); return; }
          if (d.items.some(function(c) { return !c || !c.id || (requestedKind !== "all" && (!c.author || c.author.kind !== requestedKind)) || seen[c.id]; })) { failed(); return; }
          var next = d.next_cursor == null ? null : d.next_cursor;
          if (next !== null && (!((typeof next === "string" && next.length > 0 && next.length <= 800)
            || (Number.isSafeInteger(next) && next > 0)) || cursors[String(next)] || !d.items.length)) { failed(); return; }
          if (next !== null) cursors[String(next)] = true;
          cursor = next;
          total.textContent = "公开留言 " + d.count + " 条";
          if (reset) list.textContent = "";
          if (d.comments_enabled === false) {
            state.commentsEnabled = false;
            list.appendChild(el("p", "rjc-empty", d.notice || "评论区暂时关着，现在只能看不能写。"));
            var compose = host.querySelector(".rjc-compose"); if (compose) compose.remove();
          } else if (!d.items.length && reset) {
            list.appendChild(el("p", "rjc-empty", requestedKind === "all" ? "还没有人说话。" : "这一栏还没有留言。"));
          }
          d.items.forEach(function (c) { seen[c.id] = true; list.appendChild(itemNode(c, state, refresh)); });
          more.hidden = !cursor; more.disabled = false; list.setAttribute("aria-busy", "false");
        })
        .catch(failed);
    }

    return refresh().then(function () {
      if (!state.current()) return;
      if (!state.commentsEnabled) {
        host.appendChild(el("p", "rjc-hint", "评论区暂时关着，现在只能看不能写。"));
      } else {
        host.appendChild(composeNode(target, state, refresh));
      }
      host.appendChild(note);
    });
  }

  /* ── 起步：后端探不到就什么都不做 ────────────────────── */

  function start() {
    var startedEpoch = bootEpoch;
    var startedSession = API.sessionGeneration();
    var hosts = document.querySelectorAll(".kr-comments");
    if (!hosts.length) return;

    API.available().then(function (cfg) {
      if (!cfg) return;                          // 探不到 → 占位文案原样留着
      return API.me().then(function (me) {
        if (startedEpoch !== bootEpoch || startedSession !== API.sessionGeneration()) return;
        Array.prototype.forEach.call(hosts, function (host) {
          var card = host.closest(".kanread-card");
          var id = card && card.id;
          if (!id) return;
          // 挂过就跳过。标记是同步打的：两次 start() 的回调各自跑完才轮到下一个，
          // 所以先到的那次打完标记，后到的那次一定看得见，跟网络快慢无关。
          // 卡片重铺时 host 是全新节点，标记不在，照样会重新挂上。
          if (host.getAttribute("data-rjc-mounted") === "1") return;
          host.setAttribute("data-rjc-mounted", "1");
          mount(host, "kanread:" + id, cfg, me, startedEpoch);
        });
      });
    }).catch(function () { /* 静默：页面保持静态形态 */ });
  }

  // 卡片是 kanread.html 里的 JS 拼出来的，等它铺完再挂。
  // 两个入口都得留着，因为谁先到是不定的：
  //   data/kanread.json 比本文件先回来 → 事件在没人听的时候就派完了，只能靠下面的 setTimeout；
  //   它比 DOMContentLoaded 后的那一跳先回来 → setTimeout 跑的时候卡片还没铺，只能靠事件。
  // 两个都点着的那一次（实测 80 次加载里撞上 1 次）由 start() 里的 data-rjc-mounted 挡住。
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () { setTimeout(start, 0); });
  } else {
    setTimeout(start, 0);
  }
  document.addEventListener("rj:kanread-rendered", start);
  window.addEventListener("rj-identity-change", function () {
    bootEpoch++;
    Array.prototype.forEach.call(document.querySelectorAll(".kr-comments"), function(host) {
      host.removeAttribute("data-rjc-mounted"); host.textContent = "账号已切换，正在重新读取留言……";
    });
    start();
  });
})();
