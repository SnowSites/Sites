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
        remove(ref(db, 'vendas'))
            .then(() => showToast("Histórico limpado.", "success"))
            .catch(e => showToast(`Erro: ${e.message}`, "error"));
    }
};

