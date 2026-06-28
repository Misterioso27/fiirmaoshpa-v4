const plazoOriginal = parseFloat(form.term_months);

// Validamos de forma segura sin importar si viene en mayúsculas, minúsculas o texto largo
const tipoPrestamo = (form.type || '').toLowerCase();
const esPersonal = tipoPrestamo.includes('personal');
const esComercial = tipoPrestamo.includes('comercial') || tipoPrestamo.includes('emprende');
const esVehiculo = tipoPrestamo.includes('vehic') || tipoPrestamo.includes('vehículo');
const esBusiness = tipoPrestamo.includes('business');

await db.createLoanApplication({
  client_id: form.client_id,
  product_id: form.product_id || (
    esPersonal ? '3047c3ee-889d-4964-8cb6-660bf285b85d' :
    esComercial ? '24a2fdd3-1a29-4907-9122-6c9e71b57ffb' :
    esVehiculo ? '156beb17-b2d6-41fd-a122-9f10bfd04f9a' : 
    '3047c3ee-889d-4964-8cb6-660bf285b85d' // Por defecto Personal
  ),
  type: form.type || 'personal',
  amount_requested: parseFloat(form.amount_requested),
  currency: form.currency || 'DOP',
  
  // PUENTE INTELIGENTE: Si es 2.5 pasa como entero 3, si es cualquier otro número se queda igual
  term_months: plazoOriginal === 2.5 ? 3 : Math.round(plazoOriginal),
  
  purpose: form.purpose,
  monthly_income: parseFloat(form.monthly_income),
  analyst_notes: analisis.warning ? `[AUTORIZACIÓN REQUERIDA]: ${form.analyst_notes || ''}` : form.analyst_notes || null
});
