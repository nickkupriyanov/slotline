import { useMemo, useState } from 'react';
import {
  Slotline,
  createMockAdapter,
  type AvailabilityAdapter,
  type BookingSelection,
} from '@nickkupriyanov/slotline-react';

/**
 * The widget as a field of someone else's form.
 *
 * `mode="selection"` stops at the offer: no contact form, no confirmation, and the
 * adapter only has to answer availability — the surrounding checkout owns the rest
 * and decides what to do with the picked slot.
 */
export function SelectionFormExample() {
  const adapter: AvailabilityAdapter = useMemo(() => {
    const mock = createMockAdapter({ horizonDays: 60, timeZone: 'UTC', busyRatio: 0.25 });
    return {
      getAvailability: (query) => mock.getAvailability(query),
      getSlots: (query) => mock.getSlots(query),
    };
  }, []);

  const [selection, setSelection] = useState<BookingSelection>(null);
  const [reason, setReason] = useState('');
  const [requested, setRequested] = useState<string | null>(null);

  const chosen = selection?.slot ?? null;

  return (
    <section className="checkout" aria-labelledby="checkout-title">
      <h2 id="checkout-title">Inside an existing form</h2>
      <p className="checkout__hint">
        The slot is one field of a checkout: the widget never creates anything, and the button below
        belongs to the form, not to the calendar.
      </p>

      <form
        className="checkout__form"
        onSubmit={(event) => {
          event.preventDefault();
          setRequested(chosen ? `${selection?.date} · ${chosen.start}` : null);
        }}
      >
        <label className="checkout__field">
          What is it about?
          <input
            name="reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Intro call"
          />
        </label>

        <Slotline
          mode="selection"
          adapter={adapter}
          locale="en"
          timeZone="UTC"
          selection={selection}
          onSelectionChange={setSelection}
        />

        <div className="checkout__actions">
          <button type="submit" disabled={!chosen}>
            Request this slot
          </button>
          <span className="checkout__choice">
            {chosen ? `${selection?.date} · ${chosen.start}` : 'No slot picked yet'}
          </span>
        </div>
      </form>

      {requested && (
        <p className="checkout__result" role="status">
          Requested {requested}
          {reason ? ` — “${reason}”` : ''}
        </p>
      )}
    </section>
  );
}
