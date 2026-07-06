import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';

interface Plan { id: string; nombre: string; tipo: string; precio: number; clases_incluidas: number | null; }

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './registro.component.html',
})
export class RegistroComponent implements OnInit {
  nombre = ''; apellido = ''; correo = ''; telefono = '';
  password = ''; password2 = ''; planId = '';
  terms = false;
  planes: Plan[] = [];
  error = ''; loading = false; success = false;

  constructor(private auth: AuthService, private supabase: SupabaseService, private router: Router) {}

  async ngOnInit() {
    const { data } = await this.supabase.client
      .from('planes_membresia')
      .select('id, nombre, tipo, precio, clases_incluidas')
      .eq('activo', true);
    this.planes = data ?? [];
  }

  async onSubmit() {
    this.error = '';
    if (this.password !== this.password2) { this.error = 'Las contraseñas no coinciden.'; return; }
    if (this.password.length < 8) { this.error = 'La contraseña debe tener al menos 8 caracteres.'; return; }
    if (!this.terms || !this.planId) { this.error = 'Completa todos los campos y elige un plan.'; return; }

    this.loading = true;
    const { error } = await this.auth.signUp({
      email: this.correo, password: this.password,
      nombre: this.nombre, apellido: this.apellido,
      telefono: this.telefono, planId: this.planId,
    });
    this.loading = false;

    if (error) { this.error = error.message; return; }
    this.success = true;
  }
}