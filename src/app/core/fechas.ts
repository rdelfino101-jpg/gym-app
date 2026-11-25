/**
 * Utilidades de fecha en hora LOCAL del navegador.
 * No usar toISOString() para obtener "hoy": convierte a UTC y en El Salvador
 * (UTC-6) a partir de las 6:00 p. m. devuelve la fecha de mañana.
 */
export function fechaLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dia}`;
}

export function sumarDias(d: Date, dias: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + dias);
  return r;
}

/** "HH:MM" de la hora actual, para comparar con columnas `hora` (time). */
export function horaLocal(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
