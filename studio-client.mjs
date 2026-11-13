let clientPromise;
export function getClient() {
  if (window.DRESSUP_SUPABASE) return Promise.resolve(window.DRESSUP_SUPABASE);
  if (!clientPromise) clientPromise = import('https://esm.sh/@supabase/supabase-js@2.57.4').then(({createClient}) => {
    return window.DRESSUP_SUPABASE ||= createClient(window.DRESSUP_CONFIG.supabaseUrl, window.DRESSUP_CONFIG.supabasePublishableKey);
  });
  return clientPromise;
}
