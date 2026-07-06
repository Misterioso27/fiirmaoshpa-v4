const handleUpdateSolicitud = async (e) => {
  e.preventDefault();
  
  // 1. Forzamos el cálculo con los valores actuales del modal para asegurar exactitud
  const resultadoSimulacion = calcularCuotas(formData.monto, formData.tasa, formData.cuotas);
  
  // 2. Construimos el objeto con los datos actualizados que vio el usuario en las fotos
  const datosActualizados = {
    monto: parseFloat(formData.monto),
    tasa_interes: parseFloat(formData.tasa),
    numero_cuotas: parseInt(formData.cuotas),
    // AQUÍ ESTÁ LA CLAVE: Enviamos el plazo formateado ("2.5 Meses") y no el valor viejo
    plazo: resultadoSimulacion.plazoTexto, 
    monto_cuota: resultadoSimulacion.montoCuota,
    estado: formData.estado
  };

  try {
    // 3. Envío directo a Supabase
    const { data, error } = await supabase
      .from('solicitudes_prestamos')
      .update(datosActualizados)
      .eq('id', formData.id); // O la variable que uses para el ID de la solicitud (HPA-SOL-0001)

    if (error) throw error;

    // 4. Actualizar el estado local de la tabla principal para que cambie en tiempo real
    setSolicitudes(prev => prev.map(sol => sol.id === formData.id ? { ...sol, ...datosActualizados } : sol));
    
    // Cerrar modal y notificar éxito
    setModalAbierto(false);
    alert('Solicitud actualizada correctamente.');

  } catch (error) {
    console.error('Error al actualizar el plazo:', error.message);
    alert('No se pudo guardar el cambio en la base de datos.');
  }
};
