export type PaymentType = "one_time" | "subscription";

export interface PaymentsModule {
  startCheckout: (
    paymentType: PaymentType,
    bookSlug: string,
    user?: { id: string; email?: string | null },
  ) => Promise<void>;
  checkAccess: (bookSlug: string, user?: { id: string }) => Promise<boolean>;
}
