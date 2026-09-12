// Provider jobs — redesigned live-work board.
const ProviderJobs = {
  async render() {
    if (!requireRole("provider")) return;
    mountShell("jobs");
    const page = AppShell.page("");
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let rows;
    try { rows = (await API.get("/api/providers/bookings")).bookings; }
    catch (e) { showFatal(e, el); return; }

    const ongoing = rows.filter(b => ["accepted", "completion_requested"].includes(b.status));
    const completed = rows.filter(b => b.status === "completed");
    const other = rows.filter(b => !["accepted", "completion_requested", "completed"].includes(b.status));

    el.innerHTML = `
      <section class="pv-page-banner">
        <div><span class="pv-eyebrow">${icon("clock")} Work board</span><h1 style="font-size:2.35rem;line-height:1;letter-spacing:-.045em;margin-top:10px">My jobs</h1><p>Track active work, completion follow-ups and finished bookings.</p></div>
        <div class="pv-count" style="font-size:2.5rem">${ongoing.length}</div>
      </section>

      <div class="pv-jobs-summary">
        <div><strong>${ongoing.length}</strong><span>Ongoing</span></div>
        <div><strong>${completed.length}</strong><span>Completed</span></div>
        <div><strong>${other.length}</strong><span>Other states</span></div>
      </div>

      ${this._section("Ongoing work", "Accepted jobs and completion follow-ups.", ongoing, true)}
      ${this._section("Completed", "Finished work kept for your history.", completed, false)}
      ${this._section("Other", "Pending, rejected or cancelled bookings.", other, false)}
    `;
  },

  _section(title, sub, rows, primary) {
    return `<section class="pv-panel" style="margin-bottom:14px">
      <div class="pv-panel-head"><div><h2>${title}</h2><div class="pv-panel-sub">${sub}</div></div><span class="pv-chip ${primary ? "mint" : ""}">${rows.length}</span></div>
      <div class="pv-task-list">${rows.length ? rows.map(b => this._jobCard(b, primary)).join("") : `<div class="pv-empty"><strong>Nothing here</strong>${primary ? "Accepted jobs will show up here." : "No bookings in this state."}</div>`}</div>
    </section>`;
  },

  _jobCard(b, primary) {
    return `<a class="pv-task" href="/provider-booking/${b.id}">
      <div><div class="pv-task-title">${esc(b.item_description)}</div><div class="pv-task-meta">${esc(b.customer_name)} · ${fmtDate(b.booking_date)} at ${esc(b.booking_time)}</div>
        <div class="pv-task-tags">${statusBadge(b.status)}${b.package_type_snapshot ? `<span class="pv-chip">${esc(b.package_type_snapshot)}${b.package_lead_name ? " · Lead: "+esc(b.package_lead_name) : ""}</span>` : `<span class="pv-chip">Individual</span>`}<span class="pv-chip coral">${money(b.quoted_price)}</span></div>
      </div><div class="pv-task-action"><span class="btn sm ${primary ? "primary" : "ghost"}">${primary ? "Continue job" : "View details"}</span></div>
    </a>`;
  },
};
