// ===== CONFIGURACIÓN Y ESTADO GLOBAL =====
const CONFIG = {
    DB_NAME: 'DelfinPedidosDB',
    DB_VERSION: 1,
    STORE_NAME: 'orders',
    API_KEY_STORAGE: 'gemini_api_key',
    DEFAULT_API_KEY: 'AIzaSyBOGOSEycyJF_bQtTd5WDp6Q9IgMs-9nSo' // API Key de delfin-14 (funcional)
};

let db = null;
let currentStream = null;
let currentImageData = null;

// ===== INICIALIZACIÓN =====
document.addEventListener('DOMContentLoaded', () => {
    initializeDB();
    initializeNavigation();
    initializeEventListeners();
    loadAPIKey();
    // loadOrders y updateStats se llaman dentro de initializeDB.onsuccess
});

// ===== INDEXEDDB =====
function initializeDB() {
    const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

    request.onerror = (event) => {
        console.error('Error al abrir IndexedDB:', event.target.error);
        showNotification('Error al inicializar la base de datos', 'error');
    };

    request.onsuccess = (event) => {
        db = event.target.result;
        console.log('Base de datos inicializada correctamente');
        loadOrders();
        updateStats();
    };

    request.onupgradeneeded = (event) => {
        db = event.target.result;

        if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
            const objectStore = db.createObjectStore(CONFIG.STORE_NAME, {
                keyPath: 'id',
                autoIncrement: true
            });
            objectStore.createIndex('orderNumber', 'orderNumber', { unique: false });
            objectStore.createIndex('clientName', 'clientName', { unique: false });
            objectStore.createIndex('clientNumber', 'clientNumber', { unique: false });
            objectStore.createIndex('date', 'date', { unique: false });
            objectStore.createIndex('status', 'status', { unique: false });
            objectStore.createIndex('timestamp', 'timestamp', { unique: false });
        }
    };
}

function saveOrderToDB(orderData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(CONFIG.STORE_NAME);

        // Verificar duplicados antes de guardar (si es necesario, pero aquí guardamos directo)
        // La verificación de duplicados se hace antes de llamar a esta función

        const order = {
            ...orderData,
            timestamp: new Date().toISOString()
        };

        const request = objectStore.add(order);

        request.onsuccess = () => {
            console.log('Pedido guardado correctamente');
            resolve(request.result);
        };

        request.onerror = () => {
            console.error('Error al guardar el pedido');
            reject(request.error);
        };
    });
}

function getAllOrders() {
    return new Promise((resolve, reject) => {
        if (!db) {
            resolve([]);
            return;
        }
        const transaction = db.transaction([CONFIG.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(CONFIG.STORE_NAME);
        const request = objectStore.getAll();

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

function deleteOrderFromDB(id) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(CONFIG.STORE_NAME);
        const request = objectStore.delete(id);

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

function clearAllOrders() {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(CONFIG.STORE_NAME);
        const request = objectStore.clear();

        request.onsuccess = () => {
            resolve();
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

// ===== NAVEGACIÓN =====
function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const section = item.dataset.section;
            navigateToSection(section);
        });
    });
}

function navigateToSection(sectionName) {
    // Ocultar todas las secciones
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });

    // Mostrar la sección seleccionada
    const targetSection = document.getElementById(`${sectionName}-section`);
    if (targetSection) {
        targetSection.classList.add('active');
    }

    // Actualizar navegación
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
    });

    const activeNavItem = document.querySelector(`.nav-item[data-section="${sectionName}"]`);
    if (activeNavItem) {
        activeNavItem.classList.add('active');
    }

    // Cargar datos si es necesario
    if (sectionName === 'data') {
        loadOrders();
        updateStats();
    } else if (sectionName === 'search') {
        loadSearchResults();
    }
}

// ===== EVENT LISTENERS =====
function initializeEventListeners() {
    // Botones de captura
    const btnCamera = document.getElementById('btn-camera');
    if (btnCamera) btnCamera.addEventListener('click', activateCamera);

    const btnGallery = document.getElementById('btn-gallery');
    if (btnGallery) btnGallery.addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    const btnExample = document.getElementById('btn-example');
    if (btnExample) btnExample.addEventListener('click', loadExampleOrder);

    // Controles de cámara
    const btnCapture = document.getElementById('btn-capture');
    if (btnCapture) btnCapture.addEventListener('click', capturePhoto);

    const btnCancelCamera = document.getElementById('btn-cancel-camera');
    if (btnCancelCamera) btnCancelCamera.addEventListener('click', stopCamera);

    // Input de archivo
    const fileInput = document.getElementById('file-input');
    if (fileInput) fileInput.addEventListener('change', handleFileSelect);

    // Modal
    const modalClose = document.getElementById('modal-close');
    if (modalClose) modalClose.addEventListener('click', closeModal);

    const btnDiscard = document.getElementById('btn-discard');
    if (btnDiscard) btnDiscard.addEventListener('click', closeModal);

    const btnSaveOrder = document.getElementById('btn-save-order');
    if (btnSaveOrder) btnSaveOrder.addEventListener('click', saveOrder);

    // Configuración
    const btnSaveConfig = document.getElementById('btn-save-config');
    if (btnSaveConfig) btnSaveConfig.addEventListener('click', saveConfiguration);

    const btnClearData = document.getElementById('btn-clear-data');
    if (btnClearData) btnClearData.addEventListener('click', clearAllData);

    // Exportar
    const btnExport = document.getElementById('btn-export');
    if (btnExport) btnExport.addEventListener('click', exportData);

    // Búsqueda
    const searchInput = document.getElementById('search-input');
    if (searchInput) searchInput.addEventListener('input', handleSearch);

    // Filtros
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.addEventListener('click', handleFilterClick);
    });
}

// ===== CÁMARA =====
async function activateCamera() {
    try {
        currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment' }
        });

        const video = document.getElementById('video');
        video.srcObject = currentStream;

        document.getElementById('camera-preview').classList.remove('hidden');
        document.querySelector('.scan-actions').style.display = 'none';
    } catch (error) {
        console.error('Error al acceder a la cámara:', error);
        showNotification('No se pudo acceder a la cámara', 'error');
    }
}

function stopCamera() {
    if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
        currentStream = null;
    }

    document.getElementById('camera-preview').classList.add('hidden');
    document.querySelector('.scan-actions').style.display = 'flex';
}

function capturePhoto() {
    const video = document.getElementById('video');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0);

    canvas.toBlob(async (blob) => {
        stopCamera();
        await processImage(blob);
    }, 'image/jpeg', 0.95);
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
        processImage(file);
    }
}

// ===== PROCESAMIENTO DE IMAGEN CON IA =====
async function processImage(imageBlob) {
    let apiKey = localStorage.getItem(CONFIG.API_KEY_STORAGE);

    // Si no hay API key guardada, usar la predeterminada
    if (!apiKey) {
        apiKey = CONFIG.DEFAULT_API_KEY;
        localStorage.setItem(CONFIG.API_KEY_STORAGE, apiKey);
    }

    showLoading(true);

    try {
        // Mostrar vista previa
        const imageUrl = URL.createObjectURL(imageBlob);
        const previewImg = document.getElementById('preview-img');
        if (previewImg) {
            previewImg.src = imageUrl;
            document.getElementById('image-preview').classList.remove('hidden');
        }

        // Convertir imagen a base64
        const base64Image = await blobToBase64(imageBlob);
        const base64Data = base64Image.split(',')[1];

        // Llamar a la API de Gemini (v1beta)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [
                        {
                            text: `Analiza esta imagen de un pedido y extrae la siguiente información en formato JSON:
{
  "clientName": "nombre del cliente",
  "clientNumber": "número de cliente",
  "orderNumber": "número de pedido",
  "date": "fecha en formato YYYY-MM-DD",
  "referenceNumber": "número de referencia del producto",
  "denomination": "denominación o descripción del producto",
  "quantityMeters": "cantidad en metros lineales (solo el número)",
  "status": "pendiente",
  "notes": "notas adicionales si las hay"
}

Si no puedes encontrar algún campo, usa valores por defecto razonables. Responde SOLO con el JSON, sin texto adicional.`
                        },
                        {
                            inline_data: {
                                mime_type: 'image/jpeg',
                                data: base64Data
                            }
                        }
                    ]
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('API Error Details:', errorData);
            throw new Error(`Error API (${response.status}): ${errorData.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const extractedText = data.candidates[0].content.parts[0].text;

        // Extraer JSON del texto
        const jsonMatch = extractedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const orderData = JSON.parse(jsonMatch[0]);
            currentImageData = imageUrl;
            showOrderReviewModal(orderData);
        } else {
            throw new Error('No se pudo extraer datos JSON de la respuesta');
        }

    } catch (error) {
        console.error('Error al procesar la imagen:', error);
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// ===== FUNCIONES DE CARGA Y GESTIÓN DE PEDIDOS =====
function loadOrders() {
    getAllOrders().then(orders => {
        // Ordenar por fecha (más reciente primero)
        orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        const container = document.getElementById('orders-list');
        if (!container) return;

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <h3 class="empty-state-title">No hay pedidos guardados</h3>
                    <p class="empty-state-description">Escanea un documento para comenzar</p>
                </div>
            `;
            return;
        }

        container.innerHTML = orders.map(order => createOrderCard(order)).join('');

        // Agregar event listeners para botones de eliminar
        document.querySelectorAll('.btn-delete-order').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(btn.dataset.id);
                deleteOrder(id);
            });
        });
    });
}

function createOrderCard(order) {
    const date = new Date(order.date).toLocaleDateString();
    const statusBadge = getStatusBadge(order.status);

    return `
        <div class="order-card">
            <div class="order-header">
                <span class="order-number">#${order.orderNumber || 'S/N'}</span>
                ${statusBadge}
            </div>
            <div class="order-details">
                <div class="detail-row">
                    <span class="detail-label">Cliente:</span>
                    <span class="detail-value">${order.clientName || 'Desconocido'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Fecha:</span>
                    <span class="detail-value">${date}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Producto:</span>
                    <span class="detail-value">${order.denomination || 'Sin descripción'}</span>
                </div>
                <div class="detail-row">
                    <span class="detail-label">Cantidad:</span>
                    <span class="detail-value">${order.quantityMeters || 0} m</span>
                </div>
            </div>
            <div class="order-actions">
                <button class="btn-delete-order" data-id="${order.id}">🗑️ Eliminar</button>
            </div>
        </div>
    `;
}

function getStatusBadge(status) {
    const badges = {
        'pendiente': '<span class="badge badge-warning">Pendiente</span>',
        'procesando': '<span class="badge badge-info">En Proceso</span>',
        'completado': '<span class="badge badge-success">Completado</span>'
    };
    return badges[status] || badges['pendiente'];
}

async function deleteOrder(id) {
    if (!confirm('¿Estás seguro de que quieres eliminar este pedido?')) {
        return;
    }

    try {
        await deleteOrderFromDB(parseInt(id));
        showNotification('Pedido eliminado correctamente', 'success');
        loadOrders();
        updateStats();
    } catch (error) {
        console.error('Error al eliminar:', error);
        showNotification('Error al eliminar el pedido', 'error');
    }
}

// ===== ESTADÍSTICAS =====
async function updateStats() {
    try {
        const orders = await getAllOrders();

        // Total de pedidos
        const totalEl = document.getElementById('stat-total');
        if (totalEl) totalEl.textContent = orders.length;

        // Pedidos de hoy
        const today = new Date().toISOString().split('T')[0];
        const todayOrders = orders.filter(order => order.date === today);
        const todayEl = document.getElementById('stat-today');
        if (todayEl) todayEl.textContent = todayOrders.length;

        // Pedidos pendientes
        const pendingOrders = orders.filter(order => order.status === 'pendiente');
        const pendingEl = document.getElementById('stat-pending');
        if (pendingEl) pendingEl.textContent = pendingOrders.length;

    } catch (error) {
        console.error('Error al actualizar estadísticas:', error);
    }
}

// ===== BÚSQUEDA =====
async function loadSearchResults(query = '', filter = 'all') {
    try {
        let orders = await getAllOrders();

        // Filtrar por búsqueda
        if (query) {
            query = query.toLowerCase();
            orders = orders.filter(order =>
                (order.orderNumber && order.orderNumber.toLowerCase().includes(query)) ||
                (order.clientName && order.clientName.toLowerCase().includes(query)) ||
                (order.clientNumber && order.clientNumber.toLowerCase().includes(query)) ||
                (order.referenceNumber && order.referenceNumber.toLowerCase().includes(query)) ||
                (order.denomination && order.denomination.toLowerCase().includes(query))
            );
        }

        // Filtrar por estado
        if (filter !== 'all') {
            orders = orders.filter(order => order.status === filter);
        }

        const searchResults = document.getElementById('search-results');
        if (!searchResults) return;

        if (orders.length === 0) {
            searchResults.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">🔍</div>
                    <h3 class="empty-state-title">No se encontraron resultados</h3>
                    <p class="empty-state-description">Intenta con otros términos de búsqueda</p>
                </div>
            `;
            return;
        }

        orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        searchResults.innerHTML = orders.map(order => createOrderCard(order)).join('');

        // Agregar event listeners
        searchResults.querySelectorAll('.btn-delete-order').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteOrder(btn.dataset.id);
            });
        });

    } catch (error) {
        console.error('Error en búsqueda:', error);
    }
}

function handleSearch(event) {
    const query = event.target.value;
    const activeChip = document.querySelector('.filter-chip.active');
    const activeFilter = activeChip ? activeChip.dataset.filter : 'all';
    loadSearchResults(query, activeFilter);
}

function handleFilterClick(event) {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.classList.remove('active');
    });

    event.target.classList.add('active');
    const filter = event.target.dataset.filter;
    const searchInput = document.getElementById('search-input');
    const query = searchInput ? searchInput.value : '';
    loadSearchResults(query, filter);
}

// ===== CONFIGURACIÓN =====
function loadAPIKey() {
    let apiKey = localStorage.getItem(CONFIG.API_KEY_STORAGE);

    // Si no hay API key guardada, usar la predeterminada
    if (!apiKey) {
        apiKey = CONFIG.DEFAULT_API_KEY;
        localStorage.setItem(CONFIG.API_KEY_STORAGE, apiKey);
    }

    const input = document.getElementById('api-key-input');
    if (input) input.value = apiKey;
}

function saveConfiguration() {
    const input = document.getElementById('api-key-input');
    if (!input) return;

    const apiKey = input.value.trim();

    if (!apiKey) {
        showNotification('Por favor, ingresa una API key válida', 'warning');
        return;
    }

    localStorage.setItem(CONFIG.API_KEY_STORAGE, apiKey);
    showNotification('Configuración guardada correctamente', 'success');
}

async function clearAllData() {
    if (!confirm('¿Estás seguro de que quieres borrar TODOS los datos? Esta acción no se puede deshacer.')) {
        return;
    }

    try {
        await clearAllOrders();
        showNotification('Todos los datos han sido eliminados', 'success');
        loadOrders();
        updateStats();
    } catch (error) {
        console.error('Error al borrar datos:', error);
        showNotification('Error al borrar los datos', 'error');
    }
}

// ===== EXPORTAR DATOS =====
async function exportData() {
    try {
        const orders = await getAllOrders();

        if (orders.length === 0) {
            showNotification('No hay datos para exportar', 'warning');
            return;
        }

        const dataStr = JSON.stringify(orders, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `pedidos_${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        URL.revokeObjectURL(url);
        showNotification('Datos exportados correctamente', 'success');

    } catch (error) {
        console.error('Error al exportar:', error);
        showNotification('Error al exportar los datos', 'error');
    }
}

// ===== EJEMPLO =====
function loadExampleOrder() {
    const exampleData = {
        clientName: 'Empresa Ejemplo S.L.',
        clientNumber: 'CLI-12345',
        orderNumber: 'PED-2024-001',
        date: new Date().toISOString().split('T')[0],
        referenceNumber: 'REF-ABC-789',
        denomination: 'Perfil de Aluminio Premium',
        quantityMeters: 125.50,
        status: 'pendiente',
        notes: 'Entrega urgente - Cliente preferente'
    };

    // Crear una imagen de ejemplo (1x1 pixel transparente) para que no falle al guardar
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 1, 1);

    canvas.toBlob((blob) => {
        const imageUrl = URL.createObjectURL(blob);
        currentImageData = imageUrl;
        showOrderReviewModal(exampleData);
    }, 'image/png');
}

// ===== MODAL Y GUARDADO =====
function showOrderReviewModal(orderData) {
    document.getElementById('client-name').value = orderData.clientName || '';
    document.getElementById('client-number').value = orderData.clientNumber || '';
    document.getElementById('order-number').value = orderData.orderNumber || '';
    document.getElementById('order-date').value = orderData.date || new Date().toISOString().split('T')[0];
    document.getElementById('reference-number').value = orderData.referenceNumber || '';
    document.getElementById('denomination').value = orderData.denomination || '';
    document.getElementById('quantity-meters').value = orderData.quantityMeters || '';
    document.getElementById('status').value = orderData.status || 'pendiente';
    document.getElementById('notes').value = orderData.notes || '';

    document.getElementById('review-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('review-modal').classList.remove('active');
    document.getElementById('image-preview').classList.add('hidden');
    currentImageData = null;
}

async function saveOrder() {
    const orderData = {
        clientName: document.getElementById('client-name').value,
        clientNumber: document.getElementById('client-number').value,
        orderNumber: document.getElementById('order-number').value,
        date: document.getElementById('order-date').value,
        referenceNumber: document.getElementById('reference-number').value,
        denomination: document.getElementById('denomination').value,
        quantityMeters: parseFloat(document.getElementById('quantity-meters').value) || 0,
        status: document.getElementById('status').value,
        notes: document.getElementById('notes').value,
        imageData: currentImageData
    };

    // Verificar duplicados
    const isDuplicate = await checkDuplicateOrder(orderData.orderNumber);

    if (isDuplicate) {
        if (!confirm(`Ya existe un pedido con el número ${orderData.orderNumber}. ¿Deseas reemplazarlo?`)) {
            showNotification('Guardado cancelado', 'info');
            return;
        }
        // Si decide reemplazar, buscamos el ID del anterior y lo borramos
        // (O podríamos actualizarlo, pero borrar y crear es más simple aquí)
        const orders = await getAllOrders();
        const existingOrder = orders.find(o => o.orderNumber === orderData.orderNumber);
        if (existingOrder) {
            await deleteOrderFromDB(existingOrder.id);
            showNotification('Pedido anterior eliminado', 'info');
        }
    }

    try {
        await saveOrderToDB(orderData);
        showNotification('Pedido guardado correctamente', 'success');
        closeModal();
        loadOrders();
        updateStats();
        navigateToSection('data');
    } catch (error) {
        console.error('Error al guardar:', error);
        showNotification('Error al guardar el pedido', 'error');
    }
}

async function checkDuplicateOrder(orderNumber) {
    if (!orderNumber) return false;
    const orders = await getAllOrders();
    return orders.some(order => order.orderNumber === orderNumber);
}

// ===== UTILIDADES =====
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

function showNotification(message, type = 'info') {
    // Crear elemento de notificación
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        background: var(--bg-card);
        backdrop-filter: blur(20px);
        border: 1px solid hsla(220, 20%, 30%, 0.5);
        border-radius: var(--radius-md);
        box-shadow: var(--shadow-lg);
        z-index: 4000;
        max-width: 400px;
        animation: slideIn 0.3s ease-out;
    `;

    const colors = {
        success: 'var(--success-color)',
        error: 'var(--error-color)',
        warning: 'var(--warning-color)',
        info: 'var(--info-color)'
    };

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <span style="font-size: 1.5rem;">
                ${type === 'success' ? '✅' : type === 'error' ? '❌' : type === 'warning' ? '⚠️' : 'ℹ️'}
            </span>
            <span style="color: ${colors[type]}; font-weight: 600;">${message}</span>
        </div>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// Agregar animaciones CSS para notificaciones
const style = document.createElement('style');
style.textContent = `
    @keyframes slideIn {
        from {
            transform: translateX(400px);
            opacity: 0;
        }
        to {
            transform: translateX(0);
            opacity: 1;
        }
    }
    
    @keyframes slideOut {
        from {
            transform: translateX(0);
            opacity: 1;
        }
        to {
            transform: translateX(400px);
            opacity: 0;
        }
    }
`;
document.head.appendChild(style);
