import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-recuperar',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './recuperar.component.html',
})
export class RecuperarComponent {
  email = '';
  error = '';
  loading = false;
  enviado = false;

  constructor(private auth: AuthService) {}

  async onSubmit() {
    this.error = '';
    const email = this.email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.error = 'Escribe un correo electrónico válido.';
      return;
    }

    this.loading = true;
    const { error } = await this.auth.enviarEnlaceRecuperacion(email);
    this.loading = false;

    if (error) {
      const msg = (error.message || '').toLowerCase();
      if (error.status === 429 || msg.includes('rate limit') || msg.includes('security purposes')) {
        this.error = 'Ya pediste un enlace hace poco. Espera un minuto e inténtalo de nuevo.';
        return;
      }
      // Cualquier otro error: no revelamos si el correo existe o no.
    }

    // Mismo mensaje exista o no la cuenta, para no revelar qué correos están registrados.
    this.enviado = true;
  }

  volverAIntentar() {
    this.enviado = false;
    this.error = '';
  }
}
