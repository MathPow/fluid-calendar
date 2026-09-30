import { parseBankCsv, parseCsv } from "../bank-csv";

describe("parseCsv", () => {
  it("handles quotes, commas and CRLF", () => {
    expect(parseCsv('a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
    ]);
  });
});

describe("parseBankCsv", () => {
  it("reads the Wealthsimple activity export, chequing only", () => {
    const csv = [
      "transaction_date,settlement_date,account_id,account_type,activity_type,activity_sub_type,direction,symbol,name,currency,quantity,unit_price,commission,net_cash_amount",
      "2026-09-02,2026-09-02,ca-cash-1,Chequing,Spend,,,,IGA #123,CAD,,,,-54.21",
      "2026-09-15,2026-09-15,ca-cash-1,Chequing,Deposit,Payroll,,,Employeur Inc,CAD,,,,1500.00",
      "2026-09-30,2026-09-30,ca-cash-1,Chequing,Interest,,,,,CAD,,,,3.10",
      "2026-09-10,2026-09-12,tfsa-1,TFSA,Trade,Buy,,VFV,Vanguard,CAD,2,100,0,-200.00",
    ].join("\n");
    const p = parseBankCsv(csv);
    expect(p.skipped).toEqual([]);
    expect(p.otherAccounts).toEqual(["TFSA"]);
    expect(p.invoices.map((i) => [i.date, i.direction, i.totalCents, i.category])).toEqual([
      ["2026-09-02", "depense", 5421, "p-nourriture"],
      ["2026-09-15", "revenu", 150000, "p-salaire"],
      ["2026-09-30", "revenu", 310, "p-interets"],
    ]);
    expect(p.invoices[0].party).toBe("IGA #123");
  });

  it("reads the monthly statement layout", () => {
    const csv = 'date,transaction,description,amount,balance\n2026-08-03,SPEND,"Fizz, mobile",-45.99,954.01\n2026-08-04,DEP,Virement,100,1054.01\n';
    const p = parseBankCsv(csv);
    expect(p.invoices).toHaveLength(2);
    expect(p.invoices[0]).toMatchObject({ direction: "depense", totalCents: 4599, category: "p-cellulaire", party: "Fizz, mobile" });
    expect(p.invoices[1]).toMatchObject({ direction: "revenu", totalCents: 10000 });
  });

  it("reads the French Wealthsimple export (Compte chèques)", () => {
    const csv = [
      "date_effet,heure_effet,date_reglement,compte_id,type_compte,type_activite,sous_type_activite,description,direction,symbole,nom,devise,quantite,prix_unitaire,commission,montant_net_especes",
      "2026-01-01,00:00:00,,WK1,Compte chèques,Interest,-,Intérêts reçus (au 2026-01-01),,,,CAD,4.14,,,4.14",
      "2026-01-02,08:31:15,,WK1,Compte chèques,MoneyMovement,SPEND,Dépense,,,,CAD,-42.66,,,-42.66",
      "2026-01-15,09:00:00,,WK1,Compte chèques,MoneyMovement,AFT_IN,Dépôt direct reçu,,,,CAD,1200,,,1200",
      "2026-04-10,09:00:00,,WK1,Compte chèques,MoneyMovement,TRANSFER,Transfert sortant d'argent (au 2026-04-10),,,,CAD,-500,,,-500",
    ].join("\n");
    const p = parseBankCsv(csv);
    expect(p.skipped).toEqual([]);
    expect(p.invoices.map((i) => [i.party, i.direction, i.totalCents, i.category])).toEqual([
      ["Intérêts reçus", "revenu", 414, "p-interets"],
      ["Dépense", "depense", 4266, "p-autres"],
      ["Dépôt direct reçu", "revenu", 120000, "p-salaire"],
      ["Transfert sortant d'argent", "depense", 50000, "p-epargne"],
    ]);
  });
});
