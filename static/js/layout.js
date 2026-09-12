// Shared app shell rendering. Customers keep the existing sidebar shell;
// providers use a dedicated top workspace shell with compact horizontal nav.
const SIDEBAR_LINKS_BY_ROLE = {
  customer: [
    { key: "home", label: "Home", icon: "home", href: "/home" },
    { key: "quickhire", label: "Quick Hire", icon: "book", href: "/quickhire" },
    { key: "guides", label: "Goal Guide", icon: "box", href: "/guide" },
    { key: "packages", label: "Packages", icon: "box", href: "/packages" },
    { key: "activity", label: "My Activity", icon: "calendar", href: "/activity" },
    { key: "profile", label: "Profile", icon: "user", href: "/profile" },
  ],
  provider: [
    { key: "home", label: "Overview", icon: "home", href: "/provider-home" },
    { key: "requests", label: "Requests", icon: "inbox", href: "/provider-requests" },
    { key: "jobs", label: "Jobs", icon: "clock", href: "/provider-jobs" },
    { key: "packages", label: "Packages", icon: "box", href: "/provider-packages" },
    { key: "profile", label: "Profile", icon: "user", href: "/provider-profile" },
  ],
};

const AppShell = {
  mount(activeKey) {
    const app = document.getElementById("app");
    if (!app) return;
    const me = Auth.user();
    if (!me) return;
    const links = SIDEBAR_LINKS_BY_ROLE[me.role] || [];

    const mobileNav = links.map(l =>
      `<a href="${l.href}" class="${l.key === activeKey ? "active" : ""}">${icon(l.icon)}<span>${l.label}</span></a>`
    ).join("");

    if (me.role === "provider") {
      const topNav = links.map(l =>
        `<a href="${l.href}" class="pv-top-link ${l.key === activeKey ? "active" : ""}">${icon(l.icon)}<span>${l.label}</span></a>`
      ).join("");
      app.innerHTML = `
        <div class="app mi-root mi-role-provider pv-app-shell">
          <header class="pv-topbar">
            <a class="pv-top-brand" href="/provider-home" aria-label="CrewNest provider home">
              <span class="pv-brand-mark">CN</span>
              <span><strong>CrewNest</strong><small>Provider Studio</small></span>
            </a>
            <nav class="pv-top-nav" aria-label="Provider navigation">${topNav}</nav>
            <div class="pv-top-actions">
              <span class="pv-top-role">Provider</span>
              <a class="pv-top-user" href="/provider-profile"><span>${initials(me.full_name)}</span><strong>${esc(me.full_name)}</strong></a>
              <button class="pv-signout" id="logout-btn" aria-label="Sign out">${icon("logout")}</button>
            </div>
          </header>
          <main class="main pv-main" id="main"></main>
          <nav class="mobile-nav pv-mobile-nav" aria-label="Mobile navigation">${mobileNav}</nav>
        </div>`;
      document.getElementById("logout-btn").addEventListener("click", () => { Auth.clear(); location.href = "/login"; });
      return;
    }

    const sidebarNav = links.map(l =>
      `<a href="${l.href}" class="${l.key === activeKey ? "active" : ""}" data-nav="${l.key}">${icon(l.icon)}<span>${l.label}</span></a>`
    ).join("");
    app.innerHTML = `
      <div class="app mi-root mi-role-customer">
        <aside class="sidebar">
          <div class="brand"><span class="logo" aria-hidden="true">CN</span><span>CrewNest<small>find your fixers & teams</small></span></div>
          <nav class="side-nav" aria-label="Primary navigation">${sidebarNav}</nav>
          <div class="side-foot">
            <div class="user-chip"><span class="avatar" aria-hidden="true">${initials(me.full_name)}</span><span class="grow"><strong class="small">${esc(me.full_name)}</strong><small>Customer</small></span></div>
            <button class="link" id="logout-btn">${icon("logout")} Sign out</button>
          </div>
        </aside>
        <div class="main" id="main"></div>
        <div class="footer">CrewNest · local services demo · data is fictitious</div>
        <nav class="mobile-nav" aria-label="Mobile navigation">${mobileNav}</nav>
      </div>`;
    document.getElementById("logout-btn").addEventListener("click", () => { Auth.clear(); location.href = "/login"; });
  },

  page(head) {
    const main = document.getElementById("main");
    main.innerHTML = `<div class="page-head">${head}</div><div id="content"></div>`;
    return { el: document.getElementById("content"), head: main.querySelector(".page-head") };
  },
};

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function money(n) { if (n == null) return "—"; return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function fmtDate(iso) { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
const STATUS_LABEL = { pending:"Pending", accepted:"Accepted", completion_requested:"Awaiting review", completed:"Completed", rejected:"Rejected", cancelled:"Cancelled" };
function statusBadge(status) { const map = { pending:"pending", accepted:"accepted", completion_requested:"amber", completed:"completed", rejected:"error", cancelled:"neutral" }; return `<span class="badge ${map[status] || "neutral"}">${STATUS_LABEL[status] || status}</span>`; }
function ratingHtml(rating, count) { return rating == null ? `<span class="badge teal">New</span>` : `<span class="rating">★ ${Number(rating).toFixed(1)}</span> <span class="xsmall muted">(${count} review${count === 1 ? "" : "s"})</span>`; }
