// Provider jobs — live work board with a clear booking pipeline.
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

    const pending = rows.filter(b => b.status === "pending");
    const accepted = rows.filter(b => b.status === "accepted");
    const review = rows.filter(b => b.status === "completion_requested");
    const ongoing = rows.filter(b => ["accepted", "completion_requested"].includes(b.status));
    const completed = rows.filter(b => b.status === "completed");
    const other = rows.filter(b => !["pending", "accepted", "completion_requested", "completed"].includes(b.status));

    el.innerHTML = `
      <section class="pv-page-banner">
        <div><span class="pv-eyebrow">${icon("clock")} Work board</span><h1>My jobs</h1><p>Track every booking from acceptance to completion.</p></div>
        <div class="pv-count">${ongoing.length}</div>
      </section>

      <section class="pv-flow-board">
        ${this._flowStep("Request", pending.length, "Customer asks", "01", pending.length > 0)}
        ${this._flowStep("Accepted", accepted.length, "Work confirmed", "02", accepted.length > 0)}
        ${this._flowStep("Review", review.length, "Awaiting customer", "03", review.length > 0)}
        ${this._flowStep("Done", completed.length, "Completed", "04", completed.length > 0)}
      </section>

      ${this._section("Live work", "Accepted jobs and completion follow-ups.", ongoing, true)}
      ${this._section("Completed", "Finished work kept for your history.", completed, false)}
      ${other.length ? this._section("Other", "Rejected or cancelled bookings.", other, false) : ""}
    `;
  },

  _flowStep(label, count, sub, index, active) {
    return `<div class="pv-flow-step ${active ? "active" : ""}"><span class="pv-flow-index">${index}</span><div class="pv-flow-dot"></div><div><strong>${count}</strong><h3>${label}</h3><small>${sub}</small></div></div>`;
  },

  _section(title, sub, rows, primary) {
    return `<section class="pv-panel" style="margin-bottom:14px">
      <div class="pv-panel-head"><div><h2>${title}</h2><div class="pv-panel-sub">${sub}</div></div><span class="pv-chip ${primary ? "mint" : ""}">${rows.length}</span></div>
      <div class="pv-task-list">${rows.length ? rows.map(b => this._jobCard(b, primary)).join("") : `<div class="pv-empty"><strong>Nothing here yet</strong>${primary ? "Accepted work will appear here as soon as you confirm a request." : "No bookings in this state."}</div>`}</div>
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
