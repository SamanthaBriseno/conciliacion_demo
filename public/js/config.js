// ============================================================
// CONFIGURACIÓN GLOBAL
// ============================================================

// ⚠️ Ahora todo va por Express, no directo a n8n
const WEBHOOK_URL       = 'http://localhost:5000/api/conciliar';
const API_KPIS          = 'http://localhost:5000/api/kpis';
const API_MOVIMIENTOS   = 'http://localhost:5000/api/movimientos';
const API_IA            = 'http://localhost:5000/api/ia-recomendaciones';

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