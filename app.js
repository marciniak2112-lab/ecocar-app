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
    updateDoc
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

// Initialize Listener - Real-time Sanpshot
function init() {
    // Theme setup
    const savedTheme = localStorage.getItem('ecoCarTheme') || 'dark';
    applyTheme(savedTheme);

    const q = query(carsCol, orderBy('dateAdded', 'desc'));
    onSnapshot(q, (snapshot) => {
        cars = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        renderCars();
        updateStats();
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
    const filteredCars = cars.filter(car =>
        (car.brand || '').toLowerCase().includes(searchTerm) ||
        (car.ownerPhone || '').includes(searchTerm) ||
        (car.history || '').toLowerCase().includes(searchTerm) ||
        (car.worker || '').toLowerCase().includes(searchTerm) ||
        (car.todo || []).some(item => item.toLowerCase().includes(searchTerm))
    );

    if (filteredCars.length === 0) {
        carsGrid.innerHTML = `
            <div class="empty-state">
                <p>${filter ? 'Nie znaleziono samochodów pasujących do wyszukiwania.' : 'Brak samochodów w systemie. Kliknij "Dodaj Auto", aby zacząć.'}</p>
            </div>
        `;
        return;
    }

    carsGrid.innerHTML = filteredCars.map(car => `
        <div class="car-card" data-id="${car.id}">
            <h3>${car.brand}</h3>
            <div class="car-info-row">
                <span class="label">Cena</span>
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
                <p><strong>Wykonano:</strong><br>${car.history || 'Brak wpisów'}</p>
            </div>
            <div class="card-actions">
                <button class="btn-icon btn-edit" data-id="${car.id}" title="Edytuj">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                </button>
                <button class="btn-icon btn-delete" data-id="${car.id}" title="Usuń">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                </button>
            </div>
        </div>
    `).join('');

    // Attach event listeners to new buttons
    attachCardListeners();
}

function attachCardListeners() {
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.onclick = () => editCar(btn.dataset.id);
    });
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.onclick = () => deleteCar(btn.dataset.id);
    });
}

function updateStats() {
    totalCarsEl.textContent = cars.length;
    const totalValue = cars.reduce((sum, car) => sum + parseFloat(car.price || 0), 0);
    totalValueEl.textContent = formatCurrency(totalValue);
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
    // Clear checkboxes explicitly since reset() might not handle all UI states if customized
    document.querySelectorAll('input[name="todo"]').forEach(cb => cb.checked = false);
    carModal.classList.add('active');
});

closeModalBtn.addEventListener('click', () => {
    carModal.classList.remove('active');
});

window.onclick = (event) => {
    if (event.target === carModal) {
        carModal.classList.remove('active');
    }
};

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
        todo: todoList,
        dateAdded: id ? cars.find(c => c.id === id).dateAdded : new Date().toISOString()
    };

    try {
        if (id) {
            const carRef = doc(db, 'cars', id);
            await updateDoc(carRef, carData);
        } else {
            await addDoc(carsCol, carData);
        }
        carModal.classList.remove('active');
    } catch (error) {
        console.error("Error saving car: ", error);
        alert("Błąd podczas zapisywania danych w Firebase. Sprawdź konsolę.");
    }
});

async function deleteCar(id) {
    if (confirm('Czy na pewno chcesz usunąć ten samochód?')) {
        try {
            await deleteDoc(doc(db, 'cars', id));
        } catch (error) {
            console.error("Error deleting car: ", error);
            alert("Błąd podczas usuwania.");
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
