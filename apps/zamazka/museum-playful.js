// 18 individually sourced public-domain paintings: visual satire, baroque
// humour, fantastical portraiture and classical eroticism. Stable index 54+.
// The Wikimedia file page for each work documents origin and attribution.
const CURATED_PAINTINGS=[
 [
  "Битва Масленицы и Поста",
  "Питер Брейгель Старший",
  "1559",
  "Музей истории искусств · Вена",
  "a/a8/",
  "The_Fight_Between_Carnival_and_Lent.jpg"
 ],
 [
  "Детские игры",
  "Питер Брейгель Старший",
  "1560",
  "Музей истории искусств · Вена",
  "1/1e/",
  "Pieter_Bruegel_the_Elder_-_Children%E2%80%99s_Games_-_Google_Art_Project.jpg"
 ],
 [
  "Крестьянская свадьба",
  "Питер Брейгель Старший",
  "1568",
  "Музей истории искусств · Вена",
  "6/6a/",
  "The_Peasant_Wedding_%28Bruegel%29FXD.jpg"
 ],
 [
  "Страна лентяев",
  "Питер Брейгель Старший",
  "1567",
  "Старая пинакотека · Мюнхен",
  "0/0a/",
  "Pieter_Bruegel_d._%C3%84._037-color.jpg"
 ],
 [
  "Танцующая пара",
  "Ян Стен",
  "1663",
  "Национальная галерея искусства · Вашингтон",
  "4/49/",
  "Jan_Steen_-_The_Dancing_Couple_-_Google_Art_Project.jpg"
 ],
 [
  "Праздник святого Николая",
  "Ян Стен",
  "ок. 1665–1668",
  "Рейксмюсеум · Амстердам",
  "c/c5/",
  "The_feast_of_St_Nicholas%2C_by_Jan_Steen.jpg"
 ],
 [
  "Как старики поют, так молодые играют",
  "Ян Стен",
  "ок. 1665",
  "Маурицхёйс · Гаага",
  "9/9f/",
  "As_the_old_sing%2C_so_twitter_the_young%2C_by_Jan_Steen.jpg"
 ],
 [
  "Рудольф II в образе Вертумна",
  "Джузеппе Арчимбольдо",
  "1591",
  "Замок Скоклостер · Швеция",
  "7/74/",
  "Giuseppe_Arcimboldo_-_Rudolf_II_of_Habsburg_as_Vertumnus_-_Google_Art_Project.jpg"
 ],
 [
  "Лето",
  "Джузеппе Арчимбольдо",
  "1563",
  "Музей истории искусств · Вена",
  "e/e7/",
  "Giuseppe_Arcimboldo_-_Summer_-_Google_Art_Project.jpg"
 ],
 [
  "Библиотекарь",
  "Джузеппе Арчимбольдо",
  "ок. 1566",
  "Замок Скоклостер · Швеция",
  "7/76/",
  "Arcimboldo_Librarian_Stokholm.jpg"
 ],
 [
  "Малле Баббе",
  "Франс Халс",
  "ок. 1633–1635",
  "Берлинская картинная галерея · Берлин",
  "b/b2/",
  "Malle_Babbe_%28Frans_Hals%29-WUS03511.jpg"
 ],
 [
  "Качели",
  "Жан-Оноре Фрагонар",
  "ок. 1767",
  "Собрание Уоллеса · Лондон",
  "1/15/",
  "Jean-Honor%C3%A9_Fragonard_-_The_Swing_-_Google_Art_Project.jpg"
 ],
 [
  "Три грации",
  "Питер Пауль Рубенс",
  "1635–1638",
  "Музей Прадо · Мадрид",
  "f/f5/",
  "The_Three_Graces%2C_by_Peter_Paul_Rubens%2C_from_Prado_in_Google_Earth.jpg"
 ],
 [
  "Габриэль д’Эстре с сестрой",
  "Школа Фонтенбло",
  "ок. 1594",
  "Лувр · Париж",
  "8/84/",
  "Fontainebleau_School_Gabrielle_d%27Estr%C3%A9es_and_one_of_her_sisters.jpg"
 ],
 [
  "Маха обнажённая",
  "Франсиско Гойя",
  "ок. 1797–1800",
  "Музей Прадо · Мадрид",
  "4/49/",
  "La_Maja_desnuda_por_Goya.jpg"
 ],
 [
  "Корабль дураков",
  "Иероним Босх",
  "ок. 1490–1500",
  "Лувр · Париж",
  "e/e3/",
  "Ship_of_Fools%2C_ca._1490-1500.jpg"
 ],
 [
  "Триумф Вакха («Пьяницы»)",
  "Диего Веласкес",
  "1628–1629",
  "Музей Прадо · Мадрид",
  "5/5d/",
  "Vel%C3%A1zquez_-_El_Triunfo_de_Baco_o_Los_Borrachos_%28Museo_del_Prado%2C_1628-29%29.jpg"
 ],
 [
  "Вакх",
  "Караваджо",
  "ок. 1596–1598",
  "Галерея Уффици · Флоренция",
  "4/4f/",
  "Bacchus-Caravaggio_%281598%29.jpg"
 ]
];
export const PLAYFUL_ADDITIONS=CURATED_PAINTINGS.map(
 ([title,artist,date,museum,path,file])=>({
  title,artist,date,style:'Классическая живопись',museum,
  commonsFile:decodeURIComponent(file).replaceAll('_',' '),
  source:'https://commons.wikimedia.org/wiki/File:'+file,
  isReal:true,path,file
 })
);
