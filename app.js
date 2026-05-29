import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/9.22.1/firebase-analytics.js";
import {
    getFirestore,
    collection,
    addDoc,
    getDocs,
    onSnapshot,
    query,
    orderBy,
    doc,
    deleteDoc,
    updateDoc,
    setDoc,
    getDoc,
    limit
} from "https://www.gstatic.com/firebasejs/9.22.1/firebase-firestore.js";

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCrtC0XVWuMaSTlM9KuNHg2pEwj0DIx38Y",
    authDomain: "ecocarapp-fbbaf.firebaseapp.com",
    projectId: "ecocarapp-fbbaf",
    storageBucket: "ecocarapp-fbbaf.firebasestorage.app",
    messagingSenderId: "862850121696",
    appId: "1:862850121696:web:065ad37d891b42332e7585",
    measurementId: "G-DVVKR0TSWB"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const carsCol = collection(db, 'cars');
const calendarCol = collection(db, 'calendar_events');

// State Management
let cars = [];
let calendarEvents = [];
let currentView = 'active'; // 'active', 'archive', 'calendar' or 'admin'
let currentUser = localStorage.getItem('ecoCarUser') || ''; // 'Admin', 'Tomek', or 'Monia'
let archivePeriod = 'all'; // 'all', 'month', '3months'
let selectedYear = new Date().getFullYear();
let selectedDateStr = '';
let assignMode = 'panel';

// DOM Elements
const carsGrid = document.getElementById('cars-grid');
const carModal = document.getElementById('car-modal');
const carForm = document.getElementById('car-form');
const addCarBtn = document.getElementById('add-car-btn');
const closeModalBtn = document.getElementById('close-modal');
const searchInput = document.getElementById('search-input');
const totalCarsEl = document.getElementById('total-cars');
const totalValueEl = document.getElementById('total-value');
const modalTitle = document.getElementById('modal-title');
const themeToggleBtn = document.getElementById('theme-toggle');
const sunIcon = document.getElementById('sun-icon');
const moonIcon = document.getElementById('moon-icon');
const viewActiveBtn = document.getElementById('view-active');
const viewArchiveBtn = document.getElementById('view-archive');
const viewCalendarBtn = document.getElementById('view-calendar');
const viewAdminBtn = document.getElementById('view-admin');
const adminSection = document.getElementById('admin-section');
const calendarSection = document.getElementById('calendar-section');
const logsList = document.getElementById('logs-list');
const loginOverlay = document.getElementById('login-overlay');
const loginBtn = document.getElementById('login-btn');
const loginUserInput = document.getElementById('login-user');
const loginPassInput = document.getElementById('login-password');
const lockedMsgEl = document.getElementById('locked-msg');
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeHelpModalBtn = document.getElementById('close-help-modal');
const confirmModal = document.getElementById('confirm-modal');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const confirmMessageEl = document.getElementById('confirm-message');
const appContainer = document.getElementById('app');
const loggedUserNameEl = document.getElementById('logged-user-name');
const logoutBtn = document.getElementById('logout-btn');
const archiveControls = document.getElementById('archive-controls');
const archiveTotalValueEl = document.getElementById('archive-total-value');
const periodBtns = document.querySelectorAll('.period-btn');
const reportModal = document.getElementById('report-modal');
const reportForm = document.getElementById('report-form');
const closeReportModalBtn = document.getElementById('close-report-modal');
const reportCarIdInput = document.getElementById('report-car-id');


// Calendar DOM Elements
const calendarMonthsRow = document.getElementById('calendar-months-row');
const calendarCurrentYearEl = document.getElementById('calendar-current-year');
const calendarPrevYearBtn = document.getElementById('calendar-prev-year');
const calendarNextYearBtn = document.getElementById('calendar-next-year');
const selectedDayLabel = document.getElementById('selected-day-label');
const timelinePanel = document.getElementById('timeline-panel');
const timelineEventsEl = document.getElementById('timeline-events');
const timelineAddForm = document.getElementById('timeline-add-form');
const tabAssignPanel = document.getElementById('tab-assign-panel');
const tabAssignManual = document.getElementById('tab-assign-manual');
const groupAssignPanel = document.getElementById('group-assign-panel');
const groupAssignManual = document.getElementById('group-assign-manual');
const assignCarSelect = document.getElementById('assign-car-select');
const assignCarManualInput = document.getElementById('assign-car-manual-input');
const assignCarTime = document.getElementById('assign-car-time');
const btnAddToTimeline = document.getElementById('btn-add-to-timeline');

// Initialize Listener - Real-time Sanpshot
function init() {
    // Theme setup
    const savedTheme = localStorage.getItem('ecoCarTheme') || 'dark';
    applyTheme(savedTheme);

    // Auto-logout after 5 reloads logic
    let reloadCount = parseInt(localStorage.getItem('ecoCarReloadCount') || '0', 10);
    reloadCount++;

    if (reloadCount >= 5) {
        localStorage.removeItem('ecoCarReloadCount');
        localStorage.removeItem('ecoCarUser');
        currentUser = '';
        loginOverlay.style.display = 'flex';
        appContainer.style.display = 'none';
        showToast("Wylogowano automatycznie po 5 odświeżeniach strony.", "info");
    } else {
        localStorage.setItem('ecoCarReloadCount', reloadCount.toString());
        // If we have a saved user, show the app
        if (currentUser) {
            const checkLock = async () => {
                const lockDoc = await getDoc(doc(db, 'settings', currentUser.toLowerCase() + '_lock'));
                if (lockDoc.exists() && lockDoc.data().locked) {
                    localStorage.removeItem('ecoCarUser');
                    currentUser = '';
                    location.reload();
                    return;
                }
                loginOverlay.style.display = 'none';
                appContainer.style.display = 'block';
                loggedUserNameEl.textContent = currentUser;
                updateUIForRole();
            };
            checkLock();
        }
    }

    const q = query(carsCol, orderBy('dateAdded', 'desc'));
    onSnapshot(q, (snapshot) => {
        cars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processAutoArchiving();
        renderCars();
        updateStats();
        updateCountdowns();
        // Update select options if calendar open
        if (selectedDateStr) {
            const activeCars = cars.filter(c => !c.archived);
            const val = assignCarSelect.value;
            assignCarSelect.innerHTML = '<option value="">Wybierz pojazd...</option>' + 
                activeCars.map(c => `<option value="${c.id}">${c.brand} [${c.plateNum || 'brak tablic'}]</option>`).join('');
            assignCarSelect.value = val;
        }
    });

    const calQ = query(calendarCol, orderBy('timestamp', 'desc'));
    onSnapshot(calQ, (snapshot) => {
        calendarEvents = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCalendar();
        if (selectedDateStr) {
            renderTimeline(selectedDateStr);
        }
    });

    setInterval(updateCountdowns, 1000);

    // View Switching
    viewActiveBtn.onclick = () => {
        currentView = 'active';
        viewActiveBtn.classList.add('active');
        viewArchiveBtn.classList.remove('active');
        viewCalendarBtn.classList.remove('active');
        viewAdminBtn.classList.remove('active');
        adminSection.style.display = 'none';
        calendarSection.style.display = 'none';
        archiveControls.style.display = 'none';
        carsGrid.style.display = 'grid';
        renderCars(searchInput.value);
    };

    viewArchiveBtn.onclick = () => {
        currentView = 'archive';
        viewActiveBtn.classList.remove('active');
        viewArchiveBtn.classList.add('active');
        viewCalendarBtn.classList.remove('active');
        viewAdminBtn.classList.remove('active');
        adminSection.style.display = 'none';
        calendarSection.style.display = 'none';
        archiveControls.style.display = 'flex';
        carsGrid.style.display = 'grid';
        renderCars(searchInput.value);
    };

    viewCalendarBtn.onclick = () => {
        currentView = 'calendar';
        viewActiveBtn.classList.remove('active');
        viewArchiveBtn.classList.remove('active');
        viewCalendarBtn.classList.add('active');
        viewAdminBtn.classList.remove('active');
        adminSection.style.display = 'none';
        calendarSection.style.display = 'block';
        archiveControls.style.display = 'none';
        carsGrid.style.display = 'none';
        renderCalendar();
    };

    viewAdminBtn.onclick = () => {
        currentView = 'admin';
        viewActiveBtn.classList.remove('active');
        viewArchiveBtn.classList.remove('active');
        viewCalendarBtn.classList.remove('active');
        viewAdminBtn.classList.add('active');
        adminSection.style.display = 'block';
        calendarSection.style.display = 'none';
        archiveControls.style.display = 'none';
        carsGrid.style.display = 'none';
        loadAdminData();
    };

    periodBtns.forEach(btn => {
        btn.onclick = () => {
            periodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            archivePeriod = btn.dataset.period;
            renderCars(searchInput.value);
        };
    });

    // Login Logic
    loginBtn.onclick = async () => {
        const userVal = loginUserInput.value.trim();
        const passVal = loginPassInput.value.trim();

        if (!userVal) {
            showToast("Podaj nazwę użytkownika", "error");
            return;
        }
        if (!passVal) {
            showToast("Podaj hasło", "error");
            return;
        }

        const canonicalUser = userVal.toLowerCase();
        const allowedUsers = ['admin', 'tomek', 'monia', 'adam', 'michal', 'lukasz', 'nastka'];

        if (allowedUsers.includes(canonicalUser)) {
            try {
                const config = await getUserConfig(canonicalUser);
                
                if (config.isLocked) {
                    showLockedMessage(config.suspended || false);
                    return;
                }

                if (config.password === passVal) {
                    currentUser = canonicalUser.charAt(0).toUpperCase() + canonicalUser.slice(1);
                    localStorage.setItem('ecoCarUser', currentUser);
                    localStorage.setItem('ecoCarReloadCount', '0');

                    loginOverlay.style.display = 'none';
                    appContainer.style.display = 'block';
                    loggedUserNameEl.textContent = currentUser;
                    showToast(`Zalogowano jako ${currentUser}`, "success");

                    loginPassInput.value = '';
                    loginUserInput.value = '';
                    lockedMsgEl.style.display = 'none';

                    // Reset failed attempts in database
                    await updateUserConfig(canonicalUser, { failedAttempts: 0 });

                    if (currentUser === 'Tomek' || currentUser === 'Monia' || currentUser === 'Admin') {
                        try {
                            const settingKey = currentUser.toLowerCase() + '_login';
                            await setDoc(doc(db, 'settings', settingKey), {
                                lastLogin: new Date().toISOString()
                            }, { merge: true });
                        } catch (e) { console.error("Update login error", e); }
                    }
                    logAction(`Zalogowano użytkownika: ${currentUser}`);
                    updateUIForRole();
                    renderCars();
                } else {
                    const newFailed = (config.failedAttempts || 0) + 1;
                    const isNowLocked = newFailed >= 3;
                    
                    await updateUserConfig(canonicalUser, {
                        failedAttempts: newFailed,
                        isLocked: isNowLocked
                    });

                    if (isNowLocked) {
                        showLockedMessage(false);
                        showToast("❌ Błędne hasło. Konto zostało zablokowane po 3 nieudanych próbach!", "error");
                    } else {
                        showToast(`Błędne hasło! Pozostało prób: ${3 - newFailed}`, "error");
                    }
                }
            } catch (err) {
                console.error("Login database error", err);
                showToast("Błąd bazy danych podczas logowania", "error");
            }
        } else {
            showToast("Błędne hasło lub nieznany użytkownik!", "error");
        }
    };

    function showLockedMessage(isSuspended = false) {
        const title = isSuspended ? "Konto Zawieszone" : "Konto Zablokowane";
        const message = isSuspended ? "Twoje konto zostało zawieszone przez administratora." : "Przekroczono limit prób logowania. Skontaktuj się z administratorem, aby odblokować dostęp:";
        
        lockedMsgEl.innerHTML = `
            <div class="locked-container" style="${isSuspended ? 'border-color: #f59e0b; background: rgba(245, 158, 11, 0.1);' : ''}">
                <h3 style="${isSuspended ? 'color: #f59e0b;' : ''}">${title}</h3>
                <p>${message}</p>
                <a href="tel:+48605595049" class="phone-link" style="${isSuspended ? 'color: #f59e0b;' : ''}">📞 605 595 049</a>
            </div>
        `;
        lockedMsgEl.style.display = 'block';
        loginBtn.style.display = 'none';
        loginUserInput.disabled = true;
        loginPassInput.disabled = true;
        
        if (isSuspended) {
            showToast("Twoje konto zostało zawieszone!", "error");
        }
    }

    updateUIForRole();

    // Calendar Year Navigation
    calendarPrevYearBtn.onclick = () => {
        selectedYear--;
        calendarCurrentYearEl.textContent = selectedYear;
        renderCalendar();
    };

    calendarNextYearBtn.onclick = () => {
        selectedYear++;
        calendarCurrentYearEl.textContent = selectedYear;
        renderCalendar();
    };

    // Calendar Add Form Mode Selection
    tabAssignPanel.onclick = () => {
        assignMode = 'panel';
        tabAssignPanel.classList.add('active');
        tabAssignManual.classList.remove('active');
        groupAssignPanel.style.display = 'block';
        groupAssignManual.style.display = 'none';
    };

    tabAssignManual.onclick = () => {
        assignMode = 'manual';
        tabAssignPanel.classList.remove('active');
        tabAssignManual.classList.add('active');
        groupAssignPanel.style.display = 'none';
        groupAssignManual.style.display = 'block';
    };

    // Calendar Save Assignment
    btnAddToTimeline.onclick = async () => {
        if (!selectedDateStr) {
            showToast("Wybierz najpierw dzień z kalendarza!", "error");
            return;
        }

        let carId = "";
        let customText = "";

        if (assignMode === 'panel') {
            carId = assignCarSelect.value;
            if (!carId) {
                showToast("Wybierz pojazd z bazy", "error");
                return;
            }
        } else {
            customText = assignCarManualInput.value.trim();
            if (!customText) {
                showToast("Wpisz model lub opis pojazdu", "error");
                return;
            }
        }

        const timeVal = assignCarTime.value || "";

        const eventData = {
            date: selectedDateStr,
            carId: carId,
            customText: customText,
            time: timeVal,
            addedBy: currentUser || "System",
            timestamp: new Date().toISOString()
        };

        try {
            await addDoc(collection(db, 'calendar_events'), eventData);
            showToast("Dodano pojazd do planu dnia", "success");
            logAction(`Dodano pojazd do kalendarza na dzień ${selectedDateStr}`);
            
            // Reset input form
            assignCarSelect.value = "";
            assignCarManualInput.value = "";
            assignCarTime.value = "";
        } catch (err) {
            showToast("Błąd zapisu przypisania", "error");
        }
    };

    // Admin toggles lock for Tomek
    const tomekLockBtn = document.getElementById('btn-tomek-toggle-lock');
    if (tomekLockBtn) {
        tomekLockBtn.onclick = async () => {
            const config = await getUserConfig('tomek');
            const newLocked = !config.isLocked;
            await updateUserConfig('tomek', {
                isLocked: newLocked,
                failedAttempts: newLocked ? 3 : 0
            });
            showToast(newLocked ? "Konto Tomasza zostało ZABLOKOWANE." : "Konto Tomasza zostało ODBLOKOWANE.", newLocked ? "error" : "success");
            logAction(newLocked ? "Zablokowano konto Tomasza" : "Odblokowano konto Tomasza");
            loadAdminData();
        };
    }

    // Admin saves password for Tomek
    const tomekSavePassBtn = document.getElementById('btn-tomek-save-password');
    if (tomekSavePassBtn) {
        tomekSavePassBtn.onclick = async () => {
            const newPass = document.getElementById('tomek-password-input').value.trim();
            if (!newPass) {
                showToast("Hasło nie może być puste", "error");
                return;
            }
            await updateUserConfig('tomek', { password: newPass });
            showToast("Zmieniono hasło dla Tomasza.", "success");
            logAction("Zmieniono hasło dla Tomasza");
            loadAdminData();
        };
    }

    // Admin toggles lock for Monia
    const moniaLockBtn = document.getElementById('btn-monia-toggle-lock');
    if (moniaLockBtn) {
        moniaLockBtn.onclick = async () => {
            const config = await getUserConfig('monia');
            const newLocked = !config.isLocked;
            await updateUserConfig('monia', {
                isLocked: newLocked,
                failedAttempts: newLocked ? 3 : 0
            });
            showToast(newLocked ? "Konto Moniki zostało ZABLOKOWANE." : "Konto Moniki zostało ODBLOKOWANE.", newLocked ? "error" : "success");
            logAction(newLocked ? "Zablokowano konto Moniki" : "Odblokowano konto Moniki");
            loadAdminData();
        };
    }

    // Admin saves password for Monia
    const moniaSavePassBtn = document.getElementById('btn-monia-save-password');
    if (moniaSavePassBtn) {
        moniaSavePassBtn.onclick = async () => {
            const newPass = document.getElementById('monia-password-input').value.trim();
            if (!newPass) {
                showToast("Hasło nie może być puste", "error");
                return;
            }
            await updateUserConfig('monia', { password: newPass });
            showToast("Zmieniono hasło dla Moniki.", "success");
            logAction("Zmieniono hasło dla Moniki");
            loadAdminData();
        };
    }


}

async function logAction(actionText) {
    try {
        await addDoc(collection(db, 'logs'), {
            user: currentUser || 'Gość',
            text: actionText,
            timestamp: new Date().toISOString()
        });
    } catch (e) { console.error("Log error", e); }
}

function updateUIForRole() {
    const role = (currentUser || '').toLowerCase();
    if (role === 'admin') {
        viewAdminBtn.style.display = 'block';
    } else {
        viewAdminBtn.style.display = 'none';
        // If current view is admin and user is not admin, switch to active
        if (currentView === 'admin') {
            viewActiveBtn.click();
        }
    }

    if (role === 'monia') {
        document.body.classList.add('monia-mode');
    } else {
        document.body.classList.remove('monia-mode');
    }
}

async function loadAdminData() {
    // Helper to update status cards
    const updateStatusCard = async (userId, cardId) => {
        const docRef = doc(db, 'settings', userId + '_login');
        const d = await getDoc(docRef);
        const card = document.getElementById(cardId);
        if (!card) return;

        const timeEl = card.querySelector('.time');
        const statusEl = card.querySelector('.status-indicator span');

        if (d.exists()) {
            const lastLogin = new Date(d.data().lastLogin);
            timeEl.textContent = lastLogin.toLocaleString('pl-PL');

            // Artificial "Online" check: if logged in within last 5 minutes
            const diff = new Date() - lastLogin;
            if (diff < 300000) {
                statusEl.textContent = 'Online';
                statusEl.className = 'online';
            } else {
                statusEl.textContent = 'Offline';
                statusEl.className = 'offline';
            }
        }

        // Check lock status from Firestore settings config
        const config = await getUserConfig(userId);
        const isLocked = config.isLocked;
        
        // Remove existing action buttons to prevent duplication
        const existingBtn = card.querySelector('.unlock-btn');
        if (existingBtn) existingBtn.remove();
        
        const actionBtn = document.createElement('button');
        actionBtn.className = isLocked ? 'unlock-btn' : 'unlock-btn suspend-btn';
        if (!isLocked) {
            actionBtn.style.background = '#f59e0b'; // Orange for suspend
        }
        actionBtn.textContent = isLocked ? 'Odblokuj Konto' : 'Zawieś Konto';
        
        actionBtn.onclick = async () => {
            const currentConf = await getUserConfig(userId);
            const newLocked = !currentConf.isLocked;
            await updateUserConfig(userId, {
                isLocked: newLocked,
                failedAttempts: newLocked ? 3 : 0
            });
            showToast(newLocked ? `Zawieszono/Zablokowano użytkownika ${userId}` : `Odblokowano użytkownika ${userId}`, newLocked ? "error" : "success");
            logAction(newLocked ? `Zablokowano konto ${userId}` : `Odblokowano konto ${userId}`);
            loadAdminData();
        };
        card.querySelector('.user-info').appendChild(actionBtn);

        // Password Preview (Zaszyfrowany/Zamaskowany podgląd)
        const pass = config.password;
        if (pass) {
            const existingPass = card.querySelector('.pass-preview');
            if (existingPass) existingPass.remove();

            const passContainer = document.createElement('div');
            passContainer.className = 'pass-preview';
            passContainer.style.fontSize = '0.75rem';
            passContainer.style.marginTop = '10px';
            passContainer.style.padding = '4px 8px';
            passContainer.style.background = 'rgba(255,255,255,0.05)';
            passContainer.style.borderRadius = '6px';
            passContainer.style.color = 'var(--text-muted)';
            
            const maskedPass = '●'.repeat(pass.length);
            passContainer.innerHTML = `🔐 <span class="pass-val" data-real="${pass}">${maskedPass}</span> <button class="btn-show-pass" style="background:none; border:none; color:var(--primary-green); cursor:pointer; font-size:0.7rem; font-weight:bold; margin-left:5px;">POKAŻ</button>`;
            
            passContainer.querySelector('.btn-show-pass').onclick = (e) => {
                const valEl = passContainer.querySelector('.pass-val');
                const isMasked = valEl.textContent.includes('●');
                valEl.textContent = isMasked ? valEl.dataset.real : '●'.repeat(pass.length);
                e.target.textContent = isMasked ? 'UKRYJ' : 'POKAŻ';
            };
            
            card.querySelector('.user-info').appendChild(passContainer);
        }
    };

    const userIds = ['admin', 'tomek', 'monia', 'adam', 'michal', 'lukasz', 'nastka'];
    for (const userId of userIds) {
        await updateStatusCard(userId, 'status-' + userId);
    }

    // Load lock and password configuration for Tomek and Monia custom fields
    const loadUserConfigToAdmin = async (userId) => {
        const config = await getUserConfig(userId);
        
        const lockStatusEl = document.getElementById(`${userId}-lock-status`);
        const failedAttemptsEl = document.getElementById(`${userId}-failed-attempts`);
        const passwordInput = document.getElementById(`${userId}-password-input`);
        const toggleLockBtn = document.getElementById(`btn-${userId}-toggle-lock`);

        if (lockStatusEl) {
            lockStatusEl.textContent = config.isLocked ? "TAK" : "NIE";
            lockStatusEl.style.color = config.isLocked ? "#ef4444" : "#10b981";
        }
        if (failedAttemptsEl) {
            failedAttemptsEl.textContent = `${config.failedAttempts || 0} / 3`;
        }
        if (passwordInput && document.activeElement !== passwordInput) {
            passwordInput.value = config.password || '';
        }
        if (toggleLockBtn) {
            toggleLockBtn.textContent = config.isLocked ? "ODBLOKUJ KONTO" : "ZABLOKUJ KONTO";
            toggleLockBtn.style.background = config.isLocked ? "rgba(16, 185, 129, 0.1)" : "rgba(239, 68, 68, 0.1)";
            toggleLockBtn.style.borderColor = config.isLocked ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)";
            toggleLockBtn.style.color = config.isLocked ? "#10b981" : "#ef4444";
        }
    };

    await loadUserConfigToAdmin('tomek');
    await loadUserConfigToAdmin('monia');

    // Load last 10 logs for Tomek and Monia only
    const logsQ = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(50));
    const logsSnap = await getDocs(logsQ);

    const filteredLogs = logsSnap.docs
        .map(doc => doc.data())
        .filter(log => log.user === 'Tomek' || log.user === 'Monia')
        .slice(0, 10);

    logsList.innerHTML = filteredLogs.map(log => {
        const date = new Date(log.timestamp);
        const userColor = log.user === 'Monia' ? '#ec4899' : '#10b981';
        return `
            <div class="log-item" style="border-left-color: ${userColor}">
                <div class="log-content">
                    <strong style="color: ${userColor}">${log.user}:</strong> 
                    <span>${log.text}</span>
                </div>
                <span class="log-date">${date.toLocaleString('pl-PL')}</span>
            </div>
        `;
    }).join('') || '<p style="text-align:center; padding: 20px; color: var(--text-muted);">Brak ostatnich aktywności Tomek/Monia</p>';
}

// Logic to check if 1 day has passed for cars marked as "Gotowe"
async function processAutoArchiving() {
    // Auto-archiving removed per user request. 
    // Manual archiving is now the only way to move cars to archive.
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <span class="toast-icon">${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
        <span class="toast-msg">${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
}

// Custom Confirmation Modal Helper
function showConfirm(message, confirmBtnText = 'OK', cancelBtnText = 'Anuluj', isDanger = false) {
    return new Promise((resolve) => {
        confirmMessageEl.textContent = message;
        confirmOkBtn.textContent = confirmBtnText;
        confirmCancelBtn.textContent = cancelBtnText;

        if (isDanger) {
            confirmOkBtn.classList.add('danger');
        } else {
            confirmOkBtn.classList.remove('danger');
        }

        confirmModal.classList.add('active');

        const cleanup = (result) => {
            confirmModal.classList.remove('active');
            confirmOkBtn.removeEventListener('click', onOk);
            confirmCancelBtn.removeEventListener('click', onCancel);
            resolve(result);
        };

        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);

        confirmOkBtn.addEventListener('click', onOk);
        confirmCancelBtn.addEventListener('click', onCancel);
    });
}

function applyTheme(theme) {
    if (theme === 'light') {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
        sunIcon.style.display = 'block';
        moonIcon.style.display = 'none';
    } else {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
        sunIcon.style.display = 'none';
        moonIcon.style.display = 'block';
    }
    localStorage.setItem('ecoCarTheme', theme);
}

themeToggleBtn.addEventListener('click', () => {
    const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
    applyTheme(currentTheme === 'light' ? 'dark' : 'light');
});

// Render UI
function renderCars(filter = '') {
    const searchTerm = filter.toLowerCase();

    // Filter by view state (active vs archive)
    let filteredCars = cars.filter(car => {
        const isArchive = car.archived;
        if (currentView === 'active') return !isArchive;
        if (currentView === 'archive') {
            if (!isArchive) return false;

            // Period Filter
            if (archivePeriod === 'all') return true;

            const releaseDate = car.statusChangeDate ? new Date(car.statusChangeDate) : null;
            if (!releaseDate) return archivePeriod === 'all';

            const now = new Date();
            if (archivePeriod === 'month') {
                return releaseDate.getMonth() === now.getMonth() && releaseDate.getFullYear() === now.getFullYear();
            }
            if (archivePeriod === '3months') {
                const threeMonthsAgo = new Date();
                threeMonthsAgo.setMonth(now.getMonth() - 3);
                return releaseDate >= threeMonthsAgo;
            }
        }
        return false;
    });

    filteredCars = filteredCars.filter(car =>
        (car.brand || '').toLowerCase().includes(searchTerm) ||
        (car.plateNum || '').toLowerCase().includes(searchTerm) ||
        (car.ownerName || '').toLowerCase().includes(searchTerm) ||
        (car.ownerPhone || '').includes(searchTerm) ||
        (car.history || '').toLowerCase().includes(searchTerm) ||
        (car.worker || '').toLowerCase().includes(searchTerm) ||
        (car.todo || []).some(item => item.toLowerCase().includes(searchTerm))
    );

    if (filteredCars.length === 0) {
        carsGrid.innerHTML = `
            <div class="empty-state">
                <p>${filter ? 'Nie znaleziono samochodów.' : (currentView === 'active' ? 'Brak aktywnych zleceń.' : 'Archiwum jest puste.')}</p>
            </div>
        `;
        return;
    }

    if (currentView === 'archive') {
        renderArchiveRows(filteredCars);
    } else {
        renderActiveGrid(filteredCars);
    }

    // Attach event listeners to new buttons
    attachCardListeners();
}

function renderArchiveRows(filteredCars) {
    const sorted = [...filteredCars].sort((a, b) => new Date(b.statusChangeDate || b.dateAdded) - new Date(a.statusChangeDate || b.dateAdded));

    // Calculate Total for filtered archive
    const totalArchiveValue = filteredCars.reduce((sum, car) => sum + parseFloat(car.price || 0), 0);
    archiveTotalValueEl.textContent = formatCurrency(totalArchiveValue);
    archiveTotalValueEl.parentElement.classList.add('price-blur-target');

    let html = `
        <div class="archive-container">
            <div class="archive-header glass">
                <span class="col owner">Właściciel / Tel</span>
                <span class="col brand">Marka i Model</span>
                <span class="col plates">Tablice</span>
                <span class="col date">Data wydania</span>
                ${currentUser === 'Admin' ? '<span class="col actions">Akcje</span>' : ''}
            </div>
            <div class="archive-list">
    `;

    sorted.forEach(car => {
        const releaseDate = car.statusChangeDate ? new Date(car.statusChangeDate).toLocaleDateString('pl-PL') : '---';
        html += `
            <div class="archive-row glass" data-id="${car.id}">
                <span class="col owner">${car.ownerName || '---'} / ${car.ownerPhone}</span>
                <span class="col brand">${car.brand}</span>
                <span class="col plates">${car.plateNum || '---'}</span>
                <span class="col date">${releaseDate}</span>
                <span class="col actions">
                    <button class="btn-icon btn-report" data-id="${car.id}" title="Pobierz Raport">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                    </button>
                ${currentUser === 'Admin' ? `
                    <button class="btn-icon btn-edit" data-id="${car.id}" title="Edytuj">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                    </button>
                    <button class="btn-icon btn-delete" data-id="${car.id}" title="Usuń">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                    </button>
                ` : ''}
                </span>
            </div>
        `;
    });

    html += '</div></div>';
    carsGrid.innerHTML = html;
    carsGrid.classList.add('list-view');
}

function renderActiveGrid(filteredCars) {
    carsGrid.classList.remove('list-view');
    carsGrid.innerHTML = filteredCars.map(car => generateCarCardHtml(car)).join('');
}

function updateCountdowns() {
    document.querySelectorAll('.countdown-timer').forEach(el => {
        const pickupStr = el.dataset.pickup;
        if (!pickupStr) return;

        // Assume pick-up is by the end of the day
        const pickupDate = new Date(pickupStr + 'T23:59:59');
        const now = new Date();
        const diff = pickupDate - now;

        if (diff < 0) {
            el.innerHTML = '<span class="expired">⌛ Czas upłynął!</span>';
            return;
        }

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        let timeStr = '';
        if (days > 0) timeStr += `${days}d `;
        timeStr += `${hours}h ${minutes}m ${seconds}s`;

        el.innerHTML = `⌛ Pozostało: ${timeStr}`;
    });
}

function generateCarCardHtml(car) {
    const status = car.status || 'przyjedzie';
    return `
        <div class="car-card ${car.priority ? 'priority-high' : ''}" data-id="${car.id}">
            <div class="dates-row">
                ${car.status === 'przyjedzie' && car.arrivalDate ? `<span class="arrival-date-tag">📅 Przyjazd: ${car.arrivalDate}</span>` : ''}
                ${car.pickupDate ? `<span class="pickup-date-tag">🔑 Odbiór: ${car.pickupDate}</span>` : ''}
            </div>
            
            ${car.pickupDate && !car.archived ? `<div class="countdown-timer" data-pickup="${car.pickupDate}"></div>` : ''}

            ${car.plateNum ? `<div class="car-info-row" style="color: var(--primary-green); font-size: 0.8rem; font-weight: 700;">📌 ${car.plateNum}</div>` : ''}
            <h3>${car.brand}</h3>
            <div class="car-info-row price-blur-target">
                <span class="label">Wartość Usługi</span>
                <span class="val">${formatCurrency(car.price)}</span>
            </div>
            <div class="car-info-row">
                <span class="label">Właściciel</span>
                <span class="val">${car.ownerName || '---'} / ${car.ownerPhone}</span>
            </div>
            ${car.worker ? `
            <div class="car-info-row">
                <span class="label">Pracownik</span>
                <span class="val worker-tag">${car.worker}</span>
            </div>
            ` : ''}

            <div class="car-info-row added-by-row" style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted); padding-top: 8px; border-top: 1px dotted var(--border-color);">
                <span>Dodane przez: <strong style="color: var(--primary-green);">${car.addedBy || 'System'}</strong></span>
            </div>
            
            ${car.todo && car.todo.length > 0 ? `
            <div class="todo-list-preview">
                <span class="label">Do zrobienia:</span>
                <ul>
                    ${car.todo.map(item => `<li><span class="todo-bullet"></span>${item}</li>`).join('')}
                </ul>
            </div>
            ` : ''}

            <div class="car-history-preview">
                <p><strong>Uwagi:</strong><br>${car.history || 'Brak uwag'}</p>
            </div>

            <div class="card-actions">
                ${(!car.archived || currentUser === 'Admin') ? `
                <button class="btn-icon btn-edit" data-id="${car.id}" title="Edytuj">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                ` : ''}
                
                ${(!car.archived || currentUser === 'Admin') ? `
                <button class="btn-icon btn-delete" data-id="${car.id}" title="Usuń">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
                ` : ''}


            </div>

            ${!car.archived ? `
            <div class="status-actions">
                <button class="btn-status ${status === 'przyjedzie' ? 'active' : ''}" data-id="${car.id}" data-status="przyjedzie">Przyjedzie</button>
                <button class="btn-status ${status === 'w-trakcie' ? 'active' : ''}" data-id="${car.id}" data-status="w-trakcie">W trakcie</button>
                <button class="btn-status ${status === 'gotowe' ? 'active' : ''}" data-id="${car.id}" data-status="gotowe">Gotowe</button>
            </div>
            ${!car.archived ? `
            <div style="margin-top: 12px; border-top: 1px dashed rgba(16, 185, 129, 0.2); padding-top: 12px;">
                <button class="btn-status btn-archive" data-id="${car.id}" style="width: 100%; background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); color: var(--primary-green);">
                    📥 PRZENIEŚ DO ARCHIWUM
                </button>
            </div>
            ` : ''}
            ` : ''}
        </div>
    `;
}

function attachCardListeners() {
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.onclick = () => editCar(btn.dataset.id);
    });
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.onclick = () => deleteCar(btn.dataset.id);
    });
    document.querySelectorAll('.btn-archive').forEach(btn => {
        btn.onclick = () => archiveCar(btn.dataset.id);
    });
    document.querySelectorAll('.btn-report').forEach(btn => {
        btn.onclick = () => openReportModal(btn.dataset.id);
    });
    document.querySelectorAll('.btn-status:not(.btn-archive)').forEach(btn => {
        btn.onclick = () => updateCarStatus(btn.dataset.id, btn.dataset.status);
    });
}

async function archiveCar(id) {
    const car = cars.find(c => c.id === id);
    const confirmed = await showConfirm(
        `Czy na pewno chcesz wysłać auto ${car ? car.brand : ''} do archiwum?`,
        'PRZENIEŚ',
        'ANULUJ',
        false
    );
    if (confirmed) {
        try {
            await updateDoc(doc(db, 'cars', id), {
                archived: true,
                status: 'gotowe',
                statusChangeDate: new Date().toISOString()
            });
            showToast("Zarchiwizowano pojazd", "success");
            logAction(`Zarchiwizowano auto: ${car ? car.brand : 'nieznane'}`);
        } catch (error) {
            showToast("Błąd archiwizacji", "error");
        }
    }
}

async function updateCarStatus(id, newStatus) {
    try {
        const car = cars.find(c => c.id === id);
        const carRef = doc(db, 'cars', id);
        await updateDoc(carRef, {
            status: newStatus,
            statusChangeDate: new Date().toISOString()
        });
        showToast(`Zmieniono status na: ${newStatus}`, 'success');
        logAction(`Zmiana statusu auta ${car ? car.brand : ''} na: ${newStatus}`);
    } catch (e) {
        showToast("Błąd przy zmianie statusu", "error");
    }
}

function updateStats() {
    const activeCars = cars.filter(c => !c.archived);
    totalCarsEl.textContent = activeCars.length;
    const totalValue = activeCars.reduce((sum, car) => sum + parseFloat(car.price || 0), 0);
    totalValueEl.textContent = formatCurrency(totalValue);

    // Additional classes for blur targeting
    totalValueEl.parentElement.classList.add('price-blur-target');
    archiveTotalValueEl.parentElement.classList.add('price-blur-target');

    // Update label in stats too if needed
    const valLabel = document.querySelector('.stats-overview .stat-card:last-child .label');
    if (valLabel) valLabel.textContent = 'Aktywna Wartość Usług';
}

// Helpers
function formatCurrency(val) {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(val);
}

// Actions
addCarBtn.addEventListener('click', () => {
    modalTitle.textContent = 'Dodaj Nowy Samochód';
    carForm.reset();
    document.getElementById('car-id').value = '';
    // Clear checkboxes explicitly
    document.querySelectorAll('input[name="todo"]').forEach(cb => cb.checked = false);
    document.getElementById('car-priority').checked = false;
    carModal.classList.add('active');
});

closeModalBtn.addEventListener('click', () => {
    carModal.classList.remove('active');
});

window.onclick = (event) => {
    if (event.target === carModal) carModal.classList.remove('active');
    if (event.target === helpModal) helpModal.classList.remove('active');
    if (event.target === confirmModal) confirmModal.classList.remove('active');
    if (event.target === reportModal) reportModal.classList.remove('active');
};

if (closeReportModalBtn) {
    closeReportModalBtn.addEventListener('click', () => {
        reportModal.classList.remove('active');
    });
}

helpBtn.addEventListener('click', () => {
    helpModal.classList.add('active');
});

closeHelpModalBtn.addEventListener('click', () => {
    helpModal.classList.remove('active');
});

logoutBtn.addEventListener('click', () => {
    currentUser = '';
    localStorage.removeItem('ecoCarUser');
    localStorage.removeItem('ecoCarReloadCount');
    appContainer.style.display = 'none';
    loginOverlay.style.display = 'flex';
    loggedUserNameEl.textContent = 'Gość';
    updateUIForRole();
    showToast("Wylogowano pomyślnie", "info");
});

carForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('car-id').value;
    const todoCheckboxes = document.querySelectorAll('input[name="todo"]:checked');
    const todoList = Array.from(todoCheckboxes).map(cb => cb.value);

    const carData = {
        brand: document.getElementById('car-brand').value,
        plateNum: document.getElementById('car-plate').value,
        price: parseFloat(document.getElementById('car-price').value) || 0,
        ownerName: document.getElementById('car-owner-name').value,
        ownerPhone: document.getElementById('car-owner-phone').value,
        history: document.getElementById('car-history').value,
        worker: document.getElementById('car-worker').value,
        arrivalDate: document.getElementById('car-arrival-date').value,
        pickupDate: document.getElementById('car-pickup-date').value,
        todo: todoList,
        priority: document.getElementById('car-priority').checked,
        archived: id ? (cars.find(c => c.id === id).archived || false) : false,
        status: id ? (cars.find(c => c.id === id).status || 'przyjedzie') : 'przyjedzie',
        dateAdded: id ? cars.find(c => c.id === id).dateAdded : new Date().toISOString(),
        addedBy: id ? (cars.find(c => c.id === id).addedBy || currentUser) : currentUser
    };

    try {
        if (id) {
            await updateDoc(doc(db, 'cars', id), carData);
            showToast("Zaktualizowano dane", "success");
            logAction(`Edytowano auto: ${carData.brand}`);
        } else {
            await addDoc(carsCol, carData);
            showToast("Dodano nowe auto", "success");
            logAction(`Dodano nowe auto: ${carData.brand}`);
        }
        carModal.classList.remove('active');
    } catch (error) {
        showToast("Błąd zapisu danych", "error");
    }
});

async function deleteCar(id) {
    const car = cars.find(c => c.id === id);
    const confirmed = await showConfirm(
        `Czy na pewno chcesz usunąć samochód ${car ? car.brand : ''}? Operacja jest nieodwracalna.`,
        'USUŃ',
        'ANULUJ',
        true
    );
    if (confirmed) {
        try {
            await deleteDoc(doc(db, 'cars', id));
            showToast("Usunięto samochód", "success");
            logAction(`Usunięto auto: ${car ? car.brand : 'nieznane'}`);
        } catch (error) {
            showToast("Błąd usuwania", "error");
        }
    }
}

function editCar(id) {
    const car = cars.find(c => c.id === id);
    if (car) {
        modalTitle.textContent = 'Edytuj Samochód';
        document.getElementById('car-id').value = car.id;
        document.getElementById('car-brand').value = car.brand;
        document.getElementById('car-plate').value = car.plateNum || '';
        document.getElementById('car-price').value = car.price;
        document.getElementById('car-owner-name').value = car.ownerName || '';
        document.getElementById('car-owner-phone').value = car.ownerPhone;
        document.getElementById('car-history').value = car.history;
        document.getElementById('car-worker').value = car.worker || '';
        document.getElementById('car-arrival-date').value = car.arrivalDate || '';
        document.getElementById('car-pickup-date').value = car.pickupDate || '';
        document.getElementById('car-priority').checked = car.priority || false;

        // Reset and set checkboxes
        document.querySelectorAll('input[name="todo"]').forEach(cb => {
            cb.checked = (car.todo || []).includes(cb.value);
        });

        carModal.classList.add('active');
    }
}

function openReportModal(id) {
    if (currentUser === 'Monia') {
        showToast("Tylko Admin i Tomek posiadają uprawnienia do tworzenia raportów.", "error");
        return;
    }

    const car = cars.find(c => c.id === id);
    if (!car) return;
    document.getElementById('report-car-id').value = id;
    reportForm.reset();

    // Check if Ceramika in todo
    const hasCeramic = (car.todo || []).some(item => item.toLowerCase().includes('ceramika'));
    const ceramicGroup = document.getElementById('ceramic-options-group');
    if (hasCeramic) {
        ceramicGroup.style.display = 'block';
    } else {
        ceramicGroup.style.display = 'none';
        document.getElementById('report-ceramic').value = 'Brak (Inna)';
    }

    reportModal.classList.add('active');
}

document.getElementById('btn-generate-ai').addEventListener('click', () => {
    const keywords = document.getElementById('report-keywords').value.trim();
    if (!keywords) {
        showToast("Wpisz najpierw słowa kluczowe!", "info");
        return;
    }

    const id = document.getElementById('report-car-id').value;
    const car = cars.find(c => c.id === id);
    if (!car) return;

    const ceramic = document.getElementById('report-ceramic').value;
    let ceramicText = '';
    if (ceramic && ceramic !== 'Brak (Inna)') {
        ceramicText = ` W celu długotrwałego zabezpieczenia lakieru i nadania mu unikalnego blasku, zaaplikowano wysokiej klasy powłokę ceramiczną marki ${ceramic}. Zapewni to długoterminową odporność i łatwość pielęgnacji przez wiele lat.`;
    }

    const sentences = [
        `W pojeździe marki ${car.brand} wykonano serię zaawansowanych usług z zakresu profesjonalnego Auto Detailingu.`,
        `Główne czynności obejmowały: ${keywords.toLowerCase()}.`,
        `Wszelkie prace zostały przeprowadzone z użyciem profesjonalnych i w pełni bezpiecznych środków najwyższej jakości.`,
        `${ceramicText}`,
        `Przeprowadzone zabiegi w kluczowy sposób poprawiły wizualny i fizyczny stan pojazdu, skutecznie podnosząc jego walory estetyczne i ułatwiając bieżące utrzymanie perfekcyjnego stanu.`
    ];

    document.getElementById('report-notes').value = sentences.join(' ');
    showToast("Pomyślnie wygenerowano opis dzięki słowom kluczowym!", "success");
});

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

reportForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('report-car-id').value;
    const car = cars.find(c => c.id === id);
    if (!car) return;

    const extraHours = document.getElementById('report-hours').value;
    const ceramicBrand = document.getElementById('report-ceramic') ? document.getElementById('report-ceramic').value : 'Brak (Inna)';
    const notes = document.getElementById('report-notes').value;

    const beforeFiles = document.getElementById('report-photos-before').files;
    const afterFiles = document.getElementById('report-photos-after').files;

    let template = document.createElement('div');
    template.style.padding = '30pt';
    template.style.width = '800px';
    template.style.fontFamily = 'Outfit, sans-serif';
    template.style.color = '#000';
    template.style.backgroundColor = '#fff';
    template.style.fontSize = '12pt';
    template.style.lineHeight = '1.6';

    const renderPhotos = async (files, label) => {
        let photosHtml = '<div style="text-align: center; margin-bottom: 15pt;">';
        let count = 1;
        for (let file of files) {
            const base64 = await fileToBase64(file);
            photosHtml += `
                <div style="display: inline-block; width: 48%; margin: 0 0.5% 15pt; vertical-align: top; page-break-inside: avoid; text-align: center;">
                    <img src="${base64}" style="width: 100%; max-height: 250pt; object-fit: contain; border-radius: 4pt; border: 1px solid #ddd; padding: 2pt;">
                    <p style="margin: 5pt 0 0; font-size: 10pt; color: #555; font-weight: bold;">${label} ${count}</p>
                </div>
            `;
            count++;
        }
        photosHtml += '</div>';
        return photosHtml;
    };

    const beforePhotosHtml = beforeFiles.length > 0 ? await renderPhotos(beforeFiles, 'Stan PRZED - Zdjęcie') : '<p>Brak zdjęć dołączonych do raportu</p>';
    const afterPhotosHtml = afterFiles.length > 0 ? await renderPhotos(afterFiles, 'Efekt PO - Zdjęcie') : '<p>Brak zdjęć po dołączonych do raportu</p>';

    const todoList = (car.todo && car.todo.length > 0) ? `<ul style="margin:0; padding-left:20pt;">${car.todo.map(t => `<li>${t}</li>`).join('')}</ul>` : '<p>Brak dedykowanej listy zadań.</p>';

    template.innerHTML = `
        <div style="font-family: inherit;">
            <h1 style="text-align: center; color: #10b981; margin-bottom: 5pt; font-size: 24pt;">Raport Serwisu Auto Detalingu</h1>
            <p style="text-align: center; color: #666; font-size: 10pt; margin-bottom: 25pt;">Wystawiono dla: ${car.ownerName || '---'} | Kontakt: ${car.ownerPhone}</p>
            
            <div style="margin-bottom: 20pt; border-bottom: 1pt solid #10b981; padding-bottom: 10pt;">
                <h2 style="font-size: 14pt; margin-bottom: 8pt; color: #333;">1. Dane Pojazdu i Zlecenia</h2>
                <div style="display:flex; justify-content:space-between; width: 100%;">
                    <p style="margin: 2pt 0; width:50%;"><strong>Pojazd:</strong> ${car.brand}</p>
                    <p style="margin: 2pt 0; width:50%;"><strong>Data Wydania:</strong> ${car.statusChangeDate ? new Date(car.statusChangeDate).toLocaleDateString('pl-PL') : new Date().toLocaleDateString('pl-PL')}</p>
                </div>
                <div style="display:flex; justify-content:space-between; width: 100%;">
                    <p style="margin: 2pt 0; width:50%;"><strong>Tablice:</strong> ${car.plateNum || '---'}</p>
                </div>
            </div>

            <div style="margin-bottom: 20pt; border-bottom: 1pt solid #10b981; padding-bottom: 10pt;">
                <h2 style="font-size: 14pt; margin-bottom: 8pt; color: #333;">2. Wykonane Czynności</h2>
                ${todoList}
                ${ceramicBrand && ceramicBrand !== 'Brak (Inna)' ? `<p style="margin-top: 8pt;"><strong>Zaaplikowana Powłoka Ceramiczna:</strong> ${ceramicBrand}</p>` : ''}
                ${extraHours ? `<p style="margin-top: 8pt;"><strong>Czas Trwania Usługi (Godzin):</strong> ${extraHours} h</p>` : ''}
            </div>

            <div style="margin-bottom: 20pt; border-bottom: 1pt solid #10b981; padding-bottom: 10pt;">
                <h2 style="font-size: 14pt; margin-bottom: 8pt; color: #333;">3. Podsumowanie i Opis Usługi</h2>
                <p style="margin: 0; white-space: pre-wrap; line-height: 1.5;">${notes || '---'}</p>
            </div>

            <div style="margin-bottom: 20pt; clear: both;">
                <h2 style="font-size: 14pt; margin-bottom: 12pt; color: #333; page-break-after: avoid;">4. Dodatkowe Informacje / Zdjęcia Przed</h2>
                ${beforePhotosHtml}
            </div>

            <div style="margin-bottom: 20pt; clear: both;">
                <h2 style="font-size: 14pt; margin-bottom: 12pt; color: #333; page-break-after: avoid;">5. Dokumentacja Końcowa / Zdjęcia Po</h2>
                ${afterPhotosHtml}
            </div>

            <div style="margin-top: 50pt; display: flex; justify-content: space-between; align-items: flex-end; page-break-inside: avoid;">
                <div style="text-align: center; border-top: 1pt solid #333; padding-top: 5pt; width: 200pt;">
                    <p style="margin: 0; font-size: 10pt; color: #333;">Podpis Wykonawcy (EcoCarPro)</p>
                </div>
                <div style="text-align: center; border-top: 1pt solid #333; padding-top: 5pt; width: 200pt;">
                    <p style="margin: 0; font-size: 10pt; color: #333;">Podpis Właściciela Pojazdu</p>
                </div>
            </div>
        </div>
    `;

    var opt = {
        margin: [30, 30, 30, 30],
        filename: `Raport_EcoCarPro_${car.brand.replace(/\s+/g, '_')}_${car.plateNum || ''}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: 'pt', format: 'a4', orientation: 'portrait' },
        pagebreak: { mode: ['css', 'legacy'], avoid: ['h2', 'h1', '.avoid-break', 'img', 'div[style*="page-break-inside: avoid"]'] }
    };

    showToast("Generowanie układu i zapisywanie PDF...", "info");

    try {
        await html2pdf().set(opt).from(template).save();
        showToast("Pomyślnie wygenerowano PDF", "success");
        reportModal.classList.remove('active');
    } catch (err) {
        showToast("Nie udało się pobrać PDF.", "error");
    }
});

searchInput.addEventListener('input', (e) => {
    renderCars(e.target.value);
});



// Database-backed user config helpers
async function getUserConfig(username) {
    const docRef = doc(db, 'settings', username.toLowerCase() + '_config');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        return snap.data();
    } else {
        const defaultPasswords = {
            'admin': 'system02',
            'tomek': 'tommar',
            'monia': 'wanda'
        };
        const initialConfig = {
            password: defaultPasswords[username.toLowerCase()] || 'eco123',
            isLocked: false,
            failedAttempts: 0
        };
        await setDoc(docRef, initialConfig);
        return initialConfig;
    }
}

async function updateUserConfig(username, updates) {
    const docRef = doc(db, 'settings', username.toLowerCase() + '_config');
    await updateDoc(docRef, updates);
}

// Calendar rendering helpers
function renderCalendar() {
    calendarMonthsRow.innerHTML = "";
    
    const plMonths = [
        "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec", 
        "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
    ];

    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();

    for (let m = 0; m < 12; m++) {
        const col = document.createElement('div');
        col.className = 'month-column';
        
        const header = document.createElement('h4');
        header.textContent = plMonths[m];
        col.appendChild(header);

        const daysList = document.createElement('div');
        daysList.className = 'days-list';

        const daysInMonth = new Date(selectedYear, m + 1, 0).getDate();

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${selectedYear}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            
            const dayCell = document.createElement('div');
            dayCell.className = 'day-cell';
            dayCell.dataset.date = dateStr;
            dayCell.innerHTML = `<span>${d}</span>`;

            if (selectedYear === todayYear && m === todayMonth && d === todayDay) {
                dayCell.classList.add('today-cell');
            }

            if (dateStr === selectedDateStr) {
                dayCell.classList.add('selected-day');
            }

            const dayEvents = calendarEvents.filter(ev => ev.date === dateStr);
            if (dayEvents.length > 0) {
                const indicatorBox = document.createElement('div');
                indicatorBox.className = 'day-indicator-box';
                indicatorBox.innerHTML = `
                    <span class="event-dot" style="${currentUser === 'Monia' ? 'background-color:#ec4899; box-shadow:0 0 8px #ec4899;' : ''}"></span>
                    <span class="event-count-badge" style="${currentUser === 'Monia' ? 'background:rgba(236,72,153,0.2); color:#ec4899;' : ''}">${dayEvents.length}</span>
                `;
                dayCell.appendChild(indicatorBox);
            }

            dayCell.onclick = () => {
                document.querySelectorAll('.day-cell.selected-day').forEach(el => el.classList.remove('selected-day'));
                dayCell.classList.add('selected-day');
                
                selectedDateStr = dateStr;
                openTimelineForDay(dateStr);
            };

            daysList.appendChild(dayCell);
        }

        col.appendChild(daysList);
        calendarMonthsRow.appendChild(col);
    }
}

function openTimelineForDay(dateStr) {
    const d = new Date(dateStr);
    const options = { day: 'numeric', month: 'long', year: 'numeric' };
    const formattedDate = d.toLocaleDateString('pl-PL', options);
    
    selectedDayLabel.textContent = formattedDate;
    timelineAddForm.style.display = 'block';

    const activeCars = cars.filter(c => !c.archived);
    assignCarSelect.innerHTML = '<option value="">Wybierz pojazd...</option>' + 
        activeCars.map(c => `<option value="${c.id}">${c.brand} [${c.plateNum || 'brak tablic'}]</option>`).join('');

    renderTimeline(dateStr);
}

function renderTimeline(dateStr) {
    const dayEvents = calendarEvents.filter(ev => ev.date === dateStr);
    
    dayEvents.sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return new Date(a.timestamp) - new Date(b.timestamp);
    });

    if (dayEvents.length === 0) {
        timelineEventsEl.innerHTML = '<p class="select-day-prompt">Brak zaplanowanych pojazdów na ten dzień. Dodaj auto poniżej!</p>';
        return;
    }

    timelineEventsEl.innerHTML = dayEvents.map(ev => {
        let label = "";
        let typeBadge = "";
        
        if (ev.carId) {
            const car = cars.find(c => c.id === ev.carId);
            if (car) {
                label = `${car.brand} 📌 <strong>${car.plateNum || 'brak tablic'}</strong> (Klient: ${car.ownerName || '---'})`;
                typeBadge = "z panelu";
            } else {
                label = `Pojazd usunięty z bazy (ID: ${ev.carId})`;
                typeBadge = "nieznany";
            }
        } else {
            label = ev.customText || "";
            typeBadge = "ręczny";
        }

        const timeDisplay = ev.time ? `<span class="timeline-time-badge" style="${currentUser === 'Monia' ? 'background:rgba(236,72,153,0.15); color:#ec4899;' : ''}">${ev.time}</span>` : `<span class="timeline-time-badge">--:--</span>`;

        return `
            <div class="timeline-item" style="${currentUser === 'Monia' ? 'border-left-color:#ec4899;' : ''}">
                ${timeDisplay}
                <div class="timeline-item-title">${label}</div>
                <span class="timeline-item-type">${typeBadge}</span>
                <button type="button" class="btn-icon btn-delete-event" data-id="${ev.id}" title="Usuń z osi czasu" style="padding: 4px 8px; color: #ef4444; border-color: rgba(239, 68, 68, 0.2); background: transparent;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                </button>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.btn-delete-event').forEach(btn => {
        btn.onclick = async () => {
            const evId = btn.dataset.id;
            const confirmed = await showConfirm("Czy na pewno chcesz usunąć to auto z osi czasu?", "USUŃ", "ANULUJ", true);
            if (confirmed) {
                try {
                    await deleteDoc(doc(db, 'calendar_events', evId));
                    showToast("Usunięto przypisanie z kalendarza", "success");
                    logAction(`Usunięto pojazd z kalendarza dla dnia ${dateStr}`);
                } catch (e) {
                    showToast("Błąd podczas usuwania", "error");
                }
            }
        };
    });
}

init();
