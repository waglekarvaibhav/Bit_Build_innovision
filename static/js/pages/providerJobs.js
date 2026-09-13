// Provider jobs (/provider-jobs) — ongoing & completed work across bookings,
// including team packages where the provider is a member.
const ProviderJobs = {
  async render() {
    if (!requireRole("provider")) return;
    const shell = mountShell("jobs");
    const head = `<h1>My Jobs</h1><p>Everything you're assigned to, including team bookings.</p>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let rows;
    try { rows = (await API.get("/api/providers/bookings")).bookings; }
    catch (e) { showFatal(e, el); return; }

    const myId = Auth.get().user_id;
    const ongoing = rows.filter(b => ["accepted", "completion_requested"].includes(b.status));
    const completed = rows.filter(b => b.status === "completed");
    const other = rows.filter(b => !["accepted", "completion_requested", "completed"].includes(b.status));

    const jobCard = (b, isMember) => `
      <a class="list-item" href="/provider-booking/${b.id}" style="text-decoration:none;color:inherit">
        <div class="grow">
          <div class="between"><strong>${esc(b.item_description)}</strong> ${statusBadge(b.status)}</div>
          <div class="meta">${fmtDate(b.booking_date)} at ${esc(b.booking_time)} · ${esc(b.customer_name)}</div>
          ${b.package_type_snapshot ? `<div class="meta"><span class="chip-inline">${esc(b.package_type_snapshot)}</span><span class="xsmall muted">${b.package_lead_name ? "Lead: " + esc(b.package_lead_name) : ""}</span></div>` : ""}
          <div class="xsmall muted">${b.quoted_price ? "Quote " + money(b.quoted_price) : ""}</div>
        </div>
        <span class="btn sm ghost">Open</span>
      </a>`;

    el.innerHTML = `
      <h3>Ongoing (${ongoing.length})</h3>
      <div>${ongoing.map(b => jobCard(b)).join("") || `<div class="state-box"><div class="big">✅</div><p>No ongoing jobs.</p></div>`}</div>
      <h3 style="margin-top:var(--space-6)">Completed (${completed.length})</h3>
      <div>${completed.map(b => jobCard(b)).join("") || `<div class="state-box"><p>No completed jobs yet.</p></div>`}</div>
      <h3 style="margin-top:var(--space-6)">Other (${other.length})</h3>
      <div>${other.map(b => jobCard(b)).join("") || `<div class="state-box"><p>Nothing else.</p></div>`}</div>
    `;
  },
};
