// Behördenmappe: Formulare zur Lebensmittelsicherheit (A–F) und Verwaltung (G).
// Übernommen aus ZYRO Büro. Firmendaten kommen aus den Cloud-Einstellungen.
/* eslint-disable */

export const qmGroups = {
  A: 'Unternehmen & Registrierungen',
  B: 'Eigenkontrolle & Hygiene',
  C: 'Herstellung & Rückverfolgbarkeit',
  D: 'Kennzeichnung & Analytik',
  E: 'Reklamation & Krise',
  F: 'Lohnherstellung & Handel',
  G: 'Verwaltung & Personal',
}

function makeDocs(C) {
const FIRMA = C.firma, ADR = C.adresse, MAIL = C.mail, GF = C.gf;
const ROH = [['Citronensäure', 'E 330'], ['Natriumcitrat', 'E 331'], ['Ascorbinsäure', 'E 300'], ['Sucralose', 'E 955'], ['Acesulfam K', 'E 950'],
  ['Pfirsicharoma', 'natürliches Aroma'], ['Maracujaaroma', 'Aroma'], ['Beta-Carotin', 'E 160a'], ['Kaliumsorbat', 'E 202'], ['Wasser', 'Trinkwasser'], ['Kohlensäure', 'E 290'],
  ['Dose 0,5 l + Deckel', 'Verpackung'], ['Tray 24er', 'Verpackung'], ['Schrumpffolie', 'Verpackung']];
const SITZ = C.sitz, HR = C.register;
const LA = C.la, LAK = C.lak;
const UST = C.ust, STNR = C.stnr;
const LIEF = { 'Sucralose': 'Ingreo', 'Acesulfam K': 'Ingreo', 'Ascorbinsäure': 'Dr. Lohmann Diaclean GmbH', 'Natriumcitrat': 'Dr. Lohmann Diaclean GmbH', 'Citronensäure': 'Dr. Lohmann Diaclean GmbH', 'Kaliumsorbat': 'Dr. Lohmann Diaclean GmbH',
  'Beta-Carotin': 'Distribution GmbH', 'Pfirsicharoma': 'Mein Aroma (Hersteller: Néroliane, FR)', 'Maracujaaroma': 'Mein Aroma', 'Wasser': 'Lohnhersteller (Trinkwasser)', 'Kohlensäure': 'Lohnhersteller',
  'Dose 0,5 l + Deckel': 'Dosenhersteller (Beistellung)', 'Tray 24er': 'Druckerei / Kartonagen', 'Schrumpffolie': 'Lohnhersteller' };
const D = [];
const add = (f, no, title, sub, blocks) => D.push([f, no, title, sub, blocks]);

add('A02_Anmeldung_Lebensmittelunternehmer.docx', 'A02', 'Anmeldung als Lebensmittelunternehmer',
  'Registrierung nach Art. 6 Abs. 2 VO (EG) Nr. 852/2004 bei der zuständigen Lebensmittelüberwachung – vor Aufnahme der Tätigkeit.', [
  { h: 'Empfänger' },
  { p: 'Kreis Siegen-Wittgenstein\nVeterinär- und Lebensmittelüberwachungsamt\n57069 Siegen\nveterinaeramt@siegen-wittgenstein.de · Tel. 0271 333-2869' },
  { note: 'Kontaktdaten aus öffentlichem Verzeichnis – vor Versand auf siegen-wittgenstein.de prüfen. Viele Kreise haben einen eigenen Meldebogen; dann diesen verwenden und die Angaben unten übernehmen.' },
  { h: '1 · Lebensmittelunternehmer' },
  { fields: [['Firma / Rechtsform', FIRMA], ['Geschäftsführer (eingetragen)', GF]] },
  { note: 'Christian Roedel: Aufnahme als Gesellschafter und Bestellung zum weiteren Geschäftsführer beim Notar vorgesehen – nach Eintragung nachmelden.' },
  { fields: [['Satzungssitz (aktuell)', SITZ], ['Geschäftsanschrift / Betrieb', ADR]] },
  { fields: [['Handelsregister', HR], ['E-Mail', MAIL], ['Telefon', '']] },
  { fields: [['Steuernummer', STNR], ['USt-IdNr.', UST]] },
  { note: 'Sitzverlegung nach Siegen per Satzungsänderung in Vorbereitung – nach Eintragung neuen Sitz und neue HRB-Nummer (Amtsgericht Siegen) nachmelden.' },
  { h: '2 · Betriebsstätte(n)' },
  { fields: [['Verwaltung / Entwicklung', ADR], ['Lager (falls abweichend)', '']] },
  { fields: [['Herstellung / Abfüllung (Lohnabfüller)', LA + ' – eigene Registrierung des Abfüllers in den Niederlanden']] },
  { h: '3 · Art der Tätigkeit' },
  { check: ['Herstellung (Rezeptur, Entwicklung) und **Inverkehrbringen** alkoholfreier Erfrischungsgetränke unter der Marke ZYRO',
    'Herstellung im Lohnauftrag bei einem registrierten Abfüllbetrieb in den Niederlanden (The Stillery, Amsterdam); Verbringen nach Deutschland', 'Lagerung verpackter Getränke (Dosen, ungekühlt lagerfähig)', 'Großhandel / Abgabe an den Lebensmitteleinzelhandel', 'Abgabe an Endverbraucher (Online / Direktverkauf)'] },
  { fields: [['Produkte', 'ZYRO Peach × Maracuja – Erfrischungsgetränk mit Süßungsmitteln, 0,5-l-Dose, Einweg mit Pfand'], ['Geplanter Beginn', '01.12.2026']] },
  { h: '4 · Erklärung' },
  { p: 'Hiermit melden wir die oben genannte Tätigkeit zur Registrierung an. Änderungen (z. B. neue Betriebsstätte, Aufgabe der Tätigkeit) teilen wir unverzüglich mit.' },
  { sig: ['Siegen, Datum, Unterschrift Geschäftsführer', 'Stempel'] }]);

add('A03_Verpackungsregister_LUCID.docx', 'A03', 'Verpackungsregister LUCID & Verpackungslizenz',
  'Checkliste nach Verpackungsgesetz (VerpackG). Registrierung bei der Zentralen Stelle Verpackungsregister: lucid.verpackungsregister.org – kostenlos, **vor dem ersten Inverkehrbringen**.', [
  { h: '1 · Registrierung LUCID' },
  { check: ['Registrierung durchgeführt – Registrierungsnummer: DE______________________', 'Angaben: Firma, Anschrift, Geschäftsführer, Markenname **ZYRO**, nationale Kennnummer: **' + HR + '** bzw. USt-IdNr. **' + UST + '** (nach Sitzverlegung aktualisieren)',
    'Herstellerverantwortung als **Erstinverkehrbringer** angegeben – Abfüllung in den Niederlanden, Liberty Street Food GmbH bringt die befüllten Verpackungen in Deutschland erstmals in Verkehr', 'Bestätigung abgespeichert / ausgedruckt'] },
  { h: '2 · Verpackungen von ZYRO' },
  { table: { w: [2.2, 1.6, 1.6, 2.6], head: ['Verpackung', 'Material', 'Pfand?', 'Pflichten'], rows: [
    ['Dose 0,5 l + Deckel', 'Aluminium', 'ja (DPG)', 'In LUCID registrieren · **keine** Systembeteiligung, da pfandpflichtig · Pfand über DPG (Dok. A04)'],
    ['Tray 24er', 'Wellpappe / Papier', 'nein', 'Prüfen: landet er beim Endverbraucher (Kauf ganzer Trays) → systembeteiligungspflichtig; bleibt er beim Händler → Umverpackung, Rücknahme mit Händler regeln'],
    ['Schrumpffolie', 'Kunststoff (LDPE)', 'nein', 'wie Tray'],
    ['Versandkarton Online', 'Papier/Pappe', 'nein', 'systembeteiligungspflichtig, falls Online-Verkauf an Endkunden']] } },
  { note: 'Einordnung von Tray und Folie mit dem dualen System bzw. der Zentralen Stelle abstimmen – das ist die häufigste Fehlerquelle.' },
  { h: '3 · Systembeteiligung (Lizenz)' },
  { fields: [['Duales System / Anbieter', ''], ['Vertrags-Nr.', ''], ['Vertragsbeginn', '']] },
  { table: { w: [2.5, 2, 2, 2], head: ['Material', 'Planmenge Jahr (kg)', 'Gemeldet am', 'Bemerkung'], rows: [['Papier/Pappe/Karton', '', '', ''], ['Kunststoffe', '', '', ''], ['Aluminium (nur nicht-pfandpflichtig)', '', '', '']] } },
  { h: '4 · Laufende Pflichten' },
  { check: ['Datenmeldungen an LUCID **identisch** zu den Meldungen an das duale System', 'Jahresabschlussmeldung bis 15. Mai des Folgejahres', 'Bei Überschreiten der Mengenschwellen: Vollständigkeitserklärung prüfen', 'Händler fragen ggf. nach LUCID-Nummer – griffbereit halten'] },
  { sig: ['Erledigt am / von', 'Geprüft am / von'] }]);

add('A04_DPG-Pfandsystem.docx', 'A04', 'DPG-Einwegpfand – Teilnahme & EAN-Meldung',
  'Einweggetränkedosen sind in Deutschland pfandpflichtig (0,25 €). Als Erstinverkehrbringer muss Liberty Street Food GmbH am DPG-System teilnehmen.', [
  { h: '1 · Teilnahme' },
  { check: ['Kontakt mit der DPG Deutsche Pfandsystem GmbH aufgenommen (dpg-pfandsystem.de)', 'Teilnahmevertrag als Erstinverkehrbringer geschlossen – Vertragsnr.: ______________',
    'Teilnehmerentgelt / Gebühren geklärt', 'Zugang zum DPG-Portal eingerichtet'] },
  { h: '2 · Artikelmeldung' },
  { table: { w: [2.4, 2, 1.5, 1.5, 1.6], head: ['Artikel', 'EAN', 'Füllmenge', 'Material', 'Gemeldet am'], rows: [['ZYRO Peach × Maracuja Dose', '4270005618807', '0,5 l', 'Aluminium', '']] , empty: 2 } },
  { note: 'Die EAN muss vor dem ersten Verkauf in der DPG-Datenbank gemeldet sein – sonst nehmen Rücknahmeautomaten die Dose nicht an.' },
  { h: '3 · Kennzeichnung auf der Dose' },
  { check: ['DPG-Pfandlogo in vorgeschriebener Größe und Position auf dem Dosendesign (laut DPG-Gestaltungsrichtlinie)', 'Strichcode (EAN) lesbar und nicht verdeckt – ggf. Lesetest beim Dosenhersteller', 'Hinweis bei Druckfreigabe des Dosenherstellers: Version **mit** Pfandsymbol bestellen (Angebot enthielt „noDS“ – klären!)'] },
  { h: '4 · Sicherheitsmerkmal' },
  { check: ['Klären, ob DPG-Sicherheitsfarbe/-merkmal über den Dosenhersteller aufgebracht wird', 'Bestätigung vom Dosenhersteller erhalten'] },
  { sig: ['Erledigt am / von', 'Geprüft am / von'] }]);

add('B01_HACCP-Konzept.docx', 'B01', 'HACCP-Konzept',
  'Gefahrenanalyse und kritische Kontrollpunkte nach Art. 5 VO (EG) Nr. 852/2004 für ZYRO Peach × Maracuja (Lohnabfüllung). Jährlich und bei jeder Änderung überprüfen.', [
  { h: '1 · Produkt & Team' },
  { fields: [['Produkt', 'Erfrischungsgetränk mit Süßungsmitteln, CO₂, 0,5-l-Dose'], ['pH-Ziel', 'ca. 3,0–3,4 (sauer)'], ['Haltbarkeit', 'MHD nach Lagertest']] },
  { fields: [['HACCP-Verantwortlicher', 'Maximilian Brenner'], ['Team', 'Christian Roedel · QS The Stillery (Nik Noordermeer)'], ['Stand / Version', '']] },
  { h: '2 · Prozessschritte' },
  { list: ['Wareneingang Rohstoffe & Verpackung (Dok. C02)', 'Lagerung Rohstoffe (trocken, kühl, lichtgeschützt)', 'Einwiegen der Rohstoffe nach Rezeptur', 'Lösen / Mischen (Sirup bzw. Fertiggetränk)', 'Karbonisierung', 'Abfüllung & Verschließen der Dosen', 'Wärmebehandlung (Tunnelpasteur o. Ä., falls beim Abfüller)', 'Kodierung MHD / Los', 'Verpacken in Tray, Palettieren', 'Lagerung & Versand Fertigware'] },
  { h: '3 · Gefahrenanalyse' },
  { table: { w: [1.8, 2.8, 2.6, 1.0], head: ['Schritt', 'Gefahr', 'Maßnahme', 'CCP?'], rows: [
    ['Wareneingang', 'Falsche / verdorbene Rohstoffe, fehlende Spezifikation', 'Lieferantenfreigabe, Datenblätter (Dok. C01), Sichtkontrolle', 'nein'],
    ['Einwiegen', '**Überdosierung Süßungsmittel / Konservierungsstoff** (Höchstmengen)', 'Feinwaage geprüft, Vier-Augen-Prinzip, Protokoll', '**CCP 1**'],
    ['Mischen', 'Unvollständiges Lösen, Fremdkörper', 'Rühren bis klar, Filtration/Sieb beim Abfüller', 'nein'],
    ['Abfüllung', 'Mikrobielle Kontamination, Fremdkörper (Glas/Metall)', 'Reinigung/Desinfektion Anlage, Dosen-Spülung, HACCP des Abfüllers', 'beim Abfüller'],
    ['Verschließen', 'Undichte Dose → Verderb', 'Falzkontrolle durch Abfüller', 'beim Abfüller'],
    ['Wärmebehandlung', 'Überleben von Hefen/Schimmel', 'Temperatur/Zeit dokumentieren', '**CCP 2** (falls angewendet)'],
    ['Kodierung', 'Falsches/fehlendes MHD/Los → Rückverfolgung nicht möglich', 'Kontrolle Anfang/Ende jeder Charge', 'nein'],
    ['Lagerung', 'Hitze, Licht, Beschädigung', 'Lagerbedingungen, Sichtkontrolle', 'nein']] } },
  { h: '4 · Kritische Kontrollpunkte' },
  { table: { w: [1.4, 2.4, 1.8, 1.8, 1.8], head: ['CCP', 'Grenzwert', 'Überwachung', 'Korrektur', 'Nachweis'], rows: [
    ['CCP 1\nDosierung', 'Sucralose ≤ 300 mg/l · Acesulfam K ≤ 350 mg/l · Sorbinsäure ≤ 300 mg/l (als freie Säure)*\nRezeptur: 100 / 120 / ca. 186 mg/l', 'Jede Einwaage, Vier-Augen', 'Ansatz sperren, neu berechnen / verwerfen', 'Herstellungsprotokoll Dok. C03'],
    ['CCP 2\nErhitzung', 'lt. Abfüller, z. B. ≥ 85 °C / ≥ 3 min bzw. PE-Wert', 'Kontinuierlich (Schreiber)', 'Charge sperren, nachbehandeln', 'Protokoll Abfüller']] } },
  { note: '* Höchstmengen nach VO (EG) Nr. 1333/2008, Anhang II, Kategorie 14.1.4 (aromatisierte Getränke, brennwertvermindert / ohne Zuckerzusatz) – vor Verwendung mit aktuellem Rechtsstand abgleichen.' },
  { h: '5 · Verifizierung & Dokumentation' },
  { check: ['HACCP-Unterlagen des Lohnabfüllers angefordert und geprüft', 'Jährliche Überprüfung des Konzepts', 'Schulung aller Beteiligten (Dok. B02)', 'Aufbewahrung der Protokolle mind. bis MHD + 1 Jahr'] },
  { sig: ['Erstellt (Datum, Unterschrift)', 'Freigegeben (Datum, Unterschrift)'] }]);

add('D01_Kennzeichnung_LMIV-Checkliste.docx', 'D01', 'Etikett-Checkliste nach LMIV',
  'Pflichtangaben nach VO (EU) Nr. 1169/2011 (LMIV) und weiteren Vorschriften – vor jeder Druckfreigabe der Dose abhaken.', [
  { h: 'Pflichtangaben' },
  { table: { w: [0.5, 2.6, 4.2, 0.9], head: ['✓', 'Angabe', 'ZYRO – Vorschlag / Hinweis', 'Seite'], rows: [
    ['☐', 'Bezeichnung des Lebensmittels', 'z. B. „Erfrischungsgetränk mit Pfirsich-Maracuja-Geschmack, mit Süßungsmitteln“ – Fantasiename „ZYRO“ ersetzt sie nicht', ''],
    ['☐', 'Zutatenverzeichnis', 'absteigend nach Gewicht; Zusatzstoffe mit Klassenname + Name/E-Nr. (z. B. „Säuerungsmittel Citronensäure“)', ''],
    ['☐', 'Allergene hervorgehoben', 'laut Datenblättern keine – für jedes Aroma bestätigen lassen', ''],
    ['☐', '„mit Süßungsmittel(n)“', 'in Verbindung mit der Bezeichnung', ''],
    ['☐', 'Nettofüllmenge', '„0,5 l“ – im selben Sichtfeld wie die Bezeichnung, Mindestschriftgröße beachten', ''],
    ['☐', 'Mindesthaltbarkeitsdatum', '„Mindestens haltbar bis: siehe Dosenboden“ + Datum am Boden', ''],
    ['☐', 'Lagerhinweis', '„Kühl und trocken lagern“ / nach dem Öffnen …', ''],
    ['☐', 'Name und Anschrift', FIRMA + ', ' + ADR, ''],
    ['☐', 'Nährwertdeklaration je 100 ml', 'Brennwert, Fett, ges. Fettsäuren, Kohlenhydrate, Zucker, Eiweiß, Salz – aus Laboranalyse (Dok. D02)', ''],
    ['☐', 'Losnummer', 'Los-Kennzeichnung (z. B. mit MHD kombiniert) am Dosenboden', ''],
    ['☐', 'Mindestschriftgröße', 'x-Höhe ≥ 1,2 mm (≥ 0,9 mm nur bei Fläche < 80 cm²)', ''],
    ['☐', 'Sprache', 'Deutsch, leicht verständlich', ''],
    ['☐', 'Pfandkennzeichnung', 'DPG-Logo + EAN 4270005618807 (Dok. A04)', ''],
    ['☐', 'Verpackungs-/Entsorgungshinweis', 'freiwillig (z. B. „Pfand – zurück in den Automaten“)', '']] } },
  { h: 'Werbeaussagen (Claims) prüfen' },
  { table: { w: [0.5, 2.6, 5.1], head: ['✓', 'Aussage', 'Voraussetzung (VO (EG) 1924/2006)'], rows: [
    ['☐', '„zuckerfrei“ / „Zero Sugar“', 'max. 0,5 g Zucker je 100 ml – durch Laboranalyse belegen (Aroma enthält Zuckersirup als Träger)'],
    ['☐', '„ohne Zuckerzusatz“', 'keine zugesetzten Zucker – **nicht verwenden**, solange Aroma Zuckersirup enthält'],
    ['☐', '„kalorienarm“ / „Zero Kalorien“', '„energiearm“ ≤ 20 kcal/100 ml · „energiefrei“ ≤ 4 kcal/100 ml – nur mit Analyse'],
    ['☐', '„Bio“', '**nicht zulässig** (Getränk nicht ökologisch, Süßungsmittel)'],
    ['☐', '„Energy“, „Vitamin C“ o. Ä.', 'nur mit rechtlicher Grundlage – im Zweifel weglassen']] } },
  { sig: ['Geprüft (Datum, Unterschrift)', 'Druckfreigabe (Datum, Unterschrift)'] }]);

add('D02_Laborauftrag_Analytik.docx', 'D02', 'Laborauftrag & Probenbegleitschein',
  'Für Nährwertanalyse, Zucker-Nachweis („zuckerfrei“) und Haltbarkeitsprüfung bei einem akkreditierten Lebensmittellabor.', [
  { h: '1 · Auftraggeber' },
  { fields: [['Firma', FIRMA], ['Anschrift', ADR], ['Ansprechpartner', 'Maximilian Brenner · ' + MAIL]] },
  { fields: [['Labor', ''], ['Angebots-/Auftragsnr.', ''], ['Rechnungsanschrift', 'wie Auftraggeber · USt-IdNr. ' + UST]] },
  { h: '2 · Probe' },
  { fields: [['Probenbezeichnung', 'ZYRO Peach × Maracuja'], ['Los / Ansatz-Nr.', ''], ['MHD', '']] },
  { fields: [['Anzahl / Menge', '___ Dosen à 0,5 l'], ['Entnahmedatum', ''], ['Lagerung bis Versand', 'kühl, dunkel']] },
  { h: '3 · Untersuchungsumfang' },
  { check: ['**Nährwerttabelle nach LMIV** (Brennwert, Fett, ges. Fettsäuren, Kohlenhydrate, Zucker, Eiweiß, Salz) je 100 ml', '**Zucker** (Glucose, Fructose, Saccharose) – Nachweis „zuckerfrei“ ≤ 0,5 g/100 ml',
    'Süßungsmittel quantitativ: Sucralose, Acesulfam K', 'Konservierungsstoff: Sorbinsäure (falls verwendet)', 'pH-Wert, Gesamtsäure, °Brix', 'CO₂-Gehalt (g/l)',
    'Mikrobiologie: Gesamtkeimzahl, Hefen, Schimmelpilze (Start und Ende Lagertest)', 'Sensorische Prüfung', 'Etikettenprüfung / Verkehrsfähigkeitsgutachten'] },
  { h: '4 · Hinweise an das Labor' },
  { lines: 3 },
  { sig: ['Auftraggeber (Datum, Unterschrift)', 'Probeneingang Labor'] }]);

add('C02_Wareneingangsprotokoll.docx', 'C02', 'Wareneingangsprotokoll',
  'Jede Lieferung von Rohstoffen und Verpackung sofort prüfen und eintragen. Abgelehnte Ware getrennt lagern und kennzeichnen.', [
  { table: { w: [1.1, 1.8, 1.4, 1.2, 1.1, 0.9, 1.1, 1.0, 0.8], head: ['Datum', 'Artikel', 'Lieferant', 'Charge', 'MHD', 'Menge', 'Zustand Verpackung', 'Datenblatt', 'Kürzel'], rows: [], empty: 18, h: 480 } },
  { note: 'Zustand: i. O. / beschädigt / verschmutzt · Datenblatt: liegt vor (j/n) · Bei Abweichung: Ware sperren, Lieferant informieren, Dok. E01 ausfüllen.' }]);

add('C01_Rohstoff-_und_Lieferantenuebersicht.docx', 'C01', 'Rohstoff- & Lieferantenübersicht',
  'Übersicht aller freigegebenen Rohstoffe und Verpackungen. Datenblatt (TDS), Sicherheitsdatenblatt und Lebensmittelkonformität je Artikel ablegen.', [
  { table: { w: [1.7, 1.2, 1.6, 0.9, 0.9, 1.0, 1.0, 1.0], head: ['Rohstoff', 'E-Nr. / Art', 'Lieferant', 'TDS', 'Allergene', 'Haltbarkeit', 'Lagerung', 'Freigabe'],
    rows: ROH.map(([a, e]) => [a, e, LIEF[a] || '', a === 'Pfirsicharoma' ? '☑ TDS-01a' : '☐', a === 'Pfirsicharoma' ? 'keine' : '', a === 'Pfirsicharoma' ? '12 Monate' : '', a === 'Pfirsicharoma' ? 'kühl, dunkel' : '', '☐']), empty: 2, h: 460 } },
  { note: 'Für jeden Rohstoff Datenblatt (TDS), Spezifikation und Konformitätserklärung beim Lieferanten anfordern; Lieferanten mit Anschrift in Dok. A01 / E02 ergänzen. Pfirsicharoma: „Organic natural peach flavouring“, Trägerstoff Zuckersirup (66 °Brix, Dichte 1,33) – auf dem Getränk **nicht** als Bio ausloben. Für jeden Lebensmittelkontakt-Artikel (Dose, Deckel) Konformitätserklärung nach VO (EG) 1935/2004 anfordern.' }]);

add('C04_Chargenfreigabe.docx', 'C04', 'Chargenfreigabe',
  'Keine Charge darf ohne unterschriebene Freigabe verkauft oder ausgeliefert werden.', [
  { h: '1 · Charge' },
  { fields: [['Charge / Los', ''], ['Abfülldatum', ''], ['MHD', ''], ['Menge (Dosen / Trays / Paletten)', '']] },
  { fields: [['Rezepturversion', 'V4'], ['Abfüllbetrieb', 'The Stillery, Amsterdam'], ['Herstellungsprotokoll-Nr.', '']] },
  { h: '2 · Prüfungen' },
  { table: { w: [3, 2.2, 2, 1, 1], head: ['Prüfpunkt', 'Sollwert', 'Istwert', 'i. O.', 'n. i. O.'], rows: [
    ['pH-Wert', '3,0 – 3,4', '', '☐', '☐'], ['°Brix', '≤ 0,5', '', '☐', '☐'], ['CO₂-Gehalt', '5,5 – 6,0 g/l', '', '☐', '☐'], ['Füllmenge', '≥ 500 ml (Fertigpackungsrecht)', '', '☐', '☐'],
    ['Dichtheit / Falz', 'lt. Abfüller', '', '☐', '☐'], ['Kodierung MHD / Los', 'lesbar, korrekt', '', '☐', '☐'], ['Sensorik', 'entspricht Referenzmuster', '', '☐', '☐'],
    ['Optik / Farbe', 'klar, Pfirsich-Orange', '', '☐', '☐'], ['Mikrobiologie (falls geprüft)', 'lt. Spezifikation', '', '☐', '☐'], ['Tray / Palette', 'unbeschädigt, EAN lesbar', '', '☐', '☐']] } },
  { h: '3 · Rückstellmuster' },
  { fields: [['Anzahl Rückstellmuster', '6 Dosen'], ['Lagerort', ''], ['Aufbewahren bis', 'MHD + 6 Monate']] },
  { h: '4 · Entscheidung' },
  { check: ['**Freigegeben** zum Verkauf', '**Gesperrt** – Grund / Maßnahme: _______________________________________'] },
  { sig: ['Geprüft (Datum, Unterschrift)', 'Freigegeben (Datum, Unterschrift)'] }]);

add('E02_Rueckruf-_und_Krisenplan.docx', 'E02', 'Rückruf- und Krisenplan',
  'Vorgehen bei einem Verdacht auf ein nicht sicheres Lebensmittel (Art. 19 VO (EG) Nr. 178/2002). Jährlich als Übung durchspielen.', [
  { h: '1 · Krisenteam' },
  { table: { w: [2, 2.3, 2.3, 2.6], head: ['Rolle', 'Name', 'Telefon', 'Vertretung'], rows: [['Leitung Krisenteam', 'Maximilian Brenner', '', 'Christian Roedel'], ['Qualität / Rückverfolgung', '', '', ''], ['Kommunikation / Handel', 'Christian Roedel', '', ''], ['Lohnabfüller The Stillery', 'Nik Noordermeer', '+31 (0)20 2443196', '']] } },
  { h: '2 · Wichtige Kontakte' },
  { table: { w: [3, 3, 3], head: ['Stelle', 'Kontakt', 'Telefon / E-Mail'], rows: [['Lebensmittelüberwachung Kreis Siegen-Wittgenstein', 'Veterinär- und Lebensmittelüberwachungsamt', '0271 333-2869 · veterinaeramt@siegen-wittgenstein.de'], ['Lohnabfüller', 'The Stillery, Herwijk 12, 1046 BC Amsterdam – Nik Noordermeer', '+31 (0)20 2443196 · www.the-stillery.nl'], ['REWE / Handelspartner', '', ''], ['Labor', '', ''], ['Versicherung (Produkthaftpflicht / Rückruf)', '', ''], ['Rechtsberatung', '', '']] } },
  { h: '3 · Ablauf' },
  { list: ['**Meldung aufnehmen** (Dok. E01) – Produkt, Los, MHD, Problem, Melder.', '**Bewerten** (innerhalb von 2 Stunden): Gesundheitsgefahr? Wie viele Lose betroffen?', '**Ware sperren**: Lager, Lohnabfüller, Handel informieren – betroffene Lose nicht mehr ausliefern.',
    '**Rückverfolgen**: Wareneingang (07), Herstellung (Dok. C03), Chargenfreigabe (09), Lieferscheine – wohin ging welches Los?', '**Behörde informieren** – bei Gesundheitsgefahr unverzüglich (Pflicht nach Art. 19 VO 178/2002).',
    '**Rücknahme/Rückruf** über Handel; bei Rückruf öffentliche Warnung (z. B. lebensmittelwarnung.de über die Behörde).', '**Ursache klären**, Korrekturmaßnahme, Dokumentation, Abschlussbericht.'] },
  { h: '4 · Protokoll' },
  { fields: [['Datum / Uhrzeit Meldung', ''], ['Betroffenes Los / MHD', ''], ['Menge im Markt', '']] },
  { lines: 4 },
  { sig: ['Leitung Krisenteam', 'Abschluss (Datum)'] }]);

add('E01_Reklamationsformular.docx', 'E01', 'Reklamationsformular',
  'Für Reklamationen von Kunden, Händlern und für eigene Abweichungen beim Wareneingang.', [
  { h: '1 · Eingang' },
  { fields: [['Reklamations-Nr.', ''], ['Eingang am', ''], ['Aufgenommen von', '']] },
  { fields: [['Reklamierende/r (Name, Firma)', ''], ['Telefon / E-Mail', '']] },
  { check: ['Endkunde', 'Handel (z. B. REWE-Markt)', 'Lieferant (Wareneingang)', 'intern'] },
  { h: '2 · Produkt' },
  { fields: [['Produkt', 'ZYRO Peach × Maracuja 0,5 l'], ['Los / MHD', ''], ['Kaufort / -datum', ''], ['Menge', '']] },
  { h: '3 · Beschreibung' },
  { check: ['Geschmack / Geruch abweichend', 'Fremdkörper', 'Dose undicht / beschädigt / aufgebläht', 'Zu wenig Kohlensäure', 'Trübung / Ausflockung', 'Kennzeichnung / Pfand', 'Gesundheitliche Beschwerden **→ sofort Dok. E02 (Krisenplan) anwenden**', 'Sonstiges'] },
  { lines: 3 },
  { check: ['Muster liegt vor', 'Foto liegt vor', 'Rückstellmuster des Loses geprüft'] },
  { h: '4 · Bewertung & Maßnahme' },
  { fields: [['Ursache', ''], ['Berechtigt?', '☐ ja   ☐ nein']] },
  { fields: [['Maßnahme gegenüber Kunde', 'Ersatz / Gutschrift / Antwort'], ['Korrekturmaßnahme intern', ''], ['Erledigt am', '']] },
  { sig: ['Bearbeitet (Datum, Unterschrift)', 'Abgeschlossen (Datum, Unterschrift)'] }]);

add('D03_Haltbarkeitspruefung.docx', 'D03', 'Haltbarkeitstest (MHD-Festlegung)',
  'Lagertest zur Festlegung des Mindesthaltbarkeitsdatums. Pro Prüftermin mindestens 2 Dosen + Referenz.', [
  { h: '1 · Testaufbau' },
  { fields: [['Charge / Los', ''], ['Abfülldatum', ''], ['Ziel-MHD', 'z. B. 9–12 Monate']] },
  { fields: [['Lagerung A', 'Raumtemperatur 20–22 °C, dunkel'], ['Lagerung B (beschleunigt)', '30–35 °C'], ['Anzahl Dosen gesamt', '']] },
  { h: '2 · Prüfplan & Ergebnisse' },
  { table: { w: [1.2, 1.0, 0.9, 0.9, 0.9, 1.4, 1.2, 1.0, 1.2], head: ['Termin', 'Lagerung', 'pH', '°Brix', 'CO₂ g/l', 'Farbe / Optik', 'Sensorik 1–5', 'Mikro', 'Kürzel'],
    rows: ['Start (0)', '1 Monat', '2 Monate', '3 Monate', '6 Monate', '9 Monate', '12 Monate', '15 Monate'].flatMap(m => [[m, 'A', '', '', '', '', '', '', ''], [m, 'B', '', '', '', '', '', '', '']]), h: 420 } },
  { note: 'Typische Alterung: Abbau von Vitamin C und Aroma, Farbverlust (Beta-Carotin, Licht), Kohlensäureverlust. Beschleunigte Lagerung B nur als Hinweis – das MHD am Ergebnis von A festlegen, mit Sicherheitsabschlag.' },
  { h: '3 · Ergebnis' },
  { fields: [['Festgelegtes MHD', '___ Monate ab Abfüllung'], ['Begründung', '']] },
  { sig: ['Ausgewertet (Datum, Unterschrift)', 'Freigegeben (Datum, Unterschrift)'] }]);

const r1000 = [['Citronensäure', 'E 330', '2,00 kg', '± 1 %'], ['Natriumcitrat', 'E 331', '0,20 kg', '± 2 %'], ['Ascorbinsäure', 'E 300', '0,20 kg', '± 2 %'], ['Sucralose', 'E 955', '100 g', '± 1 %'],
  ['Acesulfam K', 'E 950', '120 g', '± 1 %'], ['Pfirsicharoma', 'nat. Aroma', '1,33 kg', '± 2 %'], ['Maracujaaroma', 'Aroma', 'ca. 0,65 kg*', '± 2 %'], ['Beta-Carotin', 'E 160a', 'nach Farbstandard', '—'],
  ['Kaliumsorbat (optional)', 'E 202', '0,25 kg', '± 2 %'], ['Wasser (Trinkwasser, entgast)', '—', 'ad 1.000 l', '—'], ['Kohlensäure', 'E 290', '5,5–6,0 g/l', 's. Spez.']];
add('F01_Produktspezifikation_Lohnherstellung.docx', 'F01', 'Produktspezifikation für den Lohnabfüller',
  'Verbindliche Vorgaben für die Herstellung von ZYRO Peach × Maracuja im Lohnauftrag. Änderungen nur schriftlich und mit Freigabe durch Liberty Street Food GmbH.', [
  { h: '1 · Produkt' },
  { fields: [['Produkt', 'ZYRO Peach × Maracuja'], ['Rezepturversion', 'V4'], ['Auftraggeber', FIRMA + ', ' + ADR]] },
  { fields: [['Lohnabfüller', LA], ['Ansprechpartner', LAK]] },
  { fields: [['USt-IdNr. Auftraggeber', UST + ' (innergemeinschaftliche Leistung NL → DE, Reverse Charge)'], ['Handelsregister', HR]] },
  { h: '2 · Rezeptur je 1.000 l Fertiggetränk' },
  { table: { w: [2.8, 1.4, 2, 1.2], head: ['Rohstoff', 'E-Nr.', 'Menge', 'Toleranz'], rows: r1000 } },
  { note: '* Maracujaaroma: Menge über Dichte laut Datenblatt bestätigen. Rohstoffe werden vom Auftraggeber beigestellt (Beistellung) – Chargen auf dem Abfüllprotokoll vermerken.' },
  { h: '3 · Physikalisch-chemische Spezifikation' },
  { table: { w: [3, 3, 3], head: ['Parameter', 'Sollwert', 'Prüfung'], rows: [['pH-Wert', '3,0 – 3,4', 'je Ansatz'], ['°Brix', '≤ 0,5', 'je Ansatz'], ['CO₂', '5,5 – 6,0 g/l', 'Anfang/Mitte/Ende'], ['Füllmenge', 'Nennfüllmenge 500 ml', 'lt. Fertigpackungsrecht'], ['Farbe', 'nach Referenzmuster', 'visuell'], ['Sensorik', 'nach Referenzmuster', 'je Charge']] } },
  { h: '4 · Prozess & Verpackung' },
  { table: { w: [3, 6], head: ['Punkt', 'Vorgabe'], rows: [['Ansatzführung', 'Pulver vollständig lösen, Aromen nach Abkühlung; Kaliumsorbat separat vorlösen'], ['Filtration', 'lt. Standard Abfüller'], ['Wärmebehandlung', 'Tunnelpasteurisation o. ä. – Parameter lt. Abfüller, dokumentieren'],
    ['Dose', '0,5 l Aluminium, bedruckt, mit DPG-Pfandlogo (Beistellung)'], ['Kodierung Dosenboden', 'MHD + Los, Format: ________'], ['Tray', '24er-Tray Wellpappe, bedruckt, EAN 4270005618814, mit Schrumpffolie'], ['Palette', 'Europalette, Palettenschema nach Absprache, Palettenetikett mit SSCC (falls vom Handel gefordert)']] } },
  { h: '5 · Dokumentation & Freigabe' },
  { check: ['Abfüllprotokoll je Charge (Rohstoffchargen, Uhrzeiten, Messwerte)', 'Rückstellmuster 6 Dosen je Charge an Auftraggeber', 'Freigabe nur durch Auftraggeber (Dok. C04)', 'Abweichungen sofort melden'] },
  { sig: ['Auftraggeber (Datum, Unterschrift)', 'Lohnabfüller (Datum, Unterschrift)'] }]);

add('F02_Artikelstammblatt_Handel.docx', 'F02', 'Artikelstammblatt für den Handel',
  'Stammdaten für die Listung (z. B. REWE). Werte mit „Plan“ nach erster Produktion durch Messung ersetzen.', [
  { h: '1 · Artikel' },
  { table: { w: [3.2, 5.8], head: ['Feld', 'Wert'], rows: [
    ['Artikelbezeichnung', 'ZYRO Peach × Maracuja 0,5 l'], ['Verkehrsbezeichnung', 'Erfrischungsgetränk mit Pfirsich-Maracuja-Geschmack, mit Süßungsmitteln'], ['Marke', 'ZYRO'],
    ['Inverkehrbringer', FIRMA + ', ' + ADR + ' (Sitz: ' + SITZ + ', ' + HR + ')'], ['Herstellung', 'im Lohnauftrag bei ' + LA], ['USt-IdNr. / Steuernummer', UST + ' / ' + STNR], ['Warengruppe', 'Alkoholfreie Getränke / Erfrischungsgetränke / Limonaden zuckerfrei'],
    ['Pfand', 'Einweg, DPG 0,25 €'], ['MHD (Gesamtlaufzeit)', '___ Monate (Dok. D03)'], ['Mindestrestlaufzeit bei Anlieferung', '___ Monate'], ['Lagerung', 'kühl, trocken, lichtgeschützt']] } },
  { h: '2 · Logistikeinheiten' },
  { table: { w: [2.2, 2.2, 2.3, 2.3], head: ['Merkmal', 'Dose (VE)', 'Tray (HE)', 'Palette'], rows: [
    ['EAN / GTIN', '4270005618807', '4270005618814', 'SSCC je Palette'], ['Inhalt', '0,5 l', '24 Dosen = 12 l', '54 Trays = 1.296 Dosen (Plan)'],
    ['Maße L × B × H', 'Ø ca. 66 × 168 mm (Plan)', 'ca. 404 × 270 × 170 mm (Plan)', '1.200 × 800 × ca. 1.700 mm (Plan)'],
    ['Bruttogewicht', 'ca. 0,53 kg (Plan)', 'ca. 13 kg (Plan)', 'ca. 720 kg (Plan)'], ['Nettofüllmenge', '500 ml', '12 l', '648 l'], ['Lagen / Trays je Lage', '—', '—', '9 / 6 (Plan)']] } },
  { h: '3 · Produktinformationen' },
  { table: { w: [3.2, 5.8], head: ['Feld', 'Wert'], rows: [
    ['Zutaten', 'Wasser, Kohlensäure, Säuerungsmittel Citronensäure, Säureregulator Natriumcitrat, Antioxidationsmittel Ascorbinsäure, Süßungsmittel Sucralose und Acesulfam K, natürliches Pfirsicharoma, Maracujaaroma, Farbstoff Beta-Carotin (vorläufig)'],
    ['Allergene', 'keine (lt. Datenblättern, Bestätigung Maracujaaroma ausstehend)'], ['Nährwerte je 100 ml', 'nach Laboranalyse (Dok. D02)'], ['Vegan', 'zu prüfen (Beta-Carotin-Träger)'], ['Bio', 'nein']] } },
  { h: '4 · Preise & Konditionen' },
  { fields: [['Listenpreis netto je Tray', ''], ['UVP je Dose', ''], ['Mindestbestellmenge', '']] },
  { sig: ['Erstellt (Datum, Unterschrift)', 'Geprüft (Datum, Unterschrift)'] }]);

add('C05_Rezeptur-Aenderungsprotokoll.docx', 'C05', 'Rezeptur-Änderungsprotokoll',
  'Jede Änderung an Rezeptur, Rohstoff oder Lieferant hier eintragen – mit Begründung und Prüfung der Folgen (Etikett, HACCP, Lohnabfüller).', [
  { table: { w: [1.0, 1.1, 2.6, 2.0, 1.5, 1.0], head: ['Version', 'Datum', 'Änderung (alt → neu)', 'Grund', 'Folgen geprüft', 'Freigabe'], rows: [
    ['V4', '', 'Ausgangsrezeptur (Muster M1)', 'Basis', '☐ Etikett ☐ HACCP ☐ Abfüller', ''],
    ['M2', '', 'Pfirsicharoma 20 → 26 Tropfen/l', 'Verkostung: mehr Frucht', '☐ Etikett ☐ HACCP ☐ Abfüller', ''],
    ['M3', '', 'Sucralose 0,10 → 0,08 g/l · Ace K 0,12 → 0,10 g/l', 'Verkostung: weniger süß', '☐ Etikett ☐ HACCP ☐ Abfüller', ''],
    ['M4', '', 'Citronensäure 2,0 → 2,4 g/l', 'Verkostung: mehr Säure', '☐ Etikett ☐ HACCP ☐ Abfüller', '']], empty: 10, h: 520 } },
  { note: 'Bei Änderung von Zutaten oder Mengenverhältnissen: Zutatenliste, Nährwerte, Claims (Dok. D01) und Produktspezifikation (Dok. F01) aktualisieren.' }]);

add('B02_Personalhygiene_Schulung_Reinigung.docx', 'B02', 'Hygieneschulung & Reinigungsplan',
  'Nachweis der Erstbelehrung nach § 43 Infektionsschutzgesetz (durch Gesundheitsamt, für Personen, die mit offenen Lebensmitteln arbeiten) und der jährlichen Hygieneschulung.', [
  { h: '1 · Schulungsnachweis' },
  { table: { w: [2.2, 1.6, 2.2, 1.6, 1.4], head: ['Name', 'Erstbelehrung § 43 IfSG am', 'Thema Schulung', 'Datum Schulung', 'Unterschrift'], rows: [['Maximilian Brenner', '', 'Lebensmittelhygiene, HACCP, Allergene', '', ''], ['Christian Roedel', '', 'Lebensmittelhygiene, HACCP, Allergene', '', '']], empty: 6, h: 480 } },
  { h: '2 · Hygieneregeln (Kurzfassung)' },
  { list: ['Vor Arbeitsbeginn Hände waschen und desinfizieren, Schmuck ablegen.', 'Saubere Arbeitskleidung, Haare bedeckt, Wunden wasserdicht abdecken.', 'Bei Durchfall, Erbrechen, Fieber oder infizierten Wunden **nicht** mit Lebensmitteln arbeiten – melden.',
    'Rohstoffe verschlossen lagern, offene Gebinde beschriften (Datum).', 'Nicht essen, trinken oder rauchen im Arbeitsbereich.'] },
  { h: '3 · Reinigungsplan (eigene Arbeitsfläche / Labor)' },
  { table: { w: [2.3, 1.4, 2.6, 2.7], head: ['Objekt', 'Häufigkeit', 'Mittel / Methode', 'Erledigt (Datum, Kürzel)'], rows: [
    ['Arbeitsflächen', 'vor und nach jedem Ansatz', 'Reiniger, dann Lebensmittel-Desinfektion', ''], ['Waage', 'nach jedem Ansatz', 'feuchtes Tuch, trocknen', ''], ['Behälter, Krüge, Rührer', 'nach jeder Nutzung', 'heiß spülen, trocknen', ''],
    ['Flaschen / Messgefäße', 'vor Nutzung', 'heiß ausspülen', ''], ['Kühlschrank', 'wöchentlich', 'Reiniger, Temperatur prüfen (≤ 7 °C)', ''], ['Rohstofflager', 'monatlich', 'Sichtkontrolle, MHD prüfen, reinigen', '']], empty: 2 } }]);


add('A01_Unternehmensstammblatt.docx', 'A01', 'Unternehmensstammblatt',
  'Zentrale Unternehmensdaten für Behörden, Register und Geschäftspartner. Bei jeder Änderung aktualisieren.', [
  { h: '1 · Unternehmen' },
  { table: { w: [3.2, 5.8], head: ['Angabe', 'Inhalt'], rows: [
    ['Firma', FIRMA], ['Rechtsform', 'Gesellschaft mit beschränkter Haftung (GmbH)'], ['Satzungssitz', SITZ], ['Geschäftsanschrift / Betriebsstätte', ADR],
    ['Registergericht / Nummer', HR], ['Steuernummer', STNR], ['USt-IdNr.', UST], ['E-Mail', MAIL], ['Telefon', ''],
    ['Geschäftsführer (eingetragen)', GF], ['Gesellschafter / weitere Geschäftsführung', 'Christian Roedel – Aufnahme beim Notar vorgesehen, Eintragung ausstehend']] } },
  { note: 'Sitzverlegung nach Siegen per Satzungsänderung in Vorbereitung. Nach Eintragung: neues Registergericht/HRB in allen Dokumenten und bei allen Stellen (Lebensmittelüberwachung, LUCID, DPG, Finanzamt) aktualisieren.' },
  { h: '2 · Tätigkeit' },
  { table: { w: [3.2, 5.8], head: ['Angabe', 'Inhalt'], rows: [
    ['Geschäftsgegenstand (Lebensmittel)', 'Entwicklung und Inverkehrbringen alkoholfreier Erfrischungsgetränke unter der Marke ZYRO'],
    ['Produkte', 'ZYRO Peach × Maracuja – Erfrischungsgetränk mit Süßungsmitteln, 0,5-l-Dose, Einweg mit Pfand'],
    ['Herstellung', 'Lohnherstellung (Rohstoff-Beistellung) bei ' + LA], ['Ansprechpartner Lohnhersteller', LAK],
    ['Vertriebswege', 'Lebensmitteleinzelhandel, Großhandel, ggf. Direkt-/Onlineverkauf'], ['Marke', 'ZYRO – beim DPMA angemeldet (noch nicht eingetragen)'],
    ['EAN / GTIN', 'Dose 4270005618807 · Tray (24 × 0,5 l) 4270005618814'], ['Geplanter Beginn', '01.12.2026']] } },
  { h: '3 · Registrierungen & Nachweise' },
  { table: { w: [3.2, 2.3, 1.7, 1.8], head: ['Stelle', 'Nummer / Aktenzeichen', 'Datum', 'Dok.'], rows: [
    ['Lebensmittelüberwachung Kreis Siegen-Wittgenstein', '', '', 'A02'], ['Zentrale Stelle Verpackungsregister (LUCID)', '', '', 'A03'], ['Duales System (Systembeteiligung)', '', '', 'A03'],
    ['DPG Deutsche Pfandsystem GmbH', '', '', 'A04'], ['GS1 Germany (GTIN-Basisnummer)', '', '', '—'], ['DPMA Markenanmeldung ZYRO', '', '', '—'], ['Gewerbeanmeldung', '', '', '—'], ['Betriebs-/Produkthaftpflichtversicherung', '', '', '—']] } },
  { h: '4 · Verantwortlichkeiten' },
  { table: { w: [3.2, 2.8, 3.0], head: ['Aufgabe', 'Verantwortlich', 'Vertretung'], rows: [
    ['Lebensmittelsicherheit / HACCP', 'Maximilian Brenner', 'Christian Roedel'], ['Rückverfolgbarkeit / Chargenfreigabe', 'Maximilian Brenner', 'Christian Roedel'], ['Kennzeichnung / Verpackung', 'Maximilian Brenner', ''], ['Behördenkontakt / Krisenmanagement', 'Maximilian Brenner', 'Christian Roedel']] } },
  { sig: ['Ort, Datum, Unterschrift Geschäftsführer', 'Stempel'] }]);

const HPROWS = [['Citronensäure', 'E 330', '2,00', '10,00'], ['Natriumcitrat', 'E 331', '0,20', '1,00'], ['Ascorbinsäure', 'E 300', '0,20', '1,00'], ['Sucralose', 'E 955', '0,10', '0,50'], ['Acesulfam K', 'E 950', '0,12', '0,60'],
  ['Pfirsicharoma', 'nat. Aroma', '1,33', '6,65'], ['Maracujaaroma', 'Aroma', '0,65', '3,25'], ['Beta-Carotin', 'E 160a', '0,05–0,10', '0,25–0,50'], ['Kaliumsorbat (optional)', 'E 202', '0,25', '1,25'], ['Wasser, lauwarm', 'Trinkwasser', '200', '1.000'], ['Sprudelwasser, kalt', 'Trinkwasser + E 290', '780', '3.900']];
add('C03_Herstellungsprotokoll.docx', 'C03', 'Herstellungsprotokoll (Ansatz)',
  'Dokumentation jedes Ansatzes (Versuchs- und Musteransätze). Bei Lohnherstellung ersetzt das Abfüllprotokoll des Lohnherstellers dieses Dokument; Rohstoffchargen dort vermerken.', [
  { h: '1 · Ansatz' },
  { fields: [['Ansatz-Nr.', ''], ['Datum', ''], ['Uhrzeit Start / Ende', ''], ['Hergestellt von', '']] },
  { fields: [['Rezeptur / Version', 'V4 / Muster ___'], ['Ansatzmenge', '☐ 1 l   ☐ 5 l   ☐ ____ l'], ['Waage geprüft (Prüfgewicht)', '☐ ja   ☐ nein']] },
  { h: '2 · Einwaage Soll / Ist' },
  { table: { w: [2.3, 1.2, 1.3, 1.1, 1.0, 1.0, 1.0, 1.1], head: ['Rohstoff', 'E-Nr. / Art', 'Charge', 'MHD', 'Soll 1 l (g)', 'Soll 5 l (g)', 'Ist (g)', 'Abweichung'], rows: HPROWS.map(r => [r[0], r[1], '', '', r[2], r[3], '', '']), hl: [6], h: 460 } },
  { note: 'Ist-Werte direkt beim Einwiegen eintragen. Abweichung = Ist − Soll. Vier-Augen-Prinzip bei Süßungsmitteln und Konservierungsstoff (CCP 1, Dok. B01).' },
  { h: '3 · Ablauf' },
  { table: { w: [0.6, 5, 1.3, 1, 2], head: ['#', 'Schritt', 'Uhrzeit', 'Erledigt', 'Bemerkung'], rows: ['Rohstoffe in einen Behälter eingewogen', 'Lauwarmes Wasser vorgelegt, Temperatur gemessen', 'Rohstoffe zugegeben, Behälter ausgespült', 'Gerührt bis vollständig gelöst', 'Mit kaltem Sprudelwasser aufgefüllt', 'Abgefüllt, verschlossen, beschriftet', 'Gekühlt (4–6 °C)'].map((x, i) => [String(i + 1), x, '', '☐', '']), h: 400 } },
  { h: '4 · Messwerte & Sensorik' },
  { fields: [['pH (Ziel 3,0–3,4)', ''], ['°Brix (Ziel ≤ 0,5)', ''], ['Temperatur (°C)', ''], ['Volumen (l)', '']] },
  { table: { w: [2.5, 3.5, 3], head: ['Merkmal', 'Bewertung 1 (schlecht) – 5 (sehr gut)', 'Bemerkung'], rows: ['Optik / Farbe', 'Geruch', 'Geschmack', 'Süße / Säure', 'Kohlensäure'].map(m => [m, '☐1  ☐2  ☐3  ☐4  ☐5', '']), h: 380 } },
  { h: '5 · Verbleib' },
  { fields: [['Gefäße / Anzahl', ''], ['Lagerung', ''], ['Verbrauchen bis', ''], ['Verwendung', '☐ intern  ☐ Verkostung  ☐ verworfen']] },
  { sig: ['Hergestellt (Datum, Unterschrift)', 'Geprüft (Datum, Unterschrift)'] }]);

D.sort((a, b) => a[1].localeCompare(b[1]));

return D;
}


function extraDocs(C) {
  const D = [], add = (f, no, title, sub, blocks) => D.push([f, no, title, sub, blocks]);
  add('', 'G01', 'Arbeitszeitnachweis', 'Aufzeichnung der täglichen Arbeitszeit (Pflicht u. a. für Minijobber, § 17 MiLoG). Spätestens am 7. Tag nach dem Arbeitstag erfassen, 2 Jahre aufbewahren.', [
    {fields: [['Mitarbeiter/in', ''], ['Monat / Jahr', ''], ['Beschäftigungsart', '☐ Minijob  ☐ Teilzeit  ☐ Vollzeit']]},
    {table: {w: [1, 1.2, 1.2, 1.1, 1.2, 2.2, 1], head: ['Tag', 'Beginn', 'Ende', 'Pause (Min.)', 'Stunden', 'Tätigkeit / Bemerkung', 'Kürzel'], rows: [], empty: 31, h: 300}},
    {fields: [['Summe Stunden', ''], ['Stundenlohn (€)', ''], ['Bruttolohn (€)', '']]}, {sig: ['Mitarbeiter/in (Datum, Unterschrift)', 'Arbeitgeber (Datum, Unterschrift)']}]);
  add('', 'G02', 'Urlaubsantrag', 'Antrag auf Erholungsurlaub bzw. Freistellung.', [
    {fields: [['Name', ''], ['Abteilung / Tätigkeit', ''], ['Antragsdatum', '']]},
    {fields: [['Urlaub von', ''], ['bis einschließlich', ''], ['Arbeitstage', '']]},
    {check: ['Erholungsurlaub', 'Sonderurlaub (Grund): ______________________', 'Unbezahlter Urlaub', 'Überstundenausgleich']},
    {fields: [['Urlaubsanspruch Jahr', ''], ['bereits genommen', ''], ['Resturlaub nach Antrag', '']]}, {fields: [['Vertretung', '']]},
    {h: 'Entscheidung'}, {check: ['genehmigt', 'abgelehnt – Grund: ______________________']}, {sig: ['Antragsteller/in', 'Geschäftsführung']}]);
  add('', 'G03', 'Reisekostenabrechnung', 'Abrechnung von Dienstreisen. Belege im Original beifügen. Pauschalen nach aktuellem Steuerrecht prüfen.', [
    {fields: [['Name', ''], ['Reiseziel', ''], ['Anlass / Kunde', '']]}, {fields: [['Beginn (Datum, Uhrzeit)', ''], ['Ende (Datum, Uhrzeit)', ''], ['Verkehrsmittel', '☐ Bahn ☐ Flug ☐ Pkw ☐ ÖPNV']]},
    {table: {w: [1.3, 3, 1.4], head: ['Datum', 'Kostenart / Beleg', 'Betrag (€)'], rows: [['', 'Fahrtkosten (Ticket bzw. km × Satz)', ''], ['', 'Übernachtung (ohne Frühstück)', ''], ['', 'Verpflegungspauschale', ''], ['', 'Nebenkosten (Parken, Taxi …)', '']], empty: 6}},
    {fields: [['Summe (€)', ''], ['abzüglich Vorschuss (€)', ''], ['Auszahlung (€)', '']]}, {sig: ['Reisende/r', 'Geprüft / angewiesen']}]);
  add('', 'G04', 'Protokoll Gesellschafterversammlung', `Niederschrift über die Gesellschafterversammlung der ${C.firma} (Sitz ${C.sitz}, ${C.register}). Beschlüsse, die eine Satzungsänderung betreffen, bedürfen der notariellen Beurkundung.`, [
    {fields: [['Datum', ''], ['Ort', ''], ['Beginn / Ende', '']]}, {fields: [['Versammlungsleiter', ''], ['Protokollführer', '']]},
    {h: '1 · Anwesende Gesellschafter'}, {table: {w: [3, 2, 2], head: ['Gesellschafter', 'Geschäftsanteil / Stimmen', 'anwesend / vertreten'], rows: [], empty: 4}},
    {p: 'Die Versammlung wurde form- und fristgerecht einberufen bzw. alle Gesellschafter verzichten auf Formen und Fristen. Die Beschlussfähigkeit wurde festgestellt.'},
    {h: '2 · Tagesordnung & Beschlüsse'}, {table: {w: [0.5, 4, 1.2, 1.2, 1.2], head: ['TOP', 'Gegenstand / Beschlusstext', 'Ja', 'Nein', 'Enthaltung'], rows: [], empty: 6, h: 700}},
    {h: '3 · Sonstiges'}, {lines: 3}, {sig: ['Versammlungsleiter', 'Protokollführer']}]);
  add('', 'G05', 'Inventurliste', 'Jährliche Bestandsaufnahme zum Geschäftsjahresende (§ 240 HGB). Je Lagerort eine Liste, zwei Personen zählen.', [
    {fields: [['Stichtag', ''], ['Lagerort', ''], ['Gezählt von', ''], ['Kontrolliert von', '']]},
    {table: {w: [1, 3, 1.2, 1, 1.2, 1.1, 1.2, 1.3], head: ['Art.-Nr.', 'Bezeichnung', 'Charge / MHD', 'Einheit', 'Menge gezählt', 'EK netto (€)', 'Wert (€)', 'Bemerkung'], rows: [], empty: 20, h: 360}},
    {fields: [['Gesamtwert (€)', '']]}, {sig: ['Zähler/in', 'Kontrolle']}]);
  add('', 'G06', 'Lieferantenbewertung', 'Jährliche Bewertung der Lieferanten (Qualität, Liefertreue, Dokumentation) als Teil der Lieferantenfreigabe (Dok. C01).', [
    {fields: [['Lieferant', ''], ['Artikel / Leistung', ''], ['Bewertungszeitraum', '']]},
    {table: {w: [3, 3.6, 2.4], head: ['Kriterium', 'Bewertung (1 = sehr gut … 5 = mangelhaft)', 'Bemerkung'], rows: ['Produktqualität / Spezifikation eingehalten', 'Liefertreue (Termin, Menge)', 'Dokumente (TDS, Zertifikate, Konformität)', 'Reklamationen / Reaktion', 'Preis / Konditionen', 'Kommunikation'].map(k => [k, '☐1  ☐2  ☐3  ☐4  ☐5', ''])}},
    {h: 'Ergebnis'}, {check: ['Freigegeben (A-Lieferant)', 'Freigegeben mit Auflagen: ______________________', 'Gesperrt']}, {sig: ['Bewertet (Datum, Unterschrift)', 'Geschäftsführung']}]);
  add('', 'G07', 'Quittung', 'Empfangsbestätigung über eine Barzahlung.', [
    {fields: [['Quittungs-Nr.', ''], ['Datum', ''], ['Betrag netto (€)', ''], ['USt __ % (€)', ''], ['Betrag brutto (€)', '']]},
    {fields: [['Betrag in Worten', '']]}, {fields: [['von (Name, Anschrift)', '']]}, {fields: [['für (Leistung / Ware)', '']]},
    {p: `Betrag dankend erhalten. Empfänger: ${C.firma}, ${C.adresse} · USt-IdNr. ${C.ust} · St.-Nr. ${C.stnr}`}, {sig: ['Ort, Datum', 'Unterschrift Empfänger']}]);
  add('', 'G08', 'Kassenbuch', 'Tägliche Aufzeichnung aller Bareinnahmen und -ausgaben (GoBD). Kassenbestand darf nie negativ sein; jede Buchung mit Beleg.', [
    {fields: [['Monat / Jahr', ''], ['Anfangsbestand (€)', ''], ['Seite', '']]},
    {table: {w: [1, 0.9, 3, 1.3, 1.3, 1.1, 1.3], head: ['Datum', 'Beleg-Nr.', 'Buchungstext', 'Einnahme (€)', 'Ausgabe (€)', 'USt %', 'Bestand (€)'], rows: [], empty: 24, h: 330}},
    {fields: [['Summe Einnahmen', ''], ['Summe Ausgaben', ''], ['Endbestand (€)', '']]}, {sig: ['Geprüft (Datum, Unterschrift)', 'Kassenzählung bestätigt']}]);
  add('', 'G09', 'Vollmacht', `Hiermit bevollmächtigt die ${C.firma}, vertreten durch den Geschäftsführer ${C.gf}, die unten genannte Person.`, [
    {fields: [['Bevollmächtigte/r (Name, Geburtsdatum)', ''], ['Anschrift', '']]},
    {h: 'Umfang der Vollmacht'}, {lines: 4}, {fields: [['gültig ab', ''], ['gültig bis / Widerruf', '']]},
    {check: ['Einzelvollmacht für den oben beschriebenen Vorgang', 'Untervollmacht ist nicht zulässig']}, {sig: [`${C.firma} – ${C.gf}, Geschäftsführer`, 'Bevollmächtigte/r (Annahme)']}]);
  add('', 'G10', 'Gesprächs- & Telefonnotiz', 'Kurze Dokumentation von Gesprächen mit Kunden, Lieferanten, Behörden.', [
    {fields: [['Datum / Uhrzeit', ''], ['Gesprächspartner (Firma, Name)', ''], ['Telefon / E-Mail', '']]}, {check: ['Telefon', 'Persönlich', 'Video', 'Rückruf erbeten']},
    {h: 'Inhalt'}, {lines: 7}, {h: 'Vereinbarungen / To-dos'}, {table: {w: [4, 2, 1.5], head: ['Was', 'Wer', 'Bis wann'], rows: [], empty: 4}}, {sig: ['Notiert von', 'Weitergeleitet an']}]);
  add('', 'G11', 'Besprechungsprotokoll', 'Protokoll interner Besprechungen und Termine mit Partnern.', [
    {fields: [['Thema', ''], ['Datum / Ort', ''], ['Protokoll', '']]}, {fields: [['Teilnehmer', '']]},
    {table: {w: [0.5, 4.5, 1.8, 1.4], head: ['Nr.', 'Punkt / Ergebnis', 'Verantwortlich', 'Termin'], rows: [], empty: 10, h: 520}}, {fields: [['Nächster Termin', '']]}, {sig: ['Protokollführer', 'Verteiler']}]);
  add('', 'G12', 'Muster- & Probenversand', 'Begleitschein für den Versand von Mustern (Verkostung, Handel, Labor) – dient auch der Rückverfolgbarkeit.', [
    {fields: [['Datum', ''], ['Empfänger (Firma, Name, Anschrift)', '']]}, {check: ['Handel / Einkauf', 'Verkostung / Tester', 'Labor', 'Messe / Event']},
    {table: {w: [3, 1.4, 1.4, 1.2, 2], head: ['Produkt', 'Charge / Los', 'MHD', 'Menge', 'Bemerkung'], rows: [['ZYRO Peach × Maracuja 0,5 l', '', '', '', '']], empty: 4}},
    {fields: [['Versandart / Sendungsnummer', ''], ['Rückmeldung erwartet bis', '']]}, {h: 'Rückmeldung'}, {lines: 3}, {sig: ['Versendet (Datum, Unterschrift)', 'Rückmeldung erhalten']}]);
  return D;
}

export const makeQmDocuments = (C) => makeDocs(C).concat(extraDocs(C)).map(([, no, title, sub, blocks]) => ({ no, title, sub, blocks }))

const escapeQm = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const richQm = (value) => escapeQm(value).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')

// Erzeugt das Formular als HTML. Eingaben sind contenteditable-Felder mit data-k;
// gespeichert wird nur reiner Text (kein HTML), siehe collectQmValues/applyQmValues.
export const renderQmSheet = (doc, company) => {
  let counter = 0
  const nextKey = () => `k${counter++}`
  const checkboxes = (text) => richQm(text).replace(/[☐☑]/g, (box) => `<span class="cb" data-k="${nextKey()}">${box}</span>`)
  const value = (text) => (/[☐☑]/.test(text || '')
    ? `<div>${checkboxes(text)}</div>`
    : `<div class="ed" contenteditable="true" data-k="${nextKey()}">${escapeQm(text || '')}</div>`)
  const blocks = doc.blocks.map((block) => {
    if (block.h) return `<h4>${escapeQm(block.h)}</h4>`
    if (block.p) return block.p.split('\n').map((line) => `<p>${richQm(line)}</p>`).join('')
    if (block.note) return `<div class="note">${richQm(block.note)}</div>`
    if (block.fields) {
      return `<div class="flds">${block.fields.map((field) => {
        const [label, text] = Array.isArray(field) ? field : [field, '']
        return `<div class="fld"><label>${escapeQm(label)}</label>${value(text)}</div>`
      }).join('')}</div>`
    }
    if (block.table) {
      const table = block.table
      const total = table.w.reduce((sum, width) => sum + width, 0)
      const rows = [...(table.rows || [])]
      for (let index = 0; index < (table.empty || 0); index += 1) rows.push(table.w.map(() => ''))
      let html = `<table class="tb"><colgroup>${table.w.map((width) => `<col style="width:${(width / total * 100).toFixed(2)}%">`).join('')}</colgroup>`
      if (table.head) html += `<tr>${table.head.map((head) => `<th>${escapeQm(head)}</th>`).join('')}</tr>`
      for (const row of rows) {
        html += `<tr>${row.map((cell, index) => {
          const highlight = (table.hl || []).includes(index) ? ' class="hl"' : ''
          const text = String(cell ?? '')
          if (/[☐☑]/.test(text)) return `<td${highlight}>${checkboxes(text).replace(/\n/g, '<br>')}</td>`
          return `<td${highlight}><div class="ed" contenteditable="true" data-k="${nextKey()}">${escapeQm(text)}</div></td>`
        }).join('')}</tr>`
      }
      return `${html}</table>`
    }
    if (block.check) return block.check.map((item) => `<div class="ck"><span class="cb" data-k="${nextKey()}">☐</span><div>${richQm(item)}</div></div>`).join('')
    if (block.list) return `<ol class="ls">${block.list.map((item) => `<li>${richQm(item)}</li>`).join('')}</ol>`
    if (block.lines) return `<div class="lines"><div class="ed" contenteditable="true" data-k="${nextKey()}" style="min-height:${block.lines * 7.6}mm"></div></div>`
    if (block.sig) return `<div class="sig">${[0, 1].map((index) => `<div class="sg"><div class="sigslot"></div><div class="sl">${escapeQm(block.sig[index] || 'Ort, Datum, Unterschrift')}</div></div>`).join('')}</div>`
    return ''
  }).join('')
  const footer = [company.firma, company.sitz && `Sitz ${company.sitz}`, company.register, company.ust && `USt-IdNr. ${company.ust}`].filter(Boolean).map(escapeQm).join(' · ')
  return `<div class="qm-sheet" data-no="${escapeQm(doc.no)}"><div class="co">${escapeQm(company.firma)} · Dokumentation Lebensmittelsicherheit</div>
<h2 class="tt"><b>${escapeQm(doc.no)}</b>${escapeQm(doc.title)}</h2><div class="sub">${richQm(doc.sub)}</div>
<div class="flds"><div class="fld"><label>Dok.-Nr.</label><div>ZYRO-${escapeQm(doc.no)}</div></div><div class="fld"><label>Version</label><div class="ed" contenteditable="true" data-k="version">1.0</div></div>
<div class="fld"><label>Gültig ab</label><div class="ed" contenteditable="true" data-k="validFrom"></div></div><div class="fld"><label>Ersetzt</label><div class="ed" contenteditable="true" data-k="replaces">—</div></div>
<div class="fld"><label>Verantwortlich</label><div class="ed" contenteditable="true" data-k="owner">${escapeQm(company.gf)}</div></div></div>
${blocks}<div class="sfoot">${footer} · Dok. ZYRO-${escapeQm(doc.no)}</div></div>`
}

export const collectQmValues = (root) => {
  const values = {}
  root.querySelectorAll('[data-k]').forEach((element) => {
    values[element.dataset.k] = element.classList.contains('cb') ? element.textContent : element.innerText.replace(/\n$/, '')
  })
  return values
}

export const applyQmValues = (root, values) => {
  if (!values || typeof values !== 'object') return
  root.querySelectorAll('[data-k]').forEach((element) => {
    const value = values[element.dataset.k]
    if (typeof value !== 'string') return
    if (element.classList.contains('cb')) element.textContent = value === '☑' ? '☑' : '☐'
    else element.textContent = value
  })
}

export const companyForQm = (details = {}, bottler = {}) => {
  const postal = [details.postalCode, details.city].filter(Boolean).join(' ')
  const register = [details.registrationCourt, details.commercialRegister].filter(Boolean).join(', ')
  const bottlerAddress = [bottler.name, bottler.street, bottler.city].filter(Boolean).join(', ')
  const bottlerContact = [bottler.contactName, bottler.phone, bottler.website].filter(Boolean).join(' · ')
  return {
    firma: details.name || '',
    adresse: [details.street, postal].filter(Boolean).join(', '),
    mail: details.email || '',
    gf: details.managingDirectors || '',
    sitz: details.registeredOffice || '',
    register,
    la: bottlerAddress,
    lak: bottlerContact,
    ust: details.vatId || '',
    stnr: details.taxNumber || '',
  }
}

export const qmSheetCss = `
.qm-sheet{background:#fff;width:210mm;min-height:297mm;padding:16mm 16mm 20mm 20mm;box-sizing:border-box;box-shadow:0 4px 24px rgba(0,0,0,.08);font-family:Arial,Helvetica,sans-serif;font-size:9.4pt;line-height:1.38;color:#1d1e24;position:relative;text-align:left}
.qm-sheet .co{font-size:7pt;font-weight:700;letter-spacing:1px;color:#8a8f99;text-transform:uppercase}
.qm-sheet h2.tt{font-size:16pt;margin:2mm 0 1mm;color:#1d1e24}.qm-sheet h2.tt b{color:#E8590C;margin-right:3mm}
.qm-sheet .sub{color:#555a66;font-size:9pt;margin-bottom:4mm}
.qm-sheet h4{font-size:7.6pt;letter-spacing:1.3px;text-transform:uppercase;color:#E8590C;margin:5mm 0 2mm;border-bottom:.5pt solid #e2e4e8;padding-bottom:1mm;break-after:avoid}
.qm-sheet p{margin:0 0 2mm}
.qm-sheet .note{font-size:7.6pt;color:#8a8f99;margin:1mm 0 2.5mm}
.qm-sheet .flds{display:flex;border:.6pt solid #c9ccd3;border-radius:1.2mm;margin-bottom:2mm;break-inside:avoid}
.qm-sheet .fld{flex:1;padding:1.2mm 2mm;border-left:.6pt solid #c9ccd3;min-width:0}
.qm-sheet .fld:first-child{border-left:0}
.qm-sheet .fld label{display:block;font-size:6.5pt;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:#8a8f99}
.qm-sheet .ed{min-height:5mm;outline:none;border-radius:1mm;white-space:pre-wrap;word-break:break-word}
.qm-sheet .ed:focus{background:#FFF4E3;box-shadow:0 0 0 1px #f0c68a}
.qm-sheet table.tb{width:100%;border-collapse:collapse;margin-bottom:2.5mm;font-size:8.6pt}
.qm-sheet table.tb th{background:#f3f4f6;font-size:6.5pt;letter-spacing:.6px;text-transform:uppercase;color:#555a66;text-align:left;padding:1.4mm 1.5mm;border:.6pt solid #c9ccd3;vertical-align:bottom}
.qm-sheet table.tb td{border:.6pt solid #c9ccd3;padding:1.3mm 1.5mm;height:7.5mm;vertical-align:middle}
.qm-sheet table.tb tr{break-inside:avoid}
.qm-sheet td.hl{background:#FFF4E3}
.qm-sheet .cb{cursor:pointer;user-select:none;font-size:11pt;line-height:1}
.qm-sheet .ck{display:flex;gap:2mm;margin-bottom:1.3mm;align-items:baseline;break-inside:avoid}
.qm-sheet ol.ls{margin:0 0 2mm;padding-left:6mm}.qm-sheet ol.ls li{margin-bottom:1mm}
.qm-sheet .lines .ed{min-height:24mm;background:repeating-linear-gradient(#fff 0 7.4mm,#c9ccd3 7.4mm 7.6mm);line-height:7.6mm}
.qm-sheet .sig{display:flex;gap:12mm;margin-top:4mm;break-inside:avoid}
.qm-sheet .sig .sg{flex:1}.qm-sheet .sigslot{height:16mm}
.qm-sheet .sig .sl{border-top:.7pt solid #1d1e24;padding-top:1mm;font-size:7.4pt;color:#8a8f99}
.qm-sheet .sfoot{position:absolute;left:20mm;right:16mm;bottom:8mm;font-size:6.6pt;color:#8a8f99;border-top:.4pt solid #e2e4e8;padding-top:1.2mm}
`

export const qmPrintCss = `${qmSheetCss}
@page{size:A4;margin:14mm 14mm 14mm 18mm}
body{margin:0;background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}
@media screen{body{background:#eceef1;padding:20px}.qm-sheet{margin:0 auto 20px}}
@media print{.qm-sheet{box-shadow:none;margin:0;width:auto;min-height:0;padding:0;break-after:page}.qm-sheet:last-child{break-after:auto}.qm-sheet .sfoot{position:static;margin-top:8mm}.qm-sheet .ed:focus{background:none;box-shadow:none}}
`
