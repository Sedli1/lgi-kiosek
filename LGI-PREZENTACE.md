# LGI Kiosek — Prezentační materiál

---

## Sales Pitch

> "Řidiči přijíždějí, čekají u vrátnice, volají dispečerovi, ten hledá rampu, všechno se řeší telefonem a papírem. My to nahradíme tabletem u vjezdu — řidič se zaregistruje za 30 sekund, dostane SMS s rampou, operátor vidí vše v reálném čase. Žádné telefonáty, žádný papír, plný audit každé akce."

**Klíčová věta pro rozhodovací lidi:**
> "Víte přesně, kdo byl na které rampě, jak dlouho čekal, kdo mu ji přidělil a v kolik hodin — zpětně, kdykoli."

---

## Jak funguje aplikace — posloupnost

### Pohled řidiče
1. Přijede k areálu, u vjezdu je tablet (kiosek)
2. Vyplní: jméno, telefon, SPZ, firma, typ operace (vykládka/nakládka), jazyk
3. Potvrdí registraci → dostane SMS s potvrzením a pořadovým číslem
4. Čeká v kabině nebo v čekárně
5. Operátor přidělí rampu → řidič dostane SMS: "Jděte na rampu 5 v 14:30"
6. Řidič jede na rampu, operátor označí jako hotovo
7. Řidič odjíždí

### Pohled operátora
1. Přihlásí se do panelu (tablet/PC) svým jménem a heslem
2. Vidí živý seznam čekajících řidičů seřazený dle příjezdu
3. Upozornění (červeně) pokud někdo čeká >30 minut
4. Klikne na řidiče → přidělí rampu a čas → SMS odejde automaticky
5. Po dokončení označí jako hotovo
6. Vše se loguje do audit logu s jeho jménem a časem

### Pohled managementu / admina
1. Přihlásí se jako admin
2. Vidí statistiky: průměrné čekání, vytíženost ramp, počty dle firem
3. Záložka Audit — kdo co dělal, kdy, přihlášení/odhlášení
4. Správa uživatelů — přidávání operátorů, role, hesla
5. Export do CSV pro reporty

---

## Co aplikace umí dnes

### Kiosek (řidič)
- Registrace v češtině, slovenštině, polštině, němčině
- SMS potvrzení při příjezdu
- SMS notifikace při přidělení rampy
- Validace SPZ, kontrola duplicit

### Operátorský panel
- Živý přehled čekajících a řidičů na rampě
- Přidělení rampy s časem, možnost přeskočit SMS
- Označení jako hotovo, zrušení registrace
- Ruční přidání řidiče operátorem
- Úprava záznamu (jméno, SPZ, firma, poznámka)
- Stav ramp (dostupná / oprava)
- Vyhledávání a filtry

### Historie & statistiky
- Kompletní historie všech řidičů
- Průměrné čekací doby dle rampy a firmy
- Vytíženost ramp po hodinách
- Export do CSV

### Správa uživatelů (admin)
- Více operátorů s vlastními hesly
- Role admin / operátor
- Změna hesla, smazání účtu

### Audit log (admin)
- Každá akce zaznamenána: přihlášení, odhlášení, přidělení rampy, zrušení, úpravy, správa uživatelů
- Filtrování dle operátora, akce, období

### Bezpečnost
- HttpOnly cookie session (odolné vůči XSS)
- PBKDF2 hashování hesel
- Rate limiting přihlášení
- Security headers (CSP, HSTS, X-Frame-Options)
- Audit trail všech akcí

---

## Návrhy vylepšení pro budoucí verze

### UX & Kiosek
- Čekací doba viditelná řidiči ("před vámi čekají 3 řidiči")
- QR kód — řidič vyplní registraci na svém mobilu
- Časový limit na kiosku — reset po 2 minutách nečinnosti
- Velká tlačítka, vysoký kontrast pro čitelnost na slunci
- Hlasové pokyny pro řidiče co neumí číst
- Animace/progress bar při registraci
- Podpora dalších jazyků (rumunština, maďarština, bulharština)
- Tisk potvrzení na termální tiskárně

### Komunikace s řidičem
- WhatsApp notifikace místo/vedle SMS
- Odkaz na mapu v SMS — řidič naviguje přímo k rampě
- SMS připomínka když se blíží čas na rampě
- Zpětná vazba od řidiče po dokončení (hvězdičky)
- PWA — řidič si přidá aplikaci na mobil bez App Store

### Operátor
- Drag & drop přeřazení řidiče na jinou rampu
- Opakovaný alarm při čekání >30 minut
- Šablony SMS — vlastní zpráva řidiči jedním klikem
- Prioritní fronta — VIP firma skočí na začátek
- Komentáře pro předání směny
- Automatické uvolnění rampy po X hodinách nečinnosti

### Management & Analytika
- Automatický denní/týdenní report na email
- SLA reporty pro odběratele ("vaši řidiči čekali průměrně 12 minut")
- Srovnání týden vs týden — trend zlepšení/zhoršení
- Kapacitní plánování na základě historických dat
- Porovnání výkonu mezi rampami a směnami

### Integrace
- Čtečka čárových kódů — naskenuje objednávku
- Čtečka SPZ kamerou — řidič nemusí nic psát
- Napojení na WMS/ERP přes webhook/API
- API pro spedice — firma sleduje svého řidiče real-time
- Elektronický podpis při převzetí zboží
- Slack/Teams notifikace pro operátory

### IT & Bezpečnost
- SSO přes Microsoft Entra/Active Directory — firemní přihlašování
- IP whitelist — panel přístupný jen z firemní sítě
- GDPR export/mazání dat na žádost řidiče
- Automatické zálohy databáze
- Self-hosted varianta na vlastní infrastruktuře

### Škálování
- Multilokace — jeden admin vidí všechny sklady skupiny
- White-label — každá pobočka s vlastním logem a barvami
- Franšízový model pro další logistické firmy

---

## Jak to prodat — strategie

### Fáze 1: Pilot v CZ (teď)
- Cíl: 3–6 měsíců ostrého provozu
- Dohodněte jasné metriky: průměrná čekací doba před vs po
- Sbírejte data a zpětnou vazbu od operátorů
- Cena: dohodněte fixní měsíční paušál nebo jednorázové nasazení

### Fáze 2: Vyhodnocení a přesvědčení DE
- Připravte jednoduchý report: "Před kioskem X minut průměr, po kiosku Y minut"
- Ukažte audit log — IT bezpečáci to milují
- Zdůrazněte: žádná závislost na jednom člověku, standardní infrastruktura, CI/CD

### Fáze 3: Nabídka IT převzetí nebo licence
**Varianta A — Prodej kódu (jednorázově)**
- Zdrojový kód + dokumentace + zaškolení IT
- Cena: 80 000–200 000 CZK podle rozsahu
- Výhoda: žádná starost, peníze ihned

**Varianta B — Licence + podpora**
- Kód zůstane váš, zákazník platí roční licenci
- Technická podpora a aktualizace za fixní roční poplatek
- Cena: 30 000–60 000 CZK/rok

**Varianta C — SaaS pro více poboček**
- Pokud DE chce nasadit ve více zemích
- Cena dle počtu lokací a uživatelů
- Nejlépe škáluje, ale vyžaduje vaši správu

### Klíčové argumenty pro IT oddělení DE
1. Běží na Cloudflare — globální infrastruktura, SLA 99.9%
2. Automatické deploye přes GitHub Actions — IT převezme za půl dne
3. Migrace databáze jsou automatické — žádné ruční zásahy
4. Audit log každé akce — splňuje compliance požadavky
5. HTTPS, HttpOnly cookies, PBKDF2 — bezpečnostní standardy

### Co říct zítra
- Ukažte živou aplikaci, ne prezentaci
- Nechejte je samotné zkusit registraci řidiče
- Ukažte audit log — "toto je váš compliance nástroj"
- Zmiňte možnost SSO a multilokace jako roadmap
- Nezavazujte se k termínům — "pilotujeme a pak se uvidí"
