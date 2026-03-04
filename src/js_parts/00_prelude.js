/* Você pode salvar este conteúdo em um arquivo chamado, por exemplo, script.js */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
// IMPORTADO 'update'
import { getDatabase, ref, set, push, onValue, remove, get, query, orderByChild, equalTo, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  
  apiKey: "AIzaSyCPNd9INqIfqG1-rjaYAlz988RLDZvL528", 
  authDomain: "hells-angels-438c2.firebaseapp.com",
  databaseURL: "https://hells-angels-438c2-default-rtdb.firebaseio.com/",
  projectId: "hells-angels-438c2",
  storageBucket: "hells-angels-438c2.firebasestorage.app",
  messagingSenderId: "429406215315",
  appId: "1:429406215315:web:96b68b172247824b308166",
  measurementId: "G-CR415MEY32"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

let vendas = [];
let vendaEmEdicaoId = null;
let vendaOriginalRegistradoPor = null;
let vendaOriginalRegistradoPorId = null;
let vendaOriginalTimestamp = null;
let vendaOriginalDataHora = null;
let vendaOriginalDossierOrg = null; 

// NOVAS VARIÁVEIS GLOBAIS PARA SINCRONIZAÇÃO
let vendaOriginalCliente = null;
let vendaOriginalOrganizacao = null;

let currentUser = null;
let currentUserData = null; 

// NOVO: Variável global para armazenar o status online de todos os usuários
let globalOnlineStatus = {}; 

let globalAllOrgs = []; 
let globalCurrentPeople = [];
let sortableInstance = null; 
let orgSortableInstance = null; 

// --- NOVO (Gerenciador de Veículos) ---
// Armazena temporariamente os veículos ao editar/adicionar um modal
let tempVeiculos = {};
// Armazena a chave do veículo sendo editado no modal
let veiculoEmEdicaoKey = null; 
// --- FIM ---

// --- CATÁLOGO (configurável pelo Admin via Firebase) ---
// Defaults (fallback) caso não exista configuração no banco
const defaultPerUnit = {
  tickets: { dinheiro_sujo: 525 },
  tablets: { cobre: 20, plastico: 40, fita_adesiva: 2, lixo_eletronico: 2 },
  nitro: { aluminio: 20, cobre: 20, vidro: 45, fita_adesiva: 1, porca: 1, parafuso: 1 }
};

const defaultValores = {
  tablets: { limpo: 17000, sujo: 20000, limpo_alianca: 15000, sujo_alianca: 18000 },
  tickets: { limpo: 9800, sujo: 11700, limpo_alianca: 8000, sujo_alianca: 10000 },
  nitro: { limpo: 42500, sujo: 50000, limpo_alianca: 38000, sujo_alianca: 45000 }
};


// Labels (nome amigável do produto) - opcional
const defaultLabels = {
  tickets: 'Tickets',
  tablets: 'Tablets',
  nitro: 'Nitro'
};

// Runtime (o app usa estes objetos)
let perUnit = structuredClone(defaultPerUnit);
let valores = structuredClone(defaultValores);
let productLabels = structuredClone(defaultLabels);

const sanitizeNumber = (v, fallback = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const deepMergeCatalog = (base, patch) => {
  const out = structuredClone(base);
  if (!patch || typeof patch !== 'object') return out;

  Object.keys(patch).forEach(k => {
    const pv = patch[k];
    if (pv && typeof pv === 'object' && !Array.isArray(pv)) {
      out[k] = out[k] && typeof out[k] === 'object' ? deepMergeCatalog(out[k], pv) : structuredClone(pv);
    } else {
      out[k] = pv;
    }
  });
  return out;
};

const normalizeCatalogConfig = (raw) => {
  // Estrutura esperada: { perUnit: {...}, valores: {...} }
  const merged = deepMergeCatalog({ perUnit: defaultPerUnit, valores: defaultValores }, raw || {});
  // Força números em todas as folhas
  const toNumbers = (obj) => {
    const out = {};
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = toNumbers(v);
      else out[k] = sanitizeNumber(v, 0);
    });
    return out;
  };
  const labelsMerged = deepMergeCatalog(defaultLabels, (raw && (raw.labels || raw.nomes || raw.labelsMap)) || {});
  const labels = {};
  Object.entries(labelsMerged || {}).forEach(([k,v]) => { labels[k] = String(v ?? '').trim(); });
  return {
    perUnit: toNumbers(merged.perUnit),
    valores: toNumbers(merged.valores),
    labels,
  };
};

const applyCatalogConfig = (raw) => {
  const cfg = normalizeCatalogConfig(raw);
  perUnit = cfg.perUnit;
  valores = cfg.valores;
  productLabels = cfg.labels || {};
  // Notifica outras partes do app que o catálogo mudou
  document.dispatchEvent(new CustomEvent('catalogUpdated'));
};

// Notifica outras partes do app que o catálogo mudou (ex.: renderização dinâmica de produtos)
document.dispatchEvent(new CustomEvent('catalogUpdated'));


const listenCatalogConfig = () => {
  // Atualiza em tempo real para todos os usuários
  const cfgRef = ref(db, 'config/catalog');
  onValue(cfgRef, (snap) => {
    applyCatalogConfig(snap.exists() ? snap.val() : null);
  });
};
// --- FIM CATÁLOGO ---

const valorDescricao = {
    'limpo': 'Dinheiro Limpo',
    'sujo': 'Dinheiro Sujo',
    'limpo_alianca': 'Limpo (Aliança)',
    'sujo_alianca': 'Sujo (Aliança)'
};

const logoLightModeSrc = "logo-dark.png";
const logoDarkModeSrc = "logo-dark.png";
const historyBackgroundSrc = "logo-dark.png";
const welcomeLogoSrc = "logo-dark.png";

const els = {
  qtyTickets: document.getElementById('qtyTickets'),
  qtyTablets: document.getElementById('qtyTablets'),
  qtyNitro: document.getElementById('qtyNitro'),
  productsContainer: document.getElementById('productsContainer'),
  tipoValor: document.getElementById('tipoValor'),
  nomeCliente: document.getElementById('nomeCliente'),
  organizacao: document.getElementById('organizacao'),
  organizacaoTipo: document.getElementById('organizacaoTipo'),
  telefone: document.getElementById('telefone'),
  carroVeiculo: document.getElementById('carroVeiculo'), 
  placaVeiculo: document.getElementById('placaVeiculo'),
  negociadoras: document.getElementById('negociadoras'),
  vendaValorObs: document.getElementById('vendaValorObs'),
  dataVenda: document.getElementById('dataVenda'),
  filtroHistorico: document.getElementById('filtroHistorico'),
  resultsBody: document.getElementById('resultsBody'),
  valuesBody: document.getElementById('valuesBody'),
  valorTotalGeral: document.getElementById('valorTotalGeral'),
  results: document.getElementById('results'),
  mainCard: document.getElementById('mainCard'),
  historyCard: document.getElementById('historyCard'),
  salesHistory: document.getElementById('salesHistory'),
  calcBtn: document.getElementById('calcBtn'),
  resetBtn: document.getElementById('resetBtn'),
  registerBtn: document.getElementById('registerBtn'),
  toggleHistoryBtn: document.getElementById('toggleHistoryBtn'),
  toggleCalcBtn: document.getElementById('toggleCalcBtn'),
  clearHistoryBtn: document.getElementById('clearHistoryBtn'),
  csvBtn: document.getElementById('csvBtn'),
  discordBtnCalc: document.getElementById('discordBtnCalc'),
  themeBtn: document.getElementById('themeBtn'),
  tutorialBtn: document.getElementById('tutorialBtn'),
  logoLink: document.getElementById('logoLink'),
  appLogo: document.getElementById('appLogo'),
  historyImg: document.getElementById('historyImg'),
  welcomeScreen: document.getElementById('welcomeScreen'),
  enterBtn: document.getElementById('enterBtn'),
  welcomeLogo: document.getElementById('welcomeLogo'),
  authScreen: document.getElementById('authScreen'),
  username: document.getElementById('username'),
  password: document.getElementById('password'),
  loginBtn: document.getElementById('loginBtn'),
  registerUserBtn: document.getElementById('registerUserBtn'),
  authMessage: document.getElementById('authMessage'),
  logoutBtn: document.getElementById('logoutBtn'),
  mainTitle: document.getElementById('mainTitle'),
  forgotPasswordLink: document.getElementById('forgotPasswordLink'),
  
  adminPanelBtn: document.getElementById('adminPanelBtn'),
  adminPanel: document.getElementById('adminPanel'),
  adminUserListBody: document.getElementById('adminUserListBody'),
  toggleCalcBtnAdmin: document.getElementById('toggleCalcBtnAdmin'), 
  
  // --- Novos Elementos Admin
  onlineUsersCount: document.getElementById('onlineUsersCount'),
  layoutToggleNightMode: document.getElementById('layoutToggleNightMode'),
  layoutToggleBottomPanel: document.getElementById('layoutToggleBottomPanel'),
  bottomPanelText: document.getElementById('bottomPanelText'),
  saveBottomPanelTextBtn: document.getElementById('saveBottomPanelTextBtn'),
  bottomPanelDisplay: document.getElementById('bottomPanelDisplay'), // O <span> no rodapé
  // --- Fim Novos Elementos Admin
  
  bottomPanel: document.getElementById('bottomPanel'),
  userStatus: document.getElementById('userStatus'),
  
  investigacaoBtn: document.getElementById('investigacaoBtn'),
  dossierCard: document.getElementById('dossierCard'),
  toggleCalcBtnDossier: document.getElementById('toggleCalcBtnDossier'),
  
  dossierOrgContainer: document.getElementById('dossierOrgContainer'),
  filtroDossierOrgs: document.getElementById('filtroDossierOrgs'),
  addOrgBtn: document.getElementById('addOrgBtn'),
  dossierOrgGrid: document.getElementById('dossierOrgGrid'),
  
  dossierPeopleContainer: document.getElementById('dossierPeopleContainer'),
  dossierPeopleTitle: document.getElementById('dossierPeopleTitle'),
  dossierVoltarBtn: document.getElementById('dossierVoltarBtn'),
  filtroDossierPeople: document.getElementById('filtroDossierPeople'),
  addPessoaBtn: document.getElementById('addPessoaBtn'),
  dossierPeopleGrid: document.getElementById('dossierPeopleGrid'),
  
  migrateDossierBtn: document.getElementById('migrateDossierBtn'),
  migrateVeiculosBtn: document.getElementById('migrateVeiculosBtn'), 
  
  editDossierOverlay: document.getElementById('editDossierOverlay'),
  editDossierModal: document.getElementById('editDossierModal'),
  editDossierOrg: document.getElementById('editDossierOrg'),
  editDossierId: document.getElementById('editDossierId'),
  editDossierNome: document.getElementById('editDossierNome'),
  editDossierNumero: document.getElementById('editDossierNumero'),
  editDossierCargo: document.getElementById('editDossierCargo'),
  editDossierFotoUrl: document.getElementById('editDossierFotoUrl'),
  editDossierInstagram: document.getElementById('editDossierInstagram'), 
  saveDossierBtn: document.getElementById('saveDossierBtn'),
  cancelDossierBtn: document.getElementById('cancelDossierBtn'),
  
  // -- Novos elementos (Modal Editar)
  editModalCarroNome: document.getElementById('editModalCarroNome'),
  editModalCarroPlaca: document.getElementById('editModalCarroPlaca'),
  editModalCarroFoto: document.getElementById('editModalCarroFoto'), 
  editModalAddVeiculoBtn: document.getElementById('editModalAddVeiculoBtn'),
  editModalCancelVeiculoBtn: document.getElementById('editModalCancelVeiculoBtn'), 
  editModalListaVeiculos: document.getElementById('editModalListaVeiculos'),
  
  addDossierOverlay: document.getElementById('addDossierOverlay'),
  addDossierModal: document.getElementById('addDossierModal'),
  addDossierOrganizacao: document.getElementById('addDossierOrganizacao'),
  addDossierNome: document.getElementById('addDossierNome'),
  addDossierNumero: document.getElementById('addDossierNumero'),
  addDossierCargo: document.getElementById('addDossierCargo'),
  addDossierFotoUrl: document.getElementById('addDossierFotoUrl'),
  saveNewDossierBtn: document.getElementById('saveNewDossierBtn'),
  cancelNewDossierBtn: document.getElementById('cancelNewDossierBtn'),

  // -- Novos elementos (Modal Adicionar)
  addModalCarroNome: document.getElementById('addModalCarroNome'),
  addModalCarroPlaca: document.getElementById('addModalCarroPlaca'),
  addModalCarroFoto: document.getElementById('addModalCarroFoto'), 
  addModalAddVeiculoBtn: document.getElementById('addModalAddVeiculoBtn'),
  addModalCancelVeiculoBtn: document.getElementById('addModalCancelVeiculoBtn'), 
  addModalListaVeiculos: document.getElementById('addModalListaVeiculos'),
  
  orgModalOverlay: document.getElementById('orgModalOverlay'),
  orgModal: document.getElementById('orgModal'),
  orgModalTitle: document.getElementById('orgModalTitle'),
  editOrgId: document.getElementById('editOrgId'),
  orgNome: document.getElementById('orgNome'),
  orgFotoUrl: document.getElementById('orgFotoUrl'),
  orgInfo: document.getElementById('orgInfo'),
  saveOrgBtn: document.getElementById('saveOrgBtn'),
  cancelOrgBtn: document.getElementById('cancelOrgBtn'),
  deleteOrgBtn: document.getElementById('deleteOrgBtn'),
  
  // --- NOVOS ELEMENTOS DO LIGHTBOX ---
  imageLightboxOverlay: document.getElementById('imageLightboxOverlay'),
  imageLightboxModal: document.getElementById('imageLightboxModal'),
  lightboxImg: document.getElementById('lightboxImg'),

  // --- CATÁLOGO (Admin) ---
  catalogConfigTextarea: document.getElementById('catalogConfigTextarea'),
  catalogLoadBtn: document.getElementById('catalogLoadBtn'),
  catalogSaveBtn: document.getElementById('catalogSaveBtn'),
  catalogResetBtn: document.getElementById('catalogResetBtn'),
  catalogOpenEditorBtn: document.getElementById('catalogOpenEditorBtn')

};

