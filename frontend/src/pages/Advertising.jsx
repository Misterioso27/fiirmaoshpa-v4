import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import useAuthStore from '../store/auth';

const VALID_BANNER_STATUSES = [
  { value: 'pending', label: 'Pendiente' },
  { value: 'approved', label: 'Aprobado' },
  { value: 'active', label: 'Activo' },
  { value: 'paused', label: 'Pausado / Cancelado' },
  { value: 'expired', label: 'Vencido' },
  { value: 'rejected', label: 'Rechazado' },
];

export default function Advertising() {
  const { user, hasPermission } = useAuthStore();
  const roleCode = user?.role?.code || user?.role_code || '';
  const isClient = roleCode === 'client';
  const isAdminOrStaff = !isClient;

  const canDelete =
    isAdminOrStaff &&
    (typeof hasPermission === 'function'
      ? hasPermission('advertising', 'delete') || ['super_admin', 'admin'].includes(roleCode)
      : true);

  const [banners, setBanners] = useState([]);
  const [spaces, setSpaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('banners'); // 'banners' | 'spaces'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState(null);
  const [brokenImages, setBrokenImages] = useState({});

  const emptyForm = {
    space_id: '',
    advertiser_name: user?.full_name || '',
    company_name: '',
    advertiser_email: user?.email || '',
    advertiser_phone: '',
    image_url: '',
    link_url: '',
    alt_text: '',
    period_type: 'monthly',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: isClient ? 'pending' : 'pending',
    payment_method: 'transfer',
    payment_status: 'pending',
    amount_paid: '12000',
    notes: '',
  };

  const [formData, setFormData] = useState(emptyForm);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const spacesPromise = supabase
        .from('ad_spaces')
        .select('*')
        .order('created_at', { ascending: true });

      let bannersQuery = supabase
        .from('ad_banners')
        .select('*')
        .order('created_at', { ascending: false });

      if (isClient && user?.email) {
        bannersQuery = bannersQuery.eq('advertiser_email', user.email);
      }

      const [{ data: spacesData }, { data: bannersData }] = await Promise.all([
        spacesPromise,
        bannersQuery,
      ]);

      setSpaces(spacesData || []);
      setBanners(bannersData || []);
      setBrokenImages({});
    } catch (err) {
      console.error('Error cargando publicidad:', err);
    }
    setLoading(false);
  }, [isClient, user?.email]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const isDirectImageUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    const clean = url.trim();
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) return false;
    if (clean.includes('share.google')) return false;
    return true;
  };

  const markImageBroken = (key) => {
    setBrokenImages((prev) => ({ ...prev, [key]: true }));
  };

  const getSpaceName = (spaceId) => {
    const found = spaces.find((s) => s.id === spaceId);
    return found
      ? found.name || found.title || found.code || 'Espacio asignado'
      : 'Banner Principal';
  };

  const getStatusLabel = (status) => {
    const found = VALID_BANNER_STATUSES.find((s) => s.value === status);
    return found ? found.label.toUpperCase() : String(status || '').toUpperCase();
  };

  const openNew = (preselectedSpaceId = '') => {
    const chosenSpace = spaces.find((s) => s.id === preselectedSpaceId) || spaces[0];
    setEditingBanner(null);
    setFormData({
      ...emptyForm,
      space_id: preselectedSpaceId || chosenSpace?.id || '',
      advertiser_name: user?.full_name || '',
      advertiser_email: user?.email || '',
      amount_paid: chosenSpace?.price ?? chosenSpace?.monthly_price ?? '12000',
      status: 'pending',
      payment_status: 'pending',
    });
    setIsModalOpen(true);
  };

  const openEdit = (banner) => {
    if (isClient && banner.status === 'active') {
      alert('Este anuncio ya se encuentra activo. Si deseas modificarlo o renovarlo, contacta a soporte o solicita un nuevo espacio.');
      return;
    }
    setEditingBanner(banner);
    setFormData({
      space_id: banner.space_id || '',
      advertiser_name: banner.advertiser_name || user?.full_name || '',
      company_name: banner.company_name || '',
      advertiser_email: banner.advertiser_email || user?.email || '',
      advertiser_phone: banner.advertiser_phone || '',
      image_url: banner.image_url || '',
      link_url: banner.link_url || '',
      alt_text: banner.alt_text || '',
      period_type: banner.period_type || 'monthly',
      start_date: banner.start_date || new Date().toISOString().split('T')[0],
      end_date:
        banner.end_date ||
        new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: isClient ? 'pending' : banner.status || 'active',
      payment_method: banner.payment_method || 'transfer',
      payment_status: isClient ? 'pending' : banner.payment_status || 'paid',
      amount_paid: banner.amount_paid ?? '0',
      notes: banner.notes || '',
    });
    setIsModalOpen(true);
  };

  const openRenew = (banner) => {
    const days = banner.period_type === 'weekly' ? 7 : 30;
    const baseDate = banner.end_date ? new Date(banner.end_date + 'T00:00:00') : new Date();
    const nextStart = new Date(baseDate.getTime() + 24 * 60 * 60 * 1000);
    const nextEnd = new Date(nextStart.getTime() + days * 24 * 60 * 60 * 1000);

    setEditingBanner(null);
    setFormData({
      space_id: banner.space_id || spaces[0]?.id || '',
      advertiser_name: banner.advertiser_name || user?.full_name || '',
      company_name: banner.company_name || '',
      advertiser_email: banner.advertiser_email || user?.email || '',
      advertiser_phone: banner.advertiser_phone || '',
      image_url: isDirectImageUrl(banner.image_url) ? banner.image_url : '',
      link_url: banner.link_url || '',
      alt_text: banner.alt_text || '',
      period_type: banner.period_type || 'monthly',
      start_date: nextStart.toISOString().split('T')[0],
      end_date: nextEnd.toISOString().split('T')[0],
      status: isClient ? 'pending' : 'active',
      payment_method: banner.payment_method || 'transfer',
      payment_status: isClient ? 'pending' : 'paid',
      amount_paid: banner.amount_paid ?? '0',
      notes: `Renovación / Continuidad de campaña (${banner.company_name || banner.advertiser_name})`,
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const cleanedImageUrl = isDirectImageUrl(formData.image_url)
      ? formData.image_url.trim()
      : null;

    const payload = {
      space_id: formData.space_id || null,
      advertiser_name: formData.advertiser_name,
      company_name: formData.company_name || null,
      advertiser_email: isClient ? user?.email || formData.advertiser_email : formData.advertiser_email || null,
      advertiser_phone: formData.advertiser_phone || null,
      image_url: cleanedImageUrl,
      link_url: formData.link_url?.trim() || null,
      alt_text:
        formData.alt_text?.trim() || formData.company_name || formData.advertiser_name,
      period_type: formData.period_type,
      start_date: formData.start_date,
      end_date: formData.end_date,
      status: isClient ? 'pending' : formData.status,
      payment_method: formData.payment_method,
      payment_status: isClient ? 'pending' : formData.payment_status,
      amount_paid: parseFloat(formData.amount_paid) || 0,
      notes: formData.notes || null,
      updated_at: new Date().toISOString(),
    };

    if (editingBanner && isAdminOrStaff) {
      const { error } = await supabase
        .from('ad_banners')
        .update(payload)
        .eq('id', editingBanner.id);
      if (error) return alert('Error al actualizar anuncio: ' + error.message);
    } else if (editingBanner && isClient) {
      const { error } = await supabase
        .from('ad_banners')
        .update(payload)
        .eq('id', editingBanner.id)
        .eq('advertiser_email', user?.email || '');
      if (error) return alert('Error al actualizar solicitud: ' + error.message);
    } else {
      const { error } = await supabase.from('ad_banners').insert([payload]);
      if (error) return alert('Error al enviar solicitud: ' + error.message);
    }

    setIsModalOpen(false);
    setEditingBanner(null);
    loadData();
  };

  const handleStatusChange = async (banner, newStatus) => {
    if (!isAdminOrStaff) return;
    const label = newStatus === 'paused' ? 'pausar/cancelar' : 'activar';
    if (!window.confirm(`¿Deseas ${label} la publicación de "${banner.advertiser_name}"?`))
      return;

    const { error } = await supabase
      .from('ad_banners')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', banner.id);

    if (error) return alert('Error al cambiar estado: ' + error.message);
    loadData();
  };

  const handleDelete = async (banner) => {
    if (!banner?.id || !canDelete) return;
    const ok = window.confirm(
      `¿Eliminar definitivamente la publicación de "${banner.advertiser_name}" (${banner.start_date} al ${banner.end_date})? Esta acción borrará el registro sin dejar rastro.`
    );
    if (!ok) return;

    const { error } = await supabase.from('ad_banners').delete().eq('id', banner.id);
    if (error) return alert('Error al eliminar anuncio: ' + error.message);

    if (editingBanner?.id === banner.id) {
      setIsModalOpen(false);
      setEditingBanner(null);
    }
    loadData();
  };

  const activeBanner = banners.find((b) => b.status === 'active');
  const showActiveImg =
    activeBanner && isDirectImageUrl(activeBanner.image_url) && !brokenImages['top'];
  const showPreviewImg =
    isDirectImageUrl(formData.image_url) && !brokenImages['preview'];

  return (
    <div className="p-6 space-y-6">
      {isAdminOrStaff && activeBanner && (
        <div className="rounded-xl border border-amber-400/50 bg-gradient-to-r from-slate-900 to-slate-800 text-white p-4 flex flex-wrap items-center justify-between gap-4 shadow">
          <div className="flex items-center gap-4">
            {showActiveImg ? (
              <img
                src={activeBanner.image_url}
                alt={activeBanner.alt_text || activeBanner.advertiser_name}
                className="h-14 w-auto max-w-[220px] object-contain rounded bg-white/10 p-1"
                onError={() => markImageBroken('top')}
              />
            ) : (
              <div className="h-12 px-3 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center text-amber-300 font-bold text-sm">
                {activeBanner.company_name || activeBanner.advertiser_name}
              </div>
            )}
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-500 text-white">
                  Activo en Encabezado
                </span>
                <span className="font-semibold text-sm">{activeBanner.advertiser_name}</span>
                {activeBanner.company_name && (
                  <span className="text-xs text-slate-300">· {activeBanner.company_name}</span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-1">
                {getSpaceName(activeBanner.space_id)} · RD$
                {Number(activeBanner.amount_paid || 0).toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                })}{' '}
                · Vigencia: {activeBanner.start_date} al {activeBanner.end_date}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => openEdit(activeBanner)}
              className="px-3 py-1.5 rounded-lg bg-white text-slate-900 text-xs font-semibold hover:bg-slate-100"
            >
              ✏️ Editar / Cambiar
            </button>
            <button
              type="button"
              onClick={() => openRenew(activeBanner)}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500"
            >
              ↻ Dar Continuidad
            </button>
            <button
              type="button"
              onClick={() => handleStatusChange(activeBanner, 'paused')}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-500"
            >
              ✕ Pausar / Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Publicidad</h1>
          <p className="text-sm text-slate-500">
            {isClient
              ? 'Solicita espacios publicitarios para tu marca o negocio y revisa el estado de tus solicitudes'
              : 'Gestión de espacios publicitarios, continuidad y banners activos'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => openNew()}
          className="px-4 py-2 rounded-lg bg-blue-950 text-white text-sm font-medium hover:bg-blue-900"
        >
          + Nueva Solicitud
        </button>
      </div>

      <div className="flex gap-6 border-b text-sm">
        <button
          type="button"
          onClick={() => setActiveTab('banners')}
          className={`pb-2.5 font-medium border-b-2 transition ${
            activeTab === 'banners'
              ? 'border-blue-900 text-blue-900'
              : 'border-transparent text-slate-500'
          }`}
        >
          {isClient ? `Mis Solicitudes (${banners.length})` : `Solicitudes y Banners (${banners.length})`}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('spaces')}
          className={`pb-2.5 font-medium border-b-2 transition ${
            activeTab === 'spaces'
              ? 'border-blue-900 text-blue-900'
              : 'border-transparent text-slate-500'
          }`}
        >
          Espacios Disponibles ({spaces.length})
        </button>
      </div>

      {activeTab === 'banners' ? (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 border-b text-xs uppercase text-slate-500">
              <tr>
                <th className="p-3.5">Anunciante</th>
                <th className="p-3.5">Espacio</th>
                <th className="p-3.5">Período</th>
                <th className="p-3.5">Monto</th>
                <th className="p-3.5">Pago</th>
                <th className="p-3.5">Estado</th>
                <th className="p-3.5">Fechas</th>
                <th className="p-3.5 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan="8" className="p-6 text-center text-slate-400">
                    Cargando registros...
                  </td>
                </tr>
              ) : banners.length === 0 ? (
                <tr>
                  <td colSpan="8" className="p-6 text-center text-slate-400">
                    {isClient
                      ? 'Aún no tienes solicitudes de publicidad. Haz clic en "+ Nueva Solicitud" o revisa "Espacios Disponibles".'
                      : 'No hay registros de publicidad'}
                  </td>
                </tr>
              ) : (
                banners.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className="p-3.5">
                      <div className="font-semibold text-slate-900">{b.advertiser_name}</div>
                      <div className="text-xs text-slate-500">
                        {b.company_name || b.advertiser_email}
                      </div>
                    </td>
                    <td className="p-3.5 text-slate-700">{getSpaceName(b.space_id)}</td>
                    <td className="p-3.5">
                      <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-xs font-semibold uppercase">
                        {b.period_type === 'monthly'
                          ? 'MENSUAL'
                          : b.period_type === 'weekly'
                          ? 'SEMANAL'
                          : b.period_type}
                      </span>
                    </td>
                    <td className="p-3.5 font-medium">
                      RD$
                      {Number(b.amount_paid || 0).toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
                          b.payment_status === 'paid'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {b.payment_status === 'paid' ? 'PAGADO' : 'PENDIENTE'}
                      </span>
                    </td>
                    <td className="p-3.5">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-semibold uppercase ${
                          b.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : ['paused', 'rejected', 'expired'].includes(b.status)
                            ? 'bg-red-100 text-red-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {getStatusLabel(b.status)}
                      </span>
                    </td>
                    <td className="p-3.5 text-xs text-slate-600">
                      {b.start_date} — {b.end_date}
                    </td>
                    <td className="p-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {isAdminOrStaff ? (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(b)}
                              className="p-1.5 rounded border border-slate-200 hover:bg-slate-100 text-slate-700"
                              title="Editar / Corregir anuncio"
                            >
                              ✏️
                            </button>
                            <button
                              type="button"
                              onClick={() => openRenew(b)}
                              className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium"
                              title="Renovar / Dar continuidad"
                            >
                              Renovar
                            </button>
                            {b.status !== 'active' ? (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(b, 'active')}
                                className="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
                              >
                                Activar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStatusChange(b, 'paused')}
                                className="px-2 py-1 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 text-xs"
                              >
                                Pausar
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDelete(b)}
                                className="px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 text-xs font-medium"
                                title="Eliminar registro definitivamente"
                              >
                                Eliminar
                              </button>
                            )}
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => openRenew(b)}
                            className="px-2.5 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium"
                          >
                            Solicitar Continuidad
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {spaces.map((sp) => (
            <div key={sp.id} className="bg-white rounded-xl border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-slate-900">{sp.name || sp.title}</h3>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">
                  DISPONIBLE
                </span>
              </div>
              <p className="text-xs text-slate-500">{sp.description || sp.dimensions}</p>
              <button
                type="button"
                onClick={() => openNew(sp.id)}
                className="w-full py-2 rounded-lg bg-blue-950 text-white text-xs font-semibold hover:bg-blue-900"
              >
                Solicitar este espacio
              </button>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900">
              {editingBanner && isAdminOrStaff
                ? 'Editar / Corregir Publicación'
                : 'Nueva Solicitud de Publicidad'}
            </h2>
            <form onSubmit={handleSave} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Espacio Publicitario</label>
                <select
                  value={formData.space_id}
                  onChange={(e) => setFormData({ ...formData, space_id: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                >
                  <option value="">Seleccionar espacio...</option>
                  {spaces.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.name || sp.title}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Nombre del Anunciante *</label>
                  <input
                    required
                    value={formData.advertiser_name}
                    onChange={(e) =>
                      setFormData({ ...formData, advertiser_name: e.target.value })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Empresa / Marca</label>
                  <input
                    value={formData.company_name}
                    onChange={(e) => setFormData({ ...formData, company_name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Correo</label>
                  <input
                    type="email"
                    readOnly={isClient}
                    value={formData.advertiser_email}
                    onChange={(e) =>
                      setFormData({ ...formData, advertiser_email: e.target.value })
                    }
                    className="w-full border rounded-lg px-3 py-2 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Teléfono</label>
                  <input
                    value={formData.advertiser_phone}
                    onChange={(e) =>
                      setFormData({ ...formData, advertiser_phone: e.target.value })
                    }
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">
                  URL directa de imagen (.png / .jpg / .webp — evitar links de share.google)
                </label>
                <input
                  value={formData.image_url}
                  onChange={(e) => {
                    setBrokenImages((prev) => ({ ...prev, preview: false }));
                    setFormData({ ...formData, image_url: e.target.value });
                  }}
                  placeholder="https://...imagen.png"
                  className="w-full border rounded-lg px-3 py-2"
                />
                {showPreviewImg && (
                  <img
                    src={formData.image_url}
                    alt="Vista previa"
                    className="mt-2 h-16 object-contain border rounded p-1 bg-slate-50"
                    onError={() => markImageBroken('preview')}
                  />
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">Enlace destino al hacer clic (URL)</label>
                <input
                  value={formData.link_url}
                  onChange={(e) => setFormData({ ...formData, link_url: e.target.value })}
                  placeholder="https://tu-sitio-o-whatsapp.com"
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Período</label>
                  <select
                    value={formData.period_type}
                    onChange={(e) => setFormData({ ...formData, period_type: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="weekly">Semanal</option>
                    <option value="monthly">Mensual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Monto (RD$)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount_paid}
                    onChange={(e) => setFormData({ ...formData, amount_paid: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                {isAdminOrStaff && (
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Pago</label>
                    <select
                      value={formData.payment_status}
                      onChange={(e) =>
                        setFormData({ ...formData, payment_status: e.target.value })
                      }
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      <option value="paid">Pagado</option>
                      <option value="pending">Pendiente</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Inicio</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Vencimiento</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                {isAdminOrStaff && (
                  <div>
                    <label className="block text-xs text-slate-600 mb-1">Estado</label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2"
                    >
                      {VALID_BANNER_STATUSES.map((st) => (
                        <option key={st.value} value={st.value}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs text-slate-600 mb-1">Notas</label>
                <textarea
                  rows="2"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>

              <div className="flex items-center justify-between gap-2 pt-3 border-t">
                <div>
                  {editingBanner && canDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(editingBanner)}
                      className="px-4 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700"
                    >
                      Eliminar Registro
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-lg border text-slate-700"
                  >
                    Cerrar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg bg-blue-950 text-white font-semibold"
                  >
                    {isClient ? 'Enviar Solicitud' : 'Guardar Cambios'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
