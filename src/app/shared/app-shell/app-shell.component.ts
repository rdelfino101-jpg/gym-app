import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './app-shell.component.html',
})
export class AppShellComponent implements OnInit {
  nombreGym = signal('Gym Admin');

  constructor(public auth: AuthService, private supabase: SupabaseService) {}

  async ngOnInit() {
    const { data } = await this.supabase.client
      .from('configuracion_marca')
      .select('nombre_gym')
      .limit(1)
      .maybeSingle();
    if (data?.nombre_gym) this.nombreGym.set(data.nombre_gym);
  }
}