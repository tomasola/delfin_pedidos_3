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


function saveOrderToDB(orderData) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(CONFIG.STORE_NAME);

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
    document.getElementById('btn-camera').addEventListener('click', activateCamera);
    document.getElementById('btn-gallery').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });
    document.getElementById('btn-example').addEventListener('click', loadExampleOrder);

    // Controles de cámara
    document.getElementById('btn-capture').addEventListener('click', capturePhoto);
    document.getElementById('btn-cancel-camera').addEventListener('click', stopCamera);

    // Input de archivo
    document.getElementById('file-input').addEventListener('change', handleFileSelect);

    // Modal
    document.getElementById('modal-close').addEventListener('click', closeModal);
    document.getElementById('btn-discard').addEventListener('click', closeModal);
    document.getElementById('btn-save-order').addEventListener('click', saveOrder);

    // Configuración
    document.getElementById('btn-save-config').addEventListener('click', saveConfiguration);
    document.getElementById('btn-clear-data').addEventListener('click', clearAllData);

    // Exportar
    document.getElementById('btn-export').addEventListener('click', exportData);

    // Búsqueda
    document.getElementById('search-input').addEventListener('input', handleSearch);

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
        previewImg.src = imageUrl;
        document.getElementById('image-preview').classList.remove('hidden');

        // Convertir imagen a base64
        const base64Image = await blobToBase64(imageBlob);
        const base64Data = base64Image.split(',')[1];

        // Llamar a la API de Gemini
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
            throw new Error('Error en la respuesta de la API');
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
            throw new Error('No se pudo extraer datos de la imagen');
        }

    } catch (error) {
        console.error('Error al procesar la imagen:', error);
        showNotification(`Error al procesar la imagen: ${error.message}`, 'error');
    } finally {
        showLoading(false);
    }
}

// Función para cargar un pedido de ejemplo
async function loadExampleOrder() {
    // Crear una imagen de ejemplo (1x1 pixel transparente)
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillRect(0, 0, 1, 1);

    canvas.toBlob(async (blob) => {
        // Simular datos de ejemplo sin llamar a la API
        const exampleData = {
            clientName: 'Cliente Ejemplo S.L.',
            clientNumber: 'CLI-12345',
            orderNumber: 'PED-' + Date.now(),
            date: new Date().toISOString().split('T')[0],
            referenceNumber: 'REF-ABC-123',
            denomination: 'Producto de Ejemplo',
            quantityMeters: 25.5,
            status: 'pendiente',
            notes: 'Este es un pedido de ejemplo para probar la aplicación'
        };

        const imageUrl = URL.createObjectURL(blob);
        currentImageData = imageUrl;
        showOrderReviewModal(exampleData);
    }, 'image/png');
}

function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

// ===== MODAL DE REVISIÓN =====
function showOrderReviewModal(orderData) {
    document.getElementById('client-name').value = orderData.clientName || '';
    document.getElementById('client-number').value = orderData.clientNumber || '';
    document.getElementById('order-number').value = orderData.orderNumber || '';
    document.getElementById('order-date').value = orderData.date || new Date().toISOString().split('T')[0];
    document.getElementById('reference-number').value = orderData.referenceNumber || '';
    document.getElementById('denomination').value = orderData.denomination || '';
    document.getElementById('quantity-meters').value = orderData.quantityMeters || 0;
    document.getElementById('order-status').value = orderData.status || 'pendiente';
    document.getElementById('order-notes').value = orderData.notes || '';

    document.getElementById('review-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('review-modal').classList.remove('active');
    document.getElementById('image-preview').classList.add('hidden');
    currentImageData = null;
}

// Función para verificar pedidos duplicados
async function checkDuplicateOrder(orderNumber) {
    try {
        const orders = await getAllOrders();
        return orders.find(order => order.orderNumber === orderNumber);
    } catch (error) {
        console.error('Error al verificar duplicados:', error);
        return null;
    }
}

async function saveOrder() {
    const orderData = {
        clientName: document.getElementById('client-name').value,
        clientNumber: document.getElementById('client-number').value,
        orderNumber: document.getElementById('order-number').value,
        date: document.getElementById('order-date').value,
        referenceNumber: document.getElementById('reference-number').value,
        denomination: document.getElementById('denomination').value,
        quantityMeters: parseFloat(document.getElementById('quantity-meters').value),
        status: document.getElementById('order-status').value,
        notes: document.getElementById('order-notes').value,
        imageUrl: currentImageData
    };

    try {
        // Verificar si ya existe un pedido con el mismo número
        const existingOrder = await checkDuplicateOrder(orderData.orderNumber);

        if (existingOrder) {
            const replace = confirm(
                `⚠️ PEDIDO DUPLICADO\n\n` +
                `Ya existe un pedido con el número "${orderData.orderNumber}".\n\n` +
                `Cliente: ${existingOrder.clientName}\n` +
                `Fecha: ${existingOrder.date}\n\n` +
                `¿Deseas REEMPLAZAR el pedido anterior con este nuevo?`
            );

            if (!replace) {
                showNotification('Guardado cancelado - Pedido duplicado', 'warning');
                return;
            }

            // Eliminar el pedido anterior
            await deleteOrderFromDB(existingOrder.id);
            showNotification('Pedido anterior eliminado', 'info');
        }

        await saveOrderToDB(orderData);
        showNotification('Pedido guardado correctamente', 'success');
        closeModal();
        navigateToSection('data');
    } catch (error) {
        console.error('Error al guardar:', error);
        showNotification('Error al guardar el pedido', 'error');
    }
}

// ===== CARGAR Y MOSTRAR PEDIDOS =====
async function loadOrders() {
    try {
        const orders = await getAllOrders();
        const ordersList = document.getElementById('orders-list');

        if (orders.length === 0) {
            ordersList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">📦</div>
                    <h3 class="empty-state-title">No hay pedidos guardados</h3>
                    <p class="empty-state-description">Comienza capturando tu primer pedido</p>
                </div>
            `;
            return;
        }

        // Ordenar por timestamp descendente
        orders.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        ordersList.innerHTML = orders.map(order => createOrderCard(order)).join('');

        // Agregar event listeners a los botones
        ordersList.querySelectorAll('.btn-delete-order').forEach(btn => {
            btn.addEventListener('click', () => deleteOrder(btn.dataset.id));
        });

    } catch (error) {
        console.error('Error al cargar pedidos:', error);
        showNotification('Error al cargar los pedidos', 'error');
    }
}

function createOrderCard(order) {
    const statusBadge = getStatusBadge(order.status);
    const formattedDate = new Date(order.date).toLocaleDateString('es-ES');

    return `
        <div class="order-card">
            <div class="order-header">
                <div>
                    <div class="order-id">Pedido #${order.orderNumber}</div>
                    <div class="order-date">${formattedDate}</div>
                </div>
                <div>${statusBadge}</div>
            </div>
            <div class="order-details">
                <div class="order-detail">
                    <span class="order-detail-label">Cliente:</span>
                    <span class="order-detail-value">${order.clientName} (${order.clientNumber})</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Referencia:</span>
                    <span class="order-detail-value">${order.referenceNumber}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Denominación:</span>
                    <span class="order-detail-value">${order.denomination}</span>
                </div>
                <div class="order-detail">
                    <span class="order-detail-label">Cantidad:</span>
                    <span class="order-detail-value">${order.quantityMeters} metros lineales</span>
                </div>
                ${order.notes ? `
                <div class="order-detail">
                    <span class="order-detail-label">Notas:</span>
                    <span class="order-detail-value">${order.notes}</span>
                </div>
                ` : ''}
            </div>
            <div class="order-actions">
                <button class="btn btn-danger btn-icon btn-delete-order" data-id="${order.id}" title="Eliminar">
                    🗑️
                </button>
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
        document.getElementById('stat-total').textContent = orders.length;

        // Pedidos de hoy
        const today = new Date().toISOString().split('T')[0];
        const todayOrders = orders.filter(order => order.date === today);
        document.getElementById('stat-today').textContent = todayOrders.length;

        // Pedidos pendientes
        const pendingOrders = orders.filter(order => order.status === 'pendiente');
        document.getElementById('stat-pending').textContent = pendingOrders.length;

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
                order.orderNumber.toLowerCase().includes(query) ||
                order.clientName.toLowerCase().includes(query) ||
                order.clientNumber.toLowerCase().includes(query) ||
                order.referenceNumber.toLowerCase().includes(query) ||
                order.denomination.toLowerCase().includes(query)
            );
        }

        // Filtrar por estado
        if (filter !== 'all') {
            orders = orders.filter(order => order.status === filter);
        }

        const searchResults = document.getElementById('search-results');

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
            btn.addEventListener('click', () => deleteOrder(btn.dataset.id));
        });

    } catch (error) {
        console.error('Error en búsqueda:', error);
    }
}

function handleSearch(event) {
    const query = event.target.value;
    const activeFilter = document.querySelector('.filter-chip.active').dataset.filter;
    loadSearchResults(query, activeFilter);
}

function handleFilterClick(event) {
    document.querySelectorAll('.filter-chip').forEach(chip => {
        chip.classList.remove('active');
    });

    event.target.classList.add('active');
    const filter = event.target.dataset.filter;
    const query = document.getElementById('search-input').value;
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

    document.getElementById('api-key-input').value = apiKey;
}

function saveConfiguration() {
    const apiKey = document.getElementById('api-key-input').value.trim();

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
