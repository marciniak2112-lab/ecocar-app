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
const notificationsCol = collection(db, 'notifications');
const usersCol = collection(db, 'users');
const notesCol = collection(db, 'notes');
const archivedNotesCol = collection(db, 'archived_notes');
const trashCol = collection(db, 'trash_schedule');
const deletedUsersCol = collection(db, 'deleted_users');

// State Management
let cars = [];
let notifications = [];
let notes = [];
let archivedNotes = [];
let trashSchedule = [];
let customUsers = [];
let deletedUsers = [];
let currentView = 'active'; // 'active', 'locations', 'calendar', 'notes', 'trash', 'archive', 'admin'
let currentUser = localStorage.getItem('ecoCarUser') || ''; // 'Admin', 'Tomek', 'Monia', 'Adam', 'Łukasz', 'Nastka'
let archivePeriod = 'all'; // 'all', 'month', '3months'

// Calendar State
let calCurrentMonth = new Date().getMonth();
let calCurrentYear = new Date().getFullYear();
let selectedCalDate = null;
let customTodos = [];
let deferredPrompt = null;

function getCanonicalUsername(username) {
    if (!username) return '';
    let canonical = username.trim().toLowerCase();
    canonical = canonical
        .replace(/ł/g, 'l')
        .replace(/ą/g, 'a')
        .replace(/ć/g, 'c')
        .replace(/ę/g, 'e')
        .replace(/ń/g, 'n')
        .replace(/ó/g, 'o')
        .replace(/ś/g, 's')
        .replace(/ź/g, 'z')
        .replace(/ż/g, 'z');
    if (canonical === 'tomasz') canonical = 'tomek';
    if (canonical === 'administrator') canonical = 'admin';
    return canonical;
}

// Default user passwords fallback
const DEFAULT_PASSWORDS = {
    'admin': 'system02',
    'tomek': 'tommar',
    'monia': 'wanda',
    'adam': '767211439',
    'lukasz': '564738291',
    'nastka': '908172635'
};

// Helper: Get Password from Firestore settings collection or fallback
async function getUserPassword(username) {
    const canonical = getCanonicalUsername(username);
    const rawLower = (username || '').trim().toLowerCase();
    if (!canonical || canonical === 'michal') return null;
    if (deletedUsers.includes(canonical) || deletedUsers.includes(rawLower)) {
        return null; // Account deleted, acts as if it never existed!
    }

    const fetchDocWithTimeout = (docRef, timeoutMs = 2500) => {
        return Promise.race([
            getDoc(docRef),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
        ]);
    };

    try {
        if (deletedUsers.length === 0) {
            const delDoc = await fetchDocWithTimeout(doc(db, 'deleted_users', canonical));
            if (delDoc.exists()) {
                if (!deletedUsers.includes(canonical)) deletedUsers.push(canonical);
                return null;
            }
        }

        let passDoc = await fetchDocWithTimeout(doc(db, 'settings', canonical + '_pass'));
        if (!passDoc.exists() && rawLower !== canonical) {
            passDoc = await fetchDocWithTimeout(doc(db, 'settings', rawLower + '_pass'));
        }
        if (passDoc.exists()) {
            if (passDoc.data().deleted) return null;
            if (passDoc.data().password !== undefined && passDoc.data().password !== null) {
                return String(passDoc.data().password).trim();
            }
        }
    } catch (e) {
        console.warn("Get pass error or timeout, falling back to local defaults", e);
    }
    return DEFAULT_PASSWORDS[canonical] ? String(DEFAULT_PASSWORDS[canonical]).trim() : null;
}

// Helper: Delete Account permanently from system
async function deleteAccount(userId, userName) {
    const canonical = userId.toLowerCase();
    if (canonical === 'admin' || canonical === 'tomek') {
        showToast("Nie można usunąć głównego administratora!", "error");
        return false;
    }

    const confirmed = await showConfirm(`Czy na pewno chcesz TRWALE USUNĄĆ konto "${userName}"? Login i hasło przestaną działać, tak jakby konta nigdy nie było!`, "TRWALE USUŃ KONTO", "ANULUJ", true);
    if (confirmed) {
        try {
            await setDoc(doc(db, 'deleted_users', canonical), {
                username: userName,
                canonical: canonical,
                deletedAt: new Date().toISOString(),
                deletedBy: currentUser || 'Admin'
            });
            await setDoc(doc(db, 'settings', canonical + '_pass'), {
                deleted: true,
                password: null,
                updatedAt: new Date().toISOString()
            });
            try {
                await deleteDoc(doc(db, 'users', canonical));
            } catch (e) {}

            if (!deletedUsers.includes(canonical)) deletedUsers.push(canonical);

            showToast(`Trwale usunięto konto "${userName}". Login i hasło nie działają!`, "success");
            logAction(`${currentUser} trwale usunął konto: ${userName}`);

            if (currentUser.toLowerCase() === canonical) {
                currentUser = '';
                localStorage.removeItem('ecoCarUser');
                location.reload();
            } else {
                loadAdminData();
                populateWorkerSelects();
                populateNoteWorkerSelect();
                renderTrashSchedule();
            }
            return true;
        } catch (err) {
            console.error("Delete account error", err);
            showToast("Błąd podczas usuwania konta", "error");
            return false;
        }
    }
    return false;
}

// Helper: Change Password in Firestore settings collection
async function changeUserPassword(username, newPassword) {
    const canonical = username.toLowerCase();
    try {
        await setDoc(doc(db, 'settings', canonical + '_pass'), {
            password: newPassword,
            updatedAt: new Date().toISOString(),
            updatedBy: currentUser || 'Admin'
        });
        return true;
    } catch (e) {
        console.error("Change pass error", e);
        return false;
    }
}

// Helper: Check if user is Owner (Właściciel) - Admin, Tomek, Monia
function isOwner(user = currentUser) {
    if (!user) return false;
    const u = user.toLowerCase();
    return u === 'admin' || u === 'tomek' || u === 'tomasz' || u === 'monia' || u === 'monika';
}

// Helper: Check if user can add cars (Admin, Tomek, Łukasz)
function canAddCars(user = currentUser) {
    if (!user) return false;
    const u = user.toLowerCase();
    return u === 'admin' || u === 'tomek' || u === 'tomasz' || u === 'lukasz' || u === 'łukasz';
}

// Helper: Check if user can access Admin Panel and manage users (Admin & Tomek ONLY)
function canManageLocationsAndUsers(user = currentUser) {
    if (!user) return false;
    const u = user.toLowerCase();
    return u === 'admin' || u === 'tomek' || u === 'tomasz';
}

// DOM Elements
const carsGrid = document.getElementById('cars-grid');
const calendarSection = document.getElementById('calendar-section');
const locationsSection = document.getElementById('locations-section');
const notesSection = document.getElementById('notes-section');
const trashSection = document.getElementById('trash-section');

const calendarGrid = document.getElementById('calendar-grid');
const calMonthYearEl = document.getElementById('cal-month-year');
const calPrevMonthBtn = document.getElementById('cal-prev-month');
const calNextMonthBtn = document.getElementById('cal-next-month');
const calTodayBtn = document.getElementById('cal-today-btn');

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

// Navigation Tabs
const viewActiveBtn = document.getElementById('view-active');
const viewLocationsBtn = document.getElementById('view-locations');
const viewCalendarBtn = document.getElementById('view-calendar');
const viewNotesBtn = document.getElementById('view-notes');
const viewTrashBtn = document.getElementById('view-trash');
const viewArchiveBtn = document.getElementById('view-archive');
const viewAdminBtn = document.getElementById('view-admin');

// Mobile Bottom Nav Items
const mobNavActive = document.getElementById('mob-nav-active');
const mobNavLocations = document.getElementById('mob-nav-locations');
const mobNavCalendar = document.getElementById('mob-nav-calendar');
const mobNavNotes = document.getElementById('mob-nav-notes');
const mobNavTrash = document.getElementById('mob-nav-trash');
const mobNavArchive = document.getElementById('mob-nav-archive');
const mobNavAdmin = document.getElementById('mob-nav-admin');
const mobNavNotif = document.getElementById('mob-nav-notif');
const mobNotifBadge = document.getElementById('mob-notif-badge');

const adminSection = document.getElementById('admin-section');
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

// Notifications UI Elements
const notifBtn = document.getElementById('notif-btn');
const notifBadge = document.getElementById('notif-badge');
const notifModal = document.getElementById('notif-modal');
const closeNotifModalBtn = document.getElementById('close-notif-modal');
const notifList = document.getElementById('notif-list');
const clearNotifsBtn = document.getElementById('clear-notifs-btn');

// Calendar Day Modal Elements
const calDayModal = document.getElementById('calendar-day-modal');
const closeCalDayModalBtn = document.getElementById('close-cal-day-modal');
const calDayModalTitle = document.getElementById('cal-day-modal-title');
const calDayCarsList = document.getElementById('cal-day-cars-list');
const calAssignCarSelect = document.getElementById('cal-assign-car-select');
const calAssignCarBtn = document.getElementById('cal-assign-car-btn');
const calCreateNewCarBtn = document.getElementById('cal-create-new-car-btn');

// PWA Install Elements
const pwaInstallBtn = document.getElementById('pwa-install-btn');
const pwaModal = document.getElementById('pwa-modal');
const closePwaModalBtn = document.getElementById('close-pwa-modal');
const pwaTriggerInstallBtn = document.getElementById('pwa-trigger-install-btn');

// Custom Todos elements
const customTodoInput = document.getElementById('custom-todo-input');
const addCustomTodoBtn = document.getElementById('add-custom-todo-btn');
const customTodosList = document.getElementById('custom-todos-list');

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            reg.update();
        }).catch(err => console.log('Service Worker reg error', err));
    });
}

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
});

// Initialize Listener - Real-time Snapshots
function init() {
    // Theme setup
    const savedTheme = localStorage.getItem('ecoCarTheme') || 'dark';
    applyTheme(savedTheme);

    // Preserve logged-in user session - NEVER auto-logout on refresh
    localStorage.removeItem('ecoCarReloadCount');

    if (currentUser) {
        const checkLock = async () => {
            const canonical = currentUser.toLowerCase();
            const isAdminOrOwner = canonical === 'admin' || canonical === 'tomek' || canonical === 'tomasz';
            try {
                const lockDoc = await getDoc(doc(db, 'settings', canonical + '_lock'));
                if (lockDoc.exists() && lockDoc.data().suspended && !isAdminOrOwner) {
                    localStorage.removeItem('ecoCarUser');
                    currentUser = '';
                    loginOverlay.style.display = 'flex';
                    appContainer.style.display = 'none';
                    return;
                }
            } catch (e) {
                console.warn("Check lock status error", e);
            }
            loginOverlay.style.display = 'none';
            appContainer.style.display = 'block';
            loggedUserNameEl.textContent = currentUser;
            if (currentUser.toLowerCase() === 'nastka') {
                applyLanguage('ua');
            } else if (localStorage.getItem('ecoCarLang')) {
                applyLanguage(localStorage.getItem('ecoCarLang'));
            }
            updateUIForRole();
        };
        checkLock();
    } else {
        loginOverlay.style.display = 'flex';
        appContainer.style.display = 'none';
    }

    // Cars Realtime Listener
    const q = query(carsCol, orderBy('dateAdded', 'desc'));
    onSnapshot(q, (snapshot) => {
        cars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processAutoArchiving();
        renderCars();
        renderLocations();
        renderCalendar();
        updateStats();
        updateCountdowns();
    });

    // Notifications Realtime Listener
    const notifQ = query(notificationsCol, orderBy('timestamp', 'desc'), limit(50));
    onSnapshot(notifQ, (snapshot) => {
        notifications = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        updateNotificationsUI();
    });

    // Deleted Users Realtime Listener
    onSnapshot(deletedUsersCol, (snapshot) => {
        deletedUsers = snapshot.docs.map(doc => doc.id.toLowerCase());
        loadAdminData();
        populateWorkerSelects();
        populateNoteWorkerSelect();
    });

    // Users Realtime Listener
    onSnapshot(usersCol, (snapshot) => {
        customUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        populateWorkerSelects();
        populateNoteWorkerSelect();
        renderTrashSchedule();
        loadAdminData();
    });

    // Notes Realtime Listener
    const notesQ = query(notesCol, orderBy('createdAt', 'desc'));
    onSnapshot(notesQ, (snapshot) => {
        notes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderNotes();
    });

    // Archived Notes Realtime Listener
    const archivedNotesQ = query(archivedNotesCol, orderBy('deletedAt', 'desc'), limit(50));
    onSnapshot(archivedNotesQ, (snapshot) => {
        archivedNotes = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderArchivedNotesList();
    });

    // Trash Schedule Listener
    const trashDocRef = doc(db, 'settings', 'trash_schedule_doc');
    onSnapshot(trashDocRef, (snap) => {
        if (snap.exists() && snap.data().schedule) {
            trashSchedule = snap.data().schedule;
        }
        renderTrashSchedule();
    });

    setInterval(updateCountdowns, 1000);
    setInterval(processAutoArchiving, 60000);

    // Navigation Click Handlers
    setupNavigation();

    // Notes Module Handlers
    setupNotesModule();

    // Account Creation Handlers
    setupAccountCreation();

    // Login Handler
    setupLogin();

    // Calendar Navigation Handlers
    setupCalendarNav();

    // PWA Install Handlers
    setupPWA();

    // Language Toggle
    setupLanguageToggle();

    // Dynamic Service Categories
    listenServiceCategories();
    setupAddServiceCategory();

    // Report Form Protocol
    setupReportForm();

    // Custom Todos Handler
    if (addCustomTodoBtn && customTodoInput) {
        addCustomTodoBtn.onclick = () => {
            const text = customTodoInput.value.trim();
            if (text) {
                customTodos.push({ text: text, done: false });
                customTodoInput.value = '';
                renderCustomTodosInForm();
            }
        };
    }
}

function setupNavigation() {
    const switchTab = (targetView) => {
        if (targetView === 'admin' && !canManageLocationsAndUsers(currentUser)) {
            showToast("Panel administratora dostępny jest tylko dla Admina i Tomka.", "error");
            return;
        }
        currentView = targetView;
        viewActiveBtn.classList.toggle('active', targetView === 'active');
        if (viewLocationsBtn) viewLocationsBtn.classList.toggle('active', targetView === 'locations');
        viewCalendarBtn.classList.toggle('active', targetView === 'calendar');
        if (viewNotesBtn) viewNotesBtn.classList.toggle('active', targetView === 'notes');
        if (viewTrashBtn) viewTrashBtn.classList.toggle('active', targetView === 'trash');
        viewArchiveBtn.classList.toggle('active', targetView === 'archive');
        viewAdminBtn.classList.toggle('active', targetView === 'admin');

        // Mobile Nav sync
        mobNavActive.classList.toggle('active', targetView === 'active');
        if (mobNavLocations) mobNavLocations.classList.toggle('active', targetView === 'locations');
        mobNavCalendar.classList.toggle('active', targetView === 'calendar');
        if (mobNavNotes) mobNavNotes.classList.toggle('active', targetView === 'notes');
        if (mobNavTrash) mobNavTrash.classList.toggle('active', targetView === 'trash');
        mobNavArchive.classList.toggle('active', targetView === 'archive');
        mobNavAdmin.classList.toggle('active', targetView === 'admin');

        // Display sections
        carsGrid.style.display = (targetView === 'active' || targetView === 'archive') ? 'grid' : 'none';
        if (locationsSection) locationsSection.style.display = (targetView === 'locations') ? 'block' : 'none';
        calendarSection.style.display = (targetView === 'calendar') ? 'block' : 'none';
        if (notesSection) notesSection.style.display = (targetView === 'notes') ? 'block' : 'none';
        if (trashSection) trashSection.style.display = (targetView === 'trash') ? 'block' : 'none';
        adminSection.style.display = (targetView === 'admin') ? 'block' : 'none';
        archiveControls.style.display = (targetView === 'archive') ? 'flex' : 'none';

        if (targetView === 'active' || targetView === 'archive') {
            renderCars(searchInput.value);
        } else if (targetView === 'locations') {
            renderLocations();
        } else if (targetView === 'calendar') {
            renderCalendar();
        } else if (targetView === 'notes') {
            renderNotes();
        } else if (targetView === 'trash') {
            renderTrashSchedule();
        } else if (targetView === 'admin') {
            loadAdminData();
        }
    };

    viewActiveBtn.onclick = () => switchTab('active');
    if (viewLocationsBtn) viewLocationsBtn.onclick = () => switchTab('locations');
    viewCalendarBtn.onclick = () => switchTab('calendar');
    if (viewNotesBtn) viewNotesBtn.onclick = () => switchTab('notes');
    if (viewTrashBtn) viewTrashBtn.onclick = () => switchTab('trash');
    viewArchiveBtn.onclick = () => switchTab('archive');
    viewAdminBtn.onclick = () => switchTab('admin');

    mobNavActive.onclick = () => switchTab('active');
    if (mobNavLocations) mobNavLocations.onclick = () => switchTab('locations');
    mobNavCalendar.onclick = () => switchTab('calendar');
    if (mobNavNotes) mobNavNotes.onclick = () => switchTab('notes');
    if (mobNavTrash) mobNavTrash.onclick = () => switchTab('trash');
    mobNavArchive.onclick = () => switchTab('archive');
    mobNavAdmin.onclick = () => switchTab('admin');

    periodBtns.forEach(btn => {
        btn.onclick = () => {
            periodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            archivePeriod = btn.dataset.period;
            renderCars(searchInput.value);
        };
    });
}

function setupLogin() {
    loginBtn.style.display = 'block';
    loginUserInput.disabled = false;
    loginPassInput.disabled = false;

    const performLogin = async () => {
        const userVal = loginUserInput.value.trim();
        const passVal = loginPassInput.value.trim();

        if (!userVal) {
            showToast("Podaj nazwę użytkownika", "error");
            loginUserInput.focus();
            return;
        }
        if (!passVal) {
            showToast("Podaj hasło", "error");
            loginPassInput.focus();
            return;
        }

        const originalBtnText = loginBtn.textContent;
        loginBtn.disabled = true;
        loginBtn.textContent = 'Sprawdzanie...';

        try {
            const canonicalUser = getCanonicalUsername(userVal);
            const expectedPass = await getUserPassword(canonicalUser);

            const isMatch = (expectedPass !== null && String(expectedPass).trim() === String(passVal).trim()) ||
                (DEFAULT_PASSWORDS[canonicalUser] && String(DEFAULT_PASSWORDS[canonicalUser]).trim() === String(passVal).trim()) ||
                (canonicalUser === 'admin' && String(passVal).trim() === 'system02') ||
                (canonicalUser === 'tomek' && String(passVal).trim() === 'tommar');

            if (isMatch) {
                localStorage.removeItem('ecoCarFailedAttempts');

                try {
                    await setDoc(doc(db, 'settings', canonicalUser + '_lock'), { locked: false, suspended: false });
                } catch (e) { console.error("Unlock reset error", e); }

                currentUser = canonicalUser.charAt(0).toUpperCase() + canonicalUser.slice(1);
                if (canonicalUser === 'lukasz') currentUser = 'Łukasz';

                localStorage.setItem('ecoCarUser', currentUser);
                localStorage.removeItem('ecoCarReloadCount');

                if (canonicalUser === 'nastka') {
                    applyLanguage('ua');
                }

                loginOverlay.style.display = 'none';
                appContainer.style.display = 'block';
                loggedUserNameEl.textContent = currentUser;
                showToast(`Zalogowano jako ${currentUser}`, "success");

                loginPassInput.value = '';
                loginUserInput.value = '';
                lockedMsgEl.style.display = 'none';
                loginBtn.style.display = 'block';
                loginUserInput.disabled = false;
                loginPassInput.disabled = false;

                try {
                    const settingKey = canonicalUser + '_login';
                    await setDoc(doc(db, 'settings', settingKey), {
                        lastLogin: new Date().toISOString()
                    }, { merge: true });
                } catch (e) { console.error("Update login error", e); }

                logAction(`Zalogowano użytkownika: ${currentUser}`);
                updateUIForRole();
                renderCars();
            } else {
                if (canonicalUser !== 'admin' && canonicalUser !== 'tomek') {
                    try {
                        const lockDoc = await getDoc(doc(db, 'settings', canonicalUser + '_lock'));
                        if (lockDoc.exists() && lockDoc.data().locked) {
                            showLockedMessage(lockDoc.data().suspended || false, canonicalUser);
                            return;
                        }
                    } catch (e) { console.error("Check lock error", e); }
                }

                handleFailedLogin(canonicalUser);
            }
        } catch (err) {
            console.error("Login unexpected error", err);
            showToast("Wystąpił problem podczas logowania. Spróbuj ponownie.", "error");
        } finally {
            loginBtn.disabled = false;
            loginBtn.textContent = originalBtnText;
        }
    };

    loginBtn.onclick = performLogin;

    loginPassInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performLogin();
        }
    };
    loginUserInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (loginPassInput.value) {
                performLogin();
            } else {
                loginPassInput.focus();
            }
        }
    };
    loginUserInput.oninput = () => {
        const can = getCanonicalUsername(loginUserInput.value);
        if (can === 'admin' || can === 'tomek') {
            lockedMsgEl.style.display = 'none';
            loginBtn.style.display = 'block';
            loginUserInput.disabled = false;
            loginPassInput.disabled = false;
        }
    };
}

function showLockedMessage(isSuspended = false, username = '') {
    const title = isSuspended ? "Konto Zawieszone" : "Konto Zablokowane";
    const message = isSuspended ? "Twoje konto zostało zawieszone." : "Przekroczono limit prób logowania. Możesz odblokować konto poniżej:";

    lockedMsgEl.innerHTML = `
        <div class="locked-container" style="${isSuspended ? 'border-color: #f59e0b; background: rgba(245, 158, 11, 0.1);' : ''}">
            <h3 style="${isSuspended ? 'color: #f59e0b;' : ''}">${title}</h3>
            <p>${message}</p>
            <a href="tel:+48605595049" class="phone-link" style="${isSuspended ? 'color: #f59e0b;' : ''}">📞 605 595 049</a>
            <div style="margin-top: 15px;">
                <button id="btn-unlock-login" class="btn-primary" style="width: 100%; font-size: 0.9rem;">🔓 Odblokuj Ekran Logowania</button>
            </div>
        </div>
    `;
    lockedMsgEl.style.display = 'block';

    const unlockBtn = document.getElementById('btn-unlock-login');
    if (unlockBtn) {
        unlockBtn.onclick = async () => {
            localStorage.removeItem('ecoCarFailedAttempts');
            if (username) {
                try {
                    await setDoc(doc(db, 'settings', username.toLowerCase() + '_lock'), { locked: false, suspended: false });
                } catch (e) { console.error("Unlock reset error", e); }
            }
            lockedMsgEl.style.display = 'none';
            loginBtn.style.display = 'block';
            loginUserInput.disabled = false;
            loginPassInput.disabled = false;
            loginPassInput.value = '';
            showToast("Odblokowano ekran logowania!", "success");
        };
    }
}

async function handleFailedLogin(username) {
    if (username === 'admin' || username === 'tomek') {
        showToast("Nieprawidłowe hasło. Spróbuj ponownie.", "error");
        return;
    }
    let attempts = parseInt(localStorage.getItem('ecoCarFailedAttempts') || '0', 10);
    attempts++;
    localStorage.setItem('ecoCarFailedAttempts', attempts.toString());

    if (attempts >= 5) {
        try {
            await setDoc(doc(db, 'settings', username + '_lock'), {
                locked: true,
                timestamp: new Date().toISOString()
            });
        } catch (e) { console.error("Lock error", e); }
        showLockedMessage(false, username);
        showToast("Konto zostało zablokowane!", "error");
    } else {
        showToast(`Błędne dane! Pozostało prób: ${5 - attempts}`, "error");
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

function requestPushNotificationPermission() {
    if (isOwner(currentUser) && 'Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission().then(permission => {
            if (permission === 'granted') {
                showToast("Włączono powiadomienia systemowe na telefonie!", "success");
            }
        });
    }
}

function sendSystemPushNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        try {
            if (navigator.serviceWorker && navigator.serviceWorker.controller) {
                navigator.serviceWorker.ready.then(reg => {
                    reg.showNotification(title, {
                        body: body,
                        icon: 'icon-192.png',
                        badge: 'icon-192.png',
                        vibrate: [200, 100, 200],
                        tag: 'ecocarpro-notif-' + Date.now()
                    });
                });
            } else {
                new Notification(title, {
                    body: body,
                    icon: 'icon-192.png'
                });
            }
        } catch (e) { console.error("System push error", e); }
    }
}

// Worker Helpers
function isCarAssignedToWorker(car, user = currentUser) {
    if (!user || !car) return false;
    const u = user.toLowerCase();
    if (car.workers && Array.isArray(car.workers)) {
        return car.workers.some(w => (w || '').toLowerCase() === u);
    }
    if (car.worker) {
        return car.worker.toLowerCase().split(',').map(s => s.trim()).includes(u);
    }
    return false;
}

function getCarWorkerDisplay(car) {
    if (car.workers && Array.isArray(car.workers) && car.workers.length > 0) {
        return car.workers.join(', ');
    }
    return car.worker || 'Nieprzypisany';
}

function getAllWorkerNames() {
    const defaultWorkers = ['Adam', 'Łukasz', 'Nastka', 'Tomek', 'Monia', 'Admin'];
    const customUserNames = customUsers.map(u => u.username || u.name).filter(Boolean);
    return Array.from(new Set([...defaultWorkers, ...customUserNames]))
        .filter(w => {
            const can = w.toLowerCase().trim();
            return can !== 'michal' && can !== 'michał' && !deletedUsers.includes(can);
        });
}

function getTrashWorkerNames() {
    const baseWorkers = ['Adam', 'Łukasz', 'Nastka'];
    const customUserNames = customUsers.map(u => u.username || u.name).filter(Boolean);
    const combined = Array.from(new Set([...baseWorkers, ...customUserNames]));
    return combined.filter(w => {
        const can = w.toLowerCase().trim();
        return can !== 'michal' && can !== 'michał' && !deletedUsers.includes(can);
    });
}

function populateWorkerSelects() {
    const workersContainer = document.getElementById('car-workers-checkboxes');
    if (!workersContainer) return;

    const allWorkers = getAllWorkerNames();
    const currentChecked = Array.from(workersContainer.querySelectorAll('input[type="checkbox"]:checked')).map(cb => cb.value);

    workersContainer.innerHTML = allWorkers.map(w => `
        <label class="checkbox-container">
            <input type="checkbox" name="car-worker-cb" value="${w}" ${currentChecked.includes(w) ? 'checked' : ''}>
            <span class="checkmark"></span>
            👤 ${w}
        </label>
    `).join('');
}

function populateNoteWorkerSelect() {
    const noteWorkerSelect = document.getElementById('note-worker-select');
    if (!noteWorkerSelect) return;

    const currentVal = noteWorkerSelect.value;
    const allWorkers = getAllWorkerNames();

    noteWorkerSelect.innerHTML = '<option value="">-- Powiąż z pracownikiem (opcjonalnie) --</option>' +
        allWorkers.map(w => `<option value="${w}">👤 ${w}</option>`).join('');

    if (currentVal) noteWorkerSelect.value = currentVal;
}

function updateUIForRole() {
    const role = (currentUser || '').toLowerCase();
    const owner = isOwner(currentUser);
    const canManage = canManageLocationsAndUsers(currentUser);

    // Archive access: Only Owners (Admin, Tomek, Monia) can see Archive tab!
    if (owner) {
        if (viewArchiveBtn) viewArchiveBtn.style.display = 'block';
        if (mobNavArchive) mobNavArchive.style.display = 'flex';
    } else {
        if (viewArchiveBtn) viewArchiveBtn.style.display = 'none';
        if (mobNavArchive) mobNavArchive.style.display = 'none';
        if (currentView === 'archive') {
            currentView = 'active';
            if (viewActiveBtn) viewActiveBtn.click();
        }
    }

    // Calendar access: Only Owners (Admin, Tomek, Monia) can see Calendar tab!
    if (owner) {
        if (viewCalendarBtn) viewCalendarBtn.style.display = 'block';
        if (mobNavCalendar) mobNavCalendar.style.display = 'flex';
    } else {
        if (viewCalendarBtn) viewCalendarBtn.style.display = 'none';
        if (mobNavCalendar) mobNavCalendar.style.display = 'none';
        if (currentView === 'calendar') {
            currentView = 'active';
            if (viewActiveBtn) viewActiveBtn.click();
        }
    }

    // Hide/show prices for workers
    if (!owner) {
        document.body.classList.add('worker-hide-prices');
    } else {
        document.body.classList.remove('worker-hide-prices');
    }

    // Hide price group in car form modal for workers
    const priceInput = document.getElementById('car-price');
    if (priceInput) {
        const priceGroup = priceInput.closest('.form-group');
        if (priceGroup) {
            priceGroup.style.display = owner ? 'block' : 'none';
        }
    }

    // Admin, Tomek & Łukasz (Kierownik) access to Adding Cars
    if (addCarBtn) {
        addCarBtn.style.display = canAddCars(currentUser) ? 'inline-flex' : 'none';
    }

    // Admin & Tomek & Łukasz access to Admin Panel
    if (canManage) {
        if (viewAdminBtn) viewAdminBtn.style.display = 'block';
        if (mobNavAdmin) mobNavAdmin.style.display = 'flex';
    } else {
        if (viewAdminBtn) viewAdminBtn.style.display = 'none';
        if (mobNavAdmin) mobNavAdmin.style.display = 'none';
        if (currentView === 'admin') {
            if (viewActiveBtn) viewActiveBtn.click();
        }
    }

    const accountBox = document.getElementById('account-creation-box');
    if (accountBox) {
        accountBox.style.display = canManage ? 'block' : 'none';
    }

    // Owner Notifications Button visibility
    if (owner) {
        if (notifBtn) notifBtn.style.display = 'flex';
        if (mobNavNotif) mobNavNotif.style.display = 'flex';
        requestPushNotificationPermission();
    } else {
        if (notifBtn) notifBtn.style.display = 'none';
        if (mobNavNotif) mobNavNotif.style.display = 'none';
    }

    if (role === 'monia') {
        document.body.classList.add('monia-mode');
    } else {
        document.body.classList.remove('monia-mode');
    }

    populateWorkerSelects();
}

// Notifications Logic for Owners
function updateNotificationsUI() {
    const unreadList = notifications.filter(n => !n.read);
    const unreadCount = unreadList.length;

    if (unreadCount > 0 && isOwner(currentUser)) {
        notifBadge.style.display = 'flex';
        notifBadge.textContent = unreadCount;
        mobNotifBadge.style.display = 'flex';
        mobNotifBadge.textContent = unreadCount;
    } else {
        notifBadge.style.display = 'none';
        mobNotifBadge.style.display = 'none';
    }

    if (notifList) {
        if (notifications.length === 0) {
            notifList.innerHTML = '<p style="text-align:center; color: var(--text-muted); padding: 1.5rem;">Brak powiadomień.</p>';
        } else {
            notifList.innerHTML = notifications.map(n => {
                const date = new Date(n.timestamp).toLocaleString('pl-PL');
                return `
                    <div class="notif-item ${n.read ? '' : 'unread'}">
                        <div style="font-weight: 600;">${n.text}</div>
                        <div class="notif-time">⏱️ ${date}</div>
                    </div>
                `;
            }).join('');
        }
    }
}

if (notifBtn) {
    notifBtn.onclick = () => notifModal.classList.add('active');
}

if (mobNavNotif) {
    mobNavNotif.onclick = () => notifModal.classList.add('active');
}

if (closeNotifModalBtn) {
    closeNotifModalBtn.onclick = () => notifModal.classList.remove('active');
}

if (clearNotifsBtn) {
    clearNotifsBtn.onclick = async () => {
        try {
            const unreadDocs = notifications.filter(n => !n.read);
            for (const n of unreadDocs) {
                await updateDoc(doc(db, 'notifications', n.id), { read: true });
            }
            showToast("Oznaczono powiadomienia jako przeczytane.", "success");
        } catch (e) { console.error("Clear notifs error", e); }
    };
}

// PWA Handlers
function setupPWA() {
    if (pwaInstallBtn) {
        pwaInstallBtn.onclick = () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
            } else {
                pwaModal.classList.add('active');
            }
        };
    }

    if (pwaTriggerInstallBtn) {
        pwaTriggerInstallBtn.onclick = () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                deferredPrompt.userChoice.then(() => { deferredPrompt = null; pwaModal.classList.remove('active'); });
            } else {
                showToast("Wybierz 'Udostępnij [⎋]' -> 'Dodaj do ekranu początkowego' w przeglądarce.", "info");
            }
        };
    }

    if (closePwaModalBtn) {
        closePwaModalBtn.onclick = () => pwaModal.classList.remove('active');
    }
}

// Calendar View Logic (Square Day Tiles)
function setupCalendarNav() {
    if (calPrevMonthBtn) {
        calPrevMonthBtn.onclick = () => {
            calCurrentMonth--;
            if (calCurrentMonth < 0) {
                calCurrentMonth = 11;
                calCurrentYear--;
            }
            renderCalendar();
        };
    }

    if (calNextMonthBtn) {
        calNextMonthBtn.onclick = () => {
            calCurrentMonth++;
            if (calCurrentMonth > 11) {
                calCurrentMonth = 0;
                calCurrentYear++;
            }
            renderCalendar();
        };
    }

    if (calTodayBtn) {
        calTodayBtn.onclick = () => {
            calCurrentMonth = new Date().getMonth();
            calCurrentYear = new Date().getFullYear();
            renderCalendar();
        };
    }

    if (closeCalDayModalBtn) {
        closeCalDayModalBtn.onclick = () => calDayModal.classList.remove('active');
    }

    if (calCreateNewCarBtn) {
        calCreateNewCarBtn.onclick = () => {
            calDayModal.classList.remove('active');
            modalTitle.textContent = `Dodaj Auto na Dzień: ${selectedCalDate}`;
            carForm.reset();
            populateWorkerSelects();
            document.getElementById('car-id').value = '';
            document.getElementById('car-arrival-date').value = selectedCalDate || '';
            document.querySelectorAll('input[name="todo"]').forEach(cb => cb.checked = false);
            document.querySelectorAll('input[name="car-worker-cb"]').forEach(cb => cb.checked = false);
            document.getElementById('car-priority').checked = false;
            customTodos = [];
            renderCustomTodosInForm();
            carModal.classList.add('active');
        };
    }

    if (calAssignCarBtn) {
        calAssignCarBtn.onclick = async () => {
            const carId = calAssignCarSelect.value;
            if (!carId) {
                showToast("Wybierz auto z listy!", "error");
                return;
            }
            try {
                await updateDoc(doc(db, 'cars', carId), {
                    arrivalDate: selectedCalDate,
                    archived: false // Also add to active main screen!
                });
                showToast(`Przypisano datę ${selectedCalDate} oraz dodano do ekranu głównego!`, "success");
                logAction(`Przypisano datę ${selectedCalDate} do auta id:${carId}`);
                calDayModal.classList.remove('active');
                renderCalendar();
            } catch (e) {
                showToast("Błąd przypisywania daty", "error");
            }
        };
    }
}

function renderCalendar() {
    if (!calendarGrid || !calMonthYearEl) return;

    const monthNames = [
        "Styczeń", "Luty", "Marzec", "Kwiecień", "Maj", "Czerwiec",
        "Lipiec", "Sierpień", "Wrzesień", "Październik", "Listopad", "Grudzień"
    ];

    calMonthYearEl.textContent = `${monthNames[calCurrentMonth]} ${calCurrentYear}`;

    const firstDayOfMonth = new Date(calCurrentYear, calCurrentMonth, 1);
    const daysInMonth = new Date(calCurrentYear, calCurrentMonth + 1, 0).getDate();
    
    // ISO Day of week (1=Monday, 7=Sunday)
    let startingDay = firstDayOfMonth.getDay();
    if (startingDay === 0) startingDay = 7; // Convert Sunday 0 to 7

    const todayStr = new Date().toISOString().split('T')[0];

    calendarGrid.innerHTML = '';

    // Empty tiles before first day
    for (let i = 1; i < startingDay; i++) {
        const emptyTile = document.createElement('div');
        emptyTile.className = 'calendar-day-tile other-month';
        calendarGrid.appendChild(emptyTile);
    }

    // Days of current month
    for (let day = 1; day <= daysInMonth; day++) {
        const dayTwoDigits = String(day).padStart(2, '0');
        const monthTwoDigits = String(calCurrentMonth + 1).padStart(2, '0');
        const dateStr = `${calCurrentYear}-${monthTwoDigits}-${dayTwoDigits}`;

        const tile = document.createElement('div');
        tile.className = 'calendar-day-tile';
        if (dateStr === todayStr) tile.classList.add('today');

        // Find cars arriving or picked up on this date
        const dayCars = cars.filter(c => c.arrivalDate === dateStr || c.pickupDate === dateStr);

        let badgesHtml = '';
        dayCars.slice(0, 3).forEach(car => {
            const isArrival = car.arrivalDate === dateStr;
            const isOgledziny = car.visitType === 'ogledziny';
            const badgeClass = isOgledziny ? 'ogledziny' : (isArrival ? 'usluga' : 'pickup');
            const prefix = isOgledziny ? '🔍' : (isArrival ? '🛠️' : '🔑');
            const typeLabel = isOgledziny ? 'Oględziny' : 'Usługa';
            const pinnedClass = car.pinnedOnMain ? 'pinned' : '';
            const primaryService = car.serviceName || (car.todo && car.todo.length > 0 ? (typeof car.todo[0] === 'string' ? car.todo[0] : car.todo[0].text) : typeLabel);
            badgesHtml += `<span class="cal-car-badge ${badgeClass} ${pinnedClass}">${prefix} ${car.brand}${primaryService ? ' - ' + primaryService : ''}</span>`;
        });

        if (dayCars.length > 3) {
            badgesHtml += `<span class="cal-car-badge" style="background:rgba(255,255,255,0.1);">+${dayCars.length - 3} aut</span>`;
        }

        tile.innerHTML = `
            <div class="day-tile-top">
                <span class="day-num">${day}</span>
                ${dayCars.length > 0 ? `<span class="day-cars-count">${dayCars.length}</span>` : ''}
            </div>
            <div class="day-badges-container">
                ${badgesHtml}
            </div>
        `;

        tile.onclick = () => openCalendarDayModal(dateStr, dayCars);
        calendarGrid.appendChild(tile);
    }
}

function openCalendarDayModal(dateStr, dayCars) {
    selectedCalDate = dateStr;
    const parts = dateStr.split('-');
    calDayModalTitle.textContent = `📅 Zarządzanie dla dnia: ${parts[2]}.${parts[1]}.${parts[0]}`;

    // Populate day cars list
    if (dayCars.length === 0) {
        calDayCarsList.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Brak zaplanowanych aut na ten dzień.</p>';
    } else {
        calDayCarsList.innerHTML = dayCars.map(car => `
            <div class="cal-day-car-item" style="flex-direction:column; align-items:stretch;">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                    <div>
                        <strong>${car.brand}</strong> ${car.plateNum ? `(${car.plateNum})` : ''}
                        <div style="font-size:0.75rem; margin-top:3px;">
                            <span style="font-weight:700; color:${car.visitType === 'ogledziny' ? '#f59e0b' : 'var(--primary-green)'};">
                                ${car.visitType === 'ogledziny' ? '🔍 TYLKO OGLĘDZINY / WYCENA' : '🛠️ PEŁNA USŁUGA'}
                            </span>
                        </div>
                        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
                            Właściciel: ${car.ownerName || '---'} | Status: ${car.status || 'przyjedzie'}
                        </div>
                        ${car.arrivalTime ? `<div style="font-size:0.75rem; color:var(--primary-green); margin-top:2px;">🕒 Godz. przyjazdu: <strong>${car.arrivalTime}</strong></div>` : ''}
                    </div>
                    <div style="display:flex; gap:6px; flex-wrap:wrap; align-items:center;">
                        <button class="btn-secondary btn-cal-reschedule" data-id="${car.id}" style="font-size:0.75rem; padding:6px 10px; background:rgba(59, 130, 246, 0.15); border:1px solid #3b82f6; color:#3b82f6;">
                            📅 Zmień Datę
                        </button>
                        <button class="btn-secondary btn-pin-main" data-id="${car.id}" style="font-size:0.75rem; padding:6px 10px;">
                            📌 Do głównych
                        </button>
                        <button class="btn-secondary btn-cal-edit" data-id="${car.id}" title="Pełna edycja auta" style="font-size:0.75rem; padding:6px 9px;">
                            ✏️
                        </button>
                    </div>
                </div>

                <div class="cal-reschedule-box" id="reschedule-box-${car.id}" style="display:none; width:100%; margin-top:10px; padding:10px; background:rgba(0,0,0,0.3); border:1px solid rgba(59, 130, 246, 0.35); border-radius:8px;">
                    <div style="font-size:0.78rem; font-weight:700; color:#3b82f6; margin-bottom:6px;">
                        📅 Zmiana daty przyjazdu klienta (${car.brand})
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:flex-end;">
                        <div>
                            <label style="display:block; font-size:0.7rem; color:var(--text-muted); margin-bottom:2px;">Nowa data przyjazdu:</label>
                            <input type="date" class="form-input new-cal-date" id="new-cal-date-${car.id}" value="${car.arrivalDate || dateStr}" style="padding:6px 8px; font-size:0.8rem; width:135px;">
                        </div>
                        <div>
                            <label style="display:block; font-size:0.7rem; color:var(--text-muted); margin-bottom:2px;">Godzina (np. 08:30):</label>
                            <input type="text" class="form-input new-cal-time" id="new-cal-time-${car.id}" placeholder="np. 08:30" value="${car.arrivalTime || ''}" style="padding:6px 8px; font-size:0.8rem; width:100px;">
                        </div>
                        <div style="display:flex; gap:6px;">
                            <button class="btn-primary btn-save-reschedule" data-id="${car.id}" style="padding:6px 12px; font-size:0.78rem; background:#3b82f6; border-color:#3b82f6;">
                                💾 Zapisz
                            </button>
                            <button class="btn-secondary btn-cancel-reschedule" data-id="${car.id}" style="padding:6px 10px; font-size:0.78rem;">
                                Anuluj
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `).join('');

        // Reschedule Toggle and Save Listeners
        calDayCarsList.querySelectorAll('.btn-cal-reschedule').forEach(btn => {
            btn.onclick = () => {
                const cId = btn.dataset.id;
                const box = document.getElementById(`reschedule-box-${cId}`);
                if (box) {
                    box.style.display = box.style.display === 'none' ? 'block' : 'none';
                }
            };
        });

        calDayCarsList.querySelectorAll('.btn-cancel-reschedule').forEach(btn => {
            btn.onclick = () => {
                const cId = btn.dataset.id;
                const box = document.getElementById(`reschedule-box-${cId}`);
                if (box) box.style.display = 'none';
            };
        });

        calDayCarsList.querySelectorAll('.btn-save-reschedule').forEach(btn => {
            btn.onclick = async () => {
                const cId = btn.dataset.id;
                const dateInput = document.getElementById(`new-cal-date-${cId}`);
                const timeInput = document.getElementById(`new-cal-time-${cId}`);
                const newDate = dateInput ? dateInput.value : '';
                const newTime = timeInput ? timeInput.value.trim() : '';

                if (!newDate) {
                    showToast("Wybierz poprawną nową datę!", "error");
                    return;
                }

                const targetCar = cars.find(c => c.id === cId);
                try {
                    await updateDoc(doc(db, 'cars', cId), {
                        arrivalDate: newDate,
                        arrivalTime: newTime || null
                    });
                    showToast(`Zmieniono datę przyjazdu dla ${targetCar ? targetCar.brand : ''} na ${newDate}!`, "success");
                    logAction(`Zmieniono datę przyjazdu auta ${targetCar ? targetCar.brand : cId} na: ${newDate} ${newTime ? 'godz. ' + newTime : ''}`);
                    calDayModal.classList.remove('active');
                    renderCalendar();
                } catch (err) {
                    console.error("Reschedule error", err);
                    showToast("Błąd zapisu nowej daty", "error");
                }
            };
        });

        // Edit Car Listener
        calDayCarsList.querySelectorAll('.btn-cal-edit').forEach(btn => {
            btn.onclick = () => {
                const cId = btn.dataset.id;
                calDayModal.classList.remove('active');
                editCar(cId);
            };
        });

        // Pin to main event listeners
        calDayCarsList.querySelectorAll('.btn-pin-main').forEach(btn => {
            btn.onclick = async () => {
                const cId = btn.dataset.id;
                try {
                    await updateDoc(doc(db, 'cars', cId), {
                        archived: false,
                        pinnedOnMain: true
                    });
                    showToast("Dodano/Przypięto auto do ekranu głównego!", "success");
                    calDayModal.classList.remove('active');
                } catch (e) { showToast("Błąd dodawania", "error"); }
            };
        });
    }

    // Populate dropdown with all cars in database
    calAssignCarSelect.innerHTML = '<option value="">Wybierz auto z bazy...</option>' +
        cars.map(c => `<option value="${c.id}">${c.brand} (${c.plateNum || 'brak nr'}) - ${c.ownerName || ''}</option>`).join('');

    calDayModal.classList.add('active');
}

// Render Cars Grid / Archive Rows
function renderCars(filter = '') {
    const searchTerm = filter.toLowerCase();

    let filteredCars = cars.filter(car => {
        const isArchive = car.archived;
        if (currentView === 'active') return !isArchive;
        if (currentView === 'archive') {
            if (!isArchive) return false;
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
        (car.todo || []).some(item => (typeof item === 'string' ? item : item.text).toLowerCase().includes(searchTerm))
    );

    if (filteredCars.length === 0) {
        carsGrid.innerHTML = `
            <div class="empty-state">
                <p>${filter ? 'Nie znaleziono samochodów.' : (currentView === 'active' ? 'Brak aktywnych zleceń.' : 'Brak zrealizowanych zleceń.')}</p>
            </div>
        `;
        return;
    }

    if (currentView === 'archive') {
        renderArchiveRows(filteredCars);
    } else {
        renderActiveGrid(filteredCars);
    }

    attachCardListeners();
    translateDOM();
}

function renderArchiveRows(filteredCars) {
    const sorted = [...filteredCars].sort((a, b) => new Date(b.statusChangeDate || b.dateAdded) - new Date(a.statusChangeDate || b.dateAdded));

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

function generateCarCardHtml(car) {
    const status = car.status || 'przyjedzie';
    const isWorkerRole = !isOwner(currentUser) && currentUser !== '';
    const isAssignedToMe = isCarAssignedToWorker(car, currentUser) || (car.addedBy && currentUser && car.addedBy.toLowerCase() === currentUser.toLowerCase());
    const isOtherWorkerCar = isWorkerRole && !isAssignedToMe;
    
    // Normalize todo items into task objects
    let tasks = [];
    if (car.todoTasks && Array.isArray(car.todoTasks)) {
        tasks = car.todoTasks;
    } else if (car.todo && Array.isArray(car.todo)) {
        tasks = car.todo.map(t => typeof t === 'string' ? { text: t, done: false } : t);
    }

    if (isOtherWorkerCar) {
        // Greyed-out minimal view for other worker's car
        return `
            <div class="car-card worker-other ${car.priority ? 'priority-high' : ''} ${status === 'gotowe' ? 'status-gotowe' : ''}" data-id="${car.id}">
                <div class="dates-row">
                    <span class="worker-other-badge">👤 Przypisany: ${getCarWorkerDisplay(car)}</span>
                    ${car.location ? `<span class="location-badge" style="font-size:0.75rem; background:rgba(255,255,255,0.08); padding:2px 6px; border-radius:4px;">📍 ${car.location}</span>` : ''}
                </div>
                <h3 style="margin-top:8px;">${car.brand}</h3>
                ${car.plateNum ? `<div class="car-info-row" style="color: var(--text-muted); font-size: 0.8rem;">📌 ${car.plateNum}</div>` : ''}
                <div class="car-info-row" style="font-size:0.8rem; margin-top:6px;">
                    <span class="label">Status:</span>
                    <span class="val">${status}</span>
                </div>
            </div>
        `;
    }

    // Full / Collapsible Card View
    return `
        <div class="car-card ${car.priority ? 'priority-high' : ''} ${status === 'gotowe' ? 'status-gotowe' : ''} collapsible" data-id="${car.id}">
            <div class="car-card-header-toggle">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; flex:1;">
                    <h3 style="display:inline-block; margin:0; font-size:1rem;">${car.brand}</h3>
                    ${car.plateNum ? `<span class="car-info-row" style="color: var(--primary-green); font-size: 0.8rem; font-weight: 700;">📌 ${car.plateNum}</span>` : ''}
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="status-pill-small ${status}">${status}</span>
                    <span class="toggle-icon" style="font-size:1.1rem; color:var(--primary-green); cursor:pointer;">▼</span>
                </div>
            </div>

            <div class="card-details-collapsible">
                <div class="dates-row" style="margin-top:8px;">
                    ${car.status === 'przyjedzie' && car.arrivalDate ? `<span class="arrival-date-tag">📅 Przyjazd: ${car.arrivalDate}${car.arrivalTime ? ' godz. ' + car.arrivalTime : ''}</span>` : ''}
                    ${car.pickupDate ? `<span class="pickup-date-tag">🔑 Odbiór: ${car.pickupDate}${car.pickupTime ? ' godz. ' + car.pickupTime : ''}</span>` : ''}
                    ${car.location ? `<span class="location-badge" style="background:rgba(16,185,129,0.15); color:var(--primary-green); padding:2px 8px; border-radius:6px; font-size:0.75rem;">📍 ${car.location}</span>` : ''}
                </div>
                
                ${car.pickupDate && !car.archived ? `<div class="countdown-timer" data-pickup="${car.pickupDate}" data-time="${car.pickupTime || ''}"></div>` : ''}

                ${isOwner(currentUser) ? `
                <div class="car-info-row price-blur-target">
                    <span class="label">Wartość Usługi</span>
                    <span class="val">${formatCurrency(car.price)}</span>
                </div>
                ` : ''}
                <div class="car-info-row">
                    <span class="label">Właściciel Auta</span>
                    <span class="val">${car.ownerName || '---'} ${car.ownerPhone ? '/ ' + car.ownerPhone : ''}</span>
                </div>
                <div class="car-info-row">
                    <span class="label">Pracownik(owie)</span>
                    <span class="val worker-tag">${getCarWorkerDisplay(car)}</span>
                </div>

                <div class="car-info-row added-by-row" style="margin-top: 8px; font-size: 0.75rem; color: var(--text-muted); padding-top: 8px; border-top: 1px dotted var(--border-color);">
                    <span>Dodane przez: <strong style="color: var(--primary-green);">${car.addedBy || 'System'}</strong></span>
                </div>
                
                ${tasks.length > 0 ? `
                <div class="todo-list-preview">
                    <span class="label">Zadania Do Zrobienia (Kliknij aby odznaczyć):</span>
                    <ul class="todo-interactive-list">
                        ${tasks.map((task, idx) => `
                            <li class="todo-interactive-item ${task.done ? 'done' : ''}" data-car-id="${car.id}" data-idx="${idx}">
                                <div class="todo-check-box">
                                    <span>${task.done ? '✅' : '⏹️'}</span>
                                    <span>${task.text}</span>
                                </div>
                                ${task.done && task.doneBy ? `
                                    <span class="todo-done-info">Wykonane: ${task.doneBy}</span>
                                ` : ''}
                            </li>
                        `).join('')}
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

                <div style="margin-top: 8px;">
                    <button class="btn-secondary btn-quick-note" data-car-id="${car.id}" data-car-brand="${car.brand}" style="width: 100%; font-size: 0.78rem; padding: 6px 10px;">📝 Dodaj notatkę do tego auta</button>
                </div>

                ${!car.archived ? `
                <div class="status-actions">
                    <button class="btn-status ${status === 'przyjedzie' ? 'active' : ''}" data-id="${car.id}" data-status="przyjedzie">Przyjedzie</button>
                    <button class="btn-status ${status === 'w-trakcie' ? 'active' : ''}" data-id="${car.id}" data-status="w-trakcie">W trakcie</button>
                    <button class="btn-status ${status === 'gotowe' ? 'active' : ''}" data-id="${car.id}" data-status="gotowe">Gotowe</button>
                </div>
                <div style="margin-top: 12px; border-top: 1px dashed rgba(16, 185, 129, 0.2); padding-top: 12px;">
                    <button class="btn-status btn-archive" data-id="${car.id}" style="width: 100%; background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); color: var(--primary-green);">
                        📥 PRZENIEŚ DO ZREALIZOWANYCH
                    </button>
                </div>
                ` : ''}
            </div>
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
    document.querySelectorAll('.btn-quick-note').forEach(btn => {
        btn.onclick = () => {
            const cId = btn.dataset.carId;
            switchTab('notes');
            const noteFormBox = document.getElementById('new-note-form-box');
            if (noteFormBox) noteFormBox.style.display = 'block';
            const noteCarSelect = document.getElementById('note-car-select');
            if (noteCarSelect) {
                const activeCars = cars.filter(c => !c.archived);
                noteCarSelect.innerHTML = '<option value="">-- Powiąż z autem (opcjonalnie) --</option>' +
                    activeCars.map(c => `<option value="${c.id}">${c.brand} ${c.plateNum ? '(' + c.plateNum + ')' : ''}</option>`).join('');
                noteCarSelect.value = cId;
            }
        };
    });

    // Collapsible card header toggle for mobile screens
    document.querySelectorAll('.car-card.collapsible .car-card-header-toggle').forEach(header => {
        header.onclick = () => {
            if (window.innerWidth <= 768) {
                const card = header.closest('.car-card');
                card.classList.toggle('expanded');
            }
        };
    });

    // Interactive To-do Item Click Handlers
    document.querySelectorAll('.todo-interactive-item').forEach(item => {
        item.onclick = (e) => {
            e.stopPropagation();
            const carId = item.dataset.carId;
            const taskIdx = parseInt(item.dataset.idx, 10);
            toggleCarTask(carId, taskIdx);
        };
    });
}

// Locations (Stacje Robocze) Logic
function renderLocations() {
    if (!locationsSection) return;
    const isManager = canManageLocationsAndUsers(currentUser);
    const stations = ['Carport', 'Hala Główna', 'Hala Mała', 'Myjnia', 'Konserwacja'];
    const activeCars = cars.filter(c => !c.archived);

    stations.forEach(station => {
        const card = locationsSection.querySelector(`.location-card[data-station="${station}"]`);
        if (!card) return;

        // Setup drop target listeners once per card
        if (!card.dataset.dropTargetInit) {
            card.dataset.dropTargetInit = 'true';
            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                card.classList.add('drag-over');
            });
            card.addEventListener('dragleave', (e) => {
                if (!card.contains(e.relatedTarget)) {
                    card.classList.remove('drag-over');
                }
            });
            card.addEventListener('drop', async (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const carId = e.dataTransfer.getData('text/plain') || window.currentDraggedCarId;
                const fromStation = e.dataTransfer.getData('source-station') || window.currentDraggedFromStation;
                if (!carId) return;
                if (fromStation === station) return;

                const targetCar = cars.find(c => c.id === carId);
                const carLabel = targetCar ? targetCar.brand : 'Pojazd';

                try {
                    await updateDoc(doc(db, 'cars', carId), { location: station });
                    showToast(`Przeniesiono ${carLabel} do stacji: ${station}`, "success");
                    logAction(`${currentUser} przeniósł pojazd ${carLabel} ze stacji ${fromStation || 'Brak'} do: ${station}`);
                } catch (err) {
                    console.error("Błąd przenoszenia auta:", err);
                    showToast("Błąd przenoszenia pojazdu", "error");
                }
            });
        }

        const carsContainer = card.querySelector('.loc-cars-container');
        const countBadge = card.querySelector('.loc-count-badge');
        const adminControls = card.querySelector('.loc-admin-controls');
        const select = card.querySelector('.loc-assign-select');

        const stationCars = activeCars.filter(c => c.location === station);
        countBadge.textContent = `${stationCars.length} aut`;

        if (stationCars.length === 0) {
            carsContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.8rem; text-align:center; padding:10px; pointer-events:none;">Brak aut w tej stacji.<br><span style="font-size:0.72rem; opacity:0.7;">Przeciągnij tutaj auto</span></p>';
        } else {
            carsContainer.innerHTML = stationCars.map(car => `
                <div class="loc-car-chip" draggable="true" data-car-id="${car.id}" data-station="${station}">
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span class="loc-drag-handle" title="Przeciągnij do innej stacji">⋮⋮</span>
                        <div>
                            <div class="car-name">${car.brand}</div>
                            <div class="car-worker-tag">${car.plateNum ? car.plateNum + ' | ' : ''}Pracownicy: ${getCarWorkerDisplay(car)}</div>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px;">
                        <button class="loc-quick-move-btn" data-car-id="${car.id}" data-station="${station}" title="Przenieś do innej hali (⇄)">⇄</button>
                        ${isManager ? `
                            <button class="loc-remove-btn" data-car-id="${car.id}" title="Usuń z tej stacji">&times;</button>
                        ` : ''}
                    </div>
                </div>
            `).join('');
        }

        // Attach drag handlers to chips
        carsContainer.querySelectorAll('.loc-car-chip').forEach(chip => {
            chip.addEventListener('dragstart', (e) => {
                const carId = chip.dataset.carId;
                const srcStation = chip.dataset.station;
                e.dataTransfer.setData('text/plain', carId);
                e.dataTransfer.setData('source-station', srcStation);
                e.dataTransfer.effectAllowed = 'move';
                chip.classList.add('dragging');
                window.currentDraggedCarId = carId;
                window.currentDraggedFromStation = srcStation;
            });

            chip.addEventListener('dragend', () => {
                chip.classList.remove('dragging');
                window.currentDraggedCarId = null;
                window.currentDraggedFromStation = null;
                document.querySelectorAll('.location-card.drag-over').forEach(el => el.classList.remove('drag-over'));
            });
        });

        // Attach quick move handler
        carsContainer.querySelectorAll('.loc-quick-move-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                openStationPicker(btn.dataset.carId, btn.dataset.station);
            };
        });

        if (isManager) {
            adminControls.style.display = 'block';
            const unassignedCars = activeCars.filter(c => c.location !== station);
            select.innerHTML = `<option value="">+ Ustaw auto w: ${station}...</option>` +
                unassignedCars.map(c => `<option value="${c.id}">${c.brand} (${c.plateNum || 'brak tablic'}) ${c.location ? '[' + c.location + ']' : ''}</option>`).join('');

            select.onchange = async () => {
                const cId = select.value;
                if (!cId) return;
                try {
                    await updateDoc(doc(db, 'cars', cId), { location: station });
                    showToast(`Ustawiono auto w stacji: ${station}`, "success");
                    logAction(`${currentUser} ustawił auto w stacji: ${station}`);
                } catch (e) { showToast("Błąd ustawiania lokalizacji", "error"); }
            };
        } else {
            adminControls.style.display = 'none';
        }

        carsContainer.querySelectorAll('.loc-remove-btn').forEach(btn => {
            btn.onclick = async () => {
                const cId = btn.dataset.carId;
                try {
                    await updateDoc(doc(db, 'cars', cId), { location: 'Brak' });
                    showToast("Usunięto auto ze stacji roboczej.", "info");
                    logAction(`${currentUser} usunął auto ze stacji: ${station}`);
                } catch (e) { showToast("Błąd", "error"); }
            };
        });
    });
}

function openStationPicker(carId, currentStation) {
    const targetCar = cars.find(c => c.id === carId);
    if (!targetCar) return;

    document.getElementById('station-picker-modal')?.remove();

    const stations = ['Carport', 'Hala Główna', 'Hala Mała', 'Myjnia', 'Konserwacja'];
    const modal = document.createElement('div');
    modal.id = 'station-picker-modal';
    modal.style.cssText = 'position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,0.75); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; z-index:10000; padding:20px;';
    
    modal.innerHTML = `
        <div class="glass" style="max-width:380px; width:100%; padding:20px; border-radius:16px; background:#1e293b; border:1px solid rgba(255,255,255,0.15); box-shadow:0 12px 36px rgba(0,0,0,0.6);">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                <h4 style="margin:0; font-size:1.05rem; color:#fff;">📍 Przenieś pojazd</h4>
                <button id="close-station-picker" style="background:none; border:none; color:var(--text-muted); font-size:1.5rem; cursor:pointer; line-height:1;">&times;</button>
            </div>
            <p style="margin:0 0 14px 0; font-size:0.85rem; color:var(--text-muted);">
                <strong style="color:#fff;">${targetCar.brand}</strong> ${targetCar.plateNum ? '(' + targetCar.plateNum + ')' : ''}<br>
                Aktualnie: <span style="color:var(--primary-green); font-weight:600;">${currentStation || 'Brak'}</span>
            </p>
            <div style="display:flex; flex-direction:column; gap:8px;">
                ${stations.map(st => `
                    <button class="station-target-btn" data-st="${st}" style="padding:10px 14px; text-align:left; background:${st === currentStation ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.06)'}; border:1px solid ${st === currentStation ? 'var(--primary-green)' : 'rgba(255,255,255,0.1)'}; color:#fff; border-radius:8px; font-weight:500; cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:background 0.2s;">
                        <span>${st}</span>
                        ${st === currentStation ? '<span style="font-size:0.75rem; color:var(--primary-green);">Aktualna</span>' : '<span style="font-size:0.8rem; color:var(--text-muted);">Wybierz →</span>'}
                    </button>
                `).join('')}
                <button class="station-target-btn" data-st="Brak" style="padding:10px 14px; text-align:left; background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); color:#ef4444; border-radius:8px; font-weight:500; cursor:pointer; margin-top:4px;">
                    🚫 Usuń ze stacji (Brak lokalizacji)
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('#close-station-picker').onclick = () => modal.remove();
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.querySelectorAll('.station-target-btn').forEach(btn => {
        btn.onclick = async () => {
            const chosenStation = btn.dataset.st;
            modal.remove();
            if (chosenStation === currentStation) return;
            try {
                await updateDoc(doc(db, 'cars', carId), { location: chosenStation });
                showToast(chosenStation === 'Brak' ? 'Usunięto pojazd ze stacji roboczej.' : `Przeniesiono pojazd do: ${chosenStation}`, "success");
                logAction(`${currentUser} przeniósł pojazd ${targetCar.brand} z ${currentStation || 'brak'} do: ${chosenStation}`);
            } catch (err) {
                console.error("Błąd przenoszenia:", err);
                showToast("Błąd zmiany stacji", "error");
            }
        };
    });
}

// Notes Module Logic
function setupNotesModule() {
    const btnToggleForm = document.getElementById('btn-toggle-new-note-form');
    const noteFormBox = document.getElementById('new-note-form-box');
    const noteForm = document.getElementById('note-form');
    const btnCancelNote = document.getElementById('btn-cancel-note');
    const noteCarSelect = document.getElementById('note-car-select');
    const noteWorkerSelect = document.getElementById('note-worker-select');

    if (btnToggleForm && noteFormBox) {
        btnToggleForm.onclick = () => {
            noteFormBox.style.display = noteFormBox.style.display === 'none' ? 'block' : 'none';
            if (noteCarSelect) {
                const activeCars = cars.filter(c => !c.archived);
                noteCarSelect.innerHTML = '<option value="">-- Powiąż z autem (opcjonalnie) --</option>' +
                    activeCars.map(c => `<option value="${c.id}">${c.brand} ${c.plateNum ? '(' + c.plateNum + ')' : ''}</option>`).join('');
            }
            populateNoteWorkerSelect();
        };
    }

    if (btnCancelNote && noteFormBox) {
        btnCancelNote.onclick = () => noteFormBox.style.display = 'none';
    }

    if (noteForm) {
        noteForm.onsubmit = async (e) => {
            e.preventDefault();
            const content = document.getElementById('note-content').value.trim();
            const priority = document.getElementById('note-priority').checked;
            const carId = noteCarSelect ? noteCarSelect.value : '';
            const selectedCar = cars.find(c => c.id === carId);
            const workerName = noteWorkerSelect ? noteWorkerSelect.value : '';

            if (!content) return;

            try {
                await addDoc(notesCol, {
                    content: content,
                    priority: priority,
                    author: currentUser || 'Gość',
                    carId: carId || '',
                    carBrand: selectedCar ? selectedCar.brand : '',
                    workerName: workerName || '',
                    createdAt: new Date().toISOString()
                });
                showToast("Dodano nową notatkę!", "success");
                logAction(`Użytkownik ${currentUser} dodał notatkę`);
                noteForm.reset();
                if (noteFormBox) noteFormBox.style.display = 'none';
            } catch (err) {
                showToast("Błąd dodawania notatki", "error");
            }
        };
    }
}

function renderNotes() {
    const notesGrid = document.getElementById('notes-grid');
    if (!notesGrid) return;

    if (notes.length === 0) {
        notesGrid.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:2rem; grid-column:1/-1;">Brak aktywnych notatek. Kliknij "➕ Nowa Notatka", aby dodać wpis.</p>';
        return;
    }

    notesGrid.innerHTML = notes.map(n => {
        const canDelete = canManageLocationsAndUsers(currentUser) || currentUser === n.author;
        const dateStr = new Date(n.createdAt).toLocaleString('pl-PL');
        return `
            <div class="note-card ${n.priority ? 'priority-high' : ''}">
                <div class="note-header">
                    <span class="note-author">✍️ ${n.author}</span>
                    ${n.priority ? '<span class="note-priority-badge">⚡ Wysoki Priorytet</span>' : ''}
                </div>
                ${n.carBrand ? `<div class="note-car-tag">🏎️ Auto: ${n.carBrand}</div>` : ''}
                ${n.workerName ? `<div class="note-worker-tag" style="font-size:0.8rem; color:var(--primary-green); font-weight:600; margin-top:4px;">👤 Powiązany Pracownik: ${n.workerName}</div>` : ''}
                <div class="note-body" style="margin-top:6px;">${n.content}</div>
                <div class="note-footer">
                    <span>⏱️ ${dateStr}</span>
                    ${canDelete ? `<button class="btn-icon btn-delete-note" data-id="${n.id}" style="color:#ef4444; font-size:1.2rem;" title="Usuń i przenieś do trwałego archiwum">&times;</button>` : ''}
                </div>
            </div>
        `;
    }).join('');

    notesGrid.querySelectorAll('.btn-delete-note').forEach(btn => {
        btn.onclick = async () => {
            const nId = btn.dataset.id;
            const noteObj = notes.find(n => n.id === nId);
            if (!noteObj) return;

            const confirmed = await showConfirm("Czy na pewno chcesz usunąć tę notatkę? Zostanie zarchiwizowana w serwerowym rejestrze.", "USUŃ", "ANULUJ", true);
            if (confirmed) {
                try {
                    await addDoc(archivedNotesCol, {
                        ...noteObj,
                        deletedBy: currentUser || 'Admin',
                        deletedAt: new Date().toISOString()
                    });
                    await deleteDoc(doc(db, 'notes', nId));
                    showToast("Notatka usunięta i zarchiwizowana!", "success");
                    logAction(`Usunięto notatkę przez ${currentUser}`);
                } catch (e) { showToast("Błąd usuwania notatki", "error"); }
            }
        };
    });
}

function renderArchivedNotesList() {
    const listEl = document.getElementById('archived-notes-list');
    if (!listEl) return;

    if (archivedNotes.length === 0) {
        listEl.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">Brak usuniętych notatek w archiwum.</p>';
        return;
    }

    listEl.innerHTML = archivedNotes.map(n => `
        <div style="background:rgba(255,255,255,0.03); padding:8px 12px; border-radius:8px; border:1px solid var(--border-color); font-size:0.85rem;">
            <div style="display:flex; justify-content:space-between; color:var(--text-muted); font-size:0.75rem; margin-bottom:4px;">
                <span>Autor: <strong style="color:var(--primary-green);">${n.author}</strong> ${n.priority ? '⚡ Priorytet' : ''}</span>
                <span>Usunął: <strong>${n.deletedBy || 'Admin'}</strong> (${new Date(n.deletedAt).toLocaleDateString('pl-PL')})</span>
            </div>
            <div>${n.content}</div>
        </div>
    `).join('');
}

// Trash Duty Module
function renderTrashSchedule() {
    if (!trashSection) return;
    const isManager = canManageLocationsAndUsers(currentUser);
    const randomizeBtn = document.getElementById('btn-randomize-trash');
    if (randomizeBtn) randomizeBtn.style.display = isManager ? 'block' : 'none';

    const activeTrashWorkers = getTrashWorkerNames();
    const availableWorkers = activeTrashWorkers.length > 0 ? activeTrashWorkers : ['Adam', 'Łukasz', 'Nastka'];

    // Sanitize any existing schedule entry that mentions Michał or deleted users
    let sanitized = false;
    if (trashSchedule && trashSchedule.length > 0) {
        trashSchedule.forEach(item => {
            if (item.worker && (item.worker.toLowerCase() === 'michal' || item.worker.toLowerCase() === 'michał' || deletedUsers.includes(item.worker.toLowerCase()))) {
                item.worker = availableWorkers[Math.floor(Math.random() * availableWorkers.length)];
                sanitized = true;
            }
        });
        if (sanitized) {
            try {
                setDoc(doc(db, 'settings', 'trash_schedule_doc'), {
                    schedule: trashSchedule,
                    updatedAt: new Date().toISOString(),
                    updatedBy: 'System'
                });
            } catch (e) { console.error("Trash sanitize update error", e); }
        }
    }

    if (trashSchedule.length === 0) {
        const now = new Date();
        trashSchedule = [0, 1, 2, 3].map(i => {
            const startDate = new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000);
            const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
            return {
                weekIndex: i,
                worker: availableWorkers[i % availableWorkers.length],
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0]
            };
        });
    }

    const currentWeekItem = trashSchedule[0] || { worker: 'Nieprzypisany', startDate: '', endDate: '' };

    const dutyAvatarEl = document.getElementById('trash-duty-avatar');
    const dutyNameEl = document.getElementById('trash-duty-name');
    const dutyDateRangeEl = document.getElementById('trash-duty-date-range');
    const scheduleListEl = document.getElementById('trash-schedule-list');

    if (dutyAvatarEl) dutyAvatarEl.textContent = (currentWeekItem.worker || '?').charAt(0).toUpperCase();
    if (dutyNameEl) dutyNameEl.textContent = currentWeekItem.worker || 'Nieprzypisany';
    if (dutyDateRangeEl) dutyDateRangeEl.textContent = `Obecny Tydzień (${currentWeekItem.startDate || '---'})`;

    if (scheduleListEl) {
        scheduleListEl.innerHTML = trashSchedule.map((item, idx) => `
            <div class="trash-schedule-item ${idx === 0 ? 'current-week' : ''}">
                <span class="trash-week-label">${idx === 0 ? '👉 Tydzień 1 (Obecny)' : `Tydzień ${idx + 1}`} (${item.startDate || '---'})</span>
                <span class="trash-person-name">🧹 ${item.worker}</span>
            </div>
        `).join('');
    }

    if (randomizeBtn) {
        randomizeBtn.onclick = async () => {
            const confirmed = await showConfirm("Czy chcesz wylosować nowy grafik wywozu śmieci na najbliższe 4 tygodnie?", "LOSUJ", "ANULUJ", false);
            if (confirmed) {
                const freshWorkers = getTrashWorkerNames();
                const pool = freshWorkers.length > 0 ? freshWorkers : ['Adam', 'Łukasz', 'Nastka'];
                const shuffled = [...pool].sort(() => Math.random() - 0.5);
                const now = new Date();
                const newSchedule = [0, 1, 2, 3].map(i => {
                    const startDate = new Date(now.getTime() + i * 7 * 24 * 60 * 60 * 1000);
                    const endDate = new Date(startDate.getTime() + 6 * 24 * 60 * 60 * 1000);
                    return {
                        weekIndex: i,
                        worker: shuffled[i % shuffled.length],
                        startDate: startDate.toISOString().split('T')[0],
                        endDate: endDate.toISOString().split('T')[0]
                    };
                });
                try {
                    await setDoc(doc(db, 'settings', 'trash_schedule_doc'), {
                        schedule: newSchedule,
                        updatedAt: new Date().toISOString(),
                        updatedBy: currentUser
                    });
                    trashSchedule = newSchedule;
                    renderTrashSchedule();
                    showToast("Wylosowano nowy grafik śmieci!", "success");
                    logAction(`Wylosowano nowy grafik śmieci przez ${currentUser}`);
                } catch (e) { showToast("Błąd zapisu grafiku", "error"); }
            }
        };
    }
}

// Account Creation Logic for Tomek & Admin
function setupAccountCreation() {
    const accountBox = document.getElementById('account-creation-box');
    const form = document.getElementById('create-account-form');
    if (!accountBox || !form) return;

    if (canManageLocationsAndUsers(currentUser)) {
        accountBox.style.display = 'block';
    } else {
        accountBox.style.display = 'none';
    }

    form.onsubmit = async (e) => {
        e.preventDefault();
        const username = document.getElementById('new-acc-username').value.trim();
        const role = document.getElementById('new-acc-role').value;
        const password = document.getElementById('new-acc-password').value.trim();

        if (!username || !password) {
            showToast("Wypełnij wszystkie pola konta!", "error");
            return;
        }

        const canonical = username.toLowerCase();
        try {
            await setDoc(doc(db, 'users', canonical), {
                username: username,
                role: role,
                createdAt: new Date().toISOString(),
                createdBy: currentUser
            });
            await setDoc(doc(db, 'settings', canonical + '_pass'), {
                password: password,
                updatedAt: new Date().toISOString(),
                updatedBy: currentUser
            });
            showToast(`Stworzono nowe konto: ${username} (${role === 'owner' ? 'Właściciel' : 'Pracownik'})!`, "success");
            logAction(`${currentUser} stworzył konto użytkownika: ${username}`);
            form.reset();
            populateWorkerSelects();
            populateNoteWorkerSelect();
            renderTrashSchedule();
            loadAdminData();
        } catch (err) {
            showToast("Błąd tworzenia konta", "error");
        }
    };
}

// Toggle Task Completion & Send Notification to Owners
async function toggleCarTask(carId, taskIndex) {
    const car = cars.find(c => c.id === carId);
    if (!car) return;

    let tasks = [];
    if (car.todoTasks && Array.isArray(car.todoTasks)) {
        tasks = [...car.todoTasks];
    } else if (car.todo && Array.isArray(car.todo)) {
        tasks = car.todo.map(t => typeof t === 'string' ? { text: t, done: false } : { ...t });
    }

    if (!tasks[taskIndex]) return;

    const task = tasks[taskIndex];
    const newDone = !task.done;
    task.done = newDone;

    if (newDone) {
        task.doneBy = currentUser || 'Pracownik';
        task.doneAt = new Date().toISOString();

        // Create Real-time Notification for Owners
        try {
            await addDoc(notificationsCol, {
                text: `Pracownik ${currentUser || 'Pracownik'} ukończył zadanie "${task.text}" w aucie ${car.brand}${car.plateNum ? ' (' + car.plateNum + ')' : ''}`,
                carId: car.id,
                carBrand: car.brand,
                taskText: task.text,
                worker: currentUser || 'Pracownik',
                timestamp: new Date().toISOString(),
                read: false
            });
            logAction(`Pracownik ${currentUser} ukończył zadanie: ${task.text} (${car.brand})`);
            showToast(`Odznaczono zadanie: "${task.text}" jako wykonane!`, "success");
        } catch (e) {
            console.error("Notif error", e);
        }
    } else {
        delete task.doneBy;
        delete task.doneAt;
        showToast(`Cofnięto wykonanie zadania "${task.text}".`, "info");
    }

    try {
        await updateDoc(doc(db, 'cars', carId), {
            todoTasks: tasks,
            todo: tasks.map(t => t.text) // Keep string array todo synced
        });
    } catch (e) {
        showToast("Błąd aktualizacji zadania", "error");
    }
}

async function archiveCar(id) {
    const car = cars.find(c => c.id === id);
    const confirmed = await showConfirm(
        `Czy na pewno chcesz przenieść auto ${car ? car.brand : ''} do zrealizowanych?`,
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
            showToast("Przeniesiono auto do zrealizowanych", "success");
            logAction(`Przeniesiono auto do zrealizowanych: ${car ? car.brand : 'nieznane'}`);
        } catch (error) {
            showToast("Błąd podczas przenoszenia", "error");
        }
    }
}

async function updateCarStatus(id, newStatus) {
    try {
        const car = cars.find(c => c.id === id);
        const updates = {
            status: newStatus,
            statusChangeDate: new Date().toISOString()
        };
        if (newStatus === 'gotowe') {
            updates.readyAt = new Date().toISOString();
        } else {
            updates.readyAt = null;
        }
        await updateDoc(doc(db, 'cars', id), updates);
        showToast(`Zmieniono status na: ${newStatus}`, 'success');
        logAction(`Zmiana statusu auta ${car ? car.brand : ''} na: ${newStatus}`);
    } catch (e) {
        showToast("Błąd przy zmianie statusu", "error");
    }
}

function updateCountdowns() {
    document.querySelectorAll('.countdown-timer').forEach(el => {
        const pickupStr = el.dataset.pickup;
        if (!pickupStr) return;

        let targetTimeStr = '23:59:59';
        if (el.dataset.time && el.dataset.time.trim() !== '') {
            const t = el.dataset.time.trim();
            if (/^\d{1,2}:\d{2}$/.test(t)) {
                const parts = t.split(':');
                targetTimeStr = `${parts[0].padStart(2, '0')}:${parts[1]}:00`;
            } else if (/^\d{1,2}$/.test(t)) {
                targetTimeStr = `${t.padStart(2, '0')}:00:00`;
            } else if (/^\d{1,2}:\d{2}:\d{2}$/.test(t)) {
                const parts = t.split(':');
                targetTimeStr = `${parts[0].padStart(2, '0')}:${parts[1]}:${parts[2]}`;
            }
        }
        const pickupDate = new Date(`${pickupStr}T${targetTimeStr}`);
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

function updateStats() {
    const activeCars = cars.filter(c => !c.archived);
    totalCarsEl.textContent = activeCars.length;
    const totalValue = activeCars.reduce((sum, car) => sum + parseFloat(car.price || 0), 0);
    totalValueEl.textContent = formatCurrency(totalValue);

    totalValueEl.parentElement.classList.add('price-blur-target');
    archiveTotalValueEl.parentElement.classList.add('price-blur-target');

    const valLabel = document.querySelector('.stats-overview .stat-card:last-child .label');
    if (valLabel) valLabel.textContent = 'Aktywna Wartość Usług';
}

function formatCurrency(val) {
    return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(val);
}

// Modal Actions & Triggers
addCarBtn.addEventListener('click', () => {
    if (!canAddCars(currentUser)) {
        showToast("Brak uprawnień do dodawania nowych aut!", "error");
        return;
    }
    modalTitle.textContent = 'Dodaj Nowy Samochód';
    carForm.reset();
    populateWorkerSelects();
    document.getElementById('car-id').value = '';
    document.getElementById('car-service-name').value = '';
    document.getElementById('car-visit-type').value = 'usluga';
    document.querySelectorAll('input[name="todo"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('input[name="car-worker-cb"]').forEach(cb => cb.checked = false);
    document.getElementById('car-priority').checked = false;
    customTodos = [];
    renderCustomTodosInForm();
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
    if (event.target === notifModal) notifModal.classList.remove('active');
    if (event.target === calDayModal) calDayModal.classList.remove('active');
    if (event.target === pwaModal) pwaModal.classList.remove('active');
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

function renderCustomTodosInForm() {
    if (!customTodosList) return;
    customTodosList.innerHTML = customTodos.map((t, idx) => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:6px; font-size:0.85rem;">
            <span>➕ ${t.text}</span>
            <button type="button" class="btn-remove-custom-todo" data-idx="${idx}" style="background:none; border:none; color:#ff4b2b; cursor:pointer;">&times;</button>
        </div>
    `).join('');

    customTodosList.querySelectorAll('.btn-remove-custom-todo').forEach(btn => {
        btn.onclick = () => {
            const i = parseInt(btn.dataset.idx, 10);
            customTodos.splice(i, 1);
            renderCustomTodosInForm();
        };
    });
}

carForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('car-id').value;
    if (!id && !canAddCars(currentUser)) {
        showToast("Brak uprawnień do dodawania nowych aut!", "error");
        return;
    }
    const serviceName = document.getElementById('car-service-name').value.trim();
    const visitType = document.getElementById('car-visit-type').value || 'usluga';

    const todoCheckboxes = document.querySelectorAll('input[name="todo"]:checked');
    const checkedTodos = Array.from(todoCheckboxes).map(cb => ({ text: cb.value, done: false }));
    
    // Merge custom service name if entered
    if (serviceName) {
        checkedTodos.unshift({ text: "Usługa: " + serviceName, done: false, isPrimaryService: true });
    }

    // Merge predefined checked todos and custom added todos
    const combinedTodos = [...checkedTodos, ...customTodos];

    const selectedWorkerCbs = document.querySelectorAll('input[name="car-worker-cb"]:checked');
    const assignedWorkersArr = Array.from(selectedWorkerCbs).map(cb => cb.value);
    const assignedWorkersStr = assignedWorkersArr.join(', ');

    const carData = {
        brand: document.getElementById('car-brand').value,
        plateNum: document.getElementById('car-plate').value,
        price: parseFloat(document.getElementById('car-price').value) || 0,
        ownerName: document.getElementById('car-owner-name').value || '',
        ownerPhone: document.getElementById('car-owner-phone').value || '',
        history: document.getElementById('car-history').value || '',
        location: document.getElementById('car-location') ? document.getElementById('car-location').value : 'Brak',
        workers: assignedWorkersArr,
        worker: assignedWorkersStr,
        arrivalDate: document.getElementById('car-arrival-date').value,
        arrivalTime: document.getElementById('car-arrival-time') ? document.getElementById('car-arrival-time').value : '',
        pickupDate: document.getElementById('car-pickup-date').value,
        pickupTime: document.getElementById('car-pickup-time') ? document.getElementById('car-pickup-time').value : '',
        serviceName: serviceName,
        visitType: visitType,
        todoTasks: combinedTodos,
        todo: combinedTodos.map(t => t.text),
        priority: document.getElementById('car-priority').checked,
        archived: id ? (cars.find(c => c.id === id).archived || false) : false,
        status: id ? (cars.find(c => c.id === id).status || 'przyjedzie') : 'przyjedzie',
        dateAdded: id ? cars.find(c => c.id === id).dateAdded : new Date().toISOString(),
        addedBy: id ? (cars.find(c => c.id === id).addedBy || currentUser) : currentUser
    };

    try {
        if (id) {
            await updateDoc(doc(db, 'cars', id), carData);
            showToast("Zaktualizowano dane auta", "success");
            logAction(`Edytowano auto: ${carData.brand}`);
        } else {
            const newCarRef = await addDoc(carsCol, carData);
            showToast("Dodano nowe auto", "success");
            logAction(`Dodano nowe auto: ${carData.brand}`);

            // Send notification record for Owners
            const typeLabel = visitType === 'ogledziny' ? 'na oględziny' : 'na usługę';
            const notifMsg = `🏎️ ${currentUser || 'Pracownik'} dodał nowe auto ${typeLabel}: ${carData.brand}${carData.plateNum ? ' (' + carData.plateNum + ')' : ''}`;
            try {
                await addDoc(notificationsCol, {
                    text: notifMsg,
                    carId: newCarRef.id,
                    carBrand: carData.brand,
                    worker: currentUser || 'Pracownik',
                    type: 'car_added',
                    timestamp: new Date().toISOString(),
                    read: false
                });
            } catch (e) { console.error("Car add notif error", e); }

            // Trigger system push notification for Owners
            sendSystemPushNotification("🏎️ Nowe Auto w Systemie EcoCarPro", notifMsg);
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
        document.getElementById('car-owner-phone').value = car.ownerPhone || '';
        document.getElementById('car-history').value = car.history || '';
        if (document.getElementById('car-location')) {
            document.getElementById('car-location').value = car.location || 'Brak';
        }
        document.getElementById('car-arrival-date').value = car.arrivalDate || '';
        document.getElementById('car-arrival-time').value = car.arrivalTime || '';
        document.getElementById('car-pickup-date').value = car.pickupDate || '';
        document.getElementById('car-pickup-time').value = car.pickupTime || '';
        document.getElementById('car-service-name').value = car.serviceName || '';
        document.getElementById('car-visit-type').value = car.visitType || 'usluga';
        document.getElementById('car-priority').checked = car.priority || false;

        // Populate and check assigned worker checkboxes
        populateWorkerSelects();
        const assignedWorkers = car.workers || (car.worker ? car.worker.split(',').map(s => s.trim()) : []);
        document.querySelectorAll('input[name="car-worker-cb"]').forEach(cb => {
            cb.checked = assignedWorkers.includes(cb.value);
        });

        // Reset and set checkboxes
        const carTodoTexts = (car.todoTasks ? car.todoTasks.map(t => t.text) : (car.todo || []));
        document.querySelectorAll('input[name="todo"]').forEach(cb => {
            cb.checked = carTodoTexts.includes(cb.value);
        });

        // Custom todos
        const standardTodos = ['Konserwacja podwozia', 'Ceramika', 'Czyszczenie środka', 'Korekta lakieru', 'Pranie tapicerki', 'Folie klamki', 'Folie bagażnik', 'Folie progi'];
        customTodos = (car.todoTasks || []).filter(t => !standardTodos.includes(t.text) && !t.isPrimaryService);
        renderCustomTodosInForm();

        carModal.classList.add('active');
    }
}

// Ukrainian Language & Translation Support
let currentLang = localStorage.getItem('ecoCarLang') || 'pl';

function applyLanguage(lang) {
    currentLang = lang;
    localStorage.setItem('ecoCarLang', lang);
    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
        langBtn.textContent = lang === 'ua' ? '🇺🇦 UA' : '🇵🇱 PL';
    }
    if (lang === 'ua') {
        document.body.classList.add('lang-ua');
        translateDOM();
    } else {
        document.body.classList.remove('lang-ua');
        translateDOM();
    }
}

function translateDOM() {
    if (currentLang !== 'ua') {
        if (viewArchiveBtn) viewArchiveBtn.innerHTML = '📦 Zrealizowane';
        const mobArchiveLabel = document.querySelector('#mob-nav-archive .mob-label');
        if (mobArchiveLabel) mobArchiveLabel.textContent = 'Zrealizowane';
        return;
    }

    if (viewActiveBtn) viewActiveBtn.innerHTML = '🏎️ Активні';
    if (viewLocationsBtn) viewLocationsBtn.innerHTML = '📍 Місце';
    if (viewCalendarBtn) viewCalendarBtn.innerHTML = '📅 Календар';
    if (viewNotesBtn) viewNotesBtn.innerHTML = '📝 Нотатки';
    if (viewTrashBtn) viewTrashBtn.innerHTML = '🗑️ Сміття';
    if (viewArchiveBtn) viewArchiveBtn.innerHTML = '📦 Завершені';
    if (viewAdminBtn) viewAdminBtn.innerHTML = '👑 Панель Адмін';
    if (addCarBtn) addCarBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg> Додати авто';

    const mobActiveLabel = document.querySelector('#mob-nav-active .mob-label');
    if (mobActiveLabel) mobActiveLabel.textContent = 'Активні';
    const mobLocLabel = document.querySelector('#mob-nav-locations .mob-label');
    if (mobLocLabel) mobLocLabel.textContent = 'Місце';
    const mobCalLabel = document.querySelector('#mob-nav-calendar .mob-label');
    if (mobCalLabel) mobCalLabel.textContent = 'Календар';
    const mobNotesLabel = document.querySelector('#mob-nav-notes .mob-label');
    if (mobNotesLabel) mobNotesLabel.textContent = 'Нотатки';
    const mobTrashLabel = document.querySelector('#mob-nav-trash .mob-label');
    if (mobTrashLabel) mobTrashLabel.textContent = 'Сміття';
    const mobArchiveLabel = document.querySelector('#mob-nav-archive .mob-label');
    if (mobArchiveLabel) mobArchiveLabel.textContent = 'Завершені';

    if (searchInput) searchInput.placeholder = 'Шукати марку, номер реєстрації, клієнта або працівника...';

    const statLabels = document.querySelectorAll('.stats-overview .stat-card .label');
    if (statLabels[0]) statLabels[0].textContent = 'Автомобілі';
    if (statLabels[1]) statLabels[1].textContent = 'Активна вартість послуг';

    document.querySelectorAll('.car-card').forEach(card => {
        const quickNoteBtn = card.querySelector('.btn-quick-note');
        if (quickNoteBtn) quickNoteBtn.textContent = '📝 Додати нотатку до цього авто';

        const archiveBtn = card.querySelector('.btn-archive');
        if (archiveBtn) archiveBtn.textContent = '📥 ПЕРЕНЕСТИ В ЗАВЕРШЕНІ';

        card.querySelectorAll('.car-info-row .label').forEach(lbl => {
            const txt = lbl.textContent.trim();
            if (txt.includes('Właściciel Auta')) lbl.textContent = 'Власник авто';
            if (txt.includes('Pracownik')) lbl.textContent = 'Працівник(и)';
            if (txt.includes('Wartość Usługi')) lbl.textContent = 'Вартість послуги';
            if (txt.includes('Status')) lbl.textContent = 'Статус';
        });

        const addedBySpan = card.querySelector('.added-by-row span');
        if (addedBySpan && addedBySpan.innerHTML.includes('Dodane przez:')) {
            addedBySpan.innerHTML = addedBySpan.innerHTML.replace('Dodane przez:', 'Додано:');
        }

        const todoLabel = card.querySelector('.todo-list-preview .label');
        if (todoLabel) todoLabel.textContent = 'Завдання (Натисніть, щоб відмітити):';

        const historyHeader = card.querySelector('.car-history-preview strong');
        if (historyHeader && historyHeader.textContent.includes('Uwagi')) {
            historyHeader.textContent = 'Примітки:';
        }
        const historyP = card.querySelector('.car-history-preview p');
        if (historyP && historyP.innerHTML.includes('Brak uwag')) {
            historyP.innerHTML = historyP.innerHTML.replace('Brak uwag', 'Немає приміток');
        }

        card.querySelectorAll('.btn-status').forEach(btn => {
            const st = btn.getAttribute('data-status');
            if (st === 'przyjedzie') btn.textContent = 'Приїде';
            if (st === 'w-trakcie') btn.textContent = 'В процесі';
            if (st === 'oczekuje') btn.textContent = 'Очікує';
            if (st === 'gotowe') btn.textContent = 'Готово';
            if (st === 'wydano') btn.textContent = 'Видано';
        });

        card.querySelectorAll('.status-pill-small, .worker-other-badge').forEach(pill => {
            const txt = pill.textContent.trim().toLowerCase();
            if (txt === 'przyjedzie') pill.textContent = 'Приїде';
            else if (txt === 'w-trakcie') pill.textContent = 'В процесі';
            else if (txt === 'oczekuje') pill.textContent = 'Очікує';
            else if (txt === 'gotowe') pill.textContent = 'Готово';
            else if (txt === 'wydano') pill.textContent = 'Видано';
        });

        const arrTag = card.querySelector('.arrival-date-tag');
        if (arrTag && arrTag.textContent.includes('Przyjazd:')) {
            arrTag.textContent = arrTag.textContent.replace('Przyjazd:', 'Приїзд:');
        }
        const picTag = card.querySelector('.pickup-date-tag');
        if (picTag && picTag.textContent.includes('Odbiór:')) {
            picTag.textContent = picTag.textContent.replace('Odbiór:', 'Видача:');
        }
    });

    const noteAddTitle = document.querySelector('#notes-view h3');
    if (noteAddTitle && noteAddTitle.textContent.includes('Dodaj nową notatkę')) {
        noteAddTitle.textContent = 'Додати нову нотатку';
    }
}

function setupLanguageToggle() {
    const langBtn = document.getElementById('lang-toggle-btn');
    if (langBtn) {
        langBtn.onclick = () => {
            const nextLang = currentLang === 'pl' ? 'ua' : 'pl';
            applyLanguage(nextLang);
            showToast(nextLang === 'ua' ? 'Переключено на українську мову 🇺🇦' : 'Przełączono na język polski 🇵🇱', 'info');
        };
    }
}

// Dynamic Main Service Categories
let serviceCategories = [
    'Konserwacja podwozia',
    'Ceramika / Powłoka ochronna',
    'Czyszczenie środka / Detailing wnętrza',
    'Korekta lakieru / Polerowanie',
    'Pranie tapicerki',
    'Folie ochronne PPF (Klamki, Progi, Bagażnik)',
    'Przygotowanie do sprzedaży',
    'Oględziny / Wycena'
];

function listenServiceCategories() {
    const catRef = doc(db, 'settings', 'service_categories_doc');
    onSnapshot(catRef, (snap) => {
        if (snap.exists() && snap.data().categories) {
            const savedCats = snap.data().categories;
            serviceCategories = Array.from(new Set([...serviceCategories, ...savedCats]));
        }
        populateServiceCategoryDropdown();
    });
}

function populateServiceCategoryDropdown() {
    const select = document.getElementById('car-service-category');
    if (!select) return;
    const currentVal = select.value;
    select.innerHTML = '<option value="">-- Wybierz kategorię główną --</option>' +
        serviceCategories.map(c => `<option value="${c}">${c}</option>`).join('');
    if (currentVal) select.value = currentVal;
}

function setupAddServiceCategory() {
    const btn = document.getElementById('btn-add-service-cat');
    if (!btn) return;
    btn.onclick = async () => {
        if (!canManageLocationsAndUsers(currentUser)) {
            showToast("Tylko Admin i Tomek mogą dodawać nowe kategorie usług!", "error");
            return;
        }
        const newCat = prompt("Wpisz nazwę nowej kategorii głównej (zostanie zapisana na stałe w aplikacji):");
        if (newCat && newCat.trim() !== '') {
            const cleanCat = newCat.trim();
            if (!serviceCategories.includes(cleanCat)) {
                serviceCategories.push(cleanCat);
                try {
                    const catRef = doc(db, 'settings', 'service_categories_doc');
                    await setDoc(catRef, { categories: serviceCategories, updatedAt: new Date().toISOString() }, { merge: true });
                    showToast(`Dodano i zapisano na stałe kategorię: ${cleanCat}`, "success");
                    logAction(`${currentUser} dodał nową kategorię usługi: ${cleanCat}`);
                    populateServiceCategoryDropdown();
                    const select = document.getElementById('car-service-category');
                    if (select) select.value = cleanCat;
                } catch (e) { showToast("Błąd zapisu kategorii", "error"); }
            }
        }
    };
}

// Signature Canvas & Report Protocol Generator
function loadCompanyDetails() {
    const saved = localStorage.getItem('ecoCarCompanyDetails');
    if (saved) {
        try {
            const details = JSON.parse(saved);
            if (document.getElementById('company-name')) document.getElementById('company-name').value = details.name || '';
            if (document.getElementById('company-nip')) document.getElementById('company-nip').value = details.nip || '';
            if (document.getElementById('company-address')) document.getElementById('company-address').value = details.address || '';
            if (document.getElementById('company-phone')) document.getElementById('company-phone').value = details.phone || '';
        } catch (e) {}
    }
}

function saveCompanyDetails() {
    const details = {
        name: document.getElementById('company-name') ? document.getElementById('company-name').value : '',
        nip: document.getElementById('company-nip') ? document.getElementById('company-nip').value : '',
        address: document.getElementById('company-address') ? document.getElementById('company-address').value : '',
        phone: document.getElementById('company-phone') ? document.getElementById('company-phone').value : ''
    };
    localStorage.setItem('ecoCarCompanyDetails', JSON.stringify(details));
}

function setupSignatureCanvas(canvasId, clearBtnId) {
    const canvas = document.getElementById(canvasId);
    const clearBtn = document.getElementById(clearBtnId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    let drawing = false;

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return {
            x: (clientX - rect.left) * (canvas.width / rect.width),
            y: (clientY - rect.top) * (canvas.height / rect.height)
        };
    };

    const startDraw = (e) => {
        drawing = true;
        ctx.beginPath();
        const pos = getPos(e);
        ctx.moveTo(pos.x, pos.y);
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#000';
    };

    const draw = (e) => {
        if (!drawing) return;
        e.preventDefault();
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
    };

    const stopDraw = () => { drawing = false; };

    canvas.onmousedown = startDraw;
    canvas.onmousemove = draw;
    canvas.onmouseup = stopDraw;
    canvas.ontouchstart = startDraw;
    canvas.ontouchmove = draw;
    canvas.ontouchend = stopDraw;

    if (clearBtn) {
        clearBtn.onclick = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        };
    }
}

function openReportModal(id) {
    if (currentUser === 'Monia') {
        showToast("Tylko Admin i Tomek posiadają uprawnienia do tworzenia raportów.", "error");
        return;
    }

    reportCarIdInput.value = id;
    reportForm.reset();
    loadCompanyDetails();
    setupSignatureCanvas('client-sig-canvas', 'btn-clear-client-sig');
    setupSignatureCanvas('owner-sig-canvas', 'btn-clear-owner-sig');

    const car = cars.find(c => c.id === id);
    if (car && document.getElementById('report-notes')) {
        document.getElementById('report-notes').value = `Wykonano usługę dla pojazdu ${car.brand} (${car.plateNum || 'brak tablic'}). Przeprowadzono inspekcję końcową oraz prace detailingowe zgodnie ze zleceniem.`;
    }

    reportModal.classList.add('active');
}

function setupReportForm() {
    if (!reportForm) return;

    reportForm.onsubmit = (e) => {
        e.preventDefault();
        saveCompanyDetails();

        const carId = reportCarIdInput.value;
        const car = cars.find(c => c.id === carId);

        const compName = document.getElementById('company-name').value || 'EcoCarPro Studio';
        const compNip = document.getElementById('company-nip').value || '---';
        const compAddress = document.getElementById('company-address').value || '---';
        const compPhone = document.getElementById('company-phone').value || '---';

        const hours = document.getElementById('report-hours').value || '---';
        const notes = document.getElementById('report-notes').value || 'Brak opisu.';

        const clientCanvas = document.getElementById('client-sig-canvas');
        const ownerCanvas = document.getElementById('owner-sig-canvas');
        const clientSigImg = clientCanvas ? clientCanvas.toDataURL() : '';
        const ownerSigImg = ownerCanvas ? ownerCanvas.toDataURL() : '';

        const printWin = window.open('', '_blank');
        if (!printWin) {
            showToast("Zezwól na wyskakujące okienka (Pop-up), aby pobrać/wydrukować Protokół!", "error");
            return;
        }

        const dateNow = new Date().toLocaleString('pl-PL');

        printWin.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Protokół Odbioru / Wykonania Usługi - ${car ? car.brand : 'EcoCarPro'}</title>
                <style>
                    body { font-family: Arial, sans-serif; padding: 25px; color: #111; line-height: 1.5; }
                    .header-table { width: 100%; border-bottom: 2px solid #10b981; padding-bottom: 15px; margin-bottom: 20px; }
                    .company-box { text-align: right; font-size: 0.9rem; }
                    .title { font-size: 1.6rem; font-weight: bold; color: #10b981; margin: 0; }
                    .section { margin-bottom: 20px; padding: 12px; border: 1px solid #ddd; border-radius: 8px; }
                    .section-title { font-weight: bold; color: #10b981; margin-bottom: 8px; border-bottom: 1px solid #eee; padding-bottom: 4px; }
                    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem; }
                    .signatures { display: flex; justify-content: space-between; margin-top: 40px; }
                    .sig-box { text-align: center; width: 45%; border: 1px dashed #aaa; padding: 10px; border-radius: 8px; }
                    .sig-img { max-width: 100%; height: 80px; object-fit: contain; }
                    @media print { body { padding: 0; } }
                </style>
            </head>
            <body>
                <table class="header-table">
                    <tr>
                        <td>
                            <div class="title">🏎️ EcoCarPro</div>
                            <div style="font-size: 0.9rem; color: #555;">PROTOKÓŁ WYKONANIA USŁUGI / ODBIORU</div>
                            <div style="font-size: 0.8rem; color: #888;">Data wystawienia: ${dateNow}</div>
                        </td>
                        <td class="company-box">
                            <strong>${compName}</strong><br>
                            NIP: ${compNip}<br>
                            Adres: ${compAddress}<br>
                            Tel: ${compPhone}
                        </td>
                    </tr>
                </table>

                <div class="section">
                    <div class="section-title">📌 DANE POJAZDU I ZLECENIODAWCY</div>
                    <div class="info-grid">
                        <div><strong>Marka i Model:</strong> ${car ? car.brand : '---'}</div>
                        <div><strong>Numer Rejestracyjny:</strong> ${car && car.plateNum ? car.plateNum : '---'}</div>
                        <div><strong>Właściciel Pojazdu:</strong> ${car && car.ownerName ? car.ownerName : '---'}</div>
                        <div><strong>Telefon Właściciela:</strong> ${car && car.ownerPhone ? car.ownerPhone : '---'}</div>
                        <div><strong>Czas realizacji prac:</strong> ${hours} godz.</div>
                        <div><strong>Wartość Zlecenia:</strong> ${car && car.price ? car.price + ' PLN' : 'Opcjonalnie'}</div>
                    </div>
                </div>

                <div class="section">
                    <div class="section-title">📝 OPIS WYKONANYCH PRAC I ZAKRES USŁUGI</div>
                    <p style="white-space: pre-wrap; font-size: 0.9rem;">${notes}</p>
                </div>

                <div class="signatures">
                    <div class="sig-box">
                        <div style="font-size: 0.8rem; font-weight: bold; margin-bottom: 8px;">PODPIS KLIENTA / ODBIORCY</div>
                        <img src="${clientSigImg}" class="sig-img" alt="Podpis Klienta">
                    </div>
                    <div class="sig-box">
                        <div style="font-size: 0.8rem; font-weight: bold; margin-bottom: 8px;">PODPIS WŁAŚCICIELA FIRMY / WYKONAWCY</div>
                        <img src="${ownerSigImg}" class="sig-img" alt="Podpis Właściciela">
                    </div>
                </div>

                <script>
                    window.onload = function() {
                        window.print();
                    };
                </script>
            </body>
            </html>
        `);
        printWin.document.close();
        reportModal.classList.remove('active');
    };
}

async function loadAdminData() {
    if (!canManageLocationsAndUsers(currentUser)) return;
    const usersStatusGrid = document.getElementById('users-status-grid');
    if (!usersStatusGrid) return;

    const defaultUsersList = [
        { id: 'admin', name: 'Admin', role: 'Właściciel / System' },
        { id: 'tomek', name: 'Tomek', role: 'Właściciel' },
        { id: 'monia', name: 'Monia', role: 'Właściciel' },
        { id: 'lukasz', name: 'Łukasz', role: 'Pracownik' },
        { id: 'adam', name: 'Adam', role: 'Pracownik' },
        { id: 'nastka', name: 'Nastka', role: 'Pracownik' }
    ];

    const allUsersMap = new Map();
    defaultUsersList.forEach(u => allUsersMap.set(u.id, u));
    customUsers.forEach(u => {
        const canonical = (u.username || u.id).toLowerCase();
        if (canonical === 'michal') return;
        if (!allUsersMap.has(canonical)) {
            allUsersMap.set(canonical, {
                id: canonical,
                name: u.username || canonical,
                role: u.role === 'owner' ? 'Właściciel' : 'Pracownik',
                isCustom: true
            });
        }
    });

    const activeUsers = Array.from(allUsersMap.values()).filter(u => {
        const can = u.id.toLowerCase();
        return can !== 'michal' && !deletedUsers.includes(can);
    });

    if (activeUsers.length === 0) {
        usersStatusGrid.innerHTML = '<p style="color:var(--text-muted); text-align:center; padding:1.5rem; grid-column:1/-1;">Brak aktywnych kont w systemie.</p>';
    } else {
        usersStatusGrid.innerHTML = activeUsers.map(u => `
            <div class="user-status-card glass" id="status-${u.id}">
                <div class="user-avatar">${u.name.charAt(0).toUpperCase()}</div>
                <div class="user-info" style="width: 100%;">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
                        <h4>${u.name} <span style="font-size:0.75rem; color:var(--text-muted);">(${u.role})</span></h4>
                    </div>
                    <div class="status-indicator">
                        <span>Checking...</span>
                    </div>
                    <p class="last-login">Ostatnie logowanie: <span class="time">Nigdy</span></p>
                </div>
            </div>
        `).join('');
    }

    const updateStatusCard = async (uObj) => {
        const userId = uObj.id;
        const userName = uObj.name;
        const docRef = doc(db, 'settings', userId + '_login');
        const lockRef = doc(db, 'settings', userId + '_lock');

        // Parallelize fetching login status, lock state, and password
        const [d, lockSnap, pass] = await Promise.all([
            getDoc(docRef),
            getDoc(lockRef),
            getUserPassword(userId)
        ]);

        const card = document.getElementById('status-' + userId);
        if (!card) return;

        const timeEl = card.querySelector('.time');
        const statusEl = card.querySelector('.status-indicator span');

        if (d.exists()) {
            const lastLogin = new Date(d.data().lastLogin);
            timeEl.textContent = lastLogin.toLocaleString('pl-PL');

            const diff = new Date() - lastLogin;
            if (diff < 300000) {
                statusEl.textContent = 'Online';
                statusEl.className = 'online';
            } else {
                statusEl.textContent = 'Offline';
                statusEl.className = 'offline';
            }
        } else {
            statusEl.textContent = 'Brak danych';
            statusEl.className = 'offline';
        }

        const isLocked = lockSnap.exists() && lockSnap.data().locked;

        const userInfoEl = card.querySelector('.user-info');

        const existingBtn = card.querySelector('.unlock-btn');
        if (existingBtn) existingBtn.remove();

        const actionBtn = document.createElement('button');
        actionBtn.className = isLocked ? 'unlock-btn' : 'unlock-btn suspend-btn';
        if (!isLocked) {
            actionBtn.style.background = '#f59e0b';
        }
        actionBtn.textContent = isLocked ? 'Odblokuj Dostęp' : 'Zawieś Konto';

        actionBtn.onclick = async () => {
            if (isLocked) {
                await setDoc(lockRef, { locked: false, suspended: false });
                showToast(`Odblokowano użytkownika ${userName}`, "success");
            } else {
                const confirmed = await showConfirm(`Czy na pewno chcesz zawiesić konto użytkownika ${userName}?`, 'ZAWIEŚ', 'ANULUJ', true);
                if (confirmed) {
                    await setDoc(lockRef, { locked: true, suspended: true, timestamp: new Date().toISOString() });
                    showToast(`Zawieszono użytkownika ${userName}`, "error");
                }
            }
            loadAdminData();
        };
        userInfoEl.appendChild(actionBtn);

        if (pass) {
            const existingPass = card.querySelector('.pass-preview');
            if (existingPass) existingPass.remove();

            const passContainer = document.createElement('div');
            passContainer.className = 'pass-preview';
            passContainer.style.fontSize = '0.75rem';
            passContainer.style.marginTop = '10px';
            passContainer.style.padding = '8px';
            passContainer.style.background = 'rgba(255,255,255,0.05)';
            passContainer.style.borderRadius = '8px';
            passContainer.style.color = 'var(--text-muted)';
            passContainer.style.display = 'flex';
            passContainer.style.flexDirection = 'column';
            passContainer.style.gap = '6px';

            const maskedPass = '●'.repeat(pass.length);
            passContainer.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:4px;">
                    <span>🔐 <span class="pass-val" data-real="${pass}">${maskedPass}</span></span>
                    <div style="display:flex; gap:4px; flex-wrap:wrap;">
                        <button class="btn-show-pass" style="background:none; border:none; color:var(--primary-green); cursor:pointer; font-size:0.7rem; font-weight:bold; margin-right:4px;">POKAŻ</button>
                        <button class="btn-edit-pass" style="background:rgba(16,185,129,0.15); border:1px solid var(--primary-green); color:var(--primary-green); cursor:pointer; font-size:0.7rem; font-weight:bold; padding:2px 6px; border-radius:4px;">✏️ ZMIEŃ</button>
                        <button class="btn-gen-pass" style="background:rgba(59,130,246,0.15); border:1px solid #3b82f6; color:#3b82f6; cursor:pointer; font-size:0.7rem; font-weight:bold; padding:2px 6px; border-radius:4px;">🎲 WYGENERUJ LOSOWE</button>
                    </div>
                </div>
            `;

            passContainer.querySelector('.btn-show-pass').onclick = (e) => {
                const valEl = passContainer.querySelector('.pass-val');
                const isMasked = valEl.textContent.includes('●');
                valEl.textContent = isMasked ? valEl.dataset.real : '●'.repeat(pass.length);
                e.target.textContent = isMasked ? 'UKRYJ' : 'POKAŻ';
            };

            passContainer.querySelector('.btn-edit-pass').onclick = async () => {
                const newPass = prompt(`Wpisz nowe hasło dla użytkownika ${userName}:`, pass);
                if (newPass !== null && newPass.trim() !== '') {
                    const cleanPass = newPass.trim();
                    const success = await changeUserPassword(userId, cleanPass);
                    if (success) {
                        showToast(`Pomyślnie zmieniono i zapisano hasło dla ${userName}!`, "success");
                        logAction(`Admin zmienił hasło dla użytkownika ${userName}`);
                        loadAdminData();
                    } else {
                        showToast("Błąd zmiany hasła", "error");
                    }
                }
            };

            if (userId.toLowerCase() === 'admin') {
                const genBtn = passContainer.querySelector('.btn-gen-pass');
                if (genBtn) genBtn.remove();
            }

            passContainer.querySelector('.btn-gen-pass')?.addEventListener('click', async () => {
                const randomPass = Math.floor(100000000 + Math.random() * 900000000).toString();
                const success = await changeUserPassword(userId, randomPass);
                if (success) {
                    showToast(`Wygenerowano i zapisano nowe hasło dla ${userName}: ${randomPass}`, "success");
                    logAction(`Admin wygenerował nowe losowe hasło dla ${userName}`);
                    loadAdminData();
                } else {
                    showToast("Błąd generowania hasła", "error");
                }
            });

            userInfoEl.appendChild(passContainer);
        }

        // Add Delete Account Button for any account except admin and tomek
        if (userId !== 'admin' && userId !== 'tomek') {
            const existingDelBtn = card.querySelector('.btn-delete-user-account');
            if (existingDelBtn) existingDelBtn.remove();

            const delBtn = document.createElement('button');
            delBtn.className = 'btn-delete-user-account';
            delBtn.style.cssText = 'background: rgba(239, 68, 68, 0.15); border: 1px solid #ef4444; color: #ef4444; font-size: 0.75rem; font-weight: bold; padding: 6px 10px; border-radius: 6px; width: 100%; margin-top: 8px; cursor: pointer; transition: all 0.2s ease;';
            delBtn.textContent = '🗑️ Usuń Konto (Trwale)';

            delBtn.onclick = () => deleteAccount(userId, userName);
            userInfoEl.appendChild(delBtn);
        }
    };

    const logsQ = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(50));
    const [_, logsSnap] = await Promise.all([
        Promise.all(activeUsers.map(u => updateStatusCard(u))),
        getDocs(logsQ)
    ]);

    logsList.innerHTML = logsSnap.docs.map(doc => {
        const log = doc.data();
        const date = new Date(log.timestamp);
        const userColor = log.user === 'Monia' ? '#ec4899' : (log.user === 'Tomek' ? '#10b981' : '#3b82f6');
        return `
            <div class="log-item" style="border-left-color: ${userColor}">
                <div class="log-content">
                    <strong style="color: ${userColor}">${log.user}:</strong> 
                    <span>${log.text}</span>
                </div>
                <span class="log-date">${date.toLocaleString('pl-PL')}</span>
            </div>
        `;
    }).join('') || '<p style="text-align:center; padding: 20px; color: var(--text-muted);">Brak aktywności</p>';
}

async function processAutoArchiving() {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const now = Date.now();

    const readyCarsToArchive = (cars || []).filter(car => {
        if (car.archived) return false;
        if (car.status !== 'gotowe') return false;
        const readyTimestamp = car.readyAt || car.statusChangeDate;
        if (!readyTimestamp) return false;
        const readyTime = new Date(readyTimestamp).getTime();
        if (isNaN(readyTime)) return false;
        return (now - readyTime) >= ONE_DAY_MS;
    });

    for (const car of readyCarsToArchive) {
        try {
            await updateDoc(doc(db, 'cars', car.id), {
                archived: true,
                status: 'gotowe',
                statusChangeDate: new Date().toISOString(),
                autoArchivedAt: new Date().toISOString()
            });
            logAction(`Auto-przeniesienie do zrealizowanych po 1 dniu gotowości: ${car.brand} [${car.plateNum || ''}]`);
        } catch (e) {
            console.error("Auto archive error for", car.id, e);
        }
    }
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
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
    }, 3200);
}

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

if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
        applyTheme(currentTheme === 'light' ? 'dark' : 'light');
    });
}

if (searchInput) {
    searchInput.addEventListener('input', () => renderCars(searchInput.value));
}

// Start app
init();
