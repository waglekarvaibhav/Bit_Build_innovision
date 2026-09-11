// Shared app shell rendering: sidebar nav, mobile nav, page header, footer.
// Pages call AppShell.mount(activeNav) inside their render().
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
    { key: "home", label: "Home", icon: "home", href: "/provider-home" },
    { key: "requests", label: "Requests", icon: "inbox", href: "/provider-requests" },
    { key: "jobs", label: "My Jobs", icon: "clock", href: "/provider-jobs" },
    { key: "packages", label: "Packages", icon: "box", href: "/provider-packages" },
    { key: "profile", label: "My Profile", icon: "user", href: "/provider-profile" },
  ],
};

const AppShell = {
  mount(activeKey) {
    const app = document.getElementById("app");
    if (!app) return;
    const me = Auth.user();
    if (!me) return;
    const links = SIDEBAR_LINKS_BY_ROLE[me.role] || [];

    const sidebarNav = links.map(l =>
      `<a href="${l.href}" class="${l.key === activeKey ? "active" : ""}" data-nav="${l.key}">${icon(l.icon)}<span>${l.label}</span></a>`
    ).join("");

    const mobileNav = [
      { key: "home", label: "Home", icon: "home", href: roleHome(me.role) },
      { key: me.role === "customer" ? "activity" : "requests", label: me.role === "customer" ? "Activity" : "Requests", icon: me.role === "customer" ? "calendar" : "inbox", href: me.role === "customer" ? "/activity" : "/provider-requests" },
      { key: "packages", label: "Packages", icon: "box", href: me.role === "customer" ? "/packages" : "/provider-packages" },
      { key: "profile", label: "Profile", icon: "user", href: me.role === "customer" ? "/profile" : "/provider-profile" },
    ].map(l =>
      `<a href="${l.href}" class="${l.key === activeKey || (activeKey === 'quickhire' && l.key === 'activity') ? "active" : ""}">${icon(l.icon)}<span>${l.label}</span></a>`
    ).join("");

    app.innerHTML = `
      <div class="app">
        <aside class="sidebar">
          <div class="brand">
            <span class="logo" aria-hidden="true">CN</span>
            <span>CrewNest<small>find your fixers & teams</small></span>
          </div>
          <nav class="side-nav" aria-label="Primary navigation">
            ${sidebarNav}
          </nav>
          <div class="side-foot">
            <div class="user-chip">
              <span class="avatar" aria-hidden="true">${initials(me.full_name)}</span>
              <span class="grow"><strong class="small">${esc(me.full_name)}</strong><small>${me.role === "customer" ? "Customer" : "Provider"}</small></span>
            </div>
            <button class="link" id="logout-btn">${icon("logout")} Sign out</button>
          </div>
        </aside>
        <div class="main" id="main"></div>
        <div class="footer">CrewNest · local services demo · data is fictitious</div>
        <nav class="mobile-nav" aria-label="Mobile navigation">${mobileNav}</nav>
      </div>
    `;

    document.getElementById("logout-btn").addEventListener("click", () => {
      Auth.clear();
      location.href = "/login";
    });
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

function money(n) {
  if (n == null) return "—";
  return "₹" + Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// Booking status label helper (lowercased key -> display text + badge class)
const STATUS_LABEL = {
  pending: "Pending",
  accepted: "Accepted",
  completion_requested: "Awaiting review",
  completed: "Completed",
  rejected: "Rejected",
  cancelled: "Cancelled",
};

function statusBadge(status) {
  const map = {
    pending: "pending", accepted: "accepted", completion_requested: "amber",
    completed: "completed", rejected: "error", cancelled: "neutral",
  };
  const cls = map[status] || "neutral";
  const label = STATUS_LABEL[status] || status;
  return `<span class="badge ${cls}">${label}</span>`;
}

// Render a rating line with empty state for "New" providers.
function ratingHtml(rating, count) {
  const label = rating == null
    ? `<span class="badge teal">New</span>`
    : `<span class="rating">★ ${Number(rating).toFixed(1)}</span> <span class="xsmall muted">(${count} review${count === 1 ? "" : "s"})</span>`;
  return label;
}
