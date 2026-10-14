// ============================================================
// CONFIGURACIÓN GLOBAL
// ============================================================

// ⚠️ Ahora todo va por Express, no directo a n8n
const BASE_URL          = `${window.location.protocol}//${window.location.hostname}:8014`;
const WEBHOOK_URL       = `${BASE_URL}/api/conciliar`;
const API_KPIS          = `${BASE_URL}/api/kpis`;
const API_MOVIMIENTOS   = `${BASE_URL}/api/movimientos`;
const API_IA            = `${BASE_URL}/api/ia-recomendaciones`;
const API_RESET_DEMO    = `${BASE_URL}/api/reset-demo`;

// Cliente demo
const CLIENTE_ID = '11111111-1111-1111-1111-111111111111';

// Helpers
const formatMXN = (n) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n || 0);

const formatFecha = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
};