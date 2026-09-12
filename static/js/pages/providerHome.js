// CrewNest NX provider home — compact mission-control workspace.
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
    const nextJob = [...today, ...active, ...review].sort((a,b) => String(a.booking_date+a.booking_time).localeCompare(String(b.booking_date+b.booking_time)))[0] || null;

    el.innerHTML = `
      <div class="nx-topline">
        <div class="nx-title-wrap">
          <div class="nx-kicker"><i></i> CrewNest NX · Provider</div>
          <h1 class="nx-title">Good evening, ${esc(first)}.</h1>
          <p class="nx-sub">Everything that needs your attention, without the noise.</p>
        </div>
        <div class="nx-top-actions">
          <span class="nx-pill ${available ? "live" : ""}">${available ? "Bookable" : "Bookings paused"}</span>
          <button class="nx-btn ${available ? "light" : "lime"}" id="toggle-avail">${available ? "Pause bookings" : "Go live"}</button>
        </div>
      </div>

      <section class="nx-home-grid">
        <article class="nx-card dark nx-today">
          <div class="nx-greeting">TODAY · ${new Date().toLocaleDateString("en-IN", {weekday:"long", day:"numeric", month:"short"})}</div>
          <h1>${pending.length ? `${pending.length} request${pending.length===1?"":"s"} waiting.` : active.length || review.length ? `${active.length + review.length} live job${active.length + review.length===1?"":"s"}.` : `Your board is <span>clear.</span>`}</h1>
          <p>${pending.length ? "Review new work before the slot is taken." : active.length || review.length ? "Keep active work moving and close completed jobs cleanly." : "You’re ready for the next booking."}</p>
          <div class="nx-quick">
            <a href="/provider-requests">${icon("inbox")} Inbox <b>${pending.length}</b></a>
            <a href="/provider-jobs">${icon("clock")} Jobs <b>${active.length + review.length}</b></a>
            <a href="/provider-packages">${icon("box")} Studio</a>
          </div>
        </article>

        <aside class="nx-card lime nx-focus">
          <div class="nx-focus-head"><span class="nx-focus-label">NEXT MOVE</span><span>${icon("sparkles")}</span></div>
          ${nextJob ? `
            <div><h2>${esc(nextJob.item_description)}</h2><p>${esc(nextJob.customer_name)} · ${fmtDate(nextJob.booking_date)} · ${esc(nextJob.booking_time)}</p></div>
            <div class="nx-focus-foot"><div><small>Quote</small><strong>${money(nextJob.quoted_price)}</strong></div><a class="nx-btn dark" href="/provider-booking/${nextJob.id}">Open job</a></div>
          ` : `
            <div><h2>No urgent work.</h2><p>Your next request or accepted booking will appear here.</p></div>
            <div class="nx-focus-foot"><div><small>Status</small><strong>${available ? "Ready" : "Paused"}</strong></div><a class="nx-btn dark" href="/provider-requests">Open inbox</a></div>
          `}
        </aside>
      </section>

      <section class="nx-statline" aria-label="Provider summary">
        <div class="nx-card nx-stat"><small>New requests</small><strong>${pending.length}</strong><em>waiting</em></div>
        <div class="nx-card nx-stat"><small>Today</small><strong>${today.length}</strong><em>scheduled</em></div>
        <div class="nx-card nx-stat"><small>Active</small><strong>${active.length + review.length}</strong><em>in motion</em></div>
        <div class="nx-card nx-stat"><small>Completed value</small><strong>${money(jobsValue)}</strong><em>historical</em></div>
      </section>

      <section class="nx-home-lower">
        <article class="nx-card nx-section">
          <div class="nx-section-head"><h2>Inbox</h2><a href="/provider-requests">View all</a></div>
          <div class="nx-mini-list">${this._requestItems(pending.slice(0,4))}</div>
        </article>
        <article class="nx-card nx-section">
          <div class="nx-section-head"><h2>Live work</h2><a href="/provider-jobs">Open jobs</a></div>
          <div class="nx-mini-list">${this._jobItems([...active, ...review].slice(0,4))}</div>
        </article>
      </section>

      <section class="nx-card nx-studio-strip">
        <div><h2>Service studio</h2><p>Package your repeat work into clear customer offers.</p></div>
        <div id="pkg-box" class="nx-package-mini"><div class="nx-empty" style="min-height:70px;min-width:180px"><span>Loading…</span></div></div>
        <a class="nx-btn primary" href="/provider-packages">Manage studio</a>
      </section>
    `;

    document.getElementById("pkg-box").innerHTML = await this._pkgCards();
    el.querySelector("#toggle-avail").addEventListener("click", async () => {
      const btn = el.querySelector("#toggle-avail"); btn.disabled = true;
      try {
        await API.put("/api/providers/me", { available: !available });
        Toast.success(available ? "Bookings paused" : "You're live for bookings");
        this.render();
      } catch (e) { Toast.error(e.message); btn.disabled = false; }
    });
  },

  _requestItems(rows) {
    if (!rows.length) return `<div class="nx-empty"><div><strong>Inbox zero</strong><span>No new requests right now.</span></div></div>`;
    return rows.map(b => `<a class="nx-mini-item" href="/provider-booking/${b.id}"><span class="nx-mini-icon">${icon("inbox")}</span><div><strong>${esc(b.item_description)}</strong><small>${esc(b.customer_name)} · ${fmtDate(b.booking_date)}</small></div><b>${money(b.quoted_price)}</b></a>`).join("");
  },

  _jobItems(rows) {
    if (!rows.length) return `<div class="nx-empty"><div><strong>No live jobs</strong><span>Accepted work will appear here.</span></div></div>`;
    return rows.map(b => `<a class="nx-mini-item" href="/provider-booking/${b.id}"><span class="nx-mini-icon">${icon("clock")}</span><div><strong>${esc(b.item_description)}</strong><small>${STATUS_LABEL[b.status] || b.status} · ${fmtDate(b.booking_date)}</small></div><b>${money(b.quoted_price)}</b></a>`).join("");
  },

  async _pkgCards() {
    let pkgs;
    try { pkgs = (await API.get("/api/providers/me/packages")).packages; }
    catch (e) { return `<div class="nx-empty" style="min-height:70px"><span>${esc(e.message)}</span></div>`; }
    if (!pkgs.length) return `<div class="nx-empty" style="min-height:70px"><span>No packages yet.</span></div>`;
    return pkgs.slice(0,3).map(p => `<a href="/provider-packages"><span>${p.package_type === "team" ? "TEAM" : "MULTI"}</span><strong>${esc(p.name)}</strong><small>${p.service_count} services · ${money(p.hourly_rate)}/hr</small></a>`).join("");
  },
};
