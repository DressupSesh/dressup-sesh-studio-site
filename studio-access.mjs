// UI hints mirror server balances. The server remains authoritative for every request.
export function toolAccess(tool, access, upgrade) {
  if (!access) return {locked:false, note:''};
  if (access.owner) return {locked:false, note:'Unlimited access'};
  if (access.access_suspended || access.plan === 'inactive') return {locked:true, note:'Upgrade needed to use this tool.'};
  if (tool === 'upgrade') {
    if (!upgrade) return {locked:false, note:'Checking monthly allowance…'};
    if (!upgrade.allowed) return {locked:true,note:'Upgrade needed to use this tool.'};
    if (upgrade.tier === 'owner') return {locked:false,note:'Unlimited access'};
    return balance(upgrade.remaining, upgrade.resets_at, true);
  }
  if(tool==='listing' && !access.paid && upgrade && (!upgrade.trial_active || access.copy_remaining===0 || (access.items_remaining===0&&!access.current_item_started))) return balance(upgrade.free_copy_remaining,upgrade.resets_at,true);
  const field = {photos:'background_remaining',listing:'copy_remaining',creative:'creative_remaining'}[tool];
  if (!field) return {locked:false,note:''};
  // An existing trial item may still be completed even after the last item is started.
  if (!access.paid && access.items_remaining === 0 && !access.current_item_started) return {locked:true,note:'Trial complete · upgrade needed to start another item.'};
  return balance(access[field], access.paid ? access.current_period_end : null, !!access.paid);
}
function balance(value, reset, monthly) {
  if (value === null) return {locked:false,note:'Unlimited access'};
  if (value === undefined) return {locked:false,note:''};
  if (Number(value) > 0) return {locked:false,note:`${value} ${monthly ? 'left this month' : 'left in trial'}`};
  const date = reset && !Number.isNaN(Date.parse(reset)) ? new Date(reset).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : '';
  return {locked:true,note:monthly ? `Monthly allowance used${date ? ` · available again ${date}` : ' · check your plan for the renewal date'}. Upgrade for more access.` : 'Trial allowance used · upgrade needed to use this tool.'};
}
export function balanceLabel(value) { return value === null ? 'Unlimited' : String(Math.max(0,Number(value||0))); }
