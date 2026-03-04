
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


const getRoleTag = () => {
    const raw = (currentUserData && currentUserData.tag) ? String(currentUserData.tag) : 'VISITANTE';
    return raw.toUpperCase();
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


