const CART_KEY = 'mercado-cart-v1';
const PAGE_SIZE = 24;
const money = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });

const elements = {
  cartCount: document.querySelector('#cart-count'),
  cartItems: document.querySelector('#cart-items'),
  cartTotal: document.querySelector('#cart-total'),
  catalogStats: document.querySelector('#catalog-stats'),
  clearCart: document.querySelector('#clear-cart'),
  filters: document.querySelector('#filters'),
  historyContent: document.querySelector('#history-content'),
  historyDialog: document.querySelector('#history-dialog'),
  historyTitle: document.querySelector('#history-title'),
  closeHistory: document.querySelector('#close-history'),
  loadMore: document.querySelector('#load-more'),
  market: document.querySelector('#market'),
  products: document.querySelector('#products'),
  productsStatus: document.querySelector('#products-status'),
  promotion: document.querySelector('#promotion'),
  search: document.querySelector('#search'),
  sort: document.querySelector('#sort'),
  tabs: document.querySelectorAll('.tab'),
};

let cart = loadCart();
let offset = 0;
let total = 0;

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined && text !== null) element.textContent = text;
  return element;
}

function loadCart() {
  try {
    const value = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  renderCart();
}

function formatMoney(cents) {
  return money.format((cents ?? 0) / 100);
}

function switchTab(tabName) {
  document.querySelector('#products-tab').hidden = tabName !== 'products';
  document.querySelector('#cart-tab').hidden = tabName !== 'cart';
  elements.tabs.forEach((tab) => {
    const active = tab.dataset.tab === tabName;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
}

function addToCart(product) {
  const existing = cart.find((item) => item.product.id === product.id);
  if (existing) existing.quantity += 1;
  else cart.push({ product, quantity: 1 });
  saveCart();
}

function changeQuantity(productId, change) {
  const item = cart.find((entry) => entry.product.id === productId);
  if (!item) return;
  item.quantity += change;
  if (item.quantity <= 0) cart = cart.filter((entry) => entry !== item);
  saveCart();
}

function renderCart() {
  elements.cartItems.replaceChildren();
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const totalCents = cart.reduce(
    (sum, item) => sum + item.product.offer.priceCents * item.quantity,
    0,
  );
  elements.cartCount.textContent = String(itemCount);
  elements.cartTotal.textContent = formatMoney(totalCents);

  if (cart.length === 0) {
    elements.cartItems.append(createElement('p', 'empty', 'O carrinho está vazio.'));
    return;
  }

  for (const item of cart) {
    const row = createElement('article', 'cart-item');
    const info = createElement('div', 'cart-item-info');
    info.append(
      createElement('strong', null, item.product.name),
      createElement('p', 'muted', `${item.product.market.name} · ${formatMoney(item.product.offer.priceCents)} cada`),
    );

    const quantity = createElement('div', 'quantity');
    const decrease = createElement('button', 'secondary', '−');
    decrease.type = 'button';
    decrease.setAttribute('aria-label', `Retirar uma unidade de ${item.product.name}`);
    decrease.addEventListener('click', () => changeQuantity(item.product.id, -1));
    const increase = createElement('button', null, '+');
    increase.type = 'button';
    increase.setAttribute('aria-label', `Adicionar uma unidade de ${item.product.name}`);
    increase.addEventListener('click', () => changeQuantity(item.product.id, 1));
    quantity.append(decrease, createElement('span', null, String(item.quantity)), increase);

    const subtotal = createElement(
      'strong',
      null,
      formatMoney(item.product.offer.priceCents * item.quantity),
    );
    const remove = createElement('button', 'remove', 'Remover');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      cart = cart.filter((entry) => entry !== item);
      saveCart();
    });
    row.append(info, quantity, subtotal, remove);
    elements.cartItems.append(row);
  }
}

function renderProduct(product) {
  const card = createElement('article', 'product-card');
  if (product.image) {
    const image = createElement('img');
    image.src = product.image;
    image.alt = product.name;
    image.loading = 'lazy';
    card.append(image);
  }
  card.append(
    createElement('h3', null, product.name),
    createElement(
      'div',
      'product-meta',
      [product.brand, product.market.name, product.categories?.[0]].filter(Boolean).join(' · '),
    ),
  );

  const priceLine = createElement('div');
  priceLine.append(createElement('span', 'price', formatMoney(product.offer.priceCents)));
  if (product.offer.originalPriceCents) {
    priceLine.append(
      createElement('span', 'old-price', formatMoney(product.offer.originalPriceCents)),
    );
  }
  card.append(priceLine);

  if (product.offer.pricePerBaseUnitCents) {
    card.append(
      createElement(
        'div',
        'product-meta',
        `${formatMoney(product.offer.pricePerBaseUnitCents)}/${product.offer.baseUnit}`,
      ),
    );
  } else if (product.package?.raw) {
    card.append(createElement('div', 'product-meta', product.package.raw));
  }
  if (product.offer.promotion) card.append(createElement('div', 'promo', 'Em promoção'));
  if (product.offer.trend === 'down') {
    card.append(createElement('div', 'trend-down', 'Preço baixou'));
  } else if (product.offer.trend === 'up') {
    card.append(createElement('div', 'trend-up', 'Preço subiu'));
  }

  const actions = createElement('div', 'card-actions');
  const historyButton = createElement('button', 'secondary', 'Histórico');
  historyButton.type = 'button';
  historyButton.addEventListener('click', () => showHistory(product));
  const addButton = createElement('button', null, 'Adicionar');
  addButton.type = 'button';
  addButton.addEventListener('click', () => addToCart(product));
  actions.append(historyButton, addButton);
  card.append(actions);
  return card;
}

async function showHistory(product) {
  elements.historyTitle.textContent = product.name;
  elements.historyContent.replaceChildren(
    createElement('p', 'muted', 'A carregar histórico…'),
  );
  elements.historyDialog.showModal();

  try {
    const response = await fetch(`/api/products/${product.id}/history`);
    if (!response.ok) throw new Error('Não foi possível carregar o histórico.');
    const data = await response.json();
    elements.historyContent.replaceChildren();
    if (data.offers.length === 0) {
      elements.historyContent.append(createElement('p', 'empty', 'Sem observações.'));
      return;
    }
    for (const offer of [...data.offers].reverse()) {
      const row = createElement('div', 'history-row');
      const date = new Date(offer.observedAt).toLocaleString('pt-PT');
      const description = offer.promotion ? `${date} · promoção` : date;
      row.append(
        createElement('span', null, description),
        createElement('strong', null, formatMoney(offer.priceCents)),
      );
      elements.historyContent.append(row);
    }
  } catch (error) {
    elements.historyContent.replaceChildren(createElement('p', 'empty', error.message));
  }
}

function productQuery() {
  const params = new URLSearchParams({
    q: elements.search.value,
    sort: elements.sort.value,
    limit: String(PAGE_SIZE),
    offset: String(offset),
  });
  if (elements.market.value) params.set('market', elements.market.value);
  if (elements.promotion.checked) params.set('promotion', 'true');
  return params;
}

async function loadProducts({ append = false } = {}) {
  elements.productsStatus.textContent = 'A carregar produtos…';
  elements.loadMore.hidden = true;
  try {
    const response = await fetch(`/api/products?${productQuery()}`);
    if (!response.ok) throw new Error('Não foi possível consultar os produtos.');
    const data = await response.json();
    total = data.pagination.total;
    if (!append) elements.products.replaceChildren();
    for (const product of data.items) elements.products.append(renderProduct(product));
    const visible = elements.products.children.length;
    elements.productsStatus.textContent = `${visible} de ${total} produtos`;
    elements.loadMore.hidden = visible >= total;
  } catch (error) {
    elements.productsStatus.textContent = `${error.message} Confirme se a base de dados foi iniciada e importada.`;
  }
}

async function loadMetadata() {
  try {
    const [marketsResponse, statsResponse] = await Promise.all([
      fetch('/api/markets'),
      fetch('/api/stats'),
    ]);
    if (!marketsResponse.ok || !statsResponse.ok) throw new Error();
    const markets = await marketsResponse.json();
    const stats = await statsResponse.json();
    for (const market of markets.items) {
      const option = createElement('option', null, market.name);
      option.value = market.id;
      elements.market.append(option);
    }
    elements.catalogStats.textContent = `${stats.products} produtos · ${stats.promotions} promoções`;
  } catch {
    elements.catalogStats.textContent = 'Catálogo indisponível';
  }
}

elements.filters.addEventListener('submit', (event) => {
  event.preventDefault();
  offset = 0;
  loadProducts();
});
elements.sort.addEventListener('change', () => {
  offset = 0;
  loadProducts();
});
elements.market.addEventListener('change', () => {
  offset = 0;
  loadProducts();
});
elements.promotion.addEventListener('change', () => {
  offset = 0;
  loadProducts();
});
elements.loadMore.addEventListener('click', () => {
  offset += PAGE_SIZE;
  loadProducts({ append: true });
});
elements.clearCart.addEventListener('click', () => {
  cart = [];
  saveCart();
});
elements.closeHistory.addEventListener('click', () => elements.historyDialog.close());
elements.tabs.forEach((tab) => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

renderCart();
loadMetadata();
loadProducts();
