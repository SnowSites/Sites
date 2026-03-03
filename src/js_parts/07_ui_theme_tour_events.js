
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

const tourSteps = [
    { element: 'qtyTickets', title: '1/5: Quantidades', content: 'Comece inserindo a quantidade de produtos que deseja calcular ou vender.' },
    { element: 'tipoValor', title: '2/5: Tipo de Valor', content: 'Selecione o tipo de pagamento. Isso afeta o preço final de cada item.' },
    { element: 'calcBtn', title: '3/5: Calcular', content: 'Clique aqui para ver os materiais necessários e o valor total da venda.' },
    { element: 'registerBtn', title: '4.5: Registrar Venda', content: 'Após calcular, preencha os dados do cliente e clique para salvar no histórico.' },
    { element: 'toggleHistoryBtn', title: '5/5: Ver Histórico', content: 'Acesse o histórico para ver, editar, apagar ou copiar vendas antigas.' }
];
let currentStepIndex = -1; let currentTooltip = null; let tourOverlay = null;
const clearTour = () => { if(tourOverlay) { tourOverlay.classList.remove('active'); setTimeout(() => { if (tourOverlay && tourOverlay.parentNode) tourOverlay.parentNode.removeChild(tourOverlay); tourOverlay = null; }, 300); } if (currentTooltip) { currentTooltip.classList.remove('active'); setTimeout(() => { if (currentTooltip && currentTooltip.parentNode) currentTooltip.parentNode.removeChild(currentTooltip); currentTooltip = null; }, 300); } document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight')); currentStepIndex = -1; };
const showNextTourStep = () => { if (currentStepIndex >= 0) { document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight')); if(currentTooltip) currentTooltip.classList.remove('active'); } currentStepIndex++; if (currentStepIndex >= tourSteps.length) { showToast("Tutorial concluído!", "success"); clearTour(); return; } const step = tourSteps[currentStepIndex]; const targetElement = els[step.element]; if (!targetElement) { clearTour(); return; } if (currentStepIndex === 0) { tourOverlay = document.createElement('div'); tourOverlay.id = 'tour-overlay'; document.body.appendChild(tourOverlay); setTimeout(() => tourOverlay.classList.add('active'), 10); } targetElement.classList.add('tour-highlight'); if(currentTooltip && currentTooltip.parentNode) document.body.removeChild(currentTooltip); currentTooltip = document.createElement('div'); currentTooltip.className = 'tour-tooltip'; currentTooltip.innerHTML = `<h4>${step.title}</h4><p>${step.content}</p><div><button class="tourNextBtn">${currentStepIndex === tourSteps.length - 1 ? 'Finalizar' : 'Próximo'}</button><button class="tourSkipBtn">Pular</button></div>`; document.body.appendChild(currentTooltip); const rect = targetElement.getBoundingClientRect(); let top = rect.top < currentTooltip.offsetHeight + 20 ? rect.bottom + window.scrollY + 10 : rect.top + window.scrollY - currentTooltip.offsetHeight - 10; let left = Math.max(10, Math.min(rect.left + window.scrollX, window.innerWidth - currentTooltip.offsetWidth - 20)); currentTooltip.style.top = `${top}px`; currentTooltip.style.left = `${left}px`; setTimeout(() => currentTooltip.classList.add('active'), 10); currentTooltip.querySelector('.tourNextBtn').onclick = showNextTourStep; currentTooltip.querySelector('.tourSkipBtn').onclick = clearTour; targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' }); };

// Event Listeners (Calculadora)
els.calcBtn.onclick = calculate;
els.resetBtn.onclick = clearAllFields;
els.registerBtn.onclick = registerVenda;
els.toggleHistoryBtn.onclick = () => toggleView('history');
els.toggleCalcBtn.onclick = () => toggleView('main');
els.clearHistoryBtn.onclick = clearHistory;
els.csvBtn.onclick = exportToCsv;
els.themeBtn.onclick = toggleTheme;
els.tutorialBtn.onclick = () => { if (!currentUser) { showToast("Faça login para iniciar o tutorial.", "default"); return; } toggleView('main'); showNextTourStep(); };
els.discordBtnCalc.onclick = () => copyDiscordMessage(false, null);
els.filtroHistorico.addEventListener('input', filterHistory);

// --- NOVO EVENT LISTENER (v13) ---
els.nomeCliente.addEventListener('change', autoFillFromDossier);

// Event Listeners (Dossiê v8)
els.investigacaoBtn.onclick = () => toggleView('dossier');
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


