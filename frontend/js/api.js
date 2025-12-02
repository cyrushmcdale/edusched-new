const API_URL = "https://edusched-1e46.onrender.com/api";

async function apiFetch(endpoint, options = {}) {
  const token = localStorage.getItem("token");

  const config = {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "Authorization": token ? `Bearer ${token}` : "",
    }
  };

  if (options.body) {
    config.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_URL}${endpoint}`, config);

  if (!res.ok) {
    throw new Error(`API error on ${endpoint}`);
  }

  return res.json();
}

// Authentication example
async function loginInstructor(email, password) {
  return apiFetch("/auth/login", {
    method: "POST",
    body: { email, password },
  });
}
