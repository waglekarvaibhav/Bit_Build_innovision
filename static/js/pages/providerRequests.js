// Provider requests (/provider-requests) — incoming pending requests with
// accept/reject actions.
const ProviderRequests = {
  async render() {
    if (!requireRole("provider")) return;
    const shell = mountShell("requests");
    const head = `<h1>Incoming requests</h1><p>Review and respond to new booking requests. Accepting confirms the slot.</p>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let rows;
    try { rows = (await API.get("/api/providers/bookings")).bookings; }
    catch (e) { showFatal(e, el); return; }

    const pending = rows.filter(b => b.status === "pending");
    const history = rows.filter(b => b.status !== "pending");

    el.innerHTML = `
      <h3>Pending requests (${pending.length})</h3>
      <div id="pending-list">${this._rows(pending, true) || `<div class="state-box"><div class="big">📭</div><p>No pending requests.</p></div>`}</div>
      <h3 style="margin-top:var(--space-6)">History</h3>
      <div id="history-list">${this._rows(history, false) || `<div class="state-box"><p>No past handled bookings.</p></div>`}</div>
    `;
    el.querySelectorAll("[data-accept]").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this._act(b, "accept"); }));
    el.querySelectorAll("[data-reject]").forEach(b => b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); this._act(b, "reject"); }));
  },

  _rows(rows, actionable) {
    const cards = rows.map(b => `
      <a class="list-item" href="/provider-booking/${b.id}" style="text-decoration:none;color:inherit">
        <div class="grow">
          <div class="between"><strong>${esc(b.item_description)}</strong> ${statusBadge(b.status)}</div>
          <div class="meta">${esc(b.customer_name)} · ${money(b.quoted_price)} · ${fmtDate(b.booking_date)} at ${esc(b.booking_time)}</div>
          ${b.package_type_snapshot ? `<div class="meta"><span class="chip-inline">${esc(b.package_type_snapshot)} ${b.package_name_snapshot ? "· " + esc(b.package_name_snapshot) : ""}</span></div>` : ""}
        </div>
        ${actionable ? `<span style="display:flex;gap:8px"><button class="btn sm primary" data-accept="${b.id}">Accept</button><button class="btn sm danger" data-reject="${b.id}">Reject</button></span>` : `<span class="btn sm ghost">Open</span>`}
      </a>`).join("");
    return cards;
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
