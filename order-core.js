export const ORDER_STATUSES = ["New", "Confirmed", "Packed", "Completed", "Cancelled"];

// All orders are customer requests, not payments or stock reservations.
export function normalizeOrder(input) {
  const text = (value, min, max, label) => {
    if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) {
      throw new Error(`Please check ${label}.`);
    }
    return value.trim();
  };
  const name = text(input.name, 2, 100, "your name (2–100 characters)");
  const phone = text(input.phone, 10, 10, "your mobile number");
  const address = text(input.address, 8, 500, "your address (8–500 characters)");
  const pincode = text(input.pincode, 6, 6, "your pincode");
  if (!/^[6-9][0-9]{9}$/.test(phone)) throw new Error("Enter a valid 10-digit mobile number.");
  if (!/^[1-9][0-9]{5}$/.test(pincode)) throw new Error("Enter a valid 6-digit pincode.");
  if (!Array.isArray(input.items) || !input.items.length || input.items.length > 200) {
    throw new Error("Please check the items in your cart.");
  }
  const ids = new Set();
  const items = input.items.map(item => {
    const id = text(item.id, 1, 32, "the product code");
    const name = text(item.name, 1, 160, "the product name");
    if (!/^[A-Za-z0-9_-]+$/.test(id) || ids.has(id)) throw new Error("Please refresh your cart.");
    ids.add(id);
    if (!Number.isSafeInteger(item.price) || item.price <= 0 || item.price > 100000 ||
        !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 99) {
      throw new Error("Please check the product quantity and price.");
    }
    const lineTotal = item.price * item.quantity;
    if (item.lineTotal !== lineTotal) throw new Error("The cart total changed. Please try again.");
    return {id, name, price: item.price, quantity: item.quantity, lineTotal};
  }).sort((a, b) => a.id.localeCompare(b.id));
  const total = items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (total !== input.total || total < 500 || total > 1000000) {
    throw new Error("Orders must total between ₹500 and ₹10,00,000. Contact TTC for larger orders.");
  }
  return {name, phone, address, pincode, items, total};
}

export function pendingSubmission(previous, fingerprint, uid, newId) {
  if (previous?.fingerprint === fingerprint && previous?.uid === uid &&
      /^[a-f0-9-]{36}$/.test(previous?.id || "")) return previous;
  return {fingerprint, uid, id: newId()};
}

export function whatsappMessage(order, orderId, shop = "TTC Crackers") {
  const money = n => `₹${n.toLocaleString("en-IN")}`;
  const rows = order.items.map((item, i) => `${i + 1}. ${item.name} x${item.quantity} = ${money(item.lineTotal)}`).join("\n");
  return `🎆 *New Diwali Order* – ${shop}\n*Order ID:* ${orderId}\n\n*Name:* ${order.name}\n*Phone:* ${order.phone}\n*Address:* ${order.address}\n*Pincode:* ${order.pincode}\n\n*Items*\n${rows}\n\n*Total: ${money(order.total)}*`;
}

export async function submitOrderTransaction({db, uid, submissionId, order, sdk}) {
  const {doc, getDocFromServer, runTransaction, serverTimestamp} = sdk;
  const receiptRef = doc(db, "orderReceipts", uid, "submissions", submissionId);
  const counterRef = doc(db, "counters", "orders");
  // A competing allocation can be rejected by security rules before Firestore
  // reports the normal transaction conflict. Retry only if that counter advanced.
  for (let attempt = 0; attempt < 5; attempt++) {
    let observedNumber;
    try { return await runTransaction(db, async transaction => {
      const receipt = await transaction.get(receiptRef);
      if (receipt.exists()) return receipt.data();
      const counter = await transaction.get(counterRef);
      const previous = counter.data()?.lastNumber;
      observedNumber = previous;
      if (!counter.exists() || !Number.isSafeInteger(previous) || previous < 99) {
        throw new Error("Order numbering is unavailable. Please contact TTC or try again later.");
      }
      const orderNumber = previous + 1;
      const orderId = `TTC-${orderNumber}`;
      const createdAt = serverTimestamp();
      transaction.set(doc(db, "orders", orderId), {
        ...order, ownerId: uid, submissionId, orderNumber, orderId,
        status: "New", source: "TTC Crackers web store", createdAt
      });
      transaction.update(counterRef, {lastNumber: orderNumber});
      transaction.set(receiptRef, {orderId, orderNumber, createdAt});
      return {orderId, orderNumber};
    }); } catch (error) {
      if (error.code !== "permission-denied" || attempt === 4 || !Number.isSafeInteger(observedNumber)) throw error;
      const latest = await getDocFromServer(counterRef);
      if (!(latest.data()?.lastNumber > observedNumber)) throw error;
      await new Promise(resolve => setTimeout(resolve, 75 * (attempt + 1)));
    }
  }
}
