import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
const root = 'dist'
async function files(dir, prefix = '') {
  const out = []
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const name = prefix + item.name
    if (item.isDirectory()) out.push(...await files(join(dir, item.name), name + '/'))
    else if (!['sw.js', '_headers'].includes(item.name)) out.push(name)
  }
  return out.sort()
}
const assets = await files(root)
const digest = createHash('sha256')
digest.update(await readFile(new URL(import.meta.url)))
for (const name of assets) digest.update(name).update(await readFile(join(root, name)))
const version = digest.digest('hex').slice(0, 16)
const code = `const CACHE='strikebowl-${version}';
const ROOT=new URL('./',self.location.href);
const FILES=${JSON.stringify(assets)}.map(p=>new URL(p,ROOT).href);
const STATIC=new Set(FILES);
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('strikebowl-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=='GET'||u.origin!==ROOT.origin||u.pathname.includes('/api/'))return;
  if(e.request.mode==='navigate'){
    e.respondWith(fetch(e.request).catch(()=>caches.open(CACHE).then(c=>c.match(new URL('index.html',ROOT).href))));return;
  }
  if(STATIC.has(u.href))e.respondWith(caches.open(CACHE).then(c=>c.match(e.request,{ignoreVary:true})).then(hit=>hit||fetch(e.request)));
});
`
await writeFile(join(root, 'sw.js'), code)
console.log('Offline app shell:', assets.length, 'files; version', version)
