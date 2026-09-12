// Provider home — open work canvas, no dashboard hero banner.
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
    const ongoing = bookings.filter(b => ["accepted","completion_requested"].includes(b.status));
    const completed = bookings.filter(b => b.status === "completed");
    const jobsValue = completed.reduce((s, b) => s + (b.quoted_price || 0), 0);
    const first = (me.full_name || "Provider").split(" ")[0];
    const nextJob = [...today, ...ongoing].sort((a,b) => String(a.booking_date+a.booking_time).localeCompare(String(b.booking_date+b.booking_time)))[0] || null;

    el.innerHTML = `
      <section class="pv-workboard" style="align-items:stretch;margin-bottom:14px">
        <div class="pv-work-column" style="background:transparent;border:0;padding:10px 4px 8px 2px">
          <span class="pv-studio-label">${icon("sparkles")} PROVIDER STUDIO</span>
          <h1 style="font-size:clamp(2.6rem,4.4vw,4.5rem);line-height:.94;letter-spacing:-.06em;margin:16px 0 14px;max-width:720px">${esc(first)}, here’s your <span style="color:var(--cn-coral)">workday.</span></h1>
          <p style="max-width:620px;color:var(--cn-muted);font-size:.92rem;line-height:1.6;margin:0">Requests, active jobs and service products in one place.</p>
          <div class="pv-quick-links" style="margin-top:20px">
            <a href="/provider-requests">${icon("inbox")} Requests <b>${pending.length}</b></a>
            <a href="/provider-jobs">${icon("clock")} Live jobs <b>${ongoing.length}</b></a>
            <a href="/provider-packages">${icon("box")} Studio</a>
          </div>
        </div>

        <aside class="pv-now-card" style="border-radius:24px;min-height:260px">
          <div class="pv-now-top">
            <span class="pv-now-status"><i class="${available ? "on" : ""}"></i>${available ? "Bookable" : "Paused"}</span>
            <button id="toggle-avail">${available ? "Pause" : "Go live"}</button>
          </div>
          ${nextJob ? `
            <div class="pv-next-label">NEXT UP</div>
            <h3>${esc(nextJob.item_description)}</h3>
            <p>${fmtDate(nextJob.booking_date)} · ${esc(nextJob.booking_time)}</p>
            <div class="pv-next-meta"><span>${esc(nextJob.customer_name)}</span><strong>${money(nextJob.quoted_price)}</strong></div>
            <a class="pv-now-open" href="/provider-booking/${nextJob.id}">Open job ${icon("clock")}</a>
          ` : `
            <div class="pv-next-label">YOU’RE CLEAR</div>
            <h3>No active job right now.</h3>
            <p>Your next accepted booking will land here.</p>
            <a class="pv-now-open" href="/provider-requests">Check requests ${icon("inbox")}</a>
          `}
        </aside>
      </section>

      <section class="pv-metric-strip" aria-label="Provider summary">
        <div><span>Requests</span><strong>${pending.length}</strong><small>waiting</small></div>
        <div><span>Today</span><strong>${today.length}</strong><small>scheduled</small></div>
        <div><span>Active</span><strong>${ongoing.length}</strong><small>in progress</small></div>
        <div><span>Completed value</span><strong>${money(jobsValue)}</strong><small>historical quote total</small></div>
      </section>

      <section class="pv-workboard">
        <div class="pv-work-column pv-work-urgent">
          <div class="pv-work-head"><div><span>01</span><h2>Act now</h2></div><a href="/provider-requests">All requests</a></div>
          <div class="pv-stack">${this._pendingCards(pending.slice(0, 4))}</div>
        </div>
        <div class="pv-work-column">
          <div class="pv-work-head"><div><span>02</span><h2>In motion</h2></div><a href="/provider-jobs">All jobs</a></div>
          <div class="pv-stack">${this._jobCards(ongoing.slice(0, 4))}</div>
        </div>
      </section>

      <section class="pv-package-band">
        <div class="pv-package-band-copy"><span>03</span><h2>Your service products</h2><p>Packages turn repeatable work into clear, professional offers.</p></div>
        <div id="pkg-box" class="pv-package-band-list"><div class="pv-zero"><strong>Loading packages…</strong></div></div>
        <a class="pv-package-cta" href="/provider-packages">Manage studio ${icon("plus")}</a>
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
