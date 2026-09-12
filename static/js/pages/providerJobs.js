// CrewNest NX provider jobs — kanban-style live work board.
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
    const active = rows.filter(b => b.status === "accepted");
    const review = rows.filter(b => b.status === "completion_requested");
    const completed = rows.filter(b => b.status === "completed");
    const closed = rows.filter(b => ["rejected","cancelled"].includes(b.status));

    el.innerHTML = `
      <div class="nx-topline">
        <div class="nx-title-wrap"><div class="nx-kicker"><i></i> Live operations</div><h1 class="nx-title">Jobs</h1><p class="nx-sub">Move work from accepted to reviewed to complete.</p></div>
        <div class="nx-top-actions"><span class="nx-pill">${active.length + review.length} live</span><span class="nx-pill">${completed.length} completed</span></div>
      </div>

      <section class="nx-pipeline">
        ${this._pipe("Requests", pending.length)}
        ${this._pipe("Accepted", active.length)}
        ${this._pipe("Review", review.length)}
        ${this._pipe("Done", completed.length)}
      </section>

      <section class="nx-kanban">
        ${this._column("Active", "Work currently in progress.", active, "active")}
        ${this._column("Awaiting review", "Completion requested; waiting on customer.", review, "review")}
        ${this._column("Completed", "Finished jobs and history.", completed, "done")}
      </section>

      ${closed.length ? `<section class="nx-card nx-section" style="margin-top:12px"><div class="nx-section-head"><h2>Closed without completion</h2><span class="nx-tag">${closed.length}</span></div><div class="nx-history-list">${closed.map(b => this._closedRow(b)).join("")}</div></section>` : ""}
    `;
  },

  _pipe(label, count) {
    return `<div class="nx-card nx-pipe"><small>${label}</small><strong>${count}</strong></div>`;
  },

  _column(title, sub, rows, kind) {
    return `<article class="nx-card nx-kanban-col"><div class="nx-kanban-head"><div><h2>${title}</h2><div class="nx-meta">${sub}</div></div><span class="nx-count">${rows.length}</span></div>${rows.length ? rows.map(b => this._jobCard(b, kind)).join("") : `<div class="nx-empty"><div><strong>Nothing here</strong><span>${kind === "active" ? "Accepted jobs will appear here." : kind === "review" ? "Completion requests will appear here." : "Completed work will appear here."}</span></div></div>`}</article>`;
  },

  _jobCard(b, kind) {
    const type = b.package_type_snapshot ? `${b.package_type_snapshot}${b.package_name_snapshot ? " · "+b.package_name_snapshot : ""}` : "Individual";
    return `<a class="nx-job" href="/provider-booking/${b.id}"><strong>${esc(b.item_description)}</strong><small>${esc(b.customer_name)} · ${fmtDate(b.booking_date)} · ${esc(b.booking_time)}</small><div class="nx-tags"><span class="nx-tag ${kind === "done" ? "lime" : "violet"}">${STATUS_LABEL[b.status] || esc(b.status)}</span><span class="nx-tag">${esc(type)}</span></div><div class="nx-job-foot"><b>${money(b.quoted_price)}</b><span>OPEN →</span></div></a>`;
  },

  _closedRow(b) {
    return `<a class="nx-history-item" href="/provider-booking/${b.id}"><div><strong>${esc(b.item_description)}</strong><small>${esc(b.customer_name)} · ${STATUS_LABEL[b.status] || esc(b.status)}</small></div><b>${money(b.quoted_price)}</b></a>`;
  },
};
