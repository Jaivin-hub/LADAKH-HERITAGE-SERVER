import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { adminRouter } from '../src/admin.js';

test('hosted admin opt-in accepts configured origins and still validates mutations', async () => {
  const app = express();
  app.use('/api/admin', adminRouter({enabled:true, allowRemote:true, origins:['https://dev.ladakhheritage.com','http://localhost:5174'], baseUrl:'https://api.ladakhheritage.com'}));
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/products/invalid-id`;
  try {
    for (const origin of ['https://dev.ladakhheritage.com','http://localhost:5174']) {
      const result = await fetch(url, {method:'PATCH',headers:{Origin:origin,'Content-Type':'application/json'},body:'{}'});
      assert.equal(result.status,400);
      assert.equal((await result.json()).error,'Invalid record ID.');
    }
    for (const origin of ['', 'https://untrusted.example']) {
      const result=await fetch(url,{method:'DELETE',headers:{...(origin?{Origin:origin}:{}),'Content-Type':'application/json'},body:'{}'});
      assert.equal(result.status,403);
    }
  } finally { await new Promise(resolve => server.close(resolve)); }
});
