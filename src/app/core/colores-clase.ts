/**
 * Color por tipo de clase, calculado a partir del nombre (sin columna en la base de datos).
 * El mismo nombre siempre da el mismo color en Horarios, Clases, Instructores y la vista del socio.
 * Si en el futuro se agrega una columna `clases.color`, basta con preferirla aquí.
 */
export const PALETA_CLASES = ['#F7FF14', '#38D6FF', '#FF7A1A', '#3DF5A7', '#FF5C8A', '#B98CFF'];

const FIJOS: Record<string, string> = {
  crossfit: '#F7FF14',
  spinning: '#38D6FF',
  funcional: '#FF7A1A',
  yoga: '#3DF5A7',
  box: '#FF5C8A',
};

function normalizar(nombre: string): string {
  return nombre.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function colorClase(nombre: string | null | undefined): string {
  if (!nombre) return PALETA_CLASES[0];
  const n = normalizar(nombre);
  if (FIJOS[n]) return FIJOS[n];
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = (hash * 31 + n.charCodeAt(i)) >>> 0;
  return PALETA_CLASES[hash % PALETA_CLASES.length];
}

export function conAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export function iniciales(nombre: string | null | undefined): string {
  return (nombre ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}
