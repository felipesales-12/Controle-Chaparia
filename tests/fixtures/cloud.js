// Browser QA only. Replaces cloud.js in work/e2e/js/app.js, never in dist/.
let data=null,user=null,connected=true,saving=false,initialized=false;
const listeners=new Set();
const emit=()=>listeners.forEach(fn=>fn(cloudState()));
export const subscribeCloud=fn=>{listeners.add(fn);return()=>listeners.delete(fn);};
export const cloudState=()=>({data,authenticated:!!user,email:user?.email||'',configured:true,loaded:!!data&&!!user,connected,status:user?(connected?'synced':'offline'):'login-required',mode:'cloud',saving,error:''});
export async function initializeCloud(){
  if(initialized)return;initialized=true;
  const stored=sessionStorage.getItem('qa-email');if(stored)user={uid:stored,email:stored};
  const response=await fetch('/__test/data');data=await response.json();
  new EventSource('/__test/events').onmessage=event=>{data=JSON.parse(event.data);emit();};
  window.__qa={expire:()=>{user=null;sessionStorage.removeItem('qa-email');emit();},disconnect:()=>{connected=false;emit();},reconnect:()=>{connected=true;emit();}};
  emit();
}
export async function signIn(email,password){if(password!=='valid-password')throw Error('E-mail ou senha inválidos.');user={uid:email,email};sessionStorage.setItem('qa-email',email);emit();}
export async function signOut(){if(saving)throw Error('Aguarde a gravação.');user=null;sessionStorage.removeItem('qa-email');emit();}
export async function sendRecovery(){}
export async function updatePassword(){}
export async function mutate(command){
  if(!user||!connected)throw Error('Sem conexão. A operação não foi enviada.');
  if(saving)throw Error('Aguarde a confirmação anterior.');saving=true;emit();
  try{const response=await fetch('/__test/mutate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({command,actor:user})});const result=await response.json();if(!response.ok)throw Error(result.error);data=result;emit();}
  finally{saving=false;emit();}
}
export const cloudDatabase={
  all:async()=>Object.values(data?.tasks||{}).map(t=>({...t,completedAt:t.completedAt??null})),
  add:task=>mutate({type:'task-add',task}),put:task=>mutate({type:'task-put',task}),
  remove:(id,revision)=>mutate({type:'task-remove',id,revision}),
  replace:(tasks,_settings,expected=JSON.stringify(data.tasks||{}))=>mutate({type:'task-replace',tasks,expected})
};
