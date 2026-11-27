import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AvisosService } from '../../core/avisos.service';

@Component({
  selector: 'app-avisos',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed inset-x-0 bottom-24 sm:bottom-6 z-50 flex justify-center px-4 pointer-events-none" aria-live="polite">
      <div *ngIf="avisos.actual() as a" role="status"
        class="pointer-events-auto max-w-md w-full flex items-start justify-between gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm"
        [ngClass]="a.tipo === 'ok' ? 'bg-surface-2 border-border text-text' : 'bg-[#2A1212] border-danger/50 text-red-200'">
        <span>{{ a.texto }}</span>
        <button type="button" (click)="avisos.cerrar()" aria-label="Cerrar aviso"
          class="shrink-0 w-8 h-8 -my-1 -mr-2 rounded-lg text-text-muted hover:text-text text-lg leading-none">×</button>
      </div>
    </div>
  `,
})
export class AvisosComponent {
  constructor(public avisos: AvisosService) {}
}
