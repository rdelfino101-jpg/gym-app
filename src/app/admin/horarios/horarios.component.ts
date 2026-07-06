import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FullCalendarModule } from '@fullcalendar/angular';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import { CalendarOptions } from '@fullcalendar/core';
import { SupabaseService } from '../../core/supabase.service';

interface Horario {
  id: string;
  dia_semana: number | null;
  fecha_especifica: string | null;
  hora: string;
  capacidad: number;
  duracion_minutos: number;
  activo: boolean;
  clases: { nombre: string } | null;
  instructores: { nombre: string } | null;
}
interface Opcion { id: string; nombre: string; }
interface Excepcion {
  id: string; horario_id: string; fecha: string; tipo: string;
  instructor_reemplazo_id: string | null; motivo: string | null;
  horarios: { hora: string; clases: { nombre: string } | null } | null;
}

const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const COLORES = ['#ff5f1f', '#3b82f6', '#22c55e', '#a855f7', '#eab308', '#ec4899'];
const SEMANAS_ADELANTE = 10;

function sumarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(':').map(Number);
  const total = h * 60 + m + minutos;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}
function toDateStr(d: Date): string { return d.toISOString().slice(0, 10); }

@Component({
  selector: 'app-horarios',
  standalone: true,
  imports: [CommonModule, FormsModule, FullCalendarModule],
  templateUrl: './horarios.component.html',
})
export class HorariosComponent implements OnInit {
  horarios: Horario[] = [];
  excepciones: Excepcion[] = [];
  clasesOpciones: Opcion[] = [];
  instructoresOpciones: Opcion[] = [];
  dias = DIAS;

  modoNuevo: 'recurrente' | 'especial' = 'recurrente';
  nuevoClaseId = '';
  nuevoInstructorId = '';
  nuevoDia: number | null = null;
  nuevaFechaEspecifica = '';
  nuevaHora = '';
  nuevaCapacidad = 20;
  nuevaDuracion = 60;

  excHorarioId = '';
  excFecha = '';
  excTipo: 'cancelada' | 'instructor_reemplazo' = 'cancelada';
  excInstructorId = '';
  excMotivo = '';

  loading = true;
  guardando = false;
  guardandoExcepcion = false;

  calendarOptions: CalendarOptions = {
    plugins: [dayGridPlugin, timeGridPlugin],
    initialView: 'timeGridWeek',
    headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' },
    locale: 'es',
    height: 'auto',
    slotMinTime: '05:00:00',
    slotMaxTime: '22:00:00',
    allDaySlot: false,
    editable: false,
    selectable: false,
    events: [],
  };

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    await Promise.all([this.cargarHorarios(), this.cargarExcepciones(), this.cargarOpciones()]);
    this.actualizarEventosCalendario();
  }

  get horariosRecurrentes(): Horario[] { return this.horarios.filter(h => h.dia_semana !== null); }
  get horariosEspeciales(): Horario[] { return this.horarios.filter(h => h.fecha_especifica !== null); }

  async cargarOpciones() {
    const [{ data: clases }, { data: instructores }] = await Promise.all([
      this.supabase.client.from('clases').select('id, nombre').eq('activo', true).order('nombre'),
      this.supabase.client.from('instructores').select('id, nombre').eq('activo', true).order('nombre'),
    ]);
    this.clasesOpciones = clases ?? [];
    this.instructoresOpciones = instructores ?? [];
  }

  async cargarHorarios() {
    this.loading = true;
    const { data } = await this.supabase.client
      .from('horarios')
      .select('id, dia_semana, fecha_especifica, hora, capacidad, duracion_minutos, activo, clases(nombre), instructores(nombre)')
      .order('dia_semana').order('hora');
    this.horarios = (data as any) ?? [];
    this.loading = false;
  }

  async cargarExcepciones() {
    const { data } = await this.supabase.client
      .from('excepciones_horario')
      .select('id, horario_id, fecha, tipo, instructor_reemplazo_id, motivo, horarios(hora, clases(nombre))')
      .gte('fecha', toDateStr(new Date()))
      .order('fecha');
    this.excepciones = (data as any) ?? [];
  }

  private actualizarEventosCalendario() {
    const nombreAColor = new Map<string, string>();
    let colorIdx = 0;
    const colorDe = (nombre: string) => {
      if (!nombreAColor.has(nombre)) { nombreAColor.set(nombre, COLORES[colorIdx % COLORES.length]); colorIdx++; }
      return nombreAColor.get(nombre)!;
    };

    const hoy = new Date();
    const events: any[] = [];

    for (const h of this.horariosRecurrentes.filter(x => x.activo)) {
      for (let semana = 0; semana < SEMANAS_ADELANTE; semana++) {
        const daysAhead = (h.dia_semana! - hoy.getDay() + 7) % 7 + semana * 7;
        const fecha = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() + daysAhead);
        const fechaStr = toDateStr(fecha);

        const exc = this.excepciones.find(e => e.horario_id === h.id && e.fecha === fechaStr);
        if (exc?.tipo === 'cancelada') continue;

        const nombreClase = h.clases?.nombre ?? '—';
        let nombreInstructor = h.instructores?.nombre ?? '—';
        if (exc?.tipo === 'instructor_reemplazo') {
          const reemplazo = this.instructoresOpciones.find(i => i.id === exc.instructor_reemplazo_id);
          nombreInstructor = (reemplazo?.nombre ?? nombreInstructor) + ' (reemplazo)';
        }

        events.push({
          title: `${nombreClase} · ${nombreInstructor}`,
          start: `${fechaStr}T${h.hora}`,
          end: `${fechaStr}T${sumarMinutos(h.hora, h.duracion_minutos)}`,
          color: colorDe(nombreClase),
        });
      }
    }

    for (const h of this.horariosEspeciales.filter(x => x.activo && x.fecha_especifica! >= toDateStr(hoy))) {
      const nombreClase = h.clases?.nombre ?? '—';
      events.push({
        title: `⭐ ${nombreClase} · ${h.instructores?.nombre ?? '—'}`,
        start: `${h.fecha_especifica}T${h.hora}`,
        end: `${h.fecha_especifica}T${sumarMinutos(h.hora, h.duracion_minutos)}`,
        color: colorDe(nombreClase),
      });
    }

    this.calendarOptions = { ...this.calendarOptions, events };
  }

  diaNombre(n: number): string { return DIAS[n]; }

  async agregar() {
    if (!this.nuevoClaseId || !this.nuevoInstructorId || !this.nuevaHora) {
      alert('Completa todos los campos.'); return;
    }
    if (this.modoNuevo === 'recurrente' && this.nuevoDia === null) {
      alert('Elige un día de la semana.'); return;
    }
    if (this.modoNuevo === 'especial' && !this.nuevaFechaEspecifica) {
      alert('Elige una fecha para el evento especial.'); return;
    }

    this.guardando = true;
    const payload: any = {
      clase_id: this.nuevoClaseId,
      instructor_id: this.nuevoInstructorId,
      hora: this.nuevaHora,
      capacidad: this.nuevaCapacidad,
      duracion_minutos: this.nuevaDuracion,
    };
    if (this.modoNuevo === 'recurrente') {
      payload.dia_semana = this.nuevoDia;
      payload.fecha_especifica = null;
    } else {
      payload.dia_semana = null;
      payload.fecha_especifica = this.nuevaFechaEspecifica;
    }

    const { error } = await this.supabase.client.from('horarios').insert(payload);
    this.guardando = false;
    if (error) { alert('Error: ' + error.message); return; }

    this.nuevoClaseId = ''; this.nuevoInstructorId = ''; this.nuevoDia = null;
    this.nuevaFechaEspecifica = ''; this.nuevaHora = ''; this.nuevaCapacidad = 20; this.nuevaDuracion = 60;
    await this.cargarHorarios();
    this.actualizarEventosCalendario();
  }

  async toggleActivo(h: Horario) {
    const { error } = await this.supabase.client
      .from('horarios')
      .update({ activo: !h.activo })
      .eq('id', h.id);
    if (error) { alert('Error: ' + error.message); return; }
    await this.cargarHorarios();
    this.actualizarEventosCalendario();
  }

  async agregarExcepcion() {
    if (!this.excHorarioId || !this.excFecha) { alert('Elige un horario y una fecha.'); return; }
    if (this.excTipo === 'instructor_reemplazo' && !this.excInstructorId) {
      alert('Elige el instructor de reemplazo.'); return;
    }

    this.guardandoExcepcion = true;
    const { error } = await this.supabase.client.from('excepciones_horario').insert({
      horario_id: this.excHorarioId,
      fecha: this.excFecha,
      tipo: this.excTipo,
      instructor_reemplazo_id: this.excTipo === 'instructor_reemplazo' ? this.excInstructorId : null,
      motivo: this.excMotivo || null,
    });
    this.guardandoExcepcion = false;
    if (error) { alert('Error: ' + error.message); return; }

    this.excHorarioId = ''; this.excFecha = ''; this.excTipo = 'cancelada';
    this.excInstructorId = ''; this.excMotivo = '';
    await this.cargarExcepciones();
    this.actualizarEventosCalendario();
  }

  async borrarExcepcion(exc: Excepcion) {
    if (!confirm('¿Quitar esta excepción? La clase volverá a su horario normal.')) return;
    const { error } = await this.supabase.client.from('excepciones_horario').delete().eq('id', exc.id);
    if (error) { alert('Error: ' + error.message); return; }
    await this.cargarExcepciones();
    this.actualizarEventosCalendario();
  }
}