import React from "react";
import { PaywallInner } from "./Paywall";

interface PaywallProps {
  bookSlug: string;
  bookTitle: string;
  onClose: () => void;
}

export const PaywallGeneric: React.FC<PaywallProps> = (props) => {
  return <PaywallInner {...props} handlePayment={() => {}} openSignIn={() => {}} isUserLoggedIn={false} loading={null} />;
};
