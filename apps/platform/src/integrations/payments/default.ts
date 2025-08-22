import type { PaymentsModule } from "./types";

const startCheckout: PaymentsModule["startCheckout"] = async () => {
  alert("Payments are disabled on this deployment.");
};

const checkAccess: PaymentsModule["checkAccess"] = async () => false;

export default { startCheckout, checkAccess } satisfies PaymentsModule;
