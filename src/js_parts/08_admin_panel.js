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

        // Re-ordena: Online (Hells/Admin) > Offline (Hells/Admin) > Visitante
        const tagOrder = { 'ADMIN': 1, 'HELLS': 2, 'VISITANTE': 3 };
        
        usersList.sort((a, b) => {
            const statusA = globalOnlineStatus[a.uid] || { isOnline: false, inactivity: Infinity };
            const statusB = globalOnlineStatus[b.uid] || { isOnline: false, inactivity: Infinity };
            
            // 1. Ordem por Online vs Offline
            if (statusA.isOnline !== statusB.isOnline) {
                return statusA.isOnline ? -1 : 1; 
            }
            
            // 2. Ordem por Tag (Admin/Hells/Visitante)
            const tagA = (tagOrder[a.tag.toUpperCase()] || 4);
            const tagB = (tagOrder[b.tag.toUpperCase()] || 4);
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

els.adminPanelBtn.onclick = () => { toggleView('admin'); renderCatalogTextarea(); loadCatalogFromDB(); };
els.layoutToggleNightMode.onchange = (e) => updateGlobalLayout('enableNightMode', e.target.checked);
els.layoutToggleBottomPanel.onchange = (e) => updateGlobalLayout('enableBottomPanel', e.target.checked);




// ----------------------------
// CATÁLOGO (Produtos e Materiais) - Admin
// ----------------------------
const renderCatalogTextarea = () => {
    if (!els.catalogConfigTextarea) return;
    els.catalogConfigTextarea.value = JSON.stringify({ perUnit, valores }, null, 2);
    refreshCatalogProductSelect();
};

const loadCatalogFromDB = async () => {
    try {
        const snap = await get(ref(db, 'config/catalog'));
        const raw = snap.exists() ? snap.val() : null;
        applyCatalogConfig(raw);
        renderCatalogTextarea();
        showToast('Catálogo carregado do banco.', 'success');
    } catch (e) {
        showToast(`Erro ao carregar catálogo: ${e.message}`, 'error');
    }
};

const saveCatalogToDB = async () => {
    if (!els.catalogConfigTextarea) return;
    try {
        const parsed = JSON.parse(els.catalogConfigTextarea.value || '{}');

        // Aceita {perUnit, valores} e também aceita o JSON vindo "cru"
        const payload = {
            perUnit: parsed.perUnit ?? parsed.per_unit ?? parsed.perunit ?? parsed,
            valores: parsed.valores ?? parsed.values ?? parsed.valor ?? parsed
        };

        // Se o usuário colou o objeto inteiro, tenta detectar
        const raw = (parsed.perUnit || parsed.valores) ? parsed : payload;

        // Normaliza e garante números
        const normalized = normalizeCatalogConfig(raw);

        await set(ref(db, 'config/catalog'), normalized);

        // Aplica local também
        applyCatalogConfig(normalized);
        renderCatalogTextarea();

        showToast('Catálogo salvo! (Materiais e valores atualizados)', 'success');
    } catch (e) {
        const msg = String(e.message || e);
        showToast(`Erro ao salvar: ${msg.includes('JSON') ? 'JSON inválido. Verifique vírgulas/chaves.' : msg}`, 'error');
    }
};

const resetCatalogTextarea = () => {
    if (!els.catalogConfigTextarea) return;
    els.catalogConfigTextarea.value = JSON.stringify({ perUnit: defaultPerUnit, valores: defaultValores }, null, 2);
    showToast('Catálogo padrão carregado no editor. Clique em "Salvar Catálogo" para aplicar.', 'success');
};


const refreshCatalogProductSelect = () => {
    if (!els.catalogRemoveProductSelect) return;
    const products = Array.from(new Set([
        ...Object.keys(perUnit || {}),
        ...Object.keys(valores || {})
    ])).sort((a,b)=>a.localeCompare(b));

    els.catalogRemoveProductSelect.innerHTML = products.map(p => `<option value="${p}">${capitalizeText(String(p).replace(/_/g,' '))} (${p})</option>`).join('');
};

const addProductToCatalogTextarea = () => {
    if (!els.catalogConfigTextarea) return;
    const key = (els.catalogNewProductKey?.value || '').trim().toLowerCase().replace(/\s+/g,'_');
    if (!key) { showToast('Digite um nome de produto (ex: c4).', 'error'); return; }

    try {
        const parsed = JSON.parse(els.catalogConfigTextarea.value || '{}');
        const raw = (parsed.perUnit || parsed.valores) ? parsed : {
            perUnit: parsed.perUnit ?? parsed.per_unit ?? parsed.perunit ?? {},
            valores: parsed.valores ?? parsed.values ?? {}
        };

        raw.perUnit = raw.perUnit || {};
        raw.valores = raw.valores || {};

        if (raw.perUnit[key] || raw.valores[key]) {
            showToast('Esse produto já existe no catálogo.', 'error');
            return;
        }

        raw.perUnit[key] = {}; // admin preenche os materiais depois
        raw.valores[key] = { limpo: 0, sujo: 0, limpo_alianca: 0, sujo_alianca: 0 };

        els.catalogConfigTextarea.value = JSON.stringify(raw, null, 2);
        renderCatalogTextarea(); // normaliza e aplica runtime
        refreshCatalogProductSelect();
        showToast(`Produto "${key}" adicionado no editor. Ajuste materiais e valores e depois clique em "Salvar Catálogo".`, 'success');
    } catch (e) {
        showToast('JSON inválido no editor. Corrija antes de adicionar produto.', 'error');
    }
};

const removeProductFromCatalogTextarea = () => {
    if (!els.catalogConfigTextarea || !els.catalogRemoveProductSelect) return;
    const key = els.catalogRemoveProductSelect.value;
    if (!key) return;
    if (!confirm(`Remover o produto "${key}" do catálogo?`)) return;

    try {
        const parsed = JSON.parse(els.catalogConfigTextarea.value || '{}');
        const raw = (parsed.perUnit || parsed.valores) ? parsed : {
            perUnit: parsed.perUnit ?? parsed.per_unit ?? parsed.perunit ?? {},
            valores: parsed.valores ?? parsed.values ?? {}
        };

        if (raw.perUnit) delete raw.perUnit[key];
        if (raw.valores) delete raw.valores[key];

        els.catalogConfigTextarea.value = JSON.stringify(raw, null, 2);
        renderCatalogTextarea();
        refreshCatalogProductSelect();
        showToast(`Produto "${key}" removido do editor. Clique em "Salvar Catálogo" para aplicar no banco.`, 'success');
    } catch (e) {
        showToast('JSON inválido no editor. Corrija antes de remover produto.', 'error');
    }
};

// Botões (podem não existir para não-admins)
if (els.catalogLoadBtn) els.catalogLoadBtn.onclick = loadCatalogFromDB;
if (els.catalogSaveBtn) els.catalogSaveBtn.onclick = saveCatalogToDB;
if (els.catalogResetBtn) els.catalogResetBtn.onclick = resetCatalogTextarea;
if (els.catalogAddProductBtn) els.catalogAddProductBtn.onclick = addProductToCatalogTextarea;
if (els.catalogRemoveProductBtn) els.catalogRemoveProductBtn.onclick = removeProductFromCatalogTextarea;

