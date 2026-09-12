// CrewNest Atlas provider work — compact progress lanes.
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
      <header class="atlas-pagehead">
        <div><div class="atlas-kicker">Work rail</div><h1>Work</h1><p>Track jobs from acceptance through customer review and completion.</p></div>
        <div class="atlas-actions"><span class="atlas-status ${active.length + review.length ? "live" : ""}">${active.length + review.length} live</span><span class="atlas-tag mint">${completed.length} done</span></div>
      </header>

      <section class="atlas-progress-rail">
        ${this._step("Requests",pending.length)}
        ${this._step("Accepted",active.length)}
        ${this._step("Review",review.length)}
        ${this._step("Done",completed.length)}
      </section>

      <section class="atlas-job-lanes">
        ${this._lane("In progress","Accepted jobs currently being delivered.",active,"blue")}
        ${this._lane("Customer review","Completion requested; waiting for confirmation.",review,"amber")}
        ${this._lane("Completed","Finished work kept in your history.",completed,"mint")}
      </section>

      ${closed.length ? `<section class="atlas-card atlas-history" style="margin-top:12px;min-height:auto"><div class="atlas-card-head"><div><h2>Closed without completion</h2><p>Rejected or cancelled bookings.</p></div><span class="atlas-count">${closed.length}</span></div><div class="atlas-history-list">${closed.map(b => this._closed(b)).join("")}</div></section>` : ""}
    `;
  },

  _step(label,count){return `<article class="atlas-card atlas-progress-step"><small>${label}</small><strong>${count}</strong></article>`;},

  _lane(title,sub,rows,tone){
    return `<article class="atlas-card atlas-job-lane"><div class="atlas-card-head"><div><h2>${title}</h2><p>${sub}</p></div><span class="atlas-count">${rows.length}</span></div>${rows.length ? rows.map(b=>this._job(b,tone)).join("") : `<div class="atlas-empty"><div><strong>Nothing here</strong><span>${title === "In progress" ? "Accepted jobs will appear here." : title === "Customer review" ? "Completion requests will appear here." : "Completed jobs will appear here."}</span></div></div>`}</article>`;
  },

  _job(b,tone){
    const type=b.package_type_snapshot ? `${b.package_type_snapshot}${b.package_name_snapshot ? " · "+b.package_name_snapshot : ""}` : "Individual";
    return `<a class="atlas-job-card" href="/provider-booking/${b.id}"><strong>${esc(b.item_description)}</strong><small>${esc(b.customer_name)} · ${fmtDate(b.booking_date)} · ${esc(b.booking_time)}</small><div class="atlas-tags"><span class="atlas-tag ${tone}">${STATUS_LABEL[b.status] || esc(b.status)}</span><span class="atlas-tag">${esc(type)}</span></div><div class="atlas-job-foot"><b>${money(b.quoted_price)}</b><span>OPEN →</span></div></a>`;
  },

  _closed(b){return `<a class="atlas-history-row" href="/provider-booking/${b.id}"><div><strong>${esc(b.item_description)}</strong><span>${esc(b.customer_name)} · ${STATUS_LABEL[b.status] || esc(b.status)}</span></div><b>${money(b.quoted_price)}</b></a>`;}
};
