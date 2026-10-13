import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const css=readFileSync(new URL('../adaptive-layout.css',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const sw=readFileSync(new URL('../sw.js',import.meta.url),'utf8');
const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
const config=JSON.parse(readFileSync(new URL('../app.config.json',import.meta.url),'utf8'));
assert.equal(config.version,sw.match(/const APP_VERSION = '([^']+)'/)?.[1], 'app manifest and offline runtime versions match');
assert.match(html,/href="\.\/adaptive-layout\.css"/,'responsive styles loaded last');
assert.ok(html.indexOf('href="./native-art.css"')<html.indexOf('href="./adaptive-layout.css"'),'native dimensions resolve before mobile overrides');
assert.match(sw,/\.\/adaptive-layout\.css/,'mobile layout available offline after PWA install');
assert.match(css,/@media\(max-width:699px\)/,'phone-width layout');
assert.match(css,/@media\(max-width:359px\)/,'320px devices are explicitly supported');
assert.match(css,/@media\(orientation:landscape\) and \(max-height:540px\)/,'short landscape devices remain usable');
assert.match(css,/var\(--app-viewport-height,100dvh\)/,'mobile browser viewport-height changes respected');
assert.match(css,/env\(safe-area-inset-bottom\)/,'home and bottom controls account for iOS home indicator');
assert.match(css,/\.top \.profile-control\{height:44px;width:44px\}/,'profile editor touch target');
assert.match(css,/\.restore \.tools \.tool\{[^}]*min-height:46px/,'all drawing tools reachable by finger');
assert.match(css,/\.restore \.adjust-actions \.tool\{[^}]*min-height:44px/,'undo and redo touch targets');
assert.match(css,/\.restore \.zoom-actions \.tool\{[^}]*min-height:44px/,'zoom controls are touch-sized');
assert.match(css,/\.stake-actions button\{width:44px;min-height:46px/,'coin increment/decrement buttons are usable');
assert.match(css,/\.round-view-close\{width:44px;height:44px\}/,'full-size archive viewer dismiss button');
assert.match(css,/\.museum-home\{[\s\S]*?height:100%;min-height:0/,'home stays in one viewport on tall phones');
assert.match(css,/\.mobile-preview \.gallery\.exhibition-grid\{[\s\S]*?scroll-snap-type:x mandatory/,'preview cards snap during finger swipes');
assert.match(css,/\.mobile-gallery-nav button\{[\s\S]*?height:44px/,'explicit gallery arrows are touch friendly');
assert.match(app,/function preview\(local=false\)/,'local and online preview share mobile navigation');
assert.match(app,/if\(page==='preview'&&view\.phase==='preview'&&key===lastUiKey\)return/,'network updates keep swipe position');
assert.match(app,/String\(museumOrder\.indexOf\(id\)\+1\)/,'museum numbering honours retired artworks');
assert.match(app,/data-action="preview-previous"/);
assert.match(app,/data-action="preview-next"/);

// Exercise the actual gallery navigation helpers, not a copy of their logic.
const helpers=app.slice(app.indexOf('function updateMobileGalleryNav('),app.indexOf('function preview(local=false){'));
assert.ok(helpers.startsWith('function updateMobileGalleryNav(')&&helpers.includes('function moveMobileGallery('));
const previous={disabled:false},next={disabled:false},output={textContent:''};
const nav={querySelector(selector){
 if(selector==='output')return output;
 if(selector.includes('previous'))return previous;
 if(selector.includes('next'))return next;
 throw Error('Unknown nav selector '+selector);
}};
const cards=Array.from({length:5},(_,i)=>({offsetLeft:i*285}));
const rail={children:cards,scrollLeft:0,
 parentElement:{querySelector:()=>nav},
 scrollTo({left}){this.scrollLeft=left}};
const screen={querySelector:()=>rail};
const {updateMobileGalleryNav,moveMobileGallery}=runInNewContext(
 helpers+';({updateMobileGalleryNav,moveMobileGallery})',
 {screen,page:'preview',Math,Array,Object}
);
updateMobileGalleryNav(rail);
assert.equal(output.textContent,'1 / 5');
assert.equal(previous.disabled,true);
assert.equal(next.disabled,false);
moveMobileGallery(1);updateMobileGalleryNav(rail);
assert.equal(rail.scrollLeft,285);
assert.equal(output.textContent,'2 / 5');
assert.equal(previous.disabled,false);
moveMobileGallery(1);moveMobileGallery(1);moveMobileGallery(1);
updateMobileGalleryNav(rail);
assert.equal(output.textContent,'5 / 5');
assert.equal(next.disabled,true);
moveMobileGallery(1);assert.equal(rail.scrollLeft,1140,'last card does not overscroll');
moveMobileGallery(-1);updateMobileGalleryNav(rail);
assert.equal(output.textContent,'4 / 5');
assert.equal(next.disabled,false);
console.log('ZAMAZKA MOBILE: 320px and short viewport layouts, safe areas, 44px controls, gallery swipe navigation, multiplayer stability OK');
