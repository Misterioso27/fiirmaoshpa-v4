import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';

export default function AppShell({
  children,
  currentPath = '',
  onNavigate,
  title = 'FIIRMAOSHPA · v4 Enterprise',
}) {
  // --- Estado de la Campana de Notificaciones ---
  const [bellOpen, setBellOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const bellRef = useRef(null);

  // --- Estado del Banner Superior ---
  const [banner, setBanner] = useState(null);
  const [imgError, setImgError] = useState(false);

  const navigateTo = (route) => {
    setBellOpen(false);
    if (typeof onNavigate === 'function') {
      onNavigate(route);
    } else {
      window.location.assign(route);
    }
  };

  const fetchNotifications = async () => {
    setLoadingNotifs(true);
    const list = [];

    try {
      const [
        { data: prospectClients },
        { data: pendingAds },
        { data: pendingLoans },
        { data: pendingApprovals },
        { data: overdueLoans },
      ] = await Promise.all([
        supabase
          .from('clients')
          .select('id, client_code, first_name, last_name, status')
          .in('status', ['prospect', 'Prospecto'])
          .order('created_at', { ascending: false })
          .limit(8),
        supabase
          .from('ad_banners')
          .select('id, advertiser_name, company_name, status')
          .in('status', ['pending', 'Pendiente'])
          .limit(5),
        supabase
          .from('loan_applications')
          .select('id, status')
          .in('status', ['pending', 'submitted', 'Pendiente'])
          .limit(5),
        supabase
          .from('approval_requests')
          .select('id, status')
          .in('status', ['pending', 'Pendiente'])
          .limit(5),
        supabase
          .from('loans')
          .select('id, status')
          .in('status', ['overdue', 'defaulted', 'mora', 'En mora'])
          .limit(5),
      ]);

      (prospectClients || []).forEach((c) => {
        const fullName =
          `${c.first_name || ''} ${c.last_name || ''}`.trim() || c.client_code || 'Cliente';
        list.push({
          id: `prospect-${c.id}`,
          badge: 'Prospecto',
          text: `${fullName}${c.client_code ? ` (${c.client_code})` : ''}`,
          route: '/clients',
        });
      });

      (pendingAds || []).forEach((a) =>
        list.push({
          id: `ad-${a.id}`,
          badge: 'Publicidad',
          text: `Publicidad pendiente: ${a.company_name || a.advertiser_name}`,
          route: '/advertising',
        })
      );

      (pendingLoans || []).forEach((l) =>
        list.push({
          id: `loan-${l.id}`,
          badge: 'Préstamo',
          text: 'Solicitud de préstamo pendiente de revisión',
          route: '/loans',
        })
      );

      (pendingApprovals || []).forEach((ap) =>
        list.push({
          id: `ap-${ap.id}`,
          badge: 'Aprobación',
          text: 'Solicitud pendiente de aprobación',
          route: '/investments',
        })
      );

      (overdueLoans || []).forEach((ov) =>
        list.push({
          id: `ov-${ov.id}`,
          badge: 'Cobranza',
          text: 'Préstamo en mora requiere seguimiento',
          route: '/collections',
        })
      );
    } catch (err) {
      console.error('Error cargando notificaciones:', err);
    }

    setNotifications(list);
    setLoadingNotifs(false);
  };

  const loadActiveBanner = async () => {
    try {
      const { data } = await supabase
        .from('ad_banners')
        .select('*')
        .eq('status', 'active')
        .order('updated_at', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setBanner(data[0]);
        setImgError(false);
      } else {
        setBanner(null);
      }
    } catch (err) {
      console.error('Error cargando banner superior:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
    loadActiveBanner();

    const handleOutsideClick = (e) => {
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false);
      }
    };

    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [currentPath]);

  const hasValidImage =
    banner &&
    typeof banner.image_url === 'string' &&
    banner.image_url.trim().startsWith('http') &&
    !banner.image_url.includes('share.google') &&
    !imgError;

  const renderBannerContent = () => {
    if (!banner) return null;

    if (hasValidImage) {
      return (
        <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-900 shadow-sm">
          <span className="absolute top-2 right-2 z-10 rounded bg-black/65 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
            Publicidad
          </span>
          <img
            src={banner.image_url}
            alt={banner.alt_text || banner.company_name || banner.advertiser_name}
            className="w-full max-h-24 object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      );
    }

    return (
      <div className="relative w-full rounded-xl bg-gradient-to-r from-[#0f294a] via-[#173b6c] to-[#0f294a] px-6 py-4 text-white shadow-md border border-blue-400/20 flex flex-wrap items-center justify-between gap-4">
        <span className="absolute top-2 right-3 rounded bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-slate-200">
          Publicidad
        </span>

        <div className="flex items-center gap-3.5">
          <div className="h-10 w-10 rounded-lg bg-amber-400/20 border border-amber-300/40 flex items-center justify-center text-amber-300 font-bold text-base shrink-0">
            ★
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-amber-300 font-semibold">
              Aliado Comercial Destacado
            </p>
            <h3 className="text-base sm:text-lg font-bold tracking-tight text-white">
              {banner.company_name || banner.advertiser_name}
            </h3>
            <p className="text-xs text-blue-100/80">
              {banner.alt_text || 'Anuncio activo · Consulta servicios y promociones vigentes'}
            </p>
          </div>
        </div>

        {banner.link_url ? (
          <span className="px-4 py-1.5 rounded-lg bg-amber-400 text-slate-950 text-xs font-bold shadow">
            Ver Oferta →
          </span>
        ) : (
          <button
            type="button"
            onClick={() => navigateTo('/advertising')}
            className="px-3.5 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition cursor-pointer"
          >
            Gestionar Anuncio
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* Barra Superior con Campana de Notificaciones */}
      <header className="sticky top-0 z-40 h-14 bg-[#0b1320] text-white border-b border-white/10 px-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm font-bold tracking-wide text-amber-400">
            {title}
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Campana de Notificaciones Interactiva */}
          <div className="relative" ref={bellRef}>
            <button
              type="button"
              onClick={() => {
                const nextState = !bellOpen;
                setBellOpen(nextState);
                if (nextState) fetchNotifications();
              }}
              className="relative p-2 rounded-lg text-slate-200 hover:bg-white/10 transition cursor-pointer"
              aria-label="Notificaciones"
              title="Ver solicitudes y alertas"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
                />
              </svg>
              {notifications.length > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>

            {bellOpen && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl bg-white text-slate-900 shadow-2xl border border-slate-200 z-[999] p-3">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100">
                  <span className="font-bold text-xs uppercase tracking-wide text-slate-700">
                    Centro de Alertas ({notifications.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setBellOpen(false)}
                    className="text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {loadingNotifs ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Consultando solicitudes...
                  </p>
                ) : notifications.length === 0 ? (
                  <p className="text-xs text-slate-500 py-4 text-center">
                    No hay solicitudes pendientes en este momento
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                    {notifications.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => navigateTo(item.route)}
                          className="w-full text-left p-2 rounded-lg hover:bg-slate-100 transition flex items-center justify-between gap-2 cursor-pointer"
                        >
                          <span className="text-xs font-medium text-slate-800 truncate">
                            {item.text}
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                            {item.badge}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Cuerpo Principal con Banner Comercial Superior */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">
        {banner &&
          (banner.link_url ? (
            <a
              href={banner.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="block mb-5 hover:opacity-95 transition"
            >
              {renderBannerContent()}
            </a>
          ) : (
            <div className="mb-5">{renderBannerContent()}</div>
          ))}

        {children}
      </main>
    </div>
  );
}
