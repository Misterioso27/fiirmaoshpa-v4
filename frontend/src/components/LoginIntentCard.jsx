import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard,
  TrendingUp,
  Megaphone,
  Briefcase,
  MoreHorizontal,
  ArrowRight,
} from 'lucide-react';

const STORAGE_KEY = 'fiirmaoshpa_pending_intent';

export const DEFAULT_INTENT_OPTIONS = [
  {
    id: 'loan',
    title: 'Préstamos',
    subtitle: 'Solicitar crédito o micropréstamo',
    icon: CreditCard,
    targetRoute: '/loans',
    formType: 'loan_application',
    requestedRole: 'client',
  },
  {
    id: 'investment',
    title: 'Inversiones',
    subtitle: 'Planes y rendimientos de inversión',
    icon: TrendingUp,
    targetRoute: '/investments',
    formType: 'investment_request',
    requestedRole: 'client',
  },
  {
    id: 'advertising',
    title: 'Publicidad',
    subtitle: 'Publicar banner o anuncio comercial',
    icon: Megaphone,
    targetRoute: '/advertising',
    formType: 'ad_banner_request',
    requestedRole: 'client',
  },
  {
    id: 'employee',
    title: 'Empleado',
    subtitle: 'Solicitud de puesto o cargo',
    icon: Briefcase,
    targetRoute: '/dashboard',
    formType: 'employee_application',
    requestedRole: 'pending_staff',
  },
  {
    id: 'other',
    title: 'Otros',
    subtitle: 'Otras solicitudes o servicios',
    icon: MoreHorizontal,
    targetRoute: '/dashboard',
    formType: 'other_request',
    requestedRole: 'client',
  },
];

export function usePendingIntent() {
  const [pendingIntent, setPendingIntent] = useState(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        setPendingIntent(JSON.parse(raw));
      }
    } catch (err) {
      console.error('Error leyendo intención pendiente:', err);
    }
  }, []);

  const clearPendingIntent = () => {
    try {
      sessionStorage.removeItem(STORAGE_KEY);
    } catch (err) {
      console.error('Error limpiando intención pendiente:', err);
    }
    setPendingIntent(null);
  };

  return { pendingIntent, clearPendingIntent };
}

export default function LoginIntentCard({
  onSelectIntent,
  requireLoginFirst = true,
  extraOptions = [],
  headerTitle = '¡Cuenta creada!',
  headerSubtitle = '¿Qué deseas solicitar o hacer?',
}) {
  const navigate = useNavigate();

  const options = [...DEFAULT_INTENT_OPTIONS, ...extraOptions];

  const handleChoose = (option) => {
    const payload = {
      intent: option.id,
      title: option.title,
      formType: option.formType || 'other_request',
      requestedRole: option.requestedRole || 'client',
      targetRoute: option.targetRoute || '/dashboard',
      selectedAt: new Date().toISOString(),
    };

    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (err) {
      console.error('No se pudo guardar la intención en sesión:', err);
    }

    if (typeof onSelectIntent === 'function') {
      onSelectIntent(payload);
    }

    if (!requireLoginFirst) {
      navigate(`${payload.targetRoute}?intent=${encodeURIComponent(payload.intent)}`);
    }
  };

  return (
    <div
      className="w-full max-w-md rounded-2xl p-6 shadow-2xl border"
      style={{
        background: 'rgba(24, 24, 27, 0.92)',
        borderColor: 'rgba(255, 255, 255, 0.12)',
      }}
    >
      <div className="text-center mb-5">
        <h2 className="text-lg font-bold text-white">{headerTitle}</h2>
        <p className="text-sm text-zinc-400 mt-1">{headerSubtitle}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {options.map((opt, idx) => {
          const Icon = opt.icon || MoreHorizontal;
          const isLastOdd = options.length % 2 === 1 && idx === options.length - 1;
          return (
            <button
              key={opt.id || `${opt.title}-${idx}`}
              type="button"
              onClick={() => handleChoose(opt)}
              className={`group flex flex-col justify-between text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                isLastOdd ? 'sm:col-span-2' : ''
              }`}
              style={{
                background: 'rgba(39, 39, 42, 0.7)',
                borderColor: 'rgba(255, 255, 255, 0.1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--gold-primary, #eab308)';
                e.currentTarget.style.background = 'rgba(234, 179, 8, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)';
                e.currentTarget.style.background = 'rgba(39, 39, 42, 0.7)';
              }}
            >
              <div className="flex items-center justify-between mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{
                    background: 'rgba(234, 179, 8, 0.14)',
                    color: 'var(--gold-primary, #eab308)',
                  }}
                >
                  <Icon size={16} />
                </div>
                <ArrowRight
                  size={14}
                  className="text-zinc-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all"
                />
              </div>

              <div>
                <p className="text-sm font-semibold text-white leading-snug">{opt.title}</p>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-tight">{opt.subtitle}</p>
              </div>
            </button>
          );
        })}
      </div>

      <p className="text-[11px] text-zinc-400 text-center mt-5 leading-relaxed">
        Inicia sesión con tu correo y contraseña para continuar; tu solicitud quedará registrada para complementar o ser confirmada por administración.
      </p>
    </div>
  );
}
