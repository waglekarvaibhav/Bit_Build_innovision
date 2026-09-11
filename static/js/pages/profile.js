// Customer profile (/profile) — editable name/mobile.
const CustomerProfile = {
  async render() {
    if (!requireRole("customer")) return;
    const me = Auth.user();
    const shell = mountShell("profile");
    const head = `<h1>My Profile</h1>`;
    const page = AppShell.page(head);
    const el = page.el;

    let p;
    try { p = await API.get("/api/customers/me"); }
    catch (e) { showFatal(e, el); return; }

    el.innerHTML = `
      <div class="card">
        <form id="profile-form">
          <div class="field"><label for="p-name">Full name</label><input class="input" id="p-name" value="${esc(p.full_name)}" required minlength="2" /></div>
          <div class="field"><label for="p-email">Email</label><input class="input" id="p-email" value="${esc(p.email)}" disabled /><span class="hint">Email cannot be changed.</span></div>
          <div class="field"><label for="p-mobile">Mobile number <span class="xsmall muted">(for crews to reach you)</span></label><input class="input" id="p-mobile" type="tel" value="${esc(p.mobile_number || "")}" placeholder="9xxxxxxxxx" /></div>
          <button class="btn" type="submit">Save changes</button>
        </form>
        <button class="btn sm ghost mt-1" id="logout-inline">Sign out</button>
      </div>
    `;
    el.querySelector("#logout-inline").addEventListener("click", () => { Auth.clear(); location.href = "/login"; });
    el.querySelector("#profile-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector("button[type=submit]");
      btn.disabled = true;
      try {
        await API.put("/api/customers/me", {
          full_name: document.getElementById("p-name").value.trim(),
          mobile_number: document.getElementById("p-mobile").value.trim() || null,
        });
        Toast.success("Profile updated");
        const u = Auth.get(); u.full_name = document.getElementById("p-name").value.trim(); Auth.save(u);
        location.reload();
      } catch (err) { Toast.error(err.message); btn.disabled = false; }
    });
  },
};
