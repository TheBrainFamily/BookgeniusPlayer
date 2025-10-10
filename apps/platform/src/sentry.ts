import * as Sentry from "@sentry/react";

console.log("loading sentry");

const environment = import.meta.env.VITE_IS_PRODUCTION === "true" ? "production" : "development";
const isProd = environment === "production";

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
  environment,
  enabled: isProd,
  sendDefaultPii: true,
});
