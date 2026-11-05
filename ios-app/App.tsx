import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  ApiError,
  apiGet,
  apiLogin,
  apiLogout,
  apiMde,
  AppUser,
  DataKey,
} from './src/api';

type Dataset = Record<DataKey, any[]>;
type Tab = 'Bestand' | 'Bewegungen' | 'Aufträge' | 'Kunden' | 'Umsatz';
type Dialog = 'receive' | 'shipment' | 'scanner' | null;

const dataKeys: DataKey[] = [
  'zyro-products',
  'zyro-stock-movements',
  'zyro-sales-documents',
  'zyro-customers',
  'zyro-sales-target',
];
const emptyData: Dataset = {
  'zyro-products': [],
  'zyro-stock-movements': [],
  'zyro-sales-documents': [],
  'zyro-customers': [],
  'zyro-sales-target': [],
};
const cacheKey = 'zyro.ios.data.v1';
const userKey = 'zyro.ios.user.v1';
const tokenKey = 'zyro.ios.session.v1';

const getStoredToken = () => Platform.OS === 'web' ? Promise.resolve(null) : SecureStore.getItemAsync(tokenKey);
const storeToken = (value: string) => Platform.OS === 'web' ? Promise.resolve() : SecureStore.setItemAsync(tokenKey, value);
const removeStoredToken = () => Platform.OS === 'web' ? Promise.resolve() : SecureStore.deleteItemAsync(tokenKey);

const displayStock = (value: unknown) => Number.isFinite(Number(value)) ? String(Number(value)) : '0';
const formatMoney = (value: unknown) => `${(Number(value) || 0).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}`;
const productLabel = (product: any) => String(product?.name || product?.productName || 'Produkt');
const can = (user: AppUser | null, permission: string) =>
  user?.role === 'admin' || (Array.isArray(user?.permissions) && user.permissions.includes(permission));

export default function App() {
  const [user, setUser] = useState<AppUser | null>(null);
  const [token, setToken] = useState('');
  const [data, setData] = useState<Dataset>(emptyData);
  const [online, setOnline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<Tab>('Bestand');
  const [dialog, setDialog] = useState<Dialog>(null);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [permission, requestPermission] = useCameraPermissions();
  const [scanOrder, setScanOrder] = useState<any>(null);
  const scanLocked = useRef(false);
  const [quantity, setQuantity] = useState('1');
  const [note, setNote] = useState('');
  const [carrier, setCarrier] = useState('DHL');
  const [carrierName, setCarrierName] = useState('DHL');
  const [trackingNumber, setTrackingNumber] = useState('');

  const products = data['zyro-products'];
  const movements = data['zyro-stock-movements'];
  const salesDocuments = data['zyro-sales-documents'];
  const salesTarget = Number(data['zyro-sales-target'][0]?.targetBottles) || 0;
  const customers = data['zyro-customers'];
  const orders = useMemo(
    () => salesDocuments.filter((record) => record.kind === 'kundenauftrag'),
    [salesDocuments],
  );
  const salesSummary = useMemo(() => salesDocuments
    .filter((document) => document.kind === 'rechnung' && !['Entwurf', 'Storniert'].includes(document.status))
    .reduce((summary, document) => {
      const items = Array.isArray(document.items) && document.items.length
        ? document.items
        : [{ quantity: document.quantity, unitPrice: document.unitPrice }];
      const net = items.reduce((total: number, item: any) =>
        total + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0), 0);
      summary.bottles += items.reduce((total: number, item: any) => total + (Number(item.quantity) || 0), 0);
      summary.revenue += net * (1 + (Number(document.vatRate) || 0) / 100);
      return summary;
    }, { bottles: 0, revenue: 0 }), [salesDocuments]);
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return products;
    return products.filter((product) =>
      [product.name, product.productName, product.sku, product.ean, product.ean13, product.barcode]
        .some((value) => String(value || '').toLocaleLowerCase().includes(query)),
    );
  }, [products, search]);

  const saveData = async (nextData: Dataset) => {
    setData(nextData);
    await AsyncStorage.setItem(cacheKey, JSON.stringify(nextData));
  };

  const refreshData = async (activeToken = token, activeUser = user) => {
    if (!activeToken) return;
    setRefreshing(true);
    setMessage('');
    try {
      const accessibleKeys = dataKeys.filter((key) => key !== 'zyro-sales-target' || can(activeUser, 'analyse'));
      const results = await Promise.all(accessibleKeys.map((key) => apiGet(activeToken, key)));
      const nextData = { ...emptyData };
      accessibleKeys.forEach((key, index) => {
        nextData[key] = Array.isArray(results[index].value) ? results[index].value : [];
      });
      await saveData(nextData);
      setMessage('Daten sind aktuell.');
    } catch (error) {
      setMessage(error instanceof Error ? `${error.message} Zwischengespeicherte Daten werden angezeigt.` : 'Aktualisierung fehlgeschlagen.');
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected && state.isInternetReachable !== false));
    });
    let mounted = true;
    const restore = async () => {
      try {
        const [storedToken, storedUser, storedData] = await Promise.all([
          getStoredToken(),
          AsyncStorage.getItem(userKey),
          AsyncStorage.getItem(cacheKey),
        ]);
        if (storedData && mounted) setData({ ...emptyData, ...JSON.parse(storedData) });
        if (storedToken && storedUser && mounted) {
          const parsedUser: AppUser = JSON.parse(storedUser);
          setToken(storedToken);
          setUser(parsedUser);
          try {
            const response = await apiGet(storedToken, 'zyro-products');
            if (mounted) {
              setData((current) => ({ ...current, 'zyro-products': response.value }));
              await refreshData(storedToken, parsedUser);
            }
          } catch (error) {
            if (error instanceof ApiError && error.status === 401) {
              await removeStoredToken();
              await AsyncStorage.removeItem(userKey);
              await AsyncStorage.removeItem(cacheKey);
              if (mounted) {
                setToken('');
                setUser(null);
                setData(emptyData);
                setMessage('Sitzung abgelaufen. Bitte erneut anmelden.');
              }
            } else if (mounted) {
              setMessage('Offline: Zuletzt gespeicherte Daten werden angezeigt.');
              setLoading(false);
            }
          }
        } else if (mounted) {
          setLoading(false);
        }
      } catch (error) {
        if (mounted) {
          setLoading(false);
          setMessage(error instanceof Error ? `Lokale Daten konnten nicht geladen werden: ${error.message}` : 'Lokale Daten konnten nicht geladen werden.');
        }
      }
    };
    void restore();
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const signIn = async () => {
    setLoading(true);
    setMessage('');
    try {
      const result = await apiLogin(username.trim(), password);
      await Promise.all([
        storeToken(result.sessionToken),
        AsyncStorage.setItem(userKey, JSON.stringify(result.user)),
      ]);
      setToken(result.sessionToken);
      setUser(result.user);
      setPassword('');
      await refreshData(result.sessionToken, result.user);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Anmeldung fehlgeschlagen.');
      setLoading(false);
    }
  };

  const signOut = async () => {
    try {
      if (token && online) await apiLogout(token);
    } catch (error) {
      setMessage(error instanceof Error ? `Abmeldung beim Server fehlgeschlagen: ${error.message}` : 'Abmeldung beim Server fehlgeschlagen.');
    } finally {
      await Promise.all([
        removeStoredToken(),
        AsyncStorage.removeItem(userKey),
        AsyncStorage.removeItem(cacheKey),
      ]);
      setToken('');
      setUser(null);
      setData(emptyData);
      setMessage('');
    }
  };

  const runReceive = async () => {
    if (!online || !selectedProduct) return;
    try {
      await apiMde(token, {
        action: 'receive',
        productId: String(selectedProduct.id),
        quantity: Number(quantity),
        note,
      });
      closeDialog();
      await refreshData();
      Alert.alert('Erledigt', 'Wareneingang wurde gebucht.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Wareneingang konnte nicht gebucht werden.');
    }
  };

  const runShipment = async () => {
    if (!online || !selectedOrder) return;
    try {
      const response = await apiMde(token, {
        action: 'shipment',
        orderId: String(selectedOrder.id),
        carrier,
        carrierName: carrier === 'DHL' ? 'DHL' : carrierName.trim(),
        trackingNumber: trackingNumber.trim(),
      });
      closeDialog();
      await refreshData();
      Alert.alert(
        response.emailSent ? 'Versand gebucht' : 'Versand gebucht',
        response.emailSent ? 'Der Auftrag wurde versendet und der Kunde benachrichtigt.' : `Der Auftrag wurde versendet. E-Mail: ${response.emailError || 'nicht gesendet.'}`,
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Versand konnte nicht gebucht werden.');
    }
  };

  const runOrderAction = async (action: 'accept' | 'pack', order: any) => {
    if (!online) return;
    try {
      await apiMde(token, { action, orderId: String(order.id) });
      await refreshData();
      Alert.alert(action === 'accept' ? 'Auftrag angenommen' : 'Auftrag verpackt', action === 'accept'
        ? 'Der Auftrag ist jetzt deiner Kommissionierung zugeordnet.'
        : 'Bestand wurde gebucht und der Auftrag als verpackt markiert.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Auftragsaktion fehlgeschlagen.');
    }
  };

  const closeDialog = () => {
    setDialog(null);
    setSelectedProduct(null);
    setSelectedOrder(null);
    setQuantity('1');
    setNote('');
    setTrackingNumber('');
    setCarrier('DHL');
    setCarrierName('DHL');
  };

  const openScanner = async () => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setMessage('Kamerazugriff wurde nicht erteilt. Bitte in den iOS-Einstellungen erlauben.');
        return;
      }
    }
    setScanOrder(null);
    setDialog('scanner');
  };

  const chooseBarcodeProduct = (code: string) => {
    const match = products.find((product) =>
      [product.ean, product.ean13, product.barcode, product.sku, product.id].some((value) => String(value || '') === code),
    );
    if (!match) {
      setDialog(null);
      setMessage(`Kein Produkt mit Barcode ${code} gefunden.`);
      return;
    }
    setSearch(String(match.name || match.productName || ''));
    setSelectedProduct(match);
    setDialog(null);
  };

  const scanOrderItem = async (code: string) => {
    const order = scanOrder;
    if (!order || scanLocked.current) return;
    scanLocked.current = true;
    setDialog(null);
    setScanOrder(null);
    try {
      const result = await apiMde(token, { action: 'scan', orderId: String(order.id), barcode: code });
      await refreshData();
      Alert.alert('Artikel gescannt', `${result.productName}: ${result.scannedQuantity} von ${result.requiredQuantity} Stück. Zum nächsten Artikel erneut scannen.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Artikel konnte nicht gescannt werden.');
    } finally {
      scanLocked.current = false;
    }
  };

  const openOrderScanner = async (order: any) => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) {
        setMessage('Kamerazugriff wurde nicht erteilt. Bitte in den iOS-Einstellungen erlauben.');
        return;
      }
    }
    setScanOrder(order);
    setDialog('scanner');
  };

  const handleBarcode = (code: string) => {
    if (scanOrder) {
      void scanOrderItem(code);
    } else {
      chooseBarcodeProduct(code);
    }
  };

  const openReceive = (product: any) => {
    setSelectedProduct(product);
    setDialog('receive');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#176b57" />
        <Text style={styles.muted}>ZYRO wird geladen …</Text>
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={styles.page}>
        <StatusBar style="light" />
        <KeyboardAvoidingView style={styles.loginWrap} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.brandBlock}>
            <Text style={styles.brand}>ZYRO</Text>
            <Text style={styles.brandSub}>BESTAND & UMSATZ</Text>
          </View>
          <Text style={styles.heading}>Anmelden</Text>
          <Text style={styles.muted}>Mit demselben Benutzerkonto wie in Zyro.</Text>
          <TextInput style={styles.input} value={username} onChangeText={setUsername} placeholder="Benutzername" autoCapitalize="none" autoCorrect={false} />
          <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder="Passwort" secureTextEntry />
          <PrimaryButton label="Anmelden" onPress={signIn} disabled={!online || !username.trim() || !password} />
          {!online && <Text style={styles.error}>Für die Anmeldung wird eine Internetverbindung benötigt.</Text>}
          {!!message && <Text style={styles.error}>{message}</Text>}
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.page}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View>
          <Text style={styles.brandSmall}>ZYRO</Text>
          <Text style={styles.greeting}>Hallo, {user.name}</Text>
        </View>
        <Pressable onPress={signOut}><Text style={styles.headerAction}>Abmelden</Text></Pressable>
      </View>
      <View style={[styles.connection, online ? styles.online : styles.offline]}>
        <Text style={styles.connectionText}>{online ? 'Online · Buchungen verfügbar' : 'Offline · Nur gespeicherte Daten'}</Text>
        <Pressable disabled={!online || refreshing} onPress={() => void refreshData()}>
          <Text style={styles.refreshText}>{refreshing ? 'Lädt …' : 'Aktualisieren'}</Text>
        </Pressable>
      </View>
      {!!message && <Text style={styles.notice}>{message}</Text>}
      <View style={styles.tabs}>
        {(['Bestand', 'Bewegungen', 'Aufträge', 'Kunden', 'Umsatz'] as Tab[]).map((item) => (
          <Pressable key={item} style={[styles.tab, tab === item && styles.tabActive]} onPress={() => { setTab(item); setSearch(''); }}>
            <Text style={[styles.tabText, tab === item && styles.tabTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <ScrollView style={styles.content} contentContainerStyle={styles.contentInner} keyboardShouldPersistTaps="handled">
        {tab === 'Bestand' && (
          <>
            <Text style={styles.sectionTitle}>Warenbestand</Text>
            <View style={styles.row}>
              <TextInput style={[styles.input, styles.flexInput]} value={search} onChangeText={setSearch} placeholder="Produkt, SKU oder Barcode suchen" />
              <Pressable style={styles.scanButton} onPress={() => void openScanner()}><Text style={styles.scanButtonText}>Scan</Text></Pressable>
            </View>
            {filteredProducts.map((product) => (
              <View key={String(product.id)} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle}>{productLabel(product)}</Text>
                    <Text style={styles.muted}>{product.sku || product.ean13 || product.ean || product.barcode || 'Keine Artikelnummer'}</Text>
                  </View>
                  <Text style={styles.stock}>{displayStock(product.availableBottles)} <Text style={styles.stockUnit}>Dosen</Text></Text>
                </View>
                <View style={styles.cardActions}>
                  {can(user, 'lager') || can(user, 'mde')
                    ? <SecondaryButton label="Wareneingang" disabled={!online} onPress={() => openReceive(product)} />
                    : null}
                </View>
              </View>
            ))}
            {filteredProducts.length === 0 && <Empty label="Keine Produkte gefunden." />}
          </>
        )}
        {tab === 'Bewegungen' && (
          <>
            <Text style={styles.sectionTitle}>Letzte Lagerbewegungen</Text>
            {movements.slice(0, 100).map((movement) => (
              <View key={String(movement.id)} style={styles.card}>
                <Text style={styles.cardTitle}>{movement.type || 'Bewegung'} · {movement.productName || movement.product || 'Produkt'}</Text>
                <Text style={styles.muted}>{movement.quantity ?? movement.change ?? '—'} Stück · {movement.userName || movement.user || 'Benutzer'} · {String(movement.timestamp || movement.date || '').slice(0, 10)}</Text>
                {!!movement.note && <Text style={styles.body}>{movement.note}</Text>}
              </View>
            ))}
            {movements.length === 0 && <Empty label="Keine Lagerbewegungen gespeichert." />}
          </>
        )}
        {tab === 'Aufträge' && (
          <>
            <Text style={styles.sectionTitle}>Kundenaufträge & Versand</Text>
            {orders.map((order) => (
              <View key={String(order.id)} style={styles.card}>
                <View style={styles.cardTop}>
                  <View style={styles.flex}>
                    <Text style={styles.cardTitle}>{order.number || 'Auftrag'} · {order.recipient || 'Kunde'}</Text>
                    <Text style={styles.muted}>{order.status || 'Offen'} · {order.recipientEmail || 'Keine E-Mail'}{order.pickingUserName ? ` · ${order.pickingUserName}` : ''}</Text>
                  </View>
                </View>
                <Text style={styles.body}>{order.description || (order.items || []).map((item: any) => `${item.productName} × ${item.quantity}`).join(', ')}</Text>
                {(can(user, 'lager') || can(user, 'mde')) && (
                  <View style={styles.cardActions}>
                    {['Offen', 'Bestätigt', 'In Produktion'].includes(order.status) && (
                      <SecondaryButton label="Auftrag annehmen" disabled={!online} onPress={() => void runOrderAction('accept', order)} />
                    )}
                    {order.status === 'Kommissionierung' && String(order.pickingUserId) === String(user.id) && (
                      <SecondaryButton label="Artikel scannen" disabled={!online} onPress={() => void openOrderScanner(order)} />
                    )}
                    {order.status === 'Kommissionierung' && String(order.pickingUserId) === String(user.id) && (
                      <SecondaryButton label="Fertig verpacken" disabled={!online} onPress={() => void runOrderAction('pack', order)} />
                    )}
                  </View>
                )}
                {can(user, 'versand') && order.status === 'Verpackt' && (
                  <View style={styles.cardActions}>
                    <SecondaryButton label="Versand erfassen" disabled={!online} onPress={() => { setSelectedOrder(order); setDialog('shipment'); }} />
                  </View>
                )}
              </View>
            ))}
            {orders.length === 0 && <Empty label="Keine Kundenaufträge vorhanden." />}
          </>
        )}
        {tab === 'Kunden' && (
          <>
            <Text style={styles.sectionTitle}>Kunden</Text>
            {customers.map((customer) => (
              <View key={String(customer.id)} style={styles.card}>
                <Text style={styles.cardTitle}>{customer.name || customer.company || 'Kunde'}</Text>
                <Text style={styles.muted}>{customer.email || customer.phone || ''}</Text>
                <Text style={styles.body}>{[customer.address, customer.postalCode, customer.city].filter(Boolean).join(' ')}</Text>
              </View>
            ))}
            {customers.length === 0 && <Empty label="Keine Kunden vorhanden." />}
          </>
        )}
        {tab === 'Umsatz' && (
          <>
            <Text style={styles.sectionTitle}>Umsatzübersicht</Text>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Umsatz (brutto)</Text>
              <Text style={styles.metricValue}>{formatMoney(salesSummary.revenue)}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Verkaufte Dosen</Text>
              <Text style={styles.metricValue}>{salesSummary.bottles.toLocaleString('de-DE')}</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Verkaufsziel</Text>
              {salesTarget > 0 ? (
                <>
                  <Text style={styles.metricValue}>{salesSummary.bottles.toLocaleString('de-DE')} / {salesTarget.toLocaleString('de-DE')}</Text>
                  <View style={styles.goalTrack}>
                    <View style={[styles.goalFill, { width: `${Math.min(100, salesSummary.bottles / salesTarget * 100)}%` }]} />
                  </View>
                  <Text style={styles.muted}>{Math.min(100, Math.round(salesSummary.bottles / salesTarget * 100))}% erreicht · {Math.max(0, salesTarget - salesSummary.bottles).toLocaleString('de-DE')} Dosen bis zum Ziel</Text>
                </>
              ) : <Text style={styles.muted}>Noch kein Verkaufsziel in der Desktop-App festgelegt.</Text>}
            </View>
            <Text style={styles.muted}>Berechnet aus ausgestellten Rechnungen. Entwürfe und stornierte Rechnungen sind ausgeschlossen.</Text>
          </>
        )}
      </ScrollView>
      <Modal visible={dialog !== null} animationType="slide" onRequestClose={closeDialog}>
        <SafeAreaView style={styles.modalPage}>
          <View style={styles.modalHeader}>
            <Text style={styles.sectionTitle}>
              {dialog === 'receive' ? 'Wareneingang' : dialog === 'shipment' ? 'Versand erfassen' : 'Barcode scannen'}
            </Text>
            <Pressable onPress={closeDialog}><Text style={styles.headerAction}>Schließen</Text></Pressable>
          </View>
          {dialog === 'scanner' ? (
            <View style={styles.cameraWrap}>
              <CameraView
                style={styles.camera}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'code39', 'qr'] }}
                onBarcodeScanned={({ data: code }) => handleBarcode(code)}
              />
              <Text style={styles.cameraHint}>{scanOrder ? `Auftrag ${scanOrder.number || ''}: Artikelbarcode scannen` : 'Produktbarcode in den Rahmen halten'}</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.form}>
              {dialog === 'receive' && <>
                <Text style={styles.muted}>Produkt</Text>
                <Text style={styles.cardTitle}>{productLabel(selectedProduct)}</Text>
                <Field label="Menge" value={quantity} onChangeText={setQuantity} keyboardType="number-pad" />
                <Field label="Notiz (optional)" value={note} onChangeText={setNote} />
                <PrimaryButton label="Wareneingang buchen" disabled={!online || !can(user, 'lager') && !can(user, 'mde')} onPress={() => void runReceive()} />
              </>}
              {dialog === 'shipment' && <>
                <Text style={styles.cardTitle}>{selectedOrder?.number} · {selectedOrder?.recipient}</Text>
                <View style={styles.carrierOptions}>
                  {(['DHL', 'Spedition'] as const).map((option) => (
                    <Pressable key={option} style={[styles.carrierOption, carrier === option && styles.carrierSelected]} onPress={() => { setCarrier(option); setCarrierName(option); }}>
                      <Text style={[styles.carrierText, carrier === option && styles.carrierTextSelected]}>{option}</Text>
                    </Pressable>
                  ))}
                </View>
                {carrier === 'Spedition' && <Field label="Name der Spedition" value={carrierName} onChangeText={setCarrierName} />}
                <Field label="Sendungsnummer" value={trackingNumber} onChangeText={setTrackingNumber} />
                <PrimaryButton label="Versand buchen" disabled={!online || !can(user, 'versand') || !trackingNumber.trim() || carrier === 'Spedition' && !carrierName.trim()} onPress={() => void runShipment()} />
              </>}
              {!online && <Text style={styles.error}>Offline sind Buchungen deaktiviert.</Text>}
              {!!message && <Text style={styles.error}>{message}</Text>}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function Field(props: { label: string; value: string; onChangeText: (value: string) => void; keyboardType?: 'default' | 'number-pad' | 'decimal-pad' | 'email-address' }) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput style={styles.input} value={props.value} onChangeText={props.onChangeText} keyboardType={props.keyboardType || 'default'} autoCapitalize={props.keyboardType === 'email-address' ? 'none' : 'sentences'} />
    </View>
  );
}

function PrimaryButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable style={[styles.primaryButton, props.disabled && styles.disabled]} disabled={props.disabled} onPress={props.onPress}><Text style={styles.primaryButtonText}>{props.label}</Text></Pressable>;
}

function SecondaryButton(props: { label: string; onPress: () => void; disabled?: boolean }) {
  return <Pressable style={[styles.secondaryButton, props.disabled && styles.disabled]} disabled={props.disabled} onPress={props.onPress}><Text style={styles.secondaryButtonText}>{props.label}</Text></Pressable>;
}

function Empty(props: { label: string }) {
  return <View style={styles.empty}><Text style={styles.muted}>{props.label}</Text></View>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#f2f5f4' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, backgroundColor: '#f2f5f4' },
  loginWrap: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  brandBlock: { marginBottom: 28 },
  brand: { color: '#176b57', fontSize: 38, fontWeight: '900', letterSpacing: 4 },
  brandSub: { color: '#5d706a', fontSize: 11, fontWeight: '700', letterSpacing: 2 },
  brandSmall: { color: '#b9e5d7', fontSize: 16, fontWeight: '900', letterSpacing: 2 },
  heading: { color: '#17231f', fontSize: 28, fontWeight: '800' },
  greeting: { color: '#e4f3ed', fontSize: 12, marginTop: 2 },
  header: { backgroundColor: '#176b57', minHeight: 70, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerAction: { color: '#176b57', fontWeight: '700' },
  connection: { paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  online: { backgroundColor: '#e0f2e9' },
  offline: { backgroundColor: '#fff0e8' },
  connectionText: { color: '#33453e', fontSize: 12, fontWeight: '600' },
  refreshText: { color: '#176b57', fontWeight: '700', fontSize: 12 },
  notice: { backgroundColor: '#fff6dc', color: '#644e16', paddingVertical: 7, paddingHorizontal: 14, fontSize: 12 },
  tabs: { flexDirection: 'row', paddingHorizontal: 8, backgroundColor: '#fff', borderBottomWidth: StyleSheet.hairlineWidth, borderColor: '#d7e0dc' },
  tab: { paddingHorizontal: 10, paddingVertical: 13, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: '#176b57' },
  tabText: { fontSize: 12, color: '#65736e', fontWeight: '600' },
  tabTextActive: { color: '#176b57' },
  content: { flex: 1 },
  contentInner: { padding: 14, paddingBottom: 35, gap: 10 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#17231f', marginBottom: 4 },
  metricCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18, borderWidth: 1, borderColor: '#e2e9e5', gap: 8 },
  metricLabel: { color: '#65736e', fontSize: 13, fontWeight: '600' },
  metricValue: { color: '#176b57', fontSize: 28, fontWeight: '900' },
  goalTrack: { height: 12, overflow: 'hidden', borderRadius: 99, backgroundColor: '#e6ece8', marginTop: 4 },
  goalFill: { height: '100%', borderRadius: 99, backgroundColor: '#176b57' },
  input: { backgroundColor: '#fff', borderColor: '#d4ded9', borderWidth: 1, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 12, color: '#17231f', fontSize: 15 },
  flexInput: { flex: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  scanButton: { backgroundColor: '#176b57', borderRadius: 10, paddingHorizontal: 15, paddingVertical: 14 },
  scanButtonText: { color: '#fff', fontWeight: '800' },
  card: { backgroundColor: '#fff', borderRadius: 13, padding: 14, marginBottom: 2, borderWidth: 1, borderColor: '#e2e9e5', gap: 8 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cardTitle: { color: '#1c2b25', fontSize: 15, fontWeight: '700' },
  muted: { color: '#65736e', fontSize: 12, lineHeight: 18 },
  body: { color: '#34443e', fontSize: 13, lineHeight: 19 },
  stock: { color: '#176b57', fontSize: 21, fontWeight: '800' },
  stockUnit: { fontSize: 11, fontWeight: '600' },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 3 },
  flex: { flex: 1 },
  primaryButton: { backgroundColor: '#176b57', borderRadius: 11, paddingHorizontal: 16, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryButtonText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  secondaryButton: { borderWidth: 1, borderColor: '#176b57', borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9 },
  secondaryButtonText: { color: '#176b57', fontWeight: '700', fontSize: 12 },
  disabled: { opacity: 0.45 },
  empty: { padding: 22, alignItems: 'center' },
  modalPage: { flex: 1, backgroundColor: '#f2f5f4' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff' },
  form: { padding: 18, gap: 14 },
  field: { gap: 6 },
  fieldLabel: { color: '#465850', fontWeight: '700', fontSize: 12 },
  carrierOptions: { flexDirection: 'row', gap: 10 },
  carrierOption: { paddingVertical: 11, paddingHorizontal: 18, borderRadius: 10, borderColor: '#cdd9d3', borderWidth: 1, backgroundColor: '#fff' },
  carrierSelected: { backgroundColor: '#176b57', borderColor: '#176b57' },
  carrierText: { color: '#465850', fontWeight: '700' },
  carrierTextSelected: { color: '#fff' },
  cameraWrap: { flex: 1, padding: 16, gap: 12 },
  camera: { flex: 1, borderRadius: 14, overflow: 'hidden' },
  cameraHint: { textAlign: 'center', color: '#465850', padding: 12, fontWeight: '600' },
  error: { color: '#b42318', fontSize: 13, lineHeight: 19 },
});
