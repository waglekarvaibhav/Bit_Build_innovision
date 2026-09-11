// CrewNest API client. All business data comes from the backend; the browser
// never persists bookings/packages itself. A 401 clears the session token.
const API = {
  base: "",

  async request(method, path, body, opts = {}) {
    const headers = { "Content-Type": "application/json" };
    headers["Accept"] = "application/json";
    const tok = Auth.token();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;

    const init = { method, headers };
    if (body !== undefined && method !== "GET") init.body = JSON.stringify(body);

    let res;
    try {
      res = await fetch(this.base + path, init);
    } catch (e) {
      throw new Error("Network error — is the CrewNest server running?");
    }
    if (res.status === 401) {
      Auth.clear();
      if (!location.pathname.includes("/login")) {
        location.href = "/login";
      }
      throw new Error("Session expired. Please sign in again.");
    }
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const msg =
        (data && data.detail) ||
        (data && Array.isArray(data.detail) && data.detail[0] && data.detail[0].msg) ||
        `Request failed (${res.status})`;
      const err = new Error(typeof msg === "string" ? msg : String(msg));
      err.status = res.status;
      throw err;
    }
    return data;
  },

  get(path, opts) { return this.request("GET", path, undefined, opts); },
  post(path, body, opts) { return this.request("POST", path, body, opts); },
  put(path, body, opts) { return this.request("PUT", path, body, opts); },
  del(path, opts) { return this.request("DELETE", path, undefined, opts); },

  async upload(path, photoType, file) {
    const fd = new FormData();
    fd.append("photo_type", photoType);
    fd.append("file", file);
    const headers = {};
    const tok = Auth.token();
    if (tok) headers["Authorization"] = `Bearer ${tok}`;
    const res = await fetch(this.base + path, { method: "POST", headers, body: fd });
    if (res.status === 401) { Auth.clear(); location.href = "/login"; }
    let data = null; try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && (data.detail || (Array.isArray(data.detail) && data.detail[0] && data.detail[0].msg))) || "Upload failed");
    return data;
  },
};

// Auth storage helper. The token is kept in localStorage for this demo app.
const Auth = {
  _KEY: "crewneat.auth",
  save(user) {
    localStorage.setItem(this._KEY, JSON.stringify(user));
  },
  get() {
    try {
      const u = JSON.parse(localStorage.getItem(this._KEY)) || null;
      if (u && u.user_id && u.id === undefined) u.id = u.user_id;
      return u;
    } catch (e) { return null; }
  },
  token() { const u = this.get(); return u ? u.access_token : null; },
  user() { return this.get(); },
  clear() { localStorage.removeItem(this._KEY); },
  isAuthenticated() { return !!this.token(); },
  role() { const u = this.get(); return u ? u.role : null; },
};

// Notifications
const Toast = {
  _region: null,
  region() {
    if (!this._region) {
      this._region = document.createElement("div");
      this._region.className = "toast-region";
      this._region.setAttribute("role", "status");
      this._region.setAttribute("aria-live", "polite");
      document.body.appendChild(this._region);
    }
    return this._region;
  },
  show(message, type = "info", ms = 3200) {
    const t = document.createElement("div");
    t.className = `toast ${type}`;
    t.textContent = message;
    t.setAttribute("role", type === "error" ? "alert" : "status");
    this.region().appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = "opacity .2s"; setTimeout(() => t.remove(), 220); }, ms);
  },
  success(m) { this.show(m, "success"); },
  error(m) { this.show(m, "error", 4600); },
  info(m) { this.show(m, "info"); },
};

// Role-based redirect helper.
function requireRole(...roles) {
  if (!Auth.isAuthenticated()) { location.href = "/login"; return false; }
  if (!roles.includes(Auth.role())) { location.href = roleHome(Auth.role()); return false; }
  return true;
}

function roleHome(role) {
  return role === "provider" ? "/provider-home" : "/home";
}

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase();
}
