// Lead sources that post their leads to PropFlow, shared by the server and the browser:
//   integration: the catalog key (Live / Coming soon / switched off in the console)
//   channel: the lead source they set on new leads (null: the form's own choice)
//   settingsKey: the workspace setting holding the source's key and lead settings

export const LEAD_SOURCES = {
  "google-ads": { key: "google-ads", integration: "google-leads", name: "Google Ads lead forms", short: "Google Ads", channel: "google-ads", settingsKey: "lead_source_google_ads" },
  "google-forms": { key: "google-forms", integration: "google-forms", name: "Google Forms", short: "Google Forms", channel: null, settingsKey: "lead_source_google_forms" },
}
export const sourceByIntegration = (integrationKey) => Object.values(LEAD_SOURCES).find((s) => s.integration === integrationKey) ?? null

// The Apps Script a workspace pastes into a Google Form (⋮ › Script editor), then runs
// "install" once: every response is posted to PropFlow with the workspace's key.
export function appsScript({ url, key }) {
  return `// PropFlow: send every response of this form to PropFlow as a CRM lead.
// 1. Paste this in the form's Script editor (⋮ › Script editor) and save.
// 2. Choose "install" above and press Run once, then allow access.
const PROPFLOW_URL = "${url}";
const PROPFLOW_KEY = "${key}";

function install() {
  const form = FormApp.getActiveForm();
  ScriptApp.getProjectTriggers().forEach((t) => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger("onSubmit").forForm(form).onFormSubmit().create();
  send_(form, null, true);
}

function onSubmit(e) {
  send_(FormApp.getActiveForm(), e.response, false);
}

function send_(form, response, test) {
  const answers = response
    ? response.getItemResponses().map((r) => ({ title: r.getItem().getTitle(), type: String(r.getItem().getType()), value: [].concat(r.getResponse()).join(", ") }))
    : form.getItems().map((i) => ({ title: i.getTitle(), type: String(i.getType()), value: "" }));
  UrlFetchApp.fetch(PROPFLOW_URL, {
    method: "post",
    contentType: "application/json",
    muteHttpExceptions: true,
    payload: JSON.stringify({
      key: PROPFLOW_KEY,
      formId: form.getId(),
      formTitle: form.getTitle(),
      responseId: response ? response.getId() : "install-" + Date.now(),
      email: response ? response.getRespondentEmail() : "",
      answers: answers,
      test: test,
    }),
  });
}
`
}
