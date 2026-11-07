# React + Vite

## Zyro Management für Windows und macOS

### macOS-App aktualisieren

Windows-Updates werden über den eingebauten Updater aus Firebase Hosting geladen. In der installierten macOS-App öffnet **Mac-Update aus der Cloud laden** die Firebase-Downloadseite mit den aktuellen Installern für Apple Silicon und Intel. Lade die passende DMG und ersetze die App im Programme-Ordner. macOS-Hintergrundupdates und automatische Installation erfordern ein Apple-Developer-ID-Zertifikat sowie signierte und notarisierte Builds; ohne diese Signierung erfolgt die Aktualisierung manuell über den Cloud-Installer.

### Dienstplan

Admins tragen Schichten in der Desktop-App unter **Dienstplan** ein. Nach der Cloud-Synchronisierung melden sich Mitarbeiter online unter `/schichtplan` mit ihren bestehenden Desktop-Benutzerdaten an. Dort sehen sie ausschließlich die eigenen Schichten; nur Admins können Schichten anlegen, bearbeiten oder löschen.

### Webshop-Versand

Im Shop wird Paketversand für Privat- und Geschäftskunden ausschließlich mit DPD berechnet. Geschäftskunden können bis zu sechs 24er-Trays per DPD bestellen; die Trays werden auf höchstens drei Pakete mit maximal zwei Trays und 31,5 kg je Paket verteilt. Die DPD-Gewichtspreise werden pro Paket berechnet. Größere oder nicht paketfähige Bestellungen gehen per Spedition. Die DPD-Gewichtspreise und Traygrenze sowie der Speditionspreis (standardmäßig 85,00 € je Palette für bis zu 64 Trays) können in der Desktop-App unter **Shop → Versandkosten** angepasst werden. Die bisherigen Paketpreise dienen als Ausgangswerte und müssen mit den geltenden DPD-Vertragspreisen abgeglichen werden.

Im Bereich **Versand & Tracking** kann ein eigener A4-Lieferschein mit einem QR-Code zur Auftragsnummer gedruckt werden. Admins können dort DPD-Webservice-Zugangsdaten verschlüsselt in der Cloud speichern oder entfernen; das myDPD-Business-Portal-Login ist dafür nicht geeignet. Die App druckt weiterhin interne Adressetiketten ohne Porto. Frankierte DPD-Labels sind noch nicht verfügbar: Dafür werden ein für das Geschäftskundenkonto freigeschalteter Webservice-Zugang, die aktuelle WebConnect-Schnittstellenspezifikation und deren technische Anbindung benötigt. DPD-Tracking wird in der Bestätigungsmail und auf der Sendungsverfolgungsseite angeboten. Netzwerkdrucker im selben WLAN/LAN werden zuerst in den Druckereinstellungen von Windows oder macOS hinzugefügt. Unter **Versand & Tracking → Netzwerkdrucker verbinden** kannst du die Systemeinstellungen öffnen, die installierten Drucker auflisten, einen Drucker für Zyro-Drucke auswählen und eine Testseite drucken. Die Auswahl wird lokal auf diesem PC gespeichert und für Versandetiketten, Lieferscheine und die Testseite verwendet. Drucker an anderen Standorten werden nicht unterstützt.

Der Geschäftskunden-Shop ist über den Link **Geschäftskunden-Shop** im Seitenkopf oder direkt unter `/brand.html?bereich=geschaeftskunden` erreichbar. Sortiment, individuelle Verkaufspreise pro 24er-Tray und Warenkorb werden dort nur für angemeldete, manuell freigeschaltete Geschäftskunden angezeigt. Neue Firmenkunden können ein Konto erstellen, ihr Firmenprofil ergänzen und die Freischaltung beantragen. Im B2B-Shop werden Produkte ausschließlich in ganzen 24er-Trays bestellt; Mengen, Lagerbestand, DPD- oder Speditionsversand und Preise werden beim Absenden serverseitig geprüft. Traymengen gelten nur für den jeweiligen Einkauf und werden nicht im Profil gespeichert. Freigegebene Geschäftskunden können außerdem aus dem Kundenkonto im normalen Shop zu ihrer eigenen Shop-Ansicht wechseln.

Die Desktop-App lokal starten:

```powershell
npm install
npm run desktop
```

Installer und portable EXE erstellen:

```powershell
npm run desktop:pack
```

Die fertigen Dateien liegen im Ordner `release`. App-Daten werden dauerhaft unter `%APPDATA%\Zyro Management` gespeichert. Für eine separate Sicherung in der App unter **Verkauf** auf **Daten sichern** klicken.

Installierte Windows-Versionen können in der App oben über **Nach Updates suchen** aktualisiert werden. Ist eine neue Version verfügbar, kannst du sie dort herunterladen und anschließend mit **Jetzt aktualisieren** installieren. Der Download-Fortschritt und Fehler werden direkt in der App angezeigt. Die App muss für die Installation neu starten.

### macOS Sonoma 14

Den Mac-Installer auf einem Mac erstellen (nicht unter Windows):

```bash
npm install
npm run desktop:pack:mac
```

Im Ordner `release` entstehen DMG- und ZIP-Dateien für Intel- und Apple-Silicon-Macs. Die App benötigt macOS 14 (Sonoma) oder neuer, einschließlich Sonoma 14.8.9. Für die Verteilung außerhalb des eigenen Macs müssen App und Installer mit einem Apple-Developer-ID-Zertifikat signiert und notarisiert werden. Ohne Signierung kann macOS beim ersten Öffnen eine Sicherheitswarnung anzeigen.

In der installierten Mac-App öffnet **Mac-Update aus der Cloud laden** die aktuelle Installer-Seite. Ohne Apple-Signierung/Notarisierung wird das Update manuell per DMG installiert; automatische macOS-App-Updates sind dann nicht verfügbar.

Die App-Daten liegen unter `~/Library/Application Support/Zyro Management`; Backups werden im Ordner `Dokumente/Zyro Management Backups` abgelegt.
Beim ersten Telefonat fragt macOS nach Mikrofon- und bei Videoanrufen Kamerazugriff. Falls der Zugriff abgelehnt wurde, aktiviere Zyro unter **Systemeinstellungen → Datenschutz & Sicherheit → Mikrofon/Kamera** und starte den Anruf erneut.

Alternativ kann GitHub den Installer über **Actions → Build macOS installer → Run workflow** auf einem Mac-Runner erstellen. Zuvor müssen die vollständigen Desktop-Quellen eingecheckt und in das Repository gepusht werden; `node_modules`, `dist` und `release` werden nicht benötigt. Zugangsdaten gehören nicht ins Repository: `.env` wird ignoriert, und der Workflow stoppt, falls die Datei beim Build vorhanden ist. Nach erfolgreichem Lauf liegen DMG und ZIP als Actions-Artefakt vor; mit konfiguriertem Repository-Secret `FIREBASE_TOKEN` veröffentlicht der Workflow die Installer zusätzlich im Cloud-Downloadbereich. Zum Weitergeben per E-Mail besser einen Download-Link verwenden, da Installer-Dateien oft die Größenbeschränkung für E-Mail-Anhänge überschreiten.

### Maschinenbau und technische Berichte

Der Bereich **Maschinenbau** ergänzt die Getränkeverwaltung um Projekte, Anlagen/Maschinen, Stücklisten und Material, Fertigungsaufträge, Wartung, Service, Qualität und Sicherheit. Einträge können Verantwortlichen, Terminen, Projekten und Anlagen zugeordnet, gesucht, bearbeitet und mit berechtigten Geräten synchronisiert werden. Mitarbeiter benötigen dafür die Berechtigung **Maschinenbau**.

Admins können unter **Maschinenbau → Mitarbeiterverwaltung** Mitarbeiter-Stammdaten erfassen. Die Personalverwaltung wird ausschließlich Admins angezeigt. Mitarbeiterdaten einschließlich SV-Nummern werden vor der Speicherung und Synchronisierung mit AES-GCM verschlüsselt; zum Entsperren ist ein selbst gewähltes Schutzpasswort mit mindestens 12 Zeichen nötig. Das Passwort wird nicht gespeichert und kann nicht wiederhergestellt werden. Ohne dieses Passwort können auch vorhandene Backups die Personaldaten nicht entschlüsseln. Die SV-Nummer ist optional, wird anhand von Format und Prüfziffer geprüft und in der Oberfläche nur als „verschlüsselt erfasst“ angezeigt.

Aus einem Maschinenbau-Eintrag kann ein KI-Berichtsentwurf erstellt werden. Die eingegebenen technischen Angaben werden dafür an Firebase AI (Google) übermittelt. KI-Texte sind Entwürfe: Messwerte, Normen, Sicherheitsbewertungen und erledigte Arbeiten werden nicht verlässlich bestätigt und müssen vor Verwendung fachlich geprüft werden. Der Bereich ersetzt keine technische Abnahme, Gefährdungsbeurteilung oder gesetzliche Dokumentation.

### Scanner-App

Die Android-Scanner-App lädt das MDE-Portal aus der Cloud. Änderungen an Scanner-Ansichten werden daher über Firebase Hosting ausgeliefert; die Android-Version 1.0.3 enthält außerdem den korrigierten Ansichtsmaßstab und kann als APK unter `scanner-android/app/build/outputs/apk/debug/app-debug.apk` installiert werden.

### Produkt-Nährwerte im Online-Shop

Die im Produktformular feldweise gepflegten Nährwerte werden in der Produktdetailansicht des Online-Shops als Tabelle „Nährwerte je 100 ml“ angezeigt. Ältere, bereits gespeicherte Nährwerttexte im bekannten Etikettformat werden für die Tabellenanzeige automatisch übernommen.

Admins können pro Shop-Produkt Vorbestellungen aktivieren und ein voraussichtliches Lieferdatum hinterlegen. Die Vorbestellung wird ausschließlich bei Lagerbestand 0 angeboten; Produkte mit Bestand bleiben auf die vorhandene Menge begrenzt. Die Bestellung verwendet weiterhin die im Shop konfigurierte Zahlungsart. Lieferhinweis und Vorbestellstatus erscheinen in der Bestätigung, im Kundenkonto und im Desktop-Kundenauftrag.

Im Sortiment kannst du direkt zwischen einzelnen 500-ml-Dosen, 24er-Trays und verfügbaren Rabattmengen wählen; die Vorschau berechnet Gesamtpreis und tatsächliche Ersparnis vor dem Hinzufügen. Im Warenkorb zeigt ein Rabatt-Fortschritt den nächstmöglichen Mengenrabatt pro Produkt und kann die zum Erreichen der Rabattstufe nötige Menge hinzufügen. Das Kassenformular bleibt geschlossen, bis **Zur Kasse** ausgewählt wird. Dort können Kunden optional ein Kundenkonto öffnen, Telefonnummer und eine abweichende Rechnungsanschrift mit Rechnungs-E-Mail und USt-IdNr. angeben; die Bestellpreise und Eingaben werden serverseitig geprüft.

### Geschäftskunden im Online-Shop

Das Kundenkonto öffnet sich als zentriertes Fenster direkt im Shop. Die Bereiche **Bestellungen**, **Rechnungen** und **Meine Daten** werden getrennt angezeigt. Registrierung, Anmeldung und Passwort-Reset sind dort erreichbar; für den Reset wird nach Eingabe der Konto-E-Mail ein zeitlich begrenzter Link per E-Mail verschickt. Nach einer gültigen E-Mail-Bestätigung wird das Kundenkonto direkt geöffnet; derselbe Bestätigungslink kann erneut verwendet werden, falls ein E-Mail-Dienst ihn vorab aufruft. Kunden sehen Bestellungen und Rechnungen und können ihre Kontakt-, Liefer- und Rechnungsdaten sowie USt-IdNr. und Lieferhinweise bearbeiten. Über **Geschäftskundenstatus beantragen** wird ein Antrag erstellt; bis zur manuellen Admin-Freigabe gelten weiterhin die normalen Shoppreise. Admins prüfen Anträge in der Desktop-Verwaltung unter **Admin → Shop → Geschäftskunden** und können pro aktivem Shop-Produkt einen eigenen Geschäftskunden-Verkaufspreis pro 24er-Tray einschließlich Mehrwertsteuer festlegen. Ein leeres Preisfeld verwendet den normalen Shoppreis. Diese Preise ersetzen die öffentlichen Mengenrabatte und werden serverseitig geprüft; zusätzliche Rabattcodes sind nicht kombinierbar. In derselben Verwaltung kann ein Admin Kundenkonten nach Eingabe der passenden E-Mail-Adresse dauerhaft löschen; Bestellungen und Rechnungen bleiben erhalten, und aktive Kunden-Sitzungen werden ungültig. Abweichende Rechnungsdaten und USt-IdNr. werden bei Webshop-Aufträgen für Rechnungen übernommen. Die Maschinenbau-Daten bleiben synchronisiert, der Bereich ist aber nicht mehr in der Desktop-Navigation verfügbar.

### Desktop-Rechnungen im Kundenkonto

Rechnungen werden in der Desktop-App zunächst als **Entwurf** gespeichert. Über **E-Mail versenden** werden Rechnungen, Angebote und Auftragsbestätigungen mit angehängter PDF über den angemeldeten Desktop-Zugang versendet; ein separates Website-Admin-Token ist dafür nicht erforderlich. Der SMTP-Versand muss eingerichtet und eine Kunden-E-Mail-Adresse hinterlegt sein. Beim Wechsel auf **Versendet** wird die PDF außerdem im Kundenkonto unter der hinterlegten Kunden-E-Mail bereitgestellt. Für diese separate Portal-Bereitstellung ist weiterhin das Website-Admin-Token erforderlich. Schlägt ein Versand fehl, zeigt die App den Fehler an und markiert den Beleg nicht als versendet.

Admins können unter **Admin → Firmendaten für Rechnungen** Firmenname, Anschrift, Kontakt-, Steuer-, Bank- und Geschäftsführungs-/Registerangaben pflegen. Dieselben Daten erscheinen auf Rechnungen, Angeboten und Auftragsbestätigungen; die ZYRO-Firmenadresse wird als `info@zyro-getränke.de` angezeigt, nicht als technische Punycode-Adresse. In **Verkauf** lässt sich vor dem Speichern eine Vorschau des aktuellen Belegs öffnen. Beim Speichern schließt sich dieses Vorschaufenster automatisch. Für neue Belege stehen die Layouts **ZYRO**, **Modern** und **Klassisch** zur Auswahl; eine Vorschau kann außerdem mit noch nicht gespeicherten Firmendaten für alle drei Belegarten geöffnet werden. Die Angaben synchronisieren sich mit der Cloud. Bereits ausgestellte Rechnungen bleiben als historische Belege unverändert.

### Produktetiketten und Dokumentenarchiv

Im Produktformular können Admins eine Etikettdatei (PDF, JPG, PNG oder WebP bis 2 MB) hochladen, ansehen und herunterladen. Die Datei wird mit dem Produkt gespeichert und erscheint im Dokumentenarchiv. Die Archivsuche findet unter anderem Dateinamen, Produktnamen, Belegnummern sowie Empfänger und Absender; Suchbegriffe dürfen auch einzeln eingegeben werden.

Beim Öffnen einer E-Mail im Desktop-Postfach werden verfügbare Anhänge bis 5 MB automatisch im Dokumentenarchiv abgelegt und dort mit Betreff und Absender auffindbar. Bereits archivierte Anhänge werden nicht dupliziert. Das Archiv fasst insgesamt bis zu 7 MB; manuelle Datei-Uploads bleiben auf 2 MB je Datei begrenzt. Anhänge können im Postfach weiterhin geöffnet oder heruntergeladen werden.

### ZYRO-Versuchsprotokoll

Unter **Rezepturen → ZYRO – Testprotokoll** können Mitarbeiter und Admins jeden Versuch für die Proben A, B oder C dokumentieren. Erfasst werden Pfirsich- und Maracujaaroma in Gramm pro 500 ml, ein optionaler pH-Wert, Fruchtigkeit und Natürlichkeit auf einer Skala von 1 bis 10, Nachgeschmack, Süße und weitere Beobachtungen. Ein Versuch kann optional einer Rezeptur zugeordnet werden. Die Einträge werden mit Datum und angemeldetem Benutzer synchronisiert, bleiben unveränderlich und sind nur für Nutzer mit Rezeptur-Berechtigung verfügbar.

Admins können unter **Admin → Lohnabfüller** Name, Straße und PLZ/Ort ändern. Die Angaben werden in Produktionsaufträgen und in der Chargenübersicht verwendet und mit der Cloud synchronisiert.

### Kundenkarte und Kunden löschen

Unter **Kunden** zeigt eine Europa-Karte Kunden mit gespeicherter Rechnungsadresse auf Ortsebene. Für die Ortssuche werden nur Postleitzahl und Ort an Photon übermittelt; vollständige Anschriften, Namen und Kontaktdaten werden nicht an den Geocoder gesendet. Straßen-/Hauspunkte werden ausgeschlossen, bevorzugt wird der Mittelpunkt des Postleitzahlgebiets. Die Koordinaten werden lokal im Browser zwischengespeichert. Die Kartenkacheln werden von OpenStreetMap geladen. Ohne Internetverbindung sind Karte und Ortssuche nicht verfügbar.

Admins können einen gespeicherten Kundendatensatz aus der Kundenliste löschen. Rechnungen und Aufträge bleiben als historische Belege erhalten.

### Finanzbereich, BWA und UStVA-Vorschau

Admins finden unter **Finanzen** die Erfassung von Einnahmen und Ausgaben sowie eine Monatsauswertung auf Ist-Basis. Admins können Mitarbeitern das Modul **Finanzen** unter **Admin → Mitglieder** ausdrücklich freigeben; diese Berechtigung erlaubt Anzeigen, Erfassen und Bearbeiten, während das Löschen Admins vorbehalten bleibt. Zu jeder Buchung können bis zu fünf Belege als PDF, JPG oder PNG (jeweils maximal 10 MB) in den privaten Cloud-Speicher in der EU geladen und wieder heruntergeladen werden. Die Dateien sind nicht öffentlich und nur mit Finanzen-Berechtigung abrufbar; sie sind nicht Ende-zu-Ende-verschlüsselt. Beim Löschen einer Buchung durch einen Admin werden die zugehörigen Cloud-Dateien ebenfalls gelöscht. Für die Umsatzsteuerberechnung muss bei Einnahmen das tatsächliche Zahlungsdatum eingetragen werden; bezahlte Rechnungen müssen als Einnahme erfasst werden. Vorsteuer wird in der Vorschau nur für Ausgaben mit vorhandenem Beleg und Belegdatum im ausgewählten Monat berücksichtigt. Die Auswertung lässt sich als CSV exportieren oder drucken bzw. als PDF speichern.

### Einkauf und Wareneingang

Unter **Einkauf** können berechtigte Nutzer Lieferanten verwalten, Einkaufsaufträge mit Produkten, Mengen, Nettopreisen und erwarteten Terminen anlegen sowie Eingangsrechnungsdaten erfassen. Der Wareneingang wird über die geprüfte Cloud-Buchung gebucht: Teilmengen erhöhen den Fertigproduktbestand, legen bei eingetragener Charge bzw. Mindesthaltbarkeit passende Bestandslose an und erzeugen nachvollziehbare Lagerbewegungen. Doppelte Buchungen werden verhindert; ein Auftrag wird erst nach vollständiger Lieferung abgeschlossen. Eine Eingangsrechnung kann einmalig in **Finanzen** übernommen werden und benötigt dort einen hochgeladenen Beleg. Wareneingänge für Rohstoffe sind noch nicht enthalten, da das vorhandene Rohstoffinventar keine belastbaren Mengeneinheiten führt.

Die Anzeige ist eine vereinfachte Vorbereitung und weder eine amtliche Umsatzsteuervoranmeldung noch eine zertifizierte BWA. Beträge und Belege müssen geprüft werden; die UStVA wird derzeit manuell in **Mein ELSTER** eingereicht. Es gibt keine direkte ELSTER-Übermittlung.

Finanzbuchungen können zusätzlich ein Sachkonto aus dem SKR03 erhalten. Die DATEV-Vorbereitung erzeugt für bezahlte Buchungen des ausgewählten Monats eine CSV-Übergabe mit Beleg-/Zahlungsdatum, Sachkonto, Bank-Gegenkonto, Betrag und Steuersatz. Das ist kein ungeprüft importierbarer DATEV-Buchungsstapel: Konten, Steuerschlüssel und Importzuordnung müssen mit dem Steuerbüro abgestimmt werden. Für Warenverkäufe mit 19 % bzw. 7 % werden 8400 bzw. 8300 als Vorschlag angezeigt; andere Konten sind manuell zuzuordnen. Bestehende Buchungen ohne Sachkonto bleiben erhalten, müssen aber vor dem DATEV-Export kontiert werden.

Wird eine Rechnung auf **Bezahlt** gesetzt, wird das Zahlungsdatum gespeichert. Berechtigte Nutzer können die bezahlte Rechnung anschließend einmalig in die Finanzbuchhaltung übernehmen; Betrag, Kunde, Belegnummer und Umsatzsteuer werden vorgeschlagen und müssen vor dem Speichern geprüft werden. Der tatsächliche Zahlungseingang muss bestätigt sein.

Unter **Finanzen → ELSTER / ERiC vorbereiten** können Admins Firmen- und Steuerangaben sowie den Stand der Herstellerregistrierung und die Hersteller-ID hinterlegen. Die Angaben einschließlich Steuernummer werden mit der Cloud synchronisiert; nur Admin-Konten können sie über die App abrufen oder ändern. Die Cloud-Daten sind nicht Ende-zu-Ende-verschlüsselt. Passwörter, Zertifikatsdateien und private Schlüssel gehören nicht in diese Maske. Für die manuelle Übertragung in Mein ELSTER gibt es eine druckbare UStVA-Vorschau im eingestellten Monats- oder Quartalszeitraum. Sie ist kein amtlicher ELSTER-Datensatz und übermittelt nichts. ERiC-Zulassung und die Bestätigung, ob ELSTER Secure für ERiC unterstützt wird, stehen noch aus. Vorhandene lokale Vorbereitungsangaben werden beim ersten Öffnen des Finanzbereichs mit Version 1.0.72 in die gemeinsame Datenablage übernommen.

### Zahlungsanträge und SEPA-Export

Im Modul **Zahlungen** können Mitarbeiter Zahlungsanträge mit Auftraggeber, Empfänger, IBAN, Betrag, Verwendungszweck und gewünschtem Ausführungstag einreichen. Ein Admin kann Anträge prüfen und freigeben oder mit Begründung ablehnen; eigene Anträge kann ein Admin nicht freigeben. Die Admins hinterlegen dort außerdem das Firmenkonto, das als Auftraggeberkonto in SEPA-Dateien verwendet wird. Freigegebene Anträge lassen sich als SEPA-XML (`pain.001.001.03`) exportieren und nach erfolgter Überweisung manuell als **Überwiesen** kennzeichnen. Der Export ist keine direkte Bankverbindung und löst keine Zahlung aus: Datei und Bankdaten müssen vor dem Upload im Banking geprüft und dort freigegeben werden. Zahlungsdaten werden mit der Cloud synchronisiert, sind nicht Ende-zu-Ende-verschlüsselt und für Mitarbeiter auf eigene Anträge beschränkt; Firmenkontodaten sind nur für Admins abrufbar.

### Getränkekalkulation und Angebotsanalyse

Admins können unter **Kalkulation** die Kosten einer Produktionscharge erfassen: Zutaten, Verpackung, Arbeit und Gemeinkosten. Die Auswertung zeigt Selbstkosten pro Dose und Tray, Netto-/Bruttoverkaufspreise, Umsatzsteuer, Gewinn, Marge und Break-even. Traygröße, Ausbringungsmenge und Zielmarge sind einstellbar. Gespeicherte Kalkulationen werden mit der Cloud synchronisiert; die Kalkulationsdaten sind nicht Ende-zu-Ende-verschlüsselt.

Lieferantenangebote können als PDF, PNG, JPG oder WEBP bis 10 MB zur Analyse an Gemini übermittelt werden. Die Originaldatei wird nicht gespeichert; erkannte Positionen und Hinweise werden mit der Kalkulation gespeichert. Brutto- oder unsichere Preise werden nicht automatisch als Nettopreise übernommen. Angebotsmengen sind nicht automatisch der Verbrauch einer Produktionscharge: Preise, Einheiten und tatsächlichen Chargenverbrauch vor dem Speichern prüfen. Für die Analyse muss der Gemini-Zugang in Firebase AI Logic oder am Haupt-PC eingerichtet sein.

Produktionsaufträge im Bereich **Chargen** erhalten beim Anlegen eine Chargennummer. Beim MDE-Wareneingang kann nach dem Scannen eines Produkts eine dazu passende vorbereitete Charge ausgewählt werden; alternativ bleibt die manuelle Eingabe möglich.

## Brand-Kontaktformular und SMTP-E-Mail

Die SMTP-Verwaltung erreichst du nach dem Hosting-Deployment unter `/admin-email.html`. Erzeuge den Admin-Token in der Desktop-App unter **Admin → SMTP-Administration**. Beim normalen Kopieren wird das lokal verschlüsselt gespeicherte Token wiederverwendet. Wähle **Token neu erzeugen** nur, wenn du es absichtlich austauschen willst; dadurch wird das bisherige Token sofort ungültig. Der Token wird in der Admin-Seite nur für die aktuelle Browser-Sitzung gespeichert.

```powershell
Get-Clipboard -Raw | firebase functions:secrets:set ZYRO_ORDER_ADMIN_TOKEN --data-file - --project zyro-78855
firebase deploy --only functions,hosting --project zyro-78855
```

Das Deployment nach dem Secret-Setzen ist erforderlich, damit die Functions das neue Secret erhalten. Melde dich danach auf `/admin-email.html` mit genau diesem Token an. Trage dort SMTP-Server, Port, TLS, Benutzername, Absenderadresse und Passwort ein und speichere die Einstellungen. Port `465` nutzt üblicherweise TLS; für Port `587` wird TLS deaktiviert (STARTTLS). Mit einer Testmail prüfst du anschließend den Versand. Das Passwort wird AES-GCM-verschlüsselt in Firestore gespeichert und nie an den Browser zurückgegeben. Kontaktanfragen der Brand-Website gehen an `info@libertystreetfood.de`.

E-Mail-Adressen mit Umlauten in der Domain werden vor dem SMTP-Versand in das standardisierte ASCII-/Punycode-Format umgewandelt; Umlaute im lokalen Teil vor dem `@` benötigen SMTPUTF8-Unterstützung des Mailservers. Bei einem vorübergehenden SMTP-Fehler wird einmal erneut versucht. Als erfolgreich gilt der Versand erst, wenn der SMTP-Server den Empfänger angenommen hat; das garantiert noch nicht, dass die Nachricht den Posteingang erreicht (z. B. Spamfilter oder Empfängerregeln).

Kontaktanfragen werden zusätzlich in Firestore gespeichert und sind in der Desktop-App unter **Neue Anfragen** verfügbar. Füge dort dasselbe Admin-Token wie auf der SMTP-Seite ein; es wird verschlüsselt auf dem Haupt-PC gespeichert. Antworten werden über den konfigurierten SMTP-Server versendet und erhalten automatisch die ZYRO-Signatur mit `www.zyro-getränke.de`.

Jede Anfrage ist ein Verlauf: Kunden erhalten eine Eingangsbestätigung und in jeder Antwort einen persönlichen Link (`/anfrage.html?id=…&t=…`), über den sie den Verlauf sehen und direkt antworten können. Kundenantworten erscheinen in der App mit Status „Kunde hat geantwortet“. Benachrichtigungen und der Reply-To der Mails gehen an eine in der App einstellbare Adresse (Standard: info@libertystreetfood.de). Anfragen lassen sich als erledigt markieren.

This template provides a minimal setup to get React working with Vite and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## Cloud-Sync und Anmeldung auf weiteren PCs

Die gemeinsamen Benutzerkonten und App-Daten werden über die Firebase-Funktion `cloudData` (Firestore, komprimiert in `appDataChunks`) zwischen PCs abgeglichen. Der Abgleich läuft automatisch alle 30 Sekunden und kurz nach Änderungen; offline bleibt die lokale Arbeit verfügbar.

Gelöschte Datensätze, einschließlich Rezepturen, bleiben gelöscht: Beim Konfliktabgleich hat eine Löschung Vorrang vor einer veralteten Änderung auf einem anderen Gerät.

Auf dem ersten PC anmelden und den Cloud-Sync unter **Netzwerk einrichten** aktivieren. Auf einem weiteren PC am Login **Mit Cloud verbinden** öffnen, das Cloud-Admin-Token eingeben und **Cloud-Daten laden** wählen. Das Token ist dasselbe Admin-Token, das in der Desktop-App unter **Admin → SMTP-Administration** erzeugt und für Firebase eingerichtet wird. Die Daten dieses PCs werden vor dem Laden gesichert; die vorhandenen Cloud-Daten ersetzen anschließend die lokalen gemeinsamen Daten. Danach mit dem in der Cloud gespeicherten Zyro-Benutzernamen und Passwort anmelden.

Löschungen werden mit den gemeinsamen Daten synchronisiert und bleiben auch nach App-Updates gelöscht. Beim Android-Scanner liegen die Geschäftsdaten in der Cloud; nach einer Neuinstallation mit demselben Zyro-Konto anmelden. Beim Desktop vor einer Neuinstallation den Cloud-Sync abwarten oder eine aktuelle Datensicherung behalten. Das Wiederherstellen einer älteren Sicherung kann zuvor gelöschte Einträge absichtlich zurückbringen.

Das Admin-Postfach ist ebenfalls cloudbasiert und kann von mehreren Desktop-PCs mit aktivem Cloud-Zugang verwendet werden. Beim ersten Öffnen werden vorhandene lokale Postfach-Einstellungen einmalig in die Cloud übertragen. Das Postfach-Passwort wird dort serverseitig verschlüsselt gespeichert und ist nicht Ende-zu-Ende-verschlüsselt; nur der Cloud-Postfachdienst kann es zum IMAP-/SMTP-Zugriff entschlüsseln. Gesendete Nachrichten werden als Kopie im IMAP-Ordner „Gesendet“ abgelegt. Im Desktop-Postfach erscheinen die vorhandenen IMAP-Ordner des Mailservers, einschließlich Spam/Junk und Papierkorb, sofern der Anbieter sie bereitstellt. E-Mails können in Spam verschoben, daraus in den Posteingang zurückgeholt sowie in den Papierkorb verschoben und dort wiederhergestellt werden. Das endgültige Löschen aus dem Papierkorb ist separat bestätigt.

## iPad-Web-App

Die Verwaltungsoberfläche wird auf Firebase Hosting unter `/management/` bereitgestellt. Sie kann auf dem iPad in Safari geöffnet und über **Teilen → Zum Home-Bildschirm** installiert werden. Es ist eine Web-App, kein App-Store- oder IPA-Build.

### MDE-Lager auf dem Datalogic Memor 11

Für den Datalogic Memor 11 gibt es ein eigenes Android-Projekt unter `scanner-android/`. Die App startet direkt den MDE-Scanner, meldet sich mit dem Zyro-Benutzerkonto an und verwendet die Cloud-API. Die Oberfläche wird aus der Cloud geladen und aktualisiert sich dadurch ohne APK-Neuinstallation. Eine Internetverbindung ist erforderlich. Das Benutzerkonto benötigt **MDE Scanner** oder **Lager**. Den Datalogic-Scanner als Tastatureingabe (Keyboard-Wedge) konfigurieren und nach dem Barcode ein Enter senden lassen. Produktbarcodes werden über die SKU oder die am Produkt gespeicherte Dosen-EAN erkannt.

Android Studio mit Android SDK 35 und JDK 17 installieren. Im Projektordner `scanner-android/` in PowerShell `.\gradlew.bat assembleDebug` ausführen. Der Gradle-Wrapper lädt Gradle 8.9 beim ersten Build herunter. Die APK erscheint unter `scanner-android/app/build/outputs/apk/debug/app-debug.apk`; sie kann auf dem Memor 11 installiert werden, wenn Android die Installation aus dieser Quelle erlaubt. Die App ist für den internen Einsatz vorgesehen und nicht über den Play Store verteilt.

Im Wareneingang Produkt und Dosenmenge scannen und buchen. Für den Versand wird ein Kundenauftrag zuerst am Scanner angenommen, dann müssen alle bestellten Artikel gescannt werden. Die Cloud prüft Auftrag und Bestand atomar und bucht den Warenausgang genau einmal. Danach druckt die App ein internes Zyro-Adressetikett über den Android-Druckdienst; es ist **kein frankiertes DPD-Versandlabel**. In **Versand & Tracking** werden DPD oder Spedition, Sendungsnummer und optional ein HTTPS-Trackinglink eingetragen. Damit wird der Auftrag als **Versendet** markiert. Die Versand-E-Mail enthält einen persönlichen, nicht erratbaren Link zur öffentlichen [Sendungsverfolgung](https://zyro-78855.web.app/tracking/); dort werden nur Auftragsnummer, Versanddienst, Sendungsnummer und Versanddatum angezeigt. DPD-Tracking lässt sich direkt öffnen, für Speditionen wird der hinterlegte HTTPS-Link verwendet. Die E-Mail benötigt den in Firebase eingerichteten SMTP-Versand. Unvollständige Aufträge und fehlender/zu kleiner Bestand können nicht abgeschlossen werden.

Nach bestätigter Zustellung wird automatisch eine persönliche Bewertungs-E-Mail angefragt. Bestehende DHL-Sendungen prüft die Cloud weiterhin alle sechs Stunden; DPD- und Speditionssendungen bestätigt ein berechtigter Mitarbeiter unter **Versand & Tracking** manuell. Dafür muss ein gültiger Kunden-E-Mail-Eintrag vorhanden sein und der SMTP-Versand funktionieren. Der Einmal-Link läuft nach 90 Tagen ab. Bewertungen werden in der Desktop-Verwaltung unter **Admin → Kundenbewertungen prüfen** freigegeben oder abgelehnt und erst danach im Shop veröffentlicht. Der Bewertungsdurchschnitt und die neueste Kundenstimme erscheinen direkt auf den Produktkarten; in den Produktdetails werden bis zu drei freigegebene Bewertungen angezeigt. Fehlgeschlagene Bewertungs-E-Mails können im Versandbereich erneut gesendet werden. Die automatische DHL-Erkennung bleibt nur für ältere DHL-Sendungen verfügbar.

```powershell
npm run build:web
npm run deploy:web
```

Der Web-Login verwendet die bestehenden Zyro-Benutzerkonten aus den Firebase-Cloud-Daten. Firebase Functions prüfen das Passwort serverseitig und stellen ein 30 Tage gültiges Sitzungstoken aus, das beim Abmelden widerrufen wird. Der SHA-256-Hash des Tokens wird in Firestore gespeichert; das Cloud-Admin-Token wird nicht an den Browser übertragen. Produkte, Rezepturen, Bestellungen, Belege, Website-Bestellungen, Kunden, Lagerbewegungen und Tickets werden nach dem Login initial geladen und danach alle 10 Sekunden sowie kurz nach lokalen Änderungen mit Versionsabgleich synchronisiert. Änderungen auf einem anderen Gerät erscheinen beim nächsten Abgleich; offline gespeicherte Änderungen werden nach Wiederverbindung abgeglichen. Benutzerkonten werden durch die serverseitige Anmeldung/Profile-API synchronisiert; Aktivierungsschlüssel sind nicht Teil des Web-Clients. Vor dem ersten iPad-Login müssen die aktuellen Zyro-Benutzer und Geschäftsdaten vom PC in die Cloud synchronisiert sein.

Das interne Telefon verwendet bei Web- und Desktop-Anmeldungen Firebase als Signalisierungs- und Präsenzdienst. Der Desktop meldet sich dafür über den separaten `call-relay`-Functions-Codebestand an; Erreichbarkeit, Klingeln, Annehmen, Auflegen und WebRTC-Verbindungsdaten laufen über `cloudCallRelay`. Sprache und Video werden danach direkt verschlüsselt zwischen den Geräten übertragen. Beide Teilnehmer müssen online angemeldet sein und Mikrofon-/Kamerazugriff erlauben. Der erste Desktop-Login benötigt eine Internetverbindung, damit eine Cloud-Telefonsitzung ausgestellt werden kann.

Admins können in der Desktop-App das externe SIP-Softphone vorbereiten. Es unterstützt SIP über eine sichere WebSocket-Verbindung (WSS), SIP-Registrierung sowie ein- und ausgehende Audioanrufe über PC-Mikrofon und -Lautsprecher. Dafür werden vom Telefonieanbieter eine WSS-Serveradresse, SIP-Adresse, Anmeldename und Passwort benötigt. Die Zugangsdaten werden lokal mit Electron `safeStorage` verschlüsselt und nicht mit der Zyro-Cloud synchronisiert. Die tatsächliche Verbindung hängt davon ab, ob der jeweilige sipgate-Tarif SIP-over-WSS und WebRTC unterstützt; sie kann erst mit den vom Anbieter bestätigten Verbindungsdaten getestet werden. Es gelten die Gebühren und Limits des sipgate-Tarifs.

Für Anmeldung und Datensynchronisierung ist weder ein Google-Konto noch ein aktivierter Firebase-Authentication-Anbieter erforderlich. Die optionalen öffentlichen `VITE_FIREBASE_*` Konfigurationswerte werden für die Firebase-AI-Rezept- und Angebotsanalyse verwendet; sie sind keine Server-Secrets. Admin-Tokens und private API-Schlüssel gehören ausschließlich in Firebase Secret Manager. Funktionen, die auf Electron oder Windows zugreifen (z. B. PC-Netzwerkserver, interne Anrufe und einige Admin-/Exportwerkzeuge), sind keine Browser-Funktionen und müssen separat auf Web-/Firebase-APIs umgestellt werden.

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Automatische Rechnung beim Verpacken

Schlie�t der Scanner das Verpacken eines Kundenauftrags ab, erstellt die Cloud automatisch eine Rechnung (RE-Nummer, einmal pro Auftrag), legt das PDF im Kundenkonto ab und sendet es per E-Mail. Fehlt die Kunden-E-Mail oder scheitert der Mailversand, bleibt das Verpacken g�ltig und der Scanner zeigt den Fehler an. Der Shop-Katalog akzeptiert zudem Preise, Gewichte und Best�nde mit Komma oder als Text.
