export type Lang = "cs" | "sk" | "pl" | "de";

const confirmTemplates: Record<Lang, (num: number) => string> = {
  cs: (num) => `Dobrý den! Vaše registrace č. ${num} byla přijata. Vyčkejte v kabině – SMS s rampou a časem přijde brzy.`,
  sk: (num) => `Dobrý deň! Vaša registrácia č. ${num} bola prijatá. Čakajte v kabíne – SMS s rampou príde čoskoro.`,
  pl: (num) => `Dzień dobry! Rejestracja nr ${num} przyjęta. Czekaj w kabinie – SMS z rampą i godziną dotrze wkrótce.`,
  de: (num) => `Guten Tag! Ihre Registrierung Nr. ${num} wurde angenommen. Bitte warten Sie in der Kabine.`,
};

const rampTemplates: Record<Lang, (name: string, ramp: string, time: string) => string> = {
  cs: (name, ramp, time) => `Dobrý den ${name}, najeďte prosím na RAMPU č. ${ramp}. Zahájení vykládky: ${time}. Děkujeme.`,
  sk: (name, ramp, time) => `Dobrý deň ${name}, najazdite na RAMPU č. ${ramp}. Začiatok vykládky: ${time}. Ďakujeme.`,
  pl: (name, ramp, time) => `Dzień dobry ${name}, proszę podjechać na RAMPĘ nr ${ramp}. Rozpoczęcie: ${time}. Dziękujemy.`,
  de: (name, ramp, time) => `Guten Tag ${name}, bitte fahren Sie zu RAMPE Nr. ${ramp}. Beginn der Entladung: ${time}. Danke.`,
};

export function buildConfirmSms(lang: Lang, num: number): string {
  return (confirmTemplates[lang] ?? confirmTemplates.cs)(num);
}

export function buildRampSms(lang: Lang, name: string, ramp: string, time: string): string {
  return (rampTemplates[lang] ?? rampTemplates.cs)(name, ramp, time);
}
