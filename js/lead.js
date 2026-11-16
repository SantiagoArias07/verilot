// Shared client for submitting leads to the /api/lead serverless function.
// Returns { ok, status, error } — never throws.
export async function postLead(payload) {
  try {
    const r = await fetch('/api/lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    let data = {};
    try { data = await r.json(); } catch (e) { /* non-JSON response */ }
    return { ok: r.ok && data.ok !== false, status: r.status, error: data.error };
  } catch (e) {
    return { ok: false, status: 0, error: 'Network error. Check your connection and try again.' };
  }
}
