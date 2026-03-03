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

