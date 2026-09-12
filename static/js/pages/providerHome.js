// Provider home dashboard — premium command-center redesign.
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
    const today = bookings.filter(b => b.booking_date === todayISO && ["accepted", "pending", "completion_requested"].includes(b.status));
    const ongoing = bookings.filter(b => ["accepted", "completion_requested"].includes(b.status));
    const completed = bookings.filter(b => b.status === "completed");
    const jobsValue = completed.reduce((s, b) => s + (b.quoted_price || 0), 0);
    const first = (me.full_name || "Provider").split(" ")[0];

    el.innerHTML = `
      <section class="pv-hero">
        <div class="pv-hero-row">
          <div>
            <span class="pv-eyebrow">${icon("sparkles")} Provider workspace</span>
            <h1>Good work,<br>${esc(first)}.</h1>
            <p>Your requests, live jobs and service business are all in one place. Handle the next important task without hunting through screens.</p>
          </div>
          <div class="pv-availability">
            <strong><span class="pv-dot ${available ? "" : "off"}"></span>${available ? "Open for new work" : "Not taking new work"}</strong>
            <p class="xsmall" style="color:rgba(255,255,255,.62);margin:7px 0 0">Customers ${available ? "can" : "cannot"} currently book you.</p>
            <button class="btn ${available ? "ghost" : "primary"} sm" id="toggle-avail">${available ? "Pause bookings" : "Go available"}</button>
          </div>
        </div>
      </section>

      <section class="pv-kpis" aria-label="Provider overview">
        ${this._kpi(icon("inbox"), pending.length, "New requests")}
        ${this._kpi(icon("calendar"), today.length, "Scheduled today")}
        ${this._kpi(icon("clock"), ongoing.length, "Jobs in progress")}
        ${this._kpi(icon("check"), money(jobsValue), "Completed job value")}
      </section>

      <div class="pv-grid-2">
        <section class="pv-panel">
          <div class="pv-panel-head">
            <div><h2>Needs your attention</h2><div class="pv-panel-sub">Newest booking requests waiting for a response.</div></div>
            <a class="pv-link" href="/provider-requests">View all requests</a>
          </div>
          <div class="pv-task-list" id="pending-box">${this._pendingCards(pending.slice(0, 3))}</div>
        </section>

        <section class="pv-panel">
          <div class="pv-panel-head">
            <div><h2>Live jobs</h2><div class="pv-panel-sub">Accepted work and completion follow-ups.</div></div>
            <a class="pv-link" href="/provider-jobs">Open jobs</a>
          </div>
          <div class="pv-task-list" id="ongoing-box">${this._jobCards(ongoing.slice(0, 3))}</div>
        </section>
      </div>

      <section class="pv-panel" style="margin-top:18px">
        <div class="pv-panel-head">
          <div><h2>Your packages</h2><div class="pv-panel-sub">Turn repeat work into bookable service bundles and teams.</div></div>
          <a class="btn sm primary" href="/provider-packages">${icon("plus")} Manage packages</a>
        </div>
        <div id="pkg-box"><div class="pv-empty">Loading packages…</div></div>
      </section>
    `;

    document.getElementById("pkg-box").innerHTML = await this._pkgCards();
    el.querySelector("#toggle-avail").addEventListener("click", async () => {
      const btn = el.querySelector("#toggle-avail"); btn.disabled = true;
      try {
        await API.put("/api/providers/me", { available: !available });
        Toast.success(available ? "Bookings paused" : "You're available for booking");
        this.render();
      } catch (e) { Toast.error(e.message); btn.disabled = false; }
    });
  },

  _kpi(iconHtml, value, label) {
    return `<div class="pv-kpi"><span class="pv-kpi-icon">${iconHtml}</span><strong>${value}</strong><span>${label}</span></div>`;
  },

  _pendingCards(rows) {
    if (!rows.length) return `<div class="pv-empty"><strong>Inbox clear</strong>No new booking requests right now.</div>`;
    return rows.map(b => `
      <a class="pv-task" href="/provider-booking/${b.id}">
        <div><div class="pv-task-title">${esc(b.item_description)}</div><div class="pv-task-meta">${esc(b.customer_name)} · ${fmtDate(b.booking_date)} · ${esc(b.booking_time)}</div>
          <div class="pv-task-tags"><span class="pv-chip coral">${money(b.quoted_price)}</span>${b.package_type_snapshot ? `<span class="pv-chip">${esc(b.package_type_snapshot)}</span>` : ""}</div>
        </div><div class="pv-task-action"><span class="btn sm primary">Review</span></div>
      </a>`).join("");
  },

  _jobCards(rows) {
    if (!rows.length) return `<div class="pv-empty"><strong>Nothing active</strong>Your accepted jobs will appear here.</div>`;
    return rows.map(b => `
      <a class="pv-task" href="/provider-booking/${b.id}">
        <div><div class="pv-task-title">${esc(b.item_description)}</div><div class="pv-task-meta">${esc(b.customer_name)} · ${fmtDate(b.booking_date)} at ${esc(b.booking_time)}</div>
          <div class="pv-task-tags">${statusBadge(b.status)}<span class="pv-chip">${money(b.quoted_price)}</span></div>
        </div><div class="pv-task-action"><span class="btn sm ghost">Open job</span></div>
      </a>`).join("");
  },

  async _pkgCards() {
    let pkgs;
    try { pkgs = (await API.get("/api/providers/me/packages")).packages; }
    catch (e) { return `<div class="pv-empty">${esc(e.message)}</div>`; }
    if (!pkgs.length) return `<div class="pv-empty"><strong>No packages yet</strong>Create a bundle or team package to make larger jobs easier to book.<br><a class="btn sm primary mt-1" href="/provider-packages">Create package</a></div>`;
    return `<div class="pv-package-grid">${pkgs.slice(0, 4).map(p => `
      <article class="pv-package-card ${p.package_type}">
        <div class="between"><span class="pv-chip ${p.package_type === "team" ? "coral" : "mint"}">${p.package_type === "team" ? "Team" : "Multitasking"}</span><span class="xsmall muted">${esc(p.status)}</span></div>
        <h3>${esc(p.name)}</h3><p class="xsmall muted">${p.service_count} services · ${p.member_count ? p.member_count + " members" : "solo delivery"}</p>
        <div class="pv-package-rate">${money(p.hourly_rate)}<small>/hr</small></div>
      </article>`).join("")}</div>`;
  },
};
