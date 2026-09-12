// Provider package studio — open canvas, no dashboard/banner header.
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
      <section style="display:grid;grid-template-columns:minmax(0,1fr) auto;gap:24px;align-items:end;padding:8px 2px 18px;border-bottom:1px solid var(--cn-line);margin-bottom:16px">
        <div>
          <span class="pv-studio-label">${icon("box")} PACKAGE STUDIO</span>
          <h1 style="font-size:2.45rem;line-height:1;letter-spacing:-.05em;margin:10px 0 8px">Package studio</h1>
          <p style="max-width:620px;margin:0;color:var(--cn-muted);line-height:1.55">Create and manage service bundles and team packages.</p>
        </div>
        <button class="btn primary" id="create-pkg" style="min-height:42px;padding-inline:16px">${icon("plus")} New package</button>
      </section>

      <div class="pv-metric-strip" style="margin-top:0">
        <div><span>Published</span><strong>${active.length}</strong><small>live offers</small></div>
        <div><span>Multitasking</span><strong>${multi.length}</strong><small>bundles</small></div>
        <div><span>Teams</span><strong>${teams.length}</strong><small>crew offers</small></div>
        <div><span>Total</span><strong>${pkgs.length}</strong><small>all packages</small></div>
      </div>

      <section class="pv-panel">
        <div class="pv-panel-head"><div><h2>Your offers</h2><div class="pv-panel-sub">Edit live packages or archive offers you no longer want customers to book.</div></div></div>
        <div id="pkg-list">${pkgs.length ? `<div class="pv-package-grid">${pkgs.map(p => this.card(p)).join("")}</div>` : `<div class="pv-empty"><strong>No packages yet</strong>Create your first multitasking or team offer.</div>`}</div>
      </section>`;

    el.querySelectorAll("[data-archive]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); this._archive(b.dataset.archive, b); }));
    el.querySelectorAll("[data-edit]").forEach(b => b.addEventListener("click", e => { e.preventDefault(); this._modal(svcs, pkgs.find(x => x.id == b.dataset.edit)); }));
    document.getElementById("create-pkg").addEventListener("click", () => this._modal(svcs, null));
  },

  card(p) {
    const members = p.member_count ? `${p.member_count} member crew` : "Solo delivery";
    return `<article class="pv-package-card ${p.package_type}">
      <div class="between"><span class="pv-chip ${p.package_type === "team" ? "coral" : "mint"}">${p.package_type === "team" ? "Team" : "Multitasking"}</span><span class="xsmall muted">${esc(p.status)}</span></div>
      <h3>${esc(p.name)}</h3>
      <p class="small muted">${esc(p.locality)} · ${p.service_count} services · ${members}</p>
      <div class="pv-task-tags">${p.services.slice(0,4).map(s => `<span class="pv-chip">${esc(s)}</span>`).join("")}</div>
      <div class="pv-package-rate" style="margin-top:16px">${money(p.hourly_rate)}<small>/hr</small></div>
      ${p.status === "archived" ? `<p class="xsmall muted mt-1">Archived — existing bookings remain unchanged.</p>` : `<div class="pv-package-actions"><button class="btn sm ghost" data-edit="${p.id}">Edit package</button><button class="btn sm danger" data-archive="${p.id}">Archive</button></div>`}
    </article>`;
  },

  _modal(svcs, pkg) {
    const me = Auth.get();
    const wrap = document.createElement("div");
    wrap.className = "dialog-backdrop open";
    wrap.setAttribute("role","dialog"); wrap.setAttribute("aria-modal","true");
    const initialType = pkg ? pkg.package_type : "multitasking";
    wrap.innerHTML = `<div class="dialog">
      <span class="pv-studio-label">${pkg ? "EDIT OFFER" : "NEW OFFER"}</span>
      <h2>${pkg ? "Refine your package" : "Build a bookable package"}</h2>
      <p class="small muted">Define the outcome, location, services, team and whole-package hourly rate.</p>
      <form id="pkg-form" novalidate>
        <div class="field"><label>Package type</label><div class="chips-row" id="type-tabs">
          <button type="button" class="pill-btn ${initialType === "multitasking" ? "active" : ""}" data-type="multitasking">Multitasking</button>
          <button type="button" class="pill-btn ${initialType === "team" ? "active" : ""}" data-type="team">Team</button>
        </div></div>
        <div class="field"><label for="pm-name">Package name</label><input class="input" id="pm-name" value="${pkg ? esc(pkg.name) : ""}" required minlength="2" placeholder="e.g. Complete Move-In Care" /></div>
        <div class="field"><label for="pm-desc">Description</label><textarea class="input" id="pm-desc" required minlength="2" placeholder="Explain the outcome customers get…">${pkg ? esc(pkg.description) : ""}</textarea></div>
        <div class="field-row"><div class="field"><label for="pm-loc">Locality</label><input class="input" id="pm-loc" list="pm-loc-list" value="${pkg ? esc(pkg.locality) : ""}" required /><datalist id="pm-loc-list"></datalist></div>
          <div class="field"><label for="pm-rate">Whole-package hourly rate</label><input class="input" id="pm-rate" type="number" min="0.01" step="0.01" value="${pkg ? pkg.hourly_rate : ""}" required /></div></div>
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
      memberWrap.innerHTML = others.map(p => `<div class="between" style="border-bottom:1px solid var(--cn-line);padding:9px 0"><label style="display:flex;align-items:center;gap:9px"><input type="checkbox" class="pm-check" data-id="${p.user_id}" ${memberSet.has(p.user_id)?"checked":""}/><span>${esc(p.full_name)} <small class="muted">· ${esc(p.profession || "Provider")}</small></span></label><label class="xsmall muted"><input type="radio" name="pm-lead" value="${p.user_id}" ${leadId===p.user_id?"checked":""} ${memberSet.has(p.user_id)?"":"disabled"}/> lead</label></div>`).join("") || `<p class="xsmall muted">No other providers registered yet.</p>`;
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
