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
