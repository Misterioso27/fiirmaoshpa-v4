import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function Advertising() {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  
  const [formData, setFormData] = useState({
    advertiser: '',
    space: 'Banner Principal (Top)',
    period: '1 Mes',
    amount: '5000',
    currency: 'DOP',
    status: 'Pendiente'
  });

  useEffect(() => {
    fetchAds();
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase.from('advertising').insert([formData]);
      if (error) throw error;
      setIsModalOpen(false);
      fetchAds();
      setFormData({
        advertiser: '',
        space: 'Banner Principal (Top)',
        period: '1 Mes',
        amount: '5000',
        currency: 'DOP',
        status: 'Pendiente'
      });
    } catch (err) {
      console.error('Error saving ad:', err);
      alert('Error al guardar la solicitud');
    }
  };

  return (
    <div className="p-6 bg-zinc-950 min-h-screen text-white">
      {/* Encabezado y Botón de Solicitud */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-wide">Publicidad y Anuncios</h1>
          <p className="text-sm text-zinc-400">Gestión de campañas, tarifas por categoría y solicitudes de anunciantes</p>
        </div>
        <button 
          onClick={() => setIsModalOpen(true)}
          className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-black font-semibold rounded-xl shadow-lg transition duration-200 flex items-center gap-2"
        >
          <span>+ Solicitar Publicidad</span>
        </button>
      </div>

      {/* Tarjetas de Tarifas por Categoría */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="p-5 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-md">
          <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-full">Destacado</span>
          <h3 className="font-bold text-lg text-white mt-3">Banner Principal (Top)</h3>
          <p className="text-3xl font-extrabold text-amber-400 mt-2">DOP $5,000 <span className="text-xs font-normal text-zinc-400">/ mes</span></p>
          <p className="text-xs text-zinc-400 mt-2">Máxima visibilidad en la cabecera de la aplicación y portal principal.</p>
        </div>
        <div className="p-5 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-md">
          <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-full">Estándar</span>
          <h3 className="font-bold text-lg text-white mt-3">Sidebar Lateral</h3>
          <p className="text-3xl font-extrabold text-amber-400 mt-2">DOP $3,000 <span className="text-xs font-normal text-zinc-400">/ mes</span></p>
          <p className="text-xs text-zinc-400 mt-2">Ubicado en los paneles laterales de navegación y reportes secundarios.</p>
        </div>
        <div className="p-5 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-md">
          <span className="text-xs font-semibold px-2.5 py-1 bg-amber-500/10 text-amber-400 rounded-full">Premium</span>
          <h3 className="font-bold text-lg text-white mt-3">Notificación Popup</h3>
          <p className="text-3xl font-extrabold text-amber-400 mt-2">DOP $8,000 <span className="text-xs font-normal text-zinc-400">/ mes</span></p>
          <p className="text-xs text-zinc-400 mt-2">Impacto directo al iniciar sesión con alerta emergente personalizada.</p>
        </div>
      </div>

      {/* Tabla de Registros */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-zinc-800 flex justify-between items-center">
          <h2 className="font-bold text-lg text-white">Listado de Campañas y Solicitudes</h2>
          <span className="text-xs text-zinc-400">{ads.length} registros totales</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-xs uppercase tracking-wider text-zinc-400 bg-zinc-950/50">
                <th className="p-4">Anunciante</th>
                <th className="p-4">Espacio</th>
                <th className="p-4">Período</th>
                <th className="p-4">Monto</th>
                <th className="p-4">Estado</th>
                <th className="p-4">Acciones</th>
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
                    <td className="p-4 text-zinc-300">{ad.period}</td>
                    <td className="p-4 font-bold text-amber-400">{ad.currency} ${ad.amount}</td>
                    <td className="p-4">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${
                        ad.status === 'Aprobada' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      }`}>
                        {ad.status}
                      </span>
                    </td>
                    <td className="p-4 text-zinc-400">
                      <button className="text-zinc-400 hover:text-white transition">Gestionar</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal de Solicitud */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-xl font-bold text-white mb-4">Solicitar Nuevo Espacio Publicitario</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Nombre del Anunciante / Empresa</label>
                <input 
                  type="text" 
                  required
                  value={formData.advertiser}
                  onChange={(e) => setFormData({...formData, advertiser: e.target.value})}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  placeholder="Ej. Inversiones HPA"
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
                  <option>Banner Principal (Top) - DOP $5,000</option>
                  <option>Sidebar Lateral - DOP $3,000</option>
                  <option>Notificación Popup - DOP $8,000</option>
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
                    <option>1 Mes</option>
                    <option>3 Meses</option>
                    <option>6 Meses</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">Monto (DOP)</label>
                  <input 
                    type="number" 
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-white focus:outline-none focus:border-amber-500"
                  />
                </div>
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
                  Guardar Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
