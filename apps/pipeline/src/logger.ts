// logger.ts
import chalk from "chalk";
import PrettyError from "pretty-error";
import { v4 as uuidv4 } from "uuid"; // If you need to generate IDs here
import { pinoJsonLogger } from "./tools/setup/pino-setup"; // Import the configured Pino instance
import { als, type LogContext } from "./tools/setup/als-context"; // Import ALS instance and context type

const pe = new PrettyError();
pe.skipNodeFiles();
pe.skipPackage("chalk"); // Optional: Skip chalk internals in stack traces

// Your existing logger structure, now augmented
export const logger = {
  info: (message: string, contextStr?: string | unknown, ...extraData: unknown[]) => {
    if (typeof contextStr === "string") {
      pinoJsonLogger.info({ contextStr, ...extraData }, message);
    } else {
      pinoJsonLogger.info({ data: contextStr, ...extraData }, message);
    }
  },

  success: (message: string, contextStr?: string | unknown, ...extraData: unknown[]) => {
    if (typeof contextStr === "string") {
      pinoJsonLogger.info({ contextStr, logType: "success", ...extraData }, message);
    } else {
      pinoJsonLogger.info({ data: contextStr, logType: "success", ...extraData }, message);
    }
  },

  warning: (message: string, contextStr?: string | unknown, ...extraData: unknown[]) => {
    if (typeof contextStr === "string") {
      pinoJsonLogger.warn({ contextStr, logType: "warning", ...extraData }, message);
    } else {
      pinoJsonLogger.warn({ data: contextStr, logType: "warning", ...extraData }, message);
    }
  },

  error: (
    message: string,
    contextStr?: string | unknown,
    error?: unknown,
    ...extraData: unknown[]
  ) => {
    let errorObject: Error | undefined = undefined;
    if (error) {
      if (error instanceof Error) {
        errorObject = error;
        // logger.error(pe.render(errorObject)); // Pretty print to console
      } else {
        // logger.error(chalk.red(String(error)));
      }
    }
    const store = als.getStore();
    if (typeof contextStr === "string") {
      pinoJsonLogger.error(
        { contextStr, err: errorObject, rawError: error, extraData, ...store },
        message,
      );
    } else {
      pinoJsonLogger.error(
        { data: contextStr, err: errorObject, rawError: error, extraData, ...store },
        message,
      );
    }
    if (pinoJsonLogger && pinoJsonLogger.flush) {
      // pinoJsonLogger.flush((e: unknown) => {
      //   logger.info("Flushed", e);
      // });
    }
  },

  debug: (message: string, contextStr?: string | unknown, ...extraData: unknown[]) => {
    if (typeof contextStr === "string") {
      pinoJsonLogger.debug({ contextStr, ...extraData }, message);
    } else {
      pinoJsonLogger.debug({ data: contextStr, ...extraData }, message);
    }
  },
};

// --- Helper to wrap async operations with context ---
// (You'd call this from where you start your concurrent operations)
export async function runWithContext<T>(context: LogContext, fn: () => Promise<T>): Promise<T> {
  // Ensure a correlationId exists if not provided
  const fullContext = { correlationId: uuidv4(), ...context };
  return als.run(fullContext, fn);
}
