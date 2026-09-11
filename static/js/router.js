// Minimal client-side router. Maps URL path -> async render function.
// Each page function receives context and returns an HTML string (or manages
// its own subtree via AppShell.page and event wiring).
const CREW_ROUTES = [];
const CREW_HOOKS = [];

function route(pattern, renderFn) {
  CREW_ROUTES.push({ pattern: new URLPatternish(pattern), renderFn });
}

// Tiny URL pattern matcher. Pattern like "/booking/:id" or "/home".
class URLPatternish {
  constructor(pattern) {
    this.segments = pattern.split("?")[0].split("/").filter(Boolean);
    this.hasDynamic = this.segments.some(s => s.startsWith(":"));
  }
  match(path) {
    const parts = path.split("?")[0].split("/").filter(Boolean);
    if (this.segments.length !== parts.length) return null;
    if (!this.hasDynamic) {
      return this.segments.join("/") === parts.join("/") ? {} : null;
    }
    const params = {};
    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(parts[i]);
      else if (seg !== parts[i]) return null;
    }
    return params;
  }
}

function navigate(path) {
  history.pushState({}, "", path);
  dispatchRoute();
}

async function dispatchRoute() {
  const path = location.pathname;
  for (const r of CREW_ROUTES) {
    const params = r.pattern.match(path);
    if (params) {
      // Run any pre-route guards already handled by page renderers.
      try {
        await r.renderFn(params);
      } catch (e) {
        console.error(e);
        showFatal(e);
      }
      return;
    }
  }
  // default
  renderNotFound(path);
}

function renderNotFound() {
  const main = document.getElementById("main");
  if (main) {
    main.innerHTML = `<div class="state-box mt-2"><div class="big">404</div><p>That page doesn't exist.</p><a class="btn sm mt-1" href="/home">Go home</a></div>`;
  }
}

// Global fatal error box (server down etc.)
function showFatal(e, container) {
  const target = document.getElementById("content") || document.getElementById("main");
  if (target) {
    target.innerHTML = `<div class="state-box"><div class="big">⚠️</div><p><strong>Something went wrong</strong></p><p class="small muted">${esc(e.message || String(e))}</p><button class="btn sm mt-1" onclick="location.reload()">Retry</button></div>`;
  }
}

window.addEventListener("popstate", dispatchRoute);

// Utility to guard a page by role then mount the shell.
function mountShell(active) {
  AppShell.mount(active);
  const main = document.getElementById("main");
  let content = document.getElementById("content");
  if (!content) {
    main.insertAdjacentHTML("afterbegin", '<div id="content"></div>');
    content = document.getElementById("content");
  }
  return content;
}
