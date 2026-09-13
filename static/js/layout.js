// Shared app shell rendering: sidebar nav, mobile nav, page header, footer.
// Pages call AppShell.mount(activeNav) inside their render().
const SIDEBAR_LINKS_BY_ROLE = {
  customer: [
    { key: "home", label: "Home", icon: "home", href: "/home" },
    { key: "quickhire", label: "Quick Hire", icon: "book", href: "/quickhire" },
    { key: "prebook", label: "Pre-book", icon: "calendar", href: "/prebook" },
    { key: "guides", label: "Goal Guide", icon: "box", href: "/guide" },
    { key: "packages", label: "Packages", icon: "box", href: "/packages" },
    { key: "activity", label: "My Activity", icon: "calendar", href: "/activity" },
    { key: "profile", label: "Profile", icon: "user", href: "/profile" },
  ],
  provider: [
    { key: "home", label: "Home", icon: "home", href: "/provider-home" },
    { key: "quickhire", label: "Quick Hire", icon: "book", href: "/quickhire" },
    { key: "prebook", label: "Pre-book", icon: "calendar", href: "/prebook" },
    { key: "activity", label: "My Bookings", icon: "calendar", href: "/activity" },
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

    const mobileLinks = me.role === "provider" ? [
      { key: "home", label: "Home", icon: "home", href: "/provider-home" },
      { key: "quickhire", label: "Hire", icon: "book", href: "/quickhire" },
      { key: "prebook", label: "Pre-book", icon: "calendar", href: "/prebook" },
      { key: "requests", label: "Requests", icon: "inbox", href: "/provider-requests" },
      { key: "profile", label: "Profile", icon: "user", href: "/provider-profile" },
    ] : [
      { key: "home", label: "Home", icon: "home", href: "/home" },
      { key: "quickhire", label: "Hire", icon: "book", href: "/quickhire" },
      { key: "prebook", label: "Pre-book", icon: "calendar", href: "/prebook" },
      { key: "activity", label: "Activity", icon: "clock", href: "/activity" },
      { key: "profile", label: "Profile", icon: "user", href: "/profile" },
    ];
    const mobileNav = mobileLinks.map(l =>
      `<a href="${l.href}" class="${l.key === activeKey ? "active" : ""}">${icon(l.icon)}<span>${l.label}</span></a>`
    ).join("");

    app.innerHTML = `
      <div class="app mi-root mi-role-${esc(me.role)}">
        <aside class="sidebar">
          <div class="brand">
            <span class="logo" aria-hidden="true"><span>JH</span></span>
            <span>JobHustle<small>LOCAL SERVICES, COORDINATED</small></span>
          </div>
          <div class="network-status"><span class="network-pulse"></span><span>Available across Goa</span><strong>Live</strong></div>
          <nav class="side-nav" aria-label="Primary navigation">
            ${sidebarNav}
          </nav>
          <div class="side-signal" aria-hidden="true">
            <span>NETWORK</span><b></b><b></b><b></b><b></b><b></b>
          </div>
          <div class="side-foot">
            <div class="user-chip">
              <span class="avatar" aria-hidden="true">${initials(me.full_name)}</span>
              <span class="grow"><strong class="small">${esc(me.full_name)}</strong><small>${me.role === "customer" ? "Customer" : "Provider"}</small></span>
            </div>
            <button class="link" id="logout-btn">${icon("logout")} Sign out</button>
          </div>
        </aside>
        <div class="main" id="main">
          <div class="system-strip" aria-hidden="true"><span>VETTED LOCAL TALENT</span><i></i><span>TRANSPARENT PRICING</span><i></i><span>ONE SIMPLE BOOKING</span></div>
        </div>
        <div class="footer"><span>JobHustle · local services, thoughtfully coordinated</span><span>Goa, India</span></div>
        <nav class="mobile-nav" aria-label="Mobile navigation">${mobileNav}</nav>
      </div>
    `;

    NotificationCenter.mount();

    document.getElementById("logout-btn").addEventListener("click", () => {
      Auth.clear();
      location.href = "/login";
    });
  },

  page(head) {
    const main = document.getElementById("main");
    main.innerHTML = `<div class="system-strip" aria-hidden="true"><span>VETTED LOCAL TALENT</span><i></i><span>TRANSPARENT PRICING</span><i></i><span>ONE SIMPLE BOOKING</span></div><div class="page-head">${head}</div><div id="content"></div>`;
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

// Shared, role-neutral booking progress used by customer and provider views.
// Terminal states keep the original request visible while clearly explaining
// that the normal progress path has stopped.
function bookingTimelineHtml(status) {
  const steps = [
    { label: "Request sent", note: "Provider notified" },
    { label: "Confirmed", note: "Booking accepted" },
    { label: "Work review", note: "Completion check" },
    { label: "Completed", note: "Job approved" },
  ];
  const activeByStatus = {
    pending: 0,
    accepted: 1,
    completion_requested: 2,
    completed: 3,
    rejected: 0,
    cancelled: 0,
  };
  const active = activeByStatus[status] ?? 0;
  const stopped = status === "rejected" || status === "cancelled";
  const stateCopy = {
    pending: "Waiting for provider confirmation",
    accepted: "Confirmed and ready to begin",
    completion_requested: "Work finished — customer review needed",
    completed: "Service successfully completed",
    rejected: "Provider was unavailable for this request",
    cancelled: "This request was cancelled",
  }[status] || "Booking progress";

  return `
    <section class="booking-tracker ${stopped ? "stopped" : ""}" aria-label="Booking progress">
      <div class="booking-tracker-head">
        <div><span class="page-kicker"><span></span> Live booking status</span><h3>${esc(stateCopy)}</h3></div>
        <span class="booking-tracker-live"><i></i>${stopped ? "Closed" : "Live"}</span>
      </div>
      <div class="booking-tracker-steps">
        ${steps.map((step, index) => {
          const cls = index < active ? "done" : index === active ? "current" : "";
          return `<div class="booking-tracker-step ${cls}">
            <span class="booking-tracker-dot">${index < active || status === "completed" ? "✓" : index + 1}</span>
            <strong>${esc(step.label)}</strong>
            <small>${esc(step.note)}</small>
          </div>`;
        }).join("")}
      </div>
      ${stopped ? `<p class="booking-tracker-stop">${status === "rejected" ? "Try Quick Hire again to instantly choose another available professional." : "No further action is required for this request."}</p>` : ""}
    </section>`;
}

// Render a rating line with empty state for "New" providers.
function ratingHtml(rating, count) {
  const label = rating == null
    ? `<span class="badge teal">New</span>`
    : `<span class="rating">★ ${Number(rating).toFixed(1)}</span> <span class="xsmall muted">(${count} review${count === 1 ? "" : "s"})</span>`;
  return label;
}
