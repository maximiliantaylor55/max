# ZYRO Warenbestand für iOS

Native React-Native-App mit Expo für gemeinsamen Zyro-Login und Cloud-Daten.

## Funktionen

- Bestandssuche und Barcode-Scan per iPhone-Kamera
- Online-Wareneingang und Lagerbewegungen über die vorhandene MDE-Cloud-API
- Kunden und Kundenaufträge ansehen sowie Versand online buchen
- Umsatzübersicht mit Bruttoumsatz und verkauften Dosen aus ausgestellten Rechnungen
- Keine Verkäufe oder Rechnungen in der App anlegen
- Zuletzt geladene Daten offline ansehen; Buchungen sind offline gesperrt
- Sitzungstoken werden mit iOS Keychain via `expo-secure-store` gespeichert

## Start und iOS-Build

### Auf Windows im Browser testen

Im PowerShell-Fenster:

```powershell
cd "C:\Users\maxbr\Documents\zyro programm\ios-app"
npm run web
```

Die Seite öffnet sich unter `http://localhost:5173`. Melde dich mit dem Zyro-Konto an. Für einen Barcode-Scan muss der Browser Zugriff auf eine angeschlossene Kamera erhalten. Im Browser wird das Sitzungstoken aus Sicherheitsgründen nicht dauerhaft gespeichert; nach Neuladen der Seite musst du dich erneut anmelden. Buchungen sind echte Online-Buchungen und sollten nur mit freigegebenen Testdaten ausprobiert werden.

### App auf dem iPhone testen

```sh
npm install
npm start
```

Für iOS-Simulator und App-Store-Build wird ein macOS-Build-Runner benötigt. Für eine Verteilung über TestFlight oder den App Store ist außerdem eine aktive Apple-Developer-Program-Mitgliedschaft erforderlich. Danach EAS einrichten und bauen:

```sh
npx eas-cli@latest login
npx eas-cli@latest build:configure
npx eas-cli@latest build --platform ios --profile production
```

Die native App kann unter Windows entwickelt und per Expo Go getestet werden, aber hier nicht mit Xcode signiert oder im iOS-Simulator verifiziert werden.
