
'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';

type Product={id:string;name:string;category:string;price:number;emoji:string;stock:number;min_stock:number;active:boolean};
type PaymentMethod={id:string;name:string;active:boolean};
type Sale={id:string;ticket:string;total:number;subtotal:number;discount:number;payment_method:string;created_at:string;status:string};
type Draft={id:string;label:string;payment_method:string;items:DraftItem[]};
type DraftItem={id?:string;product_id:string;product_name:string;quantity:number;unit_price:number;subtotal:number};
type Page='dashboard'|'sale'|'history'|'reports'|'products';

const money=(n:number)=>Number(n||0).toLocaleString('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0});
const localDate=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function dayBounds(date:string){const [y,m,d]=date.split('-').map(Number);const start=new Date(y,m-1,d,0,0,0,0);const end=new Date(y,m-1,d+1,0,0,0,0);return [start.toISOString(),end.toISOString()]}

export default function Home(){
 const supabase=useMemo(()=>createClient(),[]);
 const [user,setUser]=useState<User|null>(null);
 const [checking,setChecking]=useState(true);
 const [loginError,setLoginError]=useState('');
 const [page,setPage]=useState<Page>('dashboard');
 const [products,setProducts]=useState<Product[]>([]);
 const [methods,setMethods]=useState<PaymentMethod[]>([]);
 const [todaySales,setTodaySales]=useState<Sale[]>([]);
 const [drafts,setDrafts]=useState<Draft[]>([]);
 const [activeDraft,setActiveDraft]=useState('');
 const [category,setCategory]=useState('Todos');
 const [reportDate,setReportDate]=useState(localDate());
 const [reportSales,setReportSales]=useState<Sale[]>([]);
 const [history,setHistory]=useState<Sale[]>([]);
 const [toast,setToast]=useState('');

 useEffect(()=>{initAuth(); const {data:{subscription}}=supabase.auth.onAuthStateChange((_e,s)=>{setUser(s?.user??null);if(s?.user)loadAll();}); return()=>subscription.unsubscribe()},[]);
 async function initAuth(){const {data}=await supabase.auth.getUser();setUser(data.user??null);setChecking(false);if(data.user)await loadAll()}
 async function loadAll(){await Promise.all([loadProducts(),loadMethods(),loadToday(),loadDrafts(),loadHistory()])}
 async function login(e:FormEvent<HTMLFormElement>){e.preventDefault();setLoginError('');const f=new FormData(e.currentTarget);const email=String(f.get('email')||'');const password=String(f.get('password')||'');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setLoginError('Correo o contraseña incorrectos.')}
 async function logout(){await supabase.auth.signOut();setUser(null)}
 function notify(t:string){setToast(t);setTimeout(()=>setToast(''),2500)}

 async function loadProducts(){const {data,error}=await supabase.from('products').select('*').order('name');if(!error)setProducts((data||[]) as Product[])}
 async function loadMethods(){const {data,error}=await supabase.from('payment_methods').select('*').eq('active',true).order('sort_order');if(!error)setMethods((data||[]) as PaymentMethod[])}
 async function loadToday(){const [a,b]=dayBounds(localDate());const {data,error}=await supabase.from('sales').select('*').eq('status','completed').gte('created_at',a).lt('created_at',b).order('created_at',{ascending:false});if(!error)setTodaySales((data||[]) as Sale[])}
 async function loadHistory(){const {data,error}=await supabase.from('sales').select('*').order('created_at',{ascending:false}).limit(100);if(!error)setHistory((data||[]) as Sale[])}
 async function loadReport(date=reportDate){const [a,b]=dayBounds(date);const {data,error}=await supabase.from('sales').select('*').eq('status','completed').gte('created_at',a).lt('created_at',b).order('created_at',{ascending:false});if(error)notify(error.message);else setReportSales((data||[]) as Sale[])}
 async function loadDrafts(){const {data,error}=await supabase.from('open_sales').select('id,label,payment_method,open_sale_items(id,product_id,product_name,quantity,unit_price,subtotal)').order('created_at');if(!error){const d=(data||[]).map((x:any)=>({id:x.id,label:x.label,payment_method:x.payment_method,items:x.open_sale_items||[]}));setDrafts(d);if(d.length&&!activeDraft)setActiveDraft(d[0].id)}}

 async function newDraft(){const {data,error}=await supabase.from('open_sales').insert({label:`Venta ${drafts.length+1}`,payment_method:methods[0]?.name||'Efectivo'}).select().single();if(error){notify(error.message);return}const d:Draft={id:data.id,label:data.label,payment_method:data.payment_method,items:[]};setDrafts(x=>[...x,d]);setActiveDraft(d.id);setPage('sale')}
 async function addItem(p:Product){if(p.stock<=0){notify('Producto sin existencia');return}let id=activeDraft;if(!id){await newDraft();notify('Venta creada. Agrega el producto nuevamente.');return}const draft=drafts.find(d=>d.id===id);if(!draft)return;const old=draft.items.find(i=>i.product_id===p.id);const qty=(old?.quantity||0)+1;if(qty>p.stock){notify('No hay más existencia disponible');return}
   const row={open_sale_id:id,product_id:p.id,product_name:p.name,quantity:qty,unit_price:p.price,subtotal:qty*p.price};
   const {data,error}=await supabase.from('open_sale_items').upsert(row,{onConflict:'open_sale_id,product_id'}).select().single();if(error){notify(error.message);return}
   setDrafts(ds=>ds.map(d=>d.id===id?{...d,items:old?d.items.map(i=>i.product_id===p.id?data:i):[...d.items,data]}:d))}
 async function changeQty(item:DraftItem,delta:number){const draft=drafts.find(d=>d.id===activeDraft);if(!draft)return;const product=products.find(p=>p.id===item.product_id);const qty=item.quantity+delta;if(qty<=0){await supabase.from('open_sale_items').delete().eq('open_sale_id',activeDraft).eq('product_id',item.product_id);setDrafts(ds=>ds.map(d=>d.id===activeDraft?{...d,items:d.items.filter(i=>i.product_id!==item.product_id)}:d));return}if(product&&qty>product.stock){notify('Stock insuficiente');return}
   const {data,error}=await supabase.from('open_sale_items').update({quantity:qty,subtotal:qty*item.unit_price}).eq('open_sale_id',activeDraft).eq('product_id',item.product_id).select().single();if(!error)setDrafts(ds=>ds.map(d=>d.id===activeDraft?{...d,items:d.items.map(i=>i.product_id===item.product_id?data:i)}:d))}
 async function setPayment(name:string){await supabase.from('open_sales').update({payment_method:name,updated_at:new Date().toISOString()}).eq('id',activeDraft);setDrafts(ds=>ds.map(d=>d.id===activeDraft?{...d,payment_method:name}:d))}
 async function removeDraft(id:string){await supabase.from('open_sales').delete().eq('id',id);setDrafts(ds=>ds.filter(d=>d.id!==id));setActiveDraft('')}
 async function confirmSale(){const d=drafts.find(x=>x.id===activeDraft);if(!d||!d.items.length){notify('Agrega productos');return}const {data,error}=await supabase.rpc('complete_sale',{p_open_sale_id:d.id});if(error){notify(error.message);return}notify(`Venta ${data} registrada`);setDrafts(ds=>ds.filter(x=>x.id!==d.id));setActiveDraft('');await Promise.all([loadProducts(),loadToday(),loadHistory()]);setPage('dashboard')}

 async function addProduct(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);const row={name:String(f.get('name')),category:String(f.get('category')),price:Number(f.get('price')),emoji:String(f.get('emoji')||'🍔'),stock:Number(f.get('stock')),min_stock:Number(f.get('min_stock')||0),active:true};const {error}=await supabase.from('products').insert(row);if(error){notify(error.message);return}e.currentTarget.reset();notify('Producto agregado');await loadProducts()}
 async function changeStock(id:string,stock:number){const {error}=await supabase.from('products').update({stock}).eq('id',id);if(error)notify(error.message);else{notify('Existencia actualizada');loadProducts()}}
 async function editPayment(sale:Sale){const current=methods.findIndex(m=>m.name===sale.payment_method);const next=methods[(current+1)%methods.length]?.name;if(!next)return;const {error}=await supabase.rpc('change_sale_payment',{p_sale_id:sale.id,p_payment_method:next});if(error)notify(error.message);else{notify(`Pago cambiado a ${next}`);await Promise.all([loadToday(),loadHistory(),loadReport(reportDate)])}}

 if(checking)return <div className="loader">Cargando FastFood POS…</div>;
 if(!user)return <Login onSubmit={login} error={loginError}/>;

 const active=drafts.find(d=>d.id===activeDraft);
 const activeTotal=active?.items.reduce((a,i)=>a+Number(i.subtotal),0)||0;
 const cats=['Todos',...Array.from(new Set(products.map(p=>p.category)))];
 const filtered=(category==='Todos'?products:products.filter(p=>p.category===category)).filter(p=>p.active);
 const dashboardTotal=todaySales.reduce((a,s)=>a+Number(s.total),0);
 const avg=todaySales.length?dashboardTotal/todaySales.length:0;
 const reportTotal=reportSales.reduce((a,s)=>a+Number(s.total),0);
 const byMethod=(name:string)=>reportSales.filter(s=>s.payment_method===name).reduce((a,s)=>a+Number(s.total),0);

 return <div className="app">
  <aside className="side"><div className="brand">🍔 Fast<span>Food</span></div><nav className="nav">
   <button className={page==='dashboard'?'active':''} onClick={()=>setPage('dashboard')}>🏠 <span>Dashboard</span></button>
   <button className={page==='sale'?'active':''} onClick={()=>setPage('sale')}>🛒 <span>Nueva venta</span></button>
   <button className={page==='history'?'active':''} onClick={()=>{setPage('history');loadHistory()}}>🧾 <span>Ventas</span></button>
   <button className={page==='reports'?'active':''} onClick={()=>{setPage('reports');loadReport()}}>📊 <span>Ventas por día</span></button>
   <button className={page==='products'?'active':''} onClick={()=>setPage('products')}>📦 <span>Productos</span></button>
  </nav><div className="account"><b>Sesión activa</b><small>{user.email}</small><button className="logout" onClick={logout}>Cerrar sesión</button></div></aside>

  <main className="main">
   {page==='dashboard'&&<section><div className="top"><div><h1>Dashboard de hoy</h1><div className="muted">Solo muestra ventas completadas del día actual.</div></div><div className="datebox">📅 {new Date().toLocaleDateString('es-CO',{day:'numeric',month:'long',year:'numeric'})}</div></div>
    <div className="cards">
     <Metric icon="💰" label="Ventas de hoy" value={money(dashboardTotal)} sub="Acumulado del día"/>
     <Metric icon="🛍️" label="Órdenes de hoy" value={String(todaySales.length)} sub="Ventas completadas"/>
     <Metric icon="🧾" label="Ticket promedio" value={money(avg)} sub="Promedio del día"/>
     <Metric icon="📦" label="Productos con stock bajo" value={String(products.filter(p=>p.stock<=p.min_stock).length)} sub="Requieren atención"/>
    </div>
    <div className="grid"><div className="card"><div className="title"><h2>Ventas por hora</h2><button className="btn" onClick={loadToday}>Actualizar</button></div><HourlyChart sales={todaySales}/></div><div className="card"><div className="title"><h2>Ventas recientes</h2><button className="btn primary" onClick={newDraft}>+ Venta</button></div><SaleList sales={todaySales.slice(0,7)}/></div></div>
   </section>}

   {page==='sale'&&<section><div className="top"><div><h1>Nueva venta</h1><div className="muted">Las ventas abiertas se guardan en Supabase.</div></div><button className="btn primary" onClick={newDraft}>＋ Abrir venta</button></div>
    <div className="tabs">{drafts.map(d=><button key={d.id} className={`tab ${activeDraft===d.id?'active':''}`} onClick={()=>setActiveDraft(d.id)}>{d.label} · {money(d.items.reduce((a,i)=>a+Number(i.subtotal),0))}</button>)}</div>
    {!active?<div className="card empty">No hay una venta seleccionada. Presiona “Abrir venta”.</div>:<div className="salegrid"><div><div className="cats">{cats.map(c=><button key={c} className={`cat ${category===c?'active':''}`} onClick={()=>setCategory(c)}>{c}</button>)}</div><div className="menu">{filtered.map(p=><button className="item" key={p.id} onClick={()=>addItem(p)}><div className="food">{p.emoji}</div><b>{p.name}</b><small>{money(p.price)}</small><div className="stock">Existencia: {p.stock}</div></button>)}</div></div>
     <aside className="card order"><div className="title"><h2>{active.label}</h2><button className="btn danger" onClick={()=>removeDraft(active.id)}>Cerrar</button></div>{active.items.length?active.items.map(i=><div className="orderline" key={i.product_id}><span><b>{i.product_name}</b><br/><small>{money(i.unit_price)}</small></span><span className="qty"><button onClick={()=>changeQty(i,-1)}>−</button> {i.quantity} <button onClick={()=>changeQty(i,1)}>+</button></span><b>{money(i.subtotal)}</b></div>):<div className="empty">Agrega productos</div>}
      <div className="total"><span>Total</span><span>{money(activeTotal)}</span></div><div className="pay">{methods.map(m=><button key={m.id} className={active.payment_method===m.name?'active':''} onClick={()=>setPayment(m.name)}>{m.name}</button>)}</div><button className="btn success" style={{width:'100%',padding:13}} onClick={confirmSale}>✓ Confirmar y guardar venta</button></aside></div>}
   </section>}

   {page==='history'&&<section><div className="top"><div><h1>Registro de ventas</h1><div className="muted">Últimas 100 ventas guardadas en la base de datos.</div></div><button className="btn" onClick={loadHistory}>Actualizar</button></div>
    <div className="card tablewrap"><table className="table"><thead><tr><th>Venta</th><th>Fecha</th><th>Total</th><th>Método</th><th>Estado</th><th>Acción</th></tr></thead><tbody>{history.map(s=><tr key={s.id}><td><b>{s.ticket}</b></td><td>{new Date(s.created_at).toLocaleString('es-CO')}</td><td>{money(s.total)}</td><td>{s.payment_method}</td><td><span className="pill">{s.status}</span></td><td><button className="btn" onClick={()=>editPayment(s)}>Cambiar método</button></td></tr>)}</tbody></table></div>
   </section>}

   {page==='reports'&&<section><div className="top"><div><h1>Ventas por día</h1><div className="muted">Elige una fecha y genera el cierre de ese día.</div></div></div>
    <div className="card"><div className="filters"><div className="field"><label>Fecha</label><input className="input" type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></div><button className="btn primary" onClick={()=>loadReport(reportDate)}>Generar informe</button></div></div>
    <div className="report-grid"><div className="report-card"><small>💵 Efectivo</small><strong>{money(byMethod('Efectivo'))}</strong></div><div className="report-card"><small>💳 Tarjeta</small><strong>{money(byMethod('Tarjeta'))}</strong></div><div className="report-card"><small>📱 Transferencia</small><strong>{money(byMethod('Transferencia'))}</strong></div><div className="report-card"><small>💰 Acumulado del día</small><strong>{money(reportTotal)}</strong></div></div>
    <div className="card tablewrap"><div className="title"><h2>Detalle — {reportDate}</h2><span className="muted small">{reportSales.length} ventas</span></div><table className="table"><thead><tr><th>Venta</th><th>Hora</th><th>Método</th><th>Total</th></tr></thead><tbody>{reportSales.map(s=><tr key={s.id}><td>{s.ticket}</td><td>{new Date(s.created_at).toLocaleTimeString('es-CO')}</td><td>{s.payment_method}</td><td><b>{money(s.total)}</b></td></tr>)}</tbody></table></div>
   </section>}

   {page==='products'&&<section><div className="top"><div><h1>Productos e inventario</h1><div className="muted">Agrega productos, precio y existencia inicial.</div></div></div>
    <div className="two"><form className="card form" onSubmit={addProduct}><div className="title"><h2>Agregar producto</h2></div><div className="field"><label>Nombre</label><input className="input" name="name" required/></div><div className="field"><label>Categoría</label><input className="input" name="category" placeholder="Hamburguesas" required/></div><div className="field"><label>Precio</label><input className="input" name="price" type="number" min="0" required/></div><div className="field"><label>Emoji / icono</label><input className="input" name="emoji" defaultValue="🍔"/></div><div className="field"><label>Existencia inicial</label><input className="input" name="stock" type="number" min="0" defaultValue="0" required/></div><div className="field"><label>Stock mínimo</label><input className="input" name="min_stock" type="number" min="0" defaultValue="5"/></div><button className="btn primary" type="submit">Guardar producto</button></form>
     <div className="card tablewrap"><div className="title"><h2>Inventario actual</h2><button className="btn" onClick={loadProducts}>Actualizar</button></div><table className="table"><thead><tr><th>Producto</th><th>Precio</th><th>Existencia</th><th>Estado</th></tr></thead><tbody>{products.map(p=><tr key={p.id}><td>{p.emoji} <b>{p.name}</b><br/><span className="muted">{p.category}</span></td><td>{money(p.price)}</td><td><input className="input" style={{width:90}} type="number" min="0" defaultValue={p.stock} onBlur={e=>changeStock(p.id,Number(e.target.value))}/></td><td><span className={`pill ${p.stock<=p.min_stock?'low':''}`}>{p.stock<=p.min_stock?'Stock bajo':'Disponible'}</span></td></tr>)}</tbody></table></div>
    </div>
   </section>}
  </main>{toast&&<div className="toast">{toast}</div>}
 </div>
}

function Login({onSubmit,error}:{onSubmit:(e:FormEvent<HTMLFormElement>)=>void;error:string}){return <div className="login-wrap"><div className="login-card"><div className="login-logo">🍔 Fast<span>Food</span></div><h1 style={{fontSize:23,marginBottom:6}}>Iniciar sesión</h1><p className="muted">Ingresa con el usuario creado en Supabase Auth.</p><form className="form" onSubmit={onSubmit}>{error&&<div className="error">{error}</div>}<div className="field"><label>Correo</label><input className="input" name="email" type="email" required/></div><div className="field"><label>Contraseña</label><input className="input" name="password" type="password" required/></div><button className="btn primary" style={{padding:12}} type="submit">Entrar</button></form></div></div>}
function Metric({icon,label,value,sub}:{icon:string;label:string;value:string;sub:string}){return <div className="card metric"><div className="ico">{icon}</div><div><small>{label}</small><strong>{value}</strong><span className="green small">{sub}</span></div></div>}
function SaleList({sales}:{sales:Sale[]}){return <ul className="sales">{sales.length?sales.map(s=><li key={s.id}><span><b>{s.ticket}</b><br/><span className="muted">{new Date(s.created_at).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</span></span><b>{money(s.total)}</b><span className="status">{s.payment_method}</span></li>):<li className="muted">Aún no hay ventas hoy.</li>}</ul>}
function HourlyChart({sales}:{sales:Sale[]}){const h=Array(24).fill(0);sales.forEach(s=>h[new Date(s.created_at).getHours()]+=Number(s.total));const max=Math.max(...h,1);return <div className="chart">{h.map((v,i)=><div className="bar" key={i} title={money(v)} style={{height:`${Math.max(8,v/max*190)}px`}}><label>{i}</label></div>)}</div>}
