import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { installMobileControls } from './assets/mobile-controls.js';

class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.style = {}; this.hidden = false; this.attributes = new Map(); this.listeners = new Map(); this.classes = new Set(); this.classList = { toggle: (name, active) => active ? this.classes.add(name) : this.classes.delete(name) }; }
  addEventListener(type, callback) { if (!this.listeners.has(type)) this.listeners.set(type, []); this.listeners.get(type).push(callback); }
  fire(type, event = {}) { for (const callback of this.listeners.get(type) || []) callback({target:this,pointerType:'touch',preventDefault(){},...event}); }
  setPointerCapture(id) { this.captured = id; }
  setAttribute(name, value) { this.attributes.set(name, value); }
  hasAttribute(name) { return name === 'data-menu-toggle' && this.dataset.menuToggle !== undefined; }
  closest() { return null; }
  getBoundingClientRect() { return {left:20,top:180,width:120,height:120}; }
}
const root = new Element(), stick = new Element(), thumb = new Element(), panel = new Element(), fullscreen = new Element();
panel.hidden = true;
const controls = [
  {key:'ShiftLeft'}, {key:'Space'}, {key:'KeyF'}, {key:'KeyR'}, {key:'KeyQ'}, {key:'KeyE'}, {key:'Tab'},
  {mouse:'0'}, {mouse:'1'}, {key:'Escape',menuToggle:''}, {key:'ArrowUp'}, {key:'Enter'}, {key:'Backspace'},
].map(dataset => new Element(dataset));
const findKey = code => controls.find(button => button.dataset.key === code);
const findMouse = button => controls.find(element => element.dataset.mouse === String(button));
root.querySelector = selector => ({'[data-stick]':stick,'[data-stick-thumb]':thumb,'[data-menu-panel]':panel,'[data-fullscreen]':fullscreen})[selector];
root.querySelectorAll = () => controls;
const windowEvents = new Element(), documentEvents = new Element();
const document = {hidden:false,activeElement:null,pointerLockElement:null,hasFocus:()=>true,getElementById:id=>id==='touch-controls'?root:null,addEventListener:(type,callback)=>documentEvents.addEventListener(type,callback)};
const canvas = new Element();
canvas.focus = () => { document.activeElement = canvas; };
canvas.requestPointerLock = () => Promise.resolve();
canvas.getBoundingClientRect = () => ({left:0,top:0,width:844,height:390});
const memory = {buffer:new SharedArrayBuffer(2048)};
const html = readFileSync(new URL('./index.html', import.meta.url),'utf8');
const vk = html.slice(html.indexOf('const VK = {'),html.indexOf('// ?dbg=1:'));
const input = html.slice(html.indexOf('function installInput(memory, block) {'),html.lastIndexOf('</script>'));
const context = vm.createContext({Element,document,canvas,Atomics,Uint8Array,Int32Array,Uint16Array,installMobileControls,memory,touchEnabled:true,mobileInput:null,mobileGameReady:true,startSize:[844,390],startMode:0,startModeWord:null,wantSize:()=>[844,390],q:new URLSearchParams(),postLog(){},setTimeout,clearTimeout,addEventListener:(type,callback)=>windowEvents.addEventListener(type,callback)});
vm.runInContext(vk+'\n'+input+'\ninstallInput(memory,0);',context);
const keys = new Uint8Array(memory.buffer,0,256), words = new Int32Array(memory.buffer,256,10), text = new Uint16Array(memory.buffer,296,64);
const pointer = (id,x=80,y=240) => ({pointerId:id,clientX:x,clientY:y});
const keyEvent = code => ({code,key:code==='KeyW'?'w':code,repeat:false,ctrlKey:false,shiftKey:false,metaKey:false,target:canvas});
assert.equal(root.hidden,false,'controls appear after the game is ready');
stick.fire('pointerdown',pointer(1,80,200));
assert.equal(keys[87],128,'joystick forward reaches the actual WASM input block');
stick.fire('pointermove',pointer(1,120,200));
assert.equal(keys[68],128,'diagonal forward-right presses both movement keys');
stick.fire('pointerdown',pointer(99,40,280));
stick.fire('pointercancel',pointer(99));
assert.equal(keys[87],128,'a second finger cannot steal the movement stick');
findKey('ShiftLeft').fire('pointerdown',pointer(2));
canvas.fire('pointerdown',pointer(3,400,140));
canvas.fire('pointermove',pointer(3,430,154));
findMouse(1).fire('pointerdown',pointer(4));
findMouse(0).fire('pointerdown',pointer(5));
assert.equal(keys[160],128,'run works while moving');
assert.equal(words[2],45,'touch drag reaches horizontal relative camera input');
assert.equal(words[3],21,'touch drag reaches vertical relative camera input');
assert.equal(words[7],1,'touch look activates relative camera mode without pointer lock');
assert.equal(words[5],3,'aim and fire work at the same time as movement and camera');
findMouse(0).fire('pointercancel',pointer(5));
assert.equal(words[5],2,'releasing fire keeps aim held');
findMouse(1).fire('lostpointercapture',pointer(4));
assert.equal(words[5],0,'lost capture releases aim');
canvas.fire('pointercancel',pointer(3));
canvas.fire('pointermove',pointer(3,800,350));
assert.equal(words[2],45,'a cancelled camera finger cannot keep rotating the camera');
windowEvents.fire('keydown',keyEvent('KeyW'));
stick.fire('pointerup',pointer(1));
assert.equal(keys[87],128,'touch release cannot release a physical keyboard key');
windowEvents.fire('keyup',keyEvent('KeyW'));
assert.equal(keys[87],0);
stick.fire('pointerdown',pointer(6,80,200));
windowEvents.fire('keydown',keyEvent('KeyW'));
windowEvents.fire('keyup',keyEvent('KeyW'));
assert.equal(keys[87],128,'keyboard release cannot release a held touch direction');
stick.fire('pointercancel',pointer(6));
assert.equal(keys[87],0,'cancelled joystick releases movement');
findKey('Space').fire('pointerdown',pointer(7));
findKey('Space').fire('pointerup',pointer(7));
assert.equal(keys[32],128,'a quick tap survives a slow frame');
await new Promise(resolve=>setTimeout(resolve,100));
assert.equal(keys[32],0,'tap releases after the minimum hold interval');
findKey('Escape').fire('pointerdown',pointer(8));
assert.equal(panel.hidden,false,'pause opens menu navigation');
findKey('Escape').fire('pointercancel',pointer(8));
const textHead = words[8];
findKey('Enter').fire('pointerdown',pointer(9));
assert.equal(keys[13],128); assert.equal(text[textHead & 63],13,'menu confirmation also reaches the text queue');
findKey('Enter').fire('pointercancel',pointer(9));
findKey('Backspace').fire('pointerdown',pointer(10));
assert.equal(text[(textHead + 1) & 63],8);
findKey('KeyF').fire('pointerdown',pointer(11));
findMouse(0).fire('pointerdown',pointer(12));
document.hidden = true; documentEvents.fire('visibilitychange');
assert.equal(keys.reduce((sum,key)=>sum+key,0),0,'hiding the page releases every key');
assert.equal(words[5],0); assert.equal(words[6],0); assert.equal(words[7],0);
document.hidden = false;
stick.fire('pointerdown',pointer(13,80,200));
windowEvents.fire('resize');
assert.equal(keys[87],0,'rotating the phone clears held touch input');
assert.equal(thumb.style.transform,'translate(0px, 0px)');
findMouse(0).fire('pointerdown',pointer(14));
windowEvents.fire('blur');
assert.equal(words[5],0,'blur clears touch fire');
assert.equal(findMouse(0).attributes.get('aria-pressed'),'false');
console.log('Verified real WASM input for multitouch movement, diagonal movement, run, look, aim/fire, menus, quick taps, mixed keyboard input, pointer cancellation, visibility, rotation, and blur.');
