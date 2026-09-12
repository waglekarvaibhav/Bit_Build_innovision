// Shared app shell rendering: customer shell + polished provider workspace.
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
    { key: "jobs", label: "My Jobs", icon: "clock", href: "/provider-jobs" },
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

    const mobileLinks = me.role === "provider" ? [
      { key: "home", label: "Home", icon: "home", href: "/provider-home" },
      { key: "requests", label: "Requests", icon: "inbox", href: "/provider-requests" },
      { key: "jobs", label: "Jobs", icon: "clock", href: "/provider-jobs" },
      { key: "packages", label: "Packages", icon: "box", href: "/provider-packages" },
      { key: "profile", label: "Profile", icon: "user", href: "/provider-profile" },
    ] : [
      { key: "home", label: "Home", icon: "home", href: "/home" },
      { key: "activity", label: "Activity", icon: "calendar", href: "/activity" },
      { key: "packages", label: "Packages", icon: "box", href: "/packages" },
      { key: "profile", label: "Profile", icon: "user", href: "/profile" },
    ];

    const mobileNav = mobileLinks.map(l =>
      `<a href="${l.href}" class="${l.key === activeKey || (activeKey === 'quickhire' && l.key === 'activity') ? "active" : ""}">${icon(l.icon)}<span>${l.label}</span></a>`
    ).join("");

    if (me.role === "provider") {
      const nav = links.map(l => `
        <a href="${l.href}" class="${l.key === activeKey ? "active" : ""}" data-nav="${l.key}">
          <span class="nx-nav-icon">${icon(l.icon)}</span>
          <span class="nx-nav-label">${l.label}</span>
        </a>`).join("");

      app.innerHTML = `
        <div class="app mi-root mi-role-provider">
          <aside class="nx-sidebar" aria-label="Provider navigation">
            <a class="nx-brand" href="/provider-home" aria-label="CrewNest provider home">
              <span class="nx-brand-mark">CN</span>
              <span class="nx-brand-copy"><strong>CrewNest</strong><small>Provider workspace</small></span>
            </a>
            <div class="nx-side-label">Workspace</div>
            <nav class="nx-nav">${nav}</nav>
            <div class="nx-side-spacer"></div>
            <div class="nx-side-user">
              <span class="nx-person">${initials(me.full_name)}</span>
              <span class="nx-person-copy"><strong>${esc(me.full_name)}</strong><small>Service provider</small></span>
            </div>
            <button class="nx-logout" id="logout-btn">${icon("logout")}<span>Sign out</span></button>
          </aside>
          <main class="main" id="main"></main>
          <nav class="mobile-nav" aria-label="Mobile navigation">${mobileNav}</nav>
        </div>`;
    } else {
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
    }

    document.getElementById("logout-btn").addEventListener("click", () => { Auth.clear(); location.href = "/login"; });
  },

  page(head) {
    const main = document.getElementById("main");
    const header = (head || "").trim();
    main.innerHTML = `${header ? `<div class="page-head">${header}</div>` : ""}<div id="content"></div>`;
    return { el: document.getElementById("content"), head: header ? main.querySelector(".page-head") : null };
  },
};

function esc(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function money(n) { if (n == null) return "—"; return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 }); }
function fmtDate(iso) { if (!iso) return ""; const d = new Date(iso); return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); }
const STATUS_LABEL = { pending: "Pending", accepted: "Accepted", completion_requested: "Awaiting review", completed: "Completed", rejected: "Rejected", cancelled: "Cancelled" };
function statusBadge(status) { const map = { pending:"pending", accepted:"accepted", completion_requested:"amber", completed:"completed", rejected:"error", cancelled:"neutral" }; return `<span class="badge ${map[status] || "neutral"}">${STATUS_LABEL[status] || status}</span>`; }
function ratingHtml(rating, count) { return rating == null ? `<span class="badge teal">New</span>` : `<span class="rating">★ ${Number(rating).toFixed(1)}</span> <span class="xsmall muted">(${count} review${count === 1 ? "" : "s"})</span>`; }
