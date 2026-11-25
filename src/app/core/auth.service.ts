import { Injectable, signal } from '@angular/core';
import { SupabaseService } from './supabase.service';
import { Router } from '@angular/router';

export interface Profile {
  id: string;
  nombre: string;
  apellido: string;
  telefono: string | null;
  rol: 'cliente' | 'admin';
  estado_cuenta: 'pendiente' | 'activo' | 'suspendido';
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  profile = signal<Profile | null>(null);
  loading = signal<boolean>(true);
  private initPromise: Promise<void>;

  constructor(private supabase: SupabaseService, private router: Router) {
    this.initPromise = this.init();
  }

  async ready(): Promise<void> {
    return this.initPromise;
  }

  private async init() {
    const { data: { session } } = await this.supabase.client.auth.getSession();
    if (session) await this.loadProfile(session.user.id);
    this.loading.set(false);

    this.supabase.client.auth.onAuthStateChange(async (_event: any, session: any) => {
      if (session) {
        await this.loadProfile(session.user.id);
      } else {
        this.profile.set(null);
      }
    });
  }

  private async loadProfile(userId: string) {
    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (!error && data) this.profile.set(data as Profile);
  }

  async signUp(params: {
    email: string; password: string; nombre: string; apellido: string;
    telefono: string; planId: string;
  }) {
    const { data, error } = await this.supabase.client.auth.signUp({
      email: params.email,
      password: params.password,
      options: {
        data: {
          nombre: params.nombre,
          apellido: params.apellido,
          telefono: params.telefono,
          plan_id: params.planId,
        },
      },
    });
    return { data, error };
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    if (data.session) await this.loadProfile(data.session.user.id);
    return { data, error };
  }

  async signOut() {
    await this.supabase.client.auth.signOut();
    this.profile.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Envía el correo de recuperación. El enlace regresa a /restablecer.
   * Esa URL debe estar en Supabase › Authentication › URL Configuration › Redirect URLs.
   */
  async enviarEnlaceRecuperacion(email: string) {
    return this.supabase.client.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/restablecer`,
    });
  }

  /** Sesión actual (en /restablecer es la sesión de recuperación que crea el enlace del correo). */
  async sesionActual() {
    const { data } = await this.supabase.client.auth.getSession();
    return data.session;
  }

  async actualizarContrasena(password: string) {
    return this.supabase.client.auth.updateUser({ password });
  }

  /** Cierra la sesión sin redirigir (para mostrar una confirmación antes de ir al login). */
  async cerrarSesionSilenciosa() {
    await this.supabase.client.auth.signOut();
    this.profile.set(null);
  }

  isAdmin(): boolean {
    return this.profile()?.rol === 'admin';
  }
}