// Provider profile — professional identity, availability and service-rate console.
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
      <section class="pv-page-banner">
        <div><span class="pv-eyebrow">${icon("user")} Provider profile</span><h1 style="font-size:2.35rem;line-height:1;letter-spacing:-.045em;margin-top:10px">My profile</h1><p>Manage your public details, availability and service rates.</p></div>
      </section>

      <div class="pv-profile-grid">
        <aside class="pv-profile-card">
          <div class="pv-profile-avatar">${initials(data.user.full_name)}</div>
          <h2>${esc(data.user.full_name)}</h2>
          <p>${esc(prof.profession)} · ${esc(prof.locality)}</p>
          <div class="pv-task-tags"><span class="pv-chip ${prof.available ? "mint" : ""}">${prof.available ? "Available for booking" : "Unavailable"}</span><span class="pv-chip">${prof.experience_years || 0} yr experience</span></div>
          <div class="pv-profile-stat"><small style="color:rgba(255,255,255,.55)">Services offered</small><strong style="display:block;font-size:1.55rem;margin-top:4px">${mine.length}</strong></div>
          <button class="btn ${prof.available ? "ghost" : "primary"}" id="toggle-avail" type="button" style="width:100%;margin-top:18px">${prof.available ? "Pause new bookings" : "Go available"}</button>
        </aside>

        <section class="pv-form-card">
          <div class="pv-panel-head"><div><h2 style="margin:0">Profile details</h2><div class="pv-panel-sub">Customers see this information before they book you.</div></div></div>
          <form id="prof-form">
            <div class="field-row"><div class="field"><label for="p-prof">Profession</label><input class="input" id="p-prof" value="${esc(prof.profession)}" /></div><div class="field"><label for="p-loc">Locality</label><input class="input" id="p-loc" list="p-loc-list" value="${esc(prof.locality)}" /><datalist id="p-loc-list"></datalist></div></div>
            <div class="field"><label for="p-bio">Bio</label><textarea class="input" id="p-bio" rows="5" placeholder="Tell customers what you specialise in…">${esc(prof.bio || "")}</textarea></div>
            <div class="field"><label for="p-exp">Experience (years)</label><input class="input" id="p-exp" type="number" min="0" value="${prof.experience_years || 0}" /></div>
            <button class="btn primary" type="submit">Save profile</button>
          </form>
        </section>
      </div>

      <section class="pv-panel" style="margin-top:16px">
        <div class="pv-panel-head"><div><h2>Services & rates</h2><div class="pv-panel-sub">These rates feed CrewNest’s server-side pricing.</div></div><span class="pv-chip">${mine.length} active</span></div>
        <div class="pv-service-list" id="svc-list">${mine.map(s => this._svcRow(s)).join("") || `<div class="pv-empty"><strong>No services added</strong>Add your first service below.</div>`}</div>
      </section>

      <section class="pv-panel" style="margin-top:16px">
        <div class="pv-panel-head"><div><h2>Add another service</h2><div class="pv-panel-sub">Choose a service and set at least one rate.</div></div></div>
        <div class="field-row"><div class="field"><label for="add-svc">Service</label><select class="input" id="add-svc">${svcs.filter(s => !mine.some(m => m.service_id === s.id)).map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join("") || `<option value="">All services added</option>`}</select></div>
          <div class="field"><label for="new-h">Hourly</label><input class="input" id="new-h" type="number" min="0" step="0.01" placeholder="₹ / hr" /></div><div class="field"><label for="new-d">Daily</label><input class="input" id="new-d" type="number" min="0" step="0.01" placeholder="₹ / day" /></div><div class="field"><label for="new-m">Monthly</label><input class="input" id="new-m" type="number" min="0" step="0.01" placeholder="₹ / month" /></div></div>
        <button class="btn primary" id="add-svc-btn" type="button">${icon("plus")} Add service</button>
      </section>`;

    API.get("/api/localities").then(d => { el.querySelector("#p-loc-list").innerHTML = d.localities.map(l => `<option value="${esc(l)}"></option>`).join(""); }).catch(() => {});
    el.querySelector("#prof-form").addEventListener("submit", async e => {
      e.preventDefault();
      try { await API.put("/api/providers/me", { profession:el.querySelector("#p-prof").value.trim(), locality:el.querySelector("#p-loc").value.trim(), bio:el.querySelector("#p-bio").value.trim()||null, experience_years:parseInt(el.querySelector("#p-exp").value)||0 }); Toast.success("Profile saved"); this.render(); }
      catch(err){Toast.error(err.message);}
    });
    el.querySelector("#toggle-avail").addEventListener("click", async()=>{ try{await API.put("/api/providers/me",{available:!prof.available});Toast.success("Availability updated");this.render();}catch(err){Toast.error(err.message);} });
    el.querySelector("#add-svc-btn").addEventListener("click", async()=>{
      const sid=el.querySelector("#add-svc").value,h=parseFloat(el.querySelector("#new-h").value)||null,d=parseFloat(el.querySelector("#new-d").value)||null,m=parseFloat(el.querySelector("#new-m").value)||null;
      if(!sid||(h==null&&d==null&&m==null)){Toast.error("Choose a service and at least one rate.");return;}
      try{await API.post("/api/providers/me/services",{service_id:Number(sid),hourly_rate:h,daily_rate:d,monthly_rate:m});Toast.success("Service added");this.render();}catch(err){Toast.error(err.message);}
    });
    el.querySelectorAll(".remove-svc").forEach(b=>b.addEventListener("click",async e=>{e.preventDefault();if(!confirm("Remove this service?"))return;try{await API.del("/api/providers/me/services/"+b.dataset.id);Toast.success("Service removed");this.render();}catch(err){Toast.error(err.message);}}));
  },

  _svcRow(s) {
    return `<div class="pv-service-row"><div><strong>${esc(s.service_name)}</strong><div class="xsmall muted">Customer-facing service</div></div><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end"><div class="pv-service-rates">${s.hourly_rate?`<span class="pv-chip mint">${money(s.hourly_rate)}/hr</span>`:""}${s.daily_rate?`<span class="pv-chip">${money(s.daily_rate)}/day</span>`:""}${s.monthly_rate?`<span class="pv-chip">${money(s.monthly_rate)}/mo</span>`:""}</div><button class="btn sm ghost remove-svc" data-id="${s.id}" type="button">Remove</button></div></div>`;
  },
};
