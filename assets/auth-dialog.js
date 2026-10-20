/*! Droidly sign-in / sign-up dialog (same markup and behaviour as the homepage), usable on any page without leaving it.
 * Needs supabase-js loaded first. Uses window.DroidlyDb if the page already created a client.
 * Open with openAuthModal('signin'|'signup'). Emits a "droidly:signed-in" event on window after a password sign-in or sign-up. */
(function(){
var SUPABASE_URL='https://dquheflcmcppldrnckzf.supabase.co';
var SUPABASE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRxdWhlZmxjbWNwcGxkcm5ja3pmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjI1MDcsImV4cCI6MjA5MTY5ODUwN30.SRhP7mzqlaNzGYEec56IV348aAl66YmFv9ApBuXbN1c";
window.__adb=function(){return window.DroidlyDb||(window.DroidlyDb=supabase.createClient(SUPABASE_URL,SUPABASE_KEY))};
var css="    .auth-overlay{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,0.45);backdrop-filter:blur(6px);display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;pointer-events:none;transition:opacity 0.25s ease}\n    .auth-overlay.open{opacity:1;pointer-events:all}\n    .auth-box{background:#fff;border-radius:22px;padding:36px 32px;width:100%;max-width:420px;box-shadow:0 24px 64px rgba(0,0,0,0.18);transform:translateY(16px) scale(0.97);transition:transform 0.28s cubic-bezier(0.34,1.56,0.64,1);max-height:90vh;overflow-y:auto}\n    .auth-overlay.open .auth-box{transform:translateY(0) scale(1)}\n    .auth-close{position:absolute;top:16px;right:16px;width:32px;height:32px;border-radius:50%;background:var(--bg2);border:none;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--muted);transition:all 0.15s}\n    .auth-close:hover{background:var(--bg3);color:var(--ink)}\n    .auth-logo{display:flex;align-items:center;gap:8px;font-family:'Plus Jakarta Sans',sans-serif;font-weight:800;font-size:18px;color:var(--ink);margin-bottom:22px;letter-spacing:-0.3px}\n    .auth-logo-mark img{height:28px;width:auto;display:block}\n    .auth-tabs{display:flex;border-bottom:1px solid var(--border);margin-bottom:24px;gap:4px}\n    .auth-tab{flex:1;padding:9px;background:none;border:none;font-family:inherit;font-size:14px;font-weight:600;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;transition:all 0.18s}\n    .auth-tab.active{color:var(--green);border-bottom-color:var(--green)}\n    .auth-field{margin-bottom:14px}\n    .auth-label{display:block;font-size:13px;font-weight:600;color:var(--ink2);margin-bottom:6px}\n    .auth-input{width:100%;padding:11px 14px;border:1.5px solid var(--border);border-radius:10px;font-size:14px;font-family:inherit;color:var(--ink);outline:none;transition:all 0.18s}\n    .auth-input:focus{border-color:var(--green);box-shadow:0 0 0 3px rgba(61,122,79,0.12)}\n    .auth-input.error{border-color:#e53e3e}\n    .auth-input::placeholder{color:var(--muted)}\n    .auth-pw-wrap{position:relative}\n    .auth-pw-toggle{position:absolute;right:12px;top:50%;transform:translateY(-50%);background:none;border:none;font-size:16px;cursor:pointer;color:var(--muted);padding:2px}\n    .auth-pw-toggle:hover{color:var(--ink)}\n    .auth-error{display:none;font-size:12px;color:#e53e3e;margin-top:5px}\n    .auth-error.show{display:block}\n    .auth-forgot{display:block;text-align:right;font-size:12px;color:var(--green);text-decoration:none;font-weight:600;margin-bottom:16px}\n    .auth-forgot:hover{color:var(--green2)}\n    .auth-submit{width:100%;background:var(--green);color:#fff;padding:13px;border-radius:100px;font-family:inherit;font-size:15px;font-weight:700;border:none;cursor:pointer;transition:all 0.18s;display:flex;align-items:center;justify-content:center;gap:8px}\n    .auth-submit:hover{background:var(--green2);transform:translateY(-1px)}\n    .auth-submit:disabled{opacity:0.6;transform:none;cursor:not-allowed}\n    .auth-divider{display:flex;align-items:center;gap:12px;font-size:12px;color:var(--muted);margin:18px 0;text-align:center}\n    .auth-divider::before,.auth-divider::after{content:'';flex:1;height:1px;background:var(--border)}\n    .auth-google{width:100%;padding:11px;border:1.5px solid var(--border);border-radius:100px;background:#fff;font-family:inherit;font-size:14px;font-weight:600;color:var(--ink);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:10px;transition:all 0.18s}\n    .auth-google:hover{border-color:var(--green);background:var(--green-pale)}\n    .auth-switch{text-align:center;font-size:13px;color:var(--muted);margin-top:18px}\n    .auth-switch a{color:var(--green);font-weight:600;text-decoration:none}\n    .auth-terms{font-size:12px;color:var(--muted);text-align:center;margin-top:14px;line-height:1.6}\n    .auth-terms a{color:var(--green)}\n    .auth-toast{position:fixed;bottom:28px;left:50%;transform:translateX(-50%) translateY(20px);background:var(--ink);color:#fff;padding:12px 22px;border-radius:100px;font-size:14px;font-weight:500;display:flex;align-items:center;gap:8px;z-index:99999;opacity:0;transition:all 0.3s ease;box-shadow:var(--shadow-lg);white-space:nowrap}\n    .auth-toast.show{opacity:1;transform:translateX(-50%) translateY(0)}\n    .auth-toast.success{background:var(--green)}\n    .auth-toast.error-toast{background:#e53e3e}";
var html="<div class=\"auth-overlay\" id=\"authOverlay\" onclick=\"closeAuthOnBackdrop(event)\">\n  <div class=\"auth-box\" id=\"authBox\">\n    <button class=\"auth-close\" onclick=\"closeAuthModal()\">\u2715</button>\n    <div class=\"auth-logo\">\n      <div class=\"auth-logo-mark\"><img src=\"/assets/logo.png\" alt=\"Droidly\"/></div>\n      Droidly\n    </div>\n    <div class=\"auth-tabs\">\n      <button class=\"auth-tab active\" id=\"tabSignin\" onclick=\"switchTab('signin')\">Sign In</button>\n      <button class=\"auth-tab\" id=\"tabSignup\" onclick=\"switchTab('signup')\">Create Account</button>\n    </div>\n    <div id=\"formSignin\">\n      <div class=\"auth-field\">\n        <label class=\"auth-label\" for=\"siEmail\">Email address</label>\n        <input class=\"auth-input\" type=\"email\" id=\"siEmail\" placeholder=\"you@example.com\" autocomplete=\"email\"/>\n        <div class=\"auth-error\" id=\"siEmailErr\">Please enter a valid email.</div>\n      </div>\n      <div class=\"auth-field\">\n        <label class=\"auth-label\" for=\"siPassword\">Password</label>\n        <div class=\"auth-pw-wrap\">\n          <input class=\"auth-input\" type=\"password\" id=\"siPassword\" placeholder=\"Your password\" autocomplete=\"current-password\"/>\n          <button class=\"auth-pw-toggle\" type=\"button\" onclick=\"togglePw('siPassword', this)\">\ud83d\udc41</button>\n        </div>\n        <div class=\"auth-error\" id=\"siPassErr\">Incorrect email or password.</div>\n      </div>\n      <a href=\"#\" class=\"auth-forgot\" onclick=\"handleForgot(event)\">Forgot password?</a>\n      <button class=\"auth-submit\" id=\"siBtn\" onclick=\"handleSignIn()\">Sign In \u2192</button>\n      <div class=\"auth-divider\">or continue with</div>\n      <button class=\"auth-google\" onclick=\"handleGoogleAuth()\">\n        <svg width=\"18\" height=\"18\" viewBox=\"0 0 48 48\"><path fill=\"#EA4335\" d=\"M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z\"/><path fill=\"#4285F4\" d=\"M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z\"/><path fill=\"#FBBC05\" d=\"M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z\"/><path fill=\"#34A853\" d=\"M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z\"/></svg>\n        Continue with Google\n      </button>\n      <div class=\"auth-switch\">Don't have an account? <a href=\"#\" onclick=\"switchTab('signup');return false;\">Create one free \u2192</a></div>\n    </div>\n    <div id=\"formSignup\" style=\"display:none\">\n      <div class=\"auth-field\">\n        <label class=\"auth-label\" for=\"suName\">Full name</label>\n        <input class=\"auth-input\" type=\"text\" id=\"suName\" placeholder=\"Priya Sharma\" autocomplete=\"name\"/>\n        <div class=\"auth-error\" id=\"suNameErr\">Please enter your name.</div>\n      </div>\n      <div class=\"auth-field\">\n        <label class=\"auth-label\" for=\"suEmail\">Email address</label>\n        <input class=\"auth-input\" type=\"email\" id=\"suEmail\" placeholder=\"you@example.com\" autocomplete=\"email\"/>\n        <div class=\"auth-error\" id=\"suEmailErr\">Please enter a valid email.</div>\n        <div class=\"auth-error\" id=\"suEmailExistsErr\">An account with this email already exists.</div>\n      </div>\n      <div class=\"auth-field\">\n        <label class=\"auth-label\" for=\"suPassword\">Password <span style=\"color:var(--muted);font-weight:400\">(min 6 chars)</span></label>\n        <div class=\"auth-pw-wrap\">\n          <input class=\"auth-input\" type=\"password\" id=\"suPassword\" placeholder=\"Choose a strong password\" autocomplete=\"new-password\"/>\n          <button class=\"auth-pw-toggle\" type=\"button\" onclick=\"togglePw('suPassword', this)\">\ud83d\udc41</button>\n        </div>\n        <div class=\"auth-error\" id=\"suPassErr\">Password must be at least 6 characters.</div>\n      </div>\n      <button class=\"auth-submit\" id=\"suBtn\" onclick=\"handleSignUp()\">Create Free Account \u2192</button>\n      <div class=\"auth-divider\">or continue with</div>\n      <button class=\"auth-google\" onclick=\"handleGoogleAuth()\">\n        <svg width=\"18\" height=\"18\" viewBox=\"0 0 48 48\"><path fill=\"#EA4335\" d=\"M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z\"/><path fill=\"#4285F4\" d=\"M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z\"/><path fill=\"#FBBC05\" d=\"M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z\"/><path fill=\"#34A853\" d=\"M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z\"/></svg>\n        Continue with Google\n      </button>\n      <div class=\"auth-terms\">By signing up you agree to our <a href=\"#\">Terms</a> &amp; <a href=\"#\">Privacy Policy</a>.</div>\n      <div class=\"auth-switch\">Already have an account? <a href=\"#\" onclick=\"switchTab('signin');return false;\">Sign in \u2192</a></div>\n    </div>\n    <div id=\"authVerifyState\" style=\"display:none;text-align:center;padding:8px 0\">\n      <div style=\"font-size:52px;margin-bottom:18px\">\ud83d\udce7</div>\n      <h3 style=\"font-family:'Plus Jakarta Sans',sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;margin-bottom:10px\">Check your inbox!</h3>\n      <p style=\"font-size:14px;color:var(--muted);line-height:1.7;margin-bottom:6px\">We sent a verification link to</p>\n      <p style=\"font-size:14px;font-weight:700;color:var(--ink);margin-bottom:24px\" id=\"verifyEmailAddr\"></p>\n      <button onclick=\"closeAuthModal()\" style=\"width:100%;background:var(--green);color:white;border:none;padding:14px;border-radius:100px;font-family:'DM Sans',sans-serif;font-size:15px;font-weight:700;cursor:pointer;margin-bottom:14px\">Got it \u2192</button>\n      <p style=\"font-size:13px;color:var(--muted)\">Didn't receive it? <a href=\"#\" id=\"resendEmail\" onclick=\"resendVerification();return false;\" style=\"color:var(--green);font-weight:600;text-decoration:none\">Resend email</a></p>\n    </div>\n  </div>\n</div>\n<div class=\"auth-toast\" id=\"authToast\"></div>";
function mount(){
  if(document.getElementById('authOverlay'))return;
  var st=document.createElement('style');st.textContent=css+'\n@keyframes spin{to{transform:rotate(360deg)}}';document.head.appendChild(st);
  var d=document.createElement('div');d.innerHTML=html;while(d.firstChild)document.body.appendChild(d.firstChild);
}
if(document.body)mount();else document.addEventListener('DOMContentLoaded',mount);
window.afterAuth=function(user){try{window.dispatchEvent(new CustomEvent('droidly:signed-in',{detail:{user:user}}))}catch(e){}};
function openAuthModal(tab='signin'){switchTab(tab);clearAuthErrors();hideVerifyState();document.getElementById('authOverlay').classList.add('open');document.body.style.overflow='hidden';setTimeout(()=>{document.getElementById(tab==='signin'?'siEmail':'suName')?.focus()},300)}
function closeAuthModal(){document.getElementById('authOverlay').classList.remove('open');document.body.style.overflow='';hideVerifyState()}
function closeAuthOnBackdrop(e){if(e.target===document.getElementById('authOverlay'))closeAuthModal()}
function switchTab(tab){const isSI=tab==='signin';document.getElementById('tabSignin').classList.toggle('active',isSI);document.getElementById('tabSignup').classList.toggle('active',!isSI);document.getElementById('formSignin').style.display=isSI?'':'none';document.getElementById('formSignup').style.display=isSI?'none':'';clearAuthErrors()}
function showErr(id,inputId){document.getElementById(id)?.classList.add('show');if(inputId)document.getElementById(inputId)?.classList.add('error')}
function clearAuthErrors(){['siEmailErr','siPassErr','suNameErr','suEmailErr','suEmailExistsErr','suPassErr'].forEach(id=>document.getElementById(id)?.classList.remove('show'));['siEmail','siPassword','suName','suEmail','suPassword'].forEach(id=>document.getElementById(id)?.classList.remove('error'))}
function setLoading(btnId,loading,def){const btn=document.getElementById(btnId);if(!btn)return;btn.disabled=loading;btn.innerHTML=loading?'<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="animation:spin 0.7s linear infinite"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg> Please wait…':def}
function togglePw(inputId,btn){const inp=document.getElementById(inputId);inp.type=inp.type==='text'?'password':'text';btn.textContent=inp.type==='password'?'👁':'🙈'}
function showVerifyState(email){document.getElementById('formSignup').style.display='none';document.getElementById('authVerifyState').style.display='';document.getElementById('verifyEmailAddr').textContent=email;document.getElementById('resendEmail').dataset.email=email}
function hideVerifyState(){const vs=document.getElementById('authVerifyState');if(vs)vs.style.display='none'}

async function handleSignIn(){
  clearAuthErrors();
  const email=document.getElementById('siEmail').value.trim();
  const pass=document.getElementById('siPassword').value;
  let valid=true;
  if(!email||!email.includes('@')){showErr('siEmailErr','siEmail');valid=false}
  if(!pass){showErr('siPassErr','siPassword');valid=false}
  if(!valid)return;
  setLoading('siBtn',true,'Sign In →');
  const{data,error}=await __adb().auth.signInWithPassword({email,password:pass});
  setLoading('siBtn',false,'Sign In →');
  if(error){showErr('siPassErr','siPassword');return}
  const name=data.user.user_metadata?.full_name||email.split('@')[0];
  closeAuthModal();afterAuth(data.user);
  showToast('✓ Welcome back, '+name.split(' ')[0]+'!','success');
}

async function handleSignUp(){
  clearAuthErrors();
  const name=document.getElementById('suName').value.trim();
  const email=document.getElementById('suEmail').value.trim();
  const pass=document.getElementById('suPassword').value;
  let valid=true;
  if(!name){showErr('suNameErr','suName');valid=false}
  if(!email||!email.includes('@')){showErr('suEmailErr','suEmail');valid=false}
  if(pass.length<6){showErr('suPassErr','suPassword');valid=false}
  if(!valid)return;
  setLoading('suBtn',true,'Create Free Account →');
  const{data,error}=await __adb().auth.signUp({email,password:pass,options:{data:{full_name:name}}});
  setLoading('suBtn',false,'Create Free Account →');
  if(error){if(error.message.toLowerCase().includes('already')){showErr('suEmailExistsErr','suEmail')}else{showToast(error.message,'error-toast')}return}
  if(data.user&&!data.session){showVerifyState(email)}
  else if(data.session){closeAuthModal();afterAuth(data.user);showToast('🎉 Welcome to Droidly, '+name.split(' ')[0]+'!','success')}
}

async function resendVerification(){
  const email=document.getElementById('resendEmail')?.dataset.email;
  if(!email)return;
  const{error}=await __adb().auth.resend({type:'signup',email});
  showToast(error?error.message:'📧 Verification email resent!',error?'error-toast':'success');
}

async function handleForgot(e){
  e.preventDefault();
  const email=document.getElementById('siEmail').value.trim();
  if(!email||!email.includes('@')){showErr('siEmailErr','siEmail');return}
  const redirectTo=window.location.href.split('?')[0];
  const{error}=await __adb().auth.resetPasswordForEmail(email,{redirectTo});
  showToast(error?error.message:'📧 Password reset link sent to '+email,error?'error-toast':'success');
}

async function handleGoogleAuth(){
  const{error}=await __adb().auth.signInWithOAuth({provider:'google',options:{redirectTo:window.location.href.split('?')[0].split('#')[0]}});
  if(error)showToast('Google sign-in failed: '+error.message,'error-toast');
}

let toastTimer;
function showToast(msg,type){
  const t=document.getElementById('authToast');
  t.textContent=msg;t.className='auth-toast show'+(type?' '+type:'');
  clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),4000);
}


window.openAuthModal=openAuthModal;
window.closeAuthModal=closeAuthModal;
window.closeAuthOnBackdrop=closeAuthOnBackdrop;
window.switchTab=switchTab;
window.showErr=showErr;
window.clearAuthErrors=clearAuthErrors;
window.setLoading=setLoading;
window.togglePw=togglePw;
window.showVerifyState=showVerifyState;
window.hideVerifyState=hideVerifyState;
window.handleSignIn=handleSignIn;
window.handleSignUp=handleSignUp;
window.resendVerification=resendVerification;
window.handleForgot=handleForgot;
window.handleGoogleAuth=handleGoogleAuth;
window.showToast=showToast;
})();
