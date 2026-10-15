import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const vkSource = html.slice(html.indexOf('const VK = {'), html.indexOf('// ?dbg=1:'));
const inputSource = html.slice(html.indexOf('function installInput(memory, block) {'), html.lastIndexOf('</script>'));
const events = new Map();
class Element {
  constructor(social = false) { this.social = social; }
  closest(selector) { return this.social && selector === '#social-links' ? this : null; }
}
const socialLink = new Element(true);
const document = { activeElement: socialLink, hasFocus: () => false, pointerLockElement: null, getElementById(){return null;}, addEventListener(type, handler) { events.set('document:' + type, handler); } };
let focusCount = 0;
const canvas = new Element();
canvas.dataset = {};
canvas.getBoundingClientRect = () => ({left:0,top:0,width:1280,height:720});
canvas.focus = () => { document.activeElement = canvas; focusCount++; };
canvas.addEventListener = (type, handler) => events.set('canvas:' + type, handler);
canvas.requestPointerLock = () => Promise.resolve();
const memory = { buffer: new SharedArrayBuffer(2048) };
const context = vm.createContext({
  Element, document, canvas, Atomics, Uint8Array, Int32Array, Uint16Array,
  q: new URLSearchParams(), startSize: [1280, 720], startMode: 0, startModeWord: null,
  touchEnabled: false, mobileInput: null, mobileGameReady: false,
  installMobileControls: () => ({setVisible(){},reset(){}}),
  wantSize: () => [1280, 720], postLog() {}, setTimeout, clearTimeout,
  addEventListener: (type, handler) => events.set(type, handler),
});
vm.runInContext(vkSource + '\n' + inputSource + '\ninstallInput(memory, 0);'.replace('memory', 'testMemory'), vm.createContext({ ...context, testMemory: memory }));
const keys = new Uint8Array(memory.buffer, 0, 256);
const words = new Int32Array(memory.buffer, 256, 10);
const keyEvent = (code, key, target = socialLink) => ({code, key, target, repeat:false, ctrlKey:false, altKey:false, shiftKey:false, metaKey:false, prevented:false, preventDefault(){this.prevented=true;}});

for (const key of ['W', 'A', 'S', 'D']) {
  document.activeElement = socialLink;
  const down = keyEvent('Key' + key, key.toLowerCase());
  events.get('keydown')(down);
  assert.equal(keys[key.charCodeAt(0)], 128, key + ' reaches the engine from social-link focus');
  assert.equal(document.activeElement, canvas);
  assert.equal(words[6], 1, 'game focus is restored');
  events.get('keyup')(keyEvent('Key' + key, key.toLowerCase(), canvas));
  assert.equal(keys[key.charCodeAt(0)], 0, key + ' is released');
}
document.activeElement = socialLink;
const enter = keyEvent('Enter', 'Enter');
events.get('keydown')(enter);
assert.equal(enter.prevented, false, 'Enter still activates the social link normally');
assert.equal(document.activeElement, socialLink);

events.get('canvas:mousedown')({button:0,clientX:100,clientY:100,preventDefault(){}});
assert.equal(document.activeElement, canvas, 'mouse click restores canvas focus');
assert.equal(words[6], 1);
assert.equal(words[7], 1, 'relative camera mode is active even without pointer lock');
events.get('mousemove')({target:canvas,clientX:130,clientY:112,movementX:30,movementY:12});
assert.equal(words[2], 30, 'horizontal mouse movement reaches the camera');
assert.equal(words[3], 12, 'vertical mouse movement reaches the camera');
document.pointerLockElement = canvas;
events.get('document:pointerlockchange')();
events.get('mousemove')({target:canvas,clientX:0,clientY:0,movementX:-8,movementY:5});
assert.equal(words[2], -8, 'captured mouse uses raw relative movement');
assert.equal(words[3], 5);
document.pointerLockElement = null;
events.get('document:pointerlockchange')();
assert.equal(words[7], 0, 'releasing the pointer exits camera capture');
events.get('mousemove')({target:canvas,clientX:500,clientY:400,movementX:370,movementY:288});
assert.equal(words[2], 0, 'an uncaptured cursor cannot snap the camera');
assert.equal(words[3], 0);
canvas.requestPointerLock = () => Promise.reject(new Error('Capture unavailable'));
events.get('canvas:mousedown')({button:0,clientX:500,clientY:400,preventDefault(){}});
await new Promise(resolve => setImmediate(resolve));
assert.equal(canvas.dataset.mouseMode, 'free-look', 'capture rejection retains the fallback camera');
events.get('mousemove')({target:canvas,clientX:480,clientY:390,movementX:-20,movementY:-10});
assert.equal(words[2], -20);
assert.equal(words[3], -10);
events.get('keydown')(keyEvent('Escape','Escape',canvas));
assert.equal(words[7], 0, 'Escape releases the fallback camera');
events.get('keydown')(keyEvent('KeyW','w',canvas));
events.get('blur')();
assert.equal(keys[87], 0, 'losing focus releases held movement');
assert.equal(words[6], 0);
assert.equal(words[7], 0);
assert.ok(focusCount >= 5);
console.log('Verified WASD, focus, free-look camera, captured camera, pointer release, blur cleanup, and social keyboard navigation.');
