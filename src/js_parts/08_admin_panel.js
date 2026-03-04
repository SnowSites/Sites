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

