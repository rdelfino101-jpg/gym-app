import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent) },
  { path: 'instructores', loadComponent: () => import('./instructores/instructores.component').then(m => m.InstructoresComponent) },
  { path: 'clases', loadComponent: () => import('./clases/clases.component').then(m => m.ClasesComponent) },
  { path: 'horarios', loadComponent: () => import('./horarios/horarios.component').then(m => m.HorariosComponent) },
];