// CrewNest Atlas provider requests — compact decision queue.
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

    const me = Auth.user();
    const meId = Number(me.id || me.user_id);
    const canDecide = b => {
      if (b.package_type_snapshot === "team") {
        return Number(b.package_lead_snapshot) === meId;
      }
      return Number(b.provider_id) === meId;
    };
    const decisionRows = rows.filter(canDecide);
    const pending = decisionRows.filter(b => b.status === "pending");
    const history = decisionRows.filter(b => b.status !== "pending");
    const accepted = history.filter(b => b.status === "accepted").length;
    const completed = history.filter(b => b.status === "completed").length;

    el.innerHTML = `
      <header class="atlas-pagehead">
        <div><div class="atlas-kicker">Decision queue</div><h1>Requests</h1><p>One place to review incoming work before it joins your schedule.</p></div>
        <div class="atlas-actions"><span class="atlas-status ${pending.length ? "live" : ""}">${pending.length} waiting</span><span class="atlas-tag mint">${accepted} accepted</span><span class="atlas-tag">${completed} completed</span></div>
      </header>

      <section class="atlas-request-layout">
        <article class="atlas-card atlas-queue">
          <div class="atlas-card-head"><div><h2>Needs a decision</h2><p>${pending.length ? `${pending.length} customer request${pending.length===1?"":"s"} waiting.` : "You’re all caught up."}</p></div><span class="atlas-count">${pending.length}</span></div>
          <div id="pending-list">${pending.length ? pending.map(b => this._pending(b)).join("") : `<div class="atlas-empty"><div><strong>Queue empty</strong><span>New requests that need your decision will land here.</span></div></div>`}</div>
        </article>

        <article class="atlas-card atlas-history">
          <div class="atlas-card-head"><div><h2>Decision history</h2><p>Accepted, completed, rejected and cancelled bookings you managed.</p></div><span class="atlas-count">${history.length}</span></div>
          <div class="atlas-history-list">${history.length ? history.map(b => this._history(b)).join("") : `<div class="atlas-empty"><div><strong>No history yet</strong><span>Your handled requests will build up here.</span></div></div>`}</div>
        </article>
      </section>
    `;

    el.querySelectorAll("[data-accept]").forEach(btn => btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); this._act(btn,"accept"); }));
    el.querySelectorAll("[data-reject]").forEach(btn => btn.addEventListener("click", e => { e.preventDefault(); e.stopPropagation(); this._act(btn,"reject"); }));
  },

  _pending(b){
    const type = b.package_type_snapshot ? `${b.package_type_snapshot}${b.package_name_snapshot ? " · "+b.package_name_snapshot : ""}` : "Individual";
    return `<article class="atlas-request-card"><a href="/provider-booking/${b.id}" style="text-decoration:none;color:inherit"><div class="atlas-request-top"><span class="atlas-avatar">${initials(b.customer_name)}</span><div><h3>${esc(b.item_description)}</h3><div class="atlas-meta">${esc(b.customer_name)} · ${fmtDate(b.booking_date)} · ${esc(b.booking_time)}</div><div class="atlas-tags"><span class="atlas-tag amber">Pending</span><span class="atlas-tag">${esc(type)}</span></div></div></div></a><div class="atlas-request-actions"><b>${money(b.quoted_price)}</b><button class="atlas-btn primary" data-accept="${b.id}">Accept</button><button class="atlas-btn danger" data-reject="${b.id}">Decline</button></div></article>`;
  },

  _history(b){
    return `<a class="atlas-history-row" href="/provider-booking/${b.id}"><div><strong>${esc(b.item_description)}</strong><span>${esc(b.customer_name)} · ${fmtDate(b.booking_date)} · ${STATUS_LABEL[b.status] || esc(b.status)}</span></div><b>${money(b.quoted_price)}</b></a>`;
  },

  async _act(btn, act){
    if(act === "reject" && !confirm("Reject this booking request?")) return;
    btn.disabled = true;
    const id = btn.getAttribute("data-"+act);
    try{ await API.put(`/api/bookings/${id}/${act}`,{}); Toast.success(act === "accept" ? "Request accepted" : "Request declined"); this.render(); }
    catch(e){ Toast.error(e.message); btn.disabled = false; }
  }
};
