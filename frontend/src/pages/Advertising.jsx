import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Advertising() {
  const [ads, setAds] = useState([]);
  const [cashRegisters, setCashRegisters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAd, setEditingAd] = useState(null);

  const emptyForm = {
    advertiser: '',
    space: 'Banner Superior - Header',
    period: 'Mensual',
    amount: '12000',
    currency: 'DOP',
    status: 'Pendiente de Pago',
    cash_register_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
  };

  const [formData, setFormData] = useState(emptyForm);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [{ data: adsData }, { data: regsData }] = await Promise.all([
      supabase.from('advertising').select('*').order('created_at', { ascending: false }),
      supabase.from('cash_registers').select('*').order('code', { ascending: true }),
    ]);
    setAds(adsData || []);
    setCashRegisters(regsData || []);
    setLoading(false);
  };

  const openNew = () => {
    setEditingAd(null);
    setFormData(emptyForm);
    setIsModalOpen(true);
  };

  const openEdit = (ad) => {
    setEditingAd(ad);
    setFormData({
      advertiser: ad.advertiser || '',
      space: ad.space || 'Banner Superior - Header',
      period: ad.period || 'Mensual',
      amount: ad.amount ?? '0',
      currency: ad.currency || 'DOP',
      status: ad.status || 'Pendiente de Pago',
      cash_register_id: ad.cash_register_id || '',
      start_date: ad.start_date || new Date().toISOString().split('T')[0],
      end_date: ad.end_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    });
    setIsModalOpen(true);
  };

  // Dar continuidad / renovar manteniendo el mismo anunciante
  const openRenew = (ad) => {
    const baseStart = ad.end_date ? new Date(ad.end_date) : new Date();
    const nextStart = new Date(baseStart.getTime() + 24 * 60 * 60 * 1000);
    const nextEnd = new Date(nextStart.getTime() + 30 * 24 * 60 * 60 * 1000);

    setEditingAd(null);
    setFormData({
      advertiser: ad.advertiser,
      space: ad.space,
      period: ad.period || 'Mensual',
      amount: ad.amount ?? '0',
      currency: ad.currency || 'DOP',
      status: 'Pendiente de Pago',
      cash_register_id: ad.cash_register_id || '',
      start_date: nextStart.toISOString().split('T')[0],
      end_date: nextEnd.toISOString().split('T')[0],
    });
    setIsModalOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    const payload = {
      ...formData,
      amount: parseFloat(formData.amount) || 0,
      cash_register_id: formData.cash_register_id || null,
    };

    if (editingAd) {
      const { error } = await supabase.from('advertising').update(payload).eq('id', editingAd.id);
      if (error) return alert('Error al actualizar: ' + error.message);
    } else {
      const { error } = await supabase.from('advertising').insert([payload]);
      if (error) return alert('Error al crear: ' + error.message);

      if (payload.status === 'Activo' || payload.status === 'Pagado') {
        await supabase.from('cash_transactions').insert([{
          cash_register_id: payload.cash_register_id,
          concept: `Publicidad - ${payload.advertiser} (${payload.space})`,
          type: 'Ingreso',
          amount: payload.amount,
          currency: payload.currency,
          reference: 'Publicidad',
          notes: `Período: ${payload.period} (${payload.start_date} a ${payload.end_date})`,
        }]);
      }
    }

    setIsModalOpen(false);
    setEditingAd(null);
    loadData();
  };

  const handleCancelAd = async (ad) => {
    if (!window.confirm(`¿Cancelar/desactivar el anuncio de "${ad.advertiser}"?`)) return;
    const { error } = await supabase.from('advertising').update({ status: 'Cancelado' }).eq('id', ad.id);
    if (error) return alert('Error al cancelar: ' + error.message);
    loadData();
  };

  const handleActivateInHeader = async (ad) => {
    // Pone este anuncio como el más reciente activo y registra pago si aún no estaba pagado
    const wasPaid = ad.status === 'Activo' || ad.status === 'Pagado';
    const { error } = await supabase
      .from('advertising')
      .update({ status: 'Activo', created_at: new Date().toISOString() })
      .eq('id', ad.id);
    if (error) return alert('Error al activar: ' + error.message);

    if (!wasPaid) {
      await supabase.from('cash_transactions').insert([{
        cash_register_id: ad.cash_register_id || null,
        concept: `Pago de Publicidad - ${ad.advertiser} (${ad.space})`,
        type: 'Ingreso',
        amount: parseFloat(ad.amount) || 0,
        currency: ad.currency || 'DOP',
        reference: 'Publicidad Activada',
        notes: `Período: ${ad.period}`,
      }]);
    }
    loadData();
  };

  const topBannerAd = ads.find((a) => a.status === 'Activo' || a.status === 'Pagado');

  return (
    <div className="p-6 space-y-6">
      {/* Banner superior interactivo */}
      {topBannerAd && (
        <div className="rounded-xl border border-amber-400/40 bg-amber-50/90 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-slate-900">
          <div>
            <span className="text-xs font-bold uppercase px-2 py-0.5 rounded bg-amber-500 text-white mr-2">
              En Encabezado
            </span>
            <strong className="text-sm">{topBannerAd.advertiser}</strong>
            <span className="text-xs text-slate-700 ml-2">
              · {topBannerAd.space} · {topBannerAd.currency} {topBannerAd.amount} ({topBannerAd.start_date} → {topBannerAd.end_date})
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => openEdit(topBannerAd)}
              className="px-2.5 py-1 text-xs rounded bg-white border border-slate-300 hover:bg-slate-100"
              title="Editar anuncio"
            >
              ✏️ Editar
            </button>
            <button
              onClick={() => openRenew(topBannerAd)}
              className="px-2.5 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700"
              title="Dar continuidad / Renovar"
            >
              ↻ Renovar
            </button>
            <button
              onClick={() => handleCancelAd(topBannerAd)}
              className="px-2.5 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700"
              title="Cancelar anuncio"
            >
              ✕ Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Publicidad</h1>
          <p className="text-sm text-slate-500">Editar, dar continuidad, cambiar o cancelar anuncios</p>
        </div>
        <button
          onClick={openNew}
          className="px-4 py-2 rounded-lg bg-blue-900 text-white text-sm font-medium hover:bg-blue-800"
        >
          + Nueva Solicitud
        </button>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 border-b text-xs uppercase text-slate-500">
            <tr>
              <th className="p-3">Anunciante</th>
              <th className="p-3">Espacio</th>
              <th className="p-3">Monto</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Fechas</th>
              <th className="p-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {loading ? (
              <tr><td colSpan="6" className="p-6 text-center text-slate-400">Cargando...</td></tr>
            ) : ads.length === 0 ? (
              <tr><td colSpan="6" className="p-6 text-center text-slate-400">Sin anuncios</td></tr>
            ) : (
              ads.map((ad) => (
                <tr key={ad.id} className="hover:bg-slate-50">
                  <td className="p-3 font-medium">{ad.advertiser}</td>
                  <td className="p-3">{ad.space}</td>
                  <td className="p-3">{ad.currency} {ad.amount}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      ad.status === 'Activo' || ad.status === 'Pagado'
                        ? 'bg-emerald-100 text-emerald-700'
                        : ad.status === 'Cancelado'
                        ? 'bg-red-100 text-red-700'
                        : 'bg-amber-100 text-amber-700'
                    }`}>
                      {ad.status}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-slate-600">{ad.start_date} — {ad.end_date}</td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1.5">
                      <button
                        onClick={() => openEdit(ad)}
                        className="px-2 py-1 rounded border hover:bg-slate-100 text-xs"
                        title="Editar / Corregir"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => openRenew(ad)}
                        className="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 text-xs font-medium"
                        title="Renovar / Continuidad"
                      >
                        Renovar
                      </button>
                      {ad.status !== 'Activo' && (
                        <button
                          onClick={() => handleActivateInHeader(ad)}
                          className="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-xs"
                          title="Poner activo en encabezado"
                        >
                          Activar
                        </button>
                      )}
                      {ad.status !== 'Cancelado' && (
                        <button
                          onClick={() => handleCancelAd(ad)}
                          className="px-2 py-1 rounded bg-red-50 text-red-700 hover:bg-red-100 text-xs"
                          title="Cancelar anuncio"
                        >
                          Cancelar
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

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-bold">
              {editingAd ? 'Editar / Corregir Anuncio' : 'Nueva Solicitud / Continuidad'}
            </h2>
            <form onSubmit={handleSave} className="space-y-3 text-sm">
              <div>
                <label className="block text-xs text-slate-600 mb-1">Anunciante</label>
                <input
                  required
                  value={formData.advertiser}
                  onChange={(e) => setFormData({ ...formData, advertiser: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Moneda</label>
                  <select
                    value={formData.currency}
                    onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="DOP">DOP</option>
                    <option value="USD">USD</option>
                    <option value="BRL">BRL</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Desde</label>
                  <input
                    type="date"
                    value={formData.start_date}
                    onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Hasta</label>
                  <input
                    type="date"
                    value={formData.end_date}
                    onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Estado</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="Pendiente de Pago">Pendiente de Pago</option>
                    <option value="Activo">Activo</option>
                    <option value="Pagado">Pagado</option>
                    <option value="Cancelado">Cancelado</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 mb-1">Caja</label>
                  <select
                    value={formData.cash_register_id}
                    onChange={(e) => setFormData({ ...formData, cash_register_id: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    <option value="">Sin caja</option>
                    {cashRegisters.map((r) => (
                      <option key={r.id} value={r.id}>{r.code} · {r.currency}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 rounded-lg border">
                  Cancelar
                </button>
                <button type="submit" className="px-4 py-2 rounded-lg bg-blue-900 text-white font-medium">
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
