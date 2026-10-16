import { useMemo, useState, type CSSProperties } from 'react';
import {
  Slotline,
  createMockAdapter,
  type SlotlineTheme,
  type BookingRequest,
  type BookingResult,
} from '@nickkupriyanov/slotline-react';
import { Slotline as MotionSlotline } from '@nickkupriyanov/slotline-react/motion';
import { SelectionFormExample } from './form-example';
import '@nickkupriyanov/slotline-react/styles.css';

/** Custom properties are not part of `CSSProperties`, so they get their own helper. */
const cssVars = (vars: Record<string, string>): CSSProperties => vars as CSSProperties;

const ACCENTS = {
  default: cssVars({}),
  violet: cssVars({
    '--sl-accent': '#7c5cff',
    '--sl-accent-hover': '#8f74ff',
    '--sl-accent-press': '#6a49f0',
    '--sl-accent-ink': '#ab9dff',
    '--sl-accent-soft': 'rgba(124, 92, 255, 0.18)',
    '--sl-accent-soft-strong': 'rgba(124, 92, 255, 0.3)',
    '--sl-accent-glow': 'rgba(124, 92, 255, 0.45)',
    '--sl-focus-ring': 'rgba(124, 92, 255, 0.6)',
  }),
  emerald: cssVars({
    '--sl-accent': '#16c98d',
    '--sl-accent-hover': '#1fdc9c',
    '--sl-accent-press': '#10ac77',
    '--sl-accent-ink': '#4fe0b0',
    '--sl-accent-soft': 'rgba(22, 201, 141, 0.16)',
    '--sl-accent-soft-strong': 'rgba(22, 201, 141, 0.28)',
    '--sl-accent-glow': 'rgba(22, 201, 141, 0.4)',
    '--sl-focus-ring': 'rgba(22, 201, 141, 0.55)',
  }),
  mono: cssVars({
    '--sl-accent': '#8b8b96',
    '--sl-accent-hover': '#9d9daa',
    '--sl-accent-press': '#74747f',
    '--sl-accent-ink': '#cfcfd6',
    '--sl-accent-soft': 'rgba(255, 255, 255, 0.08)',
    '--sl-accent-soft-strong': 'rgba(255, 255, 255, 0.14)',
    '--sl-accent-glow': 'rgba(0, 0, 0, 0)',
    '--sl-focus-ring': 'rgba(255, 255, 255, 0.4)',
  }),
} satisfies Record<string, CSSProperties>;

const TIME_ZONES = ['auto', 'Europe/Berlin', 'Europe/Lisbon', 'America/New_York', 'Asia/Tokyo'];

interface LogEntry {
  id: number;
  request: BookingRequest;
  result: BookingResult;
}

export function App() {
  const [theme, setTheme] = useState<SlotlineTheme>('dark');
  const [locale, setLocale] = useState('en');
  const [timeZone, setTimeZone] = useState('auto');
  const [accent, setAccent] = useState<keyof typeof ACCENTS>('default');
  const [animations, setAnimations] = useState<'css' | 'motion'>('css');
  const [surface, setSurface] = useState<'inline' | 'modal'>('inline');
  const [log, setLog] = useState<LogEntry[]>([]);
  const resolvedTimeZone = timeZone === 'auto' ? undefined : timeZone;

  const adapter = useMemo(
    () =>
      createMockAdapter({
        timeZone: resolvedTimeZone,
        horizonDays: 90,
      }),
    [resolvedTimeZone],
  );

  const Widget = animations === 'motion' ? MotionSlotline : Slotline;

  const widget = (
    <Widget
      adapter={adapter}
      theme={theme}
      locale={locale}
      {...(resolvedTimeZone ? { timeZone: resolvedTimeZone } : {})}
      durations={[15, 30, 60]}
      defaultDuration={15}
      {...(surface === 'modal' ? { autoFocus: true, trapFocus: true } : {})}
      onBooked={(result, request) =>
        setLog((entries) => [{ id: Date.now(), request, result }, ...entries].slice(0, 4))
      }
    />
  );

  return (
    <div className="page">
      <header className="page__header">
        <div>
          <h1>@nickkupriyanov/slotline-react</h1>
          <p>Calendar → slots → details → confirmation. Dark by default, CSS-variable theming.</p>
        </div>
        <span className="page__badge">
          {animations === 'motion' ? 'motion springs' : 'pure CSS'}
        </span>
      </header>

      <section className="controls" aria-label="Playground controls">
        <Field label="Theme">
          <select value={theme} onChange={(event) => setTheme(event.target.value as SlotlineTheme)}>
            <option value="dark">dark</option>
            <option value="light">light</option>
            <option value="system">system</option>
          </select>
        </Field>
        <Field label="Locale">
          <select value={locale} onChange={(event) => setLocale(event.target.value)}>
            <option value="en">en</option>
            <option value="ru">ru</option>
          </select>
        </Field>
        <Field label="Time zone">
          <select value={timeZone} onChange={(event) => setTimeZone(event.target.value)}>
            {TIME_ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Accent">
          <select
            value={accent}
            onChange={(event) => setAccent(event.target.value as keyof typeof ACCENTS)}
          >
            {Object.keys(ACCENTS).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Animations">
          <select
            value={animations}
            onChange={(event) => setAnimations(event.target.value as 'css' | 'motion')}
          >
            <option value="css">css</option>
            <option value="motion">motion</option>
          </select>
        </Field>
        <Field label="Surface">
          <select
            value={surface}
            onChange={(event) => setSurface(event.target.value as 'inline' | 'modal')}
          >
            <option value="inline">inline</option>
            <option value="modal">modal (focus trap)</option>
          </select>
        </Field>
      </section>

      <main className="page__main">
        <div className={surface === 'modal' ? 'surface surface--modal' : 'surface'}>
          {/* Accent presets are plain CSS-variable overrides — nothing else. */}
          <div className="surface__widget" style={ACCENTS[accent]}>
            {widget}
          </div>
        </div>

        <aside className="log" aria-live="polite">
          <h2>onBooked</h2>
          {log.length === 0 ? (
            <p className="log__empty">
              Complete a booking to see the payload your backend receives.
            </p>
          ) : (
            <ol>
              {log.map((entry) => (
                <li key={entry.id}>
                  <code>{entry.result.id}</code>
                  <pre>{JSON.stringify(entry.request, null, 2)}</pre>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </main>

      <SelectionFormExample />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="control">
      <span>{label}</span>
      {children}
    </label>
  );
}
