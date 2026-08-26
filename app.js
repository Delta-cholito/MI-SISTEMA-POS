/* =========================================
   FIREBASE CLOUD SYNC
========================================= */
const firebaseConfig = {
    apiKey: "AIzaSyCBINg7c9gdJJhpFtEoKc4zKnnNplBmpDA",
    authDomain: "mi-sistema-de-ventas-ee0a8.firebaseapp.com",
    projectId: "mi-sistema-de-ventas-ee0a8",
    storageBucket: "mi-sistema-de-ventas-ee0a8.firebasestorage.app",
    messagingSenderId: "8414553586",
    appId: "1:8414553586:web:03c0b32b3fd62d05dd776b",
    measurementId: "G-TFR3DCNVP1"
};

firebase.initializeApp(firebaseConfig);
const cloudDB = firebase.firestore();

async function guardarVentaFirebase(venta){
    try { 
        await cloudDB.collection("ventas").add(venta); 
    } catch(error) { 
        console.error("Error guardando venta:", error); 
    }
}

async function guardarVentaNube(venta){
    try { 
        await cloudDB.collection("sales").add({ 
            ...venta, 
            syncedAt: new Date().toISOString() 
        }); 
    } catch(error) { 
        console.error("Error enviando venta a Firebase:", error); 
    }
}

// =================================================================
// #region CARGAR LIBRERÍA DE GRÁFICOS (CHART.JS)
// =================================================================
if (!window.Chart) {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
    document.head.appendChild(script);
}

// =================================================================
// #region CONFIGURACIÓN Y ESTADO INICIAL
// =================================================================

const DB_NAME = 'BusinessAppDB';
const DB_VERSION = 12; // Subimos versión para tablas actualizadas

let dbInstance = null;
let chartInstanceProducts = null;
let chartInstanceWeekly = null;

let state = {
    isAuthenticated: false,
    currentUser: null,       
    businessInfo: null,
    cashRegister: null,
    invoiceConfig: null, 
    currentCart: [], 
    currentPaymentMethod: 'Efectivo',
    inventoryList: [],       
    categoriesList: [],      
    invoiceCounter: { id: 1, count: 1 },       
    isCashierOpen: false,    
    editingProductId: null,  
    editingUserId: null,     
    salesList: [], 
    cashHistoryList: [], 
    cashPeriods: [],
    usersList: []
};

let currentDebtorsList = [];

const initialData = {
    users: [{ 
        id: 1, 
        username: "admin", 
        password: "123", 
        role: "admin", 
        permissions: {
             'pos-section': true, 
             'inventory-section': true, 
             'cash-section': true, 
             'reports-section': true, 
             'admin-section': true, 
             'invoices-section': true
        } 
    }],
    businessInfo: { 
        id: 1, 
        businessName: "Mi Tienda Express", 
        ownerName: "Admin Propietario", 
        location: "Dirección de la Tienda", 
        phone: "8888-8888", 
        taxId: "J0000000000000", 
        slogan: "El mejor lugar para comprar" 
    },
    cashRegister: { 
        id: 1, 
        isOpen: false, 
        initialBalance: 0, 
        currentBalance: 0, 
        lastOpenDate: null, 
        user: null, 
        currentPeriodId: null 
    },
    invoiceCounter: { id: 1, count: 1 },
    invoiceConfig: { 
        id: 1, 
        margin: '5mm', 
        paperSize: '80mm', 
        copies: 1, 
        printType: 'manual' 
    },
    categories: [ 
        { name: "General" }, 
        { name: "Electrónica" }, 
        { name: "Alimentos" } 
    ]
};

// =================================================================
// #region SELECTORES HTML
// =================================================================

const appContainer = document.getElementById('app-container');
const loginSection = document.getElementById('login-section');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const navLinks = document.querySelectorAll('.sidebar-nav a');

// POS
const salesSearchInput = document.getElementById('sales-search-product');
const salesProductList = document.getElementById('sales-product-list');
const cartItemsList = document.getElementById('cart-items-list');
const cartTotalAmount = document.getElementById('cart-total-amount');
const paymentMethodSelect = document.getElementById('payment-method');
const finalizeSaleBtn = document.getElementById('finalize-sale-btn');

// Inventario
const productForm = document.getElementById('product-form');
const inventorySearchInput = document.getElementById('inventory-search-input');
const inventoryTableBody = document.getElementById('inventory-table-body');
const exportInventoryBtn = document.getElementById('export-inventory-btn');
const addCategoryBtn = document.getElementById('add-category-btn');
const inventoryFilterCategory = document.getElementById('inventory-filter-category');
const inventoryFilterLowStock = document.getElementById('inventory-filter-lowstock');
const categoryModal = document.getElementById('category-modal');
const closeCategoryModalBtn = document.getElementById('close-category-modal');
const categoryForm = document.getElementById('category-form');
const categoryListContainer = document.getElementById('category-list-container');

// Caja 
const cashStatusBox = document.getElementById('cash-status-box');
const cashHistoryTableBody = document.getElementById('cash-history-table-body');
const cashControlPanel = document.getElementById('cash-control-panel'); 

// Reportes
const salesReportsTableBody = document.getElementById('sales-reports-table-body');
const reportsTotalSales = document.getElementById('reports-total-sales');
const reportsTotalCost = document.getElementById('reports-total-cost');
const reportsTotalProfit = document.getElementById('reports-total-profit');
const reportCashPeriodSelect = document.getElementById('report-cash-period');

// Admin 
const userForm = document.getElementById('user-form');
const userTableBody = document.getElementById('user-table-body');
const resetDbBtn = document.getElementById('reset-db-btn');
const userPermissionsFieldset = document.getElementById('user-permissions-fieldset');
const userRoleSelect = document.getElementById('user-role');
const businessInfoForm = document.getElementById('business-info-form');
const businessNameInput = document.getElementById('business-name-input');
const businessLocationInput = document.getElementById('business-location-input');
const businessPhoneInput = document.getElementById('business-phone-input');
const businessTaxIdInput = document.getElementById('business-tax-id-input');
const businessSloganInput = document.getElementById('business-slogan-input');

// =================================================================
// #region CORE - IndexedDB
// =================================================================

const getTransaction = (storeNames, mode) => {
    return dbInstance.transaction(Array.isArray(storeNames) ? storeNames : [storeNames], mode);
};

const IDBRequest = (req) => {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result);
        req.onerror = (e) => reject(e);
    });
};

const putStoreObject = (storeName, object, key = undefined) => {
    return new Promise(async (resolve, reject) => {
        try {
            const store = getTransaction(storeName, 'readwrite').objectStore(storeName);
            const request = store.put(object, key);
            request.onsuccess = () => {
                if (store.keyPath === 'id' && store.autoIncrement && !object.id) {
                    object.id = request.result;
                }
                resolve(object);
            };
            request.onerror = (e) => reject(e);
        } catch (error) {
            reject(error);
        }
    });
};

const getStoreObject = (storeName, key) => {
    return new Promise(async (resolve, reject) => {
        try {
            resolve(await IDBRequest(getTransaction(storeName, 'readonly').objectStore(storeName).get(key)));
        } catch (error) {
            reject(error);
        }
    });
};

const getAllStoreObjects = (storeName) => {
    return new Promise(async (resolve, reject) => {
        try {
            resolve(await IDBRequest(getTransaction(storeName, 'readonly').objectStore(storeName).getAll()));
        } catch (error) {
            reject(error);
        }
    });
};

const deleteStoreObject = (storeName, key) => {
    return new Promise(async (resolve, reject) => {
        try {
            const tx = getTransaction(storeName, 'readwrite');
            tx.objectStore(storeName).delete(key);
            tx.oncomplete = () => resolve(true);
            tx.onerror = (e) => reject(e);
        } catch (error) {
            reject(error);
        }
    });
};

const getObjectByIndex = (storeName, indexName, key) => {
    return new Promise(async (resolve, reject) => {
        try {
            const req = getTransaction(storeName, 'readonly').objectStore(storeName).index(indexName).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = (e) => reject(e);
        } catch (error) {
            reject(error);
        }
    });
};

const openBusinessDB = () => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        
        request.onerror = () => reject(new Error("No se pudo conectar a la base de datos local."));
        
        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            const oldVersion = event.oldVersion;
            const tx = event.target.transaction;
            
            const storeConfigs = [
                { name: 'inventory', options: { keyPath: 'id', autoIncrement: true }, indexes: ['barcode', 'name', 'category'] },
                { name: 'sales', options: { keyPath: 'id', autoIncrement: true }, indexes: ['date', 'periodId'] },
                { name: 'cashHistory', options: { keyPath: 'id', autoIncrement: true } },
                { name: 'businessInfo', options: { keyPath: 'id' } },
                { name: 'cashRegister', options: { keyPath: 'id' } },
                { name: 'invoiceCounter', options: { keyPath: 'id' } },
                { name: 'invoiceConfig', options: { keyPath: 'id' } },
                { name: 'users', options: { keyPath: 'id', autoIncrement: true }, indexes: ['username'] },
                { name: 'categories', options: { keyPath: 'name' } },
                { name: 'cashPeriods', options: { keyPath: 'id', autoIncrement: true }, indexes: ['openDate', 'closeDate'] },
                { name: 'invoices', options: { keyPath: 'id', autoIncrement: true }, indexes: ['cliente', 'codigo'] },
                { name: 'billedPeriods', options: { keyPath: 'id', autoIncrement: true } }
            ];
            
            storeConfigs.forEach(config => {
                let store = db.objectStoreNames.contains(config.name) ? tx.objectStore(config.name) : db.createObjectStore(config.name, config.options);
                if (config.indexes) {
                    config.indexes.forEach(indexName => {
                        if (!store.indexNames.contains(indexName)) {
                            store.createIndex(indexName, indexName, { unique: indexName === 'barcode' || indexName === 'username' });
                        }
                    });
                }
            });

            if (oldVersion === 0 || !db.objectStoreNames.contains('invoiceConfig')) {
                tx.objectStore('businessInfo').put(initialData.businessInfo);
                tx.objectStore('cashRegister').put(initialData.cashRegister);
                tx.objectStore('invoiceCounter').put(initialData.invoiceCounter);
                tx.objectStore('invoiceConfig').put(initialData.invoiceConfig);
                
                tx.objectStore('users').openCursor().onsuccess = (e) => {
                    if (!e.target.result) tx.objectStore('users').add(initialData.users[0]);
                };
                
                initialData.categories.forEach(cat => tx.objectStore('categories').put(cat));
            }
        };
        
        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            resolve(dbInstance);
        };
    });
};

const deleteBusinessDB = () => {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            dbInstance.close();
            dbInstance = null;
        }
        const req = indexedDB.deleteDatabase(DB_NAME);
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(new Error("Fallo al eliminar."));
    });
};

const loadInitialData = async () => {
    try {
        state.businessInfo = await getStoreObject('businessInfo', 1) || initialData.businessInfo;
        state.cashRegister = await getStoreObject('cashRegister', 1) || initialData.cashRegister;
        state.invoiceCounter = await getStoreObject('invoiceCounter', 1) || initialData.invoiceCounter;
        state.invoiceConfig = await getStoreObject('invoiceConfig', 1) || initialData.invoiceConfig;
        
        state.inventoryList = await getAllStoreObjects('inventory');
        state.categoriesList = await getAllStoreObjects('categories');
        state.salesList = await getAllStoreObjects('sales');
        state.cashHistoryList = await getAllStoreObjects('cashHistory');
        state.cashPeriods = await getAllStoreObjects('cashPeriods');
        state.usersList = await getAllStoreObjects('users');
        
        state.isCashierOpen = state.cashRegister && state.cashRegister.isOpen;
        
        if (!state.isCashierOpen) {
            state.currentCart = [];
            updateCartUI();
        }
    } catch (error) {
        throw new Error("Fallo al cargar la información inicial.");
    }
};

// =================================================================
// #region UTILIDADES Y FORMATO
// =================================================================

const formatCurrency = (amount) => {
    const formatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2
    });
    return formatter.format(amount).replace('$', 'C$ ');
};

const formatDate = (dateString, includeTime = false) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    const options = { day: '2-digit', month: '2-digit', year: 'numeric' };
    if (includeTime) {
        options.hour = '2-digit';
        options.minute = '2-digit';
    }
    return date.toLocaleDateString('es-NI', options) + (includeTime ? ' ' + date.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit' }) : '');
};

const updateDateTimeDisplay = () => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('es-NI', { weekday: 'short', day: '2-digit', month: 'short' });
    const timeStr = now.toLocaleTimeString('es-NI', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    
    if(document.getElementById('current-date')) document.getElementById('current-date').textContent = dateStr;
    if(document.getElementById('current-time')) document.getElementById('current-time').textContent = timeStr;
};

const showAlert = (title, message, icon) => {
    if (typeof Swal !== 'undefined') {
        Swal.fire({
            title: title,
            html: message,
            icon: icon,
            toast: true,
            position: 'top-end',
            showConfirmButton: false,
            timer: 4000,
            timerProgressBar: true
        });
    } else {
        alert(`${title}: ${message}`);
    }
};

const showSection = (sectionId) => {
    document.querySelectorAll('.content-section').forEach(section => {
        section.classList.add('hidden');
    });
    
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
        targetSection.classList.remove('hidden');
    }

    document.querySelectorAll('.sidebar-nav a').forEach(link => {
        if (link.dataset.section === sectionId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    if (sectionId === 'cash-section') {
        renderCashStatus();
        renderCashHistory();
    }
    if (sectionId === 'inventory-section') {
        renderInventory();
    }
    if (sectionId === 'reports-section') {
        renderReportControls();
        renderReports();
    }
    if (sectionId === 'pos-section') {
        renderPOSProductList(salesSearchInput?.value || '');
        updateCartUI();
    }
    if (sectionId === 'invoices-section') {
        renderizarSeccionFacturas();
    }
    if (sectionId === 'admin-section') {
        renderUserManagement();
        renderBusinessInfoForm();
        togglePermissionsFieldset();
        renderAdminDebtors();
        renderBilledPeriods();
        renderInvoiceConfigForm();
    }
    
    if (document.getElementById('category-modal')) {
        document.getElementById('category-modal').classList.add('hidden');
    }
};

// =================================================================
// #region AUTENTICACIÓN
// =================================================================

const handleLogin = async (e) => {
    e.preventDefault();
    const u = document.getElementById('login-username').value;
    const p = document.getElementById('login-password').value;
    
    try {
        const user = await getObjectByIndex('users', 'username', u);
        
        if (user && user.password === p) {
            state.isAuthenticated = true;
            state.currentUser = user;
            
            await loadInitialData();
            initializeAppUI();
            showSection('pos-section');
            
            showAlert('Bienvenido', `Sesión iniciada como **${user.role.toUpperCase()}**.`, 'success');
            loginForm.reset();
            appContainer.classList.remove('hidden');
            loginSection.classList.add('hidden');
        } else {
            showAlert('Acceso Denegado', 'Credenciales incorrectas.', 'error');
        }
    } catch (error) {
        showAlert('Error', 'Fallo conexión con DB.', 'error');
    }
};

const handleLogout = () => {
    state.isAuthenticated = false;
    state.currentUser = null;
    appContainer.classList.add('hidden');
    loginSection.classList.remove('hidden');
    showAlert('Sesión Cerrada', 'Has cerrado la sesión.', 'info');
    showSection('login-section');
};

const applyPermissions = () => {
    const perms = state.currentUser ? state.currentUser.permissions : {};
    navLinks.forEach(link => {
        if (perms[link.dataset.section]) {
            link.classList.remove('hidden');
        } else {
            link.classList.add('hidden');
        }
    });
};

// =================================================================
// #region FACTURAS Y CRÉDITOS (DEUDORES)
// =================================================================

const registrarEnFacturas = async (nombreCliente, carrito) => {
    const totalCompra = carrito.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const fechaActual = new Date().toISOString();
    
    try {
        const facturas = await getAllStoreObjects('invoices');
        let facturaExistente = facturas.find(f => f.cliente.toLowerCase() === nombreCliente.toLowerCase());
        
        if (facturaExistente) {
            facturaExistente.items.push(...carrito);
            facturaExistente.totalDeuda += totalCompra;
            facturaExistente.fechaUltimaCompra = fechaActual;
            await putStoreObject('invoices', facturaExistente);
        } else {
            const codigoAleatorio = Math.floor(1000 + Math.random() * 9000).toString();
            await putStoreObject('invoices', {
                cliente: nombreCliente,
                codigo: codigoAleatorio,
                items: [...carrito],
                totalDeuda: totalCompra,
                fechaRegistro: fechaActual,
                fechaUltimaCompra: fechaActual
            });
        }
    } catch (error) {
        console.error(error);
    }
};

const renderizarSeccionFacturas = async () => {
    try {
        const allInvoices = await getAllStoreObjects('invoices');
        currentDebtorsList = allInvoices.filter(f => f.totalDeuda > 0 || f.items.length > 0);
        pintarTarjetasDeudores(currentDebtorsList, 'debtors-container', false);
    } catch (error) {
        console.error(error);
    }
};

const pintarTarjetasDeudores = (lista, destinoId = 'debtors-container', isHistorico = false, idPeriodo = null) => {
    const container = document.getElementById(destinoId);
    if (!container) return;
    
    if (lista.length === 0) {
        container.innerHTML = `<div class="card w-100"><p class="text-light" style="text-align:center;">No hay deudores activos en esta vista.</p></div>`;
        return;
    }

    container.innerHTML = lista.map(fac => {
        const printAction = isHistorico ? `imprimirFacturaHistorica(${idPeriodo}, ${fac.id})` : `imprimirFacturaDeudor(${fac.id})`;
        const editDataAction = isHistorico ? `editarDeudorHistorico(${idPeriodo}, ${fac.id})` : `editarDeudor(${fac.id})`;
        const editItemsAction = isHistorico ? `editarFacturaHistorica(${idPeriodo}, ${fac.id})` : `editarFacturaDeudor(${fac.id})`;
        const deleteAction = isHistorico ? `eliminarDeudorHistorico(${idPeriodo}, ${fac.id})` : `eliminarDeudor(${fac.id})`;

        return `
        <div class="debtor-card" id="debtor-card-${fac.codigo}">
            <div class="debtor-header">
                <div class="debtor-info">
                    <h3>${fac.cliente} <span class="debtor-code" style="margin-left:10px;">ID: #${fac.codigo}</span></h3>
                </div>
                <div class="dropdown">
                    <button class="icon-btn">⋮</button>
                    <div class="dropdown-content">
                        <button onclick="${printAction}"><span class="material-icons-outlined">print</span> Reimprimir Factura</button>
                        <button onclick="${editDataAction}"><span class="material-icons-outlined">edit</span> Modificar Datos</button>
                        <button onclick="${editItemsAction}"><span class="material-icons-outlined">receipt_long</span> Editar Artículos</button>
                        <button onclick="${deleteAction}"><span class="material-icons-outlined">delete</span> Eliminar / Poner Cero</button>
                    </div>
                </div>
            </div>
            <div style="max-height: 200px; overflow-y: auto;">
                <table class="debtor-table">
                    <thead>
                        <tr><th>Fecha</th><th>N° Factura</th><th>Desc.</th><th>Cant.</th><th>Total</th></tr>
                    </thead>
                    <tbody>
                        ${fac.items.map(i => `
                        <tr>
                            <td style="font-size:0.75rem;">${formatDate(i.fechaCompra || fac.fechaUltimaCompra)}</td>
                            <td style="font-size:0.75rem; font-weight:bold;">#${i.facturaId || '-'}</td>
                            <td>${i.name}</td>
                            <td>${i.quantity}</td>
                            <td style="text-align:right;">${formatCurrency(i.price * i.quantity)}</td>
                        </tr>`).join('')}
                    </tbody>
                </table>
            </div>
            <div class="debtor-total-box">TOTAL DEUDA: ${formatCurrency(fac.totalDeuda)}</div>
        </div>`;
    }).join('');
};

window.filterDebtors = () => {
    const input = document.getElementById('search-debtor-input');
    if (!input) return;
    const term = input.value.toLowerCase();
    pintarTarjetasDeudores(currentDebtorsList.filter(f => f.cliente.toLowerCase().includes(term) || f.codigo.includes(term)), 'debtors-container', false);
};

// -- ACCIONES DE LOS 3 PUNTITOS (ACTIVAS) --
window.imprimirFacturaDeudor = async (id) => {
    const fac = currentDebtorsList.find(f => f.id === id);
    if (!fac) return;
    
    // Obtenemos el N° Factura real del último ítem para mostrarlo, en vez del código
    const invId = fac.items.length > 0 ? fac.items[fac.items.length-1].facturaId : 'ESTADO-CTA';
    
    const pseudoSale = {
        invoiceId: invId,
        date: fac.fechaUltimaCompra,
        customer: `${fac.cliente} - Cód: #${fac.codigo}`,
        user: state.currentUser.username,
        items: fac.items.map(i => ({...i, subtotal: i.price * i.quantity})),
        total: fac.totalDeuda,
        paymentMethod: 'Crédito'
    };
    printReceipt(pseudoSale);
};

window.editarDeudor = async (id) => {
    const fac = currentDebtorsList.find(f => f.id === id);
    const { value: v } = await Swal.fire({
        title: 'Modificar Deudor',
        html: `
            <input id="sw-nom" class="swal2-input" value="${fac.cliente}">
            <input id="sw-cod" class="swal2-input" value="${fac.codigo}">
        `,
        preConfirm: () => {
            return {
                n: document.getElementById('sw-nom').value.trim(),
                c: document.getElementById('sw-cod').value.trim()
            };
        }
    });
    
    if (v) {
        fac.cliente = v.n;
        fac.codigo = v.c;
        await putStoreObject('invoices', fac);
        renderizarSeccionFacturas();
        showAlert('OK', 'Modificado.', 'success');
    }
};

window.eliminarDeudor = async (id) => {
    const result = await Swal.fire({
        title: '¿Poner a Cero?',
        text: "La tarjeta desaparecerá, pero el cliente seguirá existiendo en Administración con $0.",
        icon: 'warning',
        showCancelButton: true
    });
    
    if (result.isConfirmed) {
        const fac = await getStoreObject('invoices', id);
        fac.items = [];
        fac.totalDeuda = 0;
        await putStoreObject('invoices', fac);
        renderizarSeccionFacturas();
        showAlert('Cero', 'Cuenta saldada a cero.', 'success');
    }
};

window.editarFacturaDeudor = async (id) => {
    const fac = currentDebtorsList.find(f => f.id === id);
    let html = `<table style="width:100%; font-size:0.85rem; text-align:left;"><tr><th>Prod</th><th>Precio</th><th>Cant</th></tr>`;
    
    fac.items.forEach((item, index) => {
        html += `
        <tr>
            <td><input type="text" id="edi-nom-${index}" value="${item.name}" style="width:100%"></td>
            <td><input type="number" id="edi-pre-${index}" value="${item.price}" step="0.01" style="width:70px"></td>
            <td><input type="number" id="edi-can-${index}" value="${item.quantity}" style="width:60px"></td>
        </tr>`;
    });
    html += `</table>`;
    
    const { isConfirmed } = await Swal.fire({
        title: 'Editar Artículos y Saldos',
        html: html,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        preConfirm: () => {
            let nTot = 0;
            fac.items.forEach((item, index) => {
                item.name = document.getElementById(`edi-nom-${index}`).value;
                item.price = parseFloat(document.getElementById(`edi-pre-${index}`).value);
                item.quantity = parseInt(document.getElementById(`edi-can-${index}`).value);
                nTot += (item.price * item.quantity);
            });
            fac.totalDeuda = nTot;
        }
    });
    
    if (isConfirmed) {
        await putStoreObject('invoices', fac);
        renderizarSeccionFacturas();
        showAlert('OK', 'Recalculado.', 'success');
    }
};

// -- IMPRESIÓN MASIVA POR PERIODO (FORMATO INDIVIDUAL ORIGINAL) --
window.imprimirTodosLosDeudores = async () => {
    const dateStart = document.getElementById('invoice-date-start').value;
    const dateEnd = document.getElementById('invoice-date-end').value;
    
    if (!dateStart || !dateEnd) {
        return showAlert('Atención', 'Selecciona fecha inicio y fin.', 'warning');
    }
    
    const start = new Date(dateStart + "T00:00:00").getTime();
    const end = new Date(dateEnd + "T23:59:59").getTime();

    const facturasFiltradas = currentDebtorsList.filter(fac => {
        const facDate = new Date(fac.fechaUltimaCompra).getTime();
        return facDate >= start && facDate <= end;
    });
    
    if (facturasFiltradas.length === 0) {
        return showAlert('Sin resultados', 'No hay deudores en el periodo.', 'info');
    }

    // Configuración para imprimir uno por uno
    const business = state.businessInfo || { businessName: 'Mi Tienda', ownerName: '', location: '', phone: '', taxId: '', slogan: '' };
    const config = state.invoiceConfig || { margin: '5mm', paperSize: '80mm' };

    // Generar el HTML concatenado, usando page-break para separar cada cliente
    let allReceiptsHTML = facturasFiltradas.map(fac => {
        const totalItems = fac.items.reduce((sum, item) => sum + item.quantity, 0);
        const invId = fac.items.length > 0 ? fac.items[fac.items.length-1].facturaId : 'ESTADO-CTA';

        return `
        <div class="receipt" style="page-break-after: always; width: ${config.paperSize}; max-width: ${config.paperSize}; margin: 0 auto; padding: 5px; color: #000; font-family: 'Courier New', monospace;">
            <h2 style="text-align: center; margin-bottom: 5px;">${business.businessName.toUpperCase()}</h2>
            <p style="text-align: center; font-size: 0.8rem; margin-top: 0;">${business.ownerName}</p>
            <p style="text-align: center; font-size: 0.8rem; margin-top: 0;">${business.location || ''}</p>
            <p style="text-align: center; font-size: 0.8rem; margin-top: 0;">${business.phone ? `Tel: ${business.phone}` : ''}</p>
            <hr style="border-style: dashed; margin: 5px 0;">
            <p><strong>N° Factura:</strong> #${invId}</p>
            <p><strong>Cliente:</strong> ${fac.cliente} - Cód: #${fac.codigo}</p>
            <p><strong>Cajero:</strong> ${state.currentUser.username}</p>
            <hr style="border-style: dashed; margin: 5px 0;">
            
            <table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid #000;">
                        <th style="text-align:left; width:50%;">Desc</th>
                        <th style="text-align:center; width:15%;">Cant</th>
                        <th style="text-align:right; width:35%;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${fac.items.map(item => `
                        <tr>
                            <td style="text-align:left; padding:2px 0;">${item.name}</td>
                            <td style="text-align:center;">${item.quantity}</td>
                            <td style="text-align:right;">${formatCurrency(item.price * item.quantity)}</td>
                        </tr>
                        <tr style="font-size:0.75rem; color:#555;">
                            <td colspan="3" style="text-align:left; padding:0 0 5px 5px;">
                                ${formatCurrency(item.price)} c/u (Fac #${item.facturaId || '-'})
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            
            <hr style="border-style: dashed; margin: 5px 0;">
            <div style="font-size: 1.1rem; font-weight: bold; padding: 5px 0; display: flex; justify-content: space-between;">
                <span>TOTAL DEUDA</span>
                <span>${formatCurrency(fac.totalDeuda)}</span>
            </div>
            <p style="font-size: 0.85rem; text-align: center; margin-top: 15px;">Estado de Cuenta Generado</p>
        </div>
        `;
    }).join('');

    // Imprimir
    const printWindow = window.open('', '', 'height=600,width=400');
    printWindow.document.write(`
        <html>
            <head>
                <title>Corte Periodo</title>
                <style>
                    @media print { 
                        body { margin: 0; padding: 0; } 
                        @page { size: auto; margin: ${config.margin}; } 
                    }
                </style>
            </head>
            <body>${allReceiptsHTML}</body>
        </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();

    // Lógica de Corte a Cero
    const { value: periodName } = await Swal.fire({
        title: 'Corte de Periodo',
        text: '¿Guardar periodo y poner deudas a $0?',
        input: 'text',
        inputPlaceholder: 'Nombre (Ej: Quincena Marzo)',
        showCancelButton: true,
        confirmButtonText: 'Cortar a Cero'
    });
    
    if (periodName) {
        await putStoreObject('billedPeriods', {
            name: periodName,
            date: new Date().toISOString(),
            debtors: JSON.parse(JSON.stringify(facturasFiltradas))
        });
        
        for (let fac of facturasFiltradas) {
            const dbFac = await getStoreObject('invoices', fac.id);
            dbFac.items = [];
            dbFac.totalDeuda = 0;
            await putStoreObject('invoices', dbFac);
        }
        
        showAlert('Corte Exitoso', `El periodo se guardó y deudas están en $0.`, 'success');
        renderizarSeccionFacturas();
    }
};

// =================================================================
// #region ADMIN: HISTORIAL, DEUDORES Y CONFIGURACIÓN FACTURA
// =================================================================

const renderBilledPeriods = async () => {
    let tbody = document.getElementById('admin-billed-periods-table-body');
    if (!tbody) {
        const adminPanel = document.getElementById('admin-panel-footer');
        if (adminPanel) {
            const div = document.createElement('div');
            div.className = 'card mt-3';
            div.style.borderLeft = '4px solid var(--success-color)';
            div.innerHTML = `
                <h3>Periodos Facturados (Historial)</h3>
                <div class="table-container">
                    <table class="data-table">
                        <thead>
                            <tr><th>Nombre</th><th>Fecha Creado</th><th style="width: 130px;">Acciones</th></tr>
                        </thead>
                        <tbody id="admin-billed-periods-table-body"></tbody>
                    </table>
                </div>
            `;
            adminPanel.parentNode.insertBefore(div, adminPanel);
            tbody = document.getElementById('admin-billed-periods-table-body');
        }
    }
    if (!tbody) return;
    
    try {
        const periodos = await getAllStoreObjects('billedPeriods');
        periodos.sort((a,b) => new Date(b.date) - new Date(a.date));
        
        if (periodos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No hay periodos guardados.</td></tr>';
            return;
        }
        
        tbody.innerHTML = periodos.map(p => `
            <tr>
                <td><strong>${p.name}</strong></td>
                <td>${formatDate(p.date, true)}</td>
                <td style="text-align:right;">
                    <button onclick="verPeriodoHistorico(${p.id})" class="btn-success small-btn">
                        <span class="material-icons-outlined" style="font-size:1rem; vertical-align:middle;">visibility</span> Ver
                    </button>
                </td>
            </tr>
        `).join('');
    } catch(e) {
        console.error(e);
    }
};

window.verPeriodoHistorico = async (id) => {
    let modal = document.getElementById('historical-period-modal');
    if (!modal) {
        const div = document.createElement('div');
        div.id = 'historical-period-modal';
        div.className = 'modal hidden';
        div.innerHTML = `
            <div class="modal-content" style="max-width:90%; width:1200px; max-height:95vh;">
                <span class="close-btn" onclick="document.getElementById('historical-period-modal').classList.add('hidden')">&times;</span>
                <h2 id="historical-modal-title" style="margin-bottom: 20px;">Periodo Facturado</h2>
                <div id="historical-debtors-container" class="debtors-grid"></div>
            </div>
        `;
        document.body.appendChild(div);
        modal = document.getElementById('historical-period-modal');
    }
    
    const periodo = await getStoreObject('billedPeriods', id);
    if (!periodo) return;
    
    document.getElementById('historical-modal-title').textContent = `Periodo: ${periodo.name} (${formatDate(periodo.date)})`;
    pintarTarjetasDeudores(periodo.debtors, 'historical-debtors-container', true, id);
    modal.classList.remove('hidden');
};

window.imprimirFacturaHistorica = async (pid, did) => {
    const p = await getStoreObject('billedPeriods', pid);
    const f = p.debtors.find(x => x.id === did);
    if (!f) return;
    
    const invId = f.items.length > 0 ? f.items[f.items.length-1].facturaId : 'ESTADO-CTA';
    
    printReceipt({
        invoiceId: `${invId}`,
        date: p.date,
        customer: `${f.cliente}`,
        user: state.currentUser.username,
        items: f.items.map(i => ({...i, subtotal: i.price * i.quantity})),
        total: f.totalDeuda,
        paymentMethod: 'Crédito Cerrado'
    });
};

window.editarDeudorHistorico = async (pid, did) => {
    const p = await getStoreObject('billedPeriods', pid);
    const f = p.debtors.find(x => x.id === did);
    const { value: v } = await Swal.fire({
        title: 'Modificar Históricos',
        html: `
            <input id="sw-hn" class="swal2-input" value="${f.cliente}">
            <input id="sw-hc" class="swal2-input" value="${f.codigo}">
        `,
        preConfirm: () => ({ n: document.getElementById('sw-hn').value.trim(), c: document.getElementById('sw-hc').value.trim() })
    });
    
    if (v) {
        f.cliente = v.n;
        f.codigo = v.c;
        await putStoreObject('billedPeriods', p);
        verPeriodoHistorico(pid);
        showAlert('OK', 'Modificado.', 'success');
    }
};

window.editarFacturaHistorica = async (pid, did) => {
    const p = await getStoreObject('billedPeriods', pid);
    const f = p.debtors.find(x => x.id === did);
    let html = `<table style="width:100%; text-align:left;"><tr><th>Prod</th><th>Precio</th><th>Cant</th></tr>`;
    
    f.items.forEach((i, idx) => {
        html += `
        <tr>
            <td><input id="eh-n-${idx}" value="${i.name}" style="width:100%"></td>
            <td><input type="number" id="eh-p-${idx}" value="${i.price}" step="0.01" style="width:70px"></td>
            <td><input type="number" id="eh-c-${idx}" value="${i.quantity}" style="width:60px"></td>
        </tr>`;
    });
    html += `</table>`;
    
    const { isConfirmed } = await Swal.fire({
        title: 'Editar Histórico',
        html: html,
        width: '600px',
        showCancelButton: true,
        confirmButtonText: 'Guardar',
        preConfirm: () => {
            let nTot = 0;
            f.items.forEach((i, idx) => {
                i.name = document.getElementById(`eh-n-${idx}`).value;
                i.price = parseFloat(document.getElementById(`eh-p-${idx}`).value);
                i.quantity = parseInt(document.getElementById(`eh-c-${idx}`).value);
                nTot += (i.price * i.quantity);
            });
            f.totalDeuda = nTot;
        }
    });
    
    if (isConfirmed) {
        await putStoreObject('billedPeriods', p);
        verPeriodoHistorico(pid);
        showAlert('OK', 'Recalculado.', 'success');
    }
};

window.eliminarDeudorHistorico = async (pid, did) => {
    const res = await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true });
    if (res.isConfirmed) {
        const p = await getStoreObject('billedPeriods', pid);
        p.debtors = p.debtors.filter(d => d.id !== did);
        await putStoreObject('billedPeriods', p);
        verPeriodoHistorico(pid);
        showAlert('OK', 'Eliminado.', 'success');
    }
};

// -- BASE DE DATOS MAESTRA DE DEUDORES --
const renderAdminDebtors = async () => {
    let tbody = document.getElementById('admin-debtors-table-body');
    if (!tbody) {
        const adminPanel = document.getElementById('admin-panel-footer');
        if (adminPanel) {
            const div = document.createElement('div');
            div.className = 'card mt-3';
            div.innerHTML = `
                <h3>Base Maestra Deudores</h3>
                <div class="filter-controls mb-2" style="display:flex;gap:10px;">
                    <button onclick="exportDebtorsToExcel()" class="btn-primary-outline"><span class="material-icons-outlined">download</span> Exportar</button>
                    <label class="btn-secondary-outline" style="margin:0;cursor:pointer;">
                        <span class="material-icons-outlined">upload</span> Importar 
                        <input type="file" id="import-debtors-file" accept=".xlsx, .xls" style="display:none;" onchange="importDebtorsFromExcel(event)">
                    </label>
                </div>
                <div class="table-container">
                    <table class="data-table">
                        <thead><tr><th>Código</th><th>Nombre</th><th>Deuda Activa</th><th style="width:100px;">Editar</th></tr></thead>
                        <tbody id="admin-debtors-table-body"></tbody>
                    </table>
                </div>
            `;
            adminPanel.parentNode.insertBefore(div, adminPanel);
            tbody = document.getElementById('admin-debtors-table-body');
        }
    }
    if (!tbody) return;
    
    try {
        const facturas = await getAllStoreObjects('invoices');
        tbody.innerHTML = facturas.map(fac => `
            <tr>
                <td><strong>#${fac.codigo}</strong></td>
                <td>${fac.cliente}</td>
                <td class="text-danger"><strong>${formatCurrency(fac.totalDeuda)}</strong></td>
                <td style="text-align: right;">
                    <button onclick="editarDeudorAdmin(${fac.id})" class="btn-primary small-btn">
                        <span class="material-icons-outlined" style="font-size:1rem; vertical-align:middle;">edit</span>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (e) {
        console.error(e);
    }
};

window.editarDeudorAdmin = async (id) => {
    const fac = await getStoreObject('invoices', id);
    const { value: v } = await Swal.fire({
        title: 'Modificar Datos',
        html: `
            <label style="text-align:left; display:block;">Nombre:</label>
            <input id="a-nom" class="swal2-input" value="${fac.cliente}" style="margin-top:0;">
            <label style="text-align:left; display:block; margin-top:10px;">Código:</label>
            <input id="a-cod" class="swal2-input" value="${fac.codigo}" style="margin-top:0;">
        `,
        preConfirm: () => ({ n: document.getElementById('a-nom').value.trim(), c: document.getElementById('a-cod').value.trim() })
    });
    
    if (v) {
        fac.cliente = v.n;
        fac.codigo = v.c;
        await putStoreObject('invoices', fac);
        renderAdminDebtors();
        renderizarSeccionFacturas();
        showAlert('OK', 'Actualizado.', 'success');
    }
};

window.exportDebtorsToExcel = async () => {
    if (typeof XLSX === 'undefined') return showAlert('Error', 'Falta librería XLSX', 'error');
    const facturas = await getAllStoreObjects('invoices');
    if (facturas.length === 0) return showAlert('Aviso', 'Vacío', 'warning');
    
    const data = facturas.map(f => ({
        'CÓDIGO': f.codigo,
        'NOMBRE COMPLETO': f.cliente,
        'DEUDA TOTAL': f.totalDeuda
    }));
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "BD");
    XLSX.writeFile(workbook, `BD_Deudores.xlsx`);
};

window.importDebtorsFromExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
        try {
            const data = new Uint8Array(ev.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(sheet);
            let c = 0;
            
            for (let row of json) {
                if (row['NOMBRE COMPLETO'] && row['CÓDIGO']) {
                    await putStoreObject('invoices', {
                        cliente: row['NOMBRE COMPLETO'],
                        codigo: row['CÓDIGO'].toString(),
                        totalDeuda: parseFloat(row['DEUDA TOTAL']) || 0,
                        items: parseFloat(row['DEUDA TOTAL']) > 0 ? [{ name: "Saldo importado", quantity: 1, price: parseFloat(row['DEUDA TOTAL']) || 0, fechaCompra: new Date().toISOString() }] : [],
                        fechaUltimaCompra: new Date().toISOString(),
                        fechaRegistro: new Date().toISOString()
                    });
                    c++;
                }
            }
            renderAdminDebtors();
            renderizarSeccionFacturas();
            showAlert('OK', `${c} importados.`, 'success');
        } catch (err) {
            showAlert('Error', 'Formato mal.', 'error');
        }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
};

// -- CONFIGURACIÓN DE FACTURAS (NUEVO REQUERIMIENTO 80MM / 58MM) --
const renderInvoiceConfigForm = () => {
    let container = document.getElementById('invoice-config-card');
    if (!container) {
        const adminPanel = document.getElementById('admin-panel-footer');
        if (adminPanel) {
            container = document.createElement('div');
            container.id = 'invoice-config-card';
            container.className = 'card mt-3';
            adminPanel.parentNode.insertBefore(container, adminPanel);
        }
    }
    if (!container) return;

    const config = state.invoiceConfig || { margin: '5mm', paperSize: '80mm', copies: 1, printType: 'manual' };

    container.innerHTML = `
        <h3><span class="material-icons-outlined" style="vertical-align:middle;">settings</span> Configuración de Factura</h3>
        <form id="invoice-config-form">
            <div style="margin-bottom: 15px;">
                <label><strong>Tamaño del Papel Térmico:</strong></label>
                <div style="display: flex; gap: 15px;">
                    <label style="font-weight:normal;"><input type="radio" name="invPaper" value="80mm" ${config.paperSize === '80mm' ? 'checked' : ''}> 80mm</label>
                    <label style="font-weight:normal;"><input type="radio" name="invPaper" value="58mm" ${config.paperSize === '58mm' ? 'checked' : ''}> 58mm</label>
                </div>
            </div>
            <div style="margin-bottom: 15px;">
                <label><strong>Márgenes de Impresión:</strong></label>
                <div style="display: flex; gap: 15px; flex-wrap: wrap;">
                    <label style="font-weight:normal;"><input type="radio" name="invMargin" value="0mm" ${config.margin === '0mm' ? 'checked' : ''}> Sin margen (0mm)</label>
                    <label style="font-weight:normal;"><input type="radio" name="invMargin" value="5mm" ${config.margin === '5mm' ? 'checked' : ''}> Pequeño (5mm)</label>
                    <label style="font-weight:normal;"><input type="radio" name="invMargin" value="10mm" ${config.margin === '10mm' ? 'checked' : ''}> Medio (10mm)</label>
                    <label style="font-weight:normal;"><input type="radio" name="invMargin" value="15mm" ${config.margin === '15mm' ? 'checked' : ''}> Grande (15mm)</label>
                    <label style="font-weight:normal;"><input type="radio" name="invMargin" value="20mm" ${config.margin === '20mm' ? 'checked' : ''}> Extra (20mm)</label>
                </div>
            </div>
            <div style="margin-bottom: 15px;">
                <label><strong>Cantidad a Imprimir:</strong></label>
                <div style="display: flex; gap: 15px;">
                    <label style="font-weight:normal;"><input type="radio" name="invCopies" value="1" ${config.copies == 1 ? 'checked' : ''}> Una vez (1 Copia)</label>
                    <label style="font-weight:normal;"><input type="radio" name="invCopies" value="2" ${config.copies == 2 ? 'checked' : ''}> Dos veces (2 Copias)</label>
                </div>
            </div>
            <div style="margin-bottom: 15px;">
                <label><strong>Tipo de Impresión en Venta:</strong></label>
                <div style="display: flex; gap: 15px;">
                    <label style="font-weight:normal;"><input type="radio" name="invPrintType" value="auto" ${config.printType === 'auto' ? 'checked' : ''}> Automática (Directo al terminar)</label>
                    <label style="font-weight:normal;"><input type="radio" name="invPrintType" value="manual" ${config.printType === 'manual' ? 'checked' : ''}> Manual (Preguntar antes)</label>
                </div>
            </div>
            <button type="submit" class="btn-primary w-100">Guardar Configuración</button>
        </form>
    `;

    document.getElementById('invoice-config-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const newConfig = {
            id: 1,
            margin: fd.get('invMargin'),
            paperSize: fd.get('invPaper'),
            copies: parseInt(fd.get('invCopies')),
            printType: fd.get('invPrintType')
        };
        await putStoreObject('invoiceConfig', newConfig);
        state.invoiceConfig = newConfig;
        showAlert('Guardado', 'Configuración de facturas actualizada.', 'success');
    });
};

// =================================================================
// #region ADMIN - GESTIÓN DE USUARIOS
// =================================================================

const togglePermissionsFieldset = () => {
    if (!userRoleSelect || !userPermissionsFieldset) return;
    if (userRoleSelect.value === 'admin') {
        userPermissionsFieldset.disabled = true;
        userPermissionsFieldset.querySelectorAll('input[type="checkbox"]').forEach(chk => { chk.checked = true; });
    } else {
        userPermissionsFieldset.disabled = false;
    }
};

const resetUserForm = () => {
    if (userForm) userForm.reset();
    const submitBtn = document.getElementById('user-submit-btn');
    if (submitBtn) submitBtn.textContent = 'Crear Nuevo Usuario';
    state.editingUserId = null;
    const passwordInput = document.getElementById('user-password');
    if (passwordInput) passwordInput.setAttribute('required', 'required');
    if (userPermissionsFieldset) {
        userPermissionsFieldset.querySelectorAll('input[type="checkbox"]').forEach(chk => { chk.checked = false; });
    }
    togglePermissionsFieldset();
};
window.resetUserForm = resetUserForm; 

const handleEditUser = (id) => {
    const user = state.usersList.find(u => u.id === id);
    if (!user) return;
    state.editingUserId = id;
    document.getElementById('user-username').value = user.username;
    document.getElementById('user-role').value = user.role;
    document.getElementById('user-password').value = '';
    document.getElementById('user-password').removeAttribute('required');
    document.getElementById('user-submit-btn').textContent = 'Guardar Cambios';
    const permissions = user.permissions || {};
    if (userPermissionsFieldset) {
        userPermissionsFieldset.querySelectorAll('input[type="checkbox"]').forEach(chk => {
            chk.checked = permissions[chk.dataset.permission] === true;
        });
    }
    togglePermissionsFieldset();
    showAlert('Editando Usuario', `Modificando usuario: **${user.username}**`, 'info');
};

const handleDeleteUser = async (id) => {
    const user = state.usersList.find(u => u.id === id);
    if (!user) return;
    if (user.id === state.currentUser.id) {
        showAlert('Error', 'No puedes eliminar tu propia cuenta mientras está activa.', 'error');
        return;
    }
    const result = await Swal.fire({ title: '¿Eliminar Usuario?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Eliminar' });
    if (result.isConfirmed) {
        try {
            await deleteStoreObject('users', id);
            await loadInitialData();
            renderUserManagement();
            showAlert('Borrado', 'Usuario eliminado.', 'success');
        } catch (error) {
            showAlert('Error', 'No se pudo eliminar el usuario.', 'error');
        }
    }
};

const renderUserManagement = () => {
    if (!userTableBody) return;
    userTableBody.innerHTML = '';
    if (state.usersList.length === 0) {
        userTableBody.innerHTML = '<tr><td colspan="4" style="text-align:center;">No hay usuarios.</td></tr>';
        return;
    }
    state.usersList.forEach(u => {
        const row = document.createElement('tr');
        const roleDisplay = u.role === 'admin' ? '<span class="text-danger">ADMIN</span>' : 'OPERADOR';
        const isCurrent = u.id === state.currentUser.id;
        row.innerHTML = `
            <td>#${u.id}</td>
            <td>${u.username} ${isCurrent ? '**(Tú)**' : ''}</td>
            <td>${roleDisplay}</td>
            <td style="text-align: right;">
                <button onclick="handleEditUser(${u.id})" class="btn-primary small-btn">Editar</button>
                <button onclick="handleDeleteUser(${u.id})" class="btn-danger small-btn" ${isCurrent ? 'disabled' : ''}>Eliminar</button>
            </td>
        `;
        userTableBody.appendChild(row);
    });
    resetUserForm();
    togglePermissionsFieldset();
};

const handleUserSubmit = async (e) => {
    e.preventDefault();
    const isEditing = state.editingUserId !== null;
    const submitBtn = document.getElementById('user-submit-btn');
    submitBtn.disabled = true;
    
    const newUsername = document.getElementById('user-username').value.trim();
    const newPassword = document.getElementById('user-password').value.trim();
    const newRole = document.getElementById('user-role').value;
    
    if (!isEditing && !newPassword) {
        showAlert('Error', 'La contraseña es requerida.', 'error');
        submitBtn.disabled = false;
        return;
    }
    
    const existingByUsername = state.usersList.find(u => u.username === newUsername && u.id !== state.editingUserId);
    if (existingByUsername) {
        showAlert('Error', 'El nombre de usuario ya está en uso.', 'error');
        submitBtn.disabled = false;
        return;
    }
    
    let permissions;
    if (newRole === 'admin') {
        permissions = initialData.users[0].permissions;
    } else {
        permissions = {};
        if (userPermissionsFieldset) {
            userPermissionsFieldset.querySelectorAll('input[type="checkbox"]').forEach(chk => {
                permissions[chk.dataset.permission] = chk.checked;
            });
        }
    }
    
    let userData;
    if (isEditing) {
        const existingUser = state.usersList.find(u => u.id === state.editingUserId);
        userData = { id: state.editingUserId, username: newUsername, role: newRole, permissions: permissions, password: newPassword || existingUser.password };
    } else {
        userData = { username: newUsername, password: newPassword, role: newRole, permissions: permissions };
    }
    
    try {
        await putStoreObject('users', userData);
        await loadInitialData();
        renderUserManagement();
        resetUserForm();
        submitBtn.disabled = false;
        showAlert('Éxito', `Usuario guardado.`, 'success');
    } catch (error) {
        showAlert('Error', 'No se pudo guardar el usuario.', 'error');
        submitBtn.disabled = false;
    }
};

window.handleEditUser = handleEditUser;
window.handleDeleteUser = handleDeleteUser; 

const handleBusinessInfoSubmit = async (e) => {
    e.preventDefault();
    const newData = {
        id: 1,
        businessName: businessNameInput.value.trim(),
        location: businessLocationInput.value.trim(),
        phone: businessPhoneInput.value.trim(),
        taxId: businessTaxIdInput.value.trim(),
        slogan: businessSloganInput.value.trim(),
        ownerName: state.businessInfo.ownerName
    };
    try {
        await putStoreObject('businessInfo', newData);
        state.businessInfo = newData;
        initializeAppUI();
        showAlert('Éxito', 'Los datos de la tienda se han actualizados.', 'success');
    } catch (error) {
        showAlert('Error', 'No se pudo guardar la información de la tienda.', 'error');
    }
};

const renderBusinessInfoForm = () => {
    if (!state.businessInfo) return;
    if (businessNameInput) businessNameInput.value = state.businessInfo.businessName || '';
    if (businessLocationInput) businessLocationInput.value = state.businessInfo.location || '';
    if (businessPhoneInput) businessPhoneInput.value = state.businessInfo.phone || '';
    if (businessTaxIdInput) businessTaxIdInput.value = state.businessInfo.taxId || '';
    if (businessSloganInput) businessSloganInput.value = state.businessInfo.slogan || '';
};

// =================================================================
// #region GESTIÓN DE CATEGORÍAS
// =================================================================

const handleShowCategoryModal = () => {
    renderCategoryList();
    categoryModal.classList.remove('hidden');
};

const handleCloseCategoryModal = () => {
    categoryModal.classList.add('hidden');
};

const handleCategorySubmit = async (e) => {
    e.preventDefault();
    const nameInput = document.getElementById('category-name');
    const categoryName = nameInput.value.trim();
    if (!categoryName) return showAlert('Error', 'El nombre no puede estar vacío.', 'error');
    
    try {
        await putStoreObject('categories', { name: categoryName });
        await loadInitialData();
        renderCategorySelects(state.categoriesList);
        renderCategoryList();
        nameInput.value = '';
        showAlert('Éxito', `Categoría guardada.`, 'success');
    } catch (error) {
        showAlert('Error', 'No se pudo guardar la categoría.', 'error');
    }
};

const handleDeleteCategory = async (categoryName) => {
    const result = await Swal.fire({ title: '¿Eliminar Categoría?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Eliminar' });
    if (result.isConfirmed) {
        try {
            await deleteStoreObject('categories', categoryName);
            await loadInitialData();
            renderCategorySelects(state.categoriesList);
            renderCategoryList();
            showAlert('Borrada', 'Categoría eliminada.', 'success');
        } catch (error) {
            showAlert('Error', 'No se pudo eliminar.', 'error');
        }
    }
};

const renderCategoryList = () => {
    if (!categoryListContainer) return;
    categoryListContainer.innerHTML = '';
    if (state.categoriesList.length === 0) {
        categoryListContainer.innerHTML = '<p class="text-light">No hay categorías.</p>';
        return;
    }
    
    state.categoriesList.forEach(cat => {
        const div = document.createElement('div');
        div.className = 'category-item';
        div.innerHTML = `<span>${cat.name}</span> <button class="btn-danger small-btn" onclick="handleDeleteCategory('${cat.name.replace(/'/g, "\\'")}')">❌</button>`;
        categoryListContainer.appendChild(div);
    });
};

const renderCategorySelects = (categories) => {
    const selects = document.querySelectorAll('#product-category, #inventory-filter-category');
    selects.forEach(select => {
        const currentSelected = select.value;
        select.innerHTML = '';
        
        if (select.id === 'inventory-filter-category') {
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = 'Todas las Categorías';
            select.appendChild(defaultOption);
        }
        categories.forEach(cat => {
            const option = document.createElement('option');
            option.value = cat.name;
            option.textContent = cat.name;
            select.appendChild(option);
        });
        
        if (select.querySelector(`option[value="${currentSelected}"]`)) {
            select.value = currentSelected;
        } else if (select.id === 'product-category' && categories.length > 0) {
            select.value = categories[0].name;
        }
    });
};
window.handleDeleteCategory = handleDeleteCategory;

// =================================================================
// #region GESTIÓN DE CAJA
// =================================================================

const logCashMovement = async (type, amount, description, periodId = null) => {
    const movement = {
        timestamp: new Date().toISOString(),
        type: type,
        amount: amount,
        description: description,
        user: state.currentUser.username,
        periodId: periodId || state.cashRegister?.currentPeriodId
    };
    try {
        await putStoreObject('cashHistory', movement);
    } catch (error) {
        console.error(error);
    }
};

const handleCashierOpen = async (e) => {
    e.preventDefault();
    const balance = parseFloat(e.target.querySelector('#cash-initial-balance').value);
    if (isNaN(balance) || balance < 0) return showAlert('Error', 'Ingrese saldo válido.', 'error');
    
    const newPeriod = {
        user: state.currentUser.username,
        openDate: new Date().toISOString(),
        initialBalance: balance,
        currentBalance: balance,
        closeDate: null,
        finalCount: null,
        difference: null,
        isClosed: false
    };
    
    const savedPeriod = await putStoreObject('cashPeriods', newPeriod);
    const newCashRegister = {
        id: 1,
        isOpen: true,
        initialBalance: balance,
        currentBalance: balance,
        lastOpenDate: newPeriod.openDate,
        user: state.currentUser.username,
        currentPeriodId: savedPeriod.id
    };
    
    try {
        await putStoreObject('cashRegister', newCashRegister);
        await logCashMovement('APERTURA', balance, `Apertura de caja. Periodo #${savedPeriod.id}`, savedPeriod.id);
        state.cashRegister = newCashRegister;
        
        await loadInitialData();
        renderCashStatus();
        renderCashHistory();
        showAlert('Caja Abierta', `Abierta con ${formatCurrency(balance)}.`, 'success');
    } catch (error) {
        showAlert('Error', 'No se pudo abrir caja.', 'error');
    }
};

const handleCashierClose = async (e) => {
    e.preventDefault();
    const finalCount = parseFloat(e.target.querySelector('#cash-final-count').value);
    if (isNaN(finalCount) || finalCount < 0) return showAlert('Error', 'Ingrese conteo final válido.', 'error');
    
    const currentBalance = state.cashRegister.currentBalance;
    const difference = finalCount - currentBalance;
    const periodId = state.cashRegister.currentPeriodId;
    
    await logCashMovement('CIERRE', finalCount, `Cierre. Conteo: ${formatCurrency(finalCount)}. Dif: ${formatCurrency(difference)}.`, periodId);
    
    const currentPeriod = await getStoreObject('cashPeriods', periodId);
    if (currentPeriod) {
        currentPeriod.closeDate = new Date().toISOString();
        currentPeriod.finalCount = finalCount;
        currentPeriod.difference = difference;
        currentPeriod.isClosed = true;
        await putStoreObject('cashPeriods', currentPeriod);
    }
    
    const newCashRegister = {
        id: 1,
        isOpen: false,
        initialBalance: 0,
        currentBalance: 0,
        lastOpenDate: null,
        user: state.currentUser.username,
        currentPeriodId: null
    };
    
    try {
        await putStoreObject('cashRegister', newCashRegister);
        state.cashRegister = newCashRegister;
        
        await loadInitialData();
        renderCashStatus();
        renderCashHistory();
        updateCartUI();
        
        const alertTitle = difference === 0 ? '¡Cuadre Perfecto! 🥳' : (difference > 0 ? '¡Sobrante! 📈' : '¡Faltante! 📉');
        const alertIcon = difference === 0 ? 'success' : (difference > 0 ? 'warning' : 'error');
        await Swal.fire({
            title: alertTitle,
            html: `Periodo <b>#${periodId}</b> cerrado.<br>Teórico: <b>${formatCurrency(currentBalance)}</b><br>Físico: <b>${formatCurrency(finalCount)}</b><br><br><b>DIF: ${formatCurrency(difference)}</b>`,
            icon: alertIcon
        });
    } catch (error) {
        showAlert('Error', 'No se pudo cerrar caja.', 'error');
    }
};

const renderCashStatus = () => {
    const cash = state.cashRegister;
    state.isCashierOpen = cash.isOpen;
    cashStatusBox.classList.remove('open', 'closed');
    
    if (cash.isOpen) {
        cashStatusBox.classList.add('open');
        cashStatusBox.innerHTML = `
            <h3><span class="material-icons-outlined">lock_open</span> CAJA ABIERTA</h3>
            <p><strong>Periodo:</strong> #${cash.currentPeriodId}</p>
            <p><strong>Cajero:</strong> ${cash.user}</p>
            <p style="font-size: 1.5rem; color: white; margin-top: 15px;">
                <strong>SALDO TEÓRICO: ${formatCurrency(cash.currentBalance)}</strong>
            </p>
        `;
    } else {
        cashStatusBox.classList.add('closed');
        cashStatusBox.innerHTML = `
            <h3><span class="material-icons-outlined">lock</span> CAJA CERRADA</h3>
            <p>Abra la caja para registrar ventas.</p>
        `;
    }
    
    if (cashControlPanel) {
        cashControlPanel.innerHTML = `
            <h2>Controles de Caja</h2>
            ${cash.isOpen ? 
                `<div class="cash-form">
                    <form id="cash-close-form">
                        <label>Conteo Final</label>
                        <input type="number" id="cash-final-count" required step="0.01" min="0" value="${cash.currentBalance.toFixed(2)}">
                        <button type="submit" class="btn-danger w-100 mt-2">CERRAR Y CUADRAR</button>
                    </form>
                </div>` 
                : 
                `<div class="cash-form">
                    <form id="cash-open-form">
                        <label>Saldo Inicial</label>
                        <input type="number" id="cash-initial-balance" required step="0.01" min="0" value="0.00">
                        <button type="submit" class="btn-success w-100 mt-2">ABRIR CAJA</button>
                    </form>
                </div>`
            }
        `;
        if (cash.isOpen) {
            document.getElementById('cash-close-form')?.addEventListener('submit', handleCashierClose);
        } else {
            document.getElementById('cash-open-form')?.addEventListener('submit', handleCashierOpen);
        }
    }
};

const renderCashHistory = () => {
    if (!cashHistoryTableBody) return;
    cashHistoryTableBody.innerHTML = '';
    const sortedPeriods = state.cashPeriods.sort((a, b) => new Date(b.openDate) - new Date(a.openDate));
    
    if (sortedPeriods.length === 0) {
        cashHistoryTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No hay periodos.</td></tr>';
        return;
    }
    
    sortedPeriods.forEach(period => {
        if (!period.isClosed && state.cashRegister.currentPeriodId !== period.id) return;
        
        const diff = period.difference || 0;
        const diffClass = diff === 0 ? 'text-success' : (diff > 0 ? 'text-primary' : 'text-danger');
        
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>#${period.id}</td>
            <td>${formatDate(period.openDate, true)}</td>
            <td>${period.isClosed ? formatDate(period.closeDate, true) : 'Abierta'}</td>
            <td>${formatCurrency(period.initialBalance)}</td>
            <td>${period.isClosed ? formatCurrency(period.finalCount) : formatCurrency(period.currentBalance)}</td>
            <td class="${diffClass}"><strong>${period.isClosed ? formatCurrency(diff) : 'N/A'}</strong></td>
        `;
        cashHistoryTableBody.appendChild(row);
    });
};

// =================================================================
// #region GESTIÓN DE INVENTARIO (CON VENCIMIENTO NUEVO)
// =================================================================

const injectExpiryInputs = () => {
    const pForm = document.getElementById('product-form');
    if (pForm && !document.getElementById('product-expiration')) {
        const btn = document.getElementById('product-submit-btn');
        const html = `
            <label for="product-expiration">Fecha de Vencimiento (Opcional)</label>
            <input type="date" id="product-expiration">
            <label for="product-notify-days">Días de aviso de vencimiento</label>
            <input type="number" id="product-notify-days" min="0" placeholder="Ej: 15">
        `;
        btn.insertAdjacentHTML('beforebegin', html);
    }
};

const handleEditProduct = (id) => {
    state.editingProductId = id;
    const product = state.inventoryList.find(p => p.id === id);
    if (product) {
        document.getElementById('product-name').value = product.name;
        document.getElementById('product-barcode').value = product.barcode || '';
        document.getElementById('product-category').value = product.category;
        document.getElementById('product-cost').value = (product.cost || 0).toFixed(2);
        document.getElementById('product-sale-price').value = (product.salePrice || 0).toFixed(2);
        document.getElementById('product-quantity').value = product.quantity;
        document.getElementById('product-min-stock').value = product.minStock;
        document.getElementById('product-image-url').value = product.imageUrl || '';
        
        if (document.getElementById('product-expiration')) {
            document.getElementById('product-expiration').value = product.expirationDate || '';
        }
        if (document.getElementById('product-notify-days')) {
            document.getElementById('product-notify-days').value = product.notifyDays || '';
        }
        
        document.getElementById('product-submit-btn').textContent = 'Guardar Cambios';
    }
};

const handleDeleteProduct = async (id) => {
    const product = state.inventoryList.find(p => p.id === id);
    if (!product) return;
    
    const result = await Swal.fire({ title: '¿Eliminar Producto?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí, Eliminar' });
    if (result.isConfirmed) {
        try {
            await deleteStoreObject('inventory', id);
            await loadInitialData();
            renderInventory();
            renderPOSProductList(salesSearchInput.value);
            showAlert('Borrado', 'Producto eliminado.', 'success');
        } catch (error) {
            showAlert('Error', 'No se pudo eliminar.', 'error');
        }
    }
};

const handleProductSubmit = async (e) => {
    e.preventDefault();
    const isEditing = state.editingProductId !== null;
    const submitBtn = document.getElementById('product-submit-btn');
    submitBtn.disabled = true;

    const expDate = document.getElementById('product-expiration')?.value || null;
    const notDays = document.getElementById('product-notify-days')?.value ? parseInt(document.getElementById('product-notify-days').value) : null;

    const productData = {
        name: document.getElementById('product-name').value.trim(),
        barcode: document.getElementById('product-barcode').value.trim() || null,
        category: document.getElementById('product-category').value,
        cost: parseFloat(document.getElementById('product-cost').value) || 0,
        salePrice: parseFloat(document.getElementById('product-sale-price').value) || 0,
        quantity: parseInt(document.getElementById('product-quantity').value) || 0,
        minStock: parseInt(document.getElementById('product-min-stock').value) || 0,
        imageUrl: document.getElementById('product-image-url').value.trim() || null,
        expirationDate: expDate,
        notifyDays: notDays,
        timesSold: isEditing ? (state.inventoryList.find(p => p.id === state.editingProductId)?.timesSold || 0) : 0
    };

    if (productData.barcode) {
        const existingByBarcode = state.inventoryList.find(p => p.barcode === productData.barcode && p.id !== state.editingProductId);
        if (existingByBarcode) {
            showAlert('Error', `Código de barras en uso por: ${existingByBarcode.name}`, 'error');
            submitBtn.disabled = false;
            return;
        }
    }

    try {
        if (isEditing) {
            await putStoreObject('inventory', { id: state.editingProductId, ...productData });
            showAlert('Actualizado', `Producto actualizado.`, 'success');
        } else {
            await putStoreObject('inventory', productData);
            showAlert('Creado', `Producto creado.`, 'success');
        }
        
        state.editingProductId = null;
        productForm.reset();
        submitBtn.textContent = 'Crear Producto';
        submitBtn.disabled = false;
        
        await loadInitialData();
        renderInventory();
        renderPOSProductList(salesSearchInput.value);
    } catch (error) {
        showAlert('Error', 'No se guardó el producto.', 'error');
        submitBtn.disabled = false;
    }
};

const renderInventory = (filteredList = null) => {
    if (!inventoryTableBody) return;
    const listToRender = filteredList || state.inventoryList;
    inventoryTableBody.innerHTML = '';
    
    if (listToRender.length === 0) {
        inventoryTableBody.innerHTML = '<tr><td colspan="8" style="text-align:center;">No se encontraron productos.</td></tr>';
        return;
    }
    
    const now = new Date();

    listToRender.forEach(p => {
        let stockClass = p.quantity <= p.minStock ? 'low-stock' : '';
        let expiryWarning = '';

        if (p.expirationDate) {
            const exp = new Date(p.expirationDate);
            const diffTime = exp - now;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            if (diffDays <= 0) {
                expiryWarning = `<span style="color:#dc3545; display:block; font-size:0.75rem; font-weight:bold;">¡VENCIDO!</span>`;
                stockClass = 'low-stock'; 
            } else if (p.notifyDays !== null && diffDays <= p.notifyDays) {
                expiryWarning = `<span style="color:#ffc107; display:block; font-size:0.75rem; font-weight:bold;">Vence en ${diffDays} días</span>`;
                if(!stockClass) stockClass = 'low-stock';
            }
        }

        const row = document.createElement('tr');
        row.className = stockClass;
        row.innerHTML = `
            <td>#${p.id}</td>
            <td>${p.name} ${expiryWarning}</td>
            <td>${p.barcode || 'N/A'}</td>
            <td>${p.category}</td>
            <td>${p.quantity}</td>
            <td>${formatCurrency(p.salePrice)}</td>
            <td>${p.timesSold}</td>
            <td style="text-align: right;">
                <button onclick="handleEditProduct(${p.id})" class="btn-primary small-btn">Editar</button>
                <button onclick="handleDeleteProduct(${p.id})" class="btn-danger small-btn">Eliminar</button>
            </td>
        `;
        inventoryTableBody.appendChild(row);
    });
    renderCategorySelects(state.categoriesList);
};

const filterInventory = () => {
    const searchTerm = inventorySearchInput.value.toLowerCase().trim();
    const categoryFilter = inventoryFilterCategory.value;
    const isLowStockFilterActive = inventoryFilterLowStock.classList.contains('active');
    
    let filtered = state.inventoryList.filter(p => {
        if (!(p.name.toLowerCase().includes(searchTerm) || (p.barcode && p.barcode.includes(searchTerm)))) return false;
        if (categoryFilter && p.category !== categoryFilter) return false;
        if (isLowStockFilterActive && p.quantity > p.minStock) return false;
        return true;
    });
    renderInventory(filtered);
};

const handleToggleLowStockFilter = () => {
    inventoryFilterLowStock.classList.toggle('active');
    filterInventory();
};

window.handleEditProduct = handleEditProduct;
window.handleDeleteProduct = handleDeleteProduct;


// =================================================================
// #region POS Y FINALIZAR VENTA SEGURO
// =================================================================

const renderPOSProductList = (searchTerm = '') => {
    if (!salesProductList) return;
    salesProductList.innerHTML = '';
    const term = searchTerm.toLowerCase().trim();
    
    const listToRender = state.inventoryList.filter(p => (p.name.toLowerCase().includes(term) || (p.barcode && p.barcode.includes(term))));
    
    if (listToRender.length === 0) {
        salesProductList.innerHTML = '<p class="text-light">No se encontraron productos.</p>';
        return;
    }

    listToRender.forEach(p => {
        const isOutOfStock = p.quantity <= 0;
        const card = document.createElement('div');
        card.className = isOutOfStock ? 'product-card out-of-stock' : 'product-card';
        card.onclick = () => isOutOfStock ? showAlert('Sin Stock', 'Agotado', 'warning') : addToCart(p.id);
        
        card.innerHTML = `
            <img src="${p.imageUrl || 'https://via.placeholder.com/80/007BFF/ffffff?text=Prod'}" onerror="this.src='https://via.placeholder.com/80/007BFF/ffffff?text=Prod'">
            <div class="product-info">
                <span class="product-name" title="${p.name}">${p.name}</span>
                <span class="product-price">${formatCurrency(p.salePrice)}</span>
                <span class="product-stock text-light-sm">Stock: ${p.quantity}</span>
            </div>
        `;
        salesProductList.appendChild(card);
    });
};

const addToCart = (productId) => {
    if (!state.isCashierOpen) {
        return showAlert('Caja Cerrada', 'Debe abrir caja.', 'error');
    }
    
    const product = state.inventoryList.find(p => p.id === productId);
    if (!product || product.quantity <= 0) {
        return showAlert('Sin Stock', 'Producto agotado.', 'error');
    }

    const cartItem = state.currentCart.find(item => item.id === productId);
    if (cartItem) {
        if (cartItem.quantity + 1 > product.quantity) {
            return showAlert('Límite de Stock', `Solo hay ${product.quantity}.`, 'warning');
        }
        cartItem.quantity++;
        cartItem.subtotal = cartItem.quantity * cartItem.price;
    } else {
        state.currentCart.push({
            id: product.id,
            name: product.name,
            price: product.salePrice,
            cost: product.cost || 0,
            quantity: 1,
            subtotal: product.salePrice
        });
    }
    updateCartUI();
};

const removeFromCart = (productId) => {
    const index = state.currentCart.findIndex(item => item.id === productId);
    if (index !== -1) {
        state.currentCart.splice(index, 1);
    }
    updateCartUI();
};

const updateCartItemQuantity = (productId, newQuantity) => {
    const item = state.currentCart.find(i => i.id === productId);
    if (!item) return;
    
    const product = state.inventoryList.find(p => p.id === productId);
    const quantity = parseInt(newQuantity);
    
    if (isNaN(quantity) || quantity <= 0) {
        return removeFromCart(productId);
    }
    
    if (quantity > product.quantity) {
        showAlert('Límite', `Solo hay ${product.quantity}.`, 'warning');
        item.quantity = product.quantity;
    } else {
        item.quantity = quantity;
    }
    
    item.subtotal = item.quantity * item.price;
    updateCartUI();
};

window.updateCartItemQuantity = updateCartItemQuantity;
window.removeFromCart = removeFromCart;

const updateCartUI = () => {
    if (!cartItemsList || !cartTotalAmount || !finalizeSaleBtn) return;
    
    const total = state.currentCart.reduce((sum, item) => sum + item.subtotal, 0);
    cartTotalAmount.textContent = formatCurrency(total);
    finalizeSaleBtn.disabled = state.currentCart.length === 0 || !state.isCashierOpen;
    
    if (!state.isCashierOpen) {
        cartItemsList.innerHTML = '<p class="text-light" style="text-align:center;">Caja cerrada.</p>';
        return;
    }
    if (state.currentCart.length === 0) {
        cartItemsList.innerHTML = '<p class="text-light" style="text-align:center;">Carrito vacío.</p>';
        return;
    }
    
    cartItemsList.innerHTML = `
        <table class="cart-table">
            <thead>
                <tr>
                    <th>Producto</th>
                    <th>Cant</th>
                    <th style="text-align:right;">Total</th>
                </tr>
            </thead>
            <tbody>
                ${state.currentCart.map(item => `
                <tr>
                    <td>${item.name}<br><small>${formatCurrency(item.price)}</small></td>
                    <td><input type="number" class="small-quantity-input" min="1" value="${item.quantity}" onchange="updateCartItemQuantity(${item.id}, this.value)"></td>
                    <td style="text-align: right;">
                        <strong>${formatCurrency(item.subtotal)}</strong>
                        <button onclick="removeFromCart(${item.id})" class="btn-danger small-btn" style="padding:2px 5px; margin-left:5px;">X</button>
                    </td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    `;
};

const handleFinalizeSale = async () => {
    if (state.currentCart.length === 0 || !state.isCashierOpen) return;
    
    const metodoPago = document.getElementById('payment-method').value;
    let clienteNombre = "Cliente General";
    let nombreParaImpresion = "Cliente General";

    try {
        let currentInvoiceNumber = 1;
        if (typeof state.invoiceCounter === 'number') {
            currentInvoiceNumber = state.invoiceCounter;
        } else if (state.invoiceCounter && typeof state.invoiceCounter.count === 'number') {
            currentInvoiceNumber = state.invoiceCounter.count;
        }

        if (metodoPago === 'Crédito') {
            const facturas = await getAllStoreObjects('invoices');
            const datalistOptions = facturas.map(f => `<option value="${f.codigo} - ${f.cliente}">`).join('');
            const fechaHoy = formatDate(new Date());

            const { value: nombreCapturado } = await Swal.fire({
                title: 'Registrar Deudor',
                html: `
                    <input list="debtors-datalist" id="swal-nombre" class="swal2-input" placeholder="Buscar Código o Ingresar Nombre...">
                    <datalist id="debtors-datalist">${datalistOptions}</datalist>
                    <div style="margin-top:15px; text-align:left; font-size:0.85rem;">
                        <strong>Resumen de compra:</strong>
                        <ul style="max-height:150px; overflow-y:auto; background:#f4f7f9; padding:10px; border-radius:5px; margin-top:5px;">
                            ${state.currentCart.map(i => `<li><b>${i.name}</b><br>Cant: ${i.quantity} | Total: ${formatCurrency(i.price * i.quantity)}</li>`).join('')}
                        </ul>
                    </div>
                `,
                preConfirm: () => {
                    const val = document.getElementById('swal-nombre').value.trim();
                    if (!val) Swal.showValidationMessage('Obligatorio ingresar nombre o seleccionar código');
                    return val;
                }
            });

            if (!nombreCapturado) return; 

            if (nombreCapturado.includes(' - ')) {
                clienteNombre = nombreCapturado.split(' - ')[1];
                nombreParaImpresion = `${clienteNombre} - Código: #${nombreCapturado.split(' - ')[0]}`;
            } else {
                clienteNombre = nombreCapturado;
                nombreParaImpresion = `${clienteNombre} (Nuevo)`;
            }

            const cartConFecha = state.currentCart.map(item => ({
                ...item,
                fechaCompra: new Date().toISOString(),
                facturaId: currentInvoiceNumber
            }));
            await registrarEnFacturas(clienteNombre, cartConFecha);
        }

        finalizeSaleBtn.disabled = true;
        
        const totalSale = state.currentCart.reduce((sum, item) => sum + item.subtotal, 0);
        const totalCost = state.currentCart.reduce((sum, item) => sum + ((item.cost || 0) * item.quantity), 0);
        const totalProfit = totalSale - totalCost;

        const saleRecord = {
            date: new Date().toISOString(),
            customer: nombreParaImpresion,
            items: state.currentCart,
            total: totalSale,
            cost: totalCost,
            profit: totalProfit,
            user: state.currentUser.username,
            paymentMethod: metodoPago,
            periodId: state.cashRegister.currentPeriodId,
            invoiceId: currentInvoiceNumber
        };

        await putStoreObject('sales', saleRecord);
        guardarVentaFirebase(saleRecord).catch(e => console.log('Firebase off', e));
        guardarVentaNube(saleRecord).catch(e => console.log('Nube off', e));

        for (const item of state.currentCart) {
            const product = state.inventoryList.find(p => p.id === item.id);
            if (product) {
                product.quantity -= item.quantity;
                product.timesSold += item.quantity;
                await putStoreObject('inventory', product);
            }
        }
        
        const nextInvoiceCount = currentInvoiceNumber + 1;
        await putStoreObject('invoiceCounter', { id: 1, count: nextInvoiceCount });
        state.invoiceCounter = { id: 1, count: nextInvoiceCount };

        if (metodoPago === 'Efectivo') {
            state.cashRegister.currentBalance += totalSale;
            await putStoreObject('cashRegister', state.cashRegister);
            await logCashMovement('VENTA', totalSale, `N° Factura #${saleRecord.invoiceId}`);
        }
        
        state.currentCart = [];
        await loadInitialData();
        updateCartUI();
        renderPOSProductList(salesSearchInput.value);
        renderCashStatus();

        const config = state.invoiceConfig || { copies: 1, printType: 'manual' };
        if (config.printType === 'auto') {
            Swal.fire({
                title: '¡Venta Exitosa!',
                text: `N° Factura #${saleRecord.invoiceId} procesada correctamente.`,
                icon: 'success',
                timer: 1500,
                showConfirmButton: false
            });
            printReceipt(saleRecord);
        } else {
            const result = await Swal.fire({
                title: '¡Venta Exitosa!',
                html: `N° Factura <b>#${saleRecord.invoiceId}</b><br>Total: <b>${formatCurrency(totalSale)}</b><br>Método: ${metodoPago}<br>Cliente: ${clienteNombre}`,
                icon: 'success',
                showCancelButton: true,
                confirmButtonText: 'Imprimir Factura',
                cancelButtonText: 'Cerrar'
            });
            if (result.isConfirmed) {
                printReceipt(saleRecord);
            }
        }

    } catch (error) {
        console.error(error);
        showAlert('Error', `Fallo al procesar venta. Detalles: ${error.message}`, 'error');
    } finally {
        finalizeSaleBtn.disabled = false;
    }
};

const printReceipt = (saleRecord) => {
    const business = state.businessInfo || { businessName: 'Mi Tienda', ownerName: '', location: '', phone: '', taxId: '', slogan: '' };
    const config = state.invoiceConfig || { margin: '5mm', paperSize: '80mm', copies: 1 };
    const totalItems = saleRecord.items.reduce((sum, item) => sum + item.quantity, 0);

    const receiptContent = `
        <div class="receipt" style="width: ${config.paperSize}; max-width: ${config.paperSize}; margin: 0 auto; padding: 5px; color: #000; font-family: 'Courier New', monospace;">
            <h2 style="text-align: center; margin-bottom: 5px;">${business.businessName.toUpperCase()}</h2>
            <p style="text-align: center; font-size: 0.8rem; margin-top: 0;">${business.ownerName}</p>
            <p style="text-align: center; font-size: 0.8rem; margin-top: 0;">${business.location || ''}</p>
            <p style="text-align: center; font-size: 0.8rem; margin-top: 0;">
                ${business.phone ? `Tel: ${business.phone}` : ''}
                ${business.taxId ? `| RUC: ${business.taxId}` : ''}
            </p>
            <hr style="border-style: dashed; margin: 5px 0;">
            <p><strong>N° Factura:</strong> #${saleRecord.invoiceId}</p>
            <p><strong>Fecha:</strong> ${new Date(saleRecord.date).toLocaleString('es-NI')}</p>
            <p><strong>Cliente:</strong> ${saleRecord.customer || 'Cliente General'}</p>
            <p><strong>Cajero:</strong> ${saleRecord.user}</p>
            <hr style="border-style: dashed; margin: 5px 0;">
            <table style="width: 100%; font-size: 0.85rem; border-collapse: collapse;">
                <thead>
                    <tr style="border-bottom: 1px solid #000;">
                        <th style="text-align: left; width: 50%;">Desc</th>
                        <th style="text-align: center; width: 15%;">Cant</th>
                        <th style="text-align: right; width: 35%;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${saleRecord.items.map(item => `
                        <tr>
                            <td style="text-align: left; padding: 2px 0;">${item.name}</td>
                            <td style="text-align: center;">${item.quantity}</td>
                            <td style="text-align: right;">${formatCurrency(item.subtotal)}</td>
                        </tr>
                        <tr style="font-size: 0.75rem; color: #555;">
                            <td colspan="3" style="text-align: left; padding: 0 0 5px 5px;">${formatCurrency(item.price)} x unidad</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <hr style="border-style: dashed; margin: 5px 0;">
            <div style="font-size: 1rem; font-weight: bold; padding: 5px 0; display: flex; justify-content: space-between;">
                <span>TOTAL (${totalItems} Prod)</span>
                <span>${formatCurrency(saleRecord.total)}</span>
            </div>
            <hr style="border-style: dashed; margin: 5px 0;">
            <p style="font-size: 0.85rem;">Método de Pago: <strong>${saleRecord.paymentMethod}</strong></p>
            <div style="text-align: center; margin-top: 15px; font-size: 0.75rem;">
                <p>${business.slogan || ''}</p>
                <p>¡Gracias por su compra!</p>
            </div>
        </div>
    `;

    let finalPrintHTML = receiptContent;
    if (parseInt(config.copies) === 2) {
        finalPrintHTML += `<div style="page-break-before: always; margin-top: 20px;"></div>` + receiptContent;
    }

    const printWindow = window.open('', '', 'height=600,width=400');
    printWindow.document.write(`
        <html>
            <head>
                <title>Factura POS</title>
                <style>
                    @media print { 
                        body { margin: 0; padding: 0; } 
                        @page { size: auto; margin: ${config.margin}; } 
                    }
                </style>
            </head>
            <body>${finalPrintHTML}</body>
        </html>
    `);
    printWindow.document.close();
    printWindow.onload = () => printWindow.print();
};
window.printReceipt = printReceipt;

// =================================================================
// #region REPORTES Y GRÁFICOS (NUEVO REQUERIMIENTO)
// =================================================================

const injectChartContainers = () => {
    let reportsSection = document.getElementById('reports-section');
    if (reportsSection && !document.getElementById('charts-container')) {
        const metricsGrid = reportsSection.querySelector('.metrics-grid').parentNode;
        const chartsHTML = `
            <div id="charts-container" class="grid-2-1 mt-3" style="display:grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="card" style="background:#fff; padding:15px; border-radius:8px; border-top: 4px solid var(--primary-color);">
                    <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                        <h3 style="margin:0; font-size:1.1rem;">Rendimiento Productos</h3>
                        <select id="chart-top-bottom-select" style="width:auto; padding:5px; border-radius:4px;" onchange="renderCharts()">
                            <option value="top">Top 10 Más Vendidos</option>
                            <option value="bottom">Top 10 Menos Vendidos</option>
                        </select>
                    </div>
                    <canvas id="productSalesChart"></canvas>
                </div>
                <div class="card" style="background:#fff; padding:15px; border-radius:8px; border-top: 4px solid var(--success-color);">
                    <h3 style="margin-top:0; font-size:1.1rem;">Ventas (Últimos 7 días)</h3>
                    <canvas id="weeklySalesChart"></canvas>
                </div>
            </div>
        `;
        metricsGrid.insertAdjacentHTML('afterend', chartsHTML);
    }
};

const renderReportControls = () => {
    if (!reportCashPeriodSelect) return;
    const periodsToRender = state.cashPeriods.filter(p => p.isClosed || p.id === state.cashRegister?.currentPeriodId);
    reportCashPeriodSelect.innerHTML = '<option value="">Todos los Periodos</option>';
    periodsToRender.sort((a, b) => new Date(b.openDate) - new Date(a.openDate)).forEach(period => {
        const option = document.createElement('option');
        option.value = period.id;
        option.textContent = `#${period.id} (${period.isClosed ? 'Cerrado' : 'Abierto'}) | ${formatDate(period.openDate)} - ${period.user}`;
        reportCashPeriodSelect.appendChild(option);
    });
};

const renderReports = (periodId = null) => {
    injectChartContainers();
    if (!salesReportsTableBody) return;
    
    let filteredSales = periodId ? state.salesList.filter(s => s.periodId === parseInt(periodId)) : state.salesList;

    const totalSales = filteredSales.reduce((sum, s) => sum + s.total, 0);
    const totalCost = filteredSales.reduce((sum, s) => sum + s.cost, 0);
    
    if (reportsTotalSales) reportsTotalSales.textContent = formatCurrency(totalSales);
    if (reportsTotalCost) reportsTotalCost.textContent = formatCurrency(totalCost);
    if (reportsTotalProfit) reportsTotalProfit.textContent = formatCurrency(totalSales - totalCost);

    salesReportsTableBody.innerHTML = '';
    if (filteredSales.length === 0) {
        salesReportsTableBody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No hay ventas registradas.</td></tr>';
    } else {
        filteredSales.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(sale => {
            const profitClass = sale.profit > 0 ? 'text-success' : (sale.profit < 0 ? 'text-danger' : '');
            const saleJson = JSON.stringify(sale).replace(/"/g, '&quot;');
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>#${sale.invoiceId}</td>
                <td>${formatDate(sale.date, true)}</td>
                <td>${sale.user}</td>
                <td>${sale.paymentMethod}</td>
                <td>${formatCurrency(sale.total)}</td>
                <td class="${profitClass}">${formatCurrency(sale.profit)}</td>
                <td style="text-align: right;">
                    <button onclick="printReceipt(${saleJson})" class="btn-primary small-btn">Imprimir</button>
                </td>
            `;
            salesReportsTableBody.appendChild(row);
        });
    }

    if (window.Chart) {
        window.renderCharts(filteredSales);
    } else {
        setTimeout(() => window.renderCharts(filteredSales), 500);
    }
};

window.renderCharts = (salesData = null) => {
    if (!window.Chart) return;
    const ctxProducts = document.getElementById('productSalesChart');
    const ctxWeekly = document.getElementById('weeklySalesChart');
    if (!ctxProducts || !ctxWeekly) return;

    let filteredSales = salesData;
    if (!filteredSales) {
        const periodId = document.getElementById('report-cash-period').value;
        filteredSales = periodId ? state.salesList.filter(s => s.periodId === parseInt(periodId)) : state.salesList;
    }

    // 1. Gráfico de Productos Más/Menos Vendidos
    let productSales = {};
    filteredSales.forEach(sale => {
        sale.items.forEach(item => {
            if(!productSales[item.name]) productSales[item.name] = 0;
            productSales[item.name] += item.quantity;
        });
    });
    
    let sortedProducts = Object.keys(productSales).map(k => ({name: k, qty: productSales[k]})).sort((a,b) => b.qty - a.qty);
    
    const selectView = document.getElementById('chart-top-bottom-select')?.value || 'top';
    let chartData = selectView === 'top' ? sortedProducts.slice(0, 10) : sortedProducts.slice(-10).reverse();
    let chartColor = selectView === 'top' ? '#007BFF' : '#dc3545';

    if (chartInstanceProducts) chartInstanceProducts.destroy();
    chartInstanceProducts = new Chart(ctxProducts, {
        type: 'bar',
        data: {
            labels: chartData.map(d => d.name),
            datasets: [{
                label: 'Unidades Vendidas',
                data: chartData.map(d => d.qty),
                backgroundColor: chartColor
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });

    // 2. Gráfico Ventas Últimos 7 Días
    let dailyData = {};
    let labelsSemana = [];
    let dataSemana = [];
    
    for(let i=6; i>=0; i--) {
        let d = new Date();
        d.setDate(d.getDate() - i);
        let dStr = d.toLocaleDateString('es-NI', { month:'short', day:'numeric' });
        dailyData[dStr] = 0;
        labelsSemana.push(dStr);
    }
    
    filteredSales.forEach(sale => {
        let dStr = new Date(sale.date).toLocaleDateString('es-NI', { month:'short', day:'numeric' });
        if(dailyData[dStr] !== undefined) {
            dailyData[dStr] += sale.total;
        }
    });
    
    labelsSemana.forEach(l => dataSemana.push(dailyData[l]));

    if (chartInstanceWeekly) chartInstanceWeekly.destroy();
    chartInstanceWeekly = new Chart(ctxWeekly, {
        type: 'bar',
        data: {
            labels: labelsSemana,
            datasets: [{
                label: 'Ventas Totales (C$)',
                data: dataSemana,
                backgroundColor: 'rgba(40, 167, 69, 0.7)',
                borderColor: '#28a745',
                borderWidth: 1
            }]
        },
        options: { responsive: true, scales: { y: { beginAtZero: true } } }
    });
};

const handleReportFilterSubmit = (e) => {
    e.preventDefault();
    renderReports(reportCashPeriodSelect.value);
};

const exportInventoryToExcel = () => {
    if (state.inventoryList.length === 0) return showAlert('Error', 'Inventario vacío.', 'warning');
    const dataForExport = state.inventoryList.map(p => ({
        ID: p.id,
        Nombre: p.name,
        'Cód. Barras': p.barcode || 'N/A',
        Categoría: p.category,
        'Stock Actual': p.quantity,
        'Stock Mínimo': p.minStock,
        'Precio Costo': p.cost,
        'Precio Venta': p.salePrice,
        'Veces Vendido': p.timesSold
    }));

    if (typeof XLSX === 'undefined') return showAlert('Error', 'Librería XLSX no cargada.', 'error');
    
    const worksheet = XLSX.utils.json_to_sheet(dataForExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventario");
    XLSX.writeFile(workbook, `Inventario_${new Date().toISOString().slice(0, 10)}.xlsx`);
    showAlert('Exportación Exitosa', 'Inventario exportado a Excel.', 'success');
};


// =================================================================
// #region ADMIN Y MANTENIMIENTO
// =================================================================

const handleDeleteDBConfirmation = () => {
    Swal.fire({
        title: '⚠️ Eliminar Base de Datos',
        text: '¡Esta acción es irreversible y eliminará TODO!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#dc3545',
        confirmButtonText: 'Sí, Eliminar Todo'
    }).then((result) => {
        if (result.isConfirmed) {
            deleteBusinessDB().then(() => {
                showAlert('Eliminada', 'Recargue la aplicación.', 'success');
                setTimeout(() => window.location.reload(), 1500);
            }).catch(e => showAlert('Error', e.message, 'error'));
        }
    });
};

// =================================================================
// #region INICIALIZACIÓN Y EVENTOS
// =================================================================

const initializeAppUI = () => {
    const sidebarBusinessName = document.getElementById('sidebar-business-name');
    const welcomeMessage = document.getElementById('welcome-message');
    const userRoleDisplay = document.getElementById('user-role-display');
    
    if (sidebarBusinessName) sidebarBusinessName.textContent = state.businessInfo?.businessName || 'POS App';
    if (welcomeMessage) welcomeMessage.textContent = `Bienvenido, ${state.currentUser.username}`;
    if (userRoleDisplay) userRoleDisplay.textContent = `(${state.currentUser.role.toUpperCase()})`;
    
    applyPermissions();
    renderCategorySelects(state.categoriesList);
    injectExpiryInputs();
    renderInventory();
    renderPOSProductList();
    updateCartUI();
    renderCashStatus();
};

const initEventListeners = () => {
    if (loginForm) loginForm.addEventListener('submit', handleLogin);
    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            showSection(e.currentTarget.dataset.section);
        });
    });

    if (productForm) productForm.addEventListener('submit', handleProductSubmit);
    if (inventorySearchInput) inventorySearchInput.addEventListener('input', filterInventory);
    if (inventoryFilterCategory) inventoryFilterCategory.addEventListener('change', filterInventory);
    if (inventoryFilterLowStock) inventoryFilterLowStock.addEventListener('click', handleToggleLowStockFilter);
    if (exportInventoryBtn) exportInventoryBtn.addEventListener('click', exportInventoryToExcel);
    if (addCategoryBtn) addCategoryBtn.addEventListener('click', handleShowCategoryModal);
    
    if (categoryForm) categoryForm.addEventListener('submit', handleCategorySubmit); 
    if (closeCategoryModalBtn) closeCategoryModalBtn.addEventListener('click', handleCloseCategoryModal);
    
    if (salesSearchInput) salesSearchInput.addEventListener('input', (e) => renderPOSProductList(e.target.value));
    if (finalizeSaleBtn) finalizeSaleBtn.addEventListener('click', handleFinalizeSale);

    if(document.getElementById('report-filter-form')) document.getElementById('report-filter-form').addEventListener('submit', handleReportFilterSubmit);
    
    if(userForm) userForm.addEventListener('submit', handleUserSubmit);
    if(userRoleSelect) userRoleSelect.addEventListener('change', togglePermissionsFieldset); 
    if(businessInfoForm) businessInfoForm.addEventListener('submit', handleBusinessInfoSubmit);
    if(resetDbBtn) resetDbBtn.addEventListener('click', handleDeleteDBConfirmation);

    const btnPrintAllDebtors = document.getElementById('btn-print-all-debtors');
    if (btnPrintAllDebtors) btnPrintAllDebtors.addEventListener('click', window.imprimirTodosLosDeudores);

    setInterval(updateDateTimeDisplay, 1000);
    updateDateTimeDisplay(); 
};

const initApp = async () => {
    try {
        await openBusinessDB();
        initEventListeners();
    } catch (error) {
        console.error("Fallo crítico:", error);
        showAlert('Error Crítico', 'La aplicación no pudo inicializarse. Limpia la base de datos.', 'error');
    }
};

window.addEventListener('load', initApp);