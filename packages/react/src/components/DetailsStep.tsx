import { useClassNames, useComponents, useFlow, useUI } from '../context';

/** Step 3 — recap of the selection plus the configured fields. */
export function DetailsStep() {
  const { snapshot, actions } = useFlow();
  const { messages } = useUI();
  const { Form, Summary } = useComponents();
  const cls = useClassNames();
  const view = snapshot.view;
  const form = view.form;

  return (
    <div className="sl-details-step">
      <Summary view={view} />

      <Form
        form={form}
        messages={messages}
        actions={{
          setValues: actions.setValues,
          touchField: actions.touchField,
          submit: actions.submit,
          retry: actions.reloadSlots,
        }}
      />
    </div>
  );
}
