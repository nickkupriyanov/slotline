/**
 * The React binding of the booking controller.
 *
 * The hook owns nothing but the lifecycle: it creates one controller per mounted
 * widget, keeps it in step with the props, and subscribes with
 * `useSyncExternalStore`. Everything the widget shows comes from the controller's
 * snapshot, so React and Angular render the same derivation instead of each
 * formatting dates their own way.
 */
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  createBookingController,
  detectLocale,
  resolveMessages,
  resolveTimeZone,
  type BookingConfigOverrides,
  type AvailabilityAdapter,
  type BookingAdapter,
  type BookingController,
  type BookingControllerInputs,
  type BookingControllerOptions,
  type BookingRequest,
  type BookingSnapshot,
  type DefaultBookingValues,
} from '@nickkupriyanov/slotline-core';
import { observeVisibilityChange } from '@nickkupriyanov/slotline-core/dom';
import { cssAnimations } from './animations/css';
import type { SlotlineUIContextValue, UseBookingFlowResult } from './context';
import { useResolvedTheme } from './hooks/useResolvedTheme';
import type { SlotlineProps } from './types';

/** The flow's public shape, so consumers can keep importing it from the hook. */
export type { UseBookingFlowResult } from './context';

/**
 * Browser language and zone, read once and applied *after* mounting. The first
 * render — the one the server also produces — uses the deterministic fallbacks, so
 * rendering and hydration agree and the widget then switches to what the visitor
 * actually uses.
 */
let cachedBrowserDefaults: { locale: string; timeZone: string } | null = null;

function readBrowserDefaults(): { locale: string; timeZone: string } {
  cachedBrowserDefaults ??= { locale: detectLocale(), timeZone: resolveTimeZone() };
  return cachedBrowserDefaults;
}

function useBrowserDefaults(): { locale: string; timeZone: string } | null {
  const [defaults, setDefaults] = useState<{ locale: string; timeZone: string } | null>(null);

  useEffect(() => {
    setDefaults(readBrowserDefaults());
  }, []);

  return defaults;
}

type BrowserDefaults = { locale: string; timeZone: string } | null;

/**
 * Builds the controller's options for the mode the application asked for.
 *
 * The controller takes a discriminated union — a selection cannot be handed a
 * booking adapter it would never call — while the props keep one loose field, so
 * the pairing is narrowed here, where the mode is known.
 */
function optionsOf<TValues>(
  props: SlotlineProps<TValues>,
  browser: BrowserDefaults,
): BookingControllerOptions<TValues> {
  const base = {
    config: configOf(props, browser),
    inputs: inputsOf(props, browser),
    ...(props.attempt == null ? {} : { initialAttempt: props.attempt }),
  };

  return props.mode === 'selection'
    ? { mode: 'selection', adapter: adapterOf(props) as AvailabilityAdapter<TValues>, ...base }
    : { mode: 'booking', adapter: adapterOf(props) as BookingAdapter<TValues>, ...base };
}

/** The adapter the current mode needs; the controller rejects the wrong shape. */
function adapterOf<TValues>(
  props: SlotlineProps<TValues>,
): BookingAdapter<TValues> | AvailabilityAdapter<TValues> {
  return props.adapter;
}

function configOf<TValues>(
  props: SlotlineProps<TValues>,
  browser: BrowserDefaults,
): BookingConfigOverrides {
  const locale = props.locale ?? browser?.locale;
  return {
    ...(locale === undefined ? {} : { locale }),
    ...(props.messages === undefined ? {} : { messages: props.messages }),
    ...(props.weekStartsOn === undefined ? {} : { weekStartsOn: props.weekStartsOn }),
    ...(props.durations === undefined ? {} : { durationOptions: props.durations }),
    ...(props.minDate === undefined ? {} : { minDate: props.minDate }),
    ...(props.maxDate === undefined ? {} : { maxDate: props.maxDate }),
    ...(props.title === undefined ? {} : { title: props.title }),
    ...(props.context === undefined ? {} : { context: props.context }),
    ...(props.formMode === undefined ? {} : { formMode: props.formMode }),
    ...(props.fields === undefined ? {} : { fields: props.fields }),
    ...(props.timeZones === undefined ? {} : { timeZones: props.timeZones }),
    ...(props.showTimeZoneSelector === undefined
      ? {}
      : { showTimeZoneSelector: props.showTimeZoneSelector }),
    ...(props.showTimeFormatSelector === undefined
      ? {}
      : { showTimeFormatSelector: props.showTimeFormatSelector }),
    ...(props.validateValues === undefined ? {} : { validateValues: props.validateValues }),
  };
}

/**
 * A time zone or hour cycle from the props is a controlled value; without one, the
 * browser's own is handed over as the initial value — which is why the controller
 * treats a `default*` that appears for the first time as the initial value rather
 * than as a late re-initialisation.
 */
function inputsOf<TValues>(
  props: SlotlineProps<TValues>,
  browser: BrowserDefaults,
): BookingControllerInputs<TValues> {
  const inputs: BookingControllerInputs<TValues> = {};

  if (props.timeZone !== undefined) inputs.timeZone = props.timeZone;
  else {
    const timeZone = props.defaultTimeZone ?? browser?.timeZone;
    if (timeZone !== undefined) inputs.defaultTimeZone = timeZone;
  }

  if (props.duration !== undefined) inputs.duration = props.duration;
  if (props.defaultDuration !== undefined) inputs.defaultDuration = props.defaultDuration;

  if (props.timeFormat !== undefined) inputs.timeFormat = props.timeFormat;
  else if (props.defaultTimeFormat !== undefined)
    inputs.defaultTimeFormat = props.defaultTimeFormat;

  if (props.timeZone !== undefined) inputs.timeZone = props.timeZone;
  else if (props.defaultTimeZone !== undefined) inputs.defaultTimeZone = props.defaultTimeZone;

  if (props.values !== undefined) inputs.values = props.values as TValues;
  else if (props.defaultValues !== undefined) inputs.defaultValues = props.defaultValues as TValues;

  if (props.selection !== undefined) inputs.selection = props.selection;
  else if (props.defaultSelection !== undefined) inputs.defaultSelection = props.defaultSelection;

  return inputs;
}

/**
 * Creates the controller once and keeps it alive for as long as the widget is
 * mounted. Starting and stopping are the controller's own concern, so a Strict
 * Mode double mount sends nothing twice.
 */
export function useBookingController<TValues = DefaultBookingValues>(
  props: SlotlineProps<TValues>,
): BookingController<TValues> {
  const browser = useBrowserDefaults();
  const propsRef = useRef(props);
  propsRef.current = props;
  const browserRef = useRef(browser);
  browserRef.current = browser;

  const controllerRef = useRef<BookingController<TValues> | null>(null);
  if (controllerRef.current === null) {
    controllerRef.current = createBookingController<TValues>({
      ...optionsOf(props, browser),
      handlers: {
        // Every handler reads the latest props, so a re-render never leaves a
        // stale callback behind.
        onBooked: (result, request) =>
          // The flow carries the payload as plain values; the adapter's own type is
          // what the application declared for its form.
          propsRef.current.onBooked?.(result, request as unknown as BookingRequest<TValues>),
        onError: (error, context) => propsRef.current.onError?.(error, context),
        onDismiss: () => propsRef.current.onDismiss?.(),
        onDurationChange: (duration, metadata) =>
          propsRef.current.onDurationChange?.(duration, metadata),
        onTimeFormatChange: (timeFormat, metadata) =>
          propsRef.current.onTimeFormatChange?.(timeFormat, metadata),
        onContextChange: (context, metadata) =>
          propsRef.current.onContextChange?.(context, metadata),
        onSelectionChange: (selection, metadata) =>
          propsRef.current.onSelectionChange?.(selection, metadata),
        onValuesChange: (values, metadata) => propsRef.current.onValuesChange?.(values, metadata),
        onTimeZoneChange: (timeZone_, metadata) =>
          propsRef.current.onTimeZoneChange?.(timeZone_, metadata),
      },
    });
  }
  const controller = controllerRef.current;

  // Props are the source of truth on every render. The controller compares them
  // structurally, so re-supplying equal values costs nothing.
  useEffect(() => {
    controller.updateAdapter(adapterOf(propsRef.current));
    controller.updateConfig(configOf(propsRef.current, browserRef.current));
    controller.updateInputs(inputsOf(propsRef.current, browserRef.current));
  });

  useEffect(() => {
    controller.start();
    return () => controller.stop();
  }, [controller]);

  // A tab that comes back may have slept through midnight, or through the end of
  // a safe-retry window.
  useEffect(() => observeVisibilityChange(() => controller.refreshTime()), [controller]);

  return controller;
}

function useSubscribedFlow<TValues>(controller: BookingController<TValues>): UseBookingFlowResult {
  const snapshot: BookingSnapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );

  return useMemo(() => ({ snapshot, actions: controller.actions }), [snapshot, controller]);
}

/**
 * The headless widget: the whole flow, no markup.
 *
 * ```tsx
 * const { snapshot, actions } = useBookingFlow({ adapter });
 * ```
 */
export function useBookingFlow<TValues = DefaultBookingValues>(
  props: SlotlineProps<TValues>,
): UseBookingFlowResult {
  return useSubscribedFlow(useBookingController(props));
}

/** Presentation values shared by the built-in parts. */
export function useSlotlineUI<TValues = DefaultBookingValues>(
  props: SlotlineProps<TValues>,
): SlotlineUIContextValue {
  const browser = useBrowserDefaults();
  const locale = props.locale ?? browser?.locale ?? 'en';
  const messages = useMemo(() => resolveMessages(locale, props.messages), [locale, props.messages]);
  const theme = useResolvedTheme(props.theme ?? 'dark');

  return useMemo<SlotlineUIContextValue>(
    () => ({
      animations: props.animations ?? cssAnimations,
      classNames: props.classNames,
      className: props.className,
      autoFocus: props.autoFocus ?? false,
      trapFocus: props.trapFocus ?? false,
      canDismiss: Boolean(props.onDismiss),
      onCheckStatus: props.onCheckStatus,
      messages,
      locale,
      theme,
      layout: props.layout ?? 'compact',
      ...(props.components === undefined ? {} : { components: props.components }),
    }),
    [
      props.animations,
      props.classNames,
      props.className,
      props.autoFocus,
      props.trapFocus,
      props.onDismiss,
      props.onCheckStatus,
      props.components,
      props.layout,
      messages,
      locale,
      theme,
    ],
  );
}
