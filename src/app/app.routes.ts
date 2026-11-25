import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  { path: 'login', loadComponent: () => import('./auth/login/login.component').then(m => m.LoginComponent) },
  { path: 'registro', loadComponent: () => import('./auth/registro/registro.component').then(m => m.RegistroComponent) },
  {
    path: '',
    loadComponent: () => import('./shared/app-shell/app-shell.component').then(m => m.AppShellComponent),
    children: [
      {
        path: 'admin',
        canActivate: [authGuard, adminGuard],
        loadChildren: () => import('./admin/admin.routes').then(m => m.ADMIN_ROUTES),
      },
      {
        path: 'app',
        canActivate: [authGuard],
        loadChildren: () => import('./cliente/cliente.routes').then(m => m.CLIENTE_ROUTES),
      },
    ],
  },
];