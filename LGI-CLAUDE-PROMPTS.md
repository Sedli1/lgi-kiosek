# Prompty pro Claude.ai — LGI Kiosek

Zkopíruj libovolný prompt do claude.ai a nech ho vygenerovat materiál.

---

## 1. Infografika (ASCII / textová vizualizace)

```
Vytvoř textovou infografiku pro logistický kiosek systém LGI Kiosek.
Systém funguje takto:

ŘIDIČ: Přijede k areálu → vyplní tablet (jméno, SPZ, firma, typ operace) za 30 sekund → dostane SMS potvrzení → čeká → dostane SMS s číslem rampy a časem → jede na rampu → odjíždí.

OPERÁTOR: Přihlásí se → vidí živý seznam čekajících řidičů → upozornění červeně pokud někdo čeká >30 minut → klikne → přidělí rampu → SMS odejde automaticky → označí jako hotovo.

ADMIN: Vidí statistiky, audit log každé akce, spravuje operátory a role.

Technologie: Next.js, Cloudflare Workers, D1 databáze, SMS notifikace.
Bezpečnost: HttpOnly cookies, PBKDF2 hesla, audit trail.

Vytvoř přehlednou textovou infografiku s ikonami, šipkami a bloky která ukazuje celý flow od příjezdu řidiče po odjezd. Přidej sekci "Co systém řeší" vs "Bez systému".
```

---

## 2. Jednostránkový návod pro operátora

```
Napiš jednoduchý jednostránkový návod pro operátora logistického skladu.
Operátor používá webový panel na tabletu nebo PC.

Co operátor dělá:
1. Přihlásí se jménem a heslem
2. Vidí seznam čekajících řidičů (seřazený dle příjezdu, červeně ti co čekají >30 min)
3. Klikne na řidiče → vybere rampu a čas → potvrdí → řidič automaticky dostane SMS
4. Po dokončení vykládky/nakládky klikne "Hotovo"
5. Může řidiče zrušit, upravit jeho údaje, nebo přidat řidiče ručně
6. Může nastavit stav rampy (dostupná / v opravě)
7. Odhlásí se

Napiš návod ve formátu krok za krokem, přátelsky, bez technického žargonu. Přidej tipy co dělat při problémech (co když řidič nedostal SMS, co když je rampa obsazená apod.). Jazyk: čeština.
```

---

## 3. Prezentační shrnutí pro management (executive summary)

```
Napiš executive summary (max 1 strana A4) pro management logistické firmy.

Produkt: LGI Kiosek — digitální systém pro správu vjezdu řidičů do logistického areálu.

Problém který řeší:
- Řidiči čekají u vrátnice a volají dispečerovi
- Dispečer hledá volnou rampu, vše se řeší telefonem a papírem
- Žádná zpětná dohledatelnost kdo byl kde a jak dlouho čekal

Řešení:
- Tablet u vjezdu — řidič se zaregistruje za 30 sekund
- Operátor vidí vše v reálném čase, přidělí rampu jedním klikem
- Řidič dostane SMS s rampou a časem
- Vše se loguje — audit trail každé akce

Výsledky:
- Eliminace telefonátů mezi vrátnicí a dispečerem
- Průkazná evidence čekacích dob a vytíženosti ramp
- Compliance ready — kdo co dělal a kdy, zpětně dohledatelné

Technická poznámka: běží na Cloudflare (SLA 99,9 %), automatický deploy, žádný vlastní server.

Napiš to jako profesionální executive summary pro ředitele nebo IT manažera. Čeština. Formát: nadpisy, odrážky, žádný technický žargon.
```

---

## 4. Srovnávací tabulka: před vs po

```
Vytvoř detailní srovnávací tabulku "Před LGI Kioskem" vs "Po LGI Kioskem" pro logistický sklad.

Oblasti ke srovnání:
- Registrace řidiče při příjezdu
- Komunikace operátor ↔ řidič
- Přidělení rampy
- Čekací doby
- Evidence a audit
- Chyby a nedorozumění
- Výkon při špičce
- Reportování managementu
- Odpovědnost za zpoždění

Formát: tabulka se třemi sloupci (Oblast | Před | Po). Přidej závěrečný řádek s celkovým hodnocením. Jazyk: čeština.
```

---

## 5. FAQ pro IT oddělení

```
Napiš FAQ (frequently asked questions) pro IT oddělení velké logistické firmy, která zvažuje nasazení systému LGI Kiosek.

Technické detaily systému:
- Frontend: Next.js (React), hostováno na Cloudflare Workers
- Databáze: Cloudflare D1 (SQLite na edge)
- Autentizace: HttpOnly cookie sessions, PBKDF2-SHA256 hashování hesel
- Deploy: GitHub Actions CI/CD, automatické migrace databáze
- SMS: Twilio API
- Bez vlastního serveru — vše na Cloudflare edge infrastruktuře
- SLA Cloudflare: 99,9 %
- Audit log: každá akce operátora je zaznamenána s časem a jménem
- Role: admin / operátor
- Roadmap: SSO (Microsoft Entra), API pro WMS/ERP, multilokace

Napiš 10-15 otázek které by IT oddělení mohlo mít (bezpečnost, integrace, GDPR, provoz, zálohování, SSO, převzetí kódu, SLA atd.) a odpověz na ně. Jazyk: čeština. Tón: profesionální ale srozumitelný.
```

---

## 6. Rychlý pitch pro 60 sekund (elevator pitch)

```
Napiš 3 varianty 60sekundového elevator pitch pro logistický kiosek systém.

Kontext: Jakub prezentuje systém manažerům logistické firmy LGI v Česku s cílem přesvědčit je k pilotnímu nasazení, případně prodeji do Německa.

Systém: tablet u vjezdu do skladu, řidič se zaregistruje za 30 sekund, operátor přidělí rampu jedním klikem, řidič dostane SMS. Vše se loguje.

Varianta 1: zaměřená na úsporu času
Varianta 2: zaměřená na audit a compliance
Varianta 3: zaměřená na škálovatelnost (pilotovat v CZ → rozjet v DE)

Každá varianta max 100 slov. Čeština. Přirozený mluvený projev, ne marketingový žargon.
```
