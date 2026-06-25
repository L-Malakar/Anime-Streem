// ══════════════════════════════════════
// SHARED ANIME DATA LOADER
// Tries details.json first. Falls back to demo.json if details.json
// is missing, fails to fetch, isn't valid JSON, isn't an array,
// or is an empty array.
// ══════════════════════════════════════
window.loadAnimeData = async function loadAnimeData() {
  try {
    const r = await fetch('details.json');
    if (r.ok) {
      const parsed = await r.json();
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    // details.json missing/broken — fall through to demo.json
  }

  try {
    const r2 = await fetch('demo.json');
    if (r2.ok) {
      const parsed2 = await r2.json();
      if (Array.isArray(parsed2)) {
        return parsed2;
      }
    }
  } catch (e) {
    // demo.json also failed
  }

  return [];
};