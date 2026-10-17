import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {Script} from 'node:vm';
const root=new URL('../',import.meta.url);
test('store inline script parses and local assets exist',async()=>{
 const html=await readFile(new URL('index.html',root),'utf8');
 const inline=[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
 assert.equal(inline.length,1);new Script(inline[0][1]);
 const assets=new Set([...html.matchAll(/(?:src|href)="((?:images\/|admin\.html)[^"]*)"/g)].map(m=>m[1]));
 for(const file of assets)await access(new URL(file,root));
 const products=JSON.parse(html.match(/const PRODUCTS = (.*);\n/)[1]);
 assert.ok(products.length>100);assert.equal(new Set(products.map(p=>p.id)).size,products.length);
 assert.ok(!html.includes('ttc_order_sequence'));assert.ok(html.includes('await saveOrderToBackend'));
});
test('admin renders untrusted values through text nodes and has a loading error fallback',async()=>{
 const source=await readFile(new URL('admin.js',root),'utf8');
 assert.ok(!source.includes('innerHTML'));assert.ok(!source.includes('insertAdjacentHTML'));
 assert.ok(source.includes('node.textContent'));assert.ok(source.includes('clearPrivateData'));
 const html=await readFile(new URL('admin.html',root),'utf8');assert.ok(html.includes('noindex,nofollow'));assert.ok(html.includes('import("./admin.js").catch'));
});
