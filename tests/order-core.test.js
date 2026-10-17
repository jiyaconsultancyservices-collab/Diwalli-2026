import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeOrder, pendingSubmission, whatsappMessage} from '../order-core.js';
const input=()=>({name:'Demo Customer',phone:'9000000000',address:'Test address, not for delivery',pincode:'600069',items:[{id:'TTC001',name:'Demo product',price:100,quantity:5,lineTotal:500}],total:500});
test('normalizes a frozen checkout snapshot without changing the input',()=>{
 const raw=input(),copy=JSON.stringify(raw);const order=normalizeOrder(raw);
 assert.equal(order.total,500);assert.equal(JSON.stringify(raw),copy);assert.notEqual(order.items,raw.items);
});
test('rejects invalid quantities, duplicate products and inconsistent totals',()=>{
 for(const change of [o=>o.items[0].quantity=-1,o=>o.items[0].quantity=1.5,o=>o.total=1,o=>o.items[0].price=NaN,o=>o.items.push({...o.items[0]}),o=>o.phone='1000000000',o=>o.pincode='000000',o=>o.name='x',o=>o.address='x',o=>o.items=[]]){
  const order=input();change(order);assert.throws(()=>normalizeOrder(order));
 }
});
test('same draft reuses the id; changed cart or checkout account creates a new id',()=>{
 const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
 const previous=pendingSubmission(null,'hash','customer',()=>id);
 assert.equal(pendingSubmission(previous,'hash','customer',()=>other),previous);
 assert.equal(pendingSubmission(previous,'newhash','customer',()=>other).id,other);
 assert.equal(pendingSubmission(previous,'hash','different',()=>other).id,other);
 assert.equal(pendingSubmission({...previous,id:'../../bad'},'hash','customer',()=>other).id,other);
});
test('WhatsApp includes the saved id and the same items and total',()=>{
 const message=whatsappMessage(normalizeOrder(input()),'TTC-100');
 assert.match(message,/Order ID:\* TTC-100/);assert.match(message,/Demo product x5 = ₹500/);assert.match(message,/Total: ₹500/);assert.ok(!message.includes('\uFFFD'));
});
