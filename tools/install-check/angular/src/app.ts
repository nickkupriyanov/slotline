import { ChangeDetectionStrategy, Component } from '@angular/core';
import { SlotlineComponent, type BookedEvent } from '@nickkupriyanov/slotline-angular';
import { adapter } from './adapter';

@Component({
  selector: 'app-root',
  imports: [SlotlineComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <sl-slotline [adapter]="adapter" timeZone="UTC" locale="en" (booked)="onBooked($event)" />
    @if (bookedId) {
      <p [attr.data-booked]="bookedId">booked</p>
    }
  `,
})
export class App {
  readonly adapter = adapter;
  bookedId: string | null = null;

  onBooked(event: BookedEvent): void {
    this.bookedId = event.result.id;
  }
}
