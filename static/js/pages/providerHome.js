// Provider home — premium provider command center with live work state.
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
      prof = p;
      bookings = b.bookings;
    } catch (e) { showFatal(e, el); return; }

    const available = prof.profile.available;
    const todayISO = new Date().toISOString().slice(0, 10);
    const pending = bookings.filter(b => b.status === "pending");
    const accepted = bookings.filter(b => b.status === "accepted");
    const review = bookings.filter(b => b.status === "completion_requested");
    const today = bookings.filter(b => b.booking_date === todayISO && ["accepted","pending","completion_requested"].includes(b.status));
    const ongoing = bookings.filter(b => ["accepted","completion_requested"].includes(b.status));
    const completed = bookings.filter(b => b.status === "completed");
    const jobsValue = completed.reduce((s, b) => s + (b.quoted_price || 0), 0);
    const first = (me.full_name || "Provider").split(" ")[0];
    const nextJob = [...today, ...ongoing]
      .sort((a,b) => String(a.booking_date + a.booking_time).localeCompare(String(b.booking_date + b.booking_time)))[0] || null;

    el.innerHTML = `
      <section class="pv-home-head">
        <div>
          <span class="pv-studio-label">${icon("sparkles")} PROVIDER WORKSPACE</span>
          <h1>Hi ${esc(first)}, here’s your workday.</h1>
          <p>Requests, active jobs and service products — without the clutter.</p>
        </div>
        <div class="pv-home-shortcuts">
          <a href="/provider-requests">${icon("inbox")} Requests <b>${pending.length}</b></a>
          <a href="/provider-jobs">${icon("clock")} Jobs <b>${ongoing.length}</b></a>
          <a href="/provider-packages">${icon("box")} Studio</a>
        </div>
      </section>

      <section class="pv-command-grid">
        <article class="pv-focus-card">
          <div class="pv-focus-top">
            <span class="pv-now-status"><i class="${available ? "on" : ""}"></i>${available ? "Open for bookings" : "Bookings paused"}</span>
            <button id="toggle-avail">${available ? "Pause" : "Go live"}</button>
          </div>
          ${nextJob ? `
            <div class="pv-focus-label">NEXT JOB</div>
            <h2>${esc(nextJob.item_description)}</h2>
            <p>${esc(nextJob.customer_name)} · ${fmtDate(nextJob.booking_date)} at ${esc(nextJob.booking_time)}</p>
            <div class="pv-focus-meta">
              <span>${statusBadge(nextJob.status)}</span>
              <strong>${money(nextJob.quoted_price)}</strong>
            </div>
            <a class="pv-focus-link" href="/provider-booking/${nextJob.id}">Open job ${icon("clock")}</a>
          ` : `
            <div class="pv-focus-label">YOU’RE CLEAR</div>
            <h2>No active job right now.</h2>
            <p>New accepted work will appear here first.</p>
            <div class="pv-focus-meta"><span>${pending.length ? `${pending.length} request${pending.length === 1 ? "" : "s"} waiting` : "Inbox clear"}</span><strong>${money(jobsValue)}</strong></div>
            <a class="pv-focus-link" href="/provider-requests">Check requests ${icon("inbox")}</a>
          `}
        </article>

        <article class="pv-pulse-card">
          <div class="pv-pulse-head"><div><span>TODAY</span><h2>Work pulse</h2></div><small>${today.length} scheduled today</small></div>
          <div class="pv-pulse-metrics">
            <div><strong>${pending.length}</strong><span>Requests</span></div>
            <div><strong>${ongoing.length}</strong><span>Live jobs</span></div>
            <div><strong>${completed.length}</strong><span>Completed</span></div>
            <div><strong>${money(jobsValue)}</strong><span>Total value</span></div>
          </div>
          <div class="pv-pipeline" aria-label="Booking workflow">
            ${this._pipelineStep("Request", pending.length, pending.length > 0, "01")}
            ${this._pipelineStep("Accepted", accepted.length, accepted.length > 0, "02")}
            ${this._pipelineStep("Review", review.length, review.length > 0, "03")}
            ${this._pipelineStep("Done", completed.length, completed.length > 0, "04")}
          </div>
        </article>
      </section>

      <section class="pv-workboard">
        <div class="pv-work-column pv-work-urgent">
          <div class="pv-work-head"><div><span>01</span><h2>Needs attention</h2></div><a href="/provider-requests">All requests</a></div>
          <div class="pv-stack">${this._pendingCards(pending.slice(0, 4))}</div>
        </div>
        <div class="pv-work-column">
          <div class="pv-work-head"><div><span>02</span><h2>In motion</h2></div><a href="/provider-jobs">All jobs</a></div>
          <div class="pv-stack">${this._jobCards(ongoing.slice(0, 4))}</div>
        </div>
      </section>

      <section class="pv-package-band">
        <div class="pv-package-band-copy"><span>03</span><h2>Service studio</h2><p>Turn repeatable work into clear packages customers can book.</p></div>
        <div id="pkg-box" class="pv-package-band-list"><div class="pv-zero"><strong>Loading packages…</strong></div></div>
        <a class="pv-package-cta" href="/provider-packages">Manage studio ${icon("plus")}</a>
      </section>
    `;

    document.getElementById("pkg-box").innerHTML = await this._pkgCards();
    el.querySelector("#toggle-avail").addEventListener("click", async () => {
      const btn = el.querySelector("#toggle-avail");
      btn.disabled = true;
      try {
        await API.put("/api/providers/me", { available: !available });
        Toast.success(available ? "Bookings paused" : "You're available for booking");
        this.render();
      } catch (e) { Toast.error(e.message); btn.disabled = false; }
    });
  },

  _pipelineStep(label, count, active, index) {
    return `<div class="pv-pipeline-step ${active ? "active" : ""}"><span>${index}</span><i></i><div><strong>${count}</strong><small>${label}</small></div></div>`;
  },

  _pendingCards(rows) {
    if (!rows.length) return `<div class="pv-zero"><span>✓</span><strong>Inbox clear</strong><small>No new requests need your attention.</small></div>`;
    return rows.map((b, i) => `
      <a class="pv-work-card" href="/provider-booking/${b.id}">
        <span class="pv-work-index">0${i + 1}</span>
        <div class="pv-work-body"><strong>${esc(b.item_description)}</strong><small>${esc(b.customer_name)} · ${fmtDate(b.booking_date)} at ${esc(b.booking_time)}</small></div>
        <div class="pv-work-price">${money(b.quoted_price)}<span>Review →</span></div>
      </a>`).join("");
  },

  _jobCards(rows) {
    if (!rows.length) return `<div class="pv-zero"><span>•</span><strong>Nothing live</strong><small>Accepted jobs will appear here.</small></div>`;
    return rows.map((b, i) => `
      <a class="pv-work-card" href="/provider-booking/${b.id}">
        <span class="pv-work-index">0${i + 1}</span>
        <div class="pv-work-body"><strong>${esc(b.item_description)}</strong><small>${esc(b.customer_name)} · ${fmtDate(b.booking_date)} at ${esc(b.booking_time)}</small></div>
        <div class="pv-work-price">${money(b.quoted_price)}<span>${STATUS_LABEL[b.status] || b.status} →</span></div>
      </a>`).join("");
  },

  async _pkgCards() {
    let pkgs;
    try { pkgs = (await API.get("/api/providers/me/packages")).packages; }
    catch (e) { return `<div class="pv-zero"><strong>${esc(e.message)}</strong></div>`; }
    if (!pkgs.length) return `<div class="pv-zero"><strong>No packages yet</strong><small>Create your first package to showcase bundled work.</small></div>`;
    return pkgs.slice(0, 3).map(p => `
      <a class="pv-mini-package" href="/provider-packages">
        <span>${p.package_type === "team" ? "TEAM" : "MULTI"}</span>
        <strong>${esc(p.name)}</strong>
        <small>${p.service_count} services · ${money(p.hourly_rate)}/hr</small>
      </a>`).join("");
  },
};
