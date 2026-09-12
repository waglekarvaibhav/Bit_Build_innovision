// Provider overview — clean SaaS dashboard inspired by modern 21st.dev app templates.
const ProviderHome = {
  async render() {
    if (!requireRole("provider")) return;
    const me = Auth.user();
    mountShell("home");
    const page = AppShell.page("");
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let prof, bookings;
    try {
      const [p, b] = await Promise.all([
        API.get("/api/providers/me"),
        API.get("/api/providers/bookings"),
      ]);
      prof = p; bookings = b.bookings;
    } catch (e) { showFatal(e, el); return; }

    const available = prof.profile.available;
    const todayISO = new Date().toISOString().slice(0, 10);
    const pending = bookings.filter(b => b.status === "pending");
    const today = bookings.filter(b => b.booking_date === todayISO && ["accepted","pending","completion_requested"].includes(b.status));
    const active = bookings.filter(b => b.status === "accepted");
    const review = bookings.filter(b => b.status === "completion_requested");
    const completed = bookings.filter(b => b.status === "completed");
    const jobsValue = completed.reduce((s, b) => s + (b.quoted_price || 0), 0);
    const first = (me.full_name || "Provider").split(" ")[0];
    const upcoming = [...active, ...review]
      .sort((a,b) => String(a.booking_date+a.booking_time).localeCompare(String(b.booking_date+b.booking_time)))
      .slice(0, 4);

    el.innerHTML = `
      <header class="nx-pagehead">
        <div>
          <div class="nx-eyebrow">Provider overview</div>
          <h1>Welcome back, ${esc(first)}</h1>
          <p>Here’s what’s happening with your work today.</p>
        </div>
        <div class="nx-page-actions">
          <span class="nx-status-dot ${available ? "online" : ""}">${available ? "Available for bookings" : "Bookings paused"}</span>
          <button class="nx-btn secondary" id="toggle-avail">${available ? "Pause bookings" : "Go available"}</button>
        </div>
      </header>

      <section class="nx-metrics">
        ${this._metric("inbox", "New requests", pending.length, "Waiting for response", pending.length ? "accent" : "")}
        ${this._metric("calendar", "Today", today.length, "Scheduled bookings", "")}
        ${this._metric("clock", "Active jobs", active.length + review.length, "In progress", "")}
        ${this._metric("box", "Completed value", money(jobsValue), "All completed work", "")}
      </section>

      <section class="nx-overview-grid">
        <article class="nx-surface nx-upcoming-card">
          <div class="nx-section-title">
            <div><span class="nx-section-icon">${icon("calendar")}</span><div><h2>Upcoming work</h2><p>Your next accepted jobs and completion follow-ups.</p></div></div>
            <a href="/provider-jobs">View all</a>
          </div>
          <div class="nx-agenda">${this._agenda(upcoming)}</div>
        </article>

        <article class="nx-surface nx-availability-card">
          <div class="nx-availability-top">
            <span class="nx-label">Availability</span>
            <span class="nx-live-indicator ${available ? "on" : ""}"></span>
          </div>
          <div class="nx-availability-main">
            <h2>${available ? "You’re open for work" : "Bookings are paused"}</h2>
            <p>${available ? "Customers can currently find and book your services." : "Your profile is visible, but new bookings are disabled."}</p>
          </div>
          <button class="nx-btn ${available ? "ghost-dark" : "primary"}" id="toggle-avail-card">${available ? "Pause availability" : "Start accepting work"}</button>
        </article>

        <article class="nx-surface nx-requests-card">
          <div class="nx-section-title compact">
            <div><span class="nx-section-icon soft">${icon("inbox")}</span><div><h2>Requests</h2><p>${pending.length ? `${pending.length} need your attention` : "You’re all caught up"}</p></div></div>
            <a href="/provider-requests">Open inbox</a>
          </div>
          <div class="nx-request-preview">${this._requestPreview(pending.slice(0,3))}</div>
        </article>

        <article class="nx-surface nx-packages-card">
          <div class="nx-section-title compact">
            <div><span class="nx-section-icon soft">${icon("box")}</span><div><h2>Packages</h2><p>Manage your service bundles and teams.</p></div></div>
            <a href="/provider-packages">Manage</a>
          </div>
          <div id="pkg-box" class="nx-package-preview"><div class="nx-empty-mini">Loading packages…</div></div>
        </article>
      </section>
    `;

    document.getElementById("pkg-box").innerHTML = await this._packages();

    const toggle = async (btn) => {
      btn.disabled = true;
      try {
        await API.put("/api/providers/me", { available: !available });
        Toast.success(available ? "Bookings paused" : "You’re available for bookings");
        this.render();
      } catch (e) { Toast.error(e.message); btn.disabled = false; }
    };
    el.querySelector("#toggle-avail").addEventListener("click", e => toggle(e.currentTarget));
    el.querySelector("#toggle-avail-card").addEventListener("click", e => toggle(e.currentTarget));
  },

  _metric(iconName, label, value, note, extra) {
    return `<article class="nx-metric ${extra}"><span class="nx-metric-icon">${icon(iconName)}</span><div><small>${label}</small><strong>${value}</strong><span>${note}</span></div></article>`;
  },

  _agenda(rows) {
    if (!rows.length) return `<div class="nx-empty-state"><span class="nx-empty-icon">${icon("calendar")}</span><strong>No upcoming jobs</strong><p>Accepted bookings will appear here.</p></div>`;
    return rows.map((b, i) => `<a class="nx-agenda-row" href="/provider-booking/${b.id}">
      <div class="nx-agenda-date"><strong>${new Date(b.booking_date).toLocaleDateString("en-IN",{day:"2-digit"})}</strong><span>${new Date(b.booking_date).toLocaleDateString("en-IN",{month:"short"})}</span></div>
      <div class="nx-agenda-copy"><strong>${esc(b.item_description)}</strong><span>${esc(b.customer_name)} · ${esc(b.booking_time)}</span></div>
      <span class="nx-agenda-status">${STATUS_LABEL[b.status] || b.status}</span>
      <b>${money(b.quoted_price)}</b>
    </a>`).join("");
  },

  _requestPreview(rows) {
    if (!rows.length) return `<div class="nx-empty-state small"><span class="nx-empty-icon">${icon("inbox")}</span><strong>Inbox clear</strong><p>New requests will appear here.</p></div>`;
    return rows.map(b => `<a href="/provider-booking/${b.id}" class="nx-request-preview-row"><span class="nx-avatar-sm">${initials(b.customer_name)}</span><div><strong>${esc(b.customer_name)}</strong><span>${esc(b.item_description)}</span></div><b>${money(b.quoted_price)}</b></a>`).join("");
  },

  async _packages() {
    try {
      const pkgs = (await API.get("/api/providers/me/packages")).packages;
      if (!pkgs.length) return `<div class="nx-empty-state small"><span class="nx-empty-icon">${icon("box")}</span><strong>No packages yet</strong><p>Create your first service bundle.</p></div>`;
      return pkgs.slice(0,3).map(p => `<a href="/provider-packages" class="nx-package-row"><span class="nx-package-badge">${p.package_type === "team" ? "Team" : "Multi"}</span><div><strong>${esc(p.name)}</strong><span>${p.service_count} services</span></div><b>${money(p.hourly_rate)}/hr</b></a>`).join("");
    } catch (e) { return `<div class="nx-empty-mini">${esc(e.message)}</div>`; }
  },
};
