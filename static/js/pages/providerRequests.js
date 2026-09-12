// Provider requests — redesigned action-first inbox.
const ProviderRequests = {
  async render() {
    if (!requireRole("provider")) return;
    mountShell("requests");
    const page = AppShell.page("");
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let rows;
    try { rows = (await API.get("/api/providers/bookings")).bookings; }
    catch (e) { showFatal(e, el); return; }

    const pending = rows.filter(b => b.status === "pending");
    const history = rows.filter(b => b.status !== "pending");

    el.innerHTML = `
      <section class="pv-page-banner">
        <div><span class="pv-eyebrow">${icon("inbox")} Request inbox</span><h1>Decide fast.<br>Keep work moving.</h1><p>Review each request, schedule and quote before accepting the slot.</p></div>
        <div class="pv-count">${pending.length}</div>
      </section>

      <section class="pv-panel">
        <div class="pv-panel-head"><div><h2>Waiting for you</h2><div class="pv-panel-sub">${pending.length ? `${pending.length} request${pending.length===1?"":"s"} need a response.` : "You’re all caught up."}</div></div></div>
        <div id="pending-list">${this._rows(pending, true) || `<div class="pv-empty"><strong>No pending requests</strong>New customer requests will appear here.</div>`}</div>
      </section>

      <section class="pv-panel" style="margin-top:16px">
        <div class="pv-panel-head"><div><h2>Request history</h2><div class="pv-panel-sub">Accepted, rejected and completed decisions.</div></div></div>
        <div id="history-list">${this._rows(history, false) || `<div class="pv-empty">No handled requests yet.</div>`}</div>
      </section>
    `;
    el.querySelectorAll("[data-accept]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); this._act(b, "accept"); }));
    el.querySelectorAll("[data-reject]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); this._act(b, "reject"); }));
  },

  _rows(rows, actionable) {
    return rows.map(b => `
      <article class="pv-request">
        <a href="/provider-booking/${b.id}" style="text-decoration:none;color:inherit;min-width:0">
          <div class="pv-request-top">
            <span class="pv-request-avatar">${initials(b.customer_name)}</span>
            <div style="min-width:0"><h3>${esc(b.item_description)}</h3><div class="meta">${esc(b.customer_name)} · ${fmtDate(b.booking_date)} at ${esc(b.booking_time)}</div>
              <div class="pv-task-tags">${statusBadge(b.status)}${b.package_type_snapshot ? `<span class="pv-chip">${esc(b.package_type_snapshot)}${b.package_name_snapshot ? " · "+esc(b.package_name_snapshot) : ""}</span>` : `<span class="pv-chip">Individual</span>`}</div>
            </div>
          </div>
        </a>
        <div class="pv-request-actions"><span class="pv-money">${money(b.quoted_price)}</span>${actionable ? `<button class="btn sm primary" data-accept="${b.id}">Accept</button><button class="btn sm danger" data-reject="${b.id}">Reject</button>` : `<a class="btn sm ghost" href="/provider-booking/${b.id}">Open</a>`}</div>
      </article>`).join("");
  },

  async _act(btn, act) {
    if (act === "reject" && !confirm("Reject this booking request?")) return;
    btn.disabled = true;
    const bid = btn.getAttribute("data-" + act);
    try {
      await API.put("/api/bookings/" + bid + "/" + act, {});
      Toast.success(act === "accept" ? "Request accepted" : "Request rejected");
      this.render();
    } catch (e) { Toast.error(e.message); btn.disabled = false; }
  },
};
