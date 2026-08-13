import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createKafkaOutboxPublisher } from '../src/services/kafka-outbox-publisher.js';
import { streamJobEvents } from '../src/services/sse-service.js';
import { createWebhookDispatcher, signWebhook } from '../src/services/webhook-dispatcher.js';

test('Kafka outbox publishes ordered reference-only events keyed by job and marks exact event IDs', async () => {
  let batch, marked; const events=[{event_id:'e1',schema_version:'1.0',tenant_id:'t',aggregate_id:'j',sequence:1,event_type:'job.accepted',created_at:new Date(),payload:{jobId:'j',status:'ACCEPTED'}},{event_id:'e2',schema_version:'1.0',tenant_id:'t',aggregate_id:'j',sequence:2,event_type:'job.status-changed',created_at:new Date(),payload:{jobId:'j',status:'RUNNING'}}];
  const publisher=createKafkaOutboxPublisher({tenantId:'t',topic:'jobs',batchSize:10,repository:{async claimForKafka(){return events;},async markPublished(x){marked=x;}},producer:{async send(x){batch=x;}}});
  assert.deepEqual(await publisher.runOnce(),{claimed:2,published:2});assert.deepEqual(marked.eventIds,['e1','e2']);assert.deepEqual(batch.messages.map(x=>x.key),['j','j']);assert.deepEqual(batch.messages.map(x=>JSON.parse(x.value).sequence),[1,2]);
});

test('SSE resumes after numeric Last-Event-ID and emits event identity', async () => {
  const response=new EventEmitter();response.headers={};response.set=(x)=>Object.assign(response.headers,x);response.flushHeaders=()=>{};response.output='';response.write=(x)=>{response.output+=x;return true;};response.end=()=>{};
  streamJobEvents({repository:{async listJobEvents({afterSequence}){assert.equal(afterSequence,4);return[{event_id:'e5',event_type:'job.progress',schema_version:'1.0',sequence:5,payload:{progress:50},created_at:new Date()}];}},tenantId:'t',jobId:'j',afterSequence:4,response,heartbeatMs:10000,pollMs:10000});
  await new Promise(resolve=>setImmediate(resolve));response.emit('close');assert.match(response.output,/id: 5/);assert.match(response.output,/"eventId":"e5"/);assert.match(response.output,/"eventType":"job.progress"/);
});

test('webhook signature is deterministic and outage exhausts into DLQ once', async () => {
  assert.equal(signWebhook('secret','1','{}'),signWebhook('secret','1','{}'));const dlq=[];let failure;
  const dispatcher=createWebhookDispatcher({tenantId:'t',clock:()=>new Date(0),config:{url:'https://hooks.example.test',secret:'secret',timeoutMs:100,maxAttempts:2,retryInitialDelayMs:10,retryMaxDelayMs:100},sender:async()=>{throw new Error('down');},dlqPublisher:async x=>dlq.push(x),repository:{async enqueueTerminal(){},async claim(){return[{id:'d1',attempt:2,event:{event_id:'e1',aggregate_id:'j',sequence:3,created_at:new Date(),payload:{status:'SUCCEEDED',outcome:'PARTIAL'}}}];},async failed(x){failure=x;}}});
  assert.deepEqual(await dispatcher.runOnce(),{claimed:1,delivered:0,failed:0,dlq:1});assert.equal(failure.dlq,true);assert.equal(dlq[0].resultUrl,'/api/v1/jobs/j/result');assert.equal(Object.hasOwn(dlq[0],'result'),false);
});
