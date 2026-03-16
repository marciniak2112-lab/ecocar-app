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

// State Management
let cars = [];
let currentView = 'active'; // 'active', 'archive', or 'admin'
let currentUser = ''; // 'Admin' or 'Tomek'
let archivePeriod = 'all'; // 'all', 'month', '3months'

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
const viewAdminBtn = document.getElementById('view-admin');
const adminSection = document.getElementById('admin-section');
const logsList = document.getElementById('logs-list');
const tomekLastLoginEl = document.getElementById('tomek-last-login');
const loginOverlay = document.getElementById('login-overlay');
const loginBtn = document.getElementById('login-btn');
const loginUserInput = document.getElementById('login-user');
const loginPassInput = document.getElementById('login-password');
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

// Initialize Listener - Real-time Sanpshot
function init() {
    // Theme setup
    const savedTheme = localStorage.getItem('ecoCarTheme') || 'dark';
    applyTheme(savedTheme);

    const q = query(carsCol, orderBy('dateAdded', 'desc'));
    onSnapshot(q, (snapshot) => {
        cars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processAutoArchiving();
        renderCars();
        updateStats();
        updateCountdowns();
    });

    setInterval(updateCountdowns, 1000);

    // View Switching
    viewActiveBtn.onclick = () => {
        currentView = 'active';
        viewActiveBtn.classList.add('active');
        viewArchiveBtn.classList.remove('active');
        viewAdminBtn.classList.remove('active');
        adminSection.style.display = 'none';
        archiveControls.style.display = 'none';
        carsGrid.style.display = 'grid';
        renderCars(searchInput.value);
    };

    viewArchiveBtn.onclick = () => {
        currentView = 'archive';
        viewActiveBtn.classList.remove('active');
        viewArchiveBtn.classList.add('active');
        viewAdminBtn.classList.remove('active');
        adminSection.style.display = 'none';
        archiveControls.style.display = 'flex';
        carsGrid.style.display = 'grid';
        renderCars(searchInput.value);
    };

    viewAdminBtn.onclick = () => {
        currentView = 'admin';
        viewActiveBtn.classList.remove('active');
        viewArchiveBtn.classList.remove('active');
        viewAdminBtn.classList.add('active');
        adminSection.style.display = 'block';
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
        const user = loginUserInput.value.trim();
        const pass = loginPassInput.value.trim();

        // Case-insensitive check for user, but exact for password
        const isAdmin = user.toLowerCase() === 'admin' && pass === 'system02';
        const isTomek = user.toLowerCase() === 'tomek' && pass === 'tommar';

        if (isAdmin || isTomek) {
            // Standardize username for display
            currentUser = isAdmin ? 'Admin' : 'Tomek';

            loginOverlay.style.display = 'none';
            appContainer.style.display = 'block';
            loggedUserNameEl.textContent = currentUser;
            showToast(`Zalogowano jako ${currentUser}`, "success");

            loginPassInput.value = ''; // Clear password
            loginUserInput.value = ''; // Clear user

            if (currentUser === 'Tomek') {
                try {
                    await setDoc(doc(db, 'settings', 'tomek_login'), {
                        lastLogin: new Date().toISOString()
                    });
                } catch (e) { console.error("Update login error", e); }
            }
            logAction(`Zalogowano użytkownika: ${currentUser}`);
            updateUIForRole();
            renderCars(); // Re-render to apply permissions
        } else {
            showToast("Błędne hasło lub użytkownik", "error");
        }
    };
    updateUIForRole();
}

async function logAction(actionText) {
    try {
        await addDoc(collection(db, 'logs'), {
            text: actionText,
            timestamp: new Date().toISOString()
        });
    } catch (e) { console.error("Log error", e); }
}

function updateUIForRole() {
    if (currentUser === 'Admin') {
        viewAdminBtn.style.display = 'block';
    } else {
        viewAdminBtn.style.display = 'none';
        // If current view is admin and user is not admin, switch to active
        if (currentView === 'admin') {
            viewActiveBtn.click();
        }
    }
}

async function loadAdminData() {
    // Load last log for Tomek
    const tomekDoc = await getDoc(doc(db, 'settings', 'tomek_login'));
    if (tomekDoc.exists()) {
        const date = new Date(tomekDoc.data().lastLogin);
        tomekLastLoginEl.textContent = date.toLocaleString('pl-PL');
    }

    // Load last 10 logs
    const logsQ = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(10));
    const logsSnap = await getDocs(logsQ);
    logsList.innerHTML = logsSnap.docs.map(doc => {
        const log = doc.data();
        const date = new Date(log.timestamp);
        return `
            <div class="log-item">
                <span>${log.text}</span>
                <span class="log-date">${date.toLocaleString('pl-PL')}</span>
            </div>
        `;
    }).join('') || '<p>Brak logów</p>';
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
            <div class="car-info-row">
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
        dateAdded: id ? cars.find(c => c.id === id).dateAdded : new Date().toISOString()
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

init();
