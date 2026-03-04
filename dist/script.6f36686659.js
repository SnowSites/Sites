import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, sendPasswordResetEmail, signInWithEmailAndPassword, createUserWithEmailAndPassword, updateProfile, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase, ref, set, push, onValue, remove, get, query, orderByChild, equalTo, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjKWhZpPwOz1nI548I8wL6Fk5IH8HdUZg",
  authDomain: "testesite-4f796.firebaseapp.com",
  databaseURL: "https://testesite-4f796-default-rtdb.firebaseio.com/",
  projectId: "testesite-4f796",
  storageBucket: "testesite-4f796.firebasestorage.app",
  messagingSenderId: "1037607207129",
  appId: "1:1037607207129:web:8da88751d63e426c517ec8",
  measurementId: "G-GQ95GG323R"
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

let vendaOriginalCliente = null;
let vendaOriginalOrganizacao = null;

let currentUser = null;
let currentUserData = null;

let globalOnlineStatus = {};

let globalAllOrgs = [];
let globalCurrentPeople = [];
let sortableInstance = null;
let orgSortableInstance = null;

let tempVeiculos = {};
let veiculoEmEdicaoKey = null;

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

const defaultLabels = {
  tickets: 'Tickets',
  tablets: 'Tablets',
  nitro: 'Nitro'
};

let perUnit = structuredClone(defaultPerUnit);
let valores = structuredClone(defaultValores);
let productLabels = structuredClone(defaultLabels);



// === Usuários: busca por nome (autocomplete) ===
function normalizeUserName(name) {
  return (name || '')
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 \-]/g, '');
}

let __usersPublicCache = null;
let __usersPublicLoadedAt = 0;
let __nameToUid = new Map();

async function loadUsersPublicOnce() {
  const now = Date.now();
  if (__usersPublicCache && (now - __usersPublicLoadedAt) < 2 * 60 * 1000) return __usersPublicCache; // 2 min
  try {
    const snap = await get(ref(db, 'usuariosPublic'));
    const obj = snap.exists() ? snap.val() : {};
    const arr = Object.keys(obj || {}).map(uid => ({ uid, ...(obj[uid]||{}) }));
    __usersPublicCache = arr;
    __usersPublicLoadedAt = now;
    __nameToUid = new Map();
    arr.forEach(u => {
      const dn = (u.displayName || u.nome || u.name || '').toString().trim();
      if (dn) __nameToUid.set(normalizeUserName(dn), u.uid);
    });
    return arr;
  } catch(e) {
    console.warn('loadUsersPublicOnce failed', e);
    __usersPublicCache = [];
    __usersPublicLoadedAt = now;
    __nameToUid = new Map();
    return __usersPublicCache;
  }
}

async function uidFromUserName(name) {
  const key = normalizeUserName(name);
  if (!key) return null;
  if (!__usersPublicCache) await loadUsersPublicOnce();
  return __nameToUid.get(key) || null;
}

// === Tags (índice para não precisar de UID na UI) ===
function normalizeTag(tag) {
  return (tag || '')
    .toString()
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_\-]/g, '');
}

// === Autocomplete de usuários por TAG/NOME (via índice tags/) ===
let __allTagsCache = null;
let __allTagsLoadedAt = 0;


/* removed duplicate loadUsersPublicOnce */
function setupUserNameAutocomplete(inputEl, datalistEl) {
  if (!inputEl || !datalistEl) return;
  let lastQ = '';
  let debounce = null;

  inputEl.addEventListener('input', () => {
    const qRaw = inputEl.value || '';
    const q = normalizeTag(qRaw);
    if (!q || q.length < 2) {
      datalistEl.innerHTML = '';
      lastQ = q;
      return;
    }
    lastQ = q;
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      const users = await loadUsersPublicOnce();
      const qn = normalizeUserName(qRaw);
      const matches = users
        .filter(u => normalizeUserName(u.displayName || u.nome || u.name || '').includes(qn))
        .slice(0, 12)
        .map(u => (u.displayName || u.nome || u.name || '').toString().trim())
        .filter(Boolean);

      datalistEl.innerHTML = matches.map(n => `<option value="${n}"></option>`).join('');
    }, 120);
  });

  // ao focar, puxa cache
  inputEl.addEventListener('focus', () => { loadUsersPublicOnce(); });
}

async function uidFromTag(tag) {
  const t = normalizeTag(tag);
  if (!t) return null;
  try {
    const snap = await get(ref(db, `tags/${t}`));
    return snap.exists() ? String(snap.val()) : null;
  } catch (e) {
    console.warn('uidFromTag failed', e);
    return null;
  }
}
async function ensureTagIndex(uid, displayName) {
  const t = normalizeTag(displayName);
  if (!t) return;
  try {
    const snap = await get(ref(db, `tags/${t}`));
    if (!snap.exists() || String(snap.val()) === String(uid)) {
      await set(ref(db, `tags/${t}`), uid);
    }
  } catch(e) {
    console.warn('ensureTagIndex failed', e);
  }
}

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
  const merged = deepMergeCatalog({ perUnit: defaultPerUnit, valores: defaultValores }, raw || {});
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
  document.dispatchEvent(new CustomEvent('catalogUpdated'));
};

document.dispatchEvent(new CustomEvent('catalogUpdated'));

const listenCatalogConfig = () => {
  const cfgRef = ref(db, 'config/catalog');
  onValue(cfgRef, (snap) => {
    applyCatalogConfig(snap.exists() ? snap.val() : null);
  });
};

const valorDescricao = {
    'limpo': 'Dinheiro Limpo',
    'sujo': 'Dinheiro Sujo',
    'limpo_alianca': 'Limpo (Aliança)',
    'sujo_alianca': 'Sujo (Aliança)'
};

const logoLightModeSrc = "assets/img/logo-dark.png";
const logoDarkModeSrc = "assets/img/logo-dark.png";
const historyBackgroundSrc = "assets/img/logo-dark.png";
const welcomeLogoSrc = "assets/img/logo-dark.png";

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

  onlineUsersCount: document.getElementById('onlineUsersCount'),
  layoutToggleNightMode: document.getElementById('layoutToggleNightMode'),
  layoutToggleBottomPanel: document.getElementById('layoutToggleBottomPanel'),
  bottomPanelText: document.getElementById('bottomPanelText'),
  saveBottomPanelTextBtn: document.getElementById('saveBottomPanelTextBtn'),
  bottomPanelDisplay: document.getElementById('bottomPanelDisplay'), // O <span> no rodapé

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

  imageLightboxOverlay: document.getElementById('imageLightboxOverlay'),
  imageLightboxModal: document.getElementById('imageLightboxModal'),
  lightboxImg: document.getElementById('lightboxImg'),

  catalogConfigTextarea: document.getElementById('catalogConfigTextarea'),
  catalogLoadBtn: document.getElementById('catalogLoadBtn'),
  catalogSaveBtn: document.getElementById('catalogSaveBtn'),
  catalogResetBtn: document.getElementById('catalogResetBtn'),
  catalogOpenEditorBtn: document.getElementById('catalogOpenEditorBtn'),


    leaderPanelBtn: document.getElementById('leaderPanelBtn'),
    hierarquiaBtn: document.getElementById('hierarquiaBtn'),
    leaderPanel: document.getElementById('leaderPanel'),
    leaderReloadMembersBtn: document.getElementById('leaderReloadMembersBtn'),
    leaderMembersTbody: document.getElementById('leaderMembersTbody'),
    leaderReloadCargosBtn: document.getElementById('leaderReloadCargosBtn'),
    cargosEditorContainer: document.getElementById('cargosEditorContainer'),
    saveCargosBtn: document.getElementById('saveCargosBtn'),
    leaderBackBtn: document.getElementById('leaderBackBtn'),
    leaderFaccaoLabel: document.getElementById('leaderFaccaoLabel'),
    newCargoName: document.getElementById('newCargoName'),
    addCargoBtn: document.getElementById('addCargoBtn'),
    hierarquiaCard: document.getElementById('hierarquiaCard'),
    hierarquiaContent: document.getElementById('hierarquiaContent'),
    hierarquiaBackBtn: document.getElementById('hierarquiaBackBtn'),

    adminNewFaccaoId: document.getElementById('adminNewFaccaoId'),
    adminNewFaccaoNome: document.getElementById('adminNewFaccaoNome'),
    adminCreateFaccaoBtn: document.getElementById('adminCreateFaccaoBtn'),
    adminSetUserUid: document.getElementById('adminSetUserUid'),
    adminSetUserFaccao: document.getElementById('adminSetUserFaccao'),
    adminSetUserCargo: document.getElementById('adminSetUserCargo'),
    adminApplyUserFaccaoBtn: document.getElementById('adminApplyUserFaccaoBtn'),
    adminReloadFaccoesBtn: document.getElementById('adminReloadFaccoesBtn'),
    adminFaccoesTbody: document.getElementById('adminFaccoesTbody'),
    adminNewFaccaoLeaderTag: document.getElementById('adminNewFaccaoLeaderTag'),
    adminFaccaoMembersBox: document.getElementById('adminFaccaoMembersBox'),
    adminReloadRankingBtn: document.getElementById('adminReloadRankingBtn'),
    adminRankingTbody: document.getElementById('adminRankingTbody'),
    leaderAddMemberTag: document.getElementById('leaderAddMemberTag'),
    leaderAddMemberCargo: document.getElementById('leaderAddMemberCargo'),
    leaderAddMemberBtn: document.getElementById('leaderAddMemberBtn'),

    leaderAddMemberNome: document.getElementById('leaderAddMemberNome'),
    adminFaccaoNome: document.getElementById('adminFaccaoNome'),
    adminFaccaoTag: document.getElementById('adminFaccaoTag'),
    adminFaccaoLiderNome: document.getElementById('adminFaccaoLiderNome'),
    adminOnlineList: document.getElementById('adminOnlineList'),

    adminUserSearch: document.getElementById('adminUserSearch'),
    adminReloadUsersBtn: document.getElementById('adminReloadUsersBtn'),
    adminSelectedUserName: document.getElementById('adminSelectedUserName'),
    adminSelectedUserUid: document.getElementById('adminSelectedUserUid'),
    adminSetUserFaccaoId: document.getElementById('adminSetUserFaccaoId'),
    adminApplyUserToFaccaoBtn: document.getElementById('adminApplyUserToFaccaoBtn'),
    adminMakeAdminBtn: document.getElementById('adminMakeAdminBtn'),
    adminMakeUserBtn: document.getElementById('adminMakeUserBtn'),
    adminUsersTbody: document.getElementById('adminUsersTbody'),
    adminReloadLogsBtn: document.getElementById('adminReloadLogsBtn'),
    adminClearLogsBtn: document.getElementById('adminClearLogsBtn'),
    adminLogsBox: document.getElementById('adminLogsBox'),
    adminBackupFaccaoId: document.getElementById('adminBackupFaccaoId'),
    adminDownloadBackupBtn: document.getElementById('adminDownloadBackupBtn'),

    homeBtn: document.getElementById('homeBtn'),
};

// === App Router (fallback) ===
window.App = window.App || {
  state: { currentView: 'main', role: 'user', faccaoId: null, faccaoCargo: null, perms: {} },
  canAccess(viewName) { return true; },
  navigate(viewName) {
    const next = viewName || 'main';
    try { if (typeof toggleView === 'function') toggleView(next); } catch(e) {}
    this.state.currentView = next;
  }
};


// Setup autocomplete (TAG)
try {
  const dl = document.getElementById('userNameSuggestions');
  if (els.leaderAddMemberNome) setupUserNameAutocomplete(els.leaderAddMemberNome, dl);
  if (els.adminNewFaccaoLeaderTag) setupUserNameAutocomplete(els.adminNewFaccaoLeaderTag, dl);
} catch(e) { console.warn('autocomplete init failed', e); }


// === Facções (1 facção por usuário) ===
function getFaccaoId() {
  try { return (App && App.state && App.state.faccaoId) ? App.state.faccaoId : null; } catch(e) { return null; }
}
function getFaccaoPath(base) {
  const nome = (els.adminFaccaoNome && els.adminFaccaoNome.value) ? els.adminFaccaoNome.value.trim() : '';
  const tag = (els.adminFaccaoTag && els.adminFaccaoTag.value) ? normalizeTag(els.adminFaccaoTag.value) : '';
  const fid = normalizeTag(tag || nome).toLowerCase();

                if (nome.includes(queryLower)) {
                    results.push({
                        ...person,
                        id: personId,
                        org: orgKey
                    });
                }
            }
        }
    } catch (error) {
        if(error.code !== "PERMISSION_DENIED") {
            console.error("Erro na busca global de pessoas:", error);
        }
    }
    return results;
};

const parseAndMergeVeiculos = (vendaData, existingVeiculos = {}) => {
    const carros = (vendaData.carro || '').split(',').map(c => c.trim());
    const placas = (vendaData.placas || '').split(',').map(p => p.trim());
    const maxLen = Math.max(carros.length, placas.length);

    const merged = { ...existingVeiculos };

    for (let i = 0; i < maxLen; i++) {
        const carro = carros[i] || 'N/A';
        const placa = placas[i] || '';

        if (placa) {
            if (!merged[placa]) {
                merged[placa] = { carro: carro, placa: placa, fotoUrl: '' };
            } else if (carro !== 'N/A' && merged[placa].carro === 'N/A') {
                merged[placa].carro = carro;
            }
        } else if (carro !== 'N/A') {
            const tempKey = `venda_${Date.now()}_${i}`;
            merged[tempKey] = { carro: carro, placa: '', fotoUrl: '' };
        }
    }
    return merged;
};

const addDossierEntry = async (vendaData, dadosAntigos = null) => {
    const org = vendaData.organizacao.trim();
    const nome = vendaData.cliente.trim();

    if (!org || !nome) {
        console.warn("addDossierEntry: Org ou Nome faltando. Saindo.");
        return;
    }

    const orgRef = ref(db, `${getFaccaoPath('organizacoes')}/org`);
    get(orgRef).then(snapshot => {
        if (!snapshot.exists()) {
            set(orgRef, {
                nome: org,
                fotoUrl: '',
                info: 'Base registrada automaticamente via Venda.',
                ordemIndex: 9999
            });
        }
    });

    const dossierQuery = query(ref(db, `${getFaccaoPath('dossies')}/org`), orderByChild('nome'), equalTo(nome));

    try {
        const snapshot = await get(dossierQuery);

        if (snapshot.exists()) {
            let existingEntryId;
            let existingEntryData;
            snapshot.forEach(child => {
                existingEntryId = child.key;
                existingEntryData = child.val();
            });

            const updates = {};

            updates.numero = vendaData.telefone || existingEntryData.numero;
            updates.cargo = vendaData.vendaValorObs || existingEntryData.cargo;
            updates.data = vendaData.dataHora;

            const baseVeiculos = (dadosAntigos ? dadosAntigos.veiculos : existingEntryData.veiculos) || {};
            updates.veiculos = parseAndMergeVeiculos(vendaData, baseVeiculos);

            if (dadosAntigos) {
                updates.fotoUrl = dadosAntigos.fotoUrl || existingEntryData.fotoUrl || '';
                updates.instagram = dadosAntigos.instagram || existingEntryData.instagram || '';
                updates.hierarquiaIndex = dadosAntigos.hierarquiaIndex !== undefined ? dadosAntigos.hierarquiaIndex : (existingEntryData.hierarquiaIndex !== undefined ? existingEntryData.hierarquiaIndex : 9999);
            }

            const updateRef = ref(db, `${getFaccaoPath('dossies')}/${org}/${existingEntryId}`);
            await update(updateRef, updates);

        } else {
            const dossierEntry = { ...dadosAntigos };

            dossierEntry.nome = vendaData.cliente;
            dossierEntry.numero = vendaData.telefone;
            dossierEntry.organizacao = org;
            dossierEntry.cargo = vendaData.vendaValorObs || 'N/A';
            dossierEntry.data = vendaData.dataHora;

            dossierEntry.veiculos = parseAndMergeVeiculos(vendaData, (dadosAntigos ? dadosAntigos.veiculos : {}));

            dossierEntry.fotoUrl = dossierEntry.fotoUrl || '';
            dossierEntry.instagram = dossierEntry.instagram || '';
            dossierEntry.hierarquiaIndex = dossierEntry.hierarquiaIndex !== undefined ? dossierEntry.hierarquiaIndex : 9999;

            await push(ref(db, `${getFaccaoPath('dossies')}/org`), dossierEntry);
        }
    } catch (err) {
        console.error("Erro ao adicionar/atualizar dossiê:", err);
        if(err.code !== "PERMISSION_DENIED") {
            showToast(`Erro ao sincronizar dossiê: ${err.message}`, "error");
        }
    }
};

const updateDossierEntryOnEdit = async (oldNome, oldOrg, newVendaData) => {
    const newOrg = newVendaData.organizacao.trim();
    const newNome = newVendaData.cliente.trim();

    if (!oldOrg || !oldNome || !newOrg || !newNome) {
        console.warn("UpdateDossier: Faltando dados originais ou novos.");
        return;
    }

    const dossierQuery = query(ref(db, `${getFaccaoPath('dossies')}/oldOrg`), orderByChild('nome'), equalTo(oldNome));

    try {
        const snapshot = await get(dossierQuery);

        if (!snapshot.exists()) {
            const globalEntry = await findDossierEntryGlobal(newNome);

            let dadosAntigos = null;
            if (globalEntry && globalEntry.oldOrg !== newOrg) {
                dadosAntigos = globalEntry.personData;
                await remove(ref(db, `${getFaccaoPath('dossies')}/${globalEntry.oldOrg}/${globalEntry.personId}`));
                showToast(`"${newNome}" movido de "${globalEntry.oldOrg}" para "${newOrg}".`, "default", 4000);
            }

            addDossierEntry(newVendaData, dadosAntigos);
            return;
        }

        let existingEntryId;
        let existingEntryData;
        snapshot.forEach(child => {
            existingEntryId = child.key;
            existingEntryData = child.val();
        });

        const newDossierData = {
            ...existingEntryData,
            nome: newVendaData.cliente,
            numero: newVendaData.telefone,
            organizacao: newVendaData.organizacao,
            cargo: newVendaData.vendaValorObs || 'N/A',
            data: newVendaData.dataHora,
            veiculos: parseAndMergeVeiculos(newVendaData, existingEntryData.veiculos || {}),
        };

        if (oldOrg === newOrg) {
            const updateRef = ref(db, `${getFaccaoPath('dossies')}/${newOrg}/${existingEntryId}`);
            await set(updateRef, newDossierData);
        } else {
            await remove(ref(db, `${getFaccaoPath('dossies')}/${oldOrg}/${existingEntryId}`));
            addDossierEntry(newVendaData, existingEntryData);
        }

    } catch (err) {
        console.error("Erro ao sincronizar edição da venda com dossiê:", err);
        if(err.code !== "PERMISSION_DENIED") {
            showToast(`Erro ao sincronizar dossiê: ${err.message}`, "error");
        }
    }
};

const autoFillFromDossier = async () => {
    if (vendaEmEdicaoId) return;

    const nome = els.nomeCliente.value.trim();

    if (!nome) return;

    try {
        const foundEntry = await findDossierEntryGlobal(nome);

        if (foundEntry && foundEntry.personData) {
            const data = foundEntry.personData;
            const orgBase = foundEntry.oldOrg;

            els.telefone.value = data.numero || '';
            els.vendaValorObs.value = data.cargo || '';

            if (orgBase.toUpperCase() === 'CPF') {
                els.organizacaoTipo.value = 'CPF';
                els.organizacao.value = '';
            } else if (orgBase.toUpperCase() === 'OUTROS') {
                els.organizacaoTipo.value = 'OUTROS';
                els.organizacao.value = '';
            } else {
                els.organizacaoTipo.value = 'CNPJ';
                els.organizacao.value = orgBase;
            }

            showToast(`Dados de "${nome}" preenchidos do dossiê.`, "success");
        }

    } catch (error) {
        if(error.code !== "PERMISSION_DENIED") {
            console.error("Erro ao tentar auto-preencher:", error);
            showToast("Erro ao buscar dados do dossiê.", "error");
        }
    }
};

const registerVenda = async () => {
  const { qtyByProduct, qtyTickets, qtyTablets, qtyNitro, totalValue, tipoValor, hasQuantities } = calculate();
  if (!hasQuantities) {
    showToast("É necessário calcular a venda antes de registrar.", "error");
    return;
  }
  if (!validateFields()) {
      showToast("Preencha os campos obrigatórios (marcados em vermelho).", "error");
      return;
  }
  if (!currentUser || !currentUser.displayName) {
      showToast("Erro: Usuário não autenticado.", "error");
      return;
  }

  const carro = els.carroVeiculo.value.trim();
  const placas = els.placaVeiculo.value.trim().toUpperCase();

  const newVenda = {
    timestamp: vendaEmEdicaoId ? vendaOriginalTimestamp : Date.now(),
    dataHora: vendaEmEdicaoId ? vendaOriginalDataHora : new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }),
    cliente: els.nomeCliente.value.trim(),
    organizacao: els.organizacao.value.trim(),
    organizacaoTipo: els.organizacaoTipo.value,
    telefone: els.telefone.value.trim(),
    negociadoras: els.negociadoras.value.trim(),
    vendaValorObs: els.vendaValorObs.value.trim(),
    carro: carro,
    placas: placas,
    qtyByProduct: qtyByProduct || {},
    qtyTickets, qtyTablets, qtyNitro,
    valorTotal: totalValue,
    tipoValor,
    registradoPor: vendaEmEdicaoId ? vendaOriginalRegistradoPor : currentUser.displayName,
    registradoPorId: vendaEmEdicaoId ? vendaOriginalRegistradoPorId : currentUser.uid
  };

  let dossierOrgDestino = '';
  if (newVenda.organizacaoTipo === 'CPF') {
      dossierOrgDestino = 'CPF';
  } else if (newVenda.organizacaoTipo === 'OUTROS') {
      dossierOrgDestino = 'Outros';
  } else {
      dossierOrgDestino = newVenda.organizacao.trim();
  }

  let dadosAntigosParaMover = null;

  if (!vendaEmEdicaoId && dossierOrgDestino !== '' && newVenda.cliente !== '') {
      try {
          const existingEntry = await findDossierEntryGlobal(newVenda.cliente);

          if (existingEntry && existingEntry.oldOrg !== dossierOrgDestino) {

              dadosAntigosParaMover = { ...existingEntry.personData };

              await remove(ref(db, `${getFaccaoPath('dossies')}/${existingEntry.oldOrg}/${existingEntry.personId}`));

              showToast(`"${newVenda.cliente}" movido de "${existingEntry.oldOrg}" para "${dossierOrgDestino}".`, "default", 4000);
          }
      } catch (e) {
          if (e.code !== "PERMISSION_DENIED") {
              showToast(`Erro ao verificar dossiê global: ${e.message}`, "error");
          }
      }
  }

  const operation = vendaEmEdicaoId ? set(ref(db, `${getFaccaoPath('vendas')}/vendaEmEdicaoId`), newVenda) : push(ref(db, getFaccaoPath('vendas')), newVenda);

  operation
      .then(() => {
          showToast(`Venda ${vendaEmEdicaoId ? 'atualizada' : 'registrada'} com sucesso!`, "success");

          const dossierVendaData = { ...newVenda };
          dossierVendaData.organizacao = dossierOrgDestino;

          if (dossierOrgDestino !== '') {
              if (vendaEmEdicaoId) {
                  updateDossierEntryOnEdit(vendaOriginalCliente, vendaOriginalDossierOrg, dossierVendaData);
              } else {
                  addDossierEntry(dossierVendaData, dadosAntigosParaMover);
              }
          }

          clearAllFields();
      })
      .catch((error) => {
          showToast(`Erro ao registrar venda: ${error.message}`, "error");
      });
};

const editVenda = (id) => {
    const venda = vendas.find(v => v.id === id);
    if (!venda) return;

    els.nomeCliente.value = venda.cliente || '';
    els.organizacao.value = venda.organizacao || '';
    els.organizacaoTipo.value = venda.organizacaoTipo || 'CNPJ';
    els.telefone.value = venda.telefone || '';
    els.negociadoras.value = venda.negociadoras || '';
    els.vendaValorObs.value = venda.vendaValorObs || '';
    els.tipoValor.value = venda.tipoValor || 'limpo';

    els.carroVeiculo.value = venda.carro || '';
    els.placaVeiculo.value = venda.placas || '';

    if (els.productsContainer) {
        els.productsContainer.querySelectorAll('input.product-qty-input').forEach(inp => inp.value = '');
        const q = venda.qtyByProduct || {};
        Object.entries(q).forEach(([k, v]) => {
            const inp = els.productsContainer.querySelector(`input.product-qty-input[data-product="${k}"]`);
            if (inp) inp.value = v;
        });
    } else {
        els.qtyTickets.value = venda.qtyTickets || 0;
        els.qtyTablets.value = venda.qtyTablets || 0;
        els.qtyNitro.value = venda.qtyNitro || 0;
    }

    calculate();

    vendaEmEdicaoId = id;
    vendaOriginalRegistradoPor = venda.registradoPor;
    vendaOriginalRegistradoPorId = venda.registradoPorId;
    vendaOriginalTimestamp = venda.timestamp;
    vendaOriginalDataHora = venda.dataHora;

    vendaOriginalCliente = venda.cliente;
    vendaOriginalOrganizacao = venda.organizacao;

    if (venda.organizacaoTipo === 'CPF') {
        vendaOriginalDossierOrg = 'CPF';
    } else if (venda.organizacaoTipo === 'OUTROS') {
        vendaOriginalDossierOrg = 'Outros';
    } else {
        vendaOriginalDossierOrg = venda.organizacao;
    }

    els.registerBtn.textContent = 'Atualizar Venda';
    App.navigate('main');
    showToast(`Editando venda de ${venda.cliente}`, "default");
};

const removeVenda = (id) => {
    if (confirm("Tem certeza que deseja remover esta venda?")) {
        remove(ref(db, `${getFaccaoPath('vendas')}/id`))
            .then(() => {
                showToast("Venda removida.", "success");
            })
            .catch((error) => {
                showToast(`Erro ao remover: ${error.message}`, "error");
            });
    }
};

const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text)
      .then(() => {
        showToast("Mensagem copiada para o Discord!", "success");
      })
      .catch(err => {
        showToast("Erro ao copiar.", "error");
      });
};

const buildDiscordMessage = (vendaData) => {
    const { cliente, data, orgTipo, org, tel, produtos, valor, obs, negociadoras, cargo } = vendaData;
    return `
\`\`\`
Nome: ${cliente}
Data: ${data}
Organização: ${orgTipo} - ${org}
Telefone: ${tel}
Cargo: ${cargo}
Produto (Unidade): ${produtos}
Venda Valor: ${valor} (${obs})
Negociadoras: ${negociadoras}
\`\`\`
    `.trim();
};

const getProdutosList = (vendaOrQtyByProduct) => {
    const qtyByProduct = vendaOrQtyByProduct?.qtyByProduct ?? vendaOrQtyByProduct ?? {};
    const entries = Object.entries(qtyByProduct || {}).filter(([,q]) => (Number(q) || 0) > 0);
    if (entries.length) {
        return entries.map(([k,q]) => `${capitalizeText(String(k).replace(/_/g, ' '))} (${q})`).join(', ');
    }
    const v = vendaOrQtyByProduct || {};
    let produtos = [];
    if ((v.qtyTickets || 0) > 0) produtos.push(`Tickets (${v.qtyTickets})`);
    if ((v.qtyTablets || 0) > 0) produtos.push(`Tablet (${v.qtyTablets})`);
    if ((v.qtyNitro || 0) > 0) produtos.push(`Nitros (${v.qtyNitro})`);
    return produtos.join(', ');
};

const copyDiscordMessage = (isFromHistory = false, venda = null) => {
    let messageData;
    if (isFromHistory) {
        let produtos = [];
        if (venda.qtyTickets > 0) produtos.push(`Tickets (${venda.qtyTickets})`);
        if (venda.qtyTablets > 0) produtos.push(`Tablet (${venda.qtyTablets})`);
        if (venda.qtyNitro > 0) produtos.push(`Nitros (${venda.qtyNitro})`);

        messageData = {
            cliente: venda.cliente,
            data: venda.dataHora.split(', ')[0],
            orgTipo: venda.organizacaoTipo,
            org: venda.organizacao,
            tel: venda.telefone,
            cargo: venda.vendaValorObs || 'N/A',
            produtos: produtosStr,
            valor: formatCurrency(venda.valorTotal || 0),
            obs: valorDescricao[venda.tipoValor],
            negociadoras: venda.negociadoras
        };
    } else {
        const { qtyByProduct, qtyTickets, qtyTablets, qtyNitro, totalValue, tipoValor, hasQuantities } = calculate();
        if (!hasQuantities) { showToast("Calcule uma venda antes de copiar.", "error"); return; }
        if (!validateFields()) { showToast("Preencha os dados da venda antes de copiar.", "error"); return; }

        let produtos = [];
        if (qtyTickets > 0) produtos.push(`Tickets (${qtyTickets})`);
        if (qtyTablets > 0) produtos.push(`Tablet (${qtyTablets})`);
        if (qtyNitro > 0) produtos.push(`Nitros (${qtyNitro})`);

        const dataAtual = new Date().toLocaleDateString('pt-BR');

        messageData = {
            cliente: els.nomeCliente.value.trim(),
            data: dataAtual,
            orgTipo: els.organizacaoTipo.value,
            org: els.organizacao.value.trim(),
            tel: els.telefone.value.trim(),
            cargo: els.vendaValorObs.value.trim() || 'N/A',
            produtos: produtosStr,
            valor: formatCurrency(totalValue),
            obs: valorDescricao[tipoValor],
            negociadoras: els.negociadoras.value.trim()
        };
    }
    copyToClipboard(buildDiscordMessage(messageData));
};

const toggleView = (viewName) => {
    els.mainCard.style.display = 'none';
    els.historyCard.style.display = 'none';
    els.adminPanel.style.display = 'none';
    els.dossierCard.style.display = 'none';
    if (els.leaderPanel) els.leaderPanel.style.display = 'none';
    if (els.hierarquiaCard) els.hierarquiaCard.style.display = 'none';

    document.body.classList.remove('history-view-active', 'dossier-view-active');

    if (viewName === 'history') {
        document.body.classList.add('history-view-active');
        els.historyCard.style.display = 'block';
        els.historyImg.src = historyBackgroundSrc;
        els.filtroHistorico.value = '';
        requestAnimationFrame(() => displaySalesHistory(vendas));
    } else if (viewName === 'admin') {
        els.adminPanel.style.display = 'block';
        requestAnimationFrame(() => { monitorOnlineStatus(); /* Inicia o monitoramento de status */ loadAdminPanel(true); /* Garante que a lista de usuários seja carregada */ adminLoadFaccoes();
      try { adminLoadUsersPublic(); adminBuildRanking(); adminLoadLogs(); } catch(e) {}
      try { renderOnlineUsers(); if (!window.__onlineInterval) window.__onlineInterval = setInterval(renderOnlineUsers, 5000); } catch(e) {}
        adminLoadRanking(); });
    } else if (viewName === 'leader') {
        if (els.leaderPanel) els.leaderPanel.style.display = 'block';
    } else if (viewName === 'hierarquia') {
        if (els.hierarquiaCard) els.hierarquiaCard.style.display = 'block';
    } else if (viewName === 'dossier') {
        document.body.classList.add('dossier-view-active');
        els.dossierCard.style.display = 'block';
        requestAnimationFrame(() => showDossierOrgs());
    } else {
        els.mainCard.style.display = 'block';
    }
};

const displaySalesHistory = (history) => {
    els.salesHistory.innerHTML = '';
    if (!currentUserData) {
         return;
    }

    let vendasFiltradas = history;
    const userTagUpper = currentUserData.tag.toUpperCase();

    if (userTagUpper === 'VISITANTE') {
        vendasFiltradas = history.filter(v => v.registradoPorId === currentUser.uid);
    }

    if (vendasFiltradas.length === 0) {
        const row = els.salesHistory.insertRow();
        row.insertCell().colSpan = 9;
        row.cells[0].textContent = "Nenhuma venda para exibir.";
        row.cells[0].style.textAlign = 'center';
        row.cells[0].style.padding = '20px';
        return;
    }

    vendasFiltradas.sort((a, b) => b.timestamp - a.timestamp);

    vendasFiltradas.forEach(venda => {
        const row = els.salesHistory.insertRow();

        const [data, hora] = venda.dataHora.split(', ');
        row.insertCell().innerHTML = `<span class="history-datetime-line">${data}</span><span class="history-datetime-line">${hora}</span>`;
        row.insertCell().textContent = capitalizeText(venda.cliente);
        row.insertCell().textContent = `${capitalizeText(venda.organizacao)} (${venda.organizacaoTipo})`;
        row.insertCell().textContent = venda.telefone;

        let produtos = [];
        if (venda.qtyTickets > 0) produtos.push(`${venda.qtyTickets} Tickets`);
        if (venda.qtyTablets > 0) produtos.push(`${venda.qtyTablets} Tablets`);
        if (venda.qtyNitro > 0) produtos.push(`${venda.qtyNitro} Nitro`);
        row.insertCell().textContent = capitalizeText(produtos.join(', '));

        const valorCell = row.insertCell();
        valorCell.className = 'valor-total-cell';
        valorCell.innerHTML = `<span>${formatCurrency(venda.valorTotal || 0)}</span><span class="valor-obs-text">(${valorDescricao[venda.tipoValor] || 'N/A'})`;

        row.insertCell().textContent = capitalizeText(venda.negociadoras);

        const registradoPorCell = row.insertCell();
        if (venda.registradoPor && venda.registradoPor.toLowerCase() === 'snow') {
            registradoPorCell.textContent = '???';
            registradoPorCell.style.fontStyle = 'italic';
            registradoPorCell.style.color = '#aaa';
        } else {
            registradoPorCell.textContent = venda.registradoPor || 'Desconhecido';
        }

        const actionsCell = row.insertCell();
        actionsCell.className = 'history-actions-cell';

        const podeModificar =
            (userTagUpper === 'ADMIN') ||
            (userTagUpper === 'HELLS' && venda.registradoPorId === currentUser.uid) ||
            (userTagUpper === 'VISITANTE' && venda.registradoPorId === currentUser.uid);

        actionsCell.innerHTML = `
            <button class="action-btn muted edit-btn" ${!podeModificar ? 'disabled' : ''}>Editar</button>
            <button class="action-btn danger delete-btn" ${!podeModificar ? 'disabled' : ''}>Deletar</button>
            <button class="action-btn muted discord-btn">Discord</button>
        `;
        if(podeModificar){
            actionsCell.querySelector('.edit-btn').onclick = () => editVenda(venda.id);
            actionsCell.querySelector('.delete-btn').onclick = () => removeVenda(venda.id);
        }
        actionsCell.querySelector('.discord-btn').onclick = () => copyDiscordMessage(true, venda);
    });
};

const filterHistory = () => {
    const query = els.filtroHistorico.value.toLowerCase().trim();
    const filteredVendas = vendas.filter(v =>
        Object.values(v).some(val => String(val).toLowerCase().includes(query)) ||
        (v.qtyTickets > 0 && `tickets`.includes(query)) ||
        (v.qtyTablets > 0 && `tablets`.includes(query)) ||
        (v.qtyNitro > 0 && `nitro`.includes(query))
    );
    displaySalesHistory(query ? filteredVendas : vendas);
};

const exportToCsv = () => {
    if (vendas.length === 0) {
        showToast("Nenhum dado para exportar.", "error");
        return;
    }
    const headers = ["Data/Hora", "Cliente", "Organização", "Tipo", "Telefone", "Negociadoras", "Cargo", "Carro", "Placas", "Qtde Tickets", "Qtde Tablets", "Qtde Nitro", "Valor Total", "Tipo Valor", "Registrado Por"];
    const csvRows = vendas.map(v => [`"${v.dataHora}"`, `"${v.cliente}"`, `"${v.organizacao}"`, `"${v.organizacaoTipo}"`, `"${v.telefone}"`, `"${v.negociadoras}"`, `"${v.vendaValorObs}"`, `"${v.carro || ''}"`, `"${v.placas || ''}"`, v.qtyTickets, v.qtyTablets, v.qtyNitro, v.valorTotal, `"${valorDescricao[v.tipoValor]}"`, `"${v.registradoPor}"`].join(','));
    const csvContent = [headers.join(','), ...csvRows].join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }));
    link.download = `historico_vendas_HA_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    showToast("Histórico exportado para CSV!", "success");
};

const clearHistory = () => {
    if (currentUserData.tag.toUpperCase() !== 'ADMIN') {
        showToast("Apenas administradores podem limpar o histórico.", "error");
        return;
    }
    if (confirm("ATENÇÃO: Deseja APAGAR TODO o histórico de vendas? Esta ação é irreversível.")) {
        remove(ref(db, getFaccaoPath('vendas')))
            .then(() => showToast("Histórico limpado.", "success"))
            .catch(e => showToast(`Erro: ${e.message}`, "error"));
    }
};

const showImageLightbox = (url) => {
    if (!url) return;
    els.lightboxImg.src = url;
    els.imageLightboxOverlay.style.display = 'block';
    els.imageLightboxModal.style.display = 'block';
};

const closeImageLightbox = () => {
    els.imageLightboxOverlay.style.display = 'none';
    els.imageLightboxModal.style.display = 'none';
    els.lightboxImg.src = '';
};

const saveHierarchyOrder = (orgName) => {
    const grid = els.dossierPeopleGrid;
    const children = Array.from(grid.children);

    if (children.length === 0 || !children[0].classList.contains('dossier-entry-card')) {
        return;
    }

    const updates = {};
    children.forEach((card, index) => {
        const personId = card.dataset.id;
        if (personId) {
            updates[`dossies/${orgName}/${personId}/hierarquiaIndex`] = index;
        }
    });

    if (Object.keys(updates).length > 0) {
        update(ref(db), updates)
            .then(() => {
                showToast("Hierarquia atualizada!", "success");
                globalCurrentPeople = children.map((card, index) => {
                    const person = globalCurrentPeople.find(p => p.id === card.dataset.id);
                    if (person) {
                        person.hierarquiaIndex = index;
                    }
                    return person;
                }).filter(Boolean);
            })
            .catch((err) => {
                showToast(`Erro ao salvar hierarquia: ${err.message}`, "error");
            });
    }
};

const initSortable = (orgName) => {
    if (sortableInstance) {
        sortableInstance.destroy();
    }

    const grid = els.dossierPeopleGrid;

    const userTagUpper = currentUserData ? currentUserData.tag.toUpperCase() : 'VISITANTE';
    const canDrag = (userTagUpper === 'ADMIN' || userTagUpper === 'HELLS');

    sortableInstance = new Sortable(grid, {
        animation: 150,
        handle: '.dossier-entry-card',
        disabled: !canDrag,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
            saveHierarchyOrder(orgName);
        }
    });
};

const saveOrgOrder = (showToastOnSuccess = true) => {
    const grid = els.dossierOrgGrid;
    const children = Array.from(grid.children).filter(el => el.classList.contains('dossier-org-card'));

    if (children.length === 0) {
        return;
    }

    const updates = {};
    children.forEach((card, index) => {
        const orgId = card.dataset.orgName;
        if (orgId) {
            updates[`organizacoes/${orgId}/ordemIndex`] = index;
        }
    });

    if (Object.keys(updates).length > 0) {
        update(ref(db), updates)
            .then(() => {
                if(showToastOnSuccess) showToast("Ordem das Bases atualizada!", "success");
                globalAllOrgs = children.map((card, index) => {
                    const org = globalAllOrgs.find(o => o.id === card.dataset.orgName);
                    if (org) {
                        org.ordemIndex = index;
                    }
                    return org;
                }).filter(Boolean);
            })
            .catch((err) => {
                showToast(`Erro ao salvar ordem das Bases: ${err.message}`, "error");
            });
    }
};

const initOrgSortable = () => {
    if (orgSortableInstance) {
        orgSortableInstance.destroy();
    }

    const grid = els.dossierOrgGrid;

    const userTagUpper = currentUserData ? currentUserData.tag.toUpperCase() : 'VISITANTE';
    const canDrag = (userTagUpper === 'ADMIN' || userTagUpper === 'HELLS');

    orgSortableInstance = new Sortable(grid, {
        animation: 150,
        handle: '.dossier-org-card',
        group: 'orgs',
        disabled: !canDrag,
        ghostClass: 'sortable-ghost',
        filter: 'h3.dossier-org-title',
        onEnd: (evt) => {
            saveOrgOrder();
        }
    });
};

const showDossierOrgs = async () => {
    els.dossierOrgContainer.style.display = 'block';
    els.dossierPeopleContainer.style.display = 'none';
    els.dossierOrgGrid.innerHTML = '<p>Carregando organizações...</p>';
    globalAllOrgs = [];

    try {
        const orgsInfoRef = ref(db, getFaccaoPath('organizacoes'));
        const orgsInfoSnap = await get(orgsInfoRef);
        const orgsInfo = orgsInfoSnap.exists() ? orgsInfoSnap.val() : {};

        const orgsPessoasRef = ref(db, getFaccaoPath('dossies'));
        const orgsPessoasSnap = await get(orgsPessoasRef);
        const orgsPessoas = orgsPessoasSnap.exists() ? orgsPessoasSnap.val() : {};

        const allOrgNames = new Set([...Object.keys(orgsInfo), ...Object.keys(orgsPessoas)]);

        if (allOrgNames.size === 0) {
            els.dossierOrgGrid.innerHTML = '<p>Nenhuma organização encontrada. Clique em "+ Adicionar Base" para começar.</p>';
            initOrgSortable();
            return;
        }

        globalAllOrgs = Array.from(allOrgNames).map(orgName => {
            const info = orgsInfo[orgName] || {};
            return {
                id: orgName,
                nome: orgName,
                ordemIndex: info.ordemIndex !== undefined ? info.ordemIndex : 9999,
                ...info
            };
        }).sort((a, b) => {
             const indexA = a.ordemIndex !== undefined ? a.ordemIndex : Infinity;
             const indexB = b.ordemIndex !== undefined ? b.ordemIndex : Infinity;
             if (indexA !== indexB) {
                return indexA - indexB;
             }
             return a.nome.localeCompare(b.nome);
        });

        displayOrgs(globalAllOrgs);
        initOrgSortable();

    } catch (error) {
        els.dossierOrgGrid.innerHTML = `<p style="color: var(--cor-erro);">Erro ao carregar organizações: ${error.message}</p>`;
    }
};

const displayOrgs = (orgs) => {
    els.dossierOrgGrid.innerHTML = '';
    if (orgs.length === 0) {
        els.dossierOrgGrid.innerHTML = '<p>Nenhuma organização encontrada para este filtro.</p>';
        return;
    }

    orgs.forEach(org => {
        const card = document.createElement('div');
        card.className = 'dossier-org-card';
        card.dataset.orgName = org.nome;

        const fotoDiv = document.createElement('div');
        fotoDiv.className = 'dossier-org-foto';
        if (org.fotoUrl) {
            const img = document.createElement('img');
            img.src = org.fotoUrl;
            img.alt = `Base de ${org.nome}`;
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                showImageLightbox(org.fotoUrl);
            });
            fotoDiv.appendChild(img);
        } else {
            fotoDiv.textContent = 'Sem Foto da Base';
        }

        const nomeH4 = document.createElement('h4');
        nomeH4.textContent = org.nome;

        const infoP = document.createElement('p');
        infoP.textContent = org.info || '(Sem informações da base)';

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'dossier-org-actions';
        actionsDiv.innerHTML = `<button class="action-btn muted edit-org-btn" data-org-id="${org.id}">✏️ Editar Base</button>`;

        card.appendChild(fotoDiv);
        card.appendChild(nomeH4);
        card.appendChild(infoP);
        card.appendChild(actionsDiv);

        actionsDiv.querySelector('.edit-org-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openEditOrgModal(org.id);
        });

        card.addEventListener('click', () => {
            showDossierPeople(org.nome);
        });

        els.dossierOrgGrid.appendChild(card);
    });
};

const displayGlobalSearchResults = (orgs, people) => {
    els.dossierOrgGrid.innerHTML = '';

    if (orgs.length === 0 && people.length === 0) {
        els.dossierOrgGrid.innerHTML = '<p>Nenhuma organização ou pessoa encontrada para este filtro.</p>';
        return;
    }

    if (orgs.length > 0) {
        const orgsHeader = document.createElement('h3');
        orgsHeader.className = 'dossier-org-title';
        orgsHeader.textContent = 'Bases Encontradas';
        els.dossierOrgGrid.appendChild(orgsHeader);

        orgs.forEach(org => {
            const card = document.createElement('div');
            card.className = 'dossier-org-card';
            card.dataset.orgName = org.nome;

            card.style.cursor = 'pointer';

            const fotoDiv = document.createElement('div');
            fotoDiv.className = 'dossier-org-foto';
            if (org.fotoUrl) {
                const img = document.createElement('img');
                img.src = org.fotoUrl;
                img.alt = `Base de ${org.nome}`;
                img.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showImageLightbox(org.fotoUrl);
                });
                fotoDiv.appendChild(img);
            } else {
                fotoDiv.textContent = 'Sem Foto da Base';
            }

            const nomeH4 = document.createElement('h4');
            nomeH4.textContent = org.nome;

            const infoP = document.createElement('p');
            infoP.textContent = org.info || '(Sem informações da base)';

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'dossier-org-actions';
            actionsDiv.innerHTML = `<button class="action-btn muted edit-org-btn" data-org-id="${org.id}">✏️ Editar Base</button>`;

            card.appendChild(fotoDiv);
            card.appendChild(nomeH4);
            card.appendChild(infoP);
            card.appendChild(actionsDiv);

            actionsDiv.querySelector('.edit-org-btn').addEventListener('click', (e) => {
                e.stopPropagation();
                openEditOrgModal(org.id);
            });
            card.addEventListener('click', () => {
                showDossierPeople(org.nome);
            });

            els.dossierOrgGrid.appendChild(card);
        });
    }

    if (people.length > 0) {
        const peopleHeader = document.createElement('h3');
        peopleHeader.className = 'dossier-org-title';
        peopleHeader.textContent = 'Pessoas Encontradas';
        els.dossierOrgGrid.appendChild(peopleHeader);

        people.forEach(entry => {

            const card = document.createElement('div');
            card.className = 'dossier-entry-card';
            card.dataset.id = entry.id;
            card.style.cursor = 'default';

            const baseLink = document.createElement('a');
            baseLink.href = '#';
            baseLink.textContent = `Base: ${entry.org}`;
            baseLink.style.color = 'var(--cor-principal)';
            baseLink.style.fontSize = '14px';
            baseLink.style.textAlign = 'left';
            baseLink.style.margin = '0 0 8px 0';
            baseLink.style.fontWeight = '600';
            baseLink.style.borderBottom = '1px solid var(--cor-borda)';
            baseLink.style.paddingBottom = '5px';
            baseLink.style.display = 'block';
            baseLink.style.textDecoration = 'none';
            baseLink.style.cursor = 'pointer';

            baseLink.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                showDossierPeople(entry.org);
            });

            card.appendChild(baseLink);

            const fotoDiv = document.createElement('div');
            fotoDiv.className = 'dossier-foto';
            if (entry.fotoUrl) {
                const img = document.createElement('img');
                img.src = entry.fotoUrl;
                img.alt = `Foto de ${entry.nome}`;
                img.addEventListener('click', (e) => {
                    e.stopPropagation();
                    showImageLightbox(entry.fotoUrl);
                });
                fotoDiv.appendChild(img);
            } else {
                fotoDiv.textContent = 'Sem Foto';
            }

            const nomeH4 = document.createElement('h4');
            nomeH4.textContent = entry.nome || '(Sem Nome)';

            const numeroP = document.createElement('p');
            numeroP.textContent = entry.numero || '(Sem Número)';

            const cargoP = document.createElement('p');
            cargoP.innerHTML = `<strong>Cargo:</strong> ${entry.cargo || 'N/A'}`;

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'dossier-actions';
            actionsDiv.innerHTML = `
                <button class="action-btn muted edit-dossier-btn" data-org="${entry.org}" data-id="${entry.id}">✏️ Editar</button>
                <button class="action-btn danger delete-dossier-btn" data-org="${entry.org}" data-id="${entry.id}">❌ Apagar</button>
            `;

            card.appendChild(fotoDiv);
            card.appendChild(nomeH4);
            card.appendChild(numeroP);
            card.appendChild(cargoP);

            if (entry.instagram) {
                const instagramP = document.createElement('p');
                let instaHandle = entry.instagram.startsWith('@') ? entry.instagram.substring(1) : entry.instagram;
                instaHandle = instaHandle.split('/')[0];
                instagramP.innerHTML = `<strong>Instagram:</strong> <span style="color: var(--cor-principal); font-weight: 500;">@${instaHandle}</span>`;
                instagramP.style.fontSize = '13px';
                card.appendChild(instagramP);
            }

            const veiculos = entry.veiculos || {};
            const veiculosCount = Object.keys(veiculos).length;

            if (veiculosCount > 0) {
                const details = document.createElement('details');
                details.style.marginTop = '5px';
                const summary = document.createElement('summary');
                summary.innerHTML = `<strong>Veículos (${veiculosCount})</strong> (Clique para ver)`;
                summary.style.cursor = 'pointer';
                summary.style.fontWeight = '600';
                summary.style.color = 'var(--cor-principal)';
                summary.style.fontSize = '13px';
                details.appendChild(summary);
                for (const id in veiculos) {
                    const veiculo = veiculos[id];
                    const p = document.createElement('p');
                    let fotoLink = '';
                    if (veiculo.fotoUrl) {
                        fotoLink = ` <a href="#" class="veiculo-foto-link" data-url="${veiculo.fotoUrl}" style="font-size: 11px; color: var(--cor-principal); text-decoration: none; font-weight: 600;">[Ver Foto]</a>`;
                    } else {
                        fotoLink = ` <span style="font-size: 11px; color: #888; font-weight: normal;">[Sem Foto]</span>`;
                    }
                    p.innerHTML = `<strong>${veiculo.carro || 'N/A'}:</strong> ${veiculo.placa || 'N/A'}${fotoLink}`;
                    p.style.fontWeight = 'normal';
                    p.style.color = 'var(--cor-texto)';
                    p.style.marginTop = '5px';
                    p.style.textAlign = 'left';
                    details.appendChild(p);
                }
                card.appendChild(details);
            } else {
                const p = document.createElement('p');
                p.innerHTML = '<strong>Veículos:</strong> N/A';
                p.style.fontWeight = 'normal';
                p.style.color = 'var(--cor-texto)';
                card.appendChild(p);
            }

            card.appendChild(actionsDiv);
            els.dossierOrgGrid.appendChild(card);
        });
    }
};

const filterOrgs = async () => {
    const query = els.filtroDossierOrgs.value.toLowerCase().trim();

    if (!query) {
        displayOrgs(globalAllOrgs);
        initOrgSortable();
        return;
    }

    els.dossierOrgGrid.innerHTML = '<p>Buscando...</p>';

    const filteredOrgs = globalAllOrgs.filter(org =>
        org.nome.toLowerCase().includes(query)
    );

    const filteredPeople = await searchAllPeopleGlobal(query);

    displayGlobalSearchResults(filteredOrgs, filteredPeople);

    if (orgSortableInstance) {
        orgSortableInstance.destroy();
        orgSortableInstance = null;
    }
};

const showDossierPeople = async (orgName) => {
    els.dossierOrgContainer.style.display = 'none';
    els.dossierPeopleContainer.style.display = 'block';
    els.dossierPeopleTitle.textContent = `Membros: ${orgName}`;
    els.dossierPeopleGrid.innerHTML = '<p>Carregando membros...</p>';

    els.addPessoaBtn.dataset.orgName = orgName;

    globalCurrentPeople = [];

    if (orgSortableInstance) {
        orgSortableInstance.destroy();
        orgSortableInstance = null;
    }

    try {
        const peopleRef = ref(db, `${getFaccaoPath('dossies')}/orgName`);
        const snapshot = await get(peopleRef);

        if (!snapshot.exists()) {
            els.dossierPeopleGrid.innerHTML = '<p>Nenhum membro registrado para esta organização.</p>';
            initSortable(orgName);
            return;
        }

        const peopleData = snapshot.val();
        for (const personId in peopleData) {
            globalCurrentPeople.push({
                id: personId,
                org: orgName,
                ...peopleData[personId]
            });
        }

        globalCurrentPeople.sort((a, b) => {
            const indexA = a.hierarquiaIndex !== undefined ? a.hierarquiaIndex : Infinity;
            const indexB = b.hierarquiaIndex !== undefined ? b.hierarquiaIndex : Infinity;
            if (indexA !== indexB) {
                return indexA - indexB;
            }
            return (a.nome || '').localeCompare(b.nome || '');
        });

        displayPeople(globalCurrentPeople);

        initSortable(orgName);

    } catch (error) {
        els.dossierPeopleGrid.innerHTML = `<p style="color: var(--cor-erro);">Erro ao carregar membros: ${error.message}</p>`;
    }
};

const displayPeople = (people) => {
    els.dossierPeopleGrid.innerHTML = '';
    if (people.length === 0) {
        els.dossierPeopleGrid.innerHTML = '<p>Nenhum membro encontrado para este filtro.</p>';
        return;
    }

    people.forEach(entry => {
        const card = document.createElement('div');
        card.className = 'dossier-entry-card';
        card.dataset.id = entry.id;

        const fotoDiv = document.createElement('div');
        fotoDiv.className = 'dossier-foto';
        if (entry.fotoUrl) {
            const img = document.createElement('img');
            img.src = entry.fotoUrl;
            img.alt = `Foto de ${entry.nome}`;
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                showImageLightbox(entry.fotoUrl);
            });
            fotoDiv.appendChild(img);
        } else {
            fotoDiv.textContent = 'Sem Foto';
        }

        const nomeH4 = document.createElement('h4');
        nomeH4.textContent = entry.nome || '(Sem Nome)';

        const numeroP = document.createElement('p');
        numeroP.textContent = entry.numero || '(Sem Número)';

        const cargoP = document.createElement('p');
        cargoP.innerHTML = `<strong>Cargo:</strong> ${entry.cargo || 'N/A'}`;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'dossier-actions';
        actionsDiv.innerHTML = `
            <button class="action-btn muted edit-dossier-btn" data-org="${entry.org}" data-id="${entry.id}">✏️ Editar</button>
            <button class="action-btn danger delete-dossier-btn" data-org="${entry.org}" data-id="${entry.id}">❌ Apagar</button>
        `;

        card.appendChild(fotoDiv);
        card.appendChild(nomeH4);
        card.appendChild(numeroP);
        card.appendChild(cargoP);

        if (entry.instagram) {
            const instagramP = document.createElement('p');
            let instaHandle = entry.instagram.startsWith('@') ? entry.instagram.substring(1) : entry.instagram;
            instaHandle = instaHandle.split('/')[0];

            instagramP.innerHTML = `<strong>Instagram:</strong> <span style="color: var(--cor-principal); font-weight: 500;">@${instaHandle}</span>`;

            instagramP.style.fontSize = '13px';
            card.appendChild(instagramP);
        }

        const veiculos = entry.veiculos || {};
        const veiculosCount = Object.keys(veiculos).length;

        if (veiculosCount > 0) {
            const details = document.createElement('details');
            details.style.marginTop = '5px';

            const summary = document.createElement('summary');
            summary.innerHTML = `<strong>Veículos (${veiculosCount})</strong> (Clique para ver)`;
            summary.style.cursor = 'pointer';
            summary.style.fontWeight = '600';
            summary.style.color = 'var(--cor-principal)';
            summary.style.fontSize = '13px';

            details.appendChild(summary);

            for (const id in veiculos) {
                const veiculo = veiculos[id];
                const p = document.createElement('p');

                let fotoLink = '';
                if (veiculo.fotoUrl) {
                    fotoLink = ` <a href="#" class="veiculo-foto-link" data-url="${veiculo.fotoUrl}" style="font-size: 11px; color: var(--cor-principal); text-decoration: none; font-weight: 600;">[Ver Foto]</a>`;
                } else {
                    fotoLink = ` <span style="font-size: 11px; color: #888; font-weight: normal;">[Sem Foto]</span>`;
                }

                p.innerHTML = `<strong>${veiculo.carro || 'N/A'}:</strong> ${veiculo.placa || 'N/A'}${fotoLink}`;
                p.style.fontWeight = 'normal';
                p.style.color = 'var(--cor-texto)';
                p.style.marginTop = '5px';
                p.style.textAlign = 'left';
                details.appendChild(p);
            }
            card.appendChild(details);
        } else {
            const p = document.createElement('p');
            p.innerHTML = '<strong>Veículos:</strong> N/A';
            p.style.fontWeight = 'normal';
            p.style.color = 'var(--cor-texto)';
            card.appendChild(p);
        }

        card.appendChild(actionsDiv);

        els.dossierPeopleGrid.appendChild(card);
    });
};

const filterPeople = () => {
    const query = els.filtroDossierPeople.value.toLowerCase().trim();
    if (!query) {
        displayPeople(globalCurrentPeople);
        return;
    }

    const filteredPeople = globalCurrentPeople.filter(entry => {
        const nome = entry.nome ? entry.nome.toLowerCase() : '';
        const cargo = entry.cargo ? entry.cargo.toLowerCase() : '';
        const instagram = entry.instagram ? entry.instagram.toLowerCase() : '';

        let veiculoMatch = false;
        if (entry.veiculos) {
            for (const id in entry.veiculos) {
                const v = entry.veiculos[id];
                if ((v.carro && v.carro.toLowerCase().includes(query)) || (v.placa && v.placa.toLowerCase().includes(query))) {
                    veiculoMatch = true;
                    break;
                }
            }
        }

        return nome.includes(query) || cargo.includes(query) || instagram.includes(query) || veiculoMatch;
    });

    displayPeople(filteredPeople);
};

const openAddOrgModal = () => {
    els.orgModalTitle.textContent = "Adicionar Nova Base";
    els.editOrgId.value = '';
    els.orgNome.value = '';
    els.orgNome.disabled = false;
    els.orgFotoUrl.value = '';
    els.orgInfo.value = '';
    els.deleteOrgBtn.style.display = 'none';

    document.querySelectorAll('.input-invalido').forEach(el => el.classList.remove('input-invalido'));

    els.orgModalOverlay.style.display = 'block';
    els.orgModal.style.display = 'block';
    els.orgNome.focus();
};

const openEditOrgModal = (orgId) => {
    const org = globalAllOrgs.find(o => o.id === orgId);
    if (!org) {
        showToast("Erro: Organização não encontrada.", "error");
        return;
    }

    els.orgModalTitle.textContent = "Editar Base";
    els.editOrgId.value = org.id;
    els.orgNome.value = org.nome;
    els.orgNome.disabled = true;
    els.orgFotoUrl.value = org.fotoUrl || '';
    els.orgInfo.value = org.info || '';
    els.deleteOrgBtn.style.display = 'inline-block';

    document.querySelectorAll('.input-invalido').forEach(el => el.classList.remove('input-invalido'));

    els.orgModalOverlay.style.display = 'block';
    els.orgModal.style.display = 'block';
    els.orgFotoUrl.focus();
};

const closeOrgModal = () => {
    els.orgModalOverlay.style.display = 'none';
    els.orgModal.style.display = 'none';
};

const saveOrg = async () => {
    const orgNome = capitalizeText(els.orgNome.value.trim());
    const orgId = els.editOrgId.value || orgNome;

    if (!orgId) {
        showToast("O Nome da Organização é obrigatório.", "error");
        els.orgNome.classList.add('input-invalido');
        return;
    }
    els.orgNome.classList.remove('input-invalido');

    const orgRef = ref(db, `${getFaccaoPath('organizacoes')}/orgId`);

    let existingIndex = 9999;
    if (els.editOrgId.value) {
        try {
            const snapshot = await get(orgRef);
            if (snapshot.exists()) {
                existingIndex = snapshot.val().ordemIndex !== undefined ? snapshot.val().ordemIndex : 9999;
            }
        } catch (e) {
            console.error("Erro ao buscar ordemIndex:", e);
        }
    }

    const orgData = {
        nome: orgNome,
        fotoUrl: els.orgFotoUrl.value.trim(),
        info: els.orgInfo.value.trim(),
        ordemIndex: existingIndex
    };

    set(orgRef, orgData)
        .then(() => {
            showToast("Base salva com sucesso!", "success");
            closeOrgModal();
            requestAnimationFrame(() => showDossierOrgs());
        })
        .catch(err => showToast(`Erro ao salvar: ${err.message}`, "error"));
};

const deleteOrg = () => {
    const orgId = els.editOrgId.value;
    if (!orgId) return;

    if (confirm(`ATENÇÃO:\n\nIsso apagará as INFORMAÇÕES DA BASE "${orgId}".\n\NIsso NÃO apagará os membros (pessoas) que estão dentro dela.\n\nDeseja continuar?`)) {
        remove(ref(db, `${getFaccaoPath('organizacoes')}/orgId`))
            .then(() => {
                showToast("Informações da base removidas.", "success");
                closeOrgModal();
                requestAnimationFrame(() => showDossierOrgs());
            })
            .catch(err => showToast(`Erro: ${err.message}`, "error"));
    }
};

const renderModalVeiculos = (listaElement) => {
    listaElement.innerHTML = '';
    if (Object.keys(tempVeiculos).length === 0) {
        listaElement.innerHTML = '<p style="font-size: 13px; text-align: center; margin: 0; padding: 5px;">Nenhum veículo adicionado.</p>';
        return;
    }

    for (const key in tempVeiculos) {
        const veiculo = tempVeiculos[key];
        const itemDiv = document.createElement('div');
        itemDiv.className = 'veiculo-item-modal';
        itemDiv.innerHTML = `
            <span style="flex-grow: 1;"><strong>${veiculo.carro || 'N/A'}:</strong> ${veiculo.placa || 'N/A'}</span>
            <button class="muted action-btn edit-veiculo-btn" data-key="${key}">Editar</button>
            <button class="danger action-btn remove-veiculo-btn" data-key="${key}">Remover</button>
        `;
        listaElement.appendChild(itemDiv);
    }
};

const iniciarEdicaoVeiculo = (key, modalPrefix) => {
    if (!tempVeiculos[key]) return;

    const veiculo = tempVeiculos[key];
    veiculoEmEdicaoKey = key;

    els[modalPrefix + 'CarroNome'].value = veiculo.carro;
    els[modalPrefix + 'CarroPlaca'].value = veiculo.placa;
    els[modalPrefix + 'CarroFoto'].value = veiculo.fotoUrl;

    els[modalPrefix + 'AddVeiculoBtn'].textContent = 'Atualizar Veículo';
    els[modalPrefix + 'CancelVeiculoBtn'].style.display = 'inline-block';

    els[modalPrefix + 'CarroNome'].focus();
};

const cancelarEdicaoVeiculo = (modalPrefix) => {
    veiculoEmEdicaoKey = null;

    els[modalPrefix + 'CarroNome'].value = '';
    els[modalPrefix + 'CarroPlaca'].value = '';
    els[modalPrefix + 'CarroFoto'].value = '';

    els[modalPrefix + 'AddVeiculoBtn'].textContent = '+ Adicionar Veículo';
    els[modalPrefix + 'CancelVeiculoBtn'].style.display = 'none';
};

const adicionarOuAtualizarVeiculoTemp = (modalPrefix) => {
    const carroEl = els[modalPrefix + 'CarroNome'];
    const placaEl = els[modalPrefix + 'CarroPlaca'];
    const fotoEl = els[modalPrefix + 'CarroFoto'];
    const listaEl = els[modalPrefix + 'ListaVeiculos'];

    const carro = carroEl.value.trim();
    const placa = placaEl.value.trim().toUpperCase();
    const fotoUrl = fotoEl.value.trim();

    if (!carro || !placa) {
        showToast("Preencha o nome do carro e a placa.", "error");
        return;
    }

    if (veiculoEmEdicaoKey) {
        if (tempVeiculos[veiculoEmEdicaoKey]) {
            tempVeiculos[veiculoEmEdicaoKey] = { carro, placa, fotoUrl };
        }
    } else {
        const tempKey = `temp_${Date.now()}`;
        tempVeiculos[tempKey] = { carro, placa, fotoUrl };
    }

    renderModalVeiculos(listaEl);
    cancelarEdicaoVeiculo(modalPrefix);
};

const removerVeiculoTemp = (key, listaEl) => {
    if (tempVeiculos[key]) {
        delete tempVeiculos[key];
        renderModalVeiculos(listaEl);
    }
};

const openAddDossierModal = (orgName) => {
    els.addDossierOrganizacao.value = orgName;
    els.addDossierNome.value = '';
    els.addDossierNumero.value = '';
    els.addDossierCargo.value = '';
    els.addDossierFotoUrl.value = '';

    tempVeiculos = {};
    cancelarEdicaoVeiculo('addModal');
    renderModalVeiculos(els.addModalListaVeiculos);

    document.querySelectorAll('.input-invalido').forEach(el => el.classList.remove('input-invalido'));

    els.addDossierOverlay.style.display = 'block';
    els.addDossierModal.style.display = 'block';
    els.addDossierNome.focus();
};

const closeAddDossierModal = () => {
    els.addDossierOverlay.style.display = 'none';
    els.addDossierModal.style.display = 'none';
    cancelarEdicaoVeiculo('addModal');
};

const saveNewDossierEntry = () => {
    const org = els.addDossierOrganizacao.value.trim();
    if (!org) {
        showToast("Erro: Organização não definida.", "error");
        return;
    }

    const nome = els.addDossierNome.value.trim();
    if (!nome) {
        showToast("O Nome da pessoa é obrigatório.", "error");
        els.addDossierNome.classList.add('input-invalido');
        return;
    }
    els.addDossierNome.classList.remove('input-invalido');

    const agora = new Date();
    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const ano = agora.getFullYear();
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');

    const newEntry = {
        organizacao: org,
        nome: nome,
        numero: els.addDossierNumero.value.trim(),
        cargo: els.addDossierCargo.value.trim(),
        fotoUrl: els.addDossierFotoUrl.value.trim(),
        instagram: "",
        veiculos: tempVeiculos,
        hierarquiaIndex: 9999,
        data: `${dia}/${mes}/${ano} ${horas}:${minutos}`
    };

    push(ref(db, `${getFaccaoPath('dossies')}/org`), newEntry)
        .then(() => {
             showToast("Nova pessoa salva no dossiê!", "success");
             closeAddDossierModal();
             showDossierPeople(org);
        })
        .catch(err => showToast(`Erro ao salvar: ${err.message}`, "error"));
};

const openEditDossierModal = async (org, id) => {
    let entry = globalCurrentPeople.find(e => e.id === id && e.org === org);

    if (!entry) {
        try {
            const entryRef = ref(db, `${getFaccaoPath('dossies')}/${org}/${id}`);
            const snapshot = await get(entryRef);
            if (snapshot.exists()) {
                entry = { id: snapshot.key, org: org, ...snapshot.val() };
                globalCurrentPeople = [entry];
            } else {
                showToast("Erro: Entrada não encontrada no Banco de Dados.", "error");
                return;
            }
        } catch (e) {
            showToast(`Erro ao buscar dados da pessoa: ${e.message}`, "error");
            return;
        }
    }

    els.editDossierOrg.value = entry.org;
    els.editDossierId.value = entry.id;
    els.editDossierNome.value = entry.nome || '';
    els.editDossierNumero.value = entry.numero || '';
    els.editDossierCargo.value = entry.cargo || '';
    els.editDossierFotoUrl.value = entry.fotoUrl || '';
    els.editDossierInstagram.value = entry.instagram || '';

    tempVeiculos = { ...(entry.veiculos || {}) };
    cancelarEdicaoVeiculo('editModal');
    renderModalVeiculos(els.editModalListaVeiculos);

    els.editDossierOverlay.style.display = 'block';
    els.editDossierModal.style.display = 'block';
};

const closeEditDossierModal = () => {
    els.editDossierOverlay.style.display = 'none';
    els.editDossierModal.style.display = 'none';
    cancelarEdicaoVeiculo('editModal');
};

const saveDossierChanges = () => {
    const org = els.editDossierOrg.value;
    const id = els.editDossierId.value;

    if (!org || !id) {
        showToast("Erro: ID da entrada perdido.", "error");
        return;
    }

    const originalEntry = globalCurrentPeople.find(e => e.id === id && e.org === org);
    if (!originalEntry) {
        showToast("Erro: Entrada original não encontrada.", "error");
        return;
    }

    const updatedEntry = {
        ...originalEntry,
        nome: els.editDossierNome.value.trim(),
        numero: els.editDossierNumero.value.trim(),
        cargo: els.editDossierCargo.value.trim(),
        fotoUrl: els.editDossierFotoUrl.value.trim(),
        instagram: els.editDossierInstagram.value.trim(),
        veiculos: tempVeiculos
    };

    delete updatedEntry.id;
    delete updatedEntry.org;

    const entryRef = ref(db, `${getFaccaoPath('dossies')}/${org}/${id}`);
    set(entryRef, updatedEntry)
        .then(() => {
            showToast("Dossiê atualizado com sucesso!", "success");
            closeEditDossierModal();
            showDossierPeople(org);
        })
        .catch((error) => {
            showToast(`Erro ao salvar: ${error.message}`, "error");
        });
};

const removeDossierEntry = (orgName, entryId) => {
    const userTagUpper = currentUserData.tag.toUpperCase();
    if (!currentUserData || (userTagUpper !== 'ADMIN' && userTagUpper !== 'HELLS')) {
        showToast("Apenas Admin/Hells podem remover entradas.", "error");
        return;
    }

    if (confirm("Tem certeza que deseja remover esta PESSOA do dossiê?")) {
        const entryRef = ref(db, `${getFaccaoPath('dossies')}/${orgName}/${entryId}`);
        remove(entryRef)
            .then(() => {
                showToast("Pessoa removida do dossiê.", "success");
                showDossierPeople(orgName);
            })
            .catch((error) => {
                showToast(`Erro ao remover: ${error.message}`, "error");
            });
    }
};

const migrateVendasToDossier = async () => {
    if (!confirm("Isso irá copiar *todas* as vendas com organização para o Dossiê de Pessoas. (Já faz verificação de duplicados). Deseja continuar?")) {
        return;
    }

    showToast("Iniciando migração... Isso pode demorar.", "default", 5000);

    let isSuccess = false; // Flag para rastrear o sucesso

    els.migrateDossierBtn.disabled = true;
    els.migrateDossierBtn.textContent = "Migrando...";

    try {
        const vendasRef = ref(db, getFaccaoPath('vendas'));
        const snapshot = await get(vendasRef);

        if (!snapshot.exists()) {
            showToast("Nenhuma venda encontrada para migrar.", "error");
            isSuccess = true;
            return;
        }

        const vendas = snapshot.val();
        let count = 0;

        for (const vendaId in vendas) {
            const venda = vendas[vendaId];

            const vendaData = {
                cliente: venda.cliente,
                organizacao: venda.organizacao,
                telefone: venda.telefone,
                vendaValorObs: venda.vendaValorObs || 'N/A (Migrado)',
                dataHora: venda.dataHora,
                carro: venda.carro,
                placas: venda.placas
            };

            await addDossierEntry(vendaData, null);
            count++;
        }

        showToast(`Migração concluída! ${count} registros verificados/migrados.`, "success");
        isSuccess = true; // Marca como sucesso

    } catch (error) {
        showToast(`Erro na migração: ${error.message}`, "error");
        isSuccess = false; // Marca como falha
    } finally {
        if (isSuccess) {
            els.migrateDossierBtn.textContent = "Migração Concluída";
        } else {
            els.migrateDossierBtn.disabled = false;
            els.migrateDossierBtn.textContent = "Migrar Vendas Antigas para Dossiê";
        }
    }
};

const migrateVeiculosData = async () => {
    if (!confirm("ATENÇÃO: Isso irá converter TODOS os campos 'carro' e 'placas' (com vírgulas) para o novo sistema de veículos. Faça isso APENAS UMA VEZ.\n\nDeseja continuar?")) {
        return;
    }

    showToast("Iniciando migração de veículos... Isso pode demorar.", "default", 5000);

    let isSuccess = false; // Flag para rastrear o sucesso

    els.migrateVeiculosBtn.disabled = true;
    els.migrateVeiculosBtn.textContent = "Migrando...";

    try {
        const dossiesRef = ref(db, getFaccaoPath('dossies'));
        const snapshot = await get(dossiesRef);

        if (!snapshot.exists()) {
            showToast("Nenhum dossiê encontrado.", "error");
            isSuccess = true;
            return;
        }

        const dossies = snapshot.val();
        let count = 0;
        const updates = {};

        for (const org in dossies) {
            for (const personId in dossies[org]) {
                const person = dossies[org][personId];

                if ((person.carro || person.placas) && !person.veiculos) {
                    const newVeiculos = {};
                    const carros = person.carro ? person.carro.split(',').map(c => c.trim()) : [];
                    const placas = person.placas ? person.placas.split(',').map(p => p.trim()) : [];

                    const maxLen = Math.max(carros.length, placas.length);

                    for (let i = 0; i < maxLen; i++) {
                        const newKey = `mig_${i}`;
                        newVeiculos[newKey] = {
                            carro: carros[i] || 'N/A',
                            placa: placas[i] || 'N/A',
                            fotoUrl: ''
                        };
                    }

                    const path = `dossies/${org}/${personId}`;
                    updates[`${path}/veiculos`] = newVeiculos;
                    updates[`${path}/carro`] = null;
                    updates[`${path}/placas`] = null;
                    count++;
                }
            }
        }

        if (count > 0) {
            await update(ref(db), updates);
            showToast(`Migração de veículos concluída! ${count} registros atualizados.`, "success");
        } else {
            showToast("Nenhum registro antigo para migrar.", "default");
        }

        isSuccess = true; // Marca como sucesso (mesmo se não houver o que migrar)

    } catch (error) {
        showToast(`Erro na migração de veículos: ${error.message}`, "error");
        isSuccess = false; // Marca como falha
    } finally {
        if (isSuccess) {
            els.migrateVeiculosBtn.textContent = "Migração Concluída";
        } else {
            els.migrateVeiculosBtn.disabled = false;
            els.migrateVeiculosBtn.textContent = "Migrar Veículos Antigos (Dossiê)";
        }
    }
};

const toggleTheme = () => {
    const isDarkMode = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    updateLogoAndThemeButton(isDarkMode);
};

const updateLogoAndThemeButton = (isDarkMode) => {
    els.themeBtn.textContent = isDarkMode ? '☀️ Modo Claro' : '🌙 Modo Noturno';
if (els.homeBtn) els.homeBtn.onclick = () => { try { App.navigate('main'); } catch(e) { try { toggleView('main'); } catch(_) {} } };
    els.appLogo.src = isDarkMode ? logoDarkModeSrc : logoLightModeSrc;
    els.welcomeLogo.src = welcomeLogoSrc;
    els.historyImg.src = historyBackgroundSrc;
};

const getRoleTag = () => {
    const raw = (currentUserData && currentUserData.tag) ? String(currentUserData.tag) : 'VISITANTE';
    return raw.toUpperCase();
};

const buildTourSteps = (roleTag) => {
    const base = [
        { element: 'productsContainer', title: 'Produtos', content: 'Aqui ficam os produtos. Coloque a quantidade que você quer calcular.' },
        { element: 'tipoValor', title: 'Tipo de valor', content: 'Escolha o tipo de pagamento (limpo/sujo/aliança). Isso muda os preços.' },
        { element: 'calcBtn', title: 'Calcular', content: 'Clique para calcular materiais necessários e o valor total.' },
        { element: 'results', title: 'Materiais', content: 'Aqui aparecem os materiais totais e a lista por item.' },
        { element: 'registerBtn', title: 'Registrar venda', content: 'Depois de calcular, registre a venda para salvar no histórico.' },
        { element: 'toggleHistoryBtn', title: 'Histórico', content: 'Abra o histórico para ver, copiar, editar e apagar vendas.' },
        { element: 'themeBtn', title: 'Tema', content: 'Alterna entre modo claro e noturno.' }
    ];

    const visitante = [
        { element: 'mainCard', title: 'Visitante', content: 'Como VISITANTE você pode usar a calculadora e ver seus próprios registros.' }
    ];

    const hells = [
        { element: 'investigacaoBtn', title: 'Dossiê', content: 'Como HELLS você tem acesso ao Dossiê (organizações/pessoas) para consulta e gestão.' }
    ];

    const admin = [
        { element: 'adminPanelBtn', title: 'Painel Admin', content: 'Como ADMIN você pode gerenciar usuários e configurações.' },
        { element: 'catalogOpenEditorBtn', title: 'Alterar calculadora', content: 'Ative o editor visual para mudar nomes, materiais, preços e adicionar/remover produtos.' }
    ];

    if (roleTag === 'ADMIN') return [...base, ...admin];
    if (roleTag === 'HELLS') return [...base, ...hells];
    return [...base, ...visitante];
};

let tourSteps = [];

let currentStepIndex = -1; let currentTooltip = null; let tourOverlay = null;
const clearTour = () => { if(tourOverlay) { tourOverlay.classList.remove('active'); setTimeout(() => { if (tourOverlay && tourOverlay.parentNode) tourOverlay.parentNode.removeChild(tourOverlay); tourOverlay = null; }, 300); } if (currentTooltip) { currentTooltip.classList.remove('active'); setTimeout(() => { if (currentTooltip && currentTooltip.parentNode) currentTooltip.parentNode.removeChild(currentTooltip); currentTooltip = null; }, 300); } document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight')); currentStepIndex = -1; };
const showNextTourStep = () => {
    if (!tourSteps || tourSteps.length === 0) {
        showToast("Sem passos de tutorial para mostrar.", "default");
        clearTour();
        return;
    }

    if (currentStepIndex >= 0) {
        document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
        if (currentTooltip) currentTooltip.classList.remove('active');
    }

    let nextIndex = currentStepIndex + 1;
    let step = null;
    while (nextIndex < tourSteps.length) {
        const candidate = tourSteps[nextIndex];
        const el = els[candidate.element];
        if (el) { step = candidate; break; }
        nextIndex++;
    }

    currentStepIndex = nextIndex;

    if (!step || currentStepIndex >= tourSteps.length) {
        showToast("Tutorial concluído!", "success");
        clearTour();
        return;
    }

    const targetElement = els[step.element];

    if (currentStepIndex === 0) {
        tourOverlay = document.createElement('div');
        tourOverlay.id = 'tour-overlay';
        document.body.appendChild(tourOverlay);
        setTimeout(() => tourOverlay.classList.add('active'), 10);
    }

    targetElement.classList.add('tour-highlight');

    if (currentTooltip && currentTooltip.parentNode) document.body.removeChild(currentTooltip);
    currentTooltip = document.createElement('div');
    currentTooltip.className = 'tour-tooltip';

    const pos = currentStepIndex + 1;
    const total = tourSteps.length;
    currentTooltip.innerHTML = `
        <h4>${pos}/${total}: ${step.title}</h4>
        <p>${step.content}</p>
        <div>
            <button class="tourNextBtn">${pos === total ? 'Finalizar' : 'Próximo'}</button>
            <button class="tourSkipBtn">Pular</button>
        </div>
    `;
    document.body.appendChild(currentTooltip);

    const rect = targetElement.getBoundingClientRect();
    const ttRect = currentTooltip.getBoundingClientRect();

    let top = rect.top < ttRect.height + 20
        ? rect.bottom + window.scrollY + 10
        : rect.top + window.scrollY - ttRect.height - 10;

    let left = Math.max(10, Math.min(rect.left + window.scrollX, window.innerWidth - ttRect.width - 20));
    currentTooltip.style.top = `${top}px`;
    currentTooltip.style.left = `${left}px`;

    setTimeout(() => currentTooltip.classList.add('active'), 10);

    currentTooltip.querySelector('.tourNextBtn').onclick = showNextTourStep;
    currentTooltip.querySelector('.tourSkipBtn').onclick = clearTour;

    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

els.calcBtn.onclick = calculate;
els.resetBtn.onclick = clearAllFields;
els.registerBtn.onclick = registerVenda;
els.toggleHistoryBtn.onclick = () => App.navigate('history');
els.toggleCalcBtn.onclick = () => App.navigate('main');
els.clearHistoryBtn.onclick = clearHistory;
els.csvBtn.onclick = exportToCsv;
els.themeBtn.onclick = toggleTheme;
els.tutorialBtn.onclick = () => {
    if (!currentUser) {
        showToast("Faça login para iniciar o tutorial.", "default");
        return;
    }
    App.navigate('main');

    clearTour();
    tourSteps = buildTourSteps(getRoleTag());
    showNextTourStep();
};
els.discordBtnCalc.onclick = () => copyDiscordMessage(false, null);
els.filtroHistorico.addEventListener('input', filterHistory);

els.nomeCliente.addEventListener('change', autoFillFromDossier);

els.investigacaoBtn.onclick = () => App.navigate('dossier');
els.hierarquiaBtn.onclick = () => App.navigate('hierarquia');
els.leaderPanelBtn.onclick = () => App.navigate('leader');
els.toggleCalcBtnDossier.onclick = () => App.navigate('main');
els.leaderBackBtn.onclick = () => App.navigate('main');
els.hierarquiaBackBtn.onclick = () => App.navigate('main');

els.filtroDossierOrgs.addEventListener('input', filterOrgs);
els.addOrgBtn.onclick = openAddOrgModal;

els.dossierVoltarBtn.onclick = () => requestAnimationFrame(() => showDossierOrgs());
els.filtroDossierPeople.addEventListener('input', filterPeople);
els.addPessoaBtn.onclick = () => {
    const orgName = els.addPessoaBtn.dataset.orgName;
    if(orgName) { openAddDossierModal(orgName); }
};

els.dossierPeopleGrid.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-dossier-btn');
    const deleteBtn = e.target.closest('.delete-dossier-btn');
    const fotoLinkBtn = e.target.closest('.veiculo-foto-link');

    if (fotoLinkBtn) {
        e.preventDefault();
        const url = fotoLinkBtn.dataset.url;
        showImageLightbox(url);
    }

    if (deleteBtn) {
        const org = deleteBtn.dataset.org;
        const id = deleteBtn.dataset.id;
        removeDossierEntry(org, id);
    }
    if (editBtn) {
        const org = editBtn.dataset.org;
        const id = editBtn.dataset.id;
        openEditDossierModal(org, id);
    }
});

els.dossierOrgGrid.addEventListener('click', (e) => {
    const editBtn = e.target.closest('.edit-dossier-btn');
    const deleteBtn = e.target.closest('.delete-dossier-btn');
    const fotoLinkBtn = e.target.closest('.veiculo-foto-link');

    if (fotoLinkBtn) {
        e.preventDefault();
        const url = fotoLinkBtn.dataset.url;
        showImageLightbox(url);
    }

    if (deleteBtn) {
        const org = deleteBtn.dataset.org;
        const id = deleteBtn.dataset.id;
        removeDossierEntry(org, id);
    }
    if (editBtn) {
        const org = editBtn.dataset.org;
        const id = editBtn.dataset.id;
        openEditDossierModal(org, id);
    }
});

els.saveDossierBtn.onclick = saveDossierChanges;
els.cancelDossierBtn.onclick = closeEditDossierModal;
els.editDossierOverlay.onclick = closeEditDossierModal;

els.saveNewDossierBtn.onclick = saveNewDossierEntry;
els.cancelNewDossierBtn.onclick = closeAddDossierModal;
els.addDossierOverlay.onclick = closeAddDossierModal;

els.addModalAddVeiculoBtn.onclick = () => adicionarOuAtualizarVeiculoTemp('addModal');
els.editModalAddVeiculoBtn.onclick = () => adicionarOuAtualizarVeiculoTemp('editModal');

els.addModalCancelVeiculoBtn.onclick = () => cancelarEdicaoVeiculo('addModal');
els.editModalCancelVeiculoBtn.onclick = () => cancelarEdicaoVeiculo('editModal');

els.addModalListaVeiculos.onclick = (e) => {
    const removeBtn = e.target.closest('.remove-veiculo-btn');
    const editBtn = e.target.closest('.edit-veiculo-btn');

    if (removeBtn) {
        removerVeiculoTemp(removeBtn.dataset.key, els.addModalListaVeiculos);
    }
    if (editBtn) {
        iniciarEdicaoVeiculo(editBtn.dataset.key, 'addModal');
    }
};
els.editModalListaVeiculos.onclick = (e) => {
    const removeBtn = e.target.closest('.remove-veiculo-btn');
    const editBtn = e.target.closest('.edit-veiculo-btn');

    if (removeBtn) {
        removerVeiculoTemp(removeBtn.dataset.key, els.editModalListaVeiculos);
    }
    if (editBtn) {
        iniciarEdicaoVeiculo(editBtn.dataset.key, 'editModal');
    }
};

els.saveOrgBtn.onclick = saveOrg;
els.deleteOrgBtn.onclick = deleteOrg;
els.cancelOrgBtn.onclick = closeOrgModal;
els.orgModalOverlay.onclick = closeOrgModal;

els.imageLightboxOverlay.onclick = closeImageLightbox;

els.migrateDossierBtn.onclick = migrateVendasToDossier;
els.migrateVeiculosBtn.onclick = migrateVeiculosData;
els.toggleCalcBtnAdmin.onclick = () => App.navigate('main');


if (els.adminReloadUsersBtn) els.adminReloadUsersBtn.onclick = adminLoadUsersPublic;
if (els.adminUserSearch) els.adminUserSearch.addEventListener('input', () => adminLoadUsersPublic());
if (els.adminApplyUserToFaccaoBtn) els.adminApplyUserToFaccaoBtn.onclick = adminApplyUserToFaccao;
if (els.adminMakeAdminBtn) els.adminMakeAdminBtn.onclick = () => adminSetGlobalRole('admin');
if (els.adminMakeUserBtn) els.adminMakeUserBtn.onclick = () => adminSetGlobalRole('user');
if (els.adminReloadRankingBtn) els.adminReloadRankingBtn.onclick = adminBuildRanking;
if (els.adminReloadLogsBtn) els.adminReloadLogsBtn.onclick = adminLoadLogs;
if (els.adminClearLogsBtn) els.adminClearLogsBtn.onclick = adminClearLogs;
if (els.adminDownloadBackupBtn) els.adminDownloadBackupBtn.onclick = adminDownloadBackup;

els.saveBottomPanelTextBtn.onclick = () => {
    const newText = els.bottomPanelText.value.trim();
    updateGlobalLayout('bottomPanelText', newText);
    showToast("Mensagem do rodapé salva!", "success");
};

const deleteUser = (uid, displayName) => {
    if (confirm(`ATENÇÃO:\n\nTem certeza que deseja apagar o usuário "${displayName}"?\n\nIsso removerá o registro dele do banco de dados (e suas permissões).\n\nIMPORTANTE: Para apagar o LOGIN dele permanentemente, você ainda precisará ir ao painel "Authentication" do Firebase.`)) {

        const userRef = ref(db, `usuarios/${uid}`);
        remove(userRef)
            .then(() => {
                showToast(`Usuário "${displayName}" apagado do banco de dados.`, 'success');
                loadAdminPanel();
            })
            .catch((error) => {
                showToast(`Erro ao apagar usuário: ${error.message}`, 'error');
            });
    }
};

const loadAdminPanel = async (fetchStatus = true) => {

    if (fetchStatus) {
        const statusSnapshot = await get(ref(db, 'onlineStatus'));
        const now = Date.now();
        globalOnlineStatus = {};

        if (statusSnapshot.exists()) {
            statusSnapshot.forEach(child => {
                const userStatus = child.val();
                const inactivity = now - userStatus.lastActive;
                const isOnline = inactivity < 60000;

                globalOnlineStatus[child.key] = {
                    isOnline: isOnline,
                    inactivity: inactivity
                };
            });
        }
    }

    els.adminUserListBody.innerHTML = '<tr><td colspan="2" style="text-align: center;">Carregando...</td></tr>';

    try {
        const usersSnapshot = await get(ref(db, 'usuarios'));
        if (!usersSnapshot.exists()) {
            els.adminUserListBody.innerHTML = '<tr><td colspan="2" style="text-align: center;">Nenhum usuário encontrado.</td></tr>';
            return;
        }

        const usersList = [];
        usersSnapshot.forEach(userSnap => {
            const userData = userSnap.val();
            if (userData.displayName && userData.displayName.toLowerCase() === 'snow') {
                return;
            }
            usersList.push({ uid: userSnap.key, ...userData });
        });

        const tagOrder = { 'ADMIN': 1, 'HELLS': 2, 'VISITANTE': 3 };

        usersList.sort((a, b) => {
            const statusA = globalOnlineStatus[a.uid] || { isOnline: false, inactivity: Infinity };
            const statusB = globalOnlineStatus[b.uid] || { isOnline: false, inactivity: Infinity };

            if (statusA.isOnline !== statusB.isOnline) {
                return statusA.isOnline ? -1 : 1;
            }

            const tagA = (tagOrder[a.tag.toUpperCase()] || 4);
            const tagB = (tagOrder[b.tag.toUpperCase()] || 4);
            if (tagA !== tagB) {
                return tagA - tagB;
            }

            if (statusA.inactivity !== statusB.inactivity) {
                return statusA.inactivity - statusB.inactivity;
            }

            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        els.adminUserListBody.innerHTML = '';

        usersList.forEach(user => {
            const uid = user.uid;
            const userData = user;
            const status = globalOnlineStatus[uid] || { isOnline: false, inactivity: Infinity };

            const row = els.adminUserListBody.insertRow();

            const mainCell = row.insertCell();
            mainCell.style.verticalAlign = 'top'; // Alinha no topo para a pilha
            mainCell.style.padding = '8px 6px'; // Espaçamento padrão

            const nameDiv = document.createElement('div');
            nameDiv.style.display = 'flex';
            nameDiv.style.alignItems = 'center';
            nameDiv.style.fontWeight = '700';
            nameDiv.style.fontSize = '16px'; // Destaque para o nome
            nameDiv.style.marginBottom = '4px'; // Espaço abaixo do nome

            const statusDotClass = status.isOnline ? 'status-online' : 'status-offline';
            const displayNameText = userData.displayName || '(Sem nome)';

            nameDiv.innerHTML = `
                <span class="status-dot ${statusDotClass}" title="${status.isOnline ? 'Online' : 'Inativo'}" style="flex-shrink: 0;"></span>
                <span>${displayNameText}</span>
            `;
            mainCell.appendChild(nameDiv);

            const activitySpan = document.createElement('span');
            activitySpan.style.fontSize = '13px';
            activitySpan.style.display = 'block'; // Empilha abaixo do nome
            activitySpan.style.marginLeft = '20px'; // Indenta (abaixo do nome, alinhado com o texto)
            activitySpan.style.marginBottom = '8px'; // Espaço abaixo da atividade

            const statusText = status.isOnline
                                ? `Ativo (agora)`
                                : `Inativo há ${formatInactivityTime(status.inactivity)}`;
            activitySpan.textContent = statusText;

            if (status.isOnline) {
                activitySpan.style.color = '#00b33c';
            } else {
                activitySpan.style.color = 'var(--cor-erro)';
            }

            if (!status.isOnline && status.inactivity > 60000 * 60 * 24) { // Mais de 24h
                 activitySpan.textContent = 'Inativo há muito tempo';
                 activitySpan.style.color = '#888';
            }
            mainCell.appendChild(activitySpan);

            const tagContainer = document.createElement('div');
            tagContainer.style.marginLeft = '20px'; // Indenta

            if (uid === currentUser.uid) {
                tagContainer.textContent = `👑 ${userData.tag} (Você)`;
                tagContainer.style.fontWeight = '600';
            } else {
                const select = document.createElement('select');
                select.style.width = 'auto'; // Ajusta ao conteúdo
                select.style.maxWidth = '200px';
                select.dataset.uid = uid;

                const optVisitante = document.createElement('option');
                optVisitante.value = 'Visitante';
                optVisitante.textContent = 'Visitante';
                select.appendChild(optVisitante);

                const optHells = document.createElement('option');
                optHells.value = 'HELLS';
                optHells.textContent = 'Hells';
                select.appendChild(optHells);

                const optAdmin = document.createElement('option');
                optAdmin.value = 'ADMIN';
                optAdmin.textContent = '👑 Administrador';
                select.appendChild(optAdmin);

                select.value = userData.tag.toUpperCase() === 'HELLS' ? 'HELLS' : (userData.tag.toUpperCase() === 'ADMIN' ? 'ADMIN' : 'Visitante');
                select.onchange = (e) => updateUserTag(e.target.dataset.uid, e.target.value);
                tagContainer.appendChild(select);
            }
            mainCell.appendChild(tagContainer);

            const actionsCell = row.insertCell();
            actionsCell.style.textAlign = 'center';
            actionsCell.style.verticalAlign = 'middle';

            if (uid === currentUser.uid) {
                actionsCell.textContent = '---';
            } else {
                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '❌';
                deleteBtn.className = 'danger action-btn';
                deleteBtn.style.padding = '5px 8px';
                deleteBtn.style.fontSize = '14px';
                deleteBtn.style.lineHeight = '1';

                deleteBtn.addEventListener('click', () => {
                    deleteUser(uid, userData.displayName);
                });

                actionsCell.appendChild(deleteBtn);
            }
        });

    } catch (error) {
        showToast(`Erro ao carregar usuários: ${error.message}`, 'error');
        els.adminUserListBody.innerHTML = `<tr><td colspan="2" style="text-align: center;">Erro ao carregar. ${error.message}</td></tr>`;
    }

    try {
        const layoutSnapshot = await get(ref(db, 'configuracoesGlobais/layout'));
        if (layoutSnapshot.exists()) {
            const settings = layoutSnapshot.val();
            els.layoutToggleNightMode.checked = settings.enableNightMode;
            els.layoutToggleBottomPanel.checked = settings.enableBottomPanel;
            els.bottomPanelText.value = settings.bottomPanelText || '';
        }
    } catch (error) {
        if(error.code !== "PERMISSION_DENIED") {
            showToast(`Erro ao carregar configurações de layout: ${error.message}`, 'error');
        }
    }
};

const updateUserTag = (uid, newTag) => {
    const tagRef = ref(db, `usuarios/${uid}/tag`);
    set(tagRef, newTag)
        .then(() => {
            showToast("Permissão do usuário atualizada!", 'success');
        })
        .catch((error) => {
            showToast(`Erro ao atualizar tag: ${error.message}`, 'error');
        });
};

const updateGlobalLayout = (key, value) => {
    const layoutRef = ref(db, `configuracoesGlobais/layout/${key}`);
    set(layoutRef, value)
        .catch((error) => {
            showToast(`Erro ao salvar configuração: ${error.message}`, 'error');
        });
};

els.adminPanelBtn.onclick = () => { App.navigate('main'); if (typeof renderCatalogTextarea === 'function') renderCatalogTextarea(); if (typeof loadCatalogFromDB === 'function') loadCatalogFromDB(); };
els.layoutToggleNightMode.onchange = (e) => updateGlobalLayout('enableNightMode', e.target.checked);
els.layoutToggleBottomPanel.onchange = (e) => updateGlobalLayout('enableBottomPanel', e.target.checked);

const cloneObj = (o) => structuredClone(o || {});
const buildCatalogDraft = () => ({
    labels: cloneObj(productLabels),
    perUnit: cloneObj(perUnit),
    valores: cloneObj(valores),
});

const ensurePriceShape = (obj) => ({
    limpo: Number(obj?.limpo ?? 0) || 0,
    sujo: Number(obj?.sujo ?? 0) || 0,
    limpo_alianca: Number(obj?.limpo_alianca ?? 0) || 0,
    sujo_alianca: Number(obj?.sujo_alianca ?? 0) || 0,
});

const catalogKeySanitize = (raw) => String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');

const openCatalogEditor = async () => {
    try {
        const snap = await get(ref(db, 'config/catalog'));
        applyCatalogConfig(snap.exists() ? snap.val() : null);
    } catch (e) {
    }

    const existing = document.getElementById('catalogEditorModal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'catalogEditorModal';
    modal.style.position = 'fixed';
    modal.style.inset = '0';
    modal.style.zIndex = '99999';
    modal.style.background = 'var(--cor-overlay)';
    modal.style.display = 'flex';
    modal.style.alignItems = 'center';
    modal.style.justifyContent = 'center';
    modal.innerHTML = `
      <div style="width:min(1100px, 95vw); height:min(720px, 92vh); background: var(--cor-card); border:1px solid var(--cor-borda); color: var(--cor-texto); border-radius: 18px; overflow:hidden; box-shadow: 0 20px 60px rgba(0,0,0,.5); display:flex; flex-direction:column;">
        <div style="padding:14px 16px; display:flex; gap:10px; align-items:center; justify-content:space-between; border-bottom:1px solid var(--cor-borda);">
          <div>
            <div style="font-weight:800; letter-spacing:.2px;">Alterar Calculadora</div>
            <div style="opacity:.75; font-size:12px;">Edite nomes, materiais e preços. Sem JSON.</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button id="catCloseBtn" class="muted">Fechar</button>
          </div>
        </div>

        <div style="flex:1; display:flex; min-height:0;">
          <div style="width: 340px; border-right:1px solid var(--cor-borda); padding:12px; display:flex; flex-direction:column; gap:10px; min-height:0;">
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
              <input id="catNewKey" placeholder="chave (ex: c4)" style="flex:1; min-width: 140px; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
              <input id="catNewLabel" placeholder="nome (ex: C4)" style="flex:1; min-width: 140px; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
              <button id="catAddBtn" class="muted" style="width:100%;">Adicionar produto</button>
            </div>

            <div style="display:flex; gap:8px;">
              <input id="catSearch" placeholder="buscar..." style="flex:1; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
            </div>

            <div id="catList" style="flex:1; overflow:auto; padding-right:4px;"></div>
          </div>

          <div style="flex:1; padding:14px; overflow:auto;" id="catEditorPane"></div>
        </div>

        <div style="padding:12px 16px; display:flex; gap:10px; justify-content:flex-end; border-top:1px solid rgba(255,255,255,.10); flex-wrap:wrap;">
          <button id="catReloadBtn" class="muted">Recarregar do Banco</button>
          <button id="catResetBtn" class="muted">Resetar padrão</button>
          <button id="catSaveBtn" class="success">Salvar no Banco</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    let draft = buildCatalogDraft();
    let selectedKey = null;

    const listEl = modal.querySelector('#catList');
    const paneEl = modal.querySelector('#catEditorPane');
    const searchEl = modal.querySelector('#catSearch');

    const getAllKeys = () => {
        const setKeys = new Set([
            ...Object.keys(draft.perUnit || {}),
            ...Object.keys(draft.valores || {}),
            ...Object.keys(draft.labels || {})
        ]);
        return Array.from(setKeys).filter(Boolean).sort((a,b)=>a.localeCompare(b));
    };

    const labelOf = (k) => (draft.labels && draft.labels[k]) ? String(draft.labels[k]) : capitalizeText(String(k).replace(/_/g,' '));

    const renderList = () => {
        const q = String(searchEl.value || '').trim().toLowerCase();
        const keys = getAllKeys().filter(k => {
            if (!q) return true;
            return k.includes(q) || labelOf(k).toLowerCase().includes(q);
        });

        if (!keys.length) {
            listEl.innerHTML = `<div style="opacity:.7; font-size:13px; padding:10px;">Nenhum produto.</div>`;
            return;
        }

        listEl.innerHTML = keys.map(k => {
            const active = k === selectedKey;
            return `
              <button data-key="${k}" style="width:100%; text-align:left; padding:10px 12px; border-radius:12px; border:1px solid var(--cor-borda); background:${active ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.12)'}; color:inherit; margin-bottom:8px;">
                <div style="font-weight:700;">${labelOf(k)}</div>
                <div style="opacity:.7; font-size:12px;">${k}</div>
              </button>
            `;
        }).join('');

        listEl.querySelectorAll('button[data-key]').forEach(b => {
            b.onclick = () => {
                selectedKey = b.dataset.key;
                renderList();
                renderEditor();
            };
        });
    };

    const renderMaterialsTable = (k) => {
        const mats = draft.perUnit?.[k] || {};
        const rows = Object.entries(mats).sort((a,b)=>a[0].localeCompare(b[0])).map(([mk, mv]) => `
          <tr>
            <td style="padding:8px 6px;">
              <input class="catMatKey" data-old="${mk}" value="${mk}" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
            </td>
            <td style="padding:8px 6px; width:140px;">
              <input class="catMatVal" data-key="${mk}" type="number" min="0" value="${Number(mv)||0}" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
            </td>
            <td style="padding:8px 6px; width:90px; text-align:right;">
              <button class="muted catMatRemove" data-key="${mk}">Remover</button>
            </td>
          </tr>
        `).join('');

        return `
          <table style="width:100%; border-collapse:collapse;">
            <thead>
              <tr>
                <th style="text-align:left; padding:6px; opacity:.8; font-size:12px;">Material</th>
                <th style="text-align:left; padding:6px; opacity:.8; font-size:12px;">Qtd</th>
                <th style="padding:6px;"></th>
              </tr>
            </thead>
            <tbody>
              ${rows || `<tr><td colspan="3" style="padding:10px; opacity:.7;">Sem materiais ainda.</td></tr>`}
            </tbody>
          </table>
          <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
            <input id="catNewMatKey" placeholder="novo_material (ex: cobre)" style="flex:1; min-width:200px; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
            <input id="catNewMatVal" placeholder="qtd" type="number" min="0" value="0" style="width:140px; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
            <button id="catAddMatBtn" class="muted">Adicionar material</button>
          </div>
        `;
    };

    const renderEditor = () => {
        if (!selectedKey) {
            paneEl.innerHTML = `
              <div style="opacity:.8; padding:14px; border:1px dashed rgba(255,255,255,.18); border-radius:16px;">
                Selecione um produto à esquerda para editar.
              </div>
            `;
            return;
        }

        draft.perUnit = draft.perUnit || {};
        draft.valores = draft.valores || {};
        draft.labels = draft.labels || {};
        if (!draft.perUnit[selectedKey]) draft.perUnit[selectedKey] = {};
        if (!draft.valores[selectedKey]) draft.valores[selectedKey] = ensurePriceShape({});
        else draft.valores[selectedKey] = ensurePriceShape(draft.valores[selectedKey]);
        if (!draft.labels[selectedKey]) draft.labels[selectedKey] = labelOf(selectedKey);

        const v = draft.valores[selectedKey];

        paneEl.innerHTML = `
          <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:10px; flex-wrap:wrap;">
            <div>
              <div style="font-weight:800; font-size:18px;">${labelOf(selectedKey)}</div>
              <div style="opacity:.7; font-size:12px;">Chave: <span style="font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace;">${selectedKey}</span></div>
            </div>
            <div>
              <button id="catRemoveProductBtn" class="muted">Remover produto</button>
            </div>
          </div>

          <div style="margin-top:14px; display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
            <div style="grid-column: 1 / -1;">
              <label style="opacity:.8; font-size:12px;">Nome do produto</label>
              <input id="catLabelInp" value="${String(draft.labels[selectedKey]||'')}" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
            </div>

            <div>
              <label style="opacity:.8; font-size:12px;">Preço (Limpo)</label>
              <input id="catP_limbo" type="number" min="0" value="${v.limpo}" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
            </div>
            <div>
              <label style="opacity:.8; font-size:12px;">Preço (Sujo)</label>
              <input id="catP_sujo" type="number" min="0" value="${v.sujo}" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
            </div>
            <div>
              <label style="opacity:.8; font-size:12px;">Preço (Limpo - Aliança)</label>
              <input id="catP_la" type="number" min="0" value="${v.limpo_alianca}" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
            </div>
            <div>
              <label style="opacity:.8; font-size:12px;">Preço (Sujo - Aliança)</label>
              <input id="catP_sa" type="number" min="0" value="${v.sujo_alianca}" style="width:100%; padding:10px; border-radius:12px; border:1px solid var(--cor-borda); background:var(--cor-input-fundo); color: var(--cor-texto);">
            </div>
          </div>

          <div style="margin-top:16px; padding-top:12px; border-top:1px solid rgba(255,255,255,.10);">
            <div style="font-weight:800; margin-bottom:8px;">Materiais por unidade</div>
            ${renderMaterialsTable(selectedKey)}
          </div>
        `;

        paneEl.querySelector('#catLabelInp').oninput = (e) => {
            draft.labels[selectedKey] = String(e.target.value || '').trim();
            renderList();
        };

        const readPrice = (id) => Number(paneEl.querySelector(id).value) || 0;
        const syncPrices = () => {
            draft.valores[selectedKey] = ensurePriceShape({
                limpo: readPrice('#catP_limbo'),
                sujo: readPrice('#catP_sujo'),
                limpo_alianca: readPrice('#catP_la'),
                sujo_alianca: readPrice('#catP_sa'),
            });
        };
        ['#catP_limbo','#catP_sujo','#catP_la','#catP_sa'].forEach(sel => {
            paneEl.querySelector(sel).addEventListener('input', syncPrices);
        });

        paneEl.querySelectorAll('input.catMatVal').forEach(inp => {
            inp.oninput = () => {
                const k = inp.dataset.key;
                draft.perUnit[selectedKey][k] = Number(inp.value) || 0;
            };
        });
        paneEl.querySelectorAll('button.catMatRemove').forEach(btn => {
            btn.onclick = () => {
                const mk = btn.dataset.key;
                delete draft.perUnit[selectedKey][mk];
                renderEditor();
            };
        });
        paneEl.querySelectorAll('input.catMatKey').forEach(inp => {
            inp.onchange = () => {
                const oldK = inp.dataset.old;
                const newK = catalogKeySanitize(inp.value);
                if (!newK) { inp.value = oldK; return; }
                if (newK !== oldK) {
                    const val = draft.perUnit[selectedKey][oldK];
                    delete draft.perUnit[selectedKey][oldK];
                    draft.perUnit[selectedKey][newK] = Number(val) || 0;
                    renderEditor();
                }
            };
        });

        const addMatBtn = paneEl.querySelector('#catAddMatBtn');
        addMatBtn.onclick = () => {
            const mk = catalogKeySanitize(paneEl.querySelector('#catNewMatKey').value);
            const mv = Number(paneEl.querySelector('#catNewMatVal').value) || 0;
            if (!mk) { showToast('Digite o nome do material.', 'error'); return; }
            draft.perUnit[selectedKey][mk] = mv;
            renderEditor();
        };

        paneEl.querySelector('#catRemoveProductBtn').onclick = () => {
            if (!confirm(`Remover "${labelOf(selectedKey)}" (${selectedKey})?`)) return;
            delete draft.perUnit[selectedKey];
            delete draft.valores[selectedKey];
            delete draft.labels[selectedKey];
            selectedKey = null;
            renderList();
            renderEditor();
        };
    };

    const saveDraftToDB = async () => {
        const payload = normalizeCatalogConfig({
            perUnit: draft.perUnit,
            valores: draft.valores,
            labels: draft.labels,
        });

        try {
            await set(ref(db, 'config/catalog'), payload);
            applyCatalogConfig(payload);
            showToast('Calculadora atualizada e salva no banco!', 'success');
        } catch (e) {
            showToast(`Erro ao salvar: ${e.message}`, 'error');
        }
    };

    modal.querySelector('#catCloseBtn').onclick = () => modal.remove();
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });

    modal.querySelector('#catAddBtn').onclick = () => {
        const key = catalogKeySanitize(modal.querySelector('#catNewKey').value);
        const label = String(modal.querySelector('#catNewLabel').value || '').trim();

        if (!key) { showToast('Digite a chave do produto (ex: c4).', 'error'); return; }
        if (draft.perUnit?.[key] || draft.valores?.[key] || draft.labels?.[key]) {
            showToast('Esse produto já existe.', 'error'); return;
        }

        draft.perUnit[key] = {};
        draft.valores[key] = ensurePriceShape({});
        draft.labels[key] = label || capitalizeText(key.replace(/_/g,' '));

        modal.querySelector('#catNewKey').value = '';
        modal.querySelector('#catNewLabel').value = '';

        selectedKey = key;
        renderList();
        renderEditor();
        showToast(`Produto "${draft.labels[key]}" adicionado.`, 'success');
    };

    modal.querySelector('#catSaveBtn').onclick = saveDraftToDB;

    modal.querySelector('#catReloadBtn').onclick = async () => {
        try {
            const snap = await get(ref(db, 'config/catalog'));
            applyCatalogConfig(snap.exists() ? snap.val() : null);
            draft = buildCatalogDraft();
            selectedKey = null;
            renderList();
            renderEditor();
            showToast('Recarregado do banco.', 'success');
        } catch (e) {
            showToast(`Erro ao recarregar: ${e.message}`, 'error');
        }
    };

    modal.querySelector('#catResetBtn').onclick = () => {
        if (!confirm('Resetar para o padrão? (Você ainda precisa clicar em "Salvar no Banco" para aplicar)')) return;
        draft = {
            labels: structuredClone(defaultLabels),
            perUnit: structuredClone(defaultPerUnit),
            valores: structuredClone(defaultValores),
        };
        selectedKey = null;
        renderList();
        renderEditor();
        showToast('Padrão carregado no editor.', 'success');
    };

    searchEl.oninput = renderList;

    renderList();
    renderEditor();
};

if (els.catalogOpenEditorBtn) els.catalogOpenEditorBtn.onclick = openCatalogEditor;

const handleAuthAction = (isLogin, creds) => {
    const email = creds.username.trim() + "@ha.com";
    const password = creds.password;
    const displayName = creds.username.trim();

    if ((isLogin && (!email || password.length < 6)) || (!isLogin && (!displayName || password.length < 6))) {
        showToast("Verifique os campos. A senha precisa ter no mínimo 6 caracteres.", "error");
        return;
    }

    if (isLogin) {
        signInWithEmailAndPassword(auth, email, password)
            .catch((error) => {
                const code = error.code;
                const msg = code === 'auth/invalid-credential' ? "Usuário ou senha incorretos." : `Erro: ${code}`;
                showToast(msg, "error");
            });
    } else {
        createUserWithEmailAndPassword(auth, email, password)
            .then(userCredential => {
                const user = userCredential.user;
                return updateProfile(user, { displayName: displayName })
                    .then(() => {
                        const userRef = ref(db, `usuarios/${user.uid}`);
                        const newUserProfile = {
                            displayName: displayName,
                            email: user.email,
                            tag: normalizeTag(displayName) || displayName
                        };
                        return set(userRef, newUserProfile).then(() => set(ref(db, `usuariosPublic/${user.uid}`), { displayName, tag: newUserProfile.tag || '', faccaoId: null, updatedAt: Date.now() })).then(() => ensureTagIndex(user.uid, displayName)).then(() => ensureTagIndex(user.uid, displayName));
                    });
            })
            .catch((error) => {
                const code = error.code;
                const msg = code === 'auth/email-already-in-use' ? "Nome de usuário já existe." : `Erro: ${code}`;
                showToast(msg, "error");
            });
    }
};

const authAction = (isLogin) => handleAuthAction(isLogin, {username: els.username.value, password: els.password.value});

els.loginBtn.onclick = () => authAction(true);
els.registerUserBtn.onclick = () => authAction(false);
els.logoutBtn.onclick = () => signOut(auth);
els.password.addEventListener('keydown', (e) => { if(e.key === 'Enter') authAction(true); });

els.forgotPasswordLink.onclick = async () => {
    const username = prompt("Digite seu nome de usuário para solicitar a redefinição de senha:");
    if (!username) return;

    const usersRef = ref(db, 'usuarios');
    const snapshot = await get(usersRef);
    let userEmail = null;
    if(snapshot.exists()) {
        snapshot.forEach(child => {
            const userData = child.val();
            if(userData.displayName.toLowerCase() === username.toLowerCase().trim()) {
                userEmail = userData.email;
            }
        });
    }

    if (userEmail) {
        sendPasswordResetEmail(auth, userEmail)
            .then(() => {
                alert("Um e-mail de redefinição de senha foi enviado para o endereço associado a este usuário.");
                showToast("E-mail de redefinição enviado!", "success");
            })
            .catch(err => showToast(`Erro: ${err.message}`, "error"));
    } else {
        showToast("Nome de usuário não encontrado.", "error");
    }
};

const configurarInterfacePorTag = (tag) => {
  const tagUpper = tag ? tag.toUpperCase() : 'VISITANTE';

  const userStatusEl = els.userStatus;
  if (currentUser && userStatusEl) {

      if (currentUser.displayName.toLowerCase() === 'snow') {
          userStatusEl.style.display = 'none';
      } else {
          userStatusEl.textContent = `${currentUser.displayName} (${tag})`;
          userStatusEl.className = 'user-status-display';
          if (tagUpper === 'ADMIN') {
              userStatusEl.classList.add('tag-admin');
          } else if (tagUpper === 'HELLS') {
              userStatusEl.classList.add('tag-hells');
          } else {
              userStatusEl.classList.add('tag-visitante');
          }
          userStatusEl.style.display = 'block';
      }
  }

  if (tagUpper === 'ADMIN') {
    els.clearHistoryBtn.style.display = 'inline-block';
    els.adminPanelBtn.style.display = 'inline-block';
  } else {
    els.clearHistoryBtn.style.display = 'none';
    els.adminPanelBtn.style.display = 'none';
  }

  if (tagUpper === 'ADMIN' || tagUpper === 'HELLS') {
      els.investigacaoBtn.style.display = 'block';
  } else {
      els.investigacaoBtn.style.display = 'none';
  }

  if (tagUpper !== 'ADMIN') {
      els.adminPanel.style.display = 'none';
  }
};

let vendasListener = null;
// Default UI permissions until login role is resolved
try { if (typeof applyRoleUI === 'function') applyRoleUI('user'); } catch(e) {}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        const userRef = ref(db, `usuarios/${user.uid}`);

        updateUserActivity();
        monitorOnlineStatus(); // Inicia o monitoramento de status
        listenCatalogConfig(); // Carrega/escuta preços e materiais (config do Admin)

        onValue(userRef, async (snapshot) => {
            if (snapshot.exists()) {
                currentUserData = snapshot.val();
                // Role resolution (DB role > tag)
                const dbRole = await fetchUserRole(user.uid);
                App.setRole(dbRole || roleFromTag(currentUserData && currentUserData.tag));
            } else {
                const newUserProfile = {
                    displayName: user.displayName,
                    email: user.email,
                    tag: normalizeTag(displayName) || displayName
                };
                set(userRef, newUserProfile).then(() => ensureTagIndex(user.uid, displayName));
                currentUserData = newUserProfile;
            }

            configurarInterfacePorTag(currentUserData.tag);

            if(vendasListener) vendasListener();

            let vendasRef;
            const userTagUpper = currentUserData.tag.toUpperCase();

            if (userTagUpper === 'ADMIN' || userTagUpper === 'HELLS') {
                vendasRef = ref(db, getFaccaoPath('vendas'));
            } else {
                vendasRef = query(ref(db, getFaccaoPath('vendas')), orderByChild('registradoPorId'), equalTo(currentUser.uid));
            }

            vendasListener = onValue(vendasRef, (vendasSnapshot) => {
                vendas = [];
                vendasSnapshot.forEach((child) => {
                    vendas.push({ id: child.key, ...child.val() });
                });
                if (els.historyCard.style.display !== 'none') {
                    requestAnimationFrame(() => displaySalesHistory(vendas));
                }
            }, (error) => {
                console.error("Erro ao carregar vendas: ", error);
                if(error.code !== "PERMISSION_DENIED") {
                    showToast("Erro de permissão ao carregar histórico.", "error");
                }
            });
        }, (error) => {
            console.error("Erro ao ler dados do usuário:", error);
            showToast("Erro fatal ao ler permissões do usuário.", "error");
            configurarInterfacePorTag('Visitante');
        });

        els.authScreen.style.display = 'none';
        App.navigate('main');

    } else {
        currentUser = null;
        currentUserData = null;
        vendaOriginalCliente = null;
        vendaOriginalOrganizacao = null;
        if (vendasListener) vendasListener();
        vendas = [];

        els.authScreen.style.display = 'block';
        els.mainCard.style.display = 'none';
        els.historyCard.style.display = 'none';
        els.adminPanel.style.display = 'none';
        els.dossierCard.style.display = 'none';
    if (els.leaderPanel) els.leaderPanel.style.display = 'none';
    if (els.hierarquiaCard) els.hierarquiaCard.style.display = 'none';
        if(els.userStatus) els.userStatus.style.display = 'none';
        if(els.investigacaoBtn) els.investigacaoBtn.style.display = 'none';
    }
});

const savedTheme = localStorage.getItem('theme') || 'light';
if(savedTheme === 'dark') {
    document.body.classList.add('dark');
}
updateLogoAndThemeButton(savedTheme === 'dark');

if (localStorage.getItem('hasVisited')) {
    els.welcomeScreen.style.display = 'none';
} else {
    els.welcomeScreen.classList.add('show');
    els.authScreen.style.display = 'none';
    els.mainCard.style.display = 'none';
}

els.enterBtn.onclick = () => {
    localStorage.setItem('hasVisited', 'true');
    els.welcomeScreen.classList.add('hidden');
    setTimeout(() => {
        els.welcomeScreen.style.display = 'none';
    }, 500);
};


// === Painel do Líder ===
async function openLeaderPanel() {
  try {
    const fid = getFaccaoId();
    if (els.leaderFaccaoLabel) els.leaderFaccaoLabel.textContent = fid ? `Facção: ${fid}` : 'Facção não definida';
    await leaderLoadMembers();
    await leaderLoadCargosEditor();
  } catch (e) { console.error(e); }
}

async function leaderLoadMembers() {
  const fid = getFaccaoId();
  if (!fid) { if (els.leaderMembersTbody) els.leaderMembersTbody.innerHTML = '<tr><td colspan="4" style="padding:10px;">Sem facção.</td></tr>'; return; }
  const snap = await get(ref(db, `faccaoMembros/${fid}`));
  const members = snap.exists() ? snap.val() : {};
  const uSnap = await get(ref(db, `usuarios`));
  const users = uSnap.exists() ? uSnap.val() : {};

  const rows = [];
  const cargos = ['lider','gerente','membro','visitante'];

  Object.keys(members || {}).forEach(uid => {
    const cargo = (members[uid] && members[uid].cargo) ? String(members[uid].cargo).toLowerCase() : 'visitante';
    const u = users[uid] || {};
    const label = `${u.nome || u.name || 'Sem nome'}${u.tag ? ' ('+u.tag+')' : ''}`;
    const options = cargos.map(c => `<option value="${c}" ${c===cargo?'selected':''}>${c}</option>`).join('');
    rows.push(`
      <tr>
        <td style="padding:8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">${escapeHTML((u.tag || uid).toString())}</td>
        <td style="padding:8px;">${escapeHTML(label)}</td>
        <td style="padding:8px;">
          <select data-uid="${uid}" class="leader-cargo-select" style="padding:8px; border-radius:10px;">${options}</select>
        </td>
        <td style="padding:8px;">
          <button class="muted leader-save-cargo" data-uid="${uid}">Salvar</button>
        </td>
      </tr>
    `);
  });

  if (els.leaderMembersTbody) els.leaderMembersTbody.innerHTML = rows.join('') || '<tr><td colspan="4" style="padding:10px;">Nenhum membro cadastrado.</td></tr>';

  // attach handlers
  document.querySelectorAll('.leader-save-cargo').forEach(btn => {
    btn.onclick = async () => {
      const uid = btn.getAttribute('data-uid');
      const sel = document.querySelector(`select.leader-cargo-select[data-uid="${uid}"]`);
      const cargo = sel ? sel.value : 'membro';
      await set(ref(db, `faccaoMembros/${fid}/${uid}/cargo`), cargo);
      if (typeof showToast === 'function') showToast('Cargo atualizado!');
      await leaderLoadMembers();
    };
  });
}

async function leaderLoadCargosEditor() {
  const fid = getFaccaoId();
  if (!fid) { if (els.cargosEditorContainer) els.cargosEditorContainer.innerHTML = '<p>Sem facção.</p>'; return; }

  const snap = await get(ref(db, `faccaoCargos/${fid}`));
  const cargosObj = snap.exists() ? snap.val() : null;

  const ensure = (name) => ({
    label: name,
    desc: '',
    perms: defaultPermsForCargo(name),
  });

  const cargos = cargosObj || {
    lider: ensure('lider'),
    gerente: ensure('gerente'),
    membro: ensure('membro'),
    visitante: ensure('visitante'),
  };

  const permKeys = ['verHistorico','verInvestigacao','verHierarquia','registrarVenda','gerenciarMembros','gerenciarCargos'];

  const blocks = Object.keys(cargos).map(cargo => {
    const cfg = cargos[cargo] || ensure(cargo);
    const perms = cfg.perms || defaultPermsForCargo(cargo);
    const checks = permKeys.map(k => {
      const checked = perms[k] ? 'checked' : '';
      return `<label style="display:inline-flex;align-items:center;gap:6px;margin-right:12px;margin-bottom:6px;">
        <input type="checkbox" data-cargo="${cargo}" data-perm="${k}" ${checked}/>
        <span>${k}</span>
      </label>`;
    }).join('');

    return `
      <div class="card" style="margin:10px 0;">
        <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
          <strong style="font-size:16px;">${escapeHTML(cargo)}</strong>
          <input data-cargo-label="${cargo}" placeholder="Nome exibido (opcional)" value="${escapeAttr(cfg.label || '')}" style="flex:1; min-width:220px; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.06); color:inherit;">
        </div>
        <textarea data-cargo-desc="${cargo}" placeholder="Responsabilidades/descrição (opcional)" style="width:100%; margin-top:8px; min-height:70px; padding:10px; border-radius:10px; border:1px solid rgba(255,255,255,.15); background:rgba(255,255,255,.06); color:inherit;">${escapeHTML(cfg.desc || '')}</textarea>
        <div style="margin-top:8px; display:flex; flex-wrap:wrap;">${checks}</div>
      </div>
    `;
  }).join('');

  if (els.cargosEditorContainer) els.cargosEditorContainer.innerHTML = blocks;

  // Add cargo create
  if (els.addCargoBtn) {
    els.addCargoBtn.onclick = async () => {
      const name = (els.newCargoName && els.newCargoName.value) ? els.newCargoName.value.trim().toLowerCase() : '';
      if (!name) return;
      const cfg = { label: name, desc: '', perms: defaultPermsForCargo('membro') };
      await set(ref(db, `faccaoCargos/${fid}/${name}`), cfg);
      if (els.newCargoName) els.newCargoName.value = '';
      if (typeof showToast === 'function') showToast('Cargo criado!');
      await leaderLoadCargosEditor();
    };
  }

  // Save cargos
  if (els.saveCargosBtn) {
    els.saveCargosBtn.onclick = async () => {
      const out = {};
      document.querySelectorAll('[data-cargo-label]').forEach(inp => {
        const cargo = inp.getAttribute('data-cargo-label');
        out[cargo] = out[cargo] || { label: cargo, desc: '', perms: {} };
        out[cargo].label = inp.value || cargo;
      });
      document.querySelectorAll('[data-cargo-desc]').forEach(tx => {
        const cargo = tx.getAttribute('data-cargo-desc');
        out[cargo] = out[cargo] || { label: cargo, desc: '', perms: {} };
        out[cargo].desc = tx.value || '';
      });
      document.querySelectorAll('input[type="checkbox"][data-cargo][data-perm]').forEach(ch => {
        const cargo = ch.getAttribute('data-cargo');
        const perm = ch.getAttribute('data-perm');
        out[cargo] = out[cargo] || { label: cargo, desc: '', perms: {} };
        out[cargo].perms[perm] = !!ch.checked;
      });

      await set(ref(db, `faccaoCargos/${fid}`), out);
      if (typeof showToast === 'function') showToast('Hierarquia salva!');
      // refresh current user's perms
      if (auth && auth.currentUser) {
        const resolved = await resolveFaccaoAccess(auth.currentUser.uid);
        App.state.faccaoCargo = resolved.faccaoCargo;
        App.state.perms = resolved.perms;
        applyFaccaoUI();
                try { if (!window.__didInitialNav) { window.__didInitialNav = true; App.navigate('main'); } } catch(e) {}

      }
    };
  }

  if (els.leaderReloadMembersBtn) els.leaderReloadMembersBtn.onclick = leaderLoadMembers;
  if (els.leaderAddMemberBtn) els.leaderAddMemberBtn.onclick = leaderAddMember;
  if (els.leaderReloadCargosBtn) els.leaderReloadCargosBtn.onclick = leaderLoadCargosEditor;
}

// === Hierarquia (visualização) ===
async function openHierarquiaView() {
  const fid = getFaccaoId();
  if (!fid) { if (els.hierarquiaContent) els.hierarquiaContent.innerHTML = '<p>Sem facção.</p>'; return; }
  const snap = await get(ref(db, `faccaoCargos/${fid}`));
  const cargos = snap.exists() ? snap.val() : null;
  if (!cargos) { if (els.hierarquiaContent) els.hierarquiaContent.innerHTML = '<p>Hierarquia ainda não foi criada.</p>'; return; }

  const blocks = Object.keys(cargos).map(c => {
    const cfg = cargos[c] || {};
    const label = cfg.label || c;
    const desc = cfg.desc || '';
    const perms = cfg.perms || {};
    const permsList = Object.keys(perms).filter(k => perms[k]).map(k => `<li>${escapeHTML(k)}</li>`).join('');
    return `
      <div class="card" style="margin:10px 0;">
        <h3 style="margin:0 0 6px;">${escapeHTML(label)}</h3>
        ${desc ? `<p style="margin:0 0 8px; opacity:.9;">${escapeHTML(desc)}</p>` : ''}
        ${permsList ? `<ul style="margin:0; padding-left:18px; opacity:.85;">${permsList}</ul>` : '<small style="opacity:.75;">Sem permissões definidas.</small>'}
      </div>
    `;
  }).join('');

  if (els.hierarquiaContent) els.hierarquiaContent.innerHTML = blocks;
}

// tiny helpers for safe HTML
function escapeHTML(str){ return (str||'').toString().replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s])); }
function escapeAttr(str){ return escapeHTML(str).replace(/"/g,'&quot;'); }



// === Admin: Facções ===
async function adminLoadFaccoes() {
  try {
    const snap = await get(ref(db, 'faccoes'));
    const faccoes = snap.exists() ? snap.val() : {};
    const rows = Object.keys(faccoes || {}).sort().map(fid => {
      const f = faccoes[fid] || {};
      return `<tr><td style="padding:8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">${escapeHTML(fid)}</td><td style="padding:8px;">${escapeHTML(f.nome || '')}</td></tr>`;
    }).join('');
    if (els.adminFaccoesTbody) els.adminFaccoesTbody.innerHTML = rows || '<tr><td colspan=\"3\" style=\"padding:10px;\">Nenhuma facção.</td></tr>';
    document.querySelectorAll('button[data-action=\"members\"]').forEach(b => { b.onclick = () => adminShowFaccaoMembers(b.getAttribute('data-fid')); });
  } catch (e) { console.error(e); }
}

async function adminCreateFaccao() {
  const fid = (els.adminNewFaccaoId && els.adminNewFaccaoId.value) ? els.adminNewFaccaoId.value.trim() : '';
  const nome = (els.adminNewFaccaoNome && els.adminNewFaccaoNome.value) ? els.adminNewFaccaoNome.value.trim() : '';
  const leaderTag = (els.adminNewFaccaoLeaderTag && els.adminNewFaccaoLeaderTag.value) ? els.adminNewFaccaoLeaderTag.value.trim() : '';
  const leaderUid = leaderTag ? await uidFromTag(leaderTag) : '';
  if (!fid || !nome) { if (typeof showToast==='function') showToast('Preencha ID e nome.'); return; }
  const data = { nome, tag, criadoEm: Date.now() };
  await set(ref(db, `faccoes/${fid}`), data);

  if (leaderUid) {
    await set(ref(db, `usuarios/${leaderUid}/faccaoId`), fid);
    await set(ref(db, `faccaoMembros/${fid}/${leaderUid}/cargo`), 'lider');
  }

  // criar cargos padrão se ainda não existir
  const cargosSnap = await get(ref(db, `faccaoCargos/${fid}`));
  if (!cargosSnap.exists()) {
    const ensure = (name) => ({ label: name, desc: '', perms: defaultPermsForCargo(name) });
    await set(ref(db, `faccaoCargos/${fid}`), {
      lider: ensure('lider'),
      gerente: ensure('gerente'),
      membro: ensure('membro'),
      visitante: ensure('visitante'),
    });
  }

  if (els.adminFaccaoNome) els.adminFaccaoNome.value = '';
  if (els.adminFaccaoTag) els.adminFaccaoTag.value = '';
  if (els.adminFaccaoLiderNome) els.adminFaccaoLiderNome.value = '';
  
  
  if (typeof showToast==='function') showToast('Facção criada!');
  await adminLoadFaccoes();
      try { adminLoadUsersPublic(); adminBuildRanking(); adminLoadLogs(); } catch(e) {}
      try { renderOnlineUsers(); if (!window.__onlineInterval) window.__onlineInterval = setInterval(renderOnlineUsers, 5000); } catch(e) {}
}

async function adminApplyUserFaccao() {
  const uid = (els.adminSetUserUid && els.adminSetUserUid.value) ? els.adminSetUserUid.value.trim() : '';
  const fid = (els.adminSetUserFaccao && els.adminSetUserFaccao.value) ? els.adminSetUserFaccao.value.trim() : '';
  const cargo = (els.adminSetUserCargo && els.adminSetUserCargo.value) ? els.adminSetUserCargo.value : 'membro';
  if (!uid || !fid) { if (typeof showToast==='function') showToast('Preencha UID e faccaoId.'); return; }

  await set(ref(db, `usuarios/${uid}/faccaoId`), fid);
  await set(ref(db, `faccaoMembros/${fid}/${uid}/cargo`), cargo);

  if (typeof showToast==='function') showToast('Usuário atualizado!');
}


// === Admin: Ranking por Facção ===
async function adminLoadRanking() {
  try {
    const snap = await get(ref(db, 'vendasPorFaccao'));
    const all = snap.exists() ? snap.val() : {};
    const rows = [];
    Object.keys(all || {}).forEach(fid => {
      const vendas = all[fid] || {};
      let total = 0;
      let count = 0;
      Object.keys(vendas).forEach(k => {
        const v = vendas[k] || {};
        const val = Number(v.valorTotal ?? v.valor ?? v.total ?? 0) || 0;
        total += val;
        count += 1;
      });
      rows.push({ fid, count, total });
    });
    rows.sort((a,b) => b.total - a.total);

    const html = rows.map(r => `
      <tr>
        <td style="padding:8px;">${escapeHTML(r.fid)}</td>
        <td style="padding:8px;">${r.count}</td>
        <td style="padding:8px;">${formatCurrency(r.total)}</td>
      </tr>
    `).join('') || '<tr><td colspan="3" style="padding:10px;">Sem vendas.</td></tr>';

    if (els.adminRankingTbody) els.adminRankingTbody.innerHTML = html;
  } catch (e) {
    console.error(e);
    if (els.adminRankingTbody) els.adminRankingTbody.innerHTML = '<tr><td colspan="3" style="padding:10px;">Erro ao carregar ranking.</td></tr>';
  }
}

async function adminShowFaccaoMembers(fid) {
  try {
    if (!fid) return;
    const mSnap = await get(ref(db, `faccaoMembros/${fid}`));
    const members = mSnap.exists() ? mSnap.val() : {};

    const rows = Object.keys(members || {}).map(uid => {
      const cargo = (members[uid] && members[uid].cargo) ? String(members[uid].cargo) : '';
      return `<tr><td style="padding:8px; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;">${escapeHTML(uid)}</td><td style="padding:8px;">${escapeHTML(cargo)}</td></tr>`;
    }).join('') || '<tr><td colspan="2" style="padding:10px;">Sem membros.</td></tr>';

    const box = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
        <strong>Membros da facção: ${escapeHTML(fid)}</strong>
        <button class="muted" id="adminCloseMembersBoxBtn">Fechar</button>
      </div>
      <div style="overflow:auto; margin-top:8px;">
        <table style="width:100%; border-collapse:collapse;">
          <thead><tr><th style="text-align:left; padding:8px;">UID</th><th style="text-align:left; padding:8px;">Cargo</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;

    if (els.adminFaccaoMembersBox) {
      els.adminFaccaoMembersBox.style.display = 'block';
      els.adminFaccaoMembersBox.innerHTML = box;
      const btn = document.getElementById('adminCloseMembersBoxBtn');
      if (btn) btn.onclick = () => { els.adminFaccaoMembersBox.style.display='none'; els.adminFaccaoMembersBox.innerHTML=''; };
    }
  } catch (e) { console.error(e); }
}

async function leaderAddMember() {
  const fid = getFaccaoId();
  const nome = (els.leaderAddMemberNome && els.leaderAddMemberNome.value) ? els.leaderAddMemberNome.value.trim() : '';
  const uid = nome ? await uidFromUserName(nome) : '';
  const cargo = (els.leaderAddMemberCargo && els.leaderAddMemberCargo.value) ? els.leaderAddMemberCargo.value : 'membro';
  if (!fid || !uid) { if (typeof showToast==='function') showToast('Preencha UID.'); return; }
  await set(ref(db, `usuarios/${uid}/faccaoId`), fid);
  await set(ref(db, `faccaoMembros/${fid}/${uid}/cargo`), cargo);
  if (els.leaderAddMemberNome) els.leaderAddMemberNome.value='';
  if (typeof showToast==='function') showToast('Membro adicionado!');
  await leaderLoadMembers();
}


// === Online (admin) ===
function formatIdle(ms) {
  const s = Math.max(0, Math.floor(ms/1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s/60);
  const r = s%60;
  if (m < 60) return `${m}m ${r}s`;
  const h = Math.floor(m/60);
  return `${h}h ${m%60}m`;
}

async function renderOnlineUsers() {
  if (!els.adminOnlineList) return;
  try {
    const snap = await get(ref(db, 'onlineStatus'));
    const obj = snap.exists() ? snap.val() : {};
    const now = Date.now();
    const active = Object.keys(obj || {}).map(uid => ({ uid, ...(obj[uid]||{}) }))
      .filter(u => (now - (u.lastActive || 0)) <= 60*1000)
      .sort((a,b) => (b.lastActive||0) - (a.lastActive||0));

    // load public profiles for names/faccao
    const users = await loadUsersPublicOnce();
    const map = new Map(users.map(u => [u.uid, u]));

    if (!active.length) {
      els.adminOnlineList.innerHTML = '<div style="opacity:.8;">Ninguém online agora.</div>';
      return;
    }

    const rows = active.map(u => {
      const p = map.get(u.uid) || {};
      const name = (p.displayName || u.displayName || u.tag || u.uid).toString();
      const fac = (p.faccaoId || u.faccaoId || '').toString();
      const idle = formatIdle(now - (u.lastActive||0));
      return `<div style="display:flex; gap:10px; align-items:center; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.08);">
        <span style="width:10px; height:10px; border-radius:50%; background: #2ecc71; display:inline-block;"></span>
        <strong style="flex:1;">${escapeHTML(name)}</strong>
        <span style="opacity:.85;">🏴 ${escapeHTML(fac || '-')}</span>
        <span style="opacity:.75;">⏱ ${idle}</span>
      </div>`;
    }).join('');

    els.adminOnlineList.innerHTML = rows;
  } catch(e) {
    console.warn('renderOnlineUsers failed', e);
    els.adminOnlineList.innerHTML = '<div style="opacity:.8;">Falha ao carregar online.</div>';
  }
}
// === Admin utilities ===
function downloadJSON(filename, obj) {
  try {
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch(e) { console.warn('downloadJSON failed', e); }
}

async function pushLog(action, extra) {
  try {
    const role = (App && App.state && App.state.role) ? App.state.role : 'user';
    const who = (currentUserData && (currentUserData.displayName || currentUserData.nome)) || (currentUser && currentUser.displayName) || 'N/A';
    const uid = (currentUser && currentUser.uid) || null;
    const fid = (App && App.state && App.state.faccaoId) || null;
    const item = { ts: Date.now(), action, who, uid, fid, role, extra: extra || null };
    await push(ref(db, 'logs'), item);
  } catch(e) {}
}

async function adminLoadUsersPublic() {
  const users = await loadUsersPublicOnce();
  const q = normalizeUserName(els.adminUserSearch ? els.adminUserSearch.value : '');
  const filtered = q ? users.filter(u => normalizeUserName(u.displayName||'').includes(q)) : users.slice();
  const rows = filtered.slice(0, 200).map(u => {
    const name = (u.displayName || '').toString();
    const fac = (u.faccaoId || '').toString();
    const updated = u.updatedAt ? new Date(u.updatedAt).toLocaleString() : '';
    return `<tr class="admin-user-row" data-uid="${escapeAttr(u.uid)}" data-name="${escapeAttr(name)}" data-faccao="${escapeAttr(fac)}">
      <td style="padding:8px;">${escapeHTML(name)}</td>
      <td style="padding:8px; opacity:.85;">${escapeHTML(fac || '-')}</td>
      <td style="padding:8px; opacity:.75;">${escapeHTML(updated)}</td>
    </tr>`;
  }).join('');
  if (els.adminUsersTbody) els.adminUsersTbody.innerHTML = rows || '<tr><td colspan="3" style="padding:10px;">Nenhum usuário.</td></tr>';

  document.querySelectorAll('.admin-user-row').forEach(tr => {
    tr.onclick = () => {
      const uid = tr.getAttribute('data-uid') || '';
      const name = tr.getAttribute('data-name') || '';
      const fac = tr.getAttribute('data-faccao') || '';
      if (els.adminSelectedUserUid) els.adminSelectedUserUid.value = uid;
      if (els.adminSelectedUserName) els.adminSelectedUserName.value = name;
      if (els.adminSetUserFaccaoId) els.adminSetUserFaccaoId.value = fac;
    };
  });
}

async function adminApplyUserToFaccao() {
  const uid = els.adminSelectedUserUid ? els.adminSelectedUserUid.value.trim() : '';
  const fid = els.adminSetUserFaccaoId ? els.adminSetUserFaccaoId.value.trim() : '';
  const cargo = els.adminSetUserCargo ? els.adminSetUserCargo.value : 'membro';
  if (!uid || !fid) { if (typeof showToast==='function') showToast('Selecione um usuário e uma facção.'); return; }
  await set(ref(db, `usuarios/${uid}/faccaoId`), fid);
  await set(ref(db, `usuariosPublic/${uid}/faccaoId`), fid);
  await set(ref(db, `faccaoMembros/${fid}/${uid}/cargo`), cargo);
  await pushLog('admin_set_user_faccao', { uid, fid, cargo });
  if (typeof showToast==='function') showToast('Atualizado!');
  await adminLoadUsersPublic();
}

async function adminSetGlobalRole(role) {
  const uid = els.adminSelectedUserUid ? els.adminSelectedUserUid.value.trim() : '';
  if (!uid) { if (typeof showToast==='function') showToast('Selecione um usuário.'); return; }
  await set(ref(db, `usuarios/${uid}/role`), role);
  await pushLog('admin_set_role', { uid, role });
  if (typeof showToast==='function') showToast('Role atualizado!');
}

async function adminBuildRanking() {
  const faccoesSnap = await get(ref(db, 'faccoes'));
  const faccoes = faccoesSnap.exists() ? faccoesSnap.val() : {};
  const vendasSnap = await get(ref(db, 'vendasPorFaccao'));
  const vendasObj = vendasSnap.exists() ? vendasSnap.val() : {};
  const rows = Object.keys(faccoes || {}).map(fid => {
    const nome = (faccoes[fid] && (faccoes[fid].nome || fid)) || fid;
    const vendas = vendasObj[fid] || {};
    const ids = Object.keys(vendas || {});
    let total = 0;
    ids.forEach(id => {
      const v = vendas[id] || {};
      const t = Number(v.total || v.valorTotal || v.totalVenda || 0);
      if (Number.isFinite(t)) total += t;
    });
    return { fid, nome, count: ids.length, total };
  }).sort((a,b) => b.total - a.total);

  const htmlRows = rows.map((r, i) => `<tr>
    <td style="padding:8px;">${i+1}</td>
    <td style="padding:8px;">${escapeHTML(r.nome)}</td>
    <td style="padding:8px;">${r.count}</td>
    <td style="padding:8px;">${r.total.toLocaleString('pt-BR')}</td>
  </tr>`).join('');
  if (els.adminRankingTbody) els.adminRankingTbody.innerHTML = htmlRows || '<tr><td colspan="4" style="padding:10px;">Sem dados.</td></tr>';
}

async function adminLoadLogs() {
  if (!els.adminLogsBox) return;
  const snap = await get(ref(db, 'logs'));
  const obj = snap.exists() ? snap.val() : {};
  const items = Object.keys(obj || {}).map(k => ({ id:k, ...(obj[k]||{}) }))
    .sort((a,b) => (b.ts||0) - (a.ts||0))
    .slice(0, 120);
  if (!items.length) { els.adminLogsBox.innerHTML = '<div style="opacity:.8;">Sem logs.</div>'; return; }
  els.adminLogsBox.innerHTML = items.map(it => {
    const when = it.ts ? new Date(it.ts).toLocaleString() : '';
    const who = it.who || 'N/A';
    const action = it.action || '';
    return `<div style="padding:8px 0; border-bottom:1px solid rgba(255,255,255,.08);">
      <div style="display:flex; gap:10px; flex-wrap:wrap;">
        <strong>${escapeHTML(action)}</strong>
        <span style="opacity:.75;">${escapeHTML(when)}</span>
      </div>
      <div style="opacity:.85;">${escapeHTML(who)} ${it.fid ? ' — 🏴 ' + escapeHTML(it.fid) : ''}</div>
    </div>`;
  }).join('');
}

async function adminClearLogs() {
  if (!confirm('Limpar logs?')) return;
  await remove(ref(db, 'logs'));
  if (els.adminLogsBox) els.adminLogsBox.innerHTML = '<div style="opacity:.8;">Sem logs.</div>';
}

async function adminDownloadBackup() {
  const fid = els.adminBackupFaccaoId ? els.adminBackupFaccaoId.value.trim() : '';
  if (fid) {
    const [fac, mem, cargos, vendas, doss, orgs] = await Promise.all([
      get(ref(db, `faccoes/${fid}`)),
      get(ref(db, `faccaoMembros/${fid}`)),
      get(ref(db, `faccaoCargos/${fid}`)),
      get(ref(db, `vendasPorFaccao/${fid}`)),
      get(ref(db, `dossiesPorFaccao/${fid}`)),
      get(ref(db, `organizacoesPorFaccao/${fid}`)),
    ]);
    const obj = {
      faccaoId: fid,
      faccao: fac.exists() ? fac.val() : null,
      membros: mem.exists() ? mem.val() : {},
      cargos: cargos.exists() ? cargos.val() : {},
      vendas: vendas.exists() ? vendas.val() : {},
      dossies: doss.exists() ? doss.val() : {},
      organizacoes: orgs.exists() ? orgs.val() : {}
    };
    downloadJSON(`backup_${fid}.json`, obj);
    return;
  }
  const snap = await get(ref(db, '/'));
  downloadJSON(`backup_full.json`, snap.exists() ? snap.val() : {});
}
