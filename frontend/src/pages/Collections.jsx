import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient'; // Ajusta la ruta según tu proyecto
import { Search, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

export default function Collections() {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [searched, setSearched] = useState(false);
  const [cashOpen, setCashOpen] = useState(false);

  // 1. Verificar si la caja está abierta al cargar la página
  useEffect(() => {
    checkCashSession();
  }, []);

  async function checkCashSession() {
    try {
      const { data, error } = await supabase
        .from('cash_sessions')
        .select('*')
        .eq('status', 'open')
        .maybeSingle();

      if (error) throw error;
      setCashOpen(!!data);
    } catch (err) {
      console.error('Error al validar sesión de caja:', err);
    }
  }

  // 2. Buscador blindado (Busca por código HPA o por nombre en la tabla correcta)
  const handleSearch = async (e) => {
    if (e) e.preventDefault();
    if (!searchTerm.trim()) return;

    setLoading(true);
    setSearched(true);

    try {
      let query = supabase
        .from('clients') // Cambiado a la tabla correcta que sí existe
        .select('*');

      // Si el término parece un código HPA (ej. HPA-SOL-0002)
      if (searchTerm.toUpperCase().includes('HPA')) {
        query = query.ilike('loan_code', `%${searchTerm.trim()}%`);
      } else {
        // Si es texto suelto, busca por el nombre del cliente
        query = query.ilike('full_name', `%${searchTerm.trim()}%`);
      }

      const { data, error } = await query;

      if (error) throw error;
      setAccounts(data || []);
    } catch (err) {
      console.error('Error en la búsqueda de cobranza:', err);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  };

  // 3. Restablecer el estado si el usuario borra el input manualmente
  const handleInputChange = (e) => {
    const value = e.target.value;
    setSearchTerm(value);
    if (value.trim() === '') {
      setAccounts([]);
      setSearched(false);
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Encabezado y Alerta de Caja */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Módulo de Cobranza</h1>
          <p className="text-sm text-gray-500">Gestión de recaudación y aplicación de amortizaciones en tiempo real</p>
        </div>

        {cashOpen ? (
          <div className="flex items-center gap-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-lg border border-emerald-200 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Caja Abierta (Sesión Activa)
          </div>
        ) : (
          <div className="flex items-center gap-2 bg-amber-50 text-amber-700 px-4 py-2 rounded-lg border border-amber-200 text-sm font-medium">
            <AlertTriangle className="w-4 h-4" />
            Requiere Apertura de Caja para Cobrar
          </div>
        )}
      </div>

      {/* Buscador y Resultados */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel Izquierdo: Formulario de Búsqueda */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 space-y-4 h-fit">
          <h2 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Buscar Cartera Activa</h2>
          
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Ej: HPA-SOL-0002 o Herik"
                value={searchTerm}
                onChange={handleInputChange}
                className="w-full pl-9 pr-4 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
              />
            </div>
            
            <button
              type="submit"
              disabled={loading || !searchTerm.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 rounded-lg shadow-sm transition-colors flex items-center justify-center min-w-[76px]"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Filtrar'}
            </button>
          </form>

          <hr className="border-gray-100" />

          {/* Lista de Cuentas Encontradas */}
          <div>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
              {searched ? 'Cuentas Encontradas' : 'Cuentas con Balance Pendiente'}
            </h3>

            {loading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            ) : accounts.length > 0 ? (
              <div className="space-y-2">
                {accounts.map((acc) => (
                  <div 
                    key={acc.id} 
                    className="p-3 bg-gray-50 hover:bg-indigo-50/50 border border-gray-200 hover:border-indigo-200 rounded-lg cursor-pointer transition-all"
                  >
                    <p className="font-semibold text-sm text-gray-800">{acc.full_name}</p>
                    <p className="text-xs text-gray-500">{acc.loan_code || 'Sin código activo'}</p>
                  </div>
                ))}
              </div>
            ) : searched ? (
              <p className="text-xs text-center text-gray-400 py-6">
                No se encontraron cuentas activas con el criterio ingresado.
              </p>
            ) : (
              <p className="text-xs text-center text-gray-400 py-6">
                Usa el buscador superior para filtrar las cuentas de la cartera.
              </p>
            )}
          </div>
        </div>

        {/* Panel Derecho: Detalles del préstamo seleccionado (Placeholder) */}
        <div className="lg:col-span-2 bg-white p-8 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center text-center min-h-[350px]">
          <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center text-gray-400 mb-4">
            $
          </div>
          <h3 className="font-semibold text-gray-700 mb-1">Ningún préstamo seleccionado</h3>
          <p className="text-xs text-gray-400 max-w-sm">
            Selecciona una cuenta de la cartera activa en el panel de la izquierda para desplegar y procesar su cobranza.
          </p>
        </div>
      </div>
    </div>
  );
}
