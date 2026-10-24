import { FIREBASE_CONFIG } from './firebase-config.js';

/* =========================================================
   DinDin — app financeiro (PWA)
   Banco: Firebase Firestore (ou modo demonstração local)
   ========================================================= */

/* ---------- utilidades ---------- */
const MES = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
const MESL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const pad = n => String(n).padStart(2, '0');
const idx = (y, m) => y * 12 + m;                       // mês absoluto (m de 0 a 11)
const keyOf = i => `${Math.floor(i / 12)}-${pad(i % 12 + 1)}`;
const idxOfKey = k => { const [y, m] = k.split('-').map(Number); return y * 12 + m - 1; };
const lab = i => MES[((i % 12) + 12) % 12] + '/' + String(Math.floor(i / 12)).slice(2);
const nomeMes = i => MESL[((i % 12) + 12) % 12];
const CUR = () => { const d = new Date(); return idx(d.getFullYear(), d.getMonth()); };
const DIA = () => new Date().getDate();
const isoHoje = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const r2 = v => Math.round(v * 100) / 100;
const fmt = v => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmt0 = v => 'R$ ' + Math.round(v || 0).toLocaleString('pt-BR');
const brl = v => (r2(v || 0)).toFixed(2).replace('.', ',');
const num = s => {
  s = String(s ?? '').trim().replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const v = parseFloat(s); return isNaN(v) ? 0 : r2(v);
};
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const slug = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
             set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

/* ---------- padrões (vindos da planilha dela) ---------- */
const PAL = ['#A2B7D0','#F3A447','#D092A7','#9C85C0','#E7BC29','#A5B592','#E2BECB','#C2889C','#F0D77D','#C4B5D9','#F8C98F','#8FB8B0'];
const CATS_PADRAO = ['Alimentação','Supermercado','Casa','Pets','Beleza','Lazer','Restaurantes','Ifood','Mimos','Presentes','Vestuário',
  'Transporte','Uber','Saúde/Farmácia','Médico','Estudos','E-book','App assinatura','Anuidade cartão','Celular Mãe','Doação','Pessoal',
  'Trabalho','Seguros','Multas','Viagens','Gastos Extras','Outros Obrigatórios','Outros Não Obrigatórios'];
const ENTRADAS = ['Salário','13º Salário','Bônus','Férias','Economias','Transferências'];
function cfgPadrao() {
  const ts = Date.now();
  return {
    nome: '', setup: false, receita: 0, guardarMeta: 0,
    cats: CATS_PADRAO.map((n, k) => ({ id: slug(n), nome: n, c: PAL[k % PAL.length], ativa: true })),
    entradas: ENTRADAS,
    contas: [
      { id: 'itau', nome: 'Itaú', sub: 'conta corrente', tipo: 'conta', base: 0, baseTs: ts },
      { id: 'reserva', nome: 'Reserva', sub: 'investimento', tipo: 'invest', base: 0, baseTs: ts }],
    cartoes: [
      { id: 'nubank', nome: 'Nubank', fecha: 26, vence: 2, conta: 'itau' },
      { id: 'itauc', nome: 'Itaú cartão', fecha: 13, vence: 20, conta: 'itau' },
      { id: 'outros', nome: 'Outros cartões', fecha: 1, vence: 8, conta: 'itau' }],
    fixas: [
      { id: 'academia', nome: 'Academia', valor: 99, venc: 2, meio: 'itau' },
      { id: 'condominio', nome: 'Condomínio', valor: 380.74, venc: 5, meio: 'itau' },
      { id: 'aluguel', nome: 'Aluguel', valor: 1120, venc: 10, meio: 'itau' },
      { id: 'energia', nome: 'Energia', valor: 130, venc: 13, meio: 'itau' },
      { id: 'internet', nome: 'Internet', valor: 99.9, venc: 13, meio: 'itau' },
      { id: 'dividas', nome: 'Dívidas', valor: 326.76, venc: 15, meio: 'itau' },
      { id: 'celular', nome: 'Celular', valor: 35, venc: 20, meio: 'itau' }],
    teto: { modo: 'fixo', valor: 1000, pct: 20 },
    contaPadrao: 'itau'
  };
}

/* =========================================================
   Camada de dados: Firestore ou local (demonstração)
   ========================================================= */
const CONFIG_OK = FIREBASE_CONFIG && FIREBASE_CONFIG.apiKey && !String(FIREBASE_CONFIG.apiKey).startsWith('COLE');
const S = { cfg: null, meses: {}, lanc: [], parc: [], user: null, pronto: false, demo: !CONFIG_OK };
let DB = null;

function emitir() { if (S.cfg) render(false); }

/* --- modo demonstração: tudo no próprio aparelho --- */
function dbLocal() {
  const K = 'dindin-demo';
  const salvar = () => ls.set(K, { cfg: S.cfg, meses: S.meses, lanc: S.lanc, parc: S.parc });
  return {
    async iniciar() {
      const d = ls.get(K, null);
      if (d) Object.assign(S, d); else { S.cfg = cfgPadrao(); salvar(); }
      S.user = { email: 'modo demonstração' }; S.pronto = true; emitir();
    },
    saveCfg(c) { S.cfg = c; salvar(); emitir(); },
    saveMes(k, m) { S.meses[k] = m; salvar(); emitir(); },
    addLanc(l) { l.id = novoId(); S.lanc.push(l); salvar(); emitir(); },
    updLanc(id, l) { const i = S.lanc.findIndex(x => x.id === id); if (i >= 0) S.lanc[i] = { ...l, id }; salvar(); emitir(); },
    delLanc(id) { S.lanc = S.lanc.filter(x => x.id !== id); salvar(); emitir(); },
    addParc(p) { p.id = novoId(); S.parc.push(p); salvar(); emitir(); },
    delParc(id) { S.parc = S.parc.filter(x => x.id !== id); salvar(); emitir(); },
    async sair() { try { localStorage.removeItem(K); } catch {} location.reload(); }
  };
}

/* --- Firestore --- */
async function dbFirebase() {
  const V = '10.14.1';
  const [{ initializeApp }, A, F] = await Promise.all([
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-auth.js`),
    import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)]);
  const app = initializeApp(FIREBASE_CONFIG);
  const auth = A.getAuth(app);
  const fs = F.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  let unsubs = [], corteAtual = null, uid = null;
  const base = () => `users/${uid}`;
  const erro = e => { console.error(e); toast('Não consegui salvar. Confira a internet.'); };
  const limpar = () => { unsubs.forEach(u => u()); unsubs = []; corteAtual = null; };

  function ouvirLanc(corte) {
    corteAtual = corte;
    const q = F.query(F.collection(fs, base(), 'lanc'), F.where('criado', '>=', corte));
    unsubs.push(F.onSnapshot(q, s => { S.lanc = s.docs.map(d => ({ ...d.data(), id: d.id })); emitir(); }, e => console.error(e)));
  }
  function iniciarListeners() {
    unsubs.push(F.onSnapshot(F.doc(fs, base(), 'config', 'main'), s => {
      if (!s.exists()) {
        if (!s.metadata.fromCache) F.setDoc(F.doc(fs, base(), 'config', 'main'), cfgPadrao()).catch(erro);
        return;
      }
      S.cfg = s.data();
      const umAno = Date.now() - 400 * 864e5;
      const corte = Math.min(umAno, ...S.cfg.contas.map(c => c.baseTs || umAno));
      if (corteAtual == null || corte < corteAtual) ouvirLanc(corte);
      S.pronto = true; emitir();
    }, e => console.error(e)));
    unsubs.push(F.onSnapshot(F.collection(fs, base(), 'meses'), s => {
      S.meses = {}; s.docs.forEach(d => S.meses[d.id] = d.data()); emitir();
    }, e => console.error(e)));
    unsubs.push(F.onSnapshot(F.collection(fs, base(), 'parc'), s => {
      S.parc = s.docs.map(d => ({ ...d.data(), id: d.id })); emitir();
    }, e => console.error(e)));
  }
  return {
    auth: {
      entrar: (e, p) => A.signInWithEmailAndPassword(auth, e, p),
      criar: (e, p) => A.createUserWithEmailAndPassword(auth, e, p),
      resetar: e => A.sendPasswordResetEmail(auth, e)
    },
    async iniciar() {
      A.onAuthStateChanged(auth, u => {
        limpar(); S.user = u; S.cfg = null; S.meses = {}; S.lanc = []; S.parc = []; S.pronto = false;
        if (u) { uid = u.uid; render(); iniciarListeners(); } else { uid = null; render(); }
      });
    },
    saveCfg(c) { F.setDoc(F.doc(fs, base(), 'config', 'main'), c).catch(erro); },
    saveMes(k, m) { F.setDoc(F.doc(fs, base(), 'meses', k), m).catch(erro); },
    addLanc(l) { F.addDoc(F.collection(fs, base(), 'lanc'), l).catch(erro); },
    updLanc(id, l) { const { id: _, ...d } = l; F.setDoc(F.doc(fs, base(), 'lanc', id), d).catch(erro); },
    delLanc(id) { F.deleteDoc(F.doc(fs, base(), 'lanc', id)).catch(erro); },
    addParc(p) { F.addDoc(F.collection(fs, base(), 'parc'), p).catch(erro); },
    delParc(id) { F.deleteDoc(F.doc(fs, base(), 'parc', id)).catch(erro); },
    async sair() { limpar(); await A.signOut(auth); }
  };
}

/* =========================================================
   Regras de negócio
   ========================================================= */
const cat = id => S.cfg.cats.find(c => c.id === id) || { id, nome: 'Sem categoria', c: '#DDDDDD' };
const cartao = id => S.cfg.cartoes.find(c => c.id === id);
const conta = id => S.cfg.contas.find(c => c.id === id);
const contasCorrentes = () => S.cfg.contas.filter(c => c.tipo === 'conta');
const investimentos = () => S.cfg.contas.filter(c => c.tipo === 'invest');
const meios = () => [...contasCorrentes().map(c => ({ id: c.id, nome: c.nome, tipo: 'conta' })), ...S.cfg.cartoes.map(c => ({ id: c.id, nome: c.nome, tipo: 'cartao' }))];
const meioNome = id => (meios().find(m => m.id === id) || conta(id) || { nome: '—' }).nome;
const mesDoc = i => S.meses[keyOf(i)];
const lancMes = i => S.lanc.filter(l => l.mes === keyOf(i));
const soma = (arr, f = x => x.valor) => arr.reduce((s, x) => s + (f(x) || 0), 0);
const ativaNoMes = (p, i) => i >= p.primeira && i < p.primeira + p.n;
const parcNoMes = (i, filtro = () => true) => soma(S.parc.filter(p => filtro(p) && ativaNoMes(p, i)), p => p.parcela);
const gastoCat = (id, i) => soma(lancMes(i).filter(l => l.tipo === 'gasto' && l.cat === id)) + parcNoMes(i, p => p.cat === id);
const planCat = (id, i) => mesDoc(i)?.plan?.[id] || 0;
const parcCat = (id, i) => parcNoMes(i, p => p.cat === id);
const catsDoMes = i => S.cfg.cats.filter(c => planCat(c.id, i) > 0 || gastoCat(c.id, i) > 0);
const receitaPlan = i => mesDoc(i)?.receita ?? S.cfg.receita;
const metaGuardar = i => mesDoc(i)?.guardarMeta ?? S.cfg.guardarMeta;
const LIVRE = '__livre';
/* dinheiro do mês que ainda não foi colocado em nenhuma categoria */
const baseMes = i => Math.max(entrou(i), receitaPlan(i) || 0);
const gastoVar = i => r2(soma(S.cfg.cats, c => gastoCat(c.id, i)));
/* livre de verdade: o que entra - fixas - o que já foi guardado - o que já foi gasto (a meta não entra aqui) */
const livreTotal = i => r2(baseMes(i) - soma(fixasDoMes(i)) - guardado(i) - gastoVar(i));
const reservadoCats = i => r2(soma(S.cfg.cats, c => Math.max(0, planCat(c.id, i) - gastoCat(c.id, i))));
/* dinheiro solto: livre que não está reservado em nenhuma categoria */
const semCat = i => r2(livreTotal(i) - reservadoCats(i));
const diaVirada = () => S.cfg.diaVirada ?? 25;
/* entrada recebida perto do fim do mês conta para o mês seguinte (ex.: salário dia 30) */
const compPadrao = data => idxOfKey(data.slice(0, 7)) + (Number(data.slice(8, 10)) >= diaVirada() ? 1 : 0);
const isoOntem = () => { const d = new Date(Date.now() - 864e5); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const kfmt = v => Math.abs(v) >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : String(Math.round(v));
const entrou = i => soma(lancMes(i).filter(l => l.tipo === 'entrada'));
const guardado = i => soma(lancMes(i).filter(l => l.tipo === 'guardar'));
const fixasDoMes = i => mesDoc(i)?.fixas || S.cfg.fixas.map(f => ({ ...f, pago: false }));
const teto = () => S.cfg.teto.modo === 'fixo' ? S.cfg.teto.valor : r2(receitaPlan(CUR()) * S.cfg.teto.pct / 100);
const diaDe = l => Number(String(l.data).slice(8, 10));
/* fatura em que cai uma compra feita no dia d do mês i (identificada pelo mês de vencimento) */
function faturaDe(c, i, d) { const fech = i + (d >= c.fecha ? 1 : 0); return c.vence > c.fecha ? fech : fech + 1; }
function janela(c, M) { const fech = c.vence > c.fecha ? M : M - 1; return { de: `${c.fecha}/${MES[((fech - 1) % 12 + 12) % 12]}`, ate: `${c.fecha - 1 || 'último dia'}/${MES[(fech % 12 + 12) % 12]}` }; }
function valorFatura(c, M) {
  const avista = soma(S.lanc.filter(l => l.tipo === 'gasto' && l.meio === c.id && faturaDe(c, idxOfKey(String(l.data).slice(0, 7)), diaDe(l)) === M));
  return r2(avista + parcNoMes(M, p => p.cartao === c.id));
}
const faturaPaga = (c, M) => S.lanc.find(l => l.tipo === 'fatura' && l.cartao === c.id && l.fatM === M);
function saldo(ct) {
  let s = ct.base || 0; const ts = ct.baseTs || 0;
  for (const l of S.lanc) {
    if ((l.criado || 0) <= ts || (l.data && l.data > isoHoje()) || l.tipo === 'marca') continue;
    if (l.importado && new Date(l.data + 'T23:59').getTime() <= ts) continue;
    if (l.tipo === 'entrada' && l.meio === ct.id) s += l.valor;
    if ((l.tipo === 'gasto' || l.tipo === 'fatura') && l.meio === ct.id) s -= l.valor;
    if (l.tipo === 'guardar') { if (l.meio === ct.id) s -= l.valor; if (l.para === ct.id) s += l.valor; }
  }
  for (const k in S.meses) for (const f of S.meses[k].fixas || []) if (f.pago && f.meio === ct.id && (f.pagoTs || 0) > ts) s -= f.valor;
  return r2(s);
}
function status(g, p) {
  if (p <= 0) return g > 0 ? ['neutro', 'sem plano'] : ['neutro', '—'];
  const r = g / p;
  if (g > p + 0.005) return ['estouro', 'passou ' + fmt(g - p)];
  if (r >= 0.85) return ['alerta', Math.round(r * 100) + '% usado'];
  return ['ok', Math.round(r * 100) + '% usado'];
}
function picoParcelas(M, n, par, cId) {
  let mx = 0, mes = M; for (let k = 0; k < n; k++) { const v = parcNoMes(M + k) + par; if (v > mx) { mx = v; mes = M + k; } }
  return { mx: r2(mx), mes };
}
function simular(total, n, cId) {
  const c = cartao(cId) || S.cfg.cartoes[0]; const par = r2(total / n); const T = teto();
  const inicio = faturaDe(c, CUR(), DIA());
  const agora = picoParcelas(inicio, n, par);
  let melhor = null; for (let M = inicio; M < inicio + 24; M++) if (picoParcelas(M, n, par).mx <= T + 0.005) { melhor = M; break; }
  return { c, par, T, inicio, agora, melhor, picoMelhor: melhor != null ? picoParcelas(melhor, n, par) : null };
}
/* cria o mês a partir do anterior se ainda não existir */
function mesPadrao(i) {
  let ant = null; for (let k = i - 1; k >= i - 12; k--) if (S.meses[keyOf(k)]) { ant = S.meses[keyOf(k)]; break; }
  return { receita: S.cfg.receita, guardarMeta: S.cfg.guardarMeta, plan: { ...(ant?.plan || {}) },
    fixas: S.cfg.fixas.map(f => ({ ...f, pago: false })), criado: Date.now() };
}

/* =========================================================
   Desenhos
   ========================================================= */
const porquinho = (s = 64) => `<svg width="${s}" height="${s}" viewBox="0 0 64 64" fill="none" stroke="#3D3634" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <circle cx="34" cy="10" r="7" fill="#F0D77D"/><path stroke-width="1.8" d="M36.3 7.6c-.4-.8-1.3-1.3-2.3-1.3-1.3 0-2.3.7-2.3 1.8s.9 1.5 2.3 1.8 2.3.8 2.3 1.9-1 1.8-2.3 1.8c-1 0-1.9-.5-2.3-1.3M34 4.6v1.7M34 13.6v1.7"/>
  <path d="M12 36c0-10 9-17 21-17s21 7 21 17-8 16-21 16c-3 0-6-.4-8.5-1.2L22 56h-5l-.6-6.6C13.7 46 12 41.4 12 36Z" fill="#E2BECB"/>
  <path d="M22 22l-2-6 7 3" fill="#E2BECB"/><path d="M43 53v4h5v-6"/>
  <ellipse cx="54" cy="37" rx="5" ry="4.2" fill="#D092A7"/><circle cx="52.6" cy="37" r=".6" fill="#3D3634"/><circle cx="55.6" cy="37" r=".6" fill="#3D3634"/>
  <path d="M28 25h9"/><circle cx="44" cy="31" r="1.4" fill="#3D3634"/><path d="M40.5 37.5c1 .9 2.2.9 3.2 0"/>
  <ellipse cx="38.5" cy="35" rx="2.4" ry="1.3" fill="#F5C6CF" stroke="none"/><path d="M12 35c-3 0-5-2-4-4"/></svg>`;
const check = '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#3D3634" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m3 8.5 3.2 3L13 4.5"/></svg>';
function donut(itens, total) {
  const R = 56, C = 2 * Math.PI * R; let off = 0;
  const arcs = total > 0 ? itens.filter(i => i.v > 0).map(i => { const len = C * i.v / total; const a = `<circle cx="75" cy="75" r="${R}" fill="none" stroke="${i.c}" stroke-width="22" stroke-dasharray="${len} ${C - len}" stroke-dashoffset="${-off}" transform="rotate(-90 75 75)"/>`; off += len; return a; }).join('') : '';
  return `<svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="Gasto por categoria">
    <circle cx="75" cy="75" r="56" fill="none" stroke="#F1EDF0" stroke-width="22"/>${arcs}
    <circle cx="75" cy="75" r="67.5" fill="none" stroke="#3D3634" stroke-width="2"/><circle cx="75" cy="75" r="44.5" fill="none" stroke="#3D3634" stroke-width="2"/>
    <text x="75" y="72" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="800" font-size="17" fill="#3D3634">${fmt0(total)}</text>
    <text x="75" y="89" text-anchor="middle" font-family="Nunito,sans-serif" font-weight="700" font-size="10.5" fill="#8A7F7B">gasto no mês</text></svg>`;
}
function barras(de, qtd, extra) {
  const W = 420, H = 210, top = 26, bot = 30, left = 6, right = 6; const T = teto();
  const vals = [...Array(qtd)].map((_, k) => { const i = de + k; const base = parcNoMes(i); const add = extra && i >= extra.M && i < extra.M + extra.n ? extra.par : 0; return { i, base, add }; });
  const max = Math.max(T * 1.15, ...vals.map(v => v.base + v.add), 1); const sc = v => (H - top - bot) * v / max;
  const bw = (W - left - right) / qtd; let g = '';
  vals.forEach((v, k) => {
    const x = left + k * bw + bw * .16, w = bw * .68, y0 = H - bot, hb = sc(v.base), ha = sc(v.add), tot = v.base + v.add, passou = tot > T + .005;
    if (v.base > 0) g += `<rect x="${x}" y="${y0 - hb}" width="${w}" height="${hb}" rx="4" fill="${v.i === CUR() ? '#D092A7' : '#B3C5DB'}" stroke="#3D3634" stroke-width="1.6"/>`;
    if (v.add > 0) g += `<rect x="${x}" y="${y0 - hb - ha}" width="${w}" height="${ha}" rx="4" fill="url(#hach)" stroke="#3D3634" stroke-width="1.6"/>`;
    if (tot > 0) g += `<text x="${x + w / 2}" y="${y0 - hb - ha - 5}" text-anchor="middle" font-size="10.5" font-weight="800" font-family="Nunito,sans-serif" fill="${passou ? '#C9566E' : '#3D3634'}">${Math.round(tot)}</text>`;
    g += `<text x="${x + w / 2}" y="${H - 10}" text-anchor="middle" font-size="10" font-weight="700" font-family="Nunito,sans-serif" fill="#8A7F7B">${lab(v.i)}</text>`;
  });
  const yT = H - bot - sc(T);
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Parcelas por mês">
    <defs><pattern id="hach" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="#F5E9ED"/><rect width="3" height="6" fill="#E2BECB"/></pattern></defs>
    <line x1="0" x2="${W}" y1="${H - bot}" y2="${H - bot}" stroke="#3D3634" stroke-width="1.6"/>${g}
    <line x1="0" x2="${W}" y1="${yT}" y2="${yT}" stroke="#C9566E" stroke-width="1.8" stroke-dasharray="6 5"/>
    <rect x="${W - 98}" y="${Math.max(2, yT - 19)}" width="96" height="17" rx="8" fill="#fff" stroke="#C9566E" stroke-width="1.4"/>
    <text x="${W - 50}" y="${Math.max(2, yT - 19) + 12.5}" text-anchor="middle" font-size="10.5" font-weight="800" font-family="Nunito,sans-serif" fill="#C9566E">teto ${fmt0(T)}</text></svg>`;
}
/* barra empilhada: para onde vai o dinheiro do mês */
function graficoDestino(i) {
  const base = baseMes(i); if (base <= 0) return '';
  const partes = [['Fixas', soma(fixasDoMes(i)), '#C4B5D9'], ['Gastos variáveis', gastoVar(i), '#A2B7D0'], ['Guardado', guardado(i), '#F8C98F'], ['Livre', Math.max(0, livreTotal(i)), '#A5B592']];
  const tot = Math.max(base, soma(partes, p => p[1])); let x = 0;
  const W = 400, segs = partes.filter(p => p[1] > 0).map(p => { const w = W * p[1] / tot; const r = `<rect x="${x}" y="0" width="${w}" height="26" fill="${p[2]}"/>`; x += w; return r; }).join('');
  return `<section class="card" style="--hd:var(--salvia-cl);--sombra:var(--salvia)"><div class="card-h"><h2>Para onde vai o dinheiro</h2><span class="small b num">${fmt(base)}</span></div>
    <div class="card-b stack" style="gap:10px"><svg class="chart" viewBox="0 0 ${W} 26" preserveAspectRatio="none" style="height:26px;border:2px solid #3D3634;border-radius:10px" role="img" aria-label="Divisão do dinheiro do mês">${segs}</svg>
    <div class="legend">${partes.map(p => `<div><i class="dot" style="--c:${p[2]}"></i>${p[0]}<span class="v">${fmt(p[1])} · ${Math.round(p[1] / base * 100)}%</span></div>`).join('')}
    ${livreTotal(i) < 0 ? `<div style="color:var(--estouro)"><i class="dot" style="--c:var(--rosa)"></i>Passou do que entrou<span class="v">${fmt(-livreTotal(i))}</span></div>` : ''}</div></div></section>`;
}
/* barras agrupadas: últimos 6 meses */
function graficoMeses(fim) {
  const meses = [...Array(6)].map((_, k) => fim - 5 + k).map(i => ({ i, e: entrou(i), g: r2(soma(mesDoc(i)?.fixas || []) + gastoVar(i)), s: guardado(i) }));
  if (meses.filter(m => m.e + m.g + m.s > 0).length < 2) return '';
  const W = 420, H = 200, top = 22, bot = 26, max = Math.max(1, ...meses.flatMap(m => [m.e, m.g, m.s]));
  const sc = v => (H - top - bot) * v / max, gw = W / 6, bw = gw * .26; let g = '';
  const cores = [['e', '#A5B592'], ['g', '#D092A7'], ['s', '#F8C98F']];
  meses.forEach((m, k) => {
    cores.forEach(([key, cor], j) => { const v = m[key], x = k * gw + gw * .1 + j * bw, h = sc(v);
      if (v > 0) g += `<rect x="${x}" y="${H - bot - h}" width="${bw - 2}" height="${h}" rx="3" fill="${cor}" stroke="#3D3634" stroke-width="1.3"/><text x="${x + (bw - 2) / 2}" y="${H - bot - h - 4}" text-anchor="middle" font-size="9" font-weight="800" font-family="Nunito,sans-serif" fill="#3D3634">${kfmt(v)}</text>`; });
    g += `<text x="${k * gw + gw / 2}" y="${H - 8}" text-anchor="middle" font-size="10" font-weight="700" font-family="Nunito,sans-serif" fill="${m.i === CUR() ? '#3D3634' : '#8A7F7B'}">${lab(m.i)}</text>`;
  });
  return `<section class="card" style="--hd:var(--rosa-cl);--sombra:var(--rosa-md)"><div class="card-h"><h2>Últimos 6 meses</h2></div>
    <div class="card-b"><svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Entradas, gastos e guardado por mês"><line x1="0" x2="${W}" y1="${H - bot}" y2="${H - bot}" stroke="#3D3634" stroke-width="1.4"/>${g}</svg>
    <div class="row small muted b" style="justify-content:flex-start;gap:14px;flex-wrap:wrap"><span><i class="dot" style="--c:#A5B592;vertical-align:-1px"></i> entrou</span><span><i class="dot" style="--c:#D092A7;vertical-align:-1px"></i> gastou (fixas + variáveis)</span><span><i class="dot" style="--c:#F8C98F;vertical-align:-1px"></i> guardou</span></div></div></section>`;
}
const icones = {
  inicio: '<path class="bg" fill="none" d="M5 13 14 5l9 8v10H5z"/><path d="M11 23v-6h6v6"/>',
  extrato: '<path class="bg" fill="none" d="M7 4h14v20l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M11 10h6M11 14h6"/>',
  cartao: '<rect class="bg" fill="none" x="3" y="7" width="22" height="15" rx="3"/><path d="M3 12h22M7 18h5"/>',
  ajustes: '<circle class="bg" fill="none" cx="14" cy="14" r="5"/><path d="M14 3v4M14 21v4M3 14h4M21 14h4M6.2 6.2l2.8 2.8M19 19l2.8 2.8M6.2 21.8 9 19M19 9l2.8-2.8"/>'
};
const ic = k => `<svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icones[k]}</svg>`;

/* =========================================================
   Estado da interface
   ========================================================= */
const UI = { tab: 'inicio', mes: CUR(), filtro: 'todas', sim: { total: '', n: 3, cartao: null }, login: { modo: 'entrar', erro: '', msg: '' }, onb: 0 };
let F = null; // estado da folha aberta

/* =========================================================
   Telas
   ========================================================= */
function cabecalho(sub, titulo, mesNav) {
  return `${S.demo ? '<div class="faixa">Modo demonstração · dados só neste aparelho</div>' : ''}
  <header class="top">${UI.tab === 'inicio' ? porquinho(54) : ''}<div class="tt"><div class="h-sub">${sub}</div><div class="h-mes">${titulo}</div></div>
  ${mesNav ? `<div class="navmes"><button data-act="mesAnt" aria-label="Mês anterior">‹</button><button data-act="mesProx" aria-label="Próximo mês" ${UI.mes >= CUR() + 12 ? 'disabled' : ''}>›</button></div>` : ''}</header>`;
}

function tLogin() {
  const L = UI.login;
  return `<div class="login">
    <div class="logo">${porquinho(96)}<b>DinDin</b><span>seu cofrinho do mês</span></div>
    <form class="stack" id="formLogin" novalidate>
      <div class="field"><label for="lEmail">E-mail</label><input class="inp" id="lEmail" type="email" autocomplete="email" required></div>
      ${L.modo !== 'reset' ? `<div class="field"><label for="lSenha">Senha</label><input class="inp" id="lSenha" type="password" autocomplete="${L.modo === 'criar' ? 'new-password' : 'current-password'}" minlength="6" required></div>` : ''}
      ${L.erro ? `<p class="erro" role="alert">${esc(L.erro)}</p>` : ''}${L.msg ? `<div class="res">${esc(L.msg)}</div>` : ''}
      <button class="btn" type="submit">${L.modo === 'entrar' ? 'Entrar' : L.modo === 'criar' ? 'Criar minha conta' : 'Enviar link para trocar a senha'}</button>
    </form>
    <div class="row" style="justify-content:center;gap:18px">
      ${L.modo !== 'entrar' ? '<button class="link" data-act="lModo" data-v="entrar">Já tenho conta</button>' : '<button class="link" data-act="lModo" data-v="criar">Criar conta</button>'}
      ${L.modo !== 'reset' ? '<button class="link" data-act="lModo" data-v="reset">Esqueci a senha</button>' : ''}
    </div></div>`;
}

/* ---------- tutorial de primeiro acesso ---------- */
const PASSOS = ['nome', 'bancos', 'invest', 'cartoes', 'parc', 'fixas'];
const SUGEST_INVEST = ['Tesouro Direto', 'Caixinha / Cofrinho', 'CDB', 'Poupança', 'Ações e fundos'];
function draftOnb() {
  const c = S.cfg;
  return { nome: c.nome || '', contas: c.contas.filter(x => x.tipo === 'conta').map(x => ({ nome: x.nome, saldo: '' })),
    temInvest: null, invest: [], cartoes: c.cartoes.map(x => ({ nome: x.nome, fecha: String(x.fecha), vence: String(x.vence) })),
    temParc: null, parc: [], fixas: c.fixas.map(f => ({ nome: f.nome, valor: brl(f.valor), venc: String(f.venc), pago: null })) };
}
const getPath = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function setPath(o, p, v) { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => a[k], o)[last] = v; }
const NOVOS = { contas: () => ({ nome: '', saldo: '' }), invest: () => ({ nome: '', saldo: '' }), cartoes: () => ({ nome: '', fecha: '', vence: '' }),
  parc: () => ({ desc: '', valor: '', n: '', atual: '', cartao: '0', cat: catsOrdenadas()[0]?.id || '' }), fixas: () => ({ nome: '', valor: '', venc: '', pago: null }) };
function simNao(path, v) { return `<div class="sim-nao"><button class="btn ${v === true ? '' : 'sec'}" data-act="oSet" data-path="${path}" data-v="1">Sim</button><button class="btn ${v === false ? '' : 'sec'}" data-act="oSet" data-path="${path}" data-v="0">Não</button></div>`; }
const oInp = (path, val, attrs = '') => `<input class="inp" data-o="${path}" value="${esc(val)}" ${attrs}>`;
const oDel = (lista, k, min = 0) => (UI.O[lista].length > min ? `<button class="x" data-act="oDel" data-lista="${lista}" data-k="${k}">remover</button>` : '');

function tOnboarding() {
  const O = UI.O || (UI.O = draftOnb()); const p = UI.onb, N = PASSOS.length, mes = nomeMes(CUR()).toLowerCase();
  const barra = `<div class="step">${PASSOS.map((_, k) => `<i class="${k <= p ? 'on' : ''}"></i>`).join('')}<span>${p + 1}/${N}</span></div>`;
  let corpo = '';
  switch (PASSOS[p]) {
    case 'nome': corpo = `<div class="login" style="min-height:auto;max-width:none"><div class="logo">${porquinho(96)}<b>Oi!</b><span>Vamos montar seu DinDin. Leva uns 3 minutinhos.</span></div>
      <div class="field"><label for="oNome">Como posso te chamar?</label>${oInp('nome', O.nome, 'id="oNome" autocomplete="given-name"')}</div></div>`; break;
    case 'bancos': corpo = `<h3>Quanto tem em cada banco agora?</h3><p class="ajuda">Olhe o saldo no app de cada banco. Pode ser aproximado.</p>
      ${O.contas.map((c, k) => `<div class="item"><div class="row"><span class="mini">Banco ${k + 1}</span>${oDel('contas', k, 1)}</div>
        <div class="grid2">${oInp(`contas.${k}.nome`, c.nome, 'placeholder="Nome do banco" aria-label="Nome do banco"')}${oInp(`contas.${k}.saldo`, c.saldo, 'inputmode="decimal" placeholder="Saldo R$" aria-label="Saldo"')}</div></div>`).join('')}
      <button class="add" data-act="oAdd" data-lista="contas">+ Adicionar outro banco</button>`; break;
    case 'invest': corpo = `<h3>Você tem dinheiro investido?</h3><p class="ajuda">É para onde vai o que você guarda todo mês.</p>${simNao('temInvest', O.temInvest)}
      ${O.temInvest ? `<div class="field"><span class="lbl">Onde? Toque para adicionar</span><div class="chips">${SUGEST_INVEST.map(n => `<button class="chip" data-act="oAdd" data-lista="invest" data-nome="${esc(n)}">+ ${esc(n)}</button>`).join('')}</div></div>
        ${O.invest.map((c, k) => `<div class="item"><div class="row"><span class="mini">Investimento ${k + 1}</span>${oDel('invest', k)}</div>
          <div class="grid2">${oInp(`invest.${k}.nome`, c.nome, 'placeholder="Onde está" aria-label="Onde está"')}${oInp(`invest.${k}.saldo`, c.saldo, 'inputmode="decimal" placeholder="Valor R$" aria-label="Valor"')}</div></div>`).join('')}
        <button class="add" data-act="oAdd" data-lista="invest">+ Outro investimento</button>` : ''}`; break;
    case 'cartoes': corpo = `<h3>Seus cartões de crédito</h3><p class="ajuda">O dia em que a fatura fecha e o dia em que vence. Está no app do banco. É isso que diz em qual fatura cada compra cai.</p>
      ${O.cartoes.map((c, k) => `<div class="item"><div class="row"><span class="mini">Cartão ${k + 1}</span>${oDel('cartoes', k)}</div>${oInp(`cartoes.${k}.nome`, c.nome, 'placeholder="Nome do cartão" aria-label="Nome do cartão"')}
        <div class="grid2"><div class="field"><span class="mini">Fecha dia</span>${oInp(`cartoes.${k}.fecha`, c.fecha, 'inputmode="numeric" aria-label="Dia que fecha"')}</div><div class="field"><span class="mini">Vence dia</span>${oInp(`cartoes.${k}.vence`, c.vence, 'inputmode="numeric" aria-label="Dia que vence"')}</div></div></div>`).join('')}
      <button class="add" data-act="oAdd" data-lista="cartoes">+ Adicionar cartão</button>`; break;
    case 'parc': corpo = `<h3>Tem compras parceladas rolando?</h3><p class="ajuda">Ex.: um tênis em 5x de R$ 80, e em ${mes} vence a 2ª parcela.</p>${O.cartoes.length ? simNao('temParc', O.temParc) : '<div class="res">Sem cartão cadastrado, pode pular.</div>'}
      ${O.temParc && O.cartoes.length ? O.parc.map((c, k) => `<div class="item"><div class="row"><span class="mini">Compra ${k + 1}</span>${oDel('parc', k)}</div>${oInp(`parc.${k}.desc`, c.desc, 'placeholder="O que foi" aria-label="O que foi"')}
          <div class="grid2"><div class="field"><span class="mini">Valor da parcela</span>${oInp(`parc.${k}.valor`, c.valor, 'inputmode="decimal" placeholder="R$" aria-label="Valor da parcela"')}</div><div class="field"><span class="mini">Total de parcelas</span>${oInp(`parc.${k}.n`, c.n, 'inputmode="numeric" placeholder="ex.: 10" aria-label="Total de parcelas"')}</div></div>
          <div class="field"><span class="mini">Qual parcela vence em ${mes}?</span>${oInp(`parc.${k}.atual`, c.atual, 'inputmode="numeric" placeholder="ex.: 3" aria-label="Parcela deste mês"')}</div>
          <div class="grid2"><div class="field"><span class="mini">Cartão</span><select class="inp" data-o="parc.${k}.cartao" aria-label="Cartão">${O.cartoes.map((x, j) => `<option value="${j}" ${String(j) === String(c.cartao) ? 'selected' : ''}>${esc(x.nome || 'Cartão ' + (j + 1))}</option>`).join('')}</select></div>
          <div class="field"><span class="mini">Categoria</span><select class="inp" data-o="parc.${k}.cat" aria-label="Categoria">${S.cfg.cats.filter(x => x.ativa).map(x => `<option value="${x.id}" ${x.id === c.cat ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div></div></div>`).join('')
        + '<button class="add" data-act="oAdd" data-lista="parc">+ Adicionar compra parcelada</button>' : ''}`; break;
    case 'fixas': corpo = `<h3>Suas contas fixas</h3><p class="ajuda">As que vêm todo mês com valor parecido: aluguel, internet, academia...</p>
      ${O.fixas.map((c, k) => `<div class="item"><div class="row"><span class="mini">Conta ${k + 1}</span>${oDel('fixas', k)}</div>${oInp(`fixas.${k}.nome`, c.nome, 'placeholder="Nome" aria-label="Nome da conta"')}
        <div class="grid2"><div class="field"><span class="mini">Valor</span>${oInp(`fixas.${k}.valor`, c.valor, 'inputmode="decimal" aria-label="Valor"')}</div><div class="field"><span class="mini">Vence dia</span>${oInp(`fixas.${k}.venc`, c.venc, 'inputmode="numeric" aria-label="Dia do vencimento"')}</div></div>
        <div class="row"><span class="small b">Já pagou em ${mes}?</span><div class="seg" style="--n:2;width:140px"><button data-act="oSet" data-path="fixas.${k}.pago" data-v="1" aria-pressed="${c.pago === true}">Sim</button><button data-act="oSet" data-path="fixas.${k}.pago" data-v="0" aria-pressed="${c.pago === false}">Não</button></div></div></div>`).join('')}
      <button class="add" data-act="oAdd" data-lista="fixas">+ Adicionar conta fixa</button>`; break;
  }
  return `${S.demo ? '<div class="faixa">Modo demonstração · dados só neste aparelho</div>' : ''}<div class="stack onb">${barra}${corpo}
    <div class="grid2">${p > 0 ? '<button class="btn sec" data-act="onbVolta">Voltar</button>' : '<span></span>'}<button class="btn" data-act="${p < N - 1 ? 'onbVai' : 'onbFim'}">${p < N - 1 ? 'Próximo' : 'Concluir'}</button></div></div>`;
}
function onbValida() {
  const O = UI.O, passo = PASSOS[UI.onb];
  if (passo === 'bancos' && !O.contas.some(c => c.nome.trim())) return 'Cadastre pelo menos um banco';
  if (passo === 'invest' && O.temInvest == null) return 'Responda sim ou não';
  if (passo === 'cartoes' && O.cartoes.some(c => c.nome.trim() && (!parseInt(c.fecha) || !parseInt(c.vence)))) return 'Preencha os dias de fechamento e vencimento';
  if (passo === 'parc' && O.cartoes.length && O.temParc == null) return 'Responda sim ou não';
  if (passo === 'parc' && O.temParc) for (const c of O.parc) {
    const n = parseInt(c.n), a = parseInt(c.atual);
    if (num(c.valor) <= 0 || !n || !a || a > n) return 'Confira valor, total de parcelas e a parcela deste mês';
  }
  return '';
}
function onbConcluir() {
  const O = UI.O, ts = Date.now(), i = CUR();
  const mk = n => slug(n) + '-' + novoId().slice(-4);
  const contas = O.contas.filter(c => c.nome.trim()).map(c => ({ id: mk(c.nome), nome: c.nome.trim(), sub: 'conta', tipo: 'conta', base: num(c.saldo), baseTs: ts }));
  if (O.temInvest) O.invest.filter(c => c.nome.trim()).forEach(c => contas.push({ id: mk(c.nome), nome: c.nome.trim(), sub: 'investimento', tipo: 'invest', base: num(c.saldo), baseTs: ts }));
  const contaPadrao = contas[0].id;
  const cartoes = O.cartoes.map((c, k) => ({ k, c })).filter(x => x.c.nome.trim()).map(({ k, c }) => ({ k, id: mk(c.nome), nome: c.nome.trim(), fecha: dia(c.fecha), vence: dia(c.vence), conta: contaPadrao }));
  const fixas = O.fixas.filter(f => f.nome.trim()).map(f => ({ id: mk(f.nome), nome: f.nome.trim(), valor: num(f.valor), venc: dia(f.venc), meio: contaPadrao, _pago: f.pago === true }));
  const cfg = { ...S.cfg, nome: O.nome.trim(), contas, cartoes: cartoes.map(({ k, ...c }) => c), fixas: fixas.map(({ _pago, ...f }) => f), contaPadrao, setup: true };
  // já pagas antes de começar: marcadas com pagoTs 0 para não descontar de novo do saldo informado
  const mes = { receita: cfg.receita, guardarMeta: cfg.guardarMeta, plan: {}, criado: ts, fixas: fixas.map(({ _pago, ...f }) => ({ ...f, pago: _pago, ...(_pago ? { pagoTs: 0 } : {}) })) };
  S.cfg = cfg; S.meses[keyOf(i)] = mes;
  DB.saveCfg(cfg); DB.saveMes(keyOf(i), mes);
  if (O.temParc) O.parc.forEach(c => {
    const card = cartoes.find(x => String(x.k) === String(c.cartao)) || cartoes[0]; if (!card) return;
    DB.addParc({ desc: c.desc.trim() || cat(c.cat).nome, cat: c.cat, cartao: card.id, parcela: num(c.valor), n: parseInt(c.n), primeira: i - (parseInt(c.atual) - 1), data: isoHoje(), criado: ts });
  });
  UI.O = null; UI.onb = 0; UI.tab = 'inicio'; UI.mes = i; render(); setTimeout(abrirWizard, 200);
}

function tInicio() {
  const i = UI.mes, ehAtual = i === CUR(), doc = mesDoc(i);
  const cats = catsDoMes(i).map(c => ({ ...c, g: gastoCat(c.id, i), p: planCat(c.id, i) }));
  const plan = soma(cats, c => c.p), gasto = soma(cats, c => c.g);
  const g = guardado(i), meta = metaGuardar(i), livreCat = semCat(i), reserv = reservadoCats(i);
  const sobra = livreTotal(i), faltaMeta = Math.max(0, r2(meta - g));
  const fixas = fixasDoMes(i);
  const avisos = ehAtual ? cats.filter(c => c.p > 0 && (c.g > c.p + .005 || (c.g / c.p >= .85 && c.g < c.p - .005))).map(c => c.g > c.p
    ? `<div class="aviso" style="--av:var(--rosa-cl)"><p><b>${esc(c.nome)}</b> passou ${fmt(c.g - c.p)} do planejado.</p><button class="link" data-act="mover" data-para="${c.id}" data-valor="${r2(c.g - c.p)}">Cobrir com outra categoria</button></div>`
    : `<div class="aviso"><p>Cuidado: <b>${esc(c.nome)}</b> está em ${Math.round(c.g / c.p * 100)}%. Faltam ${fmt(c.p - c.g)}.</p></div>`).join('') : '';
  const ehAtrasada = f => ehAtual && !f.pago && f.venc < DIA() && (!doc?.criado || new Date(Math.floor(i / 12), i % 12, f.venc).getTime() >= doc.criado - 864e5);
  const atrasadas = fixas.filter(ehAtrasada);
  const ordem = [...cats].sort((a, b) => b.p - a.p);
  return `${cabecalho(S.cfg.nome ? `Oi, ${esc(S.cfg.nome)} · ${Math.floor(i / 12)}` : `DinDin · ${Math.floor(i / 12)}`, nomeMes(i), true)}
  <div class="stack">
    ${!doc ? `<div class="aviso" style="--av:var(--azul-cl)"><p><b>${nomeMes(i)}</b> ainda não foi planejado.</p><button class="link" data-act="wizard">Planejar agora</button></div>` : ''}
    <section class="card" style="--hd:var(--salvia);--sombra:var(--salvia)"><div class="card-h"><h2>Livre para gastar</h2>${doc ? '<button class="link" data-act="wizard">Replanejar</button>' : ''}</div>
      <div class="card-b"><div class="big num" style="color:${sobra < 0 ? 'var(--estouro)' : 'var(--tinta)'}">${fmt(sobra)}</div>
      <div class="muted small b">${fmt(reserv)} reservados nas categorias · ${livreCat >= 0 ? `${fmt(livreCat)} soltos` : `faltam ${fmt(-livreCat)} para cobrir as categorias`}</div>
      ${faltaMeta > 0.005 && sobra > 0 ? `<div class="muted small b">${sobra - faltaMeta >= 0 ? `Se guardar o que falta da meta (${fmt(faltaMeta)}), sobram ${fmt(sobra - faltaMeta)}.` : `Guardando o que falta da meta (${fmt(faltaMeta)}), faltariam ${fmt(faltaMeta - sobra)}.`}</div>` : ''}
      ${livreCat > 0.005 && i >= CUR() && doc ? `<button class="link" style="margin-top:4px" data-act="mover" data-de="${LIVRE}">Colocar o dinheiro solto numa categoria</button>` : ''}
      <div class="kpis"><div class="kpi" style="--k:var(--rosa-cl)"><span>Entrou</span><b class="num">${fmt(entrou(i))}</b><small>previsto ${fmt0(receitaPlan(i))}</small></div>
      <div class="kpi" style="--k:var(--lilas-cl)"><span>Fixas</span><b class="num">${fmt(soma(fixas))}</b><small>${fixas.filter(f => f.pago).length}/${fixas.length} pagas</small></div>
      <div class="kpi" style="--k:var(--pessego-cl)"><span>Guardado</span><b class="num">${fmt(g)}</b><small>meta ${fmt0(meta)}</small></div></div></div></section>
    ${avisos}
    ${graficoDestino(i)}
    ${atrasadas.length ? `<div class="aviso" style="--av:var(--lilas-cl)"><p>${atrasadas.map(f => `<b>${esc(f.nome)}</b> venceu dia ${f.venc}`).join(', ')} e ainda não ${atrasadas.length > 1 ? 'estão marcadas como pagas' : 'está marcada como paga'}.</p></div>` : ''}
    ${meta > 0 ? `<section class="card" style="--hd:var(--pessego);--sombra:var(--pessego)"><div class="card-h"><h2>Meta de guardar</h2><span class="small b">${Math.round(g / meta * 100)}%</span></div>
      <div class="card-b stack" style="gap:8px"><div class="track"><div class="fill ${g >= meta ? 'full' : g <= 0 ? 'zero' : ''}" style="--c:var(--pessego);width:${Math.min(100, g / meta * 100)}%"></div></div>
      <div class="row small b"><span>${fmt(g)} guardados</span><span class="muted">${g > meta + .005 ? `meta batida + ${fmt(g - meta)}` : g >= meta - .005 ? 'meta batida!' : 'faltam ' + fmt(meta - g)}</span></div>
      ${ehAtual ? `<button class="link" style="align-self:flex-start" data-act="lancar" data-tipo="guardar">${g >= meta - .005 ? 'Guardar mais' : 'Registrar que guardei'}</button>` : ''}</div></section>` : ''}
    <section class="card" style="--hd:var(--azul);--sombra:var(--azul)"><div class="card-h"><h2>Gastos variáveis</h2>${doc ? '<button class="link" data-act="mover">Mover valor</button>' : ''}</div>
      <div class="card-b">${cats.length ? `<div class="donut-wrap">${donut(ordem.map(c => ({ v: c.g, c: c.c })), gasto)}
        <div class="legend">${gasto > 0 ? ordem.filter(c => c.g > 0).sort((a, b) => b.g - a.g).slice(0, 7).map(c => `<div><i class="dot" style="--c:${c.c}"></i>${esc(c.nome)}<span class="v">${fmt0(c.g)} · ${Math.round(c.g / gasto * 100)}%</span></div>`).join('') : '<span class="muted">Nenhum gasto ainda.</span>'}</div></div>
        <div style="margin-top:6px">${ordem.map(c => { const [s, t] = status(c.g, c.p); const r = c.p > 0 ? Math.min(100, c.g / c.p * 100) : (c.g > 0 ? 100 : 0);
          return `<div class="cat"><div class="nm"><i class="dot" style="--c:${c.c}"></i>${esc(c.nome)}</div><span class="pill p-${s}">${t}</span>
          <div class="track"><div class="fill ${r >= 100 ? 'full' : r <= 0 ? 'zero' : ''}" style="--c:${s === 'estouro' ? 'var(--rosa)' : c.c};width:${r}%"></div></div>
          <div class="meta"><span class="num">${fmt(c.g)} de ${fmt(c.p)}</span><span class="num" style="color:${s === 'estouro' ? 'var(--estouro)' : 'inherit'}">${c.g > c.p ? '-' + fmt(c.g - c.p) : 'faltam ' + fmt(c.p - c.g)}</span></div></div>`; }).join('')}</div>`
        : '<p class="vazio">Planeje o mês para ver quanto pode gastar em cada categoria.</p>'}</div></section>
    <section class="card" style="--hd:var(--lilas);--sombra:var(--lilas)"><div class="card-h"><h2>Contas fixas</h2><span class="small b num">${fmt(soma(fixas.filter(f => f.pago)))} de ${fmt(soma(fixas))}</span></div>
      <div class="card-b">${fixas.length ? fixas.slice().sort((a, b) => a.venc - b.venc).map(f => `<div class="lin"><button class="ck" data-act="pagar" data-id="${esc(f.id)}" aria-pressed="${!!f.pago}" aria-label="Marcar ${esc(f.nome)} como paga">${f.pago ? check : ''}</button>
        <button class="nm nm-btn" data-act="editFixaMes" data-id="${esc(f.id)}">${esc(f.nome)}<small>vence dia ${pad(f.venc)} · toque para editar</small></button>${ehAtrasada(f) ? '<span class="pill p-estouro">atrasada</span>' : ''}<span class="num b">${fmt(f.valor)}</span></div>`).join('')
        : '<p class="vazio">Nenhuma conta fixa neste mês.</p>'}
        <button class="link" style="margin-top:6px" data-act="editFixa">+ Nova conta fixa</button></div></section>
    ${graficoMeses(i)}
    <section class="card" style="--hd:var(--amarelo);--sombra:var(--amarelo)"><div class="card-h"><h2>Carteira</h2><button class="link" data-act="tab" data-v="ajustes">Atualizar saldos</button></div>
      <div class="card-b"><div class="contas">${S.cfg.contas.map(c => `<div class="conta" style="--c:${c.tipo === 'invest' ? 'var(--pessego-md)' : 'var(--amarelo-cl)'}"><span>${esc(c.nome)} · ${esc(c.sub || (c.tipo === 'invest' ? 'investimento' : 'conta'))}</span><b class="num">${fmt(saldo(c))}</b></div>`).join('')}</div></div></section>
  </div>`;
}

function tExtrato() {
  const i = UI.mes, f = ['todas', 'entradas', 'saidas'].includes(UI.filtro) ? UI.filtro : 'todas';
  const parcs = S.parc.filter(p => ativaNoMes(p, i)).map(p => ({ id: p.id, ehParc: true, data: '', tipo: 'parcela', valor: p.parcela, cat: p.cat, meio: p.cartao, desc: `${p.desc} · ${i - p.primeira + 1}/${p.n}` }));
  const linhas = [...lancMes(i).filter(l => l.tipo !== 'marca'), ...parcs];
  const ehEntrada = l => l.tipo === 'entrada' || (l.tipo === 'gasto' && l.valor < 0);
  const vis = linhas.filter(l => f === 'todas' || (f === 'entradas' ? ehEntrada(l) : !ehEntrada(l)));
  const grupos = {}; vis.forEach(l => { const d = l.ehParc ? '0' : l.data; (grupos[d] = grupos[d] || []).push(l); });
  const datas = Object.keys(grupos).sort((a, b) => b.localeCompare(a));
  const titulo = d => { if (d === '0') return 'Parcelas deste mês'; if (d === isoHoje()) return 'Hoje'; if (d === isoOntem()) return 'Ontem';
    const dt = new Date(d + 'T12:00'); return `${d.slice(8, 10)}/${d.slice(5, 7)} · ${['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][dt.getDay()]}`; };
  const totE = soma(vis.filter(ehEntrada), l => Math.abs(l.valor)), totS = soma(vis.filter(l => !ehEntrada(l)), l => l.valor);
  const icone = l => l.tipo === 'entrada' ? ['+', 'var(--salvia-cl)'] : l.tipo === 'guardar' ? ['$', 'var(--pessego-md)'] : l.tipo === 'fatura' ? ['F', 'var(--lilas-md)'] : [cat(l.cat).nome[0], cat(l.cat).c];
  const rotulo = l => l.tipo === 'guardar' ? `Guardado em ${esc(conta(l.para)?.nome || '')}` : l.tipo === 'entrada' ? esc(l.catEnt || 'Entrada') : l.tipo === 'fatura' ? 'Pagamento de fatura' : esc(cat(l.cat).nome) + (l.valor < 0 ? ' · estorno' : '');
  return `${cabecalho('Extrato', nomeMes(i), true)}
  <div class="seg" style="--n:3;margin-bottom:10px">${[['todas', 'Tudo'], ['entradas', 'Entradas'], ['saidas', 'Saídas']].map(([id, n]) => `<button data-act="filtro" data-v="${id}" aria-pressed="${f === id}">${n}</button>`).join('')}</div>
  <div class="row small b" style="margin-bottom:12px"><span style="color:var(--ok)">Entradas ${fmt(totE)}</span><span>Saídas ${fmt(totS)}</span></div>
  <section class="card" style="--sombra:var(--azul-md)"><div class="card-b">
  ${datas.length ? datas.map(d => `<div class="dia">${titulo(d)}</div>${grupos[d].map(l => {
    const [t, c] = icone(l); const pos = ehEntrada(l);
    return `<button class="mov" data-act="${l.ehParc ? 'verParc' : 'editar'}" data-id="${esc(l.id)}"><span class="ic" style="--c:${c}">${esc(t)}</span><span class="tx"><b>${esc(l.desc || rotulo(l))}</b><small>${rotulo(l)} · ${esc(meioNome(l.meio))}</small></span>
      <span class="vl" style="color:${pos ? 'var(--ok)' : 'var(--tinta)'}">${pos ? '+' : '-'}${fmt(Math.abs(l.valor))}</span></button>`; }).join('')}`).join('')
    : '<p class="vazio">Nada por aqui ainda. Toque no + para lançar.</p>'}
  </div></section>`;
}

function simResultado() {
  const sm = UI.sim, total = num(sm.total);
  if (!cartao(sm.cartao)) return { html: '<div class="res" style="--r:var(--azul-cl)">Cadastre um cartão em Ajustes para simular.</div>', extra: null };
  if (total <= 0) return { html: '<div class="res" style="--r:var(--azul-cl)">Digite o valor da compra para ver quando ela cabe no seu teto.</div>', extra: null };
  const r = simular(total, sm.n, sm.cartao); const T = r.T;
  let html;
  if (r.agora.mx <= T + .005) html = `<div class="res"><b>Cabe agora.</b> ${sm.n}x de ${fmt(r.par)} a partir da fatura de ${lab(r.inicio)}. O mês mais cheio fica em ${lab(r.agora.mes)} com ${fmt(r.agora.mx)} (${Math.round(r.agora.mx / T * 100)}% do teto).</div>`;
  else if (r.melhor != null) { const j = janela(r.c, r.melhor);
    html = `<div class="res" style="--r:var(--rosa-cl)"><b>Hoje não cabe:</b> ${lab(r.agora.mes)} iria para ${fmt(r.agora.mx)} (teto ${fmt(T)}).</div>
    <div class="res"><b>Cabe a partir da fatura de ${lab(r.melhor)}.</b> Compre no ${esc(r.c.nome)} entre <b>${j.de}</b> e <b>${j.ate}</b>. O mês mais cheio fica com ${fmt(r.picoMelhor.mx)}.</div>`; }
  else html = `<div class="res" style="--r:var(--rosa-cl)"><b>Não cabe nos próximos 2 anos</b> com esse teto. Tente mais parcelas ou um valor menor.</div>`;
  return { html, extra: { M: r.melhor ?? r.inicio, n: sm.n, par: r.par } };
}

function tCartao() {
  const T = teto(), i = UI.mes, mes = parcNoMes(i), prox = parcNoMes(i + 1), nm = nomeMes(i).toLowerCase();
  if (!UI.sim.cartao || !cartao(UI.sim.cartao)) UI.sim.cartao = S.cfg.cartoes[0]?.id;
  const sr = simResultado();
  const ativas = S.parc.filter(p => ativaNoMes(p, i)).sort((a, b) => (a.primeira + a.n) - (b.primeira + b.n));
  const futuras = S.parc.filter(p => p.primeira > i).length;
  const faturas = S.cfg.cartoes.map(c => {
    const v = valorFatura(c, i), pg = faturaPaga(c, i), aberta = faturaDe(c, CUR(), DIA());
    const est = pg ? `<span class="pill p-ok">paga ${fmt(pg.valor)}</span>` : i < aberta && v > 0 ? `<button class="chip" data-act="pagarFatura" data-id="${c.id}" data-m="${i}" data-v="${v}">Paguei</button>` : i === aberta ? '<span class="pill p-neutro">aberta</span>' : i > aberta ? '<span class="pill p-neutro">futura</span>' : '';
    return `<div class="lin"><div class="nm">${esc(c.nome)}<small>vence dia ${c.vence} de ${nm} · fecha dia ${c.fecha}</small></div><span class="num b">${fmt(v)}</span>${est}</div>`; }).join('');
  return `${cabecalho('Cartão e parcelas', nomeMes(i), true)}
  <div class="stack">
    <section class="card" style="--hd:var(--rosa-md)"><div class="card-h"><h2>Parcelas de ${nm}</h2><button class="link" data-act="tab" data-v="ajustes">teto ${fmt0(T)}${S.cfg.teto.modo === 'pct' ? ` (${S.cfg.teto.pct}%)` : ''}</button></div>
      <div class="card-b stack" style="gap:8px"><div class="row"><span class="big num" style="font-size:36px">${fmt(mes)}</span><span class="pill p-${mes > T ? 'estouro' : mes / T >= .85 ? 'alerta' : 'ok'}">${T > 0 ? Math.round(mes / T * 100) : 0}% do teto</span></div>
      <div class="track"><div class="fill ${mes <= 0 ? 'zero' : mes >= T ? 'full' : ''}" style="--c:var(--rosa);width:${T > 0 ? Math.min(100, mes / T * 100) : 0}%"></div></div>
      <div class="small muted b">${nomeMes(i + 1)}: ${fmt(prox)} · ${prox > T ? 'acima do teto' : 'sobram ' + fmt(T - prox) + ' no teto'}</div></div></section>
    <section class="card" style="--hd:var(--azul)"><div class="card-h"><h2>Posso parcelar?</h2></div>
      <div class="card-b stack">
        <div class="grid2"><div class="field"><label for="simTot">Valor total</label><input class="inp" id="simTot" inputmode="decimal" placeholder="R$ 0,00" value="${esc(UI.sim.total)}" data-sim="total"></div>
        <div class="field"><label for="simN">Parcelas</label><select class="inp" id="simN" data-sim="n">${[...Array(12)].map((_, k) => `<option ${k + 1 === UI.sim.n ? 'selected' : ''} value="${k + 1}">${k + 1}x</option>`).join('')}</select></div></div>
        <div class="field"><span class="lbl">Cartão</span><div class="chips">${S.cfg.cartoes.map(c => `<button class="chip" data-act="simCartao" data-v="${c.id}" aria-pressed="${UI.sim.cartao === c.id}">${esc(c.nome)}</button>`).join('')}</div></div>
        <div id="simArea" class="stack" style="gap:10px">${sr.html}${barras(CUR(), 11, sr.extra)}</div>
        <div class="row small muted b" style="justify-content:flex-start;gap:14px;flex-wrap:wrap"><span><i class="dot" style="--c:#B3C5DB;vertical-align:-1px"></i> parcelas atuais</span><span><i class="dot" style="--c:#E2BECB;vertical-align:-1px"></i> compra simulada</span></div>
      </div></section>
    <section class="card" style="--hd:var(--amarelo)"><div class="card-h"><h2>Faturas de ${nm}</h2></div><div class="card-b">${faturas || '<p class="vazio">Cadastre um cartão em Ajustes.</p>'}</div></section>
    <section class="card" style="--hd:var(--lilas)"><div class="card-h"><h2>Parceladas em ${nm}</h2><button class="link" data-act="novaParc">+ Cadastrar</button></div>
      <div class="card-b">${ativas.length ? ativas.map(p => { const atual = i - p.primeira + 1, pagas = Math.max(0, Math.min(p.n, atual)); const c = cat(p.cat);
        return `<button class="cat" style="width:100%;background:none;border-left:none;border-right:none;border-top:none;text-align:left" data-act="verParc" data-id="${esc(p.id)}"><span class="nm"><i class="dot" style="--c:${c.c}"></i>${esc(p.desc)}</span><span class="num b">${p.n}x ${fmt(p.parcela)}</span>
        <span class="track" style="display:block"><span class="fill ${pagas >= p.n ? 'full' : pagas <= 0 ? 'zero' : ''}" style="display:block;--c:var(--lilas);width:${pagas / p.n * 100}%"></span></span>
        <span class="meta"><span>${esc(meioNome(p.cartao))} · parcela ${atual} de ${p.n}</span><span>${atual === p.n ? 'última!' : `faltam ${p.n - atual} · até ${lab(p.primeira + p.n - 1)}`}</span></span></button>`; }).join('')
        : `<p class="vazio">Nenhuma parcela em ${nm}.</p>`}${futuras && i === CUR() ? '' : ''}</div></section>
  </div>`;
}

function tAjustes() {
  const c = S.cfg;
  return `${cabecalho('Ajustes', 'Do meu jeitinho', false)}
  <div class="stack">
    <button class="btn" data-act="wizard">Planejar ${nomeMes(UI.mes).toLowerCase()}</button>
    <section class="card" style="--hd:var(--rosa-md)"><div class="card-h"><h2>Teto de parcelas</h2></div>
      <div class="card-b stack" style="gap:10px"><div class="seg" style="--n:2"><button data-act="tetoModo" data-v="fixo" aria-pressed="${c.teto.modo === 'fixo'}">Valor fixo</button><button data-act="tetoModo" data-v="pct" aria-pressed="${c.teto.modo === 'pct'}">% da renda</button></div>
      ${c.teto.modo === 'fixo' ? `<div class="field"><label for="tetoV">Até quanto em parcelas por mês</label><input class="inp" id="tetoV" inputmode="decimal" data-teto="valor" value="${brl(c.teto.valor)}"></div>`
        : `<div class="field"><label for="tetoP">% da renda planejada (${fmt(receitaPlan(CUR()))})</label><input class="inp" id="tetoP" inputmode="decimal" data-teto="pct" value="${c.teto.pct}"></div>`}
      <div class="small muted b">Teto atual: ${fmt(teto())} por mês</div></div></section>
    <section class="card" style="--hd:var(--salvia-cl)"><div class="card-h"><h2>Mês do salário</h2></div>
      <div class="card-b stack" style="gap:8px"><div class="field"><label for="aVirada">Entradas a partir do dia</label><input class="inp" id="aVirada" inputmode="numeric" data-virada="1" value="${diaVirada()}"></div>
      <div class="small muted b">contam para o mês seguinte. Ex.: salário que cai dia 30 de outubro vira dinheiro de novembro. Dá para trocar em cada lançamento.</div></div></section>
    <section class="card" style="--hd:var(--amarelo)"><div class="card-h"><h2>Contas e saldos</h2><button class="link" data-act="editConta">+ Nova</button></div>
      <div class="card-b">${c.contas.map(ct => `<button class="lin click" data-act="editConta" data-id="${ct.id}"><span class="nm">${esc(ct.nome)}<small>${ct.tipo === 'invest' ? 'investimento' : 'conta'}${ct.sub ? ' · ' + esc(ct.sub) : ''}</small></span><span class="num b">${fmt(saldo(ct))}</span></button>`).join('')}
      <p class="small muted b" style="margin:6px 0 0">Toque numa conta para corrigir o saldo com o valor do app do banco.</p></div></section>
    <section class="card" style="--hd:var(--lilas)"><div class="card-h"><h2>Cartões</h2><button class="link" data-act="editCartao">+ Novo</button></div>
      <div class="card-b">${c.cartoes.map(ct => `<button class="lin click" data-act="editCartao" data-id="${ct.id}"><span class="nm">${esc(ct.nome)}<small>fecha dia ${ct.fecha} · vence dia ${ct.vence}</small></span><span class="muted">›</span></button>`).join('')}</div></section>
    <section class="card" style="--hd:var(--lilas-md)"><div class="card-h"><h2>Contas fixas</h2><button class="link" data-act="editFixa">+ Nova</button></div>
      <div class="card-b">${c.fixas.slice().sort((a, b) => a.venc - b.venc).map(f => `<button class="lin click" data-act="editFixa" data-id="${f.id}"><span class="nm">${esc(f.nome)}<small>vence dia ${f.venc} · ${esc(meioNome(f.meio))}</small></span><span class="num b">${fmt(f.valor)}</span></button>`).join('')}
      <p class="small muted b" style="margin:6px 0 0">Mudanças valem para os próximos meses que você planejar.</p></div></section>
    <section class="card" style="--hd:var(--azul)"><div class="card-h"><h2>Categorias</h2><button class="link" data-act="editCat">+ Nova</button></div>
      <div class="card-b chips">${c.cats.map(k => `<button class="chip" data-act="editCat" data-id="${k.id}" style="${k.ativa ? '' : 'opacity:.45'}"><i class="dot" style="--c:${k.c}"></i>${esc(k.nome)}</button>`).join('')}</div></section>
    <section class="card" style="--hd:var(--salvia)"><div class="card-h"><h2>Conta</h2></div>
      <div class="card-b stack" style="gap:10px"><div class="field"><label for="aNome">Seu nome</label><input class="inp" id="aNome" data-cfg="nome" value="${esc(c.nome)}"></div>
      <div class="small muted b">${S.demo ? 'Modo demonstração: os dados ficam só neste aparelho.' : 'Conectada como ' + esc(S.user?.email || '')}</div>
      <label class="btn" style="text-align:center;cursor:pointer" for="fExcel">Importar planilha do Excel</label><input id="fExcel" type="file" accept=".xlsx,.xls,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" hidden>
      <label class="btn sec" style="text-align:center;cursor:pointer" for="fImport">Importar parcelas (arquivo .json)</label><input id="fImport" type="file" accept=".json,application/json" hidden>
      <button class="btn sec" data-act="backup">Baixar backup</button>
      <button class="btn sec" data-act="sair">${S.demo ? 'Apagar dados da demonstração' : 'Sair'}</button></div></section>
  </div>`;
}

/* =========================================================
   Folhas (bottom sheets)
   ========================================================= */
function abrir(html) {
  const aberta = document.querySelector('#sheetRoot .sheet .in');
  if (aberta) { aberta.innerHTML = `<div class="grab"></div>${html}`; return; }
  document.getElementById('sheetRoot').innerHTML = `<div class="veu" data-act="fechar"></div><div class="sheet" role="dialog" aria-modal="true"><div class="in"><div class="grab"></div>${html}</div></div>`;
}
function fechar() { document.getElementById('sheetRoot').innerHTML = ''; F = null; }
function toast(t) { const r = document.getElementById('toastRoot'); r.innerHTML = `<div class="toast" role="status">${esc(t)}</div>`; clearTimeout(toast.t); toast.t = setTimeout(() => r.innerHTML = '', 2400); }
const reabrir = () => { if (!F) return; ({ lanc: folhaLancar, mover: folhaMover, wiz: folhaWizard, form: folhaForm, parc: folhaParc, imp: folhaImport, xls: folhaExcel })[F.k](); };

/* --- lançar / editar --- */
function catsOrdenadas() {
  const freq = {}; S.lanc.forEach(l => { if (l.cat) freq[l.cat] = (freq[l.cat] || 0) + 1; });
  const i = CUR();
  return S.cfg.cats.filter(c => c.ativa).sort((a, b) => ((freq[b.id] || 0) + (planCat(b.id, i) > 0 ? 50 : 0)) - ((freq[a.id] || 0) + (planCat(a.id, i) > 0 ? 50 : 0)));
}
function novoLanc(tipo = 'gasto') {
  const meio = ls.get('dd-meio', S.cfg.contaPadrao);
  F = { k: 'lanc', tipo, valor: '', cat: catsOrdenadas()[0]?.id, catEnt: S.cfg.entradas[0], meio: meios().some(m => m.id === meio) ? meio : S.cfg.contaPadrao,
    n: 1, desc: '', data: isoHoje(), dataModo: 'hoje', comp: compPadrao(isoHoje()), compManual: false, para: investimentos()[0]?.id, todas: false, confirma: false };
  if (tipo !== 'gasto' && !contasCorrentes().some(c => c.id === F.meio)) F.meio = contasCorrentes()[0]?.id;
  folhaLancar();
  setTimeout(() => document.getElementById('fValor')?.focus(), 80);
}
function infoLanc() {
  const v = num(F.valor); if (v <= 0) return '';
  let i = idxOfKey(F.data.slice(0, 7));
  const c = cartao(F.meio);
  if (F.tipo === 'gasto' && c && F.n > 1) {
    const M = faturaDe(c, i, Number(F.data.slice(8, 10))); const par = r2(v / F.n); const pk = picoParcelas(M, F.n, par);
    return pk.mx > teto() + .005 ? `<b>Vai passar do teto:</b> ${lab(pk.mes)} fica com ${fmt(pk.mx)} em parcelas (teto ${fmt(teto())}). Dá para salvar mesmo assim.`
      : `${F.n}x de ${fmt(par)} · 1ª parcela na fatura de ${lab(M)}. Cada parcela conta em ${esc(cat(F.cat).nome)} no mês da fatura.`;
  }
  if (F.tipo === 'gasto') {
    if (c) i = faturaDe(c, i, Number(F.data.slice(8, 10)));
    const k = cat(F.cat), p = planCat(k.id, i);
    const pref = c ? `Entra na fatura de ${lab(i)} e conta em ${nomeMes(i).toLowerCase()}. ` : ''; const ant = F.id ? (S.lanc.find(l => l.id === F.id)?.valor || 0) : 0; const g = gastoCat(k.id, i) - ant + v;
    if (p <= 0) return pref + `${esc(k.nome)} não tem valor planejado em ${nomeMes(i).toLowerCase()}.`;
    return pref + (g > p ? `<b>${esc(k.nome)} vai passar ${fmt(g - p)}</b> do planejado.` : `Depois desse gasto, sobram <b>${fmt(p - g)}</b> em ${esc(k.nome)}.`);
  }
  if (F.tipo === 'guardar') { const m = metaGuardar(i), g = guardado(i) + v; return m > 0 ? (g >= m ? '<b>Meta do mês batida!</b>' : `Faltarão ${fmt(m - g)} para a meta do mês.`) : ''; }
  return '';
}
function atualizarInfo() { const el = document.getElementById('lancInfo'); if (!el) return; const t = infoLanc(); el.innerHTML = t; el.style.setProperty('--r', /passar|Vai passar/.test(t) ? 'var(--rosa-cl)' : 'var(--salvia-cl)'); }
function folhaLancar() {
  const ehC = !!cartao(F.meio); const cats = catsOrdenadas(); const mostrar = F.todas ? cats : cats.slice(0, 9);
  if (F.cat && !mostrar.some(c => c.id === F.cat) && cats.some(c => c.id === F.cat)) mostrar.push(cat(F.cat));
  const ops = F.tipo === 'gasto' ? meios() : contasCorrentes().map(c => ({ id: c.id, nome: c.nome }));
  abrir(`<h3>${F.id ? 'Editar lançamento' : 'Lançar'}</h3>
    ${F.id ? '' : `<div class="seg"><button data-f="tipo" data-v="gasto" aria-pressed="${F.tipo === 'gasto'}">Gastei</button><button data-f="tipo" data-v="entrada" aria-pressed="${F.tipo === 'entrada'}">Entrou</button><button data-f="tipo" data-v="guardar" aria-pressed="${F.tipo === 'guardar'}">Guardei</button></div>`}
    <input class="inp inp-big" id="fValor" inputmode="decimal" placeholder="R$ 0,00" aria-label="Valor" data-fi="valor" value="${esc(F.valor)}">
    ${F.tipo === 'gasto' ? `<div class="field"><span class="lbl">Categoria</span><div class="chips">${mostrar.map(c => `<button class="chip" data-f="cat" data-v="${c.id}" aria-pressed="${F.cat === c.id}"><i class="dot" style="--c:${c.c}"></i>${esc(c.nome)}</button>`).join('')}${!F.todas && cats.length > mostrar.length ? `<button class="chip mais" data-f="todas" data-v="1">+ ${cats.length - mostrar.length} categorias</button>` : ''}</div></div>` : ''}
    ${F.tipo === 'entrada' ? `<div class="field"><span class="lbl">Tipo de entrada</span><div class="chips">${S.cfg.entradas.map(e => `<button class="chip" data-f="catEnt" data-v="${esc(e)}" aria-pressed="${F.catEnt === e}">${esc(e)}</button>`).join('')}</div></div>` : ''}
    <div class="field"><span class="lbl">${F.tipo === 'gasto' || F.tipo === 'fatura' ? 'Pagou com' : F.tipo === 'guardar' ? 'Saiu de' : 'Caiu em'}</span><div class="chips">${ops.map(x => `<button class="chip" data-f="meio" data-v="${x.id}" aria-pressed="${F.meio === x.id}">${esc(x.nome)}</button>`).join('')}</div></div>
    ${F.tipo === 'guardar' ? `<div class="field"><span class="lbl">Foi para</span><div class="chips">${investimentos().map(x => `<button class="chip" data-f="para" data-v="${x.id}" aria-pressed="${F.para === x.id}">${esc(x.nome)}</button>`).join('')}</div></div>` : ''}
    ${F.tipo === 'gasto' && ehC && !F.id ? `<div class="field"><label for="fN">Parcelas</label><select class="inp" id="fN" data-fs="n">${[...Array(12)].map((_, k) => `<option value="${k + 1}" ${F.n === k + 1 ? 'selected' : ''}>${k === 0 ? 'À vista' : (k + 1) + 'x'}</option>`).join('')}</select></div>` : ''}
    <div class="field"><span class="lbl">Quando</span><div class="chips"><button class="chip" data-f="dataModo" data-v="hoje" aria-pressed="${F.dataModo === 'hoje'}">Hoje</button><button class="chip" data-f="dataModo" data-v="ontem" aria-pressed="${F.dataModo === 'ontem'}">Ontem</button><button class="chip" data-f="dataModo" data-v="outra" aria-pressed="${F.dataModo === 'outra'}">${F.dataModo === 'outra' ? 'Dia ' + Number(F.data.slice(8, 10)) + '/' + F.data.slice(5, 7) : 'Escolher dia'}</button></div>
      ${F.dataModo === 'outra' ? `<input class="inp" id="fData" type="date" data-fi="data" value="${esc(F.data)}" aria-label="Data">` : ''}</div>
    ${F.tipo === 'entrada' ? `<div class="field"><span class="lbl">Conta para o mês de</span><div class="chips">${[0, 1].map(k => { const m = idxOfKey(F.data.slice(0, 7)) + k; return `<button class="chip" data-f="comp" data-v="${m}" aria-pressed="${F.comp === m}">${nomeMes(m)}</button>`; }).join('')}</div></div>` : ''}
    <div class="field"><label for="fDesc">Descrição</label><input class="inp" id="fDesc" data-fi="desc" value="${esc(F.desc)}" placeholder="opcional"></div>
    <div class="res" id="lancInfo"></div>
    <button class="btn" data-act="salvarLanc">Salvar</button>
    ${F.id ? (F.confirma ? `<div class="grid2"><button class="btn sec" data-act="naoApagar">Cancelar</button><button class="btn perigo" data-act="apagarLanc">Sim, apagar</button></div>` : '<button class="btn sec" data-act="perguntaApagar">Apagar lançamento</button>') : ''}`);
  atualizarInfo();
}
function salvarLanc() {
  const v = num(F.valor); if (v <= 0) { toast('Digite um valor'); return; }
  if (!F.data) F.data = isoHoje();
  const i = idxOfKey(F.data.slice(0, 7)); const c = cartao(F.meio);
  if (F.tipo === 'gasto' && !F.cat) { toast('Escolha uma categoria'); return; }
  if (F.tipo === 'guardar' && !F.para) { toast('Cadastre um investimento em Ajustes'); return; }
  ls.set('dd-meio', F.meio);
  if (!F.id && F.tipo === 'gasto' && c && F.n > 1) {
    DB.addParc({ desc: F.desc.trim() || cat(F.cat).nome, cat: F.cat, cartao: c.id, parcela: r2(v / F.n), n: Number(F.n), primeira: faturaDe(c, i, Number(F.data.slice(8, 10))), data: F.data, criado: Date.now() });
  } else {
    const compet = F.tipo === 'entrada' && F.comp != null ? Number(F.comp) : (F.tipo === 'gasto' && c ? faturaDe(c, i, Number(F.data.slice(8, 10))) : i);
    const l = { data: F.data, mes: keyOf(compet), tipo: F.tipo, valor: v, meio: F.meio, desc: F.desc.trim(), criado: F.criado || Date.now() };
    if (F.tipo === 'gasto') l.cat = F.cat;
    if (F.tipo === 'entrada') l.catEnt = F.catEnt;
    if (F.tipo === 'guardar') l.para = F.para;
    if (F.tipo === 'fatura') { l.cartao = F.cartao; l.fatM = F.fatM; }
    F.id ? DB.updLanc(F.id, l) : DB.addLanc(l);
  }
  const msg = F.id ? 'Lançamento atualizado' : F.tipo === 'gasto' ? 'Gasto anotado' : F.tipo === 'entrada' ? 'Entrada anotada' : 'Guardado!';
  fechar(); toast(msg);
}

/* --- mover entre categorias --- */
function folhaMover() {
  const i = CUR(); const livre = id => id === LIVRE ? semCat(i) : planCat(id, i) - gastoCat(id, i);
  const cats = S.cfg.cats.filter(c => c.ativa);
  const chipLivre = campo => `<button class="chip" data-f="${campo}" data-v="${LIVRE}" aria-pressed="${F[campo] === LIVRE}"><i class="dot" style="--c:#FFFFFF"></i>Sem categoria${campo === 'de' ? ' · ' + fmt0(semCat(i)) : ''}</button>`;
  const destinos = F.todas ? cats : catsDoMes(i).filter(c => c.ativa).concat(F.para && F.para !== LIVRE && !catsDoMes(i).some(c => c.id === F.para) ? [cat(F.para)] : []);
  abrir(`<h3>Mover valor</h3><p class="small muted b" style="margin:0">Tira do planejado de um lugar e põe em outro. O total do mês não muda.</p>
    <div class="field"><span class="lbl">Tirar de</span><div class="chips">${semCat(i) > .005 ? chipLivre('de') : ''}${cats.filter(c => livre(c.id) > 0).map(c => `<button class="chip" data-f="de" data-v="${c.id}" aria-pressed="${F.de === c.id}"><i class="dot" style="--c:${c.c}"></i>${esc(c.nome)} · ${fmt0(livre(c.id))}</button>`).join('')}</div></div>
    <div class="field"><span class="lbl">Colocar em</span><div class="chips">${destinos.map(c => `<button class="chip" data-f="para" data-v="${c.id}" aria-pressed="${F.para === c.id}"><i class="dot" style="--c:${c.c}"></i>${esc(c.nome)}</button>`).join('')}${chipLivre('para')}${F.todas ? '' : '<button class="chip mais" data-f="todas" data-v="1">+ outras</button>'}</div></div>
    <input class="inp inp-big" inputmode="decimal" placeholder="R$ 0,00" aria-label="Valor a mover" data-fi="valor" value="${esc(F.valor)}">
    <button class="btn" data-act="salvarMover">Mover</button>`);
}

/* --- planejar o mês --- */
function abrirWizard() {
  const i = UI.mes; const base = mesDoc(i) || mesPadrao(i);
  F = { k: 'wiz', p: 0, i, receita: brl(base.receita), guardar: brl(base.guardarMeta), fixas: base.fixas.map(f => ({ ...f, valor: brl(f.valor) })),
        plan: Object.fromEntries(S.cfg.cats.map(c => [c.id, base.plan?.[c.id] ? brl(base.plan[c.id]) : ''])), todas: false };
  folhaWizard();
}
function restoWiz() {
  const disp = num(F.receita) - num(F.guardar) - soma(F.fixas, f => num(f.valor));
  return r2(disp - soma(Object.values(F.plan), v => num(v)));
}
function htmlResto() { const r = restoWiz(); return Math.abs(r) < .01 ? '<b>Tudo distribuído.</b>' : r > 0 ? `<b>${fmt(r)} ficam soltos, sem categoria.</b> Pode deixar assim e colocar onde quiser ao longo do mês.` : `Passou <b>${fmt(-r)}</b> do que você tem para o mês.`; }
function corResto() { const r = restoWiz(); return r < -.005 ? 'var(--rosa-cl)' : 'var(--salvia-cl)'; }
function folhaWizard() {
  const i = F.i;
  const barra = `<div class="step">${[0, 1, 2, 3].map(k => `<i class="${k <= F.p ? 'on' : ''}"></i>`).join('')}<span>${F.p + 1}/4</span></div>`;
  const comPlano = S.cfg.cats.filter(c => c.ativa && (num(F.plan[c.id]) > 0 || parcCat(c.id, i) > 0));
  const lista = F.todas || comPlano.length === 0 ? S.cfg.cats.filter(c => c.ativa) : comPlano;
  const telas = [
    `<h3>Quanto entra em ${nomeMes(i).toLowerCase()}?</h3><p class="small muted b" style="margin:0">Salário e o que mais você tem certeza que vai receber.</p><input class="inp inp-big" inputmode="decimal" aria-label="Receita do mês" data-fi="receita" value="${esc(F.receita)}">`,
    `<h3>Quanto vai guardar?</h3><p class="small muted b" style="margin:0">Esse valor sai primeiro, antes de distribuir o resto.</p><input class="inp inp-big" inputmode="decimal" aria-label="Meta de guardar" data-fi="guardar" value="${esc(F.guardar)}">`,
    `<h3>Confere as fixas</h3><p class="small muted b" style="margin:0">Ajuste o valor deste mês se mudou (energia, por exemplo).</p>
     ${F.fixas.map((f, k) => `<div class="lin"><div class="nm">${esc(f.nome)}<small>vence dia ${f.venc}</small></div><input class="inp sm" style="width:130px" inputmode="decimal" aria-label="Valor ${esc(f.nome)}" data-wfixa="${k}" value="${esc(f.valor)}"></div>`).join('')}
     <div class="res"><b>Total das fixas: <span id="totFixas">${fmt(soma(F.fixas, f => num(f.valor)))}</span></b></div>`,
    `<h3>Distribui o resto</h3>
     <div class="res" id="resto" style="--r:${corResto()}">${htmlResto()}</div>
     ${lista.map(c => { const comp = parcCat(c.id, i);
       return `<div class="lin"><i class="dot" style="--c:${c.c}"></i><div class="nm">${esc(c.nome)}${comp ? `<small>já tem ${fmt(comp)} em parcelas</small>` : ''}</div><input class="inp sm" style="width:120px" inputmode="decimal" placeholder="0,00" aria-label="Planejado ${esc(c.nome)}" data-plan="${c.id}" value="${esc(F.plan[c.id])}"></div>`; }).join('')}
     ${lista.length < S.cfg.cats.filter(c => c.ativa).length ? '<button class="chip mais" style="align-self:flex-start" data-f="todas" data-v="1">+ mostrar todas as categorias</button>' : ''}`];
  abrir(`${barra}${telas[F.p]}<div class="grid2">${F.p > 0 ? '<button class="btn sec" data-act="wizVolta">Voltar</button>' : '<button class="btn sec" data-act="fechar">Cancelar</button>'}<button class="btn" data-act="${F.p < 3 ? 'wizVai' : 'wizFim'}">${F.p < 3 ? 'Próximo' : 'Salvar plano'}</button></div>`);
}
function salvarWizard() {
  const i = F.i, k = keyOf(i), atual = mesDoc(i);
  const plan = {}; for (const [id, v] of Object.entries(F.plan)) if (num(v) > 0) plan[id] = num(v);
  const fixas = F.fixas.map(f => { const ant = atual?.fixas?.find(x => x.id === f.id); return { ...f, valor: num(f.valor), pago: ant?.pago || false, ...(ant?.pagoTs ? { pagoTs: ant.pagoTs } : {}) }; });
  DB.saveMes(k, { receita: num(F.receita), guardarMeta: num(F.guardar), plan, fixas, criado: atual?.criado || Date.now() });
  if (i >= CUR()) DB.saveCfg({ ...S.cfg, receita: num(F.receita), guardarMeta: num(F.guardar) });
  fechar(); toast('Plano de ' + nomeMes(i).toLowerCase() + ' salvo');
}

/* --- parcelas: cadastrar em andamento / ver --- */
function folhaParc() {
  if (F.modo === 'ver') {
    const p = S.parc.find(x => x.id === F.id); if (!p) { fechar(); return; }
    abrir(`<h3>${esc(p.desc)}</h3>
      <div class="res" style="--r:var(--lilas-cl)">${p.n}x de <b>${fmt(p.parcela)}</b> no ${esc(meioNome(p.cartao))} · total ${fmt(p.parcela * p.n)}<br>Faturas de ${lab(p.primeira)} até ${lab(p.primeira + p.n - 1)} · categoria ${esc(cat(p.cat).nome)}</div>
      ${F.confirma ? `<div class="grid2"><button class="btn sec" data-act="naoApagar">Cancelar</button><button class="btn perigo" data-act="apagarParc">Sim, apagar</button></div>` : '<button class="btn sec" data-act="perguntaApagar">Apagar esta compra parcelada</button>'}`);
    return;
  }
  const c = cartao(F.cartao); const aberta = c ? faturaDe(c, CUR(), DIA()) : CUR();
  abrir(`<h3>Parcela que já está rolando</h3><p class="small muted b" style="margin:0">Para compras feitas antes de começar a usar o DinDin.</p>
    <div class="field"><label for="pDesc">O que foi</label><input class="inp" id="pDesc" data-fi="desc" value="${esc(F.desc)}" placeholder="ex.: notebook"></div>
    <div class="grid2"><div class="field"><label for="pVal">Valor da parcela</label><input class="inp" id="pVal" inputmode="decimal" data-fi="valor" value="${esc(F.valor)}" placeholder="R$ 0,00"></div>
    <div class="field"><label for="pN">Total de parcelas</label><input class="inp" id="pN" inputmode="numeric" data-fi="n" value="${esc(F.n)}"></div></div>
    <div class="field"><span class="lbl">Cartão</span><div class="chips">${S.cfg.cartoes.map(x => `<button class="chip" data-f="cartao" data-v="${x.id}" aria-pressed="${F.cartao === x.id}">${esc(x.nome)}</button>`).join('')}</div></div>
    <div class="field"><label for="pAt">Qual parcela vence em ${nomeMes(CUR()).toLowerCase()}?</label><input class="inp" id="pAt" inputmode="numeric" data-fi="atual" value="${esc(F.atual)}"></div>
    <div class="field"><span class="lbl">Categoria</span><div class="chips">${(F.todas ? catsOrdenadas() : catsOrdenadas().slice(0, 9)).map(k => `<button class="chip" data-f="cat" data-v="${k.id}" aria-pressed="${F.cat === k.id}"><i class="dot" style="--c:${k.c}"></i>${esc(k.nome)}</button>`).join('')}${F.todas ? '' : '<button class="chip mais" data-f="todas" data-v="1">+ categorias</button>'}</div></div>
    <button class="btn" data-act="salvarParc">Salvar</button>`);
}

/* --- formulário genérico (contas, cartões, fixas, categorias) --- */
function folhaForm() {
  const v = F.v; const campos = F.campos();
  abrir(`<h3>${esc(F.titulo)}</h3>${campos.map(c => {
    if (c.tipo === 'seg') return `<div class="field"><span class="lbl">${c.label}</span><div class="seg" style="--n:${c.ops.length}">${c.ops.map(([val, n]) => `<button data-fv="${c.k}" data-v="${val}" aria-pressed="${v[c.k] === val}">${n}</button>`).join('')}</div></div>`;
    if (c.tipo === 'chips') return `<div class="field"><span class="lbl">${c.label}</span><div class="chips">${c.ops.map(([val, n]) => `<button class="chip" data-fv="${c.k}" data-v="${val}" aria-pressed="${v[c.k] === val}">${esc(n)}</button>`).join('')}</div></div>`;
    if (c.tipo === 'cor') return `<div class="field"><span class="lbl">${c.label}</span><div class="cores">${PAL.map(p => `<button style="--c:${p}" data-fv="${c.k}" data-v="${p}" aria-pressed="${v[c.k] === p}" aria-label="Cor ${p}"></button>`).join('')}</div></div>`;
    if (c.tipo === 'nota') return `<p class="small muted b" style="margin:0">${c.label}</p>`;
    return `<div class="field"><label for="ff-${c.k}">${c.label}</label><input class="inp" id="ff-${c.k}" data-fv-in="${c.k}" ${c.tipo === 'money' ? 'inputmode="decimal"' : c.tipo === 'int' ? 'inputmode="numeric"' : ''} value="${esc(v[c.k])}" placeholder="${esc(c.ph || '')}"></div>`;
  }).join('')}
  <button class="btn" data-act="formSalvar">Salvar</button>
  ${F.apagar ? (F.confirma ? `<div class="grid2"><button class="btn sec" data-act="naoApagar">Cancelar</button><button class="btn perigo" data-act="formApagar">Sim, apagar</button></div>` : `<button class="btn sec" data-act="perguntaApagar">${F.apagarTxt || 'Apagar'}</button>`) : ''}`);
}
function editar(lista, id, titulo, novo, campos, montar, opcoes = {}) {
  const item = id ? S.cfg[lista].find(x => x.id === id) : null;
  F = { k: 'form', titulo: item ? titulo[1] : titulo[0], v: { ...(item ? opcoes.paraForm?.(item) ?? item : novo()) }, campos,
        apagar: item && (opcoes.podeApagar?.(item) ?? true), apagarTxt: opcoes.apagarTxt,
        salvar: v => { const obj = montar(v, item); if (!obj) return false; const arr = item ? S.cfg[lista].map(x => x.id === item.id ? obj : x) : [...S.cfg[lista], obj]; DB.saveCfg({ ...S.cfg, [lista]: arr }); opcoes.depois?.(obj, item); return true; },
        remover: () => DB.saveCfg({ ...S.cfg, [lista]: S.cfg[lista].filter(x => x.id !== item.id) }) };
  folhaForm();
}
const dia = v => Math.min(31, Math.max(1, parseInt(v) || 1));
function editConta(id) {
  editar('contas', id, ['Nova conta', 'Conta'], () => ({ nome: '', sub: '', tipo: 'conta', saldoTxt: '' }),
    () => [{ k: 'nome', label: 'Nome', ph: 'ex.: Nubank' }, { k: 'sub', label: 'Detalhe', ph: 'ex.: conta corrente' },
      { k: 'tipo', label: 'Tipo', tipo: 'seg', ops: [['conta', 'Conta'], ['invest', 'Investimento']] },
      { k: 'saldoTxt', label: 'Saldo de hoje', tipo: 'money' }, { tipo: 'nota', label: 'O saldo digitado vira o novo ponto de partida. Os lançamentos de agora em diante entram em cima dele.' }],
    (v, it) => { if (!v.nome.trim()) { toast('Dê um nome'); return null; }
      const base = num(v.saldoTxt); const mudou = !it || Math.abs(base - saldo(it)) > .005;
      return { id: it?.id || slug(v.nome) + '-' + novoId().slice(-4), nome: v.nome.trim(), sub: v.sub.trim(), tipo: v.tipo,
        base: mudou ? base : it.base, baseTs: mudou ? Date.now() : it.baseTs }; },
    { paraForm: it => ({ ...it, saldoTxt: brl(saldo(it)) }), podeApagar: it => S.cfg.contas.length > 1 });
}
function editCartao(id) {
  editar('cartoes', id, ['Novo cartão', 'Cartão'], () => ({ nome: '', fecha: '1', vence: '8', conta: contasCorrentes()[0]?.id }),
    () => [{ k: 'nome', label: 'Nome', ph: 'ex.: Inter' }, { k: 'fecha', label: 'Dia que a fatura fecha', tipo: 'int' }, { k: 'vence', label: 'Dia que vence', tipo: 'int' },
      { k: 'conta', label: 'Paga a fatura com', tipo: 'chips', ops: contasCorrentes().map(c => [c.id, c.nome]) }],
    (v, it) => v.nome.trim() ? { id: it?.id || slug(v.nome) + '-' + novoId().slice(-4), nome: v.nome.trim(), fecha: dia(v.fecha), vence: dia(v.vence), conta: v.conta } : (toast('Dê um nome'), null),
    { paraForm: it => ({ ...it, fecha: String(it.fecha), vence: String(it.vence) }) });
}
function editFixa(id) {
  editar('fixas', id, ['Nova conta fixa', 'Conta fixa'], () => ({ nome: '', valorTxt: '', venc: '10', meio: S.cfg.contaPadrao }),
    () => [{ k: 'nome', label: 'Nome', ph: 'ex.: Plano de saúde' }, { k: 'valorTxt', label: 'Valor', tipo: 'money' }, { k: 'venc', label: 'Dia do vencimento', tipo: 'int' },
      { k: 'meio', label: 'Paga com', tipo: 'chips', ops: meios().map(m => [m.id, m.nome]) }],
    (v, it) => v.nome.trim() ? { id: it?.id || slug(v.nome) + '-' + novoId().slice(-4), nome: v.nome.trim(), valor: num(v.valorTxt), venc: dia(v.venc), meio: v.meio } : (toast('Dê um nome'), null),
    { paraForm: it => ({ ...it, valorTxt: brl(it.valor), venc: String(it.venc) }),
      depois: (obj, antigo) => { if (antigo) return; const i = UI.mes; const m = mesDoc(i); if (m && i >= CUR()) DB.saveMes(keyOf(i), { ...m, fixas: [...(m.fixas || []), { ...obj, pago: false }] }); } });
}
function editCat(id) {
  const usada = id && (S.lanc.some(l => l.cat === id) || S.parc.some(p => p.cat === id));
  editar('cats', id, ['Nova categoria', 'Categoria'], () => ({ nome: '', c: PAL[S.cfg.cats.length % PAL.length], ativa: 'sim' }),
    () => [{ k: 'nome', label: 'Nome', ph: 'ex.: Beleza' }, { k: 'c', label: 'Cor', tipo: 'cor' }, { k: 'ativa', label: 'Aparece na hora de lançar', tipo: 'seg', ops: [['sim', 'Sim'], ['nao', 'Ocultar']] }],
    (v, it) => v.nome.trim() ? { id: it?.id || slug(v.nome) + '-' + novoId().slice(-4), nome: v.nome.trim(), c: v.c, ativa: v.ativa === 'sim' } : (toast('Dê um nome'), null),
    { paraForm: it => ({ ...it, ativa: it.ativa ? 'sim' : 'nao' }), podeApagar: () => !usada });
}

/* --- importar parcelas de um arquivo (carga da planilha) --- */
const normal = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
function lerImport(arq) {
  const rd = new FileReader();
  rd.onload = () => {
    try {
      const j = JSON.parse(rd.result); const lista = (j.parc || []).filter(p => p.desc && p.parcela > 0 && p.n > 0 && p.primeira);
      if (!lista.length) { toast('Não achei parcelas nesse arquivo'); return; }
      const sug = S.cfg.cartoes.find(c => lista[0].cartao && normal(c.nome).includes(normal(lista[0].cartao).split(' ')[0])) || S.cfg.cartoes[0];
      F = { k: 'imp', lista, cartao: sug?.id }; folhaImport();
    } catch (e) { toast('Arquivo inválido'); }
    document.getElementById('fImport').value = '';
  };
  rd.readAsText(arq);
}
function folhaImport() {
  const i = CUR(), L = F.lista.map(p => ({ ...p, prim: idxOfKey(p.primeira) }));
  const ativas = L.filter(p => p.prim + p.n - 1 >= i);
  const noMes = k => soma(ativas.filter(p => k >= p.prim && k < p.prim + p.n), p => p.parcela);
  const jaTem = p => S.parc.some(x => normal(x.desc) === normal(p.desc) && Math.abs(x.parcela - p.parcela) < .01 && x.n === p.n && x.primeira === p.prim);
  const novas = ativas.filter(p => !jaTem(p));
  abrir(`<h3>Importar parcelas</h3>
    <div class="res">${ativas.length} compras parceladas ainda rolando${novas.length < ativas.length ? ` (${ativas.length - novas.length} já estão no app e serão puladas)` : ''}.<br>
    Parcelas: ${[0, 1, 2].map(k => `<b>${lab(i + k)}</b> ${fmt(noMes(i + k))}`).join(' · ')}</div>
    <div class="field"><span class="lbl">Em qual cartão estão?</span><div class="chips">${S.cfg.cartoes.map(c => `<button class="chip" data-act="impCartao" data-v="${c.id}" aria-pressed="${F.cartao === c.id}">${esc(c.nome)}</button>`).join('')}</div></div>
    <div class="card"><div class="card-b">${novas.map(p => `<div class="lin"><div class="nm">${esc(p.desc)}<small>${esc(p.cat || '')} · ${lab(p.prim)} até ${lab(p.prim + p.n - 1)}</small></div><span class="num b">${p.n}x ${fmt(p.parcela)}</span></div>`).join('') || '<p class="vazio">Nada novo para importar.</p>'}</div></div>
    <button class="btn" data-act="importar" ${novas.length && F.cartao ? '' : 'disabled'}>Importar ${novas.length} compras</button>`);
  F.novas = novas;
}
function importarParcelas() {
  if (!F?.novas?.length || !F.cartao) return;
  let cats = [...S.cfg.cats], mudou = false;
  const catId = nome => { const n = normal(nome); let c = cats.find(x => normal(x.nome) === n);
    if (!c && nome) { c = { id: slug(nome) + '-' + novoId().slice(-4), nome: String(nome).trim(), c: PAL[cats.length % PAL.length], ativa: true }; cats.push(c); mudou = true; }
    return c?.id || cats[0].id; };
  const ps = F.novas.map(p => ({ desc: p.desc, cat: catId(p.cat), cartao: F.cartao, parcela: r2(p.parcela), n: p.n, primeira: p.prim, data: p.data || isoHoje(), criado: Date.now() }));
  if (mudou) DB.saveCfg({ ...S.cfg, cats });
  ps.forEach(p => DB.addParc(p));
  fechar(); toast(`${ps.length} compras parceladas importadas`);
}

/* --- importar a planilha de Excel dela (abas Lançamentos e Parcelamentos) --- */
async function carregarXLSX() {
  if (window.XLSX) return window.XLSX;
  await new Promise((ok, erro) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = erro; document.head.appendChild(s); });
  return window.XLSX;
}
function isoDe(XLSX, v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : null; }
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const m = String(v).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/); return m ? `${m[3]}-${pad(m[2])}-${pad(m[1])}` : null;
}
const valorDe = v => typeof v === 'number' ? r2(v) : num(v);
function aba(XLSX, wb, nomes) {
  const nome = wb.SheetNames.find(n => nomes.includes(normal(n))); if (!nome) return null;
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[nome], { header: 1, raw: true, defval: null });
  const h = rows.findIndex(r => r.some(c => normal(c).startsWith('descri'))); if (h < 0) return null;
  const head = rows[h].map(normal);
  const col = (...ps) => head.findIndex(x => ps.some(p => typeof p === 'function' ? p(x) : x.startsWith(p)));
  return { col, linhas: rows.slice(h + 1).filter(r => r.some(c => c != null && c !== '')) };
}
function lerPlanilha(XLSX, wb) {
  const res = { lanc: [], parc: [] };
  const L = aba(XLSX, wb, ['lancamentos', 'lancamento', 'extrato']);
  if (L) {
    const c = { dd: L.col('data desp', x => x === 'data'), dp: L.col('data pag'), desc: L.col('descri'), val: L.col('valor'), tipo: L.col(x => x.startsWith('tipo') && x.includes('entrada')),
      cat: L.col(x => x === 'categoria'), meio: L.col('meio'), mes: L.col('mes'), parc: L.col('parcelado'), fixa: L.col('tipo desp') };
    for (const r of L.linhas) {
      const data = isoDe(XLSX, r[c.dd]) || isoDe(XLSX, r[c.dp]); const valor = valorDe(r[c.val]); if (!data || !valor) continue;
      let mes = null; const mt = String(r[c.mes] ?? '').match(/(\d{1,2})\/(\d{4})/);
      if (mt) mes = idx(Number(mt[2]), Number(mt[1]) - 1); else mes = idxOfKey((isoDe(XLSX, r[c.dp]) || data).slice(0, 7));
      res.lanc.push({ data, mes, desc: String(r[c.desc] ?? '').trim(), valor, entrada: normal(r[c.tipo]).startsWith('entrada'), cat: String(r[c.cat] ?? '').trim(),
        meio: String(r[c.meio] ?? ''), parcelado: normal(r[c.parc]).startsWith('sim'), fixa: normal(r[c.fixa]).startsWith('fixa') });
    }
  }
  const P = aba(XLSX, wb, ['parcelamentos', 'parcelas', 'parcelados']);
  if (P) {
    const c = { dd: P.col('data desp'), dp: P.col('data pag'), desc: P.col('descri'), vp: P.col('valor parcela', x => x === 'valor parcela'), meio: P.col('meio'), cat: P.col(x => x === 'categoria'),
      n: P.col('total parcelas'), k: P.col('parcela atual') };
    const grupos = {};
    for (const r of P.linhas) {
      const dp = isoDe(XLSX, r[c.dp]), vp = valorDe(r[c.vp]), n = parseInt(r[c.n]), k = parseInt(r[c.k]); if (!dp || !vp || !n || !k) continue;
      const desc = String(r[c.desc] ?? '').replace(/\s+\d{2}\/\d{2}\s*$/, '').trim(); const prim = idxOfKey(dp.slice(0, 7)) - (k - 1);
      const key = [normal(desc), vp, n, normal(r[c.meio])].join('|');
      (grupos[key] = grupos[key] || []).push({ desc, vp, n, prim, meio: String(r[c.meio] ?? ''), cat: String(r[c.cat] ?? '').trim(), data: isoDe(XLSX, r[c.dd]) });
    }
    for (const g of Object.values(grupos)) {
      const cont = {}; g.forEach(x => cont[x.prim] = (cont[x.prim] || 0) + 1);
      const prim = Number(Object.keys(cont).sort((a, b) => cont[b] - cont[a])[0]); const x = g[0];
      res.parc.push({ desc: x.desc, parcela: x.vp, n: x.n, prim, meio: x.meio, cat: x.cat, data: g.map(y => y.data).filter(Boolean).sort()[0] || isoHoje() });
    }
  }
  return res;
}
/* liga o texto "Itaú - Cartão de Crédito" ao cartão/conta do app */
function meioDe(txt) {
  const t = normal(txt), w = t.split(/[\s-]+/)[0];
  if (t.includes('cart')) return (S.cfg.cartoes.find(c => normal(c.nome).includes(w)) || S.cfg.cartoes.find(c => normal(c.nome).includes('outro')) || S.cfg.cartoes[0])?.id;
  return (contasCorrentes().find(c => normal(c.nome).includes(w)) || contasCorrentes()[0])?.id;
}
const chaveImp = (data, desc, valor) => `${data}|${normal(desc)}|${r2(valor)}`;
async function lerExcel(arq) {
  toast('Lendo a planilha...');
  try {
    const XLSX = await carregarXLSX();
    const wb = XLSX.read(new Uint8Array(await arq.arrayBuffer()), { type: 'array' });
    const dados = lerPlanilha(XLSX, wb);
    if (!dados.lanc.length && !dados.parc.length) { toast('Não achei as abas Lançamentos ou Parcelamentos'); return; }
    const meses = [...new Set(dados.lanc.map(l => l.mes))].sort((a, b) => b - a);
    const sel = meses.filter(m => m >= CUR()); 
    F = { k: 'xls', dados, meses, sel: sel.length ? sel : meses.slice(0, 1), comParc: true }; folhaExcel();
  } catch (e) { console.error(e); toast('Não consegui ler esse arquivo'); }
  const inp = document.getElementById('fExcel'); if (inp) inp.value = '';
}
function planoExcel() {
  const ja = new Set(S.lanc.map(l => l.imp).filter(Boolean));
  const L = F.dados.lanc.filter(l => F.sel.includes(l.mes));
  const r = { gastos: [], entradas: [], fixas: [], parcelados: 0, faturas: 0, repetidos: 0, estornos: 0 };
  for (const l of L) {
    if (ja.has(chaveImp(l.data, l.desc, l.valor))) { r.repetidos++; continue; }
    if (!l.entrada && l.parcelado) { r.parcelados++; continue; }
    if (normal(l.cat).startsWith('pagamento fatura')) { r.faturas++; continue; }
    if (l.entrada && l.valor < 0 && /cancel|estorn|reembols|devolu/.test(normal(l.desc))) { r.gastos.push({ ...l, chave: chaveImp(l.data, l.desc, l.valor) }); continue; }
    if (l.entrada) { if (l.valor > 0) r.entradas.push({ ...l, chave: chaveImp(l.data, l.desc, l.valor) }); else r.estornos++; continue; }
    const v = { ...l, valor: Math.abs(l.valor), chave: chaveImp(l.data, l.desc, l.valor) };
    const fx = fixasDoMes(l.mes).find(f => normal(f.nome) === normal(l.cat));
    if (l.fixa && fx) r.fixas.push({ ...v, fixaId: fx.id }); else r.gastos.push(v);
  }
  const iC = CUR(); const ativas = F.dados.parc.filter(p => p.prim + p.n - 1 >= iC);
  r.parc = ativas.filter(p => !S.parc.some(x => normal(x.desc) === normal(p.desc) && Math.abs(x.parcela - p.parcela) < .01 && x.n === p.n && x.primeira === p.prim));
  r.parcJa = ativas.length - r.parc.length;
  return r;
}
function folhaExcel() {
  const r = planoExcel();
  abrir(`<h3>Importar planilha</h3>
    ${F.meses.length ? `<div class="field"><span class="lbl">Quais meses? (pela coluna Mês Pgto)</span><div class="chips">${F.meses.map(m => `<button class="chip" data-act="xlsMes" data-v="${m}" aria-pressed="${F.sel.includes(m)}">${lab(m)}</button>`).join('')}</div></div>` : ''}
    <div class="card"><div class="card-b">
      <div class="lin"><div class="nm">Gastos à vista<small>classificados pela coluna Categoria</small></div><span class="num b">${r.gastos.length} · ${fmt(soma(r.gastos))}</span></div>
      <div class="lin"><div class="nm">Entradas<small>salário, transferências...</small></div><span class="num b">${r.entradas.length} · ${fmt(soma(r.entradas))}</span></div>
      <div class="lin"><div class="nm">Contas fixas pagas<small>marcadas como pagas no mês</small></div><span class="num b">${r.fixas.length} · ${fmt(soma(r.fixas))}</span></div>
      ${F.dados.parc.length ? `<div class="lin"><button class="ck" data-act="xlsParc" aria-pressed="${F.comParc}" aria-label="Importar parcelas">${F.comParc ? check : ''}</button><div class="nm">Compras parceladas rolando<small>da aba Parcelamentos${r.parcJa ? ` · ${r.parcJa} já estão no app` : ''}</small></div><span class="num b">${r.parc.length} novas</span></div>` : ''}
    </div></div>
    <div class="res" style="--r:var(--azul-cl)">Ficam de fora: ${r.parcelados} linhas parceladas (já vêm da aba Parcelamentos), ${r.faturas} pagamentos de fatura (os gastos do cartão já estão lançados um a um)${r.estornos ? `, ${r.estornos} entradas negativas` : ''}${r.repetidos ? ` e ${r.repetidos} que já foram importados antes` : ''}.</div>
    <button class="btn" data-act="xlsImportar" ${r.gastos.length + r.entradas.length + r.fixas.length + (F.comParc ? r.parc.length : 0) ? '' : 'disabled'}>Importar</button>`);
}
function importarExcel() {
  const r = planoExcel(); let cats = [...S.cfg.cats], entradas = [...S.cfg.entradas], mudou = false;
  const catId = nome => { const n = normal(nome); let c = cats.find(x => normal(x.nome) === n);
    if (!c) { const nm = String(nome || 'Outros').trim() || 'Outros'; c = cats.find(x => normal(x.nome) === normal(nm)) || { id: slug(nm) + '-' + novoId().slice(-4), nome: nm, c: PAL[cats.length % PAL.length], ativa: true }; if (!cats.includes(c)) { cats.push(c); mudou = true; } }
    return c.id; };
  const agora = Date.now();
  const base = l => ({ data: l.data, mes: keyOf(l.mes), valor: l.valor, desc: l.desc, meio: meioDe(l.meio), imp: l.chave, importado: true, criado: agora });
  r.gastos.forEach(l => DB.addLanc({ ...base(l), tipo: 'gasto', cat: catId(l.cat) }));
  r.entradas.forEach(l => { const ce = l.cat || 'Entrada'; if (!entradas.some(e => normal(e) === normal(ce))) { entradas.push(ce); mudou = true; } DB.addLanc({ ...base(l), tipo: 'entrada', catEnt: ce }); });
  // contas fixas: marca como paga no mês (sem descontar de novo do saldo informado)
  const porMes = {}; r.fixas.forEach(f => (porMes[f.mes] = porMes[f.mes] || []).push(f));
  for (const [m, lista] of Object.entries(porMes)) {
    const i = Number(m), md = mesDoc(i) || mesPadrao(i);
    const fixas = md.fixas.map(x => { const f = lista.find(y => y.fixaId === x.id); return f ? { ...x, valor: f.valor, pago: true, pagoTs: 0 } : x; });
    DB.saveMes(keyOf(i), { ...md, fixas });
    lista.forEach(f => DB.addLanc({ ...base(f), tipo: 'marca', fixa: f.fixaId })); // só para não importar de novo
  }
  if (F.comParc) r.parc.forEach(p => DB.addParc({ desc: p.desc, cat: catId(p.cat), cartao: meioDe(p.meio) || S.cfg.cartoes[0]?.id, parcela: r2(p.parcela), n: p.n, primeira: p.prim, data: p.data, criado: agora }));
  if (mudou) DB.saveCfg({ ...S.cfg, cats, entradas });
  const nP = F.comParc ? r.parc.length : 0;
  fechar(); toast(`Importado: ${r.gastos.length} gastos, ${r.entradas.length} entradas, ${r.fixas.length} fixas, ${nP} parceladas`);
}

/* =========================================================
   Render e eventos
   ========================================================= */
function navHtml() {
  const b = (t, n) => `<button data-act="tab" data-v="${t}" ${UI.tab === t ? 'aria-current="page"' : ''}>${ic(t)}${n}</button>`;
  return `<div class="in">${b('inicio', 'Início')}${b('extrato', 'Extrato')}
    <button class="plus" data-act="lancar" aria-label="Lançar"><span><svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="#3D3634" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M14 6v16M6 14h16"/></svg></span></button>
    ${b('cartao', 'Cartão')}${b('ajustes', 'Ajustes')}</div>`;
}
let pendente = false;
function render(forcar = true) {
  const app = document.getElementById('app'), nav = document.getElementById('nav');
  // dado novo chegou enquanto a pessoa digita: espera ela sair do campo
  const foco = document.activeElement;
  if (!forcar && foco && app.contains(foco) && (foco.tagName === 'INPUT' || foco.tagName === 'SELECT')) { pendente = true; return; }
  pendente = false;
  if (!S.user) { app.className = 'app sem-nav'; nav.hidden = true; app.innerHTML = tLogin(); return; }
  if (!S.pronto || !S.cfg) { app.className = 'app sem-nav'; nav.hidden = true; app.innerHTML = `<div class="login"><div class="logo">${porquinho(96)}<b>DinDin</b><span>abrindo seu cofrinho...</span></div></div>`; return; }
  if (!S.cfg.setup) { app.className = 'app sem-nav'; nav.hidden = true; app.innerHTML = tOnboarding(); return; }
  app.className = 'app'; nav.hidden = false; nav.innerHTML = navHtml();
  app.innerHTML = ({ inicio: tInicio, extrato: tExtrato, cartao: tCartao, ajustes: tAjustes })[UI.tab]();
  if (F?.k === 'lanc') atualizarInfo();
}
document.addEventListener('focusout', () => { if (pendente) setTimeout(() => { if (pendente) render(false); }, 50); });
function irPara(t) { UI.tab = t; render(); window.scrollTo(0, 0); }

document.addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-f],[data-fv]'); if (!t) return;
  if (t.dataset.f) {   // campos de escolha das folhas
    const k = t.dataset.f, v = t.dataset.v;
    if (k === 'todas') F.todas = true; else F[k] = v;
    if (F.k === 'lanc' && k === 'tipo') { F.n = 1; if (v !== 'gasto' && !contasCorrentes().some(c => c.id === F.meio)) F.meio = contasCorrentes()[0]?.id; }
    if (F.k === 'lanc' && k === 'meio' && !cartao(v)) F.n = 1;
    if (F.k === 'lanc' && k === 'dataModo') { if (v === 'hoje') F.data = isoHoje(); if (v === 'ontem') F.data = isoOntem(); if (!F.compManual) F.comp = compPadrao(F.data); }
    if (F.k === 'lanc' && k === 'comp') { F.comp = Number(v); F.compManual = true; }
    reabrir(); return;
  }
  if (t.dataset.fv) { F.v[t.dataset.fv] = t.dataset.v; folhaForm(); return; }
  const a = t.dataset.act, d = t.dataset;
  const acoes = {
    tab: () => irPara(d.v),
    fechar,
    mesAnt: () => { UI.mes--; render(); },
    mesProx: () => { if (UI.mes < CUR() + 12) { UI.mes++; render(); } },
    lancar: () => novoLanc(d.tipo || 'gasto'),
    editar: () => { const l = S.lanc.find(x => x.id === d.id); if (!l) return;
      F = { k: 'lanc', id: l.id, tipo: l.tipo, valor: brl(l.valor), cat: l.cat, catEnt: l.catEnt, meio: l.meio, n: 1, desc: l.desc || '', data: l.data,
        dataModo: l.data === isoHoje() ? 'hoje' : l.data === isoOntem() ? 'ontem' : 'outra', comp: idxOfKey(l.mes), compManual: true, para: l.para, criado: l.criado, cartao: l.cartao, fatM: l.fatM, todas: false, confirma: false };
      folhaLancar(); },
    salvarLanc,
    perguntaApagar: () => { F.confirma = true; reabrir(); },
    naoApagar: () => { F.confirma = false; reabrir(); },
    apagarLanc: () => { DB.delLanc(F.id); fechar(); toast('Lançamento apagado'); },
    filtro: () => { UI.filtro = d.v; render(); },
    pagar: () => {
      const i = UI.mes, k = keyOf(i), m = mesDoc(i) || mesPadrao(i);
      const fixas = m.fixas.map(f => f.id === d.id ? (f.pago ? (({ pagoTs, ...r }) => ({ ...r, pago: false }))(f) : { ...f, pago: true, pagoTs: Date.now() }) : f);
      DB.saveMes(k, { ...m, fixas }); },
    mover: () => { const i = CUR(); const livre = id => planCat(id, i) - gastoCat(id, i);
      const maior = S.cfg.cats.filter(c => c.id !== d.para && livre(c.id) > 0).sort((a, b) => livre(b.id) - livre(a.id))[0];
      const de = d.de || (semCat(i) > .005 ? LIVRE : maior?.id);
      F = { k: 'mover', de, para: d.para || catsDoMes(i).find(c => c.id !== de)?.id, valor: d.valor ? brl(Number(d.valor)) : '', todas: false }; folhaMover(); },
    salvarMover: () => { const v = num(F.valor), i = CUR(); if (v <= 0 || !F.de || !F.para || F.de === F.para) { toast('Escolha o valor e duas categorias diferentes'); return; }
      const m = mesDoc(i); if (!m) { toast('Planeje o mês primeiro'); return; }
      const plan = { ...m.plan };
      if (F.de !== LIVRE) { plan[F.de] = r2((plan[F.de] || 0) - v); if (plan[F.de] <= 0) delete plan[F.de]; }
      if (F.para !== LIVRE) plan[F.para] = r2((plan[F.para] || 0) + v);
      DB.saveMes(keyOf(i), { ...m, plan }); const n = F.para === LIVRE ? 'sem categoria' : cat(F.para).nome; fechar(); toast(`${fmt(v)} movidos para ${n}`); },
    wizard: () => abrirWizard(),
    wizVai: () => { F.p++; folhaWizard(); }, wizVolta: () => { F.p--; folhaWizard(); }, wizFim: salvarWizard,
    simCartao: () => { UI.sim.cartao = d.v; render(); },
    tetoModo: () => DB.saveCfg({ ...S.cfg, teto: { ...S.cfg.teto, modo: d.v } }),
    pagarFatura: () => { const c = cartao(d.id);
      F = { k: 'lanc', tipo: 'fatura', valor: brl(Number(d.v)), meio: c.conta || S.cfg.contaPadrao, data: isoHoje(), desc: `Fatura ${c.nome} ${lab(Number(d.m))}`, cartao: c.id, fatM: Number(d.m), n: 1 };
      abrir(`<h3>Pagar fatura</h3><p class="small muted b" style="margin:0">${esc(c.nome)} · fatura de ${lab(F.fatM)}. Confira o valor no app do banco.</p>
        <input class="inp inp-big" inputmode="decimal" aria-label="Valor pago" data-fi="valor" value="${esc(F.valor)}">
        <div class="field"><span class="lbl">Pagou com</span><div class="chips">${contasCorrentes().map(x => `<button class="chip" data-act="fatMeio" data-v="${x.id}" aria-pressed="${F.meio === x.id}">${esc(x.nome)}</button>`).join('')}</div></div>
        <button class="btn" data-act="salvarFatura">Marcar como paga</button>`); },
    fatMeio: () => { F.meio = d.v; document.querySelectorAll('[data-act="fatMeio"]').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === d.v)); },
    salvarFatura: () => { const v = num(F.valor); if (v <= 0) { toast('Digite o valor'); return; }
      DB.addLanc({ data: F.data, mes: F.data.slice(0, 7), tipo: 'fatura', valor: v, meio: F.meio, desc: F.desc, cartao: F.cartao, fatM: F.fatM, criado: Date.now() }); fechar(); toast('Fatura paga'); },
    novaParc: () => { F = { k: 'parc', modo: 'novo', desc: '', valor: '', n: '', atual: '1', cartao: S.cfg.cartoes[0]?.id, cat: catsOrdenadas()[0]?.id, todas: false }; folhaParc(); },
    verParc: () => { F = { k: 'parc', modo: 'ver', id: d.id, confirma: false }; folhaParc(); },
    apagarParc: () => { DB.delParc(F.id); fechar(); toast('Compra parcelada apagada'); },
    salvarParc: () => { const v = num(F.valor), n = parseInt(F.n), at = parseInt(F.atual); const c = cartao(F.cartao);
      if (v <= 0 || !n || n < 1 || !at || at < 1 || at > n || !c) { toast('Confira valor, total de parcelas e a parcela atual'); return; }
      DB.addParc({ desc: F.desc.trim() || cat(F.cat).nome, cat: F.cat, cartao: c.id, parcela: v, n, primeira: CUR() - (at - 1), data: isoHoje(), criado: Date.now() });
      fechar(); toast('Parcela cadastrada'); },
    editFixaMes: () => {
      const i = UI.mes, m = mesDoc(i) || mesPadrao(i), f = m.fixas.find(x => x.id === d.id); if (!f) return;
      F = { k: 'form', titulo: f.nome, v: { valorTxt: brl(f.valor), venc: String(f.venc), pago: f.pago ? 'sim' : 'nao', futuro: 'nao' },
        campos: () => [{ k: 'valorTxt', label: `Valor em ${nomeMes(i).toLowerCase()}`, tipo: 'money' }, { k: 'venc', label: 'Dia do vencimento', tipo: 'int' },
          { k: 'pago', label: 'Já pagou?', tipo: 'seg', ops: [['sim', 'Sim'], ['nao', 'Não']] },
          { k: 'futuro', label: 'Vale para os próximos meses?', tipo: 'seg', ops: [['sim', 'Sim, mudou de vez'], ['nao', 'Só neste mês']] }],
        apagar: true, apagarTxt: 'Tirar esta conta deste mês',
        salvar: v => { const nv = num(v.valorTxt), dv = dia(v.venc), pago = v.pago === 'sim';
          const fixas = m.fixas.map(x => { if (x.id !== f.id) return x; const o = { ...x, valor: nv, venc: dv, pago }; if (pago && !x.pago) o.pagoTs = Date.now(); if (!pago) delete o.pagoTs; return o; });
          DB.saveMes(keyOf(i), { ...m, fixas });
          if (v.futuro === 'sim') DB.saveCfg({ ...S.cfg, fixas: S.cfg.fixas.map(x => x.id === f.id ? { ...x, valor: nv, venc: dv } : x) });
          return true; },
        remover: () => DB.saveMes(keyOf(i), { ...m, fixas: m.fixas.filter(x => x.id !== f.id) }) };
      folhaForm(); },
    importar: () => importarParcelas(),
    xlsMes: () => { const m = Number(d.v); F.sel = F.sel.includes(m) ? F.sel.filter(x => x !== m) : [...F.sel, m]; folhaExcel(); },
    xlsParc: () => { F.comParc = !F.comParc; folhaExcel(); },
    xlsImportar: () => importarExcel(),
    impCartao: () => { F.cartao = d.v; folhaImport(); },
    editConta: () => editConta(d.id), editCartao: () => editCartao(d.id), editFixa: () => editFixa(d.id), editCat: () => editCat(d.id),
    formSalvar: () => { if (F.salvar(F.v)) { fechar(); toast('Salvo'); } },
    formApagar: () => { F.remover(); fechar(); toast('Apagado'); },
    backup: () => { const blob = new Blob([JSON.stringify({ cfg: S.cfg, meses: S.meses, lanc: S.lanc, parc: S.parc, exportado: new Date().toISOString() }, null, 2)], { type: 'application/json' });
      const u = URL.createObjectURL(blob); const lk = document.createElement('a'); lk.href = u; lk.download = `dindin-backup-${isoHoje()}.json`; document.body.appendChild(lk); lk.click(); lk.remove(); setTimeout(() => URL.revokeObjectURL(u), 3000); },
    sair: () => DB.sair(),
    lModo: () => { UI.login = { modo: d.v, erro: '', msg: '' }; render(); },
    onbVai: () => { const e = onbValida(); if (e) { toast(e); return; } UI.onb++; render(); window.scrollTo(0, 0); },
    onbVolta: () => { UI.onb--; render(); window.scrollTo(0, 0); },
    onbFim: () => { const e = onbValida(); if (e) { toast(e); return; } onbConcluir(); },
    oSet: () => { const v = d.v === '1'; setPath(UI.O, d.path, v); if (d.path === 'temInvest' && v && !UI.O.invest.length) UI.O.invest.push(NOVOS.invest());
      if (d.path === 'temParc' && v && !UI.O.parc.length) UI.O.parc.push(NOVOS.parc()); render(); },
    oAdd: () => { const it = NOVOS[d.lista](); if (d.nome) { const vazio = UI.O[d.lista].find(x => !x.nome); if (vazio) { vazio.nome = d.nome; render(); return; } it.nome = d.nome; } UI.O[d.lista].push(it); render(); },
    oDel: () => { UI.O[d.lista].splice(+d.k, 1); render(); }
  };
  if (acoes[a]) acoes[a]();
});

document.addEventListener('input', e => {
  const t = e.target, d = t.dataset;
  if (d.fi && F) { F[d.fi] = t.value; if (F.k === 'lanc' && d.fi === 'data' && t.value && !F.compManual) F.comp = compPadrao(t.value); if (F.k === 'lanc') atualizarInfo(); if (F.k === 'wiz') { const r = document.getElementById('resto'); if (r) { r.innerHTML = htmlResto(); r.style.setProperty('--r', corResto()); } } }
  if (d.fvIn && F) F.v[d.fvIn] = t.value;
  if (d.o && UI.O) setPath(UI.O, d.o, t.value);
  if (d.plan && F) { F.plan[d.plan] = t.value; const r = document.getElementById('resto'); if (r) { r.innerHTML = htmlResto(); r.style.setProperty('--r', corResto()); } }
  if (d.wfixa && F) { F.fixas[+d.wfixa].valor = t.value; const el = document.getElementById('totFixas'); if (el) el.textContent = fmt(soma(F.fixas, f => num(f.valor))); }
  if (d.sim === 'total') { UI.sim.total = t.value; const sr = simResultado(); document.getElementById('simArea').innerHTML = sr.html + barras(CUR(), 11, sr.extra); }
});
document.addEventListener('change', e => {
  const t = e.target, d = t.dataset;
  if (d.fs && F) { F[d.fs] = Number(t.value); atualizarInfo(); }
  if (d.fi === 'data' && F?.k === 'lanc' && t.value) reabrir();
  if (t.id === 'fImport' && t.files?.[0]) lerImport(t.files[0]);
  if (t.id === 'fExcel' && t.files?.[0]) lerExcel(t.files[0]);
  if (d.virada) { DB.saveCfg({ ...S.cfg, diaVirada: dia(t.value) }); toast('Salvo'); }
  if (d.sim === 'n') { UI.sim.n = Number(t.value); const sr = simResultado(); document.getElementById('simArea').innerHTML = sr.html + barras(CUR(), 11, sr.extra); }
  if (d.teto) { DB.saveCfg({ ...S.cfg, teto: { ...S.cfg.teto, [d.teto]: num(t.value) } }); toast('Teto atualizado'); }
  if (d.cfg) { S.cfg[d.cfg] = t.value.trim(); DB.saveCfg({ ...S.cfg }); }
  if (d.o && UI.O) setPath(UI.O, d.o, t.value);
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'formLogin') return; e.preventDefault();
  const email = document.getElementById('lEmail').value.trim(), senha = document.getElementById('lSenha')?.value || '';
  const L = UI.login; L.erro = ''; L.msg = '';
  const msgs = { 'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'Senha incorreta.', 'auth/user-not-found': 'Não achei esse e-mail. Quer criar a conta?',
    'auth/email-already-in-use': 'Esse e-mail já tem conta. Toque em “Já tenho conta”.', 'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
    'auth/invalid-email': 'Esse e-mail parece incompleto.', 'auth/network-request-failed': 'Sem internet. Tente de novo.', 'auth/too-many-requests': 'Muitas tentativas. Espere um pouco.' };
  try {
    if (L.modo === 'entrar') await DB.auth.entrar(email, senha);
    else if (L.modo === 'criar') await DB.auth.criar(email, senha);
    else { await DB.auth.resetar(email); L.msg = 'Pronto! Veja seu e-mail (e a caixa de spam) para criar uma senha nova.'; render(); }
  } catch (err) { L.erro = msgs[err.code] || 'Não deu certo: ' + (err.code || err.message); render(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && F) fechar(); });

/* ---------- partida ---------- */
(async function iniciar() {
  try {
    DB = CONFIG_OK ? await dbFirebase() : dbLocal();
    await DB.iniciar();
  } catch (err) {
    console.error(err);
    document.getElementById('app').innerHTML = `<div class="login"><div class="logo">${porquinho(96)}<b>Ops</b><span>Não consegui abrir o DinDin. Confira a internet e abra de novo.</span></div></div>`;
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('./sw.js').catch(() => {});
})();
// virada de mês com o app aberto
setInterval(() => { if (S.cfg && UI.mes === CUR() - 1 && !F) { UI.mes = CUR(); render(); } }, 60000);
