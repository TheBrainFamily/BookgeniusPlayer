import * as Sentry from "@sentry/node";

Sentry.init({
  dsn: "https://8c59b78339cf76e82ea19c235ee26d74@o4510025358311424.ingest.de.sentry.io/4510025361457232",
  // Setting this option to true will send default PII data to Sentry.
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  tracesSampleRate: 1.0,
  integrations: [
    Sentry.vercelAIIntegration({ recordInputs: true, recordOutputs: true, force: true }),
  ],
});
