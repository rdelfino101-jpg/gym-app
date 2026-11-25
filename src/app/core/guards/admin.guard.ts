import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../auth.service';

export const adminGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  // Esperar a que la sesión y el perfil terminen de cargar: sin esto, al abrir o
  // refrescar /admin el perfil aún es null y el admin es enviado a /app.
  await auth.ready();

  if (auth.isAdmin()) return true;
  router.navigate(['/app']);
  return false;
};
