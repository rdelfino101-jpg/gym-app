import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/supabase.service';

interface Instructor { id: string; nombre: string; activo: boolean; }

@Component({
  selector: 'app-instructores',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './instructores.component.html',
})
export class InstructoresComponent implements OnInit {
  instructores: Instructor[] = [];
  nuevoNombre = '';
  loading = true;
  guardando = false;

  constructor(private supabase: SupabaseService) {}

  async ngOnInit() { await this.cargar(); }

  async cargar() {
    this.loading = true;
    const { data } = await this.supabase.client
      .from('instructores')
      .select('id, nombre, activo')
      .order('nombre');
    this.instructores = data ?? [];
    this.loading = false;
  }

  async agregar() {
    if (!this.nuevoNombre.trim()) return;
    this.guardando = true;
    const { error } = await this.supabase.client
      .from('instructores')
      .insert({ nombre: this.nuevoNombre.trim() });
    this.guardando = false;
    if (error) { alert('Error: ' + error.message); return; }
    this.nuevoNombre = '';
    await this.cargar();
  }

  async toggleActivo(instr: Instructor) {
    const { error } = await this.supabase.client
      .from('instructores')
      .update({ activo: !instr.activo })
      .eq('id', instr.id);
    if (error) { alert('Error: ' + error.message); return; }
    await this.cargar();
  }
}