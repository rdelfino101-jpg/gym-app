import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService } from '../../core/supabase.service';
import { AuthService } from '../../core/auth.service';

interface ClaseDisponible {
  horario_id: string;
  clase_nombre: string;
  instructor_nombre: string;
  fecha: string;
  fechaDisplay: string;
  hora: string;
  capacidad: number;
  ocupadas: number;
  reservando: boolean;
  esEspecial: boolean;
}
interface MiReserva {
  id: string;
  fecha_clase: string;
  clase_nombre: string;
  hora: string;
  cancelando: boolean;
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
function toDateStr(d: Date): string { return d.toISOString().slice(0, 10); }

@Component({
  selector: 'app-cliente-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './cliente-dashboard.component.html',
})
export class ClienteDashboardComponent implements OnInit {
  loading = true;
  clasesDisponibles: ClaseDisponible[] = [];
  misReservas: MiReserva[] = [];
  membresiaActiva = false;
  clasesRestantes: number | null = null;
  esIlimitado = false;

  constructor(private supabase: SupabaseService, public auth: AuthService) {}

  async ngOnInit() { await this.cargarTodo(); }

  async cargarTodo() {
    this.loading = true;
    await Promise.all([this.cargarMembresia(), this.cargarClasesDisponibles(), this.cargarMisReservas()]);
    this.loading = false;
  }

  private async cargarMembresia() {
    const userId = this.auth.profile()?.id;
    if (!userId) return;

    const { data } = await this.supabase.client
      .from('membresias_usuario')
      .select('clases_restantes, planes_membresia(tipo)')
      .eq('usuario_id', userId)
      .eq('estado', 'activa')
      .order('fecha_fin', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      this.membresiaActiva = true;
      this.esIlimitado = (data as any).planes_membresia?.tipo === 'ilimitado';
      this.clasesRestantes = (data as any).clases_restantes;
    } else {
      this.membresiaActiva = false;
    }
  }

  private nextOccurrence(diaSemana: number, horaStr: string, semanasExtra = 0): Date {
    const now = new Date();
    const [h, m] = horaStr.split(':').map(Number);
    const daysAhead = (diaSemana - now.getDay() + 7) % 7 + semanasExtra * 7;
    const candidate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysAhead, h, m, 0);
    if (daysAhead === 0 && candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 7);
    }
    return candidate;
  }

  private async cargarClasesDisponibles() {
    const { data: horarios } = await this.supabase.client
      .from('horarios')
      .select('id, dia_semana, fecha_especifica, hora, capacidad, clases(nombre), instructores(nombre)')
      .eq('activo', true);

    if (!horarios || horarios.length === 0) { this.clasesDisponibles = []; return; }

    const hoyStr = toDateStr(new Date());
    const recurrentes = (horarios as any[]).filter(h => h.dia_semana !== null);
    const especiales = (horarios as any[]).filter(h => h.fecha_especifica !== null && h.fecha_especifica >= hoyStr);

    const idsRecurrentes = recurrentes.map(h => h.id);
    const { data: excepciones } = idsRecurrentes.length
      ? await this.supabase.client
          .from('excepciones_horario')
          .select('horario_id, fecha, tipo, instructor_reemplazo_id')
          .in('horario_id', idsRecurrentes)
          .gte('fecha', hoyStr)
      : { data: [] as any[] };

    const items: ClaseDisponible[] = [];

    for (const h of recurrentes) {
      let fechaDate = this.nextOccurrence(h.dia_semana, h.hora);
      let fechaStr = toDateStr(fechaDate);
      let exc = (excepciones ?? []).find((e: any) => e.horario_id === h.id && e.fecha === fechaStr);

      if (exc?.tipo === 'cancelada') {
        fechaDate = this.nextOccurrence(h.dia_semana, h.hora, 1);
        fechaStr = toDateStr(fechaDate);
        exc = (excepciones ?? []).find((e: any) => e.horario_id === h.id && e.fecha === fechaStr);
        if (exc?.tipo === 'cancelada') continue;
      }

      let nombreInstructor = h.instructores?.nombre ?? '—';
      if (exc?.tipo === 'instructor_reemplazo') nombreInstructor += ' (reemplazo)';

      items.push({
        horario_id: h.id,
        clase_nombre: h.clases?.nombre ?? '—',
        instructor_nombre: nombreInstructor,
        fecha: fechaStr,
        fechaDisplay: `${DIAS[fechaDate.getDay()]} ${fechaDate.getDate()}/${fechaDate.getMonth() + 1}`,
        hora: h.hora.slice(0, 5),
        capacidad: h.capacidad,
        ocupadas: 0,
        reservando: false,
        esEspecial: false,
      });
    }

    for (const h of especiales) {
      const fechaDate = new Date(h.fecha_especifica + 'T00:00:00');
      items.push({
        horario_id: h.id,
        clase_nombre: h.clases?.nombre ?? '—',
        instructor_nombre: h.instructores?.nombre ?? '—',
        fecha: h.fecha_especifica,
        fechaDisplay: `⭐ ${DIAS[fechaDate.getDay()]} ${fechaDate.getDate()}/${fechaDate.getMonth() + 1}`,
        hora: h.hora.slice(0, 5),
        capacidad: h.capacidad,
        ocupadas: 0,
        reservando: false,
        esEspecial: true,
      });
    }

    const fechas = [...new Set(items.map(i => i.fecha))];
    const { data: reservas } = await this.supabase.client
      .from('reservas')
      .select('horario_id, fecha_clase')
      .eq('estado', 'confirmada')
      .in('fecha_clase', fechas);

    const conteo = new Map<string, number>();
    (reservas ?? []).forEach((r: any) => {
      const key = `${r.horario_id}_${r.fecha_clase}`;
      conteo.set(key, (conteo.get(key) ?? 0) + 1);
    });

    items.forEach(i => { i.ocupadas = conteo.get(`${i.horario_id}_${i.fecha}`) ?? 0; });

    this.clasesDisponibles = items.sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
  }

  private async cargarMisReservas() {
    const userId = this.auth.profile()?.id;
    if (!userId) return;

    const { data } = await this.supabase.client
      .from('reservas')
      .select('id, fecha_clase, horarios(hora, clases(nombre))')
      .eq('usuario_id', userId)
      .eq('estado', 'confirmada')
      .gte('fecha_clase', toDateStr(new Date()))
      .order('fecha_clase', { ascending: true });

    this.misReservas = (data ?? []).map((r: any) => ({
      id: r.id,
      fecha_clase: r.fecha_clase,
      clase_nombre: r.horarios?.clases?.nombre ?? '—',
      hora: r.horarios?.hora?.slice(0, 5) ?? '',
      cancelando: false,
    }));
  }

  puedeReservar(): boolean {
    if (!this.membresiaActiva) return false;
    if (this.esIlimitado) return true;
    return (this.clasesRestantes ?? 0) > 0;
  }

  async reservar(clase: ClaseDisponible) {
    clase.reservando = true;
    const { error } = await this.supabase.client.rpc('reservar_clase', {
      p_horario_id: clase.horario_id,
      p_fecha_clase: clase.fecha,
    });
    clase.reservando = false;

    if (error) { alert('No se pudo reservar: ' + error.message); return; }
    await this.cargarTodo();
  }

  async cancelar(reserva: MiReserva) {
    if (!confirm(`¿Cancelar tu reserva de ${reserva.clase_nombre}?`)) return;
    reserva.cancelando = true;
    const { error } = await this.supabase.client.rpc('cancelar_reserva', {
      p_reserva_id: reserva.id,
    });
    reserva.cancelando = false;

    if (error) { alert('No se pudo cancelar: ' + error.message); return; }
    await this.cargarTodo();
  }
}