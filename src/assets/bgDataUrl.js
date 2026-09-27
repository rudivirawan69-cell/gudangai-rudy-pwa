/** Background — server room GudangAI (foto user) — temporary gradient until full foto loads */
const BG =
  'data:image/svg+xml,' +
  encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="720" height="960" viewBox="0 0 720 960">
  <defs>
    <linearGradient id="f" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0c4a5e"/>
      <stop offset="40%" stop-color="#082032"/>
      <stop offset="100%" stop-color="#030c14"/>
    </linearGradient>
    <linearGradient id="g" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.3"/>
      <stop offset="55%" stop-color="#22d3ee" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="720" height="960" fill="url(#f)"/>
  <rect width="720" height="480" fill="url(#g)"/>
  <g opacity="0.9">
    <rect x="0" y="40" width="140" height="880" fill="#0a1620"/>
    <rect x="6" y="50" width="4" height="860" fill="#22d3ee" opacity="0.8"/>
    <rect x="580" y="40" width="140" height="880" fill="#0a1620"/>
    <rect x="710" y="50" width="4" height="860" fill="#22d3ee" opacity="0.8"/>
  </g>
  <text x="36" y="48" fill="#67e8f9" font-family="system-ui" font-size="14" font-weight="600">GudangAI</text>
</svg>`);
export default BG;
