// Independent of the module bundle: a missing or invalid script must never
// leave the login button disabled without an explanation or recovery action.
(() => {
  let timer;
  const ready = () => document.documentElement.dataset.appReady === 'true';
  const complete = () => { clearTimeout(timer); const button=document.getElementById('startup-reload'); if(button)button.hidden=true; };
  const fail = () => {
    if (ready()) return;
    const message=document.getElementById('login-status'),button=document.getElementById('startup-reload');
    if (!message || !button) return;
    message.textContent='Não foi possível carregar o aplicativo. Clique em Recarregar o sistema para buscar a versão atualizada.';
    message.classList.add('inline-error');button.hidden=false;
  };
  const start = () => {
    document.documentElement.dataset.startupGuard='active';
    document.getElementById('startup-reload')?.addEventListener('click', () => {
      const url=new URL(location.href);url.searchParams.set('atualizar',String(Date.now()));location.replace(url.href);
    });
    if (ready()) complete(); else timer=setTimeout(fail,12000);
  };
  document.addEventListener('chaparia:ready',complete);
  window.addEventListener('error',event=>{if(event.target?.tagName==='SCRIPT'||event.message)fail();},true);
  window.addEventListener('unhandledrejection',fail);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
