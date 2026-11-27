import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';
import { AvisosService } from '../../core/avisos.service';
import { fechaLocal, horaLocal, sumarDias } from '../../core/fechas';
import { colorClase, conAlpha } from '../../core/colores-clase';

interface Dia {
  fecha: string;   // YYYY-MM-DD local
  corto: string;   // HOY, LUN, MAR…
  numero: number;
  titulo: string;  // "Hoy, miércoles" / "Jueves 26"
}

interface ClaseDisponible {
  horario_id: string;
  clase_nombre: string;
  instructor_nombre: string;
  reemplazo: boolean;
  fecha: string;
  hora: string;
  duracion: number;
  capacidad: number;
  ocupadas: number;
  esEspecial: boolean;
  miReservaId: string | null;
  color: string;
}

interface MiReserva {
  id: string;
  horario_id: string;
  fecha_clase: string;
  clase_nombre: string;
  hora: string;
  color: string;
}

const DIAS_CORTOS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const DIAS_LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_VISIBLES = 7;

function capitalizar(t: string): string {
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function desdeFecha(fecha: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d);
}

@Component({
  selector: 'app-cliente-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cliente-dashboard.component.html',
})
export class ClienteDashboardComponent implements OnInit {
  loading = true;
  vista: 'clases' | 'reservas' = 'clases';

  dias: Dia[] = [];
  diaSeleccionado = '';
  clases: ClaseDisponible[] = [];
  misReservas: MiReserva[] = [];

  membresiaActiva = false;
  planNombre = '';
  esIlimitado = false;
  clasesRestantes: number | null = null;
  clasesIncluidas: number | null = null;
  venceTexto = '';

  procesando: string | null = null;       // horario_id+fecha o reserva id en curso
  confirmandoCancelar: string | null = null;

  constructor(private supabase: SupabaseService, public auth: AuthService, private avisos: AvisosService) {}

  async ngOnInit() {
    this.construirDias();
    await this.cargarTodo();
  }

  // ---------- Datos ----------

  private construirDias() {
    const hoy = new Date();
    this.dias = Array.from({ length: DIAS_VISIBLES }, (_, i) => {
      const d = sumarDias(hoy, i);
      return {
        fecha: fechaLocal(d),
        corto: i === 0 ? 'HOY' : DIAS_CORTOS[d.getDay()],
        numero: d.getDate(),
        titulo: i === 0 ? `Hoy, ${DIAS_LARGOS[d.getDay()]}` : `${capitalizar(DIAS_LARGOS[d.getDay()])} ${d.getDate()}`,
      };
    });
    this.diaSeleccionado = this.dias[0].fecha;
  }

  async cargarTodo() {
    this.loading = true;
    await Promise.all([this.cargarMembresia(), this.cargarMisReservas()]);
    await this.cargarClases();
    this.loading = false;
  }

  private async cargarMembresia() {
    const userId = this.auth.profile()?.id;
    if (!userId) return;

    const { data } = await this.supabase.client
      .from('membresias_usuario')
      .select('clases_restantes, fecha_fin, planes_membresia(nombre, tipo, clases_incluidas)')
      .eq('usuario_id', userId)
      .eq('estado', 'activa')
      .order('fecha_fin', { ascending: false })
      .limit(1)
      .maybeSingle();

    const m = data as any;
    this.membresiaActiva = !!m;
    if (!m) return;

    this.planNombre = m.planes_membresia?.nombre ?? 'Tu plan';
    this.esIlimitado = m.planes_membresia?.tipo === 'ilimitado';
    this.clasesRestantes = m.clases_restantes;
    this.clasesIncluidas = m.planes_membresia?.clases_incluidas ?? null;
    if (m.fecha_fin) {
      const f = desdeFecha(String(m.fecha_fin).slice(0, 10));
      this.venceTexto = `Vence ${f.getDate()} ${MESES[f.getMonth()]}`;
    } else {
      this.venceTexto = '';
    }
  }

  private async cargarMisReservas() {
    const userId = this.auth.profile()?.id;
    if (!userId) return;

    const { data } = await this.supabase.client
      .from('reservas')
      .select('id, horario_id, fecha_clase, horarios(hora, clases(nombre))')
      .eq('usuario_id', userId)
      .eq('estado', 'confirmada')
      .gte('fecha_clase', fechaLocal(new Date()))
      .order('fecha_clase', { ascending: true });

    this.misReservas = (data ?? [])
      .map((r: any) => ({
        id: r.id,
        horario_id: r.horario_id,
        fecha_clase: r.fecha_clase,
        clase_nombre: r.horarios?.clases?.nombre ?? '—',
        hora: r.horarios?.hora?.slice(0, 5) ?? '',
        color: colorClase(r.horarios?.clases?.nombre),
      }))
      .sort((a, b) => (a.fecha_clase + a.hora).localeCompare(b.fecha_clase + b.hora));
  }

  private async cargarClases() {
    const db = this.supabase.client;
    const desde = this.dias[0].fecha;
    const hasta = this.dias[this.dias.length - 1].fecha;
    const ahora = horaLocal(new Date());

    const { data: horarios } = await db
      .from('horarios')
      .select('id, dia_semana, fecha_especifica, hora, capacidad, duracion_minutos, clases(nombre), instructores(nombre)')
      .eq('activo', true);

    const lista = (horarios ?? []) as any[];
    if (lista.length === 0) {
      this.clases = [];
      return;
    }

    const ids = lista.map((h) => h.id);
    const [{ data: excepciones }, { data: instructores }, { data: reservas }] = await Promise.all([
      db.from('excepciones_horario').select('horario_id, fecha, tipo, instructor_reemplazo_id').in('horario_id', ids).gte('fecha', desde).lte('fecha', hasta),
      db.from('instructores').select('id, nombre'),
      db.from('reservas').select('horario_id, fecha_clase').eq('estado', 'confirmada').in('horario_id', ids).gte('fecha_clase', desde).lte('fecha_clase', hasta),
    ]);

    const nombreInstructor = new Map<string, string>((instructores ?? []).map((i: any) => [i.id, i.nombre]));
    const conteo = new Map<string, number>();
    (reservas ?? []).forEach((r: any) => {
      const k = `${r.horario_id}_${r.fecha_clase}`;
      conteo.set(k, (conteo.get(k) ?? 0) + 1);
    });
    const mias = new Map<string, string>(this.misReservas.map((r) => [`${r.horario_id}_${r.fecha_clase}`, r.id]));

    const items: ClaseDisponible[] = [];
    for (const dia of this.dias) {
      const dow = desdeFecha(dia.fecha).getDay();
      for (const h of lista) {
        const esEspecial = h.fecha_especifica !== null && h.fecha_especifica !== undefined;
        if (esEspecial ? h.fecha_especifica !== dia.fecha : h.dia_semana !== dow) continue;

        const hora = (h.hora ?? '').slice(0, 5);
        if (dia.fecha === desde && hora <= ahora) continue; // ya empezó o pasó

        const exc = (excepciones ?? []).find((e: any) => e.horario_id === h.id && e.fecha === dia.fecha) as any;
        if (exc?.tipo === 'cancelada') continue;
        const reemplazo = exc?.tipo === 'instructor_reemplazo';
        const instructor = reemplazo
          ? nombreInstructor.get(exc.instructor_reemplazo_id) ?? h.instructores?.nombre ?? '—'
          : h.instructores?.nombre ?? '—';

        const k = `${h.id}_${dia.fecha}`;
        items.push({
          horario_id: h.id,
          clase_nombre: h.clases?.nombre ?? '—',
          instructor_nombre: instructor,
          reemplazo,
          fecha: dia.fecha,
          hora,
          duracion: h.duracion_minutos ?? 0,
          capacidad: h.capacidad ?? 0,
          ocupadas: conteo.get(k) ?? 0,
          esEspecial,
          miReservaId: mias.get(k) ?? null,
          color: colorClase(h.clases?.nombre),
        });
      }
    }
    this.clases = items.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  }

  // ---------- Presentación ----------

  get diaActual(): Dia | undefined {
    return this.dias.find((d) => d.fecha === this.diaSeleccionado);
  }

  get clasesDelDia(): ClaseDisponible[] {
    return this.clases.filter((c) => c.fecha === this.diaSeleccionado);
  }

  clasesEn(fecha: string): number {
    return this.clases.filter((c) => c.fecha === fecha).length;
  }

  get progresoPlan(): number {
    if (this.esIlimitado || !this.clasesIncluidas || this.clasesRestantes === null) return 100;
    return Math.max(0, Math.min(100, Math.round((this.clasesRestantes / this.clasesIncluidas) * 100)));
  }

  puedeReservar(): boolean {
    if (!this.membresiaActiva) return false;
    if (this.esIlimitado) return true;
    return (this.clasesRestantes ?? 0) > 0;
  }

  llena(c: ClaseDisponible): boolean {
    return c.ocupadas >= c.capacidad;
  }

  porcentaje(c: ClaseDisponible): number {
    return c.capacidad > 0 ? Math.min(100, Math.round((c.ocupadas / c.capacidad) * 100)) : 100;
  }

  colorBarra(c: ClaseDisponible): string {
    if (this.llena(c)) return '#FF3B30';
    return c.ocupadas / c.capacidad >= 0.8 ? '#FF7A1A' : '#F7FF14';
  }

  cuposTexto(c: ClaseDisponible): string {
    if (c.capacidad <= 0 || this.llena(c)) return 'Llena';
    const libres = c.capacidad - c.ocupadas;
    return libres === 1 ? '1 cupo' : `${libres} cupos`;
  }

  fondoColor(color: string): string {
    return conAlpha(color, 0.12);
  }

  fechaReserva(r: MiReserva): string {
    const d = desdeFecha(r.fecha_clase);
    const hoy = fechaLocal(new Date());
    const manana = fechaLocal(sumarDias(new Date(), 1));
    if (r.fecha_clase === hoy) return 'Hoy';
    if (r.fecha_clase === manana) return 'Mañana';
    return `${capitalizar(DIAS_LARGOS[d.getDay()])} ${d.getDate()} ${MESES[d.getMonth()]}`;
  }

  clave(c: ClaseDisponible): string {
    return `${c.horario_id}_${c.fecha}`;
  }

  // ---------- Acciones ----------

  async reservar(c: ClaseDisponible) {
    this.procesando = this.clave(c);
    const { error } = await this.supabase.client.rpc('reservar_clase', {
      p_horario_id: c.horario_id,
      p_fecha_clase: c.fecha,
    });
    this.procesando = null;
    if (error) {
      this.avisos.error('No se pudo reservar: ' + error.message);
      return;
    }
    this.avisos.ok(`Reservaste ${c.clase_nombre} · ${this.diaActual?.titulo ?? ''} ${c.hora}`);
    await this.cargarTodo();
  }

  pedirCancelar(id: string) {
    this.confirmandoCancelar = id;
  }

  noCancelar() {
    this.confirmandoCancelar = null;
  }

  async cancelar(reservaId: string, nombre: string) {
    this.confirmandoCancelar = null;
    this.procesando = reservaId;
    const { error } = await this.supabase.client.rpc('cancelar_reserva', { p_reserva_id: reservaId });
    this.procesando = null;
    if (error) {
      this.avisos.error('No se pudo cancelar: ' + error.message);
      return;
    }
    this.avisos.ok(`Cancelaste tu reserva de ${nombre}`);
    await this.cargarTodo();
  }
}
