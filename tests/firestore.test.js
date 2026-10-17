import {readFile} from 'node:fs/promises';
import test,{before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {initializeTestEnvironment,assertFails,assertSucceeds} from '@firebase/rules-unit-testing';
import {collection,deleteDoc,doc,getDoc,getDocFromServer,getDocs,query,orderBy,limit,runTransaction,serverTimestamp,setDoc,updateDoc,writeBatch} from 'firebase/firestore';
import {submitOrderTransaction,normalizeOrder} from '../order-core.js';
let env;
const sdk={doc,getDocFromServer,runTransaction,serverTimestamp};
const customer=uid=>env.authenticatedContext(uid,{firebase:{sign_in_provider:'anonymous'}}).firestore();
const admin=(changes={})=>env.authenticatedContext('owner',{email:'jiyaconsultancyservices@gmail.com',email_verified:true,firebase:{sign_in_provider:'google.com'},...changes}).firestore();
const input=()=>normalizeOrder({name:'TEST ONLY',phone:'9000000000',address:'TEST ADDRESS - NOT FOR DELIVERY',pincode:'600069',items:[{id:'TTC001',name:'Test item',price:100,quantity:5,lineTotal:500}],total:500});
const submit=(uid='customer',id=randomUUID(),order=input())=>submitOrderTransaction({db:customer(uid),uid,submissionId:id,order,sdk});
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-ttc-orders',firestore:{host:'127.0.0.1',port:8087,rules:await readFile(new URL('../firestore.rules',import.meta.url),'utf8')}});});
beforeEach(async()=>{await env.clearFirestore();await env.withSecurityRulesDisabled(ctx=>setDoc(doc(ctx.firestore(),'counters','orders'),{lastNumber:99}));});
after(async()=>{await env?.cleanup();});
test('first order is TTC-100; repeats reuse it and later orders increment',async()=>{
 const id=randomUUID();assert.equal((await submit('alice',id)).orderId,'TTC-100');
 assert.equal((await submit('alice',id)).orderId,'TTC-100');
 assert.equal((await submit('bob')).orderId,'TTC-101');
 const docs=await getDocs(collection(admin(),'orders'));assert.equal(docs.size,2);
 assert.equal((await getDoc(doc(admin(),'counters','orders'))).data().lastNumber,101);
});
test('simultaneous customers get different sequential numbers',async()=>{
 const results=await Promise.allSettled(['alice','bob','chris'].map(uid=>submit(uid)));
 assert.ok(results.every(r=>r.status==='fulfilled'),JSON.stringify(results));
 assert.deepEqual(results.map(r=>r.value.orderNumber).sort(),[100,101,102]);
});
test('simultaneous retries of one submission still create only one order',async()=>{
 const id=randomUUID();
 const results=await Promise.allSettled([submit('alice',id),submit('alice',id),submit('alice',id)]);
 assert.ok(results.every(r=>r.status==='fulfilled'),JSON.stringify(results));
 assert.deepEqual(results.map(r=>r.value.orderId),['TTC-100','TTC-100','TTC-100']);
 assert.equal((await getDocs(collection(admin(),'orders'))).size,1);
});
test('unauthenticated users, other Google accounts, and customers cannot read orders',async()=>{
 await submit('alice');
 const denied=[env.unauthenticatedContext().firestore(),customer('alice'),customer('bob'),admin({email:'other@example.com'}),admin({email_verified:false}),admin({firebase:{sign_in_provider:'password'}})];
 for(const db of denied){await assertFails(getDoc(doc(db,'orders','TTC-100')));await assertFails(getDocs(collection(db,'orders')));}
 await assertSucceeds(getDocs(query(collection(admin(),'orders'),orderBy('createdAt','desc'),limit(100))));
});
test('receipts are readable only by their owner, not listable or editable',async()=>{
 const id=randomUUID();await submit('alice',id);
 await assertSucceeds(getDoc(doc(customer('alice'),'orderReceipts','alice','submissions',id)));
 await assertFails(getDoc(doc(customer('bob'),'orderReceipts','alice','submissions',id)));
 await assertFails(getDocs(collection(customer('alice'),'orderReceipts','alice','submissions')));
 await assertFails(updateDoc(doc(customer('alice'),'orderReceipts','alice','submissions',id),{orderId:'TTC-999'}));
});
test('counter cannot be incremented on its own, reset, or changed by a stranger',async()=>{
 for(const number of [100,500,1])await assertFails(updateDoc(doc(customer('alice'),'counters','orders'),{lastNumber:number}));
 await assertFails(updateDoc(doc(env.unauthenticatedContext().firestore(),'counters','orders'),{lastNumber:100}));
 assert.equal((await getDoc(doc(admin(),'counters','orders'))).data().lastNumber,99);
});
test('invalid customer fields and forged status are rejected atomically',async()=>{
 for(const patch of [{name:'a'},{phone:'123'},{pincode:'000000'},{address:'bad'},{total:499},{items:[]},{status:'Confirmed'},{ownerId:'another'},{createdAt:0}]){
  const db=customer('alice'),id=randomUUID(),batch=writeBatch(db);
  const data={...input(),ownerId:'alice',submissionId:id,orderNumber:100,orderId:'TTC-100',status:'New',source:'TTC Crackers web store',createdAt:serverTimestamp(),...patch};
  batch.set(doc(db,'orders','TTC-100'),data);batch.update(doc(db,'counters','orders'),{lastNumber:100});batch.set(doc(db,'orderReceipts','alice','submissions',id),{orderId:'TTC-100',orderNumber:100,createdAt:serverTimestamp()});
  await assertFails(batch.commit());
 }
 assert.equal((await getDoc(doc(admin(),'counters','orders'))).data().lastNumber,99);
});
test('one counter step cannot create two orders or two receipts',async()=>{
 const db=customer('alice'),id=randomUUID(),second=randomUUID(),batch=writeBatch(db);
 const data={...input(),ownerId:'alice',submissionId:id,orderNumber:100,orderId:'TTC-100',status:'New',source:'TTC Crackers web store',createdAt:serverTimestamp()};
 batch.set(doc(db,'orders','TTC-100'),data);batch.set(doc(db,'orders','TTC-101'),{...data,orderNumber:101,orderId:'TTC-101',submissionId:second});batch.update(doc(db,'counters','orders'),{lastNumber:100});
 for(const [submission,num] of [[id,100],[second,101]])batch.set(doc(db,'orderReceipts','alice','submissions',submission),{orderId:`TTC-${num}`,orderNumber:num,createdAt:serverTimestamp()});
 await assertFails(batch.commit());
});
test('only admin can update status, not prices/customer data or delete orders',async()=>{
 await submit('alice');const ref=doc(admin(),'orders','TTC-100');
 await assertSucceeds(updateDoc(ref,{status:'Confirmed',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{status:'Paid',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{total:1,status:'Completed',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(ref,{address:'replaced address',updatedAt:serverTimestamp()}));
 await assertFails(updateDoc(doc(customer('alice'),'orders','TTC-100'),{status:'Cancelled',updatedAt:serverTimestamp()}));
 await assertFails(deleteDoc(ref));
});
