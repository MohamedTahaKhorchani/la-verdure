import {createBrowserApi} from './browser/api'
import DemoBar from './browser/DemoBar'
import './browser/browser.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles/app.css'

let storage: Pick<Storage,'getItem'|'setItem'>; let temporary=false;
try{storage=window.localStorage;const k='la-verdure.storage-test';storage.setItem(k,'1');window.localStorage.removeItem(k)}catch{temporary=true;let value:string|null=null;storage={getItem:()=>value,setItem:(_key,valueNext)=>{value=valueNext}}}
const browserApi=createBrowserApi(storage);window.topFruit=browserApi as unknown as Window['topFruit'];
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoBar api={browserApi} temporary={temporary}/><App />
  </StrictMode>
)
