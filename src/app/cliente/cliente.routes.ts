import { Routes } from '@angular/router';

export const CLIENTE_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard/cliente-dashboard.component').then(m => m.ClienteDashboardComponent),
  },
];
