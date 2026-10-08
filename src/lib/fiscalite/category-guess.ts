/**
 * Category of a dropped invoice. Cheapest and surest first:
 * 1. the category the same supplier (or client) got last time in this company;
 * 2. a keyword on the supplier's name;
 * 3. the local LLM's pick (asked in extract.ts, validated here);
 * 4. a keyword anywhere in the invoice text.
 * Personal budgets reuse the bank-CSV merchant rules and their own ids.
 */
import { guessCategory as personalKeyword } from "./bank-csv";
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PERSONAL_EXPENSE_CATEGORIES,
  PERSONAL_INCOME_CATEGORIES,
} from "./meta";

type Direction = "depense" | "revenu";

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// Keyword → business category (T2125 lines). First match wins.
const EXPENSE_RULES: [RegExp, string][] = [
  [/\b(meta platforms|facebook|instagram ads|google ads|tiktok ads|linkedin ads|imprimerie|vistaprint|affiches?|flyers?|commandite)\b/, "publicite"],
  [/\b(postes canada|canada post|purolator|fedex|ups|dhl|canpar|intelcom|chit chats|stallion|shippo|messagerie|expedition)\b/, "livraison"],
  [/\b(restaurant|resto|bistro|brasserie|cafe|boulangerie|pizza|sushi|tim hortons|starbucks|mcdonald|uber ?eats|doordash|skip ?the ?dishes|traiteur)\b/, "repas"],
  [/\b(esso|shell|petro canada|ultramar|irving|couche tard|circle k|crevier|sonic|saaq|stationnement|parking|communauto|mr lube|midas|pneus)\b/, "vehicule"],
  [/\b(bell|videotron|rogers|telus|koodo|fizz|virgin|fido|hydro quebec|internet)\b/, "telecom"],
  [/\b(google workspace|microsoft 365|office 365|adobe|canva|figma|notion|slack|zoom|shopify|squarespace|wix|godaddy|namecheap|cloudflare|ovh|hetzner|digitalocean|vercel|github|openai|anthropic|stripe atlas|hebergement|nom de domaine|abonnement logiciel)\b/, "logiciels"],
  [/\b(airbnb|expedia|air canada|westjet|porter|via rail|orleans express|hotel|booking com|uber|lyft|taxi)\b/, "deplacements"],
  [/\b(intact|desjardins assurances|la capitale|beneva|promutuel|assurance|insurance)\b/, "assurances"],
  [/\b(comptable|cpa|avocat|notaire|honoraires|consultation juridique)\b/, "honoraires"],
  [/\b(frais bancaires|frais de service|interets|stripe fees?|frais stripe|square fees?|paypal fees?)\b/, "interets"],
  [/\b(registraire des entreprises|req|permis|licence|cotisation|immatriculation)\b/, "permis"],
  [/\b(bureau en gros|staples|postes timbres|timbres)\b/, "bureau"],
  [/\b(uline|emballage|boites|papeterie)\b/, "fournitures"],
  [/\b(location de salle|loyer|entrepot|locaux)\b/, "loyer"],
  [/\b(formation|cours|conference|udemy|coursera|masterclass)\b/, "formation"],
];
const INCOME_RULES: [RegExp, string][] = [
  [/\b(billet|billets|billetterie|ticket|tickets|hi events|evenement|inscription)\b/, "billetterie"],
  [/\b(commandite|partenariat|sponsor)\b/, "commandites"],
  [/\b(subvention|grant|programme d aide)\b/, "subventions"],
  [/\b(interets|interest)\b/, "interets-revenus"],
  [/\b(produit|produits|marchandise|boutique|vente|t shirt|casquette|tuque)\b/, "ventes"],
  [/\b(service|services|consultation|developpement|design|gestion|heures)\b/, "services"],
];

/** The ids the LLM may answer with, for its prompt. */
export function categoryChoices(personal: boolean): { expense: string; income: string } {
  // The hints carry the examples ("hébergement" under Logiciels): worth the tokens.
  const list = (cats: { id: string; label: string; hint?: string }[]) =>
    cats.map((c) => `\n   - ${c.id} (${c.label}${c.hint ? `: ${c.hint}` : ""})`).join("");
  return personal
    ? { expense: list(PERSONAL_EXPENSE_CATEGORIES), income: list(PERSONAL_INCOME_CATEGORIES) }
    : { expense: list(EXPENSE_CATEGORIES), income: list(INCOME_CATEGORIES) };
}

export function validCategory(id: string | undefined, direction: Direction, personal: boolean) {
  if (!id) return undefined;
  const cats = personal
    ? direction === "revenu"
      ? PERSONAL_INCOME_CATEGORIES
      : PERSONAL_EXPENSE_CATEGORIES
    : direction === "revenu"
      ? INCOME_CATEGORIES
      : EXPENSE_CATEGORIES;
  // The model sometimes answers with the label (« Frais de bureau ») instead of the id.
  const key = fold(id);
  return cats.find((c) => c.id === id || fold(c.id) === key || fold(c.label) === key)?.id;
}

/** Keyword pass; undefined when nothing matched (no "autres" fallback). */
export function keywordCategory(direction: Direction, text: string, personal: boolean) {
  if (!text.trim()) return undefined;
  if (personal) {
    const id = personalKeyword(direction, text);
    return id === "p-autres" || id === "p-autres-revenus" ? undefined : id;
  }
  const key = fold(text);
  for (const [re, id] of direction === "revenu" ? INCOME_RULES : EXPENSE_RULES)
    if (re.test(key)) return id;
  return undefined;
}

export type CategorySource = "history" | "party" | "llm" | "text";

export function pickCategory(input: {
  direction: Direction;
  personal: boolean;
  history?: string | null;
  party?: string;
  llm?: string;
  text: string;
}): { category?: string; source?: CategorySource } {
  const { direction, personal } = input;
  if (input.history) return { category: input.history, source: "history" };
  const byParty = input.party ? keywordCategory(direction, input.party, personal) : undefined;
  if (byParty) return { category: byParty, source: "party" };
  const llm = validCategory(input.llm, direction, personal);
  if (llm) return { category: llm, source: "llm" };
  const byText = keywordCategory(direction, input.text.slice(0, 4000), personal);
  return byText ? { category: byText, source: "text" } : {};
}
