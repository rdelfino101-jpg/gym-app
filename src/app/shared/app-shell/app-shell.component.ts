import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { SupabaseService } from '../../core/supabase.service';
import { AvisosComponent } from '../avisos/avisos.component';

interface ItemMenu {
  texto: string;
  ruta: string;
  exacto: boolean;
  icono: string; // atributo d de un path SVG (24x24, trazo)
}

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, RouterLink, RouterLinkActive, AvisosComponent],
  templateUrl: './app-shell.component.html',
})
export class AppShellComponent implements OnInit {
  nombreGym = signal('Gym Admin');
  inicialGym = computed(() => (this.nombreGym().trim()[0] || 'G').toUpperCase());
  menuAbierto = signal(false);

  readonly menuAdmin: ItemMenu[] = [
    { texto: 'Hoy', ruta: '/admin', exacto: true, icono: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z' },
    { texto: 'Horarios', ruta: '/admin/horarios', exacto: false, icono: 'M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM16 2v4M8 2v4M3 10h18' },
    { texto: 'Clases e instructores', ruta: '/admin/clases', exacto: false, icono: 'M6.5 6.5h11M6.5 17.5h11M4 9v6M20 9v6M2 11v2M22 11v2' },
  ];

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
