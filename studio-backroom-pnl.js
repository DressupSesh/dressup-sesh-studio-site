(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  if (!$('pnl-filters')) return;
  const money = cents => cents == null ? 'Unknown' : (Number(cents)/100).toLocaleString('en-US',{style:'currency',currency:'USD'});
  const pretty = value => String(value || '').replaceAll('_',' ');
  const authorized = () => Boolean(window.DRESSUP_STUDIO_ADMIN && window.DRESSUP_SUPABASE);
  let epoch=0,request=0,snapshot=null,subscription=null,expense=null,saving=false;
  const node=(tag,text) => {const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
  const localDate = date => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const today=localDate(new Date());$('pnl-from').value=today.slice(0,8)+'01';$('pnl-through').value=today;
  function nextDay(value) {const d=new Date(value+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
  function status(message,error=false){$('pnl-status').textContent=message;$('pnl-status').classList.toggle('error',error);}
  function controls(disabled){for(const id of ['pnl-subscription-form','pnl-expense-form'])for(const e of $(id).elements)e.disabled=disabled;for(const id of ['pnl-add-subscription','pnl-add-expense'])$(id).disabled=disabled;}
  function clear(){epoch++;request++;snapshot=null;subscription=null;expense=null;saving=false;$('pnl-data').hidden=true;$('pnl-export').disabled=true;for(const id of ['pnl-subscriptions','pnl-expenses','pnl-statement'])$(id).replaceChildren();for(const id of ['pnl-net','pnl-paid','pnl-result','pnl-monthly','pnl-coverage'])$(id).textContent='';for(const id of ['pnl-subscription-dialog','pnl-expense-dialog']){if($(id).open)$(id).close();$(id).querySelector('form').reset();}controls(true);status('Owner verification required.');}
  async function rpc(name,args){const {data,error}=await window.DRESSUP_SUPABASE.rpc(name,args);if(error)throw error;return data;}
  function empty(body,text,count){const row=node('tr'),cell=node('td',text);cell.colSpan=count;row.append(cell);body.append(row);}
  function action(label,callback){const b=node('button',label);b.type='button';b.disabled=saving;b.addEventListener('click',callback);return b;}
  function render(data){
    const s=data.summary;
    $('pnl-net').textContent=money(s.net_revenue_cents);$('pnl-paid').textContent=money(s.recorded_paid_expenses_cents);$('pnl-result').textContent=money(s.recorded_cash_result_cents);$('pnl-monthly').textContent=money(s.known_monthly_subscription_cents);
    const statement=$('pnl-statement');statement.replaceChildren();
    for(const [label,value] of [['Customer receipts, excluding sales tax',s.customer_receipts_ex_tax_cents],['Less customer refunds, excluding allocated sales tax',s.customer_refunds_ex_tax_cents],['Net customer revenue',s.net_revenue_cents],['Recorded Stripe fees, business-wide (includes test-payment fees)',s.recorded_stripe_fees_cents],['Recorded paid expenses',s.recorded_paid_expenses_cents],['Unpaid bills due in period (not deducted)',s.unpaid_due_cents],['Recorded cash result - incomplete cost coverage',s.recorded_cash_result_cents]]){const row=node('tr');row.append(node('th',label),node('td',money(value)));statement.append(row);}
    const warnings=[`${s.active_unknown_prices} active / trial / review services need confirmed pricing or billing terms.`,s.fees_complete?'Stripe fee sync covers this period.':'Stripe fee coverage is incomplete or unverified for this period.',`${s.unpaid_unknown} unpaid bills in this period have unknown amounts.`,`Unclassified live receipts excluded from customer revenue: ${money(s.unclassified_live_receipts_cents)}.`];
    if(Number(s.refund_tax_unknown))warnings.push(`${s.refund_tax_unknown} refunds lack a matched payment for tax allocation; full refund amounts were deducted.`);
    warnings.push('Unentered invoices, taxes and other costs remain unknown; do not treat the displayed result as final profit.');$('pnl-coverage').textContent=warnings.join(' ');
    const rows=$('pnl-subscriptions');rows.replaceChildren();
    for(const item of data.subscriptions){const row=node('tr'),name=node('td',item.vendor);name.append(node('small',item.plan||'Plan not confirmed'));const price=node('td',money(item.amount_cents));price.append(node('small',item.billing_interval==='unknown'?'Confirm billing cycle':`Every ${item.interval_count} ${pretty(item.billing_interval)}`));const buttons=node('td');buttons.append(action('Edit',()=>openSubscription(item)),action('Record bill',()=>openExpense(null,item)));row.append(name,node('td',pretty(item.status)),price,node('td',item.next_due||'Not recorded'),buttons);rows.append(row);}
    if(!data.subscriptions.length)empty(rows,'No services recorded yet.',5);
    const ledger=$('pnl-expenses');ledger.replaceChildren();
    for(const item of data.expenses){const row=node('tr'),name=node('td',item.vendor);name.append(node('small',item.description||item.category));const dates=node('td',`Due: ${item.due_date||'Not recorded'}`);dates.append(node('small',`Paid: ${item.paid_date||'Not recorded'}`));const button=node('td');button.append(action('Edit',()=>openExpense(item)));row.append(name,node('td',money(item.amount_cents)),node('td',item.status),dates,node('td',item.reference||'—'),button);ledger.append(row);}
    if(!data.expenses.length)empty(ledger,'No payments or bills recorded. Add actual invoices to complete your costs.',6);
    $('pnl-data').hidden=false;$('pnl-export').disabled=false;
  }
  async function load(){
    if(!authorized()||saving)return;
    const from=$('pnl-from').value,through=$('pnl-through').value;
    if(!from||!through||through<from){status('Choose valid from and through dates.',true);return;}
    const ticket=++request,generation=epoch;snapshot=null;$('pnl-export').disabled=true;$('pnl-data').hidden=true;status('Loading private operating costs…');
    try{const data=await rpc('studio_admin_business_pnl',{p_from:from,p_to:nextDay(through)});if(ticket!==request||generation!==epoch||!authorized())return;if(!data?.summary||!Array.isArray(data.subscriptions)||!Array.isArray(data.expenses))throw new Error('Invalid report');snapshot=data;render(data);controls(false);status(`Updated ${new Date(data.as_of).toLocaleString('en-US',{timeZone:'America/Los_Angeles'})} Pacific. Edits save to your private business records.`);}
    catch(error){if(ticket!==request||generation!==epoch)return;if(error.code==='42501')window.dispatchEvent(new Event('studio:admin-denied'));else status('P&L could not load. Refresh to try again.',true);}
  }
  function fill(form,values){form.reset();for(const [key,value]of Object.entries(values)){const e=form.elements.namedItem(key);if(e)e.value=value??'';}form.elements.amount.value=values.amount_cents==null?'':(Number(values.amount_cents)/100).toFixed(2);}
  function openSubscription(item){if(!authorized()||saving)return;subscription=item?{id:item.id,revision:item.revision}:null;fill($('pnl-subscription-form'),item||{category:'Software',status:'needs_review',billing_interval:'unknown',interval_count:1});$('pnl-subscription-heading').textContent=item?'Edit subscription':'Add subscription';$('pnl-subscription-error').textContent='';$('pnl-subscription-dialog').showModal();}
  function expenseRequirements(){const form=$('pnl-expense-form'),paid=form.elements.status.value==='paid';form.elements.paid_date.required=paid;form.elements.paid_date.disabled=!paid||saving;form.elements.amount.required=paid;if(!paid)form.elements.paid_date.value='';}
  function openExpense(item,service){
    if(!authorized()||saving)return;expense=item?{id:item.id,revision:item.revision}:null;
    const form=$('pnl-expense-form'),select=form.elements.subscription_id;select.replaceChildren();const blank=node('option','Other expense');blank.value='';select.append(blank);for(const s of snapshot?.subscriptions||[]){const option=node('option',s.vendor);option.value=s.id;select.append(option);}
    fill(form,item||(service?{subscription_id:service.id,vendor:service.vendor,category:service.category,description:service.plan,amount_cents:service.amount_cents,due_date:service.next_due,status:'unpaid'}:{category:'Software',status:'unpaid'}));expenseRequirements();$('pnl-expense-heading').textContent=item?'Edit expense':'Record expense';$('pnl-expense-error').textContent='';$('pnl-expense-dialog').showModal();
  }
  function parseAmount(value){if(value==='')return null;if(!/^\d+(\.\d{1,2})?$/.test(value))throw new Error('Use a positive dollar amount with at most two decimal places.');const cents=Math.round(Number(value)*100);if(!Number.isSafeInteger(cents)||cents>100000000)throw new Error('Amount is too large.');return cents;}
  async function save(kind,event){
    event.preventDefault();if(!authorized()||saving)return;const form=event.target,errorEl=$(`pnl-${kind}-error`);errorEl.textContent='';if(!form.reportValidity())return;
    const values=Object.fromEntries(new FormData(form)),current=kind==='subscription'?subscription:expense;let payload;
    try{payload={...values,...current,amount_cents:parseAmount(values.amount)};delete payload.amount;if(kind==='subscription'){payload.interval_count=Number(values.interval_count);if(payload.status==='free'&&payload.amount_cents!==0)throw new Error('A free plan needs a confirmed $0 price.');}else if(payload.status==='paid'&&(!payload.paid_date||payload.amount_cents==null))throw new Error('Paid expenses need an amount and paid date.');else if(payload.status!=='paid')payload.paid_date='';}
    catch(error){errorEl.textContent=error.message;return;}
    const ticket=epoch;saving=true;controls(true);
    try{await rpc('studio_admin_save_business_cost',{p_kind:kind,p_payload:payload});if(ticket!==epoch||!authorized())return;$(`pnl-${kind}-dialog`).close();saving=false;controls(false);await load();}
    catch(error){if(ticket!==epoch)return;if(error.code==='42501')window.dispatchEvent(new Event('studio:admin-denied'));else errorEl.textContent=error.code==='40001'?'This record changed elsewhere. Close, refresh, and review the latest version before saving.':error.code==='23514'?'Check the amount, status and dates. The record was not saved.':'Could not save. Your entries remain in this form; try again.';}
    finally{if(ticket===epoch){saving=false;controls(!authorized());expenseRequirements();}}
  }
  function csvCell(value){let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';}
  function exportCsv(){if(!snapshot||!authorized())return;const rows=[['J9 Ventures operating statement - incomplete cash-basis records'],['From',snapshot.from],['To exclusive',snapshot.to_exclusive],['Timezone',snapshot.timezone],['Currency','USD'],[],['Metric','Cents / value'],...Object.entries(snapshot.summary),[],['Service','Plan','Status','Cycle price cents','Cycle','Every','Next due','Notes'],...snapshot.subscriptions.map(x=>[x.vendor,x.plan,x.status,x.amount_cents??'Unknown',x.billing_interval,x.interval_count,x.next_due,x.notes]),[],['Vendor','Category','Description','Amount cents','Status','Due','Paid','Reference','Notes'],...snapshot.expenses.map(x=>[x.vendor,x.category,x.description,x.amount_cents??'Unknown',x.status,x.due_date,x.paid_date,x.reference,x.notes])];const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download=`studio-pnl-${snapshot.from}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  $('pnl-filters').addEventListener('submit',event=>{event.preventDefault();void load();});
  $('pnl-add-subscription').addEventListener('click',()=>openSubscription());$('pnl-add-expense').addEventListener('click',()=>openExpense());
  $('pnl-subscription-form').addEventListener('submit',event=>void save('subscription',event));$('pnl-expense-form').addEventListener('submit',event=>void save('expense',event));
  $('pnl-expense-form').elements.status.addEventListener('change',expenseRequirements);
  $('pnl-expense-form').elements.subscription_id.addEventListener('change',event=>{const item=snapshot?.subscriptions.find(s=>s.id===event.target.value);if(!item)return;const f=$('pnl-expense-form');for(const key of ['vendor','category'])f.elements[key].value=item[key];f.elements.description.value=item.plan;f.elements.amount.value=item.amount_cents==null?'':(Number(item.amount_cents)/100).toFixed(2);});
  for(const b of document.querySelectorAll('[data-pnl-close]'))b.addEventListener('click',()=>{if(!saving)b.closest('dialog').close();});
  for(const id of ['pnl-subscription-dialog','pnl-expense-dialog'])$(id).addEventListener('cancel',event=>{if(saving)event.preventDefault();});
  $('pnl-export').addEventListener('click',exportCsv);$('finance-module-tab-pnl').addEventListener('click',()=>{if(!snapshot)void load();});
  window.addEventListener('studio:admin-ready',()=>{epoch++;controls(false);if($('finance-module-tab-pnl').getAttribute('aria-selected')==='true')void load();});
  window.addEventListener('studio:admin-locked',clear);window.addEventListener('pagehide',clear);clear();
  if(authorized()){controls(false);if($('finance-module-tab-pnl').getAttribute('aria-selected')==='true')void load();}
})();
