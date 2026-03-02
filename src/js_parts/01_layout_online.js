// =================================================================
// INÍCIO: NOVAS FUNÇÕES DE CONFIGURAÇÃO GLOBAL E STATUS ONLINE
// =================================================================

const globalLayoutRef = ref(db, 'configuracoesGlobais/layout');

// Listener que atualiza o layout para todos os usuários
onValue(globalLayoutRef, (snapshot) => {
    if (!snapshot.exists()) {
        console.warn("Nó /configuracoesGlobais/layout não encontrado. Criando...");
        if(currentUserData && currentUserData.tag.toUpperCase() === 'ADMIN') {
             set(globalLayoutRef, { enableNightMode: true, enableBottomPanel: false, bottomPanelText: 'Este é o painel inferior.' });
        }
        return;
    }
    const settings = snapshot.val();
    
    if (els.themeBtn) {
        els.themeBtn.style.display = settings.enableNightMode ? 'block' : 'none';
        if (!settings.enableNightMode && document.body.classList.contains('dark')) {
            document.body.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }
    
    if (els.bottomPanel) {
        els.bottomPanel.style.display = settings.enableBottomPanel ? 'flex' : 'none';
        // Atualiza a mensagem no rodapé para todos
        els.bottomPanelDisplay.textContent = settings.bottomPanelText || 'Este é o painel inferior.'; 
    }
    
    // Atualiza o input de texto no Painel Admin (se estiver visível)
    if (els.adminPanel.style.display !== 'none' && els.bottomPanelText) {
         els.bottomPanelText.value = settings.bottomPanelText || '';
    }

}, (error) => {
    if(error.code !== "PERMISSION_DENIED") {
        showToast(`Erro ao carregar configurações de layout: ${error.message}`, 'error');
    }
});

/**
 * Atualiza a última atividade do usuário logado a cada 30 segundos.
 * Usado para rastrear usuários "online".
 */
const updateUserActivity = () => {
    if (currentUser) {
        // Cria um nó temporário (ou sobrescreve o existente)
        const activityRef = ref(db, `onlineStatus/${currentUser.uid}`);
        
        // Adiciona um valor 'timestamp' com a hora atual
        set(activityRef, {
            lastActive: Date.now(),
            displayName: currentUser.displayName,
            tag: currentUserData ? currentUserData.tag : 'N/A'
        }).catch(e => {
             // Apenas para logs, não é crítico
             console.warn("Erro ao registrar atividade online:", e.message);
        });
        
        // Define um intervalo para rodar a cada 30 segundos
        setTimeout(updateUserActivity, 30000); 
    }
};

/**
 * Formata o tempo de inatividade em minutos, horas ou segundos.
 */
const formatInactivityTime = (inactivityMs) => {
    const seconds = Math.floor(inactivityMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (seconds < 5) {
        return "Agora";
    }
    if (seconds < 60) {
        return `${seconds} Segundos`;
    }
    if (minutes < 60) {
        return `${minutes} Minuto${minutes > 1 ? 's' : ''}`;
    }
    
    const remainingMinutes = minutes % 60;
    if (hours < 2) {
         return `1 Hora e ${remainingMinutes} Minutos`;
    }
    return `${hours} Horas e ${remainingMinutes} Minutos`;
}

/**
 * Monitora e armazena o status de atividade em tempo real.
 */
const monitorOnlineStatus = () => {
    const statusRef = ref(db, 'onlineStatus');
    
    // Remove listener anterior se existir
    if (monitorOnlineStatus.listener) {
        monitorOnlineStatus.listener();
    }
    
    const listener = onValue(statusRef, (snapshot) => {
        const now = Date.now();
        let activeCount = 0;
        globalOnlineStatus = {}; 
        
        if (snapshot.exists()) {
            snapshot.forEach(child => {
                const uid = child.key;
                const userStatus = child.val();
                const inactivity = now - userStatus.lastActive;
                const isOnline = inactivity < 60000; // 60 segundos
                
                if (isOnline) {
                    activeCount++;
                }

                globalOnlineStatus[uid] = {
                    isOnline: isOnline,
                    inactivity: inactivity,
                    lastActive: userStatus.lastActive
                };
            });
        }
        
        els.onlineUsersCount.textContent = activeCount.toString();
        
        // Se o Painel Admin estiver aberto, forçamos a atualização da lista
        if (els.adminPanel.style.display !== 'none') {
            loadAdminPanel(false); // Atualiza a lista na tabela sem recarregar tudo.
        }

    }, (error) => {
        if(error.code !== "PERMISSION_DENIED") {
            console.error("Erro ao monitorar status online:", error);
        }
    });
    
    monitorOnlineStatus.listener = listener;
};

// =================================================================
// FIM: NOVAS FUNÇÕES DE CONFIGURAÇÃO GLOBAL E STATUS ONLINE
// =================================================================


