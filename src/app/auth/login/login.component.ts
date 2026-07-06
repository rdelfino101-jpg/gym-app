import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.component.html',
})
export class LoginComponent {
  email = ''; password = ''; error = ''; loading = false;

  constructor(private auth: AuthService, private router: Router) {}

  async onSubmit() {
    this.error = '';
    if (!this.email || !this.password) { this.error = 'Correo o contraseña incorrectos. Intentá de nuevo.'; return; }

    this.loading = true;
    const { data, error } = await this.auth.signIn(this.email, this.password);
    this.loading = false;

    if (error) {
      this.error = error.message.includes('Email not confirmed')
        ? 'Debes confirmar tu correo antes de ingresar. Revisa tu bandeja de entrada.'
        : 'Correo o contraseña incorrectos. Intentá de nuevo.';
      return;
    }

    this.router.navigate([this.auth.isAdmin() ? '/admin' : '/app']);
  }
}