import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';

const events=[],workers=[],progress=[];
const self={location:{origin:'https://example.test'}};
let complete;
const completed=new Promise(resolve=>{complete=resolve;});
class Worker {
  constructor(url){this.url=url;workers.push(this);}
  postMessage(data){events.push({type:'worker',url:this.url,data});}
}
const context={self,Worker,URLSearchParams,console,Uint8Array,setTimeout,navigator:{},
  BroadcastChannel:class{postMessage(data){progress.push(data);}},
  fetch:async(url,options)=>{events.push({type:'fetch',url,options});return new Response(new Uint8Array(32),{status:200});},
  WebAssembly:{instantiateStreaming:async(response)=>{await response.arrayBuffer();events.push({type:'compiled'});return {instance:{},module:{}};}},
  importScripts:()=>{self.Module.instantiateWasm({},()=>{events.push({type:'engine-start'});complete();});}
};
vm.runInNewContext(await readFile(new URL('./b/8b0b5899ed-r20261014/loader.js',import.meta.url),'utf8'),context);
self.onmessage({data:{base:'/build',args:[],lowMemory:false,cores:4}});
assert.equal(events.find(e=>e.data?.init).data.bootset,undefined,'bulk prefetch must not start before WASM downloads');
for(const worker of workers)worker.onmessage({data:{loaded:true}});
await completed;
assert.equal(events.find(e=>e.type==='fetch').options.priority,'high');
const compiled=events.findIndex(e=>e.type==='compiled');
const prefetch=events.findIndex(e=>e.data?.prefetch==='bootset.json');
const started=events.findIndex(e=>e.type==='engine-start');
assert.ok(compiled<prefetch && prefetch<started,'prefetch must start after engine compilation and before its blocking entry point');
assert.ok(progress.some(e=>e.label?.startsWith('Downloading') && e.pct>0),'progress must work when the CDN omits Content-Length');
console.log('Verified engine-first startup, high fetch priority, delayed archive prefetch, and real progress without CDN length headers.');
