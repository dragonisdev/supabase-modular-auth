export interface StripeCheckoutTestData {
  url: string;
}

export interface StripeWebhookReceiptData {
  checkoutCompleted: boolean;
  eventId: string;
  eventType: string;
  paymentStatus: string | null;
}
