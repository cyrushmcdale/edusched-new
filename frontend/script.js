/* script.js - patched so student-schedule modal scripts NEVER break
   and initializer name mismatches (hyphen vs underscore) are handled.
*/

const API_BASE = "http://localhost:3000/api";

// ----------------------------------
// Auth helpers
// ----------------------------------
function saveSession(payload) {
  localStorage.setItem("token", payload.token);
  localStorage.setItem("role", payload.role);
  localStorage.setItem("user_id", payload.id);
  localStorage.setItem("user_name", payload.name || "");
}

function clearSession() {
  localStorage.removeItem("token");
  localStorage.removeItem("role");
  localStorage.removeItem("user_id");
  localStorage.removeItem("user_name");
}

function getAuthHeaders() {
  const token = localStorage.getItem("token");
  return token ? { Authorization: "Bearer " + token } : {};
}

// ----------------------------------
// FIXED loadPage()
// ----------------------------------
async function loadPage(page, link = null) {
  try {
    const res = await fetch(page);
    if (!res.ok) throw new Error("Cannot fetch page: " + page);

    const html = await res.text();
    const main = document.getElementById("main-content");
    if (!main) throw new Error("Main content element not found");

    // replace content
    main.innerHTML = html;

    // highlight sidebar links
    document.querySelectorAll(".sidebar-link").forEach(a => {
      a.classList.remove("bg-gray-200", "text-gray-900", "font-medium");
      a.classList.add("text-gray-700");
    });
    if (link) {
      link.classList.add("bg-gray-200", "text-gray-900", "font-medium");
      link.classList.remove("text-gray-700");
    }

    // run feather icons if available
    if (window.feather) feather.replace();

    // -------------------------------
    // Execute inline scripts SAFELY
    // We recreate <script> tags found inside the loaded HTML so their
    // content executes in the global scope.
    // -------------------------------
    try {
      const inlineScripts = Array.from(main.querySelectorAll("script"));
      for (const s of inlineScripts) {
        const newScript = document.createElement("script");
        // copy type if present
        if (s.type) newScript.type = s.type;
        if (s.src) {
          // external script - attach and wait for it to load (non-blocking)
          newScript.src = s.src;
          // don't await; keep UX responsive. If you need to guarantee order,
          // consider awaiting load events (not done here to avoid blocking).
          main.appendChild(newScript);
        } else {
          // inline script content
          try {
            newScript.textContent = s.textContent;
            main.appendChild(newScript);
          } catch (ex) {
            // fallback: evaluate as a last resort
            try { (0, eval)(s.textContent); } catch(e) { console.error("Eval inline script failed", e); }
          }
        }
      }
    } catch (errScripts) {
      console.warn("Failed to re-run inline scripts:", errScripts);
    }

    // -------------------------------
    // Call page initializers (many fallback name styles)
    // e.g. student-home.html may define window["init_student-home"]
    // or window["init_student_home"]. Try a variety of variants.
    // -------------------------------
    const filename = page.split("/").pop().replace(".html", "");
    const variants = [];

    // original filename with hyphen and underscore variants
    variants.push(filename); // e.g. student-home
    variants.push(filename.replace(/-/g, "_")); // student_home
    variants.push(filename.replace(/_/g, "-")); // if user used opposite

    // combine a few init name patterns used in the project
    const initNames = new Set();
    variants.forEach(v => {
      initNames.add("init_" + v);        // init_student-home or init_student_home
      initNames.add("init" + v);         // initstudent-home
      initNames.add("init" + v.replace(/[-_]/g, "_")); // initstudent_home
      initNames.add("init_" + v.replace(/[-_]/g, "_")); // init_student_home
    });

    // also include a sanitized single-naming form
    initNames.add("init_" + filename.replace(/[-_]/g, ""));
    initNames.add("init" + filename.replace(/[-_]/g, ""));

    let called = false;
    for (const name of initNames) {
      const fn = window[name];
      if (typeof fn === "function") {
        try {
          setTimeout(() => {
            try { fn(); } catch (e) { console.error(`Init function ${name} failed:`, e); }
          }, 40);
        } catch (e) {
          console.error("Error invoking init", e);
        }
        called = true;
        break;
      }
    }

    if (!called) {
      // developer-friendly: show a console warning so missing init is obvious
      console.warn("No init function found for page. Expected one of:", Array.from(initNames));
    }

  } catch (err) {
    console.error(err);
    const main = document.getElementById("main-content");
    if (main) main.innerHTML = "<p class='text-red-600'>Error loading page.</p>";
  }
}

// ----------------------------------
// Protect layout
// ----------------------------------
function protectLayout(expectedRole) {
  const token = localStorage.getItem("token");
  const role = localStorage.getItem("role");
  if (!token || role !== expectedRole) {
    clearSession();
    window.location.href =
      expectedRole === "admin"
        ? "admin-login.html"
        : "student-login.html";
  }
}

// ----------------------------------
function setNavbarName() {
  const name = localStorage.getItem("user_name") || "";
  const el = document.querySelector("header span.text-gray-700") || document.getElementById("navbarStudentName");
  if (el) el.textContent = name;
}

// ----------------------------------
// Global fetch wrapper
// ----------------------------------
async function apiFetch(path, opts = {}) {
  opts = opts || {};
  opts.headers = Object.assign({}, opts.headers || {}, getAuthHeaders(), { "Content-Type": opts.headers && opts.headers['Content-Type'] ? opts.headers['Content-Type'] : "application/json" });

  const res = await fetch(API_BASE + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw data;
  return data;
}

// ----------------------------------
async function doLogin(userId, password, role) {
  const res = await fetch(API_BASE + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId, password, role })
  });
  const data = await res.json();
  if (!res.ok) throw data;
  saveSession(data);
  return data;
}

// ----------------------------------
function logoutAndRedirect() {
  clearSession();
  if (location.origin.includes("5500")) {
    location.href = location.origin + "/frontend/index.html";
  } else {
    location.href = "../index.html";
  }
}

// ----------------------------------
// Developer convenience: when layout file is opened directly
// (not necessary but harmless)
// ----------------------------------
document.addEventListener("DOMContentLoaded", () => {
  // if an admin or student layout is opened directly, ensure default page loads
  const path = window.location.pathname || "";
  if (path.includes("admin-layout.html") || path.includes("/admin/")) {
    setTimeout(() => {
      const defaultLink = document.querySelector(".sidebar-link");
      if (defaultLink) loadPage("admin-home.html", defaultLink);
    }, 120);
  }
  if (path.includes("student-layout.html") || path.includes("/student/")) {
    setTimeout(() => {
      const defaultLink = document.querySelector(".sidebar-link");
      if (defaultLink) loadPage("student-home.html", defaultLink);
    }, 120);
  }
});

// ----------------------------------
window.loadPage = loadPage;
window.protectLayout = protectLayout;
window.setNavbarName = setNavbarName;
window.apiFetch = apiFetch;
window.doLogin = doLogin;
window.logoutAndRedirect = logoutAndRedirect;
