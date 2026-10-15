import { Injectable, computed, signal, type Signal } from '@angular/core';
import {
  createBookingController,
  resolveMessages,
  type BookingAdapter,
  type BookingConfigOverrides,
  type BookingController,
  type BookingControllerActions,
  type BookingControllerInputs,
  type BookingControllerOptions,
  type BookingSnapshot,
  type BookingSelection,
  type BookingState,
  type BookingView,
  type DefaultBookingValues,
  type SlotlineMessages,
} from '@nickkupriyanov/slotline-core';
import { observeVisibilityChange } from '@nickkupriyanov/slotline-core/dom';

/**
 * The headless binding.
 *
 * One instance owns exactly one controller — the component provides it per
 * instance — and exposes the controller's snapshot as signals, so a template can
 * read the derived view without the service repeating any of its work.
 *
 * `configure()` is called with the current inputs and again whenever they change;
 * the controller compares them structurally, so re-supplying equal values costs
 * nothing and never invalidates the snapshot.
 */
@Injectable()
export class SlotlineService<TValues = DefaultBookingValues> {
  private controller: BookingController<TValues> | null = null;
  /**
   * A value written before the controller exists.
   *
   * A form control writes during its own initialisation, which happens before the
   * widget's first change detection, so the value has to be remembered and handed
   * over as the controller's initial selection.
   */
  private pendingSelection: BookingSelection | undefined;
  /**
   * Whether a form has written a selection at all.
   *
   * A form writes `null` first, and that write is what makes the flow controlled:
   * the widget then reports proposals instead of applying them, exactly as it does
   * for a `selection` input.
   */
  private selectionWritten = false;
  private unsubscribe: (() => void) | null = null;
  private stopVisibility: (() => void) | null = null;

  private readonly snapshotSignal = signal<BookingSnapshot | null>(null);
  private readonly messagesSignal = signal<SlotlineMessages>(resolveMessages(undefined));

  /** The whole widget state. `null` until `configure()` has run. */
  readonly snapshot: Signal<BookingSnapshot | null> = this.snapshotSignal.asReadonly();

  /** What to render; `null` until `configure()` has run. */
  readonly view: Signal<BookingView | null> = computed(() => this.snapshotSignal()?.view ?? null);

  /** The flow state itself, for an application that needs more than the view. */
  readonly state: Signal<BookingState | null> = computed(
    () => this.snapshotSignal()?.state ?? null,
  );

  /** The resolved dictionary of the active locale. */
  readonly messages: Signal<SlotlineMessages> = this.messagesSignal.asReadonly();

  /** Whether a controller exists yet. */
  get ready(): boolean {
    return this.controller !== null;
  }

  /**
   * The controller's actions. Reading them before `configure()` is a programming
   * error, and the template only reaches them once a view exists.
   */
  get actions(): BookingControllerActions {
    if (!this.controller) {
      throw new Error('[slotline] the service was used before configure().');
    }
    return this.controller.actions;
  }

  /** Creates the controller on the first call, and keeps it in step afterwards. */
  configure(options: BookingControllerOptions<TValues>): void {
    if (this.controller) {
      this.controller.updateAdapter(options.adapter as BookingAdapter<TValues>);
      if (options.config) this.controller.updateConfig(options.config);
      if (options.inputs) this.controller.updateInputs(options.inputs);
      this.updateCopy(options.config?.locale, options.config?.messages);
      return;
    }

    this.updateCopy(options.config?.locale, options.config?.messages);
    const controller = createBookingController<TValues>({
      ...options,
      ...(this.selectionWritten
        ? { inputs: { ...options.inputs, selection: this.pendingSelection ?? null } }
        : {}),
    });
    this.controller = controller;
    this.unsubscribe = controller.subscribe(() =>
      this.snapshotSignal.set(controller.getSnapshot()),
    );
    this.snapshotSignal.set(controller.getSnapshot());
    // A tab that comes back may have slept through a boundary the flow cares about.
    this.stopVisibility = observeVisibilityChange(() => controller.refreshTime());
  }

  /** Re-resolves the dictionary when the locale or the overrides change. */
  updateCopy(locale: string | undefined, overrides: Partial<SlotlineMessages> | undefined): void {
    const next = resolveMessages(locale, overrides);
    if (next !== this.messagesSignal()) this.messagesSignal.set(next);
  }

  /**
   * Applies a selection the application owns — what a `ControlValueAccessor`
   * writes when the form value changes. The flow becomes controlled from here on,
   * so a proposal is reported back instead of being applied.
   */
  setSelection(selection: BookingSelection | undefined): void {
    this.selectionWritten = true;
    this.pendingSelection = selection ?? null;
    this.controller?.updateInputs({ selection: this.pendingSelection });
  }

  /** Starts the controller: from here on it loads availability and keeps time. */
  start(): void {
    this.controller?.start();
  }

  /**
   * Stops the controller and releases every subscription. A creation that has
   * already been sent is not cancelled: the record may exist.
   */
  stop(): void {
    this.controller?.stop();
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.stopVisibility?.();
    this.stopVisibility = null;
  }

  /** Re-reads the clock; the component calls this when the tab becomes visible. */
  refreshTime(): void {
    this.controller?.refreshTime();
  }

  /** The time reference, for an application that renders on the server. */
  getTimeAnchor() {
    return this.controller?.getTimeAnchor();
  }
}
