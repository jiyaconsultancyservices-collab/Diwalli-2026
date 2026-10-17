import {initializeApp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {getAuth, signInAnonymously} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {doc, getDocFromServer, getFirestore, runTransaction, serverTimestamp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {firebaseConfig} from "./firebase-config.js";
import {normalizeOrder, pendingSubmission, submitOrderTransaction} from "./order-core.js";

// Separate checkout and admin sessions, even though both use the same domain.
const app = initializeApp(firebaseConfig, "ttc-checkout");
const auth = getAuth(app);
const db = getFirestore(app);
const storageKey = "ttc_pending_submission_v1";
let pending = null;
let inFlight = null;

export function startNewOrder() {
  pending = null;
  try { localStorage.removeItem(storageKey); } catch { /* Private mode: memory fallback. */ }
}

async function save(input) {
  const order = normalizeOrder(input);
  await auth.authStateReady();
  const user = auth.currentUser || (await signInAnonymously(auth)).user;
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(order)));
  const fingerprint = [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, "0")).join("");
  try { pending = JSON.parse(localStorage.getItem(storageKey)) || pending; } catch { /* Memory fallback. */ }
  pending = pendingSubmission(pending, fingerprint, user.uid, () => crypto.randomUUID());
  try { localStorage.setItem(storageKey, JSON.stringify(pending)); } catch { /* Memory fallback. */ }
  return submitOrderTransaction({
    db, uid: user.uid, submissionId: pending.id, order,
    sdk: {doc, getDocFromServer, runTransaction, serverTimestamp}
  });
}

export function saveOrderToBackend(input) {
  if (inFlight) return inFlight;
  inFlight = save(input).finally(() => { inFlight = null; });
  return inFlight;
}
