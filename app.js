let instID = null;
let db = null;
let localDB = null; // PouchDB Instance
let syncHandler = null;

function detectInstitution() {
    try {
        // 1. Priority: URL parameters (?inst=unie) - Best for local files
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('inst')) return urlParams.get('inst').toLowerCase();

        // 2. Secondary: Path-based (domain.com/leads/unie) - Best for web servers
        const path = window.location.pathname;
        const parts = path.split('/').filter(p => p !== '' && !p.toLowerCase().endsWith('.html') && !p.toLowerCase().endsWith('.php'));
        const leadsIndex = parts.indexOf('leads');
        if (leadsIndex !== -1 && parts[leadsIndex + 1]) {
            return parts[leadsIndex + 1].toLowerCase();
        }

        return null;
    } catch (e) {
        console.error("PFU Detection Error:", e);
        return null;
    }
}

instID = detectInstitution();
console.log("PFU Detection Result:", instID);

// Initialize Dexie Database dynamically
function initDatabase(id) {
    const dbName = `PFU_Leads_${id}`;
    const dexie = new Dexie(dbName);
    dexie.version(1).stores({
        leads: '++id, firstName, lastName, email, phone, program, date, synced'
    });
    dexie.version(2).stores({
        leads: '++id, firstName, lastName, email, phone, program, date, synced, apiLeadId, apiResponse, sentPayload'
    });
    dexie.version(3).stores({
        leads: '++id, firstName, lastName, email, phone, program, date, synced, apiLeadId, apiResponse, sentPayload, legal1, legal2, legal3'
    });
    return dexie;
}

if (instID) {
    db = initDatabase(instID);
}

// Helper for isolation
function getPrefixedKey(key) {
    return `${instID}_${key}`;
}

const storage = {
    get: (key) => localStorage.getItem(getPrefixedKey(key)),
    set: (key, val) => localStorage.setItem(getPrefixedKey(key), val),
    remove: (key) => localStorage.removeItem(getPrefixedKey(key))
};

// DOM Elements (will be re-evaluated as needed)
const form = document.getElementById('lead-form');
const notificationArea = document.getElementById('notification-area');
const connectionStatus = document.getElementById('connection-status');
const leadsCountBadge = document.getElementById('leads-count');
const tableBody = document.querySelector('#leads-table tbody');
const navBtns = document.querySelectorAll('.nav-btn');
const syncBtn = document.getElementById('sync-btn');
const views = () => document.querySelectorAll('.view');

// Legal Modal Elements
const legalModal = document.getElementById('legal-modal');
const legalCheck1 = document.getElementById('legal-check-1');
const legalCheck2 = document.getElementById('legal-check-2');
const legalCheck3 = document.getElementById('legal-check-3');
const legalSubmitBtn = document.getElementById('legal-submit-btn');
const legalCancelBtn = document.getElementById('legal-cancel-btn');
const closeLegalModalBtn = document.getElementById('close-legal-modal');

// State
let isOnline = navigator.onLine;
let pendingLead = null;

// --- Config ---
const DEFAULT_PROGRAMS = {
    "Grado en Odontología": { id: "9203", dedication: "1" }
};
const DEFAULT_STUDY_LEVELS = ["Bachillerato", "FP", "Grado Universitario", "Máster"];
const DEFAULT_KNOWLEDGE_AREAS = ["Business & Tech", "Salud", "Derecho y RRII", "Ciencia y Tecnología", "Marketing y Comunicación", "Educación"];

// --- Initialization ---

async function requestPersistence() {
    if (navigator.storage && navigator.storage.persist) {
        const isPersisted = await navigator.storage.persist();
        console.log(`¿Almacenamiento persistente concedido?: ${isPersisted}`);
        return isPersisted;
    }
    return false;
}

async function init() {
    console.log("PFU Initializing...");

    // 1. Check for Superadmin persistent session
    if (!instID) {
        const isAuth = sessionStorage.getItem('pfu_superadmin_auth') === 'true';
        if (isAuth) {
            console.log("PFU: Resuming Superadmin Session");
            switchView('superadmin-dashboard-view');
        } else {
            console.log("PFU: Redir to Master Login");
            switchView('superadmin-login-view');
        }
        return;
    }

    // 2. We have an instID, so show the form
    switchView('form-view');

    // 3. Initialize PouchDB for this institution
    initPouchDB();

    console.log("PFU: Working with Institution:", instID);

    await requestPersistence();
    window.formLoadTime = new Date().getTime(); // Start bot protection timer
    initializePrograms();
    updateConnectionStatus();
    updateLeadsCount();

    // --- RESET DB IF VERSION CHANGES ---
    const currentAppVersion = 'Version 1';
    const lastResetVersion = storage.get('last_reset_version');
    if (lastResetVersion !== currentAppVersion) {
        if (db) await db.leads.clear();
        if (localDB) {
            await localDB.destroy();
            initPouchDB();
        }
        storage.set('last_reset_version', currentAppVersion);
        updateLeadsCount();
        loadLeadsToTable();
    }

    loadLeadsToTable();
    initializeLegalText();
    initializeLogo();
    initializePwaIcon();
    initializeStudyLevels();
    initializeKnowledgeAreas();
    initializePrivacyLink();

    // Event Listeners
    window.addEventListener('online', () => setOnline(true));
    window.addEventListener('offline', () => setOnline(false));

    // Initialize Defaults with isolated storage
    if (!storage.get('config_institution')) storage.set('config_institution', instID.toUpperCase());
    if (!storage.get('config_campus')) storage.set('config_campus', '1');
    if (!storage.get('config_brand_id')) storage.set('config_brand_id', instID.toUpperCase());
    if (!storage.get('config_campaign')) storage.set('config_campaign', 'I10002S0003');
    if (!storage.get('config_origin')) storage.set('config_origin', '4');
    if (!storage.get('config_impartation')) storage.set('config_impartation', '1');
    if (!storage.get('config_timing')) storage.set('config_timing', '1');
    if (!storage.get('config_sex')) storage.set('config_sex', '1');
    if (!storage.get('config_postcode')) storage.set('config_postcode', '28000');
    if (!storage.get('config_rgpd_id')) storage.set('config_rgpd_id', '1');

    // Update UI labels
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = `${instID.toUpperCase()} Lead Capture`;

    document.getElementById('clear-log-btn')?.addEventListener('click', () => {
        const logArea = document.getElementById('sync-debug-log');
        if (logArea) logArea.value = '';
    });



    // Cerrar Modal de Debug
    const closeDebugModalBtn = document.getElementById('close-debug-modal');
    if (closeDebugModalBtn) {
        closeDebugModalBtn.addEventListener('click', () => {
            document.getElementById('debug-modal').classList.add('hidden');
        });
    }

    // form?.addEventListener('submit', handleFormSubmit); // Moved inside init if needed, but it's already here
    form?.addEventListener('submit', handleFormSubmit);

    // Navigation / UI Logic
    const countrySelect = document.getElementById('country');
    const prefixInput = document.getElementById('phone-prefix');
    const provinceSelect = document.getElementById('province');
    const provinceText = document.getElementById('province-text');

    countrySelect?.addEventListener('change', () => {
        const selected = countrySelect.options[countrySelect.selectedIndex];
        if (prefixInput) prefixInput.value = selected.dataset.prefix || '';

        if (countrySelect.value === 'ES') {
            if (prefixInput) prefixInput.readOnly = true;
            if (provinceSelect) {
                const group = document.getElementById('province-group');
                if (group) group.style.display = 'block';
                provinceSelect.setAttribute('required', 'required');
            }
            if (provinceText) {
                provinceText.style.display = 'none';
                provinceText.removeAttribute('required');
                provinceText.value = '';
            }
        } else {
            if (prefixInput) {
                prefixInput.readOnly = (countrySelect.value !== 'Other');
                if (countrySelect.value === 'Other') prefixInput.placeholder = '+';
            }
            if (provinceSelect) {
                const group = document.getElementById('province-group');
                if (group) group.style.display = 'none';
                provinceSelect.removeAttribute('required');
                provinceSelect.value = '';
            }
            if (provinceText) {
                provinceText.style.display = 'block';
                provinceText.setAttribute('required', 'required');
            }
        }
    });

    countrySelect?.dispatchEvent(new Event('change'));

    // --- Draft Saving (Bulletproof) ---
    // Save as you type
    form?.addEventListener('input', () => {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        storage.set('lead_form_draft', JSON.stringify(data));
    });

    // Load draft if exists
    const draft = storage.get('lead_form_draft');
    if (draft) {
        try {
            const data = JSON.parse(draft);
            Object.keys(data).forEach(key => {
                const input = form.elements[key];
                if (input && input.type !== 'checkbox') {
                    input.value = data[key];
                } else if (input && input.type === 'checkbox') {
                    input.checked = data[key] === 'on';
                }
            });
            // Trigger change events for dependent selects (country/province)
            countrySelect?.dispatchEvent(new Event('change'));
        } catch (e) {
            console.error("Error loading draft", e);
        }
    }

    document.getElementById('admin-access-btn')?.addEventListener('click', async () => {
        const password = await requestPassword('Acceso Administrador', 'Introduce la clave de acceso al panel:');
        const validPass = storage.get('master_config_inst_pass') || 'pfu321';
        if (password === validPass) {
            switchView('admin-view');
            loadLeadsToTable();
        } else if (password !== null) {
            showToast('❌ Contraseña incorrecta.', 'error');
        }
    });



    document.getElementById('exit-admin-btn')?.addEventListener('click', () => {
        switchView('form-view');
    });

    document.getElementById('export-atenea-btn')?.addEventListener('click', exportToExcelAtenea);
    document.getElementById('export-legal-btn')?.addEventListener('click', exportToExcelLegal);

    // Legal Modal Logic
    legalSubmitBtn?.addEventListener('click', handleLegalSubmit);
    legalCancelBtn?.addEventListener('click', () => {
        legalModal.classList.add('hidden');
        legalModal.style.display = 'none';
        pendingLead = null;
    });
    closeLegalModalBtn?.addEventListener('click', () => {
        legalModal.classList.add('hidden');
        legalModal.style.display = 'none';
        pendingLead = null;
    });



    document.getElementById('delete-all-btn')?.addEventListener('click', async () => {
        const password = await requestPassword('Borrado Masivo', 'Introduce la clave de operativa para borrar la base de datos:');
        const validGodPass = storage.get('master_config_god_pass') || 'godmode';
        if (password === validGodPass) {
            if (confirm('¿ESTÁS SEGURO? Se borrarán TODOS los leads guardados. Esta acción no se puede deshacer.')) {
                if (db) await db.leads.clear();
                if (localDB) {
                    await localDB.destroy();
                    initPouchDB();
                }
                loadLeadsToTable();
                updateLeadsCount();
                showToast('Base de datos vaciada', 'success');
            }
        } else if (password !== null) {
            showToast('❌ Contraseña incorrecta.', 'error');
        }
    });

    // --- BOTONES DE CONFIGURACIÓN SEPARADOS ---

    // 1. CONFIGURACIÓN (Campaña + Programas + Áreas)
    document.getElementById('stand-config-btn')?.addEventListener('click', () => {
        switchView('stand-config-view');
        renderConfigTable();
        renderStudyLevelsConfig();
        renderKnowledgeAreasConfig();
        document.getElementById('config-stand-campaign').value = storage.get('config_campaign') || 'I10002S0003';
        document.getElementById('config-legal-text').value = getLegalText();
        document.getElementById('config-privacy-link').value = storage.get('config_privacy_link') || '';

        // Technical Params
        document.getElementById('config-brand-id').value = storage.get('config_brand_id') || instID.toUpperCase();
        document.getElementById('config-campus-id').value = storage.get('config_campus') || '1';
        document.getElementById('config-rgpd-id').value = storage.get('config_rgpd') || '1';
        document.getElementById('config-inst-code').value = storage.get('config_institution') || instID.toUpperCase();

        // Sync Params
        const syncUrl = storage.get('config_sync_url') || '';
        document.getElementById('config-sync-url').value = syncUrl;
        updateSyncUI(syncUrl);
    });

    document.getElementById('save-sync-url-btn')?.addEventListener('click', () => {
        const url = document.getElementById('config-sync-url').value.trim();
        storage.set('config_sync_url', url);
        initPouchDB(); // Restart with new URL
        showToast('Servidor de sincronización vinculado', 'success');
    });

    document.getElementById('force-sync-btn')?.addEventListener('click', () => {
        if (!storage.get('config_sync_url')) return;
        initPouchDB();
        showToast('Sincronización forzada iniciada', 'info');
    });

    document.getElementById('save-legal-text-btn')?.addEventListener('click', () => {
        const text = document.getElementById('config-legal-text').value.trim();
        if (text) {
            saveLegalText(text);
            showToast('Texto legal actualizado', 'success');
        }
    });

    document.getElementById('config-logo-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target.result;
                saveLogo(base64);
                showToast('Logo actualizado correctamente', 'success');
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('config-pwa-input')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const base64 = event.target.result;
                savePwaIcon(base64);
                showToast('Isotipo de App actualizado', 'success');
            };
            reader.readAsDataURL(file);
        }
    });

    document.getElementById('save-stand-campaign-btn')?.addEventListener('click', () => {
        const campaign = document.getElementById('config-stand-campaign').value.trim();
        storage.set('config_campaign', campaign);
        showToast('Campaña actualizada', 'success');
    });

    document.getElementById('save-privacy-link-btn')?.addEventListener('click', () => {
        const link = document.getElementById('config-privacy-link').value.trim();
        storage.set('config_privacy_link', link);
        initializePrivacyLink();
        showToast('Link de privacidad actualizado', 'success');
    });

    document.getElementById('save-brand-id-btn')?.addEventListener('click', () => {
        const val = document.getElementById('config-brand-id').value.trim();
        storage.set('config_brand_id', val);
        showToast('ID de Marca actualizado', 'success');
    });

    document.getElementById('save-campus-id-btn')?.addEventListener('click', () => {
        const val = document.getElementById('config-campus-id').value.trim();
        storage.set('config_campus', val);
        showToast('ID de Campus actualizado', 'success');
    });

    document.getElementById('save-inst-code-btn')?.addEventListener('click', () => {
        const val = document.getElementById('config-inst-code').value.trim();
        storage.set('config_institution', val);
        showToast('Código de Institución actualizado', 'success');
    });

    document.getElementById('save-rgpd-id-btn')?.addEventListener('click', () => {
        const val = document.getElementById('config-rgpd-id').value.trim();
        storage.set('config_rgpd', val);
        showToast('ID RGPD actualizado', 'success');
    });

    document.getElementById('config-study-levels-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('config-study-level-input');
        const val = input.value.trim();
        if (val) {
            const levels = getStudyLevels();
            if (!levels.includes(val)) {
                levels.push(val);
                saveStudyLevels(levels);
                input.value = '';
                renderStudyLevelsConfig();
                initializeStudyLevels();
                showToast('Nivel añadido', 'success');
            }
        }
    });

    document.getElementById('config-knowledge-areas-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const input = document.getElementById('config-knowledge-area-input');
        const val = input.value.trim();
        if (val) {
            const areas = getKnowledgeAreas();
            if (!areas.includes(val)) {
                areas.push(val);
                saveKnowledgeAreas(areas);
                input.value = '';
                renderKnowledgeAreasConfig();
                initializeKnowledgeAreas();
                showToast('Área añadida', 'success');
            }
        }
    });

    document.getElementById('import-programs-excel')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = new Uint8Array(event.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Convert to JSON (array of arrays or objects)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

                if (jsonData.length === 0) {
                    showToast('El archivo está vacío', 'error');
                    return;
                }

                const map = getPrograms();
                let importedCount = 0;

                // Skip header if it looks like one (e.g. contains "Nombre" or "ID")
                const startRow = (jsonData[0][0]?.toString().toLowerCase().includes('nombre') || jsonData[0][1]?.toString().toLowerCase().includes('id')) ? 1 : 0;

                for (let i = startRow; i < jsonData.length; i++) {
                    const row = jsonData[i];
                    if (row.length >= 2) {
                        const name = row[0]?.toString().trim();
                        const id = row[1]?.toString().trim();
                        const dedication = row[2]?.toString().trim() || "1";

                        if (name && id) {
                            map[name] = { id, dedication };
                            importedCount++;
                        }
                    }
                }

                if (importedCount > 0) {
                    savePrograms(map);
                    renderConfigTable();
                    showToast(`¡Éxito! Se han importado ${importedCount} programas.`, 'success');
                } else {
                    showToast('No se encontraron datos válidos en el Excel.', 'warning');
                }
            } catch (err) {
                console.error("Excel Import Error:", err);
                showToast('Error al procesar el archivo Excel.', 'error');
            } finally {
                e.target.value = ''; // Reset input
            }
        };
        reader.readAsArrayBuffer(file);
    });



    // Botones de vuelta (comunes)
    document.querySelectorAll('.back-admin-btn').forEach(btn => {
        btn.addEventListener('click', () => switchView('admin-view'));
    });

    document.getElementById('close-debug-modal')?.addEventListener('click', () => {
        document.getElementById('debug-modal').classList.add('hidden');
    });

    window.addEventListener('click', (e) => {
        const debugModal = document.getElementById('debug-modal');
        const pwdModal = document.getElementById('password-modal');
        if (e.target === debugModal) debugModal.classList.add('hidden');
        if (e.target === pwdModal) pwdModal.classList.add('hidden');
    });

    document.getElementById('config-form')?.addEventListener('submit', handleConfigSubmit);

    // Initialize Premium Custom Dropdowns
    initCustomSelects();
}

// --- Premium Custom Select Logic ---
function initCustomSelects() {
    const selects = document.querySelectorAll('select.custom-input');

    // Close dropdowns on outside click
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.custom-select-wrapper')) {
            document.querySelectorAll('.custom-select-popup').forEach(p => p.classList.remove('active'));
        }
    });

    selects.forEach(select => {
        if (select.dataset.customized) return;
        select.dataset.customized = 'true';

        // Hide native select but keep it functional for form submission
        // Instead of Tailwind's hidden (display: none), we use a visually hidden approach
        // that still allows the browser to show validation bubbles if required.
        select.style.opacity = '0';
        select.style.position = 'absolute';
        select.style.pointerEvents = 'none';
        select.style.height = '1px';
        select.style.width = '1px';
        select.style.zIndex = '-1';

        const wrapper = select.parentElement;
        wrapper.classList.add('custom-select-wrapper');

        const display = document.createElement('div');
        display.className = 'custom-select-display custom-input';
        display.textContent = select.options[select.selectedIndex]?.text || select.getAttribute('placeholder') || 'Seleccionar';

        const popup = document.createElement('div');
        popup.className = 'custom-select-popup';

        const updateDisplay = () => {
            display.textContent = select.options[select.selectedIndex]?.text || '';
        };

        const updatePopupItems = () => {
            popup.innerHTML = '';
            Array.from(select.options).forEach((opt, idx) => {
                // Skip the hidden/placeholder option in the popup list
                if (opt.value === "" && idx === 0) return;

                const item = document.createElement('div');
                item.className = 'custom-select-option' + (opt.selected ? ' selected' : '');
                item.textContent = opt.text;
                item.onclick = (e) => {
                    e.stopPropagation();
                    select.value = opt.value;
                    select.dispatchEvent(new Event('change'));
                    updateDisplay();
                    popup.classList.remove('active');
                };
                popup.appendChild(item);
            });
        };

        display.onclick = (e) => {
            e.stopPropagation();
            const isActive = popup.classList.contains('active');
            // Close others
            document.querySelectorAll('.custom-select-popup').forEach(p => p.classList.remove('active'));
            if (!isActive) {
                updatePopupItems();
                popup.classList.add('active');
            }
        };

        select.addEventListener('change', updateDisplay);

        // Observer to detect when the native select options are updated (e.g. Programs, Study Levels)
        const observer = new MutationObserver(() => {
            updateDisplay();
            // The popup items are regenerated every time it's opened,
            // so we don't need to do anything extra here.
        });
        observer.observe(select, { childList: true });

        wrapper.appendChild(display);
        wrapper.appendChild(popup);
    });
}

// --- Logic ---

function setOnline(status) {
    isOnline = status;
    updateConnectionStatus();
    if (isOnline) {
        showToast('Conexión restaurada', 'success');
    } else {
        showToast('Modo sin conexión', 'warning');
    }
}

function updateConnectionStatus() {
    if (connectionStatus) {
        if (isOnline) {
            connectionStatus.textContent = 'Online';
            connectionStatus.className = 'status-pill online';
        } else {
            connectionStatus.textContent = 'Offline';
            connectionStatus.className = 'status-pill offline';
        }
    }
}

async function updateLeadsCount() {
    if (!localDB) return;
    try {
        const info = await localDB.info();
        const total = info.doc_count;

        // Update Admin Stats
        const totalBadge = document.getElementById('admin-total-leads');
        if (totalBadge) totalBadge.textContent = `Locales: ${total}`;

        // Fetch Remote Count if Sync is configured
        const remoteUrl = storage.get('config_sync_url');
        const syncBadge = document.getElementById('admin-synced-leads');
        if (remoteUrl && syncBadge) {
            try {
                const dbName = `pfu_leads_v2_${instID}`;
                const fullRemoteUrl = `${remoteUrl.replace(/\/$/, '')}/${dbName}`;
                // Use a basic fetch to get DB info from CouchDB
                const response = await fetch(fullRemoteUrl, {
                    headers: {
                        'Authorization': 'Basic ' + btoa('admin:password')
                    }
                });
                if (response.ok) {
                    const remoteData = await response.json();
                    const remoteCount = remoteData.doc_count || 0;
                    syncBadge.textContent = `Sincronizados: ${remoteCount}`;
                    syncBadge.style.display = 'inline-flex';

                    // Style accordingly
                    if (remoteCount >= total && total > 0) {
                        syncBadge.className = 'inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-green-100 text-green-800';
                    } else {
                        syncBadge.className = 'inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold bg-blue-100 text-blue-800';
                    }
                }
            } catch (err) {
                console.warn("Remote count fetch failed", err);
                syncBadge.style.display = 'none';
            }
        } else if (syncBadge) {
            syncBadge.style.display = 'none';
        }
    } catch (e) {
        console.error("Error counting leads:", e);
    }
}

window.switchView = function (viewId) {
    console.log("PFU Navigate to:", viewId);

    // Dynamic search for views
    const allViews = document.querySelectorAll('.view');
    allViews.forEach(v => {
        v.classList.remove('active');
        v.style.setProperty('display', 'none', 'important');
    });

    const target = document.getElementById(viewId);
    if (!target) {
        console.error("PFU Error: View not found ->", viewId);
        return;
    }

    target.classList.add('active');

    // Determine display mode
    let displayMode = 'block';
    if (viewId === 'superadmin-login-view') displayMode = 'flex';

    target.style.setProperty('display', displayMode, 'important');

    // Safe logic execution
    try {
        if (viewId === 'admin-view' && typeof db !== 'undefined' && db) {
            loadLeadsToTable();
        }
        if (viewId === 'superadmin-dashboard-view' && typeof renderSuperadminDashboard === 'function') {
            renderSuperadminDashboard();
        }
    } catch (e) {
        console.warn("PFU: View logic failed but navigation succeeded", e);
    }
};

// Internal alias
const switchView = window.switchView;

async function handleFormSubmit(e) {
    if (e) e.preventDefault();
    console.log("Form submission started...");
    showToast('Validando datos...', 'info');

    if (!form) {
        console.error("Form element NOT found");
        return;
    }

    const formData = new FormData(form);
    // 3. Phone Validation (Basic length check)
    const rawAbPhone = (formData.get('phone') || '').trim();
    if (rawAbPhone.length < 9) {
        showToast('El teléfono parece incompleto (mínimo 9 dígitos).', 'warning');
        return;
    }

    const legalLabel = document.querySelector('label[for="privacy"]');
    const acceptedText = legalLabel ? labelToText(legalLabel) : "UNIE UNIVERSIDAD S.L, tratará sus datos personales...";

    pendingLead = {
        knowledgeArea: formData.get('knowledgeArea'),
        program: formData.get('program'),
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        email: formData.get('email'),
        age: formData.get('age'),
        country: formData.get('country'),
        province: formData.get('provinceSelect'),
        provinceText: formData.get('provinceText'),
        phonePrefix: formData.get('phonePrefix'),
        phone: rawAbPhone,
        studyLevel: formData.get('studyLevel'),
        privacy: formData.get('privacy') === 'on',
        legalTextAccepted: acceptedText,
        date: new Date().toISOString(),
        synced: false
    };

    // --- BOT PROTECTION ---
    const honeypot = formData.get('website_url');
    const submissionTime = new Date().getTime();
    const elapsedTime = submissionTime - (window.formLoadTime || submissionTime);

    // 1. Honeypot Check (If filled, it's a bot)
    if (honeypot) {
        console.warn('Bot detected: Honeypot filled.');
        form.reset();
        showToast('Lead guardado correctamente', 'success'); // Fake success
        return;
    }

    // 2. Time Trap (If too fast < 0.5 seconds, likely a bot)
    if (elapsedTime < 500) {
        console.warn(`Bot detected: Too fast (${elapsedTime}ms)`);
        showToast('Por favor, espera un momento...', 'warning');
        return;
    }

    // Show Legal Modal instead of saving
    console.log("Activating Legal Modal...");
    if (legalModal) {
        legalCheck1.checked = false;
        legalCheck2.checked = false;
        legalCheck3.checked = false;
        legalModal.classList.remove('hidden');
        // Force flex display just in case
        legalModal.style.display = 'flex';
    } else {
        console.error("Legal modal element NOT found!");
    }
}

async function handleLegalSubmit() {
    console.log("PFU Finalizing Lead...");
    if (!pendingLead || !localDB) return;

    try {
        const leadToSave = {
            ...pendingLead,
            _id: new Date().getTime().toString(), // PouchDB likes strings or auto-generated IDs
            date: new Date().toISOString(),
            legal1: legalCheck1.checked,
            legal2: legalCheck2.checked,
            legal3: legalCheck3.checked,
            legalTextAccepted: document.getElementById('config-legal-text')?.value || "",
            legal1Text: "Comunicaciones comerciales personalizadas",
            legal2Text: "Comunicar datos a empresas del Grupo Planeta"
        };

        await localDB.put(leadToSave);
        if (db) await db.leads.add(leadToSave); // Backward compatibility

        showToast('¡Lead guardado correctamente!', 'success');
        closeLegalModal();
        form.reset();
        pendingLead = null;
        updateLeadsCount();
        loadLeadsToTable();
    } catch (error) {
        console.error(error);
        showToast('Error al guardar el lead', 'error');
    }
}

function labelToText(label) {
    return label.innerText.replace(/\n/g, ' ').trim();
}

async function loadLeadsToTable() {
    if (!localDB || !tableBody) return;
    try {
        const result = await localDB.allDocs({ include_docs: true, descending: true });
        const leads = result.rows.map(row => row.doc);

        tableBody.innerHTML = leads.map(lead => `
            <tr class="hover:bg-gray-50 transition-colors border-b border-gray-100 italic">
                <td class="px-3 py-4 text-xs font-medium text-gray-900">${safeHtml(lead.firstName)} ${safeHtml(lead.lastName)}</td>
                <td class="px-3 py-4 text-xs text-gray-500">${safeHtml(lead.email)}</td>
                <td class="px-3 py-4 text-xs text-center">
                    <span class="status-pill info text-[10px]">${safeHtml(lead.program)}</span>
                </td>
                <td class="px-3 py-4 text-xs text-center text-gray-400">${new Date(lead.date).toLocaleDateString()}</td>
                <td class="px-3 py-4 text-right">
                    <div class="flex justify-end gap-1">
                        <button onclick="viewLeadDetails('${safeHtml(lead._get_id || lead._id)}')" class="text-blue-500 hover:text-blue-700 p-1"><i class="fa-solid fa-eye"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error("Error loading leads:", e);
    }
}

// Security: Prevent XSS
function safeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Safety: Prevent accidental closing if leads exist
window.addEventListener('beforeunload', async (e) => {
    if (!localDB) return;
    try {
        const info = await localDB.info();
        if (info.doc_count > 0) {
            e.preventDefault();
            e.returnValue = '';
        }
    } catch (err) { }
});



window.copyToClipboard = function (elementId) {
    const text = document.getElementById(elementId).textContent;
    navigator.clipboard.writeText(text).then(() => {
        showToast("¡Copiado al portapapeles!", "success");
    }).catch(err => {
        showToast("Error al copiar", "error");
    });
};

// --- Custom Password Prompt System ---
function requestPassword(title, message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('password-modal');
        const titleEl = document.getElementById('password-modal-title');
        const messageEl = document.getElementById('password-modal-message');
        const input = document.getElementById('password-input');
        const submitBtn = document.getElementById('password-submit-btn');
        const cancelBtn = document.getElementById('password-cancel-btn');
        const closeBtn = document.getElementById('close-password-modal');

        titleEl.textContent = title;
        messageEl.textContent = message;
        input.value = '';
        modal.classList.remove('hidden');
        input.focus();

        const cleanup = () => {
            modal.classList.add('hidden');
            submitBtn.removeEventListener('click', handleSubmit);
            cancelBtn.removeEventListener('click', handleCancel);
            closeBtn.removeEventListener('click', handleCancel);
            input.removeEventListener('keypress', handleKeyPress);
        };

        const handleSubmit = () => {
            const val = input.value;
            cleanup();
            resolve(val);
        };

        const handleCancel = () => {
            cleanup();
            resolve(null);
        };

        const handleKeyPress = (e) => {
            if (e.key === 'Enter') handleSubmit();
        };

        submitBtn.addEventListener('click', handleSubmit);
        cancelBtn.addEventListener('click', handleCancel);
        closeBtn.addEventListener('click', handleCancel);
        input.addEventListener('keypress', handleKeyPress);
    });
}

async function exportToExcelAtenea() {
    try {
        if (!localDB) return;
        const result = await localDB.allDocs({ include_docs: true });
        const leads = result.rows.map(row => row.doc);

        if (leads.length === 0) {
            showToast('No hay datos para exportar', 'warning');
            return;
        }

        const data = leads.map(l => ({
            "Institution": storage.get('config_brand_id') || storage.get('config_institution') || instID.toUpperCase(),
            "First Name": l.firstName,
            "First Last Name": l.lastName,
            "Telephone Number": l.phone,
            "Country": l.country,
            "State": l.province || l.provinceText || "",
            "Email": l.email,
            "Age": l.age,
            "Source Campaign": storage.get('config_campaign') || "I10002S0003",
            "Program of Interest": l.program,
            "Program Version of Interest": "",
            "Campus": storage.get('config_campus') || "1",
            "Level of Study": l.studyLevel,
            "RGPD Consent": "true",
            "Commercial Consent": l.legal1 ? "true" : "false",
            "Third Party Consent": l.legal2 ? "true" : "false",
            "Legal Text": l.legalTextAccepted || "UNIE UNIVERSIDAD S.L, tratará sus datos personales..."
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Leads");
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `UNIE_Leads_Atenea_${dateStr}.xlsx`);
        showToast('Exportación Atenea completada', 'success');
    } catch (error) {
        showToast('Error al exportar Atenea', 'error');
    }
}

async function exportToExcelLegal() {
    try {
        if (!localDB) return;
        const result = await localDB.allDocs({ include_docs: true });
        const leads = result.rows.map(row => row.doc);

        if (leads.length === 0) {
            showToast('No hay datos para exportar', 'warning');
            return;
        }

        const data = leads.map(l => ({
            "Institution": storage.get('config_brand_id') || storage.get('config_institution') || instID.toUpperCase(),
            "First Name": l.firstName,
            "First Last Name": l.lastName,
            "Telephone Number": l.phone,
            "Country": l.country,
            "State": l.province || l.provinceText || "",
            "Email": l.email,
            "Age": l.age,
            "Source Campaign": storage.get('config_campaign') || "I10002S0003",
            "Program of Interest": l.program,
            "Level of Study": l.studyLevel,
            "Check Legal 1": l.legal1 ? "ACEPTADO: " + (l.legal1Text || "") : "NO ACEPTADO",
            "Check Legal 2": l.legal2 ? "ACEPTADO: " + (l.legal2Text || "") : "NO ACEPTADO",
            "Check Legal 3": l.legal3 ? "ACEPTADO: " + (l.legal3Text || "") : "NO ACEPTADO",
            "Texto Legal Completo": l.legalTextAccepted || ""
        }));

        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Leads_Legal");
        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `UNIE_Leads_Legal_${dateStr}.xlsx`);
        showToast('Exportación Legal completada', 'success');
    } catch (error) {
        console.error(error);
        showToast('Error al exportar Legal', 'error');
    }
}



// --- PouchDB & Sync Engine ---
function initPouchDB() {
    if (!instID) return;

    const dbName = `pfu_leads_v2_${instID}`;
    localDB = new PouchDB(dbName);

    console.log(`PFU: PouchDB Initialized -> ${dbName}`);

    const remoteUrl = storage.get('config_sync_url');
    if (remoteUrl) {
        // Enforce specific DB in remote for this institution
        const fullRemoteUrl = `${remoteUrl.replace(/\/$/, '')}/${dbName}`;

        // Cancel previous sync if exists
        if (syncHandler) syncHandler.cancel();

        // Setup Live Sync
        syncHandler = localDB.sync(fullRemoteUrl, {
            live: true,
            retry: true
        }).on('change', (info) => {
            console.log('Sync Change:', info);
            updateLeadsCount();
            loadLeadsToTable();
        }).on('paused', (err) => {
            updateSyncUI(remoteUrl, 'online');
        }).on('active', () => {
            updateSyncUI(remoteUrl, 'syncing');
        }).on('error', (err) => {
            console.error('Sync Error:', err);
            updateSyncUI(remoteUrl, 'error');
        });
    }
}

function updateSyncUI(url, state = 'offline') {
    const badge = document.getElementById('sync-status-badge');
    const forceBtn = document.getElementById('force-sync-btn');
    if (!badge) return;

    if (!url) {
        badge.textContent = 'Backup Desactivado';
        badge.className = 'status-pill offline text-[11px]';
        if (forceBtn) {
            forceBtn.disabled = true;
            forceBtn.classList.add('text-slate-400');
        }
        return;
    }

    if (forceBtn) {
        forceBtn.disabled = false;
        forceBtn.classList.remove('text-slate-400');
        forceBtn.classList.add('text-blue-600', 'hover:bg-blue-50');
    }

    switch (state) {
        case 'online':
            badge.textContent = 'Conectado a Cloud';
            badge.className = 'status-pill success text-[11px]';
            break;
        case 'syncing':
            badge.textContent = 'Subiendo Datos...';
            badge.className = 'status-pill info text-[11px]';
            break;
        case 'error':
            badge.textContent = 'Error de Conexión';
            badge.className = 'status-pill error text-[11px]';
            break;
        default:
            badge.textContent = 'Buscando Nube...';
            badge.className = 'status-pill warning text-[11px]';
    }
}

function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    notificationArea.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(-20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function getPrograms() {
    const stored = storage.get('program_map');
    return stored ? JSON.parse(stored) : DEFAULT_PROGRAMS;
}

function savePrograms(map) {
    storage.set('program_map', JSON.stringify(map));
    initializePrograms();
}

function initializePrograms() {
    let map = getPrograms();
    if (!storage.get('program_map')) savePrograms(DEFAULT_PROGRAMS);
    const select = document.getElementById('program');
    if (select) {
        select.innerHTML = '<option value="" disabled selected>Selecciona un programa</option>';
        Object.keys(map).sort().forEach(name => {
            const option = document.createElement('option');
            option.value = name;
            option.textContent = name;
            select.appendChild(option);
        });
    }
}

function renderConfigTable() {
    const map = getPrograms();
    const tbody = document.getElementById('programs-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    Object.entries(map).sort().forEach(([name, data]) => {
        const row = document.createElement('div');
        row.className = "bg-white grid grid-cols-12 gap-2 px-4 py-3 items-center hover:bg-gray-50 transition-colors";
        row.innerHTML = `
            <div class="col-span-6 sm:col-span-5 text-sm text-gray-900 font-medium">${safeHtml(name)}</div>
            <div class="col-span-3 sm:col-span-3 text-sm text-gray-800 text-center font-mono uppercase text-xs">${safeHtml(data.id)}</div>
            <div class="col-span-2 sm:col-span-3 text-sm text-gray-800 text-center font-mono uppercase text-xs">${safeHtml(data.dedication)}</div>
            <div class="col-span-1 sm:col-span-1 text-center">
                <button onclick="deleteProgram('${safeHtml(name)}')" class="text-custom-blue hover:text-red-600 transition-colors" title="Eliminar">
                    <i class="fa-solid fa-xmark text-lg"></i>
                </button>
            </div>`;
        tbody.appendChild(row);
    });
}

window.deleteProgram = function (name) {
    if (confirm(`¿Eliminar "${name}"?`)) {
        const map = getPrograms();
        delete map[name];
        savePrograms(map);
        renderConfigTable();
    }
};

function handleConfigSubmit(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const name = formData.get('name').trim();
    const map = getPrograms();
    map[name] = { id: formData.get('id'), dedication: formData.get('dedication') };
    savePrograms(map);
    e.target.reset();
    renderConfigTable();
}

function getLegalText() {
    return storage.get('config_legal_text') || `UNIE UNIVERSIDAD S.L, tratará sus datos personales para contactarle e informarle del programa seleccionado de cara a las dos próximas convocatorias del mismo. Sus datos se eliminarán una vez haya facilitado dicha información y/o transcurridas las citadas convocatorias.\n\nUd. podrá ejercer los derechos de acceso, supresión, rectificación, oposición, limitación y portabilidad, mediante carta a UNIE UNIVERSIDAD S.L - Apartado de Correos 221 de Barcelona, o remitiendo un email a rgpd@universidadunie.com. Asimismo, cuando lo considere oportuno podrá presentar una reclamación ante la Agencia Española de protección de datos.\n\nPodrá ponerse en contacto con nuestro Delegado de Protección de Datos mediante escrito dirigido a dpo@planeta.es o a Grupo Planeta, At.: Delegado de Protección de Datos, Avda. Diagonal 662-664, 08034 Barcelona.`;
}

function saveLegalText(text) {
    storage.set('config_legal_text', text);
    initializeLegalText();
}

function initializeLegalText() {
    const text = getLegalText();
    const label = document.querySelector('label[for="privacy"]');
    if (label) {
        // Convert newlines to <br> for the display
        label.innerHTML = text.replace(/\n/g, '<br>');
    }
}

function saveLogo(base64) {
    storage.set('config_app_logo', base64);
    initializeLogo();
}

function initializeLogo() {
    const savedLogo = storage.get('config_app_logo');
    if (savedLogo) {
        const appLogo = document.getElementById('app-logo');
        const configLogoPreview = document.getElementById('config-logo-preview');
        if (appLogo) appLogo.src = savedLogo;
        if (configLogoPreview) configLogoPreview.src = savedLogo;
    }
}

function savePwaIcon(base64) {
    storage.set('config_pwa_icon', base64);
    initializePwaIcon();
}

function initializePwaIcon() {
    const savedIcon = storage.get('config_pwa_icon');
    if (savedIcon) {
        const configPwaPreview = document.getElementById('config-pwa-preview');
        const appleIcon = document.getElementById('apple-icon');
        const favicon = document.getElementById('favicon');

        if (configPwaPreview) configPwaPreview.src = savedIcon;
        if (appleIcon) appleIcon.href = savedIcon;
        if (favicon) favicon.href = savedIcon;
    }
}

function initializePrivacyLink() {
    const savedLink = storage.get('config_privacy_link') || "https://www.universidadunie.com/gracias?form=multiprogram_information_request&type=SI&nid=191";
    const modalLink = document.querySelector('#legal-modal a');
    if (modalLink) {
        modalLink.href = savedLink;
    }
}

function getStudyLevels() {
    const saved = storage.get('config_study_levels');
    return saved ? JSON.parse(saved) : DEFAULT_STUDY_LEVELS;
}

function saveStudyLevels(levels) {
    storage.set('config_study_levels', JSON.stringify(levels));
}

function initializeStudyLevels() {
    const levels = getStudyLevels();
    const select = document.getElementById('study-level');
    if (!select) return;

    // Preserve the placeholder
    const placeholder = select.options[0];
    select.innerHTML = '';
    select.appendChild(placeholder);

    levels.forEach(level => {
        const opt = document.createElement('option');
        opt.value = level;
        opt.textContent = level;
        select.appendChild(opt);
    });
}

function renderStudyLevelsConfig() {
    const levels = getStudyLevels();
    const container = document.getElementById('study-levels-list');
    if (!container) return;

    container.innerHTML = '';
    levels.forEach((level, index) => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between bg-white px-3 py-2 rounded border border-gray-200 text-sm mb-2";
        item.innerHTML = `
            <span class="font-medium text-gray-700">${level}</span>
            <button onclick="deleteStudyLevel(${index})" class="text-gray-400 hover:text-red-500 transition-colors">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        container.appendChild(item);
    });
}

window.deleteStudyLevel = function (index) {
    if (confirm('¿Eliminar este nivel de estudios?')) {
        const levels = getStudyLevels();
        levels.splice(index, 1);
        saveStudyLevels(levels);
        renderStudyLevelsConfig();
        initializeStudyLevels();
        showToast('Nivel eliminado', 'warning');
    }
};

window.downloadProgramTemplate = function () {
    const data = [
        ["Nombre del Programa", "ID Producto", "ID Dedicación"],
        ["Grado en Administración y Dirección de Empresas", "9017", "1"],
        ["Grado en Marketing y Comunicación", "9018", "1"],
        ["Máster en Inteligencia Artificial", "9200", "1"]
    ];

    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Plantilla_Programas");

    // Set column widths for better readability
    ws['!cols'] = [{ wch: 50 }, { wch: 15 }, { wch: 15 }];

    XLSX.writeFile(wb, "Plantilla_Importacion_Programas.xlsx");
    showToast("Plantilla descargada", "success");
}

function getKnowledgeAreas() {
    const saved = storage.get('config_knowledge_areas');
    return saved ? JSON.parse(saved) : DEFAULT_KNOWLEDGE_AREAS;
}

function saveKnowledgeAreas(areas) {
    storage.set('config_knowledge_areas', JSON.stringify(areas));
}

function initializeKnowledgeAreas() {
    const areas = getKnowledgeAreas();
    const select = document.getElementById('knowledge-area');
    if (!select) return;

    // Preserve the placeholder
    const placeholder = select.options[0];
    select.innerHTML = '';
    select.appendChild(placeholder);

    areas.forEach(area => {
        const opt = document.createElement('option');
        opt.value = area;
        opt.textContent = area;
        select.appendChild(opt);
    });
}

function renderKnowledgeAreasConfig() {
    const areas = getKnowledgeAreas();
    const container = document.getElementById('knowledge-areas-list');
    if (!container) return;

    container.innerHTML = '';
    areas.forEach((area, index) => {
        const item = document.createElement('div');
        item.className = "flex items-center justify-between bg-white px-3 py-2 rounded border border-gray-200 text-sm mb-2";
        item.innerHTML = `
            <span class="font-medium text-gray-700">${area}</span>
            <button onclick="deleteKnowledgeArea(${index})" class="text-gray-400 hover:text-red-500 transition-colors">
                <i class="fa-solid fa-trash-can"></i>
            </button>
        `;
        container.appendChild(item);
    });
}

window.deleteKnowledgeArea = function (index) {
    if (confirm('¿Eliminar esta área de conocimiento?')) {
        const areas = getKnowledgeAreas();
        areas.splice(index, 1);
        saveKnowledgeAreas(areas);
        renderKnowledgeAreasConfig();
        initializeKnowledgeAreas();
        showToast('Área eliminada', 'warning');
    }
};

// --- Superadmin Logic ---
function getGlobalInstitutions() {
    const saved = localStorage.getItem('pfu_global_institutions');
    return saved ? JSON.parse(saved) : [];
}

function saveGlobalInstitution(id) {
    const list = getGlobalInstitutions();
    if (!list.includes(id)) {
        list.push(id);
        localStorage.setItem('pfu_global_institutions', JSON.stringify(list));
    }
}

async function renderSuperadminDashboard() {
    const list = getGlobalInstitutions();
    const countEl = document.getElementById('super-inst-count');
    const totalLeadsEl = document.getElementById('super-leads-total');
    const listEl = document.getElementById('super-inst-list');

    // Improved base path calculation
    let currentPath = window.location.pathname;
    if (currentPath.includes('.')) {
        currentPath = currentPath.substring(0, currentPath.lastIndexOf('/') + 1);
    }
    const basePath = currentPath.endsWith('/') ? currentPath : currentPath + '/';

    if (countEl) countEl.textContent = list.length;

    if (listEl) {
        if (list.length === 0) {
            listEl.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-gray-400 italic font-medium">No hay instituciones creadas aún. Introduce un ID arriba para empezar.</td></tr>`;
            if (totalLeadsEl) totalLeadsEl.textContent = '0';
        } else {
            let globalTotal = 0;
            const currentFile = window.location.pathname.split('/').pop() || 'index.html';

            // Map each ID to a promise that returns the row HTML and doc count
            const rowPromises = list.map(async (id) => {
                const safeId = safeHtml(id);
                const accessUrl = `${currentFile}?inst=${safeId}`;
                let docCount = 0;

                try {
                    // Open PouchDB instance temporarily to get count
                    const tempDB = new PouchDB(`pfu_leads_v2_${id}`);
                    const info = await tempDB.info();
                    docCount = info.doc_count;
                    globalTotal += docCount;
                } catch (e) {
                    console.error(`Error counting leads for ${id}:`, e);
                }

                return `
                <tr class="hover:bg-blue-50/40 transition-colors">
                    <td class="px-6 py-4 font-black text-slate-700 uppercase tracking-tight">${safeId}</td>
                    <td class="px-6 py-4 text-center">
                        <span class="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold">${docCount}</span>
                    </td>
                    <td class="px-6 py-4">
                        <a href="${accessUrl}" class="text-blue-600 hover:text-blue-800 font-mono text-xs bg-blue-50 px-3 py-1 rounded-full border border-blue-100 italic transition-all inline-flex items-center gap-1">
                            <i class="fa-solid fa-link"></i>${accessUrl}
                        </a>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <button onclick="deleteInstitution('${safeId}')" class="bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 p-2 rounded-lg transition-all" title="Eliminar Instancia">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </td>
                </tr>`;
            });

            const rows = await Promise.all(rowPromises);
            listEl.innerHTML = rows.join('');
            if (totalLeadsEl) totalLeadsEl.textContent = globalTotal;
        }
    }

    // Load security config into inputs
    const masterUser = document.getElementById('config-master-user');
    const masterPass = document.getElementById('config-master-pass');
    const instPass = document.getElementById('config-inst-pass');
    const godPass = document.getElementById('config-god-pass');

    if (masterUser) masterUser.value = storage.get('master_config_user') || 'pfusuper';
    if (masterPass) masterPass.value = storage.get('master_config_pass') || 'pfusuper321';
    if (instPass) instPass.value = storage.get('master_config_inst_pass') || 'pfu321';
    if (godPass) godPass.value = storage.get('master_config_god_pass') || 'godmode';
}

// Logic for saving security credentials
document.getElementById('save-master-auth-btn')?.addEventListener('click', () => {
    const user = document.getElementById('config-master-user').value.trim();
    const pass = document.getElementById('config-master-pass').value.trim();

    if (!user || !pass) {
        showToast('El usuario y la contraseña no pueden estar vacíos', 'error');
        return;
    }

    storage.set('master_config_user', user);
    storage.set('master_config_pass', pass);
    showToast('Acceso maestro actualizado correctamente', 'success');
});

document.getElementById('save-inst-keys-btn')?.addEventListener('click', () => {
    const instPass = document.getElementById('config-inst-pass').value.trim();
    const godPass = document.getElementById('config-god-pass').value.trim();

    if (!instPass || !godPass) {
        showToast('Las claves operativas no pueden estar vacías', 'error');
        return;
    }

    storage.set('master_config_inst_pass', instPass);
    storage.set('master_config_god_pass', godPass);
    showToast('Claves operativas actualizadas correctamente', 'success');
});

window.deleteInstitution = async function (id) {
    if (confirm(`¿Borrar institución "${id}"? Se perderán todos sus datos.`)) {
        let list = getGlobalInstitutions();
        list = list.filter(item => item !== id);
        localStorage.setItem('pfu_global_institutions', JSON.stringify(list));
        await renderSuperadminDashboard();
        showToast(`Institución ${id} eliminada`, 'warning');
    }
};

window.logoutSuperadmin = function () {
    sessionStorage.removeItem('pfu_superadmin_auth');
    document.getElementById('superadmin-user').value = '';
    document.getElementById('superadmin-pass').value = '';
    switchView('superadmin-login-view');
    showToast('Sesión cerrada', 'info');
};

document.getElementById('superadmin-login-btn')?.addEventListener('click', performSuperadminLogin);
document.getElementById('superadmin-user')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSuperadminLogin(); });
document.getElementById('superadmin-pass')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') performSuperadminLogin(); });

function performSuperadminLogin() {
    const userEl = document.getElementById('superadmin-user');
    const passEl = document.getElementById('superadmin-pass');

    if (!userEl || !passEl) return;

    const user = userEl.value.trim();
    const pass = passEl.value;

    const validMasterUser = storage.get('master_config_user') || 'pfusuper';
    const validMasterPass = storage.get('master_config_pass') || 'pfusuper321';

    if (user === validMasterUser && pass === validMasterPass) {
        sessionStorage.setItem('pfu_superadmin_auth', 'true');
        showToast('Acceso maestro concedido', 'success');
        switchView('superadmin-dashboard-view');
    } else {
        showToast('Credenciales incorrectas', 'error');
    }
}

document.getElementById('create-inst-btn')?.addEventListener('click', async () => {
    const idInput = document.getElementById('new-inst-id');
    const id = idInput.value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
    if (id) {
        saveGlobalInstitution(id);
        idInput.value = '';
        await renderSuperadminDashboard();
        showToast(`Institución "${id}" creada`, 'success');
    }
});

// Start the app
init();
