import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Advertising() {
  const [activeTab, setActiveTab] = useState('solicitudes');
  const [ads, setAds] = useState([]);
  const [cashRegisters, setCashRegisters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAd, setEditingAd] = useState(null);

  const [formData, setFormData] = useState({
    advertiser: '',
    space: 'Banner Dashboard Principal',
    period: 'Mensual',
    amount: '5000',
    currency: 'DOP',
    status: 'Pendiente de Pago',
    cash_register_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
  });

  useEffect(() => {
    fetchAds();
    fetchCashRegisters();
  }, []);

  const fetchAds = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('advertising').select('*');
      if (error) throw error;
      setAds(data || []);
    } catch (err) {
      console.error('Error fetching ads:', err);
    } finally {
      setLoading(false);
    }
  };

  // Cargar todas las cajas (incluyendo internacional: SDQ, STG, GRU, MIA sin filtros restrictivos de divisa)
  const fetchCashRegisters = async () => {
    try {
      const { data, error } = await supabase.from('cash_registers').select('*');
      if (error) throw error;
      setCashRegisters(data || []);
    } catch (err) {
      console.error('Error fetching cash registers:', err);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingAd) {
        // Actualizar anuncio existente
        const { error } = await supabase
          .from('advertising')
          .update(formData)
          .eq('id', editingAd.id);
        if (error) throw error;
        alert('Anuncio actualizado correctamente.');
      } else {
        // Crear nuevo anuncio
        const { error } = await supabase.from('advertising').insert([formData]);
        if (error) throw error;

        // Si se crea directamente como Activo/Pagado, registrar el movimiento en caja y motivo
        if (formData.status === 'Activo' || formData.status === 'Pagado') {
          await supabase.from('cash_transactions').insert([{
            concept: `Pago de Publicidad - ${formData.advertiser} (${formData.space})`,
            type: 'Ingreso',
            amount: parseFloat(formData.amount),
            currency: formData.currency,
            reference: 'Publicidad Anunciante',
            notes: `Período: ${formData.period}`
          }]);
        }
      }

      setIsModalOpen(false);
      setEditingAd(null);
      fetchAds();
      resetForm();
    } catch (err) {
      console.error('Error saving ad:', err);
      alert('Error al guardar la solicitud publicitaria');
    }
  };

  const resetForm = () => {
    setFormData({
      advertiser: '',
      space: 'Banner Dashboard Principal',
      period: 'Mensual',
      amount: '5000',
      currency: 'DOP',
      status: 'Pendiente de Pago',
      cash_register_id: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
    });
  };

  const handleEdit = (ad) => {
    setEditingAd(ad);
    setFormData({
      advertiser: ad.advertiser || '',
      space: ad.space || 'Banner Dashboard Principal',
      period: ad.period || 'Mensual',
      amount: ad.amount || '5000',
      currency: ad.currency || 'DOP',
      status: ad.status || 'Pendiente de Pago',
      cash_register_id: ad.cash_register_id || '',
      start_date: ad.start_date || new Date().toISOString().split('T')[0],
      end_date: ad.end_date || new Date().toISOString().split('T')[0]
    });
    setIsModalOpen(true);
  };

  const handleRenew = (ad) => {
    setEditingAd(null);
    setFormData({
      advertiser: ad.advertiser + ' (Renovación)',
      space: ad.space,
      period: ad.period,
      amount: ad.amount,
      currency: ad.currency || 'DOP',
      status: 'Pendiente de Pago',
      cash_register_id: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split('T')[0]
    });
    setIsModalOpen(true);
  };

  const handleMarkAsPaid = async (ad) => {
    try {
      const { error: updateError } = await supabase
        .from('advertising')
        .update({ status: 'Activo' })
        .eq('id', ad.id);

      if (updateError) throw updateError;

      // Registrar ingreso con motivo detallado en la caja corporativa
      const { error: cashError } = await supabase.from('cash_transactions').insert([{
        concept: `Pago de Publicidad - ${ad.advertiser} (${ad.space})`,
        type: 'Ingreso',
        amount: parseFloat(ad.amount),
        currency: ad.currency || 'DOP',
        reference: 'Publicidad Anunciante Validada',
        notes: `Período: ${ad.period} - Cliente validado`
      }]);

      if (cashError) throw cashError;

      alert('¡Anuncio validado, marcado como Activo y registrado en Caja con éxito!');
      fetchAds();
    } catch (err) {
      console.error('Error al procesar pago:', err);
      alert('Error al registrar el pago en caja.');
    }
  };

  // Filtrar el banner activo para mostrarlo de inmediato en el encabezado
  const activeBanner = ads.find(ad => ad.status === 'Activo' || ad.status === 'Pagado');

  return (
    <div className="p-6 bg-zinc-950 min-h-screen text-white">
      {/* BANNER ACTIVO EN EL ENCABEZADO */}
      {activeBanner && (
        <div className="mb-6 p-4 bg-gradient-to-r from-amber-600/20 via-amber-500/10 to-zinc-900 border border-amber-500/30 rounded-2xl flex flex-col md:flex-row justify-between items-center gap-4 shadow-lg">
          <div className="flex items-center gap-3">
            <span className="px-2.5 py-1 text-xs font-bold bg-amber-500 text-black rounded-lg uppercase tracking-wider">Banner Activo</span>
            <div>
              <h3 className="font-bold text-white text-base">{activeBanner.advertiser}</h3>
              <p className="text-xs text-zinc-300">{activeBanner.space} — <span className="text-amber-400 font-semibold">{activeBanner.period}</span> ({activeBanner.currency || 'DOP'} ${activeBanner.amount})</p>
            </div>
          </div>
          <div className="text-xs text-zinc-400 bg-zinc-950/60 px-3 py-1.5 rounded-xl border border-zinc-800">
            Vigencia: <span className="text-white font-medium">{activeBanner.start_date} al {activeBanner.end_date || 'Activo'}</span>
          </div>
        </div>
      )}

      {/* Encabezado Principal */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-wide">Publicidad y Anuncios</h1>
          <p className="text-sm text-zinc-400">Gestión de espacios, validación de pagos, renovaciones y tarifas por categoría</p>
        </div>
        <button 
          onClick={() => { setEditingAd(null); resetForm(); setIsModalOpen(true); }}
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl shadow-lg transition duration-200 flex items-center gap-2"
        >
          <span>+ Nueva Solicitud</span>
        </button>
      </div>

      {/* Pestañas de Navegación */}
      <div className="flex border-b border-zinc-800 mb-6">
        <button
          onClick={() => setActiveTab('solicitudes')}
          className={`pb-3 px-4 font-medium text-sm transition border-b-2 ${
            activeTab === 'solicitudes' ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Solicitudes y Banners
        </button>
        <button
          onClick={() => setActiveTab('espacios')}
          className={`pb-3 px-4 font-medium text-sm transition border-b-2 ${
            activeTab === 'espacios' ? 'border-amber-500 text-amber-400' : 'border-transparent text-zinc-400 hover:text-white'
          }`}
        >
          Espacios Disponibles y Tarifas
        </button>
      </div>

      {/* Contenido según Pestaña Activa */}
      {activeTab === 'solicitudes' ? (
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-400 bg-zinc-950/50">
                  <th className="p-4">Anunciante</th>
                  <th className="p-4">Espacio</th>
                  <th className="p-4">Período / Fechas</th>
                  <th className="p-4">Monto</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4 text-center">Acciones y Gestión</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/60 text-sm">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-zinc-500">Cargando registros...</td>
                  </tr>
                ) : ads.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-12 text-center text-zinc-500">Sin registros de publicidad activos</td>
                  </tr>
                ) : (
                  ads.map((ad, idx) => (
                    <tr key={idx} className="hover:bg-zinc-800/40 transition">
                      <td className="p-4 font-medium text-white">{ad.advertiser}</td>
                      <td className="p-4 text-zinc-300">{ad.space}</td>
                      <td className="p-4 text-xs text-zinc-300">
                        <span className="font-semibold text-amber-400">{ad.period}</span>
                        <div className="text-zinc-500">{ad.start_date} al {ad.end_date}</div>
                      </td>
                      <td className="p-4 font-bold text-amber-400">{ad.currency || 'DOP'} ${ad.amount}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                          ad.status === 'Activo' || ad.status === 'Pagado' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                        }`}>
                          {ad.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          {ad.status !== 'Activo' && ad.status !== 'Pagado' && (
                            <button 
                              onClick={() => handleMarkAsPaid(ad)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg text-xs transition shadow"
                              title="Validar y enviar a Caja"
                            >
                              Validar Pago
                            </button>
                          )}
                          {/* Botón Lápiz para Editar */}
                          <button 
                            onClick={() => handleEdit(ad)}
                            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg transition"
                            title="Editar datos"
                          >
                            ✏️
                          </button>
                          {/* Botón Renovar */}
                          <button 
                            onClick={() => handleRenew(ad)}
                            className="p-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg transition text-xs font-medium px-2.5"
                            title="Renovar o agregar publicación"
                          >
                            Renovar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Vista de Tarifas por Categoría y Espacios */
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-md">
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-full">Top Banner</span>
            <h3 className="font-bold text-lg text-white mt-3">Banner Dashboard Principal</h3>
            <p className="text-3xl font-extrabold text-amber-400 mt-2">DOP $5,000 <span className="text-xs font-normal text-zinc-400">/ mes</span></p>
            <p className="text-xs text-zinc-400 mt-2">Máxima exposición visual al iniciar sesión en el panel general corporativo.</p>
          </div>
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-md">
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-full">Lateral</span>
            <h3 className="font-bold text-lg text-white mt-3">Sidebar de Inversiones</h3>
            <p className="text-3xl font-extrabold text-amber-400 mt-2">DOP $3,000 <span className="text-xs font-normal text-zinc-400">/ mes</span></p>
            <p className="text-xs text-zinc-400 mt-2">Ubicado estratégicamente junto a los flujos de capital e inversores.</p>
          </div>
          <div className="p-5 bg-zinc-900 border border-zinc-800 rounded-2xl shadow-md">
            <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-full">Emergente</span>
            <h3 className="font-bold text-lg text-white mt-3">Popup Promocional</h3>
            <p className="text-3xl font-extrabold text-amber-400 mt-2">DOP $8,000 <span className="text-xs font-normal text-zinc-400">/ mes</span></p>
            <p className="text-xs text-zinc-400 mt-2">Impacto directo inmediato para marcas asociadas y filiales.</p>
          </div>
        </div>
      )}

      {/* Modal de Solicitud / Edición / Renovación */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">
              {editingAd ? 'Editar Registro Publicitario' : 'Nueva Solicitud / Renovación'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Nombre del Anunciante</label>
                <input 
                  type="text" 
                  required
                  value={formData.advertiser}
                  onChange={(e) => setFormData({...formData, advertiser: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  placeholder="Ej. AirStay RD"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Espacio Publicitario</label>
                <select 
                  value={formData.space}
                  onChange={(e) => {
                    const val = e.target.value;
                    let amt = '5000';
                    if(val.includes('Sidebar')) amt = '3000';
                    if(val.includes('Popup')) amt = '8000';
                    setFormData({...formData, space: val, amount: amt});
                  }}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
                >
                  <option>Banner Dashboard Principal - DOP $5,000</option>
                  <option>Sidebar de Inversiones - DOP $3,000</option>
                  <option>Popup Promocional - DOP $8,000</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Período</label>
                  <select 
                    value={formData.period}
                    onChange={(e) => setFormData({...formData, period: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option>Mensual</option>
                    <option>Trimestral</option>
                    <option>Anual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Monto</label>
                  <input 
                    type="number" 
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Moneda</label>
                  <select 
                    value={formData.currency}
                    onChange={(e) => setFormData({...formData, currency: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option>DOP</option>
                    <option>USD</option>
                    <option>BRL</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Estado</label>
                  <select 
                    value={formData.status}
                    onChange={(e) => setFormData({...formData, status: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  >
                    <option>Pendiente de Pago</option>
                    <option>Activo</option>
                    <option>Expirado</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Asignar a Caja (Multimoneda / Sucursales)</label>
                <select 
                  value={formData.cash_register_id}
                  onChange={(e) => setFormData({...formData, cash_register_id: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
                >
                  <option value="">Seleccione Caja Operativa (SDQ, STG, GRU, MIA)...</option>
                  {cashRegisters.map((reg) => (
                    <option key={reg.id} value={reg.id}>
                      {reg.name} ({reg.code} - {reg.currency})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm transition"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl text-sm transition"
                >
                  {editingAd ? 'Guardar Cambios' : 'Registrar Anuncio'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
