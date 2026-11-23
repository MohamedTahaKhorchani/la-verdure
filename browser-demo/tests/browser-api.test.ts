import {describe,it,expect} from 'vitest'
import {createBrowserApi} from '../src/browser/api'
function memory(){let v:string|null=null;return {getItem:()=>v,setItem:(_k:string,value:string)=>{v=value}}}
describe('browser catalogue',()=>{
 it('edits persist, reset restores seed, and adapters never change each other',async()=>{const storage=memory();const a=createBrowserApi(storage);const first=(await a.listProducts()).data![0];await a.updateProduct(first.id,{name:'Demo apples'});expect((await createBrowserApi(storage).getProduct(first.id)).data!.name).toBe('Demo apples');a.reset();expect((await a.getProduct(first.id)).data!.name).toBe(first.name);});
 it('print HTML escapes catalogue names and uses real two-up layout',async()=>{const a=createBrowserApi(memory());await a.updateProduct(1,{name:'<script>alert(1)</script>'});const r=await a.previewAffiches({items:[{productId:1}],template:'modern',paperFormat:'2x-a5-portrait-on-a4-landscape',copies:1});expect(r.data!.html).toContain('&lt;script&gt;');expect(r.data!.html).not.toContain('<script>alert');expect(r.data!.html).toContain('affiche-cell');});
 it('reports blocked storage and failed writes without losing prior data',async()=>{const a=createBrowserApi({getItem:()=>'{bad',setItem:()=>{throw Error('quota')}});const old=(await a.getProduct(1)).data!.name;expect((await a.updateProduct(1,{name:'unsaved'})).ok).toBe(false);expect((await a.getProduct(1)).data!.name).toBe(old);});
})
it('preserves an intentionally empty catalogue across reload until reset',async()=>{const storage=memory();storage.setItem('la-verdure.browser-demo.v1','[]');const a=createBrowserApi(storage);expect((await a.listProducts()).data).toEqual([]);a.reset();expect((await a.listProducts()).data!.length).toBeGreaterThan(0);});
