import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';

interface SolicitudPendiente {
  id: string;
  fecha_inicio: string;
  monto_aprobar: number;
  profiles: { nombre: string; apellido: string; telefono: string };
  planes_membresia: { nombre: string; precio: number };
}

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './admin-dashboard.component.html',
})
export class AdminDashboardComponent implements OnInit {
  solicitudes: SolicitudPendiente[] = [];
  loading = true;
  procesando: string | null = null;

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() {
    await this.cargarSolicitudes();
  }

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

  async aprobar(sol: SolicitudPendiente) {
    this.procesando = sol.id;
    const { error } = await this.supabase.client.rpc('aprobar_membresia', {
      p_membresia_id: sol.id,
      p_monto: sol.monto_aprobar,
    });
    this.procesando = null;
    if (error) { alert('Error al aprobar: ' + error.message); return; }
    await this.cargarSolicitudes();
  }

  async rechazar(sol: SolicitudPendiente) {
    if (!confirm(`¿Rechazar la solicitud de ${sol.profiles.nombre} ${sol.profiles.apellido}?`)) return;
    this.procesando = sol.id;
    const { error } = await this.supabase.client.rpc('rechazar_membresia', {
      p_membresia_id: sol.id,
    });
    this.procesando = null;
    if (error) { alert('Error al rechazar: ' + error.message); return; }
    await this.cargarSolicitudes();
  }
}