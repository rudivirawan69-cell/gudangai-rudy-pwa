// Background — server corridor aesthetic (CSS gradient data-uri fallback)
// Prefer solid dark + cyan neon feel matching GudangAI brand
const BG =
  'data:image/svg+xml,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280" viewBox="0 0 720 1280">` +
      `<defs>` +
      `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#0a2433"/>` +
      `<stop offset="50%" stop-color="#061820"/>` +
      `<stop offset="100%" stop-color="#030a10"/>` +
      `</linearGradient>` +
      `<linearGradient id="neon" x1="0" y1="0" x2="0" y2="1">` +
      `<stop offset="0%" stop-color="#22d3ee" stop-opacity="0.35"/>` +
      `<stop offset="100%" stop-color="#22d3ee" stop-opacity="0"/>` +
      `</linearGradient>` +
      `</defs>` +
      `<rect width="720" height="1280" fill="url(#g)"/>` +
      `<rect x="40" y="0" width="4" height="1280" fill="#22d3ee" opacity="0.45"/>` +
      `<rect x="676" y="0" width="4" height="1280" fill="#22d3ee" opacity="0.45"/>` +
      `<rect x="80" y="0" width="2" height="1280" fill="#67e8f9" opacity="0.2"/>` +
      `<rect x="638" y="0" width="2" height="1280" fill="#67e8f9" opacity="0.2"/>` +
      `<rect width="720" height="400" fill="url(#neon)"/>` +
      `</svg>`
  );
export default BG;
