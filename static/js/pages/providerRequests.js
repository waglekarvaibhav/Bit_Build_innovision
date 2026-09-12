// CrewNest NX provider inbox — split-view request handling.
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
    const accepted = history.filter(b => b.status === "accepted").length;
    const completed = history.filter(b => b.status === "completed").length;

    el.innerHTML = `
      <div class="nx-topline">
        <div class="nx-title-wrap">
          <div class="nx-kicker"><i></i> Incoming work</div>
          <h1 class="nx-title">Inbox</h1>
          <p class="nx-sub">Review, accept or decline new customer requests.</p>
        </div>
        <div class="nx-top-actions"><span class="nx-pill">${pending.length} waiting</span><span class="nx-pill">${accepted} accepted</span><span class="nx-pill">${completed} done</span></div>
      </div>

      <section class="nx-inbox-grid">
        <article class="nx-card nx-inbox-lane">
          <div class="nx-lane-head"><h2>Needs a decision</h2><span class="nx-count">${pending.length}</span></div>
          <div id="pending-list">${pending.length ? pending.map(b => this._pendingCard(b)).join("") : `<div class="nx-empty"><div><strong>Inbox zero</strong><span>New customer requests will appear here.</span></div></div>`}</div>
        </article>

        <article class="nx-card nx-inbox-lane">
          <div class="nx-lane-head"><h2>History</h2><span class="nx-count">${history.length}</span></div>
          <div class="nx-history-list">${history.length ? history.map(b => this._historyRow(b)).join("") : `<div class="nx-empty"><div><strong>No history yet</strong><span>Your handled requests will build up here.</span></div></div>`}</div>
        </article>
      </section>
    `;

    el.querySelectorAll("[data-accept]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); this._act(b, "accept"); }));
    el.querySelectorAll("[data-reject]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); this._act(b, "reject"); }));
  },

  _pendingCard(b) {
    const type = b.package_type_snapshot ? `${b.package_type_snapshot}${b.package_name_snapshot ? " · "+b.package_name_snapshot : ""}` : "Individual";
    return `<article class="nx-request">
      <a href="/provider-booking/${b.id}" style="text-decoration:none;color:inherit">
        <div class="nx-request-top">
          <span class="nx-avatar">${initials(b.customer_name)}</span>
          <div><h3>${esc(b.item_description)}</h3><div class="nx-meta">${esc(b.customer_name)} · ${fmtDate(b.booking_date)} · ${esc(b.booking_time)}</div><div class="nx-tags"><span class="nx-tag violet">Pending</span><span class="nx-tag">${esc(type)}</span></div></div>
        </div>
      </a>
      <div class="nx-request-actions"><span class="nx-price">${money(b.quoted_price)}</span><button class="nx-btn lime" data-accept="${b.id}">Accept</button><button class="nx-btn danger" data-reject="${b.id}">Decline</button></div>
    </article>`;
  },

  _historyRow(b) {
    return `<a class="nx-history-item" href="/provider-booking/${b.id}"><div><strong>${esc(b.item_description)}</strong><small>${esc(b.customer_name)} · ${fmtDate(b.booking_date)} · ${STATUS_LABEL[b.status] || esc(b.status)}</small></div><b>${money(b.quoted_price)}</b></a>`;
  },

  async _act(btn, act) {
    if (act === "reject" && !confirm("Reject this booking request?")) return;
    btn.disabled = true;
    const bid = btn.getAttribute("data-" + act);
    try {
      await API.put("/api/bookings/" + bid + "/" + act, {});
      Toast.success(act === "accept" ? "Request accepted" : "Request declined");
      this.render();
    } catch (e) { Toast.error(e.message); btn.disabled = false; }
  },
};
