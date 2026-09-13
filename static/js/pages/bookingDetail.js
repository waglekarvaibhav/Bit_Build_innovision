// Booking detail (/booking/:id). Shows service scope, participants, schedule,
// address, price breakdown, timeline, and role-appropriate actions:
//   pending  -> customer can cancel; lead/owner can accept|reject
//   accepted -> provider lead/owner requests completion
//   completion_requested -> customer confirms|rejects completion
//   completed -> customer can review
// Also contact links (Call / WhatsApp / Maps) shown to the booking customer,
// plus before/after job photo upload.
const BookingDetail = {
  async render(params) {
    if (!requireRole("customer", "provider")) return;
    const me = Auth.user();
    const shell = mountShell("customer" === me.role ? "activity" : "jobs");
    const head = `<a class="small" href="${me.role === "customer" ? "/activity" : "/provider-jobs"}">← Back</a>`;
    const page = AppShell.page(head);
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;
    const contactPromise = me.role === "customer"
      ? API.get(`/api/bookings/${params.id}/contact`, { retry: false }).catch(() => null)
      : Promise.resolve(null);
    const photosPromise = API.get(`/api/bookings/${params.id}/photos`, { retry: false })
      .then(rows => Array.isArray(rows) ? rows : [])
      .catch(() => []);

    let b;
    try { b = await API.get(`/api/bookings/${params.id}`); }
    catch (e) { el.innerHTML = `<div class="state-box">${esc(e.message)}</div>`; return; }

    const isCustomer = b.customer_id === me.id;
    const isLead = me.role === "provider" && this._isLeadBooking(b, me.id);
    const isMember = me.role === "provider" && !isLead && this._isMember(b, me.id);
    page.head.innerHTML = `<a class="small" href="${isCustomer ? "/activity" : "/provider-jobs"}">← ${isCustomer ? "My Bookings" : "My Jobs"}</a>`;

    // Optional detail requests are independent; load them together.
    const [contact, photos] = await Promise.all([
      isCustomer ? contactPromise : Promise.resolve(null),
      photosPromise,
    ]);

    const servicesList = b.package_services_snapshot && b.package_services_snapshot.length
      ? b.package_services_snapshot : [];
    const memberList = b.package_members_snapshot && b.package_members_snapshot.length
      ? b.package_members_snapshot : [];

    const typeLabel = b.package_type_snapshot || "Individual";

    el.innerHTML = `
      <div class="card">
        <div class="between" style="align-items:flex-start">
          <div>
            <div class="row"><h1 style="margin:0">${esc(b.item_description)}</h1>${statusBadge(b.status)}</div>
            <div class="meta mt-1">
              <span class="chip-inline">${esc(typeLabel)}</span>
              ${b.service_name ? `<span class="chip-inline">${esc(b.service_name)}</span>` : ""}
              ${b.package_name_snapshot ? `<span class="chip-inline">Pkg: ${esc(b.package_name_snapshot)}</span>` : ""}
            </div>
          </div>
        </div>

        <div class="row" style="margin-top:var(--space-4)">
          <span class="row-item"><strong>When</strong><br>${fmtDate(b.booking_date)} at ${esc(b.booking_time)}</span>
          <span class="row-item"><strong>Duration</strong><br>${Number(b.duration_hours)} hrs (${esc(b.billing_unit)})</span>
          <span class="row-item"><strong>Quote</strong><br><span class="price">${money(b.quoted_price)}</span></span>
        </div>

        <h4 style="margin-top:var(--space-4)">Where</h4>
        <p>${esc(b.address)}</p>
        <h4>What's included</h4>
        <p>${esc(b.item_description)}</p>

        ${servicesList.length ? `
          <h4>Services in scope</h4>
          <div class="chips-row">${servicesList.map(s => `<span class="chip-inline">${esc(s)}</span>`).join("")}</div>` : ""}

        ${memberList.length ? `
          <h4 style="margin-top:var(--space-4)">Crew (${memberList.length})</h4>
          <ul class="crew-list">
            ${memberList.map(m => `
              <li class="between">
                <span>${esc(m.name)}${m.is_lead ? ' <span class="badge amber">Lead</span>' : ""}</span>
                <span class="xsmall muted">${esc(m.role || "Crew")}</span>
              </li>`).join("")}
          </ul>` : ""}
      </div>

      ${bookingTimelineHtml(b.status)}

      ${this._actionsCard(b, isCustomer, isLead, isMember, me, el)}

      ${isCustomer && contact ? this._contactCard(contact, b) : ""}

      ${this._photosCard(photos, isCustomer || isLead || isMember, params.id, b.status)}
    `;
    this._wireActions(b, isCustomer, isLead, isMember, params.id, el);
  },

  _isLeadBooking(b, uid) { return b.package_lead_snapshot === uid || b.provider_id === uid; },
  _isMember(b, uid) {
    return (b.package_members_snapshot || []).some(m => m.id === uid);
  },

  _actionsCard(b, isCustomer, isLead, isMember, me, el) {
    const status = b.status;
    const actions = [];
    if (isCustomer && status === "pending") {
      actions.push({ label: "Cancel request", cls: "danger", act: "cancel", confirm: "Cancel this request?" });
    }
    if (me.role === "provider" && isLead) {
      if (status === "pending") {
        actions.push({ label: "Accept request", cls: "primary", act: "accept" });
        actions.push({ label: "Reject request", cls: "danger", act: "reject", confirm: "Reject this request?" });
      } else if (status === "accepted") {
        actions.push({ label: "Request completion", cls: "primary", act: "completion" });
      }
    }
    if (isCustomer && status === "completion_requested") {
      actions.push({ label: "Confirm completion", cls: "success", act: "confirm" });
      actions.push({ label: "Reject completion", cls: "danger", act: "reject_completion", confirm: "Return this job for more work?" });
    }

    const nonLeadNote = me.role === "provider" && isMember && !isLead
      ? `<p class="small muted">You're a crew member on this team booking. The team lead manages requests and completion.</p>` : "";

    if (!actions.length) {
      return `<div class="card slim mt-1">${nonLeadNote}<p class="small muted">No actions available for this booking right now.</p>${isCustomer && status==="completed" ? `<button class="btn sm amber" id="review-btn" data-bid="${b.id}">Leave a review</button>` : ""}</div>`;
    }
    return `
      <div class="card slim mt-1">
        ${nonLeadNote}
        <div class="row">
          ${actions.map(a => `<button class="btn ${a.cls} sm" data-act="${a.act}" ${a.confirm ? `data-confirm="${esc(a.confirm)}"` : ""}>${esc(a.label)}</button>`).join("")}
        </div>
      </div>`;
  },

  _contactCard(contact, b) {
    const tel = contact.lead_phone || contact.provider_phone;
    const wa = tel ? `https://wa.me/${tel.replace(/[^0-9]/g, "")}` : null;
    const maps = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(contact.address)}`;
    return `
      <div class="card slim mt-1">
        <h4>Reach the crew</h4>
        <p class="xsmall muted">Contact details are shown only to the booking customer. Opens your dialer / WhatsApp / Maps — not a live tracker.</p>
        <p class="small">Phone: <strong>${esc(tel || "—")}</strong>${contact.lead_phone ? ` <span class="xsmall muted">(team lead)</span>` : ""}</p>
        <div class="row">
          <a class="btn sm ghost" href="tel:${tel}" target="_blank">${icon("phone")} Call</a>
          ${wa ? `<a class="btn sm ghost" href="${wa}" target="_blank" rel="noopener">${icon("chat")} WhatsApp</a>` : ""}
          <a class="btn sm ghost" href="${maps}" target="_blank" rel="noopener">${icon("map")} Directions</a>
        </div>
      </div>`;
  },

  _photosCard(photos, allowed, bid, status) {
    if (!allowed) return "";
    const before = photos.filter(p => p.photo_type === "before");
    const after = photos.filter(p => p.photo_type === "after");
    const canUpload = status === "completion_requested" || status === "accepted" || status === "completed";
    return `
      <div class="card slim mt-1">
        <h4>Before / After photos</h4>
        <div class="row gallery">
          ${before.map(p => this._photo(p, "Before")).join("") || "<span class='xsmall muted'>No 'before' photos yet.</span>"}
        </div>
        ${canUpload ? `
          <div class="row mt-1" id="photo-upload">
            <label class="btn sm ghost">${icon("plus")} Add before<input type="file" accept="image/jpeg,image/png,image/webp" data-type="before" hidden></label>
            <label class="btn sm ghost">${icon("plus")} Add after<input type="file" accept="image/jpeg,image/png,image/webp" data-type="after" hidden></label>
          </div>` : ""}
      </div>`;
  },

  _photo(p, label) {
    return `<figure class="gal-item" data-id="${p.id}"><img src="${p.url}" alt="${label} job photo" loading="lazy" /><figcaption class="xsmall muted">${label}</figcaption></figure>`;
  },

  _wireActions(b, isCustomer, isLead, isMember, bid, el) {
    const ACTION_PATHS = {
      completion: "/request-completion",
      confirm: "/confirm-completion",
      reject_completion: "/reject-completion",
    };
    el.querySelectorAll("#review-btn").forEach(btn => {
      btn.addEventListener("click", () => this._openReview(b, el));
    });
    el.querySelectorAll("[data-act]").forEach(btn => {
      btn.addEventListener("click", async () => {
        const act = btn.dataset.act;
        if (btn.dataset.confirm && !confirm(btn.dataset.confirm)) return;
        btn.disabled = true;
        try {
          const path = "/api/bookings/" + bid + (ACTION_PATHS[act] || "/" + act);
          let res;
          if (act === "cancel") res = await API.put(path, {});
          else if (act === "accept") res = await API.put(path, {});
          else if (act === "reject") res = await API.put(path, {});
          else if (act === "completion") res = await API.put(path, {});
          else if (act === "confirm") res = await API.put(path, {});
          else if (act === "reject_completion") res = await API.put(path, {});
          Toast.success("Updated");
          this.render({ id: bid });
        } catch (e) { Toast.error(e.message); btn.disabled = false; }
      });
    });
    el.querySelectorAll("input[type=file][data-type]").forEach(input => {
      input.addEventListener("change", async () => {
        const file = input.files[0];
        if (!file) return;
        if (!/image\/(jpeg|png|webp)/.test(file.type)) { Toast.error("Only JPG, PNG or WebP images."); return; }
        if (file.size > 5 * 1024 * 1024) { Toast.error("Image exceeds 5 MB."); return; }
        try {
          await API.upload("/api/bookings/" + bid + "/photos", input.dataset.type, file);
          Toast.success("Photo uploaded");
          this.render({ id: bid });
        } catch (e) { Toast.error(e.message); }
      });
    });
  },

  _openReview(b, el) {
    const wrap = document.createElement("div");
    wrap.className = "dialog-backdrop open";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.innerHTML = `
      <div class="dialog">
        <h2>Rate this job</h2>
        <form id="review-form">
          <div class="field"><label for="rev-rating">Rating (1–5)</label>
            <select class="input" id="rev-rating">${[5,4,3,2,1].map(n => `<option value="${n}">${n} ${"★".repeat(n)}</option>`).join("")}</select></div>
          <div class="field"><label for="rev-comment">Comment <span class="muted">(optional)</span></label>
            <textarea class="input" id="rev-comment" placeholder="How was the work?"></textarea></div>
          <div class="dialog-actions">
            <button type="button" class="btn ghost sm" id="rev-close">Cancel</button>
            <button type="submit" class="btn sm">Submit review</button>
          </div>
        </form>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener("click", e => { if (e.target === wrap) wrap.remove(); });
    const close = () => wrap.remove();
    wrap.querySelector("#rev-close").addEventListener("click", close);
    wrap.querySelector("#review-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      try {
        await API.post(`/api/bookings/${b.id}/reviews`, {
          rating: Number(wrap.querySelector("#rev-rating").value),
          comment: wrap.querySelector("#rev-comment").value.trim(),
        });
        Toast.success("Thanks for your review!");
        wrap.remove();
        this.render({ id: b.id });
      } catch (ex) { Toast.error(ex.message); }
    });
    document.addEventListener("keydown", function escKey(e2) {
      if (e2.key === "Escape") { wrap.remove(); document.removeEventListener("keydown", escKey); }
    });
  },
};

// CSS for booking detail row items / gallery lives in a small inline block.
document.addEventListener("DOMContentLoaded", () => {
  const style = document.createElement("style");
  style.textContent = `
    .row-item { padding: 8px 16px; background: var(--bg-muted); border-radius: var(--radius); }
    .crew-list { margin:0; padding:0; list-style:none; }
    .crew-list li { padding: 8px 0; border-bottom: 1px solid var(--border); }
    .gallery { display:flex; gap: var(--space-3); }
    .gal-item img { width: 110px; height: 84px; object-fit: cover; border-radius: var(--radius-sm); border: 1px solid var(--border); }
  `;
  document.head.appendChild(style);
});
