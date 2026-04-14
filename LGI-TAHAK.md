# LGI Kiosek — Tahák na schůzku

---

## Úvodní věta (nazpaměť)
> "Řidič přijede, vyplní tablet za 30 sekund, dostane SMS s rampou. Operátor vidí vše v reálném čase. Žádné telefonáty, žádný papír — a plný audit každé akce."

---

## Co to umí dnes

**Kiosek (řidič)**
- Registrace za 30 sekund (CZ / SK / PL / DE)
- SMS při příjezdu + SMS s rampou a časem
- Kontrola duplicit, validace SPZ

**Operátor**
- Živý přehled čekajících, upozornění >30 min (červeně)
- Přidělení rampy → SMS odejde automaticky
- Ruční přidání / úprava / zrušení řidiče
- Stav ramp (dostupná / oprava)

**Management / Admin**
- Statistiky: čekací doby, vytíženost ramp, počty dle firem
- Export do CSV
- Audit log — kdo co dělal, kdy, přihlášení/odhlášení
- Správa operátorů: role admin / operátor, hesla

---

## Argumenty pro IT oddělení

1. **Cloudflare** — globální infrastruktura, SLA 99.9 %, žádný vlastní server
2. **GitHub Actions** — automatický deploy, IT převezme za půl dne
3. **Audit log** — každá akce zaznamenána, splňuje compliance
4. **HTTPS + HttpOnly cookies + PBKDF2** — bezpečnostní standardy

---

## Otázky které mohou padnout

**"Co když vypadne internet?"**
→ Tablet u vrátnice potřebuje připojení. Záloha: operátor přidá řidiče ručně přes panel.

**"Kdo to bude spravovat?"**
→ Vaše IT — nasazení za půl dne, automatické deploye přes GitHub.

**"Je to bezpečné?"**
→ HttpOnly cookies, PBKDF2 hesla, audit trail, HTTPS všude.

**"Půjde to napojit na náš WMS/ERP?"**
→ Webhook / API je na roadmapě. Teď funguje standalone.

**"Co SSO / Active Directory?"**
→ Roadmap — Microsoft Entra SSO je připraveno implementovat.

**"Kolik to stojí?"**
→ Viz varianty níže.

---

## Varianty prodeje

| Varianta | Co dostanete | Cena |
|----------|-------------|------|
| **A — Prodej kódu** | Zdrojový kód + dokumentace + zaškolení | 80–200 tis. CZK jednorázově |
| **B — Licence + podpora** | Kód váš, roční podpora + aktualizace | 30–60 tis. CZK/rok |
| **C — SaaS** | Správa na naší straně, více poboček | dle počtu lokací |

---

## Roadmap (co říct jako "brzy")
- SSO (Microsoft Entra / Active Directory)
- WhatsApp notifikace
- Čtečka SPZ kamerou
- Multilokace — jeden admin, více skladů
- API pro napojení na WMS/ERP

---

## Zlaté pravidlo pro schůzku
**Ukaž živou aplikaci — ne slajdy.**
Nech je zkusit registraci řidiče. Ukaž audit log. Nezavazuj se k termínům.
