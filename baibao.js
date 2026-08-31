(() => {
  "use strict";

  const CATEGORY_LABELS = {life: "生活协作", play: "互动娱乐"};
  const ACCESS_LABELS = {
    direct: "直接调用",
    assisted: "需要协助",
    "human-confirm": "关键动作确认",
  };
  const STATUS_LABELS = {
    candidate: "待核验",
    planned: "规划中",
    verified: "已核验",
    unavailable: "已失效",
  };
  const KIND_LABELS = {
    mcp: "MCP",
    skill: "Skill",
    app: "App",
    game: "游戏",
    connector: "连接器",
  };
  const COMMERCIAL_LABELS = {
    allowed: "可商用",
    forbidden: "不可商用",
    unknown: "商用边界待核验",
  };
  const CLIENT_LABELS = {
    "claude-code": "Claude Code",
    "claude-desktop": "Claude Desktop",
    codex: "Codex",
    chatgpt: "ChatGPT",
    "generic-mcp": "通用 MCP",
  };

  const state = {items: [], category: "all", access: "all", query: "", adultUnlocked: new Set()};
  const grid = document.getElementById("treasure-grid");
  const empty = document.getElementById("treasure-empty");
  const error = document.getElementById("treasure-error");
  const queryInput = document.getElementById("treasure-query");
  const toast = document.getElementById("treasure-toast");

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(() => toast.classList.remove("show"), 1600);
  }

  function node(tag, className, text) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function badge(text, className = "") {
    return node("span", `treasure-badge ${className}`.trim(), text);
  }

  function detail(label, value) {
    const row = node("div", "treasure-detail");
    row.append(node("dt", "", label), node("dd", "", value || "待补"));
    return row;
  }

  function makeLink(link) {
    let url;
    try {
      url = new URL(link.url, window.location.href);
    } catch (_error) {
      return null;
    }
    if (url.protocol !== "https:") return null;
    const anchor = node("a", `treasure-link${link.kind === "primary" ? "" : " secondary"}`, link.label);
    anchor.href = url.href;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    return anchor;
  }

  function licenseText(item) {
    if (!item.repo || !item.repo.license) return "待核验";
    const license = item.repo.license;
    return `${license.name} · ${COMMERCIAL_LABELS[license.commercial_use] || license.commercial_use}`;
  }

  function verifiedText(item) {
    return item.last_verified
      ? `${item.maintainer || "维护方待补"} · ${item.last_verified}`
      : `${item.maintainer || "维护方待补"} · 尚未核验`;
  }

  function appendRiskBadges(item, container) {
    const risks = item.risks || {};
    (risks.permissions || []).forEach((permission) => {
      container.append(badge(`权限 · ${permission}`, "risk"));
    });
    if (risks.secrets) container.append(badge("需要密钥", "risk"));
    if (risks.payment) container.append(badge("涉及付款", "risk"));
    if (risks.external_write) container.append(badge("对外操作", "risk"));
    if (risks.adult) container.append(badge("18+", "risk adult"));
    if (risks.network === "unknown") container.append(badge("联网方式待核验", "risk"));
    if (risks.filesystem === "unknown") container.append(badge("文件权限待核验", "risk"));
  }

  function buildBringPanel(item) {
    const panel = node("div", "treasure-panel");
    panel.dataset.panel = "bring";
    panel.id = `panel-${item.id}-bring`;
    panel.hidden = true;

    const installations = item.installations || [];
    if (installations.length > 1) {
      const tabs = node("div", "treasure-panel-tabs");
      tabs.setAttribute("role", "group");
      tabs.setAttribute("aria-label", "选择客户端");
      installations.forEach((installation, index) => {
        const tab = node("button", index === 0 ? "on" : "", CLIENT_LABELS[installation.client] || installation.client);
        tab.type = "button";
        tab.dataset.installTab = String(index);
        tab.setAttribute("aria-pressed", index === 0 ? "true" : "false");
        tabs.append(tab);
      });
      panel.append(tabs);
    }

    installations.forEach((installation, index) => {
      const view = node("div", "treasure-install");
      view.dataset.installView = String(index);
      if (index !== 0) view.hidden = true;
      if (installations.length === 1) {
        view.append(node("p", "treasure-install-client", CLIENT_LABELS[installation.client] || installation.client));
      }
      view.append(node("p", "treasure-install-label", installation.label));
      if (installation.copy_text) {
        const row = node("div", "treasure-code-row");
        const code = node("code", "", installation.copy_text);
        const copy = node("button", "treasure-copy", "复制");
        copy.type = "button";
        copy.dataset.copy = installation.copy_text;
        row.append(code, copy);
        view.append(row);
      }
      if (installation.needs_secret) {
        const secret = node("p", "treasure-secret-note");
        secret.append(
          node("strong", "", "密钥只填在你自己的客户端里。"),
          document.createTextNode("配置中出现的 <YOUR_KEY> 一类占位符由你本人替换，本站不代收、不代填。"),
        );
        view.append(secret);
      }
      if (Array.isArray(installation.requirements) && installation.requirements.length) {
        const requirements = node("ul", "treasure-requirements");
        installation.requirements.forEach((requirement) => {
          requirements.append(node("li", "", requirement));
        });
        view.append(requirements);
      }
      panel.append(view);
    });

    if (item.repo && item.repo.url) {
      const outbound = node("div", "treasure-outbound");
      const anchor = node("a", "", "查看 GitHub / 去 Star ↗");
      anchor.href = item.repo.url;
      anchor.target = "_blank";
      anchor.rel = "noopener noreferrer";
      const stars = item.repo.stars_cache;
      const note = stars
        ? `第三方项目 · ★ ${stars.count}（${stars.fetched_at.slice(0, 10)} 抓取）`
        : "第三方项目";
      outbound.append(anchor, node("span", "", note));
      panel.append(outbound);
    }
    return panel;
  }

  function buildTryPanel(item) {
    const panel = node("div", "treasure-panel");
    panel.dataset.panel = "try";
    panel.id = `panel-${item.id}-try`;
    panel.hidden = true;

    (item.experiences || []).forEach((experience) => {
      if (experience.level === "replay") {
        const replay = node("div", "treasure-experience replay");
        replay.append(node("span", "treasure-level", "L1 · 安装后效果回放"));
        replay.append(node("p", "treasure-experience-label", experience.label));
        (experience.media || []).forEach((media) => {
          replay.append(node("p", "treasure-replay-media", media.alt));
        });
        replay.append(node("p", "treasure-experience-caption", experience.caption));
        panel.append(replay);
        return;
      }
      if (experience.level === "remote") {
        const remote = node("div", "treasure-experience remote");
        remote.append(node("span", "treasure-level", "L3 · 官方远程试玩"));
        remote.append(node("p", "treasure-experience-label", experience.label));
        remote.append(node("p", "treasure-experience-caption", `运营方：${experience.operator}。${experience.privacy_note}`));
        let url;
        try {
          url = new URL(experience.url, window.location.href);
        } catch (_error) {
          url = null;
        }
        if (url && url.protocol === "https:") {
          const anchor = node("a", "treasure-link", `${experience.label} ↗`);
          anchor.href = url.href;
          anchor.target = "_blank";
          anchor.rel = "noopener noreferrer";
          remote.append(anchor);
        }
        panel.append(remote);
      }
    });
    return panel;
  }

  function buildAdultLock(item) {
    const lock = node("div", "treasure-lock");
    lock.dataset.adultLock = item.id;
    const box = node("div", "treasure-lock-box");
    box.append(node("small", "", "18+ · 主动展开"));
    box.append(node("strong", "", "成人项目不会在公共流里直接展示"));
    const open = node("button", "treasure-lock-open", "我已成年，查看项目");
    open.type = "button";
    open.dataset.adultOpen = item.id;
    box.append(open);
    lock.append(box);
    return lock;
  }

  function createCard(item) {
    const card = node("article", "treasure-card");
    card.dataset.category = item.category;
    card.dataset.rating = item.rating || "all";
    card.dataset.cardId = item.id;
    const locked = item.rating === "r18" && !state.adultUnlocked.has(item.id);

    const head = node("div", "treasure-card-head");
    const icon = node("div", "treasure-icon", item.icon || "MCP");
    const title = node("div", "treasure-title");
    title.append(
      node("h3", "", item.name),
      node("p", "", `${CATEGORY_LABELS[item.category] || item.category} · ${KIND_LABELS[item.kind] || item.kind}`),
    );
    const status = node("span", "treasure-status", STATUS_LABELS[item.status] || item.status);
    status.dataset.status = item.status;
    head.append(icon, title, status);
    card.append(head);

    if (locked) {
      card.classList.add("locked");
      card.append(buildAdultLock(item));
      return card;
    }

    const badges = node("div", "treasure-badges");
    badges.append(badge(ACCESS_LABELS[item.access_mode] || item.access_mode, "access"));
    appendRiskBadges(item, badges);

    const details = node("dl", "treasure-details");
    details.append(
      detail("许可证", licenseText(item)),
      detail("维护与核验", verifiedText(item)),
    );

    const tags = node("div", "treasure-tags");
    (item.tags || []).forEach((tag) => tags.append(node("span", "treasure-tag", tag)));

    const verdict = node("p", "treasure-verdict");
    verdict.append(node("strong", "", "编辑判词"), document.createTextNode(item.verdict || "判词待补"));

    const confirm = node("div", "treasure-confirm");
    confirm.append(node("strong", "", "必须由你确认"));
    const confirmation = item.human_confirmation || [];
    confirm.append(document.createTextNode(confirmation.length ? confirmation.join("；") : "当前没有必须人工确认的动作"));

    card.append(node("p", "treasure-summary", item.summary), badges, details, tags, verdict, confirm);

    if (item.status === "verified") {
      const actions = node("div", "treasure-actions");
      const bring = node("button", "", "安装与配置");
      bring.type = "button";
      bring.dataset.action = "bring";
      bring.setAttribute("aria-expanded", "false");
      bring.setAttribute("aria-controls", `panel-${item.id}-bring`);
      const tryOut = node("button", "try", "在线体验");
      tryOut.type = "button";
      tryOut.dataset.action = "try";
      tryOut.setAttribute("aria-expanded", "false");
      tryOut.setAttribute("aria-controls", `panel-${item.id}-try`);
      actions.append(bring, tryOut);
      card.append(actions, buildBringPanel(item), buildTryPanel(item));
    }

    const links = node("div", "treasure-links");
    if (Array.isArray(item.links) && item.links.length) {
      item.links.forEach((link) => {
        const anchor = makeLink(link);
        if (anchor) links.append(anchor);
      });
    }
    if (!links.childElementCount && item.status !== "verified") {
      links.append(node("span", "treasure-no-link", "来源尚未核验，暂不提供安装入口"));
      card.append(links);
    } else if (links.childElementCount) {
      card.append(links);
    }
    return card;
  }

  function matches(item) {
    if (state.category === "r18") {
      if (item.rating !== "r18") return false;
    } else if (state.category !== "all" && item.category !== state.category) {
      return false;
    }
    if (state.access !== "all" && item.access_mode !== state.access) return false;
    if (!state.query) return true;
    const haystack = [
      item.name,
      item.summary,
      item.maintainer,
      item.verdict,
      ...(item.tags || []),
      ...(item.installations || []).flatMap((installation) => installation.requirements || []),
    ].join(" ").toLocaleLowerCase("zh-CN");
    return haystack.includes(state.query);
  }

  function render() {
    const visible = state.items.filter(matches);
    grid.replaceChildren(...visible.map(createCard));
    empty.hidden = visible.length !== 0;
    error.hidden = true;
  }

  function bindFilters(containerId, key, attribute) {
    document.getElementById(containerId).addEventListener("click", (event) => {
      const button = event.target.closest(`button[${attribute}]`);
      if (!button) return;
      event.currentTarget.querySelectorAll("button").forEach((item) => {
        const selected = item === button;
        item.classList.toggle("on", selected);
        item.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      state[key] = button.getAttribute(attribute);
      render();
    });
  }

  grid.addEventListener("click", async (event) => {
    const adultOpen = event.target.closest("[data-adult-open]");
    if (adultOpen) {
      state.adultUnlocked.add(adultOpen.dataset.adultOpen);
      render();
      showToast("已在本页解锁该项目，刷新后恢复锁定");
      return;
    }

    const installTab = event.target.closest("[data-install-tab]");
    if (installTab) {
      const panel = installTab.closest(".treasure-panel");
      panel.querySelectorAll("[data-install-tab]").forEach((tab) => {
        const selected = tab === installTab;
        tab.classList.toggle("on", selected);
        tab.setAttribute("aria-pressed", selected ? "true" : "false");
      });
      panel.querySelectorAll("[data-install-view]").forEach((view) => {
        view.hidden = view.dataset.installView !== installTab.dataset.installTab;
      });
      return;
    }

    const copyButton = event.target.closest("[data-copy]");
    if (copyButton) {
      try {
        await navigator.clipboard.writeText(copyButton.dataset.copy);
        showToast("已复制，粘贴到你的客户端里用");
      } catch (_error) {
        showToast("浏览器没有开放剪贴板，请手动选择命令复制");
      }
      return;
    }

    const action = event.target.closest("[data-action]");
    if (action) {
      const card = action.closest(".treasure-card");
      card.querySelectorAll("[data-action]").forEach((button) => {
        const selected = button === action;
        button.classList.toggle("on", selected);
        button.setAttribute("aria-expanded", selected ? "true" : "false");
      });
      card.querySelectorAll("[data-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.panel !== action.dataset.action;
      });
    }
  });

  queryInput.addEventListener("input", () => {
    state.query = queryInput.value.trim().toLocaleLowerCase("zh-CN");
    render();
  });
  bindFilters("category-filters", "category", "data-category");
  bindFilters("access-filters", "access", "data-access");

  fetch(`data/mcps.json?v=${Date.now()}`)
    .then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then((payload) => {
      state.items = Array.isArray(payload.items) ? payload.items : [];
      document.getElementById("count-all").textContent = String(state.items.length);
      document.getElementById("count-life").textContent = String(state.items.filter((item) => item.category === "life").length);
      document.getElementById("count-play").textContent = String(state.items.filter((item) => item.category === "play").length);
      render();
    })
    .catch(() => {
      grid.replaceChildren();
      empty.hidden = true;
      error.hidden = false;
    });
})();
