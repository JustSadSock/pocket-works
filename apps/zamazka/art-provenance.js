// Country refers to the painter's artistic tradition, NOT necessarily where
// the canvas was executed. Historic Flemish art is kept distinct from modern
// national borders. Creation locations are separately curated and deliberately
// omitted when not supported by reliable artwork-specific information.
export const ART_SCHOOLS = [
 "Нидерланды",
 "Нидерланды",
 "Нидерланды",
 "Япония",
 "Великобритания",
 "Франция",
 "Нидерланды",
 "Италия",
 "Нидерланды",
 "Нидерланды",
 "Фландрия",
 "Нидерланды",
 "Нидерланды",
 "Фландрия",
 "Нидерланды",
 "Нидерланды",
 "Фландрия",
 "Фландрия",
 "Фландрия",
 "Нидерланды",
 "Фландрия",
 "Фландрия",
 "Нидерланды",
 "Нидерланды",
 "Нидерланды",
 "Нидерланды",
 "Франция",
 "Италия",
 "Франция",
 "Франция",
 "Франция",
 "Франция",
 "Франция",
 "Франция",
 "Франция",
 "Франция",
 "Франция",
 "Франция",
 "Франция",
 "Франция",
 "Франция",
 "Великобритания",
 "Великобритания",
 "Великобритания",
 "Великобритания",
 "Великобритания",
 "Великобритания",
 "Великобритания",
 "Великобритания",
 "Италия",
 "Италия",
 "Италия",
 "Италия",
 "Италия",
 // Curated comic, grotesque and mythological classics — catalogue IDs 54–71.
 "Фландрия", "Фландрия", "Фландрия", "Фландрия",
 "Нидерланды", "Нидерланды", "Нидерланды",
 "Италия", "Италия", "Италия",
 "Нидерланды", "Франция", "Фландрия", "Франция",
 "Испания", "Нидерланды", "Испания", "Италия",
 // Player-approved catalog additions 72–107 (2026-10-16).
 "Франция", "Франция", "Франция", "Испания", "Франция", "Франция", "Нидерланды", "Италия", "Италия", "Великобритания", "Италия", "Великобритания", "Франция", "Франция", "Франция", "Франция", "Франция", "Франция", "Франция", "США", "США", "США", "Германия", "Франция", "Франция", "Франция", "Франция", "Норвегия", "Великобритания", "Великобритания", "Нидерланды", "Нидерланды", "Нидерланды", "Франция", "Франция", "Италия"
];

// Work-specific production places. In particular, the Chicago version of
// "The Bedroom" was painted at Saint-Rémy, not Arles (its depicted room).
export const CREATION_PLACES = {
  0: {country:'Нидерланды',city:'Делфт'},
  1: {country:'Франция',city:'Сен-Реми-де-Прованс'},
  2: {country:'Нидерланды',city:'Амстердам'},
  3: {country:'Япония',city:'Эдо (Токио)'},
  4: {country:'Великобритания',city:'Лондон'},
  5: {country:'Франция',city:'Гавр'},
  6: {country:'Франция',city:'Сен-Реми-де-Прованс'},
  23: {country:'Нидерланды',city:'Делфт'}
};

export function artworkOrigin(id){
 return {schoolCountry:ART_SCHOOLS[id]||null,creationPlace:CREATION_PLACES[id]||null};
}
