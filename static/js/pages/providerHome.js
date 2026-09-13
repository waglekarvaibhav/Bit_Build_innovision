// Provider home dashboard — availability control, incoming requests,
// today's work, ongoing jobs, and package management. Primary next action
// is always visible.
const ProviderHome = {
  async render() {
    if (!requireRole("provider")) return;
    const me = Auth.user();
    const shell = mountShell("home");
    const head = `<div class="page-kicker"><span></span> Provider workspace</div><h1>Welcome back, ${esc(Auth.user().full_name.split(" ")[0])}</h1><p>Manage requests, stay on top of active work and keep your business moving.</p>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    const packagesPromise = this._pkgCards();
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

    const stat = (num, label) => `<div class="stat"><div class="stat-num">${num}</div><div class="xsmall muted">${label}</div></div>`;

    el.innerHTML = `
      <div class="card slim">
        <div class="between">
          <div class="row">
            <span class="badge ${available ? "success" : "neutral"}" style="font-size:var(--fs-xs)">${available ? "Available for booking" : "Unavailable"}</span>
          </div>
          <button class="btn ${available ? "ghost" : "primary"} sm" id="toggle-avail">${available ? "Turn off availability" : "Turn on availability"}</button>
        </div>
      </div>
      <div class="provider-hire-callout">
        <div><span class="page-kicker"><span></span> Need another specialist?</span><h3>Providers need help too.</h3><p>Book another trusted professional without switching accounts.</p></div>
        <div class="provider-hire-actions"><a class="btn" href="/quickhire">${icon("book")} Quick Hire</a><a class="btn ghost" href="/prebook">Pre-book</a><a class="btn ghost" href="/activity">My bookings</a></div>
      </div>
      <div class="stats-row mt-1">
        ${stat(pending.length, "Incoming requests")}
        ${stat(today.length, "Today's work")}
        ${stat(ongoing.length, "Ongoing jobs")}
        ${stat(money(jobsValue), "Completed job value")}
      </div>
      <p class="xsmall muted">“Completed job value” reflects the agreed value of jobs you actually completed — not cash you've received.</p>

      <div class="between mt-2">
        <h3 style="margin:0">Incoming requests</h3>
        <a class="btn sm ghost" href="/provider-requests">View all</a>
      </div>
      <div id="pending-box">${this._pendingCards(pending.slice(0, 3))}</div>

      <div class="between mt-2">
        <h3 style="margin:0">Ongoing jobs</h3>
        <a class="btn sm ghost" href="/provider-jobs">View all</a>
      </div>
      <div id="ongoing-box">${this._jobCards(ongoing.slice(0, 3))}</div>

      <div class="between mt-2">
        <h3 style="margin:0">My packages</h3>
        <a class="btn sm primary" href="/provider-packages">${icon("plus")} Manage</a>
      </div>
      <div id="pkg-box"><div class="state-box"><div class="spinner"></div></div></div>
    `;

    document.getElementById("pkg-box").innerHTML = await packagesPromise;

    el.querySelector("#toggle-avail").addEventListener("click", async () => {
      try {
        await API.put("/api/providers/me", { available: !available });
        Toast.success(available ? "You're now unavailable" : "You're now available");
        this.render();
      } catch (e) { Toast.error(e.message); }
    });
  },

  _pendingCards(rows) {
    if (!rows.length) return `<div class="state-box"><div class="big">📭</div><p>No incoming requests.</p></div>`;
    return rows.map(b => `
      <a class="list-item" href="/provider-booking/${b.id}" style="text-decoration:none;color:inherit">
        <div class="grow">
          <div class="between"><strong>${esc(b.item_description)}</strong> ${statusBadge(b.status)}</div>
          <div class="meta">${esc(b.customer_name)} · ${money(b.quoted_price)}</div>
        </div>
        <span class="btn sm primary">Review</span>
      </a>`).join("");
  },

  _jobCards(rows) {
    if (!rows.length) return `<div class="state-box"><div class="big">✅</div><p>No ongoing jobs right now.</p></div>`;
    return rows.map(b => `
      <a class="list-item" href="/provider-booking/${b.id}" style="text-decoration:none;color:inherit">
        <div class="grow">
          <div class="between"><strong>${esc(b.item_description)}</strong> ${statusBadge(b.status)}</div>
          <div class="meta">${fmtDate(b.booking_date)} at ${esc(b.booking_time)} · ${esc(b.customer_name)}</div>
        </div>
        <span class="btn sm ghost">Open</span>
      </a>`).join("");
  },

  async _pkgCards() {
    let pkgs;
    try { pkgs = (await API.get("/api/providers/me/packages")).packages; }
    catch (e) { return `<div class="state-box">${esc(e.message)}</div>`; }
    if (!pkgs.length) return `<div class="state-box"><div class="big">📦</div><p>You have no packages yet.</p><a class="btn sm mt-1" href="/provider-packages">Create a package</a></div>`;
    return `<div class="grid">${pkgs.slice(0, 4).map(p => `
      <div class="card slim">
        <div class="between"><span class="tag ${p.package_type}">${p.package_type === "team" ? "Team" : "Multitasking"}</span><span class="status-dot ${p.status}"></span></div>
        <strong>${esc(p.name)}</strong>
        <div class="xsmall muted">${p.service_count} services · ${money(p.hourly_rate)}/hr</div>
      </div>`).join("")}</div>`;
  },
};
