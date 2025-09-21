// API base URL for backend
const API_BASE = 'http://localhost:5000';

// Products data loaded from API
let products = [];

// Helper: get auth header if logged in
function authHeaders() {
    const token = localStorage.getItem('ll_token');
    return token ? { 'Authorization': 'Bearer ' + token } : {};
}

// Empty cart content for modal
function renderEmptyCart() {
    return `
        <div style="text-align:center; padding:24px; color:#6b7280;">
            <i class="fas fa-box-open" style="font-size:3rem; color:#cbd5e1; margin-bottom:12px;"></i>
            <h3 style="margin:0 0 6px; color:#1f2937;">Your cart is empty</h3>
            <p style="margin:0 0 16px;">Browse the marketplace and add items to your cart.</p>
            <a href="#marketplace" class="btn-primary" onclick="closeModal()" style="text-decoration:none;">Explore Products</a>
        </div>
    `;
}

// Helper: map API product to UI product shape used by createProductCard()
function mapApiProduct(p) {
    const firstImage = Array.isArray(p.images) && p.images.length > 0 ? (p.images.find(i => i.isPrimary) || p.images[0]).url : '';
    const price = p.price?.amount ?? 0;
    const ratingAvg = p.rating?.average ?? 0;
    const ratingCount = p.rating?.count ?? 0;
    const artisanName = p.artisan?.businessName || p.artisan?.user?.name || 'Artisan';
    return {
        id: p._id,
        title: p.title,
        artisan: artisanName,
        category: p.category,
        price: price,
        image: firstImage,
        description: p.shortDescription || p.description || '',
        badge: p.isFeatured ? 'Featured' : 'Handmade',
        stock: (p.inventory && typeof p.inventory.quantity === 'number') ? p.inventory.quantity : 0,
        trackInventory: p.inventory?.trackInventory !== false,
        isActive: p.isActive !== false,
        rating: ratingAvg,
        reviews: ratingCount
    };
}

// Cart functionality
let cart = [];
let cartCount = 0;
let wishlistIds = new Set();

function updateWishlistCount(count) {
    const el = document.querySelector('.wishlist-count');
    if (!el) return;
    const n = count || 0;
    el.textContent = n;
    el.style.display = n > 0 ? 'flex' : 'none';
}

// Initialize the website
document.addEventListener('DOMContentLoaded', function() {
    loadProducts();
    setupEventListeners();
    updateCartCount();
    initTheme();
    initCartCountFromServer();
    preloadWishlist();
});

// Mobile menu toggle function
function toggleMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const navMenu = document.getElementById('nav-menu');
    
    mobileMenuToggle.classList.toggle('active');
    navMenu.classList.toggle('active');
    
    // Prevent body scroll when menu is open
    if (navMenu.classList.contains('active')) {
        document.body.style.overflow = 'hidden';
    } else {
        document.body.style.overflow = '';
    }
}

// Close mobile menu when clicking on a link
function closeMobileMenu() {
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const navMenu = document.getElementById('nav-menu');
    
    mobileMenuToggle.classList.remove('active');
    navMenu.classList.remove('active');
    document.body.style.overflow = '';
}

// Load products into the grid
async function loadProducts(category = 'all') {
    const productsGrid = document.getElementById('products-grid');
    if (!productsGrid) return;

    productsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:24px; color:#94a3b8;">Loading products...</div>';
    try {
        const params = new URLSearchParams();
        params.set('page', '1');
        params.set('limit', '12');
        if (category && category !== 'all') params.set('category', category);

        const res = await fetch(`${API_BASE}/api/products?${params.toString()}`, { headers: { 'Content-Type': 'application/json', ...authHeaders() } });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load products');

        // Map and store
        products = (data.data.products || []).map(mapApiProduct);
        renderProducts(products);
    } catch (err) {
        productsGrid.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:24px; color:#ef4444;">${err.message}</div>`;
    }
}

function renderProducts(list) {
    const productsGrid = document.getElementById('products-grid');
    if (!productsGrid) return;
    productsGrid.innerHTML = '';
    if (!list || list.length === 0) {
        productsGrid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px;">
                <i class="fas fa-box-open" style="font-size: 3rem; color: #ccc; margin-bottom: 20px;"></i>
                <h3>No products found</h3>
            </div>
        `;
        return;
    }
    list.forEach(product => {
        const productCard = createProductCard(product);
        productsGrid.appendChild(productCard);
    });
}

// Create product card element
function createProductCard(product) {
    const card = document.createElement('div');
    card.className = 'product-card';
    const outOfStock = (product.trackInventory && product.stock <= 0) || !product.isActive;
    card.innerHTML = `
        <div class="product-image">
            <img src="${product.image}" alt="${product.title}" loading="lazy">
            <div class="product-badge">${outOfStock ? 'Out of Stock' : product.badge}</div>
        </div>
        <div class="product-info">
            <h3 class="product-title">${product.title}</h3>
            <p class="product-artisan">by ${product.artisan}</p>
            <p class="product-description">${product.description}</p>
            <div class="product-rating">
                ${generateStars(product.rating)} (${product.reviews} reviews)
            </div>
            <div class="product-price">₹${product.price.toLocaleString()}</div>
            <div class="product-actions">
                <button class="btn-add-cart" ${outOfStock ? 'disabled' : ''} onclick="${outOfStock ? '' : `addToCart('${product.id}')`}">
                    <i class="fas fa-shopping-cart"></i> ${outOfStock ? 'Out of Stock' : 'Add to Cart'}
                </button>
                <button class="btn-favorite" onclick="toggleFavorite('${product.id}')">
                    <i class="${wishlistIds.has(product.id) ? 'fas' : 'far'} fa-heart"></i>
                </button>
            </div>
        </div>
    `;
    return card;
}

// Generate star rating
function generateStars(rating) {
    const fullStars = Math.floor(rating);
    const hasHalfStar = rating % 1 !== 0;
    let stars = '';
    
    for (let i = 0; i < fullStars; i++) {
        stars += '<i class="fas fa-star"></i>';
    }
    
    if (hasHalfStar) {
        stars += '<i class="fas fa-star-half-alt"></i>';
    }
    
    const emptyStars = 5 - Math.ceil(rating);
    for (let i = 0; i < emptyStars; i++) {
        stars += '<i class="far fa-star"></i>';
    }
    
    return stars;
}

// Setup event listeners
function setupEventListeners() {
    // Filter buttons
    const filterButtons = document.querySelectorAll('.filter-btn');
    filterButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            filterButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            loadProducts(this.dataset.category);
        });
    });
    
    // Hero search
    const heroSearch = document.getElementById('hero-search');
    const searchBtn = document.querySelector('.search-btn');
    
    searchBtn.addEventListener('click', function() {
        performSearch(heroSearch.value);
    });
    
    heroSearch.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            performSearch(this.value);
        }
    });
    
    // Smooth scrolling for navigation links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                // Close mobile menu after clicking a link
                closeMobileMenu();
            }
        });
    });
    
    // Cart icon click
    document.querySelector('.cart-icon').addEventListener('click', function() {
        showCart();
    });

    // Theme toggle
    const themeBtn = document.getElementById('theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }

    // Wishlist icon in navbar (if present)
    const wishlistIcon = document.getElementById('wishlist-icon');
    if (wishlistIcon) {
        wishlistIcon.addEventListener('click', showWishlist);
    }
}

// Show wishlist modal
async function showWishlist() {
    const token = localStorage.getItem('ll_token');
    if (!token) {
        showMessage('Please sign in to view wishlist', 'error');
        setTimeout(() => window.location.href = 'signin.html', 600);
        return;
    }
    try {
        const res = await fetch(`${API_BASE}/api/users/wishlist?page=1&limit=24`, { headers: { ...authHeaders() } });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load wishlist');
        const products = data.data.products || [];
        const content = `
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;">
                ${products.map(p => {
                    const firstImage = Array.isArray(p.images) && p.images.length>0 ? (p.images.find(i=>i.isPrimary)||p.images[0]).url : '';
                    const price = p.price?.amount || 0;
                    return `
                        <div class="product-card">
                            <div class="product-image"><img src="${firstImage}" alt="${p.title}"></div>
                            <div class="product-info">
                                <h4>${p.title}</h4>
                                <div class="product-price">₹${price.toLocaleString()}</div>
                                <div class="product-actions" style="margin-top:8px;display:flex;gap:8px;">
                                    <button class="btn-primary" onclick="addToCart('${p._id}')"><i class="fas fa-shopping-cart"></i> Add</button>
                                    <button class="btn-secondary" onclick="toggleFavorite('${p._id}')"><i class="fas fa-heart"></i> Remove</button>
                                </div>
                            </div>
                        </div>`
                }).join('')}
            </div>`;
        const modal = createModal('Your Wishlist', content);
        document.body.appendChild(modal);
        modal.style.display = 'block';
    } catch (e) {
        showMessage(e.message, 'error');
    }
}

// Perform search
async function performSearch(query) {
    if (!query.trim()) return;
    const productsGrid = document.getElementById('products-grid');
    productsGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:24px; color:#94a3b8;">Searching...</div>';
    try {
        const params = new URLSearchParams({ page: '1', limit: '12', search: query.trim() });
        const res = await fetch(`${API_BASE}/api/products?${params.toString()}`, { headers: { 'Content-Type': 'application/json', ...authHeaders() } });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Search failed');
        products = (data.data.products || []).map(mapApiProduct);
        renderProducts(products);
    } catch (err) {
        productsGrid.innerHTML = `<div style=\"grid-column:1/-1; text-align:center; padding:24px; color:#ef4444;\">${err.message}</div>`;
    }
    document.getElementById('marketplace').scrollIntoView({ behavior: 'smooth' });
}

// Add to cart functionality
async function addToCart(productId) {
    // Prefer server-side cart if signed in
    const token = localStorage.getItem('ll_token');
    const product = Array.isArray(products) ? products.find(p => p.id === productId) : null;
    if (!productId) {
        showMessage('Invalid product. Please refresh the page.', 'error');
        return;
    }
    if (product && product.trackInventory && product.stock <= 0) {
        showMessage('This item is out of stock.', 'error');
        return;
    }

    if (token) {
        try {
            const res = await fetch(`${API_BASE}/api/users/cart`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ productId, quantity: 1 })
            });
            const data = await res.json();
            if (!res.ok || !data.success) {
                // If "Product not found", refresh products and retry once
                if (res.status === 404 && /Product not found/i.test(data.message || '')) {
                    try {
                        await loadProducts();
                        const res2 = await fetch(`${API_BASE}/api/users/cart`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...authHeaders() },
                            body: JSON.stringify({ productId, quantity: 1 })
                        });
                        const data2 = await res2.json();
                        if (!res2.ok || !data2.success) throw new Error(data2.message || 'Failed to add to cart');
                    } catch (retryErr) {
                        throw new Error(retryErr.message || 'Failed to add to cart');
                    }
                } else {
                    throw new Error(data.message || 'Failed to add to cart');
                }
            }
            // Refresh count from server to avoid stale values
            await initCartCountFromServer();
            showMessage(`${product?.title || 'Item'} added to cart!`, 'success');
        } catch (err) {
            showMessage(err.message, 'error');
        }
        return;
    }

    // Fallback local cart (not signed in)
    const existingItem = cart.find(item => item.id === productId);
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ ...product, quantity: 1 });
    }
    cartCount += 1;
    updateCartCount();
    showMessage(`${product.title} added to cart!`, 'success');
}

// Update cart count display
function updateCartCount() {
    const cartCountElement = document.querySelector('.cart-count');
    cartCountElement.textContent = cartCount;
    cartCountElement.style.display = cartCount > 0 ? 'flex' : 'none';
}

async function initCartCountFromServer() {
    const token = localStorage.getItem('ll_token');
    if (!token) return;
    try {
        const res = await fetch(`${API_BASE}/api/users/cart`, { headers: { ...authHeaders() } });
        const data = await res.json();
        if (!res.ok || !data.success) return;
        cartCount = (data.data && data.data.summary && typeof data.data.summary.itemCount === 'number')
            ? data.data.summary.itemCount
            : 0;
        updateCartCount();
    } catch (e) { /* ignore */ }
}

// Theme handling (default light, toggle adds 'theme-dark')
function initTheme() {
    const saved = localStorage.getItem('ll_theme') || 'light';
    document.body.classList.toggle('theme-dark', saved === 'dark');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = saved === 'dark' ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

function toggleTheme() {
    const isDark = document.body.classList.toggle('theme-dark');
    localStorage.setItem('ll_theme', isDark ? 'dark' : 'light');
    const btn = document.getElementById('theme-toggle');
    if (btn) btn.innerHTML = isDark ? '<i class="fas fa-sun"></i>' : '<i class="fas fa-moon"></i>';
}

// Toggle favorite
async function toggleFavorite(productId) {
    const btn = event.target.closest('.btn-favorite');
    const icon = btn.querySelector('i');
    const token = localStorage.getItem('ll_token');
    if (!token) {
        showMessage('Please sign in to use wishlist', 'error');
        setTimeout(() => window.location.href = 'signin.html', 600);
        return;
    }

    const isAdding = icon.classList.contains('far');
    try {
        const url = `${API_BASE}/api/users/wishlist/${productId}`;
        const res = await fetch(url, {
            method: isAdding ? 'POST' : 'DELETE',
            headers: { ...authHeaders() }
        });
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Wishlist update failed');

        if (isAdding) {
            icon.classList.remove('far');
            icon.classList.add('fas');
            btn.style.background = '#ef4444';
            btn.style.color = 'white';
            showMessage('Added to wishlist!', 'success');
        } else {
            icon.classList.remove('fas');
            icon.classList.add('far');
            btn.style.background = '#f3f4f6';
            btn.style.color = '#6b7280';
            showMessage('Removed from wishlist', 'success');
        }
    } catch (err) {
        showMessage(err.message, 'error');
    }
}

// Show cart modal
async function showCart() {
    const token = localStorage.getItem('ll_token');
    if (token) {
        try {
            // Sync count first
            await initCartCountFromServer();
            const res = await fetch(`${API_BASE}/api/users/cart`, { headers: { ...authHeaders() } });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load cart');
            const serverItems = (data.data.cart || []).map(ci => ({
                id: ci.product._id,
                title: ci.product.title,
                artisan: (ci.product.artisan && (ci.product.artisan.businessName || ci.product.artisan.user?.name)) || 'Artisan',
                image: (Array.isArray(ci.product.images) && (ci.product.images.find(i=>i.isPrimary)||ci.product.images[0])?.url) || '',
                price: ci.product.price?.amount || 0,
                quantity: ci.quantity
            }));
            const modal = createModal('Shopping Cart', serverItems.length ? generateCartHTML(serverItems) : renderEmptyCart());
            document.body.appendChild(modal);
            modal.style.display = 'block';
            return;
        } catch (e) {
            console.warn('Falling back to local cart', e);
        }
    }
    const modal = createModal('Shopping Cart', cart.length ? generateCartHTML(cart) : renderEmptyCart());
    document.body.appendChild(modal);
    modal.style.display = 'block';
}

// Generate cart HTML
function generateCartHTML(itemsSource) {
    const items = itemsSource || cart;
    const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    return `
        <div class="cart-items">
            ${items.map(item => `
                <div class="cart-item">
                    <img src="${item.image}" alt="${item.title}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px;">
                    <div class="item-details">
                        <h4>${item.title}</h4>
                        <p>by ${item.artisan}</p>
                        <div class="quantity-controls">
                            <button onclick="updateQuantity('${item.id}', -1)">-</button>
                            <span>${item.quantity}</span>
                            <button onclick="updateQuantity('${item.id}', 1)">+</button>
                        </div>
                    </div>
                    <div class="item-price">₹${(item.price * item.quantity).toLocaleString()}</div>
                    <button onclick="removeFromCart('${item.id}')" class="remove-btn">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `).join('')}
        </div>
        <div class="cart-total">
            <h3>Total: ₹${total.toLocaleString()}</h3>
            <button class="btn-primary" onclick="proceedToCheckout()" style="width: 100%; margin-top: 20px;">
                Proceed to Checkout
            </button>
        </div>
    `;
}

// Update item quantity
async function updateQuantity(productId, change) {
    const token = localStorage.getItem('ll_token');
    if (token) {
        try {
            // Determine next quantity from UI
            const itemEl = Array.from(document.querySelectorAll('.cart-item')).find(el => el.querySelector(`button[onclick="updateQuantity('${productId}', -1)"]`));
            let currentQty = 1;
            if (itemEl) {
                const span = itemEl.querySelector('.quantity-controls span');
                currentQty = parseInt(span.textContent.trim(), 10) || 1;
            }
            const nextQty = currentQty + change;
            if (nextQty <= 0) {
                await removeFromCart(productId);
                return;
            }

            const res = await fetch(`${API_BASE}/api/users/cart/${productId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ quantity: nextQty })
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'Failed to update cart');
            cartCount = data.data.cartCount || cartCount;
            updateCartCount();
            // Refresh modal from server
            const refreshed = await fetch(`${API_BASE}/api/users/cart`, { headers: { ...authHeaders() } });
            const latest = await refreshed.json();
            const serverItems = (latest.data.cart || []).map(ci => ({
                id: ci.product._id,
                title: ci.product.title,
                artisan: (ci.product.artisan && (ci.product.artisan.businessName || ci.product.artisan.user?.name)) || 'Artisan',
                image: (Array.isArray(ci.product.images) && (ci.product.images.find(i=>i.isPrimary)||ci.product.images[0])?.url) || '',
                price: ci.product.price?.amount || 0,
                quantity: ci.quantity
            }));
            const modal = document.querySelector('.modal');
            if (modal) {
                modal.querySelector('.modal-content').innerHTML = `
                    <span class="close" onclick="closeModal()">&times;</span>
                    <h2>Shopping Cart</h2>
                    ${generateCartHTML(serverItems)}
                `;
            }
            return;
        } catch (e) {
            showMessage(e.message, 'error');
            return;
        }
    }
    // Local fallback
    const item = cart.find(item => item.id === productId);
    if (!item) return;
    item.quantity += change;
    if (item.quantity <= 0) {
        removeFromCart(productId);
        return;
    }
    cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
    updateCartCount();
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.querySelector('.modal-content').innerHTML = `
            <span class="close" onclick="closeModal()">&times;</span>
            <h2>Shopping Cart</h2>
            ${generateCartHTML(cart)}
        `;
    }
}

// Remove from cart
async function removeFromCart(productId) {
    const token = localStorage.getItem('ll_token');
    if (token) {
        try {
            const res = await fetch(`${API_BASE}/api/users/cart/${productId}`, { method: 'DELETE', headers: { ...authHeaders() } });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'Failed to remove from cart');
            cartCount = data.data.cartCount || 0;
            updateCartCount();
            const refreshed = await fetch(`${API_BASE}/api/users/cart`, { headers: { ...authHeaders() } });
            const latest = await refreshed.json();
            const serverItems = (latest.data.cart || []).map(ci => ({
                id: ci.product._id,
                title: ci.product.title,
                artisan: (ci.product.artisan && (ci.product.artisan.businessName || ci.product.artisan.user?.name)) || 'Artisan',
                image: (Array.isArray(ci.product.images) && (ci.product.images.find(i=>i.isPrimary)||ci.product.images[0])?.url) || '',
                price: ci.product.price?.amount || 0,
                quantity: ci.quantity
            }));
            const modal = document.querySelector('.modal');
            if (modal) {
                if (serverItems.length === 0) { closeModal(); return; }
                modal.querySelector('.modal-content').innerHTML = `
                    <span class="close" onclick="closeModal()">&times;</span>
                    <h2>Shopping Cart</h2>
                    ${generateCartHTML(serverItems)}
                `;
            }
            return;
        } catch (e) {
            showMessage(e.message, 'error');
            return;
        }
    }
    // Local fallback
    const itemIndex = cart.findIndex(item => item.id === productId);
    if (itemIndex === -1) return;
    const item = cart[itemIndex];
    cartCount -= item.quantity;
    cart.splice(itemIndex, 1);
    updateCartCount();
    showMessage(`${item.title} removed from cart`, 'success');
    if (cart.length === 0) { closeModal(); return; }
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.querySelector('.modal-content').innerHTML = `
            <span class="close" onclick="closeModal()">&times;</span>
            <h2>Shopping Cart</h2>
            ${generateCartHTML(cart)}
        `;
    }
}

// Preload wishlist ids for the signed-in user
async function preloadWishlist() {
    const token = localStorage.getItem('ll_token');
    if (!token) return;
    try {
        const res = await fetch(`${API_BASE}/api/users/profile`, { headers: { ...authHeaders() } });
        const data = await res.json();
        if (!res.ok || !data.success) return;
        const ids = (data.data.user.wishlist || []).map(String);
        wishlistIds = new Set(ids);
        updateWishlistCount(wishlistIds.size);
        // Re-render products if already loaded
        if (Array.isArray(products) && products.length) {
            renderProducts(products);
        }
    } catch (e) { /* ignore */ }
}

// Proceed to checkout
function proceedToCheckout() {
    closeModal();
    showMessage('Redirecting to secure checkout...', 'success');
    
    // Simulate checkout process
    setTimeout(() => {
        showMessage('Checkout completed! Thank you for supporting local artisans.', 'success');
        cart = [];
        cartCount = 0;
        updateCartCount();
    }, 2000);
}

// AI Assistant Functions
function openAIAssistant(type) {
    let title, content;
    
    switch(type) {
        case 'description':
            title = 'AI Product Description Generator';
            content = `
                <div class="ai-assistant-form">
                    <h3>Generate Product Description</h3>
                    <p>Upload a product photo and let AI create compelling descriptions, titles, and tags for your craft.</p>
                    <div class="upload-area" onclick="document.getElementById('product-upload').click()">
                        <i class="fas fa-cloud-upload-alt"></i>
                        <p>Click to upload product photo</p>
                        <input type="file" id="product-upload" accept="image/*" style="display: none;" onchange="generateDescription()">
                    </div>
                    <div id="ai-result" style="display: none; margin-top: 20px;">
                        <h4>AI Generated Content:</h4>
                        <div class="ai-output"></div>
                    </div>
                </div>
            `;
            break;
        case 'pricing':
            title = 'AI Pricing Assistant';
            content = `
                <div class="ai-pricing-form">
                    <h3>Smart Pricing Suggestions</h3>
                    <p>Get AI-powered pricing recommendations based on market trends and material costs.</p>
                    <div class="form-group">
                        <label>Product Category:</label>
                        <select id="pricing-category">
                            <option value="jewelry">Jewelry</option>
                            <option value="textiles">Textiles</option>
                            <option value="pottery">Pottery</option>
                            <option value="woodwork">Woodwork</option>
                            <option value="art">Art</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Material Cost (₹):</label>
                        <input type="number" id="material-cost" placeholder="Enter material cost">
                    </div>
                    <div class="form-group">
                        <label>Time Spent (hours):</label>
                        <input type="number" id="time-spent" placeholder="Enter hours spent">
                    </div>
                    <button class="btn-primary" onclick="generatePricing()">Get Pricing Suggestions</button>
                    <div id="pricing-result" style="display: none; margin-top: 20px;">
                        <h4>AI Pricing Recommendations:</h4>
                        <div class="pricing-output"></div>
                    </div>
                </div>
            `;
            break;
        case 'social':
            title = 'Social Media Assistant';
            content = `
                <div class="ai-social-form">
                    <h3>Social Media Content Generator</h3>
                    <p>Generate engaging posts, hashtags, and marketing campaigns for your crafts.</p>
                    <div class="form-group">
                        <label>Product Description:</label>
                        <textarea id="product-desc" placeholder="Describe your product..."></textarea>
                    </div>
                    <div class="form-group">
                        <label>Platform:</label>
                        <select id="social-platform">
                            <option value="instagram">Instagram</option>
                            <option value="facebook">Facebook</option>
                            <option value="twitter">Twitter</option>
                        </select>
                    </div>
                    <button class="btn-primary" onclick="generateSocialContent()">Generate Content</button>
                    <div id="social-result" style="display: none; margin-top: 20px;">
                        <h4>AI Generated Social Media Content:</h4>
                        <div class="social-output"></div>
                    </div>
                </div>
            `;
            break;
    }
    
    const modal = createModal(title, content);
    document.body.appendChild(modal);
    modal.style.display = 'block';
}

// Generate product description using AI simulation
function generateDescription() {
    const fileInput = document.getElementById('product-upload');
    const resultDiv = document.getElementById('ai-result');
    const outputDiv = resultDiv.querySelector('.ai-output');
    
    if (!fileInput.files[0]) return;
    
    // Show loading
    outputDiv.innerHTML = '<div class="loading"></div> Analyzing image...';
    resultDiv.style.display = 'block';
    
    // Simulate AI processing
    setTimeout(() => {
        const sampleDescriptions = [
            {
                title: "Handcrafted Ceramic Vase",
                description: "This exquisite ceramic vase features traditional hand-painted motifs with a modern twist. Each piece is carefully crafted using age-old techniques passed down through generations, making it a unique addition to any home.",
                tags: ["handmade", "ceramic", "traditional", "home decor", "artisan", "unique"],
                hashtags: "#handmade #ceramic #traditional #homedecor #artisan #localcraft #sustainable"
            },
            {
                title: "Silk Embroidered Scarf",
                description: "Luxurious silk scarf adorned with intricate hand embroidery. The delicate patterns tell a story of cultural heritage and skilled craftsmanship, perfect for adding elegance to any outfit.",
                tags: ["silk", "embroidery", "luxury", "fashion", "handmade", "traditional"],
                hashtags: "#silk #embroidery #luxury #fashion #handmade #traditional #elegant"
            }
        ];
        
        const random = Math.floor(Math.random() * sampleDescriptions.length);
        const result = sampleDescriptions[random];
        
        outputDiv.innerHTML = `
            <div class="ai-generated-content">
                <h5>Product Title:</h5>
                <p class="ai-title">${result.title}</p>
                
                <h5>Description:</h5>
                <p class="ai-description">${result.description}</p>
                
                <h5>Tags:</h5>
                <div class="ai-tags">
                    ${result.tags.map(tag => `<span class="tag">${tag}</span>`).join('')}
                </div>
                
                <h5>Social Media Hashtags:</h5>
                <p class="ai-hashtags">${result.hashtags}</p>
                
                <button class="btn-primary" onclick="copyToClipboard('${result.title}\\n\\n${result.description}\\n\\n${result.hashtags}')">
                    Copy to Clipboard
                </button>
            </div>
        `;
    }, 3000);
}

// Generate pricing suggestions
function generatePricing() {
    const category = document.getElementById('pricing-category').value;
    const materialCost = parseFloat(document.getElementById('material-cost').value) || 0;
    const timeSpent = parseFloat(document.getElementById('time-spent').value) || 0;
    
    const resultDiv = document.getElementById('pricing-result');
    const outputDiv = resultDiv.querySelector('.pricing-output');
    
    if (materialCost === 0 || timeSpent === 0) {
        showMessage('Please enter both material cost and time spent', 'error');
        return;
    }
    
    // Show loading
    outputDiv.innerHTML = '<div class="loading"></div> Analyzing market trends...';
    resultDiv.style.display = 'block';
    
    // Simulate AI pricing calculation
    setTimeout(() => {
        const hourlyRate = getCategoryHourlyRate(category);
        const laborCost = timeSpent * hourlyRate;
        const totalCost = materialCost + laborCost;
        
        const suggestedPrices = {
            minimum: Math.round(totalCost * 1.5),
            recommended: Math.round(totalCost * 2.2),
            premium: Math.round(totalCost * 3.0)
        };
        
        outputDiv.innerHTML = `
            <div class="pricing-suggestions">
                <div class="pricing-tier">
                    <h5>Minimum Price: ₹${suggestedPrices.minimum.toLocaleString()}</h5>
                    <p>Basic pricing to cover costs and minimal profit</p>
                </div>
                <div class="pricing-tier recommended">
                    <h5>Recommended Price: ₹${suggestedPrices.recommended.toLocaleString()}</h5>
                    <p>Optimal pricing for good profit margin and market competitiveness</p>
                </div>
                <div class="pricing-tier">
                    <h5>Premium Price: ₹${suggestedPrices.premium.toLocaleString()}</h5>
                    <p>High-end pricing for unique or exceptional pieces</p>
                </div>
                
                <div class="pricing-breakdown">
                    <h5>Cost Breakdown:</h5>
                    <ul>
                        <li>Material Cost: ₹${materialCost.toLocaleString()}</li>
                        <li>Labor Cost (${timeSpent}h × ₹${hourlyRate}): ₹${laborCost.toLocaleString()}</li>
                        <li>Total Cost: ₹${totalCost.toLocaleString()}</li>
                    </ul>
                </div>
            </div>
        `;
    }, 2000);
}

// Get hourly rate by category
function getCategoryHourlyRate(category) {
    const rates = {
        jewelry: 500,
        textiles: 300,
        pottery: 400,
        woodwork: 350,
        art: 600
    };
    return rates[category] || 400;
}

// Generate social media content
function generateSocialContent() {
    const description = document.getElementById('product-desc').value;
    const platform = document.getElementById('social-platform').value;
    
    const resultDiv = document.getElementById('social-result');
    const outputDiv = resultDiv.querySelector('.social-output');
    
    if (!description.trim()) {
        showMessage('Please enter a product description', 'error');
        return;
    }
    
    // Show loading
    outputDiv.innerHTML = '<div class="loading"></div> Generating content...';
    resultDiv.style.display = 'block';
    
    // Simulate AI content generation
    setTimeout(() => {
        const content = generateSocialPost(description, platform);
        
        outputDiv.innerHTML = `
            <div class="social-content">
                <h5>Generated Post:</h5>
                <div class="post-content">
                    <p>${content.post}</p>
                </div>
                
                <h5>Hashtags:</h5>
                <div class="hashtags">
                    ${content.hashtags.map(tag => `<span class="hashtag">${tag}</span>`).join('')}
                </div>
                
                <h5>Best Time to Post:</h5>
                <p class="posting-time">${content.bestTime}</p>
                
                <div class="social-actions">
                    <button class="btn-primary" onclick="copyToClipboard('${content.post}\\n\\n${content.hashtags.join(' ')}')">
                        Copy Post
                    </button>
                    <button class="btn-secondary" onclick="schedulePost('${platform}')">
                        Schedule Post
                    </button>
                </div>
            </div>
        `;
    }, 2000);
}

// Generate social media post content
function generateSocialPost(description, platform) {
    const posts = {
        instagram: [
            `✨ Discover the magic of handmade craftsmanship! ${description} Each piece tells a story of tradition, skill, and passion. 🎨✨`,
            `🌟 Behind every handmade item is an artisan's dream. ${description} Support local crafts and preserve cultural heritage! 💫`,
            `🎭 From concept to creation, witness the beauty of traditional craftsmanship. ${description} Every detail matters! ✨`
        ],
        facebook: [
            `We're excited to share this beautiful handmade piece with you! ${description} Supporting local artisans helps preserve traditional crafts and cultural heritage.`,
            `There's something special about handmade items that mass production can't replicate. ${description} Each piece is unique and carries the artisan's personal touch.`,
            `Join us in celebrating the art of traditional craftsmanship! ${description} Your support helps keep these beautiful traditions alive.`
        ],
        twitter: [
            `✨ Handmade magic: ${description} Supporting local artisans, one craft at a time! #Handmade #LocalArtisans`,
            `🎨 Traditional meets modern: ${description} Every purchase supports cultural preservation! #CraftHeritage`,
            `🌟 The beauty of handmade: ${description} Each piece tells a unique story! #ArtisanCraft`
        ]
    };
    
    const hashtags = {
        instagram: ["#handmade", "#artisan", "#traditional", "#craft", "#local", "#sustainable", "#unique", "#heritage"],
        facebook: ["#Handmade", "#LocalArtisans", "#TraditionalCraft", "#CulturalHeritage", "#SupportLocal"],
        twitter: ["#Handmade", "#LocalArtisans", "#CraftHeritage", "#ArtisanCraft", "#Traditional"]
    };
    
    const bestTimes = {
        instagram: "Best times: 11 AM - 1 PM or 5 PM - 7 PM",
        facebook: "Best times: 1 PM - 3 PM or 3 PM - 4 PM",
        twitter: "Best times: 12 PM - 3 PM or 5 PM - 6 PM"
    };
    
    const platformPosts = posts[platform];
    const randomPost = platformPosts[Math.floor(Math.random() * platformPosts.length)];
    
    return {
        post: randomPost,
        hashtags: hashtags[platform],
        bestTime: bestTimes[platform]
    };
}

// Utility Functions
function createModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content">
            <span class="close" onclick="closeModal()">&times;</span>
            <h2>${title}</h2>
            ${content}
        </div>
    `;
    
    // Close modal when clicking outside
    modal.addEventListener('click', function(e) {
        if (e.target === modal) {
            closeModal();
        }
    });
    
    return modal;
}

function closeModal() {
    const modal = document.querySelector('.modal');
    if (modal) {
        modal.remove();
    }
}

function showMessage(text, type) {
    const message = document.createElement('div');
    message.className = `message ${type}`;
    message.textContent = text;
    
    // Insert at the top of the page
    document.body.insertBefore(message, document.body.firstChild);
    
    // Auto remove after 3 seconds
    setTimeout(() => {
        message.remove();
    }, 3000);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showMessage('Copied to clipboard!', 'success');
    }).catch(() => {
        showMessage('Failed to copy to clipboard', 'error');
    });
}

function schedulePost(platform) {
    showMessage(`Post scheduled for ${platform}!`, 'success');
}

// Add some CSS for the AI assistant modals
const additionalCSS = `
    .ai-assistant-form, .ai-pricing-form, .ai-social-form {
        max-width: 500px;
    }
    
    .upload-area {
        border: 2px dashed #6366f1;
        border-radius: 12px;
        padding: 40px;
        text-align: center;
        cursor: pointer;
        transition: all 0.3s ease;
        background: #f8fafc;
    }
    
    .upload-area:hover {
        background: #f1f5f9;
        border-color: #4f46e5;
    }
    
    .upload-area i {
        font-size: 3rem;
        color: #6366f1;
        margin-bottom: 15px;
    }
    
    .form-group {
        margin-bottom: 20px;
    }
    
    .form-group label {
        display: block;
        margin-bottom: 8px;
        font-weight: 600;
        color: #374151;
    }
    
    .form-group input,
    .form-group select,
    .form-group textarea {
        width: 100%;
        padding: 12px;
        border: 2px solid #e5e7eb;
        border-radius: 8px;
        font-size: 1rem;
        transition: border-color 0.3s ease;
    }
    
    .form-group input:focus,
    .form-group select:focus,
    .form-group textarea:focus {
        outline: none;
        border-color: #6366f1;
    }
    
    .form-group textarea {
        height: 100px;
        resize: vertical;
    }
    
    .ai-generated-content,
    .pricing-suggestions,
    .social-content {
        background: #f8fafc;
        padding: 20px;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
    }
    
    .ai-title {
        font-weight: 600;
        color: #1f2937;
        font-size: 1.1rem;
    }
    
    .ai-description {
        color: #6b7280;
        line-height: 1.6;
    }
    
    .ai-tags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 10px 0;
    }
    
    .tag {
        background: #6366f1;
        color: white;
        padding: 4px 12px;
        border-radius: 20px;
        font-size: 0.8rem;
        font-weight: 500;
    }
    
    .ai-hashtags {
        color: #6366f1;
        font-weight: 500;
    }
    
    .pricing-tier {
        background: white;
        padding: 15px;
        border-radius: 8px;
        margin-bottom: 10px;
        border: 1px solid #e5e7eb;
    }
    
    .pricing-tier.recommended {
        border-color: #10b981;
        background: #f0fdf4;
    }
    
    .pricing-breakdown {
        margin-top: 20px;
        padding-top: 20px;
        border-top: 1px solid #e5e7eb;
    }
    
    .pricing-breakdown ul {
        list-style: none;
        padding: 0;
    }
    
    .pricing-breakdown li {
        padding: 5px 0;
        color: #6b7280;
    }
    
    .post-content {
        background: white;
        padding: 15px;
        border-radius: 8px;
        border: 1px solid #e5e7eb;
        margin-bottom: 15px;
    }
    
    .hashtags {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 10px 0;
    }
    
    .hashtag {
        background: #e0e7ff;
        color: #3730a3;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 0.8rem;
    }
    
    .posting-time {
        color: #6b7280;
        font-style: italic;
    }
    
    .social-actions {
        display: flex;
        gap: 10px;
        margin-top: 20px;
    }
    
    .cart-item {
        display: flex;
        align-items: center;
        gap: 15px;
        padding: 15px;
        border-bottom: 1px solid #e5e7eb;
    }
    
    .item-details {
        flex: 1;
    }
    
    .item-details h4 {
        margin: 0 0 5px 0;
        color: #1f2937;
    }
    
    .item-details p {
        margin: 0 0 10px 0;
        color: #6b7280;
        font-size: 0.9rem;
    }
    
    .quantity-controls {
        display: flex;
        align-items: center;
        gap: 10px;
    }
    
    .quantity-controls button {
        width: 30px;
        height: 30px;
        border: 1px solid #d1d5db;
        background: white;
        border-radius: 4px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }
    
    .quantity-controls button:hover {
        background: #f3f4f6;
    }
    
    .item-price {
        font-weight: 600;
        color: #1f2937;
    }
    
    .remove-btn {
        background: #fee2e2;
        border: none;
        color: #dc2626;
        padding: 8px;
        border-radius: 4px;
        cursor: pointer;
        transition: background-color 0.3s ease;
    }
    
    .remove-btn:hover {
        background: #fecaca;
    }
    
    .cart-total {
        padding: 20px 0;
        border-top: 2px solid #e5e7eb;
        text-align: center;
    }
    
    .cart-total h3 {
        margin: 0 0 20px 0;
        color: #1f2937;
    }
`;

// Add the additional CSS to the page
const style = document.createElement('style');
style.textContent = additionalCSS;
document.head.appendChild(style);

// Chatbot functionality
let chatbotOpen = false;

function toggleChatbot() {
    const chatbot = document.getElementById('chatbot');
    chatbotOpen = !chatbotOpen;
    
    if (chatbotOpen) {
        chatbot.classList.add('show');
    } else {
        chatbot.classList.remove('show');
    }
}

function handleChatbotKeypress(event) {
    if (event.key === 'Enter') {
        sendChatbotMessage();
    }
}

function sendChatbotMessage() {
    const input = document.getElementById('chatbot-input');
    const message = input.value.trim();
    
    if (!message) return;
    
    // Add user message
    addChatbotMessage(message, 'user');
    input.value = '';
    
    // Simulate AI response
    setTimeout(() => {
        const response = generateChatbotResponse(message);
        addChatbotMessage(response, 'bot');
    }, 1000);
}

function addChatbotMessage(text, sender) {
    const messagesContainer = document.getElementById('chatbot-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}-message`;
    messageDiv.innerHTML = `<p>${text}</p>`;
    
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function generateChatbotResponse(userMessage) {
    const message = userMessage.toLowerCase();
    
    // Simple keyword-based responses
    if (message.includes('hello') || message.includes('hi')) {
        return "Hello! I'm here to help you discover amazing local artisan products. What are you looking for today?";
    }
    
    if (message.includes('product') || message.includes('buy') || message.includes('purchase')) {
        return "Great! We have a wonderful collection of handmade products from local artisans. You can browse by category or use the search feature. Would you like me to show you some popular items?";
    }
    
    if (message.includes('artisan') || message.includes('craftsman')) {
        return "Our artisans are incredibly talented! Each one has a unique story and specializes in different crafts. You can read their stories in the Stories section or visit their profile pages to learn more about their journey.";
    }
    
    if (message.includes('price') || message.includes('cost') || message.includes('expensive')) {
        return "Our prices are set by the artisans themselves and reflect the time, skill, and materials that go into each handmade piece. Every purchase directly supports the artisan and their family. Would you like to see our pricing range?";
    }
    
    if (message.includes('shipping') || message.includes('delivery')) {
        return "We offer secure shipping with tracking for all orders. Delivery times vary by location, but we work with reliable partners to ensure your handmade items arrive safely. You can track your order in your account.";
    }
    
    if (message.includes('ai') || message.includes('assistant')) {
        return "Yes! Our AI assistant helps artisans with product descriptions, pricing suggestions, and social media content. It's designed to help them reach more customers while preserving their authentic voice.";
    }
    
    if (message.includes('help') || message.includes('support')) {
        return "I'm here to help! You can ask me about products, artisans, shipping, or anything else. You can also visit our Help Center or contact our support team for more detailed assistance.";
    }
    
    if (message.includes('thank') || message.includes('thanks')) {
        return "You're very welcome! I'm happy to help. Is there anything else you'd like to know about our platform or the artisans?";
    }
    
    // Default response
    const defaultResponses = [
        "That's interesting! Can you tell me more about what you're looking for?",
        "I'd be happy to help you with that. Could you provide a bit more detail?",
        "Let me help you find what you need. What specific information are you looking for?",
        "That's a great question! Let me see how I can assist you with that.",
        "I understand you're interested in that. Would you like me to show you some relevant options?"
    ];
    
    return defaultResponses[Math.floor(Math.random() * defaultResponses.length)];
}
