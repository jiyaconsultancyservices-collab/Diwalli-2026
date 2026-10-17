import {initializeApp} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js";
import {getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, setPersistence, browserSessionPersistence, getIdTokenResult} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js";
import {collection, doc, getDocs, getFirestore, limit, onSnapshot, orderBy, query, serverTimestamp, startAfter, updateDoc} from "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js";
import {ADMIN_EMAIL, firebaseConfig} from "./firebase-config.js";
import {ORDER_STATUSES, normalizeOrder} from "./order-core.js";

const $ = id => document.getElementById(id);
const money = n => new Intl.NumberFormat("en-IN", {style:"currency",currency:"INR",maximumFractionDigits:0}).format(Number.isFinite(n) ? n : 0);
const app = initializeApp(firebaseConfig, "ttc-admin");
const auth = getAuth(app), db = getFirestore(app), provider = new GoogleAuthProvider();
provider.setCustomParameters({prompt:"select_account",login_hint:ADMIN_EMAIL});
let records = new Map(), unsubscribe = null, cursor = null, session = 0, olderLoaded = false;
const text = value => typeof value === "string" || typeof value === "number" ? String(value) : "Invalid value";
function element(tag, className, value) {
  const node = document.createElement(tag);
  if(className) node.className = className;
  if(value !== undefined) node.textContent = text(value);
  return node;
}
function clearPrivateData() {
  unsubscribe?.(); unsubscribe = null; records.clear(); cursor = null; olderLoaded = false;
  $("orders").replaceChildren(); $("search").value=""; $("filter").value="All statuses";
  $("orderCount").textContent="0"; $("salesTotal").textContent="₹0"; $("newCount").textContent="0";
  $("dashboard").hidden=true; $("signout").hidden=true; $("login").hidden=false;
  $("loadMore").hidden=true; $("account").textContent=""; $("dashboardError").textContent="";
}
$("signin").disabled=false; $("signin").textContent="Sign in with Google";
$("signin").onclick=async()=>{
  $("loginError").textContent=""; $("signin").disabled=true;
  try { await setPersistence(auth,browserSessionPersistence); await signInWithPopup(auth,provider); }
  catch(error) {
    $("loginError").textContent=error.code==="auth/popup-blocked"
      ? "Allow the sign-in popup, then try again. On mobile, open this page in Safari or Chrome."
      : error.code==="auth/popup-closed-by-user" ? "Sign-in was closed. Please try again." : "Google sign-in failed. Check your connection and try again.";
  } finally { $("signin").disabled=false; }
};
$("signout").onclick=async()=>{
  ++session; clearPrivateData();
  try { await signOut(auth); } catch { $("loginError").textContent="Please close this tab to finish signing out."; }
};
onAuthStateChanged(auth,async user=>{
  const thisSession=++session;
  clearPrivateData();
  if(!user)return;
  try {
    const token=await getIdTokenResult(user);
    if(thisSession!==session)return;
    if(user.email!==ADMIN_EMAIL || !user.emailVerified || token.claims.firebase?.sign_in_provider!=="google.com") {
      $("loginError").textContent="This Google account is not authorized to view TTC orders.";
      await signOut(auth); return;
    }
    $("login").hidden=true; $("dashboard").hidden=false; $("signout").hidden=false;
    $("account").textContent=`· ${user.email}`; $("loadStatus").textContent="Connecting to orders…";
    unsubscribe=onSnapshot(query(collection(db,"orders"),orderBy("createdAt","desc"),limit(100)),snapshot=>{
      if(thisSession!==session)return;
      if(!olderLoaded)records.clear();
      snapshot.docs.forEach(d=>records.set(d.id,{...d.data(),id:d.id}));
      if(!olderLoaded){cursor=snapshot.docs.at(-1)||null;$("loadMore").hidden=snapshot.size<100;}
      render();
    },()=>{
      if(thisSession!==session)return;
      clearPrivateData();
      $("loginError").textContent="Order access couldn't be verified. Please sign in again.";
    });
  } catch {
    if(thisSession===session){clearPrivateData();$("loginError").textContent="Couldn't verify your account. Please try signing in again.";}
  }
});
$("loadMore").onclick=async()=>{
  if(!cursor)return;
  const thisSession=session;
  $("loadMore").disabled=true; $("dashboardError").textContent="";
  try {
    const snapshot=await getDocs(query(collection(db,"orders"),orderBy("createdAt","desc"),startAfter(cursor),limit(100)));
    if(thisSession!==session)return;
    olderLoaded=true;snapshot.docs.forEach(d=>records.set(d.id,{...d.data(),id:d.id}));
    cursor=snapshot.docs.at(-1)||cursor;$("loadMore").hidden=snapshot.size<100;render();
  } catch { if(thisSession===session)$("dashboardError").textContent="Couldn't load older orders. Please try again."; }
  finally {$("loadMore").disabled=false;}
};

function orderCard(order, opened) {
  const card=element("details","order");card.dataset.id=order.id;card.open=opened;
  const summary=element("summary","summary");
  const identity=element("div");identity.append(element("div","oid",order.orderId),element("div","customer",order.name),element("div","hint","View order details ↓"));
  const when=order.createdAt?.toDate ? order.createdAt.toDate().toLocaleString("en-IN") : "Pending timestamp";
  const meta=element("div","meta",`${when} · ${text(order.phone)}`);
  const amount=element("div","amount",money(order.total));amount.append(element("br"),element("span","badge",order.status));
  summary.append(identity,meta,amount);card.append(summary);
  const details=element("div","details"),columns=element("div","details-grid");
  const customer=element("div");customer.append(element("h3","","Customer & delivery"),element("p","",order.name));
  if(/^[6-9][0-9]{9}$/.test(order.phone)) {const phone=element("a","",`+91 ${order.phone}`);phone.href=`tel:+91${order.phone}`;customer.append(phone);}
  customer.append(element("p","address",`${text(order.address)}\nPincode: ${text(order.pincode)}`));
  const products=element("div");products.append(element("h3","","Requested items"));
  const list=element("ol","items");
  const items=Array.isArray(order.items)?order.items.slice(0,200):[];
  for(const item of items)list.append(element("li","",`${text(item?.name)} × ${text(item?.quantity)} — ${money(item?.lineTotal)}`));
  products.append(list);
  let valid=true;
  try{normalizeOrder(order);}catch{valid=false;products.append(element("p","warning","This request contains inconsistent item details or totals. Contact the customer before confirming."));}
  columns.append(customer,products);details.append(columns);
  const actions=element("div","actions"),label=element("label","","Order status"),select=element("select");
  for(const status of ORDER_STATUSES){const option=element("option","",status);option.value=status;option.selected=status===order.status;select.append(option);}
  label.append(select);
  const save=element("button","save","Save status"),feedback=element("p","error row-error");feedback.setAttribute("role","status");
  save.onclick=async()=>{
    if(!valid && !["New","Cancelled"].includes(select.value)){feedback.textContent="Please verify this inconsistent request with the customer first.";return;}
    const thisSession=session;save.disabled=true;feedback.textContent="";
    try {
      await updateDoc(doc(db,"orders",order.id),{status:select.value,updatedAt:serverTimestamp()});
      if(thisSession!==session)return;
      const current=records.get(order.id);if(current)current.status=select.value;
      feedback.textContent="Status saved.";feedback.style.color="var(--green)";
      render();
    }catch{feedback.textContent="Couldn't save the status. Please retry.";feedback.style.color="var(--red)";}
    finally{save.disabled=false;}
  };
  actions.append(label,save,feedback);details.append(actions);card.append(details);return card;
}
function render() {
  const open=new Set([...$("orders").querySelectorAll("details[open]")].map(node=>node.dataset.id));
  const term=$("search").value.trim().toLowerCase(),status=$("filter").value;
  const orders=[...records.values()].sort((a,b)=>(b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0));
  const shown=orders.filter(o=>(status==="All statuses"||o.status===status)&&`${text(o.orderId)} ${text(o.name)} ${text(o.phone)}`.toLowerCase().includes(term));
  $("orderCount").textContent=shown.length;$("salesTotal").textContent=money(shown.reduce((sum,o)=>sum+(Number.isFinite(o.total)?o.total:0),0));$("newCount").textContent=shown.filter(o=>o.status==="New").length;
  $("loadStatus").textContent=`${records.size} orders loaded · Latest 100 update live. Load older orders to include them in search.`;
  $("orders").replaceChildren(...(shown.length?shown.map(o=>orderCard(o,open.has(o.id))):[element("div","empty",records.size?"No matching orders.":"No orders yet. New customer requests will appear here.")]));
}
$("search").addEventListener("input",render);$("filter").addEventListener("change",render);
