import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';

interface Clase { id: string; nombre: string; descripcion: string | null; activo: boolean; }

@Component({
  selector: 'app-clases',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './clases.component.html',
})
export class ClasesComponent implements OnInit {
  clases: Clase[] = [];
  nuevoNombre = '';
  nuevaDescripcion = '';
  loading = true;
  guardando = false;

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() { await this.cargar(); }

  async cargar() {
    this.loading = true;
    const { data } = await this.supabase.client
      .from('clases')
      .select('id, nombre, descripcion, activo')
      .order('nombre');
    this.clases = data ?? [];
    this.loading = false;
  }

  async agregar() {
    if (!this.nuevoNombre.trim()) return;
    this.guardando = true;
    const { error } = await this.supabase.client
      .from('clases')
      .insert({ nombre: this.nuevoNombre.trim(), descripcion: this.nuevaDescripcion.trim() || null });
    this.guardando = false;
    if (error) { alert('Error: ' + error.message); return; }
    this.nuevoNombre = ''; this.nuevaDescripcion = '';
    await this.cargar();
  }

  async toggleActivo(clase: Clase) {
    const { error } = await this.supabase.client
      .from('clases')
      .update({ activo: !clase.activo })
      .eq('id', clase.id);
    if (error) { alert('Error: ' + error.message); return; }
    await this.cargar();
  }
}