// Provider booking detail (/provider-booking/:id). Reuses the shared booking
// detail rendering but mounts the provider shell. Authorization + lead-only
// actions are enforced server-side.
const ProviderBookingDetail = {
  async render(params) {
    if (!requireRole("provider")) return;
    // Delegate to the shared rendering logic. It reads Auth.user().role and
    // shows provider-appropriate actions (accept/reject/request completion).
    // We re-implement a thin wrapper that renders into the provider shell.
    const shell = mountShell("jobs");
    const head = `<a class="small" href="/provider-jobs">← My Jobs</a>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let b;
    try { b = await API.get(`/api/bookings/${params.id}`); }
    catch (e) { el.innerHTML = `<div class="state-box">${esc(e.message)}</div>`; return; }

    const me = Auth.user();
    const isLead = b.package_lead_snapshot === me.id || b.provider_id === me.id;
    const isMember = !isLead && (b.package_members_snapshot || []).some(m => m.id === me.id);

    const servicesList = (b.package_services_snapshot || []);
    const memberList = (b.package_members_snapshot || []);
    const typeLabel = b.package_type_snapshot || "Individual";

    let photos = [];
    try { photos = (await API.get(`/api/bookings/${params.id}/photos`)) || []; } catch (e) {}

    el.innerHTML = `
      <div class="card">
        <div class="row"><h1 style="margin:0">${esc(b.item_description)}</h1>${statusBadge(b.status)}</div>
        <div class="meta mt-1">
          <span class="chip-inline">${esc(typeLabel)}</span>
          <span class="chip-inline">Customer: ${esc(b.customer_name)}</span>
          ${b.package_name_snapshot ? `<span class="chip-inline">${esc(b.package_name_snapshot)}</span>` : ""}
        </div>
        <div class="row" style="margin-top:var(--space-4)">
          <span class="row-item"><strong>When</strong><br>${fmtDate(b.booking_date)} at ${esc(b.booking_time)}</span>
          <span class="row-item"><strong>Duration</strong><br>${Number(b.duration_hours)} hrs (${esc(b.billing_unit)})</span>
          <span class="row-item"><strong>Quote</strong><br><span class="price">${money(b.quoted_price)}</span></span>
        </div>
        <h4 style="margin-top:var(--space-4)">Where</h4><p>${esc(b.address)}</p>
        <h4>Work scope</h4><p>${esc(b.item_description)}</p>
        ${servicesList.length ? `<h4>Services in scope</h4><div class="chips-row">${servicesList.map(s => `<span class="chip-inline">${esc(s)}</span>`).join("")}</div>` : ""}
        ${memberList.length ? `
          <h4 style="margin-top:var(--space-4)">Crew (${memberList.length})</h4>
          <ul class="crew-list">${memberList.map(m => `<li class="between"><span>${esc(m.name)}${m.is_lead ? ' <span class="badge amber">Lead</span>' : ""}</span><span class="xsmall muted">${esc(m.role || "Crew")}</span></li>`).join("")}</ul>` : ""}
      </div>

      ${this._actions(b, isLead, isMember, me)}
      ${this._photos(photos, params.id, isLead || isMember, b.status)}
    `;
    this._wire(b, isLead, isMember, params.id, el);
  },

  _actions(b, isLead, isMember, me) {
    const status = b.status;
    const memberNote = !isLead && isMember
      ? `<p class="small muted">You're a crew member on this team booking. The team lead (${esc(b.package_lead_name || "—")}) manages requests, completion, and reviews.</p>` : "";
    let buttons = "";
    if (isLead && me.role === "provider") {
      if (status === "pending") {
        buttons = `<button class="btn sm primary" data-act="accept">Accept request</button>
          <button class="btn sm danger" data-act="reject">Reject request</button>`;
      } else if (status === "accepted") {
        buttons = `<button class="btn sm primary" data-act="completion">Request completion</button>`;
      }
    }
    if (!buttons) buttons = `<p class="xsmall muted">No lead actions right now.</p>`;
    return `<div class="card slim mt-1">${memberNote}<div class="row">${buttons}</div></div>`;
  },

  _photos(photos, bid, allowed, status) {
    if (!allowed) return "";
    const before = photos.filter(p => p.photo_type === "before");
    const after = photos.filter(p => p.photo_type === "after");
    const canUpload = ["accepted", "completion_requested", "completed"].includes(status);
    return `<div class="card slim mt-1">
      <h4>Job photos</h4>
      <div class="row gallery">
        ${before.map(p => this._gal(p, "Before")).join("") || "<span class='xsmall muted'>No before photos.</span>"}
        ${after.map(p => this._gal(p, "After")).join("")}
      </div>
      ${canUpload ? `<div class="row mt-1">
        <label class="btn sm ghost">${icon("plus")} Before<input type="file" accept="image/jpeg,image/png,image/webp" data-type="before" hidden></label>
        <label class="btn sm ghost">${icon("plus")} After<input type="file" accept="image/jpeg,image/png,image/webp" data-type="after" hidden></label>
      </div>` : ""}
    </div>`;
  },

  _gal(p, label) {
    return `<figure class="gal-item"><img src="${p.url}" alt="${label} job photo" loading="lazy"/><figcaption class="xsmall muted">${label}</figcaption></figure>`;
  },

  _wire(b, isLead, isMember, bid, el) {
    const ACTION_PATHS = {
      completion: "/request-completion",
    };
    el.querySelectorAll("[data-act]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        if (act === "reject" && !confirm("Reject this booking request?")) return;
        btn.disabled = true;
        try {
          const path = "/api/bookings/" + bid + (ACTION_PATHS[act] || "/" + act);
          await API.put(path, {});
          Toast.success("Updated");
          this.render({ id: bid });
        } catch (e) { Toast.error(e.message); btn.disabled = false; }
      });
    });
    el.querySelectorAll("input[type=file][data-type]").forEach(input => {
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        if (!/image\/(jpeg|png|webp)/.test(file.type)) { Toast.error("Only JPG, PNG or WebP."); return; }
        if (file.size > 5 * 1024 * 1024) { Toast.error("Image exceeds 5 MB."); return; }
        try { await API.upload("/api/bookings/" + bid + "/photos", input.dataset.type, file); Toast.success("Photo uploaded"); this.render({ id: bid }); }
        catch (e) { Toast.error(e.message); }
      });
    });
  },
};
