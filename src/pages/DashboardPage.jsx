import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import { getPendingQueue, getStatusPO } from '../data/api';
import { DIVISIONS } from '../data/master';
import { AVATAR_DATA_URL } from '../assets/imageAssets';
import { AlertTriangle, RefreshCw, FileText, Package, CheckCircle2, AlertCircle, ShieldAlert } from 'lucide-react';

const EMAIL = 'rudivirawan69@gmail.com';

export default function DashboardPage() {
  return (
    <div className="p-4 text-sm text-slate-600">
      Dashboard sedang diperbarui — silakan refresh sebentar lagi.
    </div>
  );
}
