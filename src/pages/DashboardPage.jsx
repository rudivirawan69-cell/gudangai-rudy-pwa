import { useMemo, useState, useEffect, useCallback, useRef } from 'react';
import { useStock } from '../hooks/useStock';
import { useAuth } from '../hooks/useAuth';
import {
  getPendingQueue, getStatusPO, getDashboardData, confirmPOStatus, getLocalHistory, getApiUrl, getApiSecret,
} from '../data/api';
import { DIVISIONS } from '../data/master';
import {
  AlertTriangle, RefreshCw, FileText, Package, Users, Boxes, ShieldAlert, CheckCircle2, AlertCircle, X,
  CalendarDays, CalendarClock, ClipboardCheck, FilePlus2, Mail, Clock3, Layers3, ArrowUpRight, ChevronDown,
} from 'lucide-react';
import OperatorTasks from '../components/OperatorTasks';

// NOTE: Full dashboard body restored in follow-up if truncated — keep OperatorTasks + shell working.
export { default } from './DashboardPageFull';
