import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';

interface Plan { id: string; nombre: string; tipo: string; precio: number; clases_incluidas: number | null; }

@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './registro.component.html',
})
export class RegistroComponent implements OnInit {
  paso: 1 | 2 = 1;

  nombre = ''; apellido = ''; correo = ''; telefono = '';
  password = ''; password2 = ''; planId = '';
  terms = false;
  mostrarPassword = false;

  planes: Plan[] = [];
  nombreGym = 'Gym Admin';
  cargandoPlanes = true;
  error = ''; loading = false; success = false;

  constructor(private auth: AuthService, private supabase: SupabaseService) {}

  async ngOnInit() {
    const db = this.supabase.client;
    const [{ data: planes }, { data: marca }] = await Promise.all([
      db.from('planes_membresia').select('id, nombre, tipo, precio, clases_incluidas').eq('activo', true).order('precio'),
      db.from('configuracion_marca').select('nombre_gym').limit(1).maybeSingle(),
    ]);
    this.planes = (planes as Plan[]) ?? [];
    if (marca?.nombre_gym) this.nombreGym = marca.nombre_gym;
    // Preseleccionar el plan del medio cuando hay 3 o más (suele ser el más elegido).
    if (this.planes.length) this.planId = this.planes[this.planes.length >= 3 ? 1 : 0].id;
    this.cargandoPlanes = false;
  }

  get planElegido(): Plan | undefined {
    return this.planes.find((p) => p.id === this.planId);
  }

  get inicialGym(): string {
    return (this.nombreGym.trim()[0] || 'G').toUpperCase();
  }

  descripcion(p: Plan): string {
    if (p.tipo === 'ilimitado') return 'Todas las clases que quieras';
    if (p.clases_incluidas) return p.clases_incluidas === 1 ? '1 clase' : `${p.clases_incluidas} clases`;
    return 'Pagas por clase';
  }

  precio(p: Plan): string {
    const n = Number(p.precio);
    return '$' + (Number.isInteger(n) ? n.toString() : n.toFixed(2));
  }

  continuar() {
    this.error = '';
    if (!this.planId) { this.error = 'Elige un plan para continuar.'; return; }
    this.paso = 2;
  }

  volver() {
    this.error = '';
    this.paso = 1;
  }

  async onSubmit() {
    this.error = '';
    if (!this.nombre.trim() || !this.apellido.trim()) { this.error = 'Escribe tu nombre y apellido.'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.correo.trim())) { this.error = 'Escribe un correo electrónico válido.'; return; }
    if (!this.telefono.trim()) { this.error = 'Escribe tu teléfono para que el gimnasio pueda contactarte.'; return; }
    if (this.password.length < 8) { this.error = 'La contraseña debe tener al menos 8 caracteres.'; return; }
    if (this.password !== this.password2) { this.error = 'Las contraseñas no coinciden.'; return; }
    if (!this.terms) { this.error = 'Acepta los términos y condiciones para crear tu cuenta.'; return; }
    if (!this.planId) { this.paso = 1; this.error = 'Elige un plan.'; return; }

    this.loading = true;
    const { error } = await this.auth.signUp({
      email: this.correo.trim(), password: this.password,
      nombre: this.nombre.trim(), apellido: this.apellido.trim(),
      telefono: this.telefono.trim(), planId: this.planId,
    });
    this.loading = false;

    if (error) { this.error = error.message; return; }
    this.success = true;
  }
}
