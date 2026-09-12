// CrewNest Atlas provider profile — professional storefront + service console.
const ProviderProfilePage = {
  async render() {
    if (!requireRole("provider")) return;
    mountShell("profile");
    const page = AppShell.page("");
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let data, svcs;
    try { [data, svcs] = await Promise.all([API.get("/api/providers/me"), API.get("/api/services")]); }
    catch (e) { showFatal(e, el); return; }
    const prof = data.profile;
    const mine = data.services;

    el.innerHTML = `
      <header class="atlas-pagehead">
        <div><div class="atlas-kicker">Professional storefront</div><h1>Profile</h1><p>Control what customers see, how they book you, and what each service costs.</p></div>
        <div class="atlas-actions"><span class="atlas-status ${prof.available ? "live" : ""}">${prof.available ? "Open for bookings" : "Bookings paused"}</span></div>
      </header>

      <section class="atlas-profile-grid">
        <aside class="atlas-card dark atlas-identity">
          <div class="atlas-big-avatar">${initials(data.user.full_name)}</div>
          <h2>${esc(data.user.full_name)}</h2>
          <p>${esc(prof.profession)} · ${esc(prof.locality)}</p>
          <div class="atlas-tags"><span class="atlas-tag amber">${prof.experience_years || 0} yr experience</span><span class="atlas-tag">${mine.length} services</span></div>
          <div class="atlas-id-stat"><small>Booking status</small><strong>${prof.available ? "Open" : "Paused"}</strong></div>
          <button class="atlas-btn ${prof.available ? "light" : "amber"}" id="toggle-avail" type="button" style="width:100%;margin-top:16px;position:relative;z-index:1">${prof.available ? "Pause new bookings" : "Go available"}</button>
        </aside>

        <section class="atlas-card atlas-form-card">
          <h2>Public details</h2><p>This is the information customers see before they choose you.</p>
          <form id="prof-form">
            <div class="field-row"><div class="field"><label for="p-prof">Profession</label><input class="input" id="p-prof" value="${esc(prof.profession)}" /></div><div class="field"><label for="p-loc">Locality</label><input class="input" id="p-loc" list="p-loc-list" value="${esc(prof.locality)}" /><datalist id="p-loc-list"></datalist></div></div>
            <div class="field"><label for="p-bio">Bio</label><textarea class="input" id="p-bio" rows="5" placeholder="Tell customers what you specialise in…">${esc(prof.bio || "")}</textarea></div>
            <div class="field"><label for="p-exp">Experience (years)</label><input class="input" id="p-exp" type="number" min="0" value="${prof.experience_years || 0}" /></div>
            <button class="atlas-btn primary" type="submit">Save profile</button>
          </form>
        </section>
      </section>

      <section class="atlas-card atlas-inbox-card" style="margin-top:12px">
        <div class="atlas-card-head"><div><h2>Services & rates</h2><p>These rates feed CrewNest pricing.</p></div><span class="atlas-count">${mine.length}</span></div>
        <div class="atlas-services">${mine.map(s=>this._svcRow(s)).join("") || `<div class="atlas-empty"><div><strong>No services yet</strong><span>Add your first service below.</span></div></div>`}</div>
      </section>

      <section class="atlas-card atlas-form-card" style="margin-top:12px">
        <h2>Add a service</h2><p>Choose a service and set at least one rate.</p>
        <div class="field-row"><div class="field"><label for="add-svc">Service</label><select class="input" id="add-svc">${svcs.filter(s=>!mine.some(m=>m.service_id===s.id)).map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join("") || `<option value="">All services added</option>`}</select></div><div class="field"><label for="new-h">Hourly</label><input class="input" id="new-h" type="number" min="0" step="0.01" placeholder="₹ / hr" /></div><div class="field"><label for="new-d">Daily</label><input class="input" id="new-d" type="number" min="0" step="0.01" placeholder="₹ / day" /></div><div class="field"><label for="new-m">Monthly</label><input class="input" id="new-m" type="number" min="0" step="0.01" placeholder="₹ / month" /></div></div>
        <button class="atlas-btn primary" id="add-svc-btn" type="button">${icon("plus")} Add service</button>
      </section>
    `;

    API.get("/api/localities").then(d=>{el.querySelector("#p-loc-list").innerHTML=d.localities.map(l=>`<option value="${esc(l)}"></option>`).join("");}).catch(()=>{});
    el.querySelector("#prof-form").addEventListener("submit",async e=>{e.preventDefault();try{await API.put("/api/providers/me",{profession:el.querySelector("#p-prof").value.trim(),locality:el.querySelector("#p-loc").value.trim(),bio:el.querySelector("#p-bio").value.trim()||null,experience_years:parseInt(el.querySelector("#p-exp").value)||0});Toast.success("Profile saved");this.render();}catch(err){Toast.error(err.message);}});
    el.querySelector("#toggle-avail").addEventListener("click",async()=>{try{await API.put("/api/providers/me",{available:!prof.available});Toast.success("Availability updated");this.render();}catch(err){Toast.error(err.message);}});
    el.querySelector("#add-svc-btn").addEventListener("click",async()=>{const sid=el.querySelector("#add-svc").value,h=parseFloat(el.querySelector("#new-h").value)||null,d=parseFloat(el.querySelector("#new-d").value)||null,m=parseFloat(el.querySelector("#new-m").value)||null;if(!sid||(h==null&&d==null&&m==null)){Toast.error("Choose a service and at least one rate.");return;}try{await API.post("/api/providers/me/services",{service_id:Number(sid),hourly_rate:h,daily_rate:d,monthly_rate:m});Toast.success("Service added");this.render();}catch(err){Toast.error(err.message);}});
    el.querySelectorAll(".remove-svc").forEach(b=>b.addEventListener("click",async e=>{e.preventDefault();if(!confirm("Remove this service?"))return;try{await API.del("/api/providers/me/services/"+b.dataset.id);Toast.success("Service removed");this.render();}catch(err){Toast.error(err.message);}}));
  },

  _svcRow(s){return `<div class="atlas-service-row"><div><strong>${esc(s.service_name)}</strong><div class="atlas-meta">Customer-facing service</div></div><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end"><div class="atlas-rate-group">${s.hourly_rate?`<span class="atlas-tag mint">${money(s.hourly_rate)}/hr</span>`:""}${s.daily_rate?`<span class="atlas-tag">${money(s.daily_rate)}/day</span>`:""}${s.monthly_rate?`<span class="atlas-tag">${money(s.monthly_rate)}/mo</span>`:""}</div><button class="atlas-btn light remove-svc" data-id="${s.id}" type="button">Remove</button></div></div>`;}
};
