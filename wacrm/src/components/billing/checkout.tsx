"use client";

// ============================================================
// Payment checkout — client widget
//
// Supports:
// 1. YOUPI PG — direct serverless UPI payments (0% commission)
// 2. Razorpay — legacy / fallback card & netbanking gateway
// ============================================================

const YOUPI_SCRIPT_SRC = "https://youpi.tejasgogavale5.workers.dev/youpi.js";
const RAZORPAY_CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const SETTLE_GUARD_MS = 5 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let youpiPromise: Promise<any> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let razorpayPromise: Promise<any> | null = null;

function loadYoupiCheckout(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (youpiPromise) return youpiPromise;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = typeof window !== "undefined" ? (window as any) : {};
  if (typeof win.Youpi !== "undefined") {
    youpiPromise = Promise.resolve(win.Youpi);
    return youpiPromise;
  }
  youpiPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = YOUPI_SCRIPT_SRC;
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const youpi = (window as any).Youpi;
      if (youpi) resolve(youpi);
      else {
        youpiPromise = null;
        reject(new Error("Youpi checkout loaded without SDK object"));
      }
    };
    script.onerror = () => {
      youpiPromise = null;
      reject(new Error("Failed to load Youpi checkout script"));
    };
    document.body.appendChild(script);
  });
  return youpiPromise;
}

function loadRazorpayCheckout(): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  if (razorpayPromise) return razorpayPromise;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = typeof window !== "undefined" ? (window as any) : {};
  if (typeof win.Razorpay !== "undefined") {
    razorpayPromise = Promise.resolve(win.Razorpay);
    return razorpayPromise;
  }
  razorpayPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = RAZORPAY_CHECKOUT_SRC;
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctor = (window as any).Razorpay;
      if (ctor) resolve(ctor);
      else {
        razorpayPromise = null;
        reject(new Error("Razorpay checkout loaded without constructor"));
      }
    };
    script.onerror = () => {
      razorpayPromise = null;
      reject(new Error("Failed to load Razorpay checkout"));
    };
    document.body.appendChild(script);
  });
  return razorpayPromise;
}

export interface PaymentCheckoutOptions {
  gateway?: "youpi" | "razorpay";
  /** Razorpay public key or Youpi Merchant ID */
  key?: string;
  orderId: string;
  paymentId?: string;
  amount?: string;
  plan?: string;
  accountId?: string;
  name?: string;
  description?: string;
  prefill?: { name?: string; email?: string };
}

export interface PaymentCheckoutResult {
  paid: boolean;
  orderId: string;
  paymentId?: string;
  signature?: string;
  utr?: string;
  gateway?: "youpi" | "razorpay";
}

/** Legacy type aliases to maintain backward compatibility */
export type RazorpayOrderOptions = PaymentCheckoutOptions;
export type RazorpayOrderResult = PaymentCheckoutResult;

/**
 * Universal payment checkout launcher.
 * Defaults to Youpi PG unless explicit razorpay key is provided.
 */
export async function openPaymentCheckout(
  opts: PaymentCheckoutOptions,
): Promise<PaymentCheckoutResult> {
  const isRazorpay =
    opts.gateway === "razorpay" ||
    (opts.key && opts.key.startsWith("rzp_"));

  if (isRazorpay) {
    return openRazorpayOrder(opts);
  }

  // --- YOUPI Serverless UPI Gateway ---
  const Youpi = await loadYoupiCheckout();

  return new Promise<PaymentCheckoutResult>((resolve) => {
    let settled = false;
    const settle = (result: PaymentCheckoutResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      resolve(result);
    };

    const guard = setTimeout(() => {
      settle({ paid: false, orderId: opts.orderId, gateway: "youpi" });
    }, SETTLE_GUARD_MS);

    try {
      Youpi.pay({
        amount: opts.amount || "6000.00",
        order_id: opts.orderId,
        key: opts.key || "00000000-0000-0000-0000-000000000001",
        metadata: {
          plan: opts.plan,
          accountId: opts.accountId,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        handler: (response: any) => {
          settle({
            paid: true,
            gateway: "youpi",
            orderId: response?.orderId || opts.orderId,
            paymentId: response?.paymentId || opts.paymentId,
            utr: response?.utr,
          });
        },
        onClose: () => {
          settle({ paid: false, gateway: "youpi", orderId: opts.orderId });
        },
      });
    } catch (err) {
      console.error("[checkout] Youpi pay error:", err);
      settle({ paid: false, gateway: "youpi", orderId: opts.orderId });
    }
  });
}

/** Razorpay checkout handler for backward compatibility */
export async function openRazorpayOrder(
  opts: RazorpayOrderOptions,
): Promise<RazorpayOrderResult> {
  const RazorpayCtor = await loadRazorpayCheckout();

  return new Promise<RazorpayOrderResult>((resolve) => {
    let settled = false;
    const settle = (result: RazorpayOrderResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      resolve(result);
    };

    const guard = setTimeout(() => {
      settle({ paid: false, orderId: opts.orderId, gateway: "razorpay" });
    }, SETTLE_GUARD_MS);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const instance = new RazorpayCtor({
      key: opts.key,
      order_id: opts.orderId,
      name: opts.name || "wacrm",
      description: opts.description || "Subscription",
      prefill: opts.prefill ?? {},
      theme: { color: "#8b5cf6" },
      config: {
        display: {
          blocks: {
            upi: { name: "Pay via UPI", instruments: [{ method: "upi" }] },
            netbanking: { name: "Netbanking", instruments: [{ method: "netbanking" }] },
            card: { name: "Cards", instruments: [{ method: "card" }] },
          },
          sequence: ["block.upi", "block.netbanking", "block.card"],
          preferences: { show_default_blocks: false },
        },
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handler: (response: any) =>
        settle({
          paid: true,
          gateway: "razorpay",
          orderId: opts.orderId,
          paymentId: response?.razorpay_payment_id,
          signature: response?.razorpay_signature,
        }),
    });

    instance.on("payment.failed", () =>
      settle({ paid: false, orderId: opts.orderId, gateway: "razorpay" }),
    );

    try {
      instance.open();
    } catch (err) {
      console.error("[checkout] open failed:", err);
      settle({ paid: false, orderId: opts.orderId, gateway: "razorpay" });
    }
  });
}