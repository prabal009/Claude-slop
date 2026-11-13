import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Language, ShopkeeperService, Snapshot } from './types';
import { createLocalService } from './services/localService';
import { translate } from './i18n/dictionary';

import { validateSnapshot } from './services/validation';
type Toast = {id:number;message:string;kind:'error'|'success'|'info'};
interface PortalState {
 snapshot:Snapshot; service:ShopkeeperService;
 run:(operation:()=>Promise<Snapshot>,success?:string)=>Promise<boolean>;
 notify:(message:string,kind?:Toast['kind'])=>void;
 t:(key:string)=>string; language:Language; setLanguage:(value:Language)=>void;
 theme:'light'|'dark'; setTheme:(value:'light'|'dark')=>void;
}
const Context = createContext<PortalState|null>(null);
export function usePortal():PortalState { const value=useContext(Context); if(!value) throw new Error('Shopkeeper provider is unavailable'); return value; }
function preference(key:string):string|null { try{return localStorage.getItem(`printq.${key}`);}catch{return null;} }
export function PortalProvider({children,service:injected}:{children:ReactNode;service?:ShopkeeperService}) {
 const service = useMemo(()=>injected??createLocalService(),[injected]);
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
 const [error,setError]=useState(false); const [attempt,setAttempt]=useState(0);
 const [language,setLanguageState]=useState<Language>(()=>{const v=preference('language');return v==='hi'||v==='kn'?v:'en';});
 const [theme,setThemeState]=useState<'light'|'dark'>(()=>preference('theme')==='dark'?'dark':'light');
 const [toasts,setToasts]=useState<Toast[]>([]); const serial=useRef(0); const request=useRef(0);
 const t=useCallback((key:string)=>translate(key,language),[language]);
 const notify=useCallback((message:string,kind:Toast['kind']='info')=>{ const id=++serial.current;setToasts(v=>[...v.slice(-3),{id,message,kind}]); },[]);
 const savePreference=useCallback((key:string,value:string)=>{try{localStorage.setItem(`printq.${key}`,value);}catch{notify('Preferences could not be saved. Changes apply to this session only.','error');}},[notify]);
 const setLanguage=useCallback((v:Language)=>{setLanguageState(v);savePreference('language',v);},[savePreference]);
 const setTheme=useCallback((v:'light'|'dark')=>{setThemeState(v);savePreference('theme',v);},[savePreference]);
 useEffect(()=>{
  const previousLang=document.documentElement.lang;
  const previousTheme=document.documentElement.dataset.theme;
  return ()=>{
   document.documentElement.lang=previousLang;
   if(previousTheme===undefined) delete document.documentElement.dataset.theme;
   else document.documentElement.dataset.theme=previousTheme;
  };
 },[]);
 useEffect(()=>{document.documentElement.lang=language;document.documentElement.dataset.theme=theme;},[language,theme]);
 useEffect(()=>{let alive=true; const load=async(initial=false)=>{const n=++request.current;try{const next=initial?await service.initialize():await service.getQueueSnapshot();validateSnapshot(next);if(alive&&n===request.current){setSnapshot(next);setError(false);}}catch(e){if(alive){if(initial){setError(true);notify(e instanceof Error?e.message:'Could not open local data.','error');}else notify('Could not refresh local data. Retry your last action.','error');}}};
 void load(true); const unsubscribe=service.subscribeToJobUpdates(()=>void load()); const timer=injected?undefined:setInterval(()=>void load(),15000);
 return ()=>{alive=false;unsubscribe();clearInterval(timer);};
 },[service,injected,attempt,notify]);
 useEffect(()=>()=>{if(!injected)service.dispose();},[service,injected]);
 const run=useCallback(async(operation:()=>Promise<Snapshot>,success='Update saved')=>{try{const next=await operation();validateSnapshot(next);++request.current;setSnapshot(next);notify(success,'success');return true;}catch(e){notify(e instanceof Error?e.message:'Operation failed. Try again.','error');try{const next=await service.getQueueSnapshot();validateSnapshot(next);++request.current;setSnapshot(next);}catch{/* Keep last valid state visible; original error remains announced. */}return false;}},[notify,service]);
 return <><div className="toast-region" aria-label={t('Notifications')}>{toasts.map(toast=><div className={`toast ${toast.kind}`} key={toast.id} role={toast.kind==='error'?'alert':'status'}><span>{t(toast.message)}</span><button className="icon-button" aria-label={t('Dismiss notification')} onClick={()=>setToasts(v=>v.filter(item=>item.id!==toast.id))}>×</button></div>)}</div>{snapshot?<Context.Provider value={{snapshot,service,run,notify,t,language,setLanguage,theme,setTheme}}>{children}</Context.Provider>:<main className="startup"><div className="brand-mark">Q</div><h1>PrintQ</h1>{error?<><p role="alert">{t('Local storage could not be opened. Check browser storage permissions, then retry.')}</p><button className="button primary" onClick={()=>{setError(false);setAttempt(v=>v+1);}}>{t('Retry')}</button></>:<p role="status">{t('Loading your workspace…')}</p>}</main>}</>;
}
