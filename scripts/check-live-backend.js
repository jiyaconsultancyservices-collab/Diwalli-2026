// Read-only order checks. Creates and removes its own empty anonymous Auth session.
import assert from 'node:assert/strict';
import {initializeApp, deleteApp} from 'firebase/app';
import {getAuth, signInAnonymously, deleteUser} from 'firebase/auth';
import {collection, doc, getDocFromServer, getDocs, getFirestore, terminate} from 'firebase/firestore';
import {firebaseConfig} from '../firebase-config.js';
const app=initializeApp(firebaseConfig,'ttc-read-only-check');
const auth=getAuth(app),db=getFirestore(app);
let user;
try {
  await assert.rejects(getDocs(collection(db,'orders')),error=>error.code==='permission-denied');
  console.log('PASS: unauthenticated order listing is denied');
  user=(await signInAnonymously(auth)).user;
  const counter=(await getDocFromServer(doc(db,'counters','orders'))).data();
  assert.ok(Number.isSafeInteger(counter.lastNumber) && counter.lastNumber>=99);
  console.log(`PASS: authenticated checkout can read numbering (next TTC-${counter.lastNumber+1})`);
  await assert.rejects(getDocs(collection(db,'orders')),error=>error.code==='permission-denied');
  await assert.rejects(getDocFromServer(doc(db,'orders','TTC-100')),error=>error.code==='permission-denied');
  console.log('PASS: anonymous checkout cannot list or read private order details');
  const receipt=await getDocFromServer(doc(db,'orderReceipts',user.uid,'submissions',crypto.randomUUID()));
  assert.equal(receipt.exists(),false);
  console.log('PASS: own receipt lookup is allowed; no order or counter was changed');
} finally {
  if(user)await deleteUser(user);
  await terminate(db);await deleteApp(app);
}
