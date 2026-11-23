import {SEED_PRODUCTS} from '../../shared/seed-data'
import {buildPrintHtml,toRenderModel} from '../../shared/print-layout'
import type {Product,ProductInput,ProductFilters,PrintRequest,ApiResult} from '../../shared/types'
interface Store {getItem:(key:string)=>string|null;setItem:(key:string,value:string)=>void}
const KEY='la-verdure.browser-demo.v1'
const ok=<T>(data:T):ApiResult<T>=>({ok:true,data})
const fail=(error:string)=>({ok:false,error})
export function createBrowserApi(storage:Store){
 const seed=():Product[]=>SEED_PRODUCTS.map((s,i)=>({...s,id:i+1,imagePath:`/placeholders/${s.placeholderKey}.svg`,imageSource:'Generated sample placeholder',imageIsPlaceholder:true,imageStatus:'placeholder',isActive:true,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}))
 let products=seed();try{const x=JSON.parse(storage.getItem(KEY)||'null');if(Array.isArray(x)&&x.every(p=>p&&Number.isFinite(p.id)&&typeof p.name==='string'&&typeof p.category==='string'))products=x;}catch{}
 const find=(id:number)=>products.find(p=>p.id===id)
 const save=(next:Product[])=>{try{storage.setItem(KEY,JSON.stringify(next));products=next;return true}catch{return false}}
 const missing=()=>fail('Produit introuvable dans cette démo.')
 async function updateProduct(id:number,patch:Partial<ProductInput>){const old=find(id);if(!old)return missing();const next={...old,...patch,id,updatedAt:new Date().toISOString()};if(!save(products.map(p=>p.id===id?next:p)))return fail('Le stockage du navigateur est indisponible ou plein. La modification n’a pas été enregistrée.');return ok(structuredClone(next))}
 async function previewAffiches(r:PrintRequest){const models=r.items.map(item=>{const p=find(item.productId);if(!p)throw Error('Produit introuvable');return toRenderModel(p,item.overrides,p.imagePreview||null)});return ok({html:buildPrintHtml(models,r.template,r.paperFormat,{showCutLine:r.showCutLine})})}
 async function print(r:PrintRequest){const w=window.open('','_blank');if(!w)return fail('Autorisez l’ouverture du nouvel onglet pour imprimer.');try{const result=await previewAffiches(r);w.document.open();w.document.write(result.data!.html);w.document.close();let printed=false;const show=()=>{if(!printed){printed=true;w.print()}};w.addEventListener('load',show,{once:true});setTimeout(()=>{if(w.document.readyState==='complete')show()},350);return ok(undefined)}catch(e){w.close();return fail(String(e))}}
 const unavailable=async()=>fail('Cette fonction de bureau n’est pas disponible dans la démo navigateur.')
 return {
  reset:()=>{if(!save(seed()))throw Error('Impossible de réinitialiser le stockage du navigateur.')},
  listProducts:async(f:ProductFilters={})=>ok(structuredClone(products.filter(p=>(!f.activeOnly||p.isActive)&&(!f.category||p.category===f.category)&&(!f.query||(`${p.name} ${p.storeCode}`).toLocaleLowerCase().includes(f.query.toLocaleLowerCase()))))),
  getProduct:async(id:number)=>find(id)?ok(structuredClone(find(id)!)):missing(),
  getCategories:async()=>ok([...new Set(products.map(p=>p.category))]),updateProduct,
  createProduct:async(input:ProductInput)=>{const now=new Date().toISOString();const p={...input,id:Math.max(0,...products.map(x=>x.id))+1,createdAt:now,updatedAt:now,imageStatus:'placeholder' as const};return save([...products,p])?ok(p):fail('Stockage plein : produit non enregistré.')},
  deleteProduct:async(id:number)=>save(products.filter(p=>p.id!==id))?ok(undefined):fail('Suppression non enregistrée : stockage indisponible.'),
  archiveProduct:(id:number)=>updateProduct(id,{isActive:false}),reactivateProduct:(id:number)=>updateProduct(id,{isActive:true}),
  getProductImagePreview:async(id:number)=>{const p=find(id);if(!p)return missing();let image=p.imagePreview||null;if(!image&&p.imagePath?.startsWith('/placeholders/')){try{const svg=await fetch(p.imagePath).then(r=>{if(!r.ok)throw Error('image');return r.text()});image='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)}catch{}}return ok({imagePreview:image,imageStatus:p.imageIsPlaceholder?'placeholder':'assigned',imageIsPlaceholder:p.imageIsPlaceholder})},
  clearProductImage:(id:number)=>updateProduct(id,{imagePath:null,imageIsPlaceholder:true,imageSource:'No image',...{imagePreview:null}} as Partial<ProductInput>),
  pickAndSetProductImage:async(id:number)=>{try{const file=await pickImage();if(!file)return fail('Sélection annulée.');if(file.size>5*1024*1024)return fail('Choisissez une image de moins de 5 Mo.');if(!['image/png','image/jpeg','image/webp'].includes(file.type))return fail('Utilisez une image PNG, JPEG ou WebP.');const url=URL.createObjectURL(file);try{const img=await new Promise<HTMLImageElement>((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(i);i.onerror=reject;i.src=url});const canvas=document.createElement('canvas');const scale=Math.min(1,1200/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d')!.drawImage(img,0,0,canvas.width,canvas.height);return updateProduct(id,{imagePath:null,imageSource:file.name,imageIsPlaceholder:false,...{imagePreview:canvas.toDataURL('image/jpeg',.82),imageStatus:'assigned'}} as Partial<ProductInput>)}finally{URL.revokeObjectURL(url)}}catch{return fail('Cette image n’a pas pu être lue.')}},
  useSampleImage:async(id:number)=>{const p=find(id);if(!p)return missing();try{const svg=await fetch(p.imagePath?.startsWith('/placeholders/')?p.imagePath:'/placeholders/fruits.svg').then(r=>r.text());return updateProduct(id,{imagePath:null,imageSource:'Illustration exemple',imageIsPlaceholder:false,...{imagePreview:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg),imageStatus:'assigned'}} as Partial<ProductInput>)}catch{return fail('Illustration indisponible.')}},
  countProductsWithoutImage:async()=>ok(products.filter(p=>p.imageIsPlaceholder).length),previewAffiches,
  printAffiches:print,exportPdf:async(r:PrintRequest)=>{const result=await print(r);return result.ok?ok({path:'Dialogue navigateur ouvert — choisissez Enregistrer au format PDF'}):result},
  backupDatabase:unavailable,backupDatabaseQuick:unavailable,openBackupsFolder:unavailable,restoreDatabase:unavailable,exportCsv:unavailable,openPath:unavailable,getPaths:unavailable,getReviewReport:unavailable,saveOverrides:unavailable,scanProductImages:unavailable,selectProductImageFolder:unavailable,importProductImages:unavailable,resolveDuplicateImages:unavailable,openProductImagesFolder:unavailable,
 }
}
function pickImage(){return new Promise<File|null>(resolve=>{const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/webp';input.onchange=()=>resolve(input.files?.[0]||null);input.oncancel=()=>resolve(null);input.click()})}
