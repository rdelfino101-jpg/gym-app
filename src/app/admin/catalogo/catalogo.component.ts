import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { AvisosService } from '../../core/avisos.service';
import { colorClase, conAlpha, iniciales } from '../../core/colores-clase';

interface Clase { id: string; nombre: string; descripcion: string | null; activo: boolean; }
interface Instructor { id: string; nombre: string; activo: boolean; }
interface HorarioUso { clase_id: string; instructor_id: string; dia_semana: number | null; clases: { nombre: string } | null; }
interface Etiqueta { nombre: string; color: string; fondo: string; }

type Pestana = 'clases' | 'instructores';

@Component({
  selector: 'app-catalogo',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './catalogo.component.html',
})
export class CatalogoComponent implements OnInit {
  pestana: Pestana = 'clases';
  clases: Clase[] = [];
  instructores: Instructor[] = [];
  private usos: HorarioUso[] = [];
  loading = true;

  // Alta
  nuevaClaseNombre = '';
  nuevaClaseDescripcion = '';
  nuevoInstructorNombre = '';
  guardando = false;
  errorAlta = '';

  // Edición en línea
  editandoId: string | null = null;
  editNombre = '';
  editDescripcion = '';
  errorEdicion = '';

  constructor(
    private supabase: SupabaseService,
    private avisos: AvisosService,
    private route: ActivatedRoute,
    private router: Router,
  ) {}

  async ngOnInit() {
    const desdeRuta = this.route.snapshot.data['pestana'] as Pestana | undefined;
    const desdeQuery = this.route.snapshot.queryParamMap.get('pestana') as Pestana | null;
    this.pestana = desdeQuery ?? desdeRuta ?? 'clases';
    await this.cargar();
  }

  cambiarPestana(p: Pestana) {
    this.pestana = p;
    this.cancelarEdicion();
    this.errorAlta = '';
    this.router.navigate([], { queryParams: { pestana: p === 'clases' ? null : p }, replaceUrl: true });
  }

  async cargar() {
    this.loading = true;
    const db = this.supabase.client;
    const [{ data: clases }, { data: instructores }, { data: usos }] = await Promise.all([
      db.from('clases').select('id, nombre, descripcion, activo').order('nombre'),
      db.from('instructores').select('id, nombre, activo').order('nombre'),
      db.from('horarios').select('clase_id, instructor_id, dia_semana, clases(nombre)').eq('activo', true),
    ]);
    this.clases = (clases as any) ?? [];
    this.instructores = (instructores as any) ?? [];
    this.usos = (usos as any) ?? [];
    this.loading = false;
  }

  // ---------- Presentación ----------

  color(nombre: string): string {
    return colorClase(nombre);
  }

  iniciales(nombre: string): string {
    return iniciales(nombre);
  }

  usoClase(c: Clase): string {
    const n = this.usos.filter((u) => u.clase_id === c.id && u.dia_semana !== null).length;
    if (n === 0) return 'Sin horarios';
    return n === 1 ? '1 horario por semana' : `${n} horarios por semana`;
  }

  usoInstructor(i: Instructor): string {
    const n = this.usos.filter((u) => u.instructor_id === i.id && u.dia_semana !== null).length;
    if (n === 0) return 'Sin clases asignadas';
    return n === 1 ? '1 clase por semana' : `${n} clases por semana`;
  }

  clasesDeInstructor(i: Instructor): Etiqueta[] {
    const nombres = [...new Set(this.usos.filter((u) => u.instructor_id === i.id).map((u) => u.clases?.nombre).filter(Boolean))] as string[];
    return nombres.sort().map((nombre) => {
      const color = colorClase(nombre);
      return { nombre, color, fondo: conAlpha(color, 0.12) };
    });
  }

  get activasClases(): number {
    return this.clases.filter((c) => c.activo).length;
  }

  get activosInstructores(): number {
    return this.instructores.filter((i) => i.activo).length;
  }

  // ---------- Alta ----------

  async agregarClase() {
    this.errorAlta = '';
    const nombre = this.nuevaClaseNombre.trim();
    if (!nombre) { this.errorAlta = 'Escribe el nombre de la clase.'; return; }
    if (this.clases.some((c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase())) {
      this.errorAlta = `Ya existe una clase llamada ${nombre}.`;
      return;
    }
    this.guardando = true;
    const { error } = await this.supabase.client
      .from('clases')
      .insert({ nombre, descripcion: this.nuevaClaseDescripcion.trim() || null });
    this.guardando = false;
    if (error) { this.errorAlta = 'No se pudo agregar: ' + error.message; return; }
    this.nuevaClaseNombre = '';
    this.nuevaClaseDescripcion = '';
    this.avisos.ok(`${nombre} agregada`);
    await this.cargar();
  }

  async agregarInstructor() {
    this.errorAlta = '';
    const nombre = this.nuevoInstructorNombre.trim();
    if (!nombre) { this.errorAlta = 'Escribe el nombre del instructor.'; return; }
    this.guardando = true;
    const { error } = await this.supabase.client.from('instructores').insert({ nombre });
    this.guardando = false;
    if (error) { this.errorAlta = 'No se pudo agregar: ' + error.message; return; }
    this.nuevoInstructorNombre = '';
    this.avisos.ok(`${nombre} agregado`);
    await this.cargar();
  }

  // ---------- Edición ----------

  editarClase(c: Clase) {
    this.editandoId = c.id;
    this.editNombre = c.nombre;
    this.editDescripcion = c.descripcion ?? '';
    this.errorEdicion = '';
  }

  editarInstructor(i: Instructor) {
    this.editandoId = i.id;
    this.editNombre = i.nombre;
    this.errorEdicion = '';
  }

  cancelarEdicion() {
    this.editandoId = null;
    this.errorEdicion = '';
  }

  async guardarClase(c: Clase) {
    const nombre = this.editNombre.trim();
    if (!nombre) { this.errorEdicion = 'El nombre no puede quedar vacío.'; return; }
    const { error } = await this.supabase.client
      .from('clases')
      .update({ nombre, descripcion: this.editDescripcion.trim() || null })
      .eq('id', c.id);
    if (error) { this.errorEdicion = 'No se pudo guardar: ' + error.message; return; }
    this.editandoId = null;
    this.avisos.ok(`${nombre} actualizada`);
    await this.cargar();
  }

  async guardarInstructor(i: Instructor) {
    const nombre = this.editNombre.trim();
    if (!nombre) { this.errorEdicion = 'El nombre no puede quedar vacío.'; return; }
    const { error } = await this.supabase.client.from('instructores').update({ nombre }).eq('id', i.id);
    if (error) { this.errorEdicion = 'No se pudo guardar: ' + error.message; return; }
    this.editandoId = null;
    this.avisos.ok(`${nombre} actualizado`);
    await this.cargar();
  }

  // ---------- Activar / desactivar ----------

  async alternarClase(c: Clase) {
    const { error } = await this.supabase.client.from('clases').update({ activo: !c.activo }).eq('id', c.id);
    if (error) { this.avisos.error('No se pudo cambiar: ' + error.message); return; }
    c.activo = !c.activo;
    this.avisos.ok(c.activo ? `${c.nombre} activada` : `${c.nombre} desactivada: ya no aparece al crear horarios`);
  }

  async alternarInstructor(i: Instructor) {
    const { error } = await this.supabase.client.from('instructores').update({ activo: !i.activo }).eq('id', i.id);
    if (error) { this.avisos.error('No se pudo cambiar: ' + error.message); return; }
    i.activo = !i.activo;
    this.avisos.ok(i.activo ? `${i.nombre} activado` : `${i.nombre} desactivado: ya no aparece al crear horarios`);
  }
}
