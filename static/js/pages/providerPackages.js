// CrewNest NX package studio — productized service offers.
const ProviderPackages = {
  async render() {
    if (!requireRole("provider")) return;
    mountShell("packages");
    const page = AppShell.page("");
    const el = page.el;
    el.innerHTML = `<div class="skeleton"></div>`;

    let pkgs, svcs;
    try {
      const [p, s] = await Promise.all([API.get("/api/providers/me/packages"), API.get("/api/services")]);
      pkgs = p.packages; svcs = s;
    } catch (e) { showFatal(e, el); return; }

    const active = pkgs.filter(p => p.status !== "archived");
    const teams = active.filter(p => p.package_type === "team");
    const multi = active.filter(p => p.package_type === "multitasking");

    el.innerHTML = `
      <div class="nx-topline">
        <div class="nx-title-wrap"><div class="nx-kicker"><i></i> Offer builder</div><h1 class="nx-title">Studio</h1><p class="nx-sub">Turn repeat work into clear, bookable products.</p></div>
        <div class="nx-top-actions"><button class="nx-btn primary" id="create-pkg">${icon("plus")} New package</button></div>
      </div>

      <section class="nx-statline">
        <div class="nx-card nx-stat"><small>Published</small><strong>${active.length}</strong><em>live offers</em></div>
        <div class="nx-card nx-stat"><small>Multitasking</small><strong>${multi.length}</strong><em>bundles</em></div>
        <div class="nx-card nx-stat"><small>Teams</small><strong>${teams.length}</strong><em>crew offers</em></div>
        <div class="nx-card nx-stat"><small>Total</small><strong>${pkgs.length}</strong><em>all packages</em></div>
      </section>

      <section class="nx-studio-grid">${pkgs.length ? pkgs.map(p => this.card(p)).join("") : `<div class="nx-card nx-empty" style="grid-column:1/-1"><div><strong>No packages yet</strong><span>Create your first multitasking or team offer.</span></div></div>`}</section>
    `;

    el.querySelectorAll("[data-archive]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); this._archive(b.dataset.archive, b); }));
    el.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); this._modal(svcs, pkgs.find(x => x.id == b.dataset.edit)); }));
    document.getElementById("create-pkg").addEventListener("click", () => this._modal(svcs, null));
  },

  card(p) {
    const members = p.member_count ? `${p.member_count} member crew` : "Solo delivery";
    return `<article class="nx-card nx-offer ${p.package_type === "team" ? "team" : ""}">
      <div class="between"><span class="nx-offer-type">${p.package_type === "team" ? "TEAM PACKAGE" : "MULTITASKING"}</span><span class="nx-tag ${p.status === "published" ? "lime" : ""}">${esc(p.status)}</span></div>
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.locality)} · ${p.service_count} services · ${members}</p>
      <div class="nx-tags">${p.services.slice(0,4).map(s => `<span class="nx-tag">${esc(s)}</span>`).join("")}</div>
      <div class="nx-offer-rate">${money(p.hourly_rate)}<small>/hr</small></div>
      ${p.status === "archived" ? `<p>Archived — existing bookings stay unchanged.</p>` : `<div class="nx-offer-actions"><button class="nx-btn light" data-edit="${p.id}">Edit</button><button class="nx-btn danger" data-archive="${p.id}">Archive</button></div>`}
    </article>`;
  },

  _modal(svcs, pkg) {
    const me = Auth.get();
    const wrap = document.createElement("div");
    wrap.className = "dialog-backdrop open";
    wrap.setAttribute("role","dialog"); wrap.setAttribute("aria-modal","true");
    const initialType = pkg ? pkg.package_type : "multitasking";
    wrap.innerHTML = `<div class="dialog">
      <div class="nx-kicker"><i></i> ${pkg ? "Edit offer" : "New offer"}</div>
      <h2>${pkg ? "Refine package" : "Build package"}</h2>
      <p class="small muted">Define the outcome, location, services, team and whole-package hourly rate.</p>
      <form id="pkg-form" novalidate>
        <div class="field"><label>Package type</label><div class="chips-row" id="type-tabs">
          <button type="button" class="pill-btn ${initialType === "multitasking" ? "active" : ""}" data-type="multitasking">Multitasking</button>
          <button type="button" class="pill-btn ${initialType === "team" ? "active" : ""}" data-type="team">Team</button>
        </div></div>
        <div class="field"><label for="pm-name">Package name</label><input class="input" id="pm-name" value="${pkg ? esc(pkg.name) : ""}" required minlength="2" placeholder="e.g. Complete Move-In Care" /></div>
        <div class="field"><label for="pm-desc">Description</label><textarea class="input" id="pm-desc" required minlength="2" placeholder="Explain the outcome customers get…">${pkg ? esc(pkg.description) : ""}</textarea></div>
        <div class="field-row"><div class="field"><label for="pm-loc">Locality</label><input class="input" id="pm-loc" list="pm-loc-list" value="${pkg ? esc(pkg.locality) : ""}" required /><datalist id="pm-loc-list"></datalist></div><div class="field"><label for="pm-rate">Whole-package hourly rate</label><input class="input" id="pm-rate" type="number" min="0.01" step="0.01" value="${pkg ? pkg.hourly_rate : ""}" required /></div></div>
        <div class="field"><label>Included services <span class="xsmall muted">(multitasking requires 2+)</span></label><div class="chips-row" id="pm-services"></div></div>
        <div class="field" id="pm-members-field" style="${initialType === "team" ? "" : "display:none"}"><label>Crew members <span class="xsmall muted">(team requires 2+ and one lead)</span></label><div id="pm-members" class="col"></div></div>
        <div class="dialog-actions"><button class="btn ghost" id="pm-close" type="button">Cancel</button><button class="btn primary" id="pm-submit" type="submit">${pkg ? "Save changes" : "Publish package"}</button></div>
      </form>
    </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.addEventListener("click", e => { if (e.target === wrap) close(); });
    wrap.querySelector("#pm-close").addEventListener("click", close);
    document.addEventListener("keydown", function escKey(e){ if(e.key === "Escape"){ close(); document.removeEventListener("keydown",escKey); }});

    let packageType = initialType;
    const svcSet = new Set((pkg && pkg.service_ids) || []);
    const memberSet = new Set((pkg && pkg.members ? pkg.members.map(m => m.user_id) : []));
    let leadId = (pkg && pkg.lead ? pkg.lead.user_id : null);

    API.get("/api/localities").then(d => { wrap.querySelector("#pm-loc-list").innerHTML = d.localities.map(l => `<option value="${esc(l)}"></option>`).join(""); }).catch(() => {});
    const svcWrap = wrap.querySelector("#pm-services");
    svcWrap.innerHTML = svcs.map(s => `<button type="button" class="pill-btn ${svcSet.has(s.id)?"active":""}" data-svc="${s.id}">${esc(s.name)}</button>`).join("");
    svcWrap.querySelectorAll("[data-svc]").forEach(b => b.addEventListener("click",()=>{ const on=b.classList.toggle("active"); b.setAttribute("aria-pressed",on?"true":"false"); }));
    wrap.querySelectorAll("#type-tabs [data-type]").forEach(tab => tab.addEventListener("click",()=>{ packageType=tab.dataset.type; wrap.querySelectorAll("#type-tabs [data-type]").forEach(t=>t.classList.remove("active")); tab.classList.add("active"); wrap.querySelector("#pm-members-field").style.display=packageType === "team" ? "" : "none"; }));

    const memberWrap = wrap.querySelector("#pm-members");
    API.get("/api/providers").then(all => {
      const others = all.filter(p => p.user_id && p.user_id !== me.user_id);
      memberWrap.innerHTML = others.map(p => `<div class="between" style="border-bottom:1px solid var(--nx-line);padding:9px 0"><label style="display:flex;align-items:center;gap:9px"><input type="checkbox" class="pm-check" data-id="${p.user_id}" ${memberSet.has(p.user_id)?"checked":""}/><span>${esc(p.full_name)} <small class="muted">· ${esc(p.profession || "Provider")}</small></span></label><label class="xsmall muted"><input type="radio" name="pm-lead" value="${p.user_id}" ${leadId===p.user_id?"checked":""} ${memberSet.has(p.user_id)?"":"disabled"}/> lead</label></div>`).join("") || `<p class="xsmall muted">No other providers registered yet.</p>`;
      memberWrap.querySelectorAll(".pm-check").forEach(c => c.addEventListener("change",()=>{ const r=memberWrap.querySelector(`input[name="pm-lead"][value="${c.dataset.id}"]`); r.disabled=!c.checked; if(!c.checked&&r.checked){r.checked=false;leadId=null;} }));
    }).catch(()=> memberWrap.innerHTML=`<p class="xsmall muted">Could not load providers.</p>`);

    wrap.querySelector("#pkg-form").addEventListener("submit", async e => {
      e.preventDefault();
      const serviceIds=[...svcWrap.querySelectorAll("[data-svc].active")].map(b=>Number(b.dataset.svc));
      const members=[...memberWrap.querySelectorAll(".pm-check:checked")].map(c=>Number(c.dataset.id));
      const leadEl=memberWrap.querySelector("input[name=pm-lead]:checked"); const lead=leadEl?Number(leadEl.value):null;
      if(packageType==="multitasking"&&serviceIds.length<2){Toast.error("Multitasking needs at least 2 services.");return;}
      if(packageType==="team"&&(members.length<2||!lead)){Toast.error(members.length<2?"Team needs at least 2 members.":"Select a team lead.");return;}
      const payload={name:wrap.querySelector("#pm-name").value.trim(),description:wrap.querySelector("#pm-desc").value.trim(),locality:wrap.querySelector("#pm-loc").value.trim(),hourly_rate:parseFloat(wrap.querySelector("#pm-rate").value),package_type:packageType,status:"published",service_ids:serviceIds,member_ids:packageType==="team"?members:[],lead_member_id:packageType==="team"?lead:null};
      const btn=wrap.querySelector("#pm-submit");btn.disabled=true;
      try{ if(pkg) await API.put("/api/providers/me/packages/"+pkg.id,payload); else await API.post("/api/providers/me/packages",payload); Toast.success(pkg?"Package updated":"Package published"); close(); this.render(); }
      catch(err){Toast.error(err.message);btn.disabled=false;}
    });
  },

  async _archive(id, btn) {
    if (!confirm("Archive this package? New bookings will be blocked; existing bookings stay unchanged.")) return;
    btn.disabled = true;
    try { await API.post("/api/providers/me/packages/"+id+"/archive",{}); Toast.success("Package archived"); this.render(); }
    catch(e){Toast.error(e.message);btn.disabled=false;}
  },
};
