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

// State Management
let cars = [];
let notifications = [];
let currentView = 'active'; // 'active', 'calendar', 'archive', or 'admin'
let currentUser = localStorage.getItem('ecoCarUser') || ''; // 'Admin', 'Tomek', 'Monia', 'Adam', 'Michał', 'Łukasz', 'Nastka'
let archivePeriod = 'all'; // 'all', 'month', '3months'

// Calendar State
let calCurrentMonth = new Date().getMonth();
let calCurrentYear = new Date().getFullYear();
let selectedCalDate = null;
let customTodos = [];
let deferredPrompt = null;

// Default user passwords fallback
const DEFAULT_PASSWORDS = {
    'admin': 'system02',
    'tomek': 'tommar',
    'monia': 'wanda',
    'adam': '767211439',
    'michal': '192837465',
    'lukasz': '564738291',
    'nastka': '908172635'
};

// Helper: Get Password from Firestore settings collection or fallback
async function getUserPassword(username) {
    const canonical = username.toLowerCase();
    try {
        const passDoc = await getDoc(doc(db, 'settings', canonical + '_pass'));
        if (passDoc.exists() && passDoc.data().password) {
            return passDoc.data().password;
        }
    } catch (e) { console.error("Get pass error", e); }
    return DEFAULT_PASSWORDS[canonical] || null;
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

// Helper: Check if user is Owner (Właściciel)
function isOwner(user = currentUser) {
    if (!user) return false;
    const u = user.toLowerCase();
    return u === 'admin' || u === 'tomek' || u === 'tomasz' || u === 'monia' || u === 'monika';
}

// DOM Elements
const carsGrid = document.getElementById('cars-grid');
const calendarSection = document.getElementById('calendar-section');
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
const viewCalendarBtn = document.getElementById('view-calendar');
const viewArchiveBtn = document.getElementById('view-archive');
const viewAdminBtn = document.getElementById('view-admin');

// Mobile Bottom Nav Items
const mobNavActive = document.getElementById('mob-nav-active');
const mobNavCalendar = document.getElementById('mob-nav-calendar');
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
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('Service Worker reg error', err));
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

    // Cars Realtime Listener
    const q = query(carsCol, orderBy('dateAdded', 'desc'));
    onSnapshot(q, (snapshot) => {
        cars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processAutoArchiving();
        renderCars();
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

    setInterval(updateCountdowns, 1000);

    // Navigation Click Handlers
    setupNavigation();

    // Login Handler
    setupLogin();

    // Calendar Navigation Handlers
    setupCalendarNav();

    // PWA Install Handlers
    setupPWA();

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
        currentView = targetView;
        viewActiveBtn.classList.toggle('active', targetView === 'active');
        viewCalendarBtn.classList.toggle('active', targetView === 'calendar');
        viewArchiveBtn.classList.toggle('active', targetView === 'archive');
        viewAdminBtn.classList.toggle('active', targetView === 'admin');

        // Mobile Nav sync
        mobNavActive.classList.toggle('active', targetView === 'active');
        mobNavCalendar.classList.toggle('active', targetView === 'calendar');
        mobNavArchive.classList.toggle('active', targetView === 'archive');
        mobNavAdmin.classList.toggle('active', targetView === 'admin');

        // Display sections
        carsGrid.style.display = (targetView === 'active' || targetView === 'archive') ? 'grid' : 'none';
        calendarSection.style.display = (targetView === 'calendar') ? 'block' : 'none';
        adminSection.style.display = (targetView === 'admin') ? 'block' : 'none';
        archiveControls.style.display = (targetView === 'archive') ? 'flex' : 'none';

        if (targetView === 'active' || targetView === 'archive') {
            renderCars(searchInput.value);
        } else if (targetView === 'calendar') {
            renderCalendar();
        } else if (targetView === 'admin') {
            loadAdminData();
        }
    };

    viewActiveBtn.onclick = () => switchTab('active');
    viewCalendarBtn.onclick = () => switchTab('calendar');
    viewArchiveBtn.onclick = () => switchTab('archive');
    viewAdminBtn.onclick = () => switchTab('admin');

    mobNavActive.onclick = () => switchTab('active');
    mobNavCalendar.onclick = () => switchTab('calendar');
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

        try {
            const lockDoc = await getDoc(doc(db, 'settings', canonicalUser + '_lock'));
            if (lockDoc.exists() && lockDoc.data().locked) {
                showLockedMessage(lockDoc.data().suspended || false);
                return;
            }
        } catch (e) { console.error("Check lock error", e); }

        const validUsers = {
            'admin': 'system02',
            'tomek': 'tommar',
            'monia': 'wanda',
            'adam': '767211439',
            'michal': '192837465',
            'lukasz': '564738291',
            'nastka': '908172635'
        };

        const expectedPass = await getUserPassword(canonicalUser);

        if (expectedPass !== null) {
            if (expectedPass === passVal) {
                localStorage.removeItem('ecoCarFailedAttempts');
                currentUser = canonicalUser.charAt(0).toUpperCase() + canonicalUser.slice(1);
                if (canonicalUser === 'michal') currentUser = 'Michał';
                if (canonicalUser === 'lukasz') currentUser = 'Łukasz';

                localStorage.setItem('ecoCarUser', currentUser);
                localStorage.setItem('ecoCarReloadCount', '0');

                loginOverlay.style.display = 'none';
                appContainer.style.display = 'block';
                loggedUserNameEl.textContent = currentUser;
                showToast(`Zalogowano jako ${currentUser}`, "success");

                loginPassInput.value = '';
                loginUserInput.value = '';
                lockedMsgEl.style.display = 'none';

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
                handleFailedLogin(canonicalUser);
            }
        } else {
            handleFailedLogin(canonicalUser);
        }
    };
}

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

async function handleFailedLogin(username) {
    let attempts = parseInt(localStorage.getItem('ecoCarFailedAttempts') || '0', 10);
    attempts++;
    localStorage.setItem('ecoCarFailedAttempts', attempts.toString());

    if (attempts >= 3) {
        try {
            await setDoc(doc(db, 'settings', username + '_lock'), {
                locked: true,
                timestamp: new Date().toISOString()
            });
        } catch (e) { console.error("Lock error", e); }
        showLockedMessage();
        showToast("Konto zostało zablokowane!", "error");
    } else {
        showToast(`Błędne dane! Pozostało prób: ${3 - attempts}`, "error");
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

function updateUIForRole() {
    const role = (currentUser || '').toLowerCase();
    const owner = isOwner(currentUser);

    // Admin Panel access
    if (role === 'admin') {
        viewAdminBtn.style.display = 'block';
        mobNavAdmin.style.display = 'flex';
    } else {
        viewAdminBtn.style.display = 'none';
        mobNavAdmin.style.display = 'none';
        if (currentView === 'admin') {
            viewActiveBtn.click();
        }
    }

    // Owner Notifications Button visibility
    if (owner) {
        notifBtn.style.display = 'flex';
        mobNavNotif.style.display = 'flex';
        requestPushNotificationPermission();
    } else {
        notifBtn.style.display = 'none';
        mobNavNotif.style.display = 'none';
    }

    if (role === 'monia') {
        document.body.classList.add('monia-mode');
    } else {
        document.body.classList.remove('monia-mode');
    }
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
            document.getElementById('car-id').value = '';
            document.getElementById('car-arrival-date').value = selectedCalDate || '';
            document.querySelectorAll('input[name="todo"]').forEach(cb => cb.checked = false);
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
            const badgeClass = isArrival ? 'arrival' : 'pickup';
            const prefix = isArrival ? '🟢' : '🔑';
            const pinnedClass = car.pinnedOnMain ? 'pinned' : '';
            badgesHtml += `<span class="cal-car-badge ${badgeClass} ${pinnedClass}">${prefix} ${car.brand}</span>`;
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
            <div class="cal-day-car-item">
                <div>
                    <strong>${car.brand}</strong> ${car.plateNum ? `(${car.plateNum})` : ''}
                    <div style="font-size:0.75rem; color:var(--text-muted);">
                        Właściciel: ${car.ownerName || '---'} | Status: ${car.status || 'przyjedzie'}
                    </div>
                </div>
                <button class="btn-secondary btn-pin-main" data-id="${car.id}" style="font-size:0.75rem; padding:6px 10px;">
                    📌 Dodaj do Ekranu Głównym
                </button>
            </div>
        `).join('');

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

    attachCardListeners();
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
    
    // Normalize todo items into task objects
    let tasks = [];
    if (car.todoTasks && Array.isArray(car.todoTasks)) {
        tasks = car.todoTasks;
    } else if (car.todo && Array.isArray(car.todo)) {
        tasks = car.todo.map(t => typeof t === 'string' ? { text: t, done: false } : t);
    }

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
                <span class="label">Właściciel Auta</span>
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

            ${!car.archived ? `
            <div class="status-actions">
                <button class="btn-status ${status === 'przyjedzie' ? 'active' : ''}" data-id="${car.id}" data-status="przyjedzie">Przyjedzie</button>
                <button class="btn-status ${status === 'w-trakcie' ? 'active' : ''}" data-id="${car.id}" data-status="w-trakcie">W trakcie</button>
                <button class="btn-status ${status === 'gotowe' ? 'active' : ''}" data-id="${car.id}" data-status="gotowe">Gotowe</button>
            </div>
            <div style="margin-top: 12px; border-top: 1px dashed rgba(16, 185, 129, 0.2); padding-top: 12px;">
                <button class="btn-status btn-archive" data-id="${car.id}" style="width: 100%; background: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); color: var(--primary-green);">
                    📥 PRZENIEŚ DO ARCHIWUM
                </button>
            </div>
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
        await updateDoc(doc(db, 'cars', id), {
            status: newStatus,
            statusChangeDate: new Date().toISOString()
        });
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
    modalTitle.textContent = 'Dodaj Nowy Samochód';
    carForm.reset();
    document.getElementById('car-id').value = '';
    document.querySelectorAll('input[name="todo"]').forEach(cb => cb.checked = false);
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
    const todoCheckboxes = document.querySelectorAll('input[name="todo"]:checked');
    const checkedTodos = Array.from(todoCheckboxes).map(cb => ({ text: cb.value, done: false }));
    
    // Merge predefined checked todos and custom added todos
    const combinedTodos = [...checkedTodos, ...customTodos];

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
            const notifMsg = `🏎️ ${currentUser || 'Pracownik'} dodał nowe auto: ${carData.brand}${carData.plateNum ? ' (' + carData.plateNum + ')' : ''}`;
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
        document.getElementById('car-owner-phone').value = car.ownerPhone;
        document.getElementById('car-history').value = car.history || '';
        document.getElementById('car-worker').value = car.worker || '';
        document.getElementById('car-arrival-date').value = car.arrivalDate || '';
        document.getElementById('car-pickup-date').value = car.pickupDate || '';
        document.getElementById('car-priority').checked = car.priority || false;

        // Reset and set checkboxes
        const carTodoTexts = (car.todoTasks ? car.todoTasks.map(t => t.text) : (car.todo || []));
        document.querySelectorAll('input[name="todo"]').forEach(cb => {
            cb.checked = carTodoTexts.includes(cb.value);
        });

        // Custom todos
        customTodos = (car.todoTasks || []).filter(t => !['Konserwacja podwozia', 'Ceramika', 'Czyszczenie środka', 'Korekta lakieru', 'Pranie tapicerki'].includes(t.text));
        renderCustomTodosInForm();

        carModal.classList.add('active');
    }
}

function openReportModal(id) {
    if (currentUser === 'Monia') {
        showToast("Tylko Admin i Tomek posiadają uprawnienia do tworzenia raportów.", "error");
        return;
    }

    reportCarIdInput.value = id;
    reportForm.reset();
    reportModal.classList.add('active');
}

async function loadAdminData() {
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

            const diff = new Date() - lastLogin;
            if (diff < 300000) {
                statusEl.textContent = 'Online';
                statusEl.className = 'online';
            } else {
                statusEl.textContent = 'Offline';
                statusEl.className = 'offline';
            }
        }

        const lockRef = doc(db, 'settings', userId + '_lock');
        const lockSnap = await getDoc(lockRef);
        const isLocked = lockSnap.exists() && lockSnap.data().locked;

        const existingBtn = card.querySelector('.unlock-btn');
        if (existingBtn) existingBtn.remove();

        const actionBtn = document.createElement('button');
        actionBtn.className = isLocked ? 'unlock-btn' : 'unlock-btn suspend-btn';
        if (!isLocked) {
            actionBtn.style.background = '#f59e0b';
        }
        actionBtn.textContent = isLocked ? 'Odblokuj Konto' : 'Zawieś Konto';

        actionBtn.onclick = async () => {
            if (isLocked) {
                await setDoc(lockRef, { locked: false, suspended: false });
                showToast(`Odblokowano użytkownika ${userId}`, "success");
            } else {
                const confirmed = await showConfirm(`Czy na pewno chcesz zawiesić konto użytkownika ${userId}?`, 'ZAWIEŚ', 'ANULUJ', true);
                if (confirmed) {
                    await setDoc(lockRef, { locked: true, suspended: true, timestamp: new Date().toISOString() });
                    showToast(`Zawieszono użytkownika ${userId}`, "error");
                }
            }
            loadAdminData();
        };
        card.querySelector('.user-info').appendChild(actionBtn);

        const pass = await getUserPassword(userId);
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
                const newPass = prompt(`Wpisz nowe hasło dla użytkownika ${userId}:`, pass);
                if (newPass !== null && newPass.trim() !== '') {
                    const cleanPass = newPass.trim();
                    const success = await changeUserPassword(userId, cleanPass);
                    if (success) {
                        showToast(`Pomyślnie zmieniono i zapisano hasło dla ${userId}!`, "success");
                        logAction(`Admin zmienił hasło dla użytkownika ${userId}`);
                        loadAdminData();
                    } else {
                        showToast("Błąd zmiany hasła", "error");
                    }
                }
            };

            passContainer.querySelector('.btn-gen-pass').onclick = async () => {
                const randomPass = Math.floor(100000000 + Math.random() * 900000000).toString();
                const success = await changeUserPassword(userId, randomPass);
                if (success) {
                    showToast(`Wygenerowano i zapisano nowe hasło dla ${userId}: ${randomPass}`, "success");
                    logAction(`Admin wygenerował nowe losowe hasło dla ${userId}`);
                    loadAdminData();
                } else {
                    showToast("Błąd generowania hasła", "error");
                }
            };

            card.querySelector('.user-info').appendChild(passContainer);
        }
    };

    const userIds = ['admin', 'tomek', 'monia', 'adam', 'michal', 'lukasz', 'nastka'];
    for (const userId of userIds) {
        await updateStatusCard(userId, 'status-' + userId);
    }

    const logsQ = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(50));
    const logsSnap = await getDocs(logsQ);

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

function processAutoArchiving() {
    // Manual archiving only
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
