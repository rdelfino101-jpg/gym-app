import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { SupabaseService } from '../../core/supabase.service';
import { fechaLocal, horaLocal, sumarDias } from '../../core/fechas';

interface SolicitudPendiente {
  id: string;
  fecha_inicio: string;
  monto_aprobar: number;
  profiles: { nombre: string; apellido: string; telefono: string };
  planes_membresia: { nombre: string; precio: number };
}

interface ClaseHoy {
  hora: string;
  nombre: string;
  instructor: string;
  ocupadas: number;
  capacidad: number;
  pasada: boolean;
}

interface Kpis {
  membresiasActivas: number | null;
  nuevasMes: number | null;
  ocupacionHoy: number | null; // 0-100
  vencen7: number | null;
}

interface Aviso {
  tipo: 'ok' | 'error';
  texto: string;
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './admin-dashboard.component.html',
})
export class AdminDashboardComponent implements OnInit, OnDestroy {
  solicitudes: SolicitudPendiente[] = [];
  clasesHoy: ClaseHoy[] = [];
  kpis: Kpis = { membresiasActivas: null, nuevasMes: null, ocupacionHoy: null, vencen7: null };

  loading = true;
  loadingClases = true;
  procesando: string | null = null;
  confirmandoRechazo: string | null = null;
  aviso: Aviso | null = null;

  readonly hoyTexto = (() => {
    const t = new Intl.DateTimeFormat('es', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
    return t.charAt(0).toUpperCase() + t.slice(1);
  })();

  private avisoTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    await Promise.all([this.cargarSolicitudes(), this.cargarKpis(), this.cargarClasesHoy()]);
  }

  ngOnDestroy() {
    if (this.avisoTimer) clearTimeout(this.avisoTimer);
  }

  // ---------- Carga de datos ----------

  async cargarSolicitudes() {
    this.loading = true;
    const { data, error } = await this.supabase.client
      .from('membresias_usuario')
      .select('id, fecha_inicio, profiles(nombre, apellido, telefono), planes_membresia(nombre, precio)')
      .eq('estado', 'pendiente')
      .order('fecha_inicio', { ascending: true });

    if (!error && data) {
      this.solicitudes = (data as any).map((s: any) => ({ ...s, monto_aprobar: s.planes_membresia.precio }));
    }
    this.loading = false;
  }

  async cargarKpis() {
    const ahora = new Date();
    const hoy = fechaLocal(ahora);
    const en7 = fechaLocal(sumarDias(ahora, 7));
    const inicioMes = fechaLocal(new Date(ahora.getFullYear(), ahora.getMonth(), 1));
    const db = this.supabase.client;
    const contar = () => db.from('membresias_usuario').select('id', { count: 'exact', head: true }).eq('estado', 'activa');

    const [activas, nuevas, vencen] = await Promise.all([
      contar(),
      contar().gte('fecha_inicio', inicioMes),
      contar().gte('fecha_fin', hoy).lte('fecha_fin', en7),
    ]);

    this.kpis = {
      ...this.kpis,
      membresiasActivas: activas.error ? null : activas.count ?? 0,
      nuevasMes: nuevas.error ? null : nuevas.count ?? 0,
      vencen7: vencen.error ? null : vencen.count ?? 0,
    };
  }

  async cargarClasesHoy() {
    this.loadingClases = true;
    const ahora = new Date();
    const hoy = fechaLocal(ahora);
    const ya = horaLocal(ahora);
    const db = this.supabase.client;

    const { data: horarios } = await db
      .from('horarios')
      .select('id, dia_semana, fecha_especifica, hora, capacidad, clases(nombre), instructores(nombre)')
      .eq('activo', true)
      .or(`dia_semana.eq.${ahora.getDay()},fecha_especifica.eq.${hoy}`);

    const lista = (horarios ?? []) as any[];
    if (lista.length === 0) {
      this.clasesHoy = [];
      this.kpis = { ...this.kpis, ocupacionHoy: null };
      this.loadingClases = false;
      return;
    }

    const ids = lista.map((h) => h.id);
    const [{ data: excepciones }, { data: reservas }] = await Promise.all([
      db.from('excepciones_horario').select('horario_id, tipo').eq('fecha', hoy).in('horario_id', ids),
      db.from('reservas').select('horario_id').eq('estado', 'confirmada').eq('fecha_clase', hoy).in('horario_id', ids),
    ]);

    const conteo = new Map<string, number>();
    (reservas ?? []).forEach((r: any) => conteo.set(r.horario_id, (conteo.get(r.horario_id) ?? 0) + 1));

    this.clasesHoy = lista
      .filter((h) => !(excepciones ?? []).some((e: any) => e.horario_id === h.id && e.tipo === 'cancelada'))
      .map((h) => {
        const reemplazo = (excepciones ?? []).some((e: any) => e.horario_id === h.id && e.tipo === 'instructor_reemplazo');
        const hora = (h.hora ?? '').slice(0, 5);
        return {
          hora,
          nombre: h.clases?.nombre ?? '—',
          instructor: (h.instructores?.nombre ?? '—') + (reemplazo ? ' (reemplazo)' : ''),
          ocupadas: conteo.get(h.id) ?? 0,
          capacidad: h.capacidad ?? 0,
          pasada: hora < ya,
        };
      })
      .sort((a, b) => a.hora.localeCompare(b.hora));

    const capacidad = this.clasesHoy.reduce((s, c) => s + c.capacidad, 0);
    const ocupadas = this.clasesHoy.reduce((s, c) => s + c.ocupadas, 0);
    this.kpis = { ...this.kpis, ocupacionHoy: capacidad > 0 ? Math.round((ocupadas / capacidad) * 100) : null };
    this.loadingClases = false;
  }

  // ---------- Presentación ----------

  porcentaje(c: ClaseHoy): number {
    return c.capacidad > 0 ? Math.min(100, Math.round((c.ocupadas / c.capacidad) * 100)) : 0;
  }

  colorBarra(c: ClaseHoy): string {
    const r = c.capacidad > 0 ? c.ocupadas / c.capacidad : 0;
    if (r >= 1) return 'bg-danger';
    if (r >= 0.8) return 'bg-accent-orange';
    return 'bg-accent';
  }

  estadoClase(c: ClaseHoy): string {
    if (c.pasada) return 'Terminada';
    if (c.ocupadas >= c.capacidad) return 'Llena';
    const libres = c.capacidad - c.ocupadas;
    return libres === 1 ? '1 cupo libre' : `${libres} cupos libres`;
  }

  iniciales(sol: SolicitudPendiente): string {
    return `${sol.profiles.nombre?.[0] ?? ''}${sol.profiles.apellido?.[0] ?? ''}`.toUpperCase();
  }

  // ---------- Acciones ----------

  async aprobar(sol: SolicitudPendiente) {
    this.procesando = sol.id;
    const { error } = await this.supabase.client.rpc('aprobar_membresia', {
      p_membresia_id: sol.id,
      p_monto: sol.monto_aprobar,
    });
    this.procesando = null;
    if (error) {
      this.mostrarAviso('error', 'No se pudo aprobar: ' + error.message);
      return;
    }
    this.mostrarAviso('ok', `${sol.profiles.nombre} ${sol.profiles.apellido} aprobada · ${sol.planes_membresia.nombre}`);
    await Promise.all([this.cargarSolicitudes(), this.cargarKpis()]);
  }

  pedirConfirmacionRechazo(sol: SolicitudPendiente) {
    this.confirmandoRechazo = sol.id;
  }

  cancelarRechazo() {
    this.confirmandoRechazo = null;
  }

  async rechazar(sol: SolicitudPendiente) {
    this.confirmandoRechazo = null;
    this.procesando = sol.id;
    const { error } = await this.supabase.client.rpc('rechazar_membresia', {
      p_membresia_id: sol.id,
    });
    this.procesando = null;
    if (error) {
      this.mostrarAviso('error', 'No se pudo rechazar: ' + error.message);
      return;
    }
    this.mostrarAviso('ok', `Solicitud de ${sol.profiles.nombre} ${sol.profiles.apellido} rechazada`);
    await this.cargarSolicitudes();
  }

  cerrarAviso() {
    this.aviso = null;
  }

  private mostrarAviso(tipo: Aviso['tipo'], texto: string) {
    this.aviso = { tipo, texto };
    if (this.avisoTimer) clearTimeout(this.avisoTimer);
    if (tipo === 'ok') this.avisoTimer = setTimeout(() => (this.aviso = null), 5000);
  }
}
