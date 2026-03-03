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

// --- ORG SCOPE (dados por facção) ---
const getCurrentOrgId = () => {
  try {
    // CEO pode "entrar" em uma facção para visualizar tudo (não altera o banco).
    // Persistimos em localStorage para manter após F5.
    const forced = (typeof window !== 'undefined' && window.__ORG_VIEW_ID__) ? String(window.__ORG_VIEW_ID__) : null;
    const stored = (typeof localStorage !== 'undefined') ? localStorage.getItem('ceoViewOrgId') : null;
    const forcedOrgId = forced || stored;

    if (forcedOrgId && String(forcedOrgId).trim()) return String(forcedOrgId).trim();
    return (currentUserData && currentUserData.orgId) ? String(currentUserData.orgId) : null;
  } catch (e) { return null; }
};

// Permite setar/limpar a facção "ativa" para visualização do CEO
const setCeoViewOrgId = (orgId) => {
  try {
    if (orgId && String(orgId).trim()) {
      window.__ORG_VIEW_ID__ = String(orgId).trim();
      localStorage.setItem('ceoViewOrgId', String(orgId).trim());
    } else {
      window.__ORG_VIEW_ID__ = null;
      localStorage.removeItem('ceoViewOrgId');
    }
  } catch (e) {}
};

const orgScopedPath = (subPath) => {
  const orgId = getCurrentOrgId();
  return orgId ? `orgData/${orgId}/${subPath}` : null;
};


// NOVO: Variável global para armazenar o status online de todos os usuários
let globalOnlineStatus = {};

// --- ORGS / CEO ---
let globalCeoUid = null;
let globalOrgsConfig = {}; // { orgId: {name,color,logo,labels} }
 

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

  leaderPanelBtn: document.getElementById('leaderPanelBtn'),
  hierarquiaBtn: document.getElementById('hierarquiaBtn'),
  leaderPanel: document.getElementById('leaderPanel'),
  leaderOrgName: document.getElementById('leaderOrgName'),
  leaderOrgColor: document.getElementById('leaderOrgColor'),
  leaderOrgLogo: document.getElementById('leaderOrgLogo'),
  leaderSaveOrgBtn: document.getElementById('leaderSaveOrgBtn'),
  leaderUserSearch: document.getElementById('leaderUserSearch'),
  leaderAssignRole: document.getElementById('leaderAssignRole'),
  leaderAssignBtn: document.getElementById('leaderAssignBtn'),
  leaderMembersList: document.getElementById('leaderMembersList'),
  hierMemberSelect: document.getElementById('hierMemberSelect'),
  hierMemberTitle: document.getElementById('hierMemberTitle'),
  hierResponsibilities: document.getElementById('hierResponsibilities'),
  hierSaveBtn: document.getElementById('hierSaveBtn'),
  hierRemoveBtn: document.getElementById('hierRemoveBtn'),
  hierPreview: document.getElementById('hierPreview'),
  hierarquiaCard: document.getElementById('hierarquiaCard'),
  hierarquiaContainer: document.getElementById('hierarquiaContainer'),
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

// =================================================================
// INÍCIO: NOVAS FUNÇÕES DE CONFIGURAÇÃO GLOBAL E STATUS ONLINE
// =================================================================

const globalLayoutRef = ref(db, 'configuracoesGlobais/layout');

// Listener que atualiza o layout para todos os usuários
onValue(globalLayoutRef, (snapshot) => {
    if (!snapshot.exists()) {
        console.warn("Nó /configuracoesGlobais/layout não encontrado. Criando...");
        if(currentUserData && ((currentUserData.tag || 'VISITANTE') + '').toUpperCase() === 'ADMIN') {
             set(globalLayoutRef, { enableNightMode: true, enableBottomPanel: false, bottomPanelText: 'Este é o painel inferior.' });
        }
        return;
    }
    const settings = snapshot.val();
    
    if (els.themeBtn) {
        els.themeBtn.style.display = settings.enableNightMode ? 'block' : 'none';
        if (!settings.enableNightMode && document.body.classList.contains('dark')) {
            document.body.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }
    
    if (els.bottomPanel) {
        els.bottomPanel.style.display = settings.enableBottomPanel ? 'flex' : 'none';
        // Atualiza a mensagem no rodapé para todos
        els.bottomPanelDisplay.textContent = settings.bottomPanelText || 'Este é o painel inferior.'; 
    }
    
    // Atualiza o input de texto no Painel Admin (se estiver visível)
    if (els.adminPanel.style.display !== 'none' && els.bottomPanelText) {
         els.bottomPanelText.value = settings.bottomPanelText || '';
    }

}, (error) => {
    if(error.code !== "PERMISSION_DENIED") {
        showToast(`Erro ao carregar configurações de layout: ${error.message}`, 'error');
    }
});

/**
 * Atualiza a última atividade do usuário logado a cada 30 segundos.
 * Usado para rastrear usuários "online".
 */
const updateUserActivity = () => {
    if (currentUser) {
        // Cria um nó temporário (ou sobrescreve o existente)
        const activityRef = ref(db, `onlineStatus/${currentUser.uid}`);
        
        // Adiciona um valor 'timestamp' com a hora atual
        set(activityRef, {
            lastActive: Date.now(),
            displayName: currentUser.displayName,
            tag: currentUserData ? currentUserData.tag : 'N/A'
        }).catch(e => {
             // Apenas para logs, não é crítico
             console.warn("Erro ao registrar atividade online:", e.message);
        });
        
        // Define um intervalo para rodar a cada 30 segundos
        setTimeout(updateUserActivity, 30000); 
    }
};

/**
 * Formata o tempo de inatividade em minutos, horas ou segundos.
 */
const formatInactivityTime = (inactivityMs) => {
    const seconds = Math.floor(inactivityMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 5) {
        return "Agora";
    }
    if (seconds < 60) {
        return `${seconds} Segundos`;
    }
    if (minutes < 60) {
        return `${minutes} Minuto${minutes > 1 ? 's' : ''}`;
    }
    
    const remainingMinutes = minutes % 60;
    if (hours < 2) {
         return `1 Hora e ${remainingMinutes} Minutos`;
    }
    return `${hours} Horas e ${remainingMinutes} Minutos`;
}

/**
 * Monitora e armazena o status de atividade em tempo real.
 */
const monitorOnlineStatus = () => {
    const statusRef = ref(db, 'onlineStatus');
    
    // Remove listener anterior se existir
    if (monitorOnlineStatus.listener) {
        monitorOnlineStatus.listener();
    }
    
    const listener = onValue(statusRef, (snapshot) => {
        const now = Date.now();
        let activeCount = 0;
        globalOnlineStatus = {}; 
        
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const uid = child.key;
                const userStatus = child.val();
                const inactivity = now - userStatus.lastActive;
                const isOnline = inactivity < 60000; // 60 segundos
                
                if (isOnline) {
                    activeCount++;
                }

                globalOnlineStatus[uid] = {
                    isOnline: isOnline,
                    inactivity: inactivity,
                    lastActive: userStatus.lastActive
                };
            });
        }
        
        els.onlineUsersCount.textContent = activeCount.toString();
        
        // Se o Painel Admin estiver aberto, forçamos a atualização da lista
        if (els.adminPanel.style.display !== 'none') {
            loadAdminPanel(false); // Atualiza a lista na tabela sem recarregar tudo.
        }

    }, (error) => {
        if(error.code !== "PERMISSION_DENIED") {
            console.error("Erro ao monitorar status online:", error);
        }
    });
    
    monitorOnlineStatus.listener = listener;
};

// =================================================================
// FIM: NOVAS FUNÇÕES DE CONFIGURAÇÃO GLOBAL E STATUS ONLINE
// =================================================================



const formatCurrency = (value) => {
  if (typeof value !== 'number' || isNaN(value)) { return 'R$ 0'; }
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

// =================================================================
// INÍCIO: ALTERAÇÃO (Correção do CPF e NKT)
// =================================================================
const capitalizeText = (text) => {
    if (!text) return '';
    
    const upperText = text.toUpperCase();
    
    // Exceções para Acrônimos (CNPJ, CPF, OUTROS, NKT)
    if (upperText === 'CPF' || upperText === 'OUTROS' || upperText === 'CNPJ' || upperText === 'NKT') {
        return upperText;
    }
    if (text === 'dinheiro sujo') return 'Dinheiro Sujo';
    
    // Lógica original (Capitalização de Sentença/Palavra)
    return text.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
};
// =================================================================
// FIM: ALTERAÇÃO
// =================================================================

const showToast = (message, type = 'default', duration = 3000) => {
  const toastContainer = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => { toast.classList.add('show'); }, 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => { if (toast.parentNode) toast.parentNode.removeChild(toast); }, 300);
  }, duration);
};

const getQty = (element) => Math.max(0, parseInt(element.value) || 0);

const PREFIX = "(055) ";
const phoneMask = (value) => {
    let digits = value.replace(/\D/g, ""); 
    if (digits.startsWith("055")) { digits = digits.substring(3); }
    digits = digits.substring(0, 6); 
    let formattedNumber = digits.length > 3 ? `${digits.substring(0, 3)}-${digits.substring(3)}` : digits;
    return PREFIX + formattedNumber;
}

const camposTelefone = [els.telefone, els.editDossierNumero, els.addDossierNumero];

camposTelefone.forEach(campo => {
    if (campo) {
        campo.addEventListener('input', (e) => {
            e.target.value = e.target.value.length < PREFIX.length ? PREFIX : phoneMask(e.target.value);
        });
        campo.addEventListener('focus', (e) => {
            if (!e.target.value || e.target.value.length < PREFIX.length) { e.target.value = PREFIX; }
        });
    }
});

const atualizarRelogio = () => {
    const agora = new Date();
    const dia = String(agora.getDate()).padStart(2, '0');
    const mes = String(agora.getMonth() + 1).padStart(2, '0');
    const ano = agora.getFullYear();
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    els.dataVenda.value = `${dia}/${mes}/${ano} ${horas}:${minutos}`;
};
atualizarRelogio();
setInterval(atualizarRelogio, 30000);

const camposParaCapitalizar = [ 
    els.nomeCliente, els.organizacao, els.negociadoras, els.vendaValorObs, 
    els.carroVeiculo, 
    els.addDossierNome, els.addDossierOrganizacao, els.addDossierCargo, 
    els.editDossierNome, els.editDossierCargo, 
    els.orgNome,
    els.addModalCarroNome, els.editModalCarroNome 
];
camposParaCapitalizar.forEach(campo => {
  if (campo) {
    campo.addEventListener('input', (e) => {
      const { selectionStart, selectionEnd } = e.target;
      e.target.value = capitalizeText(e.target.value);
      e.target.setSelectionRange(selectionStart, selectionEnd);
    });
  }
});

// NÃO CAPITALIZAR INSTAGRAM
if (els.editDossierInstagram) {
    els.editDossierInstagram.addEventListener('input', (e) => {
      // Deixa o usuário digitar livremente
    });
}

// ----------------------------
// Produtos dinâmicos (baseado no catálogo configurável)
// ----------------------------
const getCatalogProducts = () => {
  const fromValores = Object.keys(valores || {});
  const fromPerUnit = Object.keys(perUnit || {});
  const set = new Set([...fromValores, ...fromPerUnit]);
  return Array.from(set).filter(Boolean).sort((a,b)=>a.localeCompare(b));
};

const prettyProductName = (key) => {
  const k = String(key);
  if (typeof productLabels === 'object' && productLabels && productLabels[k]) return productLabels[k];
  return capitalizeText(k.replace(/_/g,' '));
};

const renderProductInputs = () => {
  // Se o HTML ainda tiver os inputs antigos, o app continua funcionando.
  if (!els.productsContainer) return;

  const products = getCatalogProducts();
  els.productsContainer.innerHTML = products.map((p) => `
    <div>
      <label>Quantidade de ${prettyProductName(p)}</label>
      <input class="product-qty-input" data-product="${p}" type="number" min="0" value="">
    </div>
  `).join('');

  // Recalcula ao digitar
  els.productsContainer.querySelectorAll('input.product-qty-input').forEach(inp => {
    inp.addEventListener('input', () => calculate());
  });
};

// Renderiza quando o catálogo mudar (Admin salvou / Firebase atualizou)
document.addEventListener('catalogUpdated', () => {
  renderProductInputs();
  // Se já tinha algo digitado nos campos antigos, mantém a compatibilidade.
  calculate();
});

const readQtyByProduct = () => {
  const qtyByProduct = {};
  // Preferência: inputs dinâmicos
  if (els.productsContainer) {
    els.productsContainer.querySelectorAll('input.product-qty-input').forEach(inp => {
      const key = inp.dataset.product;
      const qty = Math.max(0, parseInt(inp.value) || 0);
      if (qty > 0) qtyByProduct[key] = qty;
    });
  } else {
    // Fallback para o layout antigo
    if (els.qtyTickets) qtyByProduct.tickets = Math.max(0, parseInt(els.qtyTickets.value) || 0);
    if (els.qtyTablets) qtyByProduct.tablets = Math.max(0, parseInt(els.qtyTablets.value) || 0);
    if (els.qtyNitro) qtyByProduct.nitro = Math.max(0, parseInt(els.qtyNitro.value) || 0);
    Object.keys(qtyByProduct).forEach(k => { if (qtyByProduct[k] <= 0) delete qtyByProduct[k]; });
  }
  return qtyByProduct;
};

const calculate = () => {
  const tipoValor = els.tipoValor.value;

  const qtyByProduct = readQtyByProduct();

  const totalQuantities = {};
  let totalValue = 0;
  const productValues = [];

  Object.entries(qtyByProduct).forEach(([productKey, qty]) => {
    const recipe = perUnit?.[productKey] || {};
    Object.entries(recipe).forEach(([materialKey, perOne]) => {
      const add = qty * (Number(perOne) || 0);
      if (add <= 0) return;
      totalQuantities[materialKey] = (totalQuantities[materialKey] || 0) + add;
    });

    const pricePer = Number(valores?.[productKey]?.[tipoValor] ?? 0) || 0;
    const value = qty * pricePer;
    totalValue += value;
    productValues.push({ product: `${prettyProductName(productKey)} (${qty} und.)`, value });
  });

  const hasQuantities = Object.keys(qtyByProduct).length > 0;

  if (hasQuantities) updateResults(totalQuantities, productValues, totalValue);
  else els.results.style.display = 'none';

  // Compatibilidade (para históricos antigos / telas antigas)
  const qtyTickets = qtyByProduct.tickets || 0;
  const qtyTablets = qtyByProduct.tablets || 0;
  const qtyNitro = qtyByProduct.nitro || 0;

  return { qtyByProduct, qtyTickets, qtyTablets, qtyNitro, totalValue, tipoValor, hasQuantities };
};



const updateResults = (totals, productValues, totalValue) => {
  els.results.style.display = 'block';
  els.resultsBody.innerHTML = Object.entries(totals)
    .filter(([, value]) => value > 0)
    .map(([material, value]) => `<tr><td>${capitalizeText(material.replace(/_/g, ' '))}</td><td>${value.toLocaleString('pt-BR')}</td></tr>`)
    .join('');
  els.valuesBody.innerHTML = productValues.map(item => `<tr><td>${item.product}</td><td>${formatCurrency(item.value)}</td></tr>`).join('');
  els.valorTotalGeral.textContent = formatCurrency(totalValue);
};

const clearAllFields = () => {
  // limpa inputs dinâmicos
  if (els.productsContainer) {
    els.productsContainer.querySelectorAll('input.product-qty-input').forEach(inp => inp.value = '');
  }

  // fallback para layout antigo
  ['qtyTickets', 'qtyTablets', 'qtyNitro'].forEach(id => { if (els[id]) els[id].value = ''; });

  ['nomeCliente', 'organizacao', 'negociadoras', 'vendaValorObs', 'carroVeiculo', 'placaVeiculo'].forEach(id => { if (els[id]) els[id].value = ''; });
  els.tipoValor.value = 'limpo';
  els.organizacaoTipo.value = 'CNPJ';
  els.telefone.value = '';
  els.results.style.display = 'none';
  document.querySelectorAll('.input-invalido').forEach(input => input.classList.remove('input-invalido'));
};

const validateFields = () => {
    let isValid = true;
    const camposObrigatorios = [ els.nomeCliente, els.telefone, els.negociadoras ];
    
    camposObrigatorios.forEach(field => {
        if (!field.value.trim()) {
            field.classList.add('input-invalido');
            isValid = false;
        } else {
            field.classList.remove('input-invalido');
        }
    });
    
    const tipoOrg = els.organizacaoTipo.value;
    if (tipoOrg === 'CNPJ') {
        if (!els.organizacao.value.trim()) {
            els.organizacao.classList.add('input-invalido');
            isValid = false;
        } else {
            els.organizacao.classList.remove('input-invalido');
        }
    } else {
        els.organizacao.classList.remove('input-invalido');
    }
    
    return isValid;
};


// =================================================================
// INÍCIO: LÓGICA DE SINCRONIZAÇÃO DO DOSSIÊ (v12)
// =================================================================

// --- DOSSIÊ POR FACÇÃO (escopo por orgId) ---
const getDossierRoot = () => {
  const orgId = getCurrentOrgId && getCurrentOrgId();
  return orgId ? `orgData/${orgId}` : null;
};
const dossierPath = (sub) => {
  const root = getDossierRoot();
  return root ? `${root}/${sub}` : null;
};
const requireOrgForDossier = () => {
  const root = getDossierRoot();
  if (!root) return false;
  return true;
};


/**
 * Procura por um nome de pessoa em TODAS as organizações do dossiê.
 * Retorna os dados, a org e o ID se encontrar.
 */
const findDossierEntryGlobal = async (nome) => {
    if (!nome) return null;
    
    try {
        if (!requireOrgForDossier()) return null;
        const dossiesRef = ref(db, dossierPath('dossies'));
        const snapshot = await get(dossiesRef);
        
        if (!snapshot.exists()) return null;
        
        const dossies = snapshot.val();
        
        for (const orgKey in dossies) {
            const orgData = dossies[orgKey];
            for (const personId in orgData) {
                if (orgData[personId].nome && orgData[personId].nome.toLowerCase() === nome.toLowerCase()) {
                    return {
                        personData: orgData[personId],
                        oldOrg: orgKey,
                        personId: personId
                    };
                }
            }
        }
    } catch (error) {
        if(error.code !== "PERMISSION_DENIED") {
            console.error("Erro na busca global:", error);
        }
        return null;
    }
    return null; 
};

/**
 * Procura por um NOME PARCIAL de pessoa em TODAS as organizações do dossiê.
 * Retorna um array de resultados.
 */
const searchAllPeopleGlobal = async (query) => {
    if (!query) return [];
    
    const results = [];
    const queryLower = query.toLowerCase();
    
    try {
        if (!requireOrgForDossier()) return null;
        const dossiesRef = ref(db, dossierPath('dossies'));
        const snapshot = await get(dossiesRef);
        
        if (!snapshot.exists()) return [];
        
        const dossies = snapshot.val();
        
        for (const orgKey in dossies) {
            const orgData = dossies[orgKey];
            for (const personId in orgData) {
                const person = orgData[personId];
                const nome = person.nome ? person.nome.toLowerCase() : '';
                
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

/**
 * Mescla veículos de uma venda (formato string) com um objeto de veículos existente.
 * Usa a PLACA como chave única para evitar duplicatas.
 */
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


// Adiciona ou ATUALIZA entrada de pessoa no dossiê
const addDossierEntry = async (vendaData, dadosAntigos = null) => {
    const org = vendaData.organizacao.trim();
    const nome = vendaData.cliente.trim();
    
    if (!org || !nome) {
        console.warn("addDossierEntry: Org ou Nome faltando. Saindo.");
        return;
    }

    // Garante que a Organização exista em /organizacoes
    const orgRef = ref(db, `${dossierPath('organizacoes')}/${org}`);
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

    // Procura por uma pessoa com o mesmo nome NESSA organização
    const dossierQuery = query(ref(db, `${dossierPath('dossies')}/${org}`), orderByChild('nome'), equalTo(nome));
    
    try {
        const snapshot = await get(dossierQuery);
        
        if (snapshot.exists()) {
            // JÁ EXISTE: Atualiza a entrada existente
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

            const updateRef = ref(db, `${dossierPath('dossies')}/${org}/${existingEntryId}`);
            await update(updateRef, updates);

        } else {
            // NÃO EXISTE: Cria uma nova entrada
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
            
            await push(ref(db, `${dossierPath('dossies')}/${org}`), dossierEntry);
        }
    } catch (err) {
        console.error("Erro ao adicionar/atualizar dossiê:", err);
        if(err.code !== "PERMISSION_DENIED") {
            showToast(`Erro ao sincronizar dossiê: ${err.message}`, "error");
        }
    }
};

// Atualiza o dossiê quando uma VENDA é editada
const updateDossierEntryOnEdit = async (oldNome, oldOrg, newVendaData) => {
    const newOrg = newVendaData.organizacao.trim();
    const newNome = newVendaData.cliente.trim();
    
    if (!oldOrg || !oldNome || !newOrg || !newNome) {
        console.warn("UpdateDossier: Faltando dados originais ou novos.");
        return;
    }

    const dossierQuery = query(ref(db, `${dossierPath('dossies')}/${oldOrg}`), orderByChild('nome'), equalTo(oldNome));
    
    try {
        const snapshot = await get(dossierQuery);
        
        if (!snapshot.exists()) {
            const globalEntry = await findDossierEntryGlobal(newNome);
            
            let dadosAntigos = null;
            if (globalEntry && globalEntry.oldOrg !== newOrg) {
                dadosAntigos = globalEntry.personData;
                await remove(ref(db, `dossies/${globalEntry.oldOrg}/${globalEntry.personId}`));
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
            const updateRef = ref(db, `dossies/${newOrg}/${existingEntryId}`);
            await set(updateRef, newDossierData); 
        } else {
            await remove(ref(db, `${dossierPath('dossies')}/${oldOrg}/${existingEntryId}`));
            addDossierEntry(newVendaData, existingEntryData); 
        }

    } catch (err) {
        console.error("Erro ao sincronizar edição da venda com dossiê:", err);
        if(err.code !== "PERMISSION_DENIED") {
            showToast(`Erro ao sincronizar dossiê: ${err.message}`, "error");
        }
    }
};

// =================================================================
// FIM: LÓGICA DE SINCRONIZAÇÃO DO DOSSIÊ

// =================================================================

// =================================================================
// INÍCIO: FUNÇÃO DE AUTO-PREENCHIMENTO (NOVA v13)
// =================================================================
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
// =================================================================
// FIM: FUNÇÃO DE AUTO-PREENCHIMENTO

// =================================================================

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
  const orgId = getCurrentOrgId && getCurrentOrgId();
  const roleUpper = (window.effectiveRoleUpper || (currentUserData && currentUserData.tag ? String(currentUserData.tag).toUpperCase() : 'VISITANTE'));
  if (!orgId || roleUpper === 'VISITANTE') {
      showToast('Você precisa estar em uma facção para registrar vendas.', 'error');
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
              
              await remove(ref(db, `dossies/${existingEntry.oldOrg}/${existingEntry.personId}`));
              
              showToast(`"${newVenda.cliente}" movido de "${existingEntry.oldOrg}" para "${dossierOrgDestino}".`, "default", 4000);
          }
      } catch (e) {
          if (e.code !== "PERMISSION_DENIED") {
              showToast(`Erro ao verificar dossiê global: ${e.message}`, "error");
          }
      }
  }
  

  const operation = vendaEmEdicaoId ? set(ref(db, `orgData/${orgId}/vendas/${vendaEmEdicaoId}`), newVenda) : push(ref(db, `orgData/${orgId}/vendas`), newVenda);
  
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
    
    // Quantidades (novo: dinâmico via qtyByProduct)
    if (els.productsContainer) {
        // zera todos
        els.productsContainer.querySelectorAll('input.product-qty-input').forEach(inp => inp.value = '');
        const q = venda.qtyByProduct || {};
        Object.entries(q).forEach(([k, v]) => {
            const inp = els.productsContainer.querySelector(`input.product-qty-input[data-product="${k}"]`);
            if (inp) inp.value = v;
        });
    } else {
        // fallback antigo
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
    toggleView('main'); 
    showToast(`Editando venda de ${venda.cliente}`, "default");
};

const removeVenda = (id) => {
    if (confirm("Tem certeza que deseja remover esta venda?")) {
        remove(ref(db, `orgData/${getCurrentOrgId()}/vendas/${id}`))
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
    // Aceita um objeto venda (com qtyByProduct) ou um objeto qtyByProduct direto
    const qtyByProduct = vendaOrQtyByProduct?.qtyByProduct ?? vendaOrQtyByProduct ?? {};
    const entries = Object.entries(qtyByProduct || {}).filter(([,q]) => (Number(q) || 0) > 0);
    if (entries.length) {
        return entries.map(([k,q]) => `${capitalizeText(String(k).replace(/_/g, ' '))} (${q})`).join(', ');
    }
    // fallback legado
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
    if (els.leaderPanel) els.leaderPanel.style.display = 'none';
    if (els.hierarquiaCard) els.hierarquiaCard.style.display = 'none';
    els.dossierCard.style.display = 'none';
    
    document.body.classList.remove('history-view-active', 'dossier-view-active');

    if (viewName === 'history') {
        document.body.classList.add('history-view-active');
        els.historyCard.style.display = 'block';
        els.historyImg.src = historyBackgroundSrc;
        els.filtroHistorico.value = ''; 
        displaySalesHistory(vendas); 
    } else if (viewName === 'admin') {
        els.adminPanel.style.display = 'block';
        monitorOnlineStatus(); // Inicia o monitoramento de status
        loadAdminPanel(true); // Garante que a lista de usuários seja carregada
    
    } else if (viewName === 'leader') {
        if (els.leaderPanel) {
            els.leaderPanel.style.display = 'block';
            if (typeof loadLeaderPanel === 'function') loadLeaderPanel(true);
        }
    } else if (viewName === 'hierarquia') {
        if (els.hierarquiaCard) {
            els.hierarquiaCard.style.display = 'block';
            if (typeof loadHierarquiaView === 'function') loadHierarquiaView(true);
        }
} else if (viewName === 'dossier') {
        document.body.classList.add('dossier-view-active');
        els.dossierCard.style.display = 'block';
        showDossierOrgs(); 
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
    const userTagUpper = (currentUserData && currentUserData.tag) ? currentUserData.tag.toUpperCase() : 'VISITANTE';
    
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
    if (((currentUserData && currentUserData.tag) ? currentUserData.tag.toUpperCase() : 'VISITANTE') !== 'ADMIN') {
        showToast("Apenas administradores podem limpar o histórico.", "error");
        return;
    }
    if (confirm("ATENÇÃO: Deseja APAGAR TODO o histórico de vendas? Esta ação é irreversível.")) {
        remove(ref(db, 'vendas'))
            .then(() => showToast("Histórico limpado.", "success"))
            .catch(e => showToast(`Erro: ${e.message}`, "error"));
    }
};


// **** INÍCIO DAS FUNÇÕES DO DOSSIÊ (v12) ****

// --- INVESTIGAÇÃO POR FACÇÃO (escopo por orgId) ---
const getInvestigationRoot = () => {
  const orgId = getCurrentOrgId && getCurrentOrgId();
  return orgId ? `orgData/${orgId}` : null;
};
const invPath = (sub) => {
  const root = getInvestigationRoot();
  return root ? `${root}/${sub}` : null;
};
const requireOrgForInvestigation = () => {
  const root = getInvestigationRoot();
  if (!root) {
    showToast('Você precisa estar em uma facção para acessar a Investigação.', 'error');
    return false;
  }
  return true;
};


// =============================================
// NOVAS FUNÇÕES DO LIGHTBOX
// =============================================
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
// =============================================

// =============================================
// INÍCIO: FUNÇÕES DE HIERARQUIA DE PESSOAS (SortableJS)
// =============================================

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
            updates[`${invPath('dossies')}/${orgName}/${personId}/hierarquiaIndex`] = index;
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
    
    const userTagUpper = (currentUserData && currentUserData.tag) ? currentUserData.tag.toUpperCase() : 'VISITANTE';
    const canDrag = (userTagUpper === 'CEO' || userTagUpper === 'ADMIN' || userTagUpper === 'LIDER' || userTagUpper === 'GERENTE');
    
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

// =============================================
// FIM: FUNÇÕES DE HIERARQUIA DE PESSOAS
// =============================================

// =============================================
// INÍCIO: FUNÇÕES DE ORDENAÇÃO DE BASES (SortableJS para Orgs)
// =============================================

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
            updates[`${invPath('organizacoes')}/${orgId}/ordemIndex`] = index;
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
    
    const userTagUpper = (currentUserData && currentUserData.tag) ? currentUserData.tag.toUpperCase() : 'VISITANTE';
    const canDrag = (userTagUpper === 'CEO' || userTagUpper === 'ADMIN' || userTagUpper === 'LIDER' || userTagUpper === 'GERENTE');
    
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
// =============================================
// FIM: FUNÇÕES DE ORDENAÇÃO DE BASES
// =============================================


// Nível 1: Mostra as Organizações (Bases)
const showDossierOrgs = async () => {
    if (!requireOrgForInvestigation()) return;
    els.dossierOrgContainer.style.display = 'block';
    els.dossierPeopleContainer.style.display = 'none';
    els.dossierOrgGrid.innerHTML = '<p>Carregando organizações...</p>';
    globalAllOrgs = [];
    
    try {
        const orgsInfoRef = ref(db, invPath('organizacoes'));
        const orgsInfoSnap = await get(orgsInfoRef);
        const orgsInfo = orgsInfoSnap.exists() ? orgsInfoSnap.val() : {};
        
        const orgsPessoasRef = ref(db, invPath('dossies'));
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

// Renderiza os cards das Organizações (Bases)

// NOVO: Apagar Base (somente ADMIN/HELLS)
const canManageBases = () => {
    try {
        const t = (typeof getRoleTag === 'function') ? getRoleTag() : (currentUserData && currentUserData.tag ? String(currentUserData.tag).toUpperCase() : 'VISITANTE');
        return t === 'ADMIN' || t === 'CEO';
    } catch (_) { return false; }
};

const deleteBase = async (orgId) => {
    if (!canManageBases()) {
        showToast('Sem permissão para apagar bases.', 'error');
        return;
    }
    if (!confirm(`Tem certeza que deseja APAGAR a base "${orgId}"?\n\nIsso removerá também todas as pessoas/dossiês dessa base.`)) return;

    try {
        await remove(ref(db, `${invPath('organizacoes')}/${orgId}`));
        await remove(ref(db, `${invPath('dossies')}/${orgId}`));
        showToast('Base apagada com sucesso.', 'success');
        showDossierOrgs();
    } catch (err) {
        showToast(`Erro ao apagar base: ${err.message}`, 'error');
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
            // NOVO: Adiciona o listener para o Lightbox
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
        actionsDiv.innerHTML = `
            <button class="action-btn muted edit-org-btn" data-org-id="${org.id}">✏️ Editar Base</button>
            ${canManageBases() ? `<button class="action-btn danger delete-org-btn" data-org-id="${org.id}">🗑 Apagar</button>` : ``}
        `;
        
        card.appendChild(fotoDiv);
        card.appendChild(nomeH4);
        card.appendChild(infoP);
        card.appendChild(actionsDiv);
        
        actionsDiv.querySelector('.edit-org-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            openEditOrgModal(org.id);
        });
        const delBtn = actionsDiv.querySelector('.delete-org-btn');
        if (delBtn) delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteBase(org.id);
        });

        
        card.addEventListener('click', () => {
            showDossierPeople(org.nome);
        });
        
        els.dossierOrgGrid.appendChild(card);
    });
};

// Exibição da Busca Global
const displayGlobalSearchResults = (orgs, people) => {
    els.dossierOrgGrid.innerHTML = ''; 
    
    if (orgs.length === 0 && people.length === 0) {
        els.dossierOrgGrid.innerHTML = '<p>Nenhuma organização ou pessoa encontrada para este filtro.</p>';
        return;
    }

    // 1. Renderiza as Organizações (Bases) encontradas
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
                // NOVO: Adiciona o listener para o Lightbox
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

    // 2. Renderiza as Pessoas encontradas
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
            
            // --- INÍCIO: BASE CLICÁVEL ---
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
            // --- FIM: BASE CLICÁVEL ---

            const fotoDiv = document.createElement('div');
            fotoDiv.className = 'dossier-foto';
            if (entry.fotoUrl) {
                const img = document.createElement('img');
                img.src = entry.fotoUrl;
                img.alt = `Foto de ${entry.nome}`;
                // NOVO: Adiciona o listener para o Lightbox
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

// Nível 2: Mostra as Pessoas (Membros) de uma Org
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
        const peopleRef = ref(db, `${invPath('dossies')}/${orgName}`);
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

// Renderiza os cards das Pessoas (Membros)
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
            // NOVO: Adiciona o listener para o Lightbox
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

// Filtra a lista de Pessoas (Membros)
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

// --- Funções dos Modais de Organização (Base) ---

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

// =================================================================
// INÍCIO: ALTERAÇÃO (saveOrg para adicionar ordemIndex)
// =================================================================
const saveOrg = async () => {
    const orgNome = capitalizeText(els.orgNome.value.trim());
    const orgId = els.editOrgId.value || orgNome;
    
    if (!orgId) {
        showToast("O Nome da Organização é obrigatório.", "error");
        els.orgNome.classList.add('input-invalido');
        return;
    }
    els.orgNome.classList.remove('input-invalido');
    
    const orgRef = ref(db, `${invPath('organizacoes')}/${orgId}`);
    
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
            showDossierOrgs();
        })
        .catch(err => showToast(`Erro ao salvar: ${err.message}`, "error"));
};
// =================================================================
// FIM: ALTERAÇÃO
// =================================================================

const deleteOrg = () => {
    const orgId = els.editOrgId.value;
    if (!orgId) return;
    
    if (confirm(`ATENÇÃO:\n\nIsso apagará as INFORMAÇÕES DA BASE "${orgId}".\n\NIsso NÃO apagará os membros (pessoas) que estão dentro dela.\n\nDeseja continuar?`)) {
        remove(ref(db, `${invPath('organizacoes')}/${orgId}`))
            .then(() => {
                showToast("Informações da base removidas.", "success");
                closeOrgModal();
                showDossierOrgs();
            })
            .catch(err => showToast(`Erro: ${err.message}`, "error"));
    }
};

// --- Funções dos Modais de Pessoa (Membros) ---

// --- INÍCIO: NOVAS FUNÇÕES DO GERENCIADOR DE VEÍCULOS (Com Edição) ---

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
// --- FIM: Funções do Gerenciador de Veículos ---


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
    
    push(ref(db, `dossies/${org}`), newEntry)
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
            const entryRef = ref(db, `dossies/${org}/${id}`);
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

    const entryRef = ref(db, `dossies/${org}/${id}`);
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
    const userTagUpper = (currentUserData && currentUserData.tag) ? currentUserData.tag.toUpperCase() : 'VISITANTE';
    if (!currentUserData || (userTagUpper !== 'ADMIN' && userTagUpper !== 'HELLS')) {
        showToast("Apenas Admin/Hells podem remover entradas.", "error");
        return;
    }
    
    if (confirm("Tem certeza que deseja remover esta PESSOA do dossiê?")) {
        const entryRef = ref(db, `dossies/${orgName}/${entryId}`);
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

// ===========================================
// INÍCIO DA ALTERAÇÃO (Botão de Migração 1)
// ===========================================
const migrateVendasToDossier = async () => {
    if (!confirm("Isso irá copiar *todas* as vendas com organização para o Dossiê de Pessoas. (Já faz verificação de duplicados). Deseja continuar?")) {
        return;
    }
    
    showToast("Iniciando migração... Isso pode demorar.", "default", 5000);
    
    // --- INÍCIO DA MUDANÇA ---
    let isSuccess = false; // Flag para rastrear o sucesso
    // --- FIM DA MUDANÇA ---
    
    els.migrateDossierBtn.disabled = true;
    els.migrateDossierBtn.textContent = "Migrando...";
    
    try {
        const vendasRef = ref(db, 'vendas');
        const snapshot = await get(vendasRef);
        
        if (!snapshot.exists()) {
            showToast("Nenhuma venda encontrada para migrar.", "error");
            // --- MUDANÇA: Mesmo sem vendas, consideramos "sucesso"
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
        // --- INÍCIO DA MUDANÇA ---
        isSuccess = true; // Marca como sucesso
        // --- FIM DA MUDANÇA ---
        
    } catch (error) {
        showToast(`Erro na migração: ${error.message}`, "error");
        // --- INÍCIO DA MUDANÇA ---
        isSuccess = false; // Marca como falha
        // --- FIM DA MUDANÇA ---
    } finally {
        // --- INÍCIO DA MUDANÇA ---
        if (isSuccess) {
            // Se deu certo, mantém desabilitado e muda o texto
            els.migrateDossierBtn.textContent = "Migração Concluída";
            // Se preferir OCULTAR o botão, descomente a linha abaixo:
            // els.migrateDossierBtn.style.display = 'none';
        } else {
            // Se deu erro, reabilita para tentar de novo
            els.migrateDossierBtn.disabled = false;
            els.migrateDossierBtn.textContent = "Migrar Vendas Antigas para Dossiê";
        }
        // --- FIM DA MUDANÇA ---
    }
};
// ===========================================
// FIM DA ALTERAÇÃO (Botão de Migração 1)
// ===========================================

// ===========================================
// INÍCIO DA ALTERAÇÃO (Botão de Migração 2)
// ===========================================
const migrateVeiculosData = async () => {
    if (!confirm("ATENÇÃO: Isso irá converter TODOS os campos 'carro' e 'placas' (com vírgulas) para o novo sistema de veículos. Faça isso APENAS UMA VEZ.\n\nDeseja continuar?")) {
        return;
    }
    
    showToast("Iniciando migração de veículos... Isso pode demorar.", "default", 5000);
    
    // --- INÍCIO DA MUDANÇA ---
    let isSuccess = false; // Flag para rastrear o sucesso
    // --- FIM DA MUDANÇA ---
    
    els.migrateVeiculosBtn.disabled = true;
    els.migrateVeiculosBtn.textContent = "Migrando...";
    
    try {
        const dossiesRef = ref(db, invPath('dossies'));
        const snapshot = await get(dossiesRef);
        
        if (!snapshot.exists()) {
            showToast("Nenhum dossiê encontrado.", "error");
            // --- MUDANÇA: Mesmo sem dossiê, consideramos "sucesso"
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
        
        // --- INÍCIO DA MUDANÇA ---
        isSuccess = true; // Marca como sucesso (mesmo se não houver o que migrar)
        // --- FIM DA MUDANÇA ---
        
    } catch (error) {
        showToast(`Erro na migração de veículos: ${error.message}`, "error");
        // --- INÍCIO DA MUDANÇA ---
        isSuccess = false; // Marca como falha
        // --- FIM DA MUDANÇA ---
    } finally {
        // --- INÍCIO DA MUDANÇA ---
        if (isSuccess) {
            // Se deu certo, mantém desabilitado e muda o texto
            els.migrateVeiculosBtn.textContent = "Migração Concluída";
            // Se preferir OCULTAR o botão, descomente a linha abaixo:
            // els.migrateVeiculosBtn.style.display = 'none';
        } else {
            // Se deu erro, reabilita para tentar de novo
            els.migrateVeiculosBtn.disabled = false;
            els.migrateVeiculosBtn.textContent = "Migrar Veículos Antigos (Dossiê)";
        }
        // --- FIM DA MUDANÇA ---
    }
};
// ===========================================
// FIM DA ALTERAÇÃO (Botão de Migração 2)
// ===========================================

// **** FIM DAS FUNÇÕES DO DOSSIÊ (v12) ****


const toggleTheme = () => {
    const isDarkMode = document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
    updateLogoAndThemeButton(isDarkMode);
};

const updateLogoAndThemeButton = (isDarkMode) => {
    els.themeBtn.textContent = isDarkMode ? '☀️ Modo Claro' : '🌙 Modo Noturno';
    els.appLogo.src = isDarkMode ? logoDarkModeSrc : logoLightModeSrc;
    els.welcomeLogo.src = welcomeLogoSrc;
    els.historyImg.src = historyBackgroundSrc;
};



// ------------------------------
// NOVO: Tema customizável (cores) via Firebase
// Salva em configuracoesGlobais/themeCustom -> { light: {bg,text,card,accent}, dark: {...} }
// ------------------------------
let themeCustomCache = null;

const hexOrNull = (v) => (typeof v === 'string' && /^#([0-9a-fA-F]{3}){1,2}$/.test(v)) ? v : null;

const applyThemeCustomCSS = (themeObj) => {
    themeCustomCache = themeObj || null;
    let styleEl = document.getElementById('customThemeStyle');
    if (!styleEl) {
        styleEl = document.createElement('style');
        styleEl.id = 'customThemeStyle';
        document.head.appendChild(styleEl);
    }
    const light = themeObj && themeObj.light ? themeObj.light : null;
    const dark = themeObj && themeObj.dark ? themeObj.dark : null;

    const cssVars = (obj) => {
        if (!obj) return '';
        const bg = hexOrNull(obj.bg);
        const text = hexOrNull(obj.text);
        const card = hexOrNull(obj.card);
        const accent = hexOrNull(obj.accent);
        let out = '';
        if (bg) out += `--cor-fundo:${bg};`;
        if (text) out += `--cor-texto:${text};`;
        if (card) out += `--cor-card:${card};`;
        if (accent) out += `--cor-primaria:${accent};`;
        return out;
    };

    styleEl.textContent = `
:root{${cssVars(light)}}
body.dark{${cssVars(dark)}}
`;
};

const listenThemeCustom = () => {
    // Só depois que o Firebase estiver pronto e o usuário autenticado
    try {
        const themeRef = ref(db, 'configuracoesGlobais/themeCustom');
        onValue(themeRef, (snap) => {
            if (snap.exists()) applyThemeCustomCSS(snap.val());
            else applyThemeCustomCSS(null);
        });
    } catch (e) {
        // ignora
    }
};

const getRoleTag = () => {
    let raw = (currentUserData && currentUserData.tag) ? String(currentUserData.tag) : 'VISITANTE';
    raw = raw.toUpperCase();
    if (currentUser && globalCeoUid && currentUser.uid === globalCeoUid) return 'CEO';
    return raw;
};

const buildTourSteps = (roleTag) => {
    // Passo "element" aponta para uma chave do objeto els (ex: 'calcBtn')
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

    const admin = [
        { element: 'adminPanelBtn', title: 'Painel Admin', content: 'Como ADMIN você pode gerenciar usuários e configurações.' },
        { element: 'catalogOpenEditorBtn', title: 'Alterar calculadora', content: 'Ative o editor visual para mudar nomes, materiais, preços e adicionar/remover produtos.' }
    ];

    if (roleTag === 'CEO' || roleTag === 'ADMIN') return [...base, ...admin, { element: 'ceoPanelSection', title: 'Painel do CEO', content: 'Como CEO você cria/edita organizações, personaliza cargos e organiza usuários por facção.' }];
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

    // remove highlights do passo anterior
    if (currentStepIndex >= 0) {
        document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
        if (currentTooltip) currentTooltip.classList.remove('active');
    }

    // encontra o próximo passo com elemento existente
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

    // cria overlay na primeira etapa
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
    // força layout para medir tooltip
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



// Event Listeners (Calculadora)
els.calcBtn.onclick = calculate;
els.resetBtn.onclick = clearAllFields;
els.registerBtn.onclick = registerVenda;
els.toggleHistoryBtn.onclick = () => toggleView('history');
els.toggleCalcBtn.onclick = () => toggleView('main');
els.clearHistoryBtn.onclick = clearHistory;
els.csvBtn.onclick = exportToCsv;
els.themeBtn.onclick = toggleTheme;
if (els.leaderPanelBtn) els.leaderPanelBtn.onclick = () => toggleView('leader');
if (els.hierarquiaBtn) els.hierarquiaBtn.onclick = () => toggleView('hierarquia');
els.tutorialBtn.onclick = () => {
    if (!currentUser) {
        showToast("Faça login para iniciar o tutorial.", "default");
        return;
    }
    // garante que estamos na calculadora
    toggleView('main');

    // reinicia sempre
    clearTour();
    tourSteps = buildTourSteps(getRoleTag());
    showNextTourStep();
};
els.discordBtnCalc.onclick = () => copyDiscordMessage(false, null);
els.filtroHistorico.addEventListener('input', filterHistory);

// --- NOVO EVENT LISTENER (v13) ---
els.nomeCliente.addEventListener('change', autoFillFromDossier);

// Event Listeners (Dossiê v8)
els.investigacaoBtn.onclick = () => {
  // CEO: se não estiver "dentro" de uma facção, pedir para escolher uma
  try {
    const isCeoByUid = (currentUser && globalCeoUid && currentUser.uid === globalCeoUid);
    const effectiveOrgId = (typeof getCurrentOrgId === 'function') ? getCurrentOrgId() : (currentUserData && currentUserData.orgId ? String(currentUserData.orgId) : null);

    if (isCeoByUid && !effectiveOrgId) {
      const orgs = globalOrgsConfig || {};
      const orgIds = Object.keys(orgs || {});
      if (!orgIds.length) {
        showToast('Nenhuma facção cadastrada ainda. Crie uma no painel do CEO.', 'error');
        return;
      }

      // Modal simples para escolher a facção
      let modal = document.getElementById('ceoOrgPickModal');
      if (modal) modal.remove();

      modal = document.createElement('div');
      modal.id = 'ceoOrgPickModal';
      modal.style.position = 'fixed';
      modal.style.inset = '0';
      modal.style.background = 'rgba(0,0,0,0.55)';
      modal.style.zIndex = '9999';
      modal.style.display = 'flex';
      modal.style.alignItems = 'center';
      modal.style.justifyContent = 'center';

      const card = document.createElement('div');
      card.className = 'card';
      card.style.maxWidth = '520px';
      card.style.width = '92%';
      card.style.padding = '18px';

      const title = document.createElement('h3');
      title.textContent = 'Escolher facção para investigar';
      card.appendChild(title);

      const p = document.createElement('p');
      p.className = 'muted';
      p.textContent = 'Como CEO, selecione uma facção para abrir Investigação, Vendas e Hierarquia como se fosse dela (sem alterar o banco).';
      card.appendChild(p);

      const sel = document.createElement('select');
      sel.style.width = '100%';
      sel.style.padding = '10px';
      sel.style.margin = '10px 0 14px 0';

      orgIds.sort().forEach((orgId) => {
        const org = orgs[orgId] || {};
        const profile = org.profile || org;
        const name = profile.name || orgId;
        const opt = document.createElement('option');
        opt.value = orgId;
        opt.textContent = name;
        sel.appendChild(opt);
      });
      card.appendChild(sel);

      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '10px';
      row.style.justifyContent = 'flex-end';

      const btnCancel = document.createElement('button');
      btnCancel.className = 'muted';
      btnCancel.textContent = 'Cancelar';
      btnCancel.onclick = () => modal.remove();

      const btnEnter = document.createElement('button');
      btnEnter.textContent = 'Entrar';
      btnEnter.onclick = () => {
        const chosen = sel.value;
        if (!chosen) return;
        if (typeof setCeoViewOrgId === 'function') setCeoViewOrgId(chosen);
        modal.remove();
        location.reload();
      };

      row.appendChild(btnCancel);
      row.appendChild(btnEnter);
      card.appendChild(row);

      modal.appendChild(card);
      document.body.appendChild(modal);
      return;
    }
  } catch (e) {}

  toggleView('dossier');
};
els.toggleCalcBtnDossier.onclick = () => toggleView('main');

// Nível 1 (Orgs)
els.filtroDossierOrgs.addEventListener('input', filterOrgs);
els.addOrgBtn.onclick = openAddOrgModal;

// Nível 2 (Pessoas)
els.dossierVoltarBtn.onclick = () => showDossierOrgs();
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

// Adiciona listener no grid de Orgs (para os botões nos resultados da busca de pessoas)
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

// Modais de Pessoas (Salvar/Cancelar)
els.saveDossierBtn.onclick = saveDossierChanges;
els.cancelDossierBtn.onclick = closeEditDossierModal;
els.editDossierOverlay.onclick = closeEditDossierModal;

els.saveNewDossierBtn.onclick = saveNewDossierEntry;
els.cancelNewDossierBtn.onclick = closeAddDossierModal;
els.addDossierOverlay.onclick = closeAddDossierModal;

// --- NOVOS Listeners do Gerenciador de Veículos (Com Edição) ---

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
// --- FIM ---

// Modais de Orgs
els.saveOrgBtn.onclick = saveOrg;
els.deleteOrgBtn.onclick = deleteOrg;
els.cancelOrgBtn.onclick = closeOrgModal;
els.orgModalOverlay.onclick = closeOrgModal;

// NOVO (Lightbox)
els.imageLightboxOverlay.onclick = closeImageLightbox;

// Admin
els.migrateDossierBtn.onclick = migrateVendasToDossier;
els.migrateVeiculosBtn.onclick = migrateVeiculosData; 
els.toggleCalcBtnAdmin.onclick = () => toggleView('main'); 

// --- NOVO LISTENER: Salvar Texto do Painel Inferior ---
els.saveBottomPanelTextBtn.onclick = () => {
    const newText = els.bottomPanelText.value.trim();
    updateGlobalLayout('bottomPanelText', newText);
    showToast("Mensagem do rodapé salva!", "success");
};
// --- FIM NOVO LISTENER ---



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

/**
 * Carrega a lista de usuários e incorpora o status online.
 * @param {boolean} fetchStatus - Indica se deve buscar o status online se ainda não tiver.
 */
const loadAdminPanel = async (fetchStatus = true) => {
    
    // 1. Garante que os dados de status online estejam disponíveis
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
    
    // CORREÇÃO: Colspan de 4 para 2
    els.adminUserListBody.innerHTML = '<tr><td colspan="2" style="text-align: center;">Carregando...</td></tr>';
    
    try {
        const usersSnapshot = await get(ref(db, 'usuarios'));
        if (!usersSnapshot.exists()) {
            // CORREÇÃO: Colspan de 4 para 2
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

        // Re-ordena: Online (Admin/Líder+) > Offline (Admin/Líder+) > Visitante
        const tagOrder = { 'CEO': 0, 'ADMIN': 1, 'LIDER': 3, 'GERENTE': 4, 'MEMBRO': 5, 'VISITANTE': 6 };
        
        usersList.sort((a, b) => {
            const statusA = globalOnlineStatus[a.uid] || { isOnline: false, inactivity: Infinity };
            const statusB = globalOnlineStatus[b.uid] || { isOnline: false, inactivity: Infinity };
            
            // 1. Ordem por Online vs Offline
            if (statusA.isOnline !== statusB.isOnline) {
                return statusA.isOnline ? -1 : 1; 
            }
            
            // 2. Ordem por Tag (Admin/Hells/Visitante)
            const tagA = (tagOrder[((a.tag || 'VISITANTE') + '').toUpperCase()] || 4);
            const tagB = (tagOrder[((b.tag || 'VISITANTE') + '').toUpperCase()] || 4);
            if (tagA !== tagB) {
                return tagA - tagB;
            }
            
            // 3. Ordem por Inatividade (Menos inativo primeiro)
            if (statusA.inactivity !== statusB.inactivity) {
                return statusA.inactivity - statusB.inactivity;
            }

            // 4. Ordem alfabética (fallback)
            return (a.displayName || '').localeCompare(b.displayName || '');
        });

        els.adminUserListBody.innerHTML = '';
        
        usersList.forEach(user => {
            const uid = user.uid;
            const userData = user;
            const status = globalOnlineStatus[uid] || { isOnline: false, inactivity: Infinity };
            
            const row = els.adminUserListBody.insertRow();
            
            // --- INÍCIO DA MODIFICAÇÃO (AGRUPAMENTO) ---
            // CÉLULA PRINCIPAL (Nome, Atividade, Tag)
            const mainCell = row.insertCell();
            mainCell.style.verticalAlign = 'top'; // Alinha no topo para a pilha
            mainCell.style.padding = '8px 6px'; // Espaçamento padrão

            // 1. Nome (com status dot)
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

            // 2. Atividade
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
            
            // 3. Permissão (Tag)
            const tagContainer = document.createElement('div');
            tagContainer.style.marginLeft = '20px'; // Indenta
            
            if (uid === currentUser.uid) {
                tagContainer.textContent = `👑 ${userData.tag} (Você)`;
                tagContainer.style.fontWeight = '600';
            } else {
                
const select = document.createElement('select');
                select.style.width = 'auto';
                select.style.maxWidth = '220px';
                select.dataset.uid = uid;

                const makeOpt = (val, text) => {
                    const o = document.createElement('option');
                    o.value = val;
                    o.textContent = text;
                    return o;
                };

                // Hierarquia de cargos (o CEO é definido por /config/ceoUid)
                select.appendChild(makeOpt('VISITANTE', 'Visitante'));
                select.appendChild(makeOpt('MEMBRO', 'Membro'));
                select.appendChild(makeOpt('GERENTE', 'Gerente'));
                select.appendChild(makeOpt('LIDER', 'Líder'));

                // Apenas CEO pode atribuir HELLS/ADMIN
                const isCeoForRoles = (currentUser && globalCeoUid && currentUser.uid === globalCeoUid);
                if (isCeoForRoles) {
                  select.appendChild(makeOpt('HELLS', 'Hells'));
                  select.appendChild(makeOpt('ADMIN', '👑 Administrador'));
                }

                const currentTag = (userData.tag || 'VISITANTE').toUpperCase();
                select.value = ['VISITANTE','MEMBRO','GERENTE','LIDER','ADMIN'].includes(currentTag) ? currentTag : 'VISITANTE';
                select.onchange = (e) => updateUserTag(e.target.dataset.uid, e.target.value);
                tagContainer.appendChild(select);

            }
            
// Org (somente CEO)
const isCeo = currentUser && globalCeoUid && currentUser.uid === globalCeoUid;
if (isCeo) {
    const orgWrap = document.createElement('div');
    orgWrap.style.marginTop = '6px';
    orgWrap.style.display = 'flex';
    orgWrap.style.gap = '8px';
    orgWrap.style.alignItems = 'center';
    orgWrap.style.flexWrap = 'wrap';

    const orgLabel = document.createElement('span');
    orgLabel.textContent = 'Org:';
    orgLabel.style.fontSize = '12px';
    orgLabel.style.opacity = '0.8';
    orgWrap.appendChild(orgLabel);

    const orgSelect = document.createElement('select');
    orgSelect.style.maxWidth = '220px';
    orgSelect.dataset.uid = uid;

    const optNone = document.createElement('option');
    optNone.value = '';
    optNone.textContent = '(sem org)';
    orgSelect.appendChild(optNone);

    const orgs = globalOrgsConfig || {};
    Object.keys(orgs).sort().forEach((orgId) => {
        const o = document.createElement('option');
        o.value = orgId;
        o.textContent = orgs[orgId].name ? `${orgs[orgId].name} (${orgId})` : orgId;
        orgSelect.appendChild(o);
    });

    orgSelect.value = userData.orgId ? userData.orgId : '';
    orgSelect.onchange = (e) => updateUserOrg(e.target.dataset.uid, e.target.value || null);
    orgWrap.appendChild(orgSelect);

    mainCell.appendChild(orgWrap);
}

mainCell.appendChild(tagContainer);

            // --- FIM DA MODIFICAÇÃO (AGRUPAMENTO) ---

            
            // CÉLULA DE AÇÕES (Agora é a segunda célula)
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
        // CORREÇÃO: Colspan de 4 para 2
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


const updateUserOrg = (uid, orgIdOrNull) => {
    const userRef = ref(db, `usuarios/${uid}/orgId`);
    set(userRef, orgIdOrNull)
        .then(() => showToast('Organização atualizada.', 'success'))
        .catch((e) => {
            console.error(e);
            showToast(`Erro ao salvar org: ${e.code || e.message}`, 'error');
        });
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

els.adminPanelBtn.onclick = () => { toggleView('admin'); loadAdminPanel(true); if (typeof initCeoPanel === 'function') initCeoPanel(); };
els.layoutToggleNightMode.onchange = (e) => updateGlobalLayout('enableNightMode', e.target.checked);
els.layoutToggleBottomPanel.onchange = (e) => updateGlobalLayout('enableBottomPanel', e.target.checked);




// ----------------------------
// CATÁLOGO (Produtos e Materiais) - Admin
// ----------------------------
// ================================
// CATÁLOGO: Editor visual (sem JSON)
// ================================
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
    // Carrega do banco antes de abrir (garante que o admin edita a versão atual)
    try {
        const snap = await get(ref(db, 'config/catalog'));
        applyCatalogConfig(snap.exists() ? snap.val() : null);
    } catch (e) {
        // se falhar, abre com o que já está em memória
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

        // Bind
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

        // Materials edits
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
        // Normaliza e salva no formato compatível
        const payload = normalizeCatalogConfig({
            perUnit: draft.perUnit,
            valores: draft.valores,
            labels: draft.labels,
        });

        try {
            await set(ref(db, 'config/catalog'), payload);
            applyCatalogConfig(payload);
            showToast('Calculadora atualizada e salva no banco!', 'success');
            // Mantém aberto
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

    // Primeiro render
    renderList();
    renderEditor();
};

// Botões (podem não existir para não-admins)
if (els.catalogOpenEditorBtn) els.catalogOpenEditorBtn.onclick = openCatalogEditor;




// ------------------------------
// NOVO: Editor visual de cores (tema) - salva no Firebase
// ------------------------------
const themeEls = () => ({
    lightBg: document.getElementById('themeLightBg'),
    lightText: document.getElementById('themeLightText'),
    lightCard: document.getElementById('themeLightCard'),
    lightAccent: document.getElementById('themeLightAccent'),
    darkBg: document.getElementById('themeDarkBg'),
    darkText: document.getElementById('themeDarkText'),
    darkCard: document.getElementById('themeDarkCard'),
    darkAccent: document.getElementById('themeDarkAccent'),
    loadBtn: document.getElementById('themeLoadBtn'),
    saveBtn: document.getElementById('themeSaveBtn'),
    resetBtn: document.getElementById('themeResetBtn'),
});

const pickCurrentCssVar = (varName, fallback) => {
    try {
        const v = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
        return v || fallback;
    } catch (_) { return fallback; }
};

const fillThemeInputsFrom = (themeObj) => {
    const t = themeEls();
    if (!t.lightBg) return;
    const light = themeObj && themeObj.light ? themeObj.light : {};
    const dark = themeObj && themeObj.dark ? themeObj.dark : {};
    t.lightBg.value = light.bg || pickCurrentCssVar('--cor-fundo', '#0f0f10');
    t.lightText.value = light.text || pickCurrentCssVar('--cor-texto', '#f5f5f5');
    t.lightCard.value = light.card || pickCurrentCssVar('--cor-card', '#17181a');
    t.lightAccent.value = light.accent || pickCurrentCssVar('--cor-primaria', '#ffb3d9');
    t.darkBg.value = dark.bg || '#0f0f10';
    t.darkText.value = dark.text || '#f5f5f5';
    t.darkCard.value = dark.card || '#17181a';
    t.darkAccent.value = dark.accent || '#ffb3d9';
};

const readThemeInputs = () => {
    const t = themeEls();
    return {
        light: { bg: t.lightBg.value, text: t.lightText.value, card: t.lightCard.value, accent: t.lightAccent.value },
        dark: { bg: t.darkBg.value, text: t.darkText.value, card: t.darkCard.value, accent: t.darkAccent.value },
    };
};

const loadThemeCustomConfig = async () => {
    try {
        const snap = await get(ref(db, 'configuracoesGlobais/themeCustom'));
        if (snap.exists()) {
            fillThemeInputsFrom(snap.val());
            if (typeof applyThemeCustomCSS === 'function') applyThemeCustomCSS(snap.val());
            showToast('Cores carregadas.', 'success');
        } else {
            fillThemeInputsFrom(null);
            showToast('Sem configuração salva. Use "Salvar Cores" para criar.', 'info');
        }
    } catch (e) {
        showToast(`Erro ao carregar cores: ${e.message}`, 'error');
    }
};

const saveThemeCustomConfig = async () => {
    try {
        const payload = readThemeInputs();
        await set(ref(db, 'configuracoesGlobais/themeCustom'), payload);
        if (typeof applyThemeCustomCSS === 'function') applyThemeCustomCSS(payload);
        showToast('Cores salvas!', 'success');
    } catch (e) {
        showToast(`Erro ao salvar cores: ${e.message}`, 'error');
    }
};

const resetThemeCustomConfig = async () => {
    if (!confirm('Resetar as cores customizadas? Isso volta para o padrão.')) return;
    try {
        await remove(ref(db, 'configuracoesGlobais/themeCustom'));
        if (typeof applyThemeCustomCSS === 'function') applyThemeCustomCSS(null);
        fillThemeInputsFrom(null);
        showToast('Cores resetadas.', 'success');
    } catch (e) {
        showToast(`Erro ao resetar: ${e.message}`, 'error');
    }
};

// Liga botões (se existirem na tela)
(() => {
    const t = themeEls();
    if (!t.saveBtn) return;
    t.loadBtn.onclick = loadThemeCustomConfig;
    t.saveBtn.onclick = saveThemeCustomConfig;
    t.resetBtn.onclick = resetThemeCustomConfig;
    // auto-load quando o painel abrir (se já existir cache, só preenche)
    setTimeout(() => loadThemeCustomConfig(), 200);
})();




// --- Painel CEO (Organizações & nomes de cargos) ---
const sanitizeOrgId = (s) => (s || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');

const renderOrgList = () => {
    const listEl = document.getElementById('orgList');
    if (!listEl) return;
    listEl.innerHTML = '';
    const orgs = globalOrgsConfig || {};
    const ids = Object.keys(orgs).sort();
    if (!ids.length) {
        const empty = document.createElement('div');
        empty.style.opacity = '0.8';
        empty.style.fontSize = '12px';
        empty.textContent = 'Nenhuma organização cadastrada ainda.';
        listEl.appendChild(empty);
        return;
    }

    ids.forEach((orgId) => {
        const org = orgs[orgId] || {};
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.gap = '10px';
        row.style.alignItems = 'center';
        row.style.flexWrap = 'wrap';
        row.style.padding = '10px';
        row.style.border = '1px solid var(--border-color)';
        row.style.borderRadius = '12px';
        row.style.background = 'var(--card-bg)';

        const swatch = document.createElement('div');
        swatch.style.width = '14px';
        swatch.style.height = '14px';
        swatch.style.borderRadius = '50%';
        swatch.style.border = '1px solid var(--border-color)';
        swatch.style.background = org.color || '#888888';
        row.appendChild(swatch);

        const title = document.createElement('div');
        title.style.flex = '1';
        title.innerHTML = `<strong>${org.name || orgId}</strong> <span style="opacity:.7; font-size:12px;">(${orgId})</span>`;
        row.appendChild(title);

        const editBtn = document.createElement('button');
        editBtn.className = 'muted';
        editBtn.textContent = 'Editar';
        editBtn.onclick = () => {
            const idEl = document.getElementById('orgIdInput');
            const nameEl = document.getElementById('orgNameInput');
            const colorEl = document.getElementById('orgColorInput');
            const logoEl = document.getElementById('orgLogoInput');
            if (!idEl || !nameEl || !colorEl || !logoEl) return;
            idEl.value = orgId;
            nameEl.value = org.name || '';
            colorEl.value = org.color || '#444444';
            logoEl.value = org.logo || '';
        };
        row.appendChild(editBtn);

        const delBtn = document.createElement('button');
        delBtn.className = 'muted';
        delBtn.textContent = 'Apagar';
        delBtn.onclick = async () => {
            if (!confirm(`Apagar a organização "${org.name || orgId}"?`)) return;
            try {
                await remove(ref(db, `config/orgs/${orgId}`));
                showToast('Organização apagada.', 'success');
            } catch (e) {
                console.error(e);
                showToast(`Erro ao apagar: ${e.code || e.message}`, 'error');
            }
        };
        row.appendChild(delBtn);

        listEl.appendChild(row);
    });
};

const refreshRoleLabelsEditor = () => {
    const sel = document.getElementById('roleLabelsOrgSelect');
    if (!sel) return;
    const current = sel.value;
    sel.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = 'Selecione...';
    sel.appendChild(opt0);

    const orgs = globalOrgsConfig || {};
    Object.keys(orgs).sort().forEach((orgId) => {
        const o = document.createElement('option');
        o.value = orgId;
        o.textContent = orgs[orgId].name ? `${orgs[orgId].name} (${orgId})` : orgId;
        sel.appendChild(o);
    });

    sel.value = current && orgs[current] ? current : '';
    const apply = () => {
        const orgId = sel.value;
        const org = orgId ? (globalOrgsConfig[orgId] || {}) : {};
        const labels = org.labels || {};
        const setVal = (id, def) => {
            const el = document.getElementById(id);
            if (el) el.value = (labels[def] || (def === 'CEO' ? 'CEO' : def.charAt(0) + def.slice(1).toLowerCase()));
        };
        setVal('lblCEO', 'CEO');
        setVal('lblLIDER', 'LIDER');
        setVal('lblGERENTE', 'GERENTE');
        setVal('lblMEMBRO', 'MEMBRO');
        setVal('lblVISITANTE', 'VISITANTE');
    };

    sel.onchange = apply;
    apply();
};

const initCeoPanel = () => {
    const section = document.getElementById('ceoPanelSection');
    if (!section) return;

    const isCeo = currentUser && globalCeoUid && currentUser.uid === globalCeoUid;
    section.style.display = isCeo ? 'block' : 'none';
    if (!isCeo) return;

    // CEO: testar cargos (apenas visual, não altera banco)
    if (!document.getElementById('ceoTestRoleBox')) {
      const box = document.createElement('div');
      box.id = 'ceoTestRoleBox';
      box.className = 'admin-section';
      box.innerHTML = `
        <h3>Testar cargos (somente para testes)</h3>
        <div class="grid">
          <div>
            <label>Ver site como</label>
            <select id="ceoTestRoleSelect">
              <option value="CEO">CEO</option>
              <option value="ADMIN">Admin</option>
                            <option value="LIDER">Líder</option>
              <option value="GERENTE">Gerente</option>
              <option value="MEMBRO">Membro</option>
              <option value="VISITANTE">Visitante</option>
            </select>
          </div>
        </div>
        <button id="ceoApplyTestRoleBtn">Aplicar</button>
        <button id="ceoResetTestRoleBtn" class="muted">Voltar CEO</button>
      `;
      

// CEO: visualizar como uma facção (sem mudar o banco)
if (!document.getElementById('ceoViewOrgBox')) {
  const viewBox = document.createElement('div');
  viewBox.id = 'ceoViewOrgBox';
  viewBox.className = 'admin-section';
  viewBox.innerHTML = `
    <h3>Entrar na facção (visualização)</h3>
    <p class="muted" style="margin-top:-6px;">Você pode selecionar uma facção para ver Investigação, Vendas, Hierarquia e identidade (logo/cor) como se fosse dela. Isso não altera o seu usuário no banco.</p>
    <div class="grid">
      <div>
        <label>Facção ativa</label>
        <select id="ceoViewOrgSelect"></select>
      </div>
    </div>
    <button id="ceoApplyViewOrgBtn">Entrar</button>
    <button id="ceoClearViewOrgBtn" class="muted">Sair da facção</button>
  `;
  section.prepend(viewBox);

  const selOrg = viewBox.querySelector('#ceoViewOrgSelect');
  const applyBtn = viewBox.querySelector('#ceoApplyViewOrgBtn');
  const clearBtn = viewBox.querySelector('#ceoClearViewOrgBtn');

  const rebuildOrgOptions = () => {
    const orgs = globalOrgsConfig || {};
    const current = (typeof localStorage !== 'undefined') ? localStorage.getItem('ceoViewOrgId') : null;
    selOrg.innerHTML = '';
    const opt0 = document.createElement('option');
    opt0.value = '';
    opt0.textContent = current ? '(manter selecionada)' : '(selecione)';
    selOrg.appendChild(opt0);

    Object.keys(orgs).sort().forEach((orgId) => {
      const org = orgs[orgId] || {};
      const profile = org.profile || org;
      const name = profile.name || orgId;
      const opt = document.createElement('option');
      opt.value = orgId;
      opt.textContent = name;
      if (current && current === orgId) opt.selected = true;
      selOrg.appendChild(opt);
    });
  };

  rebuildOrgOptions();

  applyBtn.onclick = () => {
    const val = selOrg.value;
    if (!val) { showToast('Selecione uma facção primeiro.', 'error'); return; }
    if (typeof setCeoViewOrgId === 'function') setCeoViewOrgId(val);
    showToast('Modo facção ativado. Agora você está visualizando como essa facção.', 'success');
    // Reaplica identidade e recarrega views
    try { if (typeof applyRoleCapabilities === 'function') applyRoleCapabilities(); } catch (e) {}
    try { if (typeof refreshAllViews === 'function') refreshAllViews(); } catch (e) {}
  };

  clearBtn.onclick = () => {
    if (typeof setCeoViewOrgId === 'function') setCeoViewOrgId(null);
    showToast('Você saiu do modo facção.', 'success');
    try { if (typeof applyRoleCapabilities === 'function') applyRoleCapabilities(); } catch (e) {}
    try { if (typeof refreshAllViews === 'function') refreshAllViews(); } catch (e) {}
    rebuildOrgOptions();
  };
}

section.prepend(box);

      const sel = box.querySelector('#ceoTestRoleSelect');
      const apply = box.querySelector('#ceoApplyTestRoleBtn');
      const reset = box.querySelector('#ceoResetTestRoleBtn');

      // carrega estado
      try {
        const imp = localStorage.getItem('impersonateRole') || 'CEO';
        const en = localStorage.getItem('impersonateRoleEnabled') === '1';
        sel.value = (en ? imp : 'CEO').toUpperCase();
      } catch (e) {}

      apply.onclick = () => {
        try {
          localStorage.setItem('impersonateRole', sel.value.toUpperCase());
          localStorage.setItem('impersonateRoleEnabled', '1');
        } catch (e) {}
        showToast('Modo de teste aplicado. Recarregando interface...', 'success');
        configurarInterfacePorTag(sel.value.toUpperCase());
      };

      reset.onclick = () => {
        try {
          localStorage.setItem('impersonateRole', 'CEO');
          localStorage.setItem('impersonateRoleEnabled', '0');
        } catch (e) {}
        showToast('Voltando para CEO...', 'success');
        configurarInterfacePorTag('CEO');
      };
    }

    const idEl = document.getElementById('orgIdInput');
    const nameEl = document.getElementById('orgNameInput');
    const colorEl = document.getElementById('orgColorInput');
    const logoEl = document.getElementById('orgLogoInput');
    const saveBtn = document.getElementById('orgSaveBtn');
    const clearBtn = document.getElementById('orgClearBtn');

    if (saveBtn && !saveBtn.dataset.bound) {
        saveBtn.dataset.bound = '1';
        saveBtn.onclick = async () => {
            const orgId = sanitizeOrgId(idEl ? idEl.value : '');
            const name = (nameEl ? nameEl.value : '').trim();
            const color = (colorEl ? colorEl.value : '#444444');
            const logo = (logoEl ? logoEl.value : '').trim();

            if (!orgId || orgId.length < 2) {
                showToast('Informe um ID de organização válido (ex: hells).', 'error');
                return;
            }
            if (!name) {
                showToast('Informe o nome da organização.', 'error');
                return;
            }

            try {
                const existing = globalOrgsConfig && globalOrgsConfig[orgId] ? globalOrgsConfig[orgId] : {};
                const labels = existing.labels || {
                    CEO: 'CEO', LIDER: 'Líder', GERENTE: 'Gerente', MEMBRO: 'Membro', VISITANTE: 'Visitante'
                };
                await set(ref(db, `config/orgs/${orgId}`), { name, color, logo: logo || null, labels });
                showToast('Organização salva!', 'success');
                if (idEl) idEl.value = orgId;
            } catch (e) {
                console.error(e);
                showToast(`Erro ao salvar org: ${e.code || e.message}`, 'error');
            }
        };
    }

    if (clearBtn && !clearBtn.dataset.bound) {
        clearBtn.dataset.bound = '1';
        clearBtn.onclick = () => {
            if (idEl) idEl.value = '';
            if (nameEl) nameEl.value = '';
            if (colorEl) colorEl.value = '#444444';
            if (logoEl) logoEl.value = '';
        };
    }

    const saveLabelsBtn = document.getElementById('saveRoleLabelsBtn');
    if (saveLabelsBtn && !saveLabelsBtn.dataset.bound) {
        saveLabelsBtn.dataset.bound = '1';
        saveLabelsBtn.onclick = async () => {
            const sel = document.getElementById('roleLabelsOrgSelect');
            const orgId = sel ? sel.value : '';
            if (!orgId) {
                showToast('Selecione uma organização.', 'error');
                return;
            }
            const read = (id) => {
                const el = document.getElementById(id);
                return el ? el.value.trim() : '';
            };
            const labels = {
                CEO: read('lblCEO') || 'CEO',
                LIDER: read('lblLIDER') || 'Líder',
                GERENTE: read('lblGERENTE') || 'Gerente',
                MEMBRO: read('lblMEMBRO') || 'Membro',
                VISITANTE: read('lblVISITANTE') || 'Visitante'
            };
            try {
                await set(ref(db, `config/orgs/${orgId}/labels`), labels);
                showToast('Nomes dos cargos salvos!', 'success');
            } catch (e) {
                console.error(e);
                showToast(`Erro ao salvar nomes: ${e.code || e.message}`, 'error');
            }
        };
    }

    renderOrgList();
    refreshRoleLabelsEditor();
};

// Re-render quando orgs mudarem
const hookOrgsReRender = () => {
    try {
        const listEl = document.getElementById('orgList');
        if (!listEl) return;
        renderOrgList();
        refreshRoleLabelsEditor();
    } catch {}
};


// =================================================================
// Painel do Líder + Hierarquia por Facção
// =================================================================

let globalHierarchy = null;

const roleIs = (r) => (window?.effectiveRoleUpper || '').toUpperCase() === r.toUpperCase();

// Mantém um "role efetivo" (para CEO testar cargos)
window.effectiveRoleUpper = window.effectiveRoleUpper || null;

const getEffectiveRoleUpper = () => {
  // se já foi calculado pelo configurarInterfacePorTag, reutiliza
  if (window.effectiveRoleUpper) return window.effectiveRoleUpper;
  const t = (currentUserData && currentUserData.tag) ? currentUserData.tag.toUpperCase() : 'VISITANTE';
  if (currentUser && globalCeoUid && currentUser.uid === globalCeoUid) return 'CEO';
  return t;
};

const setEffectiveRoleUpper = (roleUpper) => {
  window.effectiveRoleUpper = roleUpper;
};

const getMyOrgId = () => (currentUserData && currentUserData.orgId) ? currentUserData.orgId : null;

const loadAllUsersOnce = async () => {
  const snap = await get(ref(db, 'usuarios'));
  const val = snap.val() || {};
  return Object.entries(val).map(([uid, u]) => ({ uid, ...(u || {}) }));
};

const readOrgProfile = async (orgId) => {
  if (!orgId) return null;
  const snap = await get(ref(db, `config/orgs/${orgId}/profile`));
  return snap.val() || null;
};

const writeOrgProfile = async (orgId, profile) => {
  if (!orgId) return;
  await set(ref(db, `config/orgs/${orgId}/profile`), profile);
};

const loadOrgHierarchy = async (orgId) => {
  if (!orgId) return null;
  const snap = await get(ref(db, `config/orgs/${orgId}/hierarchy`));
  return snap.val() || null;
};

const writeOrgHierarchy = async (orgId, hierarchyObj) => {
  if (!orgId) return;
  await set(ref(db, `config/orgs/${orgId}/hierarchy`), hierarchyObj || {});
};

const renderLeaderMembers = (users, orgId) => {
  if (!els.leaderMembersList) return;

  const members = users
    .filter(u => (u.orgId || null) === orgId)
    .sort((a,b) => (a.displayName||'').localeCompare(b.displayName||''));

  if (!members.length) {
    els.leaderMembersList.innerHTML = `<p class="muted">Nenhum membro cadastrado nesta facção ainda.</p>`;
    return;
  }

  const rows = members.map(u => {
    const tag = (u.tag || 'VISITANTE').toUpperCase();
    const canEdit = ['MEMBRO','GERENTE','VISITANTE'].includes(tag); // líder só mexe abaixo
    const disabled = canEdit ? '' : 'disabled';
    return `
      <div class="admin-user-row" style="display:flex; gap:10px; align-items:center; justify-content:space-between; padding:10px; border-radius:12px; border:1px solid var(--borda); margin:8px 0;">
        <div style="min-width: 180px;">
          <div style="font-weight:700;">${escapeHtml(u.displayName || u.email || u.uid)}</div>
          <div class="muted" style="font-size:12px;">${escapeHtml(u.uid)}</div>
        </div>
        <div style="display:flex; gap:10px; align-items:center;">
          <select data-uid="${u.uid}" class="leaderRoleSelect" ${disabled}>
            <option value="MEMBRO" ${tag==='MEMBRO'?'selected':''}>Membro</option>
            <option value="GERENTE" ${tag==='GERENTE'?'selected':''}>Gerente</option>
            <option value="VISITANTE" ${tag==='VISITANTE'?'selected':''}>Visitante</option>
          </select>
          <button data-uid="${u.uid}" class="leaderSaveRoleBtn" ${disabled}>Salvar</button>
          <button data-uid="${u.uid}" class="leaderRemoveFromOrgBtn muted" ${disabled}>Remover</button>
        </div>
      </div>
    `;
  }).join('');

  els.leaderMembersList.innerHTML = rows;

  els.leaderMembersList.querySelectorAll('.leaderSaveRoleBtn').forEach(btn => {
    btn.onclick = async () => {
      const uid = btn.getAttribute('data-uid');
      const sel = els.leaderMembersList.querySelector(`.leaderRoleSelect[data-uid="${uid}"]`);
      const newTag = (sel?.value || 'MEMBRO').toUpperCase();
      try {
        await update(ref(db, `usuarios/${uid}`), { tag: newTag, orgId });
        showToast("Cargo atualizado.", "success");
      } catch (e) {
        showToast(`Erro: ${e.message}`, "error");
      }
    };
  });

  els.leaderMembersList.querySelectorAll('.leaderRemoveFromOrgBtn').forEach(btn => {
    btn.onclick = async () => {
      const uid = btn.getAttribute('data-uid');
      if (!confirm("Remover este usuário da facção?")) return;
      try {
        await update(ref(db, `usuarios/${uid}`), { orgId: null, tag: 'VISITANTE' });
        showToast("Usuário removido da facção.", "success");
        loadLeaderPanel(true);
      } catch (e) {
        showToast(`Erro: ${e.message}`, "error");
      }
    };
  });
};

const fillHierarchyMemberSelect = (users, orgId) => {
  if (!els.hierMemberSelect) return;
  const members = users.filter(u => (u.orgId||null) === orgId)
    .sort((a,b)=> (a.displayName||'').localeCompare(b.displayName||''));
  els.hierMemberSelect.innerHTML = members.map(u => `<option value="${u.uid}">${escapeHtml(u.displayName || u.email || u.uid)}</option>`).join('');
};

const renderHierarchyPreview = (users, hierarchyObj) => {
  if (!els.hierPreview) return;
  const members = hierarchyObj?.members || {};
  const list = Object.entries(members).map(([uid, h]) => {
    const name = h.name || (users.find(u=>u.uid===uid)?.displayName) || uid;
    const title = h.title || '';
    const resp = Array.isArray(h.responsibilities) ? h.responsibilities : [];
    return `
      <div style="padding:10px; border:1px solid var(--borda); border-radius:12px; margin:8px 0;">
        <div style="font-weight:800;">${escapeHtml(name)} <span class="muted" style="font-weight:600;">${escapeHtml(title)}</span></div>
        ${resp.length ? `<ul style="margin:8px 0 0 18px;">${resp.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>` : `<div class="muted" style="margin-top:6px;">Sem responsabilidades cadastradas.</div>`}
      </div>
    `;
  }).join('');
  els.hierPreview.innerHTML = list || `<p class="muted">Nenhuma hierarquia cadastrada ainda.</p>`;
};

const loadLeaderPanel = async () => {
  const roleUpper = getEffectiveRoleUpper();
  if (roleUpper !== 'LIDER') return;

  const orgId = getMyOrgId();
  if (!orgId) {
    showToast("Você ainda não tem uma facção definida. Peça ao ADMIN/CEO.", "error");
    return;
  }

  // Carrega tudo
  const [users, profile, hierarchyObj] = await Promise.all([
    loadAllUsersOnce(),
    readOrgProfile(orgId),
    loadOrgHierarchy(orgId),
  ]);

  // Prefill perfil
  if (els.leaderOrgName) els.leaderOrgName.value = profile?.name || '';
  if (els.leaderOrgColor) els.leaderOrgColor.value = profile?.color || '#ffffff';
  if (els.leaderOrgLogo) els.leaderOrgLogo.value = profile?.logoUrl || '';

  // Lista membros + selects
  renderLeaderMembers(users, orgId);
  fillHierarchyMemberSelect(users, orgId);

  globalHierarchy = hierarchyObj || { members: {} };
  renderHierarchyPreview(users, globalHierarchy);

  // Save perfil
  if (els.leaderSaveOrgBtn) {
    els.leaderSaveOrgBtn.onclick = async () => {
      try {
        const newProfile = {
          name: (els.leaderOrgName?.value || '').trim(),
          color: els.leaderOrgColor?.value || '#ffffff',
          logoUrl: (els.leaderOrgLogo?.value || '').trim(),
          updatedAt: Date.now(),
          updatedBy: currentUser?.uid || null
        };
        await writeOrgProfile(orgId, newProfile);
        showToast("Identidade salva.", "success");
      } catch (e) {
        showToast(`Erro: ${e.message}`, "error");
      }
    };
  }

  // Assign member by displayName search
  if (els.leaderAssignBtn) {
    els.leaderAssignBtn.onclick = async () => {
      const q = (els.leaderUserSearch?.value || '').trim().toLowerCase();
      if (!q) return showToast("Digite o nome do usuário.", "error");

      const found = users.find(u => (u.displayName || '').trim().toLowerCase() === q);
      if (!found) return showToast("Usuário não encontrado. Ele precisa se registrar/logar pelo menos 1 vez.", "error");

      const newTag = (els.leaderAssignRole?.value || 'MEMBRO').toUpperCase();
      if (!['MEMBRO','GERENTE','VISITANTE'].includes(newTag)) return showToast("Cargo inválido.", "error");

      try {
        await update(ref(db, `usuarios/${found.uid}`), { orgId, tag: newTag });
        showToast("Membro atualizado.", "success");
        els.leaderUserSearch.value = '';
        loadLeaderPanel(true);
      } catch (e) {
        showToast(`Erro: ${e.message}`, "error");
      }
    };
  }

  // Hierarchy save/remove
  if (els.hierSaveBtn) {
    els.hierSaveBtn.onclick = async () => {
      const uid = els.hierMemberSelect?.value;
      if (!uid) return;
      const user = users.find(u=>u.uid===uid);
      const name = user?.displayName || user?.email || uid;
      const title = (els.hierMemberTitle?.value || '').trim();
      const respLines = (els.hierResponsibilities?.value || '')
        .split('\n')
        .map(s=>s.replace(/^\s*[-•]\s*/,'').trim())
        .filter(Boolean);

      globalHierarchy = globalHierarchy || { members: {} };
      globalHierarchy.members = globalHierarchy.members || {};
      globalHierarchy.members[uid] = { name, title, responsibilities: respLines, updatedAt: Date.now() };

      try {
        await writeOrgHierarchy(orgId, globalHierarchy);
        showToast("Hierarquia salva.", "success");
        renderHierarchyPreview(users, globalHierarchy);
      } catch (e) {
        showToast(`Erro: ${e.message}`, "error");
      }
    };
  }

  if (els.hierRemoveBtn) {
    els.hierRemoveBtn.onclick = async () => {
      const uid = els.hierMemberSelect?.value;
      if (!uid) return;
      if (!confirm("Remover este membro da hierarquia?")) return;
      globalHierarchy = globalHierarchy || { members: {} };
      if (globalHierarchy.members) delete globalHierarchy.members[uid];
      try {
        await writeOrgHierarchy(orgId, globalHierarchy);
        showToast("Removido.", "success");
        renderHierarchyPreview(users, globalHierarchy);
      } catch (e) {
        showToast(`Erro: ${e.message}`, "error");
      }
    };
  }
};

// View pública: Hierarquia (para todos da facção)
const loadHierarquiaView = async () => {
  const orgId = getMyOrgId();
  if (!orgId) {
    if (els.hierarquiaContainer) els.hierarquiaContainer.innerHTML = `<p class="muted">Você ainda não pertence a uma facção.</p>`;
    return;
  }
  const [users, hierarchyObj, profile] = await Promise.all([
    loadAllUsersOnce(),
    loadOrgHierarchy(orgId),
    readOrgProfile(orgId),
  ]);

  const title = profile?.name ? `Hierarquia • ${profile.name}` : 'Hierarquia';
  if (els.hierarquiaCard) {
    const h2 = els.hierarquiaCard.querySelector('h2');
    if (h2) h2.textContent = title;
  }

  const members = hierarchyObj?.members || {};
  const cards = Object.entries(members).map(([uid, h]) => {
    const name = h.name || (users.find(u=>u.uid===uid)?.displayName) || uid;
    const t = h.title || '';
    const resp = Array.isArray(h.responsibilities) ? h.responsibilities : [];
    return `
      <div class="result-block" style="margin-bottom:10px;">
        <div style="display:flex; align-items:baseline; justify-content:space-between; gap:10px;">
          <div style="font-weight:900; font-size:16px;">${escapeHtml(name)}</div>
          <div class="muted" style="font-weight:700;">${escapeHtml(t)}</div>
        </div>
        ${resp.length ? `<ul style="margin:8px 0 0 18px;">${resp.map(r=>`<li>${escapeHtml(r)}</li>`).join('')}</ul>` : `<div class="muted" style="margin-top:6px;">Sem responsabilidades cadastradas.</div>`}
      </div>
    `;
  }).join('');

  if (els.hierarquiaContainer) {
    els.hierarquiaContainer.innerHTML = cards || `<p class="muted">A hierarquia ainda não foi montada pelo Líder.</p>`;
  }
};

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
                            tag: 'Visitante'
                        };
                        return set(userRef, newUserProfile); 
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
  // role base do perfil
  let roleUpper = tag ? tag.toUpperCase() : 'VISITANTE';

  // CEO manda acima de tudo (1 pessoa definida em /config/ceoUid)
  if (currentUser && globalCeoUid && currentUser.uid === globalCeoUid) {
    roleUpper = 'CEO';
  }

  // CEO pode "testar" outros cargos (apenas visual, não altera o banco)
  try {
    const imp = localStorage.getItem('impersonateRole');
    const impEnabled = localStorage.getItem('impersonateRoleEnabled') === '1';
    if (impEnabled && imp && ['VISITANTE','MEMBRO','GERENTE','LIDER','ADMIN','CEO'].includes(imp.toUpperCase())) {
      roleUpper = imp.toUpperCase();
    }
  } catch (e) {}
  window.effectiveRoleUpper = roleUpper;


  const userStatusEl = els.userStatus;
  if (currentUser && userStatusEl) {
    if (currentUser.displayName.toLowerCase() === 'snow') {
      userStatusEl.style.display = 'none';
    } else {
      const orgName = currentUserData ? getOrgNameForUser(currentUserData.orgId) : null;
      const roleLabel = getRoleLabelForUser(roleUpper, currentUserData ? currentUserData.orgId : null);
      userStatusEl.textContent = orgName ? `${currentUser.displayName} (${roleLabel} • ${orgName})` : `${currentUser.displayName} (${roleLabel})`;
      userStatusEl.className = 'user-status-display';

      if (roleUpper === 'CEO') {
        userStatusEl.classList.add('tag-admin');
      } else if (roleUpper === 'ADMIN') {
        userStatusEl.classList.add('tag-admin');
      } else {
        userStatusEl.classList.add('tag-visitante');
      }
      userStatusEl.style.display = 'block';
    }
  }

  // Permissões por hierarquia:
  // CEO tem tudo de ADMIN + controle de orgs (e pode testar cargos via localStorage)
  const isCeoByUid = (currentUser && globalCeoUid && currentUser.uid === globalCeoUid);
  const isAdminLike = (isCeoByUid || roleUpper === 'ADMIN' || roleUpper === 'CEO');
  const isLeader = (roleUpper === 'LIDER');
  const hasOrg = !!(currentUserData && currentUserData.orgId);
  const isStaff = (isCeoByUid || roleUpper === 'CEO' || roleUpper === 'ADMIN' || (hasOrg && roleUpper !== 'VISITANTE'));

  // Admin Panel (apenas ADMIN/CEO)
  if (isAdminLike) {
    els.clearHistoryBtn.style.display = 'inline-block';
    els.adminPanelBtn.style.display = 'inline-block';
  } else {
    els.clearHistoryBtn.style.display = 'none';
    els.adminPanelBtn.style.display = 'none';
  }

  // Painel do Líder (apenas LIDER)
  if (els.leaderPanelBtn) {
    els.leaderPanelBtn.style.display = isLeader ? 'inline-block' : 'none';
  }

  // Investigação (por facção: MEMBRO+ com org)
  if (isStaff) {
    els.investigacaoBtn.style.display = 'block';
  } else {
    els.investigacaoBtn.style.display = 'none';
  }

  // Hierarquia (qualquer usuário com orgId)
  if (els.hierarquiaBtn) {
    const hasOrg = !!(currentUserData && currentUserData.orgId);
    els.hierarquiaBtn.style.display = hasOrg ? 'inline-block' : 'none';
  }

  if (!isAdminLike) {
    els.adminPanel.style.display = 'none';
  }

  // Mostra seção CEO dentro do painel (se existir)
  const ceoSection = document.getElementById('ceoPanelSection');
  if (ceoSection) {
    ceoSection.style.display = (isCeoByUid) ? 'block' : 'none';
  }

  // Aplica identidade da facção (nome/cor/logo) para qualquer membro com orgId
  try {
    const orgId = currentUserData ? currentUserData.orgId : null;
    const org = (orgId && globalOrgsConfig) ? globalOrgsConfig[orgId] : null;
    const profile = org ? (org.profile || org) : null;

    if (profile) {
      if (profile.name) document.title = profile.name;
      if (profile.color) {
        document.documentElement.style.setProperty('--cor-principal', profile.color);
        document.documentElement.style.setProperty('--cor-btn-primario', profile.color);
      }
      const logoUrl = profile.logoUrl || profile.logo || null;
      if (logoUrl && els.appLogo) els.appLogo.src = logoUrl;
    }
  } catch (e) {}
};




// --- ORGS / CEO (carrega config global) ---
const listenCeoUid = () => {
    try {
        onValue(ref(db, 'config/ceoUid'), (snap) => {
            globalCeoUid = snap.exists() ? snap.val() : null;
            // Reaplica permissões/labels quando mudar
            if (currentUser && currentUserData) configurarInterfacePorTag(currentUserData.tag);
        });
    } catch (e) {
        console.warn('Falha ao escutar ceoUid:', e);
    }
};

const listenOrgsConfig = () => {
    try {
        onValue(ref(db, 'config/orgs'), (snap) => {
            globalOrgsConfig = snap.exists() ? snap.val() : {};
            if (currentUser && currentUserData) configurarInterfacePorTag(currentUserData.tag);
        });
    } catch (e) {
        console.warn('Falha ao escutar orgs:', e);
    }
};

const defaultRoleLabels = {
    CEO: 'CEO',
    LIDER: 'Líder',
    GERENTE: 'Gerente',
    MEMBRO: 'Membro',
    VISITANTE: 'Visitante'
};

const getRoleLabelForUser = (roleUpper, orgId) => {
    try {
        if (orgId && globalOrgsConfig && globalOrgsConfig[orgId] && globalOrgsConfig[orgId].labels) {
            const lbl = globalOrgsConfig[orgId].labels[roleUpper];
            if (typeof lbl === 'string' && lbl.trim()) return lbl.trim();
        }
    } catch {}
    return defaultRoleLabels[roleUpper] || roleUpper;
};

const getOrgNameForUser = (orgId) => {
    if (!orgId) return null;
    const org = globalOrgsConfig ? globalOrgsConfig[orgId] : null;
    return org && org.name ? org.name : orgId;
};

let vendasListener = null; 

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user; 
        const userRef = ref(db, `usuarios/${user.uid}`);
        
        // INICIA O RASTREAMENTO DE ATIVIDADE
        updateUserActivity(); 
        monitorOnlineStatus(); // Inicia o monitoramento de status
        listenCeoUid();
        listenOrgsConfig();
        listenCatalogConfig(); // Carrega/escuta preços e materiais (config do Admin)
        if (typeof listenThemeCustom === 'function') listenThemeCustom(); // Carrega/escuta cores do tema (config do Admin)
        
        onValue(userRef, (snapshot) => {
            if (snapshot.exists()) {
                currentUserData = snapshot.val(); 
            } else {
                const newUserProfile = {
                    displayName: user.displayName,
                    email: user.email,
                    tag: 'VISITANTE',
                    orgId: null
                };
                set(userRef, newUserProfile);
                currentUserData = newUserProfile; 
            }
            
            configurarInterfacePorTag(currentUserData.tag);
             
            if(vendasListener) vendasListener(); 
            
            let vendasRef;
            let userTagUpper = (currentUserData.tag || 'VISITANTE').toUpperCase();
            if (currentUser && globalCeoUid && currentUser.uid === globalCeoUid) userTagUpper = 'CEO';
            
            const orgId = getCurrentOrgId && getCurrentOrgId();
            if (orgId && (userTagUpper === 'CEO' || userTagUpper === 'ADMIN' || userTagUpper === 'LIDER' || userTagUpper === 'GERENTE' || userTagUpper === 'MEMBRO')) {
                vendasRef = ref(db, `orgData/${orgId}/vendas`);
            } else {
                // Sem facção: mostra apenas as próprias vendas (se existirem) em um nó privado
                vendasRef = query(ref(db, `userData/${currentUser.uid}/vendas`), orderByChild('registradoPorId'), equalTo(currentUser.uid));
            }

            vendasListener = onValue(vendasRef, (vendasSnapshot) => {
                vendas = [];
                vendasSnapshot.forEach((child) => {
                    vendas.push({ id: child.key, ...child.val() });
                });
                if (els.historyCard.style.display !== 'none') {
                    displaySalesHistory(vendas);
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
        toggleView('main');

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
        if(els.userStatus) els.userStatus.style.display = 'none';
        if(els.investigacaoBtn) els.investigacaoBtn.style.display = 'none';
    }
});

// --- Inicialização da UI ---
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

