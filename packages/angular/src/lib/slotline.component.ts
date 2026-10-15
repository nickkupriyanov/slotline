/**
 * The Angular binding of the booking widget.
 *
 * One standalone component renders exactly the view model the core derives —
 * identical markup, class names and ARIA to the React binding — and owns nothing
 * but presentation: lifecycle, focus and the DOM. Every label, every day and
 * every error comes from `service.view()`, so the two bindings cannot drift.
 *
 * It is zoneless-safe: reactivity is signals only, there is no `@angular/forms`
 * and no animation kit beyond the stylesheet the core ships.
 */
import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ViewEncapsulation,
  contentChildren,
  afterNextRender,
  computed,
  effect,
  Injector,
  inject,
  runInInjectionContext,
  input,
  output,
  signal,
  untracked,
  viewChild,
  type ElementRef,
  type Signal,
  type TemplateRef,
} from '@angular/core';
import {
  SLOT_CLASS,
  addDays,
  cx,
  detectLocale,
  format,
  formatTimeZoneName,
  monthKeyOf,
  resolveTimeZone,
  weekdayIndex,
  type BookingAdapter,
  type BookingAttemptView,
  type BookingConfirmationView,
  type BookingSlotView,
  type BookingContext,
  type BookingControllerInputs,
  type BookingControllerOptions,
  type BookingDayView,
  type DefaultBookingValues,
  type BookingRequest,
  type BookingSelection,
  type BookingView,
  type ClassValue,
  type ResolvedBookingField,
  type SlotlineClassSlot,
  type SlotlineMessages,
  type TimeFormat,
  type TimeSlot,
} from '@nickkupriyanov/slotline-core';
import { trapFocus } from '@nickkupriyanov/slotline-core/dom';
import { SLOTLINE_FORM_STATE } from './form-bridge';
import { SlotlinePartDirective, type SlotlinePartContexts, type SlotlinePartName } from './parts';
import { SlotlineService } from './slotline.service';
import type {
  BookedEvent,
  ContextChangeEvent,
  DurationChangeEvent,
  FailedEvent,
  SelectionChangeEvent,
  SlotlineComponentInputs,
  TimeFormatChangeEvent,
  TimeZoneChangeEvent,
} from './types';

/** How many skeletons the slots step shows while it waits. */
const SKELETON_COUNT = 9;

/** The calendar is always six weeks of seven days. */
const DAYS_PER_WEEK = 7;

/** Every event the widget emits, keyed by output name. */
export interface SlotlineOutputs {
  selectionChange: SelectionChangeEvent;
  durationChange: DurationChangeEvent;
  timeZoneChange: TimeZoneChangeEvent;
  timeFormatChange: TimeFormatChangeEvent;
  contextChange: ContextChangeEvent;
  booked: BookedEvent;
  failed: FailedEvent;
  dismiss: void;
  checkStatus: void;
}

/** Splits a flat list into rows of `size`, exactly as the calendar grid needs it. */
function chunk<T>(values: readonly T[], size: number): T[][] {
  const rows: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    rows.push(values.slice(index, index + size));
  }
  return rows;
}

/** `n` copies of an index, for the skeletons. */
function range(count: number): number[] {
  return Array.from({ length: count }, (_, index) => index);
}

/** Browser hints for the fields the widget knows by name. */
function autoCompleteOf(name: string): string | undefined {
  if (name === 'name') return 'name';
  if (name === 'email') return 'email';
  if (name === 'tel' || name === 'phone') return 'tel';
  return undefined;
}

/** The `type` attribute of a text-like control. */
function inputTypeOf(field: ResolvedBookingField): string {
  if (field.type === 'email') return 'email';
  if (field.type === 'tel') return 'tel';
  if (field.type === 'number') return 'number';
  return 'text';
}

function inputModeOf(field: ResolvedBookingField): string | undefined {
  if (field.type === 'number') return 'numeric';
  if (field.type === 'email') return 'email';
  return undefined;
}

function textValueOf(value: unknown): string {
  if (value === undefined || value === null || typeof value === 'boolean') return '';
  return String(value);
}

/** A number control hands back a string; a real number is what the form stores. */
function valueOfNumberInput(raw: string): number | string {
  if (raw.trim() === '') return raw;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? raw : parsed;
}

@Component({
  selector: 'sl-slotline',
  standalone: true,
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'closeControls()' },
  encapsulation: ViewEncapsulation.None,
  providers: [SlotlineService],
  styles: [],
  template: `
    <div
      [class]="cls('root')"
      [attr.data-sl-theme]="theme()"
      [attr.data-sl-step]="view().step"
      [attr.data-sl-layout]="layout()"
      [attr.data-sl-disabled]="unavailable() ? 'true' : null"
      [attr.aria-disabled]="unavailable() ? 'true' : null"
      [attr.lang]="resolvedLocale()"
    >
      <div [class]="cls('card')" #card>
        <header [class]="cls('header')">
          @if (part('header'); as headerTemplate) {
            <ng-container
              [ngTemplateOutlet]="part('header')"
              [ngTemplateOutletContext]="headerContext()"
            />
          } @else {
            @if (canGoBack()) {
              <button
                type="button"
                class="sl-icon-button"
                [attr.aria-label]="copy().back"
                [disabled]="view().form.submitting"
                (click)="actions.back()"
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  aria-hidden="true"
                  focusable="false"
                >
                  <path
                    d="M14.5 5.5 8 12l6.5 6.5"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.8"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              </button>
            }
            <div class="sl-header-main">
              <h2 [class]="cls('title')">{{ view().title }}</h2>
              <span [class]="cls('badge')">{{ view().duration.label }}</span>
            </div>
          }
          @if (part('progress'); as progressTemplate) {
            <ng-container
              [ngTemplateOutlet]="part('progress')"
              [ngTemplateOutletContext]="progressContext()"
            />
          } @else {
            <div
              [class]="cls('progress')"
              role="progressbar"
              aria-valuemin="1"
              [attr.aria-valuemax]="view().progress.total"
              [attr.aria-valuenow]="view().progress.current"
              [attr.aria-valuetext]="view().progress.label"
            >
              @for (step of view().progress.steps; track step; let position = $index) {
                <span
                  class="sl-progress-pill"
                  aria-hidden="true"
                  [attr.data-state]="position < view().progress.current ? 'done' : 'todo'"
                ></span>
              }
            </div>
          }
        </header>

        @if (view().timeZone.showSelector || view().timeFormat.showSelector) {
          <div class="sl-controls">
            @if (view().timeZone.showSelector) {
              <div class="sl-control">
                <button
                  type="button"
                  class="sl-control-button"
                  aria-haspopup="listbox"
                  [attr.aria-expanded]="controlsOpen()"
                  (click)="toggleControls()"
                >
                  {{ copy().timeZoneLabel }}:
                  <span class="sl-control-value">{{ view().timeZone.name }}</span>
                </button>

                @if (controlsOpen()) {
                  <div class="sl-popover" role="dialog" [attr.aria-label]="copy().timeZoneLabel">
                    <label class="sl-popover-search">
                      <span class="sl-visually-hidden">{{ copy().timeZoneSearchLabel }}</span>
                      <input
                        type="search"
                        [class]="cls('input')"
                        [attr.placeholder]="copy().timeZoneSearchPlaceholder"
                        [value]="zoneQuery()"
                        (input)="zoneQuery.set($any($event.target).value)"
                      />
                    </label>

                    @if (zoneMatches().length === 0) {
                      <p class="sl-popover-empty">{{ copy().timeZoneNoResultsDescription }}</p>
                    } @else {
                      <ul
                        class="sl-zone-list"
                        role="listbox"
                        [attr.aria-label]="copy().timeZoneSearchLabel"
                      >
                        @for (zone of zoneMatches(); track zone) {
                          <li>
                            <button
                              type="button"
                              role="option"
                              class="sl-zone-option"
                              [attr.aria-selected]="zone === view().timeZone.current"
                              [attr.data-state]="
                                zone === view().timeZone.current ? 'active' : 'idle'
                              "
                              (click)="actions.setTimeZone(zone); closeControls()"
                            >
                              <span>{{ zoneName(zone) }}</span>
                              <span class="sl-zone-id">{{ zone }}</span>
                            </button>
                          </li>
                        }
                      </ul>
                    }
                  </div>
                }
              </div>
            }

            @if (view().timeFormat.showSelector) {
              <div
                class="sl-segmented"
                role="radiogroup"
                [attr.aria-label]="copy().timeFormatLabel"
              >
                @for (format of formats; track format) {
                  <button
                    type="button"
                    role="radio"
                    class="sl-segmented-option"
                    [attr.aria-checked]="format === view().timeFormat.current"
                    [attr.data-state]="format === view().timeFormat.current ? 'active' : 'idle'"
                    (click)="actions.setTimeFormat(format)"
                  >
                    {{ formatLabel(format) }}
                  </button>
                }
              </div>
            }
          </div>
        }

        <div
          [class]="cls('panel')"
          #panel
          tabindex="-1"
          role="region"
          [attr.aria-label]="view().panelLabel"
        >
          @switch (view().step) {
            @case ('time') {
              <!-- Step 2 — the offers of the selected day, and in the adaptive layout
                   the calendar beside them. The container decides the columns. -->
              <div class="sl-adaptive-pair">
                @if (layout() === 'adaptive') {
                  <ng-container [ngTemplateOutlet]="calendar" />
                }
                <div class="sl-adaptive-offers">
                  <div class="sl-slots-step">
                <div [class]="cls('slotsHeader')">
                  <span class="sl-slots-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      width="20"
                      height="20"
                      aria-hidden="true"
                      focusable="false"
                    >
                      <rect
                        x="3.5"
                        y="5"
                        width="17"
                        height="15.5"
                        rx="3.5"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                      />
                      <path
                        d="M3.5 9.5h17M8 3.5v3M16 3.5v3"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="1.7"
                        stroke-linecap="round"
                      />
                    </svg>
                  </span>
                  <h3 class="sl-slots-title">{{ view().time.dateLabel }}</h3>
                  @if (view().slots.countLabel) {
                    <span [class]="cls('slotsCount')">{{ view().slots.countLabel }}</span>
                  }
                </div>

                @if (view().slots.loading) {
                  @if (part('loading'); as loadingTemplate) {
                    <ng-container
                      [ngTemplateOutlet]="part('loading')"
                      [ngTemplateOutletContext]="loadingContext()"
                    />
                  } @else {
                    <div [class]="cls('slots')" aria-hidden="true">
                      @for (index of skeletons; track index) {
                        <div [class]="cls('skeleton')" [style.--sl-index]="index"></div>
                      }
                    </div>
                  }
                }

                @if (view().slots.error; as slotsError) {
                  @if (part('error'); as errorTemplate) {
                    <ng-container
                      [ngTemplateOutlet]="part('error')"
                      [ngTemplateOutletContext]="
                        errorContext(slotsError, () => actions.reloadSlots())
                      "
                    />
                  } @else {
                    <div [class]="cls('error')" role="alert">
                      <span>{{ slotsError }}</span>
                      <button type="button" class="sl-link-button" (click)="actions.reloadSlots()">
                        {{ copy().retry }}
                      </button>
                    </div>
                  }
                }

                @if (view().slots.empty) {
                  @if (part('empty'); as emptyTemplate) {
                    <ng-container
                      [ngTemplateOutlet]="part('empty')"
                      [ngTemplateOutletContext]="emptyContext()"
                    />
                  } @else {
                    <div [class]="cls('empty')">
                      <p class="sl-empty-title">{{ copy().noSlotsTitle }}</p>
                      <p class="sl-empty-body">{{ copy().noSlotsBody }}</p>
                      <button
                        type="button"
                        [class]="cls('secondaryButton')"
                        (click)="actions.back()"
                      >
                        {{ copy().pickAnotherDay }}
                      </button>
                    </div>
                  }
                }

                @if (view().slots.status === 'ready' && view().slots.count > 0) {
                  <div [class]="cls('slots')" role="group" [attr.aria-label]="view().slots.label">
                    @for (slot of view().slots.items; track slot.id; let index = $index) {
                      @if (part('slot'); as slotTemplate) {
                        <ng-container
                          [ngTemplateOutlet]="slotTemplate"
                          [ngTemplateOutletContext]="slotContext(slot, index)"
                        />
                      } @else {
                        <button
                          type="button"
                          [class]="cls('slot', slot.selected && 'is-selected')"
                          [attr.aria-current]="slot.selected ? 'true' : null"
                          [attr.aria-label]="
                            slot.utcOffsetLabel ? slot.label + ' ' + slot.utcOffsetLabel : null
                          "
                          (click)="onSlotSelect(slot)"
                        >
                          {{ slot.label }}
                        </button>
                      }
                    }
                  </div>
                }
                  </div>
                </div>
              </div>
            }

            @case ('details') {
              <!-- Step 3 — recap of the selection plus the configured fields. -->
              <div class="sl-details-step">
                @if (part('summary'); as summaryTemplate) {
                  <ng-container
                    [ngTemplateOutlet]="part('summary')"
                    [ngTemplateOutletContext]="summaryContext()"
                  />
                } @else {
                  <div [class]="cls('summary')">
                    <span class="sl-summary-icon" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        width="20"
                        height="20"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <rect
                          x="3.5"
                          y="5"
                          width="17"
                          height="15.5"
                          rx="3.5"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.7"
                        />
                        <path
                          d="M3.5 9.5h17M8 3.5v3M16 3.5v3"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.7"
                          stroke-linecap="round"
                        />
                      </svg>
                    </span>
                    <div class="sl-summary-body">
                      <p class="sl-summary-date">{{ view().time.dateLabel }}</p>
                      <p class="sl-summary-meta">
                        <svg
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="8.5"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.7"
                          />
                          <path
                            d="M12 7.5V12l3 2"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.7"
                            stroke-linecap="round"
                          />
                        </svg>
                        <span>{{ view().time.label }} · {{ view().duration.label }}</span>
                      </p>
                    </div>
                  </div>
                }

                @if (part('form'); as formTemplate) {
                  <ng-container
                    [ngTemplateOutlet]="part('form')"
                    [ngTemplateOutletContext]="formContext()"
                  />
                } @else {
                  <form [class]="cls('form')" noValidate (submit)="onSubmit($event)">
                    @for (field of view().form.fields; track field.name; let index = $index) {
                      <div
                        [class]="cls('field')"
                        [attr.data-invalid]="fieldError(field) ? 'true' : null"
                      >
                        @if (field.type === 'textarea') {
                          <textarea
                            [id]="fieldId(index)"
                            [name]="field.name"
                            [class]="cls('input')"
                            [attr.aria-label]="field.label"
                            [attr.aria-invalid]="fieldError(field) ? true : null"
                            [attr.aria-describedby]="describedBy(field, index)"
                            [attr.placeholder]="field.placeholder ?? field.label"
                            [value]="textOf(view().form.values[field.name])"
                            [disabled]="view().form.submitting"
                            (input)="onFieldInput(field.name, $event)"
                            (blur)="actions.touchField(field.name)"
                          ></textarea>
                        } @else if (field.type === 'select') {
                          <select
                            [id]="fieldId(index)"
                            [name]="field.name"
                            [class]="cls('input')"
                            [attr.aria-label]="field.label"
                            [attr.aria-invalid]="fieldError(field) ? true : null"
                            [attr.aria-describedby]="describedBy(field, index)"
                            [value]="textOf(view().form.values[field.name])"
                            [disabled]="view().form.submitting"
                            (change)="onFieldInput(field.name, $event)"
                            (blur)="actions.touchField(field.name)"
                          >
                            <option value="">{{ field.placeholder ?? '' }}</option>
                            @for (option of field.options ?? []; track option.value) {
                              <option [value]="option.value">{{ option.label }}</option>
                            }
                          </select>
                        } @else if (field.type === 'checkbox') {
                          <label class="sl-checkbox">
                            <input
                              [id]="fieldId(index)"
                              [name]="field.name"
                              type="checkbox"
                              [attr.aria-label]="field.label"
                              [attr.aria-invalid]="fieldError(field) ? true : null"
                              [attr.aria-describedby]="describedBy(field, index)"
                              [checked]="view().form.values[field.name] === true"
                              [disabled]="view().form.submitting"
                              (change)="onFieldCheck(field.name, $event)"
                              (blur)="actions.touchField(field.name)"
                            />
                            <span>{{ field.label }}</span>
                          </label>
                        } @else {
                          <input
                            [id]="fieldId(index)"
                            [name]="field.name"
                            [class]="cls('input')"
                            [type]="inputTypeOf(field)"
                            [attr.inputmode]="inputModeOf(field)"
                            [attr.autocomplete]="autoCompleteOf(field.name)"
                            [attr.aria-label]="field.label"
                            [attr.aria-invalid]="fieldError(field) ? true : null"
                            [attr.aria-describedby]="describedBy(field, index)"
                            [attr.placeholder]="field.placeholder ?? field.label"
                            [value]="textOf(view().form.values[field.name])"
                            [disabled]="view().form.submitting"
                            (input)="onFieldInput(field.name, $event)"
                            (blur)="actions.touchField(field.name)"
                          />
                        }

                        @if (field.hint && !fieldError(field)) {
                          <p class="sl-field-hint" [id]="hintId(index)">{{ field.hint }}</p>
                        }

                        @if (fieldError(field); as error) {
                          <p class="sl-field-error" [id]="errorId(index)" role="alert">
                            {{ error }}
                          </p>
                        }
                      </div>
                    }

                    @if (view().form.formError; as formError) {
                      @if (part('error'); as errorTemplate) {
                        <ng-container
                          [ngTemplateOutlet]="part('error')"
                          [ngTemplateOutletContext]="errorContext(formError)"
                        />
                      } @else {
                        <div [class]="cls('error')" role="alert">
                          <span>{{ formError }}</span>
                        </div>
                      }
                    }

                    @if (view().form.submitError; as submitError) {
                      @if (part('error'); as errorTemplate) {
                        <ng-container
                          [ngTemplateOutlet]="part('error')"
                          [ngTemplateOutletContext]="
                            errorContext(submitError, () => actions.submit())
                          "
                        />
                      } @else {
                        <div [class]="cls('error')" role="alert">
                          <span>{{ submitError }}</span>
                          <button type="button" class="sl-link-button" (click)="actions.submit()">
                            {{ copy().retry }}
                          </button>
                        </div>
                      }
                    }

                    <button
                      type="submit"
                      [class]="cls('submit')"
                      [disabled]="view().form.submitting"
                      [attr.data-loading]="view().form.submitting ? 'true' : null"
                    >
                      @if (view().form.submitting) {
                        <svg
                          class="sl-spinner"
                          viewBox="0 0 24 24"
                          width="16"
                          height="16"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <circle
                            cx="12"
                            cy="12"
                            r="8"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-dasharray="34 14"
                          />
                        </svg>
                      } @else {
                        <svg
                          class="sl-submit-arrow"
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M4 12h15m0 0-6-6m6 6-6 6"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      }
                      <span>{{ view().form.submitLabel }}</span>
                    </button>
                  </form>
                }
              </div>
            }

            @case ('attempt') {
              <!-- The service screen: the request has left, the flow is blocked. -->
              @if (view().attempt; as attempt) {
                @if (part('attempt'); as attemptTemplate) {
                  <ng-container
                    [ngTemplateOutlet]="part('attempt')"
                    [ngTemplateOutletContext]="attemptContext(attempt)"
                  />
                } @else {
                  <div [class]="cls('empty')" [attr.data-attempt]="attempt.status">
                    <p class="sl-empty-title">{{ attempt.title }}</p>
                    <p class="sl-empty-body">{{ attempt.description }}</p>
                    @if (attempt.instructions; as instructions) {
                      <p class="sl-empty-body">{{ instructions }}</p>
                    }

                    <div [class]="cls('summary')" [attr.aria-label]="attempt.summaryLabel">
                      <div class="sl-summary-body">
                        <p class="sl-summary-date">{{ attempt.summary.dateLabel }}</p>
                        <p class="sl-summary-meta">
                          <span>
                            {{ attempt.summary.timeLabel }} · {{ attempt.summary.durationLabel }}
                          </span>
                        </p>
                      </div>
                    </div>

                    @for (value of attempt.summary.values; track value.name) {
                      @if (value.checked !== undefined) {
                        <p class="sl-summary-value">
                          <span class="sl-summary-value-label">{{ value.label }}</span>
                          <span class="sl-summary-value-text">
                            {{ value.checked ? '✓' : '—' }}
                          </span>
                        </p>
                      } @else if (value.value) {
                        <p class="sl-summary-value">
                          <span class="sl-summary-value-label">{{ value.label }}</span>
                          <span class="sl-summary-value-text">{{ value.value }}</span>
                        </p>
                      }
                    }

                    <p class="sl-empty-body">{{ attempt.retryDescription }}</p>

                    @if (view().actions.canRetry) {
                      <button type="button" [class]="cls('submit')" (click)="actions.retry()">
                        {{ attempt.retryLabel }}
                      </button>
                    }

                    @if (view().attempt?.canCheckStatus) {
                      <button
                        type="button"
                        [class]="cls('secondaryButton')"
                        (click)="checkStatus.emit()"
                      >
                        {{ attempt.checkStatusLabel }}
                      </button>
                    }

                    <!-- The visible copy stays in the dictionary; nothing renders raw markup. -->
                    <span class="sl-visually-hidden">{{ copy().attemptSummaryLabel }}</span>
                  </div>
                }
              }
            }

            @case ('confirmed') {
              @if (view().confirmation; as confirmation) {
                @if (part('confirmation'); as confirmationTemplate) {
                  <ng-container
                    [ngTemplateOutlet]="part('confirmation')"
                    [ngTemplateOutletContext]="confirmationContext(confirmation)"
                  />
                } @else {
                  <div [class]="cls('confirmation')">
                    <span [class]="cls('confirmationIcon')" aria-hidden="true">
                      <svg
                        viewBox="0 0 24 24"
                        width="26"
                        height="26"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path
                          class="sl-check-path"
                          d="M5 12.5 10 17.5 19 7"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2.1"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        />
                      </svg>
                    </span>
                    <h3 [class]="cls('confirmationTitle')">{{ confirmation.title }}</h3>
                    <div [class]="cls('confirmationText')">
                      <p>{{ confirmation.summary }}</p>
                      @if (confirmation.invitation; as invitation) {
                        <p>{{ invitation }}</p>
                      }
                    </div>
                    @if (confirmation.location; as location) {
                      <p class="sl-confirmation-place">
                        <span class="sl-confirmation-place-label">
                          {{ copy().confirmationLocationLabel }}
                        </span>
                        <span>{{ location }}</span>
                      </p>
                    }

                    @if (confirmation.instructions; as instructions) {
                      <p class="sl-confirmation-instructions">{{ instructions }}</p>
                    }

                    @if (
                      confirmation.joinUrl ||
                      confirmation.calendarUrl ||
                      confirmation.rescheduleUrl ||
                      confirmation.cancelUrl
                    ) {
                      <div class="sl-confirmation-actions">
                        @if (confirmation.joinUrl; as joinUrl) {
                          <a
                            [class]="cls('submit')"
                            [href]="joinUrl"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {{ copy().confirmationJoinLabel }}
                          </a>
                        }
                        @if (confirmation.calendarUrl; as calendarUrl) {
                          <a
                            [class]="cls('secondaryButton')"
                            [href]="calendarUrl"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {{ copy().confirmationAddToCalendarLabel }}
                          </a>
                        }
                        @if (confirmation.rescheduleUrl; as rescheduleUrl) {
                          <a
                            [class]="cls('secondaryButton')"
                            [href]="rescheduleUrl"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {{ copy().confirmationRescheduleLabel }}
                          </a>
                        }
                        @if (confirmation.cancelUrl; as cancelUrl) {
                          <a
                            [class]="cls('secondaryButton')"
                            [href]="cancelUrl"
                            target="_blank"
                            rel="noreferrer noopener"
                          >
                            {{ copy().confirmationCancelLabel }}
                          </a>
                        }
                      </div>
                    }

                    <button
                      type="button"
                      [class]="cls('secondaryButton')"
                      (click)="actions.reset()"
                    >
                      {{ confirmation.bookAnotherLabel }}
                    </button>
                  </div>
                }
              }
            }

            @default {
              <ng-container [ngTemplateOutlet]="calendar" />
            }
          }

          <!--
            The month grid, in one place: the date step renders it, and so does the
            adaptive layout beside the offers.
          -->
          <ng-template #calendar>
  <div [class]="cls('calendar')" [attr.data-status]="view().month.status">
                  <div [class]="cls('calendarHeader')">
                    <h3 [class]="cls('monthLabel')">{{ view().month.label }}</h3>
                    <div class="sl-calendar-nav">
                      <button
                        type="button"
                        [class]="cls('navButton')"
                        [attr.aria-label]="copy().previousMonth"
                        (click)="actions.previousMonth()"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M14.5 5.5 8 12l6.5 6.5"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </button>
                      <button
                        type="button"
                        [class]="cls('navButton')"
                        [attr.aria-label]="copy().nextMonth"
                        (click)="actions.nextMonth()"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          width="18"
                          height="18"
                          aria-hidden="true"
                          focusable="false"
                        >
                          <path
                            d="M9.5 5.5 16 12l-6.5 6.5"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="1.8"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
  
                  <div [class]="cls('weekdays')">
                    @for (label of view().month.weekdayHeaders; track $index; let position = $index) {
                      <span [class]="cls('weekday')">
                        <span aria-hidden="true">{{ label }}</span>
                        <span class="sl-visually-hidden">
                          {{ view().month.weekdayLongNames[position] }}
                        </span>
                      </span>
                    }
                  </div>
  
                  @if (view().month.error; as monthError) {
                    @if (part('error'); as errorTemplate) {
                      <ng-container
                        [ngTemplateOutlet]="part('error')"
                        [ngTemplateOutletContext]="
                          errorContext(monthError, () => actions.reloadAvailability())
                        "
                      />
                    } @else {
                      <div [class]="cls('error')" role="alert">
                        <span>{{ monthError }}</span>
                        <button
                          type="button"
                          class="sl-link-button"
                          (click)="actions.reloadAvailability()"
                        >
                          {{ copy().retry }}
                        </button>
                      </div>
                    }
                  }
  
                  <div
                    [class]="cls('grid')"
                    role="grid"
                    [attr.aria-label]="copy().calendarLabel"
                    [attr.aria-busy]="view().month.status === 'loading'"
                    (keydown)="onGridKeydown($event)"
                  >
                    @for (row of rows(); track row[0]; let rowIndex = $index) {
                      <div class="sl-grid-row" role="row">
                        @for (day of row; track day; let cellIndex = $index) {
                          <button
                            type="button"
                            role="gridcell"
                            [attr.data-day]="day"
                            [tabindex]="day === focusTarget() ? 0 : -1"
                            [attr.aria-selected]="dayCell(day)?.isSelected || null"
                            [attr.aria-disabled]="dayCell(day)?.bookable ? null : true"
                            [attr.aria-current]="dayCell(day)?.isToday ? 'date' : null"
                            [attr.aria-label]="dayCell(day)?.label"
                            [class]="
                              cls(
                                'day',
                                dayCell(day)?.isOutside && 'is-outside',
                                dayCell(day)?.isSelected && 'is-selected',
                                dayCell(day)?.bookable && 'is-bookable'
                              )
                            "
                            [style.--sl-index]="rowIndex * 7 + cellIndex"
                            (click)="onDayClick(day)"
                          >
                            @if (part('dayContent'); as dayTemplate) {
                              <ng-container
                                [ngTemplateOutlet]="dayTemplate"
                                [ngTemplateOutletContext]="dayContentContext(day)"
                              />
                            } @else {
                              <span class="sl-day-number">{{ dayNumber(day) }}</span>
                              <span
                                [class]="cls('dayDot')"
                                aria-hidden="true"
                                [attr.data-visible]="dayCell(day)?.bookable ? true : null"
                              ></span>
                            }
                          </button>
                        }
                      </div>
                    }
                  </div>
  
                  <p class="sl-timezone">{{ view().time.zoneHint }}</p>
                </div>
          </ng-template>
          <div class="sl-visually-hidden" role="status" aria-live="polite">
            {{ view().live.message }}
          </div>
        </div>

        @if (view().step === 'date' && view().duration.showSelector) {
          @if (part('durationFooter'); as durationTemplate) {
            <ng-container
              [ngTemplateOutlet]="part('durationFooter')"
              [ngTemplateOutletContext]="durationContext()"
            />
          } @else {
            <footer [class]="cls('footer')">
              <!-- The group carries the accessible name, so the visible caption is decorative. -->
              <span class="sl-duration-label" aria-hidden="true">{{ copy().durationLabel }}</span>
              <div
                class="sl-duration-group"
                role="radiogroup"
                [attr.aria-label]="copy().durationGroupLabel"
              >
                @for (minutes of view().duration.options; track minutes) {
                  <button
                    type="button"
                    role="radio"
                    class="sl-duration-pill"
                    [attr.aria-checked]="minutes === view().duration.current"
                    [attr.aria-label]="durationLabel(minutes)"
                    [attr.data-state]="minutes === view().duration.current ? 'active' : 'idle'"
                    (click)="actions.setDuration(minutes)"
                  >
                    {{ durationLabel(minutes) }}
                  </button>
                }
              </div>
            </footer>
          }
        }
      </div>
    </div>
  `,
})
export class SlotlineComponent {
  /* ------------------------------------------------------------------------ */
  /*  Inputs                                                                  */
  /* ------------------------------------------------------------------------ */

  /**
   * Availability and booking persistence.
   *
   * The flow carries the payload as plain values, so the component narrows the
   * application's own payload to the built-in shape at this one boundary rather
   * than making every consumer coerce it.
   */
  readonly adapter = input.required<SlotlineComponentInputs['adapter']>();
  /** `selection` stops at the offer and never creates anything. */
  readonly mode = input<SlotlineComponentInputs['mode']>('booking');
  /** `skip` keeps only the resume and a confirmation; the application owns the values. */
  readonly formMode = input<SlotlineComponentInputs['formMode']>(undefined);
  /** Controlled selection: the offer the application owns. */
  readonly selection = input<SlotlineComponentInputs['selection']>(undefined);
  /** Uncontrolled initial selection, verified before it can be used. */
  readonly defaultSelection = input<SlotlineComponentInputs['defaultSelection']>(undefined);
  /** Renders the widget as unavailable; a form drives its own state through `/forms`. */
  readonly disabled = input(false);
  /**
   * `compact` (default) keeps the card at `--sl-width`; `adaptive` uses
   * `--sl-width-adaptive` and lets container queries re-compose the content.
   */
  readonly layout = input<'compact' | 'adaptive'>('compact');
  /** The zones the built-in selector offers, in this order. */
  readonly timeZones = input<SlotlineComponentInputs['timeZones']>(undefined);
  /** Whether the built-in time zone selector is offered. Default: `false`. */
  readonly showTimeZoneSelector = input(false);
  /** Whether the built-in 12/24 switch is offered. Default: `false`. */
  readonly showTimeFormatSelector = input(false);

  /* -- the built-in controls ------------------------------------------------ */

  protected readonly controlsOpen = signal(false);
  protected readonly zoneQuery = signal('');

  /** The zones matching what was typed, capped so a long list stays cheap. */
  protected readonly zoneMatches = computed(() => {
    const needle = this.zoneQuery().trim().toLowerCase();
    const zones = needle
      ? this.view().timeZone.options.filter((zone) => zone.toLowerCase().includes(needle))
      : this.view().timeZone.options;
    return zones.slice(0, 60);
  });

  protected readonly formats: TimeFormat[] = ['12h', '24h'];

  protected formatLabel(format: TimeFormat): string {
    return format === '12h' ? this.copy().timeFormat12HourLabel : this.copy().timeFormat24HourLabel;
  }

  /** A readable name for a zone, as the zone selector shows it. */
  protected zoneName(zone: string): string {
    return formatTimeZoneName(zone, this.resolvedLocale(), new Date()) ?? zone;
  }

  protected toggleControls(): void {
    this.zoneQuery.set('');
    this.controlsOpen.update((open) => !open);
  }

  protected closeControls(): void {
    this.controlsOpen.set(false);
  }
  /** The built-in form's fields, in display order. */
  readonly fields = input<SlotlineComponentInputs['fields']>(undefined);
  /** Controlled form values. */
  readonly values = input<SlotlineComponentInputs['values']>(undefined);
  /** Initial form values, applied when the scenario is created. */
  readonly defaultValues = input<SlotlineComponentInputs['defaultValues']>(undefined);
  /** The application's own validation, on top of the field rules. */
  readonly validateValues = input<SlotlineComponentInputs['validateValues']>(undefined);

  /**
   * Present when a form owns this widget: `/forms` provides it on the same element.
   * The value arrives before the controller exists, which is what makes the flow
   * controlled from its first state.
   */
  private readonly formState = inject(SLOTLINE_FORM_STATE, { optional: true });

  /** The widget is unavailable when the input or the form says so. */
  protected readonly unavailable = computed(
    () => this.disabled() || this.formState?.disabled() === true,
  );
  /** Duration options in minutes. */
  readonly durations = input<number[] | undefined>(undefined);
  /** Controlled duration, in minutes. */
  readonly duration = input<number | undefined>(undefined);
  /** Uncontrolled initial duration. */
  readonly defaultDuration = input<number | undefined>(undefined);
  /** IANA zone used for every date and time rendered. */
  readonly timeZone = input<string | undefined>(undefined);
  /** Uncontrolled initial zone: the browser's own until told otherwise. */
  readonly defaultTimeZone = input<string | undefined>(undefined);
  /** Built-in locale or any tag `Intl` understands. */
  readonly locale = input<string | undefined>(undefined);
  /** Per-string overrides merged on top of the locale defaults. */
  readonly messages = input<Partial<SlotlineMessages> | undefined>(undefined);
  readonly theme = input<SlotlineComponentInputs['theme']>('dark');
  readonly title = input<string | undefined>(undefined);
  readonly minDate = input<string | Date | undefined>(undefined);
  readonly maxDate = input<string | Date | undefined>(undefined);
  readonly weekStartsOn = input<0 | 1 | undefined>(undefined);
  readonly timeFormat = input<TimeFormat | undefined>(undefined);
  readonly defaultTimeFormat = input<TimeFormat | undefined>(undefined);
  readonly context = input<BookingContext | undefined>(undefined);
  /** Per-part class overrides; the base names come from the core stylesheet. */
  readonly classNames = input<Partial<Record<SlotlineClassSlot, string>> | undefined>(undefined);
  /** An attempt restored after a reload: the widget opens on its screen. */
  readonly attempt = input<SlotlineComponentInputs['attempt'] | null>(null);
  /** Move focus into the widget once it is rendered. */
  readonly autoFocus = input(false);
  /** Keep `Tab` inside the card and let `Escape` go back. */
  readonly trapFocus = input(false);

  /* ------------------------------------------------------------------------ */
  /*  Outputs                                                                 */
  /* ------------------------------------------------------------------------ */

  readonly selectionChange = output<SelectionChangeEvent>();
  readonly durationChange = output<DurationChangeEvent>();
  readonly timeZoneChange = output<TimeZoneChangeEvent>();
  readonly timeFormatChange = output<TimeFormatChangeEvent>();
  readonly contextChange = output<ContextChangeEvent>();
  readonly booked = output<BookedEvent>();
  readonly failed = output<FailedEvent>();
  readonly dismiss = output<void>();
  readonly checkStatus = output<void>();

  /* ------------------------------------------------------------------------ */
  /*  The flow                                                                */
  /* ------------------------------------------------------------------------ */

  /**
   * The templates the application supplied, keyed by the part they replace.
   *
   * `ng-template` children are never rendered on their own: the library renders one
   * only where that part would have been.
   */
  private readonly partDirectives = contentChildren(SlotlinePartDirective);
  private readonly partMap = computed(() => {
    const map = new Map<SlotlinePartName, TemplateRef<unknown>>();
    for (const directive of this.partDirectives()) map.set(directive.part(), directive.template);
    return map;
  });

  /** The replacement for a part, or `null` when the application kept the default. */
  protected part(name: SlotlinePartName): TemplateRef<unknown> | null {
    return this.partMap().get(name) ?? null;
  }

  /* -- part contexts: the equivalent of the React part props ----------------- */

  protected headerContext(): SlotlinePartContexts['header'] {
    const view = this.view();
    return {
      $implicit: {
        title: view.title,
        durationLabel: view.duration.label,
        back: this.canGoBack()
          ? {
              label: this.copy().back,
              disabled: view.form.submitting,
            }
          : null,
      },
    };
  }

  protected progressContext(): SlotlinePartContexts['progress'] {
    return { $implicit: this.view().progress };
  }

  protected summaryContext(): SlotlinePartContexts['summary'] {
    return { $implicit: this.view() };
  }

  protected loadingContext(): SlotlinePartContexts['loading'] {
    return { $implicit: { count: this.skeletons.length } };
  }

  protected errorContext(message: string, retry?: () => void): SlotlinePartContexts['error'] {
    return {
      $implicit: { message, retryLabel: this.copy().retry },
      ...(retry === undefined ? {} : { retry }),
    };
  }

  protected emptyContext(): SlotlinePartContexts['empty'] {
    return {
      $implicit: { title: this.copy().noSlotsTitle, body: this.copy().noSlotsBody },
      action: { label: this.copy().pickAnotherDay, onClick: () => this.actions.back() },
    };
  }

  protected slotContext(slot: BookingSlotView, index: number): SlotlinePartContexts['slot'] {
    return {
      $implicit: slot,
      index,
      slotProps: {
        type: 'button',
        className: this.cls('slot', slot.selected && 'is-selected'),
        style: { '--sl-index': index },
        ...(slot.selected ? { 'aria-current': 'true' as const } : {}),
        ...(slot.utcOffsetLabel ? { 'aria-label': `${slot.label} ${slot.utcOffsetLabel}` } : {}),
        disabled: this.unavailable(),
        onClick: () => this.actions.selectSlot(slot),
      },
    };
  }

  protected dayContentContext(day: string): SlotlinePartContexts['dayContent'] {
    return { $implicit: { day, dayView: this.view().days[day] } };
  }

  protected formContext(): SlotlinePartContexts['form'] {
    return {
      $implicit: this.view().form,
      messages: this.copy(),
      actions: {
        setValues: (values) => this.actions.setValues(values),
        touchField: (field) => this.actions.touchField(field),
        submit: () => void this.actions.submit(),
        retry: () => this.actions.reloadSlots(),
      },
    };
  }

  protected attemptContext(attempt: BookingAttemptView): SlotlinePartContexts['attempt'] {
    return {
      $implicit: attempt,
      actions: {
        retry: () => this.actions.retry(),
        checkStatus: () => this.checkStatus.emit(),
      },
    };
  }

  protected confirmationContext(
    confirmation: BookingConfirmationView,
  ): SlotlinePartContexts['confirmation'] {
    return { $implicit: confirmation, actions: { reset: () => this.actions.reset() } };
  }

  protected durationContext(): SlotlinePartContexts['durationFooter'] {
    return {
      $implicit: this.view().duration,
      select: (minutes) => this.actions.setDuration(minutes),
    };
  }

  /**
   * The headless service behind this widget: the same instance the template reads.
   *
   * It is public so an application can drive the flow itself — a gallery of states,
   * a guided tour, a scripted demo — through the controller's own actions instead
   * of reaching into the DOM. `snapshot()` and `messages()` are readable from the
   * first render; `actions` only exist once the widget has configured the service,
   * which `ngOnInit` does before the template first runs.
   */
  readonly service = inject(SlotlineService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly cardRef = viewChild<ElementRef<HTMLElement>>('card');
  private readonly panelRef = viewChild<ElementRef<HTMLElement>>('panel');

  /**
   * The zone and the language the browser reports, read **after** the first
   * render. The first render — the one the server also produces — always uses
   * the controller's deterministic fallbacks, so hydration matches and the
   * widget then switches to what the visitor actually uses. Every other read of
   * the browser is forbidden.
   */
  private readonly browserDefaults = signal<{ locale: string; timeZone: string } | null>(null);

  /** The visible step of the grid, for roving tabindex. */
  private readonly focusKey = signal<string | null>(null);
  /** Day-of-month to restore after PageUp/PageDown swapped the month. */
  private pendingMonthFocus: string | null = null;
  private releaseTrap: (() => void) | null = null;
  private readonly injector = inject(Injector);

  /** The current view. Not `null`: the snapshot exists before the template runs. */
  protected readonly view: Signal<BookingView> = computed(() => {
    const current = this.service.view();
    if (!current) throw new Error('[slotline] the widget rendered before configure().');
    return current;
  });

  /**
   * The resolved dictionary of the active locale, from the service. It is not
   * called `messages` because the input of that name carries the overrides.
   */
  protected readonly copy = this.service.messages;
  protected readonly skeletons = range(SKELETON_COUNT);

  /**
   * The controller's actions. A getter rather than a field: the controller is
   * created in `ngOnInit`, so reading it during field initialisation — which runs
   * before the inputs and the lifecycle — would be a programming error.
   */
  protected get actions(): SlotlineService['actions'] {
    return this.service.actions;
  }

  /** The six weeks of the visible month. */
  protected readonly rows = computed(() => chunk(this.view().month.grid, DAYS_PER_WEEK));

  private readonly firstBookable = computed(() => {
    const { month, days } = this.view();
    return month.grid.find((day) => monthKeyOf(day) === month.key && days[day]?.bookable);
  });

  /**
   * The single tab stop of the grid. The candidate has to exist in the *current*
   * grid: after a month change the previously focused key is gone, and a stale
   * value would leave every cell at `tabindex="-1"`.
   */
  protected readonly focusTarget = computed(() => {
    const { month } = this.view();
    const focused = this.focusKey();
    if (focused && month.grid.includes(focused)) return focused;
    const selected = this.view().selection.date;
    if (selected && month.grid.includes(selected)) return selected;
    return this.firstBookable() ?? month.grid[0] ?? `${month.key}-01`;
  });

  /** The locale the widget renders in, for the `lang` attribute. */
  protected readonly resolvedLocale = computed(
    () => this.locale() ?? this.browserDefaults()?.locale ?? 'en',
  );

  /**
   * The back button leaves the flow when the controller has nowhere to go back
   * to — on the calendar and on the confirmation only a dismiss handler makes it
   * meaningful.
   */
  protected readonly canGoBack = computed(() => {
    const { step } = this.view();
    return this.view().actions.canGoBack || step === 'date' || step === 'confirmed';
  });

  constructor() {
    // The first configuration is synchronous, in `ngOnInit`, so a server render
    // already has a view. This effect only carries later changes: the controller
    // compares the options structurally, so re-supplying equal values costs
    // nothing and never invalidates the snapshot.
    effect(() => {
      this.configureFromInputs();
    });

    // A form's value changes outside the inputs, so it is followed separately.
    // Re-supplying an equal selection costs nothing: the controller compares.
    effect(() => {
      this.formState?.value();
      untracked(() => this.configureFromInputs());
    });

    afterNextRender(() => {
      this.browserDefaults.set({ locale: detectLocale(), timeZone: resolveTimeZone() });
      if (this.autoFocus()) this.panel()?.focus();
    });

    // Keep DOM focus inside the widget when the previous step unmounted the
    // element the user activated — otherwise focus silently falls back to <body>.
    let rendered = false;
    afterNextRender(() => {
      if (!rendered) {
        rendered = true;
        return;
      }
      const active = document.activeElement;
      if (!active || active === document.body) this.panel()?.focus();
    });

    effect(() => {
      const wanted = this.trapFocus();
      untracked(() => {
        this.releaseTrap?.();
        this.releaseTrap = null;
        if (wanted) this.beginTrap();
      });
    });

    this.destroyRef.onDestroy(() => {
      this.releaseTrap?.();
      this.releaseTrap = null;
      this.service.stop();
    });
  }

  ngOnInit(): void {
    this.configureFromInputs();
    this.service.start();
  }

  /* ------------------------------------------------------------------------ */
  /*  Configuration                                                           */
  /* ------------------------------------------------------------------------ */

  /**
   * Hands the current inputs to the service. `defaultTimeZone` is what keeps
   * the zone uncontrolled until the application provides one, and the browser
   * defaults only ever arrive through `browserDefaults`, after mounting.
   */
  private configureFromInputs(): void {
    const browser = this.browserDefaults();
    const inputs: BookingControllerInputs = {};

    if (this.timeZone() !== undefined) inputs.timeZone = this.timeZone();
    else {
      const timeZone = this.defaultTimeZone() ?? browser?.timeZone;
      if (timeZone !== undefined) inputs.defaultTimeZone = timeZone;
    }
    if (this.duration() !== undefined) inputs.duration = this.duration();
    if (this.defaultDuration() !== undefined) inputs.defaultDuration = this.defaultDuration();
    if (this.timeFormat() !== undefined) inputs.timeFormat = this.timeFormat();
    else if (this.defaultTimeFormat() !== undefined)
      inputs.defaultTimeFormat = this.defaultTimeFormat();

    if (this.formState) {
      // A form's value is controlled by definition: it is handed over as the
      // selection the widget starts from.
      inputs.selection = this.formState.value();
    } else if (this.selection() !== undefined) inputs.selection = this.selection();
    else if (this.defaultSelection() !== undefined)
      inputs.defaultSelection = this.defaultSelection();

    const locale = this.locale() ?? browser?.locale;
    const attempt = this.attempt() ?? undefined;

    const mode = this.mode() ?? 'booking';
    this.service.configure({
      // The suite narrows the pairing here: the two modes take different adapters,
      // and a selection never reaches a booking method.
      mode,
      adapter: this.adapter() as unknown as BookingAdapter<DefaultBookingValues>,
      config: {
        ...(locale === undefined ? {} : { locale }),
        ...(this.messages() === undefined ? {} : { messages: this.messages() }),
        ...(this.weekStartsOn() === undefined ? {} : { weekStartsOn: this.weekStartsOn() }),
        ...(this.durations() === undefined ? {} : { durationOptions: this.durations() }),
        ...(this.minDate() === undefined ? {} : { minDate: this.minDate() }),
        ...(this.maxDate() === undefined ? {} : { maxDate: this.maxDate() }),
        ...(this.title() === undefined ? {} : { title: this.title() }),
        ...(this.context() === undefined ? {} : { context: this.context() }),
        ...(this.formMode() === undefined ? {} : { formMode: this.formMode() }),
        ...(this.fields() === undefined ? {} : { fields: this.fields() }),
        ...(this.timeZones() === undefined ? {} : { timeZones: this.timeZones() }),
        ...(this.showTimeZoneSelector() ? { showTimeZoneSelector: true } : {}),
        ...(this.showTimeFormatSelector() ? { showTimeFormatSelector: true } : {}),
        ...(this.validateValues() === undefined ? {} : { validateValues: this.validateValues() }),
      },
      inputs,
      ...(attempt === undefined ? {} : { initialAttempt: attempt }),
      handlers: {
        onSelectionChange: (selection, metadata) => {
          // A form owns the value: it hears the proposal here, writes it back, and
          // the widget then applies what came back.
          this.formState?.onProposal?.(selection);
          this.selectionChange.emit({ selection, metadata });
        },
        onDurationChange: (duration, metadata) => this.durationChange.emit({ duration, metadata }),
        onTimeZoneChange: (timeZone, metadata) => this.timeZoneChange.emit({ timeZone, metadata }),
        onTimeFormatChange: (timeFormat, metadata) =>
          this.timeFormatChange.emit({ timeFormat, metadata }),
        onContextChange: (context, metadata) => this.contextChange.emit({ context, metadata }),
        onBooked: (result, request) =>
          this.booked.emit({ result, request: request as unknown as BookingRequest }),
        onError: (error, context) => this.failed.emit({ error, context }),
        onDismiss: () => this.dismiss.emit(),
      },
    });
  }

  /** Class names for a part: the base name, the consumer's override, then extras. */
  protected cls(slot: SlotlineClassSlot, ...extra: ClassValue[]): string {
    return cx(SLOT_CLASS[slot], this.classNames()?.[slot], ...extra);
  }

  protected textOf(value: unknown): string {
    return textValueOf(value);
  }

  protected inputTypeOf(field: ResolvedBookingField): string {
    return inputTypeOf(field);
  }

  protected inputModeOf(field: ResolvedBookingField): string | undefined {
    return inputModeOf(field);
  }

  protected autoCompleteOf(name: string): string | undefined {
    return autoCompleteOf(name);
  }

  protected durationLabel(minutes: number): string {
    return format(this.copy().duration, { count: minutes });
  }

  /* ------------------------------------------------------------------------ */
  /*  Focus                                                                   */
  /* ------------------------------------------------------------------------ */

  private panel(): HTMLElement | null {
    return this.panelRef()?.nativeElement ?? null;
  }

  private beginTrap(): void {
    const card = this.cardRef()?.nativeElement;
    if (!card) return;
    this.releaseTrap = trapFocus(card, { onEscape: () => this.actions.back() });
  }

  /* ------------------------------------------------------------------------ */
  /*  Calendar                                                                */
  /* ------------------------------------------------------------------------ */

  protected dayCell(day: string): BookingDayView | undefined {
    return this.view().days[day];
  }

  protected dayNumber(day: string): number {
    return Number(day.slice(8, 10));
  }

  protected onDayClick(day: string): void {
    if (!this.dayCell(day)?.bookable) return;
    this.actions.selectDate(day);
  }

  /**
   * Arrow keys move the roving tab stop, Home/End jump to the edges of the
   * week, and PageUp/PageDown swap the month and carry the keyboard along.
   */
  protected onGridKeydown(event: KeyboardEvent): void {
    const current = (event.target as HTMLElement | null)?.dataset?.['day'];
    if (!current) return;

    const { month } = this.view();
    const offsetFromWeekStart = (weekdayIndex(current) - month.weekStartsOn + 7) % 7;
    let next: string | undefined;

    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(current, -1);
        break;
      case 'ArrowRight':
        next = addDays(current, 1);
        break;
      case 'ArrowUp':
        next = addDays(current, -7);
        break;
      case 'ArrowDown':
        next = addDays(current, 7);
        break;
      case 'Home':
        next = addDays(current, -offsetFromWeekStart);
        break;
      case 'End':
        next = addDays(current, 6 - offsetFromWeekStart);
        break;
      case 'PageUp':
        event.preventDefault();
        this.pendingMonthFocus = current.slice(8, 10);
        this.actions.previousMonth();
        this.focusAfterRender();
        return;
      case 'PageDown':
        event.preventDefault();
        this.pendingMonthFocus = current.slice(8, 10);
        this.actions.nextMonth();
        this.focusAfterRender();
        return;
      default:
        return;
    }

    event.preventDefault();
    const first = month.grid[0];
    const last = month.grid[month.grid.length - 1];
    // A move that leaves the visible grid means the month has to change with it.
    if (first && last && (next < first || next > last)) this.actions.goToMonth(monthKeyOf(next));
    this.focusKey.set(next);
    this.focusAfterRender();
  }

  /**
   * Moves DOM focus to the new cell once the grid has been rendered.
   *
   * It has to wait for the render: this element has no `tabindex="0"` until the
   * tab stop is applied to the *new* day, and after a month change the previous
   * cell is not in the document at all.
   */
  private focusAfterRender(): void {
    // Keyboard handling runs outside the component's construction, so the
    // injection context the render hook needs is entered explicitly here.
    runInInjectionContext(this.injector, () => {
      afterNextRender(() => {
        const target = this.focusTarget();
        const month = this.pendingMonthFocus;
        this.pendingMonthFocus = null;

        let next = target;
        if (month && target.slice(8, 10) !== month) {
          // The same day of the month, whenever the new grid contains it.
          next =
            this.view().month.grid.find(
              (candidate) =>
                monthKeyOf(candidate) === this.view().month.key && candidate.slice(8, 10) === month,
            ) ?? target;
          this.focusKey.set(next);
        }
        this.gridCell(next)?.focus();
      });
    });
  }

  private gridCell(day: string): HTMLElement | null {
    return this.panel()?.querySelector<HTMLElement>(`[data-day="${day}"]`) ?? null;
  }

  /* ------------------------------------------------------------------------ */
  /*  Details                                                                 */
  /* ------------------------------------------------------------------------ */

  protected fieldId(index: number): string {
    return `sl-field-${index}`;
  }

  protected errorId(index: number): string {
    return `${this.fieldId(index)}-error`;
  }

  protected hintId(index: number): string {
    return `${this.fieldId(index)}-hint`;
  }

  protected fieldError(field: ResolvedBookingField): string | undefined {
    return this.view().form.visibleErrors[field.name];
  }

  protected describedBy(field: ResolvedBookingField, index: number): string | null {
    const error = this.fieldError(field);
    if (error) return this.errorId(index);
    return field.hint ? this.hintId(index) : null;
  }

  protected onFieldInput(name: string, event: Event): void {
    this.actions.setValues({ [name]: valueOfInput(event) });
  }

  protected onFieldCheck(name: string, event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.actions.setValues({ [name]: target?.checked === true });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.actions.submit();
  }

  /* ------------------------------------------------------------------------ */
  /*  Slots                                                                   */
  /* ------------------------------------------------------------------------ */

  /** Picks an offer; the controller decides whether it is confirmed or checked. */
  protected onSlotSelect(slot: TimeSlot): void {
    this.actions.selectSlot(slot);
  }
}

/** The value a form control reports, narrowed to what the flow stores. */
function valueOfInput(event: Event): string | number | boolean {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!target) return '';
  const value = target.value;
  return target instanceof HTMLInputElement && target.type === 'number'
    ? valueOfNumberInput(value)
    : value;
}
