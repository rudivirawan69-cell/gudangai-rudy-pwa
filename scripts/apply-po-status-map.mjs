/**
 * Surgical: map totalPO from backend getStatusPO → qtyPO on Dashboard only.
 * Does NOT touch InputPage or write path.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = path.join(root, 'src/pages/DashboardPage.jsx');
let s = fs.readFileSync(p, 'utf8');

const old1 = `    const qtyPO = Number(it.qtyPO ?? it.qty ?? it.quantity ?? 0) || 0;\n    const qtyDatang = Number(it.qtyDatang ?? it.datang ?? it.received ?? it.qtyReceived ?? 0) || 0;`;

const new1 = `    // Backend getStatusPO memakai totalPO / poCV+poPT (bukan qtyPO).\n    const qtyPO = Number(\n      it.qtyPO ?? it.totalPO ?? it.total ?? it.qty ?? it.quantity ??\n      ((Number(it.poCV) || 0) + (Number(it.poPT) || 0))\n    ) || 0;\n    const qtyDatang = Number(\n      it.qtyDatang ?? it.datang ?? it.received ?? it.qtyReceived ?? it.totalKonfirmasiQty ?? 0\n    ) || 0;`;

if (!s.includes(old1)) {
  if (s.includes('totalPO')) {
    console.log('already patched');
    process.exit(0);
  }
  throw new Error('pattern qtyPO not found');
}
s = s.replace(old1, new1);

const old2 = `      qtyPO: Number(it.qtyPO ?? it.qty ?? 0) || 0,\n      qtyDatang: Number(it.qtyDatang ?? it.datang ?? 0) || 0,\n      status,\n      id: it.id || it.itemId || it.clientItemId || \`po-\${idx}\`,\n    };\n  });`;

const new2 = `      qtyPO,\n      qtyDatang,\n      status,\n      id: it.id || it.itemId || it.clientItemId || \`po-\${idx}\`,\n    };\n  }).filter((it) => it.nama && it.nama !== '\u2014' && it.qtyPO > 0);`;

if (s.includes(old2)) s = s.replace(old2, new2);

fs.writeFileSync(p, s);
if (!s.includes('totalPO')) throw new Error('totalPO not applied');
console.log('DashboardPage Status PO field map OK', s.length);
