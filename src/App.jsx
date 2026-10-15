import { useEffect, useMemo, useState } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import './App.css'
import { db, firebaseEnabled } from './firebase'

const seedUsers = [
  { id: 1, username: 'admin', password: 'zyro123', role: 'admin', name: 'Admin' },
  { id: 2, username: 'mitarbeiter', password: 'zyro456', role: 'mitarbeiter', name: 'Mitarbeiter' },
]

const seedProducts = [
  { id: 1, name: 'Zyro Citrus Rush', sku: 'ZYR-CR-001', category: 'Energy', volume: '500ml', status: 'Aktiv' },
  { id: 2, name: 'Zyro Berry Pulse', sku: 'ZYR-BP-002', category: 'Fruit', volume: '500ml', status: 'Aktiv' },
  { id: 3, name: 'Zyro Zero Lime', sku: 'ZYR-ZL-003', category: 'Zero', volume: '330ml', status: 'In Planung' },
]

const seedRecipes = [
  {
    id: 1,
    name: 'Zyro Citrus Rush',
    type: 'Energy',
    batchSize: '12.500ml',
    description: 'Zitronen-Lime mit leichter Grüntee-Note',
    ingredients: 'Wasser: 7.400ml\nZitronensaft: 2.100ml\nKoffein: 180mg\nZucker: 320g\nNaturfarben: 40ml',
    status: 'Aktiv',
  },
  {
    id: 2,
    name: 'Zyro Berry Pulse',
    type: 'Fruit',
    batchSize: '10.000ml',
    description: 'Himbeer- und Brombeerprofil mit mildem Aroma',
    ingredients: 'Wasser: 6.300ml\nHimbeersaft: 1.800ml\nBrombeersaft: 1.100ml\nSüßungsmittel: 420g\nFarbstoff: 30ml',
    status: 'Freigegeben',
  },
]

const seedOrders = [
  { id: 101, customer: 'City Market', product: 'Zyro Citrus Rush', quantity: 1200, lotNumber: 'ZYR-CR-2409-A', dueDate: '2026-10-18', status: 'In Produktion' },
  { id: 102, customer: 'Fresh Corner', product: 'Zyro Berry Pulse', quantity: 900, lotNumber: 'ZYR-BP-2410-B', dueDate: '2026-10-20', status: 'Versandbereit' },
  { id: 103, customer: 'Brenner Shop', product: 'Zyro Zero Lime', quantity: 600, lotNumber: 'ZYR-ZL-2431-C', dueDate: '2026-10-22', status: 'Abgeschlossen' },
]

const seedInventory = [
  { item: 'Zitronensaft', stock: 86, ideal: 80, status: 'Gut' },
  { item: 'Himbeersaft', stock: 71, ideal: 75, status: 'Gut' },
  { item: 'Koffein', stock: 44, ideal: 60, status: 'Nachbestellen' },
  { item: 'Wasser', stock: 93, ideal: 85, status: 'Gut' },
]

const baseTabs = ['dashboard', 'produkte', 'rezepturen', 'bestellungen', 'lager', 'chargen']

const initialRecipeForm = { name: '', type: 'Energy', batchSize: '', description: '', ingredients: '' }
const initialProductForm = { name: '', sku: '', category: 'Energy', volume: '', status: 'Aktiv' }
const initialOrderForm = { customer: '', product: 'Zyro Citrus Rush', quantity: '', dueDate: '', status: 'In Produktion' }
const initialInventoryForm = { item: '', stock: '', ideal: '', status: 'Gut' }
const initialLoginForm = { username: '', password: '' }
const initialUserForm = { name: '', username: '', password: '', role: 'mitarbeiter' }

const firebaseCollections = {
  users: 'zyro-users',
  products: 'zyro-products',
  recipes: 'zyro-recipes',
  orders: 'zyro-orders',
  inventory: 'zyro-inventory',
  currentUser: 'zyro-current-user',
}

const readStorage = (key, fallback) => {
  if (typeof window === 'undefined') return fallback
  const item = window.localStorage.getItem(key)
  return item ? JSON.parse(item) : fallback
}

const readFirebaseCollection = async (key, fallback) => {
  if (!firebaseEnabled || !db) return fallback

  try {
    const snapshot = await getDoc(doc(db, firebaseCollections[key], 'data'))
    return snapshot.exists() ? snapshot.data().value ?? fallback : fallback
  } catch (error) {
    return fallback
  }
}

const writeFirebaseCollection = async (key, value) => {
  if (!firebaseEnabled || !db) return

  try {
    await setDoc(doc(db, firebaseCollections[key], 'data'), { value })
  } catch (error) {
    // Silent fallback to browser storage if Firebase is unavailable.
  }
}

function App() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [firebaseReady, setFirebaseReady] = useState(false)
  const [users, setUsers] = useState(() => readStorage('zyro-users', seedUsers))
  const [currentUser, setCurrentUser] = useState(() => readStorage('zyro-current-user', null))
  const [products, setProducts] = useState(() => readStorage('zyro-products', seedProducts))
  const [recipes, setRecipes] = useState(() => readStorage('zyro-recipes', seedRecipes))
  const [orders, setOrders] = useState(() => readStorage('zyro-orders', seedOrders))
  const [inventory, setInventory] = useState(() => readStorage('zyro-inventory', seedInventory))
  const [productForm, setProductForm] = useState(initialProductForm)
  const [recipeForm, setRecipeForm] = useState(initialRecipeForm)
  const [orderForm, setOrderForm] = useState(initialOrderForm)
  const [inventoryForm, setInventoryForm] = useState(initialInventoryForm)
  const [editingProductId, setEditingProductId] = useState(null)
  const [editingInventoryItem, setEditingInventoryItem] = useState(null)
  const [expandedInventoryItem, setExpandedInventoryItem] = useState(seedInventory[0]?.item ?? null)
  const [loginForm, setLoginForm] = useState(initialLoginForm)
  const [userForm, setUserForm] = useState(initialUserForm)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let isMounted = true

    const hydrateFirebase = async () => {
      if (!firebaseEnabled || !db) {
        setFirebaseReady(true)
        return
      }

      const [firebaseUsers, firebaseProducts, firebaseRecipes, firebaseOrders, firebaseInventory, firebaseCurrentUser] =
        await Promise.all([
          readFirebaseCollection('users', seedUsers),
          readFirebaseCollection('products', seedProducts),
          readFirebaseCollection('recipes', seedRecipes),
          readFirebaseCollection('orders', seedOrders),
          readFirebaseCollection('inventory', seedInventory),
          readFirebaseCollection('currentUser', null),
        ])

      if (!isMounted) return

      setUsers(firebaseUsers)
      setProducts(firebaseProducts)
      setRecipes(firebaseRecipes)
      setOrders(firebaseOrders)
      setInventory(firebaseInventory)
      setCurrentUser(firebaseCurrentUser)
      setFirebaseReady(true)
    }

    hydrateFirebase()

    return () => {
      isMounted = false
    }
  }, [])

  useEffect(() => {
    window.localStorage.setItem('zyro-users', JSON.stringify(users))
  }, [users])

  useEffect(() => {
    if (currentUser) {
      window.localStorage.setItem('zyro-current-user', JSON.stringify(currentUser))
    } else {
      window.localStorage.removeItem('zyro-current-user')
    }
  }, [currentUser])

  useEffect(() => {
    window.localStorage.setItem('zyro-products', JSON.stringify(products))
  }, [products])

  useEffect(() => {
    window.localStorage.setItem('zyro-recipes', JSON.stringify(recipes))
  }, [recipes])

  useEffect(() => {
    window.localStorage.setItem('zyro-orders', JSON.stringify(orders))
  }, [orders])

  useEffect(() => {
    window.localStorage.setItem('zyro-inventory', JSON.stringify(inventory))
  }, [inventory])

  useEffect(() => {
    if (!firebaseReady || !firebaseEnabled || !db) return

    Promise.all([
      writeFirebaseCollection('users', users),
      writeFirebaseCollection('products', products),
      writeFirebaseCollection('recipes', recipes),
      writeFirebaseCollection('orders', orders),
      writeFirebaseCollection('inventory', inventory),
      writeFirebaseCollection('currentUser', currentUser),
    ])
  }, [users, products, recipes, orders, inventory, currentUser, firebaseReady])

  const tabs = currentUser?.role === 'admin' ? [...baseTabs, 'admin'] : baseTabs

  const totals = useMemo(() => {
    const activeProducts = products.length
    const activeRecipes = recipes.length
    const openOrders = orders.length
    const producedToday = orders.reduce((sum, order) => sum + Number(order.quantity || 0), 0)
    const critical = inventory.filter((item) => item.status === 'Nachbestellen').length

    return { activeProducts, activeRecipes, openOrders, producedToday, critical }
  }, [products, recipes, orders, inventory])

  const handleProductInput = (event) => {
    const { name, value } = event.target
    setProductForm((current) => ({ ...current, [name]: value }))
  }

  const handleRecipeInput = (event) => {
    const { name, value } = event.target
    setRecipeForm((current) => ({ ...current, [name]: value }))
  }

  const handleOrderInput = (event) => {
    const { name, value } = event.target
    setOrderForm((current) => ({ ...current, [name]: value }))
  }

  const handleInventoryInput = (event) => {
    const { name, value } = event.target
    setInventoryForm((current) => ({ ...current, [name]: value }))
  }

  const handleLoginInput = (event) => {
    const { name, value } = event.target
    setLoginForm((current) => ({ ...current, [name]: value }))
  }

  const handleUserInput = (event) => {
    const { name, value } = event.target
    setUserForm((current) => ({ ...current, [name]: value }))
  }

  const addProduct = (event) => {
    event.preventDefault()
    if (!productForm.name.trim() || !productForm.sku.trim()) return

    const newProduct = {
      id: Date.now(),
      name: productForm.name.trim(),
      sku: productForm.sku.trim().toUpperCase(),
      category: productForm.category,
      volume: productForm.volume || '500ml',
      status: productForm.status,
    }

    setProducts((current) => [newProduct, ...current])
    setOrderForm((current) => ({ ...current, product: current.product || newProduct.name }))
    setProductForm(initialProductForm)
  }

  const saveProduct = (event) => {
    event.preventDefault()
    if (!productForm.name.trim() || !productForm.sku.trim()) return

    const updatedProduct = {
      id: editingProductId,
      name: productForm.name.trim(),
      sku: productForm.sku.trim().toUpperCase(),
      category: productForm.category,
      volume: productForm.volume || '500ml',
      status: productForm.status,
    }

    setProducts((current) =>
      current.map((product) => (product.id === editingProductId ? { ...product, ...updatedProduct } : product)),
    )
    setEditingProductId(null)
    setProductForm(initialProductForm)
  }

  const removeProduct = (productId) => {
    const nextProducts = products.filter((product) => product.id !== productId)
    setProducts(nextProducts)
    setOrderForm((current) => ({ ...current, product: nextProducts[0]?.name || '' }))
    if (editingProductId === productId) {
      setEditingProductId(null)
      setProductForm(initialProductForm)
    }
  }

  const editProduct = (product) => {
    setEditingProductId(product.id)
    setProductForm({
      name: product.name,
      sku: product.sku,
      category: product.category,
      volume: product.volume,
      status: product.status,
    })
  }

  const addRecipe = (event) => {
    event.preventDefault()
    if (!recipeForm.name.trim() || !recipeForm.ingredients.trim()) return

    const newRecipe = {
      id: Date.now(),
      name: recipeForm.name.trim(),
      type: recipeForm.type,
      batchSize: recipeForm.batchSize || '5.000ml',
      description: recipeForm.description.trim() || 'Neue Rezeptur',
      ingredients: recipeForm.ingredients.trim(),
      status: 'Aktiv',
    }

    setRecipes((current) => [newRecipe, ...current])
    setRecipeForm(initialRecipeForm)
  }

  const addOrder = (event) => {
    event.preventDefault()
    if (!orderForm.customer.trim() || !orderForm.quantity) return

    const productName = orderForm.product || products[0]?.name || 'Zyro Produkt'
    const lotNumber = `ZYR-${productName
      .split(' ')
      .slice(1)
      .join('')
      .toUpperCase()
      .slice(0, 4)}-${String(Date.now()).slice(-4)}`

    const newOrder = {
      id: Date.now(),
      customer: orderForm.customer.trim(),
      product: productName,
      quantity: Number(orderForm.quantity),
      lotNumber,
      dueDate: orderForm.dueDate || '2026-10-25',
      status: orderForm.status,
    }

    setOrders((current) => [newOrder, ...current])
    setOrderForm({ ...initialOrderForm, product: products[0]?.name || productName })
  }

  const getInventoryStatus = (stock, ideal) => {
    if (stock >= ideal) return 'Gut'
    if (stock >= ideal * 0.7) return 'Warnung'
    return 'Nachbestellen'
  }

  const addInventoryItem = (event) => {
    event.preventDefault()
    if (!inventoryForm.item.trim()) return

    const normalizedItem = {
      item: inventoryForm.item.trim(),
      stock: Number(inventoryForm.stock) || 0,
      ideal: Number(inventoryForm.ideal) || 0,
      status: getInventoryStatus(Number(inventoryForm.stock) || 0, Number(inventoryForm.ideal) || 0),
    }

    if (editingInventoryItem) {
      setInventory((current) =>
        current.map((entry) =>
          entry.item === editingInventoryItem ? { ...entry, ...normalizedItem } : entry,
        ),
      )
      setEditingInventoryItem(null)
    } else {
      setInventory((current) => [normalizedItem, ...current])
    }

    setInventoryForm(initialInventoryForm)
  }

  const editInventoryItem = (item) => {
    setEditingInventoryItem(item.item)
    setInventoryForm({
      item: item.item,
      stock: String(item.stock),
      ideal: String(item.ideal),
      status: item.status,
    })
  }

  const removeInventoryItem = (itemName) => {
    setInventory((current) => current.filter((item) => item.item !== itemName))
    if (editingInventoryItem === itemName) {
      setEditingInventoryItem(null)
      setInventoryForm(initialInventoryForm)
    }
    setExpandedInventoryItem((current) => (current === itemName ? null : current))
  }

  const toggleInventoryMenu = (itemName) => {
    setExpandedInventoryItem((current) => (current === itemName ? null : itemName))
  }

  const restockItem = (itemName) => {
    setInventory((current) =>
      current.map((item) => {
        if (item.item !== itemName) return item
        const nextStock = Math.min(item.stock + 15, 100)
        return { ...item, stock: nextStock, status: getInventoryStatus(nextStock, item.ideal) }
      }),
    )
  }

  const removeRecipe = (recipeId) => {
    setRecipes((current) => current.filter((recipe) => recipe.id !== recipeId))
  }

  const removeOrder = (orderId) => {
    setOrders((current) => current.filter((order) => order.id !== orderId))
  }

  const removeUser = (userId) => {
    setUsers((current) => current.filter((user) => user.id !== userId))
  }

  const handleLogin = (event) => {
    event.preventDefault()

    const foundUser = users.find(
      (user) =>
        user.username.toLowerCase() === loginForm.username.trim().toLowerCase() &&
        user.password === loginForm.password,
    )

    if (!foundUser) {
      setAuthError('Benutzername oder Passwort falsch.')
      return
    }

    setCurrentUser({ id: foundUser.id, username: foundUser.username, role: foundUser.role, name: foundUser.name })
    setAuthError('')
    setLoginForm(initialLoginForm)
  }

  const handleAddUser = (event) => {
    event.preventDefault()

    if (!userForm.name.trim() || !userForm.username.trim() || !userForm.password.trim()) {
      return
    }

    const exists = users.some(
      (user) => user.username.toLowerCase() === userForm.username.trim().toLowerCase(),
    )

    if (exists) {
      return
    }

    setUsers((current) => [
      ...current,
      {
        id: Date.now(),
        name: userForm.name.trim(),
        username: userForm.username.trim(),
        password: userForm.password.trim(),
        role: userForm.role,
      },
    ])

    setUserForm(initialUserForm)
  }

  const handleLogout = () => {
    setCurrentUser(null)
    setActiveTab('dashboard')
  }

  if (!currentUser) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-header">
            <div className="brand-mark">Z</div>
            <div>
              <p className="brand-kicker">ZYRO</p>
              <h1>Login</h1>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleLogin}>
            <label>
              Benutzername
              <input
                type="text"
                name="username"
                value={loginForm.username}
                onChange={handleLoginInput}
                placeholder="admin"
              />
            </label>

            <label>
              Passwort
              <input
                type="password"
                name="password"
                value={loginForm.password}
                onChange={handleLoginInput}
                placeholder="••••••••"
              />
            </label>

            {authError && <p className="auth-error">{authError}</p>}

            <button type="submit" className="primary-button full-width-button">
              Einloggen
            </button>
          </form>

          <div className="demo-box">
            <strong>Demo-Zugang</strong>
            <span>Admin: admin / zyro123</span>
            <span>Mitarbeiter: mitarbeiter / zyro456</span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="zyro-app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <div className="brand-mark">Z</div>
          <div>
            <p className="brand-kicker">ZYRO</p>
            <h2>Management</h2>
          </div>
        </div>

        <div className="user-box">
          <span>Angemeldet</span>
          <strong>{currentUser.name}</strong>
          <small>{currentUser.role}</small>
        </div>

        <nav className="nav-menu">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? 'nav-button active' : 'nav-button'}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'dashboard' && 'Dashboard'}
              {tab === 'produkte' && 'Produkte'}
              {tab === 'rezepturen' && 'Rezepturen'}
              {tab === 'bestellungen' && 'Bestellungen'}
              {tab === 'lager' && 'Lager'}
              {tab === 'chargen' && 'Chargen'}
              {tab === 'admin' && 'Admin'}
            </button>
          ))}
        </nav>
      </aside>

      <main className="main-panel">
        <header className="main-header">
          <div>
            <p className="eyebrow">Getränkeproduktion</p>
            <h1>ZYRO Betriebsübersicht</h1>
          </div>
          <div className="header-actions">
            <button type="button" className="secondary-button" onClick={handleLogout}>
              Abmelden
            </button>
            <button type="button" className="primary-button">
              Neue Charge starten
            </button>
          </div>
        </header>

        {activeTab === 'dashboard' && (
          <>
            <section className="stats-grid">
              <article className="stat-card primary">
                <span>Produkte</span>
                <strong>{totals.activeProducts}</strong>
                <small>im Sortiment</small>
              </article>
              <article className="stat-card">
                <span>Rezepturen</span>
                <strong>{totals.activeRecipes}</strong>
                <small>aktiv und freigegeben</small>
              </article>
              <article className="stat-card">
                <span>Bestellungen</span>
                <strong>{totals.openOrders}</strong>
                <small>offene Aufträge</small>
              </article>
              <article className="stat-card warning">
                <span>Nachbestellungen</span>
                <strong>{totals.critical}</strong>
                <small>kritische Materialien</small>
              </article>
            </section>

            <section className="dashboard-grid">
              <div className="panel">
                <div className="panel-header">
                  <h2>Produktionsstatus</h2>
                  <span>Live</span>
                </div>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Kunde</th>
                        <th>Produkt</th>
                        <th>Menge</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orders.map((order) => (
                        <tr key={order.id}>
                          <td>{order.customer}</td>
                          <td>{order.product}</td>
                          <td>{order.quantity} l</td>
                          <td><span className="status-badge">{order.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="panel">
                <div className="panel-header">
                  <h2>Bestandsüberblick</h2>
                  <span>Lager</span>
                </div>
                <div className="inventory-list">
                  {inventory.map((item) => (
                    <div key={item.item} className="inventory-item">
                      <div>
                        <strong>{item.item}</strong>
                        <small>{item.status}</small>
                      </div>
                      <span>{item.stock}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </>
        )}

        {activeTab === 'produkte' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Produkt anlegen</h2>
                <span>Portfolio</span>
              </div>

              <form className="form-grid" onSubmit={editingProductId !== null ? saveProduct : addProduct}>
                <label>
                  Produktname
                  <input type="text" name="name" value={productForm.name} onChange={handleProductInput} placeholder="Zyro Mango Burst" />
                </label>
                <label>
                  SKU
                  <input type="text" name="sku" value={productForm.sku} onChange={handleProductInput} placeholder="ZYR-MB-004" />
                </label>
                <label>
                  Kategorie
                  <select name="category" value={productForm.category} onChange={handleProductInput}>
                    <option value="Energy">Energy</option>
                    <option value="Fruit">Fruit</option>
                    <option value="Zero">Zero</option>
                    <option value="Classic">Classic</option>
                  </select>
                </label>
                <label>
                  Volumen
                  <input type="text" name="volume" value={productForm.volume} onChange={handleProductInput} placeholder="500ml" />
                </label>
                <label>
                  Status
                  <select name="status" value={productForm.status} onChange={handleProductInput}>
                    <option value="Aktiv">Aktiv</option>
                    <option value="In Planung">In Planung</option>
                    <option value="Auslaufend">Auslaufend</option>
                  </select>
                </label>
                <button type="submit" className="primary-button full-width-button">
                  {editingProductId !== null ? 'Produkt aktualisieren' : 'Produkt speichern'}
                </button>
                {editingProductId !== null && (
                  <button
                    type="button"
                    className="secondary-button full-width-button"
                    onClick={() => {
                      setEditingProductId(null)
                      setProductForm(initialProductForm)
                    }}
                  >
                    Abbrechen
                  </button>
                )}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Produktliste</h2>
                <span>{products.length} Einträge</span>
              </div>
              <div className="card-list">
                {products.map((product) => (
                  <article key={product.id} className="mini-card">
                    <div className="mini-head">
                      <h3>{product.name}</h3>
                      <span className="pill">{product.category}</span>
                    </div>
                    <p>{product.sku}</p>
                    <ul>
                      <li>Volumen: {product.volume}</li>
                      <li>Status: {product.status}</li>
                    </ul>
                    <div className="mini-actions">
                      <button type="button" className="secondary-button small" onClick={() => editProduct(product)}>
                        Bearbeiten
                      </button>
                      <button type="button" className="danger-button" onClick={() => removeProduct(product.id)}>
                        Entfernen
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'rezepturen' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Rezeptur hinzufügen</h2>
                <span>Produktion</span>
              </div>

              <form className="form-grid" onSubmit={addRecipe}>
                <label>
                  Rezeptname
                  <input type="text" name="name" value={recipeForm.name} onChange={handleRecipeInput} placeholder="Zyro Tropical Spark" />
                </label>
                <label>
                  Kategorie
                  <select name="type" value={recipeForm.type} onChange={handleRecipeInput}>
                    <option value="Energy">Energy</option>
                    <option value="Fruit">Fruit</option>
                    <option value="Zero">Zero</option>
                    <option value="Classic">Classic</option>
                  </select>
                </label>
                <label>
                  Batchgröße
                  <input type="text" name="batchSize" value={recipeForm.batchSize} onChange={handleRecipeInput} placeholder="10.000ml" />
                </label>
                <label className="full-width">
                  Beschreibung
                  <textarea name="description" value={recipeForm.description} onChange={handleRecipeInput} placeholder="Geschmack, Merkmale, Zielgruppe..." />
                </label>
                <label className="full-width">
                  Zutaten
                  <textarea name="ingredients" value={recipeForm.ingredients} onChange={handleRecipeInput} placeholder={'Wasser: 6.000ml\nZitronensaft: 1.600ml\nSüßungsmittel: 300g'} />
                </label>
                <button type="submit" className="primary-button full-width-button">Rezept speichern</button>
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Rezepturbestand</h2>
                <span>{recipes.length} Einträge</span>
              </div>
              <div className="card-list">
                {recipes.map((recipe) => (
                  <article key={recipe.id} className="mini-card">
                    <div className="mini-head">
                      <h3>{recipe.name}</h3>
                      <span className="pill">{recipe.type}</span>
                    </div>
                    <p>{recipe.description}</p>
                    <ul>
                      {recipe.ingredients.split('\n').map((ingredient, index) => (
                        <li key={`${recipe.id}-${index}`}>{ingredient}</li>
                      ))}
                    </ul>
                    <div className="mini-actions">
                      <button type="button" className="danger-button" onClick={() => removeRecipe(recipe.id)}>
                        Entfernen
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'bestellungen' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Bestellung erfassen</h2>
                <span>Logistik</span>
              </div>

              <form className="form-grid" onSubmit={addOrder}>
                <label>
                  Kunde
                  <input type="text" name="customer" value={orderForm.customer} onChange={handleOrderInput} placeholder="Muster GmbH" />
                </label>
                <label>
                  Produkt
                  <select name="product" value={orderForm.product} onChange={handleOrderInput}>
                    {products.map((product) => (
                      <option key={product.id} value={product.name}>{product.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Menge (l)
                  <input type="number" name="quantity" value={orderForm.quantity} onChange={handleOrderInput} placeholder="250" />
                </label>
                <label>
                  Lieferdatum
                  <input type="date" name="dueDate" value={orderForm.dueDate} onChange={handleOrderInput} />
                </label>
                <label>
                  Status
                  <select name="status" value={orderForm.status} onChange={handleOrderInput}>
                    <option value="In Produktion">In Produktion</option>
                    <option value="Versandbereit">Versandbereit</option>
                    <option value="Abgeschlossen">Abgeschlossen</option>
                  </select>
                </label>
                <button type="submit" className="primary-button full-width-button">Bestellung speichern</button>
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Bestellübersicht</h2>
                <span>{orders.length} Aufträge</span>
              </div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Kunde</th>
                      <th>Produkt</th>
                      <th>Lot</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td>{order.customer}</td>
                        <td>{order.product}</td>
                        <td>{order.lotNumber}</td>
                        <td>
                          <div className="cell-actions">
                            <span className="status-badge">{order.status}</span>
                            <button type="button" className="danger-button small" onClick={() => removeOrder(order.id)}>
                              Löschen
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}

        {activeTab === 'lager' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Lagerbestand verwalten</h2>
                <span>Inventar</span>
              </div>

              <form className="form-grid" onSubmit={addInventoryItem}>
                <label>
                  Material
                  <input type="text" name="item" value={inventoryForm.item} onChange={handleInventoryInput} placeholder="Zitronensaft" />
                </label>
                <label>
                  Bestand (%)
                  <input type="number" name="stock" value={inventoryForm.stock} onChange={handleInventoryInput} placeholder="80" />
                </label>
                <label>
                  Zielbestand (%)
                  <input type="number" name="ideal" value={inventoryForm.ideal} onChange={handleInventoryInput} placeholder="100" />
                </label>
                <label>
                  Status
                  <select name="status" value={inventoryForm.status} onChange={handleInventoryInput}>
                    <option value="Gut">Gut</option>
                    <option value="Warnung">Warnung</option>
                    <option value="Nachbestellen">Nachbestellen</option>
                  </select>
                </label>
                <button type="submit" className="primary-button full-width-button">
                  {editingInventoryItem ? 'Bestand aktualisieren' : 'Bestand speichern'}
                </button>
                {editingInventoryItem && (
                  <button
                    type="button"
                    className="secondary-button full-width-button"
                    onClick={() => {
                      setEditingInventoryItem(null)
                      setInventoryForm(initialInventoryForm)
                    }}
                  >
                    Abbrechen
                  </button>
                )}
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Bestand</h2>
                <span>{inventory.length} Einträge</span>
              </div>

              <div className="inventory-grid">
                {inventory.map((item) => {
                  const isExpanded = expandedInventoryItem === item.item

                  return (
                    <div key={item.item} className={`inventory-card ${isExpanded ? 'expanded' : ''}`}>
                      <button type="button" className="inventory-toggle" onClick={() => toggleInventoryMenu(item.item)}>
                        <div>
                          <p className="inventory-name">{item.item}</p>
                          <small>{item.status}</small>
                        </div>
                        <span>{isExpanded ? '−' : '+'}</span>
                      </button>

                      {isExpanded && (
                        <>
                          <div className="inventory-amount">{item.stock}%</div>
                          <div className="mini-actions">
                            <button type="button" className="secondary-button small" onClick={() => editInventoryItem(item)}>
                              Bearbeiten
                            </button>
                            <button type="button" className="secondary-button small" onClick={() => restockItem(item.item)}>
                              Nachbestellen
                            </button>
                            <button type="button" className="danger-button" onClick={() => removeInventoryItem(item.item)}>
                              Entfernen
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'chargen' && (
          <section className="panel">
            <div className="panel-header">
              <h2>Lot- und Charge-Tracking</h2>
              <span>Spurbarkeit</span>
            </div>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th>Produkt</th>
                    <th>Kunde</th>
                    <th>Lieferdatum</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>{order.lotNumber}</td>
                      <td>{order.product}</td>
                      <td>{order.customer}</td>
                      <td>{order.dueDate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === 'admin' && currentUser.role === 'admin' && (
          <section className="two-column">
            <div className="panel">
              <div className="panel-header">
                <h2>Benutzer verwalten</h2>
                <span>Admin</span>
              </div>

              <form className="form-grid" onSubmit={handleAddUser}>
                <label>
                  Name
                  <input type="text" name="name" value={userForm.name} onChange={handleUserInput} placeholder="Max Mustermann" />
                </label>
                <label>
                  Benutzername
                  <input type="text" name="username" value={userForm.username} onChange={handleUserInput} placeholder="max" />
                </label>
                <label>
                  Passwort
                  <input type="password" name="password" value={userForm.password} onChange={handleUserInput} placeholder="••••••••" />
                </label>
                <label>
                  Rolle
                  <select name="role" value={userForm.role} onChange={handleUserInput}>
                    <option value="mitarbeiter">Mitarbeiter</option>
                    <option value="admin">Admin</option>
                  </select>
                </label>
                <button type="submit" className="primary-button full-width-button">Benutzer anlegen</button>
              </form>
            </div>

            <div className="panel">
              <div className="panel-header">
                <h2>Mitglieder</h2>
                <span>{users.length} Accounts</span>
              </div>
              <div className="card-list">
                {users.map((user) => (
                  <article key={user.id} className="mini-card">
                    <div className="mini-head">
                      <h3>{user.name}</h3>
                      <span className="pill">{user.role}</span>
                    </div>
                    <p>{user.username}</p>
                    <div className="mini-actions">
                      <button type="button" className="danger-button" onClick={() => removeUser(user.id)}>
                        Entfernen
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  )
}

export default App
