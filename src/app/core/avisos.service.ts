import { Injectable, signal } from '@angular/core';

export interface Aviso {
  id: number;
  tipo: 'ok' | 'error';
  texto: string;
}

/** Avisos breves dentro de la app, en lugar de alert() del navegador. */
@Injectable({ providedIn: 'root' })
export class AvisosService {
  readonly actual = signal<Aviso | null>(null);
  private siguienteId = 1;
  private timer: ReturnType<typeof setTimeout> | null = null;

  ok(texto: string) {
    this.mostrar('ok', texto, 4000);
  }

  error(texto: string) {
    this.mostrar('error', texto, 8000);
  }

  cerrar() {
    if (this.timer) clearTimeout(this.timer);
    this.actual.set(null);
  }

  private mostrar(tipo: Aviso['tipo'], texto: string, ms: number) {
    if (this.timer) clearTimeout(this.timer);
    this.actual.set({ id: this.siguienteId++, tipo, texto });
    this.timer = setTimeout(() => this.actual.set(null), ms);
  }
}
