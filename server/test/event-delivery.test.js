import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { createKafkaOutboxPublisher } from '../src/services/kafka-outbox-publisher.js';
import { streamJobEvents } from '../src/services/sse-service.js';
import { createWebhookDispatcher, signWebhook } from '../src/services/webhook-dispatcher.js';

test('Kafka outbox publishes ordered reference-only events keyed by job and marks exact event IDs', async () => {
  let batch, marked; const events=[{event_id:'e1',schema_version:'1.0',tenant_id:'t',aggregate_id:'j',sequence:1,event_type:'job.accepted',created_at:new Date(),payload:{jobId:'j',status:'ACCEPTED'}},{event_id:'e2',schema_version:'1.0',tenant_id:'t',aggregate_id:'j',sequence:2,event_type:'job.status-changed',created_at:new Date(),payload:{jobId:'j',status:'RUNNING'}}];
  const publisher=createKafkaOutboxPublisher({tenantId:'t',topic:'jobs',batchSize:10,sourceSite:'dc-a',repository:{async claimForKafka(){return events;},async markPublished(x){marked=x;}},producer:{async send(x){batch=x;}}});
  const messages = () => batch.messages.map((message) => JSON.parse(message.value));
  assert.deepEqual(await publisher.runOnce(),{claimed:2,published:2});assert.deepEqual(marked.eventIds,['e1','e2']);assert.deepEqual(batch.messages.map(x=>x.key),['j','j']);assert.deepEqual(messages().map(x=>x.sequence),[1,2]);
  assert.equal(messages()[0].eventType, 'job.accepted'); assert.equal(messages()[0].type, undefined); assert.equal(messages()[0].timestamp, undefined);
  assert.deepEqual(messages()[0].source, { service: 'reqai-event-worker', site: 'dc-a', instance: null }); assert.equal(messages()[0].data.status, 'ACCEPTED');
});

test('SSE resumes after numeric Last-Event-ID and emits event identity', async () => {
  const response=new EventEmitter();response.headers={};response.set=(x)=>Object.assign(response.headers,x);response.flushHeaders=()=>{};response.output='';response.write=(x)=>{response.output+=x;return true;};response.end=()=>{};
  streamJobEvents({repository:{async listJobEvents({afterSequence}){assert.equal(afterSequence,4);return[{event_id:'e5',event_type:'job.progress',schema_version:'1.0',sequence:5,payload:{progress:50},created_at:new Date('2026-01-01T00:00:00Z')}];}},tenantId:'t',jobId:'j',afterSequence:4,response,heartbeatMs:10000,pollMs:10000,sourceSite:'dc-a'});
  await new Promise(resolve=>setImmediate(resolve));response.emit('close');const data=JSON.parse(response.output.match(/data: (.+)\n\n/)[1]);assert.match(response.output,/id: 5/);assert.equal(data.eventId,'e5');assert.equal(data.eventType,'job.progress');assert.equal(data.tenantId,'t');assert.equal(data.jobId,'j');assert.equal(data.occurredAt,'2026-01-01T00:00:00.000Z');assert.deepEqual(data.source,{service:'reqai-api',site:'dc-a',instance:null});assert.equal(data.data.progress,50);assert.equal(data.timestamp,undefined);
});

test('webhook signature is deterministic and outage exhausts into DLQ once', async () => {
  assert.equal(signWebhook('secret','1','{}'),signWebhook('secret','1','{}'));const dlq=[];let failure;
  const dispatcher=createWebhookDispatcher({tenantId:'t',clock:()=>new Date(0),config:{url:'https://hooks.example.test',secret:'secret',timeoutMs:100,maxAttempts:2,retryInitialDelayMs:10,retryMaxDelayMs:100},sender:async()=>{throw new Error('down');},dlqPublisher:async x=>dlq.push(x),repository:{async enqueueTerminal(){},async claim(){return[{id:'d1',attempt:2,event:{event_id:'e1',aggregate_id:'j',sequence:3,created_at:new Date(),payload:{status:'SUCCEEDED',outcome:'PARTIAL'}}}];},async failed(x){failure=x;}}});
  assert.deepEqual(await dispatcher.runOnce(),{claimed:1,delivered:0,failed:0,dlq:1});assert.equal(failure.dlq,true);assert.equal(dlq[0].resultUrl,'/api/v1/jobs/j/result');assert.equal(Object.hasOwn(dlq[0],'result'),false);
});
