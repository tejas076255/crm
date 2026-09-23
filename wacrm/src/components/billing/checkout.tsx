"use client";

// ============================================================
// Razorpay one-time checkout — client widget
//
// Loads the checkout.js modal on demand and opens it configured with an
// *order_id* (a single payment — never a recurring subscription). The
// purchase is one-time; the server decides what a captured payment grants
// via /api/billing/verify. Resolves when the modal confirms success or
// failure so the caller can proceed to verify server-side.
//
// Nothing secret touches this file: the only values are the public key id
// (NEXT_PUBLIC) and the order id minted by /api/billing/checkout.
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RazorpayCtor = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RazorpayInstance = any;

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
const RAZORPAY_VAR = "Razorpay";

/** Fallback resolve if the modal is closed/abandoned mid-payment — the
 *  promise would otherwise hang and leave the caller's pending state
 *  stuck on a Spin for good. */
const SETTLE_GUARD_MS = 5 * 60 * 1000;

let scriptPromise: Promise<RazorpayCtor> | null = null;

/** Inject checkout.js once and resolve with the constructor. */
function loadRazorpayCheckout(): Promise<RazorpayCtor> {
  if (scriptPromise) return scriptPromise;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const win = window as any;
  if (typeof win[RAZORPAY_VAR] !== "undefined") {
    scriptPromise = Promise.resolve(win[RAZORPAY_VAR] as RazorpayCtor);
    return scriptPromise;
  }
  scriptPromise = new Promise<RazorpayCtor>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SRC;
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const ctor = (window as any)[RAZORPAY_VAR] as RazorpayCtor | undefined;
      if (ctor) {
        resolve(ctor);
      } else {
        scriptPromise = null;
        reject(new Error("Razorpay checkout loaded but initialised without a constructor"));
      }
    };
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("Failed to load Razorpay checkout"));
    };
    document.body.appendChild(script);
  });
  return scriptPromise;
}

export interface RazorpayOrderOptions {
  /** Public key id (NEXT_PUBLIC_RAZORPAY_KEY_ID). */
  key: string;
  /** One-time order id from /api/billing/checkout. */
  orderId: string;
  name: string;
  description: string;
  prefill?: { name?: string; email?: string };
}

export interface RazorpayOrderResult {
  /** True when the modal confirmed the payment. */
  paid: boolean;
  orderId: string;
  /** Present only on a confirmed payment. Sent to /api/billing/verify. */
  paymentId?: string;
  /** Razorpay signature — sent to /api/billing/verify (never trusted alone). */
  signature?: string;
}

/** The payment response Razorpay hands to the success handler. */
interface RazorpayHandlerResponse {
  razorpay_payment_id?: string;
  razorpay_order_id?: string;
  razorpay_signature?: string;
}

/**
 * Open the Razorpay one-time order modal and await its outcome.
 *
 * Resolves `{ paid: true, paymentId, signature }` from the success
 * handler, `{ paid: false }` on a failed payment or if the modal is
 * abandoned for `SETTLE_GUARD_MS`. The caller must NOT trust this alone —
 * it then verifies server-side via /api/billing/verify.
 */
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

    // Safety net: if the user closes the modal mid-payment neither the
    // handler nor payment.failed fires — resolve as unpaid rather than
    // hanging the caller's pending-plan state forever.
    const guard = setTimeout(() => {
      settle({ paid: false, orderId: opts.orderId });
    }, SETTLE_GUARD_MS);

    const instance: RazorpayInstance = new RazorpayCtor({
      key: opts.key,
      order_id: opts.orderId,
      name: opts.name,
      description: opts.description,
      prefill: opts.prefill ?? {},
      // Closest match to the app's violet primary accent.
      theme: { color: "#8b5cf6" },
      // Explicitly enable all Indian payment methods including UPI.
      // Without this, Razorpay may hide UPI/netbanking in test mode
      // and only show international cards (which are blocked).
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
      handler: (response: RazorpayHandlerResponse) =>
        settle({
          paid: true,
          orderId: opts.orderId,
          paymentId: response?.razorpay_payment_id,
          signature: response?.razorpay_signature,
        }),
    });

    instance.on("payment.failed", () =>
      settle({ paid: false, orderId: opts.orderId }),
    );

    try {
      instance.open();
    } catch (err) {
      console.error("[checkout] open failed:", err);
      settle({ paid: false, orderId: opts.orderId });
    }
  });
}