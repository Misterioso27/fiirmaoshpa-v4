import { useState, useEffect, useCallback } from 'react'
import { ShieldAlert, Search, RefreshCw, Eye, Download } from 'lucide-react'
import { supabase, fmtDate } from '@/lib/supabase'
import { Modal, Field, Spinner, Empty, Pagination } from '@/components/ui'
import useAuthStore from '@/store/auth'

const ACTION_COLORS = {
  CREATE:                    'bg-blue-100 text-blue-800',
  UPDATE:                    'bg-amber-100 text-amber-800',
  DELETE:                    'bg-red-100 text-red-800',
  LOGIN:                     'bg-emerald-100 text-emerald-800',
  LOGOUT:                    'bg-hpa-slate-2 text-hpa-slate-6',
  APPROVE_APPLICATION:       'bg-emerald-100 text-emerald-800',
  REJECT_APPLICATION:        'bg-red-100 text-red-800',
  DISBURSE_LOAN:             'bg-blue-100 text-blue-800',
  LOAN_PAYMENT:              'bg-emerald-100 text-emerald-800',
  CREATE_INVESTMENT:         'bg-blue-100 text-blue-800',
  OPEN_CASH_SESSION:         'bg-emerald-100 text-emerald-800',
  CLOSE_CASH_SESSION:        'bg-hpa-slate-2 text-hpa-slate-6',
  CASH_INCOME:               'bg-emerald-100 text-emerald-800',
  CASH_EXPENSE:              'bg-red-100 text-red-800',
  KYC_APPROVED:              'bg-emerald-100 text-emerald-800',
  PASSWORD_RESET_REQUESTED:
