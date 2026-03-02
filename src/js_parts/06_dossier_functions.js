// **** INÍCIO DAS FUNÇÕES DO DOSSIÊ (v12) ****

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
// =============================================
// FIM: FUNÇÕES DE ORDENAÇÃO DE BASES
// =============================================


// Nível 1: Mostra as Organizações (Bases)
const showDossierOrgs = async () => {
    els.dossierOrgContainer.style.display = 'block';
    els.dossierPeopleContainer.style.display = 'none';
    els.dossierOrgGrid.innerHTML = '<p>Carregando organizações...</p>';
    globalAllOrgs = [];
    
    try {
        const orgsInfoRef = ref(db, 'organizacoes');
        const orgsInfoSnap = await get(orgsInfoRef);
        const orgsInfo = orgsInfoSnap.exists() ? orgsInfoSnap.val() : {};
        
        const orgsPessoasRef = ref(db, 'dossies');
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
        const peopleRef = ref(db, `dossies/${orgName}`);
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
    
    const orgRef = ref(db, `organizacoes/${orgId}`);
    
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
        remove(ref(db, `organizacoes/${orgId}`))
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
    const userTagUpper = currentUserData.tag.toUpperCase();
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
        const dossiesRef = ref(db, 'dossies');
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
