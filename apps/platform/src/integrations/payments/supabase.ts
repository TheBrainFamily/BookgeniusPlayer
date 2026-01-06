import { Database } from "../supabase/types";
import type { PaymentsModule, PaymentType } from "./types";
import { createClient } from "@supabase/supabase-js";

const getSupabaseClient = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !anonKey) {
    console.error("Supabase credentials not configured");
    return null;
  }

  return createClient<Database>(url, anonKey, {
    auth: { storage: localStorage, persistSession: true, autoRefreshToken: true },
  });
};

const startCheckout: PaymentsModule["startCheckout"] = async (
  paymentType: PaymentType,
  bookSlug: string,
  user: { id: string; email?: string | null },
) => {
  if (!user) {
    throw new Error("User must be logged in to start checkout");
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    throw new Error("Supabase client not configured");
  }

  try {
    const { data, error } = await supabase.functions.invoke("create-payment", {
      body: { userId: user.id, email: user.email, bookSlug, paymentType },
    });

    if (error) throw error;

    // Open Stripe checkout in new tab
    if (data?.url) {
      window.open(data.url, "_blank");
    } else {
      throw new Error("No checkout URL received");
    }
  } catch (error) {
    console.error("Payment error:", error);
    throw new Error("Payment setup failed. Please try again.");
  }
};

const checkAccess: PaymentsModule["checkAccess"] = async (
  bookSlug: string,
  user: { id: string },
) => {
  if (!user) return false;

  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error("Supabase client not configured");
    return false;
  }

  try {
    const { data, error } = await supabase.functions.invoke("verify-purchase", {
      body: { userId: user.id, bookSlug },
    });

    if (error) throw error;

    return data?.hasAccess || false;
  } catch (error) {
    console.error("Access check error:", error);
    return false;
  }
};

export default { startCheckout, checkAccess } satisfies PaymentsModule;
