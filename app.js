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
    limit,
    getDoc
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
let currentView = 'active'; // 'active' or 'archive'

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
const helpBtn = document.getElementById('help-btn');
const helpModal = document.getElementById('help-modal');
const closeHelpModalBtn = document.getElementById('close-help-modal');
const confirmModal = document.getElementById('confirm-modal');
const confirmOkBtn = document.getElementById('confirm-ok');
const confirmCancelBtn = document.getElementById('confirm-cancel');
const confirmMessageEl = document.getElementById('confirm-message');
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const adminPanelBtn = document.getElementById('admin-panel-btn');
const adminModal = document.getElementById('admin-modal');
const closeAdminModalBtn = document.getElementById('close-admin-modal');
const tomekLoginEl = document.getElementById('tomek-last-login');
const activityLogEl = document.getElementById('activity-log');
const logoutBtn = document.getElementById('logout-btn');

// Initialize Listener - Real-time Sanpshot
function init() {
    // Check Session
    checkAuth();

    // Theme setup
    const savedTheme = localStorage.getItem('ecoCarTheme') || 'dark';
    applyTheme(savedTheme);

    const q = query(carsCol, orderBy('dateAdded', 'desc'));
    onSnapshot(q, (snapshot) => {
        cars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        processAutoArchiving();
        renderCars();
        updateStats();
    });

    setInterval(updateCountdowns, 1000);

    // View Switching
    viewActiveBtn.onclick = () => {
        currentView = 'active';
        viewActiveBtn.classList.add('active');
        viewArchiveBtn.classList.remove('active');
        renderCars(searchInput.value);
    };

    viewArchiveBtn.onclick = () => {
        currentView = 'archive';
        viewArchiveBtn.classList.add('active');
        viewActiveBtn.classList.remove('active');
        renderCars(searchInput.value);
    };
}

// Logic to check if 1 day has passed for cars marked as "Gotowe"
async function processAutoArchiving() {
    const now = new Date();
    const oneDayMs = 24 * 60 * 60 * 1000;

    for (const car of cars) {
        if (car.status === 'gotowe' && car.statusChangeDate && !car.archived) {
            const changeDate = new Date(car.statusChangeDate);
            if (now - changeDate > oneDayMs) {
                const carRef = doc(db, 'cars', car.id);
                try {
                    await updateDoc(carRef, { archived: true });
                } catch (e) {
                    console.error("Auto-archive error:", e);
                }
            }
        }
    }
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
function showConfirm(message) {
    return new Promise((resolve) => {
        confirmMessageEl.textContent = message;
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
        return currentView === 'active' ? !car.archived : car.archived;
    });

    // Apply text filter
    filteredCars = filteredCars.filter(car =>
        (car.brand || '').toLowerCase().includes(searchTerm) ||
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
        renderArchiveGrouped(filteredCars);
    } else {
        renderActiveGrid(filteredCars);
    }

    // Attach event listeners to new buttons
    attachCardListeners();
}

function renderActiveGrid(filteredCars) {
    carsGrid.innerHTML = filteredCars.map(car => generateCarCardHtml(car)).join('');
}

function renderArchiveGrouped(filteredCars) {
    // Sort archived cars by modified date (completion date) or added date
    const sorted = [...filteredCars].sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));

    let html = '';
    let lastDate = null;

    sorted.forEach(car => {
        const carDate = new Date(car.dateAdded).toLocaleDateString();
        const today = new Date().toLocaleDateString();

        if (carDate !== lastDate) {
            const dateLabel = carDate === today ? 'Dzisiaj' : carDate;
            html += `<div class="date-separator"><span>${dateLabel}</span></div>`;
            lastDate = carDate;
        }
        html += generateCarCardHtml(car);
    });

    carsGrid.innerHTML = html;
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

            <h3>${car.brand}</h3>
            <div class="car-info-row">
                <span class="label">Wartość Usługi</span>
                <span class="val">${formatCurrency(car.price)}</span>
            </div>
            <div class="car-info-row">
                <span class="label">Właściciel</span>
                <span class="val">${car.ownerPhone}</span>
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
                <button class="btn-icon btn-edit" data-id="${car.id}" title="Edytuj">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-icon btn-delete" data-id="${car.id}" title="Usuń">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>

            ${!car.archived ? `
            <div class="status-actions">
                <button class="btn-status ${status === 'przyjedzie' ? 'active' : ''}" data-id="${car.id}" data-status="przyjedzie">Przyjedzie</button>
                <button class="btn-status ${status === 'w-trakcie' ? 'active' : ''}" data-id="${car.id}" data-status="w-trakcie">W trakcie</button>
                <button class="btn-status ${status === 'gotowe' ? 'active' : ''}" data-id="${car.id}" data-status="gotowe">Gotowe</button>
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
    document.querySelectorAll('.btn-status').forEach(btn => {
        btn.onclick = () => updateCarStatus(btn.dataset.id, btn.dataset.status);
    });
}

async function updateCarStatus(id, newStatus) {
    try {
        const carRef = doc(db, 'cars', id);
        await updateDoc(carRef, {
            status: newStatus,
            statusChangeDate: new Date().toISOString()
        });
        const car = cars.find(c => c.id === id);
        logActivity(`Zmieniono status na ${newStatus}`, car ? car.brand : 'Nieznany');
        showToast(`Zmieniono status na: ${newStatus}`, 'success');
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
    if (event.target === adminModal) adminModal.classList.remove('active');
};

loginForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const user = document.getElementById('login-user').value;
    const pass = document.getElementById('login-pass').value;
    login(user, pass);
});

adminPanelBtn.addEventListener('click', () => {
    adminModal.classList.add('active');
    loadAdminData();
});

closeAdminModalBtn.addEventListener('click', () => {
    adminModal.classList.remove('active');
});

logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('ecoCarUser');
    location.reload();
});

function checkAuth() {
    const user = JSON.parse(localStorage.getItem('ecoCarUser'));
    if (!user) {
        loginOverlay.style.display = 'flex';
    } else {
        loginOverlay.style.display = 'none';
        if (user.role === 'Admin') {
            document.body.classList.add('user-admin');
        }
    }
}

async function login(username, password) {
    if (username === 'Admin' && password === 'system02') {
        const userData = { name: 'Admin', role: 'Admin' };
        localStorage.setItem('ecoCarUser', JSON.stringify(userData));
        location.reload();
    } else if (username === 'Tomek') {
        if (password === 'qazwsx') {
            const userData = { name: 'Tomek', role: 'User' };
            localStorage.setItem('ecoCarUser', JSON.stringify(userData));
            try {
                await setDoc(doc(db, 'system', 'stats'), {
                    tomekLastLogin: new Date().toISOString()
                }, { merge: true });
                location.reload();
            } catch (e) {
                console.error("Error logging login:", e);
                location.reload();
            }
        } else {
            showToast("Błędne hasło dla Tomka", "error");
        }
    } else {
        showToast("Błędne poświadczenia", "error");
    }
}

async function logActivity(action, carBrand) {
    const user = JSON.parse(localStorage.getItem('ecoCarUser'));
    const userName = user ? user.name : 'Unknown';
    try {
        await addDoc(collection(db, 'logs'), {
            user: userName,
            action: action,
            car: carBrand,
            timestamp: new Date().toISOString()
        });
    } catch (e) {
        console.error("Logging error:", e);
    }
}

async function loadAdminData() {
    const statsDoc = await getDoc(doc(db, 'system', 'stats'));
    if (statsDoc.exists()) {
        const data = statsDoc.data();
        if (data.tomekLastLogin) {
            tomekLoginEl.textContent = new Date(data.tomekLastLogin).toLocaleString('pl-PL');
        }
    }

    const q = query(collection(db, 'logs'), orderBy('timestamp', 'desc'), limit(10));
    const querySnapshot = await getDocs(q);
    activityLogEl.innerHTML = querySnapshot.docs.map(doc => {
        const log = doc.data();
        return `
            <div class="log-item">
                <span class="log-date">${new Date(log.timestamp).toLocaleString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</span>
                <strong>${log.user}</strong>: ${log.action} <em>${log.car}</em>
            </div>
        `;
    }).join('') || '<div class="log-item">Brak aktywności.</div>';
}

helpBtn.addEventListener('click', () => {
    helpModal.classList.add('active');
});

closeHelpModalBtn.addEventListener('click', () => {
    helpModal.classList.remove('active');
});

carForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const id = document.getElementById('car-id').value;
    const todoCheckboxes = document.querySelectorAll('input[name="todo"]:checked');
    const todoList = Array.from(todoCheckboxes).map(cb => cb.value);

    const carData = {
        brand: document.getElementById('car-brand').value,
        price: parseFloat(document.getElementById('car-price').value) || 0,
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
            logActivity('Zaktualizowano', carData.brand);
            showToast("Zaktualizowano dane", "success");
        } else {
            await addDoc(carsCol, carData);
            logActivity('Dodano', carData.brand);
            showToast("Dodano nowe auto", "success");
        }
        carModal.classList.remove('active');
    } catch (error) {
        showToast("Błąd zapisu danych", "error");
    }
});

async function deleteCar(id) {
    const confirmed = await showConfirm('Czy na pewno chcesz usunąć ten samochód? Operacja jest nieodwracalna.');
    if (confirmed) {
        try {
            const car = cars.find(c => c.id === id);
            await deleteDoc(doc(db, 'cars', id));
            logActivity('Usunięto', car ? car.brand : 'Nieznany');
            showToast("Usunięto samochód", "success");
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
        document.getElementById('car-price').value = car.price;
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

searchInput.addEventListener('input', (e) => {
    renderCars(e.target.value);
});

init();
