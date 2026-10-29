/* Cloud workspace bootloader. No sensitive keys in this file. */
const root = document.getElementById('app');
const config = globalThis.INVOICE_STUDIO_CONFIG || {};
const enc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const validConfig = /^https:\/\/[^/]+\.supabase\.co$/.test(config.supabaseUrl || '') && /^(sb_publishable_|eyJ)/.test(config.supabasePublishableKey || '');
const blankWorkspace = name => ({version:1,demo:false,business:{name,email:'',phone:'',address:'',taxId:'',logo:'',currency:'BSD',taxLabel:'VAT',taxRate:0,invoicePrefix:'INV',estimatePrefix:'EST',nextInvoice:1001,nextEstimate:1001,website:'',paymentInstructions:'',terms:'Thank you for your business.'},customers:[],items:[],documents:[],expenses:[]});
let client, session, profile, workspace, memberRole, appStarted = false;
// A password recovery callback must open the password form, not the business dashboard.
let recoveryMode = new URLSearchParams(location.search).get('type') === 'recovery' || location.hash.includes('type=recovery');
let pending=null, running=false, interrupted=false, unsaved=false, saveWaiters=[];
let members=[];
function message(text, type='error') { const n=document.getElementById('auth-message');if(n){n.textContent=text;n.className='auth-message '+type;}else alert(text); }
function page(title,description,body){root.innerHTML=`<main class="auth-screen"><div class="auth-card"><div class="auth-brand"><span class="auth-mark">▣</span><div><b>Invoice Studio</b><small>by Bahamas AI Solutions</small></div></div><h1>${enc(title)}</h1><p>${enc(description)}</p>${body}<div class="auth-message" id="auth-message" role="status"></div><div class="auth-foot">Your business data belongs to your workspace. No invoicing subscription required.<br><a href="./privacy.html">Privacy</a> · <a href="./terms.html">Terms</a></div></div></main>`;}
function loading(text='Loading your workspace…'){page('Just a moment',text,'<div class="auth-loading" aria-label="Loading"></div>');}
const cloud = {
  initialState:null, user:null, currentWorkspace:null, role:'viewer',
  isEnabled:()=>validConfig, canEdit:()=>['owner','admin','editor'].includes(memberRole),
  displayName:()=>profile?.display_name || profile?.username || session?.user?.email || 'Account',
  syncLabel:()=>interrupted?'Sync conflict — export changes':running||pending?'Saving…':'Saved to cloud',
  queueSave(next){
    if(!cloud.canEdit()){message('This workspace is view-only.');return false;}
    if(interrupted){message('Another user updated this workspace. Export your changes and reload.');return false;}
    pending=structuredClone(next);unsaved=true;syncIndicator();void drain();return true;
  },
  showMenu:()=>void showMenu('workspaces'),
  logOut:async()=>{if(unsaved){message('Your changes are still saving. Try again when the indicator says Saved to cloud.');return;}await client.auth.signOut();session=null;workspace=null;profile=null;appStarted=false;root.innerHTML='';renderLogin();},
};
globalThis.InvoiceCloud=cloud;
function syncIndicator(){const el=document.getElementById('cloud-sync');if(el)el.textContent=cloud.syncLabel();}
async function drain(){
  if(running || !workspace || !pending) return;
  running=true;
  while(pending && !interrupted){
    const payload=pending; pending=null;
    try{
      const {data,error}=await client.rpc('commit_workspace',{p_workspace_id:workspace.id,p_expected_revision:workspace.revision,p_payload:payload});
      if(error)throw error;
      workspace.revision=Number(data);workspace.data=payload;
      unsaved=!!pending;
    }catch(error){
      interrupted=true; pending=payload; unsaved=true;
      const notice=String(error?.message||error);
      alert(notice.includes('STALE_WRITE')?'A teammate updated this business before your changes were saved. Download a backup and reload before making further changes.':'Cloud saving failed. Your changes are still on this screen. Download a backup, check your connection, and retry by reloading after confirming the server saved correctly.');
    }
    syncIndicator();
  }
  running=false;syncIndicator();
  const waiters=saveWaiters;saveWaiters=[];waiters.forEach(done=>done(!unsaved));
}
const flush=async()=>{if(!unsaved)return true;if(!running)void drain();return await new Promise(resolve=>{saveWaiters.push(resolve);setTimeout(()=>{if(saveWaiters.includes(resolve)){saveWaiters=saveWaiters.filter(f=>f!==resolve);resolve(!unsaved)}},12000)});};
window.addEventListener('beforeunload',event=>{if(unsaved){event.preventDefault();event.returnValue='';}});
function renderLogin(mode='login'){
  const signup=mode==='signup', recovery=mode==='recovery', reset=mode==='reset';
  page(reset?'Choose a new password':recovery?'Reset your password':signup?'Create your free account':'Welcome back',signup?'Create invoices and manage your business from any device.':recovery?'We will email a secure password reset link.':'Everything your business needs to bill confidently.',
    `<form id="auth-form" class="auth-form">${signup?'<label>Your name<input name="full_name" autocomplete="name" maxlength="120" required></label><label>Username (3–24 characters)<input name="username" autocomplete="username" pattern="[a-zA-Z0-9_]{3,24}" maxlength="24" required></label>':''}
     ${reset?'':`<label>${signup||recovery?'Email address':'Email or username'}<input name="identifier" autocomplete="${signup?'email':'username'}" ${signup||recovery?'type="email"':'type="text"'} required></label>`}
     ${recovery?'':`<label>${reset?'New password':'Password'}<input name="password" type="password" autocomplete="${signup?'new-password':'current-password'}" minlength="10" required></label>`}
     <button type="submit" class="auth-primary">${reset?'Update password':recovery?'Send reset link':signup?'Create free account':'Sign in'}</button>
     </form>${!recovery&&!reset?`<button class="auth-google" id="google-login" type="button"><svg viewBox="0 0 48 48" width="19" height="19" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.29 5.48-4.84 7.18l7.73 6C44.34 38.03 46.98 31.87 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.5 14.5 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.97 23.97 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78z"/><path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.73-6c-2.14 1.44-4.89 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48z"/></svg> Continue with Google</button>`:''}
    <div class="auth-links">${mode==='login'?'<button type="button" data-auth="signup">Create an account</button><button type="button" data-auth="recovery">Forgot password?</button>':mode==='signup'||mode==='recovery'?'<button type="button" data-auth="login">Back to sign in</button>':''}</div>`);
  root.querySelectorAll('[data-auth]').forEach(el=>el.addEventListener('click',()=>renderLogin(el.dataset.auth)));
  root.querySelector('#auth-form').addEventListener('submit',async event=>{
    event.preventDefault();const form=event.currentTarget, f=new FormData(form), button=form.querySelector('button[type=submit]');button.disabled=true;
    try{
      const identifier=String(f.get('identifier')||'').trim(), password=String(f.get('password')||'');
      if(signup){
        const username=String(f.get('username')||'').toLowerCase();
        const {data,error}=await client.auth.signUp({email:identifier,password,options:{data:{full_name:String(f.get('full_name')||''),requested_username:username},emailRedirectTo:location.origin+location.pathname}});
        if(error)throw error;
        message(data.session?'Account created. Complete your business setup.':'Check your email to confirm your account, then sign in. If your chosen username is still available when you verify your email, it will be applied to your profile.','success');
      }else if(recovery){const {error}=await client.auth.resetPasswordForEmail(identifier,{redirectTo:location.origin+location.pathname});if(error)throw error;message('If that email has an account, a reset link will arrive shortly.','success');}
      else if(reset){const {error}=await client.auth.updateUser({password});if(error)throw error;recoveryMode=false;history.replaceState({},'',location.pathname);message('Password updated.','success');setTimeout(()=>void showWorkspaces(),700);}
      else if(identifier.includes('@')){const {error}=await client.auth.signInWithPassword({email:identifier,password});if(error)throw error;}
      else{
        const response=await client.functions.invoke('username-login',{body:{username:identifier.toLowerCase(),password}});
        if(response.error||!response.data?.access_token||!response.data?.refresh_token)throw Error('Invalid username or password.');
        const {error}=await client.auth.setSession({access_token:response.data.access_token,refresh_token:response.data.refresh_token});if(error)throw error;
      }
    }catch(error){message(error?.message||'Unable to sign in. Please retry.');}finally{button.disabled=false;}
  });
  root.querySelector('#google-login')?.addEventListener('click',async()=>{const {error}=await client.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname+(location.search||'')}});if(error)message(error.message);});
}
async function getProfile(){const r=await client.from('profiles').select('*').eq('id',session.user.id).maybeSingle();if(r.error)throw r.error;profile=r.data;const requested=session.user.user_metadata?.requested_username;
  if(profile&&!profile.username&&/^[a-z0-9_]{3,24}$/.test(requested||'')){
    const result=await client.from('profiles').update({username:requested}).eq('id',session.user.id);
    if(!result.error)profile.username=requested;
  }
}
async function getWorkspaces(){const {data,error}=await client.from('workspace_members').select('workspace_id,role,workspaces(id,name,data,revision,updated_at)').eq('user_id',session.user.id);if(error)throw error;return (data||[]).filter(x=>x.workspaces).map(x=>({...x.workspaces,role:x.role}));}
async function showWorkspaces(){
  loading();try{
    await getProfile();
    const pendingInvite=new URLSearchParams(location.search).get('invite');
    if(pendingInvite){const {error}=await client.rpc('accept_workspace_invite',{p_token:pendingInvite});if(error)message(error.message);else history.replaceState({},'',location.pathname);}
    const list=await getWorkspaces();
    if(!list.length){
      page('Set up your business','You can add more businesses or invite team members later.',`<form id="new-workspace" class="auth-form"><label>Business name<input name="business_name" maxlength="120" required placeholder="Your registered or trading name"></label><button class="auth-primary">Create business workspace</button></form><button class="text-link" type="button" id="logout-new">Sign out</button>`);
      document.getElementById('new-workspace').addEventListener('submit',async e=>{e.preventDefault();const name=new FormData(e.target).get('business_name');await createWorkspace(String(name));});
      document.getElementById('logout-new').addEventListener('click',()=>void cloud.logOut());
    }else{
      const remembered=localStorage.getItem('invoice-studio-current-workspace');
      const chosen=list.find(x=>x.id===remembered)||list[0];await selectWorkspace(chosen);
    }
  }catch(error){page('Unable to load account',error.message||'The server could not be reached.','<button class="auth-primary" id="retry">Retry</button>');document.getElementById('retry').onclick=()=>void showWorkspaces();}
}
async function createWorkspace(name){try{
  const trimmed=name.trim();if(!trimmed)throw Error('Enter a business name.');
  const {data,error}=await client.from('workspaces').insert({owner_id:session.user.id,name:trimmed,data:blankWorkspace(trimmed)}).select('id,name,data,revision').single();if(error)throw error;
  await selectWorkspace({...data,role:'owner'});
}catch(error){message(error.message);}}
async function selectWorkspace(item){
  if(unsaved && !(await flush())){alert('Your current changes have not synced. Export a backup before switching workspaces.');return;}
  workspace=item;memberRole=item.role;cloud.role=item.role;cloud.currentWorkspace=item.id;cloud.user=session.user;cloud.initialState=item.data;
  interrupted=false;pending=null;unsaved=false;localStorage.setItem('invoice-studio-current-workspace',item.id);
  if(!appStarted){appStarted=true;await import('./app.js');}
  // ESM imports are cached: always rehydrate on subsequent sign-in or workspace switch.
  if(typeof globalThis.InvoiceStudioHydrate==='function')globalThis.InvoiceStudioHydrate(item.data);
  syncIndicator();
}
async function refreshWorkspace(){const {data,error}=await client.from('workspaces').select('id,name,data,revision').eq('id',workspace.id).single();if(error)throw error;await selectWorkspace({...data,role:memberRole});}
async function showMenu(tab='workspaces'){
  if(!session)return;
  const lists=await getWorkspaces(), canManage=['owner','admin'].includes(memberRole);
  const listHtml=lists.map(x=>`<button class="team-row" data-workspace="${enc(x.id)}"><span><b>${enc(x.name)}</b><small>${enc(x.role)} ${workspace?.id===x.id?'· Active':''}</small></span><span>→</span></button>`).join('');
  let panel=`<div class="team-tabs"><button data-tab="workspaces" class="${tab==='workspaces'?'active':''}">Businesses</button><button data-tab="team" class="${tab==='team'?'active':''}">Team</button><button data-tab="account" class="${tab==='account'?'active':''}">Account</button></div>`;
  if(tab==='workspaces')panel+=`<h3>Your businesses</h3>${listHtml}<form id="add-workspace" class="auth-form mini"><label>New business name<input name="name" maxlength="120" placeholder="Business name" required></label><button class="auth-primary">Add another business</button></form>`;
  if(tab==='team'){
    const {data,error}=await client.from('workspace_members').select('user_id,role,joined_at').eq('workspace_id',workspace.id);if(error)throw error;
    const ids=(data||[]).map(x=>x.user_id),{data:people}=ids.length?await client.from('profiles').select('id,username,display_name').in('id',ids):{data:[]};
    const names=Object.fromEntries((people||[]).map(p=>[p.id,p]));
    panel+=`<h3>People at ${enc(workspace.name)}</h3><p class="mini-muted">Owners and admins invite colleagues. Editors can update records. Viewers can read and print only.</p>${(data||[]).map(m=>`<div class="team-row"><span><b>${enc(names[m.user_id]?.display_name||names[m.user_id]?.username||m.user_id.slice(0,8))}</b><small>${enc(names[m.user_id]?.username?'@'+names[m.user_id].username:m.user_id.slice(0,8))} · ${enc(m.role)}</small></span>${canManage&&m.role!=='owner'?`<button class="text-link" data-remove="${enc(m.user_id)}">Remove</button>`:''}</div>`).join('')}`;
    if(canManage)panel+=`<form class="auth-form mini" id="invite-form"><label>Invite teammate by email<input type="email" name="email" required></label><label>Permissions<select name="role"><option value="editor">Editor — invoices and records</option><option value="viewer">Viewer — read and print</option><option value="admin">Admin — manage team</option></select></label><button class="auth-primary">Generate invitation link</button><p class="mini-muted" id="invite-result">Invitations expire in 7 days. Share only with the named recipient.</p></form>`;
  }
  if(tab==='account')panel+=`<h3>Account details</h3><p>${enc(session.user.email)}</p><form class="auth-form mini" id="account-form"><label>Display name<input name="display_name" maxlength="120" value="${enc(profile?.display_name||'')}"></label><label>Username<input name="username" pattern="[a-z0-9_]{3,24}" maxlength="24" value="${enc(profile?.username||'')}" required></label><button class="auth-primary">Save profile</button></form><button class="text-link" id="signout-btn">Sign out</button>`;
  const old=document.getElementById('cloud-panel');old?.remove();
  const overlay=document.createElement('div');overlay.id='cloud-panel';overlay.className='cloud-backdrop';overlay.innerHTML=`<div class="cloud-dialog" role="dialog" aria-modal="true" aria-label="Workspace and account settings"><div class="cloud-dialog-top"><b>Manage workspace</b><button aria-label="Close" id="close-cloud">×</button></div>${panel}<div class="auth-message" id="auth-message" role="status"></div></div>`;document.body.appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay)overlay.remove()});
  overlay.querySelector('#close-cloud').onclick=()=>overlay.remove();
  overlay.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>void showMenu(b.dataset.tab));
  overlay.querySelectorAll('[data-workspace]').forEach(b=>b.onclick=async()=>{const item=lists.find(x=>x.id===b.dataset.workspace);if(item){await selectWorkspace(item);overlay.remove();}});
  overlay.querySelector('#add-workspace')?.addEventListener('submit',async e=>{e.preventDefault();await createWorkspace(new FormData(e.target).get('name'));overlay.remove();});
  overlay.querySelector('#invite-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=new FormData(e.target);const {data,error}=await client.rpc('create_workspace_invite',{p_workspace_id:workspace.id,p_email:form.get('email'),p_role:form.get('role')});if(error)return message(error.message);const url=`${location.origin}${location.pathname}?invite=${data}`;const result=document.getElementById('invite-result');result.innerHTML=`<strong>Copy this private invitation link</strong><br><input readonly aria-label="Invitation URL" value="${enc(url)}" style="width:100%" />`;result.querySelector('input').select();try{await navigator.clipboard.writeText(url);message('Invitation link copied to clipboard.','success');}catch{message('Copy and send the link to your teammate.','success');}});
  overlay.querySelectorAll('[data-remove]').forEach(b=>b.onclick=async()=>{if(!confirm('Remove this member from this workspace?'))return;const {error}=await client.rpc('remove_workspace_member',{p_workspace_id:workspace.id,p_user_id:b.dataset.remove});if(error)message(error.message);else void showMenu('team');});
  overlay.querySelector('#account-form')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target);const username=String(f.get('username')||'').toLowerCase();if(!/^[a-z0-9_]{3,24}$/.test(username))return message('Username must have 3–24 letters, numbers or underscores.');const {error}=await client.from('profiles').update({username,display_name:String(f.get('display_name')||'').trim()}).eq('id',session.user.id);if(error)message(error.code==='23505'?'Username is already taken.':error.message);else{await getProfile();message('Profile saved.','success');}});
  overlay.querySelector('#signout-btn')?.addEventListener('click',()=>{overlay.remove();void cloud.logOut();});
}
window.addEventListener('online',()=>syncIndicator());
window.addEventListener('offline',()=>{const el=document.getElementById('cloud-sync');if(el)el.textContent='Offline — edits may not sync';});
async function init(){
  if(!validConfig){page('Backend setup required','The secure cloud database and sign-in provider have not been connected yet.','<p>Deployment owner: configure <code>config.js</code> with a dedicated Supabase project publishable key, apply the database schema, and enable Google login. Do not accept customer data until this is complete.</p>');return;}
  loading('Connecting securely…');
  try{
    const {createClient}=await import('https://esm.sh/@supabase/supabase-js@2.98.0?bundle');
    client=createClient(config.supabaseUrl,config.supabasePublishableKey,{auth:{autoRefreshToken:true,persistSession:true,detectSessionInUrl:true}});
    const {data,error}=await client.auth.getSession();if(error)throw error;
    session=data.session;
    client.auth.onAuthStateChange((event,nextSession)=>{
      if(event==='PASSWORD_RECOVERY'){session=nextSession;recoveryMode=true;renderLogin('reset');return;}
      if(nextSession?.user?.id!==session?.user?.id){session=nextSession;setTimeout(()=>nextSession?(recoveryMode?renderLogin('reset'):void showWorkspaces()):renderLogin(),0);}
    });
    if(session){if(recoveryMode)renderLogin('reset');else await showWorkspaces();}else renderLogin();
  }catch(error){page('Connection unavailable',error.message||'We could not load the sign-in service.','<button class="auth-primary" id="retry">Retry</button>');document.getElementById('retry').onclick=()=>location.reload();}
}
void init();