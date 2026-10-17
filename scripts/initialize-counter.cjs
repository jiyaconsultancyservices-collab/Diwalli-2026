// Run once after rules deployment. Safe to repeat: never overwrites a counter or existing orders.
const base = require.resolve('firebase-tools/package.json').replace(/package\.json$/, 'lib/');
const project = 'ttc-crackers-orders';
(async () => {
  const account = require(base + 'auth').getGlobalDefaultAccount();
  if (account?.user?.email !== 'jiyaconsultancyservices@gmail.com') throw new Error('Sign in to Firebase with the TTC administrator account first.');
  await require(base + 'requireAuth').requireAuth({...account, project});
  const client = new (require(base + 'apiv2').Client)({urlPrefix:'https://firestore.googleapis.com',auth:true});
  const opts = {skipLog:{resBody:true},headers:{'x-goog-user-project':project}};
  const root = `/v1/projects/${project}/databases/(default)/documents`;
  try {
    const current = (await client.get(`${root}/counters/orders`,opts)).body;
    console.log(`Counter already exists; preserved at ${current.fields.lastNumber.integerValue}.`);
    return;
  } catch (error) { if (error.status !== 404 && error.context?.response?.statusCode !== 404 && !error.message.includes('404')) throw error; }
  const existing = (await client.post(`${root}:runQuery`,{structuredQuery:{from:[{collectionId:'orders'}],select:{fields:[{fieldPath:'orderNumber'}]},limit:1}},opts)).body;
  if (existing.some(row=>row.document)) throw new Error('Orders already exist. Refusing to reset or guess the starting number.');
  await client.patch(`${root}/counters/orders`,{fields:{lastNumber:{integerValue:'99'}}},{...opts,queryParams:{'currentDocument.exists':'false'}});
  console.log('Initialized counter: the first backend order will be TTC-100.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
