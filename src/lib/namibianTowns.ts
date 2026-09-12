export const NAMIBIAN_TOWNS = [
  "Aminuis",
  "Arandis",
  "Aranos",
  "Aroab",
  "Aus",
  "Berseba",
  "Bethanie",
  "Bukalo",
  "Divundu",
  "Dordabis",
  "Eenhana",
  "Engela",
  "Epupa",
  "Gibeon",
  "Gobabis",
  "Gochas",
  "Groot Aub",
  "Grootfontein",
  "Grünau",
  "Helao Nafidi",
  "Henties Bay",
  "Kalkfeld",
  "Kalkrand",
  "Kamanjab",
  "Karasburg",
  "Karibib",
  "Katima Mulilo",
  "Keetmanshoop",
  "Khorixas",
  "Koës",
  "Kongola",
  "Leonardville",
  "Linyanti",
  "Lüderitz",
  "Maltahöhe",
  "Mariental",
  "Nkurenkuru",
  "Noordoewer",
  "Ohangwena",
  "Okahandja",
  "Okahao",
  "Okakarara",
  "Okalongo",
  "Okongo",
  "Omaruru",
  "Omuthiya",
  "Onayena",
  "Ondangwa",
  "Ongwediva",
  "Oniipa",
  "Opuwo",
  "Oranjemund",
  "Oshakati",
  "Oshikango",
  "Oshikuku",
  "Otavi",
  "Otjinene",
  "Otjiwarongo",
  "Outapi",
  "Outjo",
  "Rehoboth",
  "Ruacana",
  "Rundu",
  "Sesfontein",
  "Stampriet",
  "Swakopmund",
  "Tsandi",
  "Tses",
  "Tsumeb",
  "Tsumkwe",
  "Uis",
  "Usakos",
  "Walvis Bay",
  "Warmbad",
  "Windhoek",
  "Witvlei",
] as const;

export const getNamibianTownSuggestions = (value: string) => {
  const query = value.trim().toLocaleLowerCase();
  if (query.length < 3) return [];
  return NAMIBIAN_TOWNS.filter((town) =>
    town.toLocaleLowerCase().includes(query)
  ).sort((first, second) => {
    const firstStartsWith = first.toLocaleLowerCase().startsWith(query);
    const secondStartsWith = second.toLocaleLowerCase().startsWith(query);
    if (firstStartsWith !== secondStartsWith) return firstStartsWith ? -1 : 1;
    return first.localeCompare(second);
  });
};

export const canonicalNamibianTown = (value: string) =>
  NAMIBIAN_TOWNS.find(
    (town) => town.toLocaleLowerCase() === value.trim().toLocaleLowerCase()
  ) || null;
