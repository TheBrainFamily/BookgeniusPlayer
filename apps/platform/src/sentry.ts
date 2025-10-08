import * as Sentry from "@sentry/react";

console.log("loading sentry");
Sentry.init({
  dsn: "https://ec8e06caac85f65ed3bab3efcb45d88e@o4510025358311424.ingest.de.sentry.io/4510152806039632",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.httpClientIntegration({
      // Treat every HTTP 4xx/5xx as an error event
      failedRequestStatusCodes: [[400, 599]],
    }),
    Sentry.captureConsoleIntegration({ levels: ["error"] }),
  ],
  sendDefaultPii: true,
});
