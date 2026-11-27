import { Routes } from '@angular/router';

export const ADMIN_ROUTES: Routes = [
  { path: '', loadComponent: () => import('./dashboard/admin-dashboard.component').then(m => m.AdminDashboardComponent) },
  { path: 'clases', loadComponent: () => import('./catalogo/catalogo.component').then(m => m.CatalogoComponent), data: { pestana: 'clases' } },
  // Enlace anterior: abre el mismo catálogo en la pestaña de instructores.
  { path: 'instructores', loadComponent: () => import('./catalogo/catalogo.component').then(m => m.CatalogoComponent), data: { pestana: 'instructores' } },
  { path: 'horarios', loadComponent: () => import('./horarios/horarios.component').then(m => m.HorariosComponent) },
];
