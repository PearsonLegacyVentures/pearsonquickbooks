// Deploy with verify_jwt=false. This endpoint is public but rate limited server-side.
// Secrets SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY live only in Edge Functions.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.98.0';

Deno.serve(async req => {
  const configuredOrigins = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map(x => x.trim()).filter(Boolean);
  const origin = req.headers.get('origin') || '';
  const cors = { 'Access-Control-Allow-Origin': configuredOrigins.includes(origin) ? origin : 'null', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary:'Origin' };
  if (req.method === 'OPTIONS') return new Response('', { status:204, headers:cors });
  if (req.method !== 'POST' || !configuredOrigins.includes(origin)) return new Response(JSON.stringify({error:'Forbidden'}),{status:403,headers:{...cors,'Content-Type':'application/json'}});
  const respond = (body: unknown, status = 400) => new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
  try {
    const body = await req.json();
    const username = String(body?.username || '').trim().toLowerCase();
    const password = String(body?.password || '');
    if (!/^[a-z0-9_]{3,24}$/.test(username) || password.length < 1 || password.length > 256) return respond({error:'Invalid username or password.'});
    const url = Deno.env.get('SUPABASE_URL');
    const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const anon = Deno.env.get('SUPABASE_ANON_KEY');
    if (!url || !secret || !anon) return respond({error:'Authentication is not configured.'},503);
    // Prefer the proxy's client IP header, never a client-provided username by itself.
    const ip = req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
    const keyBytes = new TextEncoder().encode(username+'|'+ip);
    const digestBytes = new Uint8Array(await crypto.subtle.digest('SHA-256', keyBytes));
    const bucket = Array.from(digestBytes, x => x.toString(16).padStart(2,'0')).join('');
    const admin = createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const rate = await admin.rpc('record_login_attempt',{p_bucket:bucket});
    if(rate.error || rate.data !== true) return respond({error:'Too many login attempts. Try again later.'},429);
    const lookup=await admin.rpc('lookup_username_email',{p_username:username});
    if(lookup.error || !lookup.data)return respond({error:'Invalid username or password.'},401);
    const response=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{'content-type':'application/json',apikey:anon},body:JSON.stringify({email:lookup.data,password})});
    if(!response.ok)return respond({error:'Invalid username or password.'},401);
    const session=await response.json();
    return respond({access_token:session.access_token,refresh_token:session.refresh_token},200);
  }catch {return respond({error:'Unable to sign in.'},400);}
});