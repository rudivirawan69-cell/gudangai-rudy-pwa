// GudangAI — HD-feel server corridor background (SVG, crisp on all screens)
const BG =
  'data:image/svg+xml,' +
  encodeURIComponent(`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920" viewBox="0 0 1080 1920">
  <defs>
    <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0c4a5e"/>
      <stop offset="40%" stop-color="#082032"/>
      <stop offset="100%" stop-color="#030c14"/>
    </linearGradient>
    <linearGradient id="glow" x1="0.5" y1="0" x2="0.5" y2="1">
      <stop offset="0%" stop-color="#22d3ee" stop-opacity="0.25"/>
      <stop offset="55%" stop-color="#22d3ee" stop-opacity="0.06"/>
      <stop offset="100%" stop-color="#000" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="rack" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#0e7490" stop-opacity="0.9"/>
      <stop offset="50%" stop-color="#155e75" stop-opacity="0.5"/>
      <stop offset="100%" stop-color="#0e7490" stop-opacity="0.9"/>
    </linearGradient>
  </defs>
  <rect width="1080" height="1920" fill="url(#floor)"/>
  <rect width="1080" height="900" fill="url(#glow)"/>
  <!-- left racks -->
  <g opacity="0.85">
    <rect x="0" y="80" width="220" height="1760" fill="#0a1620"/>
    <rect x="8" y="100" width="6" height="1720" fill="#22d3ee" opacity="0.7"/>
    <rect x="200" y="100" width="4" height="1720" fill="#67e8f9" opacity="0.45"/>
    <g fill="#22d3ee" opacity="0.35">
      ${Array.from({length: 28}, (_, i) => `<rect x="30" y="${120 + i * 60}" width="150" height="8" rx="2"/>`).join('')}
    </g>
  </g>
  <!-- right racks -->
  <g opacity="0.85">
    <rect x="860" y="80" width="220" height="1760" fill="#0a1620"/>
    <rect x="1066" y="100" width="6" height="1720" fill="#22d3ee" opacity="0.7"/>
    <rect x="876" y="100" width="4" height="1720" fill="#67e8f9" opacity="0.45"/>
    <g fill="#22d3ee" opacity="0.35">
      ${Array.from({length: 28}, (_, i) => `<rect x="900" y="${120 + i * 60}" width="150" height="8" rx="2"/>`).join('')}
    </g>
  </g>
  <!-- center aisle glow -->
  <rect x="400" y="0" width="280" height="1920" fill="#22d3ee" opacity="0.04"/>
  <rect x="520" y="0" width="40" height="1920" fill="#a5f3fc" opacity="0.06"/>
  <!-- ceiling lights -->
  <g fill="#67e8f9" opacity="0.55">
    ${Array.from({length: 12}, (_, i) => `<rect x="480" y="${80 + i * 150}" width="120" height="6" rx="3"/>`).join('')}
  </g>
  <!-- floor reflection -->
  <rect x="300" y="1600" width="480" height="320" fill="#22d3ee" opacity="0.05"/>
</svg>`);
export default BG;
