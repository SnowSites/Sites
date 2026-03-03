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

