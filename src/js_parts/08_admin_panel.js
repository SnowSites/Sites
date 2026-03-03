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
        const tagOrder = { 'CEO': 0, 'ADMIN': 1, 'HELLS': 2, 'LIDER': 3, 'GERENTE': 4, 'MEMBRO': 5, 'VISITANTE': 6 };
        
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
                select.appendChild(makeOpt('HELLS', 'Hells'));
                select.appendChild(makeOpt('ADMIN', '👑 Administrador'));

                const currentTag = (userData.tag || 'VISITANTE').toUpperCase();
                select.value = ['VISITANTE','MEMBRO','GERENTE','LIDER','HELLS','ADMIN'].includes(currentTag) ? currentTag : 'VISITANTE';
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
