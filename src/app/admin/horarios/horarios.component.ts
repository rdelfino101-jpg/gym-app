import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';
import { AvisosService } from '../../core/avisos.service';
import { fechaLocal, sumarDias } from '../../core/fechas';
import { colorClase, conAlpha } from '../../core/colores-clase';

interface Horario {
  id: string;
  clase_id: string;
  instructor_id: string;
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
  id: string;
  horario_id: string;
  fecha: string;
  tipo: 'cancelada' | 'instructor_reemplazo';
  instructor_reemplazo_id: string | null;
}

interface DiaSemana {
  fecha: string;
  dow: number;        // 0 = domingo (convención de dia_semana)
  corto: string;
  numero: number;
  esHoy: boolean;
}

/** Una clase concreta en una fecha de la semana visible. */
interface Ocurrencia {
  horario: Horario;
  fecha: string;
  hora: string;
  excepcion: Excepcion | null;
  reservas: number;
}

type Panel =
  | { modo: 'vacio' }
  | { modo: 'nuevo'; fecha: string; hora: string }
  | { modo: 'editar'; horarioId: string; fecha: string };

const CORTOS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const LARGOS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DURACIONES = [45, 50, 60, 90];

function desdeFecha(fecha: string): Date {
  const [y, m, d] = fecha.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function lunesDe(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const offset = (r.getDay() + 6) % 7; // lunes = 0
  r.setDate(r.getDate() - offset);
  return r;
}

@Component({
  selector: 'app-horarios',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './horarios.component.html',
})
export class HorariosComponent implements OnInit {
  horarios: Horario[] = [];
  excepciones: Excepcion[] = [];
  reservasPorClave = new Map<string, number>();
  clasesOpciones: Opcion[] = [];
  instructoresOpciones: Opcion[] = [];
  todosInstructores = new Map<string, string>();

  semanaOffset = 0;
  semana: DiaSemana[] = [];
  filas: string[] = [];
  loading = true;

  panel: Panel = { modo: 'vacio' };
  readonly duraciones = DURACIONES;

  // Formulario (nuevo y editar comparten campos)
  fClaseId = '';
  fInstructorId = '';
  fHora = '';
  fDuracion = 60;
  fCupo = 16;
  fRepite: 'semanal' | 'unica' = 'semanal';
  errorPanel = '';
  guardando = false;

  // Acciones de "solo ese día"
  accionDia: 'ninguna' | 'cancelar' | 'reemplazo' = 'ninguna';
  fReemplazoId = '';
  confirmandoDesactivar = false;

  constructor(private supabase: SupabaseService, private avisos: AvisosService) {}

  async ngOnInit() {
    this.construirSemana();
    await this.cargarOpciones();
    await this.cargar();
  }

  // ---------- Semana ----------

  private construirSemana() {
    const hoy = fechaLocal(new Date());
    const lunes = sumarDias(lunesDe(new Date()), this.semanaOffset * 7);
    this.semana = Array.from({ length: 7 }, (_, i) => {
      const d = sumarDias(lunes, i);
      const fecha = fechaLocal(d);
      return { fecha, dow: d.getDay(), corto: CORTOS[d.getDay()], numero: d.getDate(), esHoy: fecha === hoy };
    });
  }

  get tituloSemana(): string {
    const a = desdeFecha(this.semana[0].fecha);
    const b = desdeFecha(this.semana[6].fecha);
    if (a.getMonth() === b.getMonth()) return `${a.getDate()} – ${b.getDate()} de ${MESES[b.getMonth()]}`;
    return `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3)}`;
  }

  async cambiarSemana(delta: number) {
    this.semanaOffset += delta;
    this.construirSemana();
    this.panel = { modo: 'vacio' };
    await this.cargar();
  }

  async irAHoy() {
    if (this.semanaOffset === 0) return;
    this.semanaOffset = 0;
    this.construirSemana();
    await this.cargar();
  }

  // ---------- Datos ----------

  async cargarOpciones() {
    const db = this.supabase.client;
    const [{ data: clases }, { data: instructores }] = await Promise.all([
      db.from('clases').select('id, nombre').eq('activo', true).order('nombre'),
      db.from('instructores').select('id, nombre, activo').order('nombre'),
    ]);
    this.clasesOpciones = clases ?? [];
    this.instructoresOpciones = (instructores ?? []).filter((i: any) => i.activo);
    this.todosInstructores = new Map((instructores ?? []).map((i: any) => [i.id, i.nombre]));
  }

  async cargar() {
    this.loading = true;
    const db = this.supabase.client;
    const desde = this.semana[0].fecha;
    const hasta = this.semana[6].fecha;

    const [{ data: horarios }, { data: excepciones }, { data: reservas }] = await Promise.all([
      db.from('horarios')
        .select('id, clase_id, instructor_id, dia_semana, fecha_especifica, hora, capacidad, duracion_minutos, activo, clases(nombre), instructores(nombre)')
        .order('hora'),
      db.from('excepciones_horario').select('id, horario_id, fecha, tipo, instructor_reemplazo_id').gte('fecha', desde).lte('fecha', hasta),
      db.from('reservas').select('horario_id, fecha_clase').eq('estado', 'confirmada').gte('fecha_clase', desde).lte('fecha_clase', hasta),
    ]);

    this.horarios = (horarios as any) ?? [];
    this.excepciones = (excepciones as any) ?? [];
    this.reservasPorClave = new Map();
    (reservas ?? []).forEach((r: any) => {
      const k = `${r.horario_id}_${r.fecha_clase}`;
      this.reservasPorClave.set(k, (this.reservasPorClave.get(k) ?? 0) + 1);
    });

    const horas = new Set<string>();
    for (const d of this.semana) for (const o of this.ocurrenciasDe(d)) horas.add(o.hora);
    this.filas = [...horas].sort();
    this.loading = false;
  }

  ocurrenciasDe(dia: DiaSemana): Ocurrencia[] {
    return this.horarios
      .filter((h) => h.activo && (h.fecha_especifica ? h.fecha_especifica === dia.fecha : h.dia_semana === dia.dow))
      .map((h) => ({
        horario: h,
        fecha: dia.fecha,
        hora: h.hora.slice(0, 5),
        excepcion: this.excepciones.find((e) => e.horario_id === h.id && e.fecha === dia.fecha) ?? null,
        reservas: this.reservasPorClave.get(`${h.id}_${dia.fecha}`) ?? 0,
      }));
  }

  enCelda(dia: DiaSemana, hora: string): Ocurrencia[] {
    return this.ocurrenciasDe(dia).filter((o) => o.hora === hora);
  }

  get desactivados(): Horario[] {
    return this.horarios.filter((h) => !h.activo);
  }

  get leyenda(): { nombre: string; color: string }[] {
    const nombres = [...new Set(this.horarios.filter((h) => h.activo).map((h) => h.clases?.nombre).filter(Boolean))] as string[];
    return nombres.sort().map((nombre) => ({ nombre, color: colorClase(nombre) }));
  }

  // ---------- Presentación de bloques ----------

  color(o: Ocurrencia): string {
    return colorClase(o.horario.clases?.nombre);
  }

  fondo(o: Ocurrencia): string {
    return conAlpha(this.color(o), 0.12);
  }

  borde(o: Ocurrencia): string {
    if (this.estaSeleccionado(o)) return `2px solid ${this.color(o)}`;
    if (o.horario.capacidad <= 0) return '1px solid rgba(255,59,48,0.6)';
    return `1px solid ${conAlpha(this.color(o), 0.35)}`;
  }

  instructorDe(o: Ocurrencia): string {
    if (o.excepcion?.tipo === 'instructor_reemplazo') {
      return this.todosInstructores.get(o.excepcion.instructor_reemplazo_id ?? '') ?? 'Reemplazo';
    }
    return o.horario.instructores?.nombre ?? '—';
  }

  meta(o: Ocurrencia): { texto: string; color: string } {
    const h = o.horario;
    if (h.capacidad <= 0) return { texto: 'Cupo 0', color: '#FF3B30' };
    if (o.excepcion?.tipo === 'cancelada') return { texto: 'Cancelada este día', color: '#FF3B30' };
    if (o.excepcion?.tipo === 'instructor_reemplazo') return { texto: `Reemplazo · ${o.reservas}/${h.capacidad}`, color: '#FF7A1A' };
    if (h.fecha_especifica) return { texto: `Especial · ${o.reservas}/${h.capacidad}`, color: this.color(o) };
    if (o.reservas >= h.capacidad) return { texto: `Llena · ${o.reservas}/${h.capacidad}`, color: '#FF7A1A' };
    return { texto: `${o.reservas}/${h.capacidad}`, color: '#A1A1AA' };
  }

  estaSeleccionado(o: Ocurrencia): boolean {
    return this.panel.modo === 'editar' && this.panel.horarioId === o.horario.id && this.panel.fecha === o.fecha;
  }

  celdaSeleccionada(dia: DiaSemana, hora: string): boolean {
    return this.panel.modo === 'nuevo' && this.panel.fecha === dia.fecha && this.panel.hora === hora;
  }

  // ---------- Panel ----------

  get horarioEnPanel(): Horario | null {
    return this.panel.modo === 'editar' ? this.horarios.find((h) => h.id === (this.panel as any).horarioId) ?? null : null;
  }

  get excepcionEnPanel(): Excepcion | null {
    if (this.panel.modo !== 'editar') return null;
    const p = this.panel;
    return this.excepciones.find((e) => e.horario_id === p.horarioId && e.fecha === p.fecha) ?? null;
  }

  get fechaPanelLarga(): string {
    if (this.panel.modo === 'vacio') return '';
    const d = desdeFecha(this.panel.fecha);
    return `${LARGOS[d.getDay()]} ${d.getDate()} de ${MESES[d.getMonth()]}`;
  }

  get diaPanel(): string {
    if (this.panel.modo === 'vacio') return '';
    return LARGOS[desdeFecha(this.panel.fecha).getDay()];
  }

  get fechaPanelCorta(): string {
    if (this.panel.modo === 'vacio') return '';
    const d = desdeFecha(this.panel.fecha);
    return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`;
  }

  get reservasEnPanel(): number {
    if (this.panel.modo !== 'editar') return 0;
    return this.reservasPorClave.get(`${this.panel.horarioId}_${this.panel.fecha}`) ?? 0;
  }

  abrirNuevo(dia: DiaSemana, hora: string) {
    this.panel = { modo: 'nuevo', fecha: dia.fecha, hora };
    this.fClaseId = this.clasesOpciones[0]?.id ?? '';
    this.fInstructorId = this.instructoresOpciones[0]?.id ?? '';
    this.fHora = hora;
    this.fDuracion = 60;
    this.fCupo = 16;
    this.fRepite = 'semanal';
    this.resetPanel();
  }

  abrirNuevoSinHora() {
    const hoy = this.semana.find((d) => d.esHoy) ?? this.semana[0];
    this.abrirNuevo(hoy, '18:00');
  }

  abrirEditar(o: Ocurrencia) {
    const h = o.horario;
    this.panel = { modo: 'editar', horarioId: h.id, fecha: o.fecha };
    this.fInstructorId = h.instructor_id;
    this.fHora = h.hora.slice(0, 5);
    this.fDuracion = h.duracion_minutos;
    this.fCupo = h.capacidad;
    this.resetPanel();
  }

  cerrarPanel() {
    this.panel = { modo: 'vacio' };
    this.resetPanel();
  }

  private resetPanel() {
    this.errorPanel = '';
    this.accionDia = 'ninguna';
    this.fReemplazoId = '';
    this.confirmandoDesactivar = false;
  }

  cambiarFechaNuevo(fecha: string) {
    if (this.panel.modo === 'nuevo') this.panel = { ...this.panel, fecha };
  }

  cupoMas() { this.fCupo = Math.min(500, (this.fCupo || 0) + 1); }
  cupoMenos() { this.fCupo = Math.max(0, (this.fCupo || 0) - 1); }

  private validar(): string {
    if (this.panel.modo === 'nuevo' && !this.fClaseId) return 'Elige la clase.';
    if (!this.fInstructorId) return 'Elige el instructor.';
    if (!/^\d{2}:\d{2}$/.test(this.fHora)) return 'Escribe la hora (por ejemplo 18:00).';
    if (!this.fCupo || this.fCupo < 1) return 'El cupo debe ser de al menos 1 persona.';
    if (!this.fDuracion || this.fDuracion < 5) return 'La duración debe ser de al menos 5 minutos.';
    return '';
  }

  async guardarNuevo() {
    if (this.panel.modo !== 'nuevo') return;
    this.errorPanel = this.validar();
    if (this.errorPanel) return;
    const fecha = this.panel.fecha;
    const semanal = this.fRepite === 'semanal';

    this.guardando = true;
    const { error } = await this.supabase.client.from('horarios').insert({
      clase_id: this.fClaseId,
      instructor_id: this.fInstructorId,
      hora: this.fHora,
      capacidad: this.fCupo,
      duracion_minutos: this.fDuracion,
      dia_semana: semanal ? desdeFecha(fecha).getDay() : null,
      fecha_especifica: semanal ? null : fecha,
    });
    this.guardando = false;
    if (error) { this.errorPanel = 'No se pudo guardar: ' + error.message; return; }

    const nombre = this.clasesOpciones.find((c) => c.id === this.fClaseId)?.nombre ?? 'Clase';
    this.avisos.ok(semanal ? `${nombre} agregada todos los ${this.diaPanel} a las ${this.fHora}` : `${nombre} agregada el ${this.fechaPanelCorta} a las ${this.fHora}`);
    this.cerrarPanel();
    await this.cargar();
  }

  async guardarCambios() {
    const h = this.horarioEnPanel;
    if (!h) return;
    this.errorPanel = this.validar();
    if (this.errorPanel) return;
    this.guardando = true;
    const { error } = await this.supabase.client
      .from('horarios')
      .update({ instructor_id: this.fInstructorId, capacidad: this.fCupo, duracion_minutos: this.fDuracion })
      .eq('id', h.id);
    this.guardando = false;
    if (error) { this.errorPanel = 'No se pudo guardar: ' + error.message; return; }
    this.avisos.ok(`${h.clases?.nombre ?? 'Clase'} actualizada`);
    await this.cargarOpciones();
    await this.cargar();
  }

  async aplicarAccionDia() {
    const h = this.horarioEnPanel;
    if (!h || this.panel.modo !== 'editar') return;
    if (this.accionDia === 'reemplazo' && !this.fReemplazoId) { this.errorPanel = 'Elige quién da la clase ese día.'; return; }
    const fecha = this.panel.fecha;
    this.guardando = true;
    const { error } = await this.supabase.client.from('excepciones_horario').insert({
      horario_id: h.id,
      fecha,
      tipo: this.accionDia === 'cancelar' ? 'cancelada' : 'instructor_reemplazo',
      instructor_reemplazo_id: this.accionDia === 'reemplazo' ? this.fReemplazoId : null,
      motivo: null,
    });
    this.guardando = false;
    if (error) { this.errorPanel = 'No se pudo guardar: ' + error.message; return; }
    this.avisos.ok(this.accionDia === 'cancelar'
      ? `${h.clases?.nombre} cancelada el ${this.fechaPanelCorta}`
      : `${h.clases?.nombre} del ${this.fechaPanelCorta} la da ${this.todosInstructores.get(this.fReemplazoId)}`);
    this.accionDia = 'ninguna';
    await this.cargar();
  }

  async quitarExcepcion() {
    const exc = this.excepcionEnPanel;
    if (!exc) return;
    const { error } = await this.supabase.client.from('excepciones_horario').delete().eq('id', exc.id);
    if (error) { this.errorPanel = 'No se pudo quitar: ' + error.message; return; }
    this.avisos.ok('La clase vuelve a su horario normal ese día');
    await this.cargar();
  }

  async desactivar() {
    const h = this.horarioEnPanel;
    if (!h) return;
    const { error } = await this.supabase.client.from('horarios').update({ activo: false }).eq('id', h.id);
    if (error) { this.errorPanel = 'No se pudo desactivar: ' + error.message; return; }
    this.avisos.ok(`${h.clases?.nombre} desactivada. Puedes reactivarla abajo.`);
    this.cerrarPanel();
    await this.cargar();
  }

  async activar(h: Horario) {
    const { error } = await this.supabase.client.from('horarios').update({ activo: true }).eq('id', h.id);
    if (error) { this.avisos.error('No se pudo activar: ' + error.message); return; }
    this.avisos.ok(`${h.clases?.nombre} activada de nuevo`);
    await this.cargar();
  }

  descripcionHorario(h: Horario): string {
    const cuando = h.fecha_especifica
      ? (() => { const d = desdeFecha(h.fecha_especifica!); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}`; })()
      : `${LARGOS[h.dia_semana ?? 0]}`;
    return `${cuando} · ${h.hora.slice(0, 5)} · ${h.instructores?.nombre ?? '—'}`;
  }

  instructorInactivo(): boolean {
    return !!this.fInstructorId && !this.instructoresOpciones.some((i) => i.id === this.fInstructorId);
  }

  colorNombre(nombre: string | null | undefined): string {
    return colorClase(nombre);
  }
}
