import * as Sentry from "@sentry/react";

console.log("loading sentry");

console.log("5: process.env.NODE_ENV BANG!", process.env.NODE_ENV);
console.log("6: import.meta.env.MODE BANG!", import.meta.env.MODE);
console.log("7: import.meta.env.PROD BANG!", import.meta.env.PROD);

Sentry.init({
  dsn: "https://ec8e06caac85f65ed3bab3efcb45d88e@o4510025358311424.ingest.de.sentry.io/4510152806039632",
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.httpClientIntegration({
      // Treat every HTTP 4xx/5xx as an error event
      failedRequestStatusCodes: [400, [402, 599]],
    }),
    Sentry.captureConsoleIntegration({ levels: ["error"] }),
  ],
  environment: import.meta.env.MODE || "development",
  enabled: import.meta.env.PROD,
  sendDefaultPii: true,
});
