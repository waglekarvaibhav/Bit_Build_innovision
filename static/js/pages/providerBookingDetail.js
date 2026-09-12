// CrewNest Atlas booking detail — focused job workspace. Authorization remains server-side.
const ProviderBookingDetail = {
  async render(params) {
    if (!requireRole("provider")) return;
    mountShell("jobs");
    const page = AppShell.page("");
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let b;
    try { b = await API.get(`/api/bookings/${params.id}`); }
    catch (e) { el.innerHTML = `<div class="atlas-empty"><div><strong>Could not open job</strong><span>${esc(e.message)}</span></div></div>`; return; }

    const me = Auth.user();
    const meId = me.id || me.user_id;
    const isLead = b.package_lead_snapshot === meId || b.provider_id === meId;
    const isMember = !isLead && (b.package_members_snapshot || []).some(m => m.id === meId);
    const servicesList = b.package_services_snapshot || [];
    const memberList = b.package_members_snapshot || [];
    const typeLabel = b.package_type_snapshot || "Individual";

    let photos = [];
    try { photos = (await API.get(`/api/bookings/${params.id}/photos`)) || []; } catch (e) {}

    el.innerHTML = `
      <header class="atlas-pagehead">
        <div><div class="atlas-kicker"><a href="/provider-jobs" style="color:inherit;text-decoration:none">Work</a> · Job #${params.id}</div><h1>Job workspace</h1><p>Brief, crew, evidence and next action in one place.</p></div>
        <div class="atlas-actions"><span class="atlas-status ${["accepted","completion_requested"].includes(b.status) ? "live" : ""}">${STATUS_LABEL[b.status] || esc(b.status)}</span></div>
      </header>

      <section class="atlas-detail-grid">
        <main style="display:grid;gap:10px">
          <article class="atlas-card dark atlas-mission">
            <div class="atlas-kicker" style="color:#8d93a0">${esc(typeLabel)} job</div>
            <h1>${esc(b.item_description)}</h1>
            <p>${esc(b.customer_name)}${b.package_name_snapshot ? ` · ${esc(b.package_name_snapshot)}` : ""}</p>
            <div class="atlas-facts">
              <div class="atlas-fact"><small>Schedule</small><strong>${fmtDate(b.booking_date)} · ${esc(b.booking_time)}</strong></div>
              <div class="atlas-fact"><small>Duration</small><strong>${Number(b.duration_hours)} hrs · ${esc(b.billing_unit)}</strong></div>
              <div class="atlas-fact"><small>Agreed quote</small><strong>${money(b.quoted_price)}</strong></div>
            </div>
          </article>

          <article class="atlas-card atlas-info"><h3>Job brief</h3><div class="atlas-info-row"><span>Location</span><strong>${esc(b.address)}</strong></div><div class="atlas-info-row"><span>Work scope</span><strong>${esc(b.item_description)}</strong></div><div class="atlas-info-row"><span>Booking type</span><strong>${esc(typeLabel)}</strong></div></article>

          ${servicesList.length ? `<article class="atlas-card atlas-info"><h3>Services in scope</h3><div class="atlas-tags">${servicesList.map(s=>`<span class="atlas-tag blue">${esc(s)}</span>`).join("")}</div></article>` : ""}

          ${memberList.length ? `<article class="atlas-card atlas-info"><h3>Crew</h3>${memberList.map(m=>`<div class="atlas-info-row"><span>${m.is_lead ? "Team lead" : "Crew member"}</span><strong>${esc(m.name)} · ${esc(m.role || "Crew")}</strong></div>`).join("")}</article>` : ""}

          ${this._photos(photos,params.id,isLead || isMember,b.status)}
        </main>

        <aside style="display:grid;gap:10px;align-content:start">
          ${this._actions(b,isLead,isMember,me)}
          <article class="atlas-card atlas-info"><h3>At a glance</h3><div class="atlas-info-row"><span>Status</span><strong>${STATUS_LABEL[b.status] || esc(b.status)}</strong></div><div class="atlas-info-row"><span>Customer</span><strong>${esc(b.customer_name)}</strong></div><div class="atlas-info-row"><span>Value</span><strong>${money(b.quoted_price)}</strong></div>${b.package_lead_name ? `<div class="atlas-info-row"><span>Lead</span><strong>${esc(b.package_lead_name)}</strong></div>` : ""}</article>
        </aside>
      </section>
    `;

    this._wire(b,isLead,isMember,params.id,el);
  },

  _actions(b,isLead,isMember,me){
    const memberNote=!isLead&&isMember ? `<p class="small muted">You’re a crew member. ${esc(b.package_lead_name || "The team lead")} controls booking actions.</p>` : "";
    let buttons="";
    if(isLead&&me.role==="provider"){
      if(b.status==="pending") buttons=`<button class="atlas-btn primary" data-act="accept">Accept request</button><button class="atlas-btn danger" data-act="reject">Decline request</button>`;
      else if(b.status==="accepted") buttons=`<button class="atlas-btn primary" data-act="completion">Request completion</button>`;
    }
    if(!buttons) buttons=`<p class="small muted">No action is required from you right now.</p>`;
    return `<article class="atlas-card atlas-action"><div class="atlas-kicker">Next action</div><h3>Keep this job moving</h3>${memberNote}${buttons}</article>`;
  },

  _photos(photos,bid,allowed,status){
    if(!allowed) return "";
    const before=photos.filter(p=>p.photo_type==="before");
    const after=photos.filter(p=>p.photo_type==="after");
    const canUpload=["accepted","completion_requested","completed"].includes(status);
    return `<article class="atlas-card atlas-info"><h3>Job evidence</h3><div class="gallery">${before.map(p=>this._gal(p,"Before")).join("")}${after.map(p=>this._gal(p,"After")).join("") || (!before.length ? `<span class="small muted">No photos uploaded yet.</span>` : "")}</div>${canUpload ? `<div class="row mt-1"><label class="atlas-btn light">${icon("plus")} Before<input type="file" accept="image/jpeg,image/png,image/webp" data-type="before" hidden></label><label class="atlas-btn light">${icon("plus")} After<input type="file" accept="image/jpeg,image/png,image/webp" data-type="after" hidden></label></div>` : ""}</article>`;
  },

  _gal(p,label){return `<figure class="gal-item"><img src="${p.url}" alt="${label} job photo" loading="lazy"/><figcaption class="xsmall muted">${label}</figcaption></figure>`;},

  _wire(b,isLead,isMember,bid,el){
    const ACTION_PATHS={completion:"/request-completion"};
    el.querySelectorAll("[data-act]").forEach(btn=>btn.addEventListener("click",async()=>{const act=btn.dataset.act;if(act==="reject"&&!confirm("Reject this booking request?"))return;btn.disabled=true;try{await API.put("/api/bookings/"+bid+(ACTION_PATHS[act]||"/"+act),{});Toast.success("Booking updated");this.render({id:bid});}catch(e){Toast.error(e.message);btn.disabled=false;}}));
    el.querySelectorAll("input[type=file][data-type]").forEach(input=>input.addEventListener("change",async()=>{const file=input.files[0];if(!file)return;if(!/image\/(jpeg|png|webp)/.test(file.type)){Toast.error("Only JPG, PNG or WebP.");return;}if(file.size>5*1024*1024){Toast.error("Image exceeds 5 MB.");return;}try{await API.upload("/api/bookings/"+bid+"/photos",input.dataset.type,file);Toast.success("Photo uploaded");this.render({id:bid});}catch(e){Toast.error(e.message);}}));
  }
};
