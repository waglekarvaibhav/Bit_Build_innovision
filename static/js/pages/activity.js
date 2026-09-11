// Customer activity (/activity) — bookings list and status history.
const CustomerActivity = {
  async render() {
    if (!requireRole("customer")) return;
    const me = Auth.user();
    const shell = mountShell("activity");
    const head = `<h1>My Activity</h1><p>All your requests and bookings, across individual, multitasking and team packages.</p>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let rows;
    try { rows = (await API.get("/api/customers/bookings")).bookings; }
    catch (e) { showFatal(e, el); return; }

    if (!rows.length) {
      el.innerHTML = `<div class="state-box"><div class="big">🗂️</div><p>No bookings yet.</p><a class="btn mt-1" href="/home">Book your first professional</a></div>`;
      return;
    }

    el.innerHTML = rows.map(b => this.rowCard(b)).join("");
  },

  rowCard(b) {
    const typeLabel = b.package_type_snapshot || "Individual";
    const who = b.provider_name || (b.package_name_snapshot ? b.package_name_snapshot : "");
    return `
      <a class="list-item" href="/booking/${b.id}" style="text-decoration:none;color:inherit">
        <div class="grow">
          <div class="between">
            <strong>${esc(b.item_description)}</strong> ${statusBadge(b.status)}
          </div>
          <div class="meta">${esc(typeLabel)} · ${esc(who)} · ${money(b.quoted_price)}</div>
          <div class="xsmall muted">${fmtDate(b.booking_date)} at ${esc(b.booking_time)}</div>
        </div>
        <span class="btn sm ghost">View</span>
      </a>`;
  },
};
