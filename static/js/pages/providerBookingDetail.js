// Provider booking detail — premium job workspace. Authorization remains server-side.
const ProviderBookingDetail = {
  async render(params) {
    if (!requireRole("provider")) return;
    mountShell("jobs");
    const page = AppShell.page(`<a class="small" href="/provider-jobs">← My Jobs</a>`);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let b;
    try { b = await API.get(`/api/bookings/${params.id}`); }
    catch (e) { el.innerHTML = `<div class="pv-empty">${esc(e.message)}</div>`; return; }

    const me = Auth.user();
    const isLead = b.package_lead_snapshot === me.id || b.provider_id === me.id;
    const isMember = !isLead && (b.package_members_snapshot || []).some(m => m.id === me.id);
    const servicesList = b.package_services_snapshot || [];
    const memberList = b.package_members_snapshot || [];
    const typeLabel = b.package_type_snapshot || "Individual";

    let photos = [];
    try { photos = (await API.get(`/api/bookings/${params.id}/photos`)) || []; } catch (e) {}

    el.innerHTML = `
      <div class="pv-detail-shell">
        <main class="pv-detail-main">
          <section class="pv-detail-hero">
            <div class="between"><span class="pv-eyebrow">${icon("toolbox")} ${esc(typeLabel)} job</span>${statusBadge(b.status)}</div>
            <h1>${esc(b.item_description)}</h1>
            <div class="meta">Customer · ${esc(b.customer_name)}${b.package_name_snapshot ? ` · ${esc(b.package_name_snapshot)}` : ""}</div>
            <div class="pv-detail-facts">
              <div class="pv-detail-fact"><small>Schedule</small><strong>${fmtDate(b.booking_date)} · ${esc(b.booking_time)}</strong></div>
              <div class="pv-detail-fact"><small>Duration</small><strong>${Number(b.duration_hours)} hrs · ${esc(b.billing_unit)}</strong></div>
              <div class="pv-detail-fact"><small>Agreed quote</small><strong>${money(b.quoted_price)}</strong></div>
            </div>
          </section>

          <section class="pv-info-card">
            <h3>Job brief</h3>
            <div class="pv-info-row"><span>Location</span><strong>${esc(b.address)}</strong></div>
            <div class="pv-info-row"><span>Work scope</span><strong>${esc(b.item_description)}</strong></div>
            <div class="pv-info-row"><span>Booking type</span><strong>${esc(typeLabel)}</strong></div>
          </section>

          ${servicesList.length ? `<section class="pv-info-card"><h3>Services in scope</h3><div class="pv-task-tags">${servicesList.map(s => `<span class="pv-chip mint">${esc(s)}</span>`).join("")}</div></section>` : ""}

          ${memberList.length ? `<section class="pv-info-card"><div class="pv-panel-head"><div><h3>Crew</h3><div class="pv-panel-sub">Everyone attached to this booking.</div></div><span class="pv-chip">${memberList.length} members</span></div>
            ${memberList.map(m => `<div class="pv-info-row"><span>${m.is_lead ? "Team lead" : "Crew member"}</span><strong>${esc(m.name)} · ${esc(m.role || "Crew")}</strong></div>`).join("")}
          </section>` : ""}

          ${this._photos(photos, params.id, isLead || isMember, b.status)}
        </main>

        <aside class="pv-detail-side">
          ${this._actions(b, isLead, isMember, me)}
          <section class="pv-info-card"><h3>At a glance</h3>
            <div class="pv-info-row"><span>Status</span><strong>${STATUS_LABEL[b.status] || esc(b.status)}</strong></div>
            <div class="pv-info-row"><span>Customer</span><strong>${esc(b.customer_name)}</strong></div>
            <div class="pv-info-row"><span>Value</span><strong>${money(b.quoted_price)}</strong></div>
            ${b.package_lead_name ? `<div class="pv-info-row"><span>Lead</span><strong>${esc(b.package_lead_name)}</strong></div>` : ""}
          </section>
        </aside>
      </div>`;

    this._wire(b, isLead, isMember, params.id, el);
  },

  _actions(b, isLead, isMember, me) {
    const memberNote = !isLead && isMember ? `<p class="small muted">You’re a crew member. ${esc(b.package_lead_name || "The team lead")} controls booking actions.</p>` : "";
    let buttons = "";
    if (isLead && me.role === "provider") {
      if (b.status === "pending") buttons = `<button class="btn primary" data-act="accept">Accept request</button><button class="btn danger" data-act="reject">Reject request</button>`;
      else if (b.status === "accepted") buttons = `<button class="btn primary" data-act="completion">Request completion</button>`;
    }
    if (!buttons) buttons = `<p class="small muted">No action is required from you right now.</p>`;
    return `<section class="pv-action-card"><span class="pv-eyebrow" style="background:var(--pv-soft);color:var(--pv-forest)">Next action</span><h3 style="margin-top:13px">Keep this job moving</h3>${memberNote}${buttons}</section>`;
  },

  _photos(photos, bid, allowed, status) {
    if (!allowed) return "";
    const before = photos.filter(p => p.photo_type === "before");
    const after = photos.filter(p => p.photo_type === "after");
    const canUpload = ["accepted", "completion_requested", "completed"].includes(status);
    return `<section class="pv-info-card"><div class="pv-panel-head"><div><h3>Job evidence</h3><div class="pv-panel-sub">Before/after photos keep the work record clear.</div></div></div>
      <div class="row gallery">${before.map(p => this._gal(p,"Before")).join("")}${after.map(p => this._gal(p,"After")).join("") || (!before.length ? `<span class="small muted">No photos uploaded yet.</span>` : "")}</div>
      ${canUpload ? `<div class="row mt-1"><label class="btn sm ghost">${icon("plus")} Add before<input type="file" accept="image/jpeg,image/png,image/webp" data-type="before" hidden></label><label class="btn sm ghost">${icon("plus")} Add after<input type="file" accept="image/jpeg,image/png,image/webp" data-type="after" hidden></label></div>` : ""}
    </section>`;
  },

  _gal(p,label){ return `<figure class="gal-item"><img src="${p.url}" alt="${label} job photo" loading="lazy"/><figcaption class="xsmall muted">${label}</figcaption></figure>`; },

  _wire(b, isLead, isMember, bid, el) {
    const ACTION_PATHS = { completion: "/request-completion" };
    el.querySelectorAll("[data-act]").forEach(btn => btn.addEventListener("click", async () => {
      const act = btn.dataset.act;
      if (act === "reject" && !confirm("Reject this booking request?")) return;
      btn.disabled = true;
      try {
        await API.put("/api/bookings/" + bid + (ACTION_PATHS[act] || "/" + act), {});
        Toast.success("Booking updated"); this.render({ id: bid });
      } catch (e) { Toast.error(e.message); btn.disabled = false; }
    }));
    el.querySelectorAll("input[type=file][data-type]").forEach(input => input.addEventListener("change", async () => {
      const file = input.files[0]; if (!file) return;
      if (!/image\/(jpeg|png|webp)/.test(file.type)) { Toast.error("Only JPG, PNG or WebP."); return; }
      if (file.size > 5 * 1024 * 1024) { Toast.error("Image exceeds 5 MB."); return; }
      try { await API.upload("/api/bookings/" + bid + "/photos", input.dataset.type, file); Toast.success("Photo uploaded"); this.render({ id: bid }); }
      catch (e) { Toast.error(e.message); }
    }));
  },
};
