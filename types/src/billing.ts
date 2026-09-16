export interface StripeCheckoutData {
  url: string;
}

export interface BillingOverviewData {
  credits: number;
  creditsPerPurchase: number;
}

export interface StripeWebhookData {
  balance: number | null;
  creditsGranted: number;
  eventId: string;
  eventType: string;
  processed: boolean;
}
