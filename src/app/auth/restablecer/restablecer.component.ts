import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

type Estado = 'verificando' | 'formulario' | 'invalido' | 'listo';

const MIN_LARGO = 8;

@Component({
  selector: 'app-restablecer',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './restablecer.component.html',
})
export class RestablecerComponent implements OnInit {
  estado: Estado = 'verificando';
  password = '';
  confirmar = '';
  mostrar = false;
  error = '';
  loading = false;
  motivoInvalido = 'El enlace no es válido o ya fue usado.';
  readonly minLargo = MIN_LARGO;

  // Supabase devuelve los errores del enlace en el hash (#error_description=...)
  // o en la query (?error_description=...). Se leen antes de que el router limpie la URL.
  private readonly errorEnUrl = RestablecerComponent.leerErrorDeUrl();

  constructor(private auth: AuthService) {}

  get largoOk(): boolean {
    return this.password.length >= MIN_LARGO;
  }

  get coinciden(): boolean {
    return this.confirmar.length > 0 && this.password === this.confirmar;
  }

  async ngOnInit() {
    await this.auth.ready();

    if (this.errorEnUrl) {
      this.motivoInvalido = this.errorEnUrl.includes('expired')
        ? 'El enlace expiró. Por seguridad solo dura un tiempo limitado.'
        : 'El enlace no es válido o ya fue usado.';
      this.estado = 'invalido';
      return;
    }

    const sesion = await this.auth.sesionActual();
    this.estado = sesion ? 'formulario' : 'invalido';
  }

  async onSubmit() {
    this.error = '';
    if (!this.largoOk) {
      this.error = `La contraseña debe tener al menos ${MIN_LARGO} caracteres.`;
      return;
    }
    if (!this.coinciden) {
      this.error = 'Las contraseñas no coinciden.';
      return;
    }

    this.loading = true;
    const { error } = await this.auth.actualizarContrasena(this.password);
    this.loading = false;

    if (error) {
      const code = (error as any).code as string | undefined;
      const msg = (error.message || '').toLowerCase();
      if (code === 'same_password' || msg.includes('different from the old')) {
        this.error = 'La nueva contraseña debe ser distinta a la anterior.';
      } else if (code === 'weak_password' || msg.includes('weak') || msg.includes('at least')) {
        this.error = 'Esa contraseña es muy débil. Usa una más larga, con letras y números.';
      } else if (code === 'session_not_found' || code === 'session_expired' || msg.includes('session')) {
        this.motivoInvalido = 'Tu sesión de recuperación expiró.';
        this.estado = 'invalido';
      } else {
        this.error = 'No se pudo actualizar la contraseña. Inténtalo de nuevo.';
      }
      return;
    }

    // Se cierra la sesión de recuperación para que entre con la contraseña nueva.
    await this.auth.cerrarSesionSilenciosa();
    this.estado = 'listo';
  }

  private static leerErrorDeUrl(): string | null {
    if (typeof window === 'undefined') return null;
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const query = new URLSearchParams(window.location.search);
    const valor =
      hash.get('error_code') || hash.get('error_description') || hash.get('error') ||
      query.get('error_code') || query.get('error_description') || query.get('error');
    return valor ? valor.toLowerCase() : null;
  }
}
