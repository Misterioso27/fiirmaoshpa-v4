import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CreditCard, TrendingUp, Megaphone, MessageSquarePlus, ArrowRight } from 'lucide-react';

const STORAGE_KEY = 'fiirmaoshpa_pending_intent';

const INTENT_OPTIONS = [
  {
    id: 'loan',
    title: 'Solicitar préstamo',
    subtitle: 'Crédito personal o comercial',
    icon: CreditCard,
    targetRoute: '/loans',
    formType: 'loan_application',
  },
  {
    id: 'investment',
    title: 'Invertir',
    subtitle: 'Planes y rendimientos',
    icon: TrendingUp,
    targetRoute: '/investments',
    formType: 'investment_request',
  },
  {
    id: 'advertising',
    title: 'Publicidad / Banner',
    subtitle: 'Promociona tu marca o negocio',
    icon: Megaphone,
    targetRoute: '/advertising',
    formType: 'ad_banner_request',
  },
  {
    id: 'other',
    title: 'Otra solicitud',
    subtitle: 'Complementar al entrar',
    icon: MessageSquarePlus,
    targetRoute: '/dashboard',
    formType: 'general_request',
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

export default function LoginIntentCard({ onSelectIntent, requireLoginFirst = true }) {
  const navigate = useNavigate();

  const handleChoose = (option) => {
    const payload = {
      intent: option.id,
      formType: option.formType,
      targetRoute: option.targetRoute,
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
      navigate(`${option.targetRoute}?intent=${option.id}`);
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
        <h2 className="text-lg font-bold text-white">¡Cuenta creada!</h2>
        <p className="text-sm text-zinc-400 mt-1">¿Qué deseas hacer?</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {INTENT_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => handleChoose(opt)}
              className="group flex flex-col justify-between text-left p-3.5 rounded-xl border transition-all cursor-pointer"
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
        Inicia sesión con tu correo y contraseña para continuar; al entrar podrás complementar o ajustar tu solicitud exacta.
      </p>
    </div>
  );
}
