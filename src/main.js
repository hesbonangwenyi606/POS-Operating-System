import './style.css';

const SERVICES = [
  { id:'wash', name:'Washing · full load', category:'Full load', price:600, icon:'wash' },
  { id:'dry', name:'Drying · full load', category:'Full load', price:600, icon:'dry' },
  { id:'iron', name:'Ironing · full load', category:'Full load', price:700, icon:'iron' },
  { id:'wdf', name:'Wash, dry & fold', category:'Full load', price:1200, icon:'wash' },
  { id:'wdih', name:'Wash, dry, iron & hang', category:'Full load', price:1700, icon:'iron' },
  { id:'excess', name:'Excess load · per kg', category:'Full load', price:140, icon:'scale' },
  { id:'duvet-cover', name:'Duvet cover', category:'Household', price:300, icon:'home' },
  { id:'bedsheet', name:'Bedsheet', category:'Household', price:200, icon:'home' },
  { id:'curtains', name:'Curtains · per kg', category:'Household', price:300, icon:'home' },
  { id:'pillow', name:'Pillow', category:'Household', price:200, icon:'home' },
  { id:'towel', name:'Towel', category:'Household', price:200, icon:'home' },
  { id:'sheers', name:'Sheers · per kg', category:'Household', price:200, icon:'home' },
  { id:'duvet1', name:'Duvet / blanket · 1kg', category:'Duvets', price:500, icon:'blanket' },
  { id:'duvet2', name:'Duvet / blanket · 2kg', category:'Duvets', price:700, icon:'blanket' },
  { id:'duvet3', name:'Duvet / blanket · 3kg', category:'Duvets', price:900, icon:'blanket' },
  { id:'duvet4', name:'Duvet / blanket · 4kg', category:'Duvets', price:1000, icon:'blanket' },
  { id:'tshirt', name:'T-shirt', category:'Garments', price:200, icon:'shirt' },
  { id:'shirt', name:'Shirt / blouse / skirt', category:'Garments', price:200, icon:'shirt' },
  { id:'trouser', name:'Trouser / dress', category:'Garments', price:200, icon:'shirt' },
  { id:'dress', name:'African / pleated dress', category:'Garments', price:300, icon:'dress' },
  { id:'hoodie', name:'Hoodie / sweater', category:'Garments', price:300, icon:'shirt' },
  { id:'jacket', name:'Jacket · normal', category:'Garments', price:300, icon:'jacket' },
  { id:'suit2', name:'Suit · two piece', category:'Garments', price:700, icon:'suit' },
  { id:'suit3', name:'Suit · three piece', category:'Garments', price:800, icon:'suit' },
  { id:'wedding', name:'Wedding gown', category:'Special care', price:1500, icon:'dress' },
  { id:'leather', name:'Leather jacket', category:'Special care', price:1500, icon:'jacket' },
  { id:'raincoat', name:'Trench / rain coat', category:'Special care', price:500, icon:'jacket' },
  { id:'sari', name:'Indian sari', category:'Special care', price:600, icon:'dress' },
];

const svg = (name) => ({
  wash:'<svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="6"/><path d="M5 4h14v16H5zM8 7h.01M11 7h4"/></svg>',
  dry:'<svg viewBox="0 0 24 24"><path d="M6 4h12v16H6zM9 8c2-2 4 2 6 0M9 12c2-2 4 2 6 0M9 16c2-2 4 2 6 0"/></svg>',
  iron:'<svg viewBox="0 0 24 24"><path d="M4 17h16l-2-6H9a5 5 0 0 0-5 5v1ZM14 11V7h4v4"/></svg>',
  scale:'<svg viewBox="0 0 24 24"><path d="M5 8h14l2 12H3L5 8Z"/><circle cx="12" cy="12" r="2"/><path d="m12 12 2-2"/></svg>',
  home:'<svg viewBox="0 0 24 24"><path d="m3 11 9-7 9 7v9H3v-9Z"/><path d="M8 20v-6h8v6"/></svg>',
  blanket:'<svg viewBox="0 0 24 24"><path d="M5 5h12a3 3 0 0 1 0 6H5zM5 11h13a3 3 0 0 1 0 6H5zM5 17h12a3 3 0 0 1 0 6H5z"/></svg>',
  shirt:'<svg viewBox="0 0 24 24"><path d="m8 4-5 3 2 5 3-1v9h8v-9l3 1 2-5-5-3a4 4 0 0 1-8 0Z"/></svg>',
  dress:'<svg viewBox="0 0 24 24"><path d="M9 3h6l-1 6 5 11H5l5-11-1-6Z"/></svg>',
  jacket:'<svg viewBox="0 0 24 24"><path d="m8 4-4 3 2 6 2-1v8h8v-8l2 1 2-6-4-3-4 3-4-3ZM12 7v13"/></svg>',
  suit:'<svg viewBox="0 0 24 24"><path d="m8 4-4 3 2 6 2-1v8h8v-8l2 1 2-6-4-3-4 4-4-4ZM10 10l2 2 2-2M12 12v8"/></svg>',
})[name] || '';

const money = n => new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',minimumFractionDigits:0}).format(n);
const day = d => new Intl.DateTimeFormat('en-KE',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(d));
const time = d => new Intl.DateTimeFormat('en-KE',{hour:'2-digit',minute:'2-digit'}).format(new Date(d));
const escapeHtml = s => String(s ?? '').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const AUTH_KEY = 'od-admin-session';
const ADMIN_USER = 'admin';
const ADMIN_PASSWORD = 'OpenDoors@2026';

const seedOrders = () => {
  const now = Date.now();
  return [
    {id:'OD-1048',customer:'Grace Wanjiku',phone:'0712 458 209',items:[{...SERVICES[3],qty:1}],subtotal:1200,discount:0,total:1200,paid:1200,payment:'M-Pesa',status:'Ready',turnaround:'Normal',created:now-32*3600000,due:now-8*3600000,notes:''},
    {id:'OD-1049',customer:'Brian Ouma',phone:'0798 130 452',items:[{...SERVICES[15],qty:2},{...SERVICES[10],qty:2}],subtotal:2400,discount:0,total:2400,paid:1000,payment:'M-Pesa',status:'Cleaning',turnaround:'Normal',created:now-6*3600000,due:now+18*3600000,notes:'Call before delivery'},
    {id:'OD-1050',customer:'Diana K.',phone:'0704 811 024',items:[{...SERVICES[22],qty:1},{...SERVICES[16],qty:3}],subtotal:900,discount:0,total:900,paid:900,payment:'Cash',status:'Received',turnaround:'Express',created:now-1.5*3600000,due:now+2.5*3600000,notes:''},
  ];
};

const db = {
  get orders(){ try{return JSON.parse(localStorage.getItem('od-orders')) || seedOrders()}catch{return seedOrders()} },
  set orders(v){localStorage.setItem('od-orders',JSON.stringify(v))},
  get services(){ try{return JSON.parse(localStorage.getItem('od-services')) || SERVICES}catch{return SERVICES} },
  set services(v){localStorage.setItem('od-services',JSON.stringify(v))}
};

let state = { view:'pos', cart:[], category:'All', query:'', orders:db.orders, services:db.services, selectedOrder:null };
const app = document.querySelector('#app');

function shell(){
  app.innerHTML = `
  <aside class="sidebar">
    <div class="brand"><div class="brand-mark"><span></span></div><div><b>OPEN DOORS</b><small>LAUNDROMAT</small></div></div>
    <nav>
      ${nav('pos','grid','Point of sale')}${nav('orders','bag','Orders')}${nav('customers','users','Customers')}${nav('reports','chart','Reports')}${nav('services','tag','Services & prices')}
    </nav>
    <div class="side-foot"><div class="online"><i></i> System online</div><div class="profile"><span>AD</span><div><b>Administrator</b><small>System admin</small></div><button class="logout-btn" data-logout title="Log out">↪</button></div></div>
  </aside>
  <main><div id="view"></div></main>
  <div id="modal"></div><div id="toast"></div>`;
  bindNav(); renderView(); document.querySelectorAll('[data-logout]').forEach(button=>button.onclick=logout);
}

function renderLogin(message=''){
  app.innerHTML=`<main class="login-page"><section class="login-visual"><div class="login-brand"><div class="brand-mark"><span></span></div><div><b>OPEN DOORS</b><small>LAUNDROMAT</small></div></div><div class="login-copy"><span>LAUNDRY MANAGEMENT, SIMPLIFIED</span><h1>Fresh service starts with an organised counter.</h1><p>Manage every order, payment and customer hand-off from one clear workspace.</p></div><div class="login-quote">“So Fresh, So Clean, So You.”</div><div class="bubble bubble-one"></div><div class="bubble bubble-two"></div><div class="bubble bubble-three"></div></section><section class="login-form-wrap"><form id="login-form" class="login-form"><div class="mobile-login-brand"><div class="brand-mark"><span></span></div><b>OPEN DOORS</b></div><span class="eyebrow">SECURE ACCESS</span><h2>Welcome back</h2><p>Sign in to open the Open Doors point of sale.</p>${message?`<div class="login-error"><span>!</span>${escapeHtml(message)}</div>`:''}<label><span>Username</span><div class="login-input"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg><input name="username" autocomplete="username" required autofocus placeholder="Enter username"></div></label><label><span>Password</span><div class="login-input"><svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg><input id="login-password" name="password" type="password" autocomplete="current-password" required placeholder="Enter password"><button type="button" id="show-password" aria-label="Show password">◉</button></div></label><button class="primary login-submit" type="submit">Sign in to POS <span>→</span></button><small class="login-help">Authorised Open Doors staff only</small></form><footer>© ${new Date().getFullYear()} Open Doors Laundromat · Kitengela</footer></section></main>`;
  const form=document.querySelector('#login-form');
  document.querySelector('#show-password').onclick=()=>{const input=document.querySelector('#login-password');input.type=input.type==='password'?'text':'password'};
  form.onsubmit=e=>{e.preventDefault();const fd=new FormData(form);if(fd.get('username').trim().toLowerCase()===ADMIN_USER&&fd.get('password')===ADMIN_PASSWORD){sessionStorage.setItem(AUTH_KEY,JSON.stringify({user:ADMIN_USER,signedInAt:Date.now()}));shell()}else{renderLogin('The username or password is incorrect.')}};
}

function logout(){sessionStorage.removeItem(AUTH_KEY);state.cart=[];renderLogin()}

function nav(id,icon,label){
 const icons={grid:'<path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z"/>',bag:'<path d="M6 8h12l1 12H5L6 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',users:'<path d="M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM16 11a4 4 0 0 1 4 4v2M16 3a4 4 0 0 1 0 7"/>',chart:'<path d="M4 20V10M10 20V4M16 20v-7M22 20V7"/>',tag:'<path d="M20 13 13 20l-9-9V4h7l9 9Z"/><circle cx="8.5" cy="8.5" r="1"/>'};
 return `<button data-view="${id}" class="nav-btn ${state.view===id?'active':''}"><svg viewBox="0 0 24 24">${icons[icon]}</svg><span>${label}</span>${id==='orders'?`<em>${state.orders.filter(o=>!['Collected','Cancelled'].includes(o.status)).length}</em>`:''}</button>`;
}
function bindNav(){document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{state.view=b.dataset.view; shell()})}
function renderView(){({pos:renderPOS,orders:renderOrders,customers:renderCustomers,reports:renderReports,services:renderServices}[state.view]||renderPOS)()}

function header(title,sub,actions=''){return `<header class="topbar"><div><h1>${title}</h1><p>${sub}</p></div><div class="top-actions">${actions}<button class="icon-btn" title="Notifications">${bell()}<i></i></button><div class="date-pill"><span>${new Date().toLocaleDateString('en-KE',{weekday:'short'})}</span><b>${new Date().getDate()}</b></div><button class="icon-btn logout-top" data-logout title="Log out"><svg viewBox="0 0 24 24"><path d="M10 17l5-5-5-5M15 12H3M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/></svg></button></div></header>`}
function bell(){return '<svg viewBox="0 0 24 24"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>'}

function renderPOS(){
 const cats=['All',...new Set(state.services.map(x=>x.category))];
 const list=state.services.filter(s=>(state.category==='All'||s.category===state.category)&&s.name.toLowerCase().includes(state.query.toLowerCase()));
 document.querySelector('#view').innerHTML=`${header('Point of sale','Create and process a new laundry order')}
 <section class="pos-layout"><div class="catalog">
  <div class="search-row"><label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="service-search" placeholder="Search services or garments…" value="${escapeHtml(state.query)}"></label><button class="scan-btn" title="Find order">⌗</button></div>
  <div class="category-tabs">${cats.map(c=>`<button class="${c===state.category?'active':''}" data-cat="${c}">${c}</button>`).join('')}</div>
  <div class="service-grid">${list.length?list.map(serviceCard).join(''):'<div class="empty"><b>No matching services</b><p>Try another search or category.</p></div>'}</div>
 </div>${cartPanel()}</section>`;
 document.querySelectorAll('[data-cat]').forEach(b=>b.onclick=()=>{state.category=b.dataset.cat;renderPOS()});
 document.querySelector('#service-search').oninput=e=>{state.query=e.target.value;renderPOS();document.querySelector('#service-search').focus()};
 document.querySelectorAll('[data-add]').forEach(b=>b.onclick=()=>addCart(b.dataset.add)); bindCart();
}
function serviceCard(s){return `<button class="service-card" data-add="${s.id}"><span class="service-icon ${s.icon}">${svg(s.icon)}</span><span class="service-name">${s.name}</span><span class="service-price">${money(s.price)}</span><i>+</i></button>`}
function cartPanel(){
 const subtotal=state.cart.reduce((n,x)=>n+x.price*x.qty,0);
 return `<aside class="cart"><div class="cart-head"><div><h2>Current order</h2><span>${state.cart.reduce((n,x)=>n+x.qty,0)} items</span></div><button id="clear-cart" ${!state.cart.length?'disabled':''}>Clear</button></div>
 <div class="customer-quick"><span>+</span><div><b>Add customer</b><small>Name and phone number</small></div><i>›</i></div>
 <div class="cart-items">${state.cart.length?state.cart.map((x,i)=>`<div class="cart-item"><span class="mini-icon">${svg(x.icon)}</span><div class="item-info"><b>${x.name}</b><small>${money(x.price)} each</small><div class="stepper"><button data-dec="${i}">−</button><span>${x.qty}</span><button data-inc="${i}">+</button></div></div><strong>${money(x.price*x.qty)}</strong><button class="remove" data-remove="${i}">×</button></div>`).join(''):`<div class="empty-cart"><span>${svg('wash')}</span><b>Your order is empty</b><p>Select a service to get started</p></div>`}</div>
 <div class="cart-total"><div><span>Subtotal</span><b>${money(subtotal)}</b></div><div><span>Tax</span><b>Included</b></div><div class="total"><span>Total</span><strong>${money(subtotal)}</strong></div><button id="checkout" class="primary" ${!state.cart.length?'disabled':''}>Continue to checkout <span>→</span></button></div></aside>`;
}
function addCart(id){const existing=state.cart.find(x=>x.id===id); if(existing)existing.qty++;else state.cart.push({...state.services.find(x=>x.id===id),qty:1});renderPOS()}
function bindCart(){
 document.querySelectorAll('[data-inc]').forEach(b=>b.onclick=()=>{state.cart[+b.dataset.inc].qty++;renderPOS()});
 document.querySelectorAll('[data-dec]').forEach(b=>b.onclick=()=>{const x=state.cart[+b.dataset.dec];x.qty--;if(x.qty<1)state.cart.splice(+b.dataset.dec,1);renderPOS()});
 document.querySelectorAll('[data-remove]').forEach(b=>b.onclick=()=>{state.cart.splice(+b.dataset.remove,1);renderPOS()});
 document.querySelector('#clear-cart').onclick=()=>{state.cart=[];renderPOS()};
 document.querySelector('#checkout').onclick=checkoutModal;
 document.querySelector('.customer-quick').onclick=checkoutModal;
}

function checkoutModal(){
 if(!state.cart.length){toast('Add at least one service first');return}
 const subtotal=state.cart.reduce((n,x)=>n+x.price*x.qty,0);
 showModal(`<div class="modal checkout-modal"><div class="modal-head"><div><span class="eyebrow">NEW ORDER</span><h2>Checkout</h2></div><button data-close>×</button></div>
 <form id="checkout-form"><div class="form-section"><h3>Customer details</h3><div class="form-grid"><label><span>Customer name *</span><input name="customer" required placeholder="e.g. Jane Wanjiku" autofocus></label><label><span>Phone number *</span><input name="phone" required inputmode="tel" placeholder="07XX XXX XXX"></label></div></div>
 <div class="form-section"><h3>Service speed</h3><div class="choice-grid"><label class="choice active"><input type="radio" name="turnaround" value="Normal" checked><span class="radio"></span><div><b>Normal · 24 hours</b><small>Standard published rate</small></div><strong>${money(subtotal)}</strong></label><label class="choice"><input type="radio" name="turnaround" value="Express"><span class="radio"></span><div><b>Express · 4 hours</b><small>30% express surcharge</small></div><strong>${money(Math.round(subtotal*1.3))}</strong></label></div></div>
 <div class="form-section"><div class="form-grid"><label><span>Discount</span><div class="input-affix"><input name="discount" type="number" min="0" max="100" value="0"><i>%</i></div></label><label><span>Payment method</span><select name="payment"><option>M-Pesa</option><option>Cash</option><option>Card</option><option>Pay later</option></select></label><label><span>Amount received</span><input name="paid" type="number" min="0" value="${subtotal}"></label><label><span>Fulfilment</span><select name="fulfilment"><option>Collection</option><option>Pickup & delivery</option></select></label></div><label><span>Care notes</span><textarea name="notes" placeholder="Stains, fabric care, delivery directions…"></textarea></label></div>
 <div class="checkout-summary"><span>Order total</span><strong id="checkout-total">${money(subtotal)}</strong></div><button class="primary submit-order" type="submit">Create order & receipt <span>→</span></button></form></div>`);
 const form=document.querySelector('#checkout-form');
 const recalc=()=>{const fd=new FormData(form), express=fd.get('turnaround')==='Express', discount=+(fd.get('discount')||0),total=Math.round(subtotal*(express?1.3:1)*(1-discount/100));document.querySelector('#checkout-total').textContent=money(total);if(document.activeElement?.name!=='paid')form.paid.value=total;document.querySelectorAll('.choice').forEach(x=>x.classList.toggle('active',x.querySelector('input').checked))};
 form.oninput=recalc; form.onsubmit=e=>{e.preventDefault();const fd=new FormData(form), express=fd.get('turnaround')==='Express',discount=+(fd.get('discount')||0),total=Math.round(subtotal*(express?1.3:1)*(1-discount/100));const num=Math.max(1001,...state.orders.map(o=>+o.id.split('-')[1]||0))+1;const created=Date.now();const order={id:`OD-${num}`,customer:fd.get('customer'),phone:fd.get('phone'),items:structuredClone(state.cart),subtotal,discount,total,paid:+fd.get('paid')||0,payment:fd.get('payment'),fulfilment:fd.get('fulfilment'),turnaround:fd.get('turnaround'),status:'Received',notes:fd.get('notes'),created,due:created+(express?4:24)*3600000};state.orders.unshift(order);db.orders=state.orders;state.cart=[];closeModal();receiptModal(order);shell();toast(`Order ${order.id} created`)};
}

function renderOrders(){
 document.querySelector('#view').innerHTML=`${header('Orders','Track, update and fulfil customer orders',`<button class="secondary" id="export-orders">Export CSV</button><button class="primary compact" id="new-order">+ New order</button>`)}
 <section class="page"><div class="stat-strip">${stat('Active orders',state.orders.filter(o=>!['Collected','Cancelled'].includes(o.status)).length,'blue')}${stat('Ready to collect',state.orders.filter(o=>o.status==='Ready').length,'green')}${stat('Outstanding',money(state.orders.reduce((n,o)=>n+Math.max(0,o.total-o.paid),0)),'orange')}${stat("Today's sales",money(todayOrders().reduce((n,o)=>n+o.paid,0)),'purple')}</div>
 <div class="panel"><div class="panel-tools"><label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="order-search" placeholder="Search order, customer or phone…"></label><select id="status-filter"><option>All statuses</option>${['Received','Cleaning','Ready','Collected','Cancelled'].map(x=>`<option>${x}</option>`).join('')}</select></div><div class="table-wrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Service</th><th>Due</th><th>Total</th><th>Balance</th><th>Status</th><th></th></tr></thead><tbody id="orders-body"></tbody></table></div></div></section>`;
 const draw=()=>{const q=document.querySelector('#order-search').value.toLowerCase(),f=document.querySelector('#status-filter').value;const rows=state.orders.filter(o=>(f==='All statuses'||o.status===f)&&`${o.id} ${o.customer} ${o.phone}`.toLowerCase().includes(q));document.querySelector('#orders-body').innerHTML=rows.length?rows.map(orderRow).join(''):'<tr><td colspan="8"><div class="empty"><b>No orders found</b><p>Adjust your filters and try again.</p></div></td></tr>';document.querySelectorAll('[data-order]').forEach(b=>b.onclick=()=>orderModal(b.dataset.order))};draw();document.querySelector('#order-search').oninput=draw;document.querySelector('#status-filter').onchange=draw;document.querySelector('#new-order').onclick=()=>{state.view='pos';shell()};document.querySelector('#export-orders').onclick=exportCSV;
}
function stat(label,value,color){return `<div class="mini-stat"><i class="${color}"></i><div><span>${label}</span><b>${value}</b></div></div>`}
function orderRow(o){return `<tr><td><button class="order-link" data-order="${o.id}">${o.id}</button><small>${day(o.created)} · ${time(o.created)}</small></td><td><b>${escapeHtml(o.customer)}</b><small>${escapeHtml(o.phone)}</small></td><td><b>${o.items.length} service${o.items.length>1?'s':''}</b><small>${o.items.reduce((n,x)=>n+x.qty,0)} item${o.items.reduce((n,x)=>n+x.qty,0)>1?'s':''}</small></td><td><b>${day(o.due)}</b><small>${time(o.due)} · ${o.turnaround}</small></td><td><b>${money(o.total)}</b></td><td><b class="${o.total-o.paid>0?'text-orange':''}">${money(Math.max(0,o.total-o.paid))}</b></td><td><span class="status ${o.status.toLowerCase()}"><i></i>${o.status}</span></td><td><button class="more" data-order="${o.id}">•••</button></td></tr>`}

function orderModal(id){const o=state.orders.find(x=>x.id===id);showModal(`<div class="modal order-modal"><div class="modal-head"><div><span class="eyebrow">${o.id}</span><h2>${escapeHtml(o.customer)}</h2><p>${escapeHtml(o.phone)} · ${o.fulfilment||'Collection'}</p></div><button data-close>×</button></div><div class="order-progress">${['Received','Cleaning','Ready','Collected'].map((s,i)=>`<div class="${i<=['Received','Cleaning','Ready','Collected'].indexOf(o.status)?'done':''}"><span>${i+1}</span><b>${s}</b></div>`).join('')}</div><div class="order-cols"><div><h3>Order items</h3>${o.items.map(x=>`<div class="receipt-line"><span>${x.qty} × ${escapeHtml(x.name)}</span><b>${money(x.qty*x.price)}</b></div>`).join('')}${o.notes?`<div class="notes"><b>Care notes</b><p>${escapeHtml(o.notes)}</p></div>`:''}</div><div class="order-summary"><h3>Payment summary</h3><div><span>Subtotal</span><b>${money(o.subtotal)}</b></div>${o.turnaround==='Express'?`<div><span>Express surcharge</span><b>${money(Math.round(o.subtotal*.3))}</b></div>`:''}<div><span>Paid via ${o.payment}</span><b>${money(o.paid)}</b></div><div class="total"><span>Balance</span><strong>${money(Math.max(0,o.total-o.paid))}</strong></div></div></div><div class="modal-actions"><button class="secondary" id="print-receipt">Print receipt</button><select id="update-status">${['Received','Cleaning','Ready','Collected','Cancelled'].map(s=>`<option ${s===o.status?'selected':''}>${s}</option>`).join('')}</select><button class="primary compact" id="save-status">Save status</button></div></div>`);document.querySelector('#print-receipt').onclick=()=>receiptModal(o);document.querySelector('#save-status').onclick=()=>{o.status=document.querySelector('#update-status').value;db.orders=state.orders;closeModal();renderOrders();toast(`${o.id} marked ${o.status}`)}}

function renderCustomers(){
 const map={};state.orders.forEach(o=>{const key=o.phone;map[key]??={name:o.customer,phone:o.phone,orders:0,spent:0,last:o.created};map[key].orders++;map[key].spent+=o.total;map[key].last=Math.max(map[key].last,o.created)});const customers=Object.values(map).sort((a,b)=>b.last-a.last);
 document.querySelector('#view').innerHTML=`${header('Customers','Your customer directory and order history')}<section class="page"><div class="panel"><div class="panel-title"><div><h2>All customers</h2><p>${customers.length} customer records</p></div><label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="customer-search" placeholder="Search customers…"></label></div><div class="customer-grid" id="customer-grid"></div></div></section>`;const draw=()=>{const q=document.querySelector('#customer-search').value.toLowerCase();document.querySelector('#customer-grid').innerHTML=customers.filter(c=>`${c.name} ${c.phone}`.toLowerCase().includes(q)).map((c,i)=>`<article class="customer-card"><div class="avatar">${c.name.split(' ').map(x=>x[0]).slice(0,2).join('')}</div><div class="customer-main"><b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.phone)}</span></div><div class="customer-meta"><span>${c.orders} orders<small>Orders</small></span><span>${money(c.spent)}<small>Lifetime spend</small></span><span>${day(c.last)}<small>Last visit</small></span></div></article>`).join('')};draw();document.querySelector('#customer-search').oninput=draw;
}

function todayOrders(){const start=new Date();start.setHours(0,0,0,0);return state.orders.filter(o=>o.created>=+start&&o.status!=='Cancelled')}
function renderReports(){
 const valid=state.orders.filter(o=>o.status!=='Cancelled'),revenue=valid.reduce((n,o)=>n+o.paid,0),avg=valid.length?Math.round(valid.reduce((n,o)=>n+o.total,0)/valid.length):0,top=[...state.services].map(s=>({name:s.name,qty:valid.reduce((n,o)=>n+(o.items.find(x=>x.id===s.id)?.qty||0),0)})).sort((a,b)=>b.qty-a.qty).slice(0,5),max=Math.max(1,...top.map(x=>x.qty));
 const days=Array.from({length:7},(_,i)=>{const d=new Date();d.setHours(0,0,0,0);d.setDate(d.getDate()-6+i);return {date:d,total:valid.filter(o=>new Date(o.created).toDateString()===d.toDateString()).reduce((n,o)=>n+o.paid,0)}}),maxDay=Math.max(1,...days.map(x=>x.total));
 document.querySelector('#view').innerHTML=`${header('Reports','A clear view of sales and service performance',`<button class="secondary" id="export-report">Export report</button>`)}<section class="page"><div class="report-cards">${metric('Gross sales',money(revenue),'All recorded payments','up')}${metric('Orders',valid.length,'All time','bag')}${metric('Average order',money(avg),'Per completed sale','avg')}${metric('Outstanding',money(valid.reduce((n,o)=>n+Math.max(0,o.total-o.paid),0)),'Awaiting payment','due')}</div><div class="reports-grid"><div class="panel chart-panel"><div class="panel-title"><div><h2>Sales overview</h2><p>Payments received over the last 7 days</p></div></div><div class="bar-chart">${days.map(x=>`<div class="bar-col"><b>${x.total?money(x.total):''}</b><div><i style="height:${Math.max(4,x.total/maxDay*100)}%"></i></div><span>${x.date.toLocaleDateString('en-KE',{weekday:'short'})}</span></div>`).join('')}</div></div><div class="panel top-services"><div class="panel-title"><div><h2>Popular services</h2><p>Ranked by quantity sold</p></div></div>${top.map((x,i)=>`<div class="rank"><span>${i+1}</span><div><b>${escapeHtml(x.name)}</b><i><em style="width:${x.qty/max*100}%"></em></i></div><strong>${x.qty}</strong></div>`).join('')}</div></div></section>`;document.querySelector('#export-report').onclick=exportCSV;
}
function metric(label,value,desc,icon){return `<div class="metric"><div><span>${label}</span><b>${value}</b><small>${desc}</small></div><i class="metric-icon ${icon}">${icon==='up'?'↗':icon==='bag'?'▣':icon==='avg'?'≈':'◷'}</i></div>`}

function renderServices(){
 document.querySelector('#view').innerHTML=`${header('Services & prices','Manage the services available at checkout',`<button class="primary compact" id="add-service">+ Add service</button>`)}<section class="page"><div class="notice"><span>i</span><p><b>Published price list</b>These rates were loaded from the Open Doors corporate brochure. Changes are saved on this device.</p><button id="reset-services">Reset defaults</button></div><div class="panel"><div class="panel-tools"><label class="search"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="service-table-search" placeholder="Search services…"></label></div><div class="table-wrap"><table><thead><tr><th>Service</th><th>Category</th><th>Unit price</th><th></th></tr></thead><tbody id="services-body"></tbody></table></div></div></section>`;const draw=()=>{const q=document.querySelector('#service-table-search').value.toLowerCase();document.querySelector('#services-body').innerHTML=state.services.filter(s=>s.name.toLowerCase().includes(q)).map(s=>`<tr><td><div class="service-table-name"><span class="mini-icon">${svg(s.icon)}</span><b>${escapeHtml(s.name)}</b></div></td><td><span class="category-label">${s.category}</span></td><td><b>${money(s.price)}</b></td><td><button class="more edit-service" data-id="${s.id}">Edit</button></td></tr>`).join('');document.querySelectorAll('.edit-service').forEach(b=>b.onclick=()=>serviceModal(b.dataset.id))};draw();document.querySelector('#service-table-search').oninput=draw;document.querySelector('#add-service').onclick=()=>serviceModal();document.querySelector('#reset-services').onclick=()=>{state.services=structuredClone(SERVICES);db.services=state.services;renderServices();toast('Default prices restored')};
}
function serviceModal(id){const s=state.services.find(x=>x.id===id);showModal(`<div class="modal small-modal"><div class="modal-head"><div><span class="eyebrow">SERVICE CATALOG</span><h2>${s?'Edit service':'Add service'}</h2></div><button data-close>×</button></div><form id="service-form"><label><span>Service name</span><input name="name" required value="${escapeHtml(s?.name||'')}"></label><label><span>Category</span><select name="category">${['Full load','Household','Duvets','Garments','Special care'].map(x=>`<option ${x===s?.category?'selected':''}>${x}</option>`).join('')}</select></label><label><span>Price (KES)</span><input name="price" required type="number" min="0" value="${s?.price||''}"></label><div class="modal-actions">${s?'<button type="button" class="danger" id="delete-service">Delete</button>':''}<button type="button" class="secondary" data-close>Cancel</button><button class="primary compact" type="submit">Save service</button></div></form></div>`);document.querySelector('#service-form').onsubmit=e=>{e.preventDefault();const fd=new FormData(e.target),data={id:s?.id||`custom-${Date.now()}`,name:fd.get('name'),category:fd.get('category'),price:+fd.get('price'),icon:s?.icon||'shirt'};if(s)Object.assign(s,data);else state.services.push(data);db.services=state.services;closeModal();renderServices();toast('Service saved')};if(s)document.querySelector('#delete-service').onclick=()=>{state.services=state.services.filter(x=>x.id!==id);db.services=state.services;closeModal();renderServices();toast('Service removed')}}

function receiptModal(o){showModal(`<div class="modal receipt-modal"><div class="receipt" id="printable"><div class="receipt-brand"><div class="brand-mark"><span></span></div><h2>OPEN DOORS</h2><b>LAUNDROMAT</b><p>So Fresh, So Clean, So You.</p></div><div class="receipt-info"><div><span>Receipt</span><b>${o.id}</b></div><div><span>Date</span><b>${day(o.created)}, ${time(o.created)}</b></div><div><span>Customer</span><b>${escapeHtml(o.customer)}</b></div><div><span>Phone</span><b>${escapeHtml(o.phone)}</b></div></div><div class="receipt-items"><div class="receipt-table-head"><span>Item</span><span>Amount</span></div>${o.items.map(x=>`<div class="receipt-line"><span>${x.qty} × ${escapeHtml(x.name)}<small>${money(x.price)} each</small></span><b>${money(x.qty*x.price)}</b></div>`).join('')}</div><div class="receipt-totals"><div><span>Subtotal</span><b>${money(o.subtotal)}</b></div>${o.turnaround==='Express'?`<div><span>Express service</span><b>+30%</b></div>`:''}${o.discount?`<div><span>Discount</span><b>−${o.discount}%</b></div>`:''}<div class="total"><span>Total</span><strong>${money(o.total)}</strong></div><div><span>Paid · ${o.payment}</span><b>${money(o.paid)}</b></div><div><span>Balance</span><b>${money(Math.max(0,o.total-o.paid))}</b></div></div><div class="receipt-due"><span>Ready by</span><b>${day(o.due)} at ${time(o.due)}</b></div><div class="receipt-footer"><b>Thank you for choosing Open Doors!</b><p>Chuna Mall, Ground Floor, Shop 10 · Kitengela</p></div></div><div class="receipt-actions"><button class="secondary" data-close>Close</button><button class="primary compact" id="do-print">Print receipt</button></div></div>`);document.querySelector('#do-print').onclick=()=>window.print()}

function showModal(html){document.querySelector('#modal').innerHTML=`<div class="backdrop">${html}</div>`;document.querySelectorAll('[data-close]').forEach(x=>x.onclick=closeModal);document.querySelector('.backdrop').onclick=e=>{if(e.target.classList.contains('backdrop'))closeModal()}}
function closeModal(){document.querySelector('#modal').innerHTML=''}
function toast(message){const el=document.querySelector('#toast');el.innerHTML=`<div class="toast"><span>✓</span>${message}</div>`;setTimeout(()=>el.innerHTML='',2800)}
function exportCSV(){const rows=[['Order','Date','Customer','Phone','Total','Paid','Balance','Payment','Status'],...state.orders.map(o=>[o.id,new Date(o.created).toISOString(),o.customer,o.phone,o.total,o.paid,Math.max(0,o.total-o.paid),o.payment,o.status])];const blob=new Blob([rows.map(r=>r.map(v=>`"${String(v).replaceAll('"','""')}"`).join(',')).join('\n')],{type:'text/csv'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`open-doors-orders-${new Date().toISOString().slice(0,10)}.csv`;a.click();URL.revokeObjectURL(a.href);toast('Report downloaded')}

if(sessionStorage.getItem(AUTH_KEY)) shell(); else renderLogin();
