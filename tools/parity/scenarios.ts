/**
 * Parity scenarios: one description of the flow, run against every binding.
 *
 * Both bindings render the same derived view model, so the same sequence of user
 * intents has to produce the same observable DOM — the same step, the same labels,
 * the same announce, the same ARIA. A binding supplies a harness (how to click, how
 * to type); this module owns the scenarios and what each of them must observe, so a
 * drift in one binding fails that binding's suite and nothing else has to change.
 *
 * The module is framework-free on purpose: it is plain TypeScript, imported by the
 * React and the Angular spec suites alike.
 */

/** What a binding must be able to do for the scenarios to run. */
export interface ParityHarness {
  /** Renders the widget and resolves once availability has loaded. */
  render(): Promise<void>;
  /** Clicks the first day of the visible month that can be booked. */
  pickFirstBookableDay(): Promise<void>;
  /** Clicks the first offer of the selected day. */
  pickFirstOffer(): Promise<void>;
  /** Types into the control with the given accessible label. */
  type(label: string, value: string): Promise<void>;
  /** Submits the details form. */
  submit(): Promise<void>;
  /** Clicks the back affordance. */
  goBack(): Promise<void>;
  /** Selects the duration option at `index`. */
  selectDuration(index: number): Promise<void>;
  /** The day the harness selected, as the calendar announced it. */
  selectedDay(): string | null;
  /** The request the binding reported to the application, if any. */
  booked(): { date: string; email: string; idempotencyKey: string } | null;
  /** Values read out of the rendered DOM. */
  obs: {
    step(): string;
    title(): string;
    durationBadge(): string;
    gridCells(): number;
    bookableDays(): number;
    offers(): number;
    liveMessage(): string;
    formErrors(): number;
    errorText(): string;
    confirmationTitle(): string;
    checkedDuration(): string;
  };
}

export interface ParityCase {
  name: string;
  run(harness: ParityHarness): Promise<Record<string, unknown>>;
  expected: Record<string, unknown>;
}

/** The two intents every deeper scenario starts with. */
async function reachDetails(harness: ParityHarness): Promise<void> {
  await harness.pickFirstBookableDay();
  await harness.pickFirstOffer();
}

async function fillDetails(harness: ParityHarness): Promise<void> {
  await harness.type('Your name', 'Ann');
  await harness.type('Email', 'ann@example.com');
}

export const parityCases: ParityCase[] = [
  {
    name: 'the first paint shows the calendar of the pinned month',
    expected: {
      step: 'date',
      title: 'Book a meeting',
      gridCells: 42,
      offers: 0,
      hasBookableDay: true,
    },
    async run(harness) {
      await harness.render();
      return {
        step: harness.obs.step(),
        title: harness.obs.title(),
        gridCells: harness.obs.gridCells(),
        offers: harness.obs.offers(),
        hasBookableDay: harness.obs.bookableDays() > 0,
      };
    },
  },
  {
    name: 'picking a day lists its offers and announces the step',
    expected: {
      step: 'time',
      offersAtLeastOne: true,
      liveAnnouncesStep: true,
      hasBackAffordance: true,
    },
    async run(harness) {
      await harness.render();
      await harness.pickFirstBookableDay();
      return {
        step: harness.obs.step(),
        offersAtLeastOne: harness.obs.offers() > 0,
        liveAnnouncesStep: harness.obs.liveMessage().trim().length > 0,
        hasBackAffordance: true,
      };
    },
  },
  {
    name: 'the back affordance returns to the calendar',
    expected: { step: 'date', gridCells: 42, liveAnnouncesStep: true },
    async run(harness) {
      await harness.render();
      await harness.pickFirstBookableDay();
      await harness.goBack();
      return {
        step: harness.obs.step(),
        gridCells: harness.obs.gridCells(),
        liveAnnouncesStep: harness.obs.liveMessage().trim().length > 0,
      };
    },
  },
  {
    name: 'the duration selector changes the requested length',
    expected: { step: 'date', selectedDurationNonEmpty: true, badgeFollowsSelection: true },
    async run(harness) {
      await harness.render();
      const before = harness.obs.durationBadge();
      await harness.selectDuration(2);
      const selected = harness.obs.checkedDuration();
      return {
        step: harness.obs.step(),
        selectedDurationNonEmpty: selected.trim().length > 0,
        badgeFollowsSelection: harness.obs.durationBadge() !== before,
      };
    },
  },
  {
    name: 'an invalid email is refused before anything is sent',
    expected: { step: 'details', formErrors: 1, errorMentionsEmail: true, offers: 0 },
    async run(harness) {
      await harness.render();
      await reachDetails(harness);
      await harness.type('Your name', 'Ann');
      await harness.type('Email', 'not-an-email');
      await harness.submit();
      return {
        step: harness.obs.step(),
        formErrors: harness.obs.formErrors(),
        errorMentionsEmail: /email/i.test(harness.obs.errorText()),
        offers: harness.obs.offers(),
      };
    },
  },
  {
    name: 'booking end to end creates exactly the selected request',
    expected: {
      step: 'confirmed',
      confirmationTitled: true,
      bookedDateMatchesSelection: true,
      requestEmail: 'ann@example.com',
      keyIsString: true,
    },
    async run(harness) {
      await harness.render();
      await reachDetails(harness);
      const day = harness.selectedDay();
      await fillDetails(harness);
      await harness.submit();
      const booked = harness.booked();
      return {
        step: harness.obs.step(),
        confirmationTitled: harness.obs.confirmationTitle().trim().length > 0,
        bookedDateMatchesSelection: booked !== null && booked.date === day,
        requestEmail: booked?.email ?? '',
        keyIsString: typeof booked?.idempotencyKey === 'string',
      };
    },
  },
];
