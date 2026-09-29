const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

const source=fs.readFileSync(path.resolve(__dirname,'../layer1-integration.js'),'utf8');
let clickHandler,assigned=null;
const anchor={tagName:'A',textContent:'Unified Spatial View',attrs:{},setAttribute(k,v){this.attrs[k]=v;}};
const button={tagName:'BUTTON',textContent:'Unified Spatial View'};
const document={
 currentScript:{src:'https://example.test/praman/Unified%20Spatial%20View/layer1-integration.js'},
 readyState:'complete',
 querySelectorAll(){return [anchor,button];},
 addEventListener(type,fn,_opts){if(type==='click')clickHandler=fn;}
};
const window={location:{assign(url){assigned=url;}}};
vm.runInNewContext(source,{document,window,URL});
const expected='https://example.test/praman/Unified%20Spatial%20View/index.html';
assert.equal(anchor.attrs.href,expected);
let prevented=false,stopped=false;
clickHandler({target:{closest(){return button;}},preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
assert.equal(prevented,true);
assert.equal(stopped,true);
assert.equal(assigned,expected);
console.log('PASS: Layer 1 bridge rewrites anchors and overrides competing legacy click handlers with the direct Unified Spatial View entry.');
